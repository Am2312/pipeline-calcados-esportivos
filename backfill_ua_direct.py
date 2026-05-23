"""
backfill_ua_direct.py
=====================
One-shot backfill of UA Website data in RAW_DIRECT / RAW_DISC_DIRECT /
RAW_AVGDISC_DIRECT using the Aster trusted table (`under_armour_trusted`)
instead of the Direct scraper (which only started 2026-05-15).

Reason: scraper-based UA had ~1-2 weeks of history while Olympikus/Mizuno/
Centauro UA had ~2 years. This makes UA Website comparable with the other
brand-channels in all 4 dashboard cards.

Filters and cat mapping mirror update_dashboard_js.py exactly:
  - subcategory_name = 'Calçados' (footwear only)
  - child_is_available = 1
  - prices > 0
  - cat mapped via DIRECT_CAT_MAP for ('ua', sport) -> canonical cat
  - dedup at parent_id (colorway) level — UA Aster has 1 EAN per colorway
    so n_skus is identical at either grain.

Replaces ALL existing UA rows in the 3 target arrays.

Run once with `python backfill_ua_direct.py`. Going forward, the weekly
pipeline picks UA from Aster automatically (see update_dashboard_js.py).
"""
import os
import re
import sys
import datetime
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(SCRIPT_DIR, "docs")
PRICE_JS   = os.path.join(DOCS_DIR, "calcados-price-data.js")
DISC_JS    = os.path.join(DOCS_DIR, "calcados-disc-data.js")

sys.path.insert(0, SCRIPT_DIR)
from update_dashboard_js import (  # noqa: E402
    get_bq_client, bq_rows,
    DIRECT_CAT_MAP, map_direct_cat,
    price_row, disc_row_brand, avgdisc_row_brand,
)

UA_TABLE = "aster-data-platform.under_armour_trusted.product_snapshot"
SINCE = "2024-04-01"  # Aster UA has data starting Apr-2024 (verified via BQ probe)


# ── Multi-week queries (one BQ trip each) ────────────────────────────────────

PRICE_SQL = f"""
WITH dp AS (
  SELECT
    DATE_ADD(DATE_TRUNC(date, WEEK(MONDAY)), INTERVAL 6 DAY) AS sunday,
    COALESCE(subcategory_2_name, subcategory_name, '') AS sport,
    parent_id,
    AVG(child_sale_price) AS sale_p,
    AVG(child_list_price) AS list_p
  FROM `{UA_TABLE}`
  WHERE date >= DATE '{SINCE}'
    AND child_is_available = 1
    AND subcategory_name = 'Calçados'
    AND child_sale_price IS NOT NULL AND child_sale_price > 0
    AND child_list_price IS NOT NULL AND child_list_price > 0
  GROUP BY 1, 2, 3
)
SELECT sunday, sport,
  ROUND(AVG(sale_p), 2) AS p_sale,
  ROUND(AVG(list_p), 2) AS p_list,
  COUNT(DISTINCT parent_id) AS n
FROM dp
GROUP BY 1, 2
ORDER BY 1, 2
"""

DISC_SQL = f"""
WITH agg AS (
  SELECT
    DATE_ADD(DATE_TRUNC(date, WEEK(MONDAY)), INTERVAL 6 DAY) AS sunday,
    COALESCE(subcategory_2_name, subcategory_name, '') AS sport,
    parent_id,
    MAX(SAFE_DIVIDE(child_list_price - child_sale_price, child_list_price)) AS max_disc
  FROM `{UA_TABLE}`
  WHERE date >= DATE '{SINCE}'
    AND child_is_available = 1
    AND subcategory_name = 'Calçados'
    AND child_sale_price IS NOT NULL AND child_sale_price > 0
    AND child_list_price IS NOT NULL AND child_list_price > 0
  GROUP BY 1, 2, 3
)
SELECT sunday, sport,
  COUNTIF(max_disc > 0) AS n_disc,
  COUNT(*) AS n_total
FROM agg
GROUP BY 1, 2
ORDER BY 1, 2
"""

AVGDISC_SQL = f"""
WITH agg AS (
  SELECT
    DATE_ADD(DATE_TRUNC(date, WEEK(MONDAY)), INTERVAL 6 DAY) AS sunday,
    COALESCE(subcategory_2_name, subcategory_name, '') AS sport,
    parent_id,
    MAX(SAFE_DIVIDE(child_list_price - child_sale_price, child_list_price)) AS max_disc
  FROM `{UA_TABLE}`
  WHERE date >= DATE '{SINCE}'
    AND child_is_available = 1
    AND subcategory_name = 'Calçados'
    AND child_sale_price IS NOT NULL AND child_sale_price > 0
    AND child_list_price IS NOT NULL AND child_list_price > 0
  GROUP BY 1, 2, 3
)
SELECT sunday, sport, max_disc
FROM agg
"""


# ── Aggregate query output → per-week mapped rows ────────────────────────────

def fmt_date(d):
    """Convert datetime.date or string to YYYY-MM-DD string."""
    if isinstance(d, str):
        return d
    return d.isoformat()

def aggregate_price(rows):
    """Group BQ rows by (week, mapped_cat), produce price rows."""
    agg = defaultdict(lambda: {'sale_w': 0.0, 'list_w': 0.0, 'n': 0})
    for r in rows:
        w = fmt_date(r['sunday'])
        cat = map_direct_cat('ua', r['sport'] or '')
        n = r['n'] or 0
        agg[(w, cat)]['sale_w'] += (r['p_sale'] or 0) * n
        agg[(w, cat)]['list_w'] += (r['p_list'] or 0) * n
        agg[(w, cat)]['n'] += n
    out = []
    for (w, cat), v in sorted(agg.items()):
        if v['n'] == 0:
            continue
        out.append({
            'w': w, 'brand': 'ua', 'cat': cat,
            'p_sale': round(v['sale_w'] / v['n'], 2),
            'p_list': round(v['list_w'] / v['n'], 2),
            'n': v['n'],
        })
    return out

def aggregate_disc(rows):
    """Group BQ rows by (week, mapped_cat), produce disc rows (% discounted)."""
    agg = defaultdict(lambda: {'disc': 0, 'total': 0})
    for r in rows:
        w = fmt_date(r['sunday'])
        cat = map_direct_cat('ua', r['sport'] or '')
        agg[(w, cat)]['disc'] += r['n_disc'] or 0
        agg[(w, cat)]['total'] += r['n_total'] or 0
    out = []
    for (w, cat), v in sorted(agg.items()):
        if v['total'] == 0:
            continue
        out.append({
            'w': w, 'brand': 'ua', 'cat': cat,
            'pct': round(v['disc'] / v['total'], 4),
            'n': v['total'],
        })
    return out

def aggregate_avgdisc(rows):
    """Group raw (parent-level) rows by (week, mapped_cat),
    compute avg_disc_promo (only discounted) and avg_disc_all (incl. zeros)."""
    # accumulator: sum_promo / n_promo / sum_all / n_all
    agg = defaultdict(lambda: {'sp_w': 0.0, 'nd': 0, 'sa_w': 0.0, 'n': 0})
    for r in rows:
        w = fmt_date(r['sunday'])
        cat = map_direct_cat('ua', r['sport'] or '')
        d = r['max_disc']
        if d is None:
            d = 0
        if d > 0:
            agg[(w, cat)]['sp_w'] += d
            agg[(w, cat)]['nd'] += 1
        agg[(w, cat)]['sa_w'] += d
        agg[(w, cat)]['n']    += 1
    out = []
    for (w, cat), v in sorted(agg.items()):
        if v['n'] == 0:
            continue
        out.append({
            'w': w, 'brand': 'ua', 'cat': cat,
            'avg_disc_promo': round(v['sp_w'] / v['nd'], 4) if v['nd'] > 0 else None,
            'avg_disc_all':   round(v['sa_w'] / v['n'], 4),
            'n_disc': v['nd'],
            'n': v['n'],
        })
    return out


# ── Replace UA rows in JS array ──────────────────────────────────────────────

def replace_ua_rows(content: str, array_name: str, new_rows: list, formatter) -> str:
    """
    In the named JS array:
      1. Drop all existing rows with brand:'ua'
      2. Append new UA rows (formatted)
    """
    pattern = rf'(const {re.escape(array_name)} = \[)([\s\S]*?)(\n\];)'
    m = re.search(pattern, content)
    if not m:
        raise ValueError(f"Array '{array_name}' not found in JS")
    prefix, body, suffix = m.group(1), m.group(2), m.group(3)

    kept = []
    for line in body.split('\n'):
        s = line.strip()
        if s.startswith('{') and "brand:'ua'" not in s:
            kept.append(s.rstrip(','))

    new_lines = [formatter(r) for r in new_rows]
    all_lines = kept + new_lines
    if not all_lines:
        new_body = ''
    else:
        parts = [r + ',' for r in all_lines[:-1]] + [all_lines[-1]]
        new_body = '\n' + '\n'.join(parts)
    new_array = prefix + new_body + suffix
    return content[:m.start()] + new_array + content[m.end():]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("="*60)
    print("UA Direct backfill — pulling from under_armour_trusted (Aster)")
    print("="*60)
    client = get_bq_client()

    print(f"\n[1/3] Querying UA price ({SINCE} → today)...")
    price_rows = bq_rows(client, PRICE_SQL)
    price_data = aggregate_price(price_rows)
    print(f"  {len(price_data)} (week × cat) rows")

    print(f"\n[2/3] Querying UA % discounted...")
    disc_rows = bq_rows(client, DISC_SQL)
    disc_data = aggregate_disc(disc_rows)
    print(f"  {len(disc_data)} (week × cat) rows")

    print(f"\n[3/3] Querying UA avg discount...")
    avgdisc_rows = bq_rows(client, AVGDISC_SQL)
    avgdisc_data = aggregate_avgdisc(avgdisc_rows)
    print(f"  {len(avgdisc_data)} (week × cat) rows")

    # ── Write RAW_DIRECT (price) ─────────────────────────────────────────────
    print(f"\nUpdating {PRICE_JS} — RAW_DIRECT...")
    with open(PRICE_JS, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    content = replace_ua_rows(
        content, 'RAW_DIRECT', price_data,
        lambda r: price_row(r['w'], r['brand'], r['cat'], r['p_sale'], r['p_list'], r['n'])
    )
    with open(PRICE_JS, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✅ {len(price_data)} UA rows written")

    # ── Write RAW_DISC_DIRECT ────────────────────────────────────────────────
    print(f"\nUpdating {DISC_JS} — RAW_DISC_DIRECT + RAW_AVGDISC_DIRECT...")
    with open(DISC_JS, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    content = replace_ua_rows(
        content, 'RAW_DISC_DIRECT', disc_data,
        lambda r: disc_row_brand(r['w'], r['brand'], r['cat'], r['pct'], r['n'])
    )
    content = replace_ua_rows(
        content, 'RAW_AVGDISC_DIRECT', avgdisc_data,
        lambda r: avgdisc_row_brand(
            r['w'], r['brand'], r['cat'],
            r['avg_disc_promo'], r['avg_disc_all'],
            r['n_disc'], r['n']
        )
    )
    with open(DISC_JS, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✅ {len(disc_data)} disc rows, {len(avgdisc_data)} avgdisc rows written")

    print("\n" + "="*60)
    print("✅ Backfill complete. UA Website now has full history in all 3 cards.")
    print("="*60)


if __name__ == '__main__':
    main()
