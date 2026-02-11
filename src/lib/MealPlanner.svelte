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
  let generateProgress = $state('');
  let checkedItems = $state({});

  // Load checked items from localStorage
  function loadCheckedItems() {
    try {
      const stored = localStorage.getItem(`shopping-checked-${weekStart}`);
      checkedItems = stored ? JSON.parse(stored) : {};
    } catch { checkedItems = {}; }
  }

  function toggleItem(category, itemName) {
    const key = `${category}::${itemName}`;
    checkedItems = { ...checkedItems, [key]: !checkedItems[key] };
    try {
      localStorage.setItem(`shopping-checked-${weekStart}`, JSON.stringify(checkedItems));
    } catch { /* ignore */ }
  }

  function isItemChecked(category, itemName) {
    return !!checkedItems[`${category}::${itemName}`];
  }

  function checkedCount() {
    return Object.values(checkedItems).filter(Boolean).length;
  }

  function totalItems() {
    if (!plan?.shoppingList) return 0;
    return Object.values(plan.shoppingList).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
  }

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

  function normalizeHealthConditions(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(c => c.trim()).filter(Boolean);
    return String(raw)
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
  }

  const healthRules = [
    {
      label: 'Gastrite/Refluxo',
      match: ['gastrite', 'refluxo', 'azia'],
      avoid: ['café', 'pimenta', 'frit', 'frito', 'fritura', 'álcool', 'tomate', 'cítrico', 'laranja', 'limão', 'chocolate', 'refrigerante'],
      tip: 'Prefira refeições leves e pouco ácidas.',
    },
    {
      label: 'Lactose',
      match: ['lactose', 'intolerância à lactose', 'intolerancia a lactose'],
      avoid: ['leite', 'queijo', 'iogurte', 'creme', 'manteiga', 'requeijão'],
      tip: 'Opte por versões sem lactose.',
    },
    {
      label: 'Glúten',
      match: ['glúten', 'gluten', 'celíaco', 'celiaco'],
      avoid: ['trigo', 'pão', 'massa', 'macarrão', 'farinha', 'bolo', 'biscoito'],
      tip: 'Use opções sem glúten (arroz, batata, milho).',
    },
  ];

  function buildPlanHealthWarnings(planData, rawConditions) {
    const conditions = normalizeHealthConditions(rawConditions).map(c => c.toLowerCase());
    if (!planData?.entries || conditions.length === 0) return [];
    const activeRules = healthRules.filter(rule =>
      conditions.some(c => rule.match.some(m => c.includes(m)))
    );
    if (activeRules.length === 0) return [];

    const ingredients = [];
    for (const entry of planData.entries) {
      for (const ing of entry.ingredients || []) {
        if (ing.name) ingredients.push(ing.name.toLowerCase());
      }
    }

    return activeRules.map(rule => {
      const hits = rule.avoid.filter(a => ingredients.some(i => i.includes(a)));
      return {
        label: rule.label,
        hits: hits.slice(0, 4),
        tip: rule.tip,
      };
    });
  }

  let planHealthWarnings = $derived.by(() => buildPlanHealthWarnings(plan, profile.data?.health_conditions));



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
    generateProgress = 'Preparando dados...';
    try {
      const userId = auth.session?.user?.id;
      if (!userId) return;

      // Get meal history for AI context
      let mealHistory = [];
      try {
        generateProgress = 'Carregando histórico alimentar...';
        mealHistory = await fetchMealsWithItems(userId);
      } catch { /* ignore */ }

      generateProgress = 'Gerando plano com IA (isso pode levar até 2 minutos)...';
      const result = await callGeneratePlan(
        weekStart,
        { kcal: goals.kcal, ptn: goals.ptn, carb: goals.carb, fat: goals.fat },
        {},
        profile.data?.health_conditions || '',
        mealHistory.slice(-50)
      );

      if (result.success) {
        generateProgress = 'Carregando plano...';
        await loadPlan();
      } else {
        error = result.error || 'Erro ao gerar plano';
      }
    } catch (e) {
      error = 'Falha na geração: ' + e.message;
    } finally {
      generating = false;
      generateProgress = '';
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
    loadCheckedItems();
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
          ⏳ {generateProgress || 'Gerando plano...'}
        {:else}
          ✨ Gerar Plano Semanal
        {/if}
      </button>
      {#if generating && generateProgress}
        <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-3 text-center animate-pulse">{generateProgress}</p>
      {/if}
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

    {#if planHealthWarnings.length > 0}
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Condições de Saúde</span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        </div>
        <div class="space-y-2">
          {#each planHealthWarnings as warn}
            <div class="rounded-xl px-3 py-2 text-xs border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
              <p class="font-bold">{warn.label}</p>
              {#if warn.hits.length > 0}
                <p class="text-[10px]">Possíveis gatilhos: {warn.hits.join(', ')}.</p>
              {/if}
              <p class="text-[10px]">💡 {warn.tip}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

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
        {#if totalItems() > 0}
          <span class="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full ml-1">{checkedCount()}/{totalItems()}</span>
        {/if}
      </button>
      <button
        onclick={generate}
        disabled={generating}
        class="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {#if generating}
          ⏳
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
          {#if totalItems() > 0}
            <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{checkedCount()}/{totalItems()} ✓</span>
          {/if}
        </div>
        {#if plan?.shoppingList && Object.keys(plan.shoppingList).length > 0}
          {#each Object.entries(plan.shoppingList) as [category, items]}
            {#if Array.isArray(items) && items.length > 0}
              <h4 class="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-wider mt-4 mb-2 flex items-center gap-2">
                {#if category.includes('Carne') || category.includes('Proteína')}🥩
                {:else if category.includes('Latic') || category.includes('Ovo')}🥚
                {:else if category.includes('Grão') || category.includes('Massa') || category.includes('Pã')}🌾
                {:else if category.includes('Fruta')}🍎
                {:else if category.includes('Vegeta') || category.includes('Legume')}🥬
                {:else if category.includes('Óleo') || category.includes('Tempero')}🧂
                {:else if category.includes('Castanha') || category.includes('Semente')}🥜
                {:else}📦
                {/if}
                {category}
              </h4>
              <div class="space-y-1">
                {#each items as item}
                  {@const checked = isItemChecked(category, item.name)}
                  <button
                    onclick={() => toggleItem(category, item.name)}
                    class="flex items-center gap-3 py-2 px-2 w-full text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <div class="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all {checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600 group-hover:border-emerald-400'}">
                      {#if checked}
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {/if}
                    </div>
                    <span class="text-sm flex-1 min-w-0 truncate transition-all {checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}">{item.name}</span>
                    <span class="text-xs font-medium flex-shrink-0 transition-all {checked ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}">{item.qty} {item.unit}</span>
                  </button>
                {/each}
              </div>
            {/if}
          {/each}
        {:else}
          <p class="text-xs text-slate-400 text-center py-4">Nenhum ingrediente encontrado</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
