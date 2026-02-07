<script>
  import { auth, navigate, social, xp, computeLevel, loadSocialData } from './stores.svelte.js';
  import { supabase, searchUserByEmail, sendFriendRequest, respondFriendRequest, removeFriend, fetchFriendProfiles, fetchPendingRequests } from './supabase.js';

  let searchEmail = $state('');
  let searchResult = $state(null);
  let searchError = $state('');
  let searching = $state(false);
  let sending = $state(false);
  let friends = $state([]);
  let loadingFriends = $state(true);
  let activeTab = $state('friends'); // 'friends' | 'requests' | 'search'

  // Load friends on mount
  import { onMount } from 'svelte';

  onMount(async () => {
    await loadFriends();
    await loadRequests();
  });

  async function loadFriends() {
    loadingFriends = true;
    try {
      friends = await fetchFriendProfiles(auth.session.user.id);
    } catch (e) {
      console.error('Error loading friends:', e);
    } finally {
      loadingFriends = false;
    }
  }

  async function loadRequests() {
    try {
      const pending = await fetchPendingRequests(auth.session.user.id);
      social.pendingRequests = pending || [];
      social.pendingCount = pending?.length || 0;
    } catch (e) {
      console.error('Error loading requests:', e);
    }
  }

  async function handleSearch() {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    if (email === auth.session?.user?.email) {
      searchError = 'Você não pode adicionar a si mesmo 😅';
      searchResult = null;
      return;
    }

    searching = true;
    searchError = '';
    searchResult = null;

    try {
      const result = await searchUserByEmail(email);
      if (result) {
        // Check if already friends
        const isFriend = friends.some(f => f.user_id === result.user_id);
        const hasPending = social.pendingRequests.some(r => r.requester_id === result.user_id);
        searchResult = { ...result, isFriend, hasPending };
      } else {
        searchError = 'Nenhum usuário encontrado com este email';
      }
    } catch (e) {
      searchError = 'Erro ao buscar: ' + e.message;
    } finally {
      searching = false;
    }
  }

  async function handleSendRequest() {
    if (!searchResult) return;
    sending = true;
    try {
      await sendFriendRequest(searchResult.user_id);
      searchResult = { ...searchResult, requestSent: true };
      searchEmail = '';
    } catch (e) {
      if (e.message?.includes('duplicate') || e.code === '23505') {
        searchError = 'Convite já enviado ou vocês já são amigos!';
      } else {
        searchError = 'Erro ao enviar convite: ' + e.message;
      }
    } finally {
      sending = false;
    }
  }

  async function handleRespond(request, accept) {
    try {
      await respondFriendRequest(request.id, accept);
      social.pendingRequests = social.pendingRequests.filter(r => r.id !== request.id);
      social.pendingCount = social.pendingRequests.length;
      if (accept) {
        await loadFriends(); // Refresh friend list
      }
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  async function handleRemoveFriend(friend) {
    if (!confirm(`Remover ${friend.name} da lista de amigos?`)) return;
    try {
      // We need the friendship ID — look it up
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(requester_id.eq.${auth.session.user.id},addressee_id.eq.${friend.user_id}),and(requester_id.eq.${friend.user_id},addressee_id.eq.${auth.session.user.id})`)
        .eq('status', 'accepted')
        .single();
      if (data) {
        await removeFriend(data.id);
        friends = friends.filter(f => f.user_id !== friend.user_id);
      }
    } catch (e) {
      alert('Erro ao remover: ' + e.message);
    }
  }

  function getFriendLevel(xpTotal) {
    return computeLevel(xpTotal || 0);
  }

  function handleSearchKeydown(e) {
    if (e.key === 'Enter') handleSearch();
  }
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

  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-2xl font-black text-slate-900 tracking-tight">👥 Amigos</h1>
    <p class="text-xs text-slate-500 font-medium mt-1">Convide amigos, compare progresso e desafie-os!</p>
  </div>

  <!-- Tab Navigation -->
  <div class="flex gap-2 mb-6">
    <button
      onclick={() => activeTab = 'friends'}
      class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
        {activeTab === 'friends' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
    >
      Amigos ({friends.length})
    </button>
    <button
      onclick={() => activeTab = 'requests'}
      class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all relative
        {activeTab === 'requests' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
    >
      Convites
      {#if social.pendingCount > 0}
        <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
          {social.pendingCount}
        </span>
      {/if}
    </button>
    <button
      onclick={() => activeTab = 'search'}
      class="flex-1 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
        {activeTab === 'search' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}"
    >
      Buscar
    </button>
  </div>

  <!-- Search Tab -->
  {#if activeTab === 'search'}
    <div class="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 mb-6">
      <div class="flex items-center gap-3 mb-5">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Convidar por Email</span>
        <div class="flex-1 h-px bg-slate-200"></div>
      </div>

      <div class="flex gap-2 mb-4">
        <input
          type="email"
          bind:value={searchEmail}
          onkeydown={handleSearchKeydown}
          placeholder="email@exemplo.com"
          class="flex-1 h-12 px-4 bg-slate-50 rounded-2xl text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        <button
          onclick={handleSearch}
          disabled={searching || !searchEmail.trim()}
          class="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 disabled:opacity-50 transition-all"
        >
          {#if searching}
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          {/if}
        </button>
      </div>

      {#if searchError}
        <div class="rounded-2xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700 font-medium">
          {searchError}
        </div>
      {/if}

      {#if searchResult}
        <div class="rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xl text-white font-black shadow-md">
            {(searchResult.name || '?')[0].toUpperCase()}
          </div>
          <div class="flex-1">
            <h3 class="font-black text-slate-800 text-sm">{searchResult.name}</h3>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              {getFriendLevel(searchResult.xp_total).title} • {searchResult.xp_total || 0} XP
            </p>
          </div>
          {#if searchResult.isFriend}
            <span class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase">✓ Amigos</span>
          {:else if searchResult.requestSent || searchResult.hasPending}
            <span class="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-black uppercase">Enviado</span>
          {:else}
            <button
              onclick={handleSendRequest}
              disabled={sending}
              class="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {sending ? '...' : '+ Convidar'}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="rounded-2xl px-4 py-3 text-sm bg-blue-50 border border-blue-200 text-blue-700">
      💡 <span class="font-bold">Dica:</span> Digite o email completo do seu amigo. Ele precisa ter uma conta no Bio-Tracker.
    </div>
  {/if}

  <!-- Pending Requests Tab -->
  {#if activeTab === 'requests'}
    <div class="space-y-3">
      {#if social.pendingRequests.length === 0}
        <div class="bg-white border border-slate-200 rounded-3xl p-8 text-center">
          <p class="text-4xl mb-3">📭</p>
          <p class="text-sm font-bold text-slate-400">Nenhum convite pendente</p>
          <p class="text-xs text-slate-400 mt-1">Quando alguém te convidar, aparecerá aqui!</p>
        </div>
      {:else}
        {#each social.pendingRequests as request (request.id)}
          <div class="bg-white border border-slate-200 rounded-3xl p-5 flex items-center gap-4" style="animation: slideUp 0.3s ease-out">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-xl text-white font-black shadow-md">
              {(request.requester_name || '?')[0].toUpperCase()}
            </div>
            <div class="flex-1">
              <h3 class="font-black text-slate-800 text-sm">{request.requester_name}</h3>
              <p class="text-[10px] text-slate-400 font-bold mt-0.5">Quer ser seu amigo!</p>
            </div>
            <div class="flex gap-2">
              <button
                onclick={() => handleRespond(request, true)}
                class="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center hover:bg-emerald-600 transition-colors"
                title="Aceitar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onclick={() => handleRespond(request, false)}
                class="w-10 h-10 bg-red-100 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-200 transition-colors"
                title="Recusar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Friends List Tab -->
  {#if activeTab === 'friends'}
    {#if loadingFriends}
      <div class="flex flex-col items-center justify-center h-32 gap-3">
        <div class="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
      </div>
    {:else if friends.length === 0}
      <div class="bg-white border border-slate-200 rounded-3xl p-8 text-center">
        <p class="text-4xl mb-3">🤝</p>
        <p class="text-sm font-bold text-slate-400">Nenhum amigo ainda</p>
        <p class="text-xs text-slate-400 mt-1">Convide alguém pela aba "Buscar"!</p>
        <button
          onclick={() => activeTab = 'search'}
          class="mt-4 px-6 py-2.5 bg-emerald-500 text-white rounded-2xl text-xs font-black hover:bg-emerald-600 transition-colors"
        >
          ✨ Convidar Primeiro Amigo
        </button>
      </div>
    {:else}
      <div class="space-y-3">
        {#each friends as friend (friend.user_id)}
          {@const level = getFriendLevel(friend.xp_total)}
          <div class="bg-white border border-slate-200 rounded-3xl p-5 flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xl text-white font-black shadow-md relative">
              {(friend.name || '?')[0].toUpperCase()}
              {#if friend.current_streak > 0}
                <div class="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                  🔥
                </div>
              {/if}
            </div>
            <div class="flex-1">
              <h3 class="font-black text-slate-800 text-sm">{friend.name}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[10px] font-bold text-emerald-600">Lv{level.level}</span>
                <span class="text-[10px] text-slate-300">•</span>
                <span class="text-[10px] font-bold text-slate-400">{friend.xp_total || 0} XP</span>
                {#if friend.current_streak > 0}
                  <span class="text-[10px] text-slate-300">•</span>
                  <span class="text-[10px] font-bold text-orange-500">🔥 {friend.current_streak}</span>
                {/if}
              </div>
            </div>
            <div class="flex gap-2">
              <button
                onclick={() => { navigate('challenges'); }}
                class="p-2.5 bg-slate-50 text-slate-600 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                title="Desafiar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
              <button
                onclick={() => handleRemoveFriend(friend)}
                class="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Remover"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
