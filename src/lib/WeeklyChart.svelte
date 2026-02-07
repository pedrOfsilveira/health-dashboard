<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  let { data = {} } = $props();

  let canvasEl = $state(null);
  let chartInstance = null;

  // Get last 7 days sorted ascending
  let chartData = $derived.by(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayData = data[dateStr];
      days.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }).replace('.', ''),
        kcal: dayData?.summary?.kcal || 0,
        ptn: dayData?.summary?.ptn || 0,
      });
    }
    return days;
  });

  function buildChart() {
    if (!canvasEl) return;
    if (chartInstance) chartInstance.destroy();

    const ctx = canvasEl.getContext('2d');

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.label),
        datasets: [
          {
            label: 'Calorias',
            data: chartData.map(d => d.kcal),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderRadius: 8,
            borderSkipped: false,
            yAxisID: 'y',
            order: 2,
          },
          {
            label: 'Proteína (g)',
            data: chartData.map(d => d.ptn),
            type: 'line',
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 2.5,
            pointBackgroundColor: '#6366f1',
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: true,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 16,
              font: { size: 11, weight: 'bold', family: 'system-ui' },
              color: '#64748b',
            },
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 11, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 12,
            displayColors: true,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === 'Calorias') return ` ${ctx.raw.toLocaleString('pt-BR')} kcal`;
                return ` ${ctx.raw}g proteína`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, weight: 'bold' },
              color: '#94a3b8',
            },
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            ticks: {
              font: { size: 10 },
              color: '#94a3b8',
              callback: (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v,
            },
            title: {
              display: true,
              text: 'kcal',
              font: { size: 10, weight: 'bold' },
              color: '#10b981',
            },
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 10 },
              color: '#94a3b8',
            },
            title: {
              display: true,
              text: 'g ptn',
              font: { size: 10, weight: 'bold' },
              color: '#6366f1',
            },
          },
        },
      },
    });
  }

  onMount(() => {
    buildChart();
    return () => { if (chartInstance) chartInstance.destroy(); };
  });

  // Rebuild chart when data changes
  $effect(() => {
    // Access chartData to track dependency
    chartData;
    // Skip initial build (onMount handles it)
    if (canvasEl && chartInstance) buildChart();
  });
</script>

<div class="w-full h-[220px]">
  <canvas bind:this={canvasEl}></canvas>
</div>
