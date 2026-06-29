"""
Gera docs/data/dass_nordeste_caged_data.js — mesma metodologia do vulcabras_caged_data.js.
Fonte: Novo CAGED (CAGEDMOV, movimentação no prazo). Grosso via basedosdados (BigQuery),
cauda (meses não cobertos pelo basedosdados) via FTP do MTE (ver dass_caged_tail.py no scratchpad).
Municípios "limpos" (Dass domina o CNAE de calçados): Santo Estêvão, Itaberaba,
Vitória da Conquista, Santo Antônio de Jesus, Itapipoca. Âncora RAIS 31/12/2019 = 10.051.
"""
import json, os, datetime
from google.cloud import bigquery

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'docs', 'data', 'dass_nordeste_caged_data.js')
TAIL = os.environ.get('DASS_TAIL_JSON') or os.path.join(HERE, 'dass_tail.json')

MUNI7 = {  # IBGE 7 dígitos (basedosdados) -> nome (scope)
 '2928802':'Santo Estêvão/BA','2914703':'Itaberaba/BA','2933307':'Vitória da Conquista/BA',
 '2928703':'Santo Antônio de Jesus/BA','2306405':'Itapipoca/CE',
}
MUNI6 = {  # chaves de filters (6 dígitos, igual padrão Vulcabras)
 '292880':'Santo Estêvão/BA','291470':'Itaberaba/BA','293330':'Vitória da Conquista/BA',
 '292870':'Santo Antônio de Jesus/BA','230640':'Itapipoca/CE',
}
CNAES = {
 '1531901':'Footwear manufacturing - leather',
 '1532700':'Sneaker manufacturing - any material',
 '1533500':'Footwear manufacturing - synthetic material',
 '1539400':'Footwear manufacturing - other materials',
 '1540800':'Footwear parts manufacturing',
}

client = bigquery.Client(project='aster-data-platform')

# --- grosso (basedosdados) ---
sql = """
SELECT id_municipio AS m, ano, mes,
  COUNTIF(saldo_movimentacao=1) AS adm,
  COUNTIF(saldo_movimentacao=-1) AS sep
FROM `basedosdados.br_me_caged.microdados_movimentacao`
WHERE id_municipio IN UNNEST(@munis)
  AND cnae_2_subclasse IN UNNEST(@cnaes)
  AND ano >= 2020
GROUP BY m, ano, mes
"""
job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
    bigquery.ArrayQueryParameter('munis','STRING',list(MUNI7.keys())),
    bigquery.ArrayQueryParameter('cnaes','STRING',list(CNAES.keys())),
]))
# data[period][scope] = [adm, sep]
data = {}
bulk_max = 0
for r in job.result():
    period = f"{r.ano}{r.mes:02d}"
    bulk_max = max(bulk_max, r.ano*100+r.mes)
    data.setdefault(period, {})[MUNI7[r.m]] = [int(r.adm), int(r.sep)]

# --- cauda (MTE FTP), só meses além do basedosdados ---
with open(TAIL, encoding='utf-8') as f:
    tail = json.load(f)
tail_added = []
for ym, agg in tail.items():
    if int(ym) <= bulk_max:
        continue
    tail_added.append(ym)
    for name, (a, s) in agg.items():
        data.setdefault(ym, {})[name] = [int(a), int(s)]

# --- monta rows (por município + Total), ordenado ---
rows = []
for period in sorted(data):
    year, month = int(period[:4]), int(period[4:])
    scopes = data[period]
    tot_a = tot_s = 0
    for name in sorted(scopes):
        a, s = scopes[name]
        tot_a += a; tot_s += s
        rows.append({"period":period,"year":year,"month":month,"scope":name,
                     "admissions":a,"separations":s,"net":a-s,"movements":a+s})
    rows.append({"period":period,"year":year,"month":month,"scope":"Total",
                 "admissions":tot_a,"separations":tot_s,"net":tot_a-tot_s,"movements":tot_a+tot_s})

obj = {
 "generated_at": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
 "source": "Novo CAGED / MTE public unidentified microdata",
 "rais_2019_base": 10051,
 "filters": {"municipalities": MUNI6, "cnaes": CNAES},
 "rows": rows,
}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("window.DASS_NORDESTE_CAGED_DATA = ")
    json.dump(obj, f, ensure_ascii=False, separators=(',',':'))
    f.write(";\n")

# --- reconciliação / sanity ---
periods = sorted(data)
def tnet(p):
    s = data[p]; return sum(v[0]-v[1] for v in s.values())
print(f"bulk_max={bulk_max}  tail_added={tail_added}")
print(f"períodos: {periods[0]} .. {periods[-1]}  ({len(periods)} meses)")
print(f"base RAIS 2019 = 10051; soma acumulada do net = {sum(tnet(p) for p in periods)}")
print(f"empregos estimados no fim = {10051 + sum(tnet(p) for p in periods)}")
print("últimos 6 meses (net Total):", [(p, tnet(p)) for p in periods[-6:]])
print("OK ->", os.path.abspath(OUT))
