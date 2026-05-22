// Price Pass-Through Summary — same-SKU price variation across windows.
// Methodology aligned with the rest of the dashboard (SPORT_CATS, BRAND_COLOR, series keys).
// Always uses clipped variants (var_*_c, SKU-level [-50%, +100%]).
// Reads window.RAW_PASSTHROUGH_OLY / MIZ / UA / CENTAURO.

(function() {
  'use strict';

  // ── Sport buckets — mirror SPORT_CATS in ecom-data-wip.html ─────────────────
  const SPORT_CATS_PT = {
    olympikus: { all: null, performance: ['Corrida','Caminhada','Treino e Academia','Trilha'], corrida: ['Corrida'] },
    mizuno:    { all: null, performance: ['Corrida','Treino','Trilha'],                          corrida: ['Corrida'] },
    ua:        { all: null, performance: ['Corrida','Treino','Trilha','Caminhada'],              corrida: ['Corrida'] },
    centauro:  { all: null, performance: ['Corrida / Caminhada','Academia / Fitness','Aventura','Treino'], corrida: ['Corrida / Caminhada'] },
  };

  const BC = {
    adidas:    '#021C45',
    nike:      '#FF5B76',
    ua:        '#18A6F1',
    asics:     '#58D9D1',
    olympikus: '#5A0F4A',
    mizuno:    '#667D99',
  };
  const BRAND_IDS    = ['adidas','nike','ua','asics','olympikus','mizuno'];
  const BRAND_LABELS = { adidas:'Adidas', nike:'Nike', ua:'Under Armour', asics:'Asics', olympikus:'Olympikus', mizuno:'Mizuno' };

  // ── Series — match the rest of the dashboard (brand|source) ────────────────
  const ALL_PASS_SERIES = [
    // Website (Aster + Direct — Direct deferred, will appear when scraper has 1+ ISO week of history)
    { key:'olympikus|direct',  label:'Olympikus — Website',     brand:'olympikus', source:'olympikus', srcSet:'oly', brandRaw:null,             color:BC.olympikus },
    { key:'mizuno|direct',     label:'Mizuno — Website',        brand:'mizuno',    source:'mizuno',    srcSet:'miz', brandRaw:null,             color:BC.mizuno    },
    { key:'ua|direct',         label:'Under Armour — Website',  brand:'ua',        source:'ua',        srcSet:'ua',  brandRaw:null,             color:BC.ua        },
    // Centauro
    { key:'adidas|centauro',   label:'Adidas — Centauro',       brand:'adidas',    source:'centauro',  srcSet:'ctr', brandRaw:'adidas',         color:BC.adidas    },
    { key:'nike|centauro',     label:'Nike — Centauro',         brand:'nike',      source:'centauro',  srcSet:'ctr', brandRaw:'Nike',           color:BC.nike      },
    { key:'ua|centauro',       label:'Under Armour — Centauro', brand:'ua',        source:'centauro',  srcSet:'ctr', brandRaw:'Under Armour',   color:BC.ua        },
    { key:'asics|centauro',    label:'Asics — Centauro',        brand:'asics',     source:'centauro',  srcSet:'ctr', brandRaw:'Asics',          color:BC.asics     },
    { key:'olympikus|centauro',label:'Olympikus — Centauro',    brand:'olympikus', source:'centauro',  srcSet:'ctr', brandRaw:'Olympikus',      color:BC.olympikus },
    { key:'mizuno|centauro',   label:'Mizuno — Centauro',       brand:'mizuno',    source:'centauro',  srcSet:'ctr', brandRaw:'Mizuno',         color:BC.mizuno    },
  ];
  const SERIES_BY_KEY = Object.fromEntries(ALL_PASS_SERIES.map(s => [s.key, s]));

  // Free Choice state (defaults align with other charts)
  const DEFAULT_ON = new Set([
    'olympikus|direct','mizuno|direct',
    'adidas|centauro','nike|centauro','asics|centauro',
  ]);
  const PASS_ON = {};
  ALL_PASS_SERIES.forEach(s => { PASS_ON[s.key] = DEFAULT_ON.has(s.key); });

  // ── Date helpers — same convention as dashboard ────────────────────────────
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function weekToDate(w) { return new Date(w + 'T00:00:00'); }
  function getISOWeek(d) {
    const dt = new Date(d.getTime()); dt.setHours(0,0,0,0);
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    const w1 = new Date(dt.getFullYear(), 0, 4);
    return 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  }
  function getISOWeekYear(d) {
    const dt = new Date(d.getTime());
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    return dt.getFullYear();
  }
  function fmtGranKey(w, gran) {
    const d = weekToDate(w);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (gran === 'monthly')   return `${y}-${String(m).padStart(2,'0')}`;
    if (gran === 'quarterly') return `${y}-Q${Math.ceil(m/3)}`;
    if (gran === 'annual')    return String(y);
    return w;
  }
  function fmtGranLabel(key, gran) {
    if (gran === 'monthly')   { const [y,m] = key.split('-'); return `${MON[+m-1]}-${y.slice(2)}`; }
    if (gran === 'quarterly') { const [y,q] = key.split('-'); return `${q} ${y}`; }
    if (gran === 'annual')    return key;
    const d = weekToDate(key);
    return `${getISOWeek(d)}W${String(getISOWeekYear(d)).slice(2)}`;
  }

  // ── Data access (always clipped) ───────────────────────────────────────────
  function rawRowsFor(serie) {
    if (serie.srcSet === 'oly') return (typeof RAW_PASSTHROUGH_OLY      !== 'undefined') ? RAW_PASSTHROUGH_OLY      : [];
    if (serie.srcSet === 'miz') return (typeof RAW_PASSTHROUGH_MIZ      !== 'undefined') ? RAW_PASSTHROUGH_MIZ      : [];
    if (serie.srcSet === 'ua')  return (typeof RAW_PASSTHROUGH_UA       !== 'undefined') ? RAW_PASSTHROUGH_UA       : [];
    if (serie.srcSet === 'ctr') return (typeof RAW_PASSTHROUGH_CENTAURO !== 'undefined') ? RAW_PASSTHROUGH_CENTAURO : [];
    return [];
  }
  function filterBySerieAndScope(serie, scope) {
    let rows = rawRowsFor(serie);
    if (serie.brandRaw !== null) rows = rows.filter(r => r.brand === serie.brandRaw);
    const allowedCats = SPORT_CATS_PT[serie.source][scope];
    if (allowedCats !== null) {
      const set = new Set(allowedCats);
      rows = rows.filter(r => set.has(r.cat));
    }
    return rows;
  }
  // Always clipped:
  const varField = (priceType, win) => `var_${priceType}_${win}_c`;
  const priceField = (priceType)    => `p_${priceType}`;

  // ── Controls ────────────────────────────────────────────────────────────────
  let passViewMode      = 'comparison';
  let passCompChannel   = 'centauro';
  let passBreakdownBrand = 'adidas';

  function getPriceType() { return document.getElementById('pass-price').value; }
  function getChartWindow() { return document.getElementById('pass-window').value; }
  function getScope()     { return document.getElementById('sport-filter').value; }   // shared with the rest of the dashboard
  function getGran()      { return document.getElementById('pass-gran-select').value; }
  function getFromKey()   { return document.getElementById('pass-from-select').value; }
  function getToKey()     { return document.getElementById('pass-to-select').value; }

  // Aggregate (date,cat) rows to weekly with weighted-by-n cross-cat mean. Returns {w, val, n}[].
  function weeklyFromRows(rows, field) {
    const byW = new Map();
    for (const r of rows) {
      const v = r[field];
      if (v === null || v === undefined) continue;
      const n = r.n || 0;
      if (n === 0) continue;
      const w = r.w;
      if (!byW.has(w)) byW.set(w, { sum:0, n:0 });
      const acc = byW.get(w);
      acc.sum += v * n; acc.n += n;
    }
    return Array.from(byW.entries())
      .map(([w, x]) => ({ w, val: x.n > 0 ? x.sum / x.n : null, n: x.n }))
      .sort((a,b) => a.w.localeCompare(b.w));
  }

  // Roll weekly → granularity (simple mean across weeks in the bucket).
  function rollToGran(weeklyArr, gran) {
    if (gran === 'weekly') return weeklyArr.map(p => ({ key: p.w, val: p.val, n: p.n, firstW: p.w }));
    const groups = new Map();
    for (const p of weeklyArr) {
      if (p.val === null) continue;
      const k = fmtGranKey(p.w, gran);
      if (!groups.has(k)) groups.set(k, { sum:0, cnt:0, firstW: p.w, n: 0 });
      const g = groups.get(k);
      g.sum += p.val; g.cnt += 1; g.n += p.n;
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({ key, val: g.cnt > 0 ? g.sum / g.cnt : null, n: g.n, firstW: g.firstW }))
      .sort((a,b) => a.firstW.localeCompare(b.firstW));
  }

  // ── Active series by view/channel ──────────────────────────────────────────
  function getActiveSeries() {
    if (passViewMode === 'comparison') {
      if (passCompChannel === 'free') {
        return ALL_PASS_SERIES.filter(s => PASS_ON[s.key]);
      }
      // map channel value to series source suffix
      const map = { website:'direct', centauro:'centauro', netshoes:'netshoes' };
      const want = map[passCompChannel];
      // Return one series per brand for that channel; if missing in ALL_PASS_SERIES, return a stub
      return BRAND_IDS.map(b => {
        const key = `${b}|${want}`;
        const s = SERIES_BY_KEY[key];
        if (s) return s;
        return { key, label: `${BRAND_LABELS[b]}`, brand:b, source:'__missing', srcSet:'__missing', brandRaw:null, color:BC[b], missing:true };
      });
    } else {
      // breakdown: brand fixed; show all channels for that brand
      const b = passBreakdownBrand;
      const channels = ['direct','centauro','netshoes'];
      return channels.map(ch => {
        const key = `${b}|${ch}`;
        const s = SERIES_BY_KEY[key];
        if (s) return s;
        return { key, label: `${BRAND_LABELS[b]} — ${ch === 'direct' ? 'Website' : ch === 'centauro' ? 'Centauro' : 'Netshoes'}`,
                 brand:b, source:'__missing', srcSet:'__missing', brandRaw:null, color:BC[b], missing:true };
      });
    }
  }

  // Returns array of all granularity-period objects across active series.
  function allPeriodsForActive() {
    const scope = getScope();
    const gran = getGran();
    const set = new Set();
    for (const s of getActiveSeries()) {
      if (s.missing) continue;
      const rows = filterBySerieAndScope(s, scope);
      const wks = new Set(rows.map(r => r.w));
      if (gran === 'weekly') wks.forEach(w => set.add(w));
      else wks.forEach(w => set.add(fmtGranKey(w, gran)));
    }
    return Array.from(set).sort();
  }

  function populateFromTo() {
    const gran = getGran();
    const periods = allPeriodsForActive();
    const fromSel = document.getElementById('pass-from-select');
    const toSel   = document.getElementById('pass-to-select');
    const prevFrom = fromSel.value, prevTo = toSel.value;
    const opts = periods.map(p => `<option value="${p}">${fmtGranLabel(p, gran)}</option>`).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML   = opts;
    if (periods.length === 0) return;
    // Default: from = ~52 weeks back (or first period); to = latest
    const earliest = (gran === 'weekly' && periods.length > 52) ? periods[periods.length - 52] : periods[0];
    fromSel.value = periods.includes(prevFrom) ? prevFrom : earliest;
    toSel.value   = periods.includes(prevTo)   ? prevTo   : periods[periods.length - 1];
  }

  // ── Series panel (multi-select for Free Choice) ────────────────────────────
  let passSeriesPanelOpen = false;
  function renderSeriesPanel() {
    const panel = document.getElementById('pass-series-panel');
    if (!panel) return;
    if (!passSeriesPanelOpen) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    panel.style.cssText = 'position:absolute;background:#fff;border:1px solid #E0E4EA;border-radius:8px;box-shadow:0 8px 24px rgba(2,28,69,0.12);padding:10px;z-index:1000;display:block;';
    // Position under the trigger
    const trig = document.getElementById('pass-series-trigger');
    if (trig) {
      const r = trig.getBoundingClientRect();
      panel.style.top  = (window.scrollY + r.bottom + 6) + 'px';
      panel.style.left = (window.scrollX + r.left) + 'px';
      panel.style.minWidth = (r.width + 80) + 'px';
    }
    const grouped = { Website: [], Centauro: [], Netshoes: [] };
    for (const s of ALL_PASS_SERIES) {
      const ch = s.key.endsWith('|direct') ? 'Website' : s.key.endsWith('|centauro') ? 'Centauro' : 'Netshoes';
      grouped[ch].push(s);
    }
    panel.innerHTML = Object.entries(grouped).map(([ch, list]) => `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;color:#9AA8BB;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px;">${ch}</div>
        ${list.map(s => `
          <label class="series-option" style="display:flex;align-items:center;gap:6px;padding:3px 4px;font-size:11px;cursor:pointer;">
            <input type="checkbox" ${PASS_ON[s.key] ? 'checked' : ''} onchange="window._passToggleSeries('${s.key}')">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
            ${s.label}
          </label>`).join('')}
      </div>`).join('');
  }
  window.togglePassSeriesPanel = function() {
    passSeriesPanelOpen = !passSeriesPanelOpen;
    renderSeriesPanel();
  };
  // Close panel on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('pass-series-panel');
    const trig  = document.getElementById('pass-series-trigger');
    if (!panel || !trig) return;
    if (panel.style.display !== 'block') return;
    if (panel.contains(e.target) || trig.contains(e.target)) return;
    passSeriesPanelOpen = false; renderSeriesPanel();
  }, true);

  // ── View mode handlers (called from HTML) ──────────────────────────────────
  window.onPassViewModeChange = function() {
    passViewMode = document.getElementById('pass-view-mode').value;
    const isBreakdown = passViewMode === 'breakdown';
    document.getElementById('pass-comp-channel-block').style.display       = isBreakdown ? 'none' : '';
    document.getElementById('pass-breakdown-brand-block').style.display    = isBreakdown ? '' : 'none';
    document.getElementById('pass-series-trigger-block').style.display     = (!isBreakdown && passCompChannel === 'free') ? '' : 'none';
    populateFromTo(); render();
  };
  window.onPassCompChannelChange = function() {
    passCompChannel = document.getElementById('pass-comp-channel').value;
    document.getElementById('pass-series-trigger-block').style.display = (passCompChannel === 'free') ? '' : 'none';
    populateFromTo(); render();
  };
  window.onPassBreakdownBrandChange = function() {
    passBreakdownBrand = document.getElementById('pass-breakdown-brand').value;
    populateFromTo(); render();
  };
  window.onPassGranChange = function() { populateFromTo(); render(); };
  window._passToggleSeries = function(key) {
    PASS_ON[key] = !PASS_ON[key];
    document.getElementById('pass-series-trigger-label').textContent =
      `${Object.values(PASS_ON).filter(Boolean).length} series selected`;
    populateFromTo(); render();
    renderSeriesPanel();
  };
  window._passRender = function() { render(); };

  // ── Chart — same visual language as buildAvgDiscChart ──────────────────────
  let passChart = null;
  function renderChart() {
    const priceType = getPriceType();
    const win = getChartWindow();
    const field = varField(priceType, win);
    const gran  = getGran();
    const fromK = getFromKey(), toK = getToKey();

    const seriesPairs = [];
    const allKeys = new Set();
    for (const s of getActiveSeries()) {
      if (s.missing) continue;
      const rows = filterBySerieAndScope(s, getScope());
      const weekly = weeklyFromRows(rows, field);
      const rolled = rollToGran(weekly, gran).filter(p => p.key >= fromK && p.key <= toK);
      if (rolled.length === 0) continue;
      rolled.forEach(p => allKeys.add(p.key));
      seriesPairs.push({ s, rolled });
    }
    const sortedKeys = Array.from(allKeys).sort();

    // Symmetric % Y-axis with rounded step (allow negatives)
    const allVals = seriesPairs.flatMap(({ rolled }) => rolled.map(p => p.val)).filter(v => v != null && isFinite(v));
    const dataMin = allVals.length ? Math.min(...allVals) : -0.05;
    const dataMax = allVals.length ? Math.max(...allVals) : 0.05;
    const range   = (dataMax - dataMin) || Math.max(Math.abs(dataMax), Math.abs(dataMin), 0.05);
    const roughStep = range / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multipliers = [1, 2, 2.5, 5, 10];
    let yStep = magnitude * multipliers[multipliers.length - 1];
    for (const m of multipliers) { const ms = magnitude * m; if (ms >= roughStep) { yStep = ms; break; } }
    const yMin = Math.floor((dataMin - range * 0.02) / yStep) * yStep;
    const yMax = Math.ceil((dataMax  + range * 0.02) / yStep) * yStep;

    const datasets = seriesPairs.map(({ s, rolled }) => {
      const pm = new Map(rolled.map(p => [p.key, p.val]));
      return {
        label: s.label,
        data:  sortedKeys.map(k => pm.get(k) ?? null),
        borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2.5, borderDash: s.dash || [],
        tension: 0.28, pointRadius: 0, pointHoverRadius: 0,
        spanGaps: false, fill: false,
      };
    });

    if (passChart) { passChart.destroy(); passChart = null; }
    const canvas = document.getElementById('pass-chart');
    if (!canvas) return;
    const plugins = [];
    if (window.priceLabelPlugin)   plugins.push(window.priceLabelPlugin);
    if (window.extendedAxisPlugin) plugins.push(window.extendedAxisPlugin);

    passChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: sortedKeys.map(k => fmtGranLabel(k, gran)), datasets },
      plugins,
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 72, right: 22, bottom: 8, left: 0 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#021C45', padding: 12,
            titleColor: '#FFFFFF', bodyColor: '#FFFFFF',
            titleFont: { size: 12, weight: 'bold', family: 'Verdana' },
            bodyFont:  { size: 12, family: 'Verdana' },
            borderWidth: 0, displayColors: true, boxWidth: 10, boxHeight: 10,
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                if (v == null) return ` ${ctx.dataset.label}: —`;
                const pct = Math.round(v * 100);
                return ` ${ctx.dataset.label}: ${pct > 0 ? '+' : ''}${pct}%`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color:'#667D99', font:{size:9,family:'Verdana',weight:'normal'}, minRotation:90, maxRotation:90, autoSkip:true, maxTicksLimit:52 } },
          y: { display: true, min: yMin, max: yMax,
               grid: { display: false },
               border: { display: true, color: '#CCD4DD', width: 1 },
               ticks: { color:'#667D99', font:{size:11,family:'Verdana',weight:'normal'}, stepSize: yStep, padding: 10,
                        callback: v => { const pct = Math.round(v * 100); return (pct > 0 ? '+' : '') + pct + '%'; } } }
        }
      }
    });
    passChart.$pillFmt = v => { const pct = Math.round(v * 100); return (pct > 0 ? '+' : '') + pct + '%'; };
    passChart.$ecomExtendedAxis = true;
    passChart.update('none');
  }

  function renderLegend() {
    const html = getActiveSeries().map(s => {
      const dim = s.missing ? 'opacity:0.4;text-decoration:line-through;' : '';
      return `<span class="legend-pill" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;font-size:11px;background:${s.color}1A;color:${s.color};border:1px solid ${s.color}40;${dim}">
        <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
        ${s.label}
      </span>`;
    }).join(' ');
    document.getElementById('pass-legend').innerHTML = html;
  }

  // ── Summary table (BPC-style) ──────────────────────────────────────────────
  function heatBadge(v) {
    if (v === null || v === undefined || !isFinite(v)) {
      return `<span style="color:#9AA8BB;font-weight:700;">—</span>`;
    }
    const mag = Math.max(0.18, Math.min(Math.abs(v) / 0.15, 1));
    const bg = v > 0 ? `rgba(88,217,209,${0.18 + mag * 0.48})` : (v < 0 ? `rgba(255,79,108,${0.18 + mag * 0.52})` : '#F2F4F8');
    const color = v > 0 ? '#0D7E6A' : (v < 0 ? '#8F1028' : '#021C45');
    const pct = Math.round(v * 100);
    const sign = pct > 0 ? '+' : '';
    return `<span style="display:inline-block;min-width:64px;padding:6px 10px;border-radius:6px;background:${bg};color:${color};font-weight:800;box-shadow:inset 0 0 0 1px rgba(2,28,69,0.06);font-size:12px;font-family:Verdana,Geneva,sans-serif;">${sign}${pct}%</span>`;
  }

  // For a given series and the To-period selected, aggregate the latest week
  // *inside or at* that To-period across all cats (weighted by n) and return
  // {price, var_1w, var_1m, var_3m, var_1y, var_ytd} or null if no data.
  function refValuesForSerie(serie) {
    if (serie.missing) return null;
    const priceType = getPriceType();
    const scope = getScope();
    const gran = getGran();
    const toK = getToKey();
    const rows = filterBySerieAndScope(serie, scope);
    if (rows.length === 0) return null;
    // Identify candidate w within the To-period
    const candW = rows
      .map(r => r.w)
      .filter(w => fmtGranKey(w, gran) <= toK)
      .filter(w => fmtGranKey(w, gran) === toK || gran !== 'weekly') // include only To-period rows when granular > weekly? actually we want the latest w that maps to toK
      ;
    // Want: latest w such that fmtGranKey(w, gran) === toK; if none, fall back to latest w with fmtGranKey <= toK
    let pickW = null;
    const ws = Array.from(new Set(rows.map(r => r.w))).sort();
    for (let i = ws.length - 1; i >= 0; i--) {
      if (fmtGranKey(ws[i], gran) === toK) { pickW = ws[i]; break; }
    }
    if (pickW === null) {
      for (let i = ws.length - 1; i >= 0; i--) {
        if (fmtGranKey(ws[i], gran) <= toK) { pickW = ws[i]; break; }
      }
    }
    if (pickW === null) return null;
    const wkRows = rows.filter(r => r.w === pickW);
    const fields = [
      priceField(priceType),
      varField(priceType,'1w'), varField(priceType,'1m'), varField(priceType,'3m'),
      varField(priceType,'1y'), varField(priceType,'ytd'),
    ];
    const out = { w: pickW };
    for (const f of fields) {
      let sum=0, n=0;
      for (const r of wkRows) {
        const v = r[f];
        if (v === null || v === undefined) continue;
        const w = r.n || 0;
        if (w === 0) continue;
        sum += v * w; n += w;
      }
      out[f] = n > 0 ? sum / n : null;
    }
    return out;
  }

  function renderTable() {
    const priceType = getPriceType();
    const series = getActiveSeries();
    const isBreakdown = passViewMode === 'breakdown';

    const rowsHtml = series.map(s => {
      const ref = refValuesForSerie(s);
      const price = ref ? ref[priceField(priceType)] : null;
      const v1w  = ref ? ref[varField(priceType,'1w')]  : null;
      const v1m  = ref ? ref[varField(priceType,'1m')]  : null;
      const v3m  = ref ? ref[varField(priceType,'3m')]  : null;
      const v1y  = ref ? ref[varField(priceType,'1y')]  : null;
      const vytd = ref ? ref[varField(priceType,'ytd')] : null;
      // In Comparison + a real channel, row label = brand (no "— Channel"); in Breakdown, row label = channel only.
      let rowLabel;
      if (isBreakdown) {
        rowLabel = s.key.endsWith('|direct') ? 'Website' : s.key.endsWith('|centauro') ? 'Centauro' : 'Netshoes';
      } else if (passCompChannel === 'free') {
        rowLabel = s.label;
      } else {
        rowLabel = BRAND_LABELS[s.brand] || s.label;
      }
      const cell = (v) => `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;">${heatBadge(v)}</td>`;
      return `<tr>
        <td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:#021C45;font-family:Verdana,Geneva,sans-serif;font-size:13px;">
          <span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>${rowLabel}
        </td>
        <td style="padding:14px 8px;border-bottom:1px solid #EBEBEB;text-align:left;color:#021C45;font-weight:700;font-family:Verdana,Geneva,sans-serif;font-size:13px;">${price != null ? 'R$ ' + Math.round(price) : '—'}</td>
        ${cell(v1w)}
        ${cell(v1m)}
        ${cell(v3m)}
        ${cell(v1y)}
        ${cell(vytd)}
      </tr>`;
    }).join('');

    document.getElementById('pass-table').innerHTML = `
      <div style="overflow-x:auto;margin-top:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;">
          <thead>
            <tr style="background:#021C45;color:#FFFFFF;">
              <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;width:38%;"></th>
              <th style="padding:12px 8px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;">Price</th>
              <th style="padding:12px 16px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:#FF4F6C;">Δ WoW</th>
              <th style="padding:12px 16px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:#FF4F6C;">Δ MoM</th>
              <th style="padding:12px 16px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:#FF4F6C;">Δ QoQ</th>
              <th style="padding:12px 16px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:#FF4F6C;">Δ YoY</th>
              <th style="padding:12px 16px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:#FF4F6C;">Δ YTD</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function render() {
    renderLegend();
    renderChart();
    renderTable();
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    if (typeof RAW_PASSTHROUGH_OLY === 'undefined') { console.warn('Passthrough data not loaded yet.'); return; }
    // Initial series-trigger label
    document.getElementById('pass-series-trigger-label').textContent =
      `${Object.values(PASS_ON).filter(Boolean).length} series selected`;
    populateFromTo();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
