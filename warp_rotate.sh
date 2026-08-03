#!/usr/bin/env bash
# Rotaciona o IP de saída do Cloudflare WARP (modo proxy SOCKS5).
#
# Por quê: o Akamai da Nike aceita ALGUNS IPs de saída do WARP e nega outros
# ("Access Denied" já na página 1). O WARP grátis sorteia o IP na conexão, então
# desde 2026-07-28 a run passava só ~3 de 7 dias. Trocar a REGISTRATION (nova
# identidade) sorteia outro IP — só disconnect/connect costuma devolver o mesmo.
#
# Uso: bash warp_rotate.sh [host:porta_socks]   (default 127.0.0.1:40000)
# Sai 0 quando o WARP volta conectado (warp=on), 1 caso contrário.
set -uo pipefail

PROXY="${1:-127.0.0.1:40000}"

trace() {
  curl -s --max-time 15 --socks5-hostname "$PROXY" https://www.cloudflare.com/cdn-cgi/trace \
    | tr -d '\r' | awk -F= '/^(ip|loc|warp)=/{printf "%s=%s ", $1, $2}'
}

echo "  [warp_rotate] antes:  $(trace)"

warp-cli --accept-tos disconnect              >/dev/null 2>&1 || true
sleep 2
warp-cli --accept-tos registration delete     >/dev/null 2>&1 \
  || warp-cli --accept-tos delete             >/dev/null 2>&1 || true
sleep 2
warp-cli --accept-tos registration new        >/dev/null 2>&1 \
  || warp-cli --accept-tos register           >/dev/null 2>&1 || true
warp-cli --accept-tos mode proxy              >/dev/null 2>&1 \
  || warp-cli --accept-tos set-mode proxy     >/dev/null 2>&1 || true
warp-cli --accept-tos connect                 >/dev/null 2>&1 || true

for i in $(seq 1 20); do
  sleep 3
  t="$(trace)"
  case "$t" in
    *warp=on*) echo "  [warp_rotate] depois: $t"; exit 0 ;;
  esac
  # a cada 5 tentativas, insiste no connect (o svc às vezes demora a registrar)
  if [ $((i % 5)) -eq 0 ]; then
    warp-cli --accept-tos connect >/dev/null 2>&1 || true
  fi
done

echo "  [warp_rotate] ERRO: WARP não voltou (warp=on) após a rotação"
exit 1
