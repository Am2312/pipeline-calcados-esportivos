"""
generate_franchise_mapping_draft.py
====================================
Build a franchise mapping draft from BQ data. Properly cleans the catalog
before applying the franchise/gen heuristic.

Pipeline:
  1. Pull all grandparent_names from each source (no volume filter at SQL level).
  2. Filter out non-footwear (Bolsa, Camiseta, Boné, Calça, Bota, ...) by name prefix.
  3. Detect actual brand from the grandparent_name (Centauro has miscoded brand
     in many rows — e.g. a Mizuno product cadastered as Asics). Trust the name.
  4. Drop products whose detected brand is outside our 6 (Puma, Columbia, ...).
  5. Normalize typos (Asic → Asics, Ascis → Asics, Olimpikus → Olympikus).
  6. Apply franchise+gen heuristic to the *cleaned* name. Anything after the
     generation number is treated as variant/colorway/edition (ignored for
     franchise grouping).
  7. Aggregate by (brand, franchise) → keep franchises with ≥3 SKUs AND ≥28 days span.
  8. Emit CSV (one row per surviving grandparent_name).
"""

import os
import re
import sys
import csv
import datetime
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from update_dashboard_js import (  # noqa: E402
    OLY_TABLE, MIZ_TABLE, CTR_TABLE, CENTAURO_BRANDS,
    OLY_INCLUDE_SUBCAT, MIZ_INCLUDE_SUBCAT,
    get_bq_client, bq_rows,
)
UA_TABLE = "aster-data-platform.under_armour_trusted.product_snapshot"
UA_INCLUDE_SUBCAT = {'Calçados'}

OUT_SUMMARY = os.path.join(SCRIPT_DIR, "franchise_mapping_summary.csv")  # 1 row per franchise (review here)
OUT_DETAILS = os.path.join(SCRIPT_DIR, "franchise_mapping_details.csv")  # 1 row per grandparent_name (reference)
OUT_REPORT  = os.path.join(SCRIPT_DIR, "franchise_mapping_report.txt")

# ── Allowed brands and their canonical form ─────────────────────────────────
OUR_BRANDS = {
    'adidas':       'Adidas',
    'nike':         'Nike',
    'asics':        'Asics',
    'mizuno':       'Mizuno',
    'olympikus':    'Olympikus',
    'under armour': 'Under Armour',
    'ua':           'Under Armour',
}
# 3rd-party brands we sometimes see in Centauro's footwear group → drop
OTHER_BRANDS = [
    'puma', 'oakley', 'columbia', 'tommy', 'mormaii', 'havaianas',
    'jordan', 'new balance', 'kappa', 'fila', 'reebok', 'lacoste',
    'converse', 'vans', 'crocs', 'speedo', 'arena',
]

# ── Typo normalization ──────────────────────────────────────────────────────
TYPO_FIX = [
    (re.compile(r'\bAscis\b'),         'Asics'),
    (re.compile(r'\bASIC\b(?!S)'),     'Asics'),  # "ASIC " without S
    (re.compile(r'\bAsic\b(?!s)'),     'Asics'),
    (re.compile(r'\bOlimpikus\b'),     'Olympikus'),
    (re.compile(r'\bOlympicus\b'),     'Olympikus'),
    (re.compile(r'\bMizun\b(?!o)'),    'Mizuno'),
    (re.compile(r'\bUnderArmour\b'),   'Under Armour'),
]
def normalize_typos(name: str) -> str:
    for pat, repl in TYPO_FIX:
        name = pat.sub(repl, name)
    return name

# ── Non-footwear prefix exclusion ───────────────────────────────────────────
NON_FOOTWEAR_PATTERN = re.compile(
    r'^(Boné|Camiseta|Calça|Bota|Bolsa|Mochila|Casaco|Bermuda|Short|Shorts|'
    r'Meia|Luva|Headband|Bandana|Top|Regata|Jaqueta|Vestido|Saia|Touca|'
    r'Capa|Cinta|Mala|Estojo|Toalha|Kit|Garrafa|Squeeze|Caneca|Pulseira|'
    r'Relógio|Óculos|Boia|Maiô|Sunga|Sutiã|Macacão|Calção|Macaquinho|'
    r'Body|Polo|Moletom|Suéter|Blusa|Manga|Carteira|Necessaire)\b',
    re.IGNORECASE,
)
def is_footwear(name: str) -> bool:
    return not NON_FOOTWEAR_PATTERN.match(name.strip())

# ── Brand detection from the name itself ────────────────────────────────────
def detect_brand_from_name(name: str) -> str | None:
    """Return canonical brand (e.g. 'Asics', 'Under Armour') or None.
    Prioritizes OUR brands; if the name only mentions OTHER brands, return 'OTHER'."""
    name_lower = name.lower()
    for key, canon in OUR_BRANDS.items():
        # word-boundary match (under armour has space)
        pat = r'\b' + re.escape(key) + r'\b'
        if re.search(pat, name_lower):
            return canon
    # Check other brands (3rd-party)
    for b in OTHER_BRANDS:
        pat = r'\b' + re.escape(b) + r'\b'
        if re.search(pat, name_lower):
            return 'OTHER'
    return None  # brand not mentioned in name

# ── Name cleaning (strip product-type, gender, age, brand, technology) ──────
# Tokens stripped EVERYWHERE in the name (gender, age, brand, product-type words,
# category modifiers, variant codes). Pre-compiled patterns for speed.
STRIP_TOKENS = [
    # Product type
    r'\bTênis\b', r'\bChuteira\b', r'\bChinelo\b', r'\bSandália\b',
    r'\bPapete\b', r'\bSapatilha\b', r'\bSlide\b',
    # Gender / age
    r'\bMasculino\b', r'\bFeminino\b', r'\bUnissex\b',
    r'\bMasculina\b', r'\bFeminina\b',
    r'\bJunior\b', r'\bJúnior\b', r'\bInfantil\b',
    r'\bKids?\b', r'\bMenino\b', r'\bMenina\b',
    r'\bAdulto\b', r'\bAdulta\b', r'\bGrade school\b',
    # Category modifiers ("de Corrida", "Society", etc.)
    r'\bde\s+Corrida\b', r'\bde\s+Basquete\b', r'\bde\s+Treino\b',
    r'\bde\s+Futsal\b', r'\bde\s+Campo\b',
    r'\bSociety\b', r'\bIndoor\b', r'\bOutdoor\b', r'\bCasual\b',
    # Brand tokens
    r'\bAdidas\b', r'\badidas\b', r'\bNike\b',
    r'\bAsics\b', r'\bASICS\b',
    r'\bOlympikus\b', r'\bOLYMPIKUS\b',
    r'\bMizuno\b', r'\bMIZUNO\b',
    r'\bUnder\s+Armour\b',
    # Variant suffixes (Centauro / Aster catalog noise)
    r'\bOriginals\b',
]
STRIP_TOKENS_COMPILED = [re.compile(p, re.IGNORECASE) for p in STRIP_TOKENS]

def clean_name(name: str) -> str:
    s = name.strip()
    for pat in STRIP_TOKENS_COMPILED:
        s = pat.sub(' ', s)
    # Collapse dashes and multiple spaces
    s = re.sub(r'\s*-\s*', ' ', s)
    s = re.sub(r'\s{2,}', ' ', s).strip(' -')
    return s

# ── Franchise+gen detection (corrected) ─────────────────────────────────────
# Match: optional alpha base, mandatory number, anything after the number is ignored
GEN_PATTERN = re.compile(r'^(.+?)\s+(\d+)(?:[a-zA-Z]*)(?:\s+.*)?$')

def detect_franchise_and_gen(cleaned: str) -> tuple[str, int | None]:
    """Return (franchise_label, gen).
    Everything after the FIRST trailing number is dropped (variant/colorway/edition)."""
    if not cleaned:
        return ('(unknown)', None)
    m = GEN_PATTERN.match(cleaned)
    if m:
        head = m.group(1).strip()
        gen  = int(m.group(2))
        # Normalize year-style generations (2024 → 24, 2025 → 25, etc.)
        if 2000 <= gen <= 2099:
            gen = gen - 2000
        return (head, gen)
    return (cleaned, None)

# Title-case a label while keeping known acronyms uppercase
ACRONYMS = {'rc', 'sl', 'fg', 'in', 'tf', 'mg', 'ag', 'ic', 'ix', 'os', 'cs', 'gs', 'ps', 'ts',
            'br', 'sp', 'rj', 'poa', 'ny', 'la', 'sf', 'cb', 'se', 'ac', 'eu', 'usa', 'amg', 'mc',
            'vl', 'ub', 'nmd', 'asd', 'eqt'}
def title_case_label(label: str) -> str:
    parts = label.split(' ')
    out = []
    for p in parts:
        if not p: continue
        # Preserve numbers and version strings like "3.0", "2.5"
        if re.match(r'^\d+(\.\d+)?$', p) or re.match(r'^\d+[a-z]*$', p, re.IGNORECASE):
            out.append(p)
        elif p.lower() in ACRONYMS:
            out.append(p.upper())
        elif '-' in p:
            # "Gel-Nimbus" → keep style
            out.append('-'.join(s[:1].upper() + s[1:].lower() if s else s for s in p.split('-')))
        else:
            out.append(p[:1].upper() + p[1:].lower())
    return ' '.join(out)

def normalize_franchise_id(brand: str, label: str) -> str:
    """Lowercased id used for dedup (collapses casing variants)."""
    s = (brand + '|' + label).lower()
    s = re.sub(r'[^\w\s|-]', '', s)
    s = re.sub(r'\s+', '_', s.strip())
    return s

# ── SQL queries ─────────────────────────────────────────────────────────────
ASTER_QUERY = """
WITH base AS (
  SELECT grandparent_name, id, date
  FROM `{table}`
  WHERE child_is_available = 1
    AND subcategory_name IN ({sub_in})
    AND date >= DATE '2024-04-01'
)
SELECT grandparent_name,
       COUNT(DISTINCT id) AS n_skus,
       MIN(date) AS first_seen,
       MAX(date) AS last_seen
FROM base
GROUP BY 1
"""

CTR_QUERY = """
WITH base AS (
  SELECT grandparent_brand AS brand, grandparent_name, child_ean, date
  FROM `{table}`
  WHERE (child_is_available = TRUE OR child_is_available IS NULL)
    AND UPPER(grandparent_group) IN ('CALÇADOS', 'CALCADOS')
    AND grandparent_brand IN {brands}
    AND grandparent_category IS NOT NULL AND grandparent_category != ''
    AND NOT STARTS_WITH(grandparent_category, 'z_')
    AND child_value_list_price > 0
    AND child_value_sale_price IS NOT NULL
    AND child_value_sale_price <= 10000
    AND date >= DATE '2023-04-01'
)
SELECT brand, grandparent_name,
       COUNT(DISTINCT child_ean) AS n_skus,
       MIN(date) AS first_seen,
       MAX(date) AS last_seen
FROM base
GROUP BY 1, 2
"""

def quoted_csv(items):
    return ", ".join(f"'{x}'" for x in items)

def load_aster(client, table, sub_in, brand_label):
    sql = ASTER_QUERY.format(table=table, sub_in=quoted_csv(sub_in))
    rows = bq_rows(client, sql)
    for r in rows:
        r['brand_bq'] = brand_label
    return rows

def load_centauro(client):
    sql = CTR_QUERY.format(table=CTR_TABLE, brands=repr(CENTAURO_BRANDS))
    rows = bq_rows(client, sql)
    # Centauro stores brand as 'adidas' lowercase; normalize
    for r in rows:
        b = r.pop('brand')
        b_norm = OUR_BRANDS.get(b.lower(), b)
        r['brand_bq'] = b_norm
    return rows

# ── Main ────────────────────────────────────────────────────────────────────
def main():
    client = get_bq_client()
    all_rows = []
    print("Loading Olympikus Aster..."); all_rows += load_aster(client, OLY_TABLE, OLY_INCLUDE_SUBCAT, 'Olympikus'); print("  done")
    print("Loading Mizuno Aster...");    all_rows += load_aster(client, MIZ_TABLE, MIZ_INCLUDE_SUBCAT, 'Mizuno');    print("  done")
    print("Loading UA Aster...");        all_rows += load_aster(client, UA_TABLE,  UA_INCLUDE_SUBCAT,  'Under Armour'); print("  done")
    print("Loading Centauro...");        all_rows += load_centauro(client);                                          print("  done")

    # Counters for the cleaning pipeline
    stats = {
        'raw_rows':            len(all_rows),
        'dropped_non_footwear':0,
        'dropped_other_brand': 0,
        'dropped_brand_mismatch': 0,
        'cross_brand_fixed':   0,
        'typo_fixed':          0,
        'kept':                0,
    }
    drop_samples = defaultdict(list)

    # ── Cleaning pipeline ───────────────────────────────────────────────────
    cleaned_rows = []
    for r in all_rows:
        original = r['grandparent_name']
        brand_bq = r['brand_bq']

        # 1) Drop non-footwear
        if not is_footwear(original):
            stats['dropped_non_footwear'] += 1
            if len(drop_samples['non_footwear']) < 8:
                drop_samples['non_footwear'].append(f"  {brand_bq:<13}  {original}")
            continue

        # 2) Normalize typos
        fixed = normalize_typos(original)
        if fixed != original:
            stats['typo_fixed'] += 1

        # 3) Detect brand from the name; reconcile with brand_bq
        brand_from_name = detect_brand_from_name(fixed)
        if brand_from_name == 'OTHER':
            stats['dropped_other_brand'] += 1
            if len(drop_samples['other_brand']) < 8:
                drop_samples['other_brand'].append(f"  {brand_bq:<13}  {original}")
            continue
        # Choose effective brand: prefer brand from name if it disagrees with BQ
        if brand_from_name and brand_from_name != brand_bq:
            stats['cross_brand_fixed'] += 1
            brand_effective = brand_from_name
        elif brand_from_name is None:
            # Name doesn't mention any brand — trust the BQ brand
            brand_effective = brand_bq
        else:
            brand_effective = brand_bq

        # Only keep our 6 brands (sanity)
        if brand_effective not in OUR_BRANDS.values():
            stats['dropped_brand_mismatch'] += 1
            continue

        # 4) Clean name (strip product type / gender / age / brand)
        cleaned = clean_name(fixed)

        # 5) Detect franchise + gen, then title-case for display
        franchise_label_raw, gen = detect_franchise_and_gen(cleaned)
        franchise_label = title_case_label(franchise_label_raw)
        franchise_id = normalize_franchise_id(brand_effective, franchise_label)

        cleaned_rows.append({
            'brand_bq':       brand_bq,
            'brand':          brand_effective,
            'grandparent_name': original,
            'normalized_name': fixed if fixed != original else '',
            'cleaned':         cleaned,
            'franchise_id_auto':    franchise_id,
            'franchise_label_auto': franchise_label,
            'gen_auto':             gen if gen is not None else '',
            'n_skus_gp':       r['n_skus'],
            'first_seen_gp':   str(r['first_seen']),
            'last_seen_gp':    str(r['last_seen']),
        })

    stats['kept'] = len(cleaned_rows)

    # ── Aggregate by (brand, franchise) ─────────────────────────────────────
    fr_agg = {}
    for r in cleaned_rows:
        key = (r['brand'], r['franchise_label_auto'])
        if key not in fr_agg:
            fr_agg[key] = {'n_skus': 0, 'n_gps': 0,
                           'first_seen': r['first_seen_gp'], 'last_seen': r['last_seen_gp']}
        a = fr_agg[key]
        a['n_skus'] += r['n_skus_gp']
        a['n_gps']  += 1
        a['first_seen'] = min(a['first_seen'], r['first_seen_gp'])
        a['last_seen']  = max(a['last_seen'],  r['last_seen_gp'])

    def span_days(a, b): return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days
    passing = {k for k, a in fr_agg.items() if a['n_skus'] >= 3 and span_days(a['first_seen'], a['last_seen']) >= 28}

    n_total = len(fr_agg)
    n_pass  = len(passing)

    # ── Build final CSV rows ────────────────────────────────────────────────
    kept = []
    for r in cleaned_rows:
        key = (r['brand'], r['franchise_label_auto'])
        if key not in passing:
            continue
        a = fr_agg[key]
        kept.append({
            **r,
            'n_skus_franchise':    a['n_skus'],
            'n_gps_franchise':     a['n_gps'],
            'franchise_first_seen': a['first_seen'],
            'franchise_last_seen':  a['last_seen'],
            'KEEP_MERGE_SPLIT': '', 'new_franchise_id': '',
            'new_franchise_label': '', 'new_gen': '', 'note': '',
        })

    # Sort: brand, franchise, gen, n_skus_gp desc
    kept.sort(key=lambda x: (
        x['brand'], x['franchise_label_auto'].lower(),
        x['gen_auto'] if isinstance(x['gen_auto'], int) else 9999,
        -x['n_skus_gp'],
    ))

    # ── Emit DETAILS CSV (one row per grandparent_name, reference) ─────────
    fields_details = [
        'brand', 'brand_bq', 'franchise_id_auto', 'franchise_label_auto', 'gen_auto',
        'grandparent_name', 'normalized_name', 'cleaned',
        'n_skus_gp', 'first_seen_gp', 'last_seen_gp',
        'n_skus_franchise', 'n_gps_franchise',
        'franchise_first_seen', 'franchise_last_seen',
    ]
    with open(OUT_DETAILS, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields_details, extrasaction='ignore')
        w.writeheader()
        w.writerows(kept)

    # ── Emit SUMMARY CSV (one row per franchise — REVIEW HERE) ─────────────
    # Group kept rows by (brand, franchise_label_auto) → aggregate
    by_fr = defaultdict(lambda: {'rows': [], 'gens': set()})
    for r in kept:
        key = (r['brand'], r['franchise_label_auto'])
        by_fr[key]['rows'].append(r)
        if isinstance(r['gen_auto'], int):
            by_fr[key]['gens'].add(r['gen_auto'])

    summary_rows = []
    for (brand, label), info in by_fr.items():
        rows = info['rows']
        rows_sorted = sorted(rows, key=lambda x: -x['n_skus_gp'])
        examples = ' | '.join(x['grandparent_name'] for x in rows_sorted[:4])
        gens_sorted = sorted(info['gens'])
        gens_str = ','.join(str(g) for g in gens_sorted) if gens_sorted else ''
        agg = fr_agg[(brand, label)]
        summary_rows.append({
            'brand':                brand,
            'franchise_label_auto': label,
            'n_skus_franchise':     agg['n_skus'],
            'n_gps_franchise':      agg['n_gps'],
            'gens_detected':        gens_str,
            'first_seen':           agg['first_seen'],
            'last_seen':            agg['last_seen'],
            'example_names':        examples,
            'KEEP_MERGE_SPLIT':     '',
            'new_franchise_label':  '',
            'merge_with_franchise': '',  # if MERGE: which target franchise to merge into
            'note':                 '',
        })

    summary_rows.sort(key=lambda x: (x['brand'], -x['n_skus_franchise']))
    fields_summary = [
        'brand', 'franchise_label_auto',
        'n_skus_franchise', 'n_gps_franchise', 'gens_detected',
        'first_seen', 'last_seen', 'example_names',
        'KEEP_MERGE_SPLIT', 'new_franchise_label', 'merge_with_franchise', 'note',
    ]
    with open(OUT_SUMMARY, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields_summary)
        w.writeheader()
        w.writerows(summary_rows)

    # Coverage distribution
    n_skus_per_brand = defaultdict(int)
    for r in summary_rows: n_skus_per_brand[r['brand']] += r['n_skus_franchise']
    coverage_lines = []
    for b in sorted(n_skus_per_brand):
        rows_b = [r for r in summary_rows if r['brand'] == b]
        total = n_skus_per_brand[b]
        cum = 0
        n50 = n25 = nALL = 0
        for r in rows_b:
            cum += r['n_skus_franchise']
            if r['n_skus_franchise'] >= 50: n50 += 1
            if r['n_skus_franchise'] >= 25: n25 += 1
            nALL += 1
        # Compute % covered by top-50 franchises
        top50_total = sum(r['n_skus_franchise'] for r in rows_b[:50])
        top100_total = sum(r['n_skus_franchise'] for r in rows_b[:100])
        coverage_lines.append(
            f"  {b:<14}  {nALL:>4} total | {n25:>3} w/≥25 SKUs | {n50:>3} w/≥50 SKUs | "
            f"top50 covers {top50_total/total*100:>4.0f}% | top100 covers {top100_total/total*100:>4.0f}%"
        )

    # Per-brand summary
    gps_by_brand = defaultdict(int)
    franchises_by_brand = defaultdict(int)
    for r in kept: gps_by_brand[r['brand']] += 1
    for (b, _) in passing: franchises_by_brand[b] += 1

    # ── Report ──────────────────────────────────────────────────────────────
    lines = []
    lines.append("=" * 60)
    lines.append("FRANCHISE MAPPING DRAFT — Cleaning report")
    lines.append("=" * 60)
    lines.append("")
    lines.append("Pipeline stats:")
    lines.append(f"  Raw rows pulled:           {stats['raw_rows']:>6}")
    lines.append(f"  Dropped non-footwear:      {stats['dropped_non_footwear']:>6}")
    lines.append(f"  Dropped 3rd-party brand:   {stats['dropped_other_brand']:>6}")
    lines.append(f"  Brand mismatch dropped:    {stats['dropped_brand_mismatch']:>6}")
    lines.append(f"  Cross-brand fixed (BQ->nm): {stats['cross_brand_fixed']:>6}")
    lines.append(f"  Typo fixed:                {stats['typo_fixed']:>6}")
    lines.append(f"  Kept after cleaning:       {stats['kept']:>6}")
    lines.append("")
    lines.append(f"Franchise filter (≥3 SKUs AND ≥28 days):")
    lines.append(f"  Auto-detected franchises:  {n_total}")
    lines.append(f"  Passing filter:            {n_pass}")
    lines.append(f"  Dropped (low volume):      {n_total - n_pass}")
    lines.append(f"  Final CSV rows:            {len(kept)}")
    lines.append("")
    lines.append("Per-brand (after cleaning + filter):")
    for b in sorted(franchises_by_brand):
        lines.append(f"  {b:<14}  {franchises_by_brand[b]:>4} franchises   {gps_by_brand[b]:>4} grandparent_names")
    lines.append("")
    lines.append("Coverage by top-N franchises per brand (volume-weighted):")
    lines += coverage_lines
    lines.append("")
    if drop_samples['non_footwear']:
        lines.append("Sample of NON-FOOTWEAR dropped:")
        lines += drop_samples['non_footwear'][:8]
        lines.append("")
    if drop_samples['other_brand']:
        lines.append("Sample of 3RD-PARTY brand dropped:")
        lines += drop_samples['other_brand'][:8]
        lines.append("")
    report = "\n".join(lines)
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    print()
    print(report)

if __name__ == '__main__':
    main()
