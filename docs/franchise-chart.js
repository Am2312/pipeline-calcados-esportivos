// Franchise Pass-Through — chart + BPC-style summary table.
// Chart aggregates by brand × channel (NOT by franchise) — one line per brand/series.
// Table drills down into franchises within the selected brand × channel.
// Reads window.RAW_FRANCHISE_A, window.RAW_FRANCHISE_B.

(function() {
  'use strict';

  // ── Brand colours (match BRAND_COLOR in HTML) ─────────────────────────────
  const BC = {
    Adidas:         '#021C45',
    Nike:           '#FF5B76',
    'Under Armour': '#18A6F1',
    Asics:          '#58D9D1',
    Olympikus:      '#5A0F4A',
    Mizuno:         '#667D99',
  };
  const BRAND_IDS    = ['Adidas','Nike','Under Armour','Asics','Olympikus','Mizuno'];
  const CHANNELS     = ['website','centauro','netshoes'];
  const CHANNEL_LABEL = { website:'Website', centauro:'Centauro', netshoes:'Netshoes' };

  // Categorical palette for Model Breakdown (top 8 franchises)
  const FRANCHISE_PALETTE = [
    '#021C45', '#FF5B76', '#58D9D1', '#FF8C42',
    '#9B6BFA', '#18A6F1', '#F4C430', '#5A0F4A',
  ];
  const MODEL_TOP_N = 8;

  // Sport filter — uses the SAME raw-cat table (SPORT_CATS) that the other 3
  // cards use, so all 4 cards filter identical SKU populations for a given scope.
  // Method A rows carry `cat` (raw category from BQ). Method B rows do not — they
  // fall back to the franchise.sport tag (legacy behaviour, marginal divergence).
  function franchiseSourceFor(brand, channel) {
    // Map (brand, channel) → SPORT_CATS source key
    if (channel === 'centauro') return 'centauro';
    if (channel === 'netshoes') return 'netshoes';
    // channel = 'website' → depends on brand
    if (brand === 'Olympikus') return 'olympikus';
    if (brand === 'Mizuno')    return 'mizuno';
    return 'direct';  // Adidas / Nike / Under Armour / Asics
  }
  function passesSport(row, scope) {
    if (scope === 'all' || scope === null || scope === undefined) return true;
    // Method A: filter by raw cat (consistent with the other 3 cards)
    if (row.cat !== undefined && typeof SPORT_CATS !== 'undefined') {
      const src = franchiseSourceFor(row.brand, row.channel);
      const allowed = (SPORT_CATS[src] || {})[scope];
      if (allowed === null || allowed === undefined) return true; // 'all' bucket has null
      return allowed.includes(row.cat);
    }
    // Method B fallback: use franchise.sport tag
    const SPORT_SCOPE_FALLBACK = {
      corrida:     new Set(['corrida']),
      performance: new Set(['corrida', 'training', 'trail']),
      all:         null,
    };
    const s = SPORT_SCOPE_FALLBACK[scope];
    if (s === null || s === undefined) return true;
    if (!row.sport) return true;
    return s.has(row.sport);
  }

  // ── Date helpers (1W26 / Jan-26 / Q2 2026) ────────────────────────────────
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

  // ── Series (brand × channel) — 18 possible series, like avgdisc ───────────
  const ALL_SERIES = [];
  for (const brand of BRAND_IDS) {
    for (const channel of CHANNELS) {
      ALL_SERIES.push({
        key: brand + '|' + channel,
        label: brand + ' — ' + CHANNEL_LABEL[channel],
        brand, channel,
        color: BC[brand],
        dash: channel === 'centauro' ? [6,3] : channel === 'netshoes' ? [3,2] : [],
      });
    }
  }
  const SERIES_BY_KEY = Object.fromEntries(ALL_SERIES.map(s => [s.key, s]));
  // Default ON: 5 series matching avgdisc convention
  const DEFAULT_ON = new Set([
    'Olympikus|website','Mizuno|website',
    'Adidas|centauro','Nike|centauro','Asics|centauro',
  ]);
  const SERIES_ON = {};
  ALL_SERIES.forEach(s => { SERIES_ON[s.key] = DEFAULT_ON.has(s.key); });

  // ── Controls ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  let viewMode  = 'comparison';
  let compChannel = 'centauro';
  function breakdownBrand() { return $('fr-brand').value; }
  function modelChannel() { return $('fr-model-channel').value; }
  function getMethod() { return $('fr-method').value; }
  function getPrice()  { return $('fr-price').value; }
  function getWindow() { return $('fr-window').value; }
  function getGran()   { return $('fr-gran').value; }
  function getFromK()  { return $('fr-from').value; }
  function getToK()    { return $('fr-to').value; }
  function getScope()  { return $('sport-filter').value; }
  const varField   = (price, win) => `var_${price}_${win}`;
  const priceField = (price)      => `p_${price}`;

  // ── View / Channel / Brand handlers ───────────────────────────────────────
  function updateViewControls() {
    const isBd = viewMode === 'breakdown';
    const isMd = viewMode === 'model';
    $('fr-channel-block').style.display        = (isBd || isMd) ? 'none' : '';
    $('fr-brand-block').style.display          = (isBd || isMd) ? '' : 'none';
    $('fr-model-channel-block').style.display  = isMd ? '' : 'none';
    $('fr-series-trigger-block').style.display = (!isBd && !isMd && compChannel === 'free') ? '' : 'none';
  }
  window.onFrViewChange = function() {
    viewMode = $('fr-view').value;
    updateViewControls();
    render();
  };
  window.onFrChannelChange = function() {
    compChannel = $('fr-channel').value;
    updateViewControls();
    render();
  };
  // brand select uses inline onchange="window._frRender..." in HTML

  // ── Series panel (multi-select for Free Choice) ───────────────────────────
  let panelOpen = false;
  function renderSeriesPanel() {
    let panel = $('fr-series-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fr-series-panel';
      document.body.appendChild(panel);
    }
    if (!panelOpen) { panel.style.display = 'none'; return; }
    panel.style.cssText = 'position:absolute;background:#fff;border:1px solid #E0E4EA;border-radius:8px;box-shadow:0 8px 24px rgba(2,28,69,0.12);padding:10px;z-index:1000;display:block;';
    const trig = $('fr-series-trigger');
    if (trig) {
      const r = trig.getBoundingClientRect();
      panel.style.top  = (window.scrollY + r.bottom + 6) + 'px';
      panel.style.left = (window.scrollX + r.left) + 'px';
      panel.style.minWidth = (r.width + 80) + 'px';
    }
    const groups = { website: [], centauro: [], netshoes: [] };
    ALL_SERIES.forEach(s => groups[s.channel].push(s));
    panel.innerHTML = Object.entries(groups).map(([ch, list]) => `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;color:#9AA8BB;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px;">${CHANNEL_LABEL[ch]}</div>
        ${list.map(s => `
          <label style="display:flex;align-items:center;gap:6px;padding:3px 4px;font-size:11px;cursor:pointer;">
            <input type="checkbox" ${SERIES_ON[s.key] ? 'checked' : ''} onchange="window._frToggle('${s.key}')">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
            ${s.label}
          </label>`).join('')}
      </div>`).join('');
  }
  window.toggleFrSeriesPanel = function() { panelOpen = !panelOpen; renderSeriesPanel(); };
  window._frToggle = function(key) {
    SERIES_ON[key] = !SERIES_ON[key];
    const n = Object.values(SERIES_ON).filter(Boolean).length;
    const lbl = $('fr-series-trigger-label');
    if (lbl) lbl.textContent = `${n} series selected`;
    render(); renderSeriesPanel();
  };
  document.addEventListener('click', (e) => {
    const panel = $('fr-series-panel'); const trig = $('fr-series-trigger');
    if (!panel || !trig || panel.style.display !== 'block') return;
    if (panel.contains(e.target) || trig.contains(e.target)) return;
    panelOpen = false; renderSeriesPanel();
  }, true);

  // ── Active series for current view/channel ───────────────────────────────
  function getActiveSeries() {
    if (viewMode === 'comparison') {
      if (compChannel === 'free') return ALL_SERIES.filter(s => SERIES_ON[s.key]);
      if (compChannel === 'total') {
        // Total = one row per brand, aggregating across ALL channels.
        return BRAND_IDS.map(b => ({ key: b + '|total', label: b, brand: b, channel: '*', color: BC[b], dash: [] }));
      }
      // Specific channel: 1 series per brand at that channel. Label is just the brand
      // name (channel is implied by the dropdown). Use solid line — no dashed needed
      // since all series share the same channel.
      return BRAND_IDS.map(b => ({ key: b + '|' + compChannel, label: b, brand: b, channel: compChannel, color: BC[b], dash: [] }));
    } else if (viewMode === 'breakdown') {
      // Breakdown: 1 series per channel for the selected brand + a Total line.
      const br = breakdownBrand();
      const channelSeries = CHANNELS.map(ch => ({
        key: br + '|' + ch,
        label: CHANNEL_LABEL[ch],
        brand: br, channel: ch,
        color: BC[br],
        dash: ch === 'centauro' ? [6,3] : ch === 'netshoes' ? [3,2] : [],
      }));
      return [...channelSeries, {
        key: br + '|total',
        label: 'Total',
        brand: br, channel: '*',
        color: '#344F75',
        dash: [],
      }];
    } else {
      // Model Breakdown: brand + channel fixed, top N franchises by volume,
      // plus a "Total" line = brand×channel aggregate across all franchises.
      const br = breakdownBrand();
      const ch = modelChannel();           // 'total' | 'website' | 'centauro' | 'netshoes'
      const chanKey = ch === 'total' ? '*' : ch;
      const tops = topFranchisesForModel(br, ch);
      const franchiseSeries = tops.map((franchise, i) => ({
        key: br + '|' + chanKey + '|' + franchise,
        label: franchise,
        brand: br, channel: chanKey, franchise,
        color: FRANCHISE_PALETTE[i % FRANCHISE_PALETTE.length],
        dash: [],
      }));
      // Others = franchises not in top N
      const othersSerie = {
        key: br + '|' + chanKey + '|__others__',
        label: 'Others',
        brand: br, channel: chanKey,
        franchise: '__others__',
        excludeFranchises: new Set(tops),
        color: '#9AA8BB',
        dash: [4, 3],
      };
      // Brand×channel Total — no franchise filter, distinct dashed style
      const totalSerie = {
        key: br + '|' + chanKey + '|__total__',
        label: 'Total',
        brand: br, channel: chanKey,
        color: '#344F75',
        dash: [10, 5],
      };
      return franchiseSeries.concat(othersSerie, totalSerie);
    }
  }

  // Top N franchises by total n_skus for the brand × channel × sport-scope.
  // Used by Model Breakdown to pick which franchises to plot.
  function topFranchisesForModel(brand, channel) {
    const method = getMethod();
    const data = method === 'A' ? (typeof RAW_FRANCHISE_A !== 'undefined' ? RAW_FRANCHISE_A : [])
                                : (typeof RAW_FRANCHISE_B !== 'undefined' ? RAW_FRANCHISE_B : []);
    const scope = getScope();
    const sumByF = new Map();
    for (const r of data) {
      if (r.brand !== brand) continue;
      if (channel !== 'total' && r.channel !== channel) continue;
      if (!passesSport(r, scope)) continue;
      if (!r.franchise) continue;
      sumByF.set(r.franchise, (sumByF.get(r.franchise) || 0) + (r.n || 0));
    }
    return Array.from(sumByF.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MODEL_TOP_N)
      .map(([f]) => f);
  }

  // For brand-level Total (channel='*'), require the week to have data in ALL 3
  // channels — same rule used by the other 3 cards' Total. Cached per render.
  const _totalValidWeeksCache = new Map(); // key = brand + '|' + method + '|' + scope
  function _validWeeksForBrandTotal(brand) {
    const method = getMethod(), scope = getScope();
    const cacheKey = brand + '|' + method + '|' + scope;
    if (_totalValidWeeksCache.has(cacheKey)) return _totalValidWeeksCache.get(cacheKey);
    const data = method === 'A' ? (typeof RAW_FRANCHISE_A !== 'undefined' ? RAW_FRANCHISE_A : [])
                                : (typeof RAW_FRANCHISE_B !== 'undefined' ? RAW_FRANCHISE_B : []);
    const channelWeeks = { website: new Set(), centauro: new Set(), netshoes: new Set() };
    for (const r of data) {
      if (r.brand !== brand) continue;
      if (!passesSport(r, scope)) continue;
      if (channelWeeks[r.channel]) channelWeeks[r.channel].add(r.w);
    }
    const valid = new Set();
    for (const w of channelWeeks.website) {
      if (channelWeeks.centauro.has(w) && channelWeeks.netshoes.has(w)) valid.add(w);
    }
    _totalValidWeeksCache.set(cacheKey, valid);
    return valid;
  }

  // ── Aggregation: for a series (brand, channel) and a week,
  // weighted-mean across all franchises of (price, var_*). channel='*' = total.
  function rowsForSeries(serie) {
    const method = getMethod();
    const data = method === 'A' ? (typeof RAW_FRANCHISE_A !== 'undefined' ? RAW_FRANCHISE_A : [])
                                : (typeof RAW_FRANCHISE_B !== 'undefined' ? RAW_FRANCHISE_B : []);
    const scope = getScope();
    const validWeeks = serie.channel === '*' ? _validWeeksForBrandTotal(serie.brand) : null;
    return data.filter(r =>
      r.brand === serie.brand
      && (serie.channel === '*' ? true : r.channel === serie.channel)
      && (serie.franchise === '__others__'
          ? (serie.excludeFranchises ? !serie.excludeFranchises.has(r.franchise) : true)
          : (serie.franchise ? r.franchise === serie.franchise : true))
      && passesSport(r, scope)
      && (validWeeks ? validWeeks.has(r.w) : true)
    );
  }

  // Aggregate rows of a series to weekly (brand, channel-or-*, week) — weighted by n_skus
  function weeklyAggregate(rows, field) {
    const byW = new Map();
    for (const r of rows) {
      const v = r[field];
      if (v === null || v === undefined) continue;
      const n = r.n || 0;
      if (n === 0) continue;
      if (!byW.has(r.w)) byW.set(r.w, { sum: 0, n: 0 });
      const a = byW.get(r.w);
      a.sum += v * n; a.n += n;
    }
    return Array.from(byW.entries())
      .map(([w, a]) => ({ w, val: a.n > 0 ? a.sum / a.n : null }))
      .sort((a, b) => a.w.localeCompare(b.w));
  }

  // Weekly series for a single series object — applies the right aggregation per case.
  // For Total series (channel='*'), Total = simple arithmetic mean of the 3 channel-
  // level weighted means (1/3 weight each). All 3 channels required per week.
  // See methodology: each scraper counts SKUs at a different grain, so SKU-weighted
  // pooling across channels would over-weight finer-grain channels (e.g., Centauro).
  function weeklyForSerie(serie, field) {
    const rows = rowsForSeries(serie);
    if (serie.channel !== '*') return weeklyAggregate(rows, field);
    // Per-channel weighted means
    const channels = ['website', 'centauro', 'netshoes'];
    const perChannelMaps = channels.map(ch =>
      new Map(weeklyAggregate(rows.filter(r => r.channel === ch), field)
        .filter(p => p.val != null)
        .map(p => [p.w, p.val]))
    );
    const allW = new Set();
    perChannelMaps.forEach(m => m.forEach((_, w) => allW.add(w)));
    const out = [];
    for (const w of [...allW].sort()) {
      const vals = perChannelMaps.map(m => m.get(w));
      if (vals.some(v => v == null)) continue; // all 3 required
      out.push({ w, val: (vals[0] + vals[1] + vals[2]) / 3 });
    }
    return out;
  }

  // Roll weekly → granularity
  function rollToGran(weekly, gran) {
    if (gran === 'weekly') return weekly.map(p => ({ key: p.w, val: p.val }));
    const groups = new Map();
    for (const p of weekly) {
      if (p.val === null || p.val === undefined) continue;
      const k = fmtGranKey(p.w, gran);
      if (!groups.has(k)) groups.set(k, { sum: 0, cnt: 0, firstW: p.w });
      const g = groups.get(k); g.sum += p.val; g.cnt += 1;
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({ key, val: g.cnt > 0 ? g.sum / g.cnt : null, firstW: g.firstW }))
      .sort((a, b) => a.firstW.localeCompare(b.firstW));
  }

  // ── From/To select population ─────────────────────────────────────────────
  function allPeriods() {
    const set = new Set(); const gran = getGran();
    for (const s of getActiveSeries()) {
      for (const r of rowsForSeries(s)) {
        set.add(gran === 'weekly' ? r.w : fmtGranKey(r.w, gran));
      }
    }
    return Array.from(set).sort();
  }
  function populateFromTo() {
    const gran = getGran();
    const periods = allPeriods();
    const fromSel = $('fr-from'); const toSel = $('fr-to');
    const prevFrom = fromSel.value, prevTo = toSel.value;
    const opts = periods.map(p => `<option value="${p}">${fmtGranLabel(p, gran)}</option>`).join('');
    fromSel.innerHTML = opts; toSel.innerHTML = opts;
    if (periods.length === 0) return;
    const earliest = (gran === 'weekly' && periods.length > 52) ? periods[periods.length - 52] : periods[0];
    fromSel.value = periods.includes(prevFrom) ? prevFrom : earliest;
    toSel.value   = periods.includes(prevTo)   ? prevTo   : periods[periods.length - 1];
  }

  // ── Chart — same styling as buildAvgDiscChart ─────────────────────────────
  let frChart = null;
  function renderChart() {
    const field = varField(getPrice(), getWindow());
    const gran = getGran(); const fromK = getFromK(), toK = getToK();

    const seriesPairs = getActiveSeries().map(s => {
      const weekly = weeklyForSerie(s, field);
      const rolled = rollToGran(weekly, gran).filter(p => p.key >= fromK && p.key <= toK);
      return { s, rolled };
    }).filter(x => x.rolled.length > 0 && !FR_HIDDEN.has(x.s.key));

    const allKeys = new Set();
    seriesPairs.forEach(x => x.rolled.forEach(p => allKeys.add(p.key)));
    const sortedKeys = [...allKeys].sort();

    const allVals = seriesPairs.flatMap(x => x.rolled.map(p => p.val)).filter(v => v != null && isFinite(v));
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
        borderWidth: 2.5, borderDash: s.dash,
        tension: 0.28, pointRadius: 0, pointHoverRadius: 0,
        spanGaps: false, fill: false,
      };
    });

    if (frChart) { frChart.destroy(); frChart = null; }
    const canvas = $('fr-chart');
    if (!canvas) return;
    const plugins = [];
    if (window.priceLabelPlugin)   plugins.push(window.priceLabelPlugin);
    if (window.extendedAxisPlugin) plugins.push(window.extendedAxisPlugin);

    frChart = new Chart(canvas.getContext('2d'), {
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
    frChart.$pillFmt = v => { const pct = Math.round(v * 100); return (pct > 0 ? '+' : '') + pct + '%'; };
    frChart.$ecomExtendedAxis = true;
    frChart.update('none');

    // Legend shows ALL active series (visible + hidden) so the user can re-enable.
    renderLegend(getActiveSeries());
  }

  // Series-hidden state for legend toggle (mirrors avgdisc behaviour)
  const FR_HIDDEN = new Set();
  window._frLegendToggle = function(key) {
    if (FR_HIDDEN.has(key)) FR_HIDDEN.delete(key); else FR_HIDDEN.add(key);
    render();
  };
  function makeDashSwatch(color, dash) {
    if (!dash || !dash.length)
      return `<span class="chart-legend-swatch" style="background:${color};"></span>`;
    if (dash[0] === 6)
      return `<span class="chart-legend-swatch" style="background:repeating-linear-gradient(90deg,${color} 0,${color} 6px,transparent 6px,transparent 9px);"></span>`;
    return `<span class="chart-legend-swatch" style="background:repeating-linear-gradient(90deg,${color} 0,${color} 2px,transparent 2px,transparent 5px);"></span>`;
  }
  function renderLegend(series) {
    $('fr-legend').innerHTML = series.map(s => {
      const cls = FR_HIDDEN.has(s.key) ? 'chart-legend-item legend-hidden' : 'chart-legend-item';
      return `<span class="${cls}" onclick="window._frLegendToggle('${s.key}')">${makeDashSwatch(s.color, s.dash || [])}${s.label}</span>`;
    }).join('');
  }

  // ── Summary table — drills down into franchises ──────────────────────────
  function heatBadge(v) {
    if (v === null || v === undefined || !isFinite(v)) return `<span style="color:#9AA8BB;font-weight:700;">—</span>`;
    const mag = Math.max(0.18, Math.min(Math.abs(v) / 0.15, 1));
    const bg = v > 0 ? `rgba(88,217,209,${0.18 + mag * 0.48})` : (v < 0 ? `rgba(255,79,108,${0.18 + mag * 0.52})` : '#F2F4F8');
    const color = v > 0 ? '#0D7E6A' : (v < 0 ? '#8F1028' : '#021C45');
    const pct = Math.round(v * 100);
    const sign = pct > 0 ? '+' : '';
    return `<span style="display:inline-block;min-width:64px;padding:6px 10px;border-radius:6px;background:${bg};color:${color};font-weight:800;box-shadow:inset 0 0 0 1px rgba(2,28,69,0.06);font-size:12px;font-family:Verdana,Geneva,sans-serif;">${sign}${pct}%</span>`;
  }

  // Aggregate (price + 5 var fields) for a series, weighted by n_skus across
  // franchises in the most-recent period within To.
  // For Total series (channel='*'): each field = simple mean of the 3 channel-
  // level weighted means at latestW. All 3 channels required.
  function summaryForSeries(serie) {
    const price = getPrice();
    const fields = [
      priceField(price),
      varField(price, '1w'), varField(price, '1m'), varField(price, '3m'),
      varField(price, '1y'), varField(price, 'ytd'),
    ];
    const rows = rowsForSeries(serie);
    const toK = getToK(), gran = getGran();
    let latestW = '';
    for (const r of rows) {
      const k = fmtGranKey(r.w, gran);
      if (k > toK) continue;
      if (r.w > latestW) latestW = r.w;
    }
    if (!latestW) return null;
    const out = { w: latestW };
    const rowsAtW = rows.filter(r => r.w === latestW);

    if (serie.channel === '*') {
      // Total: weighted mean within each channel, then simple mean of the 3.
      const channels = ['website', 'centauro', 'netshoes'];
      for (const f of fields) {
        const channelMeans = [];
        for (const ch of channels) {
          let sumV = 0, sumN = 0;
          for (const r of rowsAtW) {
            if (r.channel !== ch) continue;
            const v = r[f];
            if (v === null || v === undefined) continue;
            const wt = r.n || 0;
            if (wt === 0) continue;
            sumV += v * wt; sumN += wt;
          }
          channelMeans.push(sumN > 0 ? sumV / sumN : null);
        }
        out[f] = channelMeans.every(v => v != null)
          ? (channelMeans[0] + channelMeans[1] + channelMeans[2]) / 3
          : null;
      }
      return out;
    }
    // Non-Total: SKU-weighted mean across rows of the series at latestW.
    let _totalN = 0;
    for (const r of rowsAtW) { _totalN += r.n || 0; }
    out._n = _totalN;
    for (const f of fields) {
      let sum = 0, n = 0;
      for (const r of rowsAtW) {
        const v = r[f];
        if (v === null || v === undefined) continue;
        const wt = r.n || 0;
        if (wt === 0) continue;
        sum += v * wt; n += wt;
      }
      out[f] = n > 0 ? sum / n : null;
    }
    return out;
  }

  function renderTable() {
    const price = getPrice();
    const series = getActiveSeries();
    if (!series.length) { $('fr-table').innerHTML = ''; return; }

    const rowsArr = series.map(s => ({ s, ref: summaryForSeries(s) })).filter(x => x.ref && !FR_HIDDEN.has(x.s.key));
    if (!rowsArr.length) {
      $('fr-table').innerHTML = `<div style="padding:24px;text-align:center;color:#9AA8BB;">No data for the current filters.</div>`;
      return;
    }

    // Anchor week label = latest among the series
    const anchorW = rowsArr.reduce((max, x) => x.ref.w > max ? x.ref.w : max, '');
    const anchorLabel = fmtGranLabel(anchorW, getGran());

    // Total SKU count = sum across franchise + Others rows (not Total row, not cross-channel)
    // Only meaningful in Model Breakdown view where each row is a single named franchise or Others.
    const hasNamedFranchises = rowsArr.some(({ s }) =>
      s.franchise && s.franchise !== '__others__' && s.franchise !== '__total__');
    const totalSkus = hasNamedFranchises
      ? rowsArr.reduce((acc, { s, ref }) => {
          // Include named franchises + Others; exclude Total (which already covers all of them)
          if (s.channel !== '*' && !s.key.endsWith('|__total__')) acc += ref._n || 0;
          return acc;
        }, 0)
      : 0;
    const showPct = totalSkus > 0;

    const borderBottom = '1px solid #EBEBEB';
    const cell = (v, sep) => `<td style="padding:10px 8px;border-bottom:${sep || borderBottom};text-align:center;">${heatBadge(v)}</td>`;

    const rowsHtml = rowsArr.map(({ s, ref }) => {
      const isTotal   = s.key.endsWith('|__total__');
      const isOthers  = s.key.endsWith('|__others__');
      const priceVal  = ref[priceField(price)];
      const v1w  = ref[varField(price, '1w')];
      const v1m  = ref[varField(price, '1m')];
      const v3m  = ref[varField(price, '3m')];
      const v1y  = ref[varField(price, '1y')];
      const vytd = ref[varField(price, 'ytd')];

      // SKU share label (only for named franchises and Others, not Total)
      let skuPctHtml = '';
      if (showPct && !isTotal) {
        const n = ref._n || 0;
        const pct = totalSkus > 0 ? Math.round(n / totalSkus * 100) : 0;
        skuPctHtml = `<span style="font-weight:400;color:#9AA8BB;font-size:11px;margin-left:6px;">(${pct}% of total)</span>`;
      }

      // Visual separator row before Total
      const sep = isTotal ? '2px solid #CCD4DD' : borderBottom;
      const rowBg = isTotal ? 'background:#F7F8FA;' : (isOthers ? 'background:#FAFBFC;' : '');
      const nameStyle = isTotal
        ? 'font-weight:700;color:#344F75;font-size:13px;'
        : isOthers
          ? 'font-weight:600;color:#667D99;font-style:italic;font-size:12px;'
          : 'font-weight:700;color:#021C45;font-size:13px;';
      const dot = isTotal
        ? `<span style="display:inline-block;width:18px;height:0;border-top:2px dashed #344F75;margin-right:8px;vertical-align:middle;"></span>`
        : isOthers
          ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9AA8BB;margin-right:10px;vertical-align:middle;"></span>`
          : `<span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>`;

      return `<tr style="${rowBg}">
        <td style="padding:${isTotal ? 12 : 14}px 16px;border-bottom:${sep};font-family:Verdana,Geneva,sans-serif;${nameStyle}">
          ${dot}${s.label}${skuPctHtml}
        </td>
        <td style="padding:${isTotal ? 12 : 14}px 8px;border-bottom:${sep};text-align:right;font-family:Verdana,Geneva,sans-serif;${nameStyle}">${priceVal != null ? 'R$ ' + Math.round(priceVal) : '—'}</td>
        ${cell(v1w, sep)} ${cell(v1m, sep)} ${cell(v3m, sep)} ${cell(v1y, sep)} ${cell(vytd, sep)}
      </tr>`;
    }).join('');

    const PRICE_LBL = price.charAt(0).toUpperCase() + price.slice(1);
    $('fr-table').innerHTML = `
      <div style="overflow-x:auto;margin-top:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;">
          <thead>
            <tr style="background:#021C45;color:#FFFFFF;">
              <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;width:34%;">${anchorLabel}</th>
              <th style="padding:12px 8px;text-align:right;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;">${PRICE_LBL} price</th>
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
    // Remove any loading/error placeholder left by init()
    const placeholder = document.getElementById('fr-placeholder');
    if (placeholder) placeholder.remove();
    // Clear cache so stale empty results don't persist across renders
    _totalValidWeeksCache.clear();
    populateFromTo(); renderChart(); renderTable();
  }
  // Guard: only render if elements are live in the DOM (not inside a <template>)
  window._frRender = function() { if (document.getElementById('fr-chart')) render(); };
  window._frInit   = init;

  function initRender() {
    // Guard: if elements aren't in live DOM yet, bail — _frInit will be called by _ecomInit when ready
    if (!document.getElementById('fr-channel-block')) return;
    try {
      const lbl = $('fr-series-trigger-label');
      if (lbl) lbl.textContent = `${Object.values(SERIES_ON).filter(Boolean).length} series selected`;
      updateViewControls();
      render();
    } catch(e) {
      const el = $('fr-chart');
      if (el) el.insertAdjacentHTML('afterend',
        `<div style="color:#8F1028;background:#FFF0F2;border:1px solid #FFBDC7;border-radius:6px;padding:12px 16px;font-size:12px;font-family:Verdana;margin-top:8px;">
          <strong>Price Pass-Through — erro:</strong><br>${e.message}</div>`);
      console.error('[franchise-chart] render error:', e);
    }
  }

  function init() {
    if (typeof RAW_FRANCHISE_A !== 'undefined') {
      initRender();
      return;
    }
    // Data still loading — show status and poll until available
    const el = $('fr-chart');
    if (el && !document.getElementById('fr-placeholder')) {
      el.insertAdjacentHTML('afterend',
        '<div id="fr-placeholder" style="color:#667D99;font-size:12px;font-family:Verdana;padding:16px 0;">' +
        'Carregando dados do Pass-Through (15 MB)…</div>');
    }
    let ticks = 0;
    const poll = setInterval(function() {
      ticks++;
      if (!document.getElementById('fr-chart')) { clearInterval(poll); return; } // tab was destroyed
      if (typeof RAW_FRANCHISE_A !== 'undefined') {
        clearInterval(poll);
        initRender();
      } else if (ticks >= 60) {
        clearInterval(poll);
        const ph = document.getElementById('fr-placeholder');
        if (ph) {
          ph.style.color = '#8F1028';
          ph.innerHTML = '<strong>Price Pass-Through:</strong> calcados-franchise-data.js não carregou após 60s.' +
            ' Verifique a aba Network e recarregue (Ctrl+Shift+R).';
        }
      }
    }, 1000);
  }
  // Auto-init only when fr-chart canvas is in the live DOM (standalone ecom-data-wip.html).
  // In the unified dashboard the canvas lives in a <template> until the tab activates —
  // in that case _frInit() is called by _ecomInit() instead.
  function maybeInit() { if (document.getElementById('fr-chart')) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeInit);
  else maybeInit();
})();
