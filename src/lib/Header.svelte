<script>
  import { signOut } from './supabase.js';
  import { auth, profile, streak, xp, social, getXpForNextLevel, navigate } from './stores.svelte.js';

  let menuOpen = $state(false);

  let xpProgress = $derived(getXpForNextLevel(xp.total));

  function formatDate() {
    return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  async function handleLogout() {
    menuOpen = false;
    await signOut();
  }
</script>

<header class="flex justify-between items-center mb-8 pt-4">
  <div>
    <h1 class="text-2xl font-black text-slate-900 tracking-tight">Bio-Tracker</h1>
    <p class="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1 first-letter:uppercase">{formatDate()}</p>
  </div>

  <div class="flex items-center gap-3">
    <!-- Streak -->
    {#if streak.current > 0}
      <div class="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200">
        <span class="text-base">🔥</span>
        <span class="text-sm font-black text-orange-600">{streak.current}</span>
      </div>
    {/if}

    <!-- XP / Level badge -->
    <div class="hidden sm:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
      <span class="text-xs font-black text-slate-500">Lv{xp.level}</span>
      <div class="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: {xpProgress.progress}%"></div>
      </div>
    </div>

    <!-- User avatar / menu trigger -->
    <div class="relative">
      <button
        onclick={() => menuOpen = !menuOpen}
        class="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg hover:bg-slate-800 transition-colors relative"
      >
        <span class="text-sm font-black">
          {profile.data?.name?.[0]?.toUpperCase() || '?'}
        </span>
        {#if social.pendingCount > 0}
          <span class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-slate-50 animate-pulse">
            {social.pendingCount}
          </span>
        {/if}
      </button>

      {#if menuOpen}
        <!-- Backdrop -->
        <button class="fixed inset-0 z-40 bg-transparent" onclick={() => menuOpen = false} aria-label="Close menu"></button>

        <!-- Dropdown menu -->
        <div class="absolute right-0 top-12 z-50 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
          <!-- User info -->
          <div class="p-4 bg-slate-50 border-b border-slate-100">
            <p class="font-black text-sm text-slate-900">{profile.data?.name || 'Usuário'}</p>
            <p class="text-[10px] text-slate-500 font-medium mt-0.5">{auth.session?.user?.email}</p>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-xs font-bold text-emerald-600">{xp.title}</span>
              <span class="text-[10px] text-slate-400">•</span>
              <span class="text-[10px] font-bold text-slate-400">{xp.total} XP</span>
            </div>
          </div>

          <div class="p-2">
            <button
              onclick={() => { menuOpen = false; navigate('profile'); }}
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
            >
              <span>👤</span> Meu Perfil
            </button>
            <button
              onclick={() => { menuOpen = false; navigate('dashboard'); }}
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
            >
              <span>📊</span> Dashboard
            </button>
            <button
              onclick={() => { menuOpen = false; navigate('friends'); }}
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3 relative"
            >
              <span>👥</span> Amigos
              {#if social.pendingCount > 0}
                <span class="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {social.pendingCount}
                </span>
              {/if}
            </button>
            <button
              onclick={() => { menuOpen = false; navigate('challenges'); }}
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
            >
              <span>⚡</span> Desafios
            </button>
            <hr class="my-1 border-slate-100" />
            <button
              onclick={handleLogout}
              class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
            >
              <span>🚪</span> Sair
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
