// ecom-chart.js — E-commerce Data chart logic extracted from ecom-data-wip.html
// Exposes window._ecomInit() and window._ecomDestroy() for tab integration.
(function() {
// ─── Palette ──────────────────────────────────────────────────────────────────
const C = { azulEscuro:'#021C45', azulEscuro60:'#667D99', azulEscuro40:'#9AA8BB', cereja:'#FF4F6C' };

// ─── Cutoff: last fully-completed ISO week (week-end Sunday) ─────────────────
const MAX_W = (() => {
    const now = new Date();
    const back = now.getDay() === 0 ? 7 : now.getDay(); // days back to last Sunday
    const sun = new Date(now);
    sun.setDate(now.getDate() - back);
    return sun.toISOString().slice(0, 10);
})();

// ─── Sport group descriptions ─────────────────────────────────────────────────
const SPORT_DESC = {
    corrida:     'Corrida only',
    performance: 'Corrida + Caminhada + Treino + Trilha',
    all:         'All sport groups'
};

// ─── Sport-category filter per source (null = include all) ────────────────────
// SPORT_CATS — canonical filters per channel.
// Uniformized 2026-05-22:
//   * Corrida = running only (Caminhada NOT included where channels list it separately).
//     Note: Centauro bundles "Corrida / Caminhada" at the source — this channel unavoidably
//     includes some Caminhada in "Corrida" because the source does not separate them.
//   * Performance = Corrida + Treino + Trilha + Caminhada (uniform across all channels).
//     "Aventura" in Centauro maps to Trilha (trail-running models like Gel-Trabuco, Gel-Sonoma).
// All filters use canonical (mapped) category names — Direct and Netshoes queries now
// emit mapped cats. Centauro uses raw cats since it is not yet mapped at the query layer.
const SPORT_CATS = {
    olympikus: {
        corrida:     ['Corrida'],
        performance: ['Corrida', 'Caminhada', 'Treino e Academia', 'Trilha'],
        all:         null
    },
    mizuno: {
        corrida:     ['Corrida'],
        performance: ['Corrida', 'Treino', 'Trilha'],
        all:         null
    },
    centauro: {
        // Raw cats from centauro_trusted. "Aventura" = trail-running.
        // Centauro evolved cats over time: original "Corrida / Caminhada" was later
        // split into "Corrida" alone in some periods; "Aventura" was renamed
        // "Aventura / Esportes Radicais". Both old and new cats listed for full coverage.
        corrida:     ['Corrida / Caminhada', 'Corrida'],
        performance: ['Corrida / Caminhada', 'Corrida', 'Academia / Fitness', 'Aventura', 'Aventura / Esportes Radicais', 'Treino'],
        all:         null
    },
    direct: {
        // Canonical mapped cats — all 4 Direct brands now emit mapped categories.
        corrida:     ['Corrida'],
        performance: ['Corrida', 'Caminhada', 'Treino', 'Trilha'],
        all:         null
    },
    netshoes: {
        // Canonical mapped cats — Netshoes queries already emit mapped categories.
        corrida:     ['Corrida'],
        performance: ['Corrida', 'Treino', 'Trilha'],
        all:         null
    }
};

// ─── Brand colours (Constellation palette, matching BPC) ─────────────────────
const BRAND_COLOR = {
    adidas:       '#021C45',  // azulEscuro
    nike:         '#FF5B76',  // cereja
    ua:           '#18A6F1',  // azulClaro
    asics:        '#58D9D1',  // turquesa
    olympikus:    '#5A0F4A',  // berinjela
    mizuno:       '#667D99',  // azulEscuro60
};

// ─── Series definitions (all possible — 18 series) ────────────────────────────
// dash: []=[solid/direct], [6,3]=[centauro/dashed], [3,2]=[netshoes/short-dash]
const ALL_SERIES = [
    // ── Website / Direct ──────────────────────────────────────────────────────
    { key:'olympikus|direct',   label:'Olympikus — Website',     source:'olympikus', brandKey:'',             color:BRAND_COLOR.olympikus, dash:[] },
    { key:'mizuno|direct',      label:'Mizuno — Website',        source:'mizuno',    brandKey:'',             color:BRAND_COLOR.mizuno,    dash:[] },
    { key:'adidas|direct',      label:'Adidas — Website',        source:'direct',    brandKey:'adidas',       color:BRAND_COLOR.adidas,    dash:[] },
    { key:'nike|direct',        label:'Nike — Website',          source:'direct',    brandKey:'nike',         color:BRAND_COLOR.nike,      dash:[] },
    { key:'ua|direct',          label:'Under Armour — Website',  source:'direct',    brandKey:'ua',           color:BRAND_COLOR.ua,        dash:[] },
    { key:'asics|direct',       label:'Asics — Website',         source:'direct',    brandKey:'asics',        color:BRAND_COLOR.asics,     dash:[] },
    // ── Centauro ─────────────────────────────────────────────────────────────
    { key:'adidas|centauro',    label:'Adidas — Centauro',       source:'centauro',  brandKey:'adidas',       color:BRAND_COLOR.adidas,    dash:[] },
    { key:'nike|centauro',      label:'Nike — Centauro',         source:'centauro',  brandKey:'Nike',         color:BRAND_COLOR.nike,      dash:[] },
    { key:'ua|centauro',        label:'Under Armour — Centauro', source:'centauro',  brandKey:'Under Armour', color:BRAND_COLOR.ua,        dash:[] },
    { key:'asics|centauro',     label:'Asics — Centauro',        source:'centauro',  brandKey:'Asics',        color:BRAND_COLOR.asics,     dash:[] },
    { key:'olympikus|centauro', label:'Olympikus — Centauro',    source:'centauro',  brandKey:'Olympikus',    color:BRAND_COLOR.olympikus, dash:[] },
    { key:'mizuno|centauro',    label:'Mizuno — Centauro',       source:'centauro',  brandKey:'Mizuno',       color:BRAND_COLOR.mizuno,    dash:[] },
    // ── Netshoes ─────────────────────────────────────────────────────────────
    { key:'adidas|netshoes',    label:'Adidas — Netshoes',       source:'netshoes',  brandKey:'adidas',       color:BRAND_COLOR.adidas,    dash:[] },
    { key:'nike|netshoes',      label:'Nike — Netshoes',         source:'netshoes',  brandKey:'Nike',         color:BRAND_COLOR.nike,      dash:[] },
    { key:'ua|netshoes',        label:'Under Armour — Netshoes', source:'netshoes',  brandKey:'ua',           color:BRAND_COLOR.ua,        dash:[] },
    { key:'asics|netshoes',     label:'Asics — Netshoes',        source:'netshoes',  brandKey:'Asics',        color:BRAND_COLOR.asics,     dash:[] },
    { key:'olympikus|netshoes', label:'Olympikus — Netshoes',    source:'netshoes',  brandKey:'Olympikus',    color:BRAND_COLOR.olympikus, dash:[] },
    { key:'mizuno|netshoes',    label:'Mizuno — Netshoes',       source:'netshoes',  brandKey:'Mizuno',       color:BRAND_COLOR.mizuno,    dash:[] },
];

// Default ON: Olympikus Website, Mizuno Website, Adidas Centauro, Nike Centauro, Asics Centauro
const DEFAULT_ON = new Set(['olympikus|direct','mizuno|direct','adidas|centauro','nike|centauro','asics|centauro']);
const SERIES_ON = {};
ALL_SERIES.forEach(s => { SERIES_ON[s.key] = DEFAULT_ON.has(s.key); });

const SERIES_BY_KEY = Object.fromEntries(ALL_SERIES.map(s => [s.key, s]));

// ─── View mode state ──────────────────────────────────────────────────────────
let viewMode      = 'comparison'; // 'comparison' | 'breakdown'
let compChannel   = 'free';       // 'total' | 'website' | 'netshoes' | 'centauro' | 'free'
let breakdownBrand = 'adidas';

const BRAND_IDS    = ['adidas','nike','ua','asics','olympikus','mizuno'];
const BRAND_LABELS = { adidas:'Adidas', nike:'Nike', ua:'Under Armour', asics:'Asics', olympikus:'Olympikus', mizuno:'Mizuno' };
const BRAND_SERIES_KEYS = {
    adidas:    ['adidas|direct',    'adidas|centauro',    'adidas|netshoes'],
    nike:      ['nike|direct',      'nike|centauro',      'nike|netshoes'],
    ua:        ['ua|direct',        'ua|centauro',        'ua|netshoes'],
    asics:     ['asics|direct',     'asics|centauro',     'asics|netshoes'],
    olympikus: ['olympikus|direct', 'olympikus|centauro', 'olympikus|netshoes'],
    mizuno:    ['mizuno|direct',    'mizuno|centauro',    'mizuno|netshoes'],
};

// ─── State ────────────────────────────────────────────────────────────────────
let priceChart = null;
let discChart  = null;

// Disc chart — independent state
const DISC_SERIES_ON = {};
ALL_SERIES.forEach(s => { DISC_SERIES_ON[s.key] = DEFAULT_ON.has(s.key); });
let discViewMode       = 'comparison';
let discCompChannel    = 'free';
let discBreakdownBrand = 'adidas';

// ─── Data helpers ─────────────────────────────────────────────────────────────
function getCatFilter(source, sport) {
    return (SPORT_CATS[source] || {})[sport] || null;
}

// ─── Active series resolver ───────────────────────────────────────────────────
// Website → azulEscuro, Centauro → azulClaro, Netshoes → turquesa (always distinct)
const CHANNEL_BREAKDOWN_COLORS = ['#021C45', '#18A6F1', '#58D9D1'];

const CHANNEL_LABEL = { website:'Website', centauro:'Centauro', netshoes:'Netshoes' };

// Per-chart set of series keys hidden via legend click (independent of the side panel).
const LEGEND_HIDDEN = { price: new Set(), disc: new Set(), avgdisc: new Set() };

function getActiveSeries(includeHidden) {
    let series;
    if (viewMode === 'breakdown') {
        const channelSeries = (BRAND_SERIES_KEYS[breakdownBrand] || []).map((k, i) => {
            const s = SERIES_BY_KEY[k];
            if (!s) return null;
            return { ...s, label: ['Website', 'Centauro', 'Netshoes'][i], color: CHANNEL_BREAKDOWN_COLORS[i], dash: [] };
        }).filter(Boolean);
        series = [...channelSeries, {
            key: breakdownBrand + '|total', label: 'Total',
            source: '_total', brandKey: '', color: '#344F75', dash: [], _totalBrandId: breakdownBrand,
        }];
    } else if (compChannel === 'free') series = ALL_SERIES.filter(s => SERIES_ON[s.key]);
    else if (compChannel === 'website')  series = ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey || s.source] || s.label }));
    else if (compChannel === 'netshoes') series = ALL_SERIES.filter(s => s.source === 'netshoes').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey] || s.label }));
    else if (compChannel === 'centauro') series = ALL_SERIES.filter(s => s.source === 'centauro').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey.toLowerCase()] || BRAND_LABELS[s.brandKey] || s.label }));
    else series = BRAND_IDS.map(id => ({
        key: id + '|total', label: BRAND_LABELS[id],
        source: '_total', brandKey: '', color: BRAND_COLOR[id], dash: [], _totalBrandId: id
    }));
    return includeHidden ? series : series.filter(s => !LEGEND_HIDDEN.price.has(s.key));
}

function getDiscActiveSeries(includeHidden) {
    let series;
    if (discViewMode === 'breakdown') {
        const channelSeries = (BRAND_SERIES_KEYS[discBreakdownBrand] || []).map((k, i) => {
            const s = SERIES_BY_KEY[k];
            if (!s) return null;
            return { ...s, label: ['Website', 'Centauro', 'Netshoes'][i], color: CHANNEL_BREAKDOWN_COLORS[i], dash: [] };
        }).filter(Boolean);
        series = [...channelSeries, {
            key: discBreakdownBrand + '|total', label: 'Total',
            source: '_total', brandKey: '', color: '#344F75', dash: [], _totalBrandId: discBreakdownBrand,
        }];
    } else if (discCompChannel === 'free') series = ALL_SERIES.filter(s => DISC_SERIES_ON[s.key]);
    else if (discCompChannel === 'website')  series = ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey || s.source] || s.label }));
    else if (discCompChannel === 'netshoes') series = ALL_SERIES.filter(s => s.source === 'netshoes').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey] || s.label }));
    else if (discCompChannel === 'centauro') series = ALL_SERIES.filter(s => s.source === 'centauro').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey.toLowerCase()] || BRAND_LABELS[s.brandKey] || s.label }));
    else series = BRAND_IDS.map(id => ({
        key: id + '|total', label: BRAND_LABELS[id],
        source: '_total', brandKey: '', color: BRAND_COLOR[id], dash: [], _totalBrandId: id
    }));
    return includeHidden ? series : series.filter(s => !LEGEND_HIDDEN.disc.has(s.key));
}

// Toggle legend visibility — exposed for inline onclick on legend items.
function toggleLegendSeries(scope, key) {
    const set = LEGEND_HIDDEN[scope];
    if (set.has(key)) set.delete(key); else set.add(key);
    if (scope === 'price') { buildPriceLegend(); buildPriceChart(); buildPriceTable(); }
    else if (scope === 'disc') { buildDiscLegend(); buildDiscChart(); buildDiscTable(); }
    else if (scope === 'avgdisc') { buildAvgDiscLegend(); buildAvgDiscChart(); buildAvgDiscTable(); }
}

// Total = simple arithmetic mean of the 3 channel-level weighted means.
// Within each channel, the weekly value is already SKU-weighted across rows.
// Across channels we use a flat 1/3 weight (NOT SKU-weighted) because each
// scraper counts SKUs at a different grain (colorway vs EAN vs etc.), so
// pooling raw n would over-weight finer-grain channels. All 3 channels are
// required for a week to appear in the Total.
function computeTotalWeekly(brandId, sport, metric) {
    const maps = (BRAND_SERIES_KEYS[brandId] || []).map(k => {
        const s = SERIES_BY_KEY[k];
        if (!s) return new Map();
        return computeWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport), metric);
    });
    const allWeeks = new Set();
    maps.forEach(m => m.forEach((_, w) => allWeeks.add(w)));
    const result = new Map();
    for (const w of allWeeks) {
        const vals = maps.map(m => m.get(w));
        if (vals.some(v => v == null)) continue; // all channels required
        result.set(w, Math.round(vals.reduce((a,b) => a+b, 0) / vals.length * 100) / 100);
    }
    return result;
}

function getWeeklyMap(s, sport, metric) {
    if (s._totalBrandId) return computeTotalWeekly(s._totalBrandId, sport, metric);
    return computeWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport), metric);
}

// ─── Discount data helpers ────────────────────────────────────────────────────
function _discAccumulate(source, brandKey, catFilter) {
    let rows;
    if      (source === 'olympikus') rows = (typeof RAW_DISC_OLYMPIKUS !== 'undefined') ? RAW_DISC_OLYMPIKUS : [];
    else if (source === 'mizuno')    rows = (typeof RAW_DISC_MIZUNO    !== 'undefined') ? RAW_DISC_MIZUNO    : [];
    else if (source === 'centauro')  rows = (typeof RAW_DISC_CENTAURO  !== 'undefined') ? RAW_DISC_CENTAURO.filter(r => r.brand === brandKey)  : [];
    else if (source === 'direct')    rows = (typeof RAW_DISC_DIRECT    !== 'undefined') ? RAW_DISC_DIRECT.filter(r => r.brand === brandKey)    : [];
    else if (source === 'netshoes')  rows = (typeof RAW_DISC_NETSHOES  !== 'undefined') ? RAW_DISC_NETSHOES.filter(r => r.brand === brandKey)  : [];
    else return new Map();

    const byWeek = new Map();
    for (const r of rows) {
        if (r.w > MAX_W) continue;
        if (catFilter && !catFilter.includes(r.cat)) continue;
        if (r.pct == null) continue;
        if (!byWeek.has(r.w)) byWeek.set(r.w, { sumP: 0, sumN: 0 });
        const e = byWeek.get(r.w);
        e.sumP += r.pct * r.n;
        e.sumN += r.n;
    }
    return byWeek;
}

function computeDiscWeeklyMap(source, brandKey, catFilter) {
    const byWeek = _discAccumulate(source, brandKey, catFilter);
    const result = new Map();
    for (const [w, { sumP, sumN }] of byWeek) {
        if (sumN > 0) result.set(w, Math.round(sumP / sumN * 10000) / 10000);
    }
    return result;
}

// Total = simple arithmetic mean of the 3 channel-level weighted means.
// See computeTotalWeekly for the grain-comparability rationale.
function computeTotalDiscWeekly(brandId, sport) {
    const maps = (BRAND_SERIES_KEYS[brandId] || []).map(k => {
        const s = SERIES_BY_KEY[k];
        if (!s) return new Map();
        return computeDiscWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport));
    });
    const allWeeks = new Set();
    maps.forEach(m => m.forEach((_, w) => allWeeks.add(w)));
    const result = new Map();
    for (const w of allWeeks) {
        const vals = maps.map(m => m.get(w));
        if (vals.some(v => v == null)) continue;
        result.set(w, Math.round(vals.reduce((a,b) => a+b, 0) / vals.length * 10000) / 10000);
    }
    return result;
}

function getDiscWeeklyMap(s, sport) {
    if (s._totalBrandId) return computeTotalDiscWeekly(s._totalBrandId, sport);
    return computeDiscWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport));
}

// Accumulator: returns Map<week, {sumP, sumN}> for one channel × brand × filter.
// Shared by computeWeeklyMap (single-channel) and computeTotalWeekly (cross-channel pool).
function _priceAccumulate(source, brandKey, catFilter, metric) {
    let rows;
    if (source === 'olympikus') rows = (typeof RAW_OLYMPIKUS !== 'undefined') ? RAW_OLYMPIKUS : [];
    else if (source === 'mizuno') rows = (typeof RAW_MIZUNO !== 'undefined') ? RAW_MIZUNO : [];
    else if (source === 'centauro') {
        rows = (typeof RAW_CENTAURO !== 'undefined') ? RAW_CENTAURO.filter(r => r.brand === brandKey) : [];
    }
    else if (source === 'direct') rows = (typeof RAW_DIRECT !== 'undefined') ? RAW_DIRECT.filter(r => r.brand === brandKey) : [];
    else if (source === 'netshoes') rows = (typeof RAW_NETSHOES !== 'undefined') ? RAW_NETSHOES.filter(r => r.brand === brandKey) : [];
    else return new Map();

    const byWeek = new Map();
    for (const r of rows) {
        if (r.w > MAX_W) continue;
        if (catFilter && !catFilter.includes(r.cat)) continue;
        const val = r[metric];
        if (val == null || val <= 0) continue;
        if (!byWeek.has(r.w)) byWeek.set(r.w, { sumP: 0, sumN: 0 });
        const e = byWeek.get(r.w);
        e.sumP += val * r.n;
        e.sumN += r.n;
    }
    return byWeek;
}

function computeWeeklyMap(source, brandKey, catFilter, metric) {
    const byWeek = _priceAccumulate(source, brandKey, catFilter, metric);
    const result = new Map();
    for (const [w, { sumP, sumN }] of byWeek) {
        if (sumN > 0) result.set(w, Math.round(sumP / sumN * 100) / 100);
    }
    return result;
}

function weekToDate(w) { return new Date(w + 'T00:00:00'); }

function fmtGranKey(w, gran) {
    const d = weekToDate(w);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (gran === 'monthly')   return `${y}-${String(m).padStart(2,'0')}`;
    if (gran === 'quarterly') return `${y}-Q${Math.ceil(m/3)}`;
    if (gran === 'annual')    return String(y);
    return w;
}

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getISOWeek(d) {
    const dt = new Date(d.getTime());
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    const w1 = new Date(dt.getFullYear(), 0, 4);
    return 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function getISOWeekYear(d) {
    const dt = new Date(d.getTime());
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    return dt.getFullYear();
}

function fmtGranLabel(key, gran) {
    if (gran === 'monthly') {
        const [y, m] = key.split('-');
        return `${MON[parseInt(m)-1]}-${y.slice(2)}`;
    }
    if (gran === 'quarterly') {
        const [y, q] = key.split('-');
        return `${q} ${y}`;
    }
    if (gran === 'annual') return key;
    // weekly — e.g. "1W25"
    const d = weekToDate(key);
    return `${getISOWeek(d)}W${String(getISOWeekYear(d)).slice(2)}`;
}

function mapToSortedPairs(wMap) {
    return [...wMap.entries()].sort((a,b) => a[0] < b[0] ? -1 : 1);
}

function aggregatePairs(weeklyPairs, gran) {
    if (gran === 'weekly') return weeklyPairs.map(([w, v]) => [w, v, 1]);
    const groups = new Map();
    for (const [w, price] of weeklyPairs) {
        const key = fmtGranKey(w, gran);
        if (!groups.has(key)) groups.set(key, { sum: 0, cnt: 0, firstW: w });
        const g = groups.get(key);
        g.sum += price;
        g.cnt += 1;
    }
    // Round at 4 decimals: needed for % metrics (0-1 range); harmless for prices in R$.
    return [...groups.entries()]
        .sort((a,b) => a[1].firstW < b[1].firstW ? -1 : 1)
        .map(([key, { sum, cnt }]) => [key, Math.round(sum / cnt * 10000) / 10000, cnt]);
}

// Minimum weekly samples expected per granularity (below = flagged as thin).
function thinThreshold(gran) {
    return gran === 'monthly' ? 3 : gran === 'quarterly' ? 10 : 0;  // 0 = never flag
}
function thinMark(cnt, gran) {
    const t = thinThreshold(gran);
    return (t > 0 && cnt != null && cnt < t)
        ? `<sup title="Based on only ${cnt} weekly sample${cnt===1?'':'s'} — may be statistically thin (Centauro has Thursday-only coverage so some months lose weeks)." style="color:#C8102E;font-weight:700;cursor:help;">*</sup>`
        : '';
}

// ─── Period labels (From/To dropdowns) ───────────────────────────────────────
function buildAllPeriodKeys(gran) {
    const sport  = document.getElementById('sport-filter').value;
    const metric = document.getElementById('metric-select').value;
    const weeks  = new Set();
    getActiveSeries().forEach(s => {
        getWeeklyMap(s, sport, metric).forEach((_, w) => weeks.add(w));
    });
    const sorted = [...weeks].sort();
    if (gran === 'weekly') return sorted.map(w => ({ key: w, label: fmtGranLabel(w, 'weekly') }));
    const seen = new Map();
    sorted.forEach(w => {
        const key = fmtGranKey(w, gran);
        if (!seen.has(key)) seen.set(key, w);
    });
    return [...seen.entries()].map(([key]) => ({ key, label: fmtGranLabel(key, gran) }));
}

const DEFAULT_FROM_WEEKLY = '2026-01-04'; // 1W26

function populateFromTo(gran) {
    const periods = buildAllPeriodKeys(gran);
    const fromSel = document.getElementById('from-select');
    const toSel   = document.getElementById('to-select');
    const prevFrom = fromSel.value;
    const prevTo   = toSel.value;
    fromSel.innerHTML = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    toSel.innerHTML   = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    const keys = periods.map(p => p.key);
    if (keys.includes(prevFrom)) {
        fromSel.value = prevFrom;
    } else if (!prevFrom) {
        // first load: pick the period that contains DEFAULT_FROM_WEEKLY
        const def = gran === 'weekly' ? DEFAULT_FROM_WEEKLY : fmtGranKey(DEFAULT_FROM_WEEKLY, gran);
        fromSel.value = keys.includes(def) ? def : (keys.find(k => k >= def) || keys[0] || '');
    } else {
        fromSel.value = keys[0] || '';
    }
    toSel.value = keys.includes(prevTo) ? prevTo : keys[keys.length - 1] || '';
}

function onGranChange() {
    populateFromTo(document.getElementById('gran-select').value);
    renderAll();
}

// ─── Extended axis plugin (BPC: draw bottom X-axis line) ──────────────────────
const extendedAxisPlugin = {
    id: 'ecomExtendedAxis',
    afterDraw(chart) {
        if (!chart.$ecomExtendedAxis) return;
        const { ctx, chartArea, width } = chart;
        const y = Math.round(chartArea.bottom) + 0.5;
        const xStart = Math.round(chartArea.left) + 0.5;
        ctx.save();
        ctx.strokeStyle = '#CCD4DD';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xStart, y);
        ctx.lineTo(width - 4, y);
        ctx.stroke();
        ctx.restore();
    }
};

// ─── Pill label helpers ───────────────────────────────────────────────────────
function drawPill(ctx, text, x, y, color, canvasW) {
    ctx.save();
    ctx.font = '700 9px Verdana,Geneva,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const padX = 5, h = 16, r = 4;
    const w = ctx.measureText(text).width + padX * 2;
    const halfW = w / 2;
    if (canvasW) { if (x - halfW < 2) x = halfW + 2; if (x + halfW > canvasW - 2) x = canvasW - halfW - 2; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - halfW + r, y - h/2);
    ctx.lineTo(x + halfW - r, y - h/2);
    ctx.quadraticCurveTo(x + halfW, y - h/2, x + halfW, y - h/2 + r);
    ctx.lineTo(x + halfW, y + h/2 - r);
    ctx.quadraticCurveTo(x + halfW, y + h/2, x + halfW - r, y + h/2);
    ctx.lineTo(x - halfW + r, y + h/2);
    ctx.quadraticCurveTo(x - halfW, y + h/2, x - halfW, y + h/2 - r);
    ctx.lineTo(x - halfW, y - h/2 + r);
    ctx.quadraticCurveTo(x - halfW, y - h/2, x - halfW + r, y - h/2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
}

function resolvePillOverlaps(entries, pillHeight, gap) {
    entries.sort((a, b) => a.y - b.y);
    const need = pillHeight + gap;
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1], cur = entries[i];
        const delta = cur.y - prev.y;
        if (delta < need) {
            const push = (need - delta) / 2;
            prev.y -= push;
            cur.y  += push;
        }
    }
    // second pass for cascades in 3+ stacks
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1], cur = entries[i];
        const delta = cur.y - prev.y;
        if (delta < need) cur.y = prev.y + need;
    }
}

const priceLabelPlugin = {
    id: 'pricePillLabels',
    afterDatasetsDraw(chart) {
        const { ctx, data, chartArea } = chart;
        const datasets = data.datasets;
        const labels = data.labels;
        if (!labels || !labels.length) return;
        const lastIdx = labels.length - 1;
        const MIN_LABELS = 16;
        const offset = Math.max(1, Math.floor(lastIdx / (MIN_LABELS - 1)));
        const showIdx = new Set([lastIdx]);
        for (let k = 1; lastIdx - k * offset >= 0; k++) showIdx.add(lastIdx - k * offset);

        ctx.save();
        ctx.font = '700 11px Verdana,Geneva,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        showIdx.forEach(i => {
            const entries = [];
            datasets.forEach((ds, dsIdx) => {
                const meta = chart.getDatasetMeta(dsIdx);
                if (meta.hidden) return;
                const val = ds.data[i];
                if (val == null) return;
                const pt = meta.data[i];
                if (!pt) return;
                const text = chart.$pillFmt ? chart.$pillFmt(val) : String(Math.round(val));
                const halfW = ctx.measureText(text).width / 2 + 8;
                const xMin = chartArea.left + halfW + 4;
                const clampedX = Math.max(xMin, pt.x);
                entries.push({ x: clampedX, y: pt.y, text, color: ds.borderColor });
            });
            if (!entries.length) return;
            resolvePillOverlaps(entries, 20, 2);
            entries.forEach(e => drawPill(ctx, e.text, e.x, e.y, e.color, chart.width));
        });
        ctx.restore();
    }
};

// ─── Series swatch helper ────────────────────────────────────────────────────
function makeDashSwatch(color, dash) {
    if (!dash.length)
        return `<span class="chart-legend-swatch" style="background:${color};"></span>`;
    if (dash[0] === 6)
        return `<span class="chart-legend-swatch" style="background:repeating-linear-gradient(90deg,${color} 0,${color} 6px,transparent 6px,transparent 9px);"></span>`;
    return `<span class="chart-legend-swatch" style="background:repeating-linear-gradient(90deg,${color} 0,${color} 2px,transparent 2px,transparent 5px);"></span>`;
}

// ─── Series dropdown ──────────────────────────────────────────────────────────
function buildSeriesPanel() {
    const panel = document.getElementById('series-panel');
    // Group by channel
    const groups = [
        { label: 'Website / Direct', keys: ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct') },
        { label: 'Centauro',         keys: ALL_SERIES.filter(s => s.source === 'centauro') },
        { label: 'Netshoes',         keys: ALL_SERIES.filter(s => s.source === 'netshoes') },
    ];
    panel.innerHTML = groups.map(g => `
        <div style="font-size:10px;color:#9AA8BB;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;padding:6px 0 3px 0;">${g.label}</div>
        ${g.keys.map(s => `
        <label class="series-option">
            <input type="checkbox" ${SERIES_ON[s.key] ? 'checked' : ''} onchange="onSeriesToggle('${s.key}')">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
            ${s.label}
        </label>`).join('')}
    `).join('');
    updateDropdownLabel();
}

function updateDropdownLabel() {
    const on = ALL_SERIES.filter(s => SERIES_ON[s.key]);
    document.getElementById('series-trigger-label').textContent =
        on.length === 0 ? 'None selected' :
        on.length === 1 ? on[0].label :
        `${on.length} series selected`;
}

function toggleSeriesPanel() {
    const panel  = document.getElementById('series-panel');
    const trigger = document.getElementById('series-trigger');
    const isOpen = panel.classList.contains('open');
    if (!isOpen) {
        const r = trigger.getBoundingClientRect();
        panel.style.top  = (r.bottom + 6) + 'px';
        panel.style.left = r.left + 'px';
        panel.style.width = Math.max(r.width, 260) + 'px';
    }
    panel.classList.toggle('open', !isOpen);
}

function onSeriesToggle(key) {
    SERIES_ON[key] = !SERIES_ON[key];
    updateDropdownLabel();
    populateFromTo(document.getElementById('gran-select').value);
    renderAll();
}

document.addEventListener('click', e => {
    const trigger = document.getElementById('series-trigger');
    const panel   = document.getElementById('series-panel');
    if (trigger && panel && !trigger.contains(e.target) && !panel.contains(e.target))
        panel.classList.remove('open');
});

// ─── Inline legend (active series only, read-only) ────────────────────────────
function buildPriceLegend() {
    const el = document.getElementById('price-legend');
    el.innerHTML = getActiveSeries(true)
        .map(s => {
            const cls = LEGEND_HIDDEN.price.has(s.key) ? 'chart-legend-item legend-hidden' : 'chart-legend-item';
            return `<span class="${cls}" onclick="toggleLegendSeries('price', '${s.key}')">${makeDashSwatch(s.color, s.dash)}${s.label}</span>`;
        })
        .join('');
}

// ─── Build chart ──────────────────────────────────────────────────────────────
function buildPriceChart() {
    const sport  = document.getElementById('sport-filter').value;
    const metric = document.getElementById('metric-select').value;
    const gran   = document.getElementById('gran-select').value;
    const fromK  = document.getElementById('from-select').value;
    const toK    = document.getElementById('to-select').value;

    const activeSeries = getActiveSeries();
    const allKeys = new Set();
    const seriesPairs = activeSeries.map(s => {
        const wMap   = getWeeklyMap(s, sport, metric);
        const weekly = mapToSortedPairs(wMap);
        const pairs  = aggregatePairs(weekly, gran);
        pairs.forEach(([k]) => allKeys.add(k));
        return { s, pairs };
    });

    const sortedKeys = [...allKeys].sort().filter(k => {
        if (fromK && k < fromK) return false;
        if (toK   && k > toK)   return false;
        return true;
    });

    // Nice Y-axis ticks (BPC pattern)
    const allVals = seriesPairs.flatMap(({ pairs }) => pairs.map(([k, v]) => sortedKeys.includes(k) ? v : null)).filter(v => v != null && isFinite(v));
    const dataMin = allVals.length ? Math.min(...allVals) : 0;
    const dataMax = allVals.length ? Math.max(...allVals) : 500;
    const range   = (dataMax - dataMin) || dataMax || 100;
    const roughStep = range / 5; // target ~5 intervals
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multipliers = [1, 2, 2.5, 5, 10];
    let yStep = magnitude * multipliers[multipliers.length - 1];
    for (const m of multipliers) { const s = magnitude * m; if (s >= roughStep) { yStep = s; break; } }
    const yMin = Math.max(0, Math.floor((dataMin - range * 0.02) / yStep) * yStep);
    const yMax = Math.ceil((dataMax  + range * 0.02) / yStep) * yStep;

    const datasets = seriesPairs.map(({ s, pairs }) => {
        const pairMap = new Map(pairs);
        return {
            label: s.label,
            data:  sortedKeys.map(k => pairMap.get(k) ?? null),
            borderColor: s.color,
            backgroundColor: s.color,
            borderWidth: 2.5,
            borderDash: s.dash,
            tension: 0.28,
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: false,
            fill: false
        };
    });

    if (priceChart) { priceChart.destroy(); priceChart = null; }
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: { labels: sortedKeys.map(k => fmtGranLabel(k, gran)), datasets },
        plugins: [priceLabelPlugin, extendedAxisPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 72, right: 22, bottom: 8, left: 0 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#021C45', padding: 12,
                    titleColor: '#FFFFFF', bodyColor: '#FFFFFF',
                    titleFont: { size: 12, weight: 'bold', family: 'Verdana' },
                    bodyFont: { size: 12, family: 'Verdana' },
                    borderWidth: 0, displayColors: true, boxWidth: 10, boxHeight: 10,
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            return ` ${ctx.dataset.label}: ${v == null ? '—' : 'R$ ' + v.toFixed(0)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#667D99',
                        font: { size: 9, family: 'Verdana', weight: 'normal' },
                        minRotation: 90, maxRotation: 90, autoSkip: true, maxTicksLimit: 52
                    }
                },
                y: {
                    display: true,
                    min: yMin, max: yMax,
                    grid: { display: false },
                    border: { display: true, color: '#CCD4DD', width: 1 },
                    ticks: {
                        color: '#667D99',
                        font: { size: 11, family: 'Verdana', weight: 'normal' },
                        stepSize: yStep,
                        padding: 10,
                        callback: v => 'R$ ' + (Number.isInteger(v) ? v : v.toFixed(0))
                    }
                }
            }
        }
    });
    priceChart.$ecomExtendedAxis = true;
    priceChart.update('none');
}

// ─── Build summary table ──────────────────────────────────────────────────────
function buildPriceTable() {
    const sport  = document.getElementById('sport-filter').value;
    const metric = document.getElementById('metric-select').value;
    const gran   = document.getElementById('gran-select').value;
    const toK    = document.getElementById('to-select').value;

    const activeSeries = getActiveSeries();
    if (!activeSeries.length) { document.getElementById('price-table').innerHTML = ''; return; }

    const seriesData = activeSeries.map(s => {
        const weekly = mapToSortedPairs(getWeeklyMap(s, sport, metric));
        const agg    = aggregatePairs(weekly, gran);
        const capped = toK ? agg.filter(([k]) => k <= toK) : agg;
        const pairMap = new Map(capped.map(([k, v, cnt]) => [k, { v, cnt }]));
        return { s, pairMap, pairs: capped };
    });

    let anchorK = '';
    seriesData.forEach(({ pairs }) => {
        if (pairs.length) { const k = pairs[pairs.length-1][0]; if (k > anchorK) anchorK = k; }
    });
    if (!anchorK) { document.getElementById('price-table').innerHTML = ''; return; }

    function shiftKey(key, n) {
        if (gran === 'weekly') {
            const d = weekToDate(key); d.setDate(d.getDate() - n * 7);
            return d.toISOString().slice(0, 10);
        }
        if (gran === 'monthly') {
            const [y, m] = key.split('-').map(Number);
            let nm = m - n, ny = y;
            while (nm <= 0) { nm += 12; ny--; }
            return `${ny}-${String(nm).padStart(2,'0')}`;
        }
        if (gran === 'quarterly') {
            const [y, q] = key.split('-Q').map(Number);
            let nq = q - n, ny = y;
            while (nq <= 0) { nq += 4; ny--; }
            return `${ny}-Q${nq}`;
        }
        return String(parseInt(key) - n); // annual
    }

    const refs =
        gran === 'weekly'    ? [{ k: shiftKey(anchorK,1),  dl:'Δ WoW' }, { k: shiftKey(anchorK,4),  dl:'Δ MoM' }, { k: shiftKey(anchorK,52), dl:'Δ YoY' }] :
        gran === 'monthly'   ? [{ k: shiftKey(anchorK,1),  dl:'Δ MoM' }, { k: shiftKey(anchorK,12), dl:'Δ YoY' }] :
        gran === 'quarterly' ? [{ k: shiftKey(anchorK,1),  dl:'Δ QoQ' }, { k: shiftKey(anchorK,4),  dl:'Δ YoY' }] :
                               [{ k: shiftKey(anchorK,1),  dl:'Δ YoY' }];

    const AZ = C.azulEscuro, CE = '#FF5B76';
    const TH = (bg, txt) => `<th style="padding:12px 12px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${bg};color:#FFFFFF;">${txt}</th>`;

    function deltaBadge(curr, ref) {
        if (curr == null || ref == null || ref === 0) return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge delta-neu">—</span></td>`;
        const d = (curr - ref) / ref;
        const sign = d >= 0 ? '+' : '';
        const cls = d > 0.001 ? 'delta-pos' : d < -0.001 ? 'delta-neg' : 'delta-neu';
        return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge ${cls}">${sign}${(d*100).toFixed(1)}%</span></td>`;
    }

    function priceCell(entry) {
        const v = entry?.v ?? null;
        const mark = entry ? thinMark(entry.cnt, gran) : '';
        return `<td style="padding:14px 12px;border-bottom:1px solid #EBEBEB;text-align:center;color:${C.azulEscuro};font-weight:700;font-family:Verdana,Geneva,sans-serif;">${v != null ? 'R$ ' + Math.round(v) + mark : '—'}</td>`;
    }

    const rows = seriesData.map(({ s, pairMap }) => {
        const currEntry = pairMap.get(anchorK) ?? null;
        const curr = currEntry?.v ?? null;
        const dot  = `<span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>`;
        const refCells = refs.map(r => {
            const refEntry = pairMap.get(r.k) ?? null;
            return priceCell(refEntry) + deltaBadge(curr, refEntry?.v ?? null);
        }).join('');
        return `<tr>
            <td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:${C.azulEscuro};font-family:Verdana,Geneva,sans-serif;">${dot}${s.label}</td>
            ${priceCell(currEntry)}${refCells}
        </tr>`;
    }).join('');

    document.getElementById('price-table').innerHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;">
            <thead><tr>
                <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${AZ};color:#FFFFFF;width:26%;"></th>
                ${TH(AZ, fmtGranLabel(anchorK, gran))}
                ${refs.map(r => TH(AZ, fmtGranLabel(r.k, gran)) + TH(CE, r.dl)).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
}

// ─── View mode handlers ───────────────────────────────────────────────────────
function updateViewControls() {
    const isBreakdown = viewMode === 'breakdown';
    const isFree      = viewMode === 'comparison' && compChannel === 'free';
    document.getElementById('comp-channel-block').style.display    = isBreakdown ? 'none' : '';
    document.getElementById('breakdown-brand-block').style.display = isBreakdown ? ''     : 'none';
    document.getElementById('series-trigger-block').style.display  = isFree      ? ''     : 'none';
}

function onViewModeChange() {
    viewMode = document.getElementById('view-mode').value;
    updateViewControls();
    populateFromTo(document.getElementById('gran-select').value);
    renderAll();
}

function onCompChannelChange() {
    compChannel = document.getElementById('comp-channel').value;
    updateViewControls();
    populateFromTo(document.getElementById('gran-select').value);
    renderAll();
}

function onBreakdownBrandChange() {
    breakdownBrand = document.getElementById('breakdown-brand').value;
    populateFromTo(document.getElementById('gran-select').value);
    renderAll();
}

// ─── Disc series panel ────────────────────────────────────────────────────────
function buildDiscSeriesPanel() {
    const panel = document.getElementById('disc-series-panel');
    const groups = [
        { label: 'Website / Direct', keys: ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct') },
        { label: 'Centauro',         keys: ALL_SERIES.filter(s => s.source === 'centauro') },
        { label: 'Netshoes',         keys: ALL_SERIES.filter(s => s.source === 'netshoes') },
    ];
    panel.innerHTML = groups.map(g => `
        <div style="font-size:10px;color:#9AA8BB;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;padding:6px 0 3px 0;">${g.label}</div>
        ${g.keys.map(s => `
        <label class="series-option">
            <input type="checkbox" ${DISC_SERIES_ON[s.key] ? 'checked' : ''} onchange="onDiscSeriesToggle('${s.key}')">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
            ${s.label}
        </label>`).join('')}
    `).join('');
    updateDiscDropdownLabel();
}

function updateDiscDropdownLabel() {
    const on = ALL_SERIES.filter(s => DISC_SERIES_ON[s.key]);
    document.getElementById('disc-series-trigger-label').textContent =
        on.length === 0 ? 'None selected' :
        on.length === 1 ? on[0].label :
        `${on.length} series selected`;
}

function toggleDiscSeriesPanel() {
    const panel   = document.getElementById('disc-series-panel');
    const trigger = document.getElementById('disc-series-trigger');
    const isOpen  = panel.classList.contains('open');
    if (!isOpen) {
        const r = trigger.getBoundingClientRect();
        panel.style.top   = (r.bottom + 6) + 'px';
        panel.style.left  = r.left + 'px';
        panel.style.width = Math.max(r.width, 260) + 'px';
    }
    panel.classList.toggle('open', !isOpen);
}

function onDiscSeriesToggle(key) {
    DISC_SERIES_ON[key] = !DISC_SERIES_ON[key];
    updateDiscDropdownLabel();
    populateDiscFromTo(document.getElementById('disc-gran-select').value);
    buildDiscAll();
}

document.addEventListener('click', e => {
    const trigger = document.getElementById('disc-series-trigger');
    const panel   = document.getElementById('disc-series-panel');
    if (trigger && panel && !trigger.contains(e.target) && !panel.contains(e.target))
        panel.classList.remove('open');
});

// ─── Disc period population ───────────────────────────────────────────────────
function buildAllDiscPeriodKeys(gran) {
    const sport = document.getElementById('sport-filter').value;
    const weeks = new Set();
    getDiscActiveSeries().forEach(s => {
        getDiscWeeklyMap(s, sport).forEach((_, w) => weeks.add(w));
    });
    const sorted = [...weeks].sort();
    if (gran === 'weekly') return sorted.map(w => ({ key: w, label: fmtGranLabel(w, 'weekly') }));
    const seen = new Map();
    sorted.forEach(w => { const key = fmtGranKey(w, gran); if (!seen.has(key)) seen.set(key, w); });
    return [...seen.entries()].map(([key]) => ({ key, label: fmtGranLabel(key, gran) }));
}

function populateDiscFromTo(gran) {
    const periods  = buildAllDiscPeriodKeys(gran);
    const fromSel  = document.getElementById('disc-from-select');
    const toSel    = document.getElementById('disc-to-select');
    const prevFrom = fromSel.value;
    const prevTo   = toSel.value;
    fromSel.innerHTML = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    toSel.innerHTML   = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    const keys = periods.map(p => p.key);
    if (keys.includes(prevFrom)) {
        fromSel.value = prevFrom;
    } else if (!prevFrom) {
        const def = gran === 'weekly' ? DEFAULT_FROM_WEEKLY : fmtGranKey(DEFAULT_FROM_WEEKLY, gran);
        fromSel.value = keys.includes(def) ? def : (keys.find(k => k >= def) || keys[0] || '');
    } else {
        fromSel.value = keys[0] || '';
    }
    toSel.value = keys.includes(prevTo) ? prevTo : keys[keys.length - 1] || '';
}

function onDiscGranChange() {
    populateDiscFromTo(document.getElementById('disc-gran-select').value);
    buildDiscAll();
}

// ─── Disc view mode handlers ──────────────────────────────────────────────────
function updateDiscViewControls() {
    const isBreakdown = discViewMode === 'breakdown';
    const isFree      = discViewMode === 'comparison' && discCompChannel === 'free';
    document.getElementById('disc-comp-channel-block').style.display    = isBreakdown ? 'none' : '';
    document.getElementById('disc-breakdown-brand-block').style.display = isBreakdown ? ''     : 'none';
    document.getElementById('disc-series-trigger-block').style.display  = isFree      ? ''     : 'none';
}

function onDiscViewModeChange() {
    discViewMode = document.getElementById('disc-view-mode').value;
    updateDiscViewControls();
    populateDiscFromTo(document.getElementById('disc-gran-select').value);
    buildDiscAll();
}

function onDiscCompChannelChange() {
    discCompChannel = document.getElementById('disc-comp-channel').value;
    updateDiscViewControls();
    populateDiscFromTo(document.getElementById('disc-gran-select').value);
    buildDiscAll();
}

function onDiscBreakdownBrandChange() {
    discBreakdownBrand = document.getElementById('disc-breakdown-brand').value;
    populateDiscFromTo(document.getElementById('disc-gran-select').value);
    buildDiscAll();
}

function buildDiscAll() {
    buildDiscLegend();
    buildDiscChart();
    buildDiscTable();
}

// ─── Build disc chart + table ─────────────────────────────────────────────────
function buildDiscLegend() {
    const el = document.getElementById('disc-legend');
    el.innerHTML = getDiscActiveSeries(true)
        .map(s => {
            const cls = LEGEND_HIDDEN.disc.has(s.key) ? 'chart-legend-item legend-hidden' : 'chart-legend-item';
            return `<span class="${cls}" onclick="toggleLegendSeries('disc', '${s.key}')">${makeDashSwatch(s.color, s.dash)}${s.label}</span>`;
        })
        .join('');
}

function buildDiscChart() {
    const sport  = document.getElementById('sport-filter').value;
    const gran   = document.getElementById('disc-gran-select').value;
    const fromK  = document.getElementById('disc-from-select').value;
    const toK    = document.getElementById('disc-to-select').value;

    const activeSeries = getDiscActiveSeries();
    const allKeys = new Set();
    const seriesPairs = activeSeries.map(s => {
        const wMap  = getDiscWeeklyMap(s, sport);
        const weekly = mapToSortedPairs(wMap);
        const pairs  = aggregatePairs(weekly, gran);
        pairs.forEach(([k]) => allKeys.add(k));
        return { s, pairs };
    });

    const sortedKeys = [...allKeys].sort().filter(k => {
        if (fromK && k < fromK) return false;
        if (toK   && k > toK)   return false;
        return true;
    });

    const allVals = seriesPairs.flatMap(({ pairs }) => pairs.map(([k, v]) => sortedKeys.includes(k) ? v : null)).filter(v => v != null && isFinite(v));
    const dataMin = allVals.length ? Math.min(...allVals) : 0;
    const dataMax = allVals.length ? Math.max(...allVals) : 1;
    const range   = (dataMax - dataMin) || dataMax || 0.1;
    const roughStep = range / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multipliers = [1, 2, 2.5, 5, 10];
    let yStep = magnitude * multipliers[multipliers.length - 1];
    for (const m of multipliers) { const ms = magnitude * m; if (ms >= roughStep) { yStep = ms; break; } }
    const yMin = Math.max(0, Math.floor((dataMin - range * 0.02) / yStep) * yStep);
    const yMax = Math.min(1, Math.ceil((dataMax  + range * 0.02) / yStep) * yStep);

    const datasets = seriesPairs.map(({ s, pairs }) => {
        const pairMap = new Map(pairs);
        return {
            label: s.label,
            data:  sortedKeys.map(k => pairMap.get(k) ?? null),
            borderColor: s.color,
            backgroundColor: s.color,
            borderWidth: 2.5,
            borderDash: s.dash,
            tension: 0.28,
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: false,
            fill: false
        };
    });

    if (discChart) { discChart.destroy(); discChart = null; }
    const canvas = document.getElementById('disc-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    discChart = new Chart(ctx, {
        type: 'line',
        data: { labels: sortedKeys.map(k => fmtGranLabel(k, gran)), datasets },
        plugins: [priceLabelPlugin, extendedAxisPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 72, right: 22, bottom: 8, left: 0 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#021C45', padding: 12,
                    titleColor: '#FFFFFF', bodyColor: '#FFFFFF',
                    titleFont: { size: 12, weight: 'bold', family: 'Verdana' },
                    bodyFont: { size: 12, family: 'Verdana' },
                    borderWidth: 0, displayColors: true, boxWidth: 10, boxHeight: 10,
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            return ` ${ctx.dataset.label}: ${v == null ? '—' : Math.round(v * 100) + '%'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: '#667D99', font: { size: 9, family: 'Verdana', weight: 'normal' }, minRotation: 90, maxRotation: 90, autoSkip: true, maxTicksLimit: 52 }
                },
                y: {
                    display: true,
                    min: yMin, max: yMax,
                    grid: { display: false },
                    border: { display: true, color: '#CCD4DD', width: 1 },
                    ticks: {
                        color: '#667D99',
                        font: { size: 11, family: 'Verdana', weight: 'normal' },
                        stepSize: yStep,
                        padding: 10,
                        callback: v => Math.round(v * 100) + '%'
                    }
                }
            }
        }
    });
    discChart.$pillFmt = v => Math.round(v * 100) + '%';
    discChart.$ecomExtendedAxis = true;
    discChart.update('none');
}

function buildDiscTable() {
    const sport = document.getElementById('sport-filter').value;
    const gran  = document.getElementById('disc-gran-select').value;
    const toK   = document.getElementById('disc-to-select').value;

    const activeSeries = getDiscActiveSeries();
    if (!activeSeries.length) { document.getElementById('disc-table').innerHTML = ''; return; }

    const seriesData = activeSeries.map(s => {
        const weekly = mapToSortedPairs(getDiscWeeklyMap(s, sport));
        const agg    = aggregatePairs(weekly, gran);
        const capped = toK ? agg.filter(([k]) => k <= toK) : agg;
        const pairMap = new Map(capped.map(([k, v, cnt]) => [k, { v, cnt }]));
        return { s, pairMap, pairs: capped };
    });

    let anchorK = '';
    seriesData.forEach(({ pairs }) => {
        if (pairs.length) { const k = pairs[pairs.length - 1][0]; if (k > anchorK) anchorK = k; }
    });
    if (!anchorK) { document.getElementById('disc-table').innerHTML = ''; return; }

    function shiftKey(key, n) {
        if (gran === 'weekly') {
            const d = weekToDate(key); d.setDate(d.getDate() - n * 7);
            return d.toISOString().slice(0, 10);
        }
        if (gran === 'monthly') {
            const [y, m] = key.split('-').map(Number);
            let nm = m - n, ny = y;
            while (nm <= 0) { nm += 12; ny--; }
            return `${ny}-${String(nm).padStart(2, '0')}`;
        }
        if (gran === 'quarterly') {
            const [y, q] = key.split('-Q').map(Number);
            let nq = q - n, ny = y;
            while (nq <= 0) { nq += 4; ny--; }
            return `${ny}-Q${nq}`;
        }
        return String(parseInt(key) - n);
    }

    const refs =
        gran === 'weekly'    ? [{ k: shiftKey(anchorK, 1),  dl: 'Δ WoW' }, { k: shiftKey(anchorK, 4),  dl: 'Δ MoM' }, { k: shiftKey(anchorK, 52), dl: 'Δ YoY' }] :
        gran === 'monthly'   ? [{ k: shiftKey(anchorK, 1),  dl: 'Δ MoM' }, { k: shiftKey(anchorK, 12), dl: 'Δ YoY' }] :
        gran === 'quarterly' ? [{ k: shiftKey(anchorK, 1),  dl: 'Δ QoQ' }, { k: shiftKey(anchorK, 4),  dl: 'Δ YoY' }] :
                               [{ k: shiftKey(anchorK, 1),  dl: 'Δ YoY' }];

    const AZ = C.azulEscuro, CE = '#FF5B76';
    const TH = (bg, txt) => `<th style="padding:12px 12px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${bg};color:#FFFFFF;">${txt}</th>`;

    function pctCell(entry) {
        const v = entry?.v ?? null;
        const mark = entry ? thinMark(entry.cnt, gran) : '';
        return `<td style="padding:14px 12px;border-bottom:1px solid #EBEBEB;text-align:center;color:${C.azulEscuro};font-weight:700;font-family:Verdana,Geneva,sans-serif;">${v != null ? Math.round(v * 100) + '%' + mark : '—'}</td>`;
    }

    function ppBadge(curr, ref) {
        if (curr == null || ref == null) return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge delta-neu">—</span></td>`;
        const d = (curr - ref) * 100;
        const sign = d >= 0 ? '+' : '';
        const cls = d > 0.05 ? 'delta-neg' : d < -0.05 ? 'delta-pos' : 'delta-neu';
        return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge ${cls}">${sign}${d.toFixed(1)} pp</span></td>`;
    }

    const rows = seriesData.map(({ s, pairMap }) => {
        const currEntry = pairMap.get(anchorK) ?? null;
        const curr = currEntry?.v ?? null;
        const dot  = `<span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>`;
        const refCells = refs.map(r => {
            const refEntry = pairMap.get(r.k) ?? null;
            return pctCell(refEntry) + ppBadge(curr, refEntry?.v ?? null);
        }).join('');
        return `<tr>
            <td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:${C.azulEscuro};font-family:Verdana,Geneva,sans-serif;">${dot}${s.label}</td>
            ${pctCell(currEntry)}${refCells}
        </tr>`;
    }).join('');

    document.getElementById('disc-table').innerHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;">
            <thead><tr>
                <th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${AZ};color:#FFFFFF;width:26%;"></th>
                ${TH(AZ, fmtGranLabel(anchorK, gran))}
                ${refs.map(r => TH(AZ, fmtGranLabel(r.k, gran)) + TH(CE, r.dl)).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
}

// ─── Average Discount Depth ────────────────────────────────────────────────────
let avgDiscChart = null;
const AVGDISC_SERIES_ON = {};
ALL_SERIES.forEach(s => { AVGDISC_SERIES_ON[s.key] = DEFAULT_ON.has(s.key); });
let avgDiscViewMode       = 'comparison';
let avgDiscCompChannel    = 'free';
let avgDiscBreakdownBrand = 'adidas';

function _avgDiscAccumulate(source, brandKey, catFilter, scope) {
    let rows;
    if      (source === 'olympikus') rows = (typeof RAW_AVGDISC_OLYMPIKUS !== 'undefined') ? RAW_AVGDISC_OLYMPIKUS : [];
    else if (source === 'mizuno')    rows = (typeof RAW_AVGDISC_MIZUNO    !== 'undefined') ? RAW_AVGDISC_MIZUNO    : [];
    else if (source === 'centauro')  rows = (typeof RAW_AVGDISC_CENTAURO  !== 'undefined') ? RAW_AVGDISC_CENTAURO.filter(r => r.brand === brandKey)  : [];
    else if (source === 'direct')    rows = (typeof RAW_AVGDISC_DIRECT    !== 'undefined') ? RAW_AVGDISC_DIRECT.filter(r => r.brand === brandKey)    : [];
    else if (source === 'netshoes')  rows = (typeof RAW_AVGDISC_NETSHOES  !== 'undefined') ? RAW_AVGDISC_NETSHOES.filter(r => r.brand === brandKey)  : [];
    else return new Map();
    const field  = scope === 'promo' ? 'avg_disc_promo' : 'avg_disc_all';
    const nField = scope === 'promo' ? 'n_disc' : 'n';
    const byWeek = new Map();
    for (const r of rows) {
        if (r.w > MAX_W) continue;
        if (catFilter && !catFilter.includes(r.cat)) continue;
        const v  = r[field];
        const wt = r[nField] != null ? r[nField] : r.n;
        if (v == null || !wt) continue;
        if (!byWeek.has(r.w)) byWeek.set(r.w, { sumV: 0, sumN: 0 });
        const e = byWeek.get(r.w);
        e.sumV += v * wt;
        e.sumN += wt;
    }
    return byWeek;
}

function computeAvgDiscWeeklyMap(source, brandKey, catFilter, scope) {
    const byWeek = _avgDiscAccumulate(source, brandKey, catFilter, scope);
    const result = new Map();
    for (const [w, { sumV, sumN }] of byWeek) {
        if (sumN > 0) result.set(w, Math.round(sumV / sumN * 10000) / 10000);
    }
    return result;
}

// Total = simple arithmetic mean of the 3 channel-level weighted means.
// See computeTotalWeekly for the grain-comparability rationale.
function computeTotalAvgDiscWeekly(brandId, sport, scope) {
    const maps = (BRAND_SERIES_KEYS[brandId] || []).map(k => {
        const s = SERIES_BY_KEY[k];
        if (!s) return new Map();
        return computeAvgDiscWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport), scope);
    });
    const allWeeks = new Set();
    maps.forEach(m => m.forEach((_, w) => allWeeks.add(w)));
    const result = new Map();
    for (const w of allWeeks) {
        const vals = maps.map(m => m.get(w));
        if (vals.some(v => v == null)) continue;
        result.set(w, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10000) / 10000);
    }
    return result;
}

function getAvgDiscWeeklyMap(s, sport, scope) {
    if (s._totalBrandId) return computeTotalAvgDiscWeekly(s._totalBrandId, sport, scope);
    return computeAvgDiscWeeklyMap(s.source, s.brandKey, getCatFilter(s.source, sport), scope);
}

function getAvgDiscActiveSeries(includeHidden) {
    let series;
    if (avgDiscViewMode === 'breakdown') {
        const channelSeries = (BRAND_SERIES_KEYS[avgDiscBreakdownBrand] || []).map((k, i) => {
            const s = SERIES_BY_KEY[k]; if (!s) return null;
            return { ...s, label: ['Website', 'Centauro', 'Netshoes'][i], color: CHANNEL_BREAKDOWN_COLORS[i], dash: [] };
        }).filter(Boolean);
        series = [...channelSeries, {
            key: avgDiscBreakdownBrand + '|total', label: 'Total',
            source: '_total', brandKey: '', color: '#344F75', dash: [], _totalBrandId: avgDiscBreakdownBrand,
        }];
    } else if (avgDiscCompChannel === 'free')     series = ALL_SERIES.filter(s => AVGDISC_SERIES_ON[s.key]);
    else if (avgDiscCompChannel === 'website')  series = ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey || s.source] || s.label }));
    else if (avgDiscCompChannel === 'netshoes') series = ALL_SERIES.filter(s => s.source === 'netshoes').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey] || s.label }));
    else if (avgDiscCompChannel === 'centauro') series = ALL_SERIES.filter(s => s.source === 'centauro').map(s => ({ ...s, label: BRAND_LABELS[s.brandKey.toLowerCase()] || BRAND_LABELS[s.brandKey] || s.label }));
    else series = BRAND_IDS.map(id => ({ key: id + '|total', label: BRAND_LABELS[id], source: '_total', brandKey: '', color: BRAND_COLOR[id], dash: [], _totalBrandId: id }));
    return includeHidden ? series : series.filter(s => !LEGEND_HIDDEN.avgdisc.has(s.key));
}

function buildAvgDiscSeriesPanel() {
    const panel = document.getElementById('avgdisc-series-panel');
    const groups = [
        { label: 'Website / Direct', keys: ALL_SERIES.filter(s => s.source === 'olympikus' || s.source === 'mizuno' || s.source === 'direct') },
        { label: 'Centauro',         keys: ALL_SERIES.filter(s => s.source === 'centauro') },
        { label: 'Netshoes',         keys: ALL_SERIES.filter(s => s.source === 'netshoes') },
    ];
    panel.innerHTML = groups.map(g => `
        <div style="font-size:10px;color:#9AA8BB;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;padding:6px 0 3px 0;">${g.label}</div>
        ${g.keys.map(s => `<label class="series-option"><input type="checkbox" ${AVGDISC_SERIES_ON[s.key] ? 'checked' : ''} onchange="onAvgDiscSeriesToggle('${s.key}')"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>${s.label}</label>`).join('')}
    `).join('');
    updateAvgDiscDropdownLabel();
}

function updateAvgDiscDropdownLabel() {
    const on = ALL_SERIES.filter(s => AVGDISC_SERIES_ON[s.key]);
    document.getElementById('avgdisc-series-trigger-label').textContent =
        on.length === 0 ? 'None selected' : on.length === 1 ? on[0].label : `${on.length} series selected`;
}

function toggleAvgDiscSeriesPanel() {
    const panel   = document.getElementById('avgdisc-series-panel');
    const trigger = document.getElementById('avgdisc-series-trigger');
    const isOpen  = panel.classList.contains('open');
    if (!isOpen) {
        const r = trigger.getBoundingClientRect();
        panel.style.top   = (r.bottom + 6) + 'px';
        panel.style.left  = r.left + 'px';
        panel.style.width = Math.max(r.width, 260) + 'px';
    }
    panel.classList.toggle('open', !isOpen);
}

function onAvgDiscSeriesToggle(key) {
    AVGDISC_SERIES_ON[key] = !AVGDISC_SERIES_ON[key];
    updateAvgDiscDropdownLabel();
    populateAvgDiscFromTo(document.getElementById('avgdisc-gran-select').value);
    buildAvgDiscAll();
}

document.addEventListener('click', e => {
    const trigger = document.getElementById('avgdisc-series-trigger');
    const panel   = document.getElementById('avgdisc-series-panel');
    if (trigger && panel && !trigger.contains(e.target) && !panel.contains(e.target))
        panel.classList.remove('open');
});

function buildAllAvgDiscPeriodKeys(gran) {
    const sport = document.getElementById('sport-filter').value;
    const scope = document.getElementById('avgdisc-scope').value;
    const weeks = new Set();
    getAvgDiscActiveSeries().forEach(s => { getAvgDiscWeeklyMap(s, sport, scope).forEach((_, w) => weeks.add(w)); });
    const sorted = [...weeks].sort();
    if (gran === 'weekly') return sorted.map(w => ({ key: w, label: fmtGranLabel(w, 'weekly') }));
    const seen = new Map();
    sorted.forEach(w => { const key = fmtGranKey(w, gran); if (!seen.has(key)) seen.set(key, w); });
    return [...seen.entries()].map(([key]) => ({ key, label: fmtGranLabel(key, gran) }));
}

function populateAvgDiscFromTo(gran) {
    const periods = buildAllAvgDiscPeriodKeys(gran);
    const fromSel = document.getElementById('avgdisc-from-select');
    const toSel   = document.getElementById('avgdisc-to-select');
    const prevFrom = fromSel.value, prevTo = toSel.value;
    fromSel.innerHTML = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    toSel.innerHTML   = periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    const keys = periods.map(p => p.key);
    if (keys.includes(prevFrom)) { fromSel.value = prevFrom; }
    else if (!prevFrom) { const def = gran === 'weekly' ? DEFAULT_FROM_WEEKLY : fmtGranKey(DEFAULT_FROM_WEEKLY, gran); fromSel.value = keys.includes(def) ? def : (keys.find(k => k >= def) || keys[0] || ''); }
    else { fromSel.value = keys[0] || ''; }
    toSel.value = keys.includes(prevTo) ? prevTo : keys[keys.length - 1] || '';
}

function onAvgDiscGranChange() {
    populateAvgDiscFromTo(document.getElementById('avgdisc-gran-select').value);
    buildAvgDiscAll();
}

function updateAvgDiscViewControls() {
    const isBreakdown = avgDiscViewMode === 'breakdown';
    const isFree      = avgDiscViewMode === 'comparison' && avgDiscCompChannel === 'free';
    document.getElementById('avgdisc-comp-channel-block').style.display    = isBreakdown ? 'none' : '';
    document.getElementById('avgdisc-breakdown-brand-block').style.display = isBreakdown ? '' : 'none';
    document.getElementById('avgdisc-series-trigger-block').style.display  = isFree ? '' : 'none';
}

function onAvgDiscViewModeChange() {
    avgDiscViewMode = document.getElementById('avgdisc-view-mode').value;
    updateAvgDiscViewControls();
    populateAvgDiscFromTo(document.getElementById('avgdisc-gran-select').value);
    buildAvgDiscAll();
}

function onAvgDiscCompChannelChange() {
    avgDiscCompChannel = document.getElementById('avgdisc-comp-channel').value;
    updateAvgDiscViewControls();
    populateAvgDiscFromTo(document.getElementById('avgdisc-gran-select').value);
    buildAvgDiscAll();
}

function onAvgDiscBreakdownBrandChange() {
    avgDiscBreakdownBrand = document.getElementById('avgdisc-breakdown-brand').value;
    populateAvgDiscFromTo(document.getElementById('avgdisc-gran-select').value);
    buildAvgDiscAll();
}

function buildAvgDiscLegend() {
    document.getElementById('avgdisc-legend').innerHTML = getAvgDiscActiveSeries(true)
        .map(s => {
            const cls = LEGEND_HIDDEN.avgdisc.has(s.key) ? 'chart-legend-item legend-hidden' : 'chart-legend-item';
            return `<span class="${cls}" onclick="toggleLegendSeries('avgdisc', '${s.key}')">${makeDashSwatch(s.color, s.dash)}${s.label}</span>`;
        }).join('');
}

function buildAvgDiscChart() {
    const sport = document.getElementById('sport-filter').value;
    const scope = document.getElementById('avgdisc-scope').value;
    const gran  = document.getElementById('avgdisc-gran-select').value;
    const fromK = document.getElementById('avgdisc-from-select').value;
    const toK   = document.getElementById('avgdisc-to-select').value;
    const activeSeries = getAvgDiscActiveSeries();
    const allKeys = new Set();
    const seriesPairs = activeSeries.map(s => {
        const pairs = aggregatePairs(mapToSortedPairs(getAvgDiscWeeklyMap(s, sport, scope)), gran);
        pairs.forEach(([k]) => allKeys.add(k));
        return { s, pairs };
    });
    const sortedKeys = [...allKeys].sort().filter(k => (!fromK || k >= fromK) && (!toK || k <= toK));
    const allVals = seriesPairs.flatMap(({ pairs }) => pairs.map(([k, v]) => sortedKeys.includes(k) ? v : null)).filter(v => v != null && isFinite(v));
    const dataMin = allVals.length ? Math.min(...allVals) : 0;
    const dataMax = allVals.length ? Math.max(...allVals) : 1;
    const range   = (dataMax - dataMin) || dataMax || 0.1;
    const roughStep = range / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const multipliers = [1, 2, 2.5, 5, 10];
    let yStep = magnitude * multipliers[multipliers.length - 1];
    for (const m of multipliers) { const ms = magnitude * m; if (ms >= roughStep) { yStep = ms; break; } }
    const yMin = Math.max(0, Math.floor((dataMin - range * 0.02) / yStep) * yStep);
    const yMax = Math.min(1, Math.ceil((dataMax  + range * 0.02) / yStep) * yStep);
    const datasets = seriesPairs.map(({ s, pairs }) => {
        const pm = new Map(pairs);
        return { label: s.label, data: sortedKeys.map(k => pm.get(k) ?? null), borderColor: s.color, backgroundColor: s.color, borderWidth: 2.5, borderDash: s.dash, tension: 0.28, pointRadius: 0, pointHoverRadius: 0, spanGaps: false, fill: false };
    });
    if (avgDiscChart) { avgDiscChart.destroy(); avgDiscChart = null; }
    const canvas = document.getElementById('avgdisc-chart');
    if (!canvas) return;
    avgDiscChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: sortedKeys.map(k => fmtGranLabel(k, gran)), datasets },
        plugins: [priceLabelPlugin, extendedAxisPlugin],
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
                    bodyFont: { size: 12, family: 'Verdana' },
                    borderWidth: 0, displayColors: true, boxWidth: 10, boxHeight: 10,
                    callbacks: { label: ctx => { const v = ctx.parsed.y; return ` ${ctx.dataset.label}: ${v == null ? '—' : Math.round(v * 100) + '%'}`; } }
                }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false },
                     ticks: { color: '#667D99', font: { size: 9, family: 'Verdana', weight: 'normal' }, minRotation: 90, maxRotation: 90, autoSkip: true, maxTicksLimit: 52 } },
                y: { display: true, min: yMin, max: yMax, grid: { display: false },
                     border: { display: true, color: '#CCD4DD', width: 1 },
                     ticks: { color: '#667D99', font: { size: 11, family: 'Verdana', weight: 'normal' }, stepSize: yStep, padding: 10, callback: v => Math.round(v * 100) + '%' } }
            }
        }
    });
    avgDiscChart.$pillFmt = v => Math.round(v * 100) + '%';
    avgDiscChart.$ecomExtendedAxis = true;
    avgDiscChart.update('none');
}

function buildAvgDiscTable() {
    const sport = document.getElementById('sport-filter').value;
    const scope = document.getElementById('avgdisc-scope').value;
    const gran  = document.getElementById('avgdisc-gran-select').value;
    const toK   = document.getElementById('avgdisc-to-select').value;
    const activeSeries = getAvgDiscActiveSeries();
    if (!activeSeries.length) { document.getElementById('avgdisc-table').innerHTML = ''; return; }
    const seriesData = activeSeries.map(s => {
        const agg    = aggregatePairs(mapToSortedPairs(getAvgDiscWeeklyMap(s, sport, scope)), gran);
        const capped = toK ? agg.filter(([k]) => k <= toK) : agg;
        const pairMap = new Map(capped.map(([k, v, cnt]) => [k, { v, cnt }]));
        return { s, pairMap, pairs: capped };
    });
    let anchorK = '';
    seriesData.forEach(({ pairs }) => { if (pairs.length) { const k = pairs[pairs.length - 1][0]; if (k > anchorK) anchorK = k; } });
    if (!anchorK) { document.getElementById('avgdisc-table').innerHTML = ''; return; }
    function shiftKey(key, n) {
        if (gran === 'weekly')    { const d = weekToDate(key); d.setDate(d.getDate() - n * 7); return d.toISOString().slice(0, 10); }
        if (gran === 'monthly')   { const [y, m] = key.split('-').map(Number); let nm = m - n, ny = y; while (nm <= 0) { nm += 12; ny--; } return `${ny}-${String(nm).padStart(2, '0')}`; }
        if (gran === 'quarterly') { const [y, q] = key.split('-Q').map(Number); let nq = q - n, ny = y; while (nq <= 0) { nq += 4; ny--; } return `${ny}-Q${nq}`; }
        return String(parseInt(key) - n);
    }
    const refs =
        gran === 'weekly'    ? [{ k: shiftKey(anchorK, 1), dl: 'Δ WoW' }, { k: shiftKey(anchorK, 4), dl: 'Δ MoM' }, { k: shiftKey(anchorK, 52), dl: 'Δ YoY' }] :
        gran === 'monthly'   ? [{ k: shiftKey(anchorK, 1), dl: 'Δ MoM' }, { k: shiftKey(anchorK, 12), dl: 'Δ YoY' }] :
        gran === 'quarterly' ? [{ k: shiftKey(anchorK, 1), dl: 'Δ QoQ' }, { k: shiftKey(anchorK, 4),  dl: 'Δ YoY' }] :
                               [{ k: shiftKey(anchorK, 1), dl: 'Δ YoY' }];
    const AZ = C.azulEscuro, CE = '#FF5B76';
    const TH = (bg, txt) => `<th style="padding:12px 12px;text-align:center;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${bg};color:#FFFFFF;">${txt}</th>`;
    const pctCell = entry => {
        const v = entry?.v ?? null;
        const mark = entry ? thinMark(entry.cnt, gran) : '';
        return `<td style="padding:14px 12px;border-bottom:1px solid #EBEBEB;text-align:center;color:${C.azulEscuro};font-weight:700;font-family:Verdana,Geneva,sans-serif;">${v != null ? Math.round(v * 100) + '%' + mark : '—'}</td>`;
    };
    const ppBadge = (curr, ref) => {
        if (curr == null || ref == null) return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge delta-neu">—</span></td>`;
        const d = (curr - ref) * 100, sign = d >= 0 ? '+' : '';
        const cls = d > 0.05 ? 'delta-neg' : d < -0.05 ? 'delta-pos' : 'delta-neu';
        return `<td style="padding:10px 8px;border-bottom:1px solid #EBEBEB;text-align:center;"><span class="delta-badge ${cls}">${sign}${d.toFixed(1)} pp</span></td>`;
    };
    const rows = seriesData.map(({ s, pairMap }) => {
        const currEntry = pairMap.get(anchorK) ?? null;
        const curr = currEntry?.v ?? null;
        const dot  = `<span style="display:inline-block;width:10px;height:10px;background:${s.color};margin-right:10px;vertical-align:middle;"></span>`;
        return `<tr><td style="padding:14px 16px;border-bottom:1px solid #EBEBEB;font-weight:700;color:${C.azulEscuro};font-family:Verdana,Geneva,sans-serif;">${dot}${s.label}</td>${pctCell(currEntry)}${refs.map(r => { const e = pairMap.get(r.k) ?? null; return pctCell(e) + ppBadge(curr, e?.v ?? null); }).join('')}</tr>`;
    }).join('');
    document.getElementById('avgdisc-table').innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Verdana,Geneva,sans-serif;"><thead><tr><th style="padding:12px 16px;text-align:left;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;background:${AZ};color:#FFFFFF;width:26%;"></th>${TH(AZ, fmtGranLabel(anchorK, gran))}${refs.map(r => TH(AZ, fmtGranLabel(r.k, gran)) + TH(CE, r.dl)).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildAvgDiscAll() {
    buildAvgDiscLegend();
    buildAvgDiscChart();
    buildAvgDiscTable();
}

// ─── Render all ───────────────────────────────────────────────────────────────
// Expose plugins so external chart scripts (passthrough-chart.js) can reuse them.
window.priceLabelPlugin   = priceLabelPlugin;
window.extendedAxisPlugin = extendedAxisPlugin;

function renderAll() {
    document.getElementById('sport-desc').textContent = SPORT_DESC[document.getElementById('sport-filter').value];
    buildPriceLegend();
    buildPriceChart();
    buildPriceTable();
    buildDiscAll();
    buildAvgDiscAll();
    if (window._frRender) window._frRender();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// ─── Tab integration ──────────────────────────────────────────────────────────
window._ecomDestroy = function() {
    if (typeof priceChart   !== 'undefined' && priceChart)   { try { priceChart.destroy();   } catch(e){} priceChart   = null; }
    if (typeof discChart    !== 'undefined' && discChart)    { try { discChart.destroy();    } catch(e){} discChart    = null; }
    if (typeof avgDiscChart !== 'undefined' && avgDiscChart) { try { avgDiscChart.destroy(); } catch(e){} avgDiscChart = null; }
    if (window.frChart)  { try { window.frChart.destroy(); } catch(e){} }
};

window._ecomInit = function() {
    buildSeriesPanel();
    updateViewControls();
    populateFromTo('weekly');
    buildDiscSeriesPanel();
    updateDiscViewControls();
    populateDiscFromTo('weekly');
    buildAvgDiscSeriesPanel();
    updateAvgDiscViewControls();
    populateAvgDiscFromTo('weekly');
    renderAll();
    // _frInit handles both: data already loaded → renders immediately; still loading → polls
    if (window._frInit) window._frInit();
};

})(); // end IIFE — isolates all top-level const/let from sports-retail-dashboard.html inline script
