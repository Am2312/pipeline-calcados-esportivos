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

  /* ===================================================================
     LISTA ÚNICA DE CAIXAS (fonte de verdade dos seletores de OPÇÃO FIXA).
     window.CONTROL_SPECS[chartId] = [ { key, label, width, onchange, idPrefix, attr, options:[{v,t}], disableWhenAnnual? } ]
     Os DOIS lados leem daqui: o dashboard monta via regDashBoxes (estilo
     selectBlock/df-input, com seus handlers onchange), e a apresentação via
     regPresBoxes (estilo <label> + data-<attr>). Adicionar uma caixa AQUI
     faz ela aparecer no dashboard E no PPT. From/To e caixas dinâmicas
     (ex.: Index do Cost) ficam fora, montadas à parte por cada lado.
     - key      = nome da propriedade no objeto de estado (igual nos 2 lados)
     - idPrefix = prefixo do id do <select> no dashboard (ex.: 'caged-jobs' → 'caged-jobs-grain-select')
     - attr     = sufixo do data-attr no PPT (ex.: 'cg' → data-cg="grain")
     =================================================================== */
  window.CONTROL_SPECS = window.CONTROL_SPECS || {};
  window.regSpec = function (chartId) { return window.CONTROL_SPECS[chartId] || []; };
  // monta as caixas no ESTILO DO DASHBOARD (selectBlock + df-input), lendo o valor atual de state[key]
  window.regDashBoxes = function (chartId, state) {
    return window.regSpec(chartId).map(function (c) {
      var stateKey = c.stateKey || c.key;          // propriedade no objeto de estado
      var idKey = c.idKey || c.key;                // token usado no id do <select>
      var cur = state ? state[stateKey] : undefined;
      var dis = (c.disableWhenAnnual && state && state.grain === 'annual') ? ' disabled' : '';
      var w = c.width ? ' style="width:' + c.width + 'px;"' : '';
      var opts = c.options.map(function (o) {
        return '<option value="' + o.v + '"' + (String(cur) === String(o.v) ? ' selected' : '') + '>' + o.t + '</option>';
      }).join('');
      return '<div class="control-block"><div class="control-label">' + c.label + '</div>' +
             '<select id="' + (c.idPrefix || chartId) + '-' + idKey + '-select" class="df-input" onchange="' + (c.onchange || '') + '"' + w + dis + '>' + opts + '</select></div>';
    }).join('');
  };
  // monta as caixas no ESTILO DA APRESENTAÇÃO (<label> + data-<attr>); o ligarControles de cada gráfico já consulta data-<attr>="key"
  window.regPresBoxes = function (chartId) {
    return window.regSpec(chartId).map(function (c) {
      var opts = c.options.map(function (o) { return '<option value="' + o.v + '">' + o.t + '</option>'; }).join('');
      return '<label>' + c.label + ' <select data-' + (c.attr || 'reg') + '="' + c.key + '">' + opts + '</select></label>';
    }).join('');
  };
})();

/* =====================================================================
   LISTAS DE CAIXAS por gráfico (preenche window.CONTROL_SPECS).
   Editar aqui = muda a caixa no dashboard E no PPT ao mesmo tempo.
   ===================================================================== */
window.CONTROL_SPECS['caged-jobs'] = [
  { key: 'grain', label: 'Grain', idPrefix: 'caged-jobs', attr: 'cg', onchange: 'setCagedJobsGrain()',
    options: [{ v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] }
];
window.CONTROL_SPECS['headcount-volume'] = [
  { key: 'mode', label: 'Basis', width: 126, idPrefix: 'caged-volume-yoy', attr: 'vy', onchange: 'setCagedVolumeYoyMode()',
    options: [{ v: 'quarterly', t: 'Quarterly' }, { v: 'ltm', t: 'LTM' }] },
  { key: 'shift', stateKey: 'shiftQuarters', label: 'Jobs Shift', width: 126, idPrefix: 'caged-volume-yoy', attr: 'vy', onchange: 'setCagedVolumeYoyShift()',
    options: [{ v: '0', t: 'No shift' }, { v: '1', t: '+3M' }, { v: '2', t: '+6M' }] }
];
window.CONTROL_SPECS['vulcabras-share'] = [
  { key: 'frequency', label: 'Frequency', width: 140, idPrefix: 'vulcabras-share', attr: 'vs', onchange: 'setVulcabrasShareFrequency()',
    options: [{ v: 'annual', t: 'Annual' }] }
];

/* ===================================================================
   E-COMMERCE — lista única das caixas dos 4 cards (price/disc/avgdisc/franchise).
   Mesmo módulo (ecom-chart.js) nos 2 lados; aqui mora a barra de controles, lida
   pelo DASHBOARD (window.ecomDashControlBar → markup control-block/control-select)
   e pela APRESENTAÇÃO (window.ecomPresControlBar → <label>). Adicionar/remover uma
   caixa AQUI muda os dois lados. Cada caixa: {kind, id, label, onchange, options,
   block?, hidden?, width?} | série: {kind:'series', id, labelId, onclick, block, hidden?}.
   =================================================================== */
window.ECOM_SPECS = window.ECOM_SPECS || {
  price: [
    { kind: 'select', id: 'view-mode', label: 'View', onchange: 'onViewModeChange()', options: [{ v: 'comparison', t: 'Company Comparison' }, { v: 'breakdown', t: 'Channel Breakdown' }] },
    { kind: 'select', id: 'comp-channel', label: 'Channel', block: 'comp-channel-block', onchange: 'onCompChannelChange()', options: [{ v: 'total', t: 'Total' }, { v: 'website', t: 'Website' }, { v: 'netshoes', t: 'Netshoes' }, { v: 'centauro', t: 'Centauro' }, { v: 'free', t: 'Free Choice', sel: true }] },
    { kind: 'select', id: 'breakdown-brand', label: 'Company', block: 'breakdown-brand-block', hidden: true, onchange: 'onBreakdownBrandChange()', options: [{ v: 'adidas', t: 'Adidas' }, { v: 'nike', t: 'Nike' }, { v: 'ua', t: 'Under Armour' }, { v: 'asics', t: 'Asics' }, { v: 'olympikus', t: 'Olympikus' }, { v: 'mizuno', t: 'Mizuno' }] },
    { kind: 'series', id: 'series-trigger', labelId: 'series-trigger-label', block: 'series-trigger-block', onclick: 'toggleSeriesPanel()' },
    { kind: 'select', id: 'metric-select', label: 'Price basis', width: 130, onchange: 'renderAll()', options: [{ v: 'p_sale', t: 'Sale Price', sel: true }, { v: 'p_list', t: 'List Price' }] },
    { kind: 'select', id: 'gran-select', label: 'Granularity', width: 130, onchange: 'onGranChange()', options: [{ v: 'weekly', t: 'Weekly', sel: true }, { v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] },
    { kind: 'select', id: 'from-select', label: 'From', width: 130, onchange: 'renderAll()', options: [] },
    { kind: 'select', id: 'to-select', label: 'To', width: 130, onchange: 'renderAll()', options: [] }
  ],
  disc: [
    { kind: 'select', id: 'disc-view-mode', label: 'View', onchange: 'onDiscViewModeChange()', options: [{ v: 'comparison', t: 'Company Comparison' }, { v: 'breakdown', t: 'Channel Breakdown' }] },
    { kind: 'select', id: 'disc-comp-channel', label: 'Channel', block: 'disc-comp-channel-block', onchange: 'onDiscCompChannelChange()', options: [{ v: 'total', t: 'Total' }, { v: 'website', t: 'Website' }, { v: 'netshoes', t: 'Netshoes' }, { v: 'centauro', t: 'Centauro' }, { v: 'free', t: 'Free Choice', sel: true }] },
    { kind: 'select', id: 'disc-breakdown-brand', label: 'Company', block: 'disc-breakdown-brand-block', hidden: true, onchange: 'onDiscBreakdownBrandChange()', options: [{ v: 'adidas', t: 'Adidas' }, { v: 'nike', t: 'Nike' }, { v: 'ua', t: 'Under Armour' }, { v: 'asics', t: 'Asics' }, { v: 'olympikus', t: 'Olympikus' }, { v: 'mizuno', t: 'Mizuno' }] },
    { kind: 'series', id: 'disc-series-trigger', labelId: 'disc-series-trigger-label', block: 'disc-series-trigger-block', onclick: 'toggleDiscSeriesPanel()' },
    { kind: 'select', id: 'disc-gran-select', label: 'Granularity', width: 130, onchange: 'onDiscGranChange()', options: [{ v: 'weekly', t: 'Weekly', sel: true }, { v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] },
    { kind: 'select', id: 'disc-from-select', label: 'From', width: 130, onchange: 'buildDiscAll()', options: [] },
    { kind: 'select', id: 'disc-to-select', label: 'To', width: 130, onchange: 'buildDiscAll()', options: [] }
  ],
  avgdisc: [
    { kind: 'select', id: 'avgdisc-view-mode', label: 'View', onchange: 'onAvgDiscViewModeChange()', options: [{ v: 'comparison', t: 'Company Comparison' }, { v: 'breakdown', t: 'Channel Breakdown' }] },
    { kind: 'select', id: 'avgdisc-comp-channel', label: 'Channel', block: 'avgdisc-comp-channel-block', onchange: 'onAvgDiscCompChannelChange()', options: [{ v: 'total', t: 'Total' }, { v: 'website', t: 'Website' }, { v: 'netshoes', t: 'Netshoes' }, { v: 'centauro', t: 'Centauro' }, { v: 'free', t: 'Free Choice', sel: true }] },
    { kind: 'select', id: 'avgdisc-breakdown-brand', label: 'Company', block: 'avgdisc-breakdown-brand-block', hidden: true, onchange: 'onAvgDiscBreakdownBrandChange()', options: [{ v: 'adidas', t: 'Adidas' }, { v: 'nike', t: 'Nike' }, { v: 'ua', t: 'Under Armour' }, { v: 'asics', t: 'Asics' }, { v: 'olympikus', t: 'Olympikus' }, { v: 'mizuno', t: 'Mizuno' }] },
    { kind: 'series', id: 'avgdisc-series-trigger', labelId: 'avgdisc-series-trigger-label', block: 'avgdisc-series-trigger-block', onclick: 'toggleAvgDiscSeriesPanel()' },
    { kind: 'select', id: 'avgdisc-scope', label: 'Scope', onchange: 'buildAvgDiscAll()', options: [{ v: 'all', t: 'All items', sel: true }, { v: 'promo', t: 'Discounted items only' }] },
    { kind: 'select', id: 'avgdisc-gran-select', label: 'Granularity', width: 130, onchange: 'onAvgDiscGranChange()', options: [{ v: 'weekly', t: 'Weekly', sel: true }, { v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] },
    { kind: 'select', id: 'avgdisc-from-select', label: 'From', width: 130, onchange: 'buildAvgDiscAll()', options: [] },
    { kind: 'select', id: 'avgdisc-to-select', label: 'To', width: 130, onchange: 'buildAvgDiscAll()', options: [] }
  ],
  franchise: [
    { kind: 'select', id: 'fr-view', label: 'View', onchange: 'onFrViewChange()', options: [{ v: 'comparison', t: 'Company Comparison', sel: true }, { v: 'breakdown', t: 'Channel Breakdown' }, { v: 'model', t: 'Model Breakdown' }] },
    { kind: 'select', id: 'fr-channel', label: 'Channel', block: 'fr-channel-block', onchange: 'onFrChannelChange()', options: [{ v: 'total', t: 'Total' }, { v: 'website', t: 'Website' }, { v: 'centauro', t: 'Centauro', sel: true }, { v: 'netshoes', t: 'Netshoes' }, { v: 'free', t: 'Free Choice' }] },
    { kind: 'select', id: 'fr-brand', label: 'Company', block: 'fr-brand-block', hidden: true, onchange: 'window._frRender && window._frRender()', options: [{ v: 'Adidas', t: 'Adidas' }, { v: 'Nike', t: 'Nike' }, { v: 'Under Armour', t: 'Under Armour' }, { v: 'Asics', t: 'Asics' }, { v: 'Olympikus', t: 'Olympikus', sel: true }, { v: 'Mizuno', t: 'Mizuno' }] },
    { kind: 'select', id: 'fr-model-channel', label: 'Channel', block: 'fr-model-channel-block', hidden: true, onchange: 'window._frRender && window._frRender()', options: [{ v: 'website', t: 'Website' }, { v: 'centauro', t: 'Centauro', sel: true }, { v: 'netshoes', t: 'Netshoes' }] },
    { kind: 'series', id: 'fr-series-trigger', labelId: 'fr-series-trigger-label', block: 'fr-series-trigger-block', hidden: true, onclick: 'toggleFrSeriesPanel()' },
    { kind: 'select', id: 'fr-method', label: 'Method', onchange: 'window._frRender && window._frRender()', options: [{ v: 'A', t: 'A: Média vs Média', sel: true }, { v: 'B', t: 'B: Geração vs Geração' }] },
    { kind: 'select', id: 'fr-price', label: 'Price', onchange: 'window._frRender && window._frRender()', options: [{ v: 'sale', t: 'Sale', sel: true }, { v: 'list', t: 'List' }] },
    { kind: 'select', id: 'fr-window', label: 'Window (chart)', onchange: 'window._frRender && window._frRender()', options: [{ v: '1w', t: 'Δ WoW' }, { v: '1m', t: 'Δ MoM' }, { v: '3m', t: 'Δ QoQ' }, { v: '1y', t: 'Δ YoY' }, { v: 'ytd', t: 'Δ YTD', sel: true }] },
    { kind: 'select', id: 'fr-gran', label: 'Granularity', width: 130, onchange: 'window._frRender && window._frRender()', options: [{ v: 'weekly', t: 'Weekly', sel: true }, { v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] },
    { kind: 'select', id: 'fr-from', label: 'From', width: 130, onchange: 'window._frRender && window._frRender()', options: [] },
    { kind: 'select', id: 'fr-to', label: 'To', width: 130, onchange: 'window._frRender && window._frRender()', options: [] }
  ]
};
// markup estilo DASHBOARD (control-block + control-select), idêntico ao template atual
window.ecomDashControlBar = function (key) {
  var spec = (window.ECOM_SPECS && window.ECOM_SPECS[key]) || [];
  return spec.map(function (c) {
    var blockAttrs = (c.block ? ' id="' + c.block + '"' : '') + (c.hidden ? ' style="display:none;"' : '');
    var inner;
    if (c.kind === 'series') {
      inner = '<div class="series-trigger" id="' + c.id + '" onclick="' + c.onclick + '">' +
              '<span id="' + c.labelId + '">5 series selected</span>' +
              '<span style="font-size:9px;color:#9AA8BB;flex-shrink:0;">&#9660;</span></div>';
    } else {
      var w = c.width ? ' style="min-width:' + c.width + 'px;"' : '';
      var opts = c.options.map(function (o) { return '<option value="' + o.v + '"' + (o.sel ? ' selected' : '') + '>' + o.t + '</option>'; }).join('');
      inner = '<select class="control-select" id="' + c.id + '" onchange="' + c.onchange + '"' + w + '>' + opts + '</select>';
    }
    return '<div class="control-block"' + blockAttrs + '><div class="control-label">' + c.label + '</div>' + inner + '</div>';
  }).join('');
};
// markup estilo APRESENTAÇÃO (<label> + <select id>); MESMOS ids do dashboard → o
// ligarControles/módulo ecom (que consultam por id) continuam funcionando sem mudança.
window.ecomPresControlBar = function (key) {
  var spec = (window.ECOM_SPECS && window.ECOM_SPECS[key]) || [];
  return spec.map(function (c) {
    var idAttr = c.block ? ' id="' + c.block + '"' : '';
    var hid = c.hidden ? ' style="display:none;"' : '';
    if (c.kind === 'series') {
      return '<label' + idAttr + hid + '>Series <span class="series-trigger" id="' + c.id + '">' +
             '<span id="' + c.labelId + '">5 series</span> &#9660;</span></label>';
    }
    var opts = c.options.map(function (o) { return '<option value="' + o.v + '"' + (o.sel ? ' selected' : '') + '>' + o.t + '</option>'; }).join('');
    return '<label' + idAttr + hid + '>' + c.label + ' <select id="' + c.id + '">' + opts + '</select></label>';
  }).join('');
};

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
   MARKET SHARE — RECEITA ÚNICA (modelo + desenho)
   Antes a lógica era DUPLICADA: getMarketShareModel/buildMarketShareChart
   inline no dashboard × getPresentationMsModel/buildPresentationMsChart no
   charts_dashboard.js do PPT. As duas chegaram a divergir (seletor
   Separate/Combined trocava as concorrentes). Agora os DOIS lados chamam
   estas funções → divergência impossível por construção. Cada lado só passa
   o seu "chrome" (fonte escalada do slide, casas decimais do rótulo, cor de
   eixo do padrão PPT) via opts; a visualização (séries, cores, quais marcas
   aparecem, empilhamento, eixos) é compartilhada.
   ===================================================================== */
window.MS_VULCABRAS    = window.MS_VULCABRAS    || ['Olympikus', 'Mizuno', 'Under Armour'];
window.MS_TOP_SERIES   = window.MS_TOP_SERIES   || 6;
// Nº FIXO de concorrentes (não-Vulcabras) exibidos no gráfico — os 3 maiores,
// independente de Separate/Combined. (Vulcabras + estes 3 + Others.)
window.MS_TOP_COMPETITORS = window.MS_TOP_COMPETITORS || 3;
window.MS_OTHERS_COLOR = window.MS_OTHERS_COLOR || '#D02BB8';

/* Modelo do gráfico. state = {category, vulcabras:'separate'|'combined',
   basis:'named'|'reported', from, to}. data = {years, totals, brands} (mesma
   estrutura nos dois lados, via sportswear_brand_shares_data.js). */
window.computeMarketShareModel = function (state, data) {
  var VULC = window.MS_VULCABRAS, TOP = window.MS_TOP_SERIES, COMP = window.MS_TOP_COMPETITORS;
  var PALETTE = window.MS_PALETTE, OTHERS = window.MS_OTHERS_COLOR;
  data = data || { years: [], totals: {}, brands: {} };
  var years = data.years || [];
  if (!years.length) return null;
  var cat = state.category;
  var fromIdx = years.indexOf(state.from), toIdx = years.indexOf(state.to);
  if (fromIdx < 0) fromIdx = 0;
  if (toIdx < 0) toIdx = years.length - 1;
  if (fromIdx > toIdx) { var tmp = fromIdx; fromIdx = toIdx; toIdx = tmp; }
  var shownYears = years.slice(fromIdx, toIdx + 1);
  var brands = (data.brands && data.brands[cat]) || {};
  var totals;
  if (state.basis === 'named') {
    totals = years.map(function (_, i) {
      return Object.keys(brands).reduce(function (s, n) {
        var v = brands[n] && brands[n][i];
        return s + (Number.isFinite(v) ? Number(v) : 0);
      }, 0);
    });
  } else {
    totals = ((data.totals && data.totals[cat]) || []).map(function (v) { return Number(v || 0); });
  }
  var val = function (name, i) { return (brands[name] && Number.isFinite(brands[name][i])) ? brands[name][i] : 0; };
  var rankIdx = toIdx;
  var rankShare = function (members) {
    var tot = totals[rankIdx] || 0;
    return tot ? members.reduce(function (s, m) { return s + val(m, rankIdx); }, 0) / tot * 100 : 0;
  };
  var withRank = function (entry) { entry.rankShare = rankShare(entry.members); return entry; };
  var vulcMembersWithData = VULC.filter(function (n) { return brands[n]; });
  // Nº FIXO de concorrentes (COMP, os maiores não-Vulcabras), idêntico em
  // Separate e Combined; Separate só expande a Vulcabras nas marcas-membro.
  var vulcEntries = state.vulcabras === 'combined'
    ? [withRank({ key: 'Vulcabras', label: 'Vulcabras', members: vulcMembersWithData })]
    : vulcMembersWithData.map(function (n) { return withRank({ key: n, label: n, members: [n] }); });
  var fixedEntries = vulcEntries.filter(function (e) { return e.members.length && e.rankShare > 0; });
  var rankedCompetitors = Object.keys(brands)
    .filter(function (n) { return VULC.indexOf(n) < 0; })
    .map(function (n) { return withRank({ key: n, label: n, members: [n] }); })
    .filter(function (e) { return e.rankShare > 0; })
    .sort(function (a, b) { return b.rankShare - a.rankShare || a.label.localeCompare(b.label); });
  var entries = fixedEntries.concat(rankedCompetitors.slice(0, Math.max(0, COMP)));
  var series = entries.map(function (e, ei) {
    return {
      key: e.key, label: e.label, color: PALETTE[ei % PALETTE.length],
      data: shownYears.map(function (_, si) {
        var i = fromIdx + si, tot = totals[i] || 0;
        return tot ? e.members.reduce(function (s, m) { return s + val(m, i); }, 0) / tot * 100 : 0;
      })
    };
  });
  series.push({
    key: 'Others', label: 'Others', color: OTHERS,
    data: shownYears.map(function (_, si) {
      return Math.max(0, 100 - series.reduce(function (s, ser) { return s + ser.data[si]; }, 0));
    })
  });
  return { years: shownYears, fromIdx: fromIdx, toIdx: toIdx, series: series };
};

/* Desenho do gráfico (Chart.js). opts = chrome por-container:
   labelText(v)->str (rótulo na barra), fmtPct(v)->str (tooltip),
   labelFontPx, xTickColor, xTickWeight, xBorderColor, padTop, padRight,
   animation(false). Defaults = aparência do dashboard. */
window.buildMarketShareChartCanvas = function (canvas, model, opts) {
  if (!canvas || !model || !window.Chart) return null;
  opts = opts || {};
  var fmtPct = opts.fmtPct || function (v) { return (Math.round(v * 10) / 10).toFixed(1) + '%'; };
  var labelText = opts.labelText || fmtPct;
  var labelFontPx = opts.labelFontPx || 11;
  var xTickColor = opts.xTickColor || 'rgba(2,28,69,0.4)';
  var xTickWeight = opts.xTickWeight || 'normal';
  var xBorderColor = opts.xBorderColor || 'rgba(2,28,69,0.2)';
  var padTop = (opts.padTop != null) ? opts.padTop : 22;
  var padRight = (opts.padRight != null) ? opts.padRight : 20;
  var tooltipLabel = opts.tooltipLabel || function (c) { return '  ' + c.dataset.label + ': ' + fmtPct(c.parsed.y); };
  var labels = model.years.map(String);
  var datasets = model.series.map(function (s) {
    return { label: s.label, data: s.data, backgroundColor: s.color, borderColor: s.color, borderWidth: 0, borderSkipped: false, stack: 'ms', barPercentage: 0.86, categoryPercentage: 0.9 };
  });
  var labelPlugin = {
    id: 'msLabels',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '700 ' + labelFontPx + 'px Verdana';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
      chart.data.datasets.forEach(function (ds, di) {
        if (!chart.isDatasetVisible(di)) return;
        var meta = chart.getDatasetMeta(di);
        meta.data.forEach(function (bar, i) {
          var v = ds.data[i];
          if (!Number.isFinite(v) || v < 0.5 || Math.abs(bar.base - bar.y) < 14) return;
          ctx.fillText(labelText(v), bar.x, (bar.y + bar.base) / 2);
        });
      });
      ctx.restore();
    }
  };
  var chartOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: padTop, right: padRight, left: 0, bottom: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, callbacks: { label: tooltipLabel } }
    },
    scales: {
      x: { stacked: true, ticks: { color: xTickColor, font: { family: 'Verdana', size: 10.5, weight: xTickWeight }, minRotation: 0, maxRotation: 0 }, grid: { display: false }, border: { color: xBorderColor } },
      y: { stacked: true, min: 0, max: 100, ticks: { display: false }, grid: { display: false }, border: { display: false } }
    }
  };
  if (opts.animation === false) chartOpts.animation = false;
  return new window.Chart(canvas.getContext('2d'), { type: 'bar', plugins: [labelPlugin], data: { labels: labels, datasets: datasets }, options: chartOpts });
};

/* =====================================================================
   TAM (Sportswear Total Market) — RECEITA ÚNICA (modelo + combo chart)
   Antes duplicado: dashboard getTamSeries/buildTamComboChart inline ×
   PPT buildPresentationTamChart (charts_dashboard.js). Cores e cores de
   eixo são idênticas nos 2 lados; só diferem fonte (escalada no slide),
   padding, tooltip (off no slide), animação e altura da caixa YoY — tudo
   via opts. (tam-destaque é presentation-only, não entra aqui.)
   ===================================================================== */
window.SPORTSWEAR_TAM_COLORS = window.SPORTSWEAR_TAM_COLORS || { footwear: '#021C45', apparel: '#6FDDCB', line: '#FF4F6C', white: '#FFFFFF', label: '#021C45' };
(function () {
  function yoySeries(values) { return values.map(function (v, i) { return (i === 0 || !values[i - 1]) ? null : ((v / values[i - 1]) - 1) * 100; }); }
  function cagr(s, e, p) { if (!Number.isFinite(s) || !Number.isFinite(e) || s <= 0 || e <= 0 || p <= 0) return null; return (Math.pow(e / s, 1 / p) - 1) * 100; }
  function fmtNum(v, d) { d = d || 0; return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtPct(v, d) { d = d || 0; return Number.isFinite(v) ? fmtNum(v, d) + '%' : 'n.a.'; }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  window.getSportswearTamModel = function (state, data) {
    data = data || window.SPORTSWEAR_TAM || { years: [], apparel: [], footwear: [] };
    var years = data.years;
    var fromIndex = years.indexOf(state.from); if (fromIndex < 0) fromIndex = 0;
    var rawTo = years.indexOf(state.to); var toIndex = rawTo < 0 ? years.length - 1 : rawTo;
    var apMn = data.apparel, ftMn = data.footwear;
    var totalMn = years.map(function (_, i) { return apMn[i] + ftMn[i]; });
    var bn = function (a) { return a.map(function (v) { return v / 1000; }); };
    var COL = window.SPORTSWEAR_TAM_COLORS;
    return {
      years: years.slice(fromIndex, toIndex + 1),
      values: bn(totalMn).slice(fromIndex, toIndex + 1),
      stackedSeries: [
        { key: 'footwear', label: 'Footwear', color: COL.footwear, values: bn(ftMn).slice(fromIndex, toIndex + 1) },
        { key: 'apparel', label: 'Apparel', color: COL.apparel, values: bn(apMn).slice(fromIndex, toIndex + 1) }
      ],
      yoy: yoySeries(totalMn).slice(fromIndex, toIndex + 1),
      cagr: cagr(totalMn[fromIndex], totalMn[toIndex], toIndex - fromIndex),
      apparelCagr: cagr(apMn[fromIndex], apMn[toIndex], toIndex - fromIndex),
      footwearCagr: cagr(ftMn[fromIndex], ftMn[toIndex], toIndex - fromIndex),
      lineColor: COL.line
    };
  };

  /* opts (chrome por-container): labelFontPx (caixa YoY + sizing; default 11),
     segLabelFontPx (segmento % + total da pilha; default 12), yoyBoxHeight (22),
     padTop (52), padRight (26), padLeft (0), xTickColor (#9AA8BB),
     xBorderColor (#CCD4DD), tooltipEnabled (true), animation (true). */
  window.buildTamComboChartCanvas = function (canvas, selected, opts) {
    if (!canvas || !selected || !window.Chart) return null;
    opts = opts || {};
    var COL = window.SPORTSWEAR_TAM_COLORS;
    var labelFontPx = opts.labelFontPx || 11;
    var segLabelFontPx = opts.segLabelFontPx || 12;
    var yoyBoxHeight = opts.yoyBoxHeight || 22;
    var padTop = (opts.padTop != null) ? opts.padTop : 52;
    var padRight = (opts.padRight != null) ? opts.padRight : 26;
    var padLeft = (opts.padLeft != null) ? opts.padLeft : 0;
    var xTickColor = opts.xTickColor || '#9AA8BB';
    var xBorderColor = opts.xBorderColor || '#CCD4DD';
    var tooltipEnabled = opts.tooltipEnabled !== false;
    var WHITE = COL.white, NAVY = COL.label;
    var labels = selected.years;
    var yoyData = selected.yoy;
    var lineColor = selected.lineColor || COL.line;
    var barData = selected.values;
    var barMax = Math.max.apply(null, barData) * 1.12;
    var yoyValues = yoyData.filter(Number.isFinite);
    var yoyObservedMax = Math.max.apply(null, yoyValues.concat([0]));
    var yoyObservedMin = Math.min.apply(null, yoyValues.concat([0]));
    var yoyRange = Math.max(10, yoyObservedMax - yoyObservedMin);
    var yoyScaleMax = Math.ceil(yoyObservedMax + Math.max(4, yoyRange * 0.08));
    var yoyScaleMin = Math.floor(yoyObservedMin - Math.max(4, yoyRange * 0.10));
    var datasets = [];
    selected.stackedSeries.forEach(function (s) { datasets.push({ type: 'bar', label: s.label, data: s.values, stack: 'tam', yAxisID: 'y', order: 2, backgroundColor: s.color, borderColor: s.color, borderWidth: 0, borderSkipped: false, barPercentage: 0.74, categoryPercentage: 0.88 }); });
    datasets.push({ type: 'line', label: 'YoY', data: yoyData, yAxisID: 'y1', order: 1, borderColor: lineColor, backgroundColor: lineColor, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: lineColor, pointBorderColor: lineColor, pointHoverRadius: 5, pointHitRadius: 18, tension: 0.25 });
    var labelPlugin = {
      id: 'tamLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx, chartArea = chart.chartArea;
        var lineIndex = chart.data.datasets.findIndex(function (ds) { return ds.type === 'line'; });
        var lineMeta = lineIndex >= 0 ? chart.getDatasetMeta(lineIndex) : null;
        var lineVisible = lineIndex >= 0 && chart.isDatasetVisible(lineIndex);
        var yoyBoxes = [];
        var barInfos = [];
        chart.data.datasets.forEach(function (ds, idx) { if (ds.type === 'bar' && chart.isDatasetVisible(idx)) barInfos.push({ meta: chart.getDatasetMeta(idx), data: ds.data }); });
        var stackTops = labels.map(function (_, index) {
          var topY = null, barRef = null, sum = 0;
          barInfos.forEach(function (info) {
            var bar = info.meta.data[index];
            if (!bar) return;
            if (topY === null || bar.y < topY) { topY = bar.y; barRef = bar; }
            var v = info.data[index];
            if (Number.isFinite(v)) sum += v;
          });
          return { topY: topY, barRef: barRef, sum: sum };
        });
        ctx.save();
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        if (lineMeta && lineVisible) lineMeta.data.forEach(function (point, index) {
          var value = yoyData[index];
          if (!point || !Number.isFinite(value)) return;
          var text = Math.round(value) + '%';
          var width = ctx.measureText(text).width + 14;
          var height = yoyBoxHeight;
          var x = point.x - width / 2;
          var y = point.y - height / 2;
          x = Math.max(chartArea.left + 2, Math.min(x, chartArea.right - width - 2));
          y = Math.max(chartArea.top + 4, y);
          yoyBoxes[index] = { x: x, y: y, width: width, height: height };
        });
        ctx.restore();
        ctx.save();
        ctx.font = '700 ' + segLabelFontPx + 'px Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = WHITE;
        chart.data.datasets.forEach(function (ds, idx) {
          if (ds.type !== 'bar' || !chart.isDatasetVisible(idx)) return;
          var meta = chart.getDatasetMeta(idx);
          meta.data.forEach(function (bar, i) {
            var value = ds.data[i];
            if (!bar || !Number.isFinite(value)) return;
            var segHeight = Math.abs(bar.base - bar.y);
            if (segHeight < 18) return;
            var labelX = bar.x;
            var labelY = bar.y + (bar.base - bar.y) / 2;
            var segTotal = stackTops[i] ? stackTops[i].sum : 0;
            var text = segTotal > 0 ? Math.round((value / segTotal) * 100) + '%' : '';
            var box = yoyBoxes[i];
            if (box) {
              var tw = ctx.measureText(text).width;
              var overlapsX = Math.abs(labelX - (box.x + box.width / 2)) < ((tw + box.width) / 2);
              var overlapsY = Math.abs(labelY - (box.y + box.height / 2)) < ((16 + box.height) / 2);
              if (overlapsX && overlapsY) {
                var segTop = Math.min(bar.y, bar.base), segBottom = Math.max(bar.y, bar.base);
                var candDown = box.y + box.height + 9, candUp = box.y - 9;
                if ((box.y + box.height / 2) <= labelY && candDown + 8 <= segBottom - 2) labelY = candDown;
                else if (candUp - 8 >= segTop + 2) labelY = candUp;
                else if (candDown + 8 <= segBottom - 2) labelY = candDown;
                labelY = Math.max(segTop + 10, Math.min(segBottom - 10, labelY));
              }
            }
            ctx.fillText(text, labelX, labelY);
          });
        });
        ctx.fillStyle = NAVY;
        stackTops.forEach(function (stack, index) {
          if (!stack || stack.topY == null || !stack.barRef) return;
          var text = fmtNum(stack.sum, 0);
          var labelX = stack.barRef.x;
          var labelY = Math.max(chartArea.top + 9, stack.topY - 12);
          var box = yoyBoxes[index];
          if (box) {
            var tw = ctx.measureText(text).width;
            var overlapsX = Math.abs(labelX - (box.x + box.width / 2)) < ((tw + box.width) / 2);
            var overlapsY = Math.abs(labelY - (box.y + box.height / 2)) < ((14 + box.height) / 2);
            if (overlapsX && overlapsY) labelY = Math.max(chartArea.top + 9, box.y - 11);
          }
          ctx.fillText(text, labelX, labelY);
        });
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        ctx.textBaseline = 'middle';
        if (lineMeta && lineVisible) lineMeta.data.forEach(function (point, index) {
          var value = yoyData[index];
          if (!point || !Number.isFinite(value)) return;
          var text = Math.round(value) + '%';
          var width = ctx.measureText(text).width + 14;
          var height = yoyBoxHeight;
          var box = yoyBoxes[index] || { x: Math.max(chartArea.left + 2, Math.min(point.x - width / 2, chartArea.right - width - 2)), y: Math.max(chartArea.top + 4, point.y - 11) };
          ctx.fillStyle = lineColor;
          rrect(ctx, box.x, box.y, width, height, 4);
          ctx.fill();
          ctx.fillStyle = WHITE;
          ctx.fillText(text, box.x + width / 2, box.y + height / 2 + 0.5);
        });
        ctx.restore();
      }
    };
    var tooltipCfg = tooltipEnabled ? {
      backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12,
      callbacks: {
        label: function (ctx2) { var v = ctx2.parsed.y; if (ctx2.dataset.yAxisID === 'y1') return v == null ? '' : '  YoY: ' + fmtPct(v, 1); return '  ' + ctx2.dataset.label + ': R$ ' + fmtNum(v, 1) + ' bn'; },
        footer: function (items) { var total = items.filter(function (c) { return c.dataset.yAxisID !== 'y1'; }).reduce(function (sum, c) { return sum + (Number.isFinite(c.parsed.y) ? c.parsed.y : 0); }, 0); return total ? '  Total: R$ ' + fmtNum(total, 1) + ' bn' : ''; }
      }
    } : { enabled: false };
    var chartOpts = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: padTop, right: padRight, left: padLeft, bottom: 0 } },
      plugins: { legend: { display: false }, tooltip: tooltipCfg },
      scales: {
        x: { stacked: true, ticks: { color: xTickColor, font: { family: 'Verdana', size: 10.5 }, minRotation: 0, maxRotation: 0 }, grid: { display: false }, border: { color: xBorderColor } },
        y: { stacked: true, min: 0, max: barMax, ticks: { display: false }, grid: { display: false }, border: { display: false } },
        y1: { position: 'right', min: yoyScaleMin, max: yoyScaleMax, ticks: { display: false }, grid: { display: false, drawOnChartArea: false }, border: { display: false } }
      }
    };
    if (opts.animation === false) chartOpts.animation = false;
    return new window.Chart(canvas.getContext('2d'), { type: 'bar', plugins: [labelPlugin], data: { labels: labels, datasets: datasets }, options: chartOpts });
  };
})();

/* =====================================================================
   COST INDEX (Historical Distribution) — RECEITA ÚNICA (stats + desenho)
   Antes duplicado: dashboard renderCostIndexChart inline × PPT
   renderPresentationCostIndexChart (charts_dashboard.js). As rows já vinham
   da mesma fonte (window.COST_INDEX.seriesMap == costIndexRows do dash,
   verificado idêntico); avg/std/axisRange/fmt eram idênticos. Aqui ficam
   o cálculo de stats e o desenho (linha + bandas SD + badges); cada lado
   passa só o seu chrome (fonte escalada, eixo #A6A6A6 bold do PPT, padding,
   animação, raio do badge) via opts.
   ===================================================================== */
(function () {
  function ciFmt(value, compact) { if (!Number.isFinite(value)) return 'n.m.'; return Number(value).toLocaleString('en-US', { minimumFractionDigits: compact ? 1 : 2, maximumFractionDigits: compact ? 1 : 2 }); }
  function ciAvg(values) { var v = values.filter(Number.isFinite); if (!v.length) return null; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; }
  function ciStd(values) { var v = values.filter(Number.isFinite); if (!v.length) return null; var a = ciAvg(v); return Math.sqrt(v.reduce(function (s, x) { return s + Math.pow(x - a, 2); }, 0) / v.length); }
  function ciNiceStep(rawStep) { var steps = [0.01, 0.02, 0.05, 0.10, 0.20, 0.25, 0.50, 1.00, 2.00, 5.00]; return steps.find(function (st) { return st >= rawStep; }) || steps[steps.length - 1]; }
  function ciAxisRange(values) {
    var v = values.filter(Number.isFinite);
    if (!v.length) return { min: 0, max: 1, step: 0.25 };
    var minValue = Math.min.apply(null, v), maxValue = Math.max.apply(null, v);
    var range = Math.max(maxValue - minValue, 0.10);
    var step = ciNiceStep(range / 8);
    var min = Math.floor((minValue - step * 0.35) / step) * step;
    var max = Math.ceil((maxValue + step * 0.35) / step) * step;
    if (min === max) max += step;
    return { min: Number(Math.max(0, min).toFixed(4)), max: Number(max.toFixed(4)), step: Number(step.toFixed(4)) };
  }
  function ciRrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* rows = [{key, axisLabel, value}] já filtradas; retorna stats prontos pro desenho */
  window.getCostIndexStats = function (rows, stdDev) {
    var labels = rows.map(function (r) { return r.axisLabel; });
    var values = rows.map(function (r) { return r.value; });
    var avg = ciAvg(values), std = ciStd(values);
    var plus = avg + stdDev * std, minus = avg - stdDev * std;
    var yAxis = ciAxisRange(values.concat([avg, plus, minus]).filter(Number.isFinite));
    var monthInterval = rows.length > 260 ? 6 : rows.length > 130 ? 3 : 1;
    var visibleX = new Set();
    var lastMonthKey = null, visibleMonthCount = -1;
    rows.forEach(function (r, index) { var mk = r.key.slice(0, 7); if (mk !== lastMonthKey) { visibleMonthCount += 1; if (visibleMonthCount % monthInterval === 0) visibleX.add(index); lastMonthKey = mk; } });
    return { labels: labels, values: values, avg: avg, std: std, plus: plus, minus: minus, yAxis: yAxis, visibleX: visibleX };
  };

  /* opts: seriesLabel, stdDev, navy(#021C45), avgColor(#5D2A2C), cherry(#FF4F6C),
     turquoise(#6FDDCB), badgeFontPx(11), badgeRadius(3), padRight(86),
     animation(true), legendFontSize(11), legendColor(#021C45), xTickColor(#9AA8BB),
     yTickColor(#9AA8BB), xTickFontSize(9), yTickFontSize(10), tickWeight('normal'),
     xBorderColor(#CCD4DD), yBorderColor(#CCD4DD), borderWidth(undefined),
     gridDrawTicks(undefined). */
  window.buildCostIndexChartCanvas = function (canvas, stats, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var navy = opts.navy || '#021C45', avgColor = opts.avgColor || '#5D2A2C', cherry = opts.cherry || '#FF4F6C', turquoise = opts.turquoise || '#6FDDCB';
    var badgeFontPx = opts.badgeFontPx || 11, badgeRadius = (opts.badgeRadius != null) ? opts.badgeRadius : 3;
    var padRight = (opts.padRight != null) ? opts.padRight : 86;
    var legendFontSize = opts.legendFontSize || 11, legendColor = opts.legendColor || '#021C45';
    var xTickColor = opts.xTickColor || '#9AA8BB', yTickColor = opts.yTickColor || '#9AA8BB';
    var xTickFontSize = opts.xTickFontSize || 9, yTickFontSize = opts.yTickFontSize || 10, tickWeight = opts.tickWeight || 'normal';
    var xBorderColor = opts.xBorderColor || '#CCD4DD', yBorderColor = opts.yBorderColor || '#CCD4DD';
    var seriesLabel = opts.seriesLabel || '', stdDev = opts.stdDev || 1;
    var labels = stats.labels, values = stats.values, avg = stats.avg, plus = stats.plus, minus = stats.minus, yAxis = stats.yAxis, visibleX = stats.visibleX;
    var gridObj = function () { return opts.gridDrawTicks === false ? { display: false, drawTicks: false } : { display: false }; };
    var borderObj = function (color) { return opts.borderWidth != null ? { color: color, width: opts.borderWidth } : { color: color }; };
    var horizDs = function (label, value, color) { return { label: label, data: Array(labels.length).fill(value), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0, tension: 0, _badge: true, _badgeVal: value }; };
    var badgePlugin = {
      id: 'costIndexBadges',
      afterDraw: function (chart) {
        var ctx = chart.ctx, chartArea = chart.chartArea;
        var badges = [];
        chart.data.datasets.forEach(function (ds, di) {
          if (!ds._badge || !chart.isDatasetVisible(di) || !Number.isFinite(ds._badgeVal)) return;
          var meta = chart.getDatasetMeta(di);
          var points = meta.data || [];
          if (!points.length) return;
          var point = points[points.length - 1];
          if (!point) return;
          var text = ciFmt(ds._badgeVal, true);
          ctx.save();
          ctx.font = '700 ' + badgeFontPx + 'px Verdana';
          var width = ctx.measureText(text).width + 12;
          ctx.restore();
          badges.push({ text: text, color: ds.borderColor, desiredY: point.y - 10, x: Math.min(chart.width - width - 2, Math.max(chartArea.right - width + 18, point.x - width / 2)), width: width, height: 20 });
        });
        if (!badges.length) return;
        badges.sort(function (a, b) { return a.desiredY - b.desiredY; });
        var gap = 3;
        badges.forEach(function (badge, index) { var minY = index ? badges[index - 1].y + badges[index - 1].height + gap : chartArea.top + 2; badge.y = Math.max(chartArea.top + 2, Math.min(badge.desiredY, chartArea.bottom - badge.height - 2)); badge.y = Math.max(badge.y, minY); });
        for (var i = badges.length - 1; i >= 0; i--) { var maxY = i === badges.length - 1 ? chartArea.bottom - badges[i].height - 2 : badges[i + 1].y - badges[i].height - gap; badges[i].y = Math.min(badges[i].y, maxY); badges[i].y = Math.max(chartArea.top + 2, badges[i].y); }
        badges.forEach(function (badge) {
          ctx.save();
          ctx.font = '700 ' + badgeFontPx + 'px Verdana';
          ctx.fillStyle = badge.color;
          ciRrect(ctx, badge.x, badge.y, badge.width, badge.height, badgeRadius);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badge.text, badge.x + badge.width / 2, badge.y + badge.height / 2 + 0.5);
          ctx.restore();
        });
      }
    };
    var chartOpts = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { left: 8, right: padRight, top: 8, bottom: 0 } },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { padding: 14, font: { size: legendFontSize, weight: '700', family: 'Verdana' }, boxWidth: 22, boxHeight: 3, usePointStyle: false, color: legendColor } },
        tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 10, callbacks: { label: function (ctx2) { return '  ' + ctx2.dataset.label + ': ' + ciFmt(ctx2.parsed.y); } } }
      },
      scales: {
        x: { ticks: { autoSkip: false, minRotation: 90, maxRotation: 90, color: xTickColor, font: { size: xTickFontSize, family: 'Verdana', weight: tickWeight }, callback: function (value, index) { return visibleX.has(index) ? this.getLabelForValue(value) : ''; } }, grid: gridObj(), border: borderObj(xBorderColor) },
        y: { min: yAxis.min, max: yAxis.max, ticks: { stepSize: yAxis.step, maxTicksLimit: 9, color: yTickColor, font: { size: yTickFontSize, family: 'Verdana', weight: tickWeight }, callback: function (value) { return ciFmt(Number(value), true); } }, grid: gridObj(), border: borderObj(yBorderColor) }
      }
    };
    if (opts.animation === false) chartOpts.animation = false;
    return new window.Chart(canvas.getContext('2d'), {
      type: 'line', plugins: [badgePlugin],
      data: { labels: labels, datasets: [
        { label: seriesLabel, data: values, borderColor: navy, backgroundColor: navy, borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 16, tension: 0.2, _badge: true, _badgeVal: values[values.length - 1] },
        horizDs('Average', avg, avgColor),
        horizDs('+' + stdDev + ' SD', plus, cherry),
        horizDs('-' + stdDev + ' SD', minus, turquoise)
      ] },
      options: chartOpts
    });
  };
})();

/* =====================================================================
   CAGED JOBS (Estimated Formal Jobs — Vulcabras' Factories) — RECEITA ÚNICA
   (model derivado + desenho). rows vêm de cada lado (mesma base
   window.CAGED_RAIS_2019_BASE + VULCABRAS_CAGED_DATA, lógica idêntica);
   helpers (axis/fmt/highlight) eram byte-idênticos. Aqui ficam o model
   derivado (values/yoy/axes/highlighted) e o desenho; chrome por-lado
   (fonte escalada, eixo #A6A6A6 bold do PPT, raio do badge) via opts.
   ===================================================================== */
(function () {
  function cagedNum(value) { var r = Math.round(Number(value) || 0); var abs = Math.abs(r).toLocaleString('en-US'); return r < 0 ? '(' + abs + ')' : abs; }
  function cagedPct(value, digits) { digits = digits || 0; if (!Number.isFinite(value)) return 'n.m.'; var abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); return value < 0 ? '(' + abs + '%)' : abs + '%'; }
  function niceCagedStep(range, targetTicks) { targetTicks = targetTicks || 6; var raw = Math.max(Number(range || 0) / targetTicks, 25); var mag = Math.pow(10, Math.floor(Math.log10(raw))); var n = raw / mag; if (n <= 1) return mag; if (n <= 2) return 2 * mag; if (n <= 2.5) return 2.5 * mag; if (n <= 5) return 5 * mag; return 10 * mag; }
  function cagedAxisBounds(values, options) {
    options = options || {};
    var valid = values.map(Number).filter(Number.isFinite);
    var includeZero = options.includeZero !== false;
    var padRatio = options.padRatio != null ? options.padRatio : 0.07;
    var targetTicks = options.targetTicks != null ? options.targetTicks : 6;
    var minSpan = options.minSpan != null ? options.minSpan : 50;
    if (!valid.length) return { min: 0, max: 100, step: 25 };
    var min = Math.min.apply(null, valid), max = Math.max.apply(null, valid);
    if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (min === max) { min -= minSpan / 2; max += minSpan / 2; if (includeZero) min = Math.min(min, 0); }
    var span = Math.max(max - min, minSpan);
    var pad = Math.max(span * padRatio, minSpan * 0.15);
    var paddedMin = min - pad, paddedMax = max + pad;
    if (includeZero && min >= 0) paddedMin = 0;
    if (includeZero && max <= 0) paddedMax = 0;
    var step = options.stepSize || niceCagedStep(paddedMax - paddedMin, targetTicks);
    return { min: Math.floor(paddedMin / step) * step, max: Math.ceil(paddedMax / step) * step, step: step };
  }
  function cagedYoyAxis(values) {
    var valid = values.filter(Number.isFinite); var step = 5;
    if (!valid.length) return { min: 0, max: step, step: step };
    var min = Math.min.apply(null, valid), max = Math.max.apply(null, valid);
    if (min === max) { min -= 1; max += 1; }
    var span = max - min; var pad = Math.max(span * 0.18, 1.5);
    return { min: Math.min(0, Math.floor((min - pad) / step) * step), max: Math.max(0, Math.ceil((max + pad) / step) * step), step: step };
  }
  function cagedRrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function highlightedIndices(rows, grain) {
    var anchor = rows[rows.length - 1];
    if (!anchor) return [];
    if (grain === 'monthly') return rows.map(function (row, i) { return row.month === anchor.month ? i : -1; }).filter(function (i) { return i >= 0; });
    if (grain === 'quarterly') return rows.map(function (row, i) { return row.quarter === anchor.quarter ? i : -1; }).filter(function (i) { return i >= 0; });
    return [rows.length - 1];
  }

  /* rows = [{key,label,value,yoy,month,quarter,...}] já filtradas; grain = monthly|quarterly|annual */
  window.getCagedJobsChartModel = function (rows, grain) {
    var values = rows.map(function (row) { return Math.round(row.value); });
    var yoy = rows.map(function (row) { return Number.isFinite(row.yoy) ? row.yoy : null; });
    return {
      labels: rows.map(function (row) { return row.label; }),
      values: values, yoy: yoy,
      valueAxis: cagedAxisBounds(values, { includeZero: true, padRatio: 0.04, targetTicks: 7, minSpan: 1000 }),
      yoyAxis: cagedYoyAxis(yoy),
      highlighted: highlightedIndices(rows, grain)
    };
  };

  /* opts: barColor(#021C45), highlightColor(#FF4F6C), lineColor(#6FDDCB),
     labelFontPx(11), boxH(20), badgeRadius(3), tickColor(#9AA8BB),
     tickFontSize(11), tickWeight('normal'), borderColor(#CFD8E3),
     y1TitleColor(#667D99), y1TitleFontSize(13), gridDrawTicks(true). */
  window.buildCagedJobsChartCanvas = function (canvas, model, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var barColor = opts.barColor || '#021C45', highlightColor = opts.highlightColor || '#FF4F6C', lineColor = opts.lineColor || '#6FDDCB';
    var labelFontPx = opts.labelFontPx || 11, boxH = opts.boxH || 20, badgeRadius = (opts.badgeRadius != null) ? opts.badgeRadius : 3;
    var tickColor = opts.tickColor || '#9AA8BB', tickFontSize = opts.tickFontSize || 11, tickWeight = opts.tickWeight || 'normal';
    var borderColor = opts.borderColor || '#CFD8E3';
    var y1TitleColor = opts.y1TitleColor || '#667D99', y1TitleFontSize = opts.y1TitleFontSize || 13;
    var gridObj = function () { return opts.gridDrawTicks === false ? { display: false, drawTicks: false } : { display: false }; };
    var labels = model.labels, values = model.values, yoy = model.yoy, valueAxis = model.valueAxis, yoyAxis = model.yoyAxis, highlighted = model.highlighted;
    var highlightedSet = new Set(highlighted);
    var barColors = values.map(function (_, i) { return highlightedSet.has(i) ? highlightColor : barColor; });
    var labelPlugin = {
      id: 'cagedJobsLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var barMeta = chart.getDatasetMeta(0), lineMeta = chart.getDatasetMeta(1);
        var font = '800 ' + labelFontPx + 'px Verdana', padX = 12;
        ctx.save();
        if (barMeta.visible) highlighted.forEach(function (i) {
          var bar = barMeta.data[i];
          if (!bar || !Number.isFinite(values[i])) return;
          ctx.font = font; ctx.fillStyle = barColor; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          var x = Math.max(chart.chartArea.left + 12, Math.min(bar.x, chart.chartArea.right - 12));
          var y = Math.max(chart.chartArea.top + 14, bar.y - 6);
          ctx.fillText(cagedNum(values[i]), x, y);
        });
        if (lineMeta.visible) highlighted.forEach(function (i) {
          var point = lineMeta.data[i];
          if (!point || !Number.isFinite(yoy[i])) return;
          var text = cagedPct(yoy[i], 0);
          ctx.font = font;
          var bw = ctx.measureText(text).width + padX;
          var x = Math.max(chart.chartArea.left + 2, Math.min(point.x - bw / 2, chart.chartArea.right - bw - 2));
          var y = Math.max(chart.chartArea.top + 2, Math.min(point.y - boxH / 2, chart.chartArea.bottom - boxH - 2));
          ctx.fillStyle = lineColor; cagedRrect(ctx, x, y, bw, boxH, badgeRadius); ctx.fill();
          ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(text, x + bw / 2, y + boxH / 2 + 0.5);
        });
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: 'Estimated Jobs', data: values, backgroundColor: barColors, borderWidth: 0, yAxisID: 'y', barPercentage: 0.72, categoryPercentage: 0.84, order: 2 },
          { type: 'line', label: 'YoY', data: yoy, borderColor: lineColor, backgroundColor: lineColor, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 16, tension: 0.25, yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 8, right: 16, top: 18, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, titleFont: { family: 'Verdana', size: 12, weight: '700' }, bodyFont: { family: 'Verdana', size: 12 }, callbacks: { label: function (ctx) { return ctx.dataset.yAxisID === 'y1' ? '  YoY: ' + cagedPct(ctx.parsed.y, 1) : '  Estimated Jobs: ' + cagedNum(ctx.parsed.y); } } }
        },
        scales: {
          x: { grid: gridObj(), border: { color: borderColor, width: 1 }, ticks: { color: tickColor, font: { family: 'Verdana', size: tickFontSize, weight: tickWeight }, maxRotation: 90, minRotation: 90 } },
          y: { min: valueAxis.min, max: valueAxis.max, display: true, grid: gridObj(), border: { color: borderColor, width: 1 }, title: { display: false }, ticks: { color: tickColor, font: { family: 'Verdana', size: tickFontSize, weight: tickWeight }, stepSize: valueAxis.step, callback: function (value) { return cagedNum(Number(value)); } } },
          y1: { min: yoyAxis.min, max: yoyAxis.max, position: 'right', display: false, grid: { display: false, drawOnChartArea: false }, border: { display: false }, title: { display: true, text: 'YoY', color: y1TitleColor, padding: { top: 0, bottom: 12 }, font: { family: 'Verdana', size: y1TitleFontSize, weight: '400' } }, ticks: { color: tickColor, font: { family: 'Verdana', size: tickFontSize, weight: tickWeight }, stepSize: yoyAxis.step, callback: function (value) { return cagedPct(Number(value), 0); } } }
        }
      },
      plugins: [labelPlugin]
    });
  };
})();

/* =====================================================================
   HEADCOUNT vs VOLUME (Factory Headcount Growth vs Volume Growth) —
   RECEITA ÚNICA (model + desenho). rows vêm de cada lado (mesma base/dados);
   axis idêntico. Linha dupla (Employees/Volume YoY) com rótulos anti-overlap
   e linha do zero. Chrome por-lado (fonte, eixo #A6A6A6 bold do PPT, raio do
   badge, cor da borda/zero-grid) via opts.
   ===================================================================== */
(function () {
  function volPct(value, digits) { digits = digits || 0; if (!Number.isFinite(value)) return 'n.m.'; var abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); return value < 0 ? '(' + abs + '%)' : abs + '%'; }
  function volYoyAxis(values) {
    var valid = values.filter(Number.isFinite);
    if (!valid.length) return { min: -10, max: 10, step: 5 };
    var min = Math.min.apply(null, valid.concat([0])), max = Math.max.apply(null, valid.concat([0]));
    var span = Math.max(max - min, 10); var pad = Math.max(span * 0.12, 2); var step = 5;
    return { min: Math.floor((min - pad) / step) * step, max: Math.ceil((max + pad) / step) * step, step: step };
  }
  function volRrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  window.getVolumeYoyModel = function (rows) {
    var jobsYoy = rows.map(function (r) { return r.jobsYoy; });
    var volumeYoy = rows.map(function (r) { return r.volumeYoy; });
    return { labels: rows.map(function (r) { return r.label; }), jobsYoy: jobsYoy, volumeYoy: volumeYoy, axis: volYoyAxis(jobsYoy.concat(volumeYoy)) };
  };

  /* opts: jobsColor(#021C45), volumeColor(#6FDDCB), labelFontPx(10),
     badgeRadius(3), tickColor(#9AA8BB), tickFontSize(11), tickWeight('normal'),
     xBorderColor(null=>display:false), yZeroGridColor(#CFD8E3),
     xGridDrawTicks(true). Linha do zero (plugin) é sempre #CFD8E3. */
  window.buildVolumeYoyChartCanvas = function (canvas, model, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var jobsColor = opts.jobsColor || '#021C45', volumeColor = opts.volumeColor || '#6FDDCB';
    var labelFontPx = opts.labelFontPx || 10, badgeRadius = (opts.badgeRadius != null) ? opts.badgeRadius : 3;
    var tickColor = opts.tickColor || '#9AA8BB', tickFontSize = opts.tickFontSize || 11, tickWeight = opts.tickWeight || 'normal';
    var yZeroGridColor = opts.yZeroGridColor || '#CFD8E3';
    var labels = model.labels, jobsYoy = model.jobsYoy, volumeYoy = model.volumeYoy, axis = model.axis;
    var labelPlugin = {
      id: 'volumeYoyLabels',
      beforeDatasetsDraw: function (chart) {
        var yScale = chart.scales.y; if (!yScale) return;
        var y = yScale.bottom, ctx = chart.ctx;
        ctx.save(); ctx.strokeStyle = '#CFD8E3'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(chart.chartArea.left, y); ctx.lineTo(chart.chartArea.right, y); ctx.stroke();
        ctx.restore();
      },
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx, chartArea = chart.chartArea;
        var boxHeight = 18, gap = 2, items = [];
        ctx.save(); ctx.font = '700 ' + labelFontPx + 'px Verdana';
        chart.data.datasets.forEach(function (dataset, datasetIndex) {
          if (!chart.isDatasetVisible(datasetIndex)) return;
          var meta = chart.getDatasetMeta(datasetIndex);
          dataset.data.forEach(function (value, i) {
            var point = meta.data[i];
            if (!point || !Number.isFinite(value)) return;
            var text = volPct(value, 0);
            items.push({ text: text, color: dataset.borderColor, x: point.x, y: point.y, bw: ctx.measureText(text).width + 12, bh: boxHeight });
          });
        });
        ctx.restore();
        var placed = [];
        var drawLabel = function (item) {
          var x = Math.max(2, Math.min(item.x - item.bw / 2, chart.width - item.bw - 2));
          var y = Math.max(chartArea.top + 2, Math.min(item.y - item.bh / 2, chartArea.bottom - item.bh - 2));
          ctx.save(); ctx.fillStyle = item.color; volRrect(ctx, x, y, item.bw, item.bh, badgeRadius); ctx.fill();
          ctx.fillStyle = '#FFFFFF'; ctx.font = '700 ' + labelFontPx + 'px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(item.text, x + item.bw / 2, y + item.bh / 2 + 0.5); ctx.restore();
        };
        items.sort(function (a, b) { return a.y - b.y; }).forEach(function (item) {
          var y = item.y;
          for (var tries = 0; tries < 12; tries++) {
            var box = { x: item.x - item.bw / 2, y: y - item.bh / 2, w: item.bw, h: item.bh };
            var overlap = placed.some(function (other) { return !(box.x + box.w + gap < other.x || other.x + other.w + gap < box.x || box.y + box.h + gap < other.y || other.y + other.h + gap < box.y); });
            if (!overlap) { placed.push(box); break; }
            y += item.bh + gap;
          }
          drawLabel({ text: item.text, color: item.color, x: item.x, bw: item.bw, bh: item.bh, y: y });
        });
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Employees YoY', data: jobsYoy, yAxisID: 'y', borderColor: jobsColor, backgroundColor: jobsColor, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 16, tension: 0.25 },
          { label: 'Volume YoY', data: volumeYoy, yAxisID: 'y', borderColor: volumeColor, backgroundColor: volumeColor, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 16, tension: 0.25 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 4, right: 44, top: 18, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, titleFont: { family: 'Verdana', size: 12, weight: '700' }, bodyFont: { family: 'Verdana', size: 12 }, callbacks: { label: function (ctx) { return '  ' + ctx.dataset.label + ': ' + volPct(ctx.parsed.y, 1); } } }
        },
        scales: {
          x: { offset: true, grid: opts.xGridDrawTicks === false ? { display: false, drawTicks: false } : { display: false }, border: opts.xBorderColor ? { color: opts.xBorderColor, width: 1 } : { display: false }, ticks: { color: tickColor, font: { family: 'Verdana', size: tickFontSize, weight: tickWeight }, maxRotation: 90, minRotation: 90 } },
          y: { min: axis.min, max: axis.max, display: false, position: 'left', grid: { color: function (ctx) { return Number(ctx.tick.value) === 0 ? yZeroGridColor : 'rgba(0,0,0,0)'; } }, border: { display: false }, ticks: { color: tickColor, font: { family: 'Verdana', size: tickFontSize, weight: tickWeight }, stepSize: axis.step, callback: function (value) { return volPct(Number(value), 0); } } }
        }
      },
      plugins: [labelPlugin]
    });
  };
})();

/* =====================================================================
   SECTOR DATA (Sports Footwear — Sector Data) — RECEITA ÚNICA (desenho).
   As duas implementações (dashboard inline × PPT window.DASH em
   charts_sports.js) eram BYTE-IDÊNTICAS (sem escala de slide). Aqui fica o
   desenho; cada lado passa só os formatadores (fmtNumber/fmtPct) e o model
   pronto (labels/values/yoyValues/metricLabel/sources). Cores/eixos idênticos
   nos 2 → fixos no canonical.
   ===================================================================== */
(function () {
  function niceSectorAxisMax(maxValue) {
    var raw = Math.max(Number(maxValue || 0) * 1.12, 1);
    if (raw <= 10) return Math.ceil(raw);
    if (raw <= 25) return Math.ceil(raw / 5) * 5;
    if (raw <= 100) return Math.ceil(raw / 10) * 10;
    return Math.ceil(raw / 20) * 20;
  }
  function secRrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* m: {labels, values, yoyValues, metricLabel, sources}.  opts: {fmtNumber(v,d), fmtPct(v,d)}. */
  window.buildIndustryChartCanvas = function (canvas, m, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var fmtNumber = opts.fmtNumber, fmtPct = opts.fmtPct;
    var NAVY = '#021C45', TURQ = '#6FDDCB', TICK = '#9AA8BB', XBORDER = '#C9D3DF';
    var labels = m.labels, values = m.values, yoyValues = m.yoyValues, metricLabel = m.metricLabel, sources = m.sources || [];
    var axisMax = niceSectorAxisMax(Math.max.apply(null, values.concat([0])));
    var yoyFinite = yoyValues.filter(Number.isFinite);
    var yoyMin = yoyFinite.length ? Math.min.apply(null, yoyFinite) : -0.1;
    var yoyMax = yoyFinite.length ? Math.max.apply(null, yoyFinite) : 0.1;
    var yoyPad = Math.max((yoyMax - yoyMin) * 0.30, 0.08);
    var labelPlugin = {
      id: 'sectorBarYoYLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (chart.isDatasetVisible(0)) {
          var meta = chart.getDatasetMeta(0);
          ctx.font = '800 12px Verdana'; ctx.fillStyle = '#FFFFFF';
          meta.data.forEach(function (bar, i) {
            var value = values[i];
            if (!Number.isFinite(value) || value <= 0 || !bar) return;
            var props = bar.getProps(['x', 'y', 'base', 'width'], true);
            var height = Math.abs(props.base - props.y);
            if (height < 28 || props.width < 26) return;
            var text = fmtNumber(value, 1);
            if (ctx.measureText(text).width > props.width - 6) return;
            ctx.fillText(text, props.x, (props.y + props.base) / 2);
          });
        }
        if (chart.isDatasetVisible(1)) {
          var meta2 = chart.getDatasetMeta(1);
          ctx.font = '800 11px Verdana';
          meta2.data.forEach(function (point, i) {
            var yoy = yoyValues[i];
            if (!point || !Number.isFinite(yoy)) return;
            var text = fmtPct(yoy, 0);
            var bw = ctx.measureText(text).width + 14, bh = 22;
            var x = Math.max(chart.chartArea.left + 4, Math.min(point.x - bw / 2, chart.chartArea.right - bw - 4));
            var y = Math.max(chart.chartArea.top + 4, Math.min(point.y - bh / 2, chart.chartArea.bottom - bh - 4));
            ctx.fillStyle = TURQ; secRrect(ctx, x, y, bw, bh, 4); ctx.fill();
            ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, x + bw / 2, y + bh / 2 + 0.5);
          });
        }
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [
        { type: 'bar', label: metricLabel, data: values, backgroundColor: NAVY, borderColor: NAVY, borderWidth: 0, borderRadius: 0, borderSkipped: false, yAxisID: 'y', barPercentage: 0.70, categoryPercentage: 0.78, order: 2 },
        { type: 'line', label: 'YoY', data: yoyValues, borderColor: TURQ, backgroundColor: TURQ, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 18, tension: 0.20, yAxisID: 'y1', spanGaps: false, order: 1 }
      ] },
      plugins: [labelPlugin],
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 10, right: 48, top: 48, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, callbacks: { label: function (c) { if (c.datasetIndex === 1) return '  YoY: ' + fmtPct(c.parsed.y, 0); return '  ' + c.dataset.label + ': ' + fmtNumber(c.parsed.y, 1) + 'mn pairs | Source: ' + (sources[c.dataIndex] || ''); } } }
        },
        scales: {
          x: { ticks: { minRotation: 90, maxRotation: 90, color: TICK, padding: 7, font: { size: 10, family: 'Verdana' } }, grid: { display: false }, border: { display: true, color: XBORDER, width: 1 } },
          y: { min: 0, max: axisMax, ticks: { display: false }, grid: { display: false }, border: { display: false } },
          y1: { position: 'right', min: yoyMin - yoyPad, max: yoyMax + yoyPad, ticks: { display: false }, grid: { display: false, drawOnChartArea: false }, border: { display: false } }
        }
      }
    });
  };
})();

/* =====================================================================
   IMPORTS (Sports Footwear Imports) — receita única de DESENHO.
   2 views: linha (Total Imports) e barra empilhada (top-3 países + Others).
   Cada lado computa as rows (filteredTotalSeries / filteredCountryPeriods)
   e o top-3 países, e passa pro canonical; a escrita da legenda de países
   (#imports-country-legend) e o bindLegendToggles são chrome por-lado.
   opts: {C, palette, grain, fmtMetric(v), fmtTooltip(v)} (formatters do lado,
   pois dependem de importsState.metric).
   ===================================================================== */
(function () {
  function impRrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  function impLabelIndices(rows, grain) {
    if (rows.length <= 30) return rows.map(function (_, i) { return i; });
    if (grain === 'monthly') {
      var latestMonth = rows[rows.length - 1] && rows[rows.length - 1].month;
      return rows.map(function (row, i) { return row.month === latestMonth ? i : -1; }).filter(function (i) { return i >= 0; });
    }
    if (grain === 'quarterly') {
      var latestQuarter = rows[rows.length - 1] && rows[rows.length - 1].quarter;
      return rows.map(function (row, i) { return row.quarter === latestQuarter ? i : -1; }).filter(function (i) { return i >= 0; });
    }
    return rows.map(function (_, i) { return i; });
  }
  function impTightAxis(values, forceZeroMin) {
    var valid = values.filter(Number.isFinite);
    if (!valid.length) return { min: 0, max: 1 };
    var min = forceZeroMin ? 0 : Math.min.apply(null, valid);
    var max = Math.max.apply(null, valid);
    var pad = Math.max((max - min) * 0.12, max * 0.04, 1);
    return { min: Math.max(0, min - pad), max: max + pad };
  }

  /* LINE view. model:{rows} (filteredTotalSeries). */
  window.buildImportsLineCanvas = function (canvas, model, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var C = opts.C || {};
    var grain = opts.grain;
    var fmtMetric = opts.fmtMetric, fmtTooltip = opts.fmtTooltip;
    var azulEscuro = C.azulEscuro || '#021C45';
    var azulEscuro40 = C.azulEscuro40 || '#9AA8BB';
    var rows = model.rows || [];
    var labels = rows.map(function (row) { return row.label; });
    var values = rows.map(function (row) { return row.value; });
    var axis = impTightAxis(values, true);
    var indices = impLabelIndices(rows, grain);
    var labelPlugin = {
      id: 'importsLineLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var meta = chart.getDatasetMeta(0);
        if (!meta.visible) return;
        indices.forEach(function (i) {
          var point = meta.data[i];
          if (!point || !Number.isFinite(values[i])) return;
          var text = fmtMetric(values[i]);
          ctx.save();
          ctx.font = '800 10.5px Verdana';
          var bw = ctx.measureText(text).width + 12;
          var bh = 20;
          var leftPad = chart.chartArea.left + 8;
          var rightPad = chart.width - bw - 8;
          var x = Math.max(leftPad, Math.min(point.x - bw / 2, rightPad));
          var y = Math.max(chart.chartArea.top + 2, point.y - bh / 2);
          ctx.fillStyle = azulEscuro;
          impRrect(ctx, x, y, bw, bh, 3);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x + bw / 2, y + bh / 2 + 0.5);
          ctx.restore();
        });
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: [{
        label: 'Total Imports',
        data: values,
        borderColor: azulEscuro,
        backgroundColor: azulEscuro,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 18,
        tension: 0.28
      }] },
      plugins: [labelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 10, right: 54, top: 22, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, callbacks: { label: function (c) { return '  Total Imports: ' + fmtTooltip(c.parsed.y); } } }
        },
        scales: {
          x: { ticks: { minRotation: grain === 'annual' ? 0 : 90, maxRotation: grain === 'annual' ? 0 : 90, autoSkip: grain !== 'annual', autoSkipPadding: 8, color: azulEscuro40, font: { size: 10, family: 'Verdana' } }, grid: { display: false }, border: { display: true, color: '#C9D3DF', width: 1 } },
          y: { min: axis.min, max: axis.max, ticks: { display: true, maxTicksLimit: 5, color: azulEscuro40, padding: 7, font: { size: 10, family: 'Verdana' }, callback: function (value) { return fmtMetric(value); } }, grid: { display: false }, border: { display: true, color: '#C9D3DF', width: 1 } }
        }
      }
    });
  };

  /* STACKED view. model:{periods (filteredCountryPeriods), topCountries, keys}. */
  window.buildImportsStackedCanvas = function (canvas, model, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var C = opts.C || {};
    var palette = opts.palette || ['#021C45', '#6FDDCB', '#FF4F6C', '#18A6F1'];
    var grain = opts.grain;
    var fmtMetric = opts.fmtMetric, fmtTooltip = opts.fmtTooltip;
    var azulEscuro = C.azulEscuro || '#021C45';
    var azulEscuro40 = C.azulEscuro40 || '#9AA8BB';
    var azulEscuro60 = C.azulEscuro60 || '#667D99';
    var periods = model.periods || [];
    var topCountries = model.topCountries || [];
    var keys = model.keys || topCountries.concat(['Others']);
    var labels = periods.map(function (row) { return row.label; });
    var datasets = keys.map(function (key, idx) {
      return {
        label: key,
        data: periods.map(function (period) {
          if (key !== 'Others') return period.countries[key] || 0;
          return Object.entries(period.countries).reduce(function (sum, kv) { return topCountries.indexOf(kv[0]) >= 0 ? sum : sum + kv[1]; }, 0);
        }),
        backgroundColor: palette[idx],
        borderColor: palette[idx],
        borderWidth: 0,
        borderRadius: idx === keys.length - 1 ? { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 } : 0,
        borderSkipped: false,
        stack: 'imports'
      };
    });
    var totals = periods.map(function (_, i) { return datasets.reduce(function (sum, ds) { return sum + (ds.data[i] || 0); }, 0); });
    var axis = impTightAxis(totals, true);

    var labelPlugin = {
      id: 'importsStackLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var chartArea = chart.chartArea;
        ctx.save();
        ctx.font = '800 10.5px Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach(function (ds, di) {
          var meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach(function (bar, i) {
            var value = ds.data[i];
            if (!Number.isFinite(value) || value <= 0) return;
            var props = bar.getProps(['x', 'y', 'base', 'width'], true);
            var h = Math.abs(props.base - props.y);
            if (h < 22 || props.width < 30) return;
            var text = fmtMetric(value);
            if (ctx.measureText(text).width > props.width - 6) return;
            ctx.fillStyle = di === 1 ? azulEscuro : '#FFFFFF';
            ctx.fillText(text, props.x, props.y + h / 2);
          });
        });
        totals.forEach(function (_, i) {
          var value = 0;
          var topBar = null;
          for (var di = 0; di < chart.data.datasets.length; di++) {
            if (!chart.isDatasetVisible(di)) continue;
            var dsValue = chart.data.datasets[di].data[i] || 0;
            if (!Number.isFinite(dsValue) || dsValue <= 0) continue;
            value += dsValue;
            topBar = chart.getDatasetMeta(di).data[i];
          }
          if (!topBar || !Number.isFinite(value) || value <= 0) return;
          var x = topBar.x;
          var y = Math.max(chartArea.top + 10, topBar.y - 12);
          var text = fmtMetric(value);
          ctx.fillStyle = azulEscuro60;
          ctx.fillText(text, x, y + 0.5);
        });
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      plugins: [labelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 10, right: 18, top: 36, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF', borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12, callbacks: { label: function (c) { return '  ' + c.dataset.label + ': ' + fmtTooltip(c.parsed.y); } } }
        },
        scales: {
          x: { stacked: true, ticks: { minRotation: grain === 'annual' ? 0 : 90, maxRotation: grain === 'annual' ? 0 : 90, autoSkip: grain !== 'annual', autoSkipPadding: 8, color: azulEscuro40, font: { size: 10, family: 'Verdana' } }, grid: { display: false }, border: { display: true, color: '#C9D3DF', width: 1 } },
          y: { stacked: true, min: 0, max: axis.max, ticks: { display: true, maxTicksLimit: 5, color: azulEscuro40, padding: 7, font: { size: 10, family: 'Verdana' }, callback: function (value) { return fmtMetric(value); } }, grid: { display: false }, border: { display: true, color: '#C9D3DF', width: 1 } }
        }
      }
    });
  };
})();

/* =====================================================================
   VULCABRAS SHARE (Vulcabras Market Share, Footwear) — receita única de
   MODELO + DESENHO. Gráfico DIFERENTE do market-share principal: 2 linhas
   (Volume Market Share azul / Total Market Share turquesa) + pills de %.
   Único chrome que difere: o tamanho da fonte do pill (dash 11px fixo;
   PPT window.__fonteRotuloPx escalado) → opts.labelFontPx. A escrita da
   legenda (#vulcabras-share-card) + bind do clique são chrome por-lado.
   ===================================================================== */
(function () {
  function vshRrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  window.vulcabrasShareAxis = function (values) {
    var valid = values.filter(Number.isFinite);
    if (!valid.length) return { min: 0, max: 30 };
    var min = Math.min.apply(null, valid);
    var max = Math.max.apply(null, valid);
    var range = Math.max(max - min, 1.5);
    var pad = Math.max(range * 0.16, 0.6);
    return {
      min: Math.max(0, Math.floor((min - pad) * 2) / 2),
      max: Math.ceil((max + pad) * 2) / 2
    };
  };

  window.placeVulcabrasShareLabels = function (pills, chartArea, canvasWidth) {
    var pad = 2;
    var gap = 4;
    var rightBound = canvasWidth != null ? canvasWidth : chartArea.right;
    var clampY = function (pill, y) { return Math.max(chartArea.top + pad, Math.min(y, chartArea.bottom - pill.h - pad)); };
    var clampX = function (pill) {
      var center = pill.anchorX || pill.x + pill.w / 2;
      return Math.max(0, Math.min(center - pill.w / 2, rightBound - pill.w - pad));
    };
    var groups = [];
    pills.forEach(function (pill) {
      var center = pill.anchorX || pill.x + pill.w / 2;
      var group = groups.find(function (candidate) { return Math.abs(candidate.center - center) < 8; });
      if (!group) { group = { center: center, items: [] }; groups.push(group); }
      group.items.push(Object.assign({}, pill, { x: clampX(pill) }));
    });
    return groups.flatMap(function (group) {
      var items = group.items
        .slice()
        .sort(function (a, b) {
          var valueDiff = Number(b.value) - Number(a.value);
          return Math.abs(valueDiff) > 0.0001 ? valueDiff : a.pointY - b.pointY;
        })
        .map(function (pill) { return Object.assign({}, pill, { y: clampY(pill, pill.y) }); });
      items.forEach(function (pill, index) {
        if (index === 0) return;
        var previous = items[index - 1];
        pill.y = Math.max(pill.y, previous.y + previous.h + gap);
      });
      var overflow = items.length ? items[items.length - 1].y + items[items.length - 1].h - (chartArea.bottom - pad) : 0;
      if (overflow > 0) items.forEach(function (pill) { pill.y -= overflow; });
      var underflow = items.length ? chartArea.top + pad - items[0].y : 0;
      if (underflow > 0) items.forEach(function (pill) { pill.y += underflow; });
      items.forEach(function (pill, index) {
        if (index === 0) return;
        var previous = items[index - 1];
        pill.y = Math.max(pill.y, previous.y + previous.h + gap);
      });
      return items;
    });
  };

  window.updateVulcabrasShareAxis = function (chart) {
    if (!chart) return;
    var visibleValues = chart.data.datasets
      .flatMap(function (dataset, datasetIndex) { return chart.isDatasetVisible(datasetIndex) ? dataset.data : []; })
      .filter(Number.isFinite);
    var axis = window.vulcabrasShareAxis(visibleValues);
    chart.options.scales.y.min = axis.min;
    chart.options.scales.y.max = axis.max;
  };

  /* MODELO. state:{from,to}. data:{years, brandsFootwear, namedDenominator, totalRows}.
     Usa window.MS_VULCABRAS (marcas Vulcabras). Retorna as rows do gráfico. */
  window.computeVulcabrasShareModel = function (state, data) {
    state = state || {}; data = data || {};
    var years = data.years || [];
    var brands = data.brandsFootwear || {};
    var namedDenominator = data.namedDenominator || [];
    var totalRows = data.totalRows || [];
    var VULC = window.MS_VULCABRAS || ['Olympikus', 'Mizuno', 'Under Armour'];
    var totalByYear = {};
    totalRows.forEach(function (row) { totalByYear[Number(row.year)] = row; });
    return years
      .filter(function (year) { return year >= state.from && year <= state.to; })
      .map(function (year) {
        var index = years.indexOf(year);
        var namedTotal = Number(namedDenominator[index] || 0);
        var vulcabrasNamedGmv = VULC.reduce(function (sum, brand) {
          var value = brands[brand] && brands[brand][index];
          return sum + (Number.isFinite(value) ? Number(value) : 0);
        }, 0);
        var total = totalByYear[Number(year)];
        return {
          year: year,
          label: String(year),
          totalShare: total && Number.isFinite(total.share) ? total.share : null,
          namedShare: namedTotal ? vulcabrasNamedGmv / namedTotal : null,
          vulcabrasVolumeMn: total && total.vulcabrasVolumeMn != null ? total.vulcabrasVolumeMn : null,
          abicalVolumeMn: total && total.abicalVolumeMn != null ? total.abicalVolumeMn : null
        };
      })
      .filter(function (row) { return Number.isFinite(row.totalShare) || Number.isFinite(row.namedShare); });
  };

  /* DESENHO. rows = saída de computeVulcabrasShareModel.
     opts:{C, labelFontPx, fmtPct(v,d), fmtNumber(v,d)}. */
  window.buildVulcabrasShareChartCanvas = function (canvas, rows, opts) {
    if (!canvas || !window.Chart) return null;
    opts = opts || {};
    var C = opts.C || {};
    var labelFontPx = opts.labelFontPx || 11;
    var fmtPct = opts.fmtPct, fmtNumber = opts.fmtNumber;
    var azulEscuro = C.azulEscuro || '#021C45';
    var azulEscuro20 = C.azulEscuro20 || '#CCD4DD';
    var azulEscuro40 = C.azulEscuro40 || '#9AA8BB';
    var turquesa = C.turquesa || '#6FDDCB';
    var labels = rows.map(function (row) { return row.label; });
    var totalShares = rows.map(function (row) { return Number.isFinite(row.totalShare) ? row.totalShare * 100 : null; });
    var namedShares = rows.map(function (row) { return Number.isFinite(row.namedShare) ? row.namedShare * 100 : null; });
    var axis = window.vulcabrasShareAxis(totalShares.concat(namedShares));
    var labelPlugin = {
      id: 'vulcabrasShareLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var chartArea = chart.chartArea;
        var pills = [];
        chart.data.datasets.forEach(function (dataset, datasetIndex) {
          if (!chart.isDatasetVisible(datasetIndex)) return;
          var meta = chart.getDatasetMeta(datasetIndex);
          (meta.data || []).forEach(function (point, i) {
            var value = dataset.data[i];
            if (!point || !Number.isFinite(value)) return;
            ctx.save();
            ctx.font = '700 ' + labelFontPx + 'px Verdana';
            var text = fmtPct(value / 100, 0);
            var width = ctx.measureText(text).width + 14;
            var height = 22;
            ctx.restore();
            pills.push({ text: text, color: dataset.borderColor, x: point.x - width / 2, y: point.y - height / 2, w: width, h: height, pointY: point.y, anchorX: point.x, value: value });
          });
        });
        window.placeVulcabrasShareLabels(pills, chartArea, chart.width).forEach(function (pill) {
          ctx.save();
          ctx.fillStyle = pill.color;
          vshRrect(ctx, pill.x, pill.y, pill.w, pill.h, 4);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 ' + labelFontPx + 'px Verdana';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pill.text, pill.x + pill.w / 2, pill.y + pill.h / 2 + 0.5);
          ctx.restore();
        });
      }
    };
    var axisLinePlugin = {
      id: 'vulcabrasShareAxisLine',
      afterDraw: function (chart) {
        var ctx = chart.ctx, scales = chart.scales;
        var xScale = scales.x;
        if (!xScale) return;
        ctx.save();
        ctx.strokeStyle = azulEscuro20;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, xScale.top);
        ctx.lineTo(chart.width - 8, xScale.top);
        ctx.stroke();
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: [
        {
          label: 'Volume Market Share',
          data: totalShares,
          borderColor: azulEscuro,
          backgroundColor: azulEscuro,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: azulEscuro,
          pointBorderColor: azulEscuro,
          pointHoverRadius: 5,
          pointHitRadius: 18,
          tension: 0.25,
          spanGaps: false
        },
        {
          label: 'Total Market Share',
          data: namedShares,
          borderColor: turquesa,
          backgroundColor: turquesa,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: turquesa,
          pointBorderColor: turquesa,
          pointHoverRadius: 5,
          pointHitRadius: 18,
          tension: 0.25,
          spanGaps: false
        }
      ] },
      plugins: [labelPlugin, axisLinePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { left: 52, right: 52, top: 18, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(2,28,69,0.94)',
            titleColor: '#9AA8BB',
            bodyColor: '#FFFFFF',
            borderColor: '#344F75',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              label: function (c) {
                var row = rows[c.dataIndex];
                if (c.datasetIndex === 1) return '  Total Market Share: ' + fmtPct(row.namedShare, 1);
                return '  Volume Market Share: ' + fmtPct(row.totalShare, 1) + (Number.isFinite(row.vulcabrasVolumeMn) ? ' | Vulcabras: ' + fmtNumber(row.vulcabrasVolumeMn, 1) + 'mn / Abicalcados: ' + fmtNumber(row.abicalVolumeMn, 1) + 'mn' : '');
              }
            }
          }
        },
        scales: {
          x: { ticks: { autoSkip: false, color: azulEscuro40, font: { size: 10.5, family: 'Verdana' }, callback: function (value) { return this.getLabelForValue(value); } }, grid: { display: false }, border: { display: false } },
          y: { min: axis.min, max: axis.max, ticks: { display: false }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  };
})();

/* =====================================================================
   FOOTWEAR DECOMP (Footwear Growth Breakdown) + BRAND GMV — receita única
   de MODELO + DESENHO. Os dois lados mantêm wrappers locais finos que
   delegam pra estas fns. Único chrome por-lado: tamanho da fonte do rótulo
   (opts.labelFontPx — dash 11px; PPT window.__fonteRotuloPx). Cores/format
   vão por opts (C, fmtPct, fmtNumber). Modelos leem dados globais da nuvem
   (window.SPORTS_INDUSTRY_DATA / SPORTSWEAR_TAM / SPORTSWEAR_BRAND_SHARES).
   ===================================================================== */
(function () {
  function fdRrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  function decompLbl(v) { return v < 0 ? '(' + Math.abs(Math.round(v)) + '%)' : Math.round(v) + '%'; }

  /* ---- FOOTWEAR DECOMP ---- */
  window.getFootwearDecompAllYears = function () {
    const ac = new Map(((window.SPORTS_INDUSTRY_DATA && window.SPORTS_INDUSTRY_DATA.bestAvailable) || []).map(r => [Number(r.data_year), Number(r.apparent_consumption_mn)]));
    const tam = window.SPORTSWEAR_TAM || {};
    const years = tam.years || [], ft = tam.footwear || [];
    const out = [];
    years.forEach((y, i) => {
      if (i === 0) return;
      const totalYoy = (ft[i] && ft[i - 1]) ? ft[i] / ft[i - 1] - 1 : null;
      const vNow = ac.get(y), vPrev = ac.get(y - 1);
      const volYoy = (Number.isFinite(vNow) && Number.isFinite(vPrev) && vPrev) ? vNow / vPrev - 1 : null;
      if (totalYoy == null || volYoy == null) return;
      const priceYoy = (1 + totalYoy) / (1 + volYoy) - 1;
      out.push({ year: y, total: totalYoy * 100, volume: volYoy * 100, price: priceYoy * 100 });
    });
    return out;
  };

  window.getFootwearDecompSeriesModel = function (state) {
    state = state || {};
    const all = window.getFootwearDecompAllYears();
    if (!all.length) return [];
    const yrs = all.map(d => d.year);
    let from = state.from, to = state.to;
    if (!yrs.includes(from)) from = yrs[0];
    if (!yrs.includes(to)) to = yrs[yrs.length - 1];
    if (from > to) [from, to] = [to, from];
    return all.filter(d => d.year >= from && d.year <= to);
  };

  /* series = saída de getFootwearDecompSeriesModel. opts:{C, labelFontPx, fmtPct(v,d)}. */
  window.buildFootwearDecompChartCanvas = function (canvas, series, opts) {
    if (!canvas || !series.length || !window.Chart) return null;
    opts = opts || {};
    const C = opts.C || {};
    const labelFontPx = opts.labelFontPx || 11;
    const fmtPct = opts.fmtPct;
    const labels = series.map(d => String(d.year));
    const priceData = series.map(d => d.price);
    const volData = series.map(d => d.volume);
    const extents = series.flatMap(d => [Math.max(0, d.price) + Math.max(0, d.volume), Math.min(0, d.price) + Math.min(0, d.volume), d.total]);
    const yHi = Math.max(...extents, 0), yLo = Math.min(...extents, 0);
    const range = Math.max(8, yHi - yLo);
    const yMax = yHi + Math.max(8, range * 0.24);
    const yMin = yLo - Math.max(2, range * 0.08);
    const datasets = [
      { type: 'bar', label: 'Price', data: priceData, stack: 'g', backgroundColor: C.azulEscuro, borderColor: C.azulEscuro, borderWidth: 0, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.86 },
      { type: 'bar', label: 'Volume', data: volData, stack: 'g', backgroundColor: C.turquesa, borderColor: C.turquesa, borderWidth: 0, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.86 }
    ];
    const labelPlugin = {
      id: 'decompLabels',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales: { y: yScale } } = chart;
        const y0 = yScale.getPixelForValue(0);
        ctx.save();
        ctx.strokeStyle = '#C2CCD6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.stroke();
        ctx.restore();
      },
      afterDatasetsDraw(chart) {
        const { ctx, scales: { y: yScale } } = chart;
        const meta0 = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, di) => {
          if (!chart.isDatasetVisible(di)) return;
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((bar, i) => {
            const v = ds.data[i];
            if (!Number.isFinite(v) || Math.abs(bar.base - bar.y) < 15) return;
            ctx.fillStyle = C.branco;
            ctx.fillText(decompLbl(v), bar.x, (bar.y + bar.base) / 2);
          });
        });
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        series.forEach((d, i) => {
          const bar = meta0.data[i];
          if (!bar) return;
          const posSum = Math.max(0, chart.isDatasetVisible(0) ? d.price : 0) + Math.max(0, chart.isDatasetVisible(1) ? d.volume : 0);
          const topY = yScale.getPixelForValue(posSum);
          const text = decompLbl(d.total);
          const w = ctx.measureText(text).width + 14, hgt = 22;
          const x = bar.x - w / 2, yy = topY - hgt - 4;
          ctx.fillStyle = C.cereja;
          fdRrect(ctx, x, yy, w, hgt, 4);
          ctx.fill();
          ctx.fillStyle = C.branco;
          ctx.fillText(text, bar.x, yy + hgt / 2 + 0.5);
        });
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'bar', plugins: [labelPlugin], data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 40, right: 26, left: 0, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF',
            borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12,
            callbacks: {
              label(ctx2) { return `  ${ctx2.dataset.label}: ${fmtPct(ctx2.parsed.y, 1)}`; },
              footer(items) { const i = items[0] && items[0].dataIndex; return (i != null && series[i]) ? `  Total: ${fmtPct(series[i].total, 1)}` : ''; }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: C.azulEscuro40, font: { family: 'Verdana', size: 10.5 }, minRotation: 0, maxRotation: 0 }, grid: { display: false }, border: { color: C.azulEscuro20 } },
          y: { stacked: true, min: yMin, max: yMax, ticks: { display: false }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  };

  /* ---- BRAND GMV ---- */
  function bgBrandCategorySeries(d, category, brand, VULC) {
    const categoryBrands = (d.brands && d.brands[category]) || {};
    const members = brand === 'Vulcabras' ? VULC : [brand];
    return (d.years || []).map((_, index) => members.reduce((sum, member) => {
      const value = categoryBrands[member] && categoryBrands[member][index];
      return sum + (Number.isFinite(value) ? Number(value) : 0);
    }, 0));
  }
  function bgYoySeries(values) {
    return values.map((value, index) => index === 0 || !Number.isFinite(values[index - 1]) || values[index - 1] === 0 ? null : ((value / values[index - 1]) - 1) * 100);
  }
  function bgCagr(startValue, endValue, periods) {
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue <= 0 || endValue <= 0 || periods <= 0) return null;
    return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
  }

  /* state:{brand,from,to}. data = msData() (window.SPORTSWEAR_BRAND_SHARES). opts:{C}. */
  window.computeBrandGmvModel = function (state, data, opts) {
    opts = opts || {};
    const C = opts.C || {};
    const VULC = window.MS_VULCABRAS || ['Olympikus', 'Mizuno', 'Under Armour'];
    const d = data || { years: [], brands: {} };
    const years = d.years || [];
    if (!years.length) return null;
    let fromIdx = years.indexOf(state.from), toIdx = years.indexOf(state.to);
    if (fromIdx < 0) fromIdx = 0;
    if (toIdx < 0) toIdx = years.length - 1;
    if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
    const apparelMn = bgBrandCategorySeries(d, 'apparel', state.brand, VULC);
    const footwearMn = bgBrandCategorySeries(d, 'footwear', state.brand, VULC);
    const totalMn = years.map((_, index) => apparelMn[index] + footwearMn[index]);
    const shownYears = years.slice(fromIdx, toIdx + 1);
    const sliceBn = values => values.slice(fromIdx, toIdx + 1).map(value => value / 1000);
    return {
      brand: state.brand,
      years: shownYears,
      values: sliceBn(totalMn),
      stackedSeries: [
        { key: 'footwear', label: 'Footwear', color: C.azulEscuro, values: sliceBn(footwearMn) },
        { key: 'apparel', label: 'Apparel', color: C.turquesa, values: sliceBn(apparelMn) }
      ],
      yoy: bgYoySeries(totalMn).slice(fromIdx, toIdx + 1),
      cagr: bgCagr(totalMn[fromIdx], totalMn[toIdx], toIdx - fromIdx),
      apparelCagr: bgCagr(apparelMn[fromIdx], apparelMn[toIdx], toIdx - fromIdx),
      footwearCagr: bgCagr(footwearMn[fromIdx], footwearMn[toIdx], toIdx - fromIdx),
      lineColor: C.cereja
    };
  };

  /* selected = saída de computeBrandGmvModel. opts:{C, labelFontPx, fmtNumber(v,d), fmtPct(v,d)}. */
  window.buildBrandGmvChartCanvas = function (canvas, selected, opts) {
    if (!canvas || !selected || !window.Chart) return null;
    opts = opts || {};
    const C = opts.C || {};
    const labelFontPx = opts.labelFontPx || 11;
    const fmtNumber = opts.fmtNumber, fmtPct = opts.fmtPct;
    const cereja = C.cereja || '#FF4F6C';
    const labels = selected.years;
    const yoyData = selected.yoy;
    const lineColor = selected.lineColor || cereja;
    const barData = selected.values;
    const barMax = Math.max(...barData, 0.1) * 1.18;
    const yoyValues = yoyData.filter(Number.isFinite);
    const yoyObservedMax = Math.max(...yoyValues, 0);
    const yoyObservedMin = Math.min(...yoyValues, 0);
    const yoyRange = Math.max(10, yoyObservedMax - yoyObservedMin);
    const yoyScaleMax = Math.ceil(yoyObservedMax + Math.max(4, yoyRange * 0.08));
    const yoyScaleMin = Math.floor(yoyObservedMin - Math.max(4, yoyRange * 0.10));
    const datasets = [];
    selected.stackedSeries.forEach(s => datasets.push({
      type: 'bar', label: s.label, data: s.values, stack: 'brand-gmv', yAxisID: 'y', order: 2,
      backgroundColor: s.color, borderColor: s.color, borderWidth: 0, borderSkipped: false,
      barPercentage: 0.74, categoryPercentage: 0.88
    }));
    datasets.push({
      type: 'line', label: 'YoY', data: yoyData, yAxisID: 'y1', order: 1,
      borderColor: lineColor, backgroundColor: lineColor, borderWidth: 2.5,
      pointRadius: 3, pointBackgroundColor: lineColor, pointBorderColor: lineColor,
      pointHoverRadius: 5, pointHitRadius: 18, tension: 0.25
    });
    const labelPlugin = {
      id: 'msBrandGmvLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const lineIndex = chart.data.datasets.findIndex(ds => ds.type === 'line');
        const lineMeta = lineIndex >= 0 ? chart.getDatasetMeta(lineIndex) : null;
        const lineVisible = lineIndex >= 0 && chart.isDatasetVisible(lineIndex);
        const yoyBoxes = [];
        const barInfos = [];
        chart.data.datasets.forEach((ds, idx) => {
          if (ds.type === 'bar' && chart.isDatasetVisible(idx)) barInfos.push({ meta: chart.getDatasetMeta(idx), data: ds.data });
        });
        const stackTops = labels.map((_, index) => {
          let topY = null, barRef = null, sum = 0;
          barInfos.forEach(info => {
            const bar = info.meta.data[index];
            if (!bar) return;
            if (topY === null || bar.y < topY) { topY = bar.y; barRef = bar; }
            const val = info.data[index];
            if (Number.isFinite(val)) sum += val;
          });
          return { topY, barRef, sum };
        });
        ctx.save();
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        if (lineMeta && lineVisible) lineMeta.data.forEach((point, index) => {
          const value = yoyData[index];
          if (!point || !Number.isFinite(value)) return;
          const text = `${Math.round(value)}%`;
          const width = ctx.measureText(text).width + 14;
          const height = 22;
          let x = point.x - width / 2;
          let y = point.y - height / 2;
          x = Math.max(chartArea.left + 2, Math.min(x, chartArea.right - width - 2));
          y = Math.max(chartArea.top + 4, y);
          yoyBoxes[index] = { x, y, width, height };
        });
        ctx.restore();
        ctx.save();
        ctx.font = '700 12px Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.branco;
        chart.data.datasets.forEach((ds, idx) => {
          if (ds.type !== 'bar' || !chart.isDatasetVisible(idx)) return;
          const meta = chart.getDatasetMeta(idx);
          meta.data.forEach((bar, i) => {
            const value = ds.data[i];
            if (!bar || !Number.isFinite(value) || value <= 0) return;
            const segHeight = Math.abs(bar.base - bar.y);
            if (segHeight < 18) return;
            const labelX = bar.x;
            let labelY = bar.y + (bar.base - bar.y) / 2;
            const segTotal = stackTops[i] ? stackTops[i].sum : 0;
            const text = segTotal > 0 ? `${Math.round((value / segTotal) * 100)}%` : '';
            const box = yoyBoxes[i];
            if (box) {
              const tw = ctx.measureText(text).width;
              const overlapsX = Math.abs(labelX - (box.x + box.width / 2)) < ((tw + box.width) / 2);
              const overlapsY = Math.abs(labelY - (box.y + box.height / 2)) < ((16 + box.height) / 2);
              if (overlapsX && overlapsY) {
                const segTop = Math.min(bar.y, bar.base), segBottom = Math.max(bar.y, bar.base);
                const candDown = box.y + box.height + 9, candUp = box.y - 9;
                if ((box.y + box.height / 2) <= labelY && candDown + 8 <= segBottom - 2) labelY = candDown;
                else if (candUp - 8 >= segTop + 2) labelY = candUp;
                else if (candDown + 8 <= segBottom - 2) labelY = candDown;
                labelY = Math.max(segTop + 10, Math.min(segBottom - 10, labelY));
              }
            }
            ctx.fillText(text, labelX, labelY);
          });
        });
        ctx.fillStyle = C.azulEscuro;
        stackTops.forEach((stack, index) => {
          if (!stack || stack.topY == null || !stack.barRef || stack.sum <= 0) return;
          const text = fmtNumber(stack.sum, 1);
          let labelX = stack.barRef.x;
          let labelY = Math.max(chartArea.top + 9, stack.topY - 12);
          const box = yoyBoxes[index];
          if (box) {
            const tw = ctx.measureText(text).width;
            const overlapsX = Math.abs(labelX - (box.x + box.width / 2)) < ((tw + box.width) / 2);
            const overlapsY = Math.abs(labelY - (box.y + box.height / 2)) < ((14 + box.height) / 2);
            if (overlapsX && overlapsY) labelY = Math.max(chartArea.top + 9, box.y - 11);
          }
          ctx.fillText(text, labelX, labelY);
        });
        ctx.font = '700 ' + labelFontPx + 'px Verdana';
        ctx.textBaseline = 'middle';
        if (lineMeta && lineVisible) lineMeta.data.forEach((point, index) => {
          const value = yoyData[index];
          if (!point || !Number.isFinite(value)) return;
          const text = `${Math.round(value)}%`;
          const width = ctx.measureText(text).width + 14;
          const height = 22;
          const box = yoyBoxes[index] || { x: Math.max(chartArea.left + 2, Math.min(point.x - width / 2, chartArea.right - width - 2)), y: Math.max(chartArea.top + 4, point.y - 11) };
          ctx.fillStyle = lineColor;
          fdRrect(ctx, box.x, box.y, width, height, 4);
          ctx.fill();
          ctx.fillStyle = C.branco;
          ctx.fillText(text, box.x + width / 2, box.y + height / 2 + 0.5);
        });
        ctx.restore();
      }
    };
    return new window.Chart(canvas.getContext('2d'), {
      type: 'bar', plugins: [labelPlugin], data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 52, right: 26, left: 0, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(2,28,69,0.94)', titleColor: '#9AA8BB', bodyColor: '#FFFFFF',
            borderColor: '#344F75', borderWidth: 1, cornerRadius: 8, padding: 12,
            callbacks: {
              label(ctx2) {
                const v = ctx2.parsed.y;
                if (ctx2.dataset.yAxisID === 'y1') return v == null ? '' : `  YoY: ${fmtPct(v, 1)}`;
                return `  ${ctx2.dataset.label}: R$ ${fmtNumber(v, 1)} bn`;
              },
              footer(items) {
                const total = items.filter(c => c.dataset.yAxisID !== 'y1').reduce((sum, c) => sum + (Number.isFinite(c.parsed.y) ? c.parsed.y : 0), 0);
                return total ? `  Total: R$ ${fmtNumber(total, 1)} bn` : '';
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: C.azulEscuro40, font: { family: 'Verdana', size: 10.5 }, minRotation: 0, maxRotation: 0 }, grid: { display: false }, border: { color: C.azulEscuro20 } },
          y: { stacked: true, min: 0, max: barMax, ticks: { display: false }, grid: { display: false }, border: { display: false } },
          y1: { position: 'right', min: yoyScaleMin, max: yoyScaleMax, ticks: { display: false }, grid: { display: false, drawOnChartArea: false }, border: { display: false } }
        }
      }
    });
  };
})();

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

/* ---- LISTA ÚNICA DE CAIXAS do Imports (fonte de verdade dos seletores) ------
   O dashboard E a apresentação carregam este arquivo e montam as caixas a partir
   DESTA lista. Adicionar/remover uma caixa aqui = aparece/some nos DOIS lados,
   sem editar mais nada. (From/To são dinâmicos e ficam fora da lista; cada lado
   os monta com seu próprio helper de período.) onchange = handler nativo do dash. */
window.IMPORTS_CONTROL_SPEC = window.IMPORTS_CONTROL_SPEC || [
  { key: 'view',   label: 'View',   width: 148, onchange: 'setImportsView()',   options: [{ v: 'line', t: 'Line' }, { v: 'stacked', t: 'Stacked bar' }] },
  { key: 'grain',  label: 'Grain',  width: 126, onchange: 'setImportsGrain()',  options: [{ v: 'monthly', t: 'Monthly' }, { v: 'quarterly', t: 'Quarterly' }, { v: 'annual', t: 'Annual' }] },
  { key: 'base',   label: 'Base',   width: 126, onchange: 'setImportsBase()',   disableWhenAnnual: true, options: [{ v: 'spot', t: 'Spot' }, { v: 'ltm', t: 'LTM' }] },
  { key: 'metric', label: 'Metric', width: 116, onchange: 'setImportsMetric()', options: [{ v: 'fob', t: 'FOB' }, { v: 'volume', t: 'Volume' }] }
];

registerChart({
  id: 'imports-data',
  titulo: 'Sports Footwear Imports',
  unidade: '(USD mn)',
  dashboardNative: true,
  // subtítulo dinâmico: acompanha a caixa Metric (FOB = USD mn, Volume = mn pairs), igual ao dashboard
  subtituloDinamico: function () { return DASH.importsState.metric === 'volume' ? '(mn pairs)' : '(USD mn)'; },
  desenhar: function (canvas) { regClaimId(canvas, 'imports-main-chart'); DASH.renderImportsChart(); return Chart.getChart(canvas); },
  montarControles: function () {
    // monta as caixas simples a partir da LISTA ÚNICA + acrescenta From/To
    var simples = window.IMPORTS_CONTROL_SPEC.map(function (c) {
      var opts = c.options.map(function (o) { return '<option value="' + o.v + '">' + o.t + '</option>'; }).join('');
      return '<label>' + c.label + ' <select data-im="' + c.key + '">' + opts + '</select></label>';
    }).join('');
    return simples +
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
    return regPresBoxes('vulcabras-share') +
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
    // Rótulos/ordem espelham o dashboard (mesma análise; 'reported' e 'total' = mercado total — o chart só trata 'named' à parte)
    return '<label>Category <select data-ms="category"><option value="total">Total</option><option value="footwear">Footwear</option><option value="apparel">Apparel</option></select></label>' +
           '<label>Vulcabras <select data-ms="vulcabras"><option value="separate">Separate</option><option value="combined">Combined</option></select></label>' +
           '<label>Share Basis <select data-ms="basis"><option value="reported">Euromonitor</option><option value="named">Named Players</option></select></label>' +
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
    // Sport (per-slide) + caixas da LISTA ÚNICA (window.ECOM_SPECS.price, mesma do dashboard) + painel de séries
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>`
      + ecomPresControlBar('price')
      + `<div id="series-panel"></div>`;
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
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>`
      + ecomPresControlBar('disc')
      + `<div id="disc-series-panel"></div>`;
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
              <option value="corrida">Corrida</option><option value="performance" selected>Performance</option><option value="all">All</option></select></label>`
      + ecomPresControlBar('avgdisc')
      + `<div id="avgdisc-series-panel"></div>`;
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
    // Sport (per-slide, default All no franchise) + caixas da LISTA ÚNICA (window.ECOM_SPECS.franchise, mesma do dashboard)
    return `<label>Sport <select data-ecom-sport>
              <option value="corrida">Corrida</option><option value="performance">Performance</option><option value="all" selected>All</option></select></label>`
      + ecomPresControlBar('franchise');
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
  id: 'caged-jobs', titulo: "Vulcabras' Estimated Factory Headcount", unidade: '(#, Percentage)', dashboardNative: true,
  legenda: [{ cor: '#021C45', texto: 'Estimated Headcount' }, { cor: '#6FDDCB', texto: 'YoY' }],
  desenhar(canvas) { regClaimId(canvas, 'presentation-caged-jobs-chart'); renderPresentationCagedJobsChart(); return Chart.getChart(canvas); },
  montarControles() {
    return regPresBoxes('caged-jobs') +
           `<label>From <select data-cg="from"></select></label>
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
    return regPresBoxes('headcount-volume') +
           `<label>From <select data-vy="from"></select></label>
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
