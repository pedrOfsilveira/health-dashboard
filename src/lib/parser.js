/**
 * Parser for the sleep_nutrition_log.md file.
 * Returns the most recent day's data.
 */
export function parseHealthLog(content) {
  const lines = content.split('\n');
  const days = {};
  
  let currentDay = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDay = dateMatch[1];
      if (!days[currentDay]) {
        days[currentDay] = {
          date: currentDay,
          sleep: null,
          nutrition: { meals: [], total: { kcal: 0, ptn: 0, metaKcal: 2914, metaPtn: 124 } },
          notes: []
        };
      }

      // Parse sleep
      if (line.includes('sleep:')) {
        const sleepInfo = line.split('sleep:')[1];
        const times = sleepInfo.match(/(\d{2}:\d{2})\s*->\s*(\d{2}:\d{2})/);
        const quality = sleepInfo.match(/quality:\s*([^;]+)/);
        const wakes = sleepInfo.match(/wakes:\s*(\d+)/);
        
        if (times) {
            const start = times[1];
            const end = times[2];
            // Calc duration (rough)
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            const durationH = Math.floor(diff / 60);
            const durationM = diff % 60;

            days[currentDay].sleep = {
                start,
                end,
                duration: `${String(durationH).padStart(2, '0')}h ${String(durationM).padStart(2, '0')}m`,
                quality: quality ? quality[1].trim() : 'N/A'
            };
        }
      }

      // Parse nutrition summary
      if (line.includes('Resumo diário')) {
        const kcalMatch = line.match(/Calorias totais[^~]*~?([\d.]+)/i);
        const ptnMatch = line.match(/Proteína total[^~]*~?([\d.]+)/i);
        if (kcalMatch) days[currentDay].nutrition.total.kcal = parseInt(kcalMatch[1].replace('.', ''));
        if (ptnMatch) days[currentDay].nutrition.total.ptn = parseInt(ptnMatch[1]);
      }
      
      // Parse individual meals (simplified for this script)
      if (line.startsWith('- ') && !line.includes('Status:')) {
          const mealMatch = line.match(/^- ([^—]+)—? (.*)/);
          if (mealMatch) {
              const name = mealMatch[1].split('(')[0].trim();
              const desc = mealMatch[2];
              const kcal = desc.match(/≈?\s*([\d.]+)\s*kcal/);
              const ptn = desc.match(/≈?\s*([\d.]+)\s*g\s*proteína/);
              
              days[currentDay].nutrition.meals.push({
                  name,
                  desc: desc.split('.')[0] + '.',
                  kcal: kcal ? kcal[1] : '?',
                  ptn: ptn ? ptn[1] : '?'
              });
          }
      }

      if (line.includes('notes:')) {
          days[currentDay].notes.push(line.split('notes:')[1].trim());
      }
    }
  }

  const sortedDates = Object.keys(days).sort().reverse();
  return sortedDates.length > 0 ? days[sortedDates[0]] : null;
}
