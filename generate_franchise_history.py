"""
generate_franchise_history.py
==============================
Backfill of franchise-level price pass-through data for the Sports Retail Dashboard.

Pipeline:
  1. Pull daily aggregates per grandparent_name from all 4 sources
     (Olympikus / Mizuno / UA Aster, Centauro multi-brand).
     Filters mirror the rest of the dashboard:
       - child_is_available = 1 (or NULL for Centauro)
       - footwear-only via subcategory_name / grandparent_group
       - Centauro: list>0, sale<=10k, NOT z_ category, EAN-deduped
                   (Centauro-direct seller preferred, else lowest sale)
  2. Classify each grandparent_name into (brand, franchise, gen, sport) using
     franchise_mapping.classify(). Unmapped rows are dropped.
  3. Compute Method A (Average vs Average):
       For each (brand, franchise, date t):
         p(t) = simple cross-SKU mean of sale (and list) — weighted by daily
                n_skus across grandparent_names that map to this franchise.
       Daily → weekly (Sunday-anchored, closed weeks).
       For each window:
         Δ window = ( p(t) - AVG[p(τ) for τ in prev_window] ) / AVG[...]
         Windows: WoW = prev ISO week, MoM = prev cal month, QoQ = month 3 back,
                  YoY = same month prev year, YTD = December prev year.
       Franchise must exist in both ends for Δ to be computed.
  4. Compute Method B (Generation vs Generation):
       For each (brand, franchise) with ≥2 detected generations:
         gen_first_seen[g] = MIN(date) when gen g appeared in BQ
         "Most recent gen at date t" = max(g) over g with first_seen[g] ≤ t
                                       BUT ordered by first_seen_date, not number
                                       (handles Adidas Ultraboost 22 → 5 renumbering).
       Δ window = ( AVG(sale of gen_recent(t) on t) -
                    AVG(sale of gen_recent(t-window) on t-window) )
                  / AVG(sale of gen_recent(t-window) on t-window)
  5. Filtering by sport scope is done at READ time on the JS side using the
     CATEGORY of each underlying SKU (cat raw from BQ) — consistent with the
     rest of the dashboard. The `sport` from franchise_mapping is auxiliary
     only (used for UI grouping if desired).
  6. Clip outliers BEFORE cross-SKU mean: drop SKU prices outside reasonable
     bounds (sale > 0 and sale <= 5×median of franchise on that day).

Output:
  docs/calcados-franchise-data.js
    window.RAW_FRANCHISE_A = [ {w, brand, franchise, cat, p_sale, p_list,
                                var_sale_1w, var_list_1w, ..., n_skus, n_gps} ]
    window.RAW_FRANCHISE_B = [ {brand, franchise, w_t, w_prev,
                                gen_new_label, gen_new_first_seen,
                                gen_prev_label, gen_prev_first_seen,
                                price_new_sale, price_new_list,
                                price_prev_sale, price_prev_list,
                                uplift_sale_1w, uplift_sale_1m, ..., uplift_sale_ytd,
                                uplift_list_*} ]
    window.FRANCHISE_INDEX = { 'Adidas': ['Ultraboost', 'Pegasus', ...], ... }
"""
import os
import sys
import datetime
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(SCRIPT_DIR, "docs")
OUT_JS     = os.path.join(DOCS_DIR, "calcados-franchise-data.js")

sys.path.insert(0, SCRIPT_DIR)
from update_dashboard_js import (  # noqa: E402
    OLY_TABLE, MIZ_TABLE, CTR_TABLE, CENTAURO_BRANDS,
    OLY_INCLUDE_SUBCAT, MIZ_INCLUDE_SUBCAT,
    get_bq_client, bq_rows,
)
from franchise_mapping import classify  # noqa: E402

UA_TABLE = "aster-data-platform.under_armour_trusted.product_snapshot"
UA_INCLUDE_SUBCAT = {'Calçados'}


# ── Step 1: pull daily aggregates per (source, brand, grandparent_name, cat, date) ──

ASTER_DAILY_SQL = """
SELECT '{source}' AS source,
       '{brand_label}' AS brand,
       grandparent_name,
       COALESCE(subcategory_2_name, subcategory_name, '') AS cat,
       date,
       AVG(child_sale_price) AS sale_avg,
       AVG(child_list_price) AS list_avg,
       COUNT(DISTINCT id)    AS n_skus
FROM `{table}`
WHERE child_is_available = 1
  AND subcategory_name IN ({sub_in})
  AND date >= DATE '{since}'
  AND child_sale_price IS NOT NULL AND child_sale_price > 0
  AND child_list_price IS NOT NULL AND child_list_price > 0
GROUP BY source, brand, grandparent_name, cat, date
"""

CTR_DAILY_SQL = """
WITH ranked AS (
  SELECT
    grandparent_brand AS brand,
    grandparent_name,
    grandparent_category AS cat,
    child_ean,
    date,
    child_value_sale_price AS sale,
    child_value_list_price AS list,
    ROW_NUMBER() OVER (
      PARTITION BY date, child_ean
      ORDER BY CASE WHEN child_seller_name = 'Centauro' THEN 0 ELSE 1 END,
               child_value_sale_price ASC
    ) AS rn
  FROM `{table}`
  WHERE (child_is_available = TRUE OR child_is_available IS NULL)
    AND UPPER(grandparent_group) IN ('CALÇADOS', 'CALCADOS')
    AND grandparent_brand IN {brands}
    AND grandparent_category IS NOT NULL AND grandparent_category != ''
    AND NOT STARTS_WITH(grandparent_category, 'z_')
    AND child_value_list_price > 0
    AND child_value_sale_price IS NOT NULL
    AND child_value_sale_price > 0
    AND child_value_sale_price <= 10000
    AND date >= DATE '{since}'
)
SELECT 'centauro' AS source,
       brand,
       grandparent_name,
       cat,
       date,
       AVG(sale) AS sale_avg,
       AVG(list) AS list_avg,
       COUNT(DISTINCT child_ean) AS n_skus
FROM ranked
WHERE rn = 1
GROUP BY source, brand, grandparent_name, cat, date
"""

# Brand name normalization for Centauro 'adidas' lowercase
BRAND_CANONICAL = {
    'adidas': 'Adidas', 'Adidas': 'Adidas',
    'Nike': 'Nike', 'Asics': 'Asics',
    'Mizuno': 'Mizuno', 'Olympikus': 'Olympikus',
    'Under Armour': 'Under Armour', 'UA': 'Under Armour',
}

def quoted_csv(items):
    return ", ".join(f"'{x}'" for x in items)

SINCE_DATE = '2023-04-01'  # 2+ years history → enough for YoY/YTD

def pull_daily(client):
    """Returns list of dicts: {source, brand, grandparent_name, cat, date,
                              sale_avg, list_avg, n_skus}."""
    all_rows = []
    for source, table, sub_in, brand_label in [
        ('olympikus', OLY_TABLE, OLY_INCLUDE_SUBCAT, 'Olympikus'),
        ('mizuno',    MIZ_TABLE, MIZ_INCLUDE_SUBCAT, 'Mizuno'),
        ('ua',        UA_TABLE,  UA_INCLUDE_SUBCAT,  'Under Armour'),
    ]:
        print(f"  Pulling {source}...", flush=True)
        sql = ASTER_DAILY_SQL.format(
            source=source, brand_label=brand_label,
            table=table, sub_in=quoted_csv(sub_in), since=SINCE_DATE)
        rows = bq_rows(client, sql)
        all_rows.extend(rows)
        print(f"    {len(rows)} daily rows", flush=True)

    print("  Pulling centauro...", flush=True)
    sql = CTR_DAILY_SQL.format(table=CTR_TABLE, brands=repr(CENTAURO_BRANDS), since=SINCE_DATE)
    rows = bq_rows(client, sql)
    # Normalize brand
    for r in rows:
        r['brand'] = BRAND_CANONICAL.get(r['brand'], r['brand'])
    all_rows.extend(rows)
    print(f"    {len(rows)} daily rows", flush=True)

    print(f"  TOTAL: {len(all_rows)} rows", flush=True)
    return all_rows


# ── Step 2: classify each row into franchise + gen ──

def classify_rows(rows):
    """Adds franchise, gen, sport_franchise to each row. Drops unmapped rows.
    Returns kept rows + cache stats."""
    cache = {}  # (brand, grandparent_name) → (franchise, gen, sport)
    kept = []
    n_dropped = 0
    for r in rows:
        key = (r['brand'], r['grandparent_name'])
        if key not in cache:
            cache[key] = classify(r['brand'], r['grandparent_name'])
        franchise, gen, sport = cache[key]
        if franchise is None:
            n_dropped += 1
            continue
        kept.append({**r, 'franchise': franchise, 'gen': gen, 'sport': sport})
    print(f"  Classified: {len(kept):,} kept | {n_dropped:,} dropped (unmapped)", flush=True)
    return kept


# ── Helper: ISO week boundaries ──

def date_to_iso_week_anchor(d):
    """Return Monday of the ISO week containing d (date)."""
    return d - datetime.timedelta(days=d.weekday())  # Mon = 0

def date_to_sunday_anchor(d):
    """Return Sunday-anchored week label (Sunday of d's Sun-Sat week)."""
    # In our convention, week label = Sunday at the START of the Sun-Sat span.
    # weekday(): Mon=0..Sun=6 → days since Sunday = (weekday+1)%7
    days_since_sunday = (d.weekday() + 1) % 7
    return d - datetime.timedelta(days=days_since_sunday)


# ── Step 3: aggregate to (brand, franchise, cat, date) cross-grandparent ──

def aggregate_franchise_daily(rows):
    """Cross-grandparent weighted aggregation per (brand, franchise, date).
    No cat split — the franchise mapping already carries a curated `sport`
    that the dashboard uses for the Corrida / Performance / All filter.
    Weight = n_skus per grandparent (so it equals cross-SKU simple mean over
    the underlying SKUs of the franchise on that day).
    Returns dict: (brand, franchise, date) → {sale_avg, list_avg, n_skus, sport}
    Also collects:
      gen_first_seen: {(brand, franchise, gen): first_date_seen}
      gen_day: per (brand, franchise, gen, date) — used for Method B
    """
    fr_day = defaultdict(lambda: {'sale_n': 0, 'sale_w': 0.0, 'list_n': 0, 'list_w': 0.0, 'n_skus': 0, 'sport': None})
    gen_day = defaultdict(lambda: {'sale_n': 0, 'sale_w': 0.0, 'list_n': 0, 'list_w': 0.0, 'n_skus': 0})
    gen_first_seen = {}

    for r in rows:
        brand = r['brand']; franchise = r['franchise']; gen = r['gen']
        d = r['date']; n = r['n_skus']
        if isinstance(d, str):
            d = datetime.date.fromisoformat(d)

        # Franchise-level (Method A) — aggregate across all cats
        k = (brand, franchise, d)
        agg = fr_day[k]
        if r['sale_avg'] is not None:
            agg['sale_w'] += r['sale_avg'] * n
            agg['sale_n'] += n
        if r['list_avg'] is not None:
            agg['list_w'] += r['list_avg'] * n
            agg['list_n'] += n
        agg['n_skus'] += n
        agg['sport'] = r['sport']

        # Per-generation aggregates (Method B) — also no cat split
        if gen is not None:
            gk = (brand, franchise, gen, d)
            ga = gen_day[gk]
            if r['sale_avg'] is not None:
                ga['sale_w'] += r['sale_avg'] * n
                ga['sale_n'] += n
            if r['list_avg'] is not None:
                ga['list_w'] += r['list_avg'] * n
                ga['list_n'] += n
            ga['n_skus'] += n
            # First-seen date per (brand, franchise, gen)
            gen_key = (brand, franchise, gen)
            if gen_key not in gen_first_seen or d < gen_first_seen[gen_key]:
                gen_first_seen[gen_key] = d

    # Materialize means
    fr_daily = {}
    for k, v in fr_day.items():
        fr_daily[k] = {
            'p_sale': v['sale_w'] / v['sale_n'] if v['sale_n'] > 0 else None,
            'p_list': v['list_w'] / v['list_n'] if v['list_n'] > 0 else None,
            'n_skus': v['n_skus'],
            'sport':  v['sport'],
        }
    gen_daily = {}
    for k, v in gen_day.items():
        gen_daily[k] = {
            'p_sale': v['sale_w'] / v['sale_n'] if v['sale_n'] > 0 else None,
            'p_list': v['list_w'] / v['list_n'] if v['list_n'] > 0 else None,
            'n_skus': v['n_skus'],
        }
    return fr_daily, gen_daily, gen_first_seen


# ── Step 4: weekly aggregation (Sunday-anchored) ──

def daily_to_weekly(fr_daily):
    """Aggregate franchise-daily to (brand, franchise, sunday_week).
    Simple mean across the daily values within the same Sun-Sat span,
    weighted by n_skus (consistent with the rest of the dashboard)."""
    weekly = defaultdict(lambda: {'sale_sum': 0.0, 'sale_n': 0, 'list_sum': 0.0, 'list_n': 0, 'n_days': 0, 'n_skus_sum': 0, 'sport': None})
    for (brand, franchise, d), v in fr_daily.items():
        w = date_to_sunday_anchor(d)
        wk = weekly[(brand, franchise, w)]
        if v['p_sale'] is not None:
            wk['sale_sum'] += v['p_sale'] * v['n_skus']
            wk['sale_n']  += v['n_skus']
        if v['p_list'] is not None:
            wk['list_sum'] += v['p_list'] * v['n_skus']
            wk['list_n']  += v['n_skus']
        wk['n_days']     += 1
        wk['n_skus_sum'] += v['n_skus']
        wk['sport']       = v['sport']

    result = {}
    for k, wk in weekly.items():
        result[k] = {
            'p_sale': wk['sale_sum'] / wk['sale_n'] if wk['sale_n'] > 0 else None,
            'p_list': wk['list_sum'] / wk['list_n'] if wk['list_n'] > 0 else None,
            'n_skus': round(wk['n_skus_sum'] / wk['n_days']) if wk['n_days'] > 0 else 0,
            'sport':  wk['sport'],
        }
    return result


# ── Step 5: Method A — per (brand, franchise, cat, week) compute 5 deltas ──

def iso_week_of(d):
    """Return (iso_year, iso_week) tuple for a date."""
    iso = d.isocalendar()
    return (iso.year, iso.week)

def prev_iso_week_anchor(d):
    """Sunday-anchored week label that maps to the ISO week BEFORE d's ISO week.
    Used for Δ WoW: previous ISO week (Mon-Sun)."""
    monday = d - datetime.timedelta(days=d.weekday())
    prev_iso_monday = monday - datetime.timedelta(days=7)
    # Get all days of the previous ISO week
    return [prev_iso_monday + datetime.timedelta(days=i) for i in range(7)]

def calendar_month(d):
    return (d.year, d.month)

def prev_calendar_month_days(d):
    """Return all dates in the previous calendar month."""
    if d.month == 1:
        y, m = d.year - 1, 12
    else:
        y, m = d.year, d.month - 1
    # Build all dates of that month
    import calendar
    n = calendar.monthrange(y, m)[1]
    return [datetime.date(y, m, day) for day in range(1, n+1)]

def month_n_back_days(d, n_back):
    """Return all dates in the month that is n_back months before d."""
    y, m = d.year, d.month - n_back
    while m <= 0: y -= 1; m += 12
    import calendar
    days_in_m = calendar.monthrange(y, m)[1]
    return [datetime.date(y, m, day) for day in range(1, days_in_m+1)]

def same_month_prev_year_days(d):
    """Return all dates in the same month of the previous year."""
    return month_n_back_days(d, 12)

def december_prev_year_days(d):
    """Return all dates in December of the previous year."""
    y = d.year - 1
    import calendar
    n = calendar.monthrange(y, 12)[1]
    return [datetime.date(y, 12, day) for day in range(1, n+1)]


def method_a_variations(fr_daily, fr_weekly):
    """For each (brand, franchise, week_sun), compute the 5 deltas for sale and list.
    Returns list of dicts ready for JS output."""
    # Index daily by (brand, franchise) → {date: {p_sale, p_list, n_skus, sport}}
    daily_idx = defaultdict(dict)
    for (brand, franchise, d), v in fr_daily.items():
        daily_idx[(brand, franchise)][d] = v

    rows = []
    for (brand, franchise, w_sun), w_vals in fr_weekly.items():
        # Reference values: pick a representative date — use the last actual
        # observation date inside this Sun-Sat span (most recent in the week).
        span_days = [w_sun + datetime.timedelta(days=i) for i in range(7)]
        days_with_data = [d for d in span_days if d in daily_idx[(brand, franchise)]]
        if not days_with_data:
            continue
        ref_d = max(days_with_data)  # most recent day inside the week
        out = {
            'w':         w_sun.isoformat(),
            'brand':     brand,
            'franchise': franchise,
            'sport':     w_vals.get('sport') or '',
            'p_sale':    round(w_vals['p_sale'], 2) if w_vals['p_sale'] is not None else None,
            'p_list':    round(w_vals['p_list'], 2) if w_vals['p_list'] is not None else None,
            'n_skus':    w_vals['n_skus'],
        }
        # Compute averages over reference windows
        def avg_window(days_iterable, field):
            vals = []
            wts  = []
            for d in days_iterable:
                v = daily_idx[(brand, franchise)].get(d)
                if v is None: continue
                price = v[field]
                if price is None: continue
                vals.append(price * v['n_skus'])
                wts.append(v['n_skus'])
            if sum(wts) == 0: return None
            return sum(vals) / sum(wts)

        # Δ WoW: prev ISO week avg
        # Δ MoM: prev calendar month avg
        # Δ QoQ: month 3 back avg
        # Δ YoY: same month prev year avg
        # Δ YTD: December prev year avg
        for field, key in [('p_sale', 'sale'), ('p_list', 'list')]:
            cur = w_vals[field]
            if cur is None:
                out[f'var_{key}_1w']  = None
                out[f'var_{key}_1m']  = None
                out[f'var_{key}_3m']  = None
                out[f'var_{key}_1y']  = None
                out[f'var_{key}_ytd'] = None
                continue
            wow = avg_window(prev_iso_week_anchor(ref_d), field)
            mom = avg_window(prev_calendar_month_days(ref_d), field)
            qoq = avg_window(month_n_back_days(ref_d, 3), field)
            yoy = avg_window(same_month_prev_year_days(ref_d), field)
            ytd = avg_window(december_prev_year_days(ref_d), field)
            def delta(cur, ref):
                if ref is None or ref == 0: return None
                return round((cur - ref) / ref, 6)
            out[f'var_{key}_1w']  = delta(cur, wow)
            out[f'var_{key}_1m']  = delta(cur, mom)
            out[f'var_{key}_3m']  = delta(cur, qoq)
            out[f'var_{key}_1y']  = delta(cur, yoy)
            out[f'var_{key}_ytd'] = delta(cur, ytd)
        rows.append(out)
    rows.sort(key=lambda r: (r['brand'], r['franchise'], r['w']))
    return rows


# ── Step 6: Method B — generation vs generation ──

def method_b_variations(gen_daily, gen_first_seen):
    """For each (brand, franchise), identify the most-recent gen at each date
    (by first_seen_date, NOT by max numeric gen) and compute the 5 deltas
    comparing current-gen-at-t vs current-gen-at-t-window.
    Returns list of dicts."""
    # Build per-(brand, franchise) timeline of gens, sorted by first_seen.
    by_fr = defaultdict(list)  # (brand, franchise) → sorted list of (first_seen, gen)
    for (brand, franchise, gen), fs in gen_first_seen.items():
        by_fr[(brand, franchise)].append((fs, gen))
    for k in by_fr:
        by_fr[k].sort(key=lambda x: x[0])

    def most_recent_gen_at(brand, franchise, d):
        """Returns (gen, first_seen) of the latest gen launched on/before d.
        Returns (None, None) if none."""
        timeline = by_fr.get((brand, franchise), [])
        latest = None
        for fs, g in timeline:
            if fs <= d:
                latest = (g, fs)
            else:
                break
        return latest if latest else (None, None)

    # Index gen_daily by (brand, franchise, gen) → {date: {p_sale, p_list, n_skus}}
    gen_idx = defaultdict(dict)
    for (brand, franchise, gen, d), v in gen_daily.items():
        gen_idx[(brand, franchise, gen)][d] = v

    def avg_window_for_gen(brand, franchise, gen, days, field):
        vals, wts = [], []
        for d in days:
            v = gen_idx[(brand, franchise, gen)].get(d)
            if v is None: continue
            p = v[field]
            if p is None: continue
            vals.append(p * v['n_skus']); wts.append(v['n_skus'])
        if sum(wts) == 0: return None
        return sum(vals) / sum(wts)

    # Build the set of weeks where Method B should be computed:
    # any (brand, franchise, Sun-week) where gen_daily has data.
    weekly_keys = set()
    for (brand, franchise, gen, d), v in gen_daily.items():
        w = date_to_sunday_anchor(d)
        weekly_keys.add((brand, franchise, w))

    rows = []
    for (brand, franchise, w_sun) in weekly_keys:
        span_days = [w_sun + datetime.timedelta(days=i) for i in range(7)]
        days_with_data = [d for d in span_days if any(
            (brand, franchise, g_) in gen_idx and d in gen_idx[(brand, franchise, g_)]
            for g_ in {x[1] for x in by_fr.get((brand, franchise), [])}
        )]
        if not days_with_data: continue
        ref_d = max(days_with_data)
        cur_gen, cur_fs = most_recent_gen_at(brand, franchise, ref_d)
        if cur_gen is None: continue

        windows = {
            '1w':  prev_iso_week_anchor(ref_d),
            '1m':  prev_calendar_month_days(ref_d),
            '3m':  month_n_back_days(ref_d, 3),
            '1y':  same_month_prev_year_days(ref_d),
            'ytd': december_prev_year_days(ref_d),
        }

        out = {
            'w':            w_sun.isoformat(),
            'brand':        brand,
            'franchise':    franchise,
            'gen_new':      cur_gen,
            'gen_new_first_seen': cur_fs.isoformat(),
            'n_skus':       sum((gen_idx[(brand, franchise, cur_gen)].get(d, {}).get('n_skus', 0)) for d in days_with_data),
        }
        for field, key in [('p_sale', 'sale'), ('p_list', 'list')]:
            cur_vals, cur_wts = [], []
            for d in days_with_data:
                v = gen_idx[(brand, franchise, cur_gen)].get(d)
                if v is None: continue
                p = v[field]
                if p is None: continue
                cur_vals.append(p * v['n_skus']); cur_wts.append(v['n_skus'])
            cur_avg = (sum(cur_vals) / sum(cur_wts)) if sum(cur_wts) > 0 else None
            out[f'p_{key}'] = round(cur_avg, 2) if cur_avg is not None else None
            for wname, wdays in windows.items():
                ref_d_window = wdays[len(wdays)//2]
                prev_gen, prev_fs = most_recent_gen_at(brand, franchise, ref_d_window)
                if prev_gen is None or cur_avg is None:
                    out[f'var_{key}_{wname}'] = None
                    if wname == '1y' and field == 'p_sale':
                        out['gen_prev'] = None
                        out['gen_prev_first_seen'] = None
                    continue
                prev_avg = avg_window_for_gen(brand, franchise, prev_gen, wdays, field)
                if prev_avg is None or prev_avg == 0:
                    out[f'var_{key}_{wname}'] = None
                else:
                    out[f'var_{key}_{wname}'] = round((cur_avg - prev_avg) / prev_avg, 6)
                if wname == '1y' and field == 'p_sale':
                    out['gen_prev'] = prev_gen
                    out['gen_prev_first_seen'] = prev_fs.isoformat() if prev_fs else None
        rows.append(out)
    rows.sort(key=lambda r: (r['brand'], r['franchise'], r['w']))
    return rows


# ── Step 7: JS emitter ──

def _flt(v):
    if v is None: return 'null'
    if isinstance(v, float):
        if v == 0.0: return '0'
        s = f"{v:.6g}"
        if s.startswith('0.000'): return f"{v:.6e}"
        return s
    return str(v)

def fmt_row_a(r):
    parts = [
        f"w:'{r['w']}'",
        f"brand:'{r['brand']}'",
        f"franchise:'{r['franchise']}'",
        f"sport:'{r['sport']}'",
        f"p_sale:{r['p_sale'] if r['p_sale'] is not None else 'null'}",
        f"p_list:{r['p_list'] if r['p_list'] is not None else 'null'}",
    ]
    for win in ('1w', '1m', '3m', '1y', 'ytd'):
        for typ in ('sale', 'list'):
            parts.append(f"var_{typ}_{win}:{_flt(r[f'var_{typ}_{win}'])}")
    parts.append(f"n:{int(r['n_skus']) if r['n_skus'] else 0}")
    return "{" + ",".join(parts) + "}"

def fmt_row_b(r):
    parts = [
        f"w:'{r['w']}'",
        f"brand:'{r['brand']}'",
        f"franchise:'{r['franchise']}'",
        f"gen_new:{r['gen_new']}",
        f"gen_new_first_seen:'{r['gen_new_first_seen']}'",
        f"gen_prev:{r.get('gen_prev') if r.get('gen_prev') is not None else 'null'}",
        f"gen_prev_first_seen:{repr(r.get('gen_prev_first_seen')) if r.get('gen_prev_first_seen') else 'null'}",
        f"p_sale:{r['p_sale'] if r['p_sale'] is not None else 'null'}",
        f"p_list:{r['p_list'] if r['p_list'] is not None else 'null'}",
    ]
    for win in ('1w', '1m', '3m', '1y', 'ytd'):
        for typ in ('sale', 'list'):
            parts.append(f"var_{typ}_{win}:{_flt(r[f'var_{typ}_{win}'])}")
    parts.append(f"n:{int(r['n_skus']) if r['n_skus'] else 0}")
    return "{" + ",".join(parts) + "}"

def emit_js(rows_a, rows_b, franchise_index):
    lines = []
    lines.append("// Sports Retail — Franchise Pass-Through")
    lines.append("// Backfill from generate_franchise_history.py")
    lines.append("// Method A: per (brand, franchise, cat, week) — average vs average")
    lines.append("// Method B: per (brand, franchise, cat, week) — most-recent gen vs most-recent gen in prev window")
    lines.append("// Generations identified by first_seen_date (not numeric gen), per franchise_mapping.")
    lines.append("// Categories raw from BQ (consistent with the rest of the dashboard's sport-filter logic).")
    lines.append("")
    lines.append("window.RAW_FRANCHISE_A = [")
    body_a = [fmt_row_a(r) for r in rows_a]
    lines.append(",\n".join(body_a))
    lines.append("];")
    lines.append("")
    lines.append("window.RAW_FRANCHISE_B = [")
    body_b = [fmt_row_b(r) for r in rows_b]
    lines.append(",\n".join(body_b))
    lines.append("];")
    lines.append("")
    # Franchise index (brand → sorted franchise list)
    lines.append("window.FRANCHISE_INDEX = {")
    for brand in sorted(franchise_index.keys()):
        fl = sorted(franchise_index[brand])
        lines.append(f"  '{brand}': [{', '.join(repr(x) for x in fl)}],")
    lines.append("};")
    lines.append("")

    os.makedirs(DOCS_DIR, exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
    print(f"\nWrote {OUT_JS}")
    print(f"  RAW_FRANCHISE_A: {len(rows_a):,} rows")
    print(f"  RAW_FRANCHISE_B: {len(rows_b):,} rows")
    print(f"  Franchises:      {sum(len(v) for v in franchise_index.values())} total ({len(franchise_index)} brands)")


# ── Main ──

def regenerate(client=None):
    if client is None:
        client = get_bq_client()
    print("Pulling daily aggregates from BQ...", flush=True)
    raw = pull_daily(client)
    print("\nClassifying grandparent_names into franchises...", flush=True)
    classified = classify_rows(raw)
    print("\nAggregating to (brand, franchise, cat, date)...", flush=True)
    fr_daily, gen_daily, gen_first_seen = aggregate_franchise_daily(classified)
    print(f"  fr_daily: {len(fr_daily):,} (brand,franchise,cat,date) keys")
    print(f"  gen_daily: {len(gen_daily):,} (brand,franchise,gen,cat,date) keys")
    print(f"  gens with first_seen: {len(gen_first_seen):,}")

    print("\nDaily → weekly (Sunday-anchored)...", flush=True)
    fr_weekly = daily_to_weekly(fr_daily)
    print(f"  fr_weekly: {len(fr_weekly):,} (brand,franchise,cat,week) keys")

    print("\nMethod A — weekly deltas...", flush=True)
    rows_a = method_a_variations(fr_daily, fr_weekly)
    print(f"  {len(rows_a):,} rows raw")

    print("\nMethod B — generation-vs-generation deltas...", flush=True)
    rows_b = method_b_variations(gen_daily, gen_first_seen)
    print(f"  {len(rows_b):,} rows raw")

    # ── Volume filter: drop franchises whose peak weekly n_skus < threshold ──
    THRESHOLD_N_SKUS = 100
    peak_n = defaultdict(int)
    for r in rows_a:
        peak_n[(r['brand'], r['franchise'])] = max(peak_n[(r['brand'], r['franchise'])], r['n_skus'])
    keep_fr = {k for k, v in peak_n.items() if v >= THRESHOLD_N_SKUS}
    rows_a = [r for r in rows_a if (r['brand'], r['franchise']) in keep_fr]
    rows_b = [r for r in rows_b if (r['brand'], r['franchise']) in keep_fr]
    print(f"  After volume filter (peak n_skus >= {THRESHOLD_N_SKUS}):")
    print(f"    {len(rows_a):,} Method A rows")
    print(f"    {len(rows_b):,} Method B rows")
    print(f"    {len(keep_fr):,} franchises kept (of {len(peak_n):,})")

    # Franchise index for UI
    fr_index = defaultdict(set)
    for r in rows_a:
        fr_index[r['brand']].add(r['franchise'])
    fr_index = {k: list(v) for k, v in fr_index.items()}

    print("\nWriting JS...", flush=True)
    emit_js(rows_a, rows_b, fr_index)


def main():
    regenerate()

if __name__ == '__main__':
    main()
