"""Sonda TEMPORÁRIA: a rotação do WARP (warp_rotate.sh) troca o IP de saída e
algum desses IPs passa no Akamai da Nike?

Roda N rodadas: mostra o IP de saída atual, tenta a página 1 da Nike com o mesmo
fingerprint do pipeline, e rotaciona. Remover depois de validar.
"""
import os
import subprocess
import sys

os.environ.setdefault("NIKE_PROXY", "socks5h://127.0.0.1:40000")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pipeline_adidas_nike_bq as P  # noqa: E402

ROUNDS = int(os.environ.get("PROBE_ROUNDS", "5"))
TRACE = ("curl -s --max-time 15 --socks5-hostname 127.0.0.1:40000 "
         "https://www.cloudflare.com/cdn-cgi/trace")


def trace():
    out = subprocess.run(TRACE, shell=True, capture_output=True, text=True).stdout
    keep = [l.strip() for l in out.splitlines()
            if l.startswith(("ip=", "loc=", "warp=", "colo="))]
    return " ".join(keep) or "(sem resposta)"


results = []
for i in range(1, ROUNDS + 1):
    egress = trace()
    P.session.cookies.clear()
    P.nike_warm_up()
    try:
        build_id = P.get_nike_build_id()
    except Exception as e:
        build_id = None
        print(f"  buildId falhou: {e}")
    p1 = None
    if build_id:
        p1, _ = P.fetch_nike_page(build_id, 1)
    verdict = f"OK ({len(p1)} produtos)" if p1 is not None else "BLOQUEADO"
    print(f"\n>>> rodada {i}/{ROUNDS} | {egress} | página 1: {verdict}", flush=True)
    results.append((egress, verdict))
    if i < ROUNDS:
        subprocess.run("bash warp_rotate.sh 127.0.0.1:40000", shell=True)

print("\n" + "=" * 60)
print("RESUMO")
for i, (egress, verdict) in enumerate(results, 1):
    print(f"  {i}: {egress} -> {verdict}")
ips = {r[0].split()[0] for r in results}
oks = sum(1 for r in results if r[1].startswith("OK"))
print(f"IPs distintos: {len(ips)} de {len(results)} rodadas | páginas 1 OK: {oks}")
