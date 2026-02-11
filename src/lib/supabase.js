import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cjlowdjmqdsgigstagoi.supabase.co';
// Use the ANON key (public, safe for client-side) — NOT the service role key
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDc0MTEsImV4cCI6MjA4NTkyMzQxMX0.ASV_cldCl1LqbTYNkcNG56bWGQt9iS2rYoexSvteV3c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_URL };

// Timeout utility to prevent hanging queries
function withTimeout(promise, timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Retry helper for critical queries
async function withRetry(fn, retries = 2, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ─── Auth helpers ───────────────────────────────────────────

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Skip email confirmation — user is auto-confirmed
      emailRedirectTo: undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGithub() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin,
    },
  });
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
  return withRetry(async () => {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      12000
    );
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }, 1); // Only 1 retry to avoid too long waits
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
  const { data, error } = await withTimeout(
    supabase
      .from('streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    12000
  );
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ─── Achievement helpers ────────────────────────────────────

export async function fetchAchievements(userId) {
  const { data, error } = await withTimeout(
    supabase
      .from('user_achievements')
      .select('*, badge_definitions(*)')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false }),
    12000
  );
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
  const { data, error } = await supabase.functions.invoke('process-entry', {
    body: { text, date },
  });
  if (error) throw error;
  return data;
}

export async function callSuggestMeals(date, remaining, goals, mealHistory, healthConditions) {
  const { data, error } = await supabase.functions.invoke('suggest-meals', {
    body: { date, remaining, goals, mealHistory, healthConditions },
  });
  if (error) throw error;
  return data;
}

export async function callGeneratePlan(weekStart, goals, preferences, healthConditions, mealHistory) {
  // Increase client-side timeout to 180s to account for long generation times
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('A geração do plano excedeu o tempo limite. Verifique se o plano foi gerado atualizando a página.')), 180000)
  );

  const invokePromise = supabase.functions.invoke('generate-plan', {
    body: { weekStart, goals, preferences, healthConditions, mealHistory },
  });

  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
  if (error) throw error;
  return data;
}

export async function fetchMealPlan(userId, weekStart) {
  const { data: plan, error: planErr } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) return null;

  const { data: entries, error: entErr } = await supabase
    .from('meal_plan_entries')
    .select('*')
    .eq('plan_id', plan.id)
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true });
  if (entErr) throw entErr;

  // Build shopping list: prefer stored one, fallback to building from entries
  let shoppingList = plan.shopping_list;
  if (!shoppingList || Object.keys(shoppingList).length === 0) {
    shoppingList = buildShoppingListFromEntries(entries || []);
  } else {
    // Deduplicate the stored shopping list
    shoppingList = deduplicateShoppingList(shoppingList);
  }

  return { ...plan, entries: entries || [], shoppingList };
}

// ─── Shopping list helpers ──────────────────────────────────

// Normalize ingredient name: lowercase, remove accents, singularize common Portuguese plurals
function normalizeIngredientName(name) {
  let n = name.toLowerCase().trim();
  // Remove quantities/numbers at the start
  n = n.replace(/^\d+\s*(g|kg|ml|l|un|unidades?|fatias?|colheres?)?\s*/i, '');
  // Common singular/plural normalization in Portuguese
  const pluralMap = [
    [/ovos$/i, 'ovo'],
    [/tomates$/i, 'tomate'],
    [/cebolas$/i, 'cebola'],
    [/bananas$/i, 'banana'],
    [/batatas$/i, 'batata'],
    [/cenouras$/i, 'cenoura'],
    [/laranjas$/i, 'laranja'],
    [/maçãs$/i, 'maçã'],
    [/limões$/i, 'limão'],
    [/pimentões$/i, 'pimentão'],
    [/pepinos$/i, 'pepino'],
    [/abobrinhas$/i, 'abobrinha'],
    [/berinjelas$/i, 'berinjela'],
    [/alfaces$/i, 'alface'],
  ];
  for (const [re, singular] of pluralMap) {
    n = n.replace(re, singular);
  }
  return n;
}

// Categorize an ingredient by name
function categorizeIngredient(name) {
  const n = name.toLowerCase();
  const categories = {
    'Carnes e Proteínas': ['frango', 'carne', 'boi', 'porco', 'peixe', 'atum', 'salmão', 'tilápia', 'camarão', 'linguiça', 'salsicha', 'peito', 'coxa', 'sobrecoxa', 'patinho', 'acém', 'filé', 'bife', 'músculo', 'costela'],
    'Laticínios e Ovos': ['ovo', 'leite', 'queijo', 'iogurte', 'requeijão', 'manteiga', 'cream cheese', 'ricota', 'mussarela', 'parmesão', 'creme de leite', 'nata', 'coalhada', 'whey'],
    'Grãos, Massas e Pães': ['arroz', 'feijão', 'macarrão', 'pão', 'aveia', 'granola', 'farinha', 'tapioca', 'milho', 'cuscuz', 'lentilha', 'grão-de-bico', 'quinoa', 'massa', 'espaguete', 'torrada', 'biscoito', 'bolacha', 'cereal'],
    'Frutas': ['banana', 'maçã', 'laranja', 'limão', 'morango', 'uva', 'manga', 'mamão', 'melão', 'melancia', 'abacaxi', 'pera', 'kiwi', 'goiaba', 'açaí', 'fruta'],
    'Vegetais e Legumes': ['tomate', 'cebola', 'alho', 'cenoura', 'batata', 'brócolis', 'alface', 'rúcula', 'espinafre', 'couve', 'pepino', 'pimentão', 'abobrinha', 'berinjela', 'vagem', 'beterraba', 'mandioca', 'inhame', 'abóbora', 'repolho', 'salada', 'agrião', 'cheiro-verde', 'salsinha', 'cebolinha'],
    'Óleos e Temperos': ['azeite', 'óleo', 'sal', 'pimenta', 'orégano', 'cominho', 'canela', 'açúcar', 'mel', 'vinagre', 'molho', 'shoyu', 'mostarda', 'ketchup', 'maionese', 'tempero', 'alecrim', 'cúrcuma', 'gengibre', 'páprica'],
    'Castanhas e Sementes': ['castanha', 'amendoim', 'pasta de amendoim', 'nozes', 'amêndoa', 'chia', 'linhaça', 'gergelim', 'semente'],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => n.includes(kw))) return category;
  }
  return 'Outros';
}

function deduplicateShoppingList(shoppingList) {
  const merged = {};
  
  for (const [category, items] of Object.entries(shoppingList)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const normalized = normalizeIngredientName(item.name);
      const correctCategory = categorizeIngredient(item.name);
      
      if (!merged[correctCategory]) merged[correctCategory] = {};
      
      if (merged[correctCategory][normalized]) {
        // Merge quantities
        const existing = merged[correctCategory][normalized];
        if (existing.unit === item.unit) {
          existing.qty = String(parseFloat(existing.qty || '0') + parseFloat(item.qty || '0'));
        }
      } else {
        // Capitalize first letter for display
        const displayName = item.name.charAt(0).toUpperCase() + item.name.slice(1);
        merged[correctCategory][normalized] = { name: displayName, qty: item.qty || '', unit: item.unit || '' };
      }
    }
  }
  
  // Convert back to category -> array format
  const result = {};
  for (const [cat, items] of Object.entries(merged)) {
    result[cat] = Object.values(items);
  }
  return result;
}

function buildShoppingListFromEntries(entries) {
  const allIngredients = {};
  
  for (const entry of entries) {
    if (!entry.ingredients || !Array.isArray(entry.ingredients)) continue;
    for (const ing of entry.ingredients) {
      const normalized = normalizeIngredientName(ing.name);
      const category = categorizeIngredient(ing.name);
      
      if (!allIngredients[category]) allIngredients[category] = {};
      
      if (allIngredients[category][normalized]) {
        const existing = allIngredients[category][normalized];
        if (existing.unit === (ing.unit || '') && existing.qty && ing.qty) {
          existing.qty = String(parseFloat(existing.qty) + parseFloat(ing.qty));
        }
      } else {
        const displayName = ing.name.charAt(0).toUpperCase() + ing.name.slice(1);
        allIngredients[category][normalized] = { name: displayName, qty: ing.qty || '', unit: ing.unit || '' };
      }
    }
  }
  
  const result = {};
  for (const [cat, items] of Object.entries(allIngredients)) {
    result[cat] = Object.values(items);
  }
  return result;
}

export async function deleteMealPlanEntry(entryId) {
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', entryId);
  if (error) throw error;
}

export async function logCreatine(userId, date) {
  const { data, error } = await supabase
    .from('days')
    .update({ creatine_taken_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('date', date)
    .select()
    .single();

  if (error) throw error;
  return data;
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
    .maybeSingle();
  const { data: ownStreak } = await supabase
    .from('streaks')
    .select('current_streak')
    .eq('user_id', userId)
    .maybeSingle();

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

// ─── Notification Preferences ───────────────────────────────

export async function fetchNotificationPreferences(userId) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertNotificationPreferences(prefs) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(prefs, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Push Subscription ─────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the browser supports push notifications.
 */
export function pushNotificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Request notification permission from the browser.
 * MUST be called from a direct user gesture (click/tap) for the browser
 * to show the permission popup. Returns the permission state:
 * 'granted', 'denied', or 'default'.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

/**
 * Subscribe the current browser to push notifications and save the
 * subscription on the backend. Safe to call multiple times — it will
 * reuse an existing browser subscription and upsert on the server.
 * Returns an object { ok, reason } where reason can be:
 * 'unsupported', 'no_vapid', 'permission_denied', 'permission_dismissed',
 * 'keys_missing', 'backend_error', 'error', or 'ok'.
 */
export async function subscribeToPushNotifications() {
  if (!pushNotificationsSupported()) {
    console.warn('Push notifications not supported by this browser.');
    return { ok: false, reason: 'unsupported' };
  }

  const VAPID_PUBLIC_KEY = 'BHfylvG4IalVIjzQXLDQ1Bk8Bx6AT31xQpjlTm5Yl1zjG_5vTCPuKinQKXWmRkrwNFeTRmlsUdgedJghha3AqII';
  if (!VAPID_PUBLIC_KEY) {
    console.error('VAPID Public Key is not set. Cannot subscribe to push notifications.');
    return { ok: false, reason: 'no_vapid' };
  }

  try {
    // Check current permission state — don't request here, it should
    // already have been requested via requestNotificationPermission()
    // from a user gesture before calling this function.
    let permission = Notification.permission;
    if (permission === 'default') {
      // Fallback: try to request (may work if still within user gesture context)
      permission = await Notification.requestPermission();
    }
    if (permission === 'denied') {
      console.warn('Notification permission denied.');
      return { ok: false, reason: 'permission_denied' };
    }
    if (permission !== 'granted') {
      console.warn('Notification permission dismissed.');
      return { ok: false, reason: 'permission_dismissed' };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('No existing subscription, creating new one...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('New push subscription created:', subscription);
    }

    // Send subscription to backend
    const subJson = subscription.toJSON();
    const payload = {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh ?? null,
        auth: subJson.keys?.auth ?? null,
      },
    };

    if (!payload.keys.p256dh || !payload.keys.auth) {
      console.warn('Push subscription keys missing, skipping save.');
      return { ok: false, reason: 'keys_missing' };
    }

    const { data, error } = await supabase.functions.invoke('push-subscriptions', {
      body: payload,
    });

    if (error) {
      console.error('Failed to save push subscription:', error);
      return { ok: false, reason: 'backend_error' };
    }

    console.log('Push subscription saved on backend:', data);
    return { ok: true, reason: 'ok' };
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return { ok: false, reason: 'error' };
  }
}
