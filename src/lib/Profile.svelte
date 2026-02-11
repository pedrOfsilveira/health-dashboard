<script>
  import { profile, goals, streak, achievements, xp, navigate, auth, calculateGoals } from './stores.svelte.js';
  import { upsertProfile, fetchNotificationPreferences, upsertNotificationPreferences } from './supabase.js';
  import { exportCSV, exportPDF } from './exportData.js';
  import BadgeGrid from './BadgeGrid.svelte';
  import { onMount } from 'svelte';

  let editing = $state(false);
  let saving = $state(false);
  let exporting = $state(false);
  let form = $state(/** @type {any} */ ({}));

  // Notification preferences
  let notifLoading = $state(true);
  let notifSaving = $state(false);
  let notif = $state({
    water_enabled: false,
    water_interval_minutes: 60,
    water_start_time: '08:00',
    water_end_time: '22:00',
    creatine_enabled: false,
    creatine_time: '09:00',
    meal_enabled: false,
    meal_breakfast_time: '07:30',
    meal_lunch_time: '12:00',
    meal_snack_time: '15:30',
    meal_dinner_time: '19:30',
  });

  onMount(async () => {
    if (auth.session?.user?.id) {
      try {
        const prefs = await fetchNotificationPreferences(auth.session.user.id);
        if (prefs) {
          // Strip seconds from time strings (DB returns HH:MM:SS)
          const strip = (t) => t ? t.slice(0, 5) : t;
          notif = {
            water_enabled: prefs.water_enabled,
            water_interval_minutes: prefs.water_interval_minutes,
            water_start_time: strip(prefs.water_start_time),
            water_end_time: strip(prefs.water_end_time),
            creatine_enabled: prefs.creatine_enabled,
            creatine_time: strip(prefs.creatine_time),
            meal_enabled: prefs.meal_enabled,
            meal_breakfast_time: strip(prefs.meal_breakfast_time),
            meal_lunch_time: strip(prefs.meal_lunch_time),
            meal_snack_time: strip(prefs.meal_snack_time),
            meal_dinner_time: strip(prefs.meal_dinner_time),
          };
        }
      } catch (e) {
        console.error('Failed to load notification preferences:', e);
      } finally {
        notifLoading = false;
      }
    } else {
      notifLoading = false;
    }
  });

  async function saveNotifPrefs() {
    notifSaving = true;
    try {
      await upsertNotificationPreferences({
        user_id: auth.session.user.id,
        ...notif,
      });
    } catch (e) {
      alert('Erro ao salvar notificações: ' + e.message);
    } finally {
      notifSaving = false;
    }
  }

  const activityLabels = {
    sedentary: 'Sedentário',
    light: 'Leve',
    lightly_active: 'Leve',
    moderate: 'Moderado',
    moderately_active: 'Moderado',
    active: 'Ativo',
    very_active: 'Muito ativo',
    extra_active: 'Extremamente ativo',
  };

  // Deduplicated options for the edit dropdown
  const activityEditOptions = [
    { value: 'sedentary', label: 'Sedentário' },
    { value: 'light', label: 'Leve' },
    { value: 'moderate', label: 'Moderado' },
    { value: 'active', label: 'Ativo' },
    { value: 'very_active', label: 'Muito ativo' },
  ];

  const goalLabels = {
    health: '🌿 Saúde geral',
    weight_loss: '🔥 Emagrecer',
    weight_gain: '💪 Ganhar peso',
    hypertrophy: '🏋️ Hipertrofia',
  };

  function startEdit() {
    form = { ...profile.data };
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  async function saveProfile() {
    if (form.goal_type === 'weight_loss' && form.target_weight && form.target_weight >= form.weight) {
      alert('Para perder peso, o peso alvo deve ser menor que seu peso atual.');
      return;
    }
    if (form.goal_type === 'weight_gain' && form.target_weight && form.target_weight <= form.weight) {
      alert('Para ganhar peso, o peso alvo deve ser maior que seu peso atual.');
      return;
    }
    saving = true;
    try {
      const calculated = calculateGoals(form);
      const dataToSave = {
        ...form,
        user_id: auth.session.user.id,
      };
      if (calculated) {
        dataToSave.goal_kcal = calculated.kcal;
        dataToSave.goal_ptn = calculated.ptn;
        dataToSave.goal_carb = calculated.carb;
        dataToSave.goal_fat = calculated.fat;
      }
      await upsertProfile(dataToSave);
      profile.data = { ...form };
      if (calculated) {
        goals.kcal = calculated.kcal;
        goals.ptn = calculated.ptn;
        goals.carb = calculated.carb;
        goals.fat = calculated.fat;
      }
      editing = false;
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      saving = false;
    }
  }

  let bmi = $derived.by(() => {
    const p = profile.data;
    if (!p || !p.weight || !p.height) return null;
    const h = p.height / 100;
    return (p.weight / (h * h)).toFixed(1);
  });

  let bmiCategory = $derived.by(() => {
    if (!bmi) return '';
    const v = parseFloat(bmi);
    if (v < 18.5) return 'Abaixo do peso';
    if (v < 25) return 'Peso normal';
    if (v < 30) return 'Sobrepeso';
    return 'Obesidade';
  });
</script>

<div class="w-full max-w-[500px] mx-auto px-4 pb-10">
  <!-- Back button -->
  <button
    onclick={() => navigate('dashboard')}
    class="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-6 mt-2"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
    Voltar
  </button>

  <!-- Profile Header -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center gap-5 mb-6">
      <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-3xl text-white font-black shadow-lg shadow-emerald-500/30">
        {(profile.data?.name || '?')[0].toUpperCase()}
      </div>
      <div class="flex-1">
        <h1 class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{profile.data?.name || 'Usuário'}</h1>
        <p class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">Level {xp.level} • {xp.title}</p>
      </div>
    </div>

    <!-- XP Bar -->
    <div class="mb-2">
      <div class="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">
        <span>XP Total: {xp.total}</span>
        <span>Level {xp.level}</span>
      </div>
      <div class="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-700"
          style="width: {Math.min(100, (xp.total / ((xp.level + 1) * 200)) * 100)}%"
        ></div>
      </div>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-3 gap-3 mb-6">
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center transition-colors">
      <p class="text-2xl font-black text-slate-900 dark:text-slate-100">🔥 {streak.current}</p>
      <p class="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">Streak</p>
    </div>
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center transition-colors">
      <p class="text-2xl font-black text-slate-900 dark:text-slate-100">🏆 {achievements.unlocked.length}</p>
      <p class="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">Badges</p>
    </div>
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center transition-colors">
      <p class="text-2xl font-black text-slate-900 dark:text-slate-100">⚡ {xp.total}</p>
      <p class="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">XP Total</p>
    </div>
  </div>

  <!-- Body Info -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center justify-between mb-5">
      <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Dados Corporais</span>
      {#if !editing}
        <button onclick={startEdit} class="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors">Editar ✏️</button>
      {/if}
    </div>

    {#if editing}
      <div class="space-y-4">
        <div>
          <label for="pf-name" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Nome</label>
          <input id="pf-name" bind:value={form.name} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="pf-age" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Idade</label>
            <input id="pf-age" type="number" bind:value={form.age} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label for="pf-sex" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Sexo</label>
            <select id="pf-sex" bind:value={form.sex} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100">
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
              <option value="other">Outro</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="pf-weight" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Peso (kg)</label>
            <input id="pf-weight" type="number" bind:value={form.weight} step="0.1" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label for="pf-height" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Altura (cm)</label>
            <input id="pf-height" type="number" bind:value={form.height} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
          </div>
        </div>
        <div>
          <label for="pf-activity" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Nível de Atividade</label>
          <select id="pf-activity" bind:value={form.activity_level} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100">
            {#each activityEditOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="pf-goal" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo de Objetivo</label>
          <select id="pf-goal" bind:value={form.goal_type} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100">
            {#each Object.entries(goalLabels) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
        </div>
        {#if form.goal_type === 'weight_loss' || form.goal_type === 'weight_gain' || form.goal_type === 'hypertrophy'}
          <div>
            <label for="pf-target" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Peso Alvo (kg)</label>
            <input id="pf-target" type="number" bind:value={form.target_weight} step="0.1" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
            {#if form.goal_type === 'weight_loss' && form.target_weight >= form.weight}
              <p class="text-xs text-red-500 dark:text-red-400 mt-1">O peso alvo deve ser menor que seu peso atual ({form.weight} kg).</p>
            {:else if form.goal_type === 'weight_gain' && form.target_weight <= form.weight}
              <p class="text-xs text-red-500 dark:text-red-400 mt-1">O peso alvo deve ser maior que seu peso atual ({form.weight} kg).</p>
            {/if}
          </div>
        {/if}
        <div>
          <label for="pf-health" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Condições de Saúde</label>
          <textarea id="pf-health" bind:value={form.health_conditions} rows="2" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium resize-none text-slate-900 dark:text-slate-100"></textarea>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick={cancelEdit} class="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancelar</button>
          <button onclick={saveProfile} disabled={saving} class="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Idade</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{profile.data?.age || '—'} anos</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Sexo</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{profile.data?.sex === 'male' ? 'Masculino' : profile.data?.sex === 'female' ? 'Feminino' : 'Outro'}</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Peso</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{profile.data?.weight || '—'} kg</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Altura</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{profile.data?.height || '—'} cm</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">IMC</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{bmi || '—'} <span class="text-[10px] font-medium text-slate-400 dark:text-slate-500">({bmiCategory})</span></p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Atividade</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">{activityLabels[profile.data?.activity_level] || '—'}</p>
          </div>
        </div>

        <div class="border-t border-slate-100 dark:border-slate-700 pt-4">
          <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Objetivo</p>
          <p class="text-sm font-black text-slate-800 dark:text-slate-100">{goalLabels[profile.data?.goal_type] || '—'}</p>
          {#if profile.data?.target_weight}
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Peso alvo: {profile.data.target_weight} kg</p>
          {/if}
        </div>

        {#if profile.data?.health_conditions}
          <div class="border-t border-slate-100 dark:border-slate-700 pt-4">
            <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Condições de Saúde</p>
            <p class="text-sm text-slate-700 dark:text-slate-300">{profile.data.health_conditions}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Current Goals -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Metas Calculadas (TDEE)</span>
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-slate-900 dark:text-slate-100">{goals.kcal}</p>
        <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-1">kcal / dia</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-emerald-700 dark:text-emerald-400">{goals.ptn}g</p>
        <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-1">Proteína</p>
      </div>
      <div class="bg-amber-50 dark:bg-amber-900/30 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-amber-700 dark:text-amber-400">{goals.carb}g</p>
        <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-1">Carboidrato</p>
      </div>
      <div class="bg-red-50 dark:bg-red-900/30 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-red-600 dark:text-red-400">{goals.fat}g</p>
        <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-1">Gordura</p>
      </div>
    </div>
  </div>

  <!-- Notifications Settings -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Notificações</span>
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
    </div>

    {#if notifLoading}
      <div class="flex items-center justify-center py-6">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
      </div>
    {:else}
      <div class="space-y-6">

        <!-- Water reminders -->
        <div>
          <label class="flex items-center justify-between cursor-pointer group">
            <div class="flex items-center gap-3">
              <span class="text-xl">💧</span>
              <div>
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100">Lembrete de Água</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Notificações periódicas para beber água</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Ativar lembrete de água"
              aria-checked={notif.water_enabled}
              onclick={() => notif.water_enabled = !notif.water_enabled}
              class="relative w-11 h-6 rounded-full transition-colors {notif.water_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"
            >
              <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform {notif.water_enabled ? 'translate-x-5' : ''}"></span>
            </button>
          </label>
          {#if notif.water_enabled}
            <div class="mt-3 ml-9 space-y-3">
              <div>
                <label for="water-interval" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Intervalo</label>
                <select id="water-interval" bind:value={notif.water_interval_minutes} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100">
                  <option value={30}>A cada 30 min</option>
                  <option value={60}>A cada 1 hora</option>
                  <option value={90}>A cada 1h30</option>
                  <option value={120}>A cada 2 horas</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="water-start" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Início</label>
                  <input id="water-start" type="time" bind:value={notif.water_start_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label for="water-end" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Fim</label>
                  <input id="water-end" type="time" bind:value={notif.water_end_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="h-px bg-slate-100 dark:bg-slate-700"></div>

        <!-- Creatine reminder -->
        <div>
          <label class="flex items-center justify-between cursor-pointer group">
            <div class="flex items-center gap-3">
              <span class="text-xl">💊</span>
              <div>
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100">Lembrete de Creatina</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Lembrete diário para tomar creatina</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Ativar lembrete de creatina"
              aria-checked={notif.creatine_enabled}
              onclick={() => notif.creatine_enabled = !notif.creatine_enabled}
              class="relative w-11 h-6 rounded-full transition-colors {notif.creatine_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"
            >
              <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform {notif.creatine_enabled ? 'translate-x-5' : ''}"></span>
            </button>
          </label>
          {#if notif.creatine_enabled}
            <div class="mt-3 ml-9">
              <label for="creatine-time" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Horário</label>
              <input id="creatine-time" type="time" bind:value={notif.creatine_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
            </div>
          {/if}
        </div>

        <div class="h-px bg-slate-100 dark:bg-slate-700"></div>

        <!-- Meal reminders -->
        <div>
          <label class="flex items-center justify-between cursor-pointer group">
            <div class="flex items-center gap-3">
              <span class="text-xl">🍽️</span>
              <div>
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100">Lembretes de Refeição</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Lembretes para registrar suas refeições</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Ativar lembretes de refeição"
              aria-checked={notif.meal_enabled}
              onclick={() => notif.meal_enabled = !notif.meal_enabled}
              class="relative w-11 h-6 rounded-full transition-colors {notif.meal_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"
            >
              <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform {notif.meal_enabled ? 'translate-x-5' : ''}"></span>
            </button>
          </label>
          {#if notif.meal_enabled}
            <div class="mt-3 ml-9 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="meal-breakfast" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">☕ Café</label>
                  <input id="meal-breakfast" type="time" bind:value={notif.meal_breakfast_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label for="meal-lunch" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">🍽️ Almoço</label>
                  <input id="meal-lunch" type="time" bind:value={notif.meal_lunch_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label for="meal-snack" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">🍎 Lanche</label>
                  <input id="meal-snack" type="time" bind:value={notif.meal_snack_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label for="meal-dinner" class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">🌙 Jantar</label>
                  <input id="meal-dinner" type="time" bind:value={notif.meal_dinner_time} class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100" />
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Save button -->
      <button
        onclick={saveNotifPrefs}
        disabled={notifSaving}
        class="w-full mt-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60"
      >
        {notifSaving ? 'Salvando...' : '💾 Salvar Preferências'}
      </button>
    {/if}
  </div>

  <!-- Badges Section -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Conquistas</span>
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
    </div>
    <BadgeGrid />
  </div>

  <!-- Export Data -->
  <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm p-6 mb-6 transition-colors">
    <div class="flex items-center gap-3 mb-3">
      <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Exportar Dados</span>
      <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Baixe seus registros de nutrição, sono e saúde.</p>
    <div class="flex gap-3">
      <button
        onclick={async () => { exporting = true; try { await exportCSV(auth.session?.user?.id); } finally { exporting = false; } }}
        disabled={exporting}
        class="flex-1 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl font-bold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-900/50 disabled:opacity-50"
      >
        📄 CSV
      </button>
      <button
        onclick={async () => { exporting = true; try { await exportPDF(auth.session?.user?.id, { name: profile.data?.name, ...goals }); } finally { exporting = false; } }}
        disabled={exporting}
        class="flex-1 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-2xl font-bold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-900/50 disabled:opacity-50"
      >
        📑 PDF
      </button>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/50 rounded-3xl shadow-sm p-6 transition-colors">
    <div class="flex items-center gap-3 mb-3">
      <span class="text-[10px] font-black text-red-400 dark:text-red-500 uppercase tracking-widest">Zona de Perigo</span>
      <div class="flex-1 h-px bg-red-100 dark:bg-red-900/50"></div>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Ações irreversíveis sobre a sua conta.</p>
    <button class="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-900/50">
      🗑️ Excluir minha conta
    </button>
  </div>
</div>
