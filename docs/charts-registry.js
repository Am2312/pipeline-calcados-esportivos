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
})();

/* ---------------------------------------------------------------------
   GRÁFICO DE TESTE (auto-gerado) — prova o trilho índice → apresentação.
   Remover quando os gráficos reais estiverem registrados.
   --------------------------------------------------------------------- */
registerChart({
  id: 'registry-selftest',
  titulo: 'Registry Self-Test',
  unidade: '(auto-gerado pelo índice compartilhado)',
  desenhar: function (canvas) {
    return new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['2023', '2024', '2025'],
        datasets: [{ label: 'Demo', data: [12, 19, 15], backgroundColor: '#002554', borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
      }
    });
  }
  // sem controles — o teste só valida a geração + render no molde
});

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
  desenhar: function (canvas) { canvas.id = 'industry-main-chart'; DASH.renderIndustryChart(); return Chart.getChart(canvas); },
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
  desenhar: function (canvas) { canvas.id = 'imports-main-chart'; DASH.renderImportsChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    return '<label>View <select data-im="view"><option value="line">Total</option><option value="stacked">By country</option></select></label>' +
           '<label>Grain <select data-im="grain"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>' +
           '<label>Base <select data-im="base"><option value="spot">Spot</option><option value="ltm">LTM</option></select></label>' +
           '<label>From <select data-im="from"></select></label>' +
           '<label>To <select data-im="to"></select></label>';
  },
  ligarControles: function (box, redesenhar) {
    var view = box.querySelector('[data-im="view"]'), grain = box.querySelector('[data-im="grain"]'), base = box.querySelector('[data-im="base"]');
    var fromSel = box.querySelector('[data-im="from"]'), toSel = box.querySelector('[data-im="to"]');
    var popular = function () {
      DASH.ensureRange();
      var rows = DASH.totalSeries();
      var ops = rows.map(function (r) { return '<option value="' + r.key + '">' + r.label + '</option>'; }).join('');
      fromSel.innerHTML = ops; toSel.innerHTML = ops;
      fromSel.value = DASH.importsState.from; toSel.value = DASH.importsState.to;
    };
    view.value = DASH.importsState.view; grain.value = DASH.importsState.grain; base.value = DASH.importsState.base;
    popular();
    view.addEventListener('change', function () { DASH.importsState.view = view.value; redesenhar(); });
    grain.addEventListener('change', function () { DASH.importsState.grain = grain.value; DASH.importsState.from = null; DASH.importsState.to = null; popular(); redesenhar(); });
    base.addEventListener('change', function () { DASH.importsState.base = base.value; DASH.importsState.from = null; DASH.importsState.to = null; popular(); redesenhar(); });
    fromSel.addEventListener('change', function () { DASH.importsState.from = fromSel.value; redesenhar(); });
    toSel.addEventListener('change', function () { DASH.importsState.to = toSel.value; redesenhar(); });
  },
  estadoAtual: function () { return { view: DASH.importsState.view, grain: DASH.importsState.grain, base: DASH.importsState.base, from: DASH.importsState.from, to: DASH.importsState.to }; },
  aplicarEstado: function (e) { if (e) Object.assign(DASH.importsState, e); }
});

registerChart({
  id: 'vulcabras-share',
  titulo: 'Vulcabras — Market Share (Footwear)',
  unidade: '(Percentage)',
  dashboardNative: true,
  desenhar: function (canvas) { canvas.id = 'vulcabras-share-chart'; DASH.renderVulcabrasShareChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    var yrs = DASH.msData().years || [];
    var ops = yrs.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    return '<label>From <select data-vs="from">' + ops + '</select></label><label>To <select data-vs="to">' + ops + '</select></label>';
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
