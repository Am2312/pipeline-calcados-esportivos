"""Sonda TEMPORÁRIA #7: browser anti-detect passa no sensor do Akamai da Nike?

Contexto (ver [[nike-akamai-datacenter-block]]): desde 02/08/2026 a Nike exige o
sensor do Akamai Bot Manager. Já falharam: curl_cffi (WARP e IP residencial),
Playwright headless e headed com perfil limpo, com e sem WARP. Só o Chrome real
com perfil estabelecido carrega a página.

Aqui testamos browsers com patches anti-detecção:
  A) patchright (fork do Playwright sem os vazamentos de CDP), sem proxy
  B) patchright + WARP
  C) camoufox (Firefox patchado, fingerprint rotativo), sem proxy
  D) camoufox + WARP

Critério de sucesso: HTML grande e produtos em __NEXT_DATA__
(props.pageProps.data.products, 30 por página).
Remover depois de decidir.
"""
import os

URL = "https://www.nike.com.br/nav/tipodeproduto/calcados"
PROXY = {"server": "socks5://127.0.0.1:40000"}
USE_WARP = os.environ.get("PROBE_WARP", "1") == "1"

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
  return {html: document.documentElement.outerHTML.length, nd: ndl, prods};
}"""


def report(label, page, resp):
    try:
        info = page.evaluate(READ)
        deny = " DENY" if "Access Denied" in page.content() else ""
        ok = "✅" if info["prods"] > 0 else "❌"
        print(f"{ok} {label}: HTTP {resp.status if resp else '?'}{deny} | "
              f"html={info['html']}b | __NEXT_DATA__={info['nd']}b | "
              f"produtos={info['prods']}", flush=True)
    except Exception as e:
        print(f"❌ {label}: erro ao ler página: {str(e)[:150]}")


def run_patchright(label, proxy):
    try:
        from patchright.sync_api import sync_playwright
    except Exception as e:
        print(f"❌ {label}: patchright indisponível: {str(e)[:120]}")
        return
    kw = {"headless": True, "channel": "chrome"}
    if proxy:
        kw["proxy"] = proxy
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(**kw)
            try:
                ctx = b.new_context(locale="pt-BR", timezone_id="America/Sao_Paulo",
                                    viewport={"width": 1366, "height": 900})
                page = ctx.new_page()
                r = page.goto(URL, wait_until="domcontentloaded", timeout=90000)
                page.wait_for_timeout(8000)
                report(label, page, r)
            finally:
                b.close()
    except Exception as e:
        print(f"❌ {label}: EXC {type(e).__name__}: {str(e)[:180]}")


def run_camoufox(label, proxy):
    try:
        from camoufox.sync_api import Camoufox
    except Exception as e:
        print(f"❌ {label}: camoufox indisponível: {str(e)[:120]}")
        return
    kw = {"headless": "virtual", "locale": "pt-BR", "os": "windows"}
    if proxy:
        kw["proxy"] = {"server": proxy["server"]}
    try:
        with Camoufox(**kw) as b:
            page = b.new_page()
            r = page.goto(URL, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(8000)
            report(label, page, r)
    except Exception as e:
        print(f"❌ {label}: EXC {type(e).__name__}: {str(e)[:180]}")


run_patchright("A) patchright direto", None)
if USE_WARP:
    run_patchright("B) patchright + WARP", PROXY)
run_camoufox("C) camoufox direto", None)
if USE_WARP:
    run_camoufox("D) camoufox + WARP", PROXY)
