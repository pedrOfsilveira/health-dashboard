<script>
  import { achievements } from './stores.svelte.js';

  let visible = $state(false);
  let current = $state(null);
  let timeout = $state(null);

  $effect(() => {
    if (achievements.latest && achievements.latest !== current) {
      current = achievements.latest;
      visible = true;
      clearTimeout(timeout);
      timeout = setTimeout(() => { visible = false; }, 5000);
    }
  });
</script>

{#if visible && current}
  <div
    class="fixed top-6 left-1/2 -translate-x-1/2 z-[200] animate-slide-down"
  >
    <div class="bg-white border border-amber-200 shadow-xl shadow-amber-500/20 rounded-3xl px-6 py-4 flex items-center gap-4 min-w-[280px]">
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-200 flex items-center justify-center text-3xl shadow-inner">
        {current.icon || '🏆'}
      </div>
      <div class="flex-1">
        <p class="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest">Nova Conquista!</p>
        <p class="text-sm font-black text-slate-900 mt-0.5">{current.name}</p>
        <p class="text-[10px] text-slate-500 font-medium mt-0.5">{current.description || ''}</p>
      </div>
      <button
        onclick={() => { visible = false; }}
        class="text-slate-300 hover:text-slate-500 transition-colors"
        aria-label="Fechar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-down {
    from { opacity: 0; transform: translate(-50%, -100%); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .animate-slide-down {
    animation: slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
</style>
