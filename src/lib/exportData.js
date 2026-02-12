/**
 * Export user data as CSV or PDF with period filtering.
 * Generates professional reports suitable for nutritionist review.
 */
import { fetchDays, fetchMealsWithItems } from './supabase.js';

// ─── Helpers ────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Return date range [start, end] for a period. */
function getDateRange(period) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start;
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    start = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    start = d.toISOString().split('T')[0];
  } else {
    start = null;
  }
  return { start, end };
}

function filterByPeriod(items, dateField, period) {
  const { start } = getDateRange(period);
  if (!start) return items;
  return items.filter(i => i[dateField] >= start);
}

function periodLabel(period) {
  if (period === 'week') return 'Últimos 7 dias';
  if (period === 'month') return 'Último mês';
  return 'Todos os dados';
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function sleepDuration(start, end) {
  if (!start || !end) return null;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return { hours: Math.floor(diff / 60), minutes: diff % 60, totalMinutes: diff };
}

function pct(val, goal) {
  if (!goal) return 0;
  return Math.round((val / goal) * 100);
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

// ─── CSV Export ─────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {{ name?: string, kcal: number, ptn: number, carb: number, fat: number }} profileGoals
 * @param {'week'|'month'|'all'} period
 */
export async function exportCSV(userId, profileGoals, period = 'all') {
  const [allDays, allMeals] = await Promise.all([
    fetchDays(userId),
    fetchMealsWithItems(userId),
  ]);

  const days = filterByPeriod(allDays, 'date', period);
  const meals = filterByPeriod(allMeals, 'date', period);

  // ─── Header Info ───
  const headerLines = [
    `# Bio-Tracker — Relatório Nutricional`,
    `# Período: ${periodLabel(period)}`,
    `# Paciente: ${profileGoals.name || 'Não informado'}`,
    `# Metas: ${profileGoals.kcal} kcal | ${profileGoals.ptn}g ptn | ${profileGoals.carb}g carb | ${profileGoals.fat}g fat`,
    `# Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
  ];

  // ─── Summary Statistics ───
  const daysWithData = days.filter(d => (d.kcal_total || 0) > 0);
  const avgKcal = avg(daysWithData.map(d => d.kcal_total || 0));
  const avgPtn = avg(daysWithData.map(d => d.ptn_total || 0));
  const avgCarb = avg(daysWithData.map(d => d.carb_total || 0));
  const avgFat = avg(daysWithData.map(d => d.fat_total || 0));
  const avgWater = avg(days.filter(d => d.water_ml > 0).map(d => d.water_ml));
  const sleepDays = days.filter(d => d.sleep_start && d.sleep_end);
  const avgSleepMin = avg(sleepDays.map(d => sleepDuration(d.sleep_start, d.sleep_end)?.totalMinutes || 0));

  const summaryLines = [
    '# RESUMO ESTATÍSTICO',
    'Métrica,Valor,Meta,Atingimento (%)',
    `Dias registrados,${daysWithData.length},,`,
    `Média Kcal/dia,${avgKcal},${profileGoals.kcal},${pct(avgKcal, profileGoals.kcal)}%`,
    `Média Proteína/dia,${avgPtn}g,${profileGoals.ptn}g,${pct(avgPtn, profileGoals.ptn)}%`,
    `Média Carboidrato/dia,${avgCarb}g,${profileGoals.carb}g,${pct(avgCarb, profileGoals.carb)}%`,
    `Média Gordura/dia,${avgFat}g,${profileGoals.fat}g,${pct(avgFat, profileGoals.fat)}%`,
    `Média Água/dia,${avgWater}ml,2000ml,${pct(avgWater, 2000)}%`,
    `Média Sono,${Math.floor(avgSleepMin / 60)}h${String(avgSleepMin % 60).padStart(2, '0')}min,,`,
    '',
  ];

  // ─── Days CSV ───
  const dayHeaders = ['Data', 'Kcal', '% Meta Kcal', 'Proteína (g)', '% Meta Ptn', 'Carboidrato (g)', '% Meta Carb', 'Gordura (g)', '% Meta Fat', 'Água (ml)', 'Sono Início', 'Sono Fim', 'Sono Duração', 'Qualidade Sono', 'Notas'];
  const dayRows = days.map(d => {
    const sl = sleepDuration(d.sleep_start, d.sleep_end);
    return [
      fmtDate(d.date),
      d.kcal_total || 0,
      `${pct(d.kcal_total || 0, profileGoals.kcal)}%`,
      d.ptn_total || 0,
      `${pct(d.ptn_total || 0, profileGoals.ptn)}%`,
      d.carb_total || 0,
      `${pct(d.carb_total || 0, profileGoals.carb)}%`,
      d.fat_total || 0,
      `${pct(d.fat_total || 0, profileGoals.fat)}%`,
      d.water_ml || 0,
      d.sleep_start || '',
      d.sleep_end || '',
      sl ? `${sl.hours}h${String(sl.minutes).padStart(2, '0')}` : '',
      d.sleep_quality || '',
      `"${(d.notes || '').replace(/"/g, '""')}"`,
    ];
  });

  // ─── Meals + Items CSV ───
  const mealHeaders = ['Data', 'Refeição', 'Kcal Total', 'Proteína (g)', 'Carb (g)', 'Gordura (g)', 'Item', 'Item Kcal', 'Item Ptn (g)', 'Item Carb (g)', 'Item Fat (g)'];
  const mealRows = [];
  for (const m of meals) {
    const items = m.meal_items || [];
    if (items.length === 0) {
      mealRows.push([
        fmtDate(m.date),
        `"${(m.name || '').replace(/"/g, '""')}"`,
        m.kcal || 0, m.ptn || 0, m.carb || 0, m.fat || 0,
        '', '', '', '', '',
      ]);
    } else {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        mealRows.push([
          idx === 0 ? fmtDate(m.date) : '',
          idx === 0 ? `"${(m.name || '').replace(/"/g, '""')}"` : '',
          idx === 0 ? (m.kcal || 0) : '',
          idx === 0 ? (m.ptn || 0) : '',
          idx === 0 ? (m.carb || 0) : '',
          idx === 0 ? (m.fat || 0) : '',
          `"${(item.name || '').replace(/"/g, '""')}"`,
          item.kcal || 0,
          item.ptn || 0,
          item.carb || 0,
          item.fat || 0,
        ]);
      }
    }
  }

  const csv = [
    ...headerLines,
    ...summaryLines,
    '# REGISTRO DIÁRIO',
    dayHeaders.join(','),
    ...dayRows.map(r => r.join(',')),
    '',
    '# REFEIÇÕES DETALHADAS',
    mealHeaders.join(','),
    ...mealRows.map(r => r.join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const suffix = period === 'all' ? 'completo' : period === 'month' ? 'mensal' : 'semanal';
  downloadBlob(blob, `bio-tracker-${suffix}-${new Date().toISOString().split('T')[0]}.csv`);
}

// ─── PDF Export ─────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {{ name?: string, kcal: number, ptn: number, carb: number, fat: number }} profileGoals
 * @param {'week'|'month'|'all'} period
 */
export async function exportPDF(userId, profileGoals, period = 'all') {
  const [allDays, allMeals] = await Promise.all([
    fetchDays(userId),
    fetchMealsWithItems(userId),
  ]);

  const days = filterByPeriod(allDays, 'date', period).sort((a, b) => a.date.localeCompare(b.date));
  const meals = filterByPeriod(allMeals, 'date', period).sort((a, b) => (a.date + (a.created_at || '')).localeCompare(b.date + (b.created_at || '')));

  const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const daysWithData = days.filter(d => (d.kcal_total || 0) > 0);

  // ─── Stats ───
  const avgKcal = avg(daysWithData.map(d => d.kcal_total || 0));
  const avgPtn = avg(daysWithData.map(d => d.ptn_total || 0));
  const avgCarb = avg(daysWithData.map(d => d.carb_total || 0));
  const avgFat = avg(daysWithData.map(d => d.fat_total || 0));
  const avgWater = avg(days.filter(d => d.water_ml > 0).map(d => d.water_ml));
  const maxKcal = Math.max(0, ...daysWithData.map(d => d.kcal_total || 0));
  const minKcal = daysWithData.length ? Math.min(...daysWithData.map(d => d.kcal_total || 0)) : 0;
  const maxPtn = Math.max(0, ...daysWithData.map(d => d.ptn_total || 0));
  const minPtn = daysWithData.length ? Math.min(...daysWithData.map(d => d.ptn_total || 0)) : 0;

  const sleepArr = days.filter(d => d.sleep_start && d.sleep_end);
  const avgSleepMin = avg(sleepArr.map(d => sleepDuration(d.sleep_start, d.sleep_end)?.totalMinutes || 0));

  const goalHitDays = daysWithData.filter(d =>
    (d.kcal_total || 0) >= profileGoals.kcal * 0.85 &&
    (d.kcal_total || 0) <= profileGoals.kcal * 1.15
  ).length;
  const adherencePct = daysWithData.length ? Math.round((goalHitDays / daysWithData.length) * 100) : 0;

  // ─── Meal frequency analysis ───
  const itemFreq = {};
  for (const m of meals) {
    for (const item of (m.meal_items || [])) {
      const key = (item.name || '').toLowerCase().replace(/^\d+x\s*/, '').trim();
      if (!key) continue;
      if (!itemFreq[key]) itemFreq[key] = { count: 0, totalKcal: 0, totalPtn: 0, displayName: item.name };
      itemFreq[key].count++;
      itemFreq[key].totalKcal += item.kcal || 0;
      itemFreq[key].totalPtn += item.ptn || 0;
    }
  }
  const topItems = Object.values(itemFreq).sort((a, b) => b.count - a.count).slice(0, 10);

  // ─── Group meals by date ───
  const mealsByDate = {};
  for (const m of meals) {
    if (!mealsByDate[m.date]) mealsByDate[m.date] = [];
    mealsByDate[m.date].push(m);
  }

  const maxMealDays = period === 'week' ? 7 : period === 'month' ? 31 : 60;

  // ─── HTML ───
  const html = buildPDFHtml({
    today, days, daysWithData, meals, mealsByDate, profileGoals, period,
    avgKcal, avgPtn, avgCarb, avgFat, avgWater,
    maxKcal, minKcal, maxPtn, minPtn,
    avgSleepMin, sleepDays: sleepArr.length,
    adherencePct, goalHitDays,
    topItems, maxMealDays,
  });

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Permita pop-ups para gerar o PDF.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

// ─── PDF HTML Builder (extracted for readability) ───────────

function buildProgressBar(label, value, goal, unit, fillClass) {
  const p = Math.min(pct(value, goal), 100);
  return `
    <div class="progress-row">
      <div class="progress-label">${label}</div>
      <div class="progress-bar">
        <div class="progress-fill ${fillClass}" style="width:${Math.min(p, 100)}%">
          ${p >= 20 ? `<span>${p}%</span>` : ''}
        </div>
      </div>
      <div class="progress-value">${value}${unit} / ${goal}${unit}</div>
    </div>`;
}

function buildPDFHtml(d) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Bio-Tracker — Relatório Nutricional</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1e293b; font-size: 10px; line-height: 1.5; }
    .page { padding: 24px; }
    .page-break { page-break-before: always; padding-top: 24px; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; }
    .header-left h1 { font-size: 22px; font-weight: 900; color: #1e40af; letter-spacing: -0.5px; }
    .header-left .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
    .header-right { text-align: right; }
    .header-right .patient { font-size: 13px; font-weight: 800; color: #334155; }
    .header-right .meta { font-size: 9px; color: #94a3b8; margin-top: 2px; }

    .section-title { font-size: 13px; font-weight: 900; color: #1e40af; margin: 20px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #dbeafe; display: flex; align-items: center; gap: 6px; }
    .section-title .icon { font-size: 14px; }

    .goals-row { display: flex; gap: 8px; margin-bottom: 16px; }
    .goal-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; text-align: center; }
    .goal-card.highlight { background: #eff6ff; border-color: #bfdbfe; }
    .goal-card .label { font-size: 7px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; }
    .goal-card .value { font-size: 18px; font-weight: 900; color: #1e293b; margin: 2px 0; }
    .goal-card .sub { font-size: 8px; color: #64748b; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
    .stat-box .stat-label { font-size: 7px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.5px; }
    .stat-box .stat-value { font-size: 14px; font-weight: 900; color: #334155; }
    .stat-box .stat-detail { font-size: 8px; color: #64748b; }

    .progress-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .progress-label { width: 80px; font-size: 9px; font-weight: 700; color: #475569; text-align: right; }
    .progress-bar { flex: 1; height: 14px; background: #f1f5f9; border-radius: 7px; overflow: hidden; position: relative; }
    .progress-fill { height: 100%; border-radius: 7px; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; }
    .progress-fill span { font-size: 7px; font-weight: 800; color: white; }
    .progress-value { width: 110px; font-size: 9px; font-weight: 800; color: #334155; }
    .fill-kcal { background: linear-gradient(90deg, #f97316, #fb923c); }
    .fill-ptn { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .fill-carb { background: linear-gradient(90deg, #eab308, #facc15); }
    .fill-fat { background: linear-gradient(90deg, #ef4444, #f87171); }
    .fill-water { background: linear-gradient(90deg, #06b6d4, #22d3ee); }

    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9px; }
    th { background: #f1f5f9; text-align: left; padding: 5px 6px; font-weight: 800; text-transform: uppercase; font-size: 7px; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:nth-child(even) { background: #fafbfc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 800; }
    .text-muted { color: #94a3b8; }
    .text-green { color: #16a34a; }
    .text-red { color: #ef4444; }
    .text-orange { color: #f97316; }
    .text-sm { font-size: 8px; }

    .meal-day { margin-bottom: 14px; }
    .meal-day-header { font-size: 10px; font-weight: 900; color: #334155; padding: 4px 8px; background: #f1f5f9; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .meal-block { margin-left: 8px; margin-bottom: 8px; padding-left: 8px; border-left: 2px solid #dbeafe; }
    .meal-name { font-size: 9px; font-weight: 800; color: #475569; }
    .meal-macros { font-size: 8px; color: #94a3b8; }
    .meal-items { margin-top: 2px; }
    .meal-item { font-size: 8px; color: #64748b; padding: 1px 0; display: flex; justify-content: space-between; }
    .meal-item-name { flex: 1; }
    .meal-item-macros { display: flex; gap: 8px; color: #94a3b8; min-width: 150px; justify-content: flex-end; }

    .top-foods { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; }
    .food-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #f1f5f9; }
    .food-rank { width: 18px; height: 18px; background: #dbeafe; color: #1e40af; font-size: 8px; font-weight: 900; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .food-info { flex: 1; min-width: 0; }
    .food-name { font-size: 8px; font-weight: 700; color: #334155; text-transform: capitalize; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .food-detail { font-size: 7px; color: #94a3b8; }

    .adherence { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 800; }
    .adherence.good { background: #dcfce7; color: #16a34a; }
    .adherence.moderate { background: #fef3c7; color: #d97706; }
    .adherence.low { background: #fee2e2; color: #ef4444; }

    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 8px; }

    @media print {
      body { padding: 0; }
      .page { padding: 0; }
      .page-break { padding-top: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        <h1>📊 Relatório Nutricional</h1>
        <div class="subtitle">Bio-Tracker • ${periodLabel(d.period)}</div>
      </div>
      <div class="header-right">
        <div class="patient">${d.profileGoals.name || 'Paciente'}</div>
        <div class="meta">Gerado em ${d.today}</div>
        <div class="meta">${d.days.length > 0 ? `${fmtDate(d.days[0]?.date)} a ${fmtDate(d.days[d.days.length - 1]?.date)}` : '—'}</div>
      </div>
    </div>

    <!-- METAS DIÁRIAS -->
    <div class="section-title"><span class="icon">🎯</span> Metas Diárias Configuradas</div>
    <div class="goals-row">
      <div class="goal-card highlight">
        <div class="label">Calorias</div>
        <div class="value">${d.profileGoals.kcal}</div>
        <div class="sub">kcal/dia</div>
      </div>
      <div class="goal-card">
        <div class="label">Proteína</div>
        <div class="value" style="color:#3b82f6">${d.profileGoals.ptn}g</div>
        <div class="sub">${Math.round(d.profileGoals.ptn * 4 / (d.profileGoals.kcal || 1) * 100)}% das kcal</div>
      </div>
      <div class="goal-card">
        <div class="label">Carboidrato</div>
        <div class="value" style="color:#eab308">${d.profileGoals.carb}g</div>
        <div class="sub">${Math.round(d.profileGoals.carb * 4 / (d.profileGoals.kcal || 1) * 100)}% das kcal</div>
      </div>
      <div class="goal-card">
        <div class="label">Gordura</div>
        <div class="value" style="color:#ef4444">${d.profileGoals.fat}g</div>
        <div class="sub">${Math.round(d.profileGoals.fat * 9 / (d.profileGoals.kcal || 1) * 100)}% das kcal</div>
      </div>
    </div>

    <!-- RESUMO ESTATÍSTICO -->
    <div class="section-title"><span class="icon">📈</span> Resumo do Período</div>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">Dias registrados</div>
        <div class="stat-value">${d.daysWithData.length}</div>
        <div class="stat-detail">de ${d.days.length} dias no período</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Aderência às metas</div>
        <div class="stat-value"><span class="adherence ${d.adherencePct >= 70 ? 'good' : d.adherencePct >= 40 ? 'moderate' : 'low'}">${d.adherencePct}%</span></div>
        <div class="stat-detail">${d.goalHitDays} dias dentro (±15%)</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Média de sono</div>
        <div class="stat-value">${Math.floor(d.avgSleepMin / 60)}h${String(d.avgSleepMin % 60).padStart(2, '0')}</div>
        <div class="stat-detail">${d.sleepDays} noites registradas</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Hidratação média</div>
        <div class="stat-value">${d.avgWater}ml</div>
        <div class="stat-detail">${pct(d.avgWater, 2000)}% da meta (2L)</div>
      </div>
    </div>

    <!-- MÉDIAS vs METAS -->
    <div class="section-title"><span class="icon">⚖️</span> Médias Diárias vs Metas</div>
    <div style="margin-bottom:16px">
      ${buildProgressBar('Calorias', d.avgKcal, d.profileGoals.kcal, 'kcal', 'fill-kcal')}
      ${buildProgressBar('Proteína', d.avgPtn, d.profileGoals.ptn, 'g', 'fill-ptn')}
      ${buildProgressBar('Carboidrato', d.avgCarb, d.profileGoals.carb, 'g', 'fill-carb')}
      ${buildProgressBar('Gordura', d.avgFat, d.profileGoals.fat, 'g', 'fill-fat')}
      ${buildProgressBar('Água', d.avgWater, 2000, 'ml', 'fill-water')}
    </div>

    <!-- VARIAÇÃO -->
    <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
      <div class="stat-box">
        <div class="stat-label">Calorias — Variação</div>
        <div class="stat-value">${d.minKcal} — ${d.maxKcal} kcal</div>
        <div class="stat-detail">Média: ${d.avgKcal} kcal/dia</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Proteína — Variação</div>
        <div class="stat-value">${d.minPtn} — ${d.maxPtn}g</div>
        <div class="stat-detail">Média: ${d.avgPtn}g/dia</div>
      </div>
    </div>

    <!-- ALIMENTOS MAIS CONSUMIDOS -->
    ${d.topItems.length > 0 ? `
    <div class="section-title"><span class="icon">🥇</span> Alimentos Mais Consumidos</div>
    <div class="top-foods">
      ${d.topItems.map((item, i) => `
        <div class="food-item">
          <div class="food-rank">${i + 1}</div>
          <div class="food-info">
            <div class="food-name">${item.displayName}</div>
            <div class="food-detail">${item.count}x • ${Math.round(item.totalKcal / item.count)} kcal méd • ${Math.round(item.totalPtn / item.count)}g ptn méd</div>
          </div>
        </div>
      `).join('')}
    </div>` : ''}
  </div>

  <!-- PÁGINA 2: REGISTRO DIÁRIO -->
  <div class="page-break">
    <div class="section-title"><span class="icon">📅</span> Registro Diário Completo</div>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th class="text-right">Kcal</th>
          <th class="text-right">% Meta</th>
          <th class="text-right">Ptn (g)</th>
          <th class="text-right">Carb (g)</th>
          <th class="text-right">Fat (g)</th>
          <th class="text-right">Água</th>
          <th class="text-center">Sono</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${d.days.map(day => {
          const sl = sleepDuration(day.sleep_start, day.sleep_end);
          const kcalPct = pct(day.kcal_total || 0, d.profileGoals.kcal);
          const cls = kcalPct >= 85 && kcalPct <= 115 ? 'text-green' : kcalPct < 70 ? 'text-red' : kcalPct > 130 ? 'text-orange' : '';
          return `<tr>
            <td class="font-bold">${fmtDate(day.date)}</td>
            <td class="text-right font-bold">${day.kcal_total || 0}</td>
            <td class="text-right ${cls}">${kcalPct}%</td>
            <td class="text-right">${day.ptn_total || 0}</td>
            <td class="text-right">${day.carb_total || 0}</td>
            <td class="text-right">${day.fat_total || 0}</td>
            <td class="text-right">${day.water_ml || '—'}</td>
            <td class="text-center">${sl ? `${sl.hours}h${String(sl.minutes).padStart(2, '0')}` : '—'}</td>
            <td class="text-sm text-muted">${(day.notes || '').substring(0, 50)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- PÁGINA 3: REFEIÇÕES DETALHADAS -->
  <div class="page-break">
    <div class="section-title"><span class="icon">🍽️</span> Refeições Detalhadas</div>
    ${Object.entries(d.mealsByDate).slice(0, d.maxMealDays).map(([date, dateMeals]) => {
      const dayTotal = dateMeals.reduce((s, m) => ({
        kcal: s.kcal + (m.kcal || 0), ptn: s.ptn + (m.ptn || 0),
        carb: s.carb + (m.carb || 0), fat: s.fat + (m.fat || 0),
      }), { kcal: 0, ptn: 0, carb: 0, fat: 0 });
      return `
      <div class="meal-day">
        <div class="meal-day-header">
          <span>📅 ${fmtDate(date)}</span>
          <span>${dayTotal.kcal} kcal • ${dayTotal.ptn}g ptn • ${dayTotal.carb}g carb • ${dayTotal.fat}g fat</span>
        </div>
        ${dateMeals.map(m => `
          <div class="meal-block">
            <div class="meal-name">${m.name || 'Refeição'}</div>
            <div class="meal-macros">${m.kcal || 0} kcal • ${m.ptn || 0}g ptn • ${m.carb || 0}g carb • ${m.fat || 0}g fat</div>
            ${(m.meal_items || []).length > 0 ? `
              <div class="meal-items">
                ${(m.meal_items || []).map(item => `
                  <div class="meal-item">
                    <span class="meal-item-name">• ${item.name || 'Item'}</span>
                    <span class="meal-item-macros">
                      <span>${item.kcal || 0} kcal</span>
                      <span>${item.ptn || 0}g P</span>
                      <span>${item.carb || 0}g C</span>
                      <span>${item.fat || 0}g G</span>
                    </span>
                  </div>
                `).join('')}
              </div>` : ''}
          </div>
        `).join('')}
      </div>`;
    }).join('')}
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>Bio-Tracker • Relatório gerado automaticamente</span>
    <span>${d.today}</span>
  </div>
</body>
</html>`;
}
