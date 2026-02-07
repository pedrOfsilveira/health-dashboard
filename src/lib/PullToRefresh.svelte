<script>
  import { onMount } from 'svelte';

  let { onRefresh = () => {} } = $props();

  let touchStartY = $state(0);
  let touchCurrentY = $state(0);
  let isPulling = $state(false);
  let isRefreshing = $state(false);
  let pullDistance = $state(0);

  const PULL_THRESHOLD = 80; // pixels to trigger refresh
  const MAX_PULL = 120; // max pull distance

  function handleTouchStart(e) {
    if (window.scrollY === 0 && !isRefreshing) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }

  function handleTouchMove(e) {
    if (!isPulling || isRefreshing) return;

    touchCurrentY = e.touches[0].clientY;
    const diff = touchCurrentY - touchStartY;

    if (diff > 0 && window.scrollY === 0) {
      pullDistance = Math.min(diff, MAX_PULL);
      
      // Prevent default scroll behavior when pulling
      if (pullDistance > 10) {
        e.preventDefault();
      }
    }
  }

  async function handleTouchEnd() {
    if (!isPulling || isRefreshing) return;

    if (pullDistance >= PULL_THRESHOLD) {
      // Trigger refresh
      isRefreshing = true;
      
      try {
        await onRefresh();
      } catch (err) {
        console.error('Refresh error:', err);
      } finally {
        setTimeout(() => {
          isRefreshing = false;
          pullDistance = 0;
          isPulling = false;
        }, 500);
      }
    } else {
      // Reset
      pullDistance = 0;
      isPulling = false;
    }
  }

  onMount(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  });

  const pullProgress = $derived(Math.min((pullDistance / PULL_THRESHOLD) * 100, 100));
  const rotation = $derived(pullProgress * 3.6); // 360 degrees at 100%
</script>

{#if isPulling || isRefreshing}
  <div 
    class="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-200"
    style="height: {Math.min(pullDistance, MAX_PULL)}px; opacity: {pullDistance / PULL_THRESHOLD}"
  >
    <div 
      class="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center border-2 border-emerald-500 transition-transform"
      style="transform: rotate({isRefreshing ? 0 : rotation}deg)"
      class:animate-spin={isRefreshing}
    >
      {#if isRefreshing}
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      {/if}
    </div>
  </div>
{/if}
