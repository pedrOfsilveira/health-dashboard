<script>
  let { trigger = $bindable(false) } = $props();

  $effect(() => {
    if (trigger) {
      launchConfetti();
      trigger = false;
    }
  });

  async function launchConfetti() {
    try {
      const confetti = (await import('canvas-confetti')).default;
      const end = Date.now() + 2000;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#10b981', '#f59e0b', '#ef4444'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#10b981', '#f59e0b', '#ef4444'],
        });
        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    } catch (e) {
      console.warn('Confetti unavailable:', e);
    }
  }
</script>
