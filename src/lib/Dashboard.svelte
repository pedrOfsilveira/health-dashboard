<script>
  import { onMount } from 'svelte';
  import { supabase, fetchDays, fetchMealsWithItems, deleteMeal as deleteMealApi, callSuggestMeals } from './supabase.js';
  import { auth, goals, profile, streak, social, handleGamificationUpdate } from './stores.svelte.js';
  import Header from './Header.svelte';
  import Chat from './Chat.svelte';
  import AchievementToast from './AchievementToast.svelte';
  import ConfettiCelebration from './ConfettiCelebration.svelte';
  import Leaderboard from './Leaderboard.svelte';

  let allData = $state({});
  let selectedDate = $state(null);
  let loading = $state(true);
  let macroChart = $state(null);
  let canvasEl = $state(null);

  // Suggestions
  let suggestLoading = $state(false);
  let suggestions = $state([]);
  let suggestTip = $state('');

  // Current day's data
  let currentDay = $derived(selectedDate ? allData[selectedDate] : null);

  // Computed remaining macros
  let remaining = $derived.by(() => {
    if (!currentDay) return { kcal: goals.kcal, ptn: goals.ptn, carb: goals.carb, fat: goals.fat };
    return {
      kcal: Math.max(0, goals.kcal - currentDay.summary.kcal),
      ptn: Math.max(0, goals.ptn - currentDay.summary.ptn),
      carb: Math.max(0, goals.carb - currentDay.summary.carb),
      fat: Math.max(0, goals.fat - currentDay.summary.fat),
    };
  });

  // Percentages
  let pctKcal = $derived(currentDay ? Math.min(100, Math.round((currentDay.summary.kcal / goals.kcal) * 100)) : 0);
  let pctPtn = $derived(currentDay ? Math.min(100, Math.round((currentDay.summary.ptn / goals.ptn) * 100)) : 0);
  let pctCarb = $derived(currentDay ? Math.min(100, Math.round((currentDay.summary.carb / goals.carb) * 100)) : 0);
  let pctFat = $derived(currentDay ? Math.min(100, Math.round((currentDay.summary.fat / goals.fat) * 100)) : 0);

  // Confetti trigger
  let showConfetti = $state(false);
  let lastConfettiDate = $state(null);

  $effect(() => {
    if (pctKcal >= 90 && pctPtn >= 90 && currentDay && currentDay.summary.kcal > 0 && selectedDate !== lastConfettiDate) {
      showConfetti = true;
      lastConfettiDate = selectedDate;
    }
  });

  onMount(() => {
    loadData();
    subscribeToChanges();
  });

  async function loadData() {
    if (!auth.session?.user) return;
    loading = true;

    try {
      const userId = auth.session.user.id;
      const [days, meals] = await Promise.all([
        fetchDays(userId),
        fetchMealsWithItems(userId),
      ]);

      const dataByDate = {};
      for (const day of days) {
        dataByDate[day.date] = {
          date: day.date,
          summary: {
            kcal: day.kcal_total || 0,
            ptn: day.ptn_total || 0,
            carb: day.carb_total || 0,
            fat: day.fat_total || 0,
          },
          sleep: {
            start: day.sleep_start,
            end: day.sleep_end,
            quality: day.sleep_quality || 'BOA',
            hours: 0,
            minutes: 0,
          },
          meals: [],
          notes: day.notes ? [day.notes] : [],
        };

        if (day.sleep_start && day.sleep_end) {
          const [h1, m1] = day.sleep_start.split(':').map(Number);
          const [h2, m2] = day.sleep_end.split(':').map(Number);
          let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
          if (diff < 0) diff += 24 * 60;
          dataByDate[day.date].sleep.hours = Math.floor(diff / 60);
          dataByDate[day.date].sleep.minutes = diff % 60;
        }
      }

      for (const m of meals) {
        if (dataByDate[m.date]) {
          dataByDate[m.date].meals.push({
            id: m.id,
            name: m.name,
            kcal: m.kcal || 0,
            ptn: m.ptn || 0,
            carb: m.carb || 0,
            fat: m.fat || 0,
            items: (m.meal_items || []).map(it => ({
              name: it.name,
              kcal: it.kcal || 0,
              ptn: it.ptn || 0,
              carb: it.carb || 0,
              fat: it.fat || 0,
            })),
          });
        }
      }

      allData = dataByDate;
      const dates = Object.keys(allData).sort().reverse();
      if (dates.length > 0 && !selectedDate) {
        selectedDate = dates[0];
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      loading = false;
    }
  }

  function subscribeToChanges() {
    supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'days' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => loadData())
      .subscribe();
  }

  async function handleDeleteMeal(mealId) {
    if (!confirm('Deseja realmente excluir esta refeição?')) return;
    try {
      await deleteMealApi(mealId);
      await loadData();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  }

  async function getSuggestions() {
    if (!currentDay) return;
    suggestLoading = true;
    suggestions = [];
    suggestTip = '';

    const mealHistory = [];
    Object.values(allData).forEach(day => {
      if (day.meals) day.meals.forEach(m => mealHistory.push(m));
    });

    const healthConditions = (currentDay.notes || [])
      .filter(n => n && n.includes('[SAÚDE]'))
      .map(n => n.replace('[SAÚDE] ', '').trim());

    try {
      const result = await callSuggestMeals(
        selectedDate,
        remaining,
        { kcal: goals.kcal, ptn: goals.ptn, carb: goals.carb, fat: goals.fat },
        mealHistory,
        healthConditions,
      );

      if (result.success && result.suggestions) {
        suggestions = result.suggestions;
        suggestTip = result.tip || '';
      }
    } catch (e) {
      console.error('Suggestion error:', e);
    } finally {
      suggestLoading = false;
    }
  }

  function getItemIcon(name) {
    if (!name) return '🍽️';
    const n = name.toLowerCase();
    if (n.includes('arroz')) return '🍚';
    if (n.includes('feijão')) return '🫘';
    if (n.includes('carne') || n.includes('bife')) return '🥩';
    if (n.includes('frango') || n.includes('strogonoff')) return '🍗';
    if (n.includes('salada')) return '🥗';
    if (n.includes('banana') || n.includes('fruta')) return '🍌';
    if (n.includes('shake') || n.includes('hipercalórico')) return '🥤';
    if (n.includes('pão') || n.includes('pancho')) return '🌭';
    if (n.includes('batata')) return '🍟';
    if (n.includes('sorvete') || n.includes('doce')) return '🍦';
    if (n.includes('leite')) return '🥛';
    if (n.includes('massa')) return '🍝';
    if (n.includes('ovo')) return '🥚';
    return '🍽️';
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function generateInsights(data) {
    if (!data) return [];
    const { kcal, ptn, carb, fat } = data.summary;
    const mealCount = data.meals.length;
    const insights = [];

    if (kcal === 0 && mealCount === 0) {
      insights.push({ icon: '📋', text: 'Nenhuma refeição registrada hoje. Use o chat para registrar!', cls: 'info' });
      return insights;
    }

    if (pctKcal >= 95 && pctKcal <= 110) {
      insights.push({ icon: '🎯', text: `Meta calórica atingida! <strong>${kcal.toLocaleString('pt-BR')} kcal</strong> (${pctKcal}%). Consistência é o caminho.`, cls: 'good' });
    } else if (pctKcal > 110) {
      const excess = kcal - goals.kcal;
      insights.push({ icon: '🔥', text: `Superávit de <strong>${excess} kcal</strong> (${pctKcal}%).`, cls: excess > 500 ? 'warn' : 'info' });
    } else if (pctKcal >= 70) {
      insights.push({ icon: '📉', text: `Déficit de <strong>${goals.kcal - kcal} kcal</strong> (${pctKcal}%).`, cls: 'warn' });
    } else if (kcal > 0) {
      insights.push({ icon: '⚠️', text: `Apenas <strong>${pctKcal}%</strong> da meta calórica atingida.`, cls: 'bad' });
    }

    if (pctPtn >= 90) {
      insights.push({ icon: '💪', text: `Proteína excelente: <strong>${ptn}g</strong> (${pctPtn}%).`, cls: 'good' });
    } else if (pctPtn >= 60 && ptn > 0) {
      insights.push({ icon: '🥩', text: `Proteína em <strong>${pctPtn}%</strong> (faltam ${goals.ptn - ptn}g).`, cls: 'warn' });
    }

    if (data.sleep.start) {
      const hours = data.sleep.hours;
      if (hours >= 7 && hours <= 9) {
        insights.push({ icon: '😴', text: `Sono de <strong>${hours}h${data.sleep.minutes > 0 ? data.sleep.minutes + 'm' : ''}</strong> — faixa ideal!`, cls: 'good' });
      } else if (hours < 7 && hours > 0) {
        insights.push({ icon: '⏰', text: `Sono de <strong>${hours}h</strong> — abaixo do recomendado.`, cls: 'bad' });
      }
    }

    const healthNotes = (data.notes || []).filter(n => n && n.includes('[SAÚDE]'));
    healthNotes.forEach(note => {
      const condition = note.replace('[SAÚDE] ', '').split('(')[0].trim();
      insights.push({ icon: '🏥', text: `<strong>Alerta:</strong> ${condition}. Adapte sua alimentação.`, cls: 'warn' });
    });

    return insights;
  }

  let insights = $derived(generateInsights(currentDay));
  let dates = $derived(Object.keys(allData).sort().reverse());
</script>

<ConfettiCelebration bind:trigger={showConfetti} />
<AchievementToast />

<div class="w-full max-w-[500px] mx-auto px-4 pb-24">
  <Header />

  {#if loading}
    <div class="flex flex-col items-center justify-center h-64 gap-4">
      <div class="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</p>
    </div>
  {:else}
    <!-- Date Tabs -->
    {#if dates.length > 0}
      <div class="flex overflow-x-auto gap-3 pb-4 mb-5 scrollbar-hide">
        {#each dates as date (date)}
          {@const dateObj = new Date(date + 'T12:00:00')}
          <button
            onclick={() => { selectedDate = date; suggestions = []; }}
            class="flex-shrink-0 px-5 py-3 rounded-2xl font-bold text-sm transition-all
              {selectedDate === date
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/30 -translate-y-0.5'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}"
          >
            {dateObj.getDate().toString().padStart(2, '0')}
            <span class="opacity-40 text-[10px] ml-1">{dateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if currentDay}
      <!-- Display date -->
      <p class="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-6 first-letter:uppercase">
        {formatDisplayDate(selectedDate)}
      </p>

      <!-- Daily Goals Card -->
      <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-5">
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Metas Diárias</span>
          <div class="flex-1 h-px bg-slate-200"></div>
        </div>

        <!-- Calories -->
        <div class="mb-6">
          <div class="flex justify-between items-end mb-3">
            <div>
              <span class="text-4xl font-black text-slate-900 tracking-tighter">{currentDay.summary.kcal.toLocaleString('pt-BR')}</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase ml-2 tracking-widest">kcal / {goals.kcal}</span>
            </div>
            <div class="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-xs font-black">{pctKcal}%</div>
          </div>
          <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full transition-all duration-700" style="width: {pctKcal}%"></div>
          </div>
        </div>

        <!-- Macros -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-slate-50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">PTN</p>
            <p class="text-lg font-black text-slate-800">{currentDay.summary.ptn}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.ptn}g</p>
            <div class="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all duration-700" style="width: {pctPtn}%"></div>
            </div>
          </div>
          <div class="bg-slate-50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">CHO</p>
            <p class="text-lg font-black text-slate-800">{currentDay.summary.carb}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.carb}g</p>
            <div class="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
              <div class="h-full bg-amber-500 rounded-full transition-all duration-700" style="width: {pctCarb}%"></div>
            </div>
          </div>
          <div class="bg-slate-50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">FAT</p>
            <p class="text-lg font-black text-slate-800">{currentDay.summary.fat}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.fat}g</p>
            <div class="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
              <div class="h-full bg-red-500 rounded-full transition-all duration-700" style="width: {pctFat}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sleep Card -->
      <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recuperação & Sono</span>
          <div class="flex-1 h-px bg-slate-200"></div>
        </div>

        <div class="flex items-center gap-5">
          <div class="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl shadow-sm">🌙</div>
          <div class="flex-1">
            {#if currentDay.sleep.start}
              <p class="text-2xl font-black text-slate-900 tracking-tight">{currentDay.sleep.hours}h {currentDay.sleep.minutes}m</p>
              <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{currentDay.sleep.start} às {currentDay.sleep.end}</p>
            {:else}
              <p class="text-2xl font-black text-slate-900 tracking-tight">--h --m</p>
              <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Não registrado</p>
            {/if}
          </div>
          <div class="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase
            {currentDay.sleep.start && currentDay.sleep.quality?.includes('BOA')
              ? 'bg-emerald-100 text-emerald-700'
              : currentDay.sleep.start ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}">
            {currentDay.sleep.start ? currentDay.sleep.quality || 'N/A' : 'OFF'}
          </div>
        </div>
      </div>

      <!-- Meals Section -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diário Nutricional</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>

      {#if currentDay.meals.length === 0}
        <div class="bg-white border border-slate-200 rounded-3xl p-8 text-center mb-6">
          <p class="text-4xl mb-3">🍽️</p>
          <p class="text-sm font-bold text-slate-400">Nenhuma refeição registrada</p>
          <p class="text-xs text-slate-400 mt-1">Use o chat para registrar suas refeições</p>
        </div>
      {:else}
        <div class="space-y-3 mb-6">
          {#each currentDay.meals as meal, idx (meal.id)}
            <details class="bg-white border border-slate-200 rounded-3xl overflow-hidden hover:border-slate-300 transition-colors group" open={idx === 0}>
              <summary class="px-5 py-4 cursor-pointer flex items-center gap-4 list-none [&::-webkit-details-marker]:hidden">
                <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">{getItemIcon(meal.name)}</div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-black text-slate-800 text-sm tracking-tight truncate">{meal.name}</h3>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{meal.kcal} kcal</span>
                    <div class="w-1 h-1 rounded-full bg-slate-200"></div>
                    <span class="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">{meal.ptn}g ptn</span>
                  </div>
                </div>
                <button
                  onclick={(e) => { e.preventDefault(); handleDeleteMeal(meal.id); }}
                  class="p-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Excluir refeição"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-300 transition-transform group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div class="px-5 pb-4 pt-2 border-t border-slate-50">
                {#each meal.items as item}
                  <div class="flex items-start py-3 border-t border-dashed border-slate-100 first:border-0">
                    <span class="mr-4 text-xl">{getItemIcon(item.name)}</span>
                    <div class="flex-1">
                      <p class="font-bold text-slate-700 text-xs">{item.name}</p>
                      <div class="flex gap-2 mt-1">
                        <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">{item.kcal} kcal</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md">{item.ptn}g P</span>
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="text-xs text-slate-400 italic py-2">Sem sub-itens detalhados.</p>
                {/each}
              </div>
            </details>
          {/each}
        </div>
      {/if}

      <!-- AI Insights -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">AI Health Insights</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>
      <div class="space-y-3 mb-6">
        {#each insights as insight}
          <div class="rounded-2xl px-4 py-3 text-sm border
            {insight.cls === 'good' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ''}
            {insight.cls === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : ''}
            {insight.cls === 'bad' ? 'bg-red-50 border-red-200 text-red-800' : ''}
            {insight.cls === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : ''}"
          >
            <span class="mr-2">{insight.icon}</span>{@html insight.text}
          </div>
        {:else}
          <div class="rounded-2xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 text-slate-500">
            📊 Dados insuficientes para insights.
          </div>
        {/each}
      </div>

      <!-- AI Meal Suggestions -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sugestões Inteligentes</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>

      <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-4">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center text-2xl shadow-sm">🧠</div>
          <div class="flex-1">
            <h3 class="font-black text-slate-800 text-sm tracking-tight">O que comer agora?</h3>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Baseado nos seus hábitos e macros restantes</p>
          </div>
        </div>

        <div class="flex gap-2 mb-4 flex-wrap">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">Faltam: {remaining.kcal} kcal</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">{remaining.ptn}g ptn</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-lg">{remaining.carb}g carb</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-red-50 text-red-600 rounded-lg">{remaining.fat}g fat</span>
        </div>

        <button
          onclick={getSuggestions}
          disabled={suggestLoading}
          class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {#if suggestLoading}
            🔄 Analisando seus padrões...
          {:else}
            ✨ Gerar Sugestões Personalizadas
          {/if}
        </button>
      </div>

      {#if suggestions.length > 0}
        <div class="space-y-4 mb-6">
          {#each suggestions as s}
            <div class="bg-white border border-slate-200 rounded-3xl p-5 hover:shadow-md transition-all">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">{s.emoji || '🍽️'}</span>
                <div class="flex-1">
                  <h4 class="font-black text-slate-800 text-sm">{s.name}</h4>
                  <p class="text-[10px] text-slate-400 font-medium mt-0.5">{s.description || ''}</p>
                </div>
              </div>
              <div class="flex gap-2 mb-3 flex-wrap">
                <span class="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">{s.total?.kcal || 0} kcal</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">{s.total?.ptn || 0}g P</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-lg">{s.total?.carb || 0}g C</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-red-50 text-red-600 rounded-lg">{s.total?.fat || 0}g F</span>
              </div>
              {#each s.items || [] as item}
                <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span class="text-lg">{getItemIcon(item.name)}</span>
                  <div class="flex-1">
                    <p class="font-bold text-slate-700 text-xs">{item.name}</p>
                    <p class="text-[10px] text-slate-400">{item.amount || ''}</p>
                  </div>
                  <span class="text-[10px] font-bold text-slate-400">{item.kcal} kcal</span>
                </div>
              {/each}
            </div>
          {/each}

          {#if suggestTip}
            <div class="rounded-2xl px-4 py-3 text-sm bg-blue-50 border border-blue-200 text-blue-800">
              💡 {suggestTip}
            </div>
          {/if}
        </div>
      {/if}

    {:else if dates.length === 0}
      <div class="text-center py-16">
        <p class="text-5xl mb-4">🚀</p>
        <h2 class="text-xl font-black text-slate-900 mb-2">Bem-vindo ao Bio-Tracker!</h2>
        <p class="text-sm text-slate-500 mb-1">Use o chat para registrar sua primeira refeição.</p>
        <p class="text-xs text-slate-400">Toque no ícone de chat no canto inferior direito.</p>
      </div>
    {/if}

    <!-- Active Challenges Summary -->
    {#if social.activeChallenges.length > 0}
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Desafios Ativos</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>
      <div class="space-y-3 mb-6">
        {#each social.activeChallenges.filter(p => p.challenge_instances?.status === 'active').slice(0, 3) as participation (participation.id)}
          {@const instance = participation.challenge_instances}
          {@const challenge = instance?.challenges}
          {@const progress = participation.progress || 0}
          {@const target = challenge?.target_value || 1}
          {@const pct = Math.min(100, Math.round((progress / target) * 100))}
          <div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <span class="text-2xl">{challenge?.icon || '🏆'}</span>
            <div class="flex-1">
              <p class="text-xs font-black text-slate-800">{challenge?.title}</p>
              <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: {pct}%"></div>
              </div>
            </div>
            <span class="text-[10px] font-black text-emerald-600">{pct}%</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Leaderboard -->
    <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ranking de Amigos</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>
      <Leaderboard />
    </div>

    <footer class="pb-8 text-center">
      <div class="w-8 h-1 bg-slate-200 mx-auto rounded-full mb-6"></div>
      <p class="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Health Intelligence System</p>
    </footer>
  {/if}
</div>

<Chat bind:selectedDate onEntryLogged={loadData} />

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { scrollbar-width: none; }
</style>
