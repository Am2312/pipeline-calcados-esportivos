// Franchise Pass-Through — chart + BPC-style summary table
// Reads window.RAW_FRANCHISE_A, window.RAW_FRANCHISE_B, window.FRANCHISE_INDEX
// Same visual language as the rest of the dashboard (Verdana font, pill labels,
// extended axis, BPC tooltip). Sport filter uses the global #sport-filter.

(function() {
  'use strict';

  // ── Brand colours (must match BRAND_COLOR in ecom-data-wip.html) ─────────
  const BC = {
    Adidas:         '#021C45',
    Nike:           '#FF5B76',
    'Under Armour': '#18A6F1',
    Asics:          '#58D9D1',
    Olympikus:      '#5A0F4A',
    Mizuno:         '#667D99',
  };

  // ── Sport buckets — must mirror SPORT_CATS in HTML ────────────────────────
  // The franchise mapping's `sport` field falls into one of: corrida, performance,
  // training, trail, basquete, tennis, racket, football, casual, kids, sandals,
  // skate, other. Map these to the dashboard's 3-bucket scope filter:
  const SPORT_SCOPE = {
    corrida:     new Set(['corrida']),
    performance: new Set(['corrida', 'training', 'trail']),
    all:         null,
  };
  // Lookup table: (brand, franchise) → sport. Built from RAW_FRANCHISE_A (which has the sport field).
  // Used to apply sport scope filter to Method B rows (whose data doesn't carry sport directly).
  const SPORT_LOOKUP = (() => {
    const m = new Map();
    if (typeof RAW_FRANCHISE_A !== 'undefined') {
      for (const r of RAW_FRANCHISE_A) m.set(r.brand + '|' + r.franchise, r.sport);
    }
    return m;
  })();
  function sportFor(row) {
    if (row.sport) return row.sport;
    return SPORT_LOOKUP.get(row.brand + '|' + row.franchise) || '';
  }
  function passesSport(sport, scope) {
    const s = SPORT_SCOPE[scope];
    return s === null || s === undefined ? true : s.has(sport);
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
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

  // ── Controls ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  function getMethod() { return $('fr-method').value; }
  function getPrice()  { return $('fr-price').value; }
  function getBrand()  { return $('fr-brand').value; }
  function getWindow() { return $('fr-window').value; }
  function getGran()   { return $('fr-gran').value; }
  function getFromK()  { return $('fr-from').value; }
  function getToK()    { return $('fr-to').value; }
  function getScope()  { return $('sport-filter').value; }   // global

  const varField   = (price, win) => `var_${price}_${win}`;
  const priceField = (price)      => `p_${price}`;

  // ── Data access ───────────────────────────────────────────────────────────
  function rowsForMethod() {
    if (getMethod() === 'A') return (typeof RAW_FRANCHISE_A !== 'undefined') ? RAW_FRANCHISE_A : [];
    return (typeof RAW_FRANCHISE_B !== 'undefined') ? RAW_FRANCHISE_B : [];
  }

  // Filter for the selected brand + sport scope
  function filteredRows() {
    const brand = getBrand(), scope = getScope();
    return rowsForMethod().filter(r => r.brand === brand && passesSport(sportFor(r), scope));
  }

  // Group filtered rows by franchise; returns { franchise: [rows sorted by w] }
  function rowsByFranchise() {
    const out = {};
    for (const r of filteredRows()) {
      if (!out[r.franchise]) out[r.franchise] = [];
      out[r.franchise].push(r);
    }
    for (const f in out) out[f].sort((a,b) => a.w.localeCompare(b.w));
    return out;
  }

  // Aggregate weekly rows → granularity buckets (simple mean across weeks in the bucket).
  function rollToGran(weekly, gran, field) {
    if (gran === 'weekly') {
      return weekly.map(r => ({ key: r.w, val: r[field] != null ? r[field] : null, n: r.n }));
    }
    const groups = new Map();
    for (const r of weekly) {
      if (r[field] === null || r[field] === undefined) continue;
      const k = fmtGranKey(r.w, gran);
      if (!groups.has(k)) groups.set(k, { sum: 0, cnt: 0, n: 0, firstW: r.w });
      const g = groups.get(k);
      g.sum += r[field]; g.cnt += 1; g.n += (r.n || 0);
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({ key, val: g.cnt > 0 ? g.sum / g.cnt : null, n: Math.round(g.n / g.cnt), firstW: g.firstW }))
      .sort((a,b) => a.firstW.localeCompare(b.firstW));
  }

  // Aggregate price (p_sale or p_list) — weighted by n
  function rollPriceToGran(weekly, gran, field) {
    if (gran === 'weekly') {
      return weekly.map(r => ({ key: r.w, val: r[field] != null ? r[field] : null, n: r.n }));
    }
    const groups = new Map();
    for (const r of weekly) {
      if (r[field] === null || r[field] === undefined) continue;
      const k = fmtGranKey(r.w, gran);
      if (!groups.has(k)) groups.set(k, { sum: 0, w_sum: 0, firstW: r.w });
      const g = groups.get(k);
      const w = r.n || 0;
      g.sum += r[field] * w; g.w_sum += w;
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({ key, val: g.w_sum > 0 ? g.sum / g.w_sum : null, firstW: g.firstW }))
      .sort((a,b) => a.firstW.localeCompare(b.firstW));
  }

  // ── From/To select population ─────────────────────────────────────────────
  function allPeriods() {
    const set = new Set();
    const gran = getGran();
    for (const r of filteredRows()) {
      if (gran === 'weekly') set.add(r.w);
      else set.add(fmtGranKey(r.w, gran));
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

  // ── Chart — mirrors buildAvgDiscChart visual language ─────────────────────
  let frChart = null;
  function renderChart() {
    const win = getWindow();
    const price = getPrice();
    const field = varField(price, win);
    const gran = getGran();
    const fromK = getFromK(), toK = getToK();

    const byFr = rowsByFranchise();

    // Sort franchises by total volume desc, take top 8 to keep chart readable
    const fr_volumes = Object.entries(byFr)
      .map(([f, rows]) => ({ f, vol: rows.reduce((s, r) => s + (r.n || 0), 0) }))
      .sort((a, b) => b.vol - a.vol);
    const topFranchises = fr_volumes.slice(0, 8).map(x => x.f);

    // Stable color palette for franchises within a brand
    const PALETTE = ['#021C45', '#FF5B76', '#18A6F1', '#58D9D1', '#5A0F4A', '#667D99', '#FFA62B', '#0D7E6A', '#8F1028', '#9B4DCA'];
    const seriesPairs = [];
    const allKeys = new Set();
    topFranchises.forEach((f, idx) => {
      const pairs = rollToGran(byFr[f], gran, field).filter(p => p.key >= fromK && p.key <= toK);
      if (pairs.length === 0) return;
      pairs.forEach(p => allKeys.add(p.key));
      seriesPairs.push({ franchise: f, color: PALETTE[idx % PALETTE.length], pairs });
    });

    const sortedKeys = [...allKeys].sort();
    const allVals = seriesPairs.flatMap(({ pairs }) => pairs.map(p => p.val)).filter(v => v != null && isFinite(v));
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

    const datasets = seriesPairs.map(({ franchise, color, pairs }) => {
      const pm = new Map(pairs.map(p => [p.key, p.val]));
      return {
        label: franchise,
        data: sortedKeys.map(k => pm.get(k) ?? null),
        borderColor: color, backgroundColor: color,
        borderWidth: 2.5, borderDash: [],
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

    // Render legend at the top
    renderLegend(seriesPairs);
  }

  function renderLegend(seriesPairs) {
    const html = seriesPairs.map(({ franchise, color }) => `
      <span class="legend-pill" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;font-size:11px;background:${color}1A;color:${color};border:1px solid ${color}40;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
        ${franchise}
      </span>`).join(' ');
    $('fr-legend').innerHTML = html;
  }

  // ── Summary table (BPC-style heat badges) ─────────────────────────────────
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

  function pickRefRow(rows) {
    // Pick the row whose w (or aggregated key) corresponds to the To-period selected.
    const gran = getGran();
    const toK = getToK();
    // Walk from end to start; first row whose granKey ≤ toK
    for (let i = rows.length - 1; i >= 0; i--) {
      const k = fmtGranKey(rows[i].w, gran);
      if (k <= toK) return rows[i];
    }
    return rows.length ? rows[rows.length - 1] : null;
  }

  function renderTable() {
    const method = getMethod();
    const price = getPrice();
    const byFr = rowsByFranchise();

    // Sort franchises by latest n_skus desc
    const ordered = Object.entries(byFr)
      .map(([f, rows]) => ({ f, ref: pickRefRow(rows) }))
      .filter(x => x.ref)
      .sort((a, b) => (b.ref.n || 0) - (a.ref.n || 0));

    if (ordered.length === 0) {
      $('fr-table').innerHTML = `<div style="padding:24px;text-align:center;color:#9AA8BB;">No franchises match the current filters.</div>`;
      return;
    }

    // Color cycle aligned with the chart
    const PALETTE = ['#021C45', '#FF5B76', '#18A6F1', '#58D9D1', '#5A0F4A', '#667D99', '#FFA62B', '#0D7E6A', '#8F1028', '#9B4DCA'];

    const rowsHtml = ordered.map(({ f, ref }, i) => {
      const color = PALETTE[i % PALETTE.length];
      const priceVal = ref[priceField(price)];
      const v1w  = ref[varField(price, '1w')];
      const v1m  = ref[varField(price, '1m')];
      const v3m  = ref[varField(price, '3m')];
      const v1y  = ref[varField(price, '1y')];
      const vytd = ref[varField(price, 'ytd')];
      const cell = (v) => `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;">${heatBadge(v)}</td>`;

      // Method B: append gen labels (e.g. "5 vs 22") to franchise name
      let label = f;
      if (method === 'B' && ref.gen_new != null) {
        const newG = ref.gen_new;
        const prevG = (ref.gen_prev != null) ? ref.gen_prev : '?';
        label = `${f} <span style="color:#9AA8BB;font-weight:400;font-size:11px;">(gen ${newG} vs ${prevG})</span>`;
      }

      return `<tr>
        <td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:#021C45;font-family:Verdana,Geneva,sans-serif;font-size:13px;">
          <span style="display:inline-block;width:10px;height:10px;background:${color};margin-right:10px;vertical-align:middle;"></span>${label}
        </td>
        <td style="padding:14px 8px;border-bottom:1px solid #EBEBEB;text-align:right;color:#021C45;font-weight:700;font-family:Verdana,Geneva,sans-serif;font-size:13px;">${priceVal != null ? 'R$ ' + Math.round(priceVal) : '—'}</td>
        ${cell(v1w)}
        ${cell(v1m)}
        ${cell(v3m)}
        ${cell(v1y)}
        ${cell(vytd)}
      </tr>`;
    }).join('');

    $('fr-table').innerHTML = `
      <div style="overflow-x:auto;margin-top:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;">
          <thead>
            <tr style="background:#021C45;color:#FFFFFF;">
              <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;width:38%;">Franchise</th>
              <th style="padding:12px 8px;text-align:right;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;">Price (${price})</th>
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
    populateFromTo();
    renderChart();
    renderTable();
  }

  window._frRender = render;

  function init() {
    if (typeof RAW_FRANCHISE_A === 'undefined') { console.warn('Franchise data not loaded yet.'); return; }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
