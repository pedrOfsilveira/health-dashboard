import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const AI_MODEL = "gpt-4o-mini";
const AI_URL = "https://models.inference.ai.azure.com/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeHealthConditions(input: string[] | string | undefined | null) {
  if (!input) return [] as string[];
  if (Array.isArray(input)) {
    return input.map((c) => c.trim()).filter(Boolean);
  }
  return String(input)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

async function callAI(systemPrompt: string, userPrompt: string) {
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
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  let content = data.choices[0].message.content.trim();

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { date, remaining, goals, mealHistory, healthConditions } = await req.json();

    if (!date || !remaining) {
      return new Response(
        JSON.stringify({ error: "date e remaining são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract user_id from JWT for profile-driven goals
    const authHeader = req.headers.get("Authorization");
    let userGoals = goals;

    let profileConditions: string[] = [];

    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user } } = await userClient.auth.getUser(token);
        if (user) {
          const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
          const { data: profile } = await supabase
            .from("profiles")
            .select("goal_kcal, goal_ptn, goal_carb, goal_fat, health_conditions, goal_type")
            .eq("user_id", user.id)
            .single();
          if (profile) {
            userGoals = {
              kcal: profile.goal_kcal || userGoals?.kcal || 2000,
              ptn: profile.goal_ptn || userGoals?.ptn || 100,
              carb: profile.goal_carb || userGoals?.carb || 250,
              fat: profile.goal_fat || userGoals?.fat || 67,
            };
            profileConditions = normalizeHealthConditions(profile.health_conditions || "");
          }
        }
      } catch (e) {
        console.warn("Could not load profile goals:", e);
      }
    }

    const combinedConditions = Array.from(
      new Set([
        ...normalizeHealthConditions(healthConditions || []),
        ...profileConditions,
      ])
    );

    // Build context about eating habits
    const foodFrequency: Record<string, number> = {};
    const mealPatterns: Record<string, string[]> = {};

    if (mealHistory && Array.isArray(mealHistory)) {
      for (const meal of mealHistory) {
        const mealType = (meal.name || "").toLowerCase();
        if (!mealPatterns[mealType]) mealPatterns[mealType] = [];

        if (meal.items && Array.isArray(meal.items)) {
          for (const item of meal.items) {
            const name = (item.name || "").toLowerCase().trim();
            if (name) {
              foodFrequency[name] = (foodFrequency[name] || 0) + 1;
              if (!mealPatterns[mealType].includes(name)) {
                mealPatterns[mealType].push(name);
              }
            }
          }
        }
      }
    }

    // Sort by frequency
    const topFoods = Object.entries(foodFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => `${name} (${count}x)`)
      .join(", ");

    const patternsText = Object.entries(mealPatterns)
      .map(([type, items]) => `${type}: ${items.slice(0, 8).join(", ")}`)
      .join("\n");

    const hour = new Date().getHours();
    let timeContext = "café da manhã ou lanche matinal";
    if (hour >= 11 && hour < 14) timeContext = "almoço";
    else if (hour >= 14 && hour < 17) timeContext = "lanche da tarde";
    else if (hour >= 17 && hour < 21) timeContext = "jantar";
    else if (hour >= 21) timeContext = "ceia leve";

    const systemPrompt = `Você é um nutricionista pessoal brasileiro. Sugira refeições personalizadas baseadas nos hábitos alimentares do usuário e nas suas necessidades nutricionais restantes do dia.

REGRAS:
- Retorne APENAS JSON válido, sem markdown nem explicação
- Sugira 2-3 opções de refeição realistas e práticas
- Priorize alimentos que o usuário já come frequentemente (familiaridade)
- Ajuste as porções para se aproximar dos macros restantes
- Use tabela TACO/IBGE para estimativas
- Cada sugestão deve ter nome, descrição curta motivacional, e itens com macros
- Considere o horário atual para o tipo de refeição apropriado
- Se o usuário tiver alguma condição de saúde, adapte as sugestões (alimentos que ajudem na recuperação, evite os que podem piorar)
- Condições comuns e cuidados:
  - Gastrite/Refluxo: evite frituras, café, álcool, pimenta, tomate e cítricos em excesso
  - Lactose: evite leite, queijos e iogurtes comuns (prefira sem lactose)
  - Glúten/Celíaco: evite trigo, pão, massas tradicionais e farinha de trigo
  - Diabetes: reduza açúcar simples, bebidas açucaradas e porções grandes de carbo refinado
  - Pressão alta: evite ultraprocessados e excesso de sal (prefira temperos naturais)

FORMATO DE RESPOSTA:
{
  "suggestions": [
    {
      "name": "Nome da Refeição",
      "description": "Descrição curta e motivacional",
      "emoji": "🍽️",
      "items": [
        {"name": "Alimento", "amount": "200g", "kcal": 260, "ptn": 5, "carb": 58, "fat": 1}
      ],
      "total": {"kcal": 500, "ptn": 30, "carb": 60, "fat": 15}
    }
  ],
  "tip": "Uma dica nutricional personalizada curta"
}`;

    const userPrompt = `PERFIL DO USUÁRIO:
- Metas diárias: ${userGoals?.kcal || 2000} kcal, ${userGoals?.ptn || 100}g proteína, ${userGoals?.carb || 250}g carbs, ${userGoals?.fat || 67}g gordura
- Macros RESTANTES para hoje: ${remaining.kcal} kcal, ${remaining.ptn}g proteína, ${remaining.carb}g carbs, ${remaining.fat}g gordura
- Horário atual: ${hour}h (momento ideal para ${timeContext})

ALIMENTOS FAVORITOS (por frequência):
${topFoods || "Sem histórico ainda - sugira opções populares brasileiras"}

PADRÕES DE REFEIÇÃO:
${patternsText || "Sem padrões detectados ainda"}

${combinedConditions && combinedConditions.length > 0 ? `
⚠️ CONDIÇÕES DE SAÚDE ATIVAS:
${combinedConditions.join('\n')}
ADAPTE as sugestões para ajudar na recuperação. Priorize alimentos anti-inflamatórios, ricos em vitaminas e minerais relevantes. Evite alimentos que possam agravar os sintomas.
` : ''}
Sugira 2-3 opções de ${timeContext} que ajudem a atingir os macros restantes, priorizando os alimentos que o usuário já consome.`;

    const parsed = await callAI(systemPrompt, userPrompt);

    return new Response(
      JSON.stringify({ success: true, ...parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("suggest-meals error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
