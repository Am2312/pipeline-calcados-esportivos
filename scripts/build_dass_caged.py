"""
Gera docs/data/dass_nordeste_caged_data.js (Grupo Dass — CAGED por município).
Mesma metodologia do vulcabras (município × CNAE, anonimizado; âncora RAIS 31/12/2019;
empregos = base + saldo acumulado). Fonte: Novo CAGED (CAGEDMOV no prazo). Grosso via
basedosdados (BigQuery); cauda (meses não cobertos) via FTP do MTE (dass_caged_tail.py).

Dois segmentos:
  footwear (CNAE 15xx, 5 subclasses) — Dass Nordeste BA/CE + Dass Nordeste/Sul RS (Ivoti, Venâncio Aires)
  apparel  (CNAE 14, confecção)      — Dass Nordeste BA (Iguaí, VdC, Ibicuí) + Dass Sul SC (Saudades)
Arquivo combinado: municipalities[] com {scope,uf,segment,base2019}; rows[] por município×segmento (sem Total).
Contaminação (1 - share Dass via RAIS 2023) documentada no dashboard.
"""
import json, os, datetime
from google.cloud import bigquery

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'docs', 'data', 'dass_nordeste_caged_data.js')
TAIL = os.environ.get('DASS_TAIL_JSON') or os.path.join(HERE, 'dass_tail.json')

FOOT_CNAES = ['1531901', '1532700', '1533500', '1539400', '1540800']
# scope -> (ibge7, uf, segment, base2019_RAIS)
MUNIS = [
    ('Santo Estêvão/BA', '2928802', 'BA', 'footwear', 3469),
    ('Itaberaba/BA', '2914703', 'BA', 'footwear', 1741),
    ('Vitória da Conquista/BA', '2933307', 'BA', 'footwear', 1817),
    ('Santo Antônio de Jesus/BA', '2928703', 'BA', 'footwear', 497),
    ('Itapipoca/CE', '2306405', 'CE', 'footwear', 2527),
    ('Ivoti/RS', '4310801', 'RS', 'footwear', 760),
    ('Venâncio Aires/RS', '4322608', 'RS', 'footwear', 119),
    ('Vitória da Conquista/BA', '2933307', 'BA', 'apparel', 2378),
    ('Iguaí/BA', '2913507', 'BA', 'apparel', 1),
    ('Ibicuí/BA', '2912301', 'BA', 'apparel', 0),
    ('Saudades/SC', '4217303', 'SC', 'apparel', 835),
]
foot7 = sorted({m[1] for m in MUNIS if m[3] == 'footwear'})
app7 = sorted({m[1] for m in MUNIS if m[3] == 'apparel'})
# (ibge7, segment) -> scope
KEY2SCOPE = {(m[1], m[3]): m[0] for m in MUNIS}

client = bigquery.Client(project='aster-data-platform')

def run(munis, where_cnae, params):
    sql = f"""
    SELECT id_municipio AS m, ano, mes,
      COUNTIF(saldo_movimentacao=1) AS adm, COUNTIF(saldo_movimentacao=-1) AS sep
    FROM `basedosdados.br_me_caged.microdados_movimentacao`
    WHERE id_municipio IN UNNEST(@munis) AND {where_cnae} AND ano >= 2020
    GROUP BY m, ano, mes"""
    return client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()

# data[period][(scope,segment)] = [adm, sep]
data = {}
bulk_max = 0
def absorb(rows, segment):
    global bulk_max
    for r in rows:
        period = f"{r.ano}{r.mes:02d}"
        bulk_max = max(bulk_max, r.ano * 100 + r.mes)
        scope = KEY2SCOPE[(r.m, segment)]
        data.setdefault(period, {})[(scope, segment)] = [int(r.adm), int(r.sep)]

absorb(run(foot7, 'cnae_2_subclasse IN UNNEST(@cnaes)', [
    bigquery.ArrayQueryParameter('munis', 'STRING', foot7),
    bigquery.ArrayQueryParameter('cnaes', 'STRING', FOOT_CNAES)]), 'footwear')
absorb(run(app7, "SUBSTR(cnae_2_subclasse,1,2)='14'", [
    bigquery.ArrayQueryParameter('munis', 'STRING', app7)]), 'apparel')

# --- cauda (MTE), só meses além do basedosdados; chaves "scope||segment" ---
with open(TAIL, encoding='utf-8') as f:
    tail = json.load(f)
tail_added = []
for ym, agg in tail.items():
    if int(ym) <= bulk_max:
        continue
    tail_added.append(ym)
    for k, (a, s) in agg.items():
        scope, segment = k.split('||')
        data.setdefault(ym, {})[(scope, segment)] = [int(a), int(s)]

# --- rows por município × segmento (sem Total) ---
rows = []
for period in sorted(data):
    year, month = int(period[:4]), int(period[4:])
    for (scope, segment) in sorted(data[period]):
        a, s = data[period][(scope, segment)]
        rows.append({"period": period, "year": year, "month": month, "scope": scope,
                     "segment": segment, "admissions": a, "separations": s, "net": a - s, "movements": a + s})

municipalities = [{"scope": m[0], "uf": m[2], "segment": m[3], "base2019": m[4]} for m in MUNIS]
obj = {
    "generated_at": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    "source": "Novo CAGED / MTE public unidentified microdata",
    "municipalities": municipalities,
    "cnaes": {"footwear": FOOT_CNAES, "apparel": "CNAE 14 (confecção do vestuário)"},
    "rows": rows,
}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("window.DASS_NORDESTE_CAGED_DATA = ")
    json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    f.write(";\n")

# --- sanity ---
def base(seg, ufs):
    return sum(m[4] for m in MUNIS if m[3] == seg and m[2] in ufs)
def endjobs(seg, ufs):
    b = base(seg, ufs)
    net = sum(r["net"] for r in rows if r["segment"] == seg and r["scope"].split('/')[1] in ufs)
    return b, b + net
periods = sorted(data)
print(f"bulk_max={bulk_max}  tail_added={tail_added}  períodos {periods[0]}..{periods[-1]} ({len(periods)})")
for seg in ('footwear', 'apparel'):
    bNE, jNE = endjobs(seg, {'BA', 'CE'})
    bAll, jAll = endjobs(seg, {'BA', 'CE', 'RS', 'SC'})
    print(f"{seg}: base NE={bNE} jobsNE={jNE} | base Todas={bAll} jobsTodas={jAll}")
print("OK ->", os.path.abspath(OUT))
