"""Sonda TEMPORÁRIA #5: navegador real passa no Akamai da Nike?

Diagnóstico consolidado (2026-08-03):
  - /_next/data/... => 403 Access Denied via WARP (6 IPs, colos SJC/IAD) E
    também do IP residencial do usuário => NÃO é bloqueio de IP;
  - a página HTML da categoria devolve um STUB de 2.371 bytes p/ curl_cffi,
    mas 2,5 MB num Chrome real, com os 30 produtos em __NEXT_DATA__
    (props.pageProps.data.products) — mesmo shape do _next/data;
  - no Chrome real aparece POST em gtm-server.nike.com.br/... = sensor do
    Akamai Bot Manager. Ou seja: a Nike passou a exigir JS/sensor.

Testa aqui se um navegador no runner (headless) recebe a página completa:
  A) chromium do Playwright (headless, UA de Chrome desktop)
  B) Google Chrome instalado no runner (channel="chrome", headless)
Remover depois de validar.
"""
import sys

from playwright.sync_api import sync_playwright

URL = "https://www.nike.com.br/nav/tipodeproduto/calcados"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

READ_NEXT_DATA = """() => {
  const nd = document.getElementById('__NEXT_DATA__');
  if (!nd) return {html: document.documentElement.outerHTML.length, nd: 0, prods: -1};
  let prods = -1;
  try {
    const d = JSON.parse(nd.textContent);
    const p = d?.props?.pageProps?.data?.products;
    prods = Array.isArray(p) ? p.length : -2;
  } catch (e) {}
  return {html: document.documentElement.outerHTML.length, nd: nd.textContent.length, prods};
}"""


def run(pw, label, **launch):
    try:
        browser = pw.chromium.launch(
            args=["--disable-blink-features=AutomationControlled"], **launch)
    except Exception as e:
        print(f"{label}: launch falhou: {e}")
        return
    try:
        ctx = browser.new_context(
            user_agent=UA, locale="pt-BR", timezone_id="America/Sao_Paulo",
            viewport={"width": 1366, "height": 900})
        page = ctx.new_page()
        for pg in (1, 2):
            url = URL if pg == 1 else f"{URL}?page={pg}"
            try:
                r = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(4000)
                info = page.evaluate(READ_NEXT_DATA)
                body = page.content()
                deny = "Access Denied" in body
                print(f"{label} p{pg}: HTTP {r.status if r else '?'}"
                      f"{' DENY' if deny else ''} | html={info['html']}b "
                      f"| __NEXT_DATA__={info['nd']}b | produtos={info['prods']}",
                      flush=True)
            except Exception as e:
                print(f"{label} p{pg}: EXC {type(e).__name__}: {str(e)[:200]}")
    finally:
        browser.close()


with sync_playwright() as pw:
    run(pw, "A) chromium headless", headless=True)
    run(pw, "B) chrome headless", headless=True, channel="chrome")
print("fim", file=sys.stderr)
