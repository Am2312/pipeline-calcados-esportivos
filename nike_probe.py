"""Sonda temporária: de dentro do runner (IP datacenter), testa vários caminhos
de acessar os produtos da Nike para achar um que o Akamai não bloqueie.
NÃO carrega nada no BQ. Só imprime status por abordagem."""
import re, json, time
from curl_cffi import requests as cf

BUILD_URL = "https://www.nike.com.br/api/products"
NAV = "nav/tipodeproduto/calcados"

DESK = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none",
    "sec-fetch-user": "?1", "upgrade-insecure-requests": "1",
    "Referer": "https://www.nike.com.br/",
}

def verdict(r):
    if r is None: return "EXC"
    if r.status_code == 200:
        if "application/json" in r.headers.get("content-type",""): return "200-JSON"
        return f"200-{r.headers.get('content-type','?')[:20]}"
    if "Access Denied" in (r.text or ""): return f"{r.status_code}-DENIED"
    return f"{r.status_code}"

def build_id(sess):
    try:
        r = sess.get(BUILD_URL, headers=DESK, impersonate="chrome124", timeout=30)
        m = re.search(r'"buildId":"([^"]+)"', r.text)
        return m.group(1) if m else None
    except Exception as e:
        print("  buildId EXC", e); return None

def nextdata(sess, bid, imp, warm=False, referer=None):
    if warm:
        try:
            sess.get("https://www.nike.com.br/", headers=DESK, impersonate=imp, timeout=30); time.sleep(1.5)
        except Exception as e: print("   warm EXC", e)
    url = f"https://www.nike.com.br/_next/data/{bid}/{NAV}.json?scoringProfile=scoreByRanking"
    h = {**DESK, "Accept":"application/json", "x-nextjs-data":"1",
         "sec-fetch-dest":"empty","sec-fetch-mode":"cors","sec-fetch-site":"same-origin"}
    if referer: h["Referer"]=referer
    try:
        return sess.get(url, headers=h, impersonate=imp, timeout=30)
    except Exception as e:
        print("   nextdata EXC", e); return None

print("="*50); print("NIKE PROBE (do runner / IP datacenter)"); print("="*50)
s = cf.Session()
bid = build_id(s)
print("buildId:", bid, "(via /api/products — controle)")

# controle: rotas que devem passar
for tag,u in [("robots","https://www.nike.com.br/robots.txt"),("sitemap","https://www.nike.com.br/sitemap.xml")]:
    try: print(f"[controle {tag}] {verdict(s.get(u,headers=DESK,impersonate='chrome124',timeout=20))}")
    except Exception as e: print(f"[controle {tag}] EXC {e}")

if bid:
    print("\n-- abordagens _next/data --")
    print("A baseline chrome124 :", verdict(nextdata(s, bid, "chrome124")))
    print("B warmup chrome124   :", verdict(nextdata(cf.Session(), bid, "chrome124", warm=True)))
    for imp in ["chrome120","chrome123","chrome124","safari17_0","edge99","chrome110"]:
        print(f"C imp={imp:12s}    :", verdict(nextdata(cf.Session(), bid, imp, warm=True)))
        time.sleep(1.0)
    print("D referer-cat        :", verdict(nextdata(cf.Session(), bid, "chrome124", warm=True, referer=f"https://www.nike.com.br/{NAV}")))
print("\nFIM DA SONDA")
