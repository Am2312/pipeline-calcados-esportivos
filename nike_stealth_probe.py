"""Sonda TEMPORÁRIA #9: navegação SPA (clique) a partir da home rendeirizada.

Sonda #8 (run 30824174849) achou a fresta: no camoufox a HOME carrega inteira
(1,65 MB, __NEXT_DATA__ 48 KB, HTTP 200) — é só a rota de LISTAGEM que devolve
o stub de 2.367 b quando entramos direto por URL (page.goto).

Hipótese: com a sessão/cookies do Akamai já validados pela home, a navegação
client-side do Next (clique num link da categoria → fetch em /_next/data)
passa. É exatamente o que o site faz num usuário real.

Loga também toda resposta de /_next/data para ver o status real.
Remover depois de decidir.
"""
import os
import re

HOME = "https://www.nike.com.br/"
CAT_PATH = "/nav/tipodeproduto/calcados"
PROXY = os.environ.get("PROBE_PROXY", "").strip()

COUNT = """() => ({
  html: document.documentElement.outerHTML.length,
  links: document.querySelectorAll('a[href*="/produto/"]').length,
  url: location.pathname + location.search,
})"""


def main():
    from camoufox.sync_api import Camoufox
    kw = {"headless": "virtual", "locale": "pt-BR", "os": "windows",
          "humanize": True}
    if PROXY:
        kw["proxy"] = {"server": PROXY}

    with Camoufox(**kw) as b:
        page = b.new_page()
        seen = []

        def on_resp(r):
            if "_next/data" in r.url or "/api/" in r.url:
                seen.append(f"{r.status} {r.url[:120]}")
        page.on("response", on_resp)

        r = page.goto(HOME, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(8000)
        print(f"home: HTTP {r.status if r else '?'} | {page.evaluate(COUNT)}",
              flush=True)

        # 1) clique num link da categoria (navegação SPA do Next)
        clicked = False
        for sel in (f'a[href="{CAT_PATH}"]', f'a[href*="{CAT_PATH}"]',
                    'a[href*="tipodeproduto/calcados"]'):
            try:
                el = page.query_selector(sel)
                if el:
                    el.scroll_into_view_if_needed()
                    el.click(timeout=15000)
                    clicked = True
                    print(f"cliquei em {sel}", flush=True)
                    break
            except Exception as e:
                print(f"clique em {sel} falhou: {str(e)[:100]}")
        if not clicked:
            hrefs = page.eval_on_selector_all(
                "a", "els => els.map(e => e.getAttribute('href')).filter(h => h && h.includes('calcado')).slice(0,10)")
            print(f"nenhum link clicável; candidatos: {hrefs}")

        page.wait_for_timeout(12000)
        info = page.evaluate(COUNT)
        ok = "✅" if info["links"] > 5 else "❌"
        print(f"{ok} pos-clique: {info}", flush=True)

        # 2) se o clique levou à listagem, tenta paginar por clique também
        if info["links"] > 5:
            html = page.content()
            m = re.findall(r'/produto/[^"\']+', html)[:3]
            print(f"  exemplos de produto: {m}")

        print("\nrespostas de _next/data / api:")
        for s in seen[-15:]:
            print(f"  {s}")


try:
    main()
except Exception as e:
    print(f"❌ EXC {type(e).__name__}: {str(e)[:300]}")
