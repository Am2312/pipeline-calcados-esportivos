"""Sonda TEMPORÁRIA #4: rotas alternativas / warm-up no path certo.

Achados até aqui (runs 30817431191, 30818154840, 30818573112):
  - rotação do WARP troca o IP (6 IPs, colos SJC/IAD): TODOS negados em /_next/data;
  - forçar IPv4 no cliente não muda nada (socks5h resolve no WARP);
  - /api/lst, /api/search, /api/catalog... => 404 (não existem na Nike);
  - /busca?q= => 403 DENY;
  - /nav/tipodeproduto/calcados (HTML) => 200 (!) mas só 2.371 bytes;
  - /_next/data/.../calcados.json => 403 DENY (direto e via WARP).

Testa aqui:
  A) o que é esse HTML de 2.371 bytes (challenge? shell? redirect?);
  B) warm-up NA PRÓPRIA página da categoria (não na home) e depois o JSON —
     as sondas anteriores só aqueceram a home;
  C) sitemap (rota liberada?) e PDP: se produto individual passar, dá pra
     enumerar por sitemap em vez da listagem.
Remover depois de validar.
"""
import os
import re
import sys

os.environ.setdefault("NIKE_PROXY", "socks5h://127.0.0.1:40000")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pipeline_adidas_nike_bq as P  # noqa: E402

BASE = "https://www.nike.com.br"
CAT = f"{BASE}/nav/tipodeproduto/calcados"
BID = P.get_nike_build_id()
print(f"buildId: {BID}\n")


def get(url, proxies, headers=None, label=""):
    try:
        r = P.session.get(url, headers=headers or P.HEADERS_NIKE,
                          impersonate="chrome124", proxies=proxies, timeout=30)
    except Exception as e:
        print(f"  {label:34s} EXC {e}")
        return None
    deny = " DENY" if "Access Denied" in r.text else ""
    print(f"  {label:34s} {r.status_code}{deny:5s} {len(r.text):8d}b")
    return r


for tag, proxies in (("DIRETO", None), ("WARP", P.NIKE_PROXIES)):
    print(f"=== {tag} ===")
    P.session.cookies.clear()

    # A) o HTML da categoria
    r = get(CAT, proxies, label="A) HTML categoria")
    if r is not None and r.status_code == 200:
        body = re.sub(r"\s+", " ", r.text)[:500]
        print(f"     inicio: {body}")
        try:
            print(f"     cookies: {sorted(P.session.cookies.keys())}")
        except Exception:
            pass

    # B) JSON depois do warm-up na própria categoria
    h = {**P.HEADERS_NIKE, "Accept": "application/json", "x-nextjs-data": "1",
         "sec-fetch-dest": "empty", "sec-fetch-mode": "cors",
         "sec-fetch-site": "same-origin", "Referer": CAT}
    get(f"{BASE}/_next/data/{BID}/nav/tipodeproduto/calcados.json"
        f"?scoringProfile=scoreByRanking", proxies, h,
        label="B) JSON pos warm-up categoria")

    # C) sitemap + PDP
    sm = get(f"{BASE}/sitemap.xml", proxies, label="C1) sitemap.xml")
    pdp_url = None
    if sm is not None and sm.status_code == 200:
        subs = re.findall(r"<loc>([^<]+)</loc>", sm.text)[:5]
        print(f"     sitemaps: {subs}")
        for s in subs:
            if "produto" in s or "product" in s:
                sub = get(s, proxies, label="C2) sub-sitemap produto")
                if sub is not None and sub.status_code == 200:
                    locs = re.findall(r"<loc>([^<]+)</loc>", sub.text)
                    print(f"     URLs no sub-sitemap: {len(locs)} | ex: {locs[:2]}")
                    pdp_url = locs[0] if locs else None
                break
    if pdp_url:
        get(pdp_url, proxies, label="C3) PDP HTML")
        path = pdp_url.replace(BASE, "").strip("/")
        get(f"{BASE}/_next/data/{BID}/{path}.json", proxies, h, label="C4) PDP JSON")
    print()
