"""
update_dashboard_js.py
======================
Sports Retail Dashboard — weekly auto-update for JS data arrays.

Runs every Monday at ~13:00 UTC (10:00 BRT) via GitHub Actions.
Determines the last closed Sunday, queries BQ for all data channels,
and replaces/appends rows in docs/calcados-price-data.js and
docs/calcados-disc-data.js.

Manual run:
    python update_dashboard_js.py [YYYY-MM-DD]   # optional: override target Sunday
"""

import re
import os
import sys
import datetime
from collections import defaultdict

# ── Constants ──────────────────────────────────────────────────────────────────

BQ_PROJECT   = "aster-data-platform"
DIRECT_TABLE = f"{BQ_PROJECT}.constellation_vibe_coding.usr_andre_adidas_nike_product_snapshot_2026_05_15"
NS_TABLE     = f"{BQ_PROJECT}.constellation_vibe_coding.usr_andre_netshoes_product_snapshot_2026_05_15"
CTR_TABLE    = f"{BQ_PROJECT}.centauro_trusted.product_snapshot"
OLY_TABLE    = f"{BQ_PROJECT}.olympikus_trusted.product_snapshot"
MIZ_TABLE    = f"{BQ_PROJECT}.mizuno_trusted.product_snapshot"

CENTAURO_BRANDS = ('Nike', 'Adidas', 'Asics', 'Under Armour')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(SCRIPT_DIR, "docs")
PRICE_JS   = os.path.join(DOCS_DIR, "calcados-price-data.js")
DISC_JS    = os.path.join(DOCS_DIR, "calcados-disc-data.js")

# ── Date helpers ───────────────────────────────────────────────────────────────

def last_closed_sunday() -> datetime.date:
    """Most recent Sunday that is fully closed (not today even if today is Sunday)."""
    today = datetime.date.today()
    # weekday(): Mon=0 … Sun=6
    days_ago = (today.weekday() + 1) % 7   # Mon→1, Tue→2, … Sun→0
    if days_ago == 0:
        days_ago = 7                        # if today is Sunday → use previous Sunday
    return today - datetime.timedelta(days=days_ago)

def week_monday(sunday: datetime.date) -> datetime.date:
    return sunday - datetime.timedelta(days=6)

# ── BQ client ──────────────────────────────────────────────────────────────────

def get_bq_client():
    from google.cloud import bigquery
    try:
        import google.auth
        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        return bigquery.Client(project=BQ_PROJECT, credentials=creds)
    except Exception as e:
        raise RuntimeError(f"BQ auth failed: {e}")

def bq_rows(client, sql: str) -> list:
    result = list(client.query(sql).result())
    return [dict(r.items()) for r in result]

def bq_latest_date_in_week(client, table: str, monday: str, sunday: str) -> str | None:
    """Return latest available date in [monday, sunday] for the given table, or None."""
    sql = f"""
        SELECT MAX(date) AS d FROM `{table}`
        WHERE date BETWEEN '{monday}' AND '{sunday}'
    """
    rows = bq_rows(client, sql)
    if rows and rows[0]['d']:
        return str(rows[0]['d'])
    return None

# ── Category mappings ──────────────────────────────────────────────────────────

# Direct brands: (brand_key, raw_sport) → display cat
DIRECT_CAT_MAP = {
    # ── Adidas ──────────────────────────────────────────────────────────────
    ('adidas', 'Running'):          'Corrida',
    ('adidas', 'Lifestyle'):        'Casual',
    ('adidas', 'Skateboarding'):    'Skate',
    ('adidas', 'Training'):         'Treino',
    ('adidas', 'Tennis'):           'Tênis',
    ('adidas', 'Trail Running'):    'Trilha',
    ('adidas', 'Volei'):            'Vôlei',
    ('adidas', 'Basquete'):         'Basquete',
    ('adidas', 'Futebol'):          'Futebol',
    ('adidas', 'Trilha'):           'Trilha',
    ('adidas', 'Motorsport'):       'Outros',
    ('adidas', 'Handebol'):         'Outros',
    ('adidas', 'Padel'):            'Outros',
    ('adidas', 'Caminhada'):        'Corrida',
    ('adidas', 'Soccer'):           'Futebol',
    # ── Nike ────────────────────────────────────────────────────────────────
    ('nike', 'Casual'):                 'Casual',
    ('nike', 'Basquete'):               'Basquete',
    ('nike', 'Futebol'):                'Futebol',
    ('nike', 'Corrida'):                'Corrida',
    ('nike', 'Para Jogar Tênis'):       'Tênis',
    ('nike', 'Skateboarding'):          'Skate',
    ('nike', 'Treino & Academia'):      'Treino',
    ('nike', 'Casual/Skateboarding'):   'Skate',
    # ── Asics ───────────────────────────────────────────────────────────────
    ('asics', 'Running'):           'Corrida',
    ('asics', 'Corrida'):           'Corrida',
    ('asics', 'SportStyle'):        'Casual',
    ('asics', 'Tennis'):            'Tênis',
    ('asics', 'Quadra'):            'Tênis',
    ('asics', 'Skateboarding'):     'Skate',
    ('asics', 'Vôlei'):             'Vôlei',
    ('asics', 'Volei'):             'Vôlei',
    ('asics', 'Trail Running'):     'Trilha',
    ('asics', 'Trilha'):            'Trilha',
    ('asics', 'Infantil'):          'Infantil',
    ('asics', 'Calçados'):          'Outros',
    # ── Under Armour ────────────────────────────────────────────────────────
    ('ua', 'Corrida'):              'Corrida',
    ('ua', 'Basquete'):             'Basquete',
    ('ua', 'Sportstyle'):           'Casual',
    ('ua', 'Chinelos'):             'Sandálias',
    ('ua', 'Treino'):               'Treino',
    ('ua', 'Futebol'):              'Futebol',
    ('ua', 'Trilha'):               'Trilha',
    ('ua', 'Vôlei'):                'Vôlei',
    ('ua', 'Beisebol'):             'Outros',
    ('ua', 'Chuteiras'):            'Futebol',
    ('ua', 'Golf'):                 'Outros',
    ('ua', 'Military e Tactical'):  'Outros',
}

def map_direct_cat(brand_key: str, sport: str) -> str:
    return DIRECT_CAT_MAP.get((brand_key, sport or ''), sport or 'Outros')

# Direct brand_name → JS brand key
DIRECT_BRAND_KEY = {
    'Adidas':       'adidas',
    'Nike':         'nike',
    'Asics':        'asics',
    'Under Armour': 'ua',
}

# Netshoes dept → display cat (used for RAW_NETSHOES price + RAW_DISC_NETSHOES)
NS_DEPT_DISP = {
    'Running':              'Corrida',
    'Corrida / Caminhada':  'Corrida',
    'Trail Running':        'Trilha',
    'Tennis e Squash':      'Tênis',
    'Fitness e Musculação': 'Treino',
    'Academia / Fitness':   'Treino',
    'Treino & Academia':    'Treino',
    'Basquete':             'Basquete',
    'Automobilismo':        'Outros',
    'Aventura':             'Outros',
    'Skate':                'Skate',
    'Casual':               'Casual',
    'Infantil':             'Infantil',
    'Vôlei':                'Vôlei',
    'Futebol':              'Futebol',
}

def map_ns_cat(dept: str) -> str:
    return NS_DEPT_DISP.get(dept, dept or 'Outros')

# Netshoes brand → JS brand key (adidas/ua are lowercase, others Title Case)
NS_BRAND_KEY = {
    'Adidas':       'adidas',
    'adidas':       'adidas',
    'ADIDAS':       'adidas',
    'Under Armour': 'ua',
    'under armour': 'ua',
}

def norm_ns_brand(brand: str) -> str:
    return NS_BRAND_KEY.get(brand, brand)

# Olympikus / Mizuno: subcategory_name → include?
OLY_INCLUDE_SUBCAT = {'Calçados', 'Tênis'}   # Olympikus has 'Tênis' as separate subcat
MIZ_INCLUDE_SUBCAT = {'Calçados'}             # Mizuno only has Calçados

def oly_cat(row: dict) -> str:
    """Derive display cat from Olympikus BQ row."""
    sub2 = row.get('subcategory_2_name')
    sub1 = row.get('subcategory_name')
    return sub2 or sub1 or ''

# ── JS file manipulation ───────────────────────────────────────────────────────

def update_js_array(content: str, array_name: str, week_label: str,
                    new_row_dicts: list, formatter) -> str:
    """
    In the named JS array:
      1. Remove all existing rows where w == week_label
      2. Append new rows (formatted by formatter(dict) -> str)
    Returns updated content string.
    """
    pattern = rf'(const {re.escape(array_name)} = \[)([\s\S]*?)(\n\];)'
    m = re.search(pattern, content)
    if not m:
        raise ValueError(f"Array '{array_name}' not found in JS")

    prefix, body, suffix = m.group(1), m.group(2), m.group(3)

    # Parse existing rows, drop rows for target week
    kept = []
    for line in body.split('\n'):
        stripped = line.strip()
        if stripped.startswith('{') and f"w:'{week_label}'" not in line:
            kept.append(stripped.rstrip(','))

    # Format new rows
    new_rows = [formatter(r) for r in new_row_dicts]

    all_rows = kept + new_rows
    if not all_rows:
        new_body = ''
    else:
        # All rows get trailing comma except the last
        parts = [r + ',' for r in all_rows[:-1]] + [all_rows[-1]]
        new_body = '\n' + '\n'.join(parts)

    new_array = prefix + new_body + suffix
    return content[:m.start()] + new_array + content[m.end():]

# ── Row formatters ─────────────────────────────────────────────────────────────

def flt(v) -> str:
    """Format a float without trailing zeros."""
    if v is None:
        return 'null'
    if isinstance(v, float):
        s = f"{v:.4f}".rstrip('0').rstrip('.')
        return s if s else '0'
    return str(v)

def js_str(s) -> str:
    """Escape a string for embedding inside single-quoted JS literals.
    Handles apostrophes (e.g. 'Levi's', 'Form's') and stray backslashes."""
    return str(s).replace('\\', '\\\\').replace("'", "\\'")

def price_row(w, brand, cat, p_sale, p_list, n) -> str:
    return f"{{w:'{w}',brand:'{js_str(brand)}',cat:'{js_str(cat)}',p_sale:{flt(p_sale)},p_list:{flt(p_list)},n:{n}}}"

def disc_row_brand(w, brand, cat, pct, n) -> str:
    return f"{{w:'{w}',brand:'{js_str(brand)}',cat:'{js_str(cat)}',pct:{flt(pct)},n:{n}}}"

def disc_row_no_brand(w, cat, pct, n) -> str:
    return f"{{w:'{w}',cat:'{js_str(cat)}',pct:{flt(pct)},n:{n}}}"

def avgdisc_row_brand(w, brand, cat, avg_promo, avg_all, n_disc, n) -> str:
    return (f"{{w:'{w}',brand:'{js_str(brand)}',cat:'{js_str(cat)}',"
            f"avg_disc_promo:{flt(avg_promo)},avg_disc_all:{flt(avg_all)},"
            f"n_disc:{n_disc},n:{n}}}")

def avgdisc_row_no_brand(w, cat, avg_promo, avg_all, n_disc, n) -> str:
    return (f"{{w:'{w}',cat:'{js_str(cat)}',"
            f"avg_disc_promo:{flt(avg_promo)},avg_disc_all:{flt(avg_all)},"
            f"n_disc:{n_disc},n:{n}}}")

# ── BQ query functions ─────────────────────────────────────────────────────────

def query_direct_price(client, monday: str, sunday: str) -> list:
    """RAW_DIRECT: avg price per brand × cat for the week."""
    sql = f"""
    WITH dp AS (
      SELECT date, brand_name, sport, grandparent_id,
        AVG(child_sale_price) AS sale_p,
        AVG(child_list_price) AS list_p
      FROM `{DIRECT_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND child_is_available = 1
        AND child_sale_price IS NOT NULL
      GROUP BY 1,2,3,4
    )
    SELECT brand_name, sport,
      ROUND(AVG(sale_p), 2) AS p_sale,
      ROUND(AVG(list_p), 2) AS p_list,
      COUNT(DISTINCT grandparent_id) AS n
    FROM dp
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)

    # Map to display cats and re-aggregate (sum n, weighted avg prices)
    agg = defaultdict(lambda: {'sale_w': 0.0, 'list_w': 0.0, 'n': 0})
    for r in rows:
        bk = DIRECT_BRAND_KEY.get(r['brand_name'], r['brand_name'].lower())
        cat = map_direct_cat(bk, r['sport'] or '')
        key = (bk, cat)
        n = r['n'] or 0
        agg[key]['sale_w'] += (r['p_sale'] or 0) * n
        agg[key]['list_w'] += (r['p_list'] or 0) * n
        agg[key]['n'] += n

    result = []
    for (brand, cat), v in sorted(agg.items()):
        if v['n'] == 0:
            continue
        result.append({
            'brand': brand, 'cat': cat,
            'p_sale': round(v['sale_w'] / v['n'], 2),
            'p_list': round(v['list_w'] / v['n'], 2),
            'n': v['n'],
        })
    return result


def query_ns_price(client, monday: str, sunday: str) -> list:
    """RAW_NETSHOES: avg price per brand × cat for the week."""
    sql = f"""
    WITH ds AS (
      SELECT date, brand, department, sku,
        AVG(sale_price) AS sale_p,
        AVG(list_price) AS list_p
      FROM `{NS_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND is_available = 1
        AND sale_price IS NOT NULL
      GROUP BY 1,2,3,4
    )
    SELECT brand, department,
      ROUND(AVG(sale_p), 2) AS p_sale,
      ROUND(AVG(list_p), 2) AS p_list,
      COUNT(DISTINCT sku) AS n
    FROM ds
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)

    # Normalize brand + map dept to display cat, re-aggregate
    agg = defaultdict(lambda: {'sale_w': 0.0, 'list_w': 0.0, 'n': 0})
    for r in rows:
        brand = norm_ns_brand(r['brand'] or '')
        cat   = map_ns_cat(r['department'] or '')
        key   = (brand, cat)
        n = r['n'] or 0
        agg[key]['sale_w'] += (r['p_sale'] or 0) * n
        agg[key]['list_w'] += (r['p_list'] or 0) * n
        agg[key]['n'] += n

    result = []
    for (brand, cat), v in sorted(agg.items()):
        if v['n'] == 0:
            continue
        result.append({
            'brand': brand, 'cat': cat,
            'p_sale': round(v['sale_w'] / v['n'], 2),
            'p_list': round(v['list_w'] / v['n'], 2),
            'n': v['n'],
        })
    return result


def query_direct_disc(client, monday: str, sunday: str) -> list:
    """RAW_DISC_DIRECT: % SKUs discounted per brand × raw_cat."""
    sql = f"""
    WITH agg AS (
      SELECT brand_name, sport, grandparent_id,
        MAX(child_pct_discount) AS max_disc
      FROM `{DIRECT_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND child_is_available = 1
      GROUP BY 1,2,3
    )
    SELECT
      LOWER(brand_name) AS brand,
      sport AS cat,
      ROUND(COUNTIF(max_disc > 0) / COUNT(*), 4) AS pct,
      COUNT(*) AS n
    FROM agg
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)
    return [{'brand': r['brand'], 'cat': r['cat'] or '',
             'pct': r['pct'], 'n': r['n']} for r in rows]


def query_ns_disc(client, monday: str, sunday: str) -> list:
    """RAW_DISC_NETSHOES: % SKUs discounted per brand × mapped_cat."""
    sql = f"""
    WITH agg AS (
      SELECT brand, department, sku,
        MAX(pct_discount) AS max_disc
      FROM `{NS_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND is_available = 1
      GROUP BY 1,2,3
    )
    SELECT
      brand,
      department AS cat,
      ROUND(COUNTIF(max_disc > 0) / COUNT(*), 4) AS pct,
      COUNT(*) AS n
    FROM agg
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)

    # Normalize brand + map dept, re-aggregate
    agg = defaultdict(lambda: {'disc': 0, 'total': 0})
    for r in rows:
        brand = norm_ns_brand(r['brand'] or '')
        cat   = map_ns_cat(r['cat'] or '')
        key   = (brand, cat)
        n     = r['n'] or 0
        agg[key]['disc']  += round((r['pct'] or 0) * n)
        agg[key]['total'] += n

    result = []
    for (brand, cat), v in sorted(agg.items()):
        if v['total'] == 0:
            continue
        result.append({
            'brand': brand, 'cat': cat,
            'pct': round(v['disc'] / v['total'], 4),
            'n': v['total'],
        })
    return result


def query_direct_avgdisc(client, monday: str, sunday: str) -> list:
    """RAW_AVGDISC_DIRECT: avg discount depth per brand × raw_cat."""
    sql = f"""
    WITH agg AS (
      SELECT brand_name, sport, grandparent_id,
        MAX(child_pct_discount) AS max_disc
      FROM `{DIRECT_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND child_is_available = 1
      GROUP BY 1,2,3
    )
    SELECT
      LOWER(brand_name) AS brand,
      sport AS cat,
      ROUND(AVG(IF(max_disc > 0, max_disc, NULL)), 4) AS avg_disc_promo,
      ROUND(AVG(max_disc), 4) AS avg_disc_all,
      COUNTIF(max_disc > 0) AS n_disc,
      COUNT(*) AS n
    FROM agg
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)
    return [{'brand': r['brand'], 'cat': r['cat'] or '',
             'avg_promo': r['avg_disc_promo'], 'avg_all': r['avg_disc_all'] or 0,
             'n_disc': r['n_disc'], 'n': r['n']} for r in rows]


def query_ns_avgdisc(client, monday: str, sunday: str) -> list:
    """RAW_AVGDISC_NETSHOES: avg disc depth, model level, RAW dept names."""
    sql = f"""
    WITH agg AS (
      SELECT brand, department, product_code,
        MAX(pct_discount) AS max_disc
      FROM `{NS_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND is_available = 1
      GROUP BY 1,2,3
    )
    SELECT
      brand,
      department AS cat,
      ROUND(AVG(IF(max_disc > 0, max_disc, NULL)), 4) AS avg_disc_promo,
      ROUND(AVG(max_disc), 4) AS avg_disc_all,
      COUNTIF(max_disc > 0) AS n_disc,
      COUNT(*) AS n
    FROM agg
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)
    return [{'brand': norm_ns_brand(r['brand'] or ''),
             'cat': r['cat'] or '',
             'avg_promo': r['avg_disc_promo'], 'avg_all': r['avg_disc_all'] or 0,
             'n_disc': r['n_disc'], 'n': r['n']} for r in rows]


def query_centauro_disc(client, monday: str, sunday: str) -> list:
    """RAW_DISC_CENTAURO: % EANs discounted, deduped by EAN."""
    sql = f"""
    WITH dedup AS (
      SELECT grandparent_brand AS brand, grandparent_category AS cat, child_ean,
        MAX(CAST(child_pct_discount AS FLOAT64)) AS max_disc
      FROM `{CTR_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND child_is_available = TRUE
        AND grandparent_brand IN {repr(CENTAURO_BRANDS)}
        AND grandparent_category IS NOT NULL
        AND grandparent_category != ''
      GROUP BY 1,2,3
    )
    SELECT brand, cat,
      ROUND(COUNTIF(max_disc > 0) / COUNT(*), 4) AS pct,
      COUNT(*) AS n
    FROM dedup
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)
    return [{'brand': r['brand'], 'cat': r['cat'],
             'pct': r['pct'], 'n': r['n']} for r in rows]


def query_centauro_avgdisc(client, monday: str, sunday: str) -> list:
    """RAW_AVGDISC_CENTAURO: avg disc depth, EAN deduped."""
    sql = f"""
    WITH dedup AS (
      SELECT grandparent_brand AS brand, grandparent_category AS cat, child_ean,
        MAX(CAST(child_pct_discount AS FLOAT64)) AS max_disc
      FROM `{CTR_TABLE}`
      WHERE date BETWEEN '{monday}' AND '{sunday}'
        AND child_is_available = TRUE
        AND grandparent_brand IN {repr(CENTAURO_BRANDS)}
        AND grandparent_category IS NOT NULL
        AND grandparent_category != ''
      GROUP BY 1,2,3
    )
    SELECT brand, cat,
      ROUND(AVG(IF(max_disc > 0, max_disc, NULL)), 4) AS avg_disc_promo,
      ROUND(AVG(max_disc), 4) AS avg_disc_all,
      COUNTIF(max_disc > 0) AS n_disc,
      COUNT(*) AS n
    FROM dedup
    GROUP BY 1,2
    ORDER BY 1,2
    """
    rows = bq_rows(client, sql)
    return [{'brand': r['brand'], 'cat': r['cat'],
             'avg_promo': r['avg_disc_promo'], 'avg_all': r['avg_disc_all'] or 0,
             'n_disc': r['n_disc'], 'n': r['n']} for r in rows]


def query_oly_disc(client, date_str: str, table: str = OLY_TABLE,
                   include_subcats: set = OLY_INCLUDE_SUBCAT) -> list:
    """RAW_DISC_OLYMPIKUS or RAW_DISC_MIZUNO: % models discounted, Sunday snapshot."""
    sql = f"""
    WITH base AS (
      SELECT
        COALESCE(subcategory_2_name, subcategory_name, '') AS cat,
        grandparent_id,
        MAX(child_pct_discount) AS max_disc
      FROM `{table}`
      WHERE date = '{date_str}'
        AND subcategory_name IN ({', '.join(f"'{s}'" for s in include_subcats)})
        AND child_is_available = 1
      GROUP BY 1,2
    )
    SELECT cat,
      ROUND(COUNTIF(max_disc > 0) / COUNT(*), 4) AS pct,
      COUNT(*) AS n
    FROM base
    GROUP BY 1
    ORDER BY 1
    """
    rows = bq_rows(client, sql)
    return [{'cat': r['cat'], 'pct': r['pct'], 'n': r['n']} for r in rows]


def query_oly_avgdisc(client, date_str: str, table: str = OLY_TABLE,
                      include_subcats: set = OLY_INCLUDE_SUBCAT) -> list:
    """RAW_AVGDISC_OLYMPIKUS or RAW_AVGDISC_MIZUNO: avg disc depth, Sunday snapshot."""
    sql = f"""
    WITH base AS (
      SELECT
        COALESCE(subcategory_2_name, subcategory_name, '') AS cat,
        grandparent_id,
        MAX(child_pct_discount) AS max_disc
      FROM `{table}`
      WHERE date = '{date_str}'
        AND subcategory_name IN ({', '.join(f"'{s}'" for s in include_subcats)})
        AND child_is_available = 1
      GROUP BY 1,2
    )
    SELECT cat,
      ROUND(AVG(IF(max_disc > 0, max_disc, NULL)), 4) AS avg_disc_promo,
      ROUND(AVG(max_disc), 4) AS avg_disc_all,
      COUNTIF(max_disc > 0) AS n_disc,
      COUNT(*) AS n
    FROM base
    GROUP BY 1
    ORDER BY 1
    """
    rows = bq_rows(client, sql)
    return [{'cat': r['cat'],
             'avg_promo': r['avg_disc_promo'], 'avg_all': r['avg_disc_all'] or 0,
             'n_disc': r['n_disc'], 'n': r['n']} for r in rows]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding='utf-8')

    # Determine target week
    if len(sys.argv) > 1:
        try:
            sunday = datetime.date.fromisoformat(sys.argv[1])
            print(f"[override] Using Sunday: {sunday}")
        except ValueError:
            print(f"Invalid date '{sys.argv[1]}'. Expected YYYY-MM-DD")
            sys.exit(1)
    else:
        sunday = last_closed_sunday()

    monday = week_monday(sunday)
    week_label  = sunday.strftime('%Y-%m-%d')
    monday_str  = monday.strftime('%Y-%m-%d')
    sunday_str  = week_label

    print(f"\n{'='*60}")
    print(f"Sports Retail Dashboard — Weekly Update")
    print(f"Week: {monday_str} (Mon) → {sunday_str} (Sun)")
    print(f"{'='*60}\n")

    # Validate docs/ directory
    for path in [PRICE_JS, DISC_JS]:
        if not os.path.exists(path):
            print(f"ERROR: {path} not found.")
            print("  Make sure the docs/ folder is set up (copy dashboard files there).")
            sys.exit(1)

    client = get_bq_client()
    print("✓ BQ client ready\n")

    # ══════════════════════════════════════════════════════════════════════════
    # calcados-price-data.js
    # ══════════════════════════════════════════════════════════════════════════
    print("── calcados-price-data.js ──────────────────────────────────────────")
    with open(PRICE_JS, 'r', encoding='utf-8-sig') as f:
        price_js = f.read()

    # ── RAW_DIRECT ───────────────────────────────────────────────────────────
    print("  Querying RAW_DIRECT (Direct brands price)...")
    direct_price = query_direct_price(client, monday_str, sunday_str)
    if direct_price:
        price_js = update_js_array(
            price_js, 'RAW_DIRECT', week_label, direct_price,
            lambda r: price_row(week_label, r['brand'], r['cat'],
                                r['p_sale'], r['p_list'], r['n'])
        )
        print(f"    ✓ {len(direct_price)} rows added")
    else:
        print("    ⚠ No data found — skipping RAW_DIRECT")

    # ── RAW_NETSHOES ─────────────────────────────────────────────────────────
    print("  Querying RAW_NETSHOES (Netshoes price)...")
    ns_price = query_ns_price(client, monday_str, sunday_str)
    if ns_price:
        price_js = update_js_array(
            price_js, 'RAW_NETSHOES', week_label, ns_price,
            lambda r: price_row(week_label, r['brand'], r['cat'],
                                r['p_sale'], r['p_list'], r['n'])
        )
        print(f"    ✓ {len(ns_price)} rows added")
    else:
        print("    ⚠ No data found — skipping RAW_NETSHOES")

    with open(PRICE_JS, 'w', encoding='utf-8') as f:
        f.write(price_js)
    print(f"  ✅ Saved {PRICE_JS}\n")

    # ══════════════════════════════════════════════════════════════════════════
    # calcados-disc-data.js
    # ══════════════════════════════════════════════════════════════════════════
    print("── calcados-disc-data.js ───────────────────────────────────────────")
    with open(DISC_JS, 'r', encoding='utf-8-sig') as f:
        disc_js = f.read()

    # ── RAW_DISC_DIRECT ───────────────────────────────────────────────────────
    print("  Querying RAW_DISC_DIRECT...")
    direct_disc = query_direct_disc(client, monday_str, sunday_str)
    if direct_disc:
        disc_js = update_js_array(
            disc_js, 'RAW_DISC_DIRECT', week_label, direct_disc,
            lambda r: disc_row_brand(week_label, r['brand'], r['cat'], r['pct'], r['n'])
        )
        print(f"    ✓ {len(direct_disc)} rows  (replaces any contaminated W{week_label} rows)")
    else:
        print("    ⚠ No data — skipping RAW_DISC_DIRECT")

    # ── RAW_DISC_NETSHOES ─────────────────────────────────────────────────────
    print("  Querying RAW_DISC_NETSHOES...")
    ns_disc = query_ns_disc(client, monday_str, sunday_str)
    if ns_disc:
        disc_js = update_js_array(
            disc_js, 'RAW_DISC_NETSHOES', week_label, ns_disc,
            lambda r: disc_row_brand(week_label, r['brand'], r['cat'], r['pct'], r['n'])
        )
        print(f"    ✓ {len(ns_disc)} rows")
    else:
        print("    ⚠ No data — skipping RAW_DISC_NETSHOES")

    # ── RAW_AVGDISC_DIRECT ────────────────────────────────────────────────────
    print("  Querying RAW_AVGDISC_DIRECT...")
    direct_avgdisc = query_direct_avgdisc(client, monday_str, sunday_str)
    if direct_avgdisc:
        disc_js = update_js_array(
            disc_js, 'RAW_AVGDISC_DIRECT', week_label, direct_avgdisc,
            lambda r: avgdisc_row_brand(week_label, r['brand'], r['cat'],
                                        r['avg_promo'], r['avg_all'],
                                        r['n_disc'], r['n'])
        )
        print(f"    ✓ {len(direct_avgdisc)} rows")
    else:
        print("    ⚠ No data — skipping RAW_AVGDISC_DIRECT")

    # ── RAW_AVGDISC_NETSHOES ──────────────────────────────────────────────────
    print("  Querying RAW_AVGDISC_NETSHOES...")
    ns_avgdisc = query_ns_avgdisc(client, monday_str, sunday_str)
    if ns_avgdisc:
        disc_js = update_js_array(
            disc_js, 'RAW_AVGDISC_NETSHOES', week_label, ns_avgdisc,
            lambda r: avgdisc_row_brand(week_label, r['brand'], r['cat'],
                                        r['avg_promo'], r['avg_all'],
                                        r['n_disc'], r['n'])
        )
        print(f"    ✓ {len(ns_avgdisc)} rows")
    else:
        print("    ⚠ No data — skipping RAW_AVGDISC_NETSHOES")

    # ── Centauro (weekly range, EAN dedup) ────────────────────────────────────
    print("  Querying RAW_DISC_CENTAURO + RAW_AVGDISC_CENTAURO...")
    ctr_disc = query_centauro_disc(client, monday_str, sunday_str)
    if ctr_disc:
        disc_js = update_js_array(
            disc_js, 'RAW_DISC_CENTAURO', week_label, ctr_disc,
            lambda r: disc_row_brand(week_label, r['brand'], r['cat'], r['pct'], r['n'])
        )
        print(f"    ✓ RAW_DISC_CENTAURO: {len(ctr_disc)} rows")
    else:
        print("    ⚠ No Centauro disc data — skipping")

    ctr_avg = query_centauro_avgdisc(client, monday_str, sunday_str)
    if ctr_avg:
        disc_js = update_js_array(
            disc_js, 'RAW_AVGDISC_CENTAURO', week_label, ctr_avg,
            lambda r: avgdisc_row_brand(week_label, r['brand'], r['cat'],
                                        r['avg_promo'], r['avg_all'],
                                        r['n_disc'], r['n'])
        )
        print(f"    ✓ RAW_AVGDISC_CENTAURO: {len(ctr_avg)} rows")
    else:
        print("    ⚠ No Centauro avgdisc data — skipping")

    # ── Olympikus (Sunday snapshot) ───────────────────────────────────────────
    # Try Sunday; if missing fall back to latest available day in week
    oly_date = bq_latest_date_in_week(client, OLY_TABLE, monday_str, sunday_str)
    if oly_date:
        print(f"  Querying RAW_DISC_OLYMPIKUS + RAW_AVGDISC_OLYMPIKUS (date={oly_date})...")
        oly_disc = query_oly_disc(client, oly_date, OLY_TABLE, OLY_INCLUDE_SUBCAT)
        if oly_disc:
            disc_js = update_js_array(
                disc_js, 'RAW_DISC_OLYMPIKUS', week_label, oly_disc,
                lambda r: disc_row_no_brand(week_label, r['cat'], r['pct'], r['n'])
            )
            print(f"    ✓ RAW_DISC_OLYMPIKUS: {len(oly_disc)} rows")
        oly_avg = query_oly_avgdisc(client, oly_date, OLY_TABLE, OLY_INCLUDE_SUBCAT)
        if oly_avg:
            disc_js = update_js_array(
                disc_js, 'RAW_AVGDISC_OLYMPIKUS', week_label, oly_avg,
                lambda r: avgdisc_row_no_brand(week_label, r['cat'],
                                               r['avg_promo'], r['avg_all'],
                                               r['n_disc'], r['n'])
            )
            print(f"    ✓ RAW_AVGDISC_OLYMPIKUS: {len(oly_avg)} rows")
    else:
        print("    ⚠ No Olympikus data in week — skipping")

    # ── Mizuno (Sunday snapshot) ──────────────────────────────────────────────
    miz_date = bq_latest_date_in_week(client, MIZ_TABLE, monday_str, sunday_str)
    if miz_date:
        print(f"  Querying RAW_DISC_MIZUNO + RAW_AVGDISC_MIZUNO (date={miz_date})...")
        miz_disc = query_oly_disc(client, miz_date, MIZ_TABLE, MIZ_INCLUDE_SUBCAT)
        if miz_disc:
            disc_js = update_js_array(
                disc_js, 'RAW_DISC_MIZUNO', week_label, miz_disc,
                lambda r: disc_row_no_brand(week_label, r['cat'], r['pct'], r['n'])
            )
            print(f"    ✓ RAW_DISC_MIZUNO: {len(miz_disc)} rows")
        miz_avg = query_oly_avgdisc(client, miz_date, MIZ_TABLE, MIZ_INCLUDE_SUBCAT)
        if miz_avg:
            disc_js = update_js_array(
                disc_js, 'RAW_AVGDISC_MIZUNO', week_label, miz_avg,
                lambda r: avgdisc_row_no_brand(week_label, r['cat'],
                                               r['avg_promo'], r['avg_all'],
                                               r['n_disc'], r['n'])
            )
            print(f"    ✓ RAW_AVGDISC_MIZUNO: {len(miz_avg)} rows")
    else:
        print("    ⚠ No Mizuno data in week — skipping")

    with open(DISC_JS, 'w', encoding='utf-8') as f:
        f.write(disc_js)
    print(f"  ✅ Saved {DISC_JS}\n")

    print("✅ Dashboard update complete.")
    print(f"   Week {week_label} data added to docs/ JS files.")
    print("   Commit + push handled by GitHub Actions workflow.\n")


if __name__ == '__main__':
    main()
