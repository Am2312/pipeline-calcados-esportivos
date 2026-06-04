# Handoff — Receita Única dos gráficos (4 restantes)

**Data:** 2026-06-03
**Objetivo:** terminar de unificar a lógica dos gráficos do Sports Retail Dashboard com a apresentação Vulcabras, pra que "mexeu num lado → reflete no outro" valha de verdade (cálculo + desenho). Pedido do usuário: **MODELO + DESENHO (full)** — preservando o chrome de cada lado via `opts`.

---

## TL;DR do estado

**7 de 10 gráficos JÁ migrados, testados byte-a-byte e publicados ao vivo.** Faltam **3**.

| # | Gráfico | Status | Commit |
|---|---|---|---|
| 1 | market-share | ✅ feito | `5448ac9` |
| 2 | tam-mercado | ✅ feito | `1e3b5a7` |
| 3 | cost-index | ✅ feito | `8c30833` |
| 4 | caged-jobs | ✅ feito | `89f4db0` |
| 5 | headcount-volume | ✅ feito | `c815dbe` |
| 6 | sector-data | ✅ feito | `8990b77` |
| 7 | imports-data | ✅ feito (2 views: linha + empilhada) | `d85bf51` |
| — | tam-destaque | ✅ N/A | presentation-only (1 cópia só, nada a unificar) |
| 8 | **vulcabras-share** | ⏳ FALTA | — |
| 9 | **footwear-decomp** | ⏳ FALTA | — |
| 10 | **brand-gmv** | ⏳ FALTA | — |

Nenhuma edição pendente/inacabada. Tudo que foi tocado está commitado e no ar. **Nenhuma edição foi feita ainda para os 3 restantes.**

### imports-data — feito 2026-06-03 (commit `d85bf51`)
Canonical no registry: `window.buildImportsLineCanvas(canvas, {rows}, opts)` e `window.buildImportsStackedCanvas(canvas, {periods, topCountries, keys}, opts)`. `opts = {C, palette, grain, fmtMetric, fmtTooltip}` (formatters do lado, pois dependem de `importsState.metric`). As duas implementações (dash inline × PPT `charts_sports.js`) eram **byte-idênticas** salvo a escrita guardada da legenda no PPT → renderLineChart/renderStackedChart dos 2 lados agora só computam o top-3 países + escrevem `#imports-country-legend` (chrome por-lado) e delegam o desenho. CI: seção 14 em `check_single_recipe.mjs` (registry define as 2 fns + dash delega + dash sem os plugin-ids `importsLineLabels`/`importsStackLabels` inline). Verificado nos 2 lados: line (Total Imports, 352 pts) e stacked (Vietnam/Indonesia/China/Others, paleta, legenda) idênticos, console limpo.

---

## Arquivos e arquitetura (LEIA ANTES DE MEXER)

### Onde mora o quê
- **Repo (git):** `C:\Users\andre.martins\pipeline-calcados-esportivos` — pushes vão pra `main`; GitHub Pages serve `main/docs/`.
- **Índice compartilhado (NUVEM):** `docs/charts-registry.js` — é aqui que a lógica unificada vive. Servido em `https://am2312.github.io/pipeline-calcados-esportivos/charts-registry.js`.
- **Dashboard:** `docs/sports-retail-dashboard.html` — tem a lógica dos gráficos **inline**. Carrega `./charts-registry.js` (mesmo repo, local).
- **Apresentação (Drive, NÃO é git):** `G:\Shared drives\Investimentos\Companies\Consumer\Vulcabras\5. Constellation Presentations\1. Investment Committee\2026.06\`
  - `presentation-v2.html` — carrega `charts-registry.js` **da NUVEM** (cache-bust `?cb=Date.now()`), e `charts_dashboard.js` + `charts_sports.js` **LOCALmente** (mesma pasta).
  - `charts_dashboard.js` — funções PPT de TAM / market-share / caged / volume / cost-index (`getPresentation*`, `renderPresentation*`, `buildPresentation*`).
  - `charts_sports.js` — módulo `window.DASH` (sector, imports, vulcabras-share + helpers). **`imports-data`, `vulcabras-share` e `sector-data` são desenhados no PPT por `window.DASH`.**

### O ponto-chave (por que o "Refresh" não bastava)
O `charts-registry.js` da nuvem é o ÚNICO lugar de onde o PPT puxa lógica ao dar "Refresh Dashboard" (= `location.reload()`). Antes, cada gráfico tinha a lógica **duplicada** (dashboard inline × PPT local) e o registry só **chamava por nome**. A unificação move a lógica PRA DENTRO do registry; os dois lados passam a **delegar** pra mesma função. **Por isso o `charts-registry.js` PRECISA de push pra valer no PPT.** As edições no `charts_dashboard.js`/`charts_sports.js` do Drive valem no preview sem push (arquivo local), mas só funcionam DEPOIS que o registry com as fns novas estiver na nuvem.

---

## O PADRÃO (provado em 6 gráficos — siga igual)

Para cada gráfico:

1. **Ler as duas implementações** (dashboard inline + PPT). Identificar:
   - **MODELO** (dados → números/séries/eixos).
   - **DESENHO** (config Chart.js + plugins).
   - **CHROME** que difere entre os lados (fontes, padding, cor de eixo, animação, raio de badge).
2. **Conferir que a fonte de dados é compartilhada** (rodar eval no preview comparando outputs — ver "Como testar"). Em geral é (mesmos `data/*.js` da nuvem).
3. **Escrever o canonical no `charts-registry.js`** num IIFE, ANTES do comentário `/* ===== ... GRÁFICOS LEGADOS`. Convenção de nomes já usada:
   - `window.get<Nome>Model(...)` / `window.get<Nome>Stats(...)` (modelo)
   - `window.build<Nome>ChartCanvas(canvas, model, opts)` (desenho)
   - Estilo ES5-ish (`var`/`function`, `Math.max.apply(null, arr)`), porque o registry é assim. Diferenças de chrome viram `opts` com defaults = valores do dashboard; valores idênticos podem ser hardcoded.
4. **Religar o dashboard:** trocar o corpo inline pela chamada delegada, passando o chrome do dashboard via `opts`. Manter os "wrappers" por-lado (bindLegend, card, escrita de legenda no DOM).
5. **Religar o PPT** (`charts_dashboard.js` ou `charts_sports.js`): mesma delegação, passando o chrome do slide via `opts` (fonte escalada `window.__fonteRotuloPx`, eixo `#A6A6A6` bold, etc.). **Adicionar guard** `if (!window.build<Nome>ChartCanvas) return;` (porque o registry vem da nuvem e pode não ter carregado).
6. **Remover o código inline morto** dos dois arquivos.
7. **Testar paridade** (ver seção abaixo) — exigir saída idêntica.
8. **Adicionar trava no CI** (`scripts/check_single_recipe.mjs`, nova seção): registry define as fns + dashboard delega + (negativo) ausência de marcador inline. **Validar as regex com Python** (Node NÃO está instalado na máquina).
9. **Commit + push** (`docs/charts-registry.js`, `docs/sports-retail-dashboard.html`, `scripts/check_single_recipe.mjs`). Os arquivos do Drive (charts_dashboard.js/charts_sports.js) NÃO entram no git — edite-os direto.
10. **Verificar a nuvem** (poll `charts-registry.js?cb=...` pelo nome da fn nova; GH Pages rebuilda ~30–60s) e **reload do PPT** pra confirmar render lendo a nuvem real.

### Convenção de cores (idênticas dos dois lados → pode hardcodar no canonical)
- Dashboard `C`: `azulEscuro=#021C45`, `turquesa=#6FDDCB`, `cereja=#FF4F6C`, `azulEscuro40=#9AA8BB`, `azulEscuro60=#667D99`, `azulEscuro20=#CCD4DD`, `branco=#FFFFFF`.
- PPT `chartColors`: `navy=#021C45`, `turquoise=#6FDDCB`, `cherry=#FF4F6C`, `muted=#9AA8BB`, `mutedDark=#667D99`.
- **São iguais** pros pares correspondentes. (A `MS_PALETTE` do market-share é OUTRA coisa — paleta de barras, `window.MS_PALETTE`.)

### Chrome típico do PPT (slide) vs dashboard
- Fonte de rótulo: PPT usa `window.__fonteRotuloPx || 11` (escalada por slide); dashboard usa px fixo.
- Eixos PPT (padrão Constellation): cor `#A6A6A6`, `weight:'bold'`, size 9, `grid.drawTicks:false`, `border:{color:'#A6A6A6',width:1}`. Dashboard: cor `#9AA8BB` (ou `C.azulEscuro40`), normal, size ~10–11, borda varia por gráfico (`#CCD4DD`/`#CFD8E3`/`#C9D3DF`).
- `animation:false` no PPT (e em caged/volume do dashboard também; tam/cost/market-share/sector animam).
- Raio de badge (roundedRect): dashboard ~3, PPT ~1.
- **CUIDADO:** alguns gráficos do PPT desenhados por `window.DASH` (sector-data foi assim) são **BYTE-IDÊNTICOS** ao dashboard (sem escala de slide). SEMPRE diffar os dois antes de assumir chrome diferente.

---

## Canonicals já criados (referência do que existe no registry)
- `window.computeMarketShareModel(state, data)`, `window.buildMarketShareChartCanvas(canvas, model, opts)` + consts `window.MS_VULCABRAS`, `MS_TOP_SERIES`, `MS_OTHERS_COLOR`, `MS_PALETTE`.
- `window.getSportswearTamModel(state, data)`, `window.buildTamComboChartCanvas(canvas, model, opts)` + `window.SPORTSWEAR_TAM_COLORS`.
- `window.getCostIndexStats(rows, stdDev)`, `window.buildCostIndexChartCanvas(canvas, stats, opts)`.
- `window.getCagedJobsChartModel(rows, grain)`, `window.buildCagedJobsChartCanvas(canvas, model, opts)`.
- `window.getVolumeYoyModel(rows)`, `window.buildVolumeYoyChartCanvas(canvas, model, opts)`.
- `window.buildIndustryChartCanvas(canvas, model, opts)` (sector-data).
- Dados/configs compartilhados já existentes: `window.COST_INDEX` (CONFIG/seriesMap/blendedSeries), `window.SPORTSWEAR_TAM`, `window.CAGED_RAIS_2019_BASE`, `window.MS_PALETTE`.
- Trava de CI: seções **8–13** em `scripts/check_single_recipe.mjs`.

---

## Os 3 RESTANTES (com mapa do código)

### ✅ 7) imports-data — FEITO (commit `d85bf51`, ver detalhe no TL;DR acima)

### 8) vulcabras-share  ← FAÇA PRIMEIRO (próximo)
- Registry: `id:'vulcabras-share'`, `desenhar` chama `DASH.renderVulcabrasShareChart()`. (É o gráfico "Vulcabras — Market Share (Footwear)", DIFERENTE do market-share principal.)
- **Dashboard:** `renderVulcabrasShareChart` (~L1523) + `VULCABRAS_SHARE_STATE` + `selectedVulcabrasMarketShareRows` (~L1399) + `placeVulcabrasShareLabels`/`updateVulcabrasShareAxis`/`bindVulcabrasShareLegend`.
- **PPT:** `charts_sports.js` `window.DASH.renderVulcabrasShareChart` (export L5985). Diffar; unificar modelo+desenho.

### 9) footwear-decomp
- Registry: `id:'footwear-decomp'`, `desenhar` chama `R('buildFootwearDecompChart')(canvas, R('getFootwearDecompSeries')())` (R = `regResolve`, resolve por nome). Controles `FOOTWEAR_DECOMP_STATE`.
- **Dashboard:** `getFootwearDecompSeries`/`buildFootwearDecompChart`/`renderFootwearDecompChart`/`footwearDecompCardInner` (perto de `renderSportswearTamCards`, ~L2479).
- **PPT:** versões em `charts_dashboard.js` (ou `charts_sports.js`). Achar onde `regResolve` resolve esses nomes no PPT.
- **A FAZER:** definir `window.getFootwearDecompSeries`/`window.buildFootwearDecompChart` canônicas no registry; os dois lados delegam. (Como o registry já usa `R('...')`, se o canonical definir `window.buildFootwearDecompChart`, o `R` resolve pra ele — mas confirme que o dashboard passa a delegar também, senão é só mover a cópia de lugar.)

### 10) brand-gmv
- Registry: `id:'brand-gmv'`, `desenhar` chama `R('buildMarketShareBrandGmvChart')(canvas, R('getMarketShareBrandGmvModel')())`.
- **Dashboard:** `getMarketShareBrandGmvModel` (~L2623), `buildMarketShareBrandGmvChart` (~L2664), `MS_BRAND_GMV_CHART_STATE`.
- **PPT:** equivalente em `charts_dashboard.js`. Unificar modelo+desenho.

---

## Como testar (passo a passo provado)

### Servidores de preview (`.claude/launch.json` no diretório de trabalho "Dashboards AM")
- `docs-pages` → porta **8765**, serve `docs/` (o dashboard).
- `vulc-v2` → porta **7843**, serve a pasta `2026.06/` via `servidor.py` (a apresentação).
- **GOTCHA:** esses servidores python MORREM sozinhos de vez em quando. Se `preview_eval` der "Server not found", rode `preview_start` com o nome de novo (o serverId muda). Navegue com `window.location.href='http://localhost:8765/sports-retail-dashboard.html'` ou `.../7843/presentation-v2.html`.

### Verificar paridade do lado DASHBOARD (mesma origem → fetch funciona)
1. Reload do dashboard (8765). O `<script src="./charts-registry.js">` vem do **cache** do browser → fica velho. Por isso, injete o bloco fresco:
   ```js
   fetch('charts-registry.js?cb='+Date.now()).then(r=>r.text()).then(t=>{
     var start=t.indexOf('window.MS_VULCABRAS');         // começo dos canonicals
     var gl=t.indexOf('GRÁFICOS LEGADOS');
     var endBlock=t.lastIndexOf('/* =====', gl);
     (0,eval)(t.slice(start,endBlock));                  // define todos os window.* canonicals
   });
   ```
2. Construir o gráfico via canonical com os `opts` do dashboard E com os `opts` do PPT (em canvas offscreen) e comparar a config (datasets, scales, padding, cores) com os valores ORIGINAIS que você leu do código.
3. **GOTCHA Chart.js defaults:** ao ler `chart.options` de volta, o Chart.js PREENCHE defaults — `border.width=1`, `grid.drawTicks=true`, `animation={duration:1000,...}`. Então compare contra os defaults RESOLVIDOS, não contra `undefined`. (Foi o "falso negativo" em cost-index/caged.)
4. Comparar o MODELO canonical com a computação própria do dashboard (mesmas rows) — exigir match exato.

### Verificar o lado PPT
- Cross-origin fetch do PPT (7843) pra localhost:8765 é **BLOQUEADO (CORS)**. Então: ou (a) faça o push do registry e teste lendo a nuvem real, ou (b) cole as fns canônicas inline num `eval`. Na prática: faço o push, dou poll na nuvem, reload do PPT, e construo o gráfico com a fn da nuvem.
- Sempre confirme que o arquivo do Drive PARSEIA depois de editar: reload do 7843 e cheque `typeof window.DASH`, `typeof getPresentationMsModel`, etc. + `preview_console_logs` level error.

### Validar regex do CI sem Node
Node NÃO está instalado. Escreva um `.py` temporário que aplica as mesmas regex do `check_single_recipe.mjs` nos arquivos e imprime PASS/FAIL; rode com `python` no PowerShell; apague depois.

---

## Gotchas gerais
- **Commit message:** here-string do PowerShell quebra (`@'...'@`). Use `git commit -F arquivo.txt` (escreva a msg num temp, apague depois). Finalize com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Aviso de git author `andre.martins@const.local` é inofensivo.
- `preview_screenshot` dá timeout com frequência → verifique por `preview_eval` lendo `chart.options`/`chart.data`.
- GitHub Pages rebuilda em ~30–60s; o `?cb=` no poll fura cache.
- O dashboard tem MAIS gráficos do que os 15 do registry (caged churn, monthly comparison, vivara, revisions table, etc.) — NÃO mexer nesses; só nos 10 do índice.
- Editar dashboard/PPT só dentro deste escopo de unificação (o usuário pediu explicitamente). Não reduzir granularidade, não inventar mudança visual.

## Como retomar
"continua a unificação dos gráficos — lê o HANDOFF_SINGLE_RECIPE_REMAINING.md na raiz do repo `pipeline-calcados-esportivos`. Próximo: imports-data."
