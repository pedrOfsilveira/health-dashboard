<script>
  import { achievements } from './stores.svelte.js';
  import { fetchBadgeDefinitions } from './supabase.js';
  import { onMount } from 'svelte';

  let allBadges = $state([]);
  let loading = $state(true);

  // Default badge definitions if none from DB
  const defaultBadges = [
    { id: 'first_meal', name: 'Primeira Refeição', icon: '🍽️', description: 'Registrou sua primeira refeição' },
    { id: 'streak_3', name: 'Constância 3', icon: '🔥', description: '3 dias seguidos registrando' },
    { id: 'streak_7', name: 'Semana Perfeita', icon: '⭐', description: '7 dias seguidos' },
    { id: 'streak_30', name: 'Mês de Ferro', icon: '💎', description: '30 dias seguidos' },
    { id: 'protein_master', name: 'Mestre em Proteína', icon: '💪', description: 'Bateu meta de proteína 7x' },
    { id: 'goal_hit', name: 'Meta Atingida', icon: '🎯', description: 'Bateu todas as metas do dia' },
    { id: 'early_bird', name: 'Madrugador', icon: '🐦', description: 'Registrou antes das 8h' },
    { id: 'sleep_master', name: 'Sono Sagrado', icon: '😴', description: '7+ horas de sono por 7 dias' },
    { id: 'level_5', name: 'Nível 5', icon: '🌟', description: 'Alcançou level 5' },
    { id: 'level_10', name: 'Lendário', icon: '⚡', description: 'Alcançou level 10' },
  ];

  onMount(async () => {
    try {
      const badges = await fetchBadgeDefinitions();
      allBadges = badges.length > 0 ? badges : defaultBadges;
    } catch {
      allBadges = defaultBadges;
    } finally {
      loading = false;
    }
  });

  let unlockedIds = $derived(new Set(achievements.unlocked.map(a => a.badge_id || a.id)));
</script>

{#if loading}
  <div class="flex justify-center py-6">
    <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="grid grid-cols-4 gap-3">
    {#each allBadges as badge}
      {@const unlocked = unlockedIds.has(badge.id)}
      <div
        class="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all
          {unlocked ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-100 opacity-40 grayscale'}"
        title={badge.description}
      >
        <span class="text-2xl">{badge.icon}</span>
        <p class="text-[9px] font-bold text-center leading-tight
          {unlocked ? 'text-amber-700' : 'text-slate-400'}">{badge.name}</p>
      </div>
    {/each}
  </div>
  {#if allBadges.length === 0}
    <p class="text-xs text-slate-400 text-center py-4">Nenhuma conquista disponível ainda.</p>
  {/if}
{/if}
