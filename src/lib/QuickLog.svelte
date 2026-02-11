<script>
  import { supabase } from './supabase.js';
  import { auth } from './stores.svelte.js';

  let { onLog = () => {} } = $props();

  let frequentMeals = $state([]);
  let loading = $state(true);
  let loadFailed = $state(false);

  async function loadFrequentMeals() {
    if (!auth.session?.user) return;
    loading = true;
    loadFailed = false;

    try {
      // Get all meals from last 30 days, count by name
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: meals, error } = await supabase
        .from('meals')
        .select('name, kcal, ptn, carb, fat, meal_items(name, kcal, ptn)')
        .eq('user_id', auth.session.user.id)
        .gte('date', dateStr)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Count frequency and calculate averages
      const mealMap = new Map();
      
      for (const meal of meals || []) {
        const key = meal.name.toLowerCase().trim();
        if (!mealMap.has(key)) {
          mealMap.set(key, {
            name: meal.name,
            count: 0,
            totalKcal: 0,
            totalPtn: 0,
            totalCarb: 0,
            totalFat: 0,
            ingredients: [], // Initialize ingredients array
          });
        }
        const entry = mealMap.get(key);
        entry.count++;
        entry.totalKcal += meal.kcal || 0;
        entry.totalPtn += meal.ptn || 0;
        entry.totalCarb += meal.carb || 0;
        entry.totalFat += meal.fat || 0;
        // Accumulate ingredients. Assuming meal.meal_items is an array.
        if (meal.meal_items && Array.isArray(meal.meal_items)) {
          entry.ingredients.push(...meal.meal_items);
        }
      }

      // Calculate averages and sort by frequency
      const processed = Array.from(mealMap.values())
        .map(m => {
          // Deduplicate ingredients by name and build a summary
          const ingredientMap = new Map();
          for (const ing of m.ingredients) {
            const key = (ing.name || '').toLowerCase().trim();
            if (!key) continue;
            if (!ingredientMap.has(key)) {
              ingredientMap.set(key, { name: ing.name, kcal: ing.kcal || 0, ptn: ing.ptn || 0, count: 1 });
            } else {
              ingredientMap.get(key).count++;
            }
          }
          const uniqueIngredients = Array.from(ingredientMap.values());

          // Build a descriptive title from the top ingredients
          const topNames = uniqueIngredients
            .slice(0, 3)
            .map(i => {
              // Capitalize first letter
              const name = i.name.charAt(0).toUpperCase() + i.name.slice(1).toLowerCase();
              return name;
            });
          const descriptiveTitle = topNames.length > 0
            ? topNames.join(', ') + (uniqueIngredients.length > 3 ? ` +${uniqueIngredients.length - 3}` : '')
            : m.name;

          return {
            name: m.name, // Original meal type (Almoço, Jantar, etc.)
            title: descriptiveTitle, // Descriptive title from ingredients
            count: m.count,
            avgKcal: Math.round(m.totalKcal / m.count),
            avgPtn: Math.round(m.totalPtn / m.count),
            avgCarb: Math.round(m.totalCarb / m.count),
            avgFat: Math.round(m.totalFat / m.count),
            ingredients: uniqueIngredients,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 4); // Top 4

      frequentMeals = processed;
    } catch (err) {
      console.error('Error loading frequent meals:', err);
      loadFailed = true;
    } finally {
      loading = false;
    }
  }

  async function quickLog(meal) {
    if (!auth.session?.user) return;

    // Create a descriptive message for the AI to parse
    const ingredientList = meal.ingredients ? meal.ingredients.map(i => i.name).join(', ') : '';
    const message = `Loguei ${meal.name}${ingredientList ? ' com ' + ingredientList : ''}`;
    onLog(message);
  }

  function getMealIcon(name) {
    const n = name.toLowerCase();
    if (n.includes('café') || n.includes('manhã')) return '☕';
    if (n.includes('almoço')) return '🍽️';
    if (n.includes('jantar')) return '🌙';
    if (n.includes('lanche')) return '🍪';
    if (n.includes('pão')) return '🍞';
    if (n.includes('ovo')) return '🥚';
    if (n.includes('arroz') || n.includes('frango')) return '🍚';
    if (n.includes('salada')) return '🥗';
    if (n.includes('proteína') || n.includes('whey')) return '💪';
    return '🍽️';
  }

  $effect(() => {
    if (auth.session) {
      loadFrequentMeals();
    }
  });
</script>

{#if loadFailed}
  <div class="bg-red-50 dark:bg-red-950/30 rounded-2xl p-4 border border-red-200 dark:border-red-900 mb-4 text-center">
    <p class="text-xs font-bold text-red-600 dark:text-red-400 mb-2">Falha ao carregar refeições frequentes</p>
    <button
      onclick={loadFrequentMeals}
      class="text-[10px] font-bold text-red-600 dark:text-red-400 underline hover:no-underline"
    >
      🔄 Tentar novamente
    </button>
  </div>
{:else if !loading && frequentMeals.length > 0}
  <div class="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900 mb-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="text-xl">⚡</span>
        <h3 class="font-bold text-slate-800 dark:text-slate-200 text-sm">Log Rápido</h3>
      </div>
      <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Suas refeições favoritas</span>
    </div>

    <div class="grid grid-cols-2 gap-2">
      {#each frequentMeals as meal}
        <button
          onclick={() => quickLog(meal)}
          class="group relative bg-white dark:bg-slate-800 rounded-xl p-3 border-2 border-emerald-100 dark:border-emerald-900 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all text-left overflow-hidden"
        >
          <!-- Meal type label + Icon -->
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="text-lg">{getMealIcon(meal.name)}</span>
            <span class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{meal.name}</span>
          </div>
          
          <!-- Descriptive title (what the meal is) -->
          <p class="font-bold text-slate-800 dark:text-slate-200 text-xs mb-1.5 line-clamp-2 leading-tight">{meal.title}</p>
          
          <!-- Stats -->
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
              {meal.avgKcal} kcal
            </span>
            <span class="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded">
              {meal.avgPtn}g P
            </span>
          </div>

          <!-- Ingredients list -->
          {#if meal.ingredients && meal.ingredients.length > 0}
            <div class="border-t border-slate-100 dark:border-slate-700 pt-1.5 mt-1">
              <div class="flex flex-wrap gap-1">
                {#each meal.ingredients.slice(0, 4) as ing}
                  <span class="text-[8px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded-md truncate max-w-full">
                    {ing.qty ? ing.qty + (ing.unit ? ing.unit : '') + ' ' : ''}{ing.name}
                  </span>
                {/each}
                {#if meal.ingredients.length > 4}
                  <span class="text-[8px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded-md">
                    +{meal.ingredients.length - 4}
                  </span>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Frequency badge -->
          <div class="flex items-center gap-1 mt-1.5">
            <div class="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {meal.count}x últimos 30d
            </div>
          </div>

          <!-- Hover effect -->
          <div class="absolute inset-0 bg-gradient-to-br from-emerald-400/0 to-teal-400/0 group-hover:from-emerald-400/10 group-hover:to-teal-400/10 transition-all pointer-events-none"></div>
        </button>
      {/each}
    </div>

    <p class="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-3">
      💡 Clique em uma refeição para registrá-la rapidamente
    </p>
  </div>
{/if}
