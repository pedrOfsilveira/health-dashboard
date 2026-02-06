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

Se for uma nota/observação, retorne:
{"type": "note", "text": "texto"}

Regras:
- Estime calorias e macros com base em tabelas nutricionais brasileiras (TACO/IBGE)
- Se o usuário informar peso (ex: "200g de arroz"), use valores proporcionais
- Se não informar peso, estime uma porção média
- O campo "name" da refeição deve ser o tipo (Almoço, Jantar, Lanche, Café da manhã, etc)
- Sempre retorne valores numéricos inteiros para kcal, ptn, carb, fat`;

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Registrar no chat_logs
    const { data: logData } = await supabase
      .from("chat_logs")
      .insert({ date, text, status: "processing" })
      .select()
      .single();

    // 2. Garantir que o dia existe
    const { data: existingDay } = await supabase
      .from("days")
      .select("date")
      .eq("date", date)
      .single();

    if (!existingDay) {
      await supabase.from("days").insert({
        date,
        kcal_total: 0,
        ptn_total: 0,
        carb_total: 0,
        fat_total: 0,
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
        })
        .select("id")
        .single();

      if (mealErr) {
        // Fallback sem carb/fat
        const { data: meal2 } = await supabase
          .from("meals")
          .insert({ date, name: parsed.name || "Refeição", kcal: totalKcal, ptn: totalPtn })
          .select("id")
          .single();
        if (meal2) {
          for (const item of items) {
            await supabase.from("meal_items").insert({
              meal_id: meal2.id,
              name: item.name || "Item",
              kcal: item.kcal || 0,
              ptn: item.ptn || 0,
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
          });
          // Fallback sem carb/fat
          if (itemErr) {
            await supabase.from("meal_items").insert({
              meal_id: meal.id,
              name: item.name || "Item",
              kcal: item.kcal || 0,
              ptn: item.ptn || 0,
            });
          }
        }
      }

      // Atualizar totais do dia
      const { data: day } = await supabase.from("days").select("*").eq("date", date).single();
      if (day) {
        await supabase
          .from("days")
          .update({
            kcal_total: (day.kcal_total || 0) + totalKcal,
            ptn_total: (day.ptn_total || 0) + totalPtn,
            carb_total: (day.carb_total || 0) + totalCarb,
            fat_total: (day.fat_total || 0) + totalFat,
          })
          .eq("date", date);
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
        .eq("date", date);

      responseMsg = `🌙 Sono registrado: ${parsed.start} → ${parsed.end} (${parsed.quality})`;
    } else {
      // Nota
      const { data: day } = await supabase.from("days").select("notes").eq("date", date).single();
      const existing = day?.notes || "";
      const newNotes = (existing + "\n" + (parsed.text || text)).trim();
      await supabase.from("days").update({ notes: newNotes }).eq("date", date);

      responseMsg = `📝 Nota registrada.`;
    }

    // 5. Marcar chat_log como concluído
    if (logData) {
      await supabase
        .from("chat_logs")
        .update({ status: "completed", response: responseMsg })
        .eq("id", logData.id);
    }

    return new Response(
      JSON.stringify({ success: true, message: responseMsg, data: parsed }),
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
