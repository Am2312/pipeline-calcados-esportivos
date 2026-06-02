/* =====================================================================
   charts-registry.js — ÍNDICE DE GRÁFICOS COMPARTILHADO
   (single source of truth: declarar UMA vez → aparece no dashboard E na
    apresentação Vulcabras `presentation-v2.html`)
   =====================================================================

   Como usar (registrar um gráfico):

     registerChart({
       id:      'meu-grafico',                 // único, kebab-case
       titulo:  'Meu Gráfico',                 // nome exibido (menu + título do slide)
       unidade: '(BRL bn, Percentage)',        // subtítulo, no padrão dos cards do dashboard
       desenhar(canvas) {                       // OBRIGATÓRIO: desenha no <canvas> e RETORNA o Chart
         return new Chart(canvas.getContext('2d'), { ... });
       },
       controles: [                             // OPCIONAL: a apresentação monta a barra de seletores sozinha
         { key:'from', label:'From',
           opcoes: () => [{v:'2020', t:'2020'}, {v:'2021', t:'2021'}],  // ou ['2020','2021']
           get:    () => state.from,            // valor atual (p/ salvar a seleção)
           set:    (v) => { state.from = v; } } // aplica a escolha (a apresentação chama e redesenha)
       ],
       legendaDinamica() { return [{cor:'#002554', texto:'Série A'}]; }  // OPCIONAL; senão usa as séries do próprio gráfico
     });

   A apresentação lê este arquivo ao vivo e, pra cada entrada que ainda NÃO
   exista no seu catálogo, gera automaticamente um gráfico no molde Constellation
   (título/subtítulo/fonte/legenda/margens já padronizados) com os seletores
   declarados em `controles`. De-dup por `id` (entrada manual da apresentação vence).
   ===================================================================== */
(function () {
  window.DASHBOARD_CHARTS = window.DASHBOARD_CHARTS || [];
  // registra (ou substitui, se o id já existir → idempotente em reload)
  window.registerChart = function (def) {
    if (!def || !def.id) { console.warn('[charts-registry] entrada sem id ignorada', def); return; }
    var i = window.DASHBOARD_CHARTS.findIndex(function (d) { return d.id === def.id; });
    if (i >= 0) window.DASHBOARD_CHARTS[i] = def; else window.DASHBOARD_CHARTS.push(def);
  };
  // Resolve a função/estado de desenho onde quer que ele esteja: namespace DASH
  // (presentação carrega charts_sports.js → window.DASH) OU global (dashboard, inline).
  // Deixa a MESMA entrada do registry servir aos dois ambientes p/ gráficos legados.
  window.regResolve = function (name) {
    if (window.DASH && window.DASH[name] !== undefined) return window.DASH[name];
    return window[name];
  };
  // Vários gráficos legados desenham via getElementById(id FIXO). Se o mesmo gráfico
  // aparece em 2+ slides, o id colide e o desenho vai pro canvas errado (slide visível
  // fica em branco). regClaimId garante que o id fixo SEMPRE aponte pro canvas atual:
  // remove o id de qualquer outro elemento e o crava no canvas que vai ser desenhado agora.
  window.regClaimId = function (canvas, id) {
    var prev = document.getElementById(id);
    if (prev && prev !== canvas) prev.removeAttribute('id');
    canvas.id = id;
    return canvas;
  };
})();

/* =====================================================================
   DADOS/LÓGICA COMPARTILHADA — "receita única" por gráfico.
   A config + o cálculo das séries moram AQUI (1 lugar) e os dois lados
   (dashboard inline + apresentação charts_dashboard.js) consomem daqui.
   Assim, uma mudança de opção/série não diverge mais entre as telas.
   ===================================================================== */

/* ---- COST INDEX (Cost Index — Historical Distribution) -------------- */
window.COST_INDEX = window.COST_INDEX || (function () {
  // Pesos: 20.0% EVA + 7.5% Rubber + 7.5% PVC do custo total, renormalizados p/ 35% → 100%.
  var WEIGHTS = { eva: 0.20 / 0.35, rubber: 0.075 / 0.35, pvc: 0.075 / 0.35 };
  var CONFIG = {
    eva:     { label: 'EVA', description: '75% Ethylene CFR SE Asia + 25% Vinyl Acetate Huadong converted to USD', fields: { usd: 'eva_usd', brl: 'eva_brl' } },
    pvc:     { label: 'PVC', description: 'PVC Houston FAS', fields: { usd: 'pvc_usd', brl: 'pvc_brl' } },
    rubber:  { label: 'Rubber', description: '50% Butadiene Rotterdam + 50% Styrene FOB US Gulf', fields: { usd: 'rubber_usd', brl: 'rubber_brl' } },
    blended: { label: 'Petrochemical Cost Index', description: 'Weighted basket — 57.1% EVA + 21.4% Rubber + 21.4% PVC (the 20.0% / 7.5% / 7.5% of total cost, renormalized to 100%). Each component rebased to 1.0 at 2014-05-23, the first week all three series are available, so the index reflects only relative variation.', fields: { usd: 'eva_usd', brl: 'eva_brl' } }
  };
  // ordem dos seletores (default primeiro = blended, igual ao dashboard)
  var ORDER = ['blended', 'eva', 'pvc', 'rubber'];
  function blendedSeries(currency) {
    var f = { eva: 'eva_' + currency, pvc: 'pvc_' + currency, rubber: 'rubber_' + currency };
    var data = (window.SPORTS_RETAIL_COST_INDEX_DATA || [])
      .filter(function (row) { return [f.eva, f.pvc, f.rubber].every(function (k) { return row[k] !== null && row[k] !== undefined; }); })
      .sort(function (a, b) { return a.week_date.localeCompare(b.week_date); });
    var map = new Map();
    if (!data.length) return map;
    var base = data[0];
    var b = { eva: Number(base[f.eva]), pvc: Number(base[f.pvc]), rubber: Number(base[f.rubber]) };
    data.forEach(function (row) {
      map.set(row.week_date,
        WEIGHTS.eva * (Number(row[f.eva]) / b.eva) +
        WEIGHTS.rubber * (Number(row[f.rubber]) / b.rubber) +
        WEIGHTS.pvc * (Number(row[f.pvc]) / b.pvc));
    });
    return map;
  }
  // Map<week_date, value> p/ qualquer variável (blended computa a cesta; senão lookup do campo).
  function seriesMap(variable, currency) {
    if (variable === 'blended') return blendedSeries(currency);
    var cfg = CONFIG[variable] || CONFIG.eva;
    var field = cfg.fields[currency] || cfg.fields.usd;
    var map = new Map();
    (window.SPORTS_RETAIL_COST_INDEX_DATA || []).forEach(function (row) {
      var v = row[field];
      if (v !== null && v !== undefined && Number.isFinite(Number(v))) map.set(row.week_date, Number(v));
    });
    return map;
  }
  return { CONFIG: CONFIG, WEIGHTS: WEIGHTS, ORDER: ORDER, blendedSeries: blendedSeries, seriesMap: seriesMap };
})();

/* ---- SPORTSWEAR TAM (Euromonitor) — dados de mercado p/ TAM + Highlight -
   Dado duplicado historicamente (dashboard SPORTSWEAR_TAM × apresentação
   sportswearTamData). Agora mora aqui; os 2 lados leem daqui. -------------- */
window.SPORTSWEAR_TAM = window.SPORTSWEAR_TAM || {
  years:    [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  apparel:  [9226.8, 10144.8, 11181.6, 11763.1, 11390.2, 10477.8, 11611, 11238, 11044.1, 9920.4, 10836.3, 11345.8, 12457.7, 13686, 15322.4],
  footwear: [10275.3, 11211.8, 12278, 13697.3, 13278.2, 12709.9, 13008.4, 13355.2, 14077.8, 11732.6, 13769, 14778.9, 16679.2, 18717.4, 21486.7]
};

/* ---- CAGED: base RAIS 2019 (calibra o estoque de empregos formais) -----
   Constante duplicada (dashboard CAGED_RAIS_2019_BASE × apresentação cagedRais2019Base). */
window.CAGED_RAIS_2019_BASE = window.CAGED_RAIS_2019_BASE || 13105;

/* ---- Market Share / Brand GMV: paleta de cores (cosmética) -------------
   Duplicada (dashboard MS_PALETTE × apresentação MS_PALETTE). */
window.MS_PALETTE = window.MS_PALETTE || ['#021C45', '#72D1C6', '#FF5473', '#2EA5F5', '#6D7E98', '#6A2C70', '#9AA8BB', '#CCD4DD'];

/* =====================================================================
   GRÁFICOS LEGADOS — declarados UMA vez aqui; a lógica de desenho mora
   onde já está (presentação: window.DASH via charts_sports.js; dashboard:
   inline). `dashboardNative:true` = o dashboard JÁ desenha esse gráfico
   nativamente (não criar aba duplicada); a apresentação o consome daqui.
   ===================================================================== */
(function () {
  var R = window.regResolve;
  var anosDecomp = function () {
    var all = (R('footwearDecompAllYears') ? R('footwearDecompAllYears')() : []) || [];
    return all.map(function (d) { return { v: d.year, t: String(d.year) }; });
  };
  registerChart({
    id: 'footwear-decomp',
    titulo: 'Footwear Growth Breakdown',
    unidade: '(Percentage)',
    dashboardNative: true,
    desenhar: function (canvas) {
      return R('buildFootwearDecompChart')(canvas, R('getFootwearDecompSeries')());
    },
    controles: [
      { key: 'from', label: 'From', opcoes: anosDecomp,
        get: function () { return R('FOOTWEAR_DECOMP_STATE').from; },
        set: function (v) { R('FOOTWEAR_DECOMP_STATE').from = +v; } },
      { key: 'to', label: 'To', opcoes: anosDecomp,
        get: function () { return R('FOOTWEAR_DECOMP_STATE').to; },
        set: function (v) { R('FOOTWEAR_DECOMP_STATE').to = +v; } }
    ]
  });

  var anosGmv = function () {
    return ((R('msData') ? R('msData')().years : []) || []).map(function (y) { return { v: y, t: String(y) }; });
  };
  registerChart({
    id: 'brand-gmv',
    titulo: 'Brand GMV — Footwear + Apparel',
    unidade: '(BRL bn, Percentage)',
    dashboardNative: true,
    desenhar: function (canvas) {
      return R('buildMarketShareBrandGmvChart')(canvas, R('getMarketShareBrandGmvModel')());
    },
    controles: [
      { key: 'brand', label: 'Brand',
        opcoes: function () {
          var all = (R('msAllBrandNames') ? R('msAllBrandNames')() : []) || [];
          var rest = all.filter(function (n) { return n !== 'Vulcabras'; });
          return ['Vulcabras'].concat(rest).map(function (b) { return { v: b, t: b }; });
        },
        get: function () { return R('MS_BRAND_GMV_CHART_STATE').brand; },
        set: function (v) { R('MS_BRAND_GMV_CHART_STATE').brand = v; } },
      { key: 'from', label: 'From', opcoes: anosGmv,
        get: function () { return R('MS_BRAND_GMV_CHART_STATE').from; },
        set: function (v) { R('MS_BRAND_GMV_CHART_STATE').from = +v; } },
      { key: 'to', label: 'To', opcoes: anosGmv,
        get: function () { return R('MS_BRAND_GMV_CHART_STATE').to; },
        set: function (v) { R('MS_BRAND_GMV_CHART_STATE').to = +v; } }
    ]
  });
})();

/* ---------------------------------------------------------------------
   DASH render*-based (Sector, Imports, Vulcabras Share) — relocados
   VERBATIM da apresentação. Imperativos (trazem os próprios controles);
   usam window.DASH (só são invocados na apresentação). dashboardNative.
   legendaDinamica omitida de propósito → a engine usa legendaDoChart.
   --------------------------------------------------------------------- */
registerChart({
  id: 'sector-data',
  titulo: 'Sports Footwear — Sector Data',
  unidade: '(mn pairs, Percentage)',
  dashboardNative: true,
  desenhar: function (canvas) { regClaimId(canvas, 'industry-main-chart'); DASH.renderIndustryChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    var metricOps = Object.keys(DASH.SECTOR_METRICS).map(function (k) { return '<option value="' + k + '">' + DASH.SECTOR_METRICS[k].label + '</option>'; }).join('');
    var yrs = Array.from(new Set(DASH.sectorRows().map(function (r) { return String(r.data_year); })));
    var ops = yrs.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    return '<label>Metric <select data-sec="metric">' + metricOps + '</select></label>' +
           '<label>From <select data-sec="from">' + ops + '</select></label>' +
           '<label>To <select data-sec="to">' + ops + '</select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var m = box.querySelector('[data-sec="metric"]'), f = box.querySelector('[data-sec="from"]'), t = box.querySelector('[data-sec="to"]');
    var yrs = Array.from(new Set(DASH.sectorRows().map(function (r) { return String(r.data_year); })));
    if (!DASH.sectorState.from) DASH.sectorState.from = yrs[0];
    if (!DASH.sectorState.to) DASH.sectorState.to = yrs[yrs.length - 1];
    m.value = DASH.sectorState.metric; f.value = String(DASH.sectorState.from); t.value = String(DASH.sectorState.to);
    m.addEventListener('change', function () { DASH.sectorState.metric = m.value; redesenhar(); });
    f.addEventListener('change', function () { DASH.sectorState.from = f.value; redesenhar(); });
    t.addEventListener('change', function () { DASH.sectorState.to = t.value; redesenhar(); });
  },
  estadoAtual: function () { return { metric: DASH.sectorState.metric, from: DASH.sectorState.from, to: DASH.sectorState.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(DASH.sectorState, e); }
});

registerChart({
  id: 'imports-data',
  titulo: 'Sports Footwear Imports',
  unidade: '(USD mn)',
  dashboardNative: true,
  // subtítulo dinâmico: acompanha a caixa Metric (FOB = USD mn, Volume = mn pairs), igual ao dashboard
  subtituloDinamico: function () { return DASH.importsState.metric === 'volume' ? '(mn pairs)' : '(USD mn)'; },
  desenhar: function (canvas) { regClaimId(canvas, 'imports-main-chart'); DASH.renderImportsChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    return '<label>View <select data-im="view"><option value="line">Total</option><option value="stacked">By country</option></select></label>' +
           '<label>Grain <select data-im="grain"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>' +
           '<label>Base <select data-im="base"><option value="spot">Spot</option><option value="ltm">LTM</option></select></label>' +
           '<label>Metric <select data-im="metric"><option value="fob">FOB</option><option value="volume">Volume</option></select></label>' +
           '<label>From <select data-im="from"></select></label>' +
           '<label>To <select data-im="to"></select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var view = box.querySelector('[data-im="view"]'), grain = box.querySelector('[data-im="grain"]'), base = box.querySelector('[data-im="base"]');
    var metric = box.querySelector('[data-im="metric"]');
    var fromSel = box.querySelector('[data-im="from"]'), toSel = box.querySelector('[data-im="to"]');
    var popular = function () {
      DASH.ensureRange();
      var rows = DASH.totalSeries();
      var ops = rows.map(function (r) { return '<option value="' + r.key + '">' + r.label + '</option>'; }).join('');
      fromSel.innerHTML = ops; toSel.innerHTML = ops;
      fromSel.value = DASH.importsState.from; toSel.value = DASH.importsState.to;
    };
    view.value = DASH.importsState.view; grain.value = DASH.importsState.grain; base.value = DASH.importsState.base;
    metric.value = DASH.importsState.metric;
    popular();
    view.addEventListener('change', function () { DASH.importsState.view = view.value; redesenhar(); });
    grain.addEventListener('change', function () { DASH.importsState.grain = grain.value; DASH.importsState.from = null; DASH.importsState.to = null; popular(); redesenhar(); });
    base.addEventListener('change', function () { DASH.importsState.base = base.value; DASH.importsState.from = null; DASH.importsState.to = null; popular(); redesenhar(); });
    metric.addEventListener('change', function () { DASH.importsState.metric = metric.value; redesenhar(); });
    fromSel.addEventListener('change', function () { DASH.importsState.from = fromSel.value; redesenhar(); });
    toSel.addEventListener('change', function () { DASH.importsState.to = toSel.value; redesenhar(); });
  },
  estadoAtual: function () { return { view: DASH.importsState.view, grain: DASH.importsState.grain, base: DASH.importsState.base, metric: DASH.importsState.metric, from: DASH.importsState.from, to: DASH.importsState.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(DASH.importsState, e); }
});

registerChart({
  id: 'vulcabras-share',
  titulo: 'Vulcabras — Market Share (Footwear)',
  unidade: '(Percentage)',
  dashboardNative: true,
  desenhar: function (canvas) { regClaimId(canvas, 'vulcabras-share-chart'); DASH.renderVulcabrasShareChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    var yrs = DASH.msData().years || [];
    var ops = yrs.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    return '<label>Frequency <select data-vs="frequency"><option value="annual">Annual</option></select></label>' +
           '<label>From <select data-vs="from">' + ops + '</select></label><label>To <select data-vs="to">' + ops + '</select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var f = box.querySelector('[data-vs="from"]'), t = box.querySelector('[data-vs="to"]');
    f.value = DASH.VULCABRAS_SHARE_STATE.from; t.value = DASH.VULCABRAS_SHARE_STATE.to;
    f.addEventListener('change', function () { DASH.VULCABRAS_SHARE_STATE.from = Number(f.value); redesenhar(); });
    t.addEventListener('change', function () { DASH.VULCABRAS_SHARE_STATE.to = Number(t.value); redesenhar(); });
  },
  estadoAtual: function () { return { from: DASH.VULCABRAS_SHARE_STATE.from, to: DASH.VULCABRAS_SHARE_STATE.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(DASH.VULCABRAS_SHARE_STATE, e); }
});

/* ---------------------------------------------------------------------
   Flash-case (TAM, TAM Highlight, Market Share) — funções/estado globais
   de charts_dashboard.js (resolvem por nome no momento do desenho; só são
   invocados na apresentação). dashboardNative.
   --------------------------------------------------------------------- */
registerChart({
  id: 'tam-mercado',
  titulo: 'Brazilian Sportswear — Total Market',
  unidade: '(BRL bn, Percentage)',
  dashboardNative: true,
  desenhar: function (canvas) { return buildPresentationTamChart(canvas); },
  montarControles: function () {
    var ops = sportswearTamData.years.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
    return '<label>From <select data-tam-control="from">' + ops + '</select></label><label>To <select data-tam-control="to">' + ops + '</select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var from = box.querySelector('[data-tam-control="from"]'), to = box.querySelector('[data-tam-control="to"]');
    from.value = presentationTamState.from; to.value = presentationTamState.to;
    from.addEventListener('change', function (e) { presentationTamState.from = Number(e.target.value); redesenhar(); });
    to.addEventListener('change', function (e) { presentationTamState.to = Number(e.target.value); redesenhar(); });
  },
  estadoAtual: function () { return { from: presentationTamState.from, to: presentationTamState.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(presentationTamState, e); }
});

registerChart({
  id: 'tam-destaque',
  titulo: 'Brazilian Sportswear — Recent Acceleration',
  unidade: '(BRL bn, Percentage)',
  dashboardNative: true,
  desenhar: function (canvas) { return buildTamHighlightChart(canvas); }
});

registerChart({
  id: 'market-share',
  titulo: 'Sportswear Market Share',
  unidade: '(Percentage)',
  dashboardNative: true,
  legendaDinamica: function () {
    var model = getPresentationMsModel();
    if (!model) return [];
    return model.series.map(function (s) { return { cor: s.color, texto: s.label }; });
  },
  desenhar: function (canvas) { return buildPresentationMsChart(canvas, getPresentationMsModel()); },
  montarControles: function () {
    var ops = sportswearBrandShares.years.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
    return '<label>Category <select data-ms="category"><option value="footwear">Footwear</option><option value="apparel">Apparel</option><option value="total">Total</option></select></label>' +
           '<label>Vulcabras <select data-ms="vulcabras"><option value="combined">Combined</option><option value="separate">Separate</option></select></label>' +
           '<label>Basis <select data-ms="basis"><option value="named">Named brands</option><option value="total">Total market</option></select></label>' +
           '<label>From <select data-ms="from">' + ops + '</select></label>' +
           '<label>To <select data-ms="to">' + ops + '</select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var cat = box.querySelector('[data-ms="category"]'), vulc = box.querySelector('[data-ms="vulcabras"]'), basis = box.querySelector('[data-ms="basis"]');
    var fromSel = box.querySelector('[data-ms="from"]'), toSel = box.querySelector('[data-ms="to"]');
    cat.value = presentationMsState.category; vulc.value = presentationMsState.vulcabras; basis.value = presentationMsState.basis;
    fromSel.value = presentationMsState.from; toSel.value = presentationMsState.to;
    cat.addEventListener('change', function (e) { presentationMsState.category = e.target.value; redesenhar(); });
    vulc.addEventListener('change', function (e) { presentationMsState.vulcabras = e.target.value; redesenhar(); });
    basis.addEventListener('change', function (e) { presentationMsState.basis = e.target.value; redesenhar(); });
    fromSel.addEventListener('change', function (e) { presentationMsState.from = Number(e.target.value); redesenhar(); });
    toSel.addEventListener('change', function (e) { presentationMsState.to = Number(e.target.value); redesenhar(); });
  },
  estadoAtual: function () { return { category: presentationMsState.category, vulcabras: presentationMsState.vulcabras, basis: presentationMsState.basis, from: presentationMsState.from, to: presentationMsState.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(presentationMsState, e); }
});

/* ---------------------------------------------------------------------
   E-commerce (Price/Disc/AvgDisc/Franchise) — relocados VERBATIM da
   apresentação. Dependem de helpers GLOBAIS do presentation-v2.html
   (ecomSetGlobalSport, legendaDoChart, ajustarFontesTemplate, legendaHTML)
   e dos módulos window._ecom… / window._fr… (ecom-chart.js / franchise-chart.js).
   Só são invocados na apresentação. dashboardNative (o dash renderiza ecom
   nativamente via _ecomInit). Método-shorthand é válido aqui.
   --------------------------------------------------------------------- */
registerChart({
  id: 'ecom-price', titulo: 'Average Price — Sports Footwear E-commerce', unidade: '(BRL)', dashboardNative: true,
  legendaDinamica() { return legendaDoChart(this._lastChart); },
  desenhar(canvas) {
    regClaimId(canvas, 'price-chart');
    const sl = canvas.closest('.slide'); const sp = sl && sl.querySelector('[data-ecom-sport]');
    ecomSetGlobalSport(sp ? sp.value : 'performance');
    if (window._ecomBuildPriceOnly) window._ecomBuildPriceOnly();
    const c = Chart.getChart(canvas); this._lastChart = c; return c;
  },
  montarControles() {
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>
            <label>View <select id="view-mode">
              <option value="comparison" selected>Company Comparison</option><option value="breakdown">Channel Breakdown</option></select></label>
            <label id="comp-channel-block">Channel <select id="comp-channel">
              <option value="total">Total</option><option value="website">Website</option><option value="netshoes">Netshoes</option><option value="centauro">Centauro</option><option value="free" selected>Free Choice</option></select></label>
            <label id="breakdown-brand-block" style="display:none;">Company <select id="breakdown-brand">
              <option value="adidas">Adidas</option><option value="nike">Nike</option><option value="ua">Under Armour</option><option value="asics">Asics</option><option value="olympikus">Olympikus</option><option value="mizuno">Mizuno</option></select></label>
            <label id="series-trigger-block">Series <span class="series-trigger" id="series-trigger"><span id="series-trigger-label">5 series</span> ▼</span></label>
            <label>Price <select id="metric-select"><option value="p_sale" selected>Sale</option><option value="p_list">List</option></select></label>
            <label>Gran <select id="gran-select"><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
            <label>From <select id="from-select"></select></label>
            <label>To <select id="to-select"></select></label>
            <div id="series-panel"></div>`;
  },
  ligarControles(box, redesenhar) {
    const $ = s => box.querySelector(s);
    const setState = patch => { if (window._ecomSetState) window._ecomSetState('price', patch); redesenhar(); };
    $('[data-ecom-sport]').addEventListener('change', e => { ecomSetGlobalSport(e.target.value); redesenhar(); });
    $('#view-mode').addEventListener('change', e => setState({ view: e.target.value }));
    $('#comp-channel').addEventListener('change', e => setState({ channel: e.target.value }));
    $('#breakdown-brand').addEventListener('change', e => setState({ brand: e.target.value }));
    $('#gran-select').addEventListener('change', redesenhar);
    $('#metric-select').addEventListener('change', redesenhar);
    $('#from-select').addEventListener('change', redesenhar);
    $('#to-select').addEventListener('change', redesenhar);
    $('#series-trigger').addEventListener('click', () => window.toggleSeriesPanel());
    if (!window.__ecomToggleWrapped) {
      const orig = window.onSeriesToggle;
      window.onSeriesToggle = function (k) { try { orig(k); } catch (e) {} redesenhar(); };
      window.__ecomToggleWrapped = true;
    }
  },
  estadoAtual() {
    const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]');
    return { sport: sp ? sp.value : 'performance', view: g('view-mode'), channel: g('comp-channel'), brand: g('breakdown-brand'), metric: g('metric-select'), gran: g('gran-select'), from: g('from-select'), to: g('to-select') };
  },
  aplicarEstado(e) {
    if (!e) return;
    if (window._ecomSetState) window._ecomSetState('price', { view: e.view, channel: e.channel, brand: e.brand });
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]'); if (sp && e.sport != null) sp.value = e.sport;
    ecomSetGlobalSport(e.sport);
    set('view-mode', e.view); set('comp-channel', e.channel); set('breakdown-brand', e.brand);
    set('metric-select', e.metric); set('gran-select', e.gran); set('from-select', e.from); set('to-select', e.to);
  }
});

registerChart({
  id: 'ecom-disc', titulo: '% of Discounted SKUs — E-commerce', unidade: '(Percentage)', dashboardNative: true,
  legendaDinamica() { return legendaDoChart(this._lastChart); },
  desenhar(canvas) {
    regClaimId(canvas, 'disc-chart');
    const sl = canvas.closest('.slide'); const sp = sl && sl.querySelector('[data-ecom-sport]');
    ecomSetGlobalSport(sp ? sp.value : 'performance');
    if (window._ecomBuildDiscOnly) window._ecomBuildDiscOnly();
    const c = Chart.getChart(canvas); this._lastChart = c; return c;
  },
  montarControles() {
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>
            <label>View <select id="disc-view-mode">
              <option value="comparison" selected>Company Comparison</option><option value="breakdown">Channel Breakdown</option></select></label>
            <label id="disc-comp-channel-block">Channel <select id="disc-comp-channel">
              <option value="total">Total</option><option value="website">Website</option><option value="netshoes">Netshoes</option><option value="centauro">Centauro</option><option value="free" selected>Free Choice</option></select></label>
            <label id="disc-breakdown-brand-block" style="display:none;">Company <select id="disc-breakdown-brand">
              <option value="adidas">Adidas</option><option value="nike">Nike</option><option value="ua">Under Armour</option><option value="asics">Asics</option><option value="olympikus">Olympikus</option><option value="mizuno">Mizuno</option></select></label>
            <label id="disc-series-trigger-block">Series <span class="series-trigger" id="disc-series-trigger"><span id="disc-series-trigger-label">5 series</span> ▼</span></label>
            <label>Gran <select id="disc-gran-select"><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
            <label>From <select id="disc-from-select"></select></label>
            <label>To <select id="disc-to-select"></select></label>
            <div id="disc-series-panel"></div>`;
  },
  ligarControles(box, redesenhar) {
    const $ = s => box.querySelector(s);
    const setState = patch => { if (window._ecomSetState) window._ecomSetState('disc', patch); redesenhar(); };
    $('[data-ecom-sport]').addEventListener('change', e => { ecomSetGlobalSport(e.target.value); redesenhar(); });
    $('#disc-view-mode').addEventListener('change', e => setState({ view: e.target.value }));
    $('#disc-comp-channel').addEventListener('change', e => setState({ channel: e.target.value }));
    $('#disc-breakdown-brand').addEventListener('change', e => setState({ brand: e.target.value }));
    $('#disc-gran-select').addEventListener('change', redesenhar);
    $('#disc-from-select').addEventListener('change', redesenhar);
    $('#disc-to-select').addEventListener('change', redesenhar);
    $('#disc-series-trigger').addEventListener('click', () => window.toggleDiscSeriesPanel());
    if (!window.__ecomDiscToggleWrapped) {
      const orig = window.onDiscSeriesToggle;
      window.onDiscSeriesToggle = function (k) { try { orig(k); } catch (e) {} redesenhar(); };
      window.__ecomDiscToggleWrapped = true;
    }
  },
  estadoAtual() {
    const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]');
    return { sport: sp ? sp.value : 'performance', view: g('disc-view-mode'), channel: g('disc-comp-channel'), brand: g('disc-breakdown-brand'), gran: g('disc-gran-select'), from: g('disc-from-select'), to: g('disc-to-select') };
  },
  aplicarEstado(e) {
    if (!e) return;
    if (window._ecomSetState) window._ecomSetState('disc', { view: e.view, channel: e.channel, brand: e.brand });
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]'); if (sp && e.sport != null) sp.value = e.sport;
    ecomSetGlobalSport(e.sport);
    set('disc-view-mode', e.view); set('disc-comp-channel', e.channel); set('disc-breakdown-brand', e.brand);
    set('disc-gran-select', e.gran); set('disc-from-select', e.from); set('disc-to-select', e.to);
  }
});

registerChart({
  id: 'ecom-avgdisc', titulo: 'Average Discount — E-commerce', unidade: '(Percentage)', dashboardNative: true,
  legendaDinamica() { return legendaDoChart(this._lastChart); },
  desenhar(canvas) {
    regClaimId(canvas, 'avgdisc-chart');
    const sl = canvas.closest('.slide'); const sp = sl && sl.querySelector('[data-ecom-sport]');
    ecomSetGlobalSport(sp ? sp.value : 'performance');
    if (window._ecomBuildAvgDiscOnly) window._ecomBuildAvgDiscOnly();
    const c = Chart.getChart(canvas); this._lastChart = c; return c;
  },
  montarControles() {
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>
            <label>View <select id="avgdisc-view-mode">
              <option value="comparison" selected>Company Comparison</option><option value="breakdown">Channel Breakdown</option></select></label>
            <label id="avgdisc-comp-channel-block">Channel <select id="avgdisc-comp-channel">
              <option value="total">Total</option><option value="website">Website</option><option value="netshoes">Netshoes</option><option value="centauro">Centauro</option><option value="free" selected>Free Choice</option></select></label>
            <label id="avgdisc-breakdown-brand-block" style="display:none;">Company <select id="avgdisc-breakdown-brand">
              <option value="adidas">Adidas</option><option value="nike">Nike</option><option value="ua">Under Armour</option><option value="asics">Asics</option><option value="olympikus">Olympikus</option><option value="mizuno">Mizuno</option></select></label>
            <label id="avgdisc-series-trigger-block">Series <span class="series-trigger" id="avgdisc-series-trigger"><span id="avgdisc-series-trigger-label">5 series</span> ▼</span></label>
            <label>Scope <select id="avgdisc-scope"><option value="all" selected>All items</option><option value="promo">Discounted only</option></select></label>
            <label>Gran <select id="avgdisc-gran-select"><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
            <label>From <select id="avgdisc-from-select"></select></label>
            <label>To <select id="avgdisc-to-select"></select></label>
            <div id="avgdisc-series-panel"></div>`;
  },
  ligarControles(box, redesenhar) {
    const $ = s => box.querySelector(s);
    const setState = patch => { if (window._ecomSetState) window._ecomSetState('avgdisc', patch); redesenhar(); };
    $('[data-ecom-sport]').addEventListener('change', e => { ecomSetGlobalSport(e.target.value); redesenhar(); });
    $('#avgdisc-view-mode').addEventListener('change', e => setState({ view: e.target.value }));
    $('#avgdisc-comp-channel').addEventListener('change', e => setState({ channel: e.target.value }));
    $('#avgdisc-breakdown-brand').addEventListener('change', e => setState({ brand: e.target.value }));
    $('#avgdisc-scope').addEventListener('change', redesenhar);
    $('#avgdisc-gran-select').addEventListener('change', redesenhar);
    $('#avgdisc-from-select').addEventListener('change', redesenhar);
    $('#avgdisc-to-select').addEventListener('change', redesenhar);
    $('#avgdisc-series-trigger').addEventListener('click', () => window.toggleAvgDiscSeriesPanel());
    if (!window.__ecomAvgToggleWrapped) {
      const orig = window.onAvgDiscSeriesToggle;
      window.onAvgDiscSeriesToggle = function (k) { try { orig(k); } catch (e) {} redesenhar(); };
      window.__ecomAvgToggleWrapped = true;
    }
  },
  estadoAtual() {
    const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]');
    return { sport: sp ? sp.value : 'performance', view: g('avgdisc-view-mode'), channel: g('avgdisc-comp-channel'), brand: g('avgdisc-breakdown-brand'), scope: g('avgdisc-scope'), gran: g('avgdisc-gran-select'), from: g('avgdisc-from-select'), to: g('avgdisc-to-select') };
  },
  aplicarEstado(e) {
    if (!e) return;
    if (window._ecomSetState) window._ecomSetState('avgdisc', { view: e.view, channel: e.channel, brand: e.brand });
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]'); if (sp && e.sport != null) sp.value = e.sport;
    ecomSetGlobalSport(e.sport);
    set('avgdisc-view-mode', e.view); set('avgdisc-comp-channel', e.channel); set('avgdisc-breakdown-brand', e.brand);
    set('avgdisc-scope', e.scope); set('avgdisc-gran-select', e.gran); set('avgdisc-from-select', e.from); set('avgdisc-to-select', e.to);
  }
});

registerChart({
  id: 'ecom-franchise', titulo: 'Price Pass-Through — Sports Footwear E-commerce', unidade: '(Percentage, price change vs prior period)', dashboardNative: true,
  legendaDinamica() { return legendaDoChart(this._lastChart); },
  desenhar(canvas) {
    regClaimId(canvas, 'fr-chart');
    const sl = canvas.closest('.slide'); const sp = sl && sl.querySelector('[data-ecom-sport]');
    ecomSetGlobalSport(sp ? sp.value : 'all');
    if (!window.__frAfterRenderSet) {
      window.__frAfterRender = function () {
        const cv = document.getElementById('fr-chart'); const ch = cv && Chart.getChart(cv);
        if (!ch || !cv) return;
        const slideEl = cv.closest('.slide');
        const su = ((slideEl ? slideEl.getBoundingClientRect().height : 0) || 800) / 100;
        ajustarFontesTemplate(ch, su);
        const legEl = slideEl && slideEl.querySelector('.chart-legend');
        if (legEl) legEl.innerHTML = legendaHTML(legendaDoChart(ch));
      };
      window.__frAfterRenderSet = true;
    }
    const vEl = document.getElementById('fr-view'), cEl = document.getElementById('fr-channel');
    if (window._frSetState) window._frSetState({ view: vEl ? vEl.value : undefined, channel: cEl ? cEl.value : undefined });
    if (window._frInit) window._frInit();
    const c = Chart.getChart(canvas); this._lastChart = c; return c;
  },
  montarControles() {
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance">Performance</option><option value="all" selected>All</option></select></label>
            <label>View <select id="fr-view">
              <option value="comparison" selected>Company Comparison</option><option value="breakdown">Channel Breakdown</option><option value="model">Model Breakdown</option></select></label>
            <label id="fr-channel-block">Channel <select id="fr-channel">
              <option value="total">Total</option><option value="website">Website</option><option value="centauro">Centauro</option><option value="netshoes">Netshoes</option><option value="free" selected>Free Choice</option></select></label>
            <label id="fr-brand-block" style="display:none;">Company <select id="fr-brand">
              <option value="Adidas">Adidas</option><option value="Nike">Nike</option><option value="Under Armour">Under Armour</option><option value="Asics">Asics</option><option value="Olympikus">Olympikus</option><option value="Mizuno">Mizuno</option></select></label>
            <label id="fr-model-channel-block" style="display:none;">Model channel <select id="fr-model-channel">
              <option value="total">Total</option><option value="website">Website</option><option value="centauro">Centauro</option><option value="netshoes">Netshoes</option></select></label>
            <label id="fr-series-trigger-block">Series <span class="series-trigger" id="fr-series-trigger"><span id="fr-series-trigger-label">5 series</span> ▼</span></label>
            <label>Method <select id="fr-method"><option value="A" selected>A · Mean vs Mean</option><option value="B">B · Gen vs Gen</option></select></label>
            <label>Price <select id="fr-price"><option value="sale" selected>Sale</option><option value="list">List</option></select></label>
            <label>Window <select id="fr-window">
              <option value="1w">WoW</option><option value="1m">MoM</option><option value="3m" selected>QoQ</option><option value="1y">YoY</option><option value="ytd">YTD</option></select></label>
            <label>Gran <select id="fr-gran"><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
            <label>From <select id="fr-from"></select></label>
            <label>To <select id="fr-to"></select></label>`;
  },
  ligarControles(box, redesenhar) {
    const $ = s => box.querySelector(s);
    $('[data-ecom-sport]').addEventListener('change', e => { ecomSetGlobalSport(e.target.value); redesenhar(); });
    ['#fr-view', '#fr-channel', '#fr-brand', '#fr-model-channel', '#fr-method', '#fr-price', '#fr-window', '#fr-gran', '#fr-from', '#fr-to']
      .forEach(sel => { const el = $(sel); if (el) el.addEventListener('change', redesenhar); });
    const trig = $('#fr-series-trigger');
    if (trig) trig.addEventListener('click', () => window.toggleFrSeriesPanel && window.toggleFrSeriesPanel());
  },
  estadoAtual() {
    const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]');
    return { sport: sp ? sp.value : 'all', view: g('fr-view'), channel: g('fr-channel'), brand: g('fr-brand'),
             modelChannel: g('fr-model-channel'), method: g('fr-method'), price: g('fr-price'),
             window: g('fr-window'), gran: g('fr-gran'), from: g('fr-from'), to: g('fr-to') };
  },
  aplicarEstado(e) {
    if (!e) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const sp = document.querySelector('.slide:not([hidden]) [data-ecom-sport]'); if (sp && e.sport != null) sp.value = e.sport;
    ecomSetGlobalSport(e.sport);
    set('fr-view', e.view); set('fr-channel', e.channel); set('fr-brand', e.brand); set('fr-model-channel', e.modelChannel);
    set('fr-method', e.method); set('fr-price', e.price); set('fr-window', e.window); set('fr-gran', e.gran);
    set('fr-from', e.from); set('fr-to', e.to);
    if (window._frSetState) window._frSetState({ view: e.view, channel: e.channel });
  }
});

/* ---------------------------------------------------------------------
   CAGED + Cost Index (flash-case render*-based) — globais de charts_dashboard.js.
   dashboardNative (o dash desenha nativamente; Cost Index lá tem TABELA junto,
   que segue nativa — aqui vai só o gráfico). Só invocados na apresentação.
   --------------------------------------------------------------------- */
registerChart({
  id: 'caged-jobs', titulo: "Estimated Formal Jobs — Vulcabras' Factories", unidade: '(Formal Jobs, YoY)', dashboardNative: true,
  legenda: [{ cor: '#021C45', texto: 'Estimated jobs' }, { cor: '#6FDDCB', texto: 'YoY %' }],
  desenhar(canvas) { regClaimId(canvas, 'presentation-caged-jobs-chart'); renderPresentationCagedJobsChart(); return Chart.getChart(canvas); },
  montarControles() {
    return `<label>View <select data-cg="grain">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option></select></label>
            <label>From <select data-cg="from"></select></label>
            <label>To <select data-cg="to"></select></label>`;
  },
  ligarControles(box, redesenhar) {
    const grainSel = box.querySelector('[data-cg="grain"]');
    const fromSel = box.querySelector('[data-cg="from"]');
    const toSel = box.querySelector('[data-cg="to"]');
    const popular = () => {
      presentationCagedState.grain = grainSel.value;
      ensurePresentationCagedRange();
      const rows = presentationCagedRowsForGrain();
      const ops = rows.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
      fromSel.innerHTML = ops; toSel.innerHTML = ops;
      fromSel.value = presentationCagedState.from;
      toSel.value = presentationCagedState.to;
    };
    grainSel.value = presentationCagedState.grain;
    popular();
    grainSel.addEventListener('change', () => { presentationCagedState.from = null; presentationCagedState.to = null; popular(); redesenhar(); });
    fromSel.addEventListener('change', () => { presentationCagedState.from = fromSel.value; redesenhar(); });
    toSel.addEventListener('change', () => { presentationCagedState.to = toSel.value; redesenhar(); });
  },
  estadoAtual() { return { grain: presentationCagedState.grain, from: presentationCagedState.from, to: presentationCagedState.to }; },
  aplicarEstado(e) { if (e) Object.assign(presentationCagedState, e); }
});

registerChart({
  id: 'headcount-volume', titulo: 'Factory Headcount Growth vs Volume Growth', unidade: '(Percentage)', dashboardNative: true,
  legenda: [{ cor: '#021C45', texto: 'Employees YoY' }, { cor: '#6FDDCB', texto: 'Volume YoY' }],
  desenhar(canvas) { regClaimId(canvas, 'presentation-volume-yoy-chart'); renderPresentationVolumeYoyChart(); return Chart.getChart(canvas); },
  montarControles() {
    return `<label>View <select data-vy="mode">
              <option value="quarterly">Quarterly YoY</option><option value="ltm">LTM YoY</option></select></label>
            <label>Jobs Shift <select data-vy="shift">
              <option value="0">No shift</option><option value="1">+3M</option><option value="2">+6M</option></select></label>
            <label>From <select data-vy="from"></select></label>
            <label>To <select data-vy="to"></select></label>`;
  },
  ligarControles(box, redesenhar) {
    const mode = box.querySelector('[data-vy="mode"]');
    const shift = box.querySelector('[data-vy="shift"]');
    const fromSel = box.querySelector('[data-vy="from"]');
    const toSel = box.querySelector('[data-vy="to"]');
    const popular = () => {
      presentationVolumeYoyState.mode = mode.value;
      ensurePresentationVolumeRange();
      const rows = presentationVolumeAllRows();
      const ops = rows.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
      fromSel.innerHTML = ops; toSel.innerHTML = ops;
      fromSel.value = presentationVolumeYoyState.from; toSel.value = presentationVolumeYoyState.to;
    };
    mode.value = presentationVolumeYoyState.mode;
    shift.value = String(presentationVolumeYoyState.shiftQuarters);
    popular();
    mode.addEventListener('change', () => { presentationVolumeYoyState.from = null; presentationVolumeYoyState.to = null; popular(); redesenhar(); });
    shift.addEventListener('change', () => { presentationVolumeYoyState.shiftQuarters = Number(shift.value); presentationVolumeYoyState.from = null; presentationVolumeYoyState.to = null; popular(); redesenhar(); });
    fromSel.addEventListener('change', () => { presentationVolumeYoyState.from = fromSel.value; redesenhar(); });
    toSel.addEventListener('change', () => { presentationVolumeYoyState.to = toSel.value; redesenhar(); });
  },
  estadoAtual() { return { mode: presentationVolumeYoyState.mode, shiftQuarters: presentationVolumeYoyState.shiftQuarters, from: presentationVolumeYoyState.from, to: presentationVolumeYoyState.to }; },
  aplicarEstado(e) { if (e) Object.assign(presentationVolumeYoyState, e); }
});

registerChart({
  id: 'cost-index', titulo: 'Cost Index — Historical Distribution', unidade: '(x, average of weekly observations)', dashboardNative: true,
  legendaDinamica() {
    const cfg = (typeof costIndexConfig !== 'undefined' && costIndexConfig[presentationCostState.variable]) || { label: 'Index' };
    const sd = presentationCostState.stdDev;
    return [
      { cor: '#021C45', texto: cfg.label },
      { cor: '#5D2A2C', texto: 'Average' },
      { cor: '#FF4F6C', texto: '+' + sd + ' SD' },
      { cor: '#6FDDCB', texto: '−' + sd + ' SD' }
    ];
  },
  desenhar(canvas) { regClaimId(canvas, 'presentation-cost-index-chart'); renderPresentationCostIndexChart(); return Chart.getChart(canvas); },
  montarControles() {
    // Opções do "Index" vêm da receita única (window.COST_INDEX) → inclui Petrochemical (blended) e bate com o dashboard.
    const C = window.COST_INDEX;
    const order = (C && C.ORDER) || ['eva', 'pvc', 'rubber'];
    const opts = order.map(k => `<option value="${k}">${(C && C.CONFIG[k] && C.CONFIG[k].label) || k}</option>`).join('');
    return `<label>Index <select data-co="variable">${opts}</select></label>
            <label>Cur <select data-co="currency"><option value="usd">USD</option><option value="brl">BRL</option></select></label>
            <label>±SD <select data-co="sd"><option value="0.5">0.5</option><option value="1">1.0</option><option value="1.5">1.5</option><option value="2">2.0</option></select></label>
            <label>From <select data-co="from"></select></label>
            <label>To <select data-co="to"></select></label>`;
  },
  ligarControles(box, redesenhar) {
    const variable = box.querySelector('[data-co="variable"]');
    const currency = box.querySelector('[data-co="currency"]');
    const sd = box.querySelector('[data-co="sd"]');
    const fromSel = box.querySelector('[data-co="from"]');
    const toSel = box.querySelector('[data-co="to"]');
    const popular = () => {
      const rows = ensureCostRange();
      const ops = rows.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
      fromSel.innerHTML = ops; toSel.innerHTML = ops;
      fromSel.value = presentationCostState.from; toSel.value = presentationCostState.to;
    };
    variable.value = presentationCostState.variable;
    currency.value = presentationCostState.currency;
    sd.value = String(presentationCostState.stdDev);
    popular();
    variable.addEventListener('change', () => { presentationCostState.variable = variable.value; redesenhar(); });
    currency.addEventListener('change', () => { presentationCostState.currency = currency.value; redesenhar(); });
    sd.addEventListener('change', () => { presentationCostState.stdDev = Number(sd.value); redesenhar(); });
    fromSel.addEventListener('change', () => { presentationCostState.from = fromSel.value; redesenhar(); });
    toSel.addEventListener('change', () => { presentationCostState.to = toSel.value; redesenhar(); });
  },
  estadoAtual() { return { variable: presentationCostState.variable, currency: presentationCostState.currency, stdDev: presentationCostState.stdDev, from: presentationCostState.from, to: presentationCostState.to }; },
  aplicarEstado(e) { if (e) Object.assign(presentationCostState, e); }
});
