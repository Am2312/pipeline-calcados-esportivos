"""Sonda TEMPORÁRIA #8: camoufox resolve o sensor do Akamai se der tempo?

Sonda #7: patchright => 403 DENY; camoufox => HTTP 200 com o bootstrap de
2.367 b (mesma página que o curl_cffi recebe), sem __NEXT_DATA__ em 8 s. Isso
é a cara de "o desafio do Akamai foi entregue mas não foi resolvido/recarregado".

Testa três caminhos com camoufox:
  A) esperar networkidle + 20 s e ver se hidrata sozinho
  B) esperar, recarregar uma vez (padrão do Akamai: 1ª resposta é o desafio,
     2ª já vem a página) e ler
  C) caminho humano: home -> espera -> navega pra categoria
Sucesso = produtos em __NEXT_DATA__ ou cards de produto no DOM.
Remover depois de decidir.
"""
import os

HOME = "https://www.nike.com.br/"
URL = "https://www.nike.com.br/nav/tipodeproduto/calcados"
PROXY = os.environ.get("PROBE_PROXY", "").strip()

READ = """() => {
  const nd = document.getElementById('__NEXT_DATA__');
  let prods = -1, ndl = 0;
  if (nd) {
    ndl = nd.textContent.length;
    try {
      const p = JSON.parse(nd.textContent)?.props?.pageProps?.data?.products;
      prods = Array.isArray(p) ? p.length : -2;
    } catch (e) {}
  }
  return {
    html: document.documentElement.outerHTML.length,
    nd: ndl,
    prods,
    cards: document.querySelectorAll('a[href*="/produto/"]').length,
    cookies: document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean).join(','),
  };
}"""


def show(label, page):
    i = page.evaluate(READ)
    ok = "✅" if (i["prods"] > 0 or i["cards"] > 5) else "❌"
    print(f"{ok} {label}: html={i['html']}b | __NEXT_DATA__={i['nd']}b | "
          f"produtos={i['prods']} | links de produto={i['cards']}", flush=True)
    print(f"     cookies: {i['cookies'][:200]}", flush=True)
    return i


def make(pw_kwargs=None):
    from camoufox.sync_api import Camoufox
    kw = {"headless": "virtual", "locale": "pt-BR", "os": "windows",
          "humanize": True}
    if PROXY:
        kw["proxy"] = {"server": PROXY}
    kw.update(pw_kwargs or {})
    return Camoufox(**kw)


# A) só esperar
try:
    with make() as b:
        page = b.new_page()
        r = page.goto(URL, wait_until="networkidle", timeout=90000)
        print(f"A) goto: HTTP {r.status if r else '?'}")
        page.wait_for_timeout(20000)
        show("A) networkidle + 20s", page)
except Exception as e:
    print(f"❌ A) EXC {type(e).__name__}: {str(e)[:200]}")

# B) esperar e recarregar
try:
    with make() as b:
        page = b.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(12000)
        r2 = page.reload(wait_until="networkidle", timeout=90000)
        print(f"B) reload: HTTP {r2.status if r2 else '?'}")
        page.wait_for_timeout(10000)
        show("B) reload apos desafio", page)
except Exception as e:
    print(f"❌ B) EXC {type(e).__name__}: {str(e)[:200]}")

# C) caminho humano: home -> categoria
try:
    with make() as b:
        page = b.new_page()
        rh = page.goto(HOME, wait_until="domcontentloaded", timeout=90000)
        print(f"C) home: HTTP {rh.status if rh else '?'}")
        page.wait_for_timeout(15000)
        show("C1) home apos 15s", page)
        rc = page.goto(URL, wait_until="networkidle", timeout=90000)
        print(f"C) categoria: HTTP {rc.status if rc else '?'}")
        page.wait_for_timeout(12000)
        show("C2) categoria vinda da home", page)
except Exception as e:
    print(f"❌ C) EXC {type(e).__name__}: {str(e)[:200]}")
