<script>
  import { onMount } from 'svelte';
  import { parseHealthLog } from './lib/parser';
  import './app.css';

  let data = $state(null);
  let loading = $state(true);

  // O conteúdo do log é injetado aqui pelo parser para facilitar a visualização inicial
  const rawLog = `# Sleep & Nutrition Log
2026-02-05 | sleep: deitei 01:11 -> acordou 09:59; quality: boa; wakes: 0;
2026-02-05 | nutrition: 
- Almoço — marmita com massa alho e óleo, carne acebolada e batata frita. Est. calorias: 1550 kcal; proteína estimada: 65 g.
- Sobremesa — Pote de sorvete (85 g) + 1 rapadura de amendoim. Est. calorias: 375 kcal; proteína estimada: 6 g.
- Jantar — "Pancho" grande. Est. calorias: 725 kcal; proteína estimada: 28 g.
Resumo diário (2026-02-05 - estimado):
- Calorias totais aproximadas: 2.650 kcal (Meta: 2.914)
- Proteína total aproximada: 99 g (Meta: 124 g)
2026-02-05 | notes: usuário informou estar gripado e o descanso prolongado (quase 9 horas) foi uma escolha excelente para a sua imunidade.`;

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
</script>

<main class="min-h-screen bg-white font-sans text-slate-900 selection:bg-emerald-100">
  <div class="mx-auto max-w-2xl px-4 py-8 md:py-12">
    {#if loading}
      <div class="flex h-64 items-center justify-center">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    {:else if data}
      <!-- Header -->
      <header class="mb-10 flex flex-col justify-between border-b-2 border-slate-100 pb-6 sm:flex-row sm:items-end">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Relatório de Saúde</h1>
          <p class="mt-1 text-slate-500 first-letter:uppercase">{formatDate(data.date)}</p>
        </div>
        <div class="mt-4 text-left sm:mt-0 sm:text-right">
          <p class="text-[10px] font-bold tracking-widest text-slate-400 uppercase">PREPARADO POR ALFRED</p>
        </div>
      </header>

      <!-- Overview Cards -->
      <div class="mb-10 grid gap-4 sm:grid-cols-2">
        <!-- Nutrition Card -->
        <section class="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
          <h2 class="mb-4 border-l-4 border-emerald-500 pl-3 text-xs font-bold tracking-wider text-slate-600 uppercase">Consumo Total</h2>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-2xl font-bold text-slate-900">{data.nutrition.total.kcal} <span class="text-sm font-normal text-slate-400">kcal</span></p>
              <p class="text-xs text-slate-500">Meta: {data.nutrition.total.metaKcal} kcal</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold text-slate-900">{data.nutrition.total.ptn} <span class="text-sm font-normal text-slate-400">g</span></p>
              <p class="text-xs text-slate-500">Meta: {data.nutrition.total.metaPtn} g Ptn</p>
            </div>
          </div>
          <div class="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div class="h-full rounded-full bg-emerald-500 transition-all duration-500" style="width: {Math.min(100, (data.nutrition.total.kcal / data.nutrition.total.metaKcal) * 100)}%"></div>
          </div>
        </section>

        <!-- Sleep Card -->
        <section class="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
          <h2 class="mb-4 border-l-4 border-blue-500 pl-3 text-xs font-bold tracking-wider text-slate-600 uppercase">Sono e Repouso</h2>
          {#if data.sleep}
            <div class="mt-1">
              <p class="text-2xl font-bold text-slate-900">{data.sleep.duration}</p>
              <p class="mt-1 text-xs text-slate-500">{data.sleep.start} → {data.sleep.end} (Qualidade: {data.sleep.quality})</p>
            </div>
          {:else}
            <p class="text-sm text-slate-400">Dados não registrados</p>
          {/if}
        </section>
      </div>

      <!-- Meals -->
      <section class="mb-10">
        <h2 class="mb-4 border-l-4 border-emerald-500 pl-3 text-xs font-bold tracking-wider text-slate-600 uppercase">Registro de Refeições</h2>
        <div class="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {#each data.nutrition.meals as meal, i}
            <div class="border-b border-slate-50 px-5 py-4 last:border-0 {i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-900">{meal.name}</span>
                <div class="flex gap-2">
                  <span class="inline-block rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">~{meal.kcal} kcal</span>
                  <span class="inline-block rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-600">~{meal.ptn}g ptn</span>
                </div>
              </div>
              <p class="mt-1 text-sm leading-relaxed text-slate-500">{meal.desc}</p>
            </div>
          {/each}
        </div>
      </section>

      <!-- Butler Notes -->
      <section>
        <h2 class="mb-4 border-l-4 border-slate-400 pl-3 text-xs font-bold tracking-wider text-slate-600 uppercase">Observações do Mordomo</h2>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <p class="text-sm leading-relaxed italic text-slate-600">
            {#if data.notes.length > 0}
              "{data.notes.join(' ')}"
            {:else}
              "Nenhuma observação adicional para hoje, Senhor."
            {/if}
          </p>
        </div>
      </section>

      <footer class="mt-16 text-center">
        <p class="text-[10px] tracking-wide text-slate-400 uppercase">Relatório confidencial • {data.date}</p>
      </footer>
    {/if}
  </div>
</main>

<style>
  :global(body) {
    background-color: white;
  }
</style>
