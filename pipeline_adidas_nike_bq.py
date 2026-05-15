"""
Pipeline diário: Adidas + Nike (nike.com.br) + Under Armour -> BigQuery
Replica metodologia olympikus_trusted.product_snapshot
Tabela: aster-data-platform.constellation_vibe_coding.usr_andre_adidas_nike_product_snapshot_2026_05_15
Particionada por date, append diário.
"""
import sys
import json
import os
import re
import time
from datetime import date
from curl_cffi import requests as cf_requests
from google.cloud import bigquery

sys.stdout.reconfigure(encoding='utf-8')

TODAY = date.today()
TODAY_STR = str(TODAY)
BQ_TABLE = "aster-data-platform.constellation_vibe_coding.usr_andre_adidas_nike_product_snapshot_2026_05_15"

HEADERS_ADIDAS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.adidas.com.br/calcados",
}
HEADERS_NIKE = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nike.com.br/",
}
HEADERS_UA = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.underarmour.com.br/",
}

session = cf_requests.Session()

# ── Adidas: todos os esportes ─────────────────────────────────────────────────

ADIDAS_SPORTS = [
    "running", "lifestyle", "basquete", "caminhada", "training",
    "skateboarding", "tennis", "motorsport", "trilha", "handebol",
    "volei", "trail_running", "futebol", "padel",
]

def parse_discount(s):
    try:
        return float(s.replace("%", "").strip()) / 100
    except:
        return 0.0

def scrape_adidas():
    print("\n[ADIDAS] Coletando todos os esportes...")
    rows = []
    seen = set()

    for sport in ADIDAS_SPORTS:
        start = 0
        total = None
        sport_count = 0

        while True:
            url = f"https://www.adidas.com.br/api/search/tf/taxonomy?query=tenis&sport_pt_br={sport}&start={start}"
            try:
                r = session.get(url, headers=HEADERS_ADIDAS, impersonate="chrome124", timeout=20)
                if r.status_code != 200:
                    break
                il = r.json().get('itemList', {})
                items = il.get('items', [])
                if total is None:
                    total = il.get('count', 0)
                if not items:
                    break

                for item in items:
                    pid = item.get("productId")
                    if pid in seen:
                        continue
                    seen.add(pid)
                    lp = item.get("price")
                    sp = item.get("salePrice")
                    rows.append({
                        "date": TODAY_STR,
                        "source": "adidas_direct",
                        "brand_name": "Adidas",
                        "sport": (item.get("sport") or "").title() or None,
                        "division": item.get("division"),
                        "grandparent_id": item.get("modelId"),
                        "parent_id": pid,
                        "parent_name": item.get("displayName"),
                        "parent_url": f"https://www.adidas.com.br{item.get('link', '')}",
                        "child_list_price": lp,
                        "child_sale_price": sp,
                        "child_pct_discount": parse_discount(item.get("salePercentage", "0%")),
                        "child_is_available": 1 if item.get("orderable") else 0,
                        "rating": item.get("rating"),
                        "rating_count": item.get("ratingCount"),
                    })
                    sport_count += 1

                start += 48
                if start >= total:
                    break
                time.sleep(0.3)

            except Exception as e:
                print(f"  ERRO Adidas {sport} start={start}: {e}")
                break

        if total and total > 0:
            print(f"  {sport:20s} | {sport_count:4d} novos SKUs")
        time.sleep(0.3)

    print(f"  Total Adidas: {len(rows)} SKUs unicos")
    return rows

# ── Nike: direct scrape nike.com.br via _next/data (mobile Safari TLS) ───────

NIKE_CORRIDA_URL = "https://www.nike.com.br/nav/esportes/corrida/genero/masculino/tipodeproduto/calcados"
NIKE_NAV_PATH = "nav/tipodeproduto/calcados"

def get_nike_build_id():
    """Fetches buildId from a reliably accessible Nike page."""
    r = session.get(NIKE_CORRIDA_URL, headers=HEADERS_NIKE, impersonate="safari17_0", timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Falha ao obter buildId: HTTP {r.status_code}")
    nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.DOTALL)
    if not nd:
        raise RuntimeError("__NEXT_DATA__ não encontrado na página de corrida")
    data = json.loads(nd.group(1))
    build_id = data.get("buildId")
    if not build_id:
        raise RuntimeError("buildId não encontrado")
    return build_id

def fetch_nike_page(build_id, page_num):
    base = f"https://www.nike.com.br/_next/data/{build_id}/{NIKE_NAV_PATH}.json"
    params = "scoringProfile=scoreByRanking"
    if page_num > 1:
        params = f"page={page_num}&{params}"
    url = f"{base}?{params}"
    h_json = {**HEADERS_NIKE, "Accept": "application/json", "x-nextjs-data": "1"}
    r = session.get(url, headers=h_json, impersonate="safari17_0", timeout=30)
    if r.status_code != 200:
        return None, None
    try:
        body = r.json()
    except Exception:
        return None, None
    page_data = body.get("pageProps", {}).get("data", {})
    return page_data.get("products", []), page_data.get("pagination", {})

def scrape_nike_direct():
    print("\n[NIKE DIRECT] Coletando nike.com.br (todos os calcados)...")
    rows = []
    seen = set()

    build_id = get_nike_build_id()
    print(f"  buildId: {build_id}")

    products_p1, pagination = fetch_nike_page(build_id, 1)
    if products_p1 is None:
        print("  ERRO: página 1 falhou")
        return rows

    last_url = pagination.get("last", "")
    last_page_m = re.search(r'page=(\d+)', last_url)
    total_pages = int(last_page_m.group(1)) if last_page_m else 1

    def process_products(products):
        for item in products:
            sku = item.get("id")
            if not sku or sku in seen:
                continue
            seen.add(sku)
            details = item.get("details", {})
            price = item.get("price")
            old_price = item.get("oldPrice")
            list_price = old_price if old_price else price
            sale_price = price
            disc = round((list_price - sale_price) / list_price, 4) if list_price and list_price > sale_price else 0.0
            try:
                rating = float(details.get("rate") or 0)
            except Exception:
                rating = None
            rows.append({
                "date": TODAY_STR,
                "source": "nike_direct",
                "brand_name": "Nike",
                "sport": details.get("modality"),
                "division": details.get("group"),
                "grandparent_id": details.get("originalId"),
                "parent_id": sku,
                "parent_name": item.get("name"),
                "parent_url": f"https://www.nike.com.br{item.get('url', '')}",
                "child_list_price": list_price,
                "child_sale_price": sale_price,
                "child_pct_discount": disc,
                "child_is_available": 1 if item.get("status") == "available" else 0,
                "rating": rating if rating and rating > 0 else None,
                "rating_count": int(details.get("reviews") or 0) or None,
            })

    process_products(products_p1)
    print(f"  Página 1/{total_pages} — {len(seen)} SKUs até agora")

    for page_num in range(2, total_pages + 1):
        time.sleep(1.0)
        products, _ = fetch_nike_page(build_id, page_num)
        if products is None:
            print(f"  ERRO na página {page_num}, parando")
            break
        process_products(products)
        if page_num % 10 == 0:
            print(f"  Página {page_num}/{total_pages} — {len(seen)} SKUs até agora")

    print(f"  Total Nike: {len(rows)} SKUs únicos")
    return rows

# ── Under Armour: VTEX Intelligent Search ────────────────────────────────────

UA_SEARCH_URL = "https://www.underarmour.com.br/api/io/_v/api/intelligent-search/product_search"

def extract_ua_sport(categories):
    if not categories:
        return None
    longest = max(categories, key=len)
    parts = [p for p in longest.strip("/").split("/") if p]
    return parts[2] if len(parts) >= 3 else (parts[-1] if parts else None)

def scrape_ua_direct():
    print("\n[UNDER ARMOUR] Coletando underarmour.com.br (calcados)...")
    rows = []
    seen = set()

    r0 = session.get(f"{UA_SEARCH_URL}?facets=categoria%2Fcalcados&count=1",
                     headers=HEADERS_UA, impersonate="safari17_0", timeout=20)
    total = r0.json().get("recordsFiltered", 0)
    total_pages = -(-total // 48)
    print(f"  Total: {total} produtos | {total_pages} páginas")

    for page_num in range(1, total_pages + 1):
        url = f"{UA_SEARCH_URL}?facets=categoria%2Fcalcados&count=48&page={page_num}"
        try:
            r = session.get(url, headers=HEADERS_UA, impersonate="safari17_0", timeout=20)
            if r.status_code != 200:
                print(f"  ERRO página {page_num}: HTTP {r.status_code}")
                break
            products = r.json().get("products", [])
        except Exception as e:
            print(f"  ERRO página {page_num}: {e}")
            break

        for item in products:
            pid = item.get("productId")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            pr = item.get("priceRange", {})
            list_p = (pr.get("listPrice") or {}).get("lowPrice")
            sale_p = (pr.get("sellingPrice") or {}).get("lowPrice")
            if not sale_p:
                continue
            list_p = list_p or sale_p
            disc = round((list_p - sale_p) / list_p, 4) if list_p > sale_p else 0.0
            rows.append({
                "date": TODAY_STR,
                "source": "ua_direct",
                "brand_name": "Under Armour",
                "sport": extract_ua_sport(item.get("categories")),
                "division": "Calçados",
                "grandparent_id": pid,
                "parent_id": item.get("productReference"),
                "parent_name": item.get("productName"),
                "parent_url": f"https://www.underarmour.com.br{item.get('link', '')}",
                "child_list_price": list_p,
                "child_sale_price": sale_p,
                "child_pct_discount": disc,
                "child_is_available": 1 if sale_p and sale_p > 0 else 0,
                "rating": None,
                "rating_count": None,
            })

        if page_num % 10 == 0:
            print(f"  Página {page_num}/{total_pages} — {len(seen)} SKUs até agora")
        time.sleep(0.3)

    print(f"  Total Under Armour: {len(rows)} SKUs únicos")
    return rows

# ── BigQuery: verifica se data ja existe e faz append ─────────────────────────

def get_bq_client():
    """
    Tenta google.auth.default() primeiro (funciona no GitHub Actions via
    GOOGLE_APPLICATION_CREDENTIALS, e localmente se ADC configurado).
    Fallback para gcloud subprocess no Windows local.
    """
    try:
        import google.auth
        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        return bigquery.Client(project="aster-data-platform", credentials=creds)
    except Exception:
        pass

    # Fallback: Windows local com gcloud via cmd
    import subprocess
    result = subprocess.run(
        ["cmd", "/c", "gcloud auth print-access-token"],
        capture_output=True, text=True
    )
    token = result.stdout.strip()
    if not token:
        raise RuntimeError(f"Falha ao obter token gcloud: {result.stderr}")
    from google.oauth2.credentials import Credentials
    return bigquery.Client(project="aster-data-platform", credentials=Credentials(token=token))


def load_to_bq(rows):
    if not rows:
        print("\n[BQ] Nenhum dado para carregar.")
        return

    client = get_bq_client()

    # Verifica se partição de hoje já existe
    check_q = f"""
        SELECT COUNT(*) as cnt
        FROM `{BQ_TABLE}`
        WHERE date = '{TODAY_STR}'
    """
    result = list(client.query(check_q).result())
    existing = result[0].cnt if result else 0

    if existing > 0:
        print(f"\n[BQ] Particao {TODAY_STR} ja existe com {existing} linhas — deletando para recarregar...")
        del_q = f"DELETE FROM `{BQ_TABLE}` WHERE date = '{TODAY_STR}'"
        client.query(del_q).result()

    # Converte para tipos serializáveis
    for r in rows:
        r["date"] = TODAY_STR
        r["rating_count"] = int(r["rating_count"]) if r["rating_count"] is not None else None

    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND",
        schema=[
            bigquery.SchemaField("date", "DATE"),
            bigquery.SchemaField("source", "STRING"),
            bigquery.SchemaField("brand_name", "STRING"),
            bigquery.SchemaField("sport", "STRING"),
            bigquery.SchemaField("division", "STRING"),
            bigquery.SchemaField("grandparent_id", "STRING"),
            bigquery.SchemaField("parent_id", "STRING"),
            bigquery.SchemaField("parent_name", "STRING"),
            bigquery.SchemaField("parent_url", "STRING"),
            bigquery.SchemaField("child_list_price", "FLOAT64"),
            bigquery.SchemaField("child_sale_price", "FLOAT64"),
            bigquery.SchemaField("child_pct_discount", "FLOAT64"),
            bigquery.SchemaField("child_is_available", "INT64"),
            bigquery.SchemaField("rating", "FLOAT64"),
            bigquery.SchemaField("rating_count", "INT64"),
        ],
    )

    job = client.load_table_from_json(rows, BQ_TABLE, job_config=job_config)
    job.result()
    print(f"\n[BQ] {len(rows)} linhas carregadas na particao {TODAY_STR}")
    print(f"     Tabela: {BQ_TABLE}")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print(f"PIPELINE ADIDAS + NIKE + UNDER ARMOUR -> BIGQUERY ({TODAY_STR})")
    print("=" * 60)

    adidas_rows = scrape_adidas()
    nike_rows = scrape_nike_direct()
    ua_rows = scrape_ua_direct()
    all_rows = adidas_rows + nike_rows + ua_rows

    print(f"\nTotal: {len(all_rows)} linhas ({len(adidas_rows)} Adidas + {len(nike_rows)} Nike + {len(ua_rows)} Under Armour)")

    load_to_bq(all_rows)

    print("\nPIPELINE CONCLUIDO.")
