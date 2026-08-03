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
import subprocess
import time
from datetime import date
from curl_cffi import requests as cf_requests
from google.cloud import bigquery

sys.stdout.reconfigure(encoding='utf-8')

TODAY = date.today()
TODAY_STR = str(TODAY)
BQ_TABLE = "aster-data-platform.constellation_vibe_coding.usr_andre_adidas_nike_product_snapshot_2026_05_15"
NS_TABLE = "aster-data-platform.constellation_vibe_coding.usr_andre_netshoes_product_snapshot_2026_05_15"

HEADERS_ADIDAS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.adidas.com.br/calcados",
}
# NOTE (2026-07-27): a Nike apertou o Akamai em ~2026-07-24 e passou a NEGAR
# (edge-deny "Access Denied") requests cujo fingerprint de header não bate com
# um Chrome real. O UA de iPhone Safari + impersonate="chrome124" (TLS de Chrome)
# virou mismatch e tomava 403 → coleta parava em silêncio. Solução: fingerprint
# de Chrome desktop consistente (UA Chrome + sec-ch-ua + sec-fetch + impersonate
# chrome124). Ver [[netshoes-akamai-scrape-fix]] para o caso análogo.
HEADERS_NIKE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
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

# Optional proxy for anti-bot-protected sites (Netshoes uses Akamai Bot Manager).
# Set NETSHOES_PROXY to a residential / web-unlocker endpoint, e.g.
#   NETSHOES_PROXY="http://user:pass@host:port"
# When unset, requests go direct (will hit the Akamai challenge from datacenter IPs).
NS_PROXY = os.environ.get("NETSHOES_PROXY", "").strip()
NS_PROXIES = {"http": NS_PROXY, "https": NS_PROXY} if NS_PROXY else None

# Nike: em ~2026-07-24 o Akamai passou a NEGAR (edge-deny "Access Denied") as
# rotas de produto (/_next/data) vindas de IP de DATACENTER. Comprovado em
# 2026-07-28 pela sonda nike_probe.py rodando no runner: 403 em TODAS as
# variações (6 impersonations, com/sem warm-up, referers). Do IP datacenter
# NÃO há truque de header que passe. A coleta só funciona saindo por um IP
# residencial → configure NIKE_PROXY (residential proxy / web-unlocker), mesmo
# formato do NETSHOES_PROXY: "http://user:pass@host:port". Sem ele, a coleta
# da Nike vem vazia no runner (avisa alto no fim). Ver [[netshoes-akamai-scrape-fix]].
NIKE_PROXY = os.environ.get("NIKE_PROXY", "").strip()
NIKE_PROXIES = {"http": NIKE_PROXY, "https": NIKE_PROXY} if NIKE_PROXY else None

# O IP de saída do WARP grátis é sorteado a cada conexão e o Akamai da Nike
# aceita alguns e nega outros — desde 2026-07-28 a coleta passava só ~3 de 7 dias
# ("ERRO página 1: bloqueio Akamai" com o proxy de pé). NIKE_PROXY_RESET_CMD é o
# comando que troca esse IP (no workflow: warp_rotate.sh); quando a Nike é negada,
# o scraper roda esse comando e tenta de novo, até NIKE_MAX_EGRESS_TRIES vezes.
NIKE_RESET_CMD = os.environ.get("NIKE_PROXY_RESET_CMD", "").strip()
NIKE_MAX_EGRESS_TRIES = int(os.environ.get("NIKE_MAX_EGRESS_TRIES", "6"))

# Motor de coleta da Nike. Desde 2026-08-02 a Nike exige o sensor do Akamai Bot
# Manager: requisição "crua" (curl_cffi) toma 403 em QUALQUER IP (testado até no
# IP residencial), e abrir a listagem direto por URL devolve um stub de 2,4 KB
# mesmo num browser. O que funciona (provado na run 30825731327): abrir a HOME
# num browser anti-detect (camoufox), que passa e valida os cookies do Akamai, e
# então buscar as páginas da listagem por fetch same-origin DENTRO da página —
# 200 com 30 produtos por página. Ver [[nike-akamai-datacenter-block]].
#   NIKE_ENGINE=camoufox (default) | curl (motor antigo, hoje sempre 403)
NIKE_ENGINE = os.environ.get("NIKE_ENGINE", "camoufox").strip().lower()

# ── Adidas: todos os esportes ─────────────────────────────────────────────────

ADIDAS_SPORTS = [
    "running", "lifestyle", "basquete", "caminhada", "training",
    "skateboarding", "tennis", "motorsport", "trilha", "handebol",
    "volei", "trail_running", "futebol", "padel",
]

def get_json_retry(url, headers, impersonate, label, tries=4, timeout=20):
    """GET com retry+backoff que devolve o JSON, ou None se esgotar as tentativas.

    Adidas/UA/Asics faziam `break` no primeiro status != 200, sem retry: um 429/400
    isolado truncava a marca no dia (em 2026-08-03 a Adidas veio 759 em vez de
    3.252 porque o site foi raspado duas vezes em 2h e devolveu erro no meio).
    """
    last = None
    for attempt in range(tries):
        try:
            r = session.get(url, headers=headers, impersonate=impersonate, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            last = f"HTTP {r.status_code}"
        except Exception as e:
            last = f"{type(e).__name__}: {str(e)[:80]}"
        if attempt < tries - 1:
            time.sleep(2.0 * (attempt + 1))
    print(f"  ERRO {label}: {last} (após {tries} tentativas)")
    return None

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
                body = get_json_retry(url, HEADERS_ADIDAS, "chrome124",
                                      f"Adidas {sport} start={start}")
                if body is None:
                    break
                il = body.get('itemList', {})
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

NIKE_BUILDID_URL = "https://www.nike.com.br/api/products"  # 404 page with __NEXT_DATA__ (bypasses Akamai)
NIKE_NAV_PATH = "nav/tipodeproduto/calcados"

def get_nike_build_id():
    """Fetches buildId from Nike 404 page (not blocked by Akamai unlike nav pages)."""
    r = session.get(NIKE_BUILDID_URL, headers=HEADERS_NIKE, impersonate="chrome124",
                    proxies=NIKE_PROXIES, timeout=30)
    nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.DOTALL)
    if not nd:
        raise RuntimeError("__NEXT_DATA__ não encontrado — Nike mudou estrutura novamente")
    data = json.loads(nd.group(1))
    build_id = data.get("buildId")
    if not build_id:
        raise RuntimeError("buildId não encontrado")
    return build_id

def rotate_nike_egress():
    """Troca o IP de saída do proxy da Nike rodando NIKE_PROXY_RESET_CMD.

    Retorna True quando o proxy voltou de pé com (presumivelmente) outro IP.
    """
    if not NIKE_RESET_CMD:
        return False
    print("  Nike negada — rotacionando IP de saída do proxy...")
    try:
        p = subprocess.run(NIKE_RESET_CMD, shell=True, capture_output=True,
                           text=True, timeout=240)
    except Exception as e:
        print(f"  AVISO: rotação do proxy falhou: {e}")
        return False
    for line in (p.stdout or "").strip().splitlines():
        print(line)
    if p.returncode != 0:
        err = (p.stderr or "").strip().replace("\n", " ")[:300]
        print(f"  AVISO: rotação retornou {p.returncode}: {err}")
        return False
    # Os cookies do Akamai (bm_*, _abck) foram emitidos para o IP antigo; manter
    # os cookies velhos com IP novo é justamente um sinal de bot. Descarta.
    try:
        session.cookies.clear()
    except Exception:
        pass
    return True

def nike_warm_up():
    """Aquece os cookies do Akamai (bm_*, _abck) com um GET na home."""
    try:
        session.get("https://www.nike.com.br/", headers=HEADERS_NIKE,
                    impersonate="chrome124", proxies=NIKE_PROXIES, timeout=30)
        time.sleep(1.0)
    except Exception as e:
        print(f"  AVISO: warm-up da home falhou: {e}")

def fetch_nike_page(build_id, page_num):
    base = f"https://www.nike.com.br/_next/data/{build_id}/{NIKE_NAV_PATH}.json"
    params = "scoringProfile=scoreByRanking"
    if page_num > 1:
        params = f"page={page_num}&{params}"
    url = f"{base}?{params}"
    h_json = {
        **HEADERS_NIKE,
        "Accept": "application/json",
        "x-nextjs-data": "1",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "Referer": f"https://www.nike.com.br/{NIKE_NAV_PATH}",
    }
    # Retry com backoff: o Akamai da Nike derruba conexões (curl 7 / reset) quando
    # as páginas vêm muito rápido. Sem isso, um único reset aborta a coleta inteira.
    last_err = None
    for attempt in range(4):
        try:
            r = session.get(url, headers=h_json, impersonate="chrome124",
                             proxies=NIKE_PROXIES, timeout=30)
        except Exception as e:
            last_err = f"conexão: {e}"
            time.sleep(2.0 * (attempt + 1))
            continue
        if r.status_code == 200:
            try:
                body = r.json()
            except Exception:
                return None, None
            page_data = body.get("pageProps", {}).get("data", {})
            return page_data.get("products", []), page_data.get("pagination", {})
        blocked = ("Access Denied" in r.text) or (r.status_code == 403)
        last_err = "bloqueio Akamai (Access Denied)" if blocked else f"HTTP {r.status_code}"
        time.sleep(2.0 * (attempt + 1))
    print(f"  ERRO página {page_num}: {last_err} (após retries)")
    return None, None

def nike_row(item):
    """Converte um produto do JSON da Nike (pageProps.data.products) em linha do BQ.

    Usado pelos dois motores (camoufox e curl) — o shape do JSON é o mesmo.
    Retorna (sku, row); sku None quando o item não tem id.
    """
    sku = item.get("id")
    if not sku:
        return None, None
    details = item.get("details", {}) or {}
    price = item.get("price")
    old_price = item.get("oldPrice")
    list_price = old_price if old_price else price
    sale_price = price
    disc = (round((list_price - sale_price) / list_price, 4)
            if list_price and sale_price is not None and list_price > sale_price else 0.0)
    try:
        rating = float(details.get("rate") or 0)
    except Exception:
        rating = None
    return sku, {
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
    }

# ── Nike via camoufox: home valida o sensor, fetch same-origin traz as páginas ──

NIKE_JS_BUILD_ID = """() => {
  const nd = document.getElementById('__NEXT_DATA__');
  if (!nd) return null;
  try { return JSON.parse(nd.textContent).buildId; } catch (e) { return null; }
}"""

# Roda DENTRO da página da Nike: mesma origem, mesmos cookies do Akamai que a
# home acabou de validar. É isso que faz a listagem responder 200 (a mesma URL
# pedida de fora, por curl, toma 403).
NIKE_JS_FETCH_PAGE = """async ({buildId, nav, page}) => {
  const qs = page > 1
    ? `page=${page}&scoringProfile=scoreByRanking`
    : 'scoringProfile=scoreByRanking';
  const r = await fetch(`/_next/data/${buildId}/${nav}.json?${qs}`,
                        {headers: {'x-nextjs-data': '1'}, credentials: 'include'});
  if (r.status !== 200) return {status: r.status, products: null, last: null};
  let body;
  try { body = await r.json(); } catch (e) { return {status: 0, products: null, last: null}; }
  const data = (body && body.pageProps && body.pageProps.data) || {};
  return {
    status: 200,
    products: data.products || [],
    last: (data.pagination && data.pagination.last) || null,
  };
}"""


def scrape_nike_camoufox():
    """Coleta a Nike com camoufox (browser anti-detect) + fetch same-origin."""
    print("\n[NIKE DIRECT] Coletando nike.com.br via camoufox (sensor Akamai)...")
    rows, seen = [], set()
    try:
        from camoufox.sync_api import Camoufox
    except Exception as e:
        print(f"  ERRO: camoufox indisponível ({e}). "
              f"Instale 'camoufox[geoip]' + 'python -m camoufox fetch' ou use "
              f"NIKE_ENGINE=curl.")
        return rows

    kw = {"headless": "virtual", "locale": "pt-BR", "os": "windows", "humanize": True}
    if NIKE_PROXY:
        # O hook segue disponível caso a Nike volte a bloquear por IP.
        kw["proxy"] = {"server": NIKE_PROXY}
        print(f"  Usando proxy NIKE_PROXY ({NIKE_PROXY.split('@')[-1]})")

    def fetch_page(page, page_num):
        try:
            res = page.evaluate(NIKE_JS_FETCH_PAGE,
                                {"buildId": page._nike_build_id,
                                 "nav": NIKE_NAV_PATH, "page": page_num})
        except Exception as e:
            print(f"  ERRO página {page_num}: {type(e).__name__}: {str(e)[:120]}")
            return None, None
        if res.get("products") is None:
            print(f"  ERRO página {page_num}: HTTP {res.get('status')}")
            return None, None
        return res["products"], res.get("last")

    try:
        with Camoufox(**kw) as browser:
            page = browser.new_page()
            page.goto("https://www.nike.com.br/", wait_until="networkidle", timeout=90000)
            page.wait_for_timeout(6000)
            build_id = page.evaluate(NIKE_JS_BUILD_ID)
            if not build_id:
                print("  ERRO: home não renderizou (sem buildId) — Nike vazia hoje.")
                return rows
            page._nike_build_id = build_id
            print(f"  buildId: {build_id}")

            products, last = fetch_page(page, 1)
            if products is None:
                print("  ERRO: página 1 falhou — Nike vazia hoje.")
                return rows
            m = re.search(r'page=(\d+)', last or "")
            total_pages = int(m.group(1)) if m else 1

            def process(items):
                for item in items:
                    sku, row = nike_row(item)
                    if not sku or sku in seen:
                        continue
                    seen.add(sku)
                    rows.append(row)

            process(products)
            print(f"  Página 1/{total_pages} — {len(seen)} SKUs até agora")

            # Tolera falha isolada de página; se muitas seguidas falharem, recarrega
            # a home (revalida o sensor) e retoma na mesma página em vez de abortar.
            consec_fail, failed_pages, reloads_left = 0, [], 2
            MAX_CONSEC_FAIL = 5
            page_num = 2
            while page_num <= total_pages:
                page.wait_for_timeout(700)
                products, _ = fetch_page(page, page_num)
                if products is None:
                    consec_fail += 1
                    if consec_fail >= MAX_CONSEC_FAIL and reloads_left > 0:
                        print(f"  {consec_fail} páginas seguidas falharam — recarregando "
                              f"a home p/ revalidar o sensor e retomando na {page_num}.")
                        reloads_left -= 1
                        try:
                            page.goto("https://www.nike.com.br/",
                                      wait_until="networkidle", timeout=90000)
                            page.wait_for_timeout(5000)
                            consec_fail = 0
                            continue
                        except Exception as e:
                            print(f"  AVISO: reload da home falhou: {str(e)[:100]}")
                    if consec_fail >= MAX_CONSEC_FAIL:
                        print(f"  ABORTANDO: {consec_fail} páginas seguidas falharam. "
                              f"Coletado até aqui: {len(seen)} SKUs.")
                        break
                    failed_pages.append(page_num)
                    page_num += 1
                    continue
                consec_fail = 0
                process(products)
                if page_num % 10 == 0:
                    print(f"  Página {page_num}/{total_pages} — {len(seen)} SKUs até agora")
                page_num += 1

            if failed_pages:
                print(f"  AVISO: {len(failed_pages)} página(s) puladas: {failed_pages}")
    except Exception as e:
        print(f"  ERRO no camoufox: {type(e).__name__}: {str(e)[:200]}")

    print(f"  Total Nike: {len(rows)} SKUs únicos")
    return rows


def scrape_nike_direct():
    """Despacha o motor da Nike (camoufox por default; curl é o legado)."""
    if NIKE_ENGINE == "camoufox":
        return scrape_nike_camoufox()
    return scrape_nike_curl()


def scrape_nike_curl():
    print("\n[NIKE DIRECT] Coletando nike.com.br (motor curl legado)...")
    rows = []
    seen = set()

    if NIKE_PROXIES:
        print(f"  Usando proxy NIKE_PROXY ({NIKE_PROXY.split('@')[-1]})")

    # O IP de saída do WARP é sorteado: uns passam no Akamai, outros tomam
    # "Access Denied" na página 1. Tenta, e a cada negativa sorteia outro IP
    # (NIKE_PROXY_RESET_CMD) em vez de desistir do dia inteiro.
    max_tries = NIKE_MAX_EGRESS_TRIES if NIKE_RESET_CMD else 1
    build_id = products_p1 = pagination = None
    for attempt in range(1, max_tries + 1):
        if attempt > 1:
            print(f"  Tentativa {attempt}/{max_tries} com novo IP de saída...")
        nike_warm_up()
        try:
            build_id = get_nike_build_id()
        except Exception as e:
            print(f"  ERRO: buildId falhou: {e}")
            build_id = None
        if build_id:
            print(f"  buildId: {build_id}")
            products_p1, pagination = fetch_nike_page(build_id, 1)
            if products_p1 is not None:
                break
            print("  ERRO: página 1 falhou")
        if attempt == max_tries or not rotate_nike_egress():
            break

    if products_p1 is None:
        print(f"  ERRO: página 1 falhou em {attempt} tentativa(s) de IP de saída — "
              "Nike vazia hoje.")
        return rows
    egress_tries_used = attempt

    last_url = pagination.get("last", "")
    last_page_m = re.search(r'page=(\d+)', last_url)
    total_pages = int(last_page_m.group(1)) if last_page_m else 1

    def process_products(products):
        for item in products:
            sku, row = nike_row(item)
            if not sku or sku in seen:
                continue
            seen.add(sku)
            rows.append(row)

    process_products(products_p1)
    print(f"  Página 1/{total_pages} — {len(seen)} SKUs até agora")

    # Tolera falhas isoladas de página (reset transitório / throttle) pulando a
    # página em vez de abortar tudo. Só para de vez se muitas páginas seguidas
    # falharem (= IP bloqueado / site fora), evitando truncar em silêncio.
    # Se o IP for bloqueado NO MEIO da coleta (o Akamai às vezes vira a chave
    # depois de N páginas), rotaciona o IP de saída e retoma na mesma página em
    # vez de abortar com metade dos SKUs.
    consec_fail = 0
    failed_pages = []
    MAX_CONSEC_FAIL = 8
    rotations_left = max(0, NIKE_MAX_EGRESS_TRIES - egress_tries_used) if NIKE_RESET_CMD else 0
    page_num = 2
    while page_num <= total_pages:
        time.sleep(1.0)
        products, _ = fetch_nike_page(build_id, page_num)
        if products is None:
            consec_fail += 1
            if consec_fail >= MAX_CONSEC_FAIL and rotations_left > 0:
                print(f"  {consec_fail} páginas seguidas falharam — trocando IP de "
                      f"saída e retomando na página {page_num}.")
                rotations_left -= 1
                if rotate_nike_egress():
                    nike_warm_up()
                    consec_fail = 0
                    continue
            if consec_fail >= MAX_CONSEC_FAIL:
                print(f"  ABORTANDO: {consec_fail} páginas seguidas falharam "
                      f"(provável bloqueio de IP). Coletado até aqui: {len(seen)} SKUs.")
                break
            failed_pages.append(page_num)
            page_num += 1
            continue
        consec_fail = 0
        process_products(products)
        if page_num % 10 == 0:
            print(f"  Página {page_num}/{total_pages} — {len(seen)} SKUs até agora")
        page_num += 1

    if failed_pages:
        print(f"  AVISO: {len(failed_pages)} página(s) falharam e foram puladas: {failed_pages}")
    print(f"  Total Nike: {len(rows)} SKUs únicos "
          f"({len(seen)} de ~{total_pages*30} esperados)")
    return rows

# ── Asics: VTEX Intelligent Search ───────────────────────────────────────────

ASICS_SEARCH_URL = "https://www.asics.com.br/api/io/_v/api/intelligent-search/product_search"

HEADERS_ASICS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.asics.com.br/",
}

# Subcategorias de calçado válidas na Asics. A Asics coloca meias e acessórios
# dentro do departamento "Calçados" no VTEX, então precisamos filtrar por sport.
ASICS_FOOTWEAR_SPORTS = {
    "Running", "Corrida", "Caminhada", "Trail Running", "Trilha",
    "SportStyle", "Tennis", "Quadra", "Vôlei", "Volei",
    "Skateboarding", "Infantil", "Calçados",
}

def extract_asics_sport(categories):
    if not categories:
        return None
    longest = max(categories, key=len)
    parts = [p for p in longest.strip("/").split("/") if p]
    # /Calçados/Corrida/ → ["Calçados","Corrida"] → parts[1]
    return parts[1] if len(parts) >= 2 else (parts[-1] if parts else None)

def scrape_asics():
    print("\n[ASICS] Coletando asics.com.br (calcados)...")
    rows = []
    seen = set()
    skipped = 0

    r0 = session.get(f"{ASICS_SEARCH_URL}?facets=categoria%2Fcalcados&count=1",
                     headers=HEADERS_ASICS, impersonate="safari17_0", timeout=20)
    total = r0.json().get("recordsFiltered", 0)
    total_pages = -(-total // 48)
    print(f"  Total: {total} produtos | {total_pages} páginas")

    for page_num in range(1, total_pages + 1):
        url = f"{ASICS_SEARCH_URL}?facets=categoria%2Fcalcados&count=48&page={page_num}"
        body = get_json_retry(url, HEADERS_ASICS, "safari17_0", f"Asics página {page_num}")
        if body is None:
            # Pula a página em vez de abortar a marca: um erro isolado não deve
            # truncar o dia (a partição é reescrita inteira no load).
            continue
        try:
            products = body.get("products", [])
        except Exception as e:
            print(f"  ERRO página {page_num}: {e}")
            continue

        for item in products:
            pid = item.get("productId")
            if not pid or pid in seen:
                continue
            seen.add(pid)

            # Filtrar apenas calçados — a Asics inclui meias/acessórios em "Calçados"
            sport = extract_asics_sport(item.get("categories"))
            if sport not in ASICS_FOOTWEAR_SPORTS:
                skipped += 1
                continue

            pr = item.get("priceRange", {})
            list_p = (pr.get("listPrice") or {}).get("lowPrice")
            sale_p = (pr.get("sellingPrice") or {}).get("lowPrice")
            if not sale_p:
                continue
            list_p = list_p or sale_p
            disc = round((list_p - sale_p) / list_p, 4) if list_p > sale_p else 0.0
            rows.append({
                "date": TODAY_STR,
                "source": "asics_direct",
                "brand_name": "Asics",
                "sport": sport,
                "division": "Calçados",
                "grandparent_id": pid,
                "parent_id": item.get("productReference"),
                "parent_name": item.get("productName"),
                "parent_url": f"https://www.asics.com.br{item.get('link', '')}",
                "child_list_price": list_p,
                "child_sale_price": sale_p,
                "child_pct_discount": disc,
                "child_is_available": 1 if sale_p and sale_p > 0 else 0,
                "rating": None,
                "rating_count": None,
            })

        if page_num % 10 == 0:
            print(f"  Página {page_num}/{total_pages} — {len(seen)} vistos, {len(rows)} calçados, {skipped} ignorados")
        time.sleep(0.3)

    print(f"  Total Asics: {len(rows)} calçados ({skipped} ignorados — roupa/meia/acessório)")
    return rows

# ── Under Armour: VTEX Intelligent Search ────────────────────────────────────

UA_SEARCH_URL = "https://www.underarmour.com.br/api/io/_v/api/intelligent-search/product_search"

def extract_ua_sport(categories):
    """Extrai sport do path /Genero/Calcados/Sport/. Retorna None se não for calçado."""
    if not categories:
        return None
    # Preferir o path que tem "Calçados" em parts[1]
    for cat in categories:
        parts = [p for p in cat.strip("/").split("/") if p]
        if len(parts) >= 3 and parts[1] == "Calçados":
            return parts[2]
    return None  # não é calçado

def scrape_ua_direct():
    print("\n[UNDER ARMOUR] Coletando underarmour.com.br (calcados)...")
    rows = []
    seen = set()
    skipped = 0

    # Nota: o facet categoria/calcados é ignorado pelo VTEX da UA — retorna tudo.
    # A filtragem real é feita via extract_ua_sport() que verifica o path /Genero/Calcados/.
    r0 = session.get(f"{UA_SEARCH_URL}?facets=categoria%2Fcalcados&count=1",
                     headers=HEADERS_UA, impersonate="safari17_0", timeout=20)
    total = r0.json().get("recordsFiltered", 0)
    total_pages = -(-total // 48)
    print(f"  Total na API: {total} produtos | {total_pages} páginas (inclui roupa — será filtrado)")

    for page_num in range(1, total_pages + 1):
        url = f"{UA_SEARCH_URL}?facets=categoria%2Fcalcados&count=48&page={page_num}"
        body = get_json_retry(url, HEADERS_UA, "safari17_0", f"UA página {page_num}")
        if body is None:
            # Pula a página em vez de abortar a marca (o HTTP 400 recorrente na
            # página 51 vinha derrubando o resto da coleta).
            continue
        try:
            products = body.get("products", [])
        except Exception as e:
            print(f"  ERRO página {page_num}: {e}")
            continue

        for item in products:
            pid = item.get("productId")
            if not pid or pid in seen:
                continue
            seen.add(pid)

            # Filtrar apenas calçados — o VTEX da UA ignora o facet de categoria
            sport = extract_ua_sport(item.get("categories", []))
            if sport is None:
                skipped += 1
                continue

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
                "sport": sport,
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
            print(f"  Página {page_num}/{total_pages} — {len(seen)} vistos, {len(rows)} calçados, {skipped} ignorados")
        time.sleep(0.3)

    print(f"  Total Under Armour: {len(rows)} calçados ({skipped} ignorados — roupa/meia/acessório)")
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

# ── Netshoes: API JSON de listagem (/api/lst/<lista>) ────────────────────────
# A pagina HTML /tenis passou a exigir o desafio sec-cpt do Akamai (2026-06-29).
# Mas o endpoint XHR /api/lst/<lista>?page=N NAO e desafiado e devolve os mesmos
# campos (parentSkus com listPrice/salePrice/brand/etc.). curl_cffi passa na
# checagem de rede do Akamai; basta aquecer os cookies na home antes.

NS_LIST = "tenis"
NS_HOME = "https://www.netshoes.com.br/"
NS_API  = f"https://www.netshoes.com.br/api/lst/{NS_LIST}"
HEADERS_NS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.netshoes.com.br",
}
HEADERS_NS_API = {
    "User-Agent": HEADERS_NS["User-Agent"],
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"https://www.netshoes.com.br/{NS_LIST}",
}

def _ns_get_page(page_num):
    """GET /api/lst/tenis?page=N -> dict JSON (ou None em bloqueio/erro)."""
    r = session.get(f"{NS_API}?page={page_num}", headers=HEADERS_NS_API,
                    impersonate="chrome124", proxies=NS_PROXIES, timeout=30)
    ct = r.headers.get("content-type", "")
    if r.status_code != 200 or "json" not in ct:
        blocked = ("sec-cpt" in r.text) or ("behavioral-content" in r.text) or (r.status_code == 403)
        motivo = "bloqueio Akamai" if blocked else f"resposta inesperada (HTTP {r.status_code}, {ct})"
        print(f"  ERRO pagina {page_num}: {motivo}")
        return None
    try:
        return r.json()
    except Exception as e:
        print(f"  ERRO pagina {page_num}: JSON invalido: {e}")
        return None

def scrape_netshoes():
    print("\n[NETSHOES] Coletando via API /api/lst/tenis...")
    if NS_PROXIES:
        print(f"  Usando proxy NETSHOES_PROXY ({NS_PROXY.split('@')[-1]})")
    rows = []
    seen = set()

    # Warm-up na home para receber os cookies do Akamai (bm_*, _abck) antes da categoria
    try:
        session.get("https://www.netshoes.com.br/", headers=HEADERS_NS,
                    impersonate="chrome124", proxies=NS_PROXIES, timeout=30)
        time.sleep(1.0)
    except Exception as e:
        print(f"  AVISO: warm-up da home falhou: {e}")

    d0 = _ns_get_page(1)
    if not d0:
        return rows
    total = d0.get('total', 0)
    total_pages = d0.get('totalPages', 1)
    page1_skus = d0.get('parentSkus', [])
    print(f"  Total: {total} produtos | {total_pages} páginas")

    def process_skus(skus):
        for item in skus:
            sku = item.get('sku')
            if not sku or sku in seen:
                continue
            seen.add(sku)
            list_cents = item.get('listPrice')
            sale_cents = item.get('salePrice')
            if not sale_cents:
                continue
            list_p = (list_cents / 100) if list_cents else (sale_cents / 100)
            sale_p = sale_cents / 100
            disc = round((list_p - sale_p) / list_p, 4) if list_p > sale_p else 0.0
            rows.append({
                "date": TODAY_STR,
                "source": "netshoes",
                "brand": item.get('brand'),
                "sku": sku,
                "product_code": item.get('productCode'),
                "name": item.get('name'),
                "department": item.get('department'),
                "product_type": item.get('productType'),
                "list_price": list_p,
                "sale_price": sale_p,
                "pct_discount": disc,
                "is_available": 1 if item.get('available') else 0,
                "review_stars": item.get('reviewStars'),
                "review_count": int(item.get('reviewCount') or 0) or None,
                "product_url": f"https://www.netshoes.com.br{item.get('productSlug', '')}",
            })

    process_skus(page1_skus)
    print(f"  Página 1/{total_pages} — {len(seen)} SKUs")

    for page_num in range(2, total_pages + 1):
        time.sleep(0.4)
        d = _ns_get_page(page_num)
        if not d:
            break
        ps = d.get('parentSkus', [])
        if not ps:
            break
        process_skus(ps)
        if page_num % 50 == 0:
            print(f"  Página {page_num}/{total_pages} — {len(seen)} SKUs")

    print(f"  Total Netshoes: {len(rows)} SKUs únicos")
    return rows


NS_SCHEMA = [
    bigquery.SchemaField("date", "DATE"),
    bigquery.SchemaField("source", "STRING"),
    bigquery.SchemaField("brand", "STRING"),
    bigquery.SchemaField("sku", "STRING"),
    bigquery.SchemaField("product_code", "STRING"),
    bigquery.SchemaField("name", "STRING"),
    bigquery.SchemaField("department", "STRING"),
    bigquery.SchemaField("product_type", "STRING"),
    bigquery.SchemaField("list_price", "FLOAT64"),
    bigquery.SchemaField("sale_price", "FLOAT64"),
    bigquery.SchemaField("pct_discount", "FLOAT64"),
    bigquery.SchemaField("is_available", "INT64"),
    bigquery.SchemaField("review_stars", "FLOAT64"),
    bigquery.SchemaField("review_count", "INT64"),
    bigquery.SchemaField("product_url", "STRING"),
]


def load_netshoes_to_bq(rows):
    if not rows:
        print("\n[BQ Netshoes] Nenhum dado para carregar.")
        return

    client = get_bq_client()

    # Cria a tabela se não existir
    table_ref = bigquery.Table(NS_TABLE, schema=NS_SCHEMA)
    client.create_table(table_ref, exists_ok=True)

    # Remove partição de hoje se já existir
    try:
        result = list(client.query(f"SELECT COUNT(*) as cnt FROM `{NS_TABLE}` WHERE date = '{TODAY_STR}'").result())
        existing = result[0].cnt if result else 0
        if existing > 0:
            print(f"\n[BQ Netshoes] Partição {TODAY_STR} já existe com {existing} linhas — deletando...")
            client.query(f"DELETE FROM `{NS_TABLE}` WHERE date = '{TODAY_STR}'").result()
    except Exception:
        pass

    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND",
        schema=NS_SCHEMA,
    )

    job = client.load_table_from_json(rows, NS_TABLE, job_config=job_config)
    job.result()
    print(f"\n[BQ Netshoes] {len(rows)} linhas carregadas na partição {TODAY_STR}")
    print(f"     Tabela: {NS_TABLE}")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print(f"PIPELINE ADIDAS + NIKE + UA + ASICS + NETSHOES -> BIGQUERY ({TODAY_STR})")
    print("=" * 60)

    adidas_rows = scrape_adidas()
    nike_rows = scrape_nike_direct()
    ua_rows = scrape_ua_direct()
    asics_rows = scrape_asics()
    all_rows = adidas_rows + nike_rows + ua_rows + asics_rows

    print(f"\nBrand-direct: {len(all_rows)} linhas ({len(adidas_rows)} Adidas + {len(nike_rows)} Nike + {len(ua_rows)} Under Armour + {len(asics_rows)} Asics)")
    load_to_bq(all_rows)

    ns_rows = scrape_netshoes()
    print(f"\nNetshoes: {len(ns_rows)} linhas")
    load_netshoes_to_bq(ns_rows)

    print("\nPIPELINE CONCLUIDO.")

    # ── Alertas de coleta vazia ────────────────────────────────────────────────
    fail = False

    # Nike: desde 2026-08-02 o Akamai exige o sensor JS. O motor camoufox
    # (home valida cookies → fetch same-origin) contorna isso. Se vier 0 com o
    # camoufox, é regressão real (Akamai apertou de novo ou o browser não subiu)
    # → derruba a run. Com o motor curl legado é esperado 0: só avisa.
    if not nike_rows:
        print(f"\n[ALERTA] Nike retornou 0 linhas (NIKE_ENGINE={NIKE_ENGINE}).")
        if NIKE_ENGINE == "camoufox":
            print("  → O motor camoufox parou de passar no sensor do Akamai. "
                  "Checar: 'python -m camoufox fetch' rodou? xvfb instalado? "
                  "A home renderizou (buildId)? Alternativas: web-unlocker pago "
                  "no NIKE_PROXY. Ver [[nike-akamai-datacenter-block]].")
            fail = True
        else:
            print("  → Motor curl legado: 403 é esperado desde 02/08/2026 "
                  "(sensor Akamai). Use NIKE_ENGINE=camoufox.")
            print("::warning title=Nike sem dados::Motor curl não passa mais no "
                  "Akamai; rode com NIKE_ENGINE=camoufox.")

    if not ns_rows:
        print("\n[ALERTA] Netshoes retornou 0 linhas — a API /api/lst pode ter mudado "
              "ou o Akamai bloqueou o IP. Investigar scrape_netshoes(). "
              "(Se for bloqueio de IP em runner datacenter, defina NETSHOES_PROXY.)")
        if NS_PROXIES:
            fail = True

    if fail:
        sys.exit(1)
