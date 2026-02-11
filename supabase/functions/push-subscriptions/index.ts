import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { method } = req;

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!, // Use ANON_KEY for client-side functions
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const {
    data: { user },
    error: authError
  } = await userClient.auth.getUser(token);

  if (authError || !user) {
    console.error("Auth error:", authError);
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid user" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY); // Use SERVICE_ROLE_KEY for admin operations

  try {
    if (method === "POST") {
      // Save subscription
      const body = await req.json();
      console.log("push-subscriptions POST body:", JSON.stringify(body));
      const { endpoint, keys } = body;
      if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
        console.error("Missing fields - endpoint:", !!endpoint, "keys:", JSON.stringify(keys));
        return new Response(JSON.stringify({ error: "Missing subscription details (endpoint, keys.p256dh, keys.auth)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin
        .from("push_subscriptions")
        .upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" })
        .select();

      if (error) throw error;

      return new Response(JSON.stringify({ message: "Subscription saved successfully", data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (method === "DELETE") {
      // Delete subscription
      const { endpoint } = await req.json();
      if (!endpoint) {
        return new Response(JSON.stringify({ error: "Missing subscription endpoint" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);

      if (error) throw error;

      return new Response(JSON.stringify({ message: "Subscription deleted successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Push subscriptions Edge Function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
