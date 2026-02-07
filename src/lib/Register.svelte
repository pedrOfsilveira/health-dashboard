<script>
  import { signUp, signIn } from './supabase.js';
  import { navigate } from './stores.svelte.js';

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let success = $state('');
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    success = '';

    if (!email || !password || !confirmPassword) {
      error = 'Preencha todos os campos.';
      return;
    }
    if (password.length < 6) {
      error = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    if (password !== confirmPassword) {
      error = 'As senhas não coincidem.';
      return;
    }

    loading = true;
    try {
      const data = await signUp(email, password);
      if (data.user && data.session) {
        // Auto-confirmed — auth listener will navigate to setup
        success = 'Conta criada! Redirecionando...';
      } else if (data.user) {
        // Fallback: auto-login if signup didn't return session
        await signIn(email, password);
      }
    } catch (err) {
      if (err.message.includes('already registered')) {
        error = 'Este email já está cadastrado.';
      } else {
        error = err.message;
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto mb-4 shadow-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">Bio-Tracker</h1>
      <p class="text-sm text-slate-500 mt-1">Crie sua conta e comece a rastrear</p>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
      <h2 class="text-xl font-black text-slate-900 mb-6">Criar Conta</h2>

      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium mb-4">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-medium mb-4">
          {success}
        </div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="reg-email" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
          <input
            id="reg-email"
            type="email"
            bind:value={email}
            placeholder="seu@email.com"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            disabled={loading}
          />
        </div>

        <div>
          <label for="reg-password" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Senha</label>
          <input
            id="reg-password"
            type="password"
            bind:value={password}
            placeholder="Mínimo 6 caracteres"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            disabled={loading}
          />
        </div>

        <div>
          <label for="reg-confirm" class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirmar Senha</label>
          <input
            id="reg-confirm"
            type="password"
            bind:value={confirmPassword}
            placeholder="Repita a senha"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-sm tracking-tight hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {#if loading}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              Criando...
            </span>
          {:else}
            Criar Conta
          {/if}
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-sm text-slate-500">
          Já tem conta?
          <button onclick={() => navigate('login')} class="text-emerald-600 font-bold hover:text-emerald-700 transition-colors">
            Entrar
          </button>
        </p>
      </div>
    </div>
  </div>
</div>
