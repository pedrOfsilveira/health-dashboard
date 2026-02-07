<script>
  import { onMount } from 'svelte';
  import { auth, navigate, social, loadSocialData } from './stores.svelte.js';
  import { fetchChallenges, fetchActiveChallenges, startChallenge, fetchChallengeParticipants, fetchFriendProfiles } from './supabase.js';
  import ConfettiCelebration from './ConfettiCelebration.svelte';

  let catalog = $state([]);
  let myChallenges = $state([]);
  let friends = $state([]);
  let loading = $state(true);
  let activeTab = $state('active'); // 'active' | 'catalog'
  let startingId = $state(null);
  let showFriendPicker = $state(false);
  let pickerChallengeId = $state(null);
  let showConfetti = $state(false);

  // Filter catalog
  let filterType = $state('all'); // 'all' | 'solo' | 'duo'

  let filteredCatalog = $derived(
    filterType === 'all' ? catalog : catalog.filter(c => c.type === filterType)
  );

  let activeChallenges = $derived(
    myChallenges.filter(p => p.challenge_instances?.status === 'active')
  );

  let completedChallenges = $derived(
    myChallenges.filter(p => p.completed_at || p.challenge_instances?.status === 'completed')
  );

  onMount(async () => {
    loading = true;
    try {
      const [catalogData, myData, friendData] = await Promise.all([
        fetchChallenges(),
        fetchActiveChallenges(auth.session.user.id),
        fetchFriendProfiles(auth.session.user.id),
      ]);
      catalog = catalogData;
      myChallenges = myData;
      friends = friendData;
    } catch (e) {
      console.error('Error loading challenges:', e);
    } finally {
      loading = false;
    }
  });

  async function handleStartSolo(challengeId) {
    startingId = challengeId;
    try {
      await startChallenge(challengeId, auth.session.user.id);
      myChallenges = await fetchActiveChallenges(auth.session.user.id);
      activeTab = 'active';
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      startingId = null;
    }
  }

  function handleStartDuo(challengeId) {
    if (friends.length === 0) {
      alert('Você precisa ter amigos adicionados para iniciar um desafio duo! 🤝');
      navigate('friends');
      return;
    }
    pickerChallengeId = challengeId;
    showFriendPicker = true;
  }

  async function handlePickFriend(friendId) {
    showFriendPicker = false;
    startingId = pickerChallengeId;
    try {
      await startChallenge(pickerChallengeId, auth.session.user.id, friendId);
      myChallenges = await fetchActiveChallenges(auth.session.user.id);
      activeTab = 'active';
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      startingId = null;
      pickerChallengeId = null;
    }
  }

  function getDifficultyColor(difficulty) {
    switch (difficulty) {
      case 'easy': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'hard': return 'bg-red-50 text-red-700 border-red-200';
      case 'legendary': return 'bg-purple-50 text-purple-700 border-purple-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }

  function getDifficultyLabel(difficulty) {
    switch (difficulty) {
      case 'easy': return 'Fácil';
      case 'medium': return 'Médio';
      case 'hard': return 'Difícil';
      case 'legendary': return 'Lendário';
      default: return difficulty;
    }
  }

  function getDaysRemaining(endDate) {
    const end = new Date(endDate + 'T23:59:59');
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  function isAlreadyActive(challengeId) {
    return myChallenges.some(
      p => p.challenge_instances?.challenge_id === challengeId &&
           p.challenge_instances?.status === 'active'
    );
  }
</script>

<ConfettiCelebration bind:trigger={showConfetti} />

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

  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-2xl font-black text-slate-900 tracking-tight">⚡ Desafios</h1>
    <p class="text-xs text-slate-500 font-medium mt-1">Complete desafios, ganhe XP e compita com amigos!</p>
  </div>

  <!-- Tab Navigation -->
  <div class="flex gap-2 mb-6">
    <button
      onclick={() => activeTab = 'active'}
      class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
        {activeTab === 'active' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
    >
      Meus ({activeChallenges.length})
    </button>
    <button
      onclick={() => activeTab = 'catalog'}
      class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
        {activeTab === 'catalog' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
    >
      Catálogo
    </button>
    {#if completedChallenges.length > 0}
      <button
        onclick={() => activeTab = 'completed'}
        class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
          {activeTab === 'completed' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
      >
        Feitos ✓
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center h-32 gap-3">
      <div class="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
    </div>

  <!-- Active Challenges -->
  {:else if activeTab === 'active'}
    {#if activeChallenges.length === 0}
      <div class="bg-white border border-slate-200 rounded-3xl p-8 text-center">
        <p class="text-4xl mb-3">🎮</p>
        <p class="text-sm font-bold text-slate-400">Nenhum desafio ativo</p>
        <p class="text-xs text-slate-400 mt-1">Escolha um desafio no catálogo para começar!</p>
        <button
          onclick={() => activeTab = 'catalog'}
          class="mt-4 px-6 py-2.5 bg-emerald-500 text-white rounded-2xl text-xs font-black hover:bg-emerald-600 transition-colors"
        >
          🏆 Ver Catálogo
        </button>
      </div>
    {:else}
      <div class="space-y-4">
        {#each activeChallenges as participation (participation.id)}
          {@const instance = participation.challenge_instances}
          {@const challenge = instance?.challenges}
          {@const progress = participation.progress || 0}
          {@const target = challenge?.target_value || 1}
          {@const pct = Math.min(100, Math.round((progress / target) * 100))}
          {@const daysLeft = getDaysRemaining(instance?.end_date)}

          <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 hover:shadow-md transition-all" style="animation: slideUp 0.3s ease-out">
            <!-- Header -->
            <div class="flex items-center gap-3 mb-4">
              <span class="text-3xl">{challenge?.icon || '🏆'}</span>
              <div class="flex-1">
                <h3 class="font-black text-slate-800 text-sm">{challenge?.title}</h3>
                <p class="text-[10px] text-slate-400 font-medium mt-0.5">{challenge?.description}</p>
              </div>
              <div class="text-right">
                <p class="text-[10px] font-black text-slate-500 uppercase">{daysLeft}d</p>
                <p class="text-[8px] font-bold text-slate-400">restantes</p>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="mb-3">
              <div class="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                <span>{progress} / {target}</span>
                <span class="text-emerald-600">{pct}%</span>
              </div>
              <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700 {pct >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-emerald-500'}"
                  style="width: {pct}%"
                ></div>
              </div>
            </div>

            <!-- Reward -->
            <div class="flex items-center justify-between">
              <div class="flex gap-2">
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                  ⚡ {challenge?.xp_reward} XP
                </span>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border {getDifficultyColor(challenge?.difficulty)}">
                  {getDifficultyLabel(challenge?.difficulty)}
                </span>
                {#if challenge?.type === 'duo'}
                  <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-violet-50 text-violet-700 rounded-lg border border-violet-200">
                    🤝 Duo
                  </span>
                {/if}
              </div>
              {#if pct >= 100}
                <span class="text-[10px] font-black text-emerald-600 uppercase">✓ Completo!</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  <!-- Catalog -->
  {:else if activeTab === 'catalog'}
    <!-- Type filter -->
    <div class="flex gap-2 mb-4">
      <button
        onclick={() => filterType = 'all'}
        class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
          {filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}"
      >
        Todos
      </button>
      <button
        onclick={() => filterType = 'solo'}
        class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
          {filterType === 'solo' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}"
      >
        🧍 Solo
      </button>
      <button
        onclick={() => filterType = 'duo'}
        class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
          {filterType === 'duo' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}"
      >
        🤝 Duo
      </button>
    </div>

    <div class="space-y-3">
      {#each filteredCatalog as challenge (challenge.id)}
        {@const alreadyActive = isAlreadyActive(challenge.id)}
        <div class="bg-white border border-slate-200 rounded-3xl p-5 hover:border-slate-300 transition-all">
          <div class="flex items-start gap-4">
            <span class="text-3xl mt-0.5">{challenge.icon}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-black text-slate-800 text-sm">{challenge.title}</h3>
                {#if challenge.type === 'duo'}
                  <span class="px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded-md text-[8px] font-black uppercase">DUO</span>
                {/if}
              </div>
              <p class="text-xs text-slate-500 mb-3">{challenge.description}</p>

              <div class="flex gap-2 flex-wrap mb-3">
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                  ⚡ {challenge.xp_reward} XP
                </span>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-slate-50 text-slate-600 rounded-lg border border-slate-200">
                  📅 {challenge.duration_days} dias
                </span>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border {getDifficultyColor(challenge.difficulty)}">
                  {getDifficultyLabel(challenge.difficulty)}
                </span>
              </div>

              {#if alreadyActive}
                <span class="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase">
                  ✓ Já ativo
                </span>
              {:else if challenge.type === 'solo'}
                <button
                  onclick={() => handleStartSolo(challenge.id)}
                  disabled={startingId === challenge.id}
                  class="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  {startingId === challenge.id ? '⏳ Iniciando...' : '🚀 Começar Solo'}
                </button>
              {:else}
                <button
                  onclick={() => handleStartDuo(challenge.id)}
                  disabled={startingId === challenge.id}
                  class="px-4 py-2 bg-violet-500 text-white rounded-xl text-xs font-black hover:bg-violet-600 transition-colors disabled:opacity-50"
                >
                  {startingId === challenge.id ? '⏳ Iniciando...' : '🤝 Desafiar Amigo'}
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

  <!-- Completed -->
  {:else if activeTab === 'completed'}
    <div class="space-y-3">
      {#each completedChallenges as participation (participation.id)}
        {@const challenge = participation.challenge_instances?.challenges}
        <div class="bg-white border border-emerald-200 rounded-3xl p-5 opacity-80">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{challenge?.icon || '🏆'}</span>
            <div class="flex-1">
              <h3 class="font-black text-slate-800 text-sm">{challenge?.title}</h3>
              <p class="text-[10px] text-emerald-600 font-bold mt-0.5">
                ✓ Completado • +{challenge?.xp_reward} XP ganhos
              </p>
            </div>
            <span class="text-2xl">✅</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Friend Picker Modal -->
{#if showFriendPicker}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
    <div class="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[400px] max-h-[60vh] overflow-hidden" style="animation: slideUp 0.3s ease-out">
      <div class="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
        <span class="text-sm font-black">Escolha um amigo para desafiar</span>
        <button onclick={() => showFriendPicker = false} class="p-1 hover:bg-slate-800 rounded-lg transition-colors" aria-label="Fechar">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-4 overflow-y-auto max-h-[50vh] space-y-2">
        {#each friends as friend (friend.user_id)}
          <button
            onclick={() => handlePickFriend(friend.user_id)}
            class="w-full p-4 rounded-2xl border border-slate-200 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
          >
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-sm text-white font-black">
              {(friend.name || '?')[0].toUpperCase()}
            </div>
            <div class="flex-1">
              <p class="font-black text-slate-800 text-sm">{friend.name}</p>
              <p class="text-[10px] text-slate-400 font-bold">🔥 {friend.current_streak} • ⚡ {friend.xp_total || 0} XP</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        {/each}
        {#if friends.length === 0}
          <div class="text-center py-8">
            <p class="text-sm text-slate-400 font-bold">Nenhum amigo encontrado</p>
            <p class="text-xs text-slate-400 mt-1">Adicione amigos primeiro!</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
