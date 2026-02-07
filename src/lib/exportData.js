/**
 * Export user data as CSV or PDF.
 * Uses supabase helpers to fetch the data and generates downloads.
 */
import { fetchDays, fetchMealsWithItems } from './supabase.js';

/**
 * Download a blob as a file.
 */
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

/**
 * Export user's daily data as CSV.
 * @param {string} userId
 */
export async function exportCSV(userId) {
  const [days, meals] = await Promise.all([
    fetchDays(userId),
    fetchMealsWithItems(userId),
  ]);

  // ─── Days CSV ───
  const dayHeaders = ['Data', 'Kcal', 'Proteína (g)', 'Carboidrato (g)', 'Gordura (g)', 'Água (ml)', 'Sono (h)', 'Notas'];
  const dayRows = days.map(d => [
    d.date,
    d.kcal_total || 0,
    d.ptn_total || 0,
    d.carb_total || 0,
    d.fat_total || 0,
    d.water_ml || 0,
    d.sleep_hours || '',
    `"${(d.notes || '').replace(/"/g, '""')}"`,
  ]);

  // ─── Meals CSV ───
  const mealHeaders = ['Data', 'Refeição', 'Kcal', 'Proteína (g)', 'Carb (g)', 'Gordura (g)', 'Itens'];
  const mealRows = meals.map(m => {
    const items = (m.meal_items || []).map(i => i.name || i.description || '').join('; ');
    return [
      m.date,
      `"${(m.description || '').replace(/"/g, '""')}"`,
      m.kcal || 0,
      m.ptn || 0,
      m.carb || 0,
      m.fat || 0,
      `"${items.replace(/"/g, '""')}"`,
    ];
  });

  const csv = [
    '# Resumo Diário',
    dayHeaders.join(','),
    ...dayRows.map(r => r.join(',')),
    '',
    '# Refeições',
    mealHeaders.join(','),
    ...mealRows.map(r => r.join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `bio-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export user's data as a styled PDF using print-to-PDF.
 * Renders an HTML document in a hidden iframe and triggers window.print().
 * @param {string} userId
 * @param {{ name: string, kcal: number, ptn: number, carb: number, fat: number }} profileGoals
 */
export async function exportPDF(userId, profileGoals) {
  const [days, meals] = await Promise.all([
    fetchDays(userId),
    fetchMealsWithItems(userId),
  ]);

  const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Build styled HTML
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Bio-Tracker — Relatório</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; padding: 32px; font-size: 11px; }
    h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 11px; margin-bottom: 24px; }
    .goals { display: flex; gap: 12px; margin-bottom: 24px; }
    .goal-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
    .goal-card .value { font-size: 16px; font-weight: 900; }
    .goal-card .label { font-size: 8px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 10px; }
    th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-weight: 800; text-transform: uppercase; font-size: 8px; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) { background: #fafbfc; }
    h2 { font-size: 13px; font-weight: 900; margin-bottom: 8px; color: #334155; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>Bio-Tracker — Relatório</h1>
  <p class="subtitle">Gerado em ${today} • ${profileGoals.name || 'Usuário'}</p>

  <div class="goals">
    <div class="goal-card"><div class="value">${profileGoals.kcal}</div><div class="label">kcal/dia</div></div>
    <div class="goal-card"><div class="value">${profileGoals.ptn}g</div><div class="label">Proteína</div></div>
    <div class="goal-card"><div class="value">${profileGoals.carb}g</div><div class="label">Carboidrato</div></div>
    <div class="goal-card"><div class="value">${profileGoals.fat}g</div><div class="label">Gordura</div></div>
  </div>

  <h2>Resumo Diário (últimos ${days.length} dias)</h2>
  <table>
    <thead><tr><th>Data</th><th>Kcal</th><th>Ptn</th><th>Carb</th><th>Gord</th><th>Água</th><th>Sono</th></tr></thead>
    <tbody>
      ${days.slice(0, 60).map(d => `<tr>
        <td>${d.date}</td>
        <td>${d.kcal_total || 0}</td>
        <td>${d.ptn_total || 0}g</td>
        <td>${d.carb_total || 0}g</td>
        <td>${d.fat_total || 0}g</td>
        <td>${d.water_ml || 0}ml</td>
        <td>${d.sleep_hours || '—'}h</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Refeições (${meals.length} registros)</h2>
  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Kcal</th><th>Ptn</th><th>Carb</th><th>Gord</th></tr></thead>
    <tbody>
      ${meals.slice(0, 100).map(m => `<tr>
        <td>${m.date}</td>
        <td>${(m.description || '').substring(0, 60)}</td>
        <td>${m.kcal || 0}</td>
        <td>${m.ptn || 0}g</td>
        <td>${m.carb || 0}g</td>
        <td>${m.fat || 0}g</td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

  // Open in a new window for print
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Permita pop-ups para gerar o PDF.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // Small delay for rendering
  setTimeout(() => printWindow.print(), 400);
}
