"""Sonda TEMPORÁRIA: existe rota de listagem da Nike que o Akamai NÃO nega?

O que já sabemos (sondas #1 e #2, runs 30817431191 / 30818154840):
  - a rotação do WARP troca o IP de verdade (6 IPs, colos SJC e IAD) e TODOS
    tomaram Access Denied em /_next/data → não é sorteio de IP;
  - forçar IPv4 no cliente não muda nada (com socks5h quem resolve é o WARP);
  - MAS /api/products (usado p/ pegar o buildId) responde 200 do runner.

Então o deny do Akamai é por ROTA (/_next/data/...), não por IP. Esta sonda
varre rotas candidatas de listagem — direto (sem proxy) e via WARP — pra achar
uma que devolva produtos, como o /api/lst resolveu na Netshoes.
Remover depois de validar.
"""
import json
import os
import sys

os.environ.setdefault("NIKE_PROXY", "socks5h://127.0.0.1:40000")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pipeline_adidas_nike_bq as P  # noqa: E402

BID = None
try:
    BID = P.get_nike_build_id()
    print(f"buildId: {BID}")
except Exception as e:
    print(f"buildId falhou: {e}")

BASE = "https://www.nike.com.br"
CANDIDATES = [
    ("api/lst/tenis", f"{BASE}/api/lst/tenis?page=1"),
    ("api/lst/calcados", f"{BASE}/api/lst/calcados?page=1"),
    ("api/lst/nav", f"{BASE}/api/lst/nav/tipodeproduto/calcados?page=1"),
    ("api/products?q", f"{BASE}/api/products?q=tenis"),
    ("api/search", f"{BASE}/api/search?q=tenis"),
    ("api/catalog", f"{BASE}/api/catalog/products?q=tenis"),
    ("api/v1 products", f"{BASE}/api/v1/products?q=tenis"),
    ("busca html", f"{BASE}/busca?q=tenis"),
    ("categoria html", f"{BASE}/nav/tipodeproduto/calcados"),
]
if BID:
    CANDIDATES += [
        ("_next busca", f"{BASE}/_next/data/{BID}/busca.json?q=tenis"),
        ("_next nav (controle)",
         f"{BASE}/_next/data/{BID}/nav/tipodeproduto/calcados.json?scoringProfile=scoreByRanking"),
    ]


def sniff(text):
    """Tenta descobrir se a resposta tem lista de produtos."""
    try:
        body = json.loads(text)
    except Exception:
        n = text.count('"price"') + text.count('data-product') + text.count('"oldPrice"')
        return f"não-JSON (marcadores de produto: {n})"
    def find_list(node, path="", depth=0):
        if depth > 6:
            return None
        if isinstance(node, list) and node and isinstance(node[0], dict) \
                and {"name", "price"} & set(node[0]):
            return f"{path or 'raiz'}[{len(node)}] keys={sorted(node[0])[:8]}"
        if isinstance(node, dict):
            for k, v in node.items():
                r = find_list(v, f"{path}.{k}" if path else k, depth + 1)
                if r:
                    return r
        return None
    return find_list(body) or f"JSON sem lista de produtos (keys={list(body)[:8]})"


def probe(label, url, proxies, tag):
    try:
        r = P.session.get(url, headers=P.HEADERS_NIKE, impersonate="chrome124",
                          proxies=proxies, timeout=30)
    except Exception as e:
        print(f"  {tag:6s} {label:22s} EXC {e}")
        return
    blocked = "Access Denied" in r.text
    status = f"{r.status_code}{' DENY' if blocked else ''}"
    extra = "" if blocked or r.status_code >= 400 else f" | {sniff(r.text)}"
    print(f"  {tag:6s} {label:22s} {status:9s} {len(r.text):8d}b{extra}", flush=True)


for label, url in CANDIDATES:
    P.session.cookies.clear()
    probe(label, url, None, "DIRETO")
    P.session.cookies.clear()
    probe(label, url, P.NIKE_PROXIES, "WARP")
