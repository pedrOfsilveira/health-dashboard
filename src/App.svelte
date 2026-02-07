<script>
  import { onMount } from 'svelte';
  import './app.css';
  import { auth, router, initAuth } from './lib/stores.svelte.js';
  import { initTheme } from './lib/theme.svelte.js';
  import Login from './lib/Login.svelte';
  import Register from './lib/Register.svelte';
  import ProfileSetup from './lib/ProfileSetup.svelte';
  import Dashboard from './lib/Dashboard.svelte';
  import Profile from './lib/Profile.svelte';
  import Friends from './lib/Friends.svelte';
  import Challenges from './lib/Challenges.svelte';

  onMount(() => {
    initTheme();
    initAuth();
    
    // Ultimate failsafe: if still loading after 10s, force exit
    setTimeout(() => {
      if (auth.loading) {
        console.warn('[App] Loading timeout - forcing exit');
        auth.loading = false;
        if (!auth.session) {
          router.page = 'login';
        }
      }
    }, 10000);
  });
</script>

<main class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-emerald-100 dark:selection:bg-emerald-900 transition-colors">
  {#if auth.loading}
    <div class="flex h-screen items-center justify-center flex-col gap-4">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
      <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Bio-Tracker</p>
    </div>
  {:else if router.page === 'login'}
    <Login />
  {:else if router.page === 'register'}
    <Register />
  {:else if router.page === 'setup'}
    <ProfileSetup />
  {:else if router.page === 'profile'}
    <Profile />
  {:else if router.page === 'friends'}
    <Friends />
  {:else if router.page === 'challenges'}
    <Challenges />
  {:else if router.page === 'dashboard'}
    <Dashboard />
  {:else}
    <Login />
  {/if}
</main>

<style>
  :global(body) {
    background-color: #f8fafc;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  }
</style>
