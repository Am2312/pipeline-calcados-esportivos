"""Sonda TEMPORÁRIA #10: fetch da listagem DE DENTRO da sessão do camoufox.

Sonda #9 (run 30824986173) mostrou o caminho: no camoufox a home carrega (200) e
o próprio app fez `200 /_next/data/v12-32-0/index.json`. Ou seja, com os cookies
do Akamai validados pela home, a rota /_next/data responde — o que morre é a
requisição de fora (curl) ou o goto direto na listagem.

Testa então o que o pipeline faria: abrir a home uma vez no camoufox e buscar as
páginas da listagem por fetch DENTRO da página (mesma origem, mesmos cookies).
Sucesso = pageProps.data.products com 30 itens.
"""
import os

HOME = "https://www.nike.com.br/"
NAV = "nav/tipodeproduto/calcados"
PROXY = os.environ.get("PROBE_PROXY", "").strip()

FETCH = """async ({buildId, nav, page}) => {
  let url = `/_next/data/${buildId}/${nav}.json?scoringProfile=scoreByRanking`;
  if (page > 1) url = `/_next/data/${buildId}/${nav}.json?page=${page}&scoringProfile=scoreByRanking`;
  const r = await fetch(url, {headers: {'x-nextjs-data': '1'}, credentials: 'include'});
  const txt = await r.text();
  let prods = -1, last = null;
  try {
    const d = JSON.parse(txt);
    const p = d?.pageProps?.data?.products;
    prods = Array.isArray(p) ? p.length : -2;
    last = d?.pageProps?.data?.pagination?.last || null;
  } catch (e) {}
  return {status: r.status, len: txt.length, prods, last, deny: txt.includes('Access Denied')};
}"""

BUILD = """() => {
  const nd = document.getElementById('__NEXT_DATA__');
  if (!nd) return null;
  try { return JSON.parse(nd.textContent).buildId; } catch (e) { return null; }
}"""


def main():
    from camoufox.sync_api import Camoufox
    kw = {"headless": "virtual", "locale": "pt-BR", "os": "windows",
          "humanize": True}
    if PROXY:
        kw["proxy"] = {"server": PROXY}

    with Camoufox(**kw) as b:
        page = b.new_page()
        r = page.goto(HOME, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(8000)
        build_id = page.evaluate(BUILD)
        print(f"home: HTTP {r.status if r else '?'} | buildId={build_id}", flush=True)
        if not build_id:
            print("❌ sem buildId — home não renderizou")
            return

        for pg in (1, 2, 3):
            res = page.evaluate(FETCH, {"buildId": build_id, "nav": NAV, "page": pg})
            ok = "✅" if res["prods"] > 0 else "❌"
            print(f"{ok} fetch interno p{pg}: HTTP {res['status']}"
                  f"{' DENY' if res['deny'] else ''} | {res['len']}b | "
                  f"produtos={res['prods']} | last={res['last']}", flush=True)
            page.wait_for_timeout(1500)


try:
    main()
except Exception as e:
    print(f"❌ EXC {type(e).__name__}: {str(e)[:300]}")
