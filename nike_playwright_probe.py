"""Sonda TEMPORÁRIA #6: navegador real + WARP passa no Akamai da Nike?

Placar até agora (2026-08-03):
  curl_cffi + WARP (6 IPs, SJC/IAD) ....... /_next/data 403 DENY
  curl_cffi + IP residencial do usuário ... /_next/data 403 DENY
  curl_cffi (qualquer IP) ................. HTML da categoria 200 mas STUB 2,4 KB
  Chrome real + IP residencial ............ HTML 2,5 MB com 30 produtos ✅
  headless no runner, SEM proxy ........... 403 DENY já no HTML (319 b)

Então precisa de navegador de verdade E de IP que não seja datacenter. Esta
sonda testa a única combinação gratuita que falta: navegador real saindo pelo
WARP (cujos IPs são de usuários finais).
Remover depois de decidir.
"""
import subprocess

from playwright.sync_api import sync_playwright

URL = "https://www.nike.com.br/nav/tipodeproduto/calcados"
TRACE = "https://www.cloudflare.com/cdn-cgi/trace"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
PROXY = {"server": "socks5://127.0.0.1:40000"}

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


def run(pw, label, proxy=None, channel=None):
    kw = {"headless": True, "args": ["--disable-blink-features=AutomationControlled"]}
    if proxy:
        kw["proxy"] = proxy
    if channel:
        kw["channel"] = channel
    try:
        browser = pw.chromium.launch(**kw)
    except Exception as e:
        print(f"{label}: launch falhou: {str(e)[:150]}")
        return
    try:
        ctx = browser.new_context(user_agent=UA, locale="pt-BR",
                                  timezone_id="America/Sao_Paulo",
                                  viewport={"width": 1366, "height": 900})
        page = ctx.new_page()
        try:
            page.goto(TRACE, timeout=45000)
            body = page.inner_text("body")
            egress = " ".join(l for l in body.splitlines()
                              if l.startswith(("ip=", "loc=", "warp=", "colo=")))
            print(f"{label} egress: {egress}")
        except Exception as e:
            print(f"{label} egress: falhou ({str(e)[:80]})")
        for pg in (1, 2):
            url = URL if pg == 1 else f"{URL}?page={pg}"
            try:
                r = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(5000)
                i = page.evaluate(READ)
                deny = " DENY" if "Access Denied" in page.content() else ""
                print(f"{label} p{pg}: HTTP {r.status if r else '?'}{deny} | "
                      f"html={i['html']}b | __NEXT_DATA__={i['nd']}b | "
                      f"produtos={i['prods']}", flush=True)
            except Exception as e:
                print(f"{label} p{pg}: EXC {type(e).__name__}: {str(e)[:150]}")
    finally:
        browser.close()


with sync_playwright() as pw:
    run(pw, "A) chromium + WARP", proxy=PROXY)
    run(pw, "B) chrome + WARP", proxy=PROXY, channel="chrome")
    # rotaciona o IP do WARP e tenta de novo (o IP anterior pode estar queimado)
    subprocess.run("bash warp_rotate.sh 127.0.0.1:40000", shell=True)
    run(pw, "C) chrome + WARP pos-rotacao", proxy=PROXY, channel="chrome")
