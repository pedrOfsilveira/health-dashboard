import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const AI_MODEL = "gpt-4o-mini";
const AI_URL = "https://models.inference.ai.azure.com/chat/completions";

const SYSTEM_PROMPT = `Você é um assistente nutricional. Analise o texto do usuário e retorne APENAS um JSON válido (sem markdown, sem explicação).

Se for refeição/comida, retorne:
{"type": "meal", "name": "Nome da Refeição", "items": [{"name": "item", "kcal": 100, "ptn": 10, "carb": 20, "fat": 5}]}

Se for dado de sono, retorne:
{"type": "sleep", "start": "HH:MM", "end": "HH:MM", "quality": "BOA"}

Se for condição de saúde (gripe, dor, febre, mal-estar, medicamento, etc), retorne:
{"type": "health", "condition": "nome da condição", "details": "detalhes relevantes", "severity": "leve|moderado|severo"}

Se for uma nota/observação geral, retorne:
{"type": "note", "text": "texto"}

Regras:
- Estime calorias e macros com base em tabelas nutricionais brasileiras (TACO/IBGE)
- Se o usuário informar peso (ex: "200g de arroz"), use valores proporcionais
- Se não informar peso, estime uma porção média
- O campo "name" da refeição deve ser o tipo (Almoço, Jantar, Lanche, Café da manhã, etc)
- Sempre retorne valores numéricos inteiros para kcal, ptn, carb, fat
- Qualquer menção a sintomas, doenças, dor, febre, gripe, resfriado, medicamentos deve ser classificado como "health"`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function callAI(userText: string) {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content.trim();

  // Limpar possível markdown
  if (content.startsWith("```")) {
    content = content.split("\n").slice(1).join("\n");
    content = content.replace(/```\s*$/, "");
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}") + 1;
  if (start === -1 || end <= 0) throw new Error("AI não retornou JSON válido");

  return JSON.parse(content.substring(start, end));
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, date } = await req.json();
    if (!text || !date) {
      return new Response(JSON.stringify({ error: "text e date são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract user_id from JWT
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser(token);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Registrar no chat_logs
    const { data: logData } = await supabase
      .from("chat_logs")
      .insert({ date, text, status: "processing", user_id: userId })
      .select()
      .single();

    // 2. Garantir que o dia existe
    const { data: existingDay } = await supabase
      .from("days")
      .select("date")
      .eq("date", date)
      .eq("user_id", userId)
      .single();

    if (!existingDay) {
      await supabase.from("days").insert({
        date,
        kcal_total: 0,
        ptn_total: 0,
        carb_total: 0,
        fat_total: 0,
        user_id: userId,
      });
    }

    // 3. Chamar IA
    let parsed;
    try {
      parsed = await callAI(text);
    } catch (aiErr) {
      // Fallback: tratar como nota
      parsed = { type: "note", text };
    }

    let responseMsg = "";

    // 4. Processar resultado
    if (parsed.type === "meal") {
      const items = parsed.items || [{ name: text, kcal: 0, ptn: 0, carb: 0, fat: 0 }];
      const totalKcal = items.reduce((s: number, i: any) => s + (i.kcal || 0), 0);
      const totalPtn = items.reduce((s: number, i: any) => s + (i.ptn || 0), 0);
      const totalCarb = items.reduce((s: number, i: any) => s + (i.carb || 0), 0);
      const totalFat = items.reduce((s: number, i: any) => s + (i.fat || 0), 0);

      // Criar refeição
      const { data: meal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          date,
          name: parsed.name || "Refeição",
          kcal: totalKcal,
          ptn: totalPtn,
          carb: totalCarb,
          fat: totalFat,
          user_id: userId,
        })
        .select("id")
        .single();

      if (mealErr) {
        // Fallback sem carb/fat
        const { data: meal2 } = await supabase
          .from("meals")
          .insert({ date, name: parsed.name || "Refeição", kcal: totalKcal, ptn: totalPtn, user_id: userId })
          .select("id")
          .single();
        if (meal2) {
          for (const item of items) {
            await supabase.from("meal_items").insert({
              meal_id: meal2.id,
              name: item.name || "Item",
              kcal: item.kcal || 0,
              ptn: item.ptn || 0,
              user_id: userId,
            });
          }
        }
      } else if (meal) {
        for (const item of items) {
          const { error: itemErr } = await supabase.from("meal_items").insert({
            meal_id: meal.id,
            name: item.name || "Item",
            kcal: item.kcal || 0,
            ptn: item.ptn || 0,
            carb: item.carb || 0,
            fat: item.fat || 0,
            user_id: userId,
          });
          // Fallback sem carb/fat
          if (itemErr) {
            await supabase.from("meal_items").insert({
              meal_id: meal.id,
              name: item.name || "Item",
              kcal: item.kcal || 0,
              ptn: item.ptn || 0,
              user_id: userId,
            });
          }
        }
      }

      // Atualizar totais do dia
      const { data: day } = await supabase.from("days").select("*").eq("date", date).eq("user_id", userId).single();
      if (day) {
        await supabase
          .from("days")
          .update({
            kcal_total: (day.kcal_total || 0) + totalKcal,
            ptn_total: (day.ptn_total || 0) + totalPtn,
            carb_total: (day.carb_total || 0) + totalCarb,
            fat_total: (day.fat_total || 0) + totalFat,
          })
          .eq("date", date)
          .eq("user_id", userId);
      }

      const itemNames = items.map((i: any) => i.name).join(", ");
      responseMsg = `✅ ${parsed.name}: ${itemNames} (~${totalKcal} kcal, ${totalPtn}g ptn)`;
    } else if (parsed.type === "sleep") {
      await supabase
        .from("days")
        .update({
          sleep_start: parsed.start,
          sleep_end: parsed.end,
          sleep_quality: parsed.quality || "BOA",
        })
        .eq("date", date)
        .eq("user_id", userId);

      responseMsg = `🌙 Sono registrado: ${parsed.start} → ${parsed.end} (${parsed.quality})`;
    } else if (parsed.type === "health") {
      // Condição de saúde
      const healthTag = `[SAÚDE] ${parsed.condition}: ${parsed.details || text} (${parsed.severity || "leve"})`;
      const { data: day } = await supabase.from("days").select("notes").eq("date", date).eq("user_id", userId).single();
      const existing = day?.notes || "";
      const newNotes = (existing + "\n" + healthTag).trim();
      await supabase.from("days").update({ notes: newNotes }).eq("date", date).eq("user_id", userId);

      const severityEmoji = parsed.severity === "severo" ? "🚨" : parsed.severity === "moderado" ? "⚠️" : "🩹";
      responseMsg = `${severityEmoji} Saúde registrada: ${parsed.condition}. Suas sugestões e insights serão adaptados!`;
    } else {
      // Nota
      const { data: day } = await supabase.from("days").select("notes").eq("date", date).eq("user_id", userId).single();
      const existing = day?.notes || "";
      const newNotes = (existing + "\n" + (parsed.text || text)).trim();
      await supabase.from("days").update({ notes: newNotes }).eq("date", date).eq("user_id", userId);

      responseMsg = `📝 Nota registrada.`;
    }

    // 5. Marcar chat_log como concluído
    if (logData) {
      await supabase
        .from("chat_logs")
        .update({ status: "completed", response: responseMsg })
        .eq("id", logData.id);
    }

    // 6. Gamification: Update streak, check badges, award XP, update challenges
    const gamificationResult = await updateGamification(supabase, userId, date, parsed.type);

    return new Response(
      JSON.stringify({
        success: true,
        message: responseMsg,
        data: parsed,
        gamification: gamificationResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Gamification Engine ────────────────────────────────────

async function updateGamification(
  supabase: any,
  userId: string,
  date: string,
  entryType: string
) {
  const result: any = {
    streakUpdated: false,
    badgesUnlocked: [],
    xpGained: 0,
    challengesUpdated: [],
  };

  try {
    // --- XP for logging ---
    let xpToAdd = 10; // base XP per entry

    // --- Streak Update ---
    const today = date; // use the logged date
    const { data: currentStreak } = await supabase
      .from("streaks")
      .select("*")
      .eq("user_id", userId)
      .single();

    let newCurrentStreak = 1;
    let newLongestStreak = 1;

    if (currentStreak) {
      const lastLog = currentStreak.last_log_date;
      if (lastLog === today) {
        // Already logged today, keep streak
        newCurrentStreak = currentStreak.current_streak;
        newLongestStreak = currentStreak.longest_streak;
      } else {
        const lastDate = new Date(lastLog + "T12:00:00");
        const todayDate = new Date(today + "T12:00:00");
        const diffDays = Math.round(
          (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 1) {
          // Consecutive day
          newCurrentStreak = currentStreak.current_streak + 1;
        } else if (diffDays > 1) {
          // Streak broken
          newCurrentStreak = 1;
        } else {
          newCurrentStreak = currentStreak.current_streak;
        }
        newLongestStreak = Math.max(
          newCurrentStreak,
          currentStreak.longest_streak
        );
      }

      await supabase
        .from("streaks")
        .update({
          current_streak: newCurrentStreak,
          longest_streak: newLongestStreak,
          last_log_date: today,
        })
        .eq("user_id", userId);
    } else {
      // First ever entry
      await supabase.from("streaks").insert({
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_log_date: today,
      });
    }
    result.streakUpdated = true;
    result.currentStreak = newCurrentStreak;

    // --- Badge Checks ---
    const { data: existingBadges } = await supabase
      .from("user_achievements")
      .select("badge_id")
      .eq("user_id", userId);

    const unlockedIds = new Set(
      (existingBadges || []).map((b: any) => b.badge_id)
    );

    const badgesToCheck: { id: string; condition: boolean }[] = [];

    // First meal badge
    if (!unlockedIds.has("first_meal")) {
      const { count } = await supabase
        .from("meals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      badgesToCheck.push({ id: "first_meal", condition: (count || 0) >= 1 });
    }

    // Streak badges
    if (!unlockedIds.has("streak_3")) {
      badgesToCheck.push({ id: "streak_3", condition: newCurrentStreak >= 3 });
    }
    if (!unlockedIds.has("streak_7")) {
      badgesToCheck.push({ id: "streak_7", condition: newCurrentStreak >= 7 });
    }
    if (!unlockedIds.has("streak_30")) {
      badgesToCheck.push({
        id: "streak_30",
        condition: newCurrentStreak >= 30,
      });
    }

    // Goal hit badge — check if today's macros are ≥90%
    if (!unlockedIds.has("goal_hit") && entryType === "meal") {
      const { data: dayData } = await supabase
        .from("days")
        .select("kcal_total, ptn_total")
        .eq("date", today)
        .eq("user_id", userId)
        .single();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("goal_kcal, goal_ptn")
        .eq("user_id", userId)
        .single();

      if (dayData && profileData) {
        const kcalPct = (dayData.kcal_total / (profileData.goal_kcal || 2000)) * 100;
        const ptnPct = (dayData.ptn_total / (profileData.goal_ptn || 100)) * 100;
        badgesToCheck.push({
          id: "goal_hit",
          condition: kcalPct >= 90 && ptnPct >= 90,
        });
      }
    }

    // Protein master — 7 days hitting protein goal
    if (!unlockedIds.has("protein_master") && entryType === "meal") {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("goal_ptn")
        .eq("user_id", userId)
        .single();

      if (profileData) {
        const { data: recentDays } = await supabase
          .from("days")
          .select("ptn_total")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(30);

        const ptnHits = (recentDays || []).filter(
          (d: any) => d.ptn_total >= (profileData.goal_ptn || 100) * 0.9
        ).length;
        badgesToCheck.push({
          id: "protein_master",
          condition: ptnHits >= 7,
        });
      }
    }

    // Early bird badge — meal logged before 8am
    if (!unlockedIds.has("early_bird") && entryType === "meal") {
      const hour = new Date().getUTCHours() - 3; // BRT approximation
      badgesToCheck.push({
        id: "early_bird",
        condition: hour >= 4 && hour < 8,
      });
    }

    // Sleep master — 7+ hours for 7 days
    if (!unlockedIds.has("sleep_master") && entryType === "sleep") {
      const { data: recentDays } = await supabase
        .from("days")
        .select("sleep_start, sleep_end")
        .eq("user_id", userId)
        .not("sleep_start", "is", null)
        .order("date", { ascending: false })
        .limit(30);

      const goodSleepCount = (recentDays || []).filter((d: any) => {
        if (!d.sleep_start || !d.sleep_end) return false;
        const [h1, m1] = d.sleep_start.split(":").map(Number);
        const [h2, m2] = d.sleep_end.split(":").map(Number);
        let diff = h2 * 60 + m2 - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;
        return diff >= 420; // 7 hours
      }).length;

      badgesToCheck.push({
        id: "sleep_master",
        condition: goodSleepCount >= 7,
      });
    }

    // Unlock earned badges
    for (const badge of badgesToCheck) {
      if (badge.condition) {
        const { error } = await supabase
          .from("user_achievements")
          .insert({ user_id: userId, badge_id: badge.id });

        if (!error) {
          // Get badge XP reward
          const { data: badgeDef } = await supabase
            .from("badge_definitions")
            .select("xp_reward, name, icon")
            .eq("id", badge.id)
            .single();

          if (badgeDef) {
            xpToAdd += badgeDef.xp_reward;
            result.badgesUnlocked.push({
              id: badge.id,
              name: badgeDef.name,
              icon: badgeDef.icon,
              xp: badgeDef.xp_reward,
            });
          }
        }
      }
    }

    // Level badges
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("xp_total")
      .eq("user_id", userId)
      .single();

    const currentXp = (currentProfile?.xp_total || 0) + xpToAdd;

    if (!unlockedIds.has("level_5") && currentXp >= 1000) {
      await supabase
        .from("user_achievements")
        .insert({ user_id: userId, badge_id: "level_5" });
      xpToAdd += 250;
      result.badgesUnlocked.push({ id: "level_5", name: "Nível 5", icon: "🌟", xp: 250 });
    }
    if (!unlockedIds.has("level_10") && currentXp >= 5500) {
      await supabase
        .from("user_achievements")
        .insert({ user_id: userId, badge_id: "level_10" });
      xpToAdd += 500;
      result.badgesUnlocked.push({ id: "level_10", name: "Lendário", icon: "⚡", xp: 500 });
    }

    // --- Update XP ---
    await supabase.rpc("increment_xp", { uid: userId, amount: xpToAdd });
    // Fallback if rpc doesn't exist: direct update
    if (xpToAdd > 0) {
      await supabase
        .from("profiles")
        .update({ xp_total: (currentProfile?.xp_total || 0) + xpToAdd })
        .eq("user_id", userId);
    }
    result.xpGained = xpToAdd;

    // --- Update Challenge Progress ---
    await updateChallengeProgress(supabase, userId, date, entryType);

  } catch (err) {
    console.error("Gamification error (non-fatal):", err);
  }

  return result;
}

async function updateChallengeProgress(
  supabase: any,
  userId: string,
  date: string,
  entryType: string
) {
  try {
    // Get all active challenge instances where this user participates
    const { data: participations } = await supabase
      .from("challenge_participants")
      .select("*, challenge_instances(*, challenges(*))")
      .eq("user_id", userId)
      .is("completed_at", null);

    if (!participations || participations.length === 0) return;

    for (const p of participations) {
      const instance = p.challenge_instances;
      const challenge = instance?.challenges;
      if (!challenge || instance.status !== "active") continue;

      // Check if challenge expired
      if (new Date(instance.end_date) < new Date(date)) {
        await supabase
          .from("challenge_instances")
          .update({ status: "expired" })
          .eq("id", instance.id);
        continue;
      }

      let newProgress = p.progress;

      switch (challenge.metric) {
        case "streak":
          // Progress = current streak within the challenge period
          const { data: streakData } = await supabase
            .from("streaks")
            .select("current_streak")
            .eq("user_id", userId)
            .single();
          newProgress = streakData?.current_streak || 0;
          break;

        case "meals_logged": {
          const { count } = await supabase
            .from("meals")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date);
          newProgress = count || 0;
          break;
        }

        case "days_active": {
          const { data: activeDays } = await supabase
            .from("days")
            .select("date")
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date)
            .gt("kcal_total", 0);
          newProgress = activeDays?.length || 0;
          break;
        }

        case "kcal_pct": {
          const { data: prof } = await supabase
            .from("profiles")
            .select("goal_kcal")
            .eq("user_id", userId)
            .single();
          const { data: days } = await supabase
            .from("days")
            .select("kcal_total")
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date);
          const goalKcal = prof?.goal_kcal || 2000;
          newProgress = (days || []).filter(
            (d: any) => d.kcal_total >= goalKcal * 0.9
          ).length;
          break;
        }

        case "ptn_pct": {
          const { data: prof } = await supabase
            .from("profiles")
            .select("goal_ptn")
            .eq("user_id", userId)
            .single();
          const { data: days } = await supabase
            .from("days")
            .select("ptn_total")
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date);
          const goalPtn = prof?.goal_ptn || 100;
          newProgress = (days || []).filter(
            (d: any) => d.ptn_total >= goalPtn * 0.9
          ).length;
          break;
        }

        case "sleep_logged": {
          const { data: days } = await supabase
            .from("days")
            .select("sleep_start, sleep_end")
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date)
            .not("sleep_start", "is", null);
          newProgress = (days || []).filter((d: any) => {
            if (!d.sleep_start || !d.sleep_end) return false;
            const [h1, m1] = d.sleep_start.split(":").map(Number);
            const [h2, m2] = d.sleep_end.split(":").map(Number);
            let diff = h2 * 60 + m2 - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return diff >= 420;
          }).length;
          break;
        }

        case "goals_hit": {
          const { data: prof } = await supabase
            .from("profiles")
            .select("goal_kcal, goal_ptn")
            .eq("user_id", userId)
            .single();
          const { data: days } = await supabase
            .from("days")
            .select("kcal_total, ptn_total")
            .eq("user_id", userId)
            .gte("date", instance.start_date)
            .lte("date", instance.end_date);
          const gK = prof?.goal_kcal || 2000;
          const gP = prof?.goal_ptn || 100;
          newProgress = (days || []).filter(
            (d: any) =>
              d.kcal_total >= gK * 0.9 && d.ptn_total >= gP * 0.9
          ).length;
          break;
        }
      }

      // Update progress
      const updates: any = { progress: newProgress };
      if (newProgress >= challenge.target_value && !p.completed_at) {
        updates.completed_at = new Date().toISOString();

        // Award XP for challenge completion
        await supabase
          .from("profiles")
          .update({
            xp_total:
              ((await supabase.from("profiles").select("xp_total").eq("user_id", userId).single())
                .data?.xp_total || 0) + challenge.xp_reward,
          })
          .eq("user_id", userId);

        // Check if all participants completed
        const { data: allParticipants } = await supabase
          .from("challenge_participants")
          .select("completed_at")
          .eq("instance_id", instance.id);

        const allCompleted = allParticipants?.every((pp: any) => pp.completed_at || pp.user_id === userId);
        if (allCompleted) {
          await supabase
            .from("challenge_instances")
            .update({ status: "completed" })
            .eq("id", instance.id);
        }
      }

      await supabase
        .from("challenge_participants")
        .update(updates)
        .eq("id", p.id);
    }
  } catch (err) {
    console.error("Challenge progress error:", err);
  }
}
