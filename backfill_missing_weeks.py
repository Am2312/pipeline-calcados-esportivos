"""
Backfill missing Netshoes weeks by carrying forward the last available week
(constant assumption). Netshoes scrape has been blocked (Imperva) since
2026-06-29, so RAW_NETSHOES / RAW_DISC_NETSHOES stop at week 2026-06-28.

For each target array we:
  1. detect the latest week present (= last available week),
  2. copy that week's rows into each missing Sunday week up to MAX_WEEK,
     only rewriting the w:'...' token so the row format stays identical,
  3. drop any pre-existing rows for a target week first (idempotent).

Dry-run by default; pass --apply to write files (a .bak is saved first).
"""
import os, re, sys, datetime, shutil

DOCS = os.path.join(os.path.dirname(__file__), "docs")
MAX_WEEK = "2026-07-12"          # last completed Sunday (dashboard cutoff)
TARGETS = [
    # Netshoes (blocked by Akamai since 2026-06-29)
    ("calcados-price-data.js", "RAW_NETSHOES"),
    ("calcados-disc-data.js",  "RAW_DISC_NETSHOES"),
    # Centauro (scrape stopped after 2026-06-25 => last dashboard week 2026-06-28).
    # NOTE: only the arrays on the current weekly cadence. The per-brand
    # RAW_CENTAURO_OLYMPIKUS/MIZUNO/UA arrays end 2026-05-17 by design and are
    # deliberately NOT backfilled (they are a separate, unrelated series).
    ("calcados-price-data.js", "RAW_CENTAURO"),
    ("calcados-disc-data.js",  "RAW_DISC_CENTAURO"),
    ("calcados-disc-data.js",  "RAW_AVGDISC_CENTAURO"),
]
APPLY = "--apply" in sys.argv

def sundays_after(last, upto):
    d = datetime.date.fromisoformat(last)
    end = datetime.date.fromisoformat(upto)
    out = []
    d += datetime.timedelta(days=7)
    while d <= end:
        out.append(d.isoformat())
        d += datetime.timedelta(days=7)
    return out

def process(path, array):
    content = open(path, encoding="utf-8").read()
    m = re.search(rf'(const {re.escape(array)} = \[)([\s\S]*?)(\n\];)', content)
    if not m:
        print(f"  !! {array} not found in {os.path.basename(path)}")
        return content, False
    prefix, body, suffix = m.group(1), m.group(2), m.group(3)
    lines = [ln.strip().rstrip(',') for ln in body.split('\n') if ln.strip().startswith('{')]

    weeks = sorted({mm.group(1) for ln in lines if (mm := re.search(r"w:'([0-9-]+)'", ln))})
    last = weeks[-1]
    targets = sundays_after(last, MAX_WEEK)
    src = [ln for ln in lines if f"w:'{last}'" in ln]
    print(f"  {array}: {len(lines)} rows, last week = {last} ({len(src)} rows). "
          f"Missing weeks to fill: {targets or 'NONE'}")
    if not targets:
        return content, False
    if len(targets) > 3:   # safety: series not on the recent weekly cadence — skip
        print(f"     !! SKIP: {len(targets)} missing weeks (last={last}) looks off-cadence; not backfilling.")
        return content, False

    # drop any existing rows for target weeks, then add carried-forward copies
    kept = [ln for ln in lines if not any(f"w:'{t}'" in ln for t in targets)]
    added = []
    for t in targets:
        added += [ln.replace(f"w:'{last}'", f"w:'{t}'") for ln in src]
    all_rows = kept + added
    parts = [r + ',' for r in all_rows[:-1]] + [all_rows[-1]]
    new_content = content[:m.start()] + prefix + '\n' + '\n'.join(parts) + suffix + content[m.end():]
    print(f"     -> +{len(added)} rows ({len(targets)} weeks x {len(src)})")
    return new_content, True

for fname, array in TARGETS:
    path = os.path.join(DOCS, fname)
    print(f"\n{fname}")
    new_content, changed = process(path, array)
    if changed and APPLY:
        if not os.path.exists(path + ".bak"):   # keep the original pristine backup
            shutil.copy2(path, path + ".bak")
        open(path, "w", encoding="utf-8").write(new_content)
        print(f"     WROTE {fname} (backup: {fname}.bak)")

print("\nDRY-RUN (no files written). Re-run with --apply to write." if not APPLY else "\nDONE.")
