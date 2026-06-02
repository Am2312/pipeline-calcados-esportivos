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
