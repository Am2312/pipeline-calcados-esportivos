// Price Pass-Through chart + summary table — same-SKU price variation.
// Methodology aligned with the rest of the dashboard (SPORT_CATS, BRAND_COLOR, series keys).
// Reads window.RAW_PASSTHROUGH_OLY / MIZ / UA / CENTAURO.

(function() {
  'use strict';

  // ── Sport buckets — must mirror SPORT_CATS in ecom-data-wip.html ────────────
  const SPORT_CATS_PT = {
    olympikus: {
      all:         null,
      performance: ['Corrida', 'Caminhada', 'Treino e Academia', 'Trilha'],
      corrida:     ['Corrida'],
    },
    mizuno: {
      all:         null,
      performance: ['Corrida', 'Treino', 'Trilha'],
      corrida:     ['Corrida'],
    },
    ua: {
      all:         null,
      performance: ['Corrida', 'Treino', 'Trilha', 'Caminhada'],
      corrida:     ['Corrida'],
    },
    centauro: {
      all:         null,
      performance: ['Corrida / Caminhada', 'Academia / Fitness', 'Aventura', 'Treino'],
      corrida:     ['Corrida / Caminhada'],
    },
  };

  // ── Brand colours (must match BRAND_COLOR in ecom-data-wip.html) ────────────
  const BC = {
    adidas:    '#021C45',
    nike:      '#FF5B76',
    ua:        '#18A6F1',
    asics:     '#58D9D1',
    olympikus: '#5A0F4A',
    mizuno:    '#667D99',
  };

  // ── Series ──────────────────────────────────────────────────────────────────
  const PASS_SERIES = [
    { key:'olympikus|direct',   label:'Olympikus — Website',     source:'olympikus', srcSet:'oly', brandRaw:null,           color:BC.olympikus },
    { key:'mizuno|direct',      label:'Mizuno — Website',        source:'mizuno',    srcSet:'miz', brandRaw:null,           color:BC.mizuno    },
    { key:'ua|direct',          label:'Under Armour — Website',  source:'ua',        srcSet:'ua',  brandRaw:null,           color:BC.ua        },
    { key:'adidas|centauro',    label:'Adidas — Centauro',       source:'centauro',  srcSet:'ctr', brandRaw:'adidas',       color:BC.adidas    },
    { key:'nike|centauro',      label:'Nike — Centauro',         source:'centauro',  srcSet:'ctr', brandRaw:'Nike',         color:BC.nike      },
    { key:'ua|centauro',        label:'Under Armour — Centauro', source:'centauro',  srcSet:'ctr', brandRaw:'Under Armour', color:BC.ua        },
    { key:'asics|centauro',     label:'Asics — Centauro',        source:'centauro',  srcSet:'ctr', brandRaw:'Asics',        color:BC.asics     },
    { key:'olympikus|centauro', label:'Olympikus — Centauro',    source:'centauro',  srcSet:'ctr', brandRaw:'Olympikus',    color:BC.olympikus },
    { key:'mizuno|centauro',    label:'Mizuno — Centauro',       source:'centauro',  srcSet:'ctr', brandRaw:'Mizuno',       color:BC.mizuno    },
  ];

  const PASS_DEFAULT_ON = new Set([
    'olympikus|direct','mizuno|direct',
    'adidas|centauro','nike|centauro','asics|centauro',
  ]);
  const PASS_ON = {};
  PASS_SERIES.forEach(s => { PASS_ON[s.key] = PASS_DEFAULT_ON.has(s.key); });

  // ── Data access ─────────────────────────────────────────────────────────────
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

  // ── Controls ────────────────────────────────────────────────────────────────
  function getWindow()    { return document.getElementById('pass-window').value; }
  function getPriceType() { return document.getElementById('pass-price').value; }
  function getScope()     { return document.getElementById('pass-scope').value; }
  function getClip()      { return document.getElementById('pass-clip').value; } // 'none' | '50_100'
  function getFromW()     { return document.getElementById('pass-from').value; }
  function getToW()       { return document.getElementById('pass-to').value; }

  // Returns field suffix for the current price type, window, and clip selection.
  function varField(priceType, win) {
    const suffix = getClip() === 'none' ? '' : '_c';
    return `var_${priceType}_${win}${suffix}`;
  }
  function priceField(priceType) { return `p_${priceType}`; }

  // Weighted-by-n aggregate of `field` across rows in the same w.
  // Returns array of {w, val, n}.
  function aggregateByWeek(rows, field) {
    const byWeek = new Map();
    for (const r of rows) {
      const v = r[field];
      if (v === null || v === undefined) continue;
      const n = r.n || 0;
      if (n === 0) continue;
      const k = r.w;
      if (!byWeek.has(k)) byWeek.set(k, { sum: 0, n: 0 });
      const acc = byWeek.get(k);
      acc.sum += v * n;
      acc.n   += n;
    }
    return Array.from(byWeek.entries())
      .map(([w, v]) => ({ w, val: v.n > 0 ? v.sum / v.n : null, n: v.n }))
      .sort((a, b) => a.w.localeCompare(b.w));
  }

  // Latest week's aggregate across ALL var fields + price, weighted by n.
  // Returns null when no data; otherwise object with all needed fields.
  function latestAgg(serie, scope, fromW, toW) {
    const rows = filterBySerieAndScope(serie, scope).filter(r => r.w >= fromW && r.w <= toW);
    if (rows.length === 0) return null;
    // Find latest w that has *any* non-null var
    const wks = Array.from(new Set(rows.map(r => r.w))).sort();
    const fields = [
      varField('sale', '1w'),  varField('list', '1w'),
      varField('sale', '1m'),  varField('list', '1m'),
      varField('sale', '3m'),  varField('list', '3m'),
      varField('sale', '1y'),  varField('list', '1y'),
      varField('sale', 'ytd'), varField('list', 'ytd'),
      'p_sale', 'p_list',
    ];
    // Walk from latest backwards to find a week with at least one var defined
    for (let i = wks.length - 1; i >= 0; i--) {
      const w = wks[i];
      const wkRows = rows.filter(r => r.w === w);
      const out = { w };
      let anyVar = false;
      for (const f of fields) {
        let sum = 0, n = 0;
        for (const r of wkRows) {
          if (r[f] === null || r[f] === undefined) continue;
          const wt = r.n || 0;
          if (wt === 0) continue;
          sum += r[f] * wt;
          n += wt;
        }
        out[f] = n > 0 ? sum / n : null;
        if (f.startsWith('var_') && out[f] !== null) anyVar = true;
      }
      if (anyVar) return out;
    }
    return null;
  }

  // ── Date selects ────────────────────────────────────────────────────────────
  function allWeeks() {
    const ws = new Set();
    for (const s of PASS_SERIES) for (const r of rawRowsFor(s)) ws.add(r.w);
    return Array.from(ws).sort();
  }

  function populateDateSelects() {
    const ws = allWeeks();
    if (ws.length === 0) return;
    const fromSel = document.getElementById('pass-from');
    const toSel = document.getElementById('pass-to');
    const earliestDefault = ws.length > 52 ? ws[ws.length - 52] : ws[0];
    fromSel.innerHTML = ws.map(w => `<option value="${w}" ${w === earliestDefault ? 'selected' : ''}>${w}</option>`).join('');
    toSel.innerHTML   = ws.map(w => `<option value="${w}" ${w === ws[ws.length-1] ? 'selected' : ''}>${w}</option>`).join('');
  }

  // ── Render: legend ──────────────────────────────────────────────────────────
  function renderLegend() {
    const html = PASS_SERIES.map(s => {
      const active = PASS_ON[s.key];
      return `<span class="legend-pill" data-key="${s.key}" onclick="window._passToggleSeries('${s.key}')"
        style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;cursor:pointer;font-size:11px;
        ${active ? `background:${s.color}1A;color:${s.color};border:1px solid ${s.color}40;` : 'background:#F0F2F5;color:#9AA8BB;border:1px solid #E0E4EA;text-decoration:line-through;'}">
        <span style="width:8px;height:8px;border-radius:50%;background:${active ? s.color : '#9AA8BB'};display:inline-block;flex-shrink:0;"></span>
        ${s.label}
      </span>`;
    }).join(' ');
    document.getElementById('pass-legend').innerHTML = html;
  }

  // ── Render: chart (line) ────────────────────────────────────────────────────
  let passChart = null;
  function renderChart() {
    const priceType = getPriceType();
    const win = getWindow();
    const field = varField(priceType, win);
    const scope = getScope();
    const fromW = getFromW();
    const toW = getToW();

    const datasets = [];
    const allW = new Set();

    for (const s of PASS_SERIES) {
      if (!PASS_ON[s.key]) continue;
      const rows = filterBySerieAndScope(s, scope);
      const agg = aggregateByWeek(rows, field).filter(p => p.w >= fromW && p.w <= toW);
      if (agg.length === 0) continue;
      agg.forEach(p => allW.add(p.w));
      datasets.push({
        label: s.label,
        data: agg.map(p => ({ x: p.w, y: p.val === null ? null : p.val * 100 })),
        borderColor: s.color,
        backgroundColor: s.color + '20',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0.2,
      });
    }

    const labels = Array.from(allW).sort();
    const ctx = document.getElementById('pass-chart').getContext('2d');
    if (passChart) passChart.destroy();
    passChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${item.parsed.y != null ? item.parsed.y.toFixed(2) + '%' : 'n/a'}`,
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#667D99', maxTicksLimit: 12, autoSkip: true }, grid: { display: false } },
          y: {
            ticks: { font: { size: 10 }, color: '#667D99', callback: (v) => v.toFixed(1) + '%' },
            grid: { color: '#EDF0F4' }, border: { display: false },
          }
        }
      },
      plugins: [{
        id: 'zeroLine',
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const y0 = chart.scales.y.getPixelForValue(0);
          ctx.save();
          ctx.strokeStyle = '#021C45'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(chart.chartArea.left, y0); ctx.lineTo(chart.chartArea.right, y0); ctx.stroke();
          ctx.restore();
        }
      }]
    });
  }

  // ── Render: summary table (BPC-style) ───────────────────────────────────────
  function heatBadge(v) {
    if (v === null || v === undefined || !isFinite(v)) {
      return `<span style="color:#9AA8BB;font-weight:700;">—</span>`;
    }
    const mag = Math.max(0.18, Math.min(Math.abs(v) / 0.15, 1));
    const bg = v > 0
      ? `rgba(88,217,209,${0.18 + mag * 0.48})`
      : (v < 0 ? `rgba(255,79,108,${0.18 + mag * 0.52})` : '#F2F4F8');
    const color = v > 0 ? '#0D7E6A' : (v < 0 ? '#8F1028' : '#021C45');
    const pct = Math.round(v * 100);
    const sign = pct > 0 ? '+' : '';
    return `<span style="display:inline-block;min-width:64px;padding:6px 10px;border-radius:6px;background:${bg};color:${color};font-weight:800;box-shadow:inset 0 0 0 1px rgba(2,28,69,0.06);font-size:12px;font-family:Verdana,Geneva,sans-serif;">${sign}${pct}%</span>`;
  }

  function renderTable() {
    const priceType = getPriceType();
    const scope = getScope();
    const fromW = getFromW();
    const toW = getToW();

    const rowsHtml = PASS_SERIES.map(s => {
      const off = !PASS_ON[s.key];
      const agg = latestAgg(s, scope, fromW, toW);
      const w   = agg ? agg.w : '—';
      const price = agg ? agg[priceField(priceType)] : null;
      const v1w  = agg ? agg[varField(priceType, '1w')]  : null;
      const v1m  = agg ? agg[varField(priceType, '1m')]  : null;
      const v3m  = agg ? agg[varField(priceType, '3m')]  : null;
      const v1y  = agg ? agg[varField(priceType, '1y')]  : null;
      const vytd = agg ? agg[varField(priceType, 'ytd')] : null;
      const dim = off ? 'opacity:0.4;' : '';
      const cell = (v) => `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;">${heatBadge(v)}</td>`;
      return `<tr style="${dim}">
        <td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:#021C45;font-family:Verdana,Geneva,sans-serif;font-size:12px;">
          <span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>${s.label}
        </td>
        <td style="padding:14px 8px;border-bottom:1px solid #EBEBEB;text-align:right;color:#667D99;font-family:Verdana,Geneva,sans-serif;font-size:11px;">${w}</td>
        <td style="padding:14px 8px;border-bottom:1px solid #EBEBEB;text-align:right;color:#021C45;font-weight:700;font-family:Verdana,Geneva,sans-serif;font-size:12px;">${price != null ? 'R$ ' + Math.round(price) : '—'}</td>
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
              <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;width:30%;">Channel</th>
              <th style="padding:12px 8px;text-align:right;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;">Latest</th>
              <th style="padding:12px 8px;text-align:right;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;">Price (${priceType})</th>
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

  // ── Public hooks ────────────────────────────────────────────────────────────
  window._passToggleSeries = function(key) { PASS_ON[key] = !PASS_ON[key]; render(); };
  window._passRender = render;

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    if (typeof RAW_PASSTHROUGH_OLY === 'undefined') { console.warn('Passthrough data not loaded yet.'); return; }
    populateDateSelects();
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
