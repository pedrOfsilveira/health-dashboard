<script>
  import { auth, goals, profile, navigate } from './stores.svelte.js';
  import { callGeneratePlan, fetchMealPlan, fetchMealsWithItems, deleteMealPlanEntry } from './supabase.js';
  import Header from './Header.svelte';

  const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const MEAL_LABELS = { breakfast: 'Café', lunch: 'Almoço', snack: 'Lanche', dinner: 'Jantar' };
  const MEAL_ICONS = { breakfast: '☕', lunch: '🍽️', snack: '🍎', dinner: '🌙' };

  let plan = $state(null);
  let loading = $state(true);
  let generating = $state(false);
  let error = $state('');
  let selectedDay = $state(0);
  let showShopping = $state(false);
  let weekStart = $state(getMonday(new Date()));

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
  }

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    weekStart = d.toISOString().split('T')[0];
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    weekStart = d.toISOString().split('T')[0];
  }

  let dayEntries = $derived.by(() => {
    if (!plan?.entries) return [];
    return plan.entries.filter(e => e.day_of_week === selectedDay);
  });

  let dayTotals = $derived.by(() => {
    let kcal = 0, ptn = 0, carb = 0, fat = 0;
    for (const e of dayEntries) {
      kcal += e.kcal || 0;
      ptn += e.ptn || 0;
      carb += e.carb || 0;
      fat += e.fat || 0;
    }
    return { kcal, ptn: Math.round(ptn), carb: Math.round(carb), fat: Math.round(fat) };
  });

  let shoppingList = $derived.by(() => {
    if (!plan?.entries) return [];
    const map = {};
    for (const entry of plan.entries) {
      if (entry.ingredients && Array.isArray(entry.ingredients)) {
        for (const ing of entry.ingredients) {
          const key = (ing.name || '').toLowerCase().trim();
          if (!key) continue;
          if (!map[key]) map[key] = { name: ing.name, qty: ing.qty || '', unit: ing.unit || '' };
          else {
            // Try to accumulate quantities
            const existing = parseFloat(map[key].qty) || 0;
            const add = parseFloat(ing.qty) || 0;
            if (existing && add && map[key].unit === ing.unit) {
              map[key].qty = String(existing + add);
            }
          }
        }
      }
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  });

  async function loadPlan() {
    loading = true;
    error = '';
    try {
      const userId = auth.session?.user?.id;
      if (!userId) return;
      plan = await fetchMealPlan(userId, weekStart);
    } catch (e) {
      error = 'Erro ao carregar plano: ' + e.message;
    } finally {
      loading = false;
    }
  }

  async function generate() {
    generating = true;
    error = '';
    try {
      const userId = auth.session?.user?.id;
      if (!userId) return;

      // Get meal history for AI context
      let mealHistory = [];
      try {
        mealHistory = await fetchMealsWithItems(userId);
      } catch { /* ignore */ }

      const result = await callGeneratePlan(
        weekStart,
        { kcal: goals.kcal, ptn: goals.ptn, carb: goals.carb, fat: goals.fat },
        {},
        profile.data?.health_conditions || '',
        mealHistory.slice(-50)
      );

      if (result.success) {
        await loadPlan();
      } else {
        error = result.error || 'Erro ao gerar plano';
      }
    } catch (e) {
      error = 'Falha na geração: ' + e.message;
    } finally {
      generating = false;
    }
  }

  async function removeEntry(entryId) {
    try {
      await deleteMealPlanEntry(entryId);
      if (plan?.entries) {
        plan.entries = plan.entries.filter(e => e.id !== entryId);
      }
    } catch (e) {
      error = 'Erro ao remover: ' + e.message;
    }
  }

  // Load plan whenever weekStart changes
  $effect(() => {
    weekStart; // track
    loadPlan();
  });
</script>

<div class="max-w-lg mx-auto px-4 pb-32 w-full overflow-hidden">
  <Header />

  <!-- Back + Title -->
  <div class="flex items-center gap-3 mb-6">
    <button onclick={() => navigate('dashboard')} aria-label="Voltar" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
    </button>
    <div>
      <h2 class="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">Plano Semanal</h2>
      <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Alimentação planejada por IA</p>
    </div>
  </div>

  <!-- Week Navigator -->
  <div class="flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl p-3 mb-4 border border-slate-200 dark:border-slate-700 shadow-sm">
    <button onclick={prevWeek} aria-label="Semana anterior" class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
    </button>
    <div class="text-center min-w-0 flex-1">
      <p class="text-xs font-black text-slate-900 dark:text-slate-100 truncate">Semana de {new Date(weekStart + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</p>
      <p class="text-[9px] text-slate-400 font-medium">{weekStart}</p>
    </div>
    <button onclick={nextWeek} aria-label="Próxima semana" class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
    </div>
  {:else if !plan}
    <!-- No plan — prompt to generate -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
      <div class="text-5xl mb-4">🗓️</div>
      <h3 class="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">Nenhum plano para esta semana</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
        A IA vai criar um plano alimentar personalizado baseado nas suas metas
        ({goals.kcal} kcal, {goals.ptn}g ptn) e nos seus hábitos alimentares.
      </p>
      <button
        onclick={generate}
        disabled={generating}
        class="w-full py-3.5 bg-emerald-500 text-white rounded-2xl font-black text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {#if generating}
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          Gerando plano...
        {:else}
          ✨ Gerar Plano Semanal
        {/if}
      </button>
      {#if error}
        <p class="text-xs text-red-500 dark:text-red-400 mt-3">{error}</p>
      {/if}
    </div>
  {:else}
    <!-- Day tabs -->
    <div class="grid grid-cols-7 gap-1 mb-4">
      {#each DAY_NAMES as name, i}
        <button
          onclick={() => selectedDay = i}
          class="py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-center {selectedDay === i ? 'bg-emerald-500 text-white shadow-md' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}"
        >
          {name.substring(0, 3)}
        </button>
      {/each}
    </div>

    <!-- Day summary -->
    <div class="grid grid-cols-4 gap-2 mb-4">
      <div class="bg-white dark:bg-slate-800 rounded-xl p-2.5 text-center border border-slate-200 dark:border-slate-700">
        <p class="text-sm font-black text-slate-900 dark:text-slate-100">{dayTotals.kcal}</p>
        <p class="text-[8px] font-bold text-slate-400 uppercase">kcal</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center border border-emerald-200 dark:border-emerald-800">
        <p class="text-sm font-black text-emerald-700 dark:text-emerald-400">{dayTotals.ptn}g</p>
        <p class="text-[8px] font-bold text-slate-400 uppercase">ptn</p>
      </div>
      <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2.5 text-center border border-amber-200 dark:border-amber-800">
        <p class="text-sm font-black text-amber-700 dark:text-amber-400">{dayTotals.carb}g</p>
        <p class="text-[8px] font-bold text-slate-400 uppercase">carb</p>
      </div>
      <div class="bg-red-50 dark:bg-red-900/20 rounded-xl p-2.5 text-center border border-red-200 dark:border-red-800">
        <p class="text-sm font-black text-red-600 dark:text-red-400">{dayTotals.fat}g</p>
        <p class="text-[8px] font-bold text-slate-400 uppercase">gord</p>
      </div>
    </div>

    <!-- Meals list -->
    <div class="space-y-3 mb-6 min-h-[200px]">
      {#each dayEntries as entry (entry.id)}
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm transition-colors">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span class="text-lg flex-shrink-0">{MEAL_ICONS[entry.meal_type] || '🍽️'}</span>
              <div class="min-w-0">
                <p class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{MEAL_LABELS[entry.meal_type] || entry.meal_type}</p>
                <p class="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{entry.title}</p>
              </div>
            </div>
            <button onclick={() => removeEntry(entry.id)} class="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors" title="Remover">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {#if entry.description}
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-2 italic break-words">{entry.description}</p>
          {/if}

          <!-- Macro chips -->
          <div class="flex gap-2 mb-2 flex-wrap">
            <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg">{entry.kcal} kcal</span>
            <span class="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-lg">{Math.round(entry.ptn)}g ptn</span>
            <span class="text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg">{Math.round(entry.carb)}g carb</span>
            <span class="text-[10px] font-bold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg">{Math.round(entry.fat)}g gord</span>
          </div>

          <!-- Ingredients -->
          {#if entry.ingredients && entry.ingredients.length > 0}
            <div class="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2">
              <p class="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Ingredientes</p>
              <div class="flex flex-wrap gap-1">
                {#each entry.ingredients as ing}
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md max-w-full truncate">
                    {ing.qty}{ing.unit ? ' ' + ing.unit : ''} {ing.name}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="text-center py-8 text-slate-400 dark:text-slate-500">
          <p class="text-2xl mb-2">📭</p>
          <p class="text-xs font-bold">Nenhuma refeição para {DAY_NAMES[selectedDay]}</p>
        </div>
      {/each}
    </div>

    <!-- Actions -->
    <div class="flex gap-3 mb-4">
      <button
        onclick={() => showShopping = !showShopping}
        class="flex-1 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-bold text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
      >
        🛒 {showShopping ? 'Esconder' : 'Lista de Compras'}
      </button>
      <button
        onclick={generate}
        disabled={generating}
        class="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {#if generating}
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
        {:else}
          🔄
        {/if}
        Regenerar
      </button>
    </div>

    {#if error}
      <p class="text-xs text-red-500 dark:text-red-400 text-center mb-4">{error}</p>
    {/if}

    <!-- Shopping List -->
    {#if showShopping}
      <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm mb-6">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Lista de Compras</span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        </div>
        {#if shoppingList.length > 0}
          <div class="space-y-1.5">
            {#each shoppingList as item}
              <div class="flex items-center gap-2 py-1">
                <div class="w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-600 flex-shrink-0"></div>
                <span class="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{item.name}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500 font-medium flex-shrink-0">{item.qty} {item.unit}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-slate-400 text-center py-4">Nenhum ingrediente encontrado</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
