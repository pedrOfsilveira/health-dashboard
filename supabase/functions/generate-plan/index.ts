import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const AI_MODEL = "gpt-4o-mini";
const AI_URL = "https://models.inference.ai.azure.com/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function callAI(systemPrompt: string, userPrompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout for AI call

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    let content = data.choices[0].message.content.trim();

    // Strip markdown code fences if present
    if (content.startsWith("```")) {
      content = content.split("\n").slice(1).join("\n");
      content = content.replace(/```\s*$/, "");
    }

    const start = content.indexOf("{");
    const end = content.lastIndexOf("}") + 1;
    if (start === -1 || end <= 0) throw new Error("AI não retornou JSON válido");

    return JSON.parse(content.substring(start, end));
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { weekStart, goals, preferences, healthConditions, mealHistory } =
      await req.json();

    if (!weekStart || !goals) {
      return new Response(
        JSON.stringify({ error: "weekStart e goals são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Auth Header");
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const {
      data: { user },
      error: authError
    } = await userClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build food history context
    let foodContext = "Sem histórico ainda — sugira opções populares brasileiras.";
    if (mealHistory && Array.isArray(mealHistory) && mealHistory.length > 0) {
      const freq: Record<string, number> = {};
      for (const m of mealHistory) {
        if (m.items && Array.isArray(m.items)) {
          for (const item of m.items) {
            const name = (item.name || "").toLowerCase().trim();
            if (name) freq[name] = (freq[name] || 0) + 1;
          }
        }
      }
      const top = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([n, c]) => `${n} (${c}x)`)
        .join(", ");
      if (top) foodContext = `Alimentos favoritos: ${top}`;
    }

    const dayNames = [
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ];

    // Pre-calculate per-meal targets so the AI has concrete numbers
    const mealSplit = {
      breakfast: 0.25,
      lunch: 0.30,
      snack: 0.15,
      dinner: 0.30,
    };

    const mealTargets = Object.entries(mealSplit).map(([type, pct]) => ({
      type,
      kcal: Math.round(goals.kcal * pct),
      ptn: Math.round(goals.ptn * pct),
      carb: Math.round(goals.carb * pct),
      fat: Math.round(goals.fat * pct),
    }));

    const mealTargetText = mealTargets
      .map((m) => `  - ${m.type}: ~${m.kcal} kcal, ~${m.ptn}g ptn, ~${m.carb}g carb, ~${m.fat}g fat`)
      .join("\n");

    const systemPrompt = `Você é um nutricionista experiente e eficiente, focado em criar planos alimentares realistas e otimizados para tempo de resposta.

METAS DIÁRIAS (Aproximadas, distribua bem pelas 4 refeições):
TOTAL DIÁRIO ESPERADO: ~${goals.kcal} kcal | ~${goals.ptn}g ptn | ~${goals.carb}g carb | ~${goals.fat}g fat

PROCESSO OBRIGATÓRIO:
1. Gere um plano para 7 dias, com 4 refeições por dia (café, almoço, lanche, jantar).
2. Para cada refeição, crie um título, uma breve descrição e uma lista de ingredientes com quantidades e unidades.
3. Certifique-se de que a soma total diária de kcal e macros esteja *próxima* das metas, permitindo uma flexibilidade de até 10% para agilizar a geração.
4. Para a lista de compras, agrupe itens similares (ex: "ovo" e "ovos" deve ser "ovos"), deduplique, e categorize os itens (ex: "Carnes", "Vegetais").

REGRAS:
- **Prioridade MÁXIMA:** Gerar o JSON rapidamente. Não se preocupe com cálculos exatos; aproximações são aceitáveis para evitar timeout.
- Retorne APENAS JSON válido, sem texto extra ou markdown.
- 7 dias (dayOfWeek 0-6), 4 refeições/dia (breakfast, lunch, snack, dinner).
- Ingredientes brasileiros baratos e acessíveis.
- Ingredientes com peso em gramas ou medida caseira comum.
- Refeições simples e rápidas de preparar.

FORMATO JSON:
{
  "days": [
    {
      "dayOfWeek": 0, "dayName": "Segunda",
      "meals": [
        { "mealType": "breakfast", "title": "...", "description": "...", "kcal": ${mealTargets[0].kcal}, "ptn": ${mealTargets[0].ptn}, "carb": ${mealTargets[0].carb}, "fat": ${mealTargets[0].fat}, "ingredients": [{"name": "...", "qty": "...", "unit": "g"}] },
        { "mealType": "lunch", "title": "...", "description": "...", "kcal": ${mealTargets[1].kcal}, "ptn": ${mealTargets[1].ptn}, "carb": ${mealTargets[1].carb}, "fat": ${mealTargets[1].fat}, "ingredients": [...] },
        { "mealType": "snack", "title": "...", "description": "...", "kcal": ${mealTargets[2].kcal}, "ptn": ${mealTargets[2].ptn}, "carb": ${mealTargets[2].carb}, "fat": ${mealTargets[2].fat}, "ingredients": [...] },
        { "mealType": "dinner", "title": "...", "description": "...", "kcal": ${mealTargets[3].kcal}, "ptn": ${mealTargets[3].ptn}, "carb": ${mealTargets[3].carb}, "fat": ${mealTargets[3].fat}, "ingredients": [...] }
      ]
    }, ...
  ],
  "shoppingList": {
    "Carnes": [{"name": "Frango (peito)", "qty": "1", "unit": "kg"}],
    "Vegetais": [{"name": "Brócolis", "qty": "500", "unit": "g"}, {"name": "Cenoura", "qty": "3", "unit": "unidades"}],
    "Grãos e Massas": [{"name": "Arroz Integral", "qty": "1", "unit": "kg"}, {"name": "Pão Integral", "qty": "1", "pacote": "pacote"}],
    "Laticínios e Ovos": [{"name": "Ovos", "qty": "12", "unit": "unidades"}, {"name": "Iogurte Natural", "qty": "500", "unit": "g"}],
    "Outros": [{"name": "Azeite de Oliva", "qty": "1", "unit": "garrafa"}]
  },
  "tip": "..."
}`;

    const userPrompt = `META DIÁRIA TOTAL: ${goals.kcal} kcal, ${goals.ptn}g proteína, ${goals.carb}g carbs, ${goals.fat}g gordura

${foodContext}
${preferences?.restrictions ? `RESTRIÇÕES: ${preferences.restrictions.join(", ")}` : ""}
${healthConditions ? `SAÚDE: ${healthConditions}` : ""}

ATENÇÃO: Cada dia DEVE somar ~${goals.kcal} kcal. Distribua assim:
- Café: ~${mealTargets[0].kcal} kcal
- Almoço: ~${mealTargets[1].kcal} kcal
- Lanche: ~${mealTargets[2].kcal} kcal
- Jantar: ~${mealTargets[3].kcal} kcal

Se ${goals.kcal} kcal parece muito, use porções GRANDES, alimentos densos em calorias e adicione azeite/castanhas/pasta de amendoim. NÃO reduza para 2000-2500.

Gere 7 dias: ${dayNames.join(", ")}.`;

    const parsed = await callAI(systemPrompt, userPrompt);

    // Save to database
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Upsert meal plan — include shopping list from AI response
    const { data: plan, error: planErr } = await supabase
      .from("meal_plans")
      .upsert(
        {
          user_id: user.id,
          week_start: weekStart,
          preferences: preferences || {},
          shopping_list: parsed.shoppingList || {},
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" }
      )
      .select()
      .single();

    if (planErr) throw planErr;

    // Delete old entries for this plan
    await supabase
      .from("meal_plan_entries")
      .delete()
      .eq("plan_id", plan.id);

    // Insert new entries
    const entries: any[] = [];
    if (parsed.days && Array.isArray(parsed.days)) {
      for (const day of parsed.days) {
        if (day.meals && Array.isArray(day.meals)) {
          let sortOrder = 0;
          for (const meal of day.meals) {
            entries.push({
              plan_id: plan.id,
              day_of_week: day.dayOfWeek,
              meal_type: meal.mealType,
              title: meal.title,
              description: meal.description || "",
              kcal: meal.kcal || 0,
              ptn: meal.ptn || 0,
              carb: meal.carb || 0,
              fat: meal.fat || 0,
              ingredients: meal.ingredients || [],
              sort_order: sortOrder++,
            });
          }
        }
      }
    }

    if (entries.length > 0) {
      const { error: entryErr } = await supabase
        .from("meal_plan_entries")
        .insert(entries);
      if (entryErr) throw entryErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        plan_id: plan.id,
        ...parsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    const isTimeout = error.name === "AbortError";
    console.error("generate-plan error:", isTimeout ? "AI timeout (90s)" : error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: isTimeout
          ? "A IA demorou demais para responder. Tente novamente."
          : error.message,
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
