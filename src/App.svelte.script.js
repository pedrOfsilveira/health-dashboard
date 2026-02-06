import { onMount } from 'svelte';
import { parseHealthLog } from './lib/parser';
import './app.css';

let data = $state(null);
let loading = $state(true);

// Carregar o conteúdo real do log
const rawLog = `# Sleep & Nutrition Log

This file stores daily entries created from WhatsApp user messages.

Format (one entry per line, ISO date prefix):
YYYY-MM-DD | sleep: {bed_time -> wake_time, quality, wakes} | nutrition: {meals descriptions, times, calories if known, water_ml} | weight: {kg} | notes: {any}

Entries:

2026-02-03 | treino_file_saved: /home/pedro/.clawdbot/media/inbound/17cdf96c-4b69-4962-a493-8c3c7e545a7f (workout CSV imported)
2026-02-03 | nutrition (detailed):
- 🍚 Almoço (estimativa): 4 colheres grandes de arroz branco (~280 kcal, 6 g proteína), 2 conchas grandes de feijão (~120 kcal, 8 g proteína), ~5 almôndegas fritas (≈300 kcal, 18 g proteína), salada de tomate cereja (~20 kcal). Total almoço ≈ 720 kcal — Proteína ≈ 32 g.
- 🍟 Lanche (snack): Pringles (porção pequena, estimativa) ≈ 150 kcal — Proteína ≈ 2 g.
- 🥤 Shake (corrigido, porção preparada): Hipercalórico Mass 25500 Premium (Body Nutry) — porção 150 g preparando com 400 ml de leite desnatado = 731 kcal, 34 g proteína (fonte: Body Nutry). Usuário adicionou 2 bananas extras (~200 kcal, ~2 g proteína). Total shake ≈ 931 kcal — Proteína ≈ 36 g. Fonte: https://www.bodynutry.ind.br/produtos/hipercaloricos/mass-25500-refil-3kg-chocolate-suico
- 🍽️ Jantar: 4 colheres grandes de arroz (~280 kcal, 6 g proteína) + ~3 conchas de strogonoff de frango (≈450 kcal, 30 g proteína). Total jantar ≈ 730 kcal — Proteína ≈ 36 g.

Resumen (sic)

2026-02-04 | lunch: Frango à milanesa 300–375 g (~67–82 g proteína, 600–825 kcal) = ~3 bifes médios; Arroz branco 2 xícaras cozidas (≈360 g) = ~6 colheres grandes; Feijão 1 concha grande (~200 kcal, 12–15 g proteína).
2026-02-04 | snack_shake: Shake hipercalórico + 400 ml leite + 2 bananas = 931 kcal; proteína ≈36 g. Registrado (dose completa tomada).
2026-02-04 | notes: usuário escolheu Opção A para refeição do dia. Registrado via WhatsApp.

Resumo diário (estimado, atualizado):
- Calorias totais aproximadas: 2.265 kcal (almoço midpoint 1.334 + shake 931)
- Proteína total aproximada: ~133 g (97 g almoço midpoint + 36 g shake)

2026-02-04 | notes: usuário informou estar gripado e não fará treino amanhã. (registrado)
2026-02-04 | no_train: Excluir 2026-02-04 da contagem de sesões desta semana (usuario gripado).
2026-02-04 | sleep: deitei 00:11 -> acordou 10:17; qualidade: boa; acordares: 0; weight: (não fornecido); notes: usuário não deseja enviar peso diariamente.

2026-02-05 | sleep: deitei 01:11 -> acordou 09:59; quality: boa; wakes: 0; water_ml: suficiente; weight: (não fornecido); notes: usuário pediu apagar arquivos do todo-pwa e svelte5-mcp; decidiu não retomar o projeto. (registrado: acordou cerca de 30 min antes da mensagem às 10:29).

2026-02-05 | nutrition: 
- Almoço — marmita com massa alho e óleo (porção generosa), carne acebolada (porção generosa) e batata frita. Est. calorias: 1.550 kcal; proteína estimada: 65 g.
- Lanche/Sobremesa — Pote de sorvete (85 g) + 1 rapadura de amendoim (tamanho médio). Est. calorias: 375 kcal; proteína estimada: 6 g.
- Jantar — "Pancho" grande (pão, salsicha, molho, queijo e bacon). Est. calorias: 725 kcal; proteína estimada: 28 g.

Resumo diário (2026-02-05 - estimado):
- Calorias totais aproximadas: 2.650 kcal (Meta: 2.914)
- Proteína total aproximada: 99 g (Meta: 124 g)
- Status: Déficit de ~25 g de proteína e ~260 kcal para atingir a meta.

Sugestões rápidas:
- Se ainda tiver apetite, um copo de leite ou um iogurte antes de dormir ajudaria a fechar a meta de proteína.

Notes:
- Valores do hipercalórico verificados na ficha do fabricante (Mass 25500 Premium, Body Nutry). Salvado a pedido do usuário.`;

onMount(() => {
  data = parseHealthLog(rawLog);
  loading = false;
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
}
