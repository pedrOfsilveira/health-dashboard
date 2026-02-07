<script>
  import { profile, goals, streak, achievements, xp, navigate, auth } from './stores.svelte.js';
  import { upsertProfile } from './supabase.js';
  import BadgeGrid from './BadgeGrid.svelte';

  let editing = $state(false);
  let saving = $state(false);
  let form = $state({});

  const activityLabels = {
    sedentary: 'Sedentário',
    lightly_active: 'Levemente ativo',
    moderately_active: 'Moderadamente ativo',
    very_active: 'Muito ativo',
    extra_active: 'Extremamente ativo',
  };

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
    saving = true;
    try {
      await upsertProfile({
        ...form,
        user_id: auth.session.user.id,
      });
      profile.data = { ...form };
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
    class="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors mb-6 mt-2"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
    Voltar
  </button>

  <!-- Profile Header -->
  <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
    <div class="flex items-center gap-5 mb-6">
      <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-3xl text-white font-black shadow-lg shadow-emerald-500/30">
        {(profile.data?.name || '?')[0].toUpperCase()}
      </div>
      <div class="flex-1">
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">{profile.data?.name || 'Usuário'}</h1>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Level {xp.level} • {xp.title}</p>
      </div>
    </div>

    <!-- XP Bar -->
    <div class="mb-2">
      <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
        <span>XP Total: {xp.total}</span>
        <span>Level {xp.level}</span>
      </div>
      <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-700"
          style="width: {Math.min(100, (xp.total / ((xp.level + 1) * 200)) * 100)}%"
        ></div>
      </div>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-3 gap-3 mb-6">
    <div class="bg-white border border-slate-200 rounded-2xl p-4 text-center">
      <p class="text-2xl font-black text-slate-900">🔥 {streak.current}</p>
      <p class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">Streak</p>
    </div>
    <div class="bg-white border border-slate-200 rounded-2xl p-4 text-center">
      <p class="text-2xl font-black text-slate-900">🏆 {achievements.unlocked.length}</p>
      <p class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">Badges</p>
    </div>
    <div class="bg-white border border-slate-200 rounded-2xl p-4 text-center">
      <p class="text-2xl font-black text-slate-900">⚡ {xp.total}</p>
      <p class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">XP Total</p>
    </div>
  </div>

  <!-- Body Info -->
  <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
    <div class="flex items-center justify-between mb-5">
      <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dados Corporais</span>
      {#if !editing}
        <button onclick={startEdit} class="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors">Editar ✏️</button>
      {/if}
    </div>

    {#if editing}
      <div class="space-y-4">
        <div>
          <label for="pf-name" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome</label>
          <input id="pf-name" bind:value={form.name} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="pf-age" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Idade</label>
            <input id="pf-age" type="number" bind:value={form.age} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" />
          </div>
          <div>
            <label for="pf-sex" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sexo</label>
            <select id="pf-sex" bind:value={form.sex} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium">
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="pf-weight" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Peso (kg)</label>
            <input id="pf-weight" type="number" bind:value={form.weight} step="0.1" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" />
          </div>
          <div>
            <label for="pf-height" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Altura (cm)</label>
            <input id="pf-height" type="number" bind:value={form.height} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" />
          </div>
        </div>
        <div>
          <label for="pf-activity" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nível de Atividade</label>
          <select id="pf-activity" bind:value={form.activity_level} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium">
            {#each Object.entries(activityLabels) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="pf-goal" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo de Objetivo</label>
          <select id="pf-goal" bind:value={form.goal_type} class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium">
            {#each Object.entries(goalLabels) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
        </div>
        {#if form.goal_type === 'weight_loss' || form.goal_type === 'weight_gain'}
          <div>
            <label for="pf-target" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Peso Alvo (kg)</label>
            <input id="pf-target" type="number" bind:value={form.target_weight} step="0.1" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" />
          </div>
        {/if}
        <div>
          <label for="pf-health" class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Condições de Saúde</label>
          <textarea id="pf-health" bind:value={form.health_conditions} rows="2" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium resize-none"></textarea>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick={cancelEdit} class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors">Cancelar</button>
          <button onclick={saveProfile} disabled={saving} class="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">Idade</p>
            <p class="text-sm font-black text-slate-800">{profile.data?.age || '—'} anos</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">Sexo</p>
            <p class="text-sm font-black text-slate-800">{profile.data?.sex === 'male' ? 'Masculino' : 'Feminino'}</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">Peso</p>
            <p class="text-sm font-black text-slate-800">{profile.data?.weight || '—'} kg</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">Altura</p>
            <p class="text-sm font-black text-slate-800">{profile.data?.height || '—'} cm</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">IMC</p>
            <p class="text-sm font-black text-slate-800">{bmi || '—'} <span class="text-[10px] font-medium text-slate-400">({bmiCategory})</span></p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-slate-400 uppercase">Atividade</p>
            <p class="text-sm font-black text-slate-800">{activityLabels[profile.data?.activity_level] || '—'}</p>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-4">
          <p class="text-[9px] font-bold text-slate-400 uppercase mb-1">Objetivo</p>
          <p class="text-sm font-black text-slate-800">{goalLabels[profile.data?.goal_type] || '—'}</p>
          {#if profile.data?.target_weight}
            <p class="text-xs text-slate-500 mt-0.5">Peso alvo: {profile.data.target_weight} kg</p>
          {/if}
        </div>

        {#if profile.data?.health_conditions}
          <div class="border-t border-slate-100 pt-4">
            <p class="text-[9px] font-bold text-slate-400 uppercase mb-1">Condições de Saúde</p>
            <p class="text-sm text-slate-700">{profile.data.health_conditions}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Current Goals -->
  <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Metas Calculadas (TDEE)</span>
      <div class="flex-1 h-px bg-slate-200"></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-slate-50 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-slate-900">{goals.kcal}</p>
        <p class="text-[9px] font-bold text-slate-400 uppercase mt-1">kcal / dia</p>
      </div>
      <div class="bg-emerald-50 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-emerald-700">{goals.ptn}g</p>
        <p class="text-[9px] font-bold text-slate-400 uppercase mt-1">Proteína</p>
      </div>
      <div class="bg-amber-50 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-amber-700">{goals.carb}g</p>
        <p class="text-[9px] font-bold text-slate-400 uppercase mt-1">Carboidrato</p>
      </div>
      <div class="bg-red-50 rounded-2xl p-4 text-center">
        <p class="text-2xl font-black text-red-600">{goals.fat}g</p>
        <p class="text-[9px] font-bold text-slate-400 uppercase mt-1">Gordura</p>
      </div>
    </div>
  </div>

  <!-- Badges Section -->
  <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Conquistas</span>
      <div class="flex-1 h-px bg-slate-200"></div>
    </div>
    <BadgeGrid />
  </div>

  <!-- Danger Zone -->
  <div class="bg-white border border-red-100 rounded-3xl shadow-sm p-6">
    <div class="flex items-center gap-3 mb-3">
      <span class="text-[10px] font-black text-red-400 uppercase tracking-widest">Zona de Perigo</span>
      <div class="flex-1 h-px bg-red-100"></div>
    </div>
    <p class="text-xs text-slate-500 mb-4">Ações irreversíveis sobre a sua conta.</p>
    <button class="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-bold text-sm hover:bg-red-100 transition-colors border border-red-200">
      🗑️ Excluir minha conta
    </button>
  </div>
</div>
