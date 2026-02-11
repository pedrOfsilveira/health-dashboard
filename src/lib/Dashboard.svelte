<script>
  import { onMount } from 'svelte';
  import { supabase, fetchDays, fetchMealsWithItems, deleteMeal as deleteMealApi, callSuggestMeals, callProcessEntry, logCreatine } from './supabase.js';
  import { auth, goals, profile, streak, social, handleGamificationUpdate } from './stores.svelte.js';
  import Header from './Header.svelte';
  import QuickLog from './QuickLog.svelte';
  import Chat from './Chat.svelte';
  import AchievementToast from './AchievementToast.svelte';
  import ConfettiCelebration from './ConfettiCelebration.svelte';
  import Leaderboard from './Leaderboard.svelte';
  import WaterTracker from './WaterTracker.svelte';
  import PullToRefresh from './PullToRefresh.svelte';

  let allData = $state({});
  let selectedDate = $state(new Date().toISOString().split('T')[0]);
  let loading = $state(true);
  let loadError = $state(null);

  // Suggestions
  let suggestLoading = $state(false);
  let suggestions = $state([]);
  let suggestTip = $state('');

  // Current day's data
  let currentDay = $derived(selectedDate ? allData[selectedDate] : null);

  // Computed remaining macros (allow negatives to show overage)
  let remaining = $derived.by(() => {
    if (!currentDay) return { kcal: goals.kcal, ptn: goals.ptn, carb: goals.carb, fat: goals.fat };
    return {
      kcal: goals.kcal - currentDay.summary.kcal,
      ptn: goals.ptn - currentDay.summary.ptn,
      carb: goals.carb - currentDay.summary.carb,
      fat: goals.fat - currentDay.summary.fat,
    };
  });

  // Percentages (uncapped — allow >100% to show overage)
  let pctKcal = $derived(currentDay ? Math.round((currentDay.summary.kcal / goals.kcal) * 100) : 0);
  let pctPtn = $derived(currentDay ? Math.round((currentDay.summary.ptn / goals.ptn) * 100) : 0);
  let pctCarb = $derived(currentDay ? Math.round((currentDay.summary.carb / goals.carb) * 100) : 0);
  let pctFat = $derived(currentDay ? Math.round((currentDay.summary.fat / goals.fat) * 100) : 0);

  // Macro distribution for pie chart (conic-gradient)
  let macroDistribution = $derived.by(() => {
    if (!currentDay) return { ptn: 0, carb: 0, fat: 0, total: 0 };
    const ptn = currentDay.summary.ptn || 0;
    const carb = currentDay.summary.carb || 0;
    const fat = currentDay.summary.fat || 0;
    const total = ptn + carb + fat;
    return { ptn, carb, fat, total };
  });
  let pieGradient = $derived.by(() => {
    const { ptn, carb, fat, total } = macroDistribution;
    if (total === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
    const ptnPct = (ptn / total) * 100;
    const carbPct = (carb / total) * 100;
    const fatPct = (fat / total) * 100;
    return `conic-gradient(#10b981 0% ${ptnPct}%, #f59e0b ${ptnPct}% ${ptnPct + carbPct}%, #ef4444 ${ptnPct + carbPct}% 100%)`;
  });

  // Confetti trigger
  let showConfetti = $state(false);
  let lastConfettiDate = $state(null);
  
  // Quick Log & Notification
  let processingLog = $state(false);
  let notification = $state({ show: false, message: '', type: 'info' });
  let notifTimeout;
  let dashboardPrefs = $state({ showCreatine: true });

  function showNotification(msg, type = 'info') {
    notification = { show: true, message: msg, type };
    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(() => {
      notification.show = false;
    }, 4000);
  }

  function dashboardPrefsKey() {
    return auth.session?.user?.id
      ? `dashboard_prefs_${auth.session.user.id}`
      : 'dashboard_prefs_guest';
  }

  function loadDashboardPrefs() {
    try {
      const raw = localStorage.getItem(dashboardPrefsKey());
      const parsed = raw ? JSON.parse(raw) : null;
      dashboardPrefs = {
        showCreatine: parsed?.showCreatine !== false,
      };
    } catch {
      dashboardPrefs = { showCreatine: true };
    }
  }

  async function handleQuickLog(text) {
    if (processingLog) return;
    processingLog = true;
    showNotification('Processando registro...', 'info');

    try {
      const result = await callProcessEntry(text, selectedDate || new Date().toISOString().split('T')[0]);

      if (result.success) {
        await loadData();
        if (result.gamification) {
          handleGamificationUpdate(result.gamification);
        }
        showNotification(result.message || 'Registrado com sucesso!', 'success');
      } else {
        showNotification('Erro: ' + (result.error || 'Falha'), 'error');
      }
    } catch (e) {
      showNotification('Erro de rede: ' + e.message, 'error');
    } finally {
      processingLog = false;
    }
  }

  $effect(() => {
    if (pctKcal >= 90 && pctPtn >= 90 && currentDay && currentDay.summary.kcal > 0 && selectedDate !== lastConfettiDate) {
      showConfetti = true;
      lastConfettiDate = selectedDate;
    }
  });

  onMount(() => {
    loadData();
    subscribeToChanges();
    loadDashboardPrefs();
  });

  $effect(() => {
    auth.session?.user?.id;
    loadDashboardPrefs();
  });

  async function loadData() {
    if (!auth.session?.user) return;
    loading = true;
    loadError = null;

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
          water_ml: day.water_ml || 0,
          sleep: {
            start: day.sleep_start,
            end: day.sleep_end,
            quality: day.sleep_quality || 'BOA',
            hours: 0,
            minutes: 0,
          },
          creatine_taken_at: day.creatine_taken_at, // Fetch creatine_taken_at
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
      const today = new Date().toISOString().split('T')[0];
      if (!selectedDate) {
        selectedDate = today;
      }
    } catch (err) {
      console.error('Error loading data:', err);
      loadError = err.message || 'Erro ao carregar dados';
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

    const healthConditions = combinedHealthConditions;

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

  function getMealTypeIcon(mealName) {
    if (!mealName) return '🍽️';
    const n = mealName.toLowerCase();
    if (n.includes('café') || n.includes('manhã')) return '☕';
    if (n.includes('almoço')) return '🍽️';
    if (n.includes('lanche')) return '🍎';
    if (n.includes('jantar') || n.includes('janta')) return '🌙';
    if (n.includes('ceia')) return '🌙';
    return '🍽️';
  }

  function getMealTitle(meal) {
    if (!meal.items || meal.items.length === 0) return meal.name;
    // Build a descriptive title from the top items (by kcal)
    const sorted = [...meal.items].sort((a, b) => (b.kcal || 0) - (a.kcal || 0));
    const topItems = sorted.slice(0, 3).map(i => {
      // Strip quantity prefixes like "2x " from item names
      return (i.name || '').replace(/^\d+x\s*/i, '');
    });
    const title = topItems.join(', ');
    if (sorted.length > 3) return title + '…';
    return title;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function formatDateTabDay(dateStr) {
    return new Date(dateStr + 'T12:00:00').getDate().toString().padStart(2, '0');
  }

  function formatDateTabMonth(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  }

  function normalizeHealthConditions(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map(c => c.trim()).filter(Boolean);
    }
    return String(raw)
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
  }

  const healthRules = [
    {
      key: 'gastrite',
      match: ['gastrite', 'refluxo', 'azia'],
      avoid: ['café', 'pimenta', 'frit', 'frito', 'fritura', 'álcool', 'tomate', 'cítrico', 'laranja', 'limão', 'chocolate', 'refrigerante', 'menta'],
      tip: 'Prefira refeições leves, pouco gordurosas e evite muito ácido ou picante.',
      label: 'Gastrite/Refluxo',
    },
    {
      key: 'lactose',
      match: ['lactose', 'intolerância à lactose', 'intolerancia a lactose'],
      avoid: ['leite', 'queijo', 'iogurte', 'creme', 'manteiga', 'requeijão'],
      tip: 'Opte por versões sem lactose ou bebidas vegetais.',
      label: 'Lactose',
    },
    {
      key: 'gluten',
      match: ['glúten', 'gluten', 'celíaco', 'celiaco'],
      avoid: ['trigo', 'pão', 'massa', 'macarrão', 'farinha', 'bolo', 'biscoito'],
      tip: 'Priorize opções sem glúten (arroz, batata, mandioca, milho).',
      label: 'Glúten',
    },
    {
      key: 'diabetes',
      match: ['diabetes', 'pré-diabetes', 'pre-diabetes'],
      avoid: ['açúcar', 'doce', 'refrigerante', 'suco', 'pão branco', 'massa branca', 'bolacha'],
      tip: 'Prefira carboidratos integrais e combine com fibras e proteína.',
      label: 'Diabetes',
    },
    {
      key: 'hipertensao',
      match: ['hipertensão', 'hipertensao', 'pressão alta', 'pressao alta'],
      avoid: ['sal', 'salgado', 'embutido', 'bacon', 'presunto', 'salsicha', 'linguiça'],
      tip: 'Reduza ultraprocessados e temperos prontos; use ervas e limão.',
      label: 'Pressão Alta',
    },
  ];

  function buildMealHealthFeedback(day, conditions) {
    if (!day || !conditions || conditions.length === 0) return [];
    const normalized = conditions.map(c => c.toLowerCase());
    const activeRules = healthRules.filter(rule =>
      normalized.some(c => rule.match.some(m => c.includes(m)))
    );
    if (activeRules.length === 0) return [];

    const mealTexts = [];
    for (const meal of day.meals || []) {
      if (meal.name) mealTexts.push(meal.name.toLowerCase());
      for (const item of meal.items || []) {
        if (item.name) mealTexts.push(item.name.toLowerCase());
      }
    }

    const feedbacks = [];
    for (const rule of activeRules) {
      const found = rule.avoid.filter(a => mealTexts.some(t => t.includes(a)));
      if (found.length > 0) {
        feedbacks.push({
          icon: '⚠️',
          text: `${rule.label}: encontrei possíveis gatilhos (${found.slice(0, 4).join(', ')}).`,
          cls: 'warn',
        });
      }
      feedbacks.push({
        icon: '💡',
        text: `${rule.label}: ${rule.tip}`,
        cls: 'info',
      });
    }
    return feedbacks;
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
      insights.push({ icon: '🎯', text: `Meta calórica atingida! ${kcal.toLocaleString('pt-BR')} kcal (${pctKcal}%). Consistência é o caminho.`, cls: 'good' });
    } else if (pctKcal > 110) {
      const excess = kcal - goals.kcal;
      insights.push({ icon: '🔥', text: `Superávit de ${excess} kcal (${pctKcal}%).`, cls: excess > 500 ? 'warn' : 'info' });
    } else if (pctKcal >= 70) {
      insights.push({ icon: '📉', text: `Déficit de ${goals.kcal - kcal} kcal (${pctKcal}%).`, cls: 'warn' });
    } else if (kcal > 0) {
      insights.push({ icon: '⚠️', text: `Apenas ${pctKcal}% da meta calórica atingida.`, cls: 'bad' });
    }

    if (pctPtn >= 90) {
      insights.push({ icon: '💪', text: `Proteína excelente: ${ptn}g (${pctPtn}%).`, cls: 'good' });
    } else if (pctPtn >= 60 && ptn > 0) {
      insights.push({ icon: '🥩', text: `Proteína em ${pctPtn}% (faltam ${goals.ptn - ptn}g).`, cls: 'warn' });
    }

    if (data.sleep.start) {
      const hours = data.sleep.hours;
      if (hours >= 7 && hours <= 9) {
        insights.push({ icon: '😴', text: `Sono de ${hours}h${data.sleep.minutes > 0 ? data.sleep.minutes + 'm' : ''} — faixa ideal!`, cls: 'good' });
      } else if (hours < 7 && hours > 0) {
        insights.push({ icon: '⏰', text: `Sono de ${hours}h — abaixo do recomendado.`, cls: 'bad' });
      }
    }

    if (data.water_ml >= 2000) {
      insights.push({ icon: '💧', text: `Hidratação excelente: ${Math.round(data.water_ml / 100) / 10}L hoje.`, cls: 'good' });
    } else if (data.water_ml > 0 && data.water_ml < 1200) {
      insights.push({ icon: '🥤', text: `Água baixa (${Math.round(data.water_ml / 100) / 10}L). Tente aumentar ao longo do dia.`, cls: 'warn' });
    }

    if (mealCount >= 4) {
      insights.push({ icon: '🍽️', text: `Boa frequência alimentar: ${mealCount} refeições registradas.`, cls: 'good' });
    } else if (mealCount > 0 && mealCount < 2) {
      insights.push({ icon: '🍽️', text: `Poucas refeições hoje (${mealCount}). Considere um lanche equilibrado.`, cls: 'warn' });
    }

    const healthNotes = (data.notes || []).filter(n => n && n.includes('[SAÚDE]'));
    healthNotes.forEach(note => {
      const condition = note.replace('[SAÚDE] ', '').split('(')[0].trim();
      insights.push({ icon: '🏥', text: `Alerta: ${condition}. Adapte sua alimentação.`, cls: 'warn' });
    });

    return insights;
  }

  let profileHealthConditions = $derived.by(() => normalizeHealthConditions(profile.data?.health_conditions || ''));
  let noteHealthConditions = $derived.by(() => {
    if (!currentDay?.notes) return [];
    return currentDay.notes
      .filter(n => n && n.includes('[SAÚDE]'))
      .map(n => n.replace('[SAÚDE] ', '').trim());
  });
  let combinedHealthConditions = $derived.by(() => {
    const merged = [...profileHealthConditions, ...noteHealthConditions];
    return [...new Set(merged.filter(Boolean))];
  });

  let insights = $derived(generateInsights(currentDay));
  let mealFeedbacks = $derived.by(() => buildMealHealthFeedback(currentDay, combinedHealthConditions));
  let dates = $derived(Object.keys(allData).sort().reverse());

  function getChallengeTarget(participation) {
    return participation?.challenge_instances?.challenges?.target_value || 1;
  }

  function getChallengePct(participation) {
    const progress = participation?.progress || 0;
    const target = getChallengeTarget(participation);
    return Math.min(100, Math.round((progress / target) * 100));
  }

  function getChallengeDaysLeft(participation) {
    const endDate = participation?.challenge_instances?.end_date;
    if (!endDate) return 0;
    const end = new Date(endDate + 'T23:59:59').getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  async function handleCreatineLog() {
    if (!auth.session?.user) return;
    const userId = auth.session.user.id;
    const today = selectedDate || new Date().toISOString().split('T')[0];
    try {
        showNotification('Registrando creatina...', 'info');
        await logCreatine(userId, today);
        await loadData(); // Re-load data to update UI
        showNotification('Creatina registrada!', 'success');
    } catch (error) {
        console.error('Error logging creatine:', error);
        showNotification('Erro ao registrar creatina.', 'error');
    }
  }
</script>

<ConfettiCelebration bind:trigger={showConfetti} />
<AchievementToast />
{#if notification.show}
  <div class="fixed top-24 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-3 animate-pulse max-w-[90vw] text-center border border-slate-700 dark:border-slate-200">
    <span class="text-lg">{notification.type === 'error' ? '❌' : notification.type === 'success' ? '✅' : '⏳'}</span>
    <span>{notification.message}</span>
  </div>
{/if}
<PullToRefresh onRefresh={loadData} />

<div class="w-full max-w-[500px] mx-auto px-4 pb-24">
  <Header />

  {#if loading}
    <div class="flex flex-col items-center justify-center h-64 gap-4">
      <div class="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</p>
    </div>
  {:else if loadError}
    <div class="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
      <div class="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-3xl">⚠️</div>
      <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Falha ao carregar dados</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">{loadError}</p>
      <button
        onclick={loadData}
        class="mt-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
      >
        🔄 Tentar novamente
      </button>
    </div>
  {:else}
    <!-- Date Tabs -->
    {#if dates.length > 0}
      <div class="flex overflow-x-auto gap-3 pb-4 mb-5 scrollbar-hide">
        {#each dates as date (date)}
          <button
            onclick={() => { selectedDate = date; suggestions = []; }}
            class="flex-shrink-0 px-5 py-3 rounded-2xl font-bold text-sm transition-all
              {selectedDate === date
                ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-lg shadow-slate-900/30 dark:shadow-slate-700/30 -translate-y-0.5'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}"
          >
            {formatDateTabDay(date)}
            <span class="opacity-40 text-[10px] ml-1">{formatDateTabMonth(date)}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if currentDay}
      <!-- Display date -->
      <p class="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-6 first-letter:uppercase">
        {formatDisplayDate(selectedDate)}
      </p>

      
      <!-- Daily Goals Card -->
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-5">
          <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Metas Diárias</span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        </div>
        
        <!-- Calories -->
        <div class="mb-6">
          <div class="flex justify-between items-end mb-3">
            <div>
              <span class="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">{currentDay.summary.kcal.toLocaleString('pt-BR')}</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase ml-2 tracking-widest">kcal / {goals.kcal}</span>
            </div>
            <div class="{pctKcal > 110 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'} px-3 py-1 rounded-lg text-xs font-black">{pctKcal}%</div>
          </div>
          <div class="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div class="h-full {pctKcal > 110 ? 'bg-red-500 dark:bg-red-400' : 'bg-emerald-500 dark:bg-emerald-400'} rounded-full transition-all duration-700" style="width: {Math.min(100, pctKcal)}%"></div>
          </div>
          {#if remaining.kcal < 0}
            <p class="text-[10px] font-bold text-red-500 dark:text-red-400 mt-1.5">⚠️ Excesso de {Math.abs(remaining.kcal)} kcal</p>
          {/if}
        </div>

        <!-- Macros -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">PTN</p>
            <p class="text-lg font-black {pctPtn > 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}">{currentDay.summary.ptn}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.ptn}g</p>
            <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
              <div class="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-700" style="width: {Math.min(100, pctPtn)}%"></div>
            </div>
            {#if remaining.ptn < 0}
              <p class="text-[9px] font-bold text-emerald-500 mt-1">+{Math.abs(remaining.ptn)}g 💪</p>
            {/if}
          </div>
          <div class="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">CHO</p>
            <p class="text-lg font-black {pctCarb > 110 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}">{currentDay.summary.carb}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.carb}g</p>
            <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
              <div class="h-full {pctCarb > 110 ? 'bg-amber-600 dark:bg-amber-500' : 'bg-amber-500 dark:bg-amber-400'} rounded-full transition-all duration-700" style="width: {Math.min(100, pctCarb)}%"></div>
            </div>
            {#if remaining.carb < 0}
              <p class="text-[9px] font-bold text-amber-500 mt-1">+{Math.abs(remaining.carb)}g</p>
            {/if}
          </div>
          <div class="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4">
            <p class="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-wider">FAT</p>
            <p class="text-lg font-black {pctFat > 110 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}">{currentDay.summary.fat}</p>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">/ {goals.fat}g</p>
            <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
              <div class="h-full {pctFat > 110 ? 'bg-red-600 dark:bg-red-500' : 'bg-red-500 dark:bg-red-400'} rounded-full transition-all duration-700" style="width: {Math.min(100, pctFat)}%"></div>
            </div>
            {#if remaining.fat < 0}
              <p class="text-[9px] font-bold text-red-500 mt-1">+{Math.abs(remaining.fat)}g</p>
            {/if}
          </div>
        </div>

        <!-- Macro Distribution Pie Chart -->
        {#if macroDistribution.total > 0}
          <div class="mt-5 flex items-center gap-5">
            <div
              class="w-20 h-20 rounded-full flex-shrink-0 shadow-inner"
              style="background: {pieGradient};"
            >
              <div class="w-full h-full rounded-full flex items-center justify-center">
                <div class="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
                  <span class="text-[10px] font-black text-slate-500 dark:text-slate-400">{macroDistribution.total}g</span>
                </div>
              </div>
            </div>
            <div class="flex-1 space-y-1.5">
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex-1">Proteína</span>
                <span class="text-[10px] font-black text-slate-500 dark:text-slate-400">{macroDistribution.ptn}g ({macroDistribution.total > 0 ? Math.round((macroDistribution.ptn / macroDistribution.total) * 100) : 0}%)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex-1">Carboidrato</span>
                <span class="text-[10px] font-black text-slate-500 dark:text-slate-400">{macroDistribution.carb}g ({macroDistribution.total > 0 ? Math.round((macroDistribution.carb / macroDistribution.total) * 100) : 0}%)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex-1">Gordura</span>
                <span class="text-[10px] font-black text-slate-500 dark:text-slate-400">{macroDistribution.fat}g ({macroDistribution.total > 0 ? Math.round((macroDistribution.fat / macroDistribution.total) * 100) : 0}%)</span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Sleep Card -->
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Recuperação & Sono</span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        </div>

        <div class="flex items-center gap-5">
          <div class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-3xl shadow-sm">🌙</div>
          <div class="flex-1">
            {#if currentDay.sleep.start}
              <p class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{currentDay.sleep.hours}h {currentDay.sleep.minutes}m</p>
              <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{currentDay.sleep.start} às {currentDay.sleep.end}</p>
            {:else}
              <p class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">--h --m</p>
              <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Não registrado</p>
            {/if}
          </div>
          <div class="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase
            {currentDay.sleep.start && currentDay.sleep.quality?.includes('BOA')
              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
              : currentDay.sleep.start ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}">
            {currentDay.sleep.start ? currentDay.sleep.quality || 'N/A' : 'OFF'}
          </div>
        </div>
      </div>

      <!-- Water Tracking -->
      <div class="mb-6">
        <WaterTracker bind:waterMl={currentDay.water_ml} date={selectedDate} />
      </div>

      <!-- Creatine Tracker -->
      {#if dashboardPrefs.showCreatine}
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6">
          <div class="flex items-center gap-3 mb-4">
            <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Creatina</span>
            <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              {#if currentDay?.creatine_taken_at}
                <p class="text-lg font-black text-emerald-600 dark:text-emerald-400">Tomada!</p>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">Última vez: {new Date(currentDay.creatine_taken_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              {:else}
                <p class="text-lg font-black text-red-500 dark:text-red-400">Não tomada hoje</p>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">Registre sua dose diária</p>
              {/if}
            </div>
            <button
              onclick={handleCreatineLog}
              class="px-5 py-2.5 rounded-2xl font-black text-sm transition-all
                {currentDay?.creatine_taken_at ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 opacity-60 cursor-not-allowed' : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'}"
              disabled={currentDay?.creatine_taken_at}
            >
              {currentDay?.creatine_taken_at ? '✅ Registrado' : '💊 Tomar Creatina'}
            </button>
          </div>
        </div>
      {/if}

      
      <!-- Meals Section -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Diário Nutricional</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>
      <QuickLog onLog={handleQuickLog} />
      
      {#if currentDay.meals.length === 0}
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 text-center mb-6">
          <p class="text-4xl mb-3">🍽️</p>
          <p class="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhuma refeição registrada</p>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Use o chat para registrar suas refeições</p>
        </div>
      {:else}
        <div class="space-y-3 mb-6">
          {#each currentDay.meals as meal, idx (meal.id)}
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm transition-colors">
              <!-- Header: type label + title + delete -->
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <span class="text-lg flex-shrink-0">{getMealTypeIcon(meal.name)}</span>
                  <div class="min-w-0">
                    <p class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{meal.name}</p>
                    <p class="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{getMealTitle(meal)}</p>
                  </div>
                </div>
                <button
                  onclick={() => handleDeleteMeal(meal.id)}
                  class="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0"
                  title="Excluir refeição"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <!-- Macro chips -->
              <div class="flex gap-2 mb-2 flex-wrap">
                <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg">{meal.kcal} kcal</span>
                <span class="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-lg">{meal.ptn}g ptn</span>
                <span class="text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg">{meal.carb}g carb</span>
                <span class="text-[10px] font-bold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg">{meal.fat}g gord</span>
              </div>

              <!-- Ingredients (items) -->
              {#if meal.items && meal.items.length > 0}
                <div class="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2">
                  <p class="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Ingredientes</p>
                  <div class="flex flex-wrap gap-1">
                    {#each meal.items as item, itemIndex (item.name + itemIndex)}
                      <span class="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md max-w-full truncate">
                        {getItemIcon(item.name)} {item.name} · {item.kcal}kcal · {item.ptn}g P
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if mealFeedbacks.length > 0}
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Feedback das Refeições</span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        </div>
        <div class="space-y-3 mb-6">
          {#each mealFeedbacks as feedback, feedbackIndex (feedback.text + feedbackIndex)}
            <div class="rounded-2xl px-4 py-3 text-sm border
              {feedback.cls === 'warn' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200' : ''}
              {feedback.cls === 'info' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200' : ''}"
            >
              <span class="mr-2">{feedback.icon}</span>{feedback.text}
            </div>
          {/each}
        </div>
      {/if}

      <!-- AI Insights -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">AI Health Insights</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>
      <div class="space-y-3 mb-6">
        {#each insights as insight, insightIndex (insight.text + insightIndex)}
          <div class="rounded-2xl px-4 py-3 text-sm border
            {insight.cls === 'good' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' : ''}
            {insight.cls === 'warn' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200' : ''}
            {insight.cls === 'bad' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200' : ''}
            {insight.cls === 'info' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200' : ''}"
          >
            <span class="mr-2">{insight.icon}</span>{insight.text}
          </div>
        {:else}
          <div class="rounded-2xl px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            📊 Dados insuficientes para insights.
          </div>
        {/each}
      </div>

      <!-- AI Meal Suggestions -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sugestões Inteligentes</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>

      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-4">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 flex items-center justify-center text-2xl shadow-sm">🧠</div>
          <div class="flex-1">
            <h3 class="font-black text-slate-800 dark:text-slate-100 text-sm tracking-tight">O que comer agora?</h3>
            <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">Baseado nos seus hábitos e macros restantes</p>
          </div>
        </div>

        <div class="flex gap-2 mb-4 flex-wrap">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 {remaining.kcal < 0 ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} rounded-lg">{remaining.kcal < 0 ? 'Excesso' : 'Faltam'}: {Math.abs(remaining.kcal)} kcal</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 {remaining.ptn < 0 ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'} rounded-lg">{Math.abs(remaining.ptn)}g ptn</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 {remaining.carb < 0 ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'} rounded-lg">{Math.abs(remaining.carb)}g carb</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 {remaining.fat < 0 ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'} rounded-lg">{Math.abs(remaining.fat)}g fat</span>
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
          {#each suggestions as s, suggestionIndex (suggestionIndex)}
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 hover:shadow-md transition-all">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">{s.emoji || '🍽️'}</span>
                <div class="flex-1">
                  <h4 class="font-black text-slate-800 dark:text-slate-100 text-sm">{s.name}</h4>
                  <p class="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{s.description || ''}</p>
                </div>
              </div>
              <div class="flex gap-2 mb-3 flex-wrap">
                <span class="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg">{s.total?.kcal || 0} kcal</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-lg">{s.total?.ptn || 0}g P</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 rounded-lg">{s.total?.carb || 0}g C</span>
                <span class="text-[10px] font-bold px-2 py-1 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-lg">{s.total?.fat || 0}g F</span>
              </div>
              {#each s.items || [] as item, itemIndex (item.name + itemIndex)}
                <div class="flex items-center gap-3 py-2 border-b border-slate-50 dark:border-slate-700 last:border-0">
                  <span class="text-lg">{getItemIcon(item.name)}</span>
                  <div class="flex-1">
                    <p class="font-bold text-slate-700 dark:text-slate-300 text-xs">{item.name}</p>
                    <p class="text-[10px] text-slate-400 dark:text-slate-500">{item.amount || ''}</p>
                  </div>
                  <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">{item.kcal} kcal</span>
                </div>
              {/each}

              <!-- Add suggestion as meal -->
              <button
                onclick={() => {
                  const itemsText = (s.items || []).map(i => (i.amount ? i.amount + ' ' : '') + i.name).join(', ');
                  handleQuickLog(`${s.name}: ${itemsText}`);
                }}
                disabled={processingLog}
                class="w-full mt-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold text-xs border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {#if processingLog}
                  ⏳ Registrando...
                {:else}
                  ➕ Registrar Refeição
                {/if}
              </button>
            </div>
          {/each}

          {#if suggestTip}
            <div class="rounded-2xl px-4 py-3 text-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300">
              💡 {suggestTip}
            </div>
          {/if}
        </div>
      {/if}

    {:else if dates.length === 0}
      <div class="text-center py-16">
        <p class="text-5xl mb-4">🚀</p>
        <h2 class="text-xl font-black text-slate-900 dark:text-slate-100 mb-2">Bem-vindo ao Bio-Tracker!</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">Use o chat para registrar sua primeira refeição.</p>
        <p class="text-xs text-slate-400 dark:text-slate-500">Toque no ícone de chat no canto inferior direito.</p>
      </div>
    {/if}

    <!-- Active Challenges Summary -->
    {#if social.activeChallenges.length > 0}
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Desafios Ativos</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>
      <div class="space-y-3 mb-6">
        {#each social.activeChallenges.filter(p => p.challenge_instances?.status === 'active').slice(0, 3) as participation (participation.id)}
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
            <span class="text-2xl">{participation.challenge_instances?.challenges?.icon || '🏆'}</span>
            <div class="flex-1">
              <p class="text-xs font-black text-slate-800 dark:text-slate-100">{participation.challenge_instances?.challenges?.title}</p>
              <div class="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1.5">
                <div class="h-full bg-emerald-500 dark:bg-emerald-600 rounded-full transition-all" style="width: {getChallengePct(participation)}%"></div>
              </div>
            </div>
            <span class="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{getChallengePct(participation)}%</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Leaderboard -->
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ranking de Amigos</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>
      <Leaderboard />
    </div>

    <footer class="pb-8 text-center">
      <div class="w-8 h-1 bg-slate-200 dark:bg-slate-700 mx-auto rounded-full mb-6"></div>
      <p class="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em]">Health Intelligence System</p>
    </footer>
  {/if}
</div>

<Chat bind:selectedDate onEntryLogged={loadData} />

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { scrollbar-width: none; }
</style>
