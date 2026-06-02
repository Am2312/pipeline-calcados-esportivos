# Regras do projeto — Sports Retail Dashboard + Apresentação Vulcabras

> Este arquivo é lido automaticamente por qualquer sessão do Claude Code neste repo.
> **Leia antes de mexer em gráficos.** O objetivo é manter o **dashboard** e a
> **apresentação Vulcabras** SEMPRE em sincronia (mesma "receita única").

## 🎯 REGRA DE OURO — gráficos novos ou alterados

**Todo gráfico mora no ÍNDICE COMPARTILHADO `docs/charts-registry.js`.** Ele é servido
pela nuvem (GitHub Pages) e lido pelos DOIS lados: o dashboard (`docs/sports-retail-dashboard.html`)
**e** a apresentação (`presentation-v2.html`, no Google Drive). Declarar 1 vez → aparece nos dois.

- ✅ **Adicionar/alterar um gráfico = editar `docs/charts-registry.js`** (use `registerChart({...})`;
  o contrato está documentado no topo do arquivo). Se o gráfico tem dados/config que poderiam
  divergir, ponha esses dados num `window.XXX` no registry e faça os dois lados consumirem dali
  (ex. já feitos: `window.COST_INDEX`, `window.SPORTSWEAR_TAM`, `window.CAGED_RAIS_2019_BASE`, `window.MS_PALETTE`).
- ❌ **NUNCA** escrever a lógica de um gráfico "solto" inline no `sports-retail-dashboard.html`
  sem registrá-la no índice — isso quebra a sincronia (o gráfico não aparece na apresentação).
- ❌ **NUNCA** manter cópia divergente de dados/config nos dois lados. Centralize no registry.

## ⚠️ Gotchas (já resolvidos — não reintroduzir)

1. **ID de canvas fixo → slide em branco.** Gráficos que desenham via `getElementById(id fixo)`
   colidem quando o mesmo gráfico está em 2+ slides. **Sempre** use `regClaimId(canvas, 'id')`
   (helper no `charts-registry.js`) em vez de `canvas.id = 'id'` no `desenhar`.
2. **Cache.** A apresentação carrega o registry com `?cb=Date.now()` (cache-bust) pra que
   Recarregar/🔄 Atualizar sempre pegue a versão nova. Mantenha assim.
3. **file://.** A apresentação NÃO funciona aberta com 2 cliques (origem `file://` bloqueia
   carregamentos). Abrir via servidor local — há o `Abrir Apresentacao.bat` na pasta do Drive.

## ✔️ Antes de dar como pronto

1. Testar **os dois lados** localmente (dashboard via servidor em `docs/`; apresentação via servidor
   na pasta do Drive). Confirmar que o gráfico desenha e o console está limpo.
2. Para a apresentação refletir mudanças do registry: **publicar** = `git push` na `main`
   (GitHub Pages publica `docs/` sozinho). A apresentação lê o registry da nuvem.
3. Rede de segurança: baselines em `…/2026.06/_BASELINE_*` + `git revert` se algo quebrar ao vivo.

## 📍 Arquivos-chave
- `docs/charts-registry.js` — índice compartilhado (a "lista mestra"). Contrato no topo.
- `docs/sports-retail-dashboard.html` — dashboard live (GitHub Pages).
- `docs/ecom-chart.js`, `docs/franchise-chart.js` — módulos de e-commerce (a apresentação carrega ESTES da nuvem; manter superset que serve aos dois).
- Apresentação (Drive): `…/Vulcabras/5. Constellation Presentations/1. Investment Committee/2026.06/presentation-v2.html` + handoffs `HANDOFF_SINGLE_RECIPE_CHARTS.md` / `HANDOFF_CHARTS_REGISTRY_MISSION.md`.
