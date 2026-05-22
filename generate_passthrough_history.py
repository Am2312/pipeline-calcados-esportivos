"""
generate_passthrough_history.py
================================
One-shot backfill of price pass-through data for the Sports Retail Dashboard.

Methodology (matches Aster pre-computed price_variation_snapshot exactly):
  For each (sku_id, date t):
    var_1w  = (price_t - AVG(prices in prev ISO week))         / AVG(...)
    var_1m  = (price_t - AVG(prices in prev calendar month))   / AVG(...)
    var_3m  = (price_t - AVG(prices in month 3 months back))   / AVG(...)
    var_1y  = (price_t - AVG(prices in same month prev year))  / AVG(...)
    var_ytd = (price_t - AVG(prices in December prev year))    / AVG(...)

  Then cross-SKU simple AVG per (date, cat), then per (sunday-week, cat).
  Snapshot dynamic cohort: SKU only contributes when it has data in both t and ref window.
  Same-SKU comparison enforced via SKU id JOIN.

Granularity:
  Olympikus/Mizuno Aster: `id` = grandparent|parent|seller (model+color+size+seller)
  Centauro: `child_ean` (color+size); seller picked by ROW_NUMBER (Centauro-direct preferred)
  Direct/Netshoes: colorway only (scraper does not capture size)

Output: docs/calcados-passthrough-data.js
"""

import os
import sys
import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(SCRIPT_DIR, "docs")
OUT_JS     = os.path.join(DOCS_DIR, "calcados-passthrough-data.js")

BQ_PROJECT = "aster-data-platform"
UA_TABLE   = f"{BQ_PROJECT}.under_armour_trusted.product_snapshot"
UA_INCLUDE_SUBCAT = {'Calçados'}

# Reuse mappings from update_dashboard_js
sys.path.insert(0, SCRIPT_DIR)
from update_dashboard_js import (  # noqa: E402
    OLY_TABLE, MIZ_TABLE, CTR_TABLE, DIRECT_TABLE, NS_TABLE,
    CENTAURO_BRANDS, DIRECT_BRAND_KEY, NS_BRAND_KEY,
    map_direct_cat, map_ns_cat, norm_ns_brand,
    OLY_INCLUDE_SUBCAT, MIZ_INCLUDE_SUBCAT, oly_cat,
    get_bq_client, bq_rows,
)

# ── SQL builders ───────────────────────────────────────────────────────────────

ASTER_BACKFILL_SQL = """
WITH base AS (
  SELECT date, id,
         COALESCE(subcategory_2_name, subcategory_name, '') AS cat,
         child_sale_price AS sale, child_list_price AS list
  FROM `{table}`
  WHERE child_is_available = 1
    AND subcategory_name IN ({sub_in})
    AND date >= DATE '2023-12-01'
),
iso_week_avg AS (
  SELECT id, DATE_TRUNC(date, ISOWEEK) AS wk_anchor,
         AVG(sale) AS sale_avg_wk, AVG(list) AS list_avg_wk
  FROM base GROUP BY 1,2
),
month_avg AS (
  SELECT id, DATE_TRUNC(date, MONTH) AS mo_anchor,
         AVG(sale) AS sale_avg_mo, AVG(list) AS list_avg_mo
  FROM base GROUP BY 1,2
),
per_day_sku AS (
  SELECT b.date, b.id, b.cat, b.sale, b.list,
         SAFE_DIVIDE(b.sale - wk_p.sale_avg_wk, wk_p.sale_avg_wk) AS vs1w,
         SAFE_DIVIDE(b.list - wk_p.list_avg_wk, wk_p.list_avg_wk) AS vl1w,
         SAFE_DIVIDE(b.sale - mo1.sale_avg_mo, mo1.sale_avg_mo)   AS vs1m,
         SAFE_DIVIDE(b.list - mo1.list_avg_mo, mo1.list_avg_mo)   AS vl1m,
         SAFE_DIVIDE(b.sale - mo3.sale_avg_mo, mo3.sale_avg_mo)   AS vs3m,
         SAFE_DIVIDE(b.list - mo3.list_avg_mo, mo3.list_avg_mo)   AS vl3m,
         SAFE_DIVIDE(b.sale - moy.sale_avg_mo, moy.sale_avg_mo)   AS vs1y,
         SAFE_DIVIDE(b.list - moy.list_avg_mo, moy.list_avg_mo)   AS vl1y,
         SAFE_DIVIDE(b.sale - mod_.sale_avg_mo, mod_.sale_avg_mo) AS vsytd,
         SAFE_DIVIDE(b.list - mod_.list_avg_mo, mod_.list_avg_mo) AS vlytd
  FROM base b
  LEFT JOIN iso_week_avg wk_p ON wk_p.id = b.id
       AND wk_p.wk_anchor = DATE_SUB(DATE_TRUNC(b.date, ISOWEEK), INTERVAL 7 DAY)
  LEFT JOIN month_avg mo1 ON mo1.id = b.id
       AND mo1.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 1 MONTH)
  LEFT JOIN month_avg mo3 ON mo3.id = b.id
       AND mo3.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 3 MONTH)
  LEFT JOIN month_avg moy ON moy.id = b.id
       AND moy.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 1 YEAR)
  LEFT JOIN month_avg mod_ ON mod_.id = b.id
       AND mod_.mo_anchor = DATE(EXTRACT(YEAR FROM b.date) - 1, 12, 1)
  WHERE b.date >= DATE '2024-04-15'
),
-- Clipped version: drop SKU-level variations outside [-50%, +100%] before cross-SKU mean.
-- (Each variation independently nulled — preserves the others on the same SKU.)
per_day_sku_clip AS (
  SELECT date, id, cat,
         IF(vs1w BETWEEN -0.5 AND 1.0, vs1w, NULL) AS vs1w_c,
         IF(vl1w BETWEEN -0.5 AND 1.0, vl1w, NULL) AS vl1w_c,
         IF(vs1m BETWEEN -0.5 AND 1.0, vs1m, NULL) AS vs1m_c,
         IF(vl1m BETWEEN -0.5 AND 1.0, vl1m, NULL) AS vl1m_c,
         IF(vs3m BETWEEN -0.5 AND 1.0, vs3m, NULL) AS vs3m_c,
         IF(vl3m BETWEEN -0.5 AND 1.0, vl3m, NULL) AS vl3m_c,
         IF(vs1y BETWEEN -0.5 AND 1.0, vs1y, NULL) AS vs1y_c,
         IF(vl1y BETWEEN -0.5 AND 1.0, vl1y, NULL) AS vl1y_c,
         IF(vsytd BETWEEN -0.5 AND 1.0, vsytd, NULL) AS vsytd_c,
         IF(vlytd BETWEEN -0.5 AND 1.0, vlytd, NULL) AS vlytd_c
  FROM per_day_sku
),
daily_cross AS (
  SELECT p.date, p.cat,
         AVG(p.sale) AS p_sale, AVG(p.list) AS p_list,
         AVG(p.vs1w) AS d_vs1w, AVG(p.vl1w) AS d_vl1w,
         AVG(p.vs1m) AS d_vs1m, AVG(p.vl1m) AS d_vl1m,
         AVG(p.vs3m) AS d_vs3m, AVG(p.vl3m) AS d_vl3m,
         AVG(p.vs1y) AS d_vs1y, AVG(p.vl1y) AS d_vl1y,
         AVG(p.vsytd) AS d_vsytd, AVG(p.vlytd) AS d_vlytd,
         AVG(c.vs1w_c) AS d_vs1w_c, AVG(c.vl1w_c) AS d_vl1w_c,
         AVG(c.vs1m_c) AS d_vs1m_c, AVG(c.vl1m_c) AS d_vl1m_c,
         AVG(c.vs3m_c) AS d_vs3m_c, AVG(c.vl3m_c) AS d_vl3m_c,
         AVG(c.vs1y_c) AS d_vs1y_c, AVG(c.vl1y_c) AS d_vl1y_c,
         AVG(c.vsytd_c) AS d_vsytd_c, AVG(c.vlytd_c) AS d_vlytd_c,
         COUNT(DISTINCT p.id) AS n_skus
  FROM per_day_sku p JOIN per_day_sku_clip c USING (date, id, cat)
  GROUP BY p.date, p.cat
)
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(date, WEEK(SUNDAY))) AS w, cat,
       ROUND(AVG(p_sale), 2) AS p_sale, ROUND(AVG(p_list), 2) AS p_list,
       ROUND(AVG(d_vs1w), 6)    AS var_sale_1w,    ROUND(AVG(d_vl1w), 6)    AS var_list_1w,
       ROUND(AVG(d_vs1m), 6)    AS var_sale_1m,    ROUND(AVG(d_vl1m), 6)    AS var_list_1m,
       ROUND(AVG(d_vs3m), 6)    AS var_sale_3m,    ROUND(AVG(d_vl3m), 6)    AS var_list_3m,
       ROUND(AVG(d_vs1y), 6)    AS var_sale_1y,    ROUND(AVG(d_vl1y), 6)    AS var_list_1y,
       ROUND(AVG(d_vsytd), 6)   AS var_sale_ytd,   ROUND(AVG(d_vlytd), 6)   AS var_list_ytd,
       ROUND(AVG(d_vs1w_c), 6)  AS var_sale_1w_c,  ROUND(AVG(d_vl1w_c), 6)  AS var_list_1w_c,
       ROUND(AVG(d_vs1m_c), 6)  AS var_sale_1m_c,  ROUND(AVG(d_vl1m_c), 6)  AS var_list_1m_c,
       ROUND(AVG(d_vs3m_c), 6)  AS var_sale_3m_c,  ROUND(AVG(d_vl3m_c), 6)  AS var_list_3m_c,
       ROUND(AVG(d_vs1y_c), 6)  AS var_sale_1y_c,  ROUND(AVG(d_vl1y_c), 6)  AS var_list_1y_c,
       ROUND(AVG(d_vsytd_c), 6) AS var_sale_ytd_c, ROUND(AVG(d_vlytd_c), 6) AS var_list_ytd_c,
       CAST(ROUND(AVG(n_skus)) AS INT64) AS n
FROM daily_cross
GROUP BY w, cat
HAVING DATE(w) < DATE_TRUNC(CURRENT_DATE(), WEEK(SUNDAY))
   AND DATE(w) >= DATE '2024-04-14'
ORDER BY w, cat
"""

CENTAURO_BACKFILL_SQL = f"""
WITH base AS (
  SELECT date,
         grandparent_brand AS brand,
         grandparent_category AS cat,
         child_ean AS ean,
         child_value_sale_price AS sale,
         child_value_list_price AS list,
         ROW_NUMBER() OVER (
           PARTITION BY date, child_ean
           ORDER BY CASE WHEN child_seller_name = 'Centauro' THEN 0 ELSE 1 END,
                    child_value_sale_price ASC
         ) AS rn
  FROM `{CTR_TABLE}`
  WHERE date >= DATE '2022-12-01'
    AND (child_is_available = TRUE OR child_is_available IS NULL)
    AND UPPER(grandparent_group) IN ('CALÇADOS', 'CALCADOS')
    AND grandparent_brand IN {repr(CENTAURO_BRANDS)}
    AND grandparent_category IS NOT NULL
    AND grandparent_category != ''
    AND NOT STARTS_WITH(grandparent_category, 'z_')
    AND child_value_list_price > 0
    AND child_value_sale_price IS NOT NULL
    AND child_value_sale_price <= 10000
),
deduped AS (
  SELECT date, brand, cat, ean, sale, list FROM base WHERE rn = 1
),
iso_week_avg AS (
  SELECT brand, ean, DATE_TRUNC(date, ISOWEEK) AS wk_anchor,
         AVG(sale) AS sale_avg_wk, AVG(list) AS list_avg_wk
  FROM deduped GROUP BY 1,2,3
),
month_avg AS (
  SELECT brand, ean, DATE_TRUNC(date, MONTH) AS mo_anchor,
         AVG(sale) AS sale_avg_mo, AVG(list) AS list_avg_mo
  FROM deduped GROUP BY 1,2,3
),
per_day_sku AS (
  SELECT b.date, b.brand, b.cat, b.ean, b.sale, b.list,
         SAFE_DIVIDE(b.sale - wk_p.sale_avg_wk, wk_p.sale_avg_wk) AS vs1w,
         SAFE_DIVIDE(b.list - wk_p.list_avg_wk, wk_p.list_avg_wk) AS vl1w,
         SAFE_DIVIDE(b.sale - mo1.sale_avg_mo, mo1.sale_avg_mo)   AS vs1m,
         SAFE_DIVIDE(b.list - mo1.list_avg_mo, mo1.list_avg_mo)   AS vl1m,
         SAFE_DIVIDE(b.sale - mo3.sale_avg_mo, mo3.sale_avg_mo)   AS vs3m,
         SAFE_DIVIDE(b.list - mo3.list_avg_mo, mo3.list_avg_mo)   AS vl3m,
         SAFE_DIVIDE(b.sale - moy.sale_avg_mo, moy.sale_avg_mo)   AS vs1y,
         SAFE_DIVIDE(b.list - moy.list_avg_mo, moy.list_avg_mo)   AS vl1y,
         SAFE_DIVIDE(b.sale - mod_.sale_avg_mo, mod_.sale_avg_mo) AS vsytd,
         SAFE_DIVIDE(b.list - mod_.list_avg_mo, mod_.list_avg_mo) AS vlytd
  FROM deduped b
  LEFT JOIN iso_week_avg wk_p ON wk_p.brand = b.brand AND wk_p.ean = b.ean
       AND wk_p.wk_anchor = DATE_SUB(DATE_TRUNC(b.date, ISOWEEK), INTERVAL 7 DAY)
  LEFT JOIN month_avg mo1 ON mo1.brand = b.brand AND mo1.ean = b.ean
       AND mo1.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 1 MONTH)
  LEFT JOIN month_avg mo3 ON mo3.brand = b.brand AND mo3.ean = b.ean
       AND mo3.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 3 MONTH)
  LEFT JOIN month_avg moy ON moy.brand = b.brand AND moy.ean = b.ean
       AND moy.mo_anchor = DATE_SUB(DATE_TRUNC(b.date, MONTH), INTERVAL 1 YEAR)
  LEFT JOIN month_avg mod_ ON mod_.brand = b.brand AND mod_.ean = b.ean
       AND mod_.mo_anchor = DATE(EXTRACT(YEAR FROM b.date) - 1, 12, 1)
  WHERE b.date >= DATE '2023-04-01'
),
per_day_sku_clip AS (
  SELECT date, brand, ean, cat,
         IF(vs1w BETWEEN -0.5 AND 1.0, vs1w, NULL) AS vs1w_c,
         IF(vl1w BETWEEN -0.5 AND 1.0, vl1w, NULL) AS vl1w_c,
         IF(vs1m BETWEEN -0.5 AND 1.0, vs1m, NULL) AS vs1m_c,
         IF(vl1m BETWEEN -0.5 AND 1.0, vl1m, NULL) AS vl1m_c,
         IF(vs3m BETWEEN -0.5 AND 1.0, vs3m, NULL) AS vs3m_c,
         IF(vl3m BETWEEN -0.5 AND 1.0, vl3m, NULL) AS vl3m_c,
         IF(vs1y BETWEEN -0.5 AND 1.0, vs1y, NULL) AS vs1y_c,
         IF(vl1y BETWEEN -0.5 AND 1.0, vl1y, NULL) AS vl1y_c,
         IF(vsytd BETWEEN -0.5 AND 1.0, vsytd, NULL) AS vsytd_c,
         IF(vlytd BETWEEN -0.5 AND 1.0, vlytd, NULL) AS vlytd_c
  FROM per_day_sku
),
daily_cross AS (
  SELECT p.date, p.brand, p.cat,
         AVG(p.sale) AS p_sale, AVG(p.list) AS p_list,
         AVG(p.vs1w) AS d_vs1w, AVG(p.vl1w) AS d_vl1w,
         AVG(p.vs1m) AS d_vs1m, AVG(p.vl1m) AS d_vl1m,
         AVG(p.vs3m) AS d_vs3m, AVG(p.vl3m) AS d_vl3m,
         AVG(p.vs1y) AS d_vs1y, AVG(p.vl1y) AS d_vl1y,
         AVG(p.vsytd) AS d_vsytd, AVG(p.vlytd) AS d_vlytd,
         AVG(c.vs1w_c) AS d_vs1w_c, AVG(c.vl1w_c) AS d_vl1w_c,
         AVG(c.vs1m_c) AS d_vs1m_c, AVG(c.vl1m_c) AS d_vl1m_c,
         AVG(c.vs3m_c) AS d_vs3m_c, AVG(c.vl3m_c) AS d_vl3m_c,
         AVG(c.vs1y_c) AS d_vs1y_c, AVG(c.vl1y_c) AS d_vl1y_c,
         AVG(c.vsytd_c) AS d_vsytd_c, AVG(c.vlytd_c) AS d_vlytd_c,
         COUNT(DISTINCT p.ean) AS n_skus
  FROM per_day_sku p JOIN per_day_sku_clip c USING (date, brand, ean, cat)
  GROUP BY 1,2,3
)
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(date, WEEK(SUNDAY))) AS w,
       brand, cat,
       ROUND(AVG(p_sale), 2) AS p_sale, ROUND(AVG(p_list), 2) AS p_list,
       ROUND(AVG(d_vs1w), 6)    AS var_sale_1w,    ROUND(AVG(d_vl1w), 6)    AS var_list_1w,
       ROUND(AVG(d_vs1m), 6)    AS var_sale_1m,    ROUND(AVG(d_vl1m), 6)    AS var_list_1m,
       ROUND(AVG(d_vs3m), 6)    AS var_sale_3m,    ROUND(AVG(d_vl3m), 6)    AS var_list_3m,
       ROUND(AVG(d_vs1y), 6)    AS var_sale_1y,    ROUND(AVG(d_vl1y), 6)    AS var_list_1y,
       ROUND(AVG(d_vsytd), 6)   AS var_sale_ytd,   ROUND(AVG(d_vlytd), 6)   AS var_list_ytd,
       ROUND(AVG(d_vs1w_c), 6)  AS var_sale_1w_c,  ROUND(AVG(d_vl1w_c), 6)  AS var_list_1w_c,
       ROUND(AVG(d_vs1m_c), 6)  AS var_sale_1m_c,  ROUND(AVG(d_vl1m_c), 6)  AS var_list_1m_c,
       ROUND(AVG(d_vs3m_c), 6)  AS var_sale_3m_c,  ROUND(AVG(d_vl3m_c), 6)  AS var_list_3m_c,
       ROUND(AVG(d_vs1y_c), 6)  AS var_sale_1y_c,  ROUND(AVG(d_vl1y_c), 6)  AS var_list_1y_c,
       ROUND(AVG(d_vsytd_c), 6) AS var_sale_ytd_c, ROUND(AVG(d_vlytd_c), 6) AS var_list_ytd_c,
       CAST(ROUND(AVG(n_skus)) AS INT64) AS n
FROM daily_cross
GROUP BY w, brand, cat
HAVING DATE(w) < DATE_TRUNC(CURRENT_DATE(), WEEK(SUNDAY))
   AND DATE(w) >= DATE '2023-04-02'
ORDER BY w, brand, cat
"""

# ── Row formatters ─────────────────────────────────────────────────────────────

def _flt(v):
    if v is None:
        return 'null'
    if isinstance(v, float):
        if v == 0.0:
            return '0'
        s = f"{v:.6g}"
        if s.startswith('0.000'):
            return f"{v:.6e}"
        return s
    return str(v)

def fmt_passthrough_row(r, with_brand=False):
    """Format a JS row from a dict."""
    var_keys = []
    for win in ('1w', '1m', '3m', '1y', 'ytd'):
        for typ in ('sale', 'list'):
            var_keys.append(f'var_{typ}_{win}')
            var_keys.append(f'var_{typ}_{win}_c')
    keys = ['w', ('brand' if with_brand else None), 'cat',
            'p_sale', 'p_list',
            *var_keys,
            'n']
    parts = []
    for k in keys:
        if k is None:
            continue
        if k in ('w', 'brand', 'cat'):
            parts.append(f"{k}:'{r[k]}'")
        elif k == 'n':
            parts.append(f"n:{int(r[k]) if r[k] is not None else 0}")
        elif k in ('p_sale', 'p_list'):
            v = r[k]
            parts.append(f"{k}:{v if v is not None else 'null'}")
        else:
            parts.append(f"{k}:{_flt(r[k])}")
    return "{" + ",".join(parts) + "}"

# ── Main ───────────────────────────────────────────────────────────────────────

def quoted_csv(items):
    return ", ".join(f"'{x}'" for x in items)

def run_oly(client):
    print("Querying Olympikus (Aster, full history)…")
    sql = ASTER_BACKFILL_SQL.format(table=OLY_TABLE, sub_in=quoted_csv(OLY_INCLUDE_SUBCAT))
    rows = bq_rows(client, sql)
    print(f"  -> {len(rows)} rows")
    return rows

def run_miz(client):
    print("Querying Mizuno (Aster, full history)…")
    sql = ASTER_BACKFILL_SQL.format(table=MIZ_TABLE, sub_in=quoted_csv(MIZ_INCLUDE_SUBCAT))
    rows = bq_rows(client, sql)
    print(f"  -> {len(rows)} rows")
    return rows

def run_ua(client):
    print("Querying Under Armour (Aster, full history)…")
    sql = ASTER_BACKFILL_SQL.format(table=UA_TABLE, sub_in=quoted_csv(UA_INCLUDE_SUBCAT))
    rows = bq_rows(client, sql)
    print(f"  -> {len(rows)} rows")
    return rows

def run_centauro(client):
    print("Querying Centauro (multi-brand, full history)…")
    rows = bq_rows(client, CENTAURO_BACKFILL_SQL)
    print(f"  -> {len(rows)} rows")
    return rows

def write_js(oly_rows, miz_rows, ua_rows, ctr_rows):
    lines = []
    lines.append("// Sports Retail — Price Pass-Through")
    lines.append("// Same-SKU price variation across windows (1w/1m/3m/1y/YTD), sale + list.")
    lines.append("// Methodology: Aster's (price_t - AVG(prev_window_prices)) / AVG(...).")
    lines.append("//   prev_window: 1w=prev ISO week; 1m=prev cal month; 3m=month 3 back;")
    lines.append("//                1y=same month prev year; ytd=Dec of prev year.")
    lines.append("// Granularity: model+color+size (Aster id; Centauro EAN).")
    lines.append("// Snapshot dynamic cohort: SKU contributes when present in both t and ref window.")
    lines.append("// Weeks Sunday-anchored, closed weeks only. Cross-SKU simple mean.")
    lines.append("// Schema: {w, cat, p_sale, p_list, var_{sale|list}_{1w,1m,3m,1y,ytd}, n}")
    lines.append("//   Centauro adds 'brand' field (multi-brand).")
    lines.append("")

    def emit(name, rows, with_brand):
        lines.append(f"window.{name} = [")
        body = [fmt_passthrough_row(r, with_brand=with_brand) for r in rows]
        lines.append(",\n".join(body))
        lines.append("];")
        lines.append("")

    emit("RAW_PASSTHROUGH_OLY", oly_rows, with_brand=False)
    emit("RAW_PASSTHROUGH_MIZ", miz_rows, with_brand=False)
    emit("RAW_PASSTHROUGH_UA", ua_rows, with_brand=False)
    emit("RAW_PASSTHROUGH_CENTAURO", ctr_rows, with_brand=True)

    os.makedirs(DOCS_DIR, exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
    print(f"\nWrote {OUT_JS}")
    print(f"  Olympikus:    {len(oly_rows):>5} rows")
    print(f"  Mizuno:       {len(miz_rows):>5} rows")
    print(f"  Under Armour: {len(ua_rows):>5} rows")
    print(f"  Centauro:     {len(ctr_rows):>5} rows")

def regenerate(client=None):
    """Re-generate docs/calcados-passthrough-data.js from scratch.
    Pass an existing BQ client to reuse, or None to create a new one.
    Reusable from update_dashboard_js.py weekly cron."""
    if client is None:
        client = get_bq_client()
    oly = run_oly(client)
    miz = run_miz(client)
    ua  = run_ua(client)
    ctr = run_centauro(client)
    write_js(oly, miz, ua, ctr)

def main():
    regenerate()

if __name__ == '__main__':
    main()
