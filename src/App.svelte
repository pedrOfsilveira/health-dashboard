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
  import MealPlanner from './lib/MealPlanner.svelte';
  import { supabase } from './lib/supabase.js';

  // You need to generate a VAPID public and private key pair.
  // The public key should be exposed to the client, e.g., via environment variables.
  // For Supabase Edge Functions, you can put the private key in Deno.env.
  // Generate keys: web-push generate-vapid-keys
  const VAPID_PUBLIC_KEY = import.meta.env.VITE_APP_VAPID_PUBLIC_KEY; // Placeholder

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported by this browser.');
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error('VAPID Public Key is not set. Cannot subscribe to push notifications.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        console.log('Existing push subscription found:', subscription);
      } else {
        console.log('No existing subscription, creating new one...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('New push subscription created:', subscription);
      }

      // Send subscription to your backend to save it
      const subJson = subscription.toJSON();
      const payload = {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh ?? null,
          auth: subJson.keys?.auth ?? null,
        },
      };

      // Bail out if keys are missing (browser didn't provide them)
      if (!payload.keys.p256dh || !payload.keys.auth) {
        console.warn('Push subscription keys missing, skipping save.');
        return;
      }
      
      const { data, error } = await supabase.functions.invoke('push-subscriptions', {
        body: payload,
      });

      if (error) {
        console.error('Failed to save push subscription:', error);
      } else {
        console.log('Push subscription saved on backend:', data);
      }
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  }


  onMount(() => {
    initTheme();
    initAuth();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker Registered!', reg))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    // Call subscribeToPushNotifications when user is authenticated
    $effect(() => {
      if (auth.session) {
        // Delay slightly to give SW time to activate and avoid immediate prompt
        setTimeout(subscribeToPushNotifications, 3000); 
      }
    });

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

<main class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-emerald-100 dark:selection:bg-emerald-900 transition-colors flex flex-col">
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
  {:else if router.page === 'meal-planner'}
    <MealPlanner />
  {:else if router.page === 'dashboard'}
    <Dashboard />
  {:else}
    <Login />
  {/if}
</main>

<style>
  :global(body) {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  }
</style>
