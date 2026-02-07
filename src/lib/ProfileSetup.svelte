<script>
  import { upsertProfile } from './supabase.js';
  import { auth, profile, goals, navigate, calculateGoals } from './stores.svelte.js';

  let step = $state(1);
  const totalSteps = 4;
  let saving = $state(false);
  let error = $state('');

  // Form fields
  let name = $state('');
  let age = $state(25);
  let sex = $state('male');
  let weight_kg = $state(70);
  let height_cm = $state(170);
  let activity_level = $state('moderate');
  let goal_type = $state('health');
  let target_weight_kg = $state(70);
  let health_conditions = $state('');

  // Preview of calculated goals
  let previewGoals = $derived.by(() => {
    const p = { sex, weight: weight_kg, height: height_cm, age, activity_level, goal_type };
    const result = calculateGoals(p);
    return result || { kcal: 2000, ptn: 120, carb: 250, fat: 65 };
  });

  const activityOptions = [
    { value: 'sedentary', label: 'Sedentário', desc: 'Pouco ou nenhum exercício' },
    { value: 'light', label: 'Leve', desc: '1-3 dias/semana' },
    { value: 'moderate', label: 'Moderado', desc: '3-5 dias/semana' },
    { value: 'active', label: 'Ativo', desc: '6-7 dias/semana' },
    { value: 'very_active', label: 'Muito Ativo', desc: 'Treino intenso diário' },
  ];

  const goalOptions = [
    { value: 'health', label: 'Saúde Geral', emoji: '💚', desc: 'Manutenção e bem-estar' },
    { value: 'weight_loss', label: 'Perder Peso', emoji: '📉', desc: 'Déficit calórico controlado' },
    { value: 'weight_gain', label: 'Ganhar Peso', emoji: '📈', desc: 'Superávit calórico' },
    { value: 'hypertrophy', label: 'Hipertrofia', emoji: '💪', desc: 'Ganho muscular otimizado' },
  ];

  function nextStep() {
    if (step === 1 && !name.trim()) {
      error = 'Digite seu nome.';
      return;
    }
    error = '';
    if (step < totalSteps) step++;
  }

  function prevStep() {
    error = '';
    if (step > 1) step--;
  }

  async function handleSave() {
    if (!auth.session?.user) return;
    saving = true;
    error = '';

    const conditionsArray = health_conditions
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);

    try {
      const profileData = {
        user_id: auth.session.user.id,
        name: name.trim(),
        age,
        sex,
        weight: weight_kg,
        height: height_cm,
        activity_level,
        goal_type,
        target_weight: target_weight_kg,
        health_conditions: conditionsArray.join(', '),
        goal_kcal: previewGoals.kcal,
        goal_ptn: previewGoals.ptn,
        goal_carb: previewGoals.carb,
        goal_fat: previewGoals.fat,
      };

      const saved = await upsertProfile(profileData);
      profile.data = saved;
      profile.needsSetup = false;
      
      const calculated = calculateGoals(saved);
      if (calculated) {
        goals.kcal = calculated.kcal;
        goals.ptn = calculated.ptn;
        goals.carb = calculated.carb;
        goals.fat = calculated.fat;
      }
      
      navigate('dashboard');
    } catch (err) {
      error = 'Erro ao salvar: ' + err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 flex items-center justify-center p-4">
  <div class="w-full max-w-lg">
    <!-- Header -->
    <div class="text-center mb-6">
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">Vamos Configurar! 🚀</h1>
      <p class="text-sm text-slate-500 mt-1">Passo {step} de {totalSteps}</p>
      <!-- Progress bar -->
      <div class="mt-4 h-2 bg-slate-200 rounded-full overflow-hidden max-w-xs mx-auto">
        <div
          class="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style="width: {(step / totalSteps) * 100}%"
        ></div>
      </div>
    </div>

    <div class="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium mb-4">
          {error}
        </div>
      {/if}

      <!-- Step 1: Basic Info -->
      {#if step === 1}
        <h2 class="text-lg font-black text-slate-900 mb-6">👤 Sobre Você</h2>

        <div class="space-y-4">
          <div>
            <label for="name" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome</label>
            <input
              id="name"
              type="text"
              bind:value={name}
              placeholder="Como quer ser chamado?"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="age" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Idade</label>
              <input id="age" type="number" bind:value={age} min="14" max="100"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all" />
            </div>
            <div>
              <span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sexo</span>
              <div class="flex gap-2" role="group" aria-label="Sexo">
                <button
                  type="button"
                  onclick={() => sex = 'male'}
                  class="flex-1 py-3 rounded-2xl font-bold text-sm transition-all {sex === 'male' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}"
                >♂ Masc</button>
                <button
                  type="button"
                  onclick={() => sex = 'female'}
                  class="flex-1 py-3 rounded-2xl font-bold text-sm transition-all {sex === 'female' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}"
                >♀ Fem</button>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="weight" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Peso (kg)</label>
              <input id="weight" type="number" bind:value={weight_kg} min="30" max="300" step="0.1"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all" />
            </div>
            <div>
              <label for="height" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Altura (cm)</label>
              <input id="height" type="number" bind:value={height_cm} min="100" max="250"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all" />
            </div>
          </div>
        </div>

      <!-- Step 2: Activity Level -->
      {:else if step === 2}
        <h2 class="text-lg font-black text-slate-900 mb-6">🏃 Nível de Atividade</h2>

        <div class="space-y-3">
          {#each activityOptions as opt (opt.value)}
            <button
              type="button"
              onclick={() => activity_level = opt.value}
              class="w-full p-4 rounded-2xl text-left transition-all flex items-center gap-4 {activity_level === opt.value ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm' : 'bg-slate-50 border-2 border-transparent hover:border-slate-200'}"
            >
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 {activity_level === opt.value ? 'border-emerald-500' : 'border-slate-300'}">
                {#if activity_level === opt.value}
                  <div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                {/if}
              </div>
              <div>
                <p class="font-bold text-sm text-slate-900">{opt.label}</p>
                <p class="text-xs text-slate-500">{opt.desc}</p>
              </div>
            </button>
          {/each}
        </div>

      <!-- Step 3: Goal -->
      {:else if step === 3}
        <h2 class="text-lg font-black text-slate-900 mb-6">🎯 Seu Objetivo</h2>

        <div class="grid grid-cols-2 gap-3 mb-6">
          {#each goalOptions as opt (opt.value)}
            <button
              type="button"
              onclick={() => goal_type = opt.value}
              class="p-4 rounded-2xl text-center transition-all {goal_type === opt.value ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm' : 'bg-slate-50 border-2 border-transparent hover:border-slate-200'}"
            >
              <span class="text-2xl block mb-2">{opt.emoji}</span>
              <p class="font-bold text-sm text-slate-900">{opt.label}</p>
              <p class="text-[10px] text-slate-500 mt-1">{opt.desc}</p>
            </button>
          {/each}
        </div>

        {#if goal_type === 'weight_loss' || goal_type === 'weight_gain'}
          <div>
            <label for="target-weight" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Peso Alvo (kg)</label>
            <input id="target-weight" type="number" bind:value={target_weight_kg} min="30" max="300" step="0.1"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all" />
          </div>
        {/if}

        <!-- Preview calculated goals -->
        <div class="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Suas Metas Calculadas</p>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div>
              <p class="text-lg font-black text-slate-900">{previewGoals.kcal}</p>
              <p class="text-[9px] font-bold text-slate-400 uppercase">kcal</p>
            </div>
            <div>
              <p class="text-lg font-black text-emerald-600">{previewGoals.ptn}g</p>
              <p class="text-[9px] font-bold text-slate-400 uppercase">ptn</p>
            </div>
            <div>
              <p class="text-lg font-black text-amber-600">{previewGoals.carb}g</p>
              <p class="text-[9px] font-bold text-slate-400 uppercase">carb</p>
            </div>
            <div>
              <p class="text-lg font-black text-red-500">{previewGoals.fat}g</p>
              <p class="text-[9px] font-bold text-slate-400 uppercase">fat</p>
            </div>
          </div>
        </div>

      <!-- Step 4: Health Conditions -->
      {:else if step === 4}
        <h2 class="text-lg font-black text-slate-900 mb-2">🏥 Condições de Saúde</h2>
        <p class="text-sm text-slate-500 mb-6">Informe qualquer condição para personalizar suas recomendações. Opcional — pode pular.</p>

        <div>
          <label for="conditions" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Condições (separadas por vírgula)
          </label>
          <textarea
            id="conditions"
            bind:value={health_conditions}
            placeholder="Ex: diabetes tipo 2, hipertensão, alergia a lactose..."
            rows="3"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
          ></textarea>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          {#each ['Diabetes', 'Hipertensão', 'Colesterol alto', 'Lactose', 'Glúten', 'Gastrite'] as tag (tag)}
            <button
              type="button"
              onclick={() => {
                if (health_conditions) health_conditions += ', ';
                health_conditions += tag;
              }}
              class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
            >+ {tag}</button>
          {/each}
        </div>

        <!-- Final summary -->
        <div class="mt-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
          <p class="text-sm font-bold text-emerald-800 mb-2">✅ Resumo do seu perfil</p>
          <div class="text-xs text-emerald-700 space-y-1">
            <p><strong>{name}</strong> • {age} anos • {sex === 'male' ? 'Masculino' : 'Feminino'}</p>
            <p>{weight_kg}kg • {height_cm}cm • {activityOptions.find(a => a.value === activity_level)?.label}</p>
            <p>Objetivo: <strong>{goalOptions.find(g => g.value === goal_type)?.label}</strong></p>
            <p>Meta: {previewGoals.kcal} kcal | {previewGoals.ptn}g P | {previewGoals.carb}g C | {previewGoals.fat}g F</p>
          </div>
        </div>
      {/if}

      <!-- Navigation buttons -->
      <div class="flex gap-3 mt-8">
        {#if step > 1}
          <button
            type="button"
            onclick={prevStep}
            class="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
          >
            ← Voltar
          </button>
        {/if}

        {#if step < totalSteps}
          <button
            type="button"
            onclick={nextStep}
            class="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 active:scale-[0.98] transition-all"
          >
            Próximo →
          </button>
        {:else}
          <button
            type="button"
            onclick={handleSave}
            disabled={saving}
            class="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {#if saving}
              Salvando...
            {:else}
              🚀 Começar!
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
