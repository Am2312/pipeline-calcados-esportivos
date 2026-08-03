"""Sonda TEMPORÁRIA: por que o WARP só passa em ~metade dos dias na Nike?

A sonda #1 (run 30817431191) mostrou que a rotação TROCA o IP (5 IPs distintos)
mas TODOS eram IPv6 (2a09:bac5.../2a09:bac1..., colo=SJC) e TODOS tomaram
Access Denied. Hipótese: o Akamai da Nike nega a faixa IPv6 do WARP; nos dias
que passou, a saída foi IPv4. Esta sonda compara, pelo MESMO túnel WARP:

  A) padrão (deixa o curl/WARP escolher a família)
  B) forçando IPv4 (CurlOpt.IPRESOLVE=1)

e, se B passar, repete B depois de rotacionar o IP para ver se é estável.
Remover depois de validar.
"""
import os
import subprocess
import sys

os.environ.setdefault("NIKE_PROXY", "socks5h://127.0.0.1:40000")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from curl_cffi import requests as cf_requests  # noqa: E402
from curl_cffi.const import CurlOpt  # noqa: E402

import pipeline_adidas_nike_bq as P  # noqa: E402

CURL_IPRESOLVE_V4 = 1
TRACE = ("curl -s --max-time 15 {flag} --socks5-hostname 127.0.0.1:40000 "
         "https://www.cloudflare.com/cdn-cgi/trace")


def trace(flag=""):
    out = subprocess.run(TRACE.format(flag=flag), shell=True,
                         capture_output=True, text=True).stdout
    keep = [l.strip() for l in out.splitlines()
            if l.startswith(("ip=", "loc=", "warp=", "colo="))]
    return " ".join(keep) or "(sem resposta)"


def try_nike(label, session):
    P.session = session
    try:
        session.cookies.clear()
    except Exception:
        pass
    P.nike_warm_up()
    try:
        build_id = P.get_nike_build_id()
    except Exception as e:
        print(f"  buildId falhou: {e}")
        return f"{label}: buildId FALHOU"
    p1, _ = P.fetch_nike_page(build_id, 1)
    verdict = f"OK ({len(p1)} produtos)" if p1 is not None else "BLOQUEADO"
    print(f"\n>>> {label} | build {build_id} | página 1: {verdict}", flush=True)
    return f"{label}: {verdict}"


results = []
print(f"egress padrão : {trace()}")
print(f"egress -4     : {trace('-4')}")
print(f"egress -6     : {trace('-6')}")

results.append(try_nike("A) padrão (família livre)", cf_requests.Session()))

s4 = cf_requests.Session(curl_options={CurlOpt.IPRESOLVE: CURL_IPRESOLVE_V4})
results.append(try_nike("B) forçando IPv4", s4))

# Se o IPv4 passou, confirma que continua passando com outro IP de saída.
if results[-1].endswith(")") and "OK" in results[-1]:
    subprocess.run("bash warp_rotate.sh 127.0.0.1:40000", shell=True)
    print(f"egress -4 pós-rotação: {trace('-4')}")
    s4b = cf_requests.Session(curl_options={CurlOpt.IPRESOLVE: CURL_IPRESOLVE_V4})
    results.append(try_nike("C) IPv4 após rotação", s4b))

print("\n" + "=" * 60)
print("RESUMO")
for r in results:
    print(f"  {r}")
