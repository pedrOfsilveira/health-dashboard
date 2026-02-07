<script>
  import { supabase } from './supabase.js';
  import { auth } from './stores.svelte.js';

  let { waterMl = $bindable(0), date = new Date().toISOString().split('T')[0] } = $props();

  const TARGET = 2000; // 2L
  const QUICK_AMOUNTS = [250, 500, 750, 1000]; // ml

  let adding = $state(false);
  let customAmount = $state(250);
  let showCustom = $state(false);

  const progress = $derived(Math.min(100, Math.round((waterMl / TARGET) * 100)));
  const glassesCount = $derived(Math.floor(waterMl / 250));

  async function addWater(amount) {
    if (adding) return;
    adding = true;

    try {
      // Insert water log
      const { error: logError } = await supabase
        .from('water_logs')
        .insert({ 
          user_id: auth.session.user.id,
          date,
          amount_ml: amount 
        });

      if (logError) throw logError;

      // Update day's total
      const { data: day, error: dayError } = await supabase
        .from('days')
        .select('water_ml')
        .eq('user_id', auth.session.user.id)
        .eq('date', date)
        .maybeSingle();

      const newTotal = (day?.water_ml || 0) + amount;

      const { error: updateError } = await supabase
        .from('days')
        .upsert({
          user_id: auth.session.user.id,
          date,
          water_ml: newTotal,
          water_target: TARGET
        }, { 
          onConflict: 'user_id,date' 
        });

      if (updateError) throw updateError;

      // Update local state
      waterMl = newTotal;

      // Check for achievement
      if (newTotal >= TARGET && (day?.water_ml || 0) < TARGET) {
        // First time hitting target today - show celebration
        showCelebration();
      }
    } catch (err) {
      console.error('Error adding water:', err);
      alert('Erro ao registrar água');
    } finally {
      adding = false;
      showCustom = false;
    }
  }

  function showCelebration() {
    // Simple visual feedback
    const btn = document.getElementById('water-tracker');
    if (btn) {
      btn.classList.add('animate-bounce');
      setTimeout(() => btn.classList.remove('animate-bounce'), 1000);
    }
  }
</script>

<div 
  id="water-tracker"
  class="rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 p-4 border border-blue-100 dark:border-blue-900 transition-all duration-300"
  class:shadow-lg={progress >= 100}
  class:shadow-blue-300={progress >= 100}
  class:dark:shadow-blue-900={progress >= 100}
>
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <span class="text-2xl">💧</span>
      <div>
        <h3 class="font-bold text-slate-800 dark:text-slate-200 text-sm">Hidratação</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400">Meta: {TARGET / 1000}L</p>
      </div>
    </div>
    <div class="text-right">
      <p class="text-2xl font-black text-blue-600 dark:text-blue-400">{progress}%</p>
      <p class="text-[10px] text-slate-500 dark:text-slate-400">{waterMl}ml / {TARGET}ml</p>
    </div>
  </div>

  <!-- Progress Bar -->
  <div class="relative h-3 bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden mb-3">
    <div 
      class="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-cyan-500 dark:from-blue-500 dark:to-cyan-600 transition-all duration-500 ease-out"
      style="width: {progress}%"
    >
      {#if progress >= 100}
        <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
      {/if}
    </div>
  </div>

  <!-- Glasses Visual -->
  <div class="flex gap-1 mb-3 justify-center">
    {#each Array(8) as _, i}
      <div 
        class="w-4 h-6 rounded border-2 transition-all duration-300"
        class:bg-blue-400={i < glassesCount}
        class:dark:bg-blue-500={i < glassesCount}
        class:border-blue-500={i < glassesCount}
        class:dark:border-blue-600={i < glassesCount}
        class:bg-white={i >= glassesCount}
        class:dark:bg-slate-800={i >= glassesCount}
        class:border-blue-200={i >= glassesCount}
        class:dark:border-blue-900={i >= glassesCount}
      ></div>
    {/each}
  </div>

  <!-- Quick Add Buttons -->
  {#if !showCustom}
    <div class="grid grid-cols-4 gap-2 mb-2">
      {#each QUICK_AMOUNTS as amount}
        <button
          onclick={() => addWater(amount)}
          disabled={adding}
          class="p-2 bg-white dark:bg-slate-800 rounded-lg border-2 border-blue-200 dark:border-blue-900 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-all text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
        >
          {amount}ml
        </button>
      {/each}
    </div>
    <button
      onclick={() => showCustom = true}
      class="w-full py-2 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
    >
      + Adicionar quantidade personalizada
    </button>
  {:else}
    <div class="flex gap-2 mb-2">
      <input
        type="number"
        bind:value={customAmount}
        min="50"
        max="2000"
        step="50"
        class="flex-1 px-3 py-2 border-2 border-blue-200 dark:border-blue-900 dark:bg-slate-800 dark:text-slate-300 rounded-lg focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none text-sm"
        placeholder="Quantidade em ml"
      />
      <button
        onclick={() => addWater(customAmount)}
        disabled={adding || customAmount < 50}
        class="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm"
      >
        ✓
      </button>
      <button
        onclick={() => showCustom = false}
        class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition-colors text-sm"
      >
        ✕
      </button>
    </div>
  {/if}

  <!-- Motivational Message -->
  {#if progress >= 100}
    <p class="text-center text-xs font-bold text-blue-600 dark:text-blue-400 mt-2">
      🎉 Meta de hidratação alcançada!
    </p>
  {:else if progress >= 75}
    <p class="text-center text-xs text-blue-600 dark:text-blue-400 mt-2">
      💪 Quase lá! Faltam {TARGET - waterMl}ml
    </p>
  {:else if progress >= 50}
    <p class="text-center text-xs text-slate-500 dark:text-slate-400 mt-2">
      👍 Você está no caminho certo!
    </p>
  {:else if progress > 0}
    <p class="text-center text-xs text-slate-500 dark:text-slate-400 mt-2">
      🚰 Continue bebendo água!
    </p>
  {/if}
</div>
