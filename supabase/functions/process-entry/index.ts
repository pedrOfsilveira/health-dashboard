import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const AI_MODEL = "gpt-4o-mini";
const AI_URL = "https://models.inference.ai.azure.com/chat/completions";

const SYSTEM_PROMPT = `Você é um coach nutricional motivador e encorajador, sempre usando um tom amigável e empático. Analise o texto do usuário e retorne APENAS um JSON válido (sem markdown, sem explicação).

REGRA CRÍTICA SOBRE QUANTIDADES:
- Quando o usuário mencionar uma quantidade (ex: "2 sobrecoxas", "3 ovos", "4 colheres de arroz"), você DEVE:
  1. Incluir a quantidade no nome do item usando o formato "Nx Item" (ex: "2x Sobrecoxa", "3x Ovo")
  2. MULTIPLICAR os valores nutricionais pela quantidade. Os valores de kcal, ptn, carb e fat devem ser o TOTAL para todas as unidades.
  3. Se não houver quantidade explícita, assume-se 1 unidade/porção padrão.

REFERÊNCIAS NUTRICIONAIS REALISTAS (valores por UNIDADE, baseados na tabela TACO/IBGE). Use também, quando disponível, rótulos de marcas e bases oficiais (ex.: USDA, tabelas do fabricante). Priorize fontes oficiais e rótulos reais ao estimar:

CARNES E PROTEÍNAS:
- Sobrecoxa de frango (assada/cozida, ~80g sem osso): ~170 kcal, 18g ptn, 0g carb, 10g fat
- Sobrecoxa de frango (frita, ~80g sem osso): ~210 kcal, 17g ptn, 3g carb, 14g fat
- Coxa de frango (assada, ~50g sem osso): ~110 kcal, 12g ptn, 0g carb, 7g fat
- Peito de frango grelhado (100g): ~159 kcal, 30g ptn, 0g carb, 3g fat
- Peito de frango grelhado (porção comum ~130g): ~207 kcal, 39g ptn, 0g carb, 4g fat
- Ovo inteiro cozido (1 unid ~50g): ~72 kcal, 6g ptn, 0.5g carb, 5g fat
- Ovo mexido com óleo (1 unid): ~90 kcal, 6g ptn, 1g carb, 7g fat
- Bife bovino grelhado (100g, patinho/alcatra): ~190 kcal, 27g ptn, 0g carb, 9g fat
- Bife bovino grelhado (porção comum ~120g): ~228 kcal, 32g ptn, 0g carb, 11g fat
- Carne moída refogada (100g): ~212 kcal, 22g ptn, 0g carb, 14g fat
- Linguiça calabresa (1 unid ~60g): ~185 kcal, 10g ptn, 1g carb, 16g fat
- Atum em lata (1 lata ~120g drenado): ~130 kcal, 26g ptn, 0g carb, 2g fat
- Sardinha em lata (1 lata ~84g drenado): ~150 kcal, 15g ptn, 0g carb, 10g fat
- Presunto (1 fatia ~15g): ~22 kcal, 2g ptn, 0g carb, 1.5g fat
- Queijo mussarela (1 fatia ~20g): ~56 kcal, 4g ptn, 0.5g carb, 4g fat
- Queijo minas frescal (1 fatia ~30g): ~55 kcal, 5g ptn, 0g carb, 4g fat
- Requeijão (1 colher sopa ~20g): ~54 kcal, 1g ptn, 0.5g carb, 5g fat

CARBOIDRATOS:
- Colher grande de arroz branco (~40g cozido): ~51 kcal, 1g ptn, 11g carb, 0g fat
- Colher grande de arroz integral (~40g cozido): ~44 kcal, 1g ptn, 9g carb, 0.3g fat
- Colher grande de feijão (~60g): ~46 kcal, 3g ptn, 8g carb, 0.4g fat
- Pão francês (1 unidade ~50g): ~135 kcal, 4g ptn, 26g carb, 1g fat
- Pão de forma integral (1 fatia ~25g): ~62 kcal, 2g ptn, 11g carb, 1g fat
- Batata cozida (100g): ~52 kcal, 1g ptn, 12g carb, 0g fat
- Batata frita (porção ~100g): ~267 kcal, 3g ptn, 33g carb, 14g fat
- Macarrão cozido (100g): ~102 kcal, 3g ptn, 20g carb, 0.5g fat
- Tapioca (1 unid ~30g seca): ~108 kcal, 0g ptn, 27g carb, 0g fat
- Farofa pronta (1 colher sopa ~15g): ~53 kcal, 0.5g ptn, 7g carb, 3g fat
- Cuscuz de milho (porção ~100g cozido): ~113 kcal, 2g ptn, 25g carb, 0.5g fat

FRUTAS:
- Banana (1 unidade média ~100g): ~89 kcal, 1g ptn, 23g carb, 0g fat
- Maçã (1 unidade média ~130g): ~68 kcal, 0g ptn, 18g carb, 0g fat
- Laranja (1 unidade ~140g): ~56 kcal, 1g ptn, 14g carb, 0g fat
- Mamão (1 fatia ~150g): ~54 kcal, 1g ptn, 14g carb, 0g fat

LATICÍNIOS:
- Leite integral (1 copo 250ml): ~146 kcal, 8g ptn, 11g carb, 8g fat
- Leite desnatado (1 copo 250ml): ~83 kcal, 8g ptn, 12g carb, 0g fat
- Iogurte natural (1 pote ~170g): ~92 kcal, 6g ptn, 7g carb, 4g fat
- Iogurte grego (1 pote ~100g): ~97 kcal, 4g ptn, 14g carb, 3g fat
- Whey protein (1 scoop ~30g): ~120 kcal, 24g ptn, 2g carb, 1g fat

OUTROS:
- Fatia de pizza (média, ~1/8 pizza grande): ~220 kcal, 9g ptn, 28g carb, 8g fat
- Hambúrguer caseiro (pão+carne+salada): ~350 kcal, 18g ptn, 30g carb, 17g fat
- Coxinha (1 unid ~80g): ~215 kcal, 7g ptn, 22g carb, 11g fat
- Pastel (1 unid médio): ~280 kcal, 6g ptn, 25g carb, 17g fat
- Açaí (tigela ~300ml): ~330 kcal, 4g ptn, 50g carb, 12g fat
- Granola (1 colher sopa ~15g): ~62 kcal, 1g ptn, 10g carb, 2g fat
- Azeite de oliva (1 colher sopa ~13ml): ~117 kcal, 0g ptn, 0g carb, 13g fat
- Manteiga (1 colher chá ~5g): ~36 kcal, 0g ptn, 0g carb, 4g fat
- Amendoim (1 colher sopa ~15g): ~88 kcal, 4g ptn, 3g carb, 7g fat
- Castanha-do-pará (1 unid ~5g): ~33 kcal, 1g ptn, 0.5g carb, 3g fat

REGRA DE PRECISÃO: Use ESTRITAMENTE as referências acima. Quando o alimento não estiver listado, use a tabela TACO/IBGE como base. NUNCA invente valores — se não tiver certeza, use estimativas CONSERVADORAS (na dúvida, estime MENOS, não mais).

Exemplos de refeições:
- "almocei arroz, feijão e salada" -> {"type": "meal", "name": "Almoço", "items": [{"name": "Arroz branco (3 colheres)", "kcal": 153, "ptn": 3, "carb": 33, "fat": 0}, {"name": "Feijão (2 colheres)", "kcal": 92, "ptn": 6, "carb": 16, "fat": 1}, {"name": "Salada mista", "kcal": 15, "ptn": 1, "carb": 3, "fat": 0}]}
- "jantei frango com batata" -> {"type": "meal", "name": "Jantar", "items": [{"name": "Frango grelhado (130g)", "kcal": 207, "ptn": 39, "carb": 0, "fat": 4}, {"name": "Batata cozida (100g)", "kcal": 52, "ptn": 1, "carb": 12, "fat": 0}]}
- "almocei 2 sobrecoxas, 4 colheres grandes de arroz branco" -> {"type": "meal", "name": "Almoço", "items": [{"name": "2x Sobrecoxa de frango assada", "kcal": 340, "ptn": 36, "carb": 0, "fat": 20}, {"name": "4x Colher de arroz branco", "kcal": 204, "ptn": 4, "carb": 44, "fat": 0}]}
- "comi 3 ovos mexidos" -> {"type": "meal", "name": "Refeição", "items": [{"name": "3x Ovo mexido", "kcal": 270, "ptn": 18, "carb": 3, "fat": 21}]}
- "lanchei uma maçã e iogurte" -> {"type": "meal", "name": "Lanche", "items": [{"name": "Maçã", "kcal": 68, "ptn": 0, "carb": 18, "fat": 0}, {"name": "Iogurte natural", "kcal": 92, "ptn": 6, "carb": 7, "fat": 4}]}
- "comi 2 fatias de pizza" -> {"type": "meal", "name": "Refeição", "items": [{"name": "2x Fatia de pizza", "kcal": 440, "ptn": 18, "carb": 56, "fat": 16}]}
- "almocei bife com arroz e feijão" -> {"type": "meal", "name": "Almoço", "items": [{"name": "Bife grelhado (120g)", "kcal": 228, "ptn": 32, "carb": 0, "fat": 11}, {"name": "Arroz branco (3 colheres)", "kcal": 153, "ptn": 3, "carb": 33, "fat": 0}, {"name": "Feijão (2 colheres)", "kcal": 92, "ptn": 6, "carb": 16, "fat": 1}]}

Exemplos de água (SOMENTE água pura, nunca leite, suco, refrigerante ou outras bebidas):
- "bebi 500ml de água" -> {"type": "water", "amount_ml": 500}
- "tomei 2 copos d'água" -> {"type": "water", "amount_ml": 500}
- "hidratei com 1L" -> {"type": "water", "amount_ml": 1000}

Exemplos de bebidas que NÃO são água (devem ser tratadas como refeição/alimento):
- "bebi um copo de leite" -> {"type": "meal", "name": "Refeição", "items": [{"name": "Leite integral (250ml)", "kcal": 146, "ptn": 8, "carb": 11, "fat": 8}]}
- "tomei suco de laranja" -> {"type": "meal", "name": "Refeição", "items": [{"name": "Suco de laranja (200ml)", "kcal": 84, "ptn": 1, "carb": 20, "fat": 0}]}
- "bebi refrigerante" -> {"type": "meal", "name": "Refeição", "items": [{"name": "Refrigerante (350ml)", "kcal": 140, "ptn": 0, "carb": 35, "fat": 0}]}
- "tomei café com leite" -> {"type": "meal", "name": "Café da Manhã", "items": [{"name": "Café com leite (200ml)", "kcal": 75, "ptn": 4, "carb": 6, "fat": 4}]}

Exemplos de sono:
- "dormi das 22h às 6h, bem" -> {"type": "sleep", "start": "22:00", "end": "06:00", "quality": "BOA"}
- "sono: 23:30 - 7:15, qualidade ruim" -> {"type": "sleep", "start": "23:30", "end": "07:15", "quality": "RUIM"}
- "dormi pouco hoje" -> {"type": "sleep", "start": "00:00", "end": "05:00", "quality": "RUIM"}

Exemplos de saúde:
- "estou com gripe" -> {"type": "health", "condition": "gripe", "details": "", "severity": "moderado"}
- "dor de cabeça forte" -> {"type": "health", "condition": "dor de cabeça", "details": "", "severity": "severo"}
- "tomei remédio para febre" -> {"type": "health", "condition": "febre", "details": "tomou remédio", "severity": "moderado"}
- "mal-estar geral" -> {"type": "health", "condition": "mal-estar", "details": "", "severity": "leve"}

Exemplos de notas:
- "hoje foi um dia bom" -> {"type": "note", "text": "hoje foi um dia bom"}
- "aniversário da minha mãe" -> {"type": "note", "text": "aniversário da minha mãe"}
- "viagem amanhã" -> {"type": "note", "text": "viagem amanhã"}

Se for refeição/comida, retorne:
{"type": "meal", "name": "Nome da Refeição", "items": [{"name": "item", "kcal": 100, "ptn": 10, "carb": 20, "fat": 5}]}

Se for água/hidratação (SOMENTE água pura, não leite, suco, refrigerante ou outras bebidas), retorne:
{"type": "water", "amount_ml": 500}

Se for dado de sono, retorne:
{"type": "sleep", "start": "HH:MM", "end": "HH:MM", "quality": "BOA"}

Se for condição de saúde (gripe, dor, febre, mal-estar, medicamento, etc), retorne:
{"type": "health", "condition": "nome da condição", "details": "detalhes relevantes", "severity": "leve|moderado|severo"}

Se for uma nota/observação geral, retorne:
{"type": "note", "text": "texto"}

Regras importantes:
- Identifique refeições por verbos como: almocei, jantei, comi, lanchei, café da manhã, merendei, ceei, etc.
- Identifique sono por palavras como: dormi, sono, durmi, etc.
- Identifique saúde por sintomas: dor, febre, gripe, resfriado, mal-estar, remédio, medicamento, etc.
- Identifique água APENAS quando for água pura/natural. Nunca classifique como água: leite, suco, refrigerante, café, chá, ou qualquer bebida que não seja água.
- Leite, sucos, refrigerantes e outras bebidas devem SEMPRE ser classificadas como refeições (type: "meal") com seus respectivos valores nutricionais.
- REGRA CRÍTICA: Quando houver quantidade numérica ("2 sobrecoxas", "3 ovos", "4 colheres"), use o formato "Nx Item" no nome E multiplique todos os macros pela quantidade.
- REGRA DE PRECISÃO: Use as referências nutricionais acima como base. Na dúvida, prefira valores CONSERVADORES e realistas. É melhor ser preciso do que superestimar — o usuário depende destes dados para guiar sua dieta.
- ATENÇÃO COM PROTEÍNA: Proteína é o macro mais frequentemente superestimado. Lembre-se:
  - 1 ovo = apenas 6g de proteína
  - 1 sobrecoxa = ~18g de proteína (não 25-30g)
  - 100g de frango = ~30g de proteína (peito) ou ~18g (coxa/sobrecoxa sem osso)
  - Arroz e feijão têm POUCA proteína (1-3g por colher)
  - Alimentos como pão, frutas e vegetais têm proteína NEGLIGÍVEL (0-2g)
- Sobrecoxas, coxas, asas de frango são cortes mais calóricos mas com MENOS proteína que peito. Use valores realistas.
- Se o usuário informar peso (ex: "200g de arroz"), use valores proporcionais.
- Sempre retorne valores numéricos inteiros para kcal, ptn, carb, fat.
- O campo "name" da refeição deve ser descritivo: Almoço, Jantar, Lanche, Café da Manhã, etc.
- Para sono, extraia horários no formato HH:MM e qualidade (BOA, RUIM, etc.).
- Para água, converta: 1 copo = 250ml, 1L = 1000ml.
- Seja positivo e celebre o progresso do usuário!`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function callAI(userText: string) {
  const AZURE_KEY = Deno.env.get("AZURE_API_KEY") || Deno.env.get("AZURE_OPENAI_KEY");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AZURE_KEY) {
    headers["api-key"] = AZURE_KEY;
  } else if (GITHUB_TOKEN) {
    // Backwards-compat: some deployments put the key in GITHUB_TOKEN
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  const res = await fetch(AI_URL, {
    method: "POST",
    headers,
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
      const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY);
      try {
        const { data: { user }, error } = await adminClient.auth.getUser(token as string);
        if (error) {
          console.error("auth.getUser error:", error);
        }
        userId = user?.id ?? null;
      } catch (e) {
        console.error("auth.getUser threw:", e);
        userId = null;
      }
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
      
      // Motivational messages based on protein content
      let motivationalMsg = "";
      if (totalPtn >= 30) {
        motivationalMsg = " Excelente fonte de proteína!";
      } else if (totalPtn >= 20) {
        motivationalMsg = " Ótimo trabalho!";
      } else if (totalKcal >= 500) {
        motivationalMsg = " Refeição completa registrada!";
      } else {
        motivationalMsg = " Registrado com sucesso!";
      }
      
      responseMsg = `✅ ${parsed.name}: ${itemNames} (~${totalKcal} kcal, ${totalPtn}g ptn)${motivationalMsg}`;
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

      // Calculate sleep duration for motivational message
      const [h1, m1] = parsed.start.split(':').map(Number);
      const [h2, m2] = parsed.end.split(':').map(Number);
      let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diffMinutes < 0) diffMinutes += 24 * 60;
      const hours = Math.floor(diffMinutes / 60);
      
      let sleepMsg = "";
      if (hours >= 8) {
        sleepMsg = " Sono excelente! Continue assim!";
      } else if (hours >= 7) {
        sleepMsg = " Ótimo descanso!";
      } else if (hours >= 6) {
        sleepMsg = " Bom sono! Tente dormir um pouco mais amanhã.";
      } else {
        sleepMsg = " Registrado! Lembre-se: 7-9h é o ideal.";
      }

      responseMsg = `Sono registrado: ${parsed.start} → ${parsed.end} (${parsed.quality})${sleepMsg}`;
    } else if (parsed.type === "water") {
      // Hidratação
      const amountMl = parsed.amount_ml || 250;
      
      // Get current water
      const { data: day } = await supabase.from("days").select("water_ml").eq("date", date).eq("user_id", userId).single();
      const newTotal = (day?.water_ml || 0) + amountMl;
      
      // Update water
      await supabase
        .from("days")
        .update({ water_ml: newTotal, water_target: 2000 })
        .eq("date", date)
        .eq("user_id", userId);

      // Insert water log
      await supabase
        .from("water_logs")
        .insert({ user_id: userId, date, amount_ml: amountMl });

      // Calculate progress
      const progress = Math.round((newTotal / 2000) * 100);
      const remaining = Math.max(0, 2000 - newTotal);
      const glassesEquiv = Math.round(amountMl / 250);
      
      if (newTotal >= 2000) {
        responseMsg = `+${amountMl}ml registrado! Meta de hidratação alcançada (${newTotal}ml)!`;
      } else if (remaining <= 500) {
        responseMsg = `+${amountMl}ml registrado! Quase lá! Faltam apenas ${remaining}ml (${100 - progress}%) para a meta.`;
      } else if (progress >= 50) {
        responseMsg = `+${amountMl}ml registrado! Você já está em ${progress}% da meta. Continue assim!`;
      } else {
        responseMsg = `+${amountMl}ml (${glassesEquiv > 0 ? `~${glassesEquiv} copo${glassesEquiv > 1 ? 's' : ''}` : 'menos que 1 copo'}) registrado! Total: ${newTotal}ml / 2000ml (${progress}%)`;
      }
    } else if (parsed.type === "health") {
      // Condição de saúde
      const healthTag = `[SAÚDE] ${parsed.condition}: ${parsed.details || text} (${parsed.severity || "leve"})`;
      const { data: day } = await supabase.from("days").select("notes").eq("date", date).eq("user_id", userId).single();
      const existing = day?.notes || "";
      const newNotes = (existing + "\n" + healthTag).trim();
      await supabase.from("days").update({ notes: newNotes }).eq("date", date).eq("user_id", userId);

      responseMsg = `Saúde registrada: ${parsed.condition}. Suas sugestões serão adaptadas.`;
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
