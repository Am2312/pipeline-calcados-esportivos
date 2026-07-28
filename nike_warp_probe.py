"""Sonda: testa se o servidor, saindo por Cloudflare WARP (SOCKS5 grátis, sem
conta), consegue passar pelo Akamai da Nike nas rotas de PRODUTO.
Lê o proxy de NIKE_PROXY (ex.: socks5h://127.0.0.1:40000). Sem BQ."""
import os, re, time
from curl_cffi import requests as cf

PROXY = os.environ.get("NIKE_PROXY", "").strip()
PROXIES = {"http": PROXY, "https": PROXY} if PROXY else None
DESK = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", "Accept-Encoding": "gzip, deflate, br",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none",
    "sec-fetch-user": "?1", "upgrade-insecure-requests": "1", "Referer": "https://www.nike.com.br/",
}
s = cf.Session()

def buildid():
    r = s.get("https://www.nike.com.br/api/products", headers=DESK, impersonate="chrome124", proxies=PROXIES, timeout=40)
    m = re.search(r'"buildId":"([^"]+)"', r.text); return m.group(1) if m else None

def page(bid, n):
    base = f"https://www.nike.com.br/_next/data/{bid}/nav/tipodeproduto/calcados.json"
    p = "scoringProfile=scoreByRanking" if n == 1 else f"page={n}&scoringProfile=scoreByRanking"
    h = {**DESK, "Accept": "application/json", "x-nextjs-data": "1",
         "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
         "Referer": "https://www.nike.com.br/nav/tipodeproduto/calcados"}
    return s.get(f"{base}?{p}", headers=h, impersonate="chrome124", proxies=PROXIES, timeout=40)

print("PROXY:", PROXY or "(direto)")
bid = buildid(); print("buildId:", bid)
if bid:
    r = page(bid, 1)
    print("page1 status:", r.status_code)
    if r.status_code == 200:
        pd = r.json().get("pageProps", {}).get("data", {})
        prods = pd.get("products", [])
        last = pd.get("pagination", {}).get("last", "")
        m = re.search(r'page=(\d+)', last)
        print(f"SUCESSO! produtos p1={len(prods)} total_pages={m.group(1) if m else '?'}")
        time.sleep(1)
        r2 = page(bid, 2)
        print("page2 status:", r2.status_code, "produtos:",
              len(r2.json().get('pageProps',{}).get('data',{}).get('products',[])) if r2.status_code==200 else '-')
    else:
        print("DENIED" if "Access Denied" in r.text else r.text[:150])
print("FIM")
