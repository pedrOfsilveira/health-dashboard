<script>
  import { signIn, signInWithGithub } from './supabase.js';
  import { navigate } from './stores.svelte.js';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      error = 'Preencha todos os campos.';
      return;
    }
    error = '';
    loading = true;
    try {
      await signIn(email, password);
      // Auth listener in stores.svelte.js will handle navigation
    } catch (err) {
      error = err.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos.'
        : err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 dark:from-slate-900 dark:to-emerald-950 flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 shadow-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <h1 class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Bio-Tracker</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Seu assistente de saúde inteligente</p>
    </div>

    <!-- Card -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
      <h2 class="text-xl font-black text-slate-900 dark:text-slate-100 mb-6">Entrar</h2>

      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium mb-4">
          {error}
        </div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="email" class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="seu@email.com"
            class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            disabled={loading}
          />
        </div>

        <div>
          <label for="password" class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Senha</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="••••••••"
            class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full py-3.5 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black text-sm tracking-tight hover:bg-slate-800 dark:hover:bg-slate-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {#if loading}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              Entrando...
            </span>
          {:else}
            Entrar
          {/if}
        </button>
      </form>

      <!-- Divider -->
      <div class="flex items-center gap-3 my-6">
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ou</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
      </div>

      <!-- GitHub Login -->
      <button
        onclick={() => signInWithGithub()}
        class="w-full py-3.5 bg-[#24292f] text-white rounded-2xl font-black text-sm tracking-tight hover:bg-[#1b1f23] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Entrar com GitHub
      </button>

      <div class="mt-6 text-center">
        <p class="text-sm text-slate-500">
          Não tem conta?
          <button onclick={() => navigate('register')} class="text-emerald-600 font-bold hover:text-emerald-700 transition-colors">
            Criar conta
          </button>
        </p>
      </div>
    </div>

    <p class="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-6">
      Health Intelligence System
    </p>
  </div>
</div>
