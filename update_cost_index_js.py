"""Regenera docs/data/sports_retail_cost_index_data.js a partir do BigQuery.

Por que existe: a tabela materializada
`aster-data-platform.constellation_vibe_coding.sports_retail_cost_indices_weekly`
parou de ser atualizada em 2026-05-22, e desde entao as semanas vinham sendo
anexadas a mao. Como os 4 indices petroquimicos semanais (MERSPVHO, FINSESEA,
FINSBROT, MATSSTFB) so chegam ao warehouse ~7 dias DEPOIS da data do print, cada
append manual congelava a semana com o print da semana anterior (forward-fill) e
nunca revisava. Resultado: 10 semanas (2026-05-22 a 2026-07-24) ficaram defasadas.

Este script recalcula a serie inteira direto dos tickers Bloomberg, entao rodar de
novo CORRIGE a cauda automaticamente. Rode semanalmente (ou depois de ~quarta,
quando o print da sexta anterior ja aterrissou).

Receita (validada: reproduz 622 das 637 semanas do arquivo antigo com erro <1e-9;
as 15 diferencas sao justamente as semanas defasadas + 4 buracos de 2021):
  grade      = sextas, week_start = segunda da mesma semana
  cada serie = ultimo print disponivel <= week_date (forward-fill)
  pvc_usd    = MERSPVHO / 1015
  eva_usd    = 0.75*(FINSESEA/725) + 0.25*((VINYHUDO/USDCNY)/1084.535115488334)
  rubber_usd = 0.50*(FINSBROT/1335) + 0.50*(MATSSTFB/69.45)
  *_brl      = idem, cada componente convertido pelo USDBRL CURNCY da sexta,
               dividido pela base em BRL
  FX         = USDBRL CURNCY (nao CMPL) e USDCNY CURNCY

Semanas anteriores a GRID_START ficam intactas (bases/nulls daquele periodo nao
foram validados) - o script preserva essas linhas verbatim do arquivo atual.

Uso:  python update_cost_index_js.py [--dry-run]
"""

import argparse
import io
import json
import os
import shutil
from datetime import date, datetime, timedelta

from google.cloud import bigquery

PROJECT = "aster-data-platform"
JS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "docs", "data", "sports_retail_cost_index_data.js")

# primeira sexta em que MERSPVHO, FINSESEA, FINSBROT e MATSSTFB coexistem
GRID_START = date(2014, 5, 23)

HEADER = (
    "// Generated from BigQuery (bloomberg_trusted.daily_metric) por update_cost_index_js.py\r\n"
    "// Values are index levels, where each variable/currency starts at 1.0 on its first available base week.\r\n"
)

FIELDS = ["eva_brl", "eva_usd", "pvc_brl", "pvc_usd",
          "rubber_brl", "rubber_usd", "usdbrl", "usdcny"]

SQL = """
WITH pivoted AS (
  SELECT date,
    MAX(IF(ticker='MERSPVHO INDEX', value, NULL)) AS merspvho,
    MAX(IF(ticker='FINSESEA INDEX', value, NULL)) AS finsesea,
    MAX(IF(ticker='FINSBROT INDEX', value, NULL)) AS finsbrot,
    MAX(IF(ticker='MATSSTFB INDEX', value, NULL)) AS matsstfb,
    MAX(IF(ticker='VINYHUDO INDEX', value, NULL)) AS vinyhudo_cny,
    MAX(IF(ticker='USDCNY CURNCY',  value, NULL)) AS usdcny,
    MAX(IF(ticker='USDBRL CURNCY',  value, NULL)) AS usdbrl
  FROM `aster-data-platform.bloomberg_trusted.daily_metric`
  WHERE metric = 'px_last'
    AND ticker IN ('MERSPVHO INDEX','FINSESEA INDEX','FINSBROT INDEX','MATSSTFB INDEX',
                   'VINYHUDO INDEX','USDCNY CURNCY','USDBRL CURNCY')
  GROUP BY date
),
fridays AS (
  SELECT d AS date
  FROM UNNEST(GENERATE_DATE_ARRAY(@grid_start, @grid_end, INTERVAL 7 DAY)) AS d
),
cal AS (
  SELECT date, merspvho, finsesea, finsbrot, matsstfb, vinyhudo_cny, usdcny, usdbrl
  FROM pivoted
  UNION ALL
  SELECT date, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM fridays WHERE date NOT IN (SELECT date FROM pivoted)
),
ff AS (
  SELECT date,
    LAST_VALUE(merspvho     IGNORE NULLS) OVER w AS merspvho,
    LAST_VALUE(finsesea     IGNORE NULLS) OVER w AS finsesea,
    LAST_VALUE(finsbrot     IGNORE NULLS) OVER w AS finsbrot,
    LAST_VALUE(matsstfb     IGNORE NULLS) OVER w AS matsstfb,
    LAST_VALUE(vinyhudo_cny IGNORE NULLS) OVER w AS vinyhudo_cny,
    LAST_VALUE(usdcny       IGNORE NULLS) OVER w AS usdcny,
    LAST_VALUE(usdbrl       IGNORE NULLS) OVER w AS usdbrl
  FROM cal
  WINDOW w AS (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT
  FORMAT_DATE('%Y-%m-%d', ff.date) AS week_date,
  FORMAT_DATE('%Y-%m-%d', DATE_SUB(ff.date, INTERVAL 4 DAY)) AS week_start,
  usdbrl, usdcny,
  merspvho / 1015.0 AS pvc_usd,
  (merspvho * usdbrl) / 2001.377 AS pvc_brl,
  0.75 * (finsesea / 725.0)
    + 0.25 * ((vinyhudo_cny / usdcny) / 1084.535115488334) AS eva_usd,
  0.75 * ((finsesea * usdbrl) / 2806.644)
    + 0.25 * (((vinyhudo_cny / usdcny) * usdbrl) / 2241.4174241814817) AS eva_brl,
  0.5 * (finsbrot / 1335.0) + 0.5 * (matsstfb / 69.45) AS rubber_usd,
  0.5 * ((finsbrot * usdbrl) / 2968.1055)
    + 0.5 * ((matsstfb * usdbrl) / 154.408185) AS rubber_brl
FROM ff
JOIN fridays USING (date)
ORDER BY ff.date
"""


WEEKLY_TICKERS = ["MERSPVHO INDEX", "FINSESEA INDEX", "FINSBROT INDEX", "MATSSTFB INDEX"]


def last_complete_friday(today=None):
    """Ultima sexta <= hoje (se hoje for sexta, ela mesma)."""
    today = today or date.today()
    return today - timedelta(days=(today.weekday() - 4) % 7)


def last_published_friday(client):
    """Ultima sexta em que os 4 indices semanais JA tem print no warehouse.

    Esses indices chegam ~7 dias depois da data do print. Cortar a grade aqui
    evita que o arquivo termine numa linha forward-filled (que pareceria uma
    semana nova de custo quando na verdade so o FX e o VINYHUDO se moveram).
    """
    sql = """
    SELECT MIN(max_date) AS grid_end FROM (
      SELECT ticker, MAX(date) AS max_date
      FROM `aster-data-platform.bloomberg_trusted.daily_metric`
      WHERE metric = 'px_last' AND ticker IN UNNEST(@tickers)
      GROUP BY ticker
    )
    """
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ArrayQueryParameter("tickers", "STRING", WEEKLY_TICKERS)])
    grid_end = list(client.query(sql, job_config=cfg).result())[0]["grid_end"]
    # alinha na sexta da semana do print
    return grid_end - timedelta(days=(grid_end.weekday() - 4) % 7)


def read_existing():
    text = io.open(JS_PATH, encoding="utf-8-sig").read()
    rows = json.loads(text[text.index("["):text.rindex("]") + 1])
    return rows


def fetch(client, grid_end):
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("grid_start", "DATE", GRID_START),
        bigquery.ScalarQueryParameter("grid_end", "DATE", grid_end),
    ])
    return [dict(r) for r in client.query(SQL, job_config=cfg).result()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="mostra o diff e nao escreve o arquivo")
    args = ap.parse_args()

    client = bigquery.Client(project=PROJECT)
    grid_end = last_published_friday(client)
    print("ultima sexta com print dos 4 indices semanais: %s (hoje: %s, ultima sexta: %s)"
          % (grid_end, date.today(), last_complete_friday()))
    old = read_existing()
    new_tail = fetch(client, grid_end)

    kept = [r for r in old if date.fromisoformat(r["week_date"]) < GRID_START]
    rebuilt = []
    for r in new_tail:
        row = {"week_date": r["week_date"], "week_start": r["week_start"]}
        for f in FIELDS:
            row[f] = r[f]
        rebuilt.append(row)

    rows = kept + rebuilt
    assert len({r["week_date"] for r in rows}) == len(rows), "week_date duplicado"
    steps = {(date.fromisoformat(rows[i + 1]["week_date"])
              - date.fromisoformat(rows[i]["week_date"])).days
             for i in range(len(rows) - 1)}
    assert steps == {7}, "grade semanal quebrada: %s" % steps

    # diff vs arquivo atual
    old_by = {r["week_date"]: r for r in old}
    changed, added = [], []
    for r in rebuilt:
        prev = old_by.get(r["week_date"])
        if prev is None:
            added.append(r["week_date"])
            continue
        for f in FIELDS:
            a, b = prev.get(f), r[f]
            if a is None and b is None:
                continue
            if a is None or b is None or abs(a - b) > 1e-9 * max(abs(b), 1e-12):
                changed.append((r["week_date"], f, a, b))

    print("grade: %s -> %s (%d semanas, %d preservadas antes de %s)"
          % (rows[0]["week_date"], rows[-1]["week_date"], len(rows), len(kept), GRID_START))
    print("semanas novas: %s" % (added or "nenhuma"))
    print("valores corrigidos: %d" % len(changed))
    for wd, f, a, b in changed:
        sa = "None" if a is None else "%.6f" % a
        sb = "None" if b is None else "%.6f" % b
        print("  %s %-11s %14s -> %-14s" % (wd, f, sa, sb))

    if args.dry_run:
        print("\n--dry-run: nada escrito")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = "%s.bak-%s" % (JS_PATH, stamp)
    shutil.copy2(JS_PATH, backup)

    body = json.dumps(rows, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
    out = HEADER + "window.SPORTS_RETAIL_COST_INDEX_DATA = " + body + ";\r\n"
    io.open(JS_PATH, "w", encoding="utf-8", newline="").write(out)
    print("\nescrito: %s" % JS_PATH)
    print("backup:  %s" % backup)


if __name__ == "__main__":
    main()
