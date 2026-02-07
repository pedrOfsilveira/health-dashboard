<script>
  import { onMount } from 'svelte';
  import { auth, navigate, computeLevel } from './stores.svelte.js';
  import { fetchLeaderboard } from './supabase.js';

  let leaderboard = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      leaderboard = await fetchLeaderboard(auth.session.user.id);
    } catch (e) {
      console.error('Leaderboard error:', e);
    } finally {
      loading = false;
    }
  });

  function getMedalEmoji(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}º`;
  }
</script>

{#if loading}
  <div class="flex justify-center py-4">
    <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else if leaderboard.length <= 1}
  <div class="text-center py-4">
    <p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Adicione amigos para ver o ranking! 🤝</p>
    <button
      onclick={() => navigate('friends')}
      class="mt-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
    >
      + Convidar Amigos
    </button>
  </div>
{:else}
  <div class="space-y-2">
    {#each leaderboard as entry, idx (entry.user_id)}
      {@const level = computeLevel(entry.xp_total || 0)}
      <div class="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors
        {entry.isMe ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}">
        <!-- Position -->
        <span class="text-sm font-black w-8 text-center {idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-700' : 'text-slate-300 dark:text-slate-600'}">
          {getMedalEmoji(idx)}
        </span>

        <!-- Avatar -->
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-xs text-white font-black
          {entry.isMe ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-slate-400 to-slate-500'}">
          {(entry.name || '?')[0].toUpperCase()}
        </div>

        <!-- Name & Level -->
        <div class="flex-1 min-w-0">
          <p class="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            {entry.name || 'Usuário'}
            {#if entry.isMe}
              <span class="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">(você)</span>
            {/if}
          </p>
          <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500">Lv{level.level} • {level.title}</p>
        </div>

        <!-- Stats -->
        <div class="text-right flex items-center gap-2">
          {#if entry.current_streak > 0}
            <span class="text-[10px] font-bold text-orange-500 dark:text-orange-400">🔥{entry.current_streak}</span>
          {/if}
          <span class="text-[10px] font-black text-slate-600 dark:text-slate-300">⚡{entry.xp_total || 0}</span>
        </div>
      </div>
    {/each}
  </div>
{/if}
