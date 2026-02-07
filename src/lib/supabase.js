import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cjlowdjmqdsgigstagoi.supabase.co';
// Use the ANON key (public, safe for client-side) — NOT the service role key
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDc0MTEsImV4cCI6MjA4NTkyMzQxMX0.ASV_cldCl1LqbTYNkcNG56bWGQt9iS2rYoexSvteV3c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_URL };

// ─── Auth helpers ───────────────────────────────────────────

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

// ─── Profile helpers ────────────────────────────────────────

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

export async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Streak helpers ─────────────────────────────────────────

export async function fetchStreak(userId) {
  const { data, error } = await supabase
    .from('streaks')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ─── Achievement helpers ────────────────────────────────────

export async function fetchAchievements(userId) {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('*, badge_definitions(*)')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchBadgeDefinitions() {
  const { data, error } = await supabase
    .from('badge_definitions')
    .select('*')
    .order('id');
  if (error) throw error;
  return data || [];
}

// ─── Data helpers (auth-aware) ──────────────────────────────

export async function fetchDays(userId) {
  const { data, error } = await supabase
    .from('days')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchMealsWithItems(userId) {
  const { data, error } = await supabase
    .from('meals')
    .select('*, meal_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteMeal(mealId) {
  // Get meal data first
  const { data: meal } = await supabase
    .from('meals')
    .select('date, kcal, ptn, carb, fat, user_id')
    .eq('id', mealId)
    .single();

  if (!meal) return;

  // Delete meal (cascade deletes items)
  const { error } = await supabase.from('meals').delete().eq('id', mealId);
  if (error) throw error;

  // Update day totals
  const { data: day } = await supabase
    .from('days')
    .select('kcal_total, ptn_total, carb_total, fat_total')
    .eq('date', meal.date)
    .eq('user_id', meal.user_id)
    .single();

  if (day) {
    await supabase
      .from('days')
      .update({
        kcal_total: Math.max(0, (day.kcal_total || 0) - (meal.kcal || 0)),
        ptn_total: Math.max(0, (day.ptn_total || 0) - (meal.ptn || 0)),
        carb_total: Math.max(0, (day.carb_total || 0) - (meal.carb || 0)),
        fat_total: Math.max(0, (day.fat_total || 0) - (meal.fat || 0)),
      })
      .eq('date', meal.date)
      .eq('user_id', meal.user_id);
  }
}

// ─── Edge Function callers ──────────────────────────────────

export async function callProcessEntry(text, date) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-entry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text, date }),
  });
  return res.json();
}

export async function callSuggestMeals(date, remaining, goals, mealHistory, healthConditions) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ date, remaining, goals, mealHistory, healthConditions }),
  });
  return res.json();
}
