import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "./vendor/webpush.ts";

/**
 * send-notifications: Comprehensive push notification sender.
 * 
 * Runs on a cron schedule (every 5 minutes) and checks all users' notification
 * preferences. For each enabled notification type, it checks if the current time
 * (in UTC, compared to the user's preferred time) falls within a 5-minute window.
 * If so, and the notification hasn't already been sent today for that slot, it
 * sends a push notification and logs it to prevent duplicates.
 * 
 * Supports: water reminders, creatine reminders, meal reminders.
 */

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

webpush.setVapidDetails(
  `mailto:${VAPID_CONTACT_EMAIL}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

// ─── Notification payloads ──────────────────────────────────────────

const PAYLOADS: Record<string, { title: string; body: string; icon?: string }> = {
  water: {
    title: "💧 Hora de beber água!",
    body: "Mantenha-se hidratado! Beba um copo de água agora.",
    icon: "/icon-192.png",
  },
  creatine: {
    title: "💊 Lembrete de Creatina",
    body: "Não se esqueça de tomar sua creatina hoje!",
    icon: "/icon-192.png",
  },
  meal_breakfast: {
    title: "☕ Hora do café da manhã!",
    body: "Não esqueça de registrar seu café da manhã.",
    icon: "/icon-192.png",
  },
  meal_lunch: {
    title: "🍽️ Hora do almoço!",
    body: "Não esqueça de registrar seu almoço.",
    icon: "/icon-192.png",
  },
  meal_snack: {
    title: "🍎 Hora do lanche!",
    body: "Não esqueça de registrar seu lanche da tarde.",
    icon: "/icon-192.png",
  },
  meal_dinner: {
    title: "🌙 Hora do jantar!",
    body: "Não esqueça de registrar seu jantar.",
    icon: "/icon-192.png",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

/** Parse a time string "HH:MM" or "HH:MM:SS" into total minutes since midnight */
function timeToMinutes(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** Get the current UTC time as total minutes since midnight */
function nowUTCMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * Check if a preferred LOCAL time is "due" — within WINDOW_MINUTES of the current UTC time.
 * utcOffsetMinutes is the user's offset from UTC in minutes (e.g. UTC-3 = -180).
 * We convert the local preferred time to UTC by subtracting the offset.
 */
function isDue(preferredLocalTime: string, utcOffsetMinutes: number, windowMinutes = 7): boolean {
  const preferredLocal = timeToMinutes(preferredLocalTime);
  // Convert local time to UTC: UTC = local - offset
  let preferredUTC = preferredLocal - utcOffsetMinutes;
  // Normalize to 0..1439 range
  preferredUTC = ((preferredUTC % 1440) + 1440) % 1440;
  
  const now = nowUTCMinutes();
  // Handle time wrapping around midnight
  let diff = now - preferredUTC;
  if (diff < -720) diff += 1440;  // wrap around
  if (diff > 720) diff -= 1440;
  // The notification is due if we're between 0 and windowMinutes past the preferred time
  return diff >= 0 && diff < windowMinutes;
}

/** Generate water reminder time slots between start and end times at the given interval */
function getWaterSlots(startTime: string, endTime: string, intervalMinutes: number): string[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const slots: string[] = [];
  for (let m = start; m <= end; m += intervalMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const today = new Date().toISOString().split("T")[0];

    // 1. Fetch all notification preferences
    const { data: allPrefs, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("*")
      .or("water_enabled.eq.true,creatine_enabled.eq.true,meal_enabled.eq.true");

    if (prefsError) throw prefsError;

    if (!allPrefs || allPrefs.length === 0) {
      return jsonResponse({ message: "No users with any notifications enabled." });
    }

    // 2. Fetch all push subscriptions
    const userIds = allPrefs.map((p) => p.user_id);
    const { data: allSubs, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds);

    if (subError) throw subError;

    // Build a map of user_id -> subscriptions[]
    const subsByUser: Record<string, typeof allSubs> = {};
    for (const sub of allSubs || []) {
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
      subsByUser[sub.user_id].push(sub);
    }

    // 3. Fetch already-sent notifications for today to avoid duplicates
    const { data: sentToday, error: logError } = await supabase
      .from("notification_log")
      .select("user_id, notification_type, slot")
      .eq("sent_date", today)
      .in("user_id", userIds);

    if (logError) throw logError;

    // Build a set of "user_id|type|slot" for fast lookup
    const sentSet = new Set<string>();
    for (const log of sentToday || []) {
      sentSet.add(`${log.user_id}|${log.notification_type}|${log.slot}`);
    }

    // 4. For creatine: fetch which users already took it today
    const { data: daysToday } = await supabase
      .from("days")
      .select("user_id, creatine_taken_at")
      .eq("date", today)
      .in("user_id", userIds);

    const creatineTakenSet = new Set<string>();
    for (const d of daysToday || []) {
      if (d.creatine_taken_at) creatineTakenSet.add(d.user_id);
    }

    // 5. Build the list of notifications to send
    interface PendingNotification {
      userId: string;
      type: string;
      slot: string;
      payload: string;
    }

    const pending: PendingNotification[] = [];

    for (const prefs of allPrefs) {
      const userId = prefs.user_id;

      // Skip users without push subscriptions
      if (!subsByUser[userId] || subsByUser[userId].length === 0) continue;

      // User's UTC offset (e.g. -180 for UTC-3). Default to 0 if not set.
      const utcOffset: number = prefs.utc_offset_minutes ?? 0;

      // ─── Creatine ───
      if (prefs.creatine_enabled && prefs.creatine_time) {
        const slot = prefs.creatine_time.slice(0, 5); // "HH:MM"
        const key = `${userId}|creatine|${slot}`;
        if (!sentSet.has(key) && !creatineTakenSet.has(userId) && isDue(prefs.creatine_time, utcOffset)) {
          pending.push({
            userId,
            type: "creatine",
            slot,
            payload: JSON.stringify({ ...PAYLOADS.creatine, data: { url: "/" } }),
          });
        }
      }

      // ─── Water ───
      if (prefs.water_enabled && prefs.water_start_time && prefs.water_end_time) {
        const waterSlots = getWaterSlots(
          prefs.water_start_time,
          prefs.water_end_time,
          prefs.water_interval_minutes || 60,
        );
        for (const slot of waterSlots) {
          const key = `${userId}|water|${slot}`;
          if (!sentSet.has(key) && isDue(slot, utcOffset)) {
            pending.push({
              userId,
              type: "water",
              slot,
              payload: JSON.stringify({ ...PAYLOADS.water, data: { url: "/" } }),
            });
          }
        }
      }

      // ─── Meals ───
      if (prefs.meal_enabled) {
        const mealTypes = [
          { type: "meal_breakfast", time: prefs.meal_breakfast_time },
          { type: "meal_lunch", time: prefs.meal_lunch_time },
          { type: "meal_snack", time: prefs.meal_snack_time },
          { type: "meal_dinner", time: prefs.meal_dinner_time },
        ];
        for (const meal of mealTypes) {
          if (!meal.time) continue;
          const slot = meal.time.slice(0, 5);
          const key = `${userId}|${meal.type}|${slot}`;
          if (!sentSet.has(key) && isDue(meal.time, utcOffset)) {
            const payloadData = PAYLOADS[meal.type];
            if (payloadData) {
              pending.push({
                userId,
                type: meal.type,
                slot,
                payload: JSON.stringify({ ...payloadData, data: { url: "/" } }),
              });
            }
          }
        }
      }
    }

    if (pending.length === 0) {
      return jsonResponse({ message: "No notifications due at this time.", checked: allPrefs.length });
    }

    // 6. Send all pending notifications
    let sentCount = 0;
    let failedCount = 0;
    const logsToInsert: Array<{
      user_id: string;
      notification_type: string;
      sent_date: string;
      slot: string;
    }> = [];

    for (const notif of pending) {
      const userSubs = subsByUser[notif.userId] || [];
      let anySent = false;

      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notif.payload,
          );
          anySent = true;
          console.log(`✅ Sent ${notif.type} to user ${notif.userId} (slot ${notif.slot})`);
        } catch (err: any) {
          console.error(`❌ Failed ${notif.type} to user ${notif.userId}:`, err.message || err);
          // Remove expired/invalid subscriptions
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(`🗑️ Removing expired subscription for user ${notif.userId}`);
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
          failedCount++;
        }
      }

      if (anySent) {
        sentCount++;
        logsToInsert.push({
          user_id: notif.userId,
          notification_type: notif.type,
          sent_date: today,
          slot: notif.slot,
        });
      }
    }

    // 7. Log sent notifications to prevent duplicates
    if (logsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("notification_log")
        .upsert(logsToInsert, { onConflict: "user_id,notification_type,sent_date,slot" });

      if (insertError) {
        console.error("Failed to log sent notifications:", insertError);
      }
    }

    // 8. Clean up old logs (keep only last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await supabase
      .from("notification_log")
      .delete()
      .lt("sent_date", threeDaysAgo.toISOString().split("T")[0]);

    return jsonResponse({
      message: `Processed ${pending.length} notifications: ${sentCount} sent, ${failedCount} failed.`,
      pending: pending.length,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (err) {
    console.error("send-notifications error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
