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

function normalizeHealthConditions(input: string | string[] | undefined | null) {
  if (!input) return [] as string[];
  if (Array.isArray(input)) return input.map((c) => c.trim()).filter(Boolean);
  return String(input)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

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

REFERÊNCIAS NUTRICIONAIS OBRIGATÓRIAS (baseadas na tabela TACO/IBGE — use como base). Quando disponível, consulte também rótulos de marcas e bases oficiais (ex.: USDA, rótulos de fabricantes) e priorize essas fontes ao estimar:
- Peito de frango grelhado (100g): ~159 kcal, 30g ptn, 0g carb, 3g fat
- Sobrecoxa de frango assada (~80g sem osso): ~170 kcal, 18g ptn, 0g carb, 10g fat
- Coxa de frango assada (~50g sem osso): ~110 kcal, 12g ptn, 0g carb, 7g fat
- Ovo cozido (1 unid ~50g): ~72 kcal, 6g ptn, 0.5g carb, 5g fat
- Bife bovino grelhado (100g): ~190 kcal, 27g ptn, 0g carb, 9g fat
- Carne moída refogada (100g): ~212 kcal, 22g ptn, 0g carb, 14g fat
- Atum em lata (120g drenado): ~130 kcal, 26g ptn, 0g carb, 2g fat
- Colher grande arroz (~40g cozido): ~51 kcal, 1g ptn, 11g carb, 0g fat
- Colher grande feijão (~60g): ~46 kcal, 3g ptn, 8g carb, 0.4g fat
- Pão francês (50g): ~135 kcal, 4g ptn, 26g carb, 1g fat
- Batata cozida (100g): ~52 kcal, 1g ptn, 12g carb, 0g fat
- Macarrão cozido (100g): ~102 kcal, 3g ptn, 20g carb, 0.5g fat
- Banana (100g): ~89 kcal, 1g ptn, 23g carb, 0g fat
- Leite integral (250ml): ~146 kcal, 8g ptn, 11g carb, 8g fat
- Iogurte natural (170g): ~92 kcal, 6g ptn, 7g carb, 4g fat
- Whey protein (1 scoop 30g): ~120 kcal, 24g ptn, 2g carb, 1g fat
- Queijo mussarela (1 fatia 20g): ~56 kcal, 4g ptn, 0.5g carb, 4g fat
- Azeite de oliva (1 colher sopa 13ml): ~117 kcal, 0g ptn, 0g carb, 13g fat

ATENÇÃO — PROTEÍNA (macro mais frequentemente superestimado):
- 1 ovo = apenas 6g de proteína (NÃO 12-13g)
- Arroz e feijão = 1-3g de proteína por colher (proteína BAIXA)
- Frutas, pão, vegetais = 0-2g de proteína (negligível)
- Sobrecoxa/coxa tem MENOS proteína que peito de frango
- Para atingir metas altas de proteína, é necessário incluir fontes concentradas (carnes, whey, atum)

PROCESSO OBRIGATÓRIO:
1. Gere um plano para 7 dias, com 4 refeições por dia (café, almoço, lanche, jantar).
2. Para cada refeição, crie um título, uma breve descrição e uma lista de ingredientes com quantidades e unidades.
3. Certifique-se de que a soma total diária de kcal e macros esteja *próxima* das metas, permitindo uma flexibilidade de até 10% para agilizar a geração.
4. Use as referências nutricionais acima para calcular. Na dúvida, prefira valores CONSERVADORES.
5. Para a lista de compras, agrupe itens similares (ex: "ovo" e "ovos" deve ser "ovos"), deduplique, e categorize os itens (ex: "Carnes", "Vegetais").

REGRAS:
- **Prioridade MÁXIMA:** Gerar o JSON rapidamente. Não se preocupe com cálculos exatos; aproximações são aceitáveis para evitar timeout.
- Retorne APENAS JSON válido, sem texto extra ou markdown.
- 7 dias (dayOfWeek 0-6), 4 refeições/dia (breakfast, lunch, snack, dinner).
- Ingredientes brasileiros baratos e acessíveis.
- Ingredientes com peso em gramas ou medida caseira comum.
- Refeições simples e rápidas de preparar.
- Se houver condições de saúde, adapte as escolhas:
  - Gastrite/Refluxo: evite frituras, café, álcool, pimenta, tomate e cítricos em excesso
  - Lactose: evite leite, queijos e iogurtes comuns (prefira sem lactose)
  - Glúten/Celíaco: evite trigo, pão, massas tradicionais e farinha de trigo
  - Diabetes: reduza açúcar simples, bebidas açucaradas e porções grandes de carbo refinado
  - Pressão alta: evite ultraprocessados e excesso de sal (prefira temperos naturais)

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

    const healthList = normalizeHealthConditions(healthConditions);

    const userPrompt = `META DIÁRIA TOTAL: ${goals.kcal} kcal, ${goals.ptn}g proteína, ${goals.carb}g carbs, ${goals.fat}g gordura

${foodContext}
${preferences?.restrictions ? `RESTRIÇÕES: ${preferences.restrictions.join(", ")}` : ""}
  ${healthList.length > 0 ? `SAÚDE: ${healthList.join(", ")}` : ""}

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
