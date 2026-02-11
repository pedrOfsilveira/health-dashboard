import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "./vendor/webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_CONTACT_EMAIL = Deno.env.get("VAPID_CONTACT_EMAIL") ?? "your_email@example.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// VAPID details for push notifications
webpush.setVapidDetails(
  `mailto:${VAPID_CONTACT_EMAIL}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);
    const today = new Date().toISOString().split('T')[0];

    // 1. Find users who haven't logged creatine today
    const { data: daysWithoutCreatine, error: daysError } = await supabaseAdmin
      .from("days")
      .select("user_id")
      .eq("date", today)
      .is("creatine_taken_at", null);

    if (daysError) throw daysError;

    if (!daysWithoutCreatine || daysWithoutCreatine.length === 0) {
      return new Response(JSON.stringify({ message: "No users found without creatine log today." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIdsWithoutCreatine = daysWithoutCreatine.map((d) => d.user_id);

    // 2. Check notification preferences — only include users who have creatine_enabled = true
    const { data: prefs, error: prefsError } = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id")
      .in("user_id", userIdsWithoutCreatine)
      .eq("creatine_enabled", true);

    if (prefsError) throw prefsError;

    // If no one opted in, skip
    const eligibleUserIds = (prefs || []).map((p) => p.user_id);
    if (eligibleUserIds.length === 0) {
      return new Response(JSON.stringify({ message: "No users with creatine reminders enabled." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch push subscriptions for eligible users only
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", eligibleUserIds);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No active subscriptions for eligible users." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Send push notifications
    const notificationsSent: Promise<void>[] = [];
    const payload = JSON.stringify({
      title: "Lembrete de Creatina",
      body: "Não se esqueça de tomar sua creatina hoje! 💊",
      icon: "/public/icon-192.png",
      data: { url: "/" },
    });

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      notificationsSent.push(
        webpush.sendNotification(pushSubscription, payload)
          .then(() => console.log(`Push notification sent to user ${sub.user_id}`))
          .catch(async (err: { statusCode?: number }) => {
            console.error(`Failed to send push to user ${sub.user_id}:`, err);
            // If the subscription is invalid, remove it from the database
            if (err.statusCode === 404 || err.statusCode === 410) {
              console.log(`Removing expired/invalid subscription for user ${sub.user_id}`);
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
            }
          })
      );
    }

    await Promise.allSettled(notificationsSent);

    return new Response(JSON.stringify({ message: `Creatine reminders sent to ${subscriptions.length} users.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Creatine reminder Edge Function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
