#!/usr/bin/env node
/* =====================================================================
   TRAVA DURA da "receita única" (dashboard ↔ apresentação Vulcabras).
   Roda no CI (.github/workflows/charts-registry-check.yml) a cada push.
   Falha (exit 1) se alguém quebrar o padrão — protege contra regressão
   feita por outra sessão/edição. Regras completas: CLAUDE.md (raiz).
   Só lê texto dos arquivos do repo (sem browser, sem dependências).
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const fails = [];
const oks = [];
function check(cond, msgOk, msgFail) {
  if (cond) oks.push('  ✓ ' + msgOk);
  else fails.push('  ✗ ' + msgFail);
}

let registry = '', dash = '', ecom = '', franchise = '';
try {
  registry  = read('docs/charts-registry.js');
  dash      = read('docs/sports-retail-dashboard.html');
  ecom      = read('docs/ecom-chart.js');
  franchise = read('docs/franchise-chart.js');
} catch (e) {
  console.error('ERRO lendo arquivos do repo:', e.message);
  process.exit(2);
}

/* 1) Índice compartilhado: os 15 gráficos conhecidos precisam continuar registrados. */
const EXPECTED_IDS = [
  'footwear-decomp', 'brand-gmv', 'sector-data', 'imports-data', 'vulcabras-share',
  'tam-mercado', 'tam-destaque', 'market-share',
  'ecom-price', 'ecom-disc', 'ecom-avgdisc', 'ecom-franchise',
  'caged-jobs', 'headcount-volume', 'cost-index'
];
for (const id of EXPECTED_IDS) {
  check(new RegExp(`id:\\s*['"]${id}['"]`).test(registry),
    `gráfico "${id}" presente no índice`,
    `gráfico "${id}" SUMIU do charts-registry.js (removido?) — ele deixaria de existir no dashboard E na apresentação`);
}

/* 2) Bug do slide em branco: nada de canvas.id fixo; tem que usar regClaimId. */
check(!/canvas\.id\s*=\s*['"]/.test(registry),
  'nenhum "canvas.id = ..." cru no índice (usa regClaimId)',
  'há "canvas.id = ..." cru no charts-registry.js — reintroduz o bug de slide em branco com gráfico duplicado. Use regClaimId(canvas, "id")');
check(/window\.regClaimId\s*=\s*function/.test(registry),
  'helper regClaimId definido',
  'regClaimId NÃO está definido no charts-registry.js (necessário p/ ids fixos)');

/* 3) Dados/config centralizados no índice (receita única). */
const SHARED = ['window.COST_INDEX', 'window.SPORTSWEAR_TAM', 'window.CAGED_RAIS_2019_BASE', 'window.MS_PALETTE'];
for (const w of SHARED) {
  check(registry.includes(w + ' ='),
    `${w} definido no índice`,
    `${w} NÃO está definido no charts-registry.js (dado compartilhado removido?)`);
}

/* 4) Dashboard CONSOME o compartilhado (não voltou a hardcodar cópia divergente). */
check(/charts-registry\.js/.test(dash),
  'dashboard inclui charts-registry.js',
  'dashboard NÃO inclui charts-registry.js');
for (const w of SHARED) {
  check(dash.includes(w),
    `dashboard consome ${w}`,
    `dashboard NÃO referencia ${w} — provável reintrodução de cópia hardcoded (vai divergir da apresentação)`);
}

/* 5) Módulos que a apresentação carrega da nuvem precisam ter os builders por-gráfico. */
for (const fn of ['_ecomBuildPriceOnly', '_ecomBuildDiscOnly', '_ecomBuildAvgDiscOnly', '_ecomSetState']) {
  check(ecom.includes(fn),
    `ecom-chart.js expõe ${fn}`,
    `ecom-chart.js NÃO tem ${fn} — a apresentação (que carrega ESTE módulo da nuvem) quebra`);
}
check(franchise.includes('_frSetState'),
  'franchise-chart.js expõe _frSetState',
  'franchise-chart.js NÃO tem _frSetState — a apresentação quebra');

/* 6) PARIDADE DE CONTROLES: cada gráfico precisa expor no índice pelo menos
   tantas caixas seletoras quanto o dashboard tem. Pega o bug de "caixa que some
   silenciosamente" (foi o caso do Metric no imports-data e do Jobs Shift no
   headcount-volume). EXPECTED = nº de caixas do dashboard p/ cada gráfico.
   Conta <select> (montarControles) + entradas {key:...} (controles declarativos)
   dentro do bloco registerChart de cada id. Usa >= (adicionar caixa nunca falha;
   só falha se faltar). Ao mudar caixas no dashboard, atualize o número aqui. */
// NOTA: gráficos migrados para "lista única" (spec compartilhado lido pelos 2 lados,
// ex.: imports-data via window.IMPORTS_CONTROL_SPEC) saem deste manifesto — neles a
// divergência é impossível por construção (uma só definição) e a contagem estática
// de <select> não se aplica (as caixas são montadas em runtime a partir do array).
// Migrados p/ lista única (window.CONTROL_SPECS ou window.ECOM_SPECS) e portanto FORA
// deste manifesto: imports-data, caged-jobs, headcount-volume, vulcabras-share e os 4
// ecom (price/disc/avgdisc/franchise). Nesses, divergência é impossível por construção.
// Os de baixo ainda têm controles hardcoded em cada lado (contagem estática vale).
const EXPECTED_CONTROLS = {
  'footwear-decomp': 2, 'brand-gmv': 3, 'sector-data': 3,
  'tam-mercado': 2, 'tam-destaque': 0, 'market-share': 5, 'cost-index': 5
};
function chartBlocks(src) {
  const blocks = {};
  const idxs = [];
  const re = /registerChart\(\{/g;
  let m;
  while ((m = re.exec(src))) idxs.push(m.index);
  for (let i = 0; i < idxs.length; i++) {
    const seg = src.slice(idxs[i], i + 1 < idxs.length ? idxs[i + 1] : src.length);
    const idm = seg.match(/id:\s*['"]([^'"]+)['"]/);
    if (idm) blocks[idm[1]] = seg;
  }
  return blocks;
}
const _blocks = chartBlocks(registry);
for (const [id, exp] of Object.entries(EXPECTED_CONTROLS)) {
  const seg = _blocks[id] || '';
  const count = (seg.match(/<select/g) || []).length + (seg.match(/\bkey:\s*['"]/g) || []).length;
  check(count >= exp,
    `controles de "${id}" presentes (${count}/${exp})`,
    `gráfico "${id}" expõe só ${count} caixa(s) de controle no índice, esperado >= ${exp} (paridade com o dashboard) — um seletor sumiu/faltou. Veja montarControles/controles do "${id}" no charts-registry.js`);
}

/* 7) Motor de controles compartilhado precisa continuar existindo e ligado nos 2 lados. */
for (const fn of ['CONTROL_SPECS', 'regDashBoxes', 'regPresBoxes', 'ECOM_SPECS', 'ecomDashControlBar', 'ecomPresControlBar']) {
  check(registry.includes('window.' + fn),
    `registry define window.${fn}`,
    `charts-registry.js NÃO define window.${fn} — o motor de "lista única" de controles quebrou (dashboard/PPT divergem)`);
}
check(dash.includes('ecomDashControlBar'),
  'dashboard usa ecomDashControlBar (controles ecom da lista única)',
  'dashboard NÃO chama ecomDashControlBar — voltou a hardcodar os controles do e-commerce (vai divergir do PPT)');
for (const key of ['price', 'disc', 'avgdisc', 'franchise']) {
  check(new RegExp('\\n\\s*' + key + ':\\s*\\[').test(registry),
    `ECOM_SPECS tem "${key}"`,
    `ECOM_SPECS NÃO tem "${key}" — card de e-commerce perdeu a lista única`);
}

/* ---- resultado ---- */
console.log('\n=== Receita Única — verificação ===');
oks.forEach((l) => console.log(l));
if (fails.length) {
  console.log('\nFALHAS:');
  fails.forEach((l) => console.log(l));
  console.log(`\n${fails.length} falha(s). Veja CLAUDE.md (raiz) p/ a regra. Gráficos vão no charts-registry.js.\n`);
  process.exit(1);
}
console.log(`\nOK — ${oks.length} verificações passaram. Receita única íntegra.\n`);
