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

// ─── Friend helpers ─────────────────────────────────────────

export async function searchUserByEmail(email) {
  const { data, error } = await supabase.rpc('search_user_by_email', {
    search_email: email,
  });
  if (error) throw error;
  return data?.[0] || null;
}

export async function sendFriendRequest(addresseeId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function respondFriendRequest(friendshipId, accept) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'rejected' })
    .eq('id', friendshipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFriend(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function fetchFriendships(userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchFriendProfiles(userId) {
  // Get accepted friendships
  const { data: friendships, error: fErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (fErr) throw fErr;

  if (!friendships || friendships.length === 0) return [];

  const friendIds = friendships.map(f =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );

  // Fetch profiles + streaks for friends
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, name, xp_total')
    .in('user_id', friendIds);
  if (pErr) throw pErr;

  const { data: streaks, error: sErr } = await supabase
    .from('streaks')
    .select('user_id, current_streak')
    .in('user_id', friendIds);
  if (sErr) throw sErr;

  const streakMap = {};
  (streaks || []).forEach(s => { streakMap[s.user_id] = s.current_streak; });

  return (profiles || []).map(p => ({
    ...p,
    current_streak: streakMap[p.user_id] || 0,
  }));
}

// ─── Challenge helpers ──────────────────────────────────────

export async function fetchChallenges() {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .order('difficulty', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchActiveChallenges(userId) {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select(`
      *,
      challenge_instances(
        *,
        challenges(*)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchChallengeParticipants(instanceId) {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('*, profiles:user_id(name, xp_total)')
    .eq('instance_id', instanceId)
    .order('progress', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function startChallenge(challengeId, userId, friendId = null) {
  // Get challenge info
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .single();
  if (!challenge) throw new Error('Desafio não encontrado');

  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + challenge.duration_days * 86400000)
    .toISOString()
    .split('T')[0];

  // Create instance
  const { data: instance, error: instErr } = await supabase
    .from('challenge_instances')
    .insert({
      challenge_id: challengeId,
      creator_id: userId,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
    })
    .select()
    .single();
  if (instErr) throw instErr;

  // Add creator as participant
  await supabase.from('challenge_participants').insert({
    instance_id: instance.id,
    user_id: userId,
    progress: 0,
  });

  // Add friend as participant if duo
  if (friendId && challenge.type === 'duo') {
    await supabase.from('challenge_participants').insert({
      instance_id: instance.id,
      user_id: friendId,
      progress: 0,
    });
  }

  return instance;
}

export async function fetchLeaderboard(userId) {
  // Get user + friends data for leaderboard
  const friends = await fetchFriendProfiles(userId);
  const { data: ownProfile } = await supabase
    .from('profiles')
    .select('user_id, name, xp_total')
    .eq('user_id', userId)
    .single();
  const { data: ownStreak } = await supabase
    .from('streaks')
    .select('current_streak')
    .eq('user_id', userId)
    .single();

  const leaderboard = [
    ...(ownProfile ? [{
      ...ownProfile,
      current_streak: ownStreak?.current_streak || 0,
      isMe: true,
    }] : []),
    ...friends.map(f => ({ ...f, isMe: false })),
  ];

  return leaderboard.sort((a, b) => (b.xp_total || 0) - (a.xp_total || 0));
}

export async function fetchPendingRequests(userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Fetch requester profiles
  const requesterIds = data.map(f => f.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, name')
    .in('user_id', requesterIds);

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.user_id] = p; });

  return data.map(f => ({
    ...f,
    requester_name: profileMap[f.requester_id]?.name || 'Usuário',
  }));
}
