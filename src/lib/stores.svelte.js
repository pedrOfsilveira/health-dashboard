/**
 * Global reactive stores for auth, profile, goals, and app routing.
 * Uses Svelte 5 runes in a .svelte.js module.
 */
import { supabase, fetchProfile, fetchStreak, fetchAchievements, fetchFriendships, fetchPendingRequests, fetchActiveChallenges } from './supabase.js';

// ─── Auth State ─────────────────────────────────────────────

export const auth = $state({
  /** @type {import('@supabase/supabase-js').Session | null} */
  session: null,
  loading: true,
});

// ─── User Profile ───────────────────────────────────────────

export const profile = $state({
  /** @type {object | null} */
  data: null,
  loading: false,
  needsSetup: false,
});

// ─── User Goals (derived from profile TDEE calculation) ─────

export const goals = $state({
  kcal: 2000,
  ptn: 120,
  carb: 250,
  fat: 65,
});

// ─── Streak & Gamification ──────────────────────────────────

export const streak = $state({
  current: 0,
  longest: 0,
  lastLogDate: null,
});

export const achievements = $state({
  /** @type {any[]} */
  unlocked: [],
  /** @type {any | null} */
  latest: null, // for toast notification
});

// ─── XP & Leveling ─────────────────────────────────────────

export const xp = $state({
  total: 0,
  level: 1,
  title: 'Novato',
});

const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: 'Novato 🌱' },
  { level: 2, xp: 100, title: 'Iniciante 🏃' },
  { level: 3, xp: 300, title: 'Dedicado 💪' },
  { level: 4, xp: 600, title: 'Consistente 🔥' },
  { level: 5, xp: 1000, title: 'Atleta 🏋️' },
  { level: 6, xp: 1500, title: 'Guerreiro 🛡️' },
  { level: 7, xp: 2200, title: 'Elite 👑' },
  { level: 8, xp: 3000, title: 'Mestre 🧙' },
  { level: 9, xp: 4000, title: 'Lenda 🌟' },
  { level: 10, xp: 5500, title: 'Imortal ⚡' },
];

export function computeLevel(totalXp) {
  let current = LEVEL_THRESHOLDS[0];
  for (const t of LEVEL_THRESHOLDS) {
    if (totalXp >= t.xp) current = t;
    else break;
  }
  return current;
}

export function getXpForNextLevel(totalXp) {
  const currentLevel = computeLevel(totalXp);
  const next = LEVEL_THRESHOLDS.find(t => t.level === currentLevel.level + 1);
  if (!next) return { needed: 0, progress: 100 };
  const progressInLevel = totalXp - currentLevel.xp;
  const levelRange = next.xp - currentLevel.xp;
  return {
    needed: next.xp - totalXp,
    progress: Math.round((progressInLevel / levelRange) * 100),
  };
}

// ─── Router ─────────────────────────────────────────────────

export const router = $state({
  /** @type {'login' | 'register' | 'setup' | 'dashboard' | 'profile' | 'friends' | 'challenges' | 'meal-planner'} */
  page: 'login',
});

export function navigate(page) {
  router.page = page;
}

// ─── Social / Friends ───────────────────────────────────────

export const social = $state({
  /** @type {any[]} */
  friends: [],
  /** @type {any[]} */
  pendingRequests: [],
  /** @type {any[]} */
  activeChallenges: [],
  pendingCount: 0,
  loading: false,
});

export async function loadSocialData(userId) {
  social.loading = true;
  try {
    const [pending, challenges] = await Promise.all([
      fetchPendingRequests(userId),
      fetchActiveChallenges(userId),
    ]);
    social.pendingRequests = pending || [];
    social.pendingCount = pending?.length || 0;
    social.activeChallenges = challenges || [];
  } catch (err) {
    console.error('Error loading social data:', err);
  } finally {
    social.loading = false;
  }
}

// ─── Handle gamification response from chat ────────────────

export function handleGamificationUpdate(gamification) {
  if (!gamification) return;

  // Update streak in real-time
  if (gamification.streakUpdated && gamification.currentStreak !== undefined) {
    streak.current = gamification.currentStreak;
    if (gamification.currentStreak > streak.longest) {
      streak.longest = gamification.currentStreak;
    }
  }

  // Update XP
  if (gamification.xpGained > 0) {
    xp.total += gamification.xpGained;
    const lvl = computeLevel(xp.total);
    xp.level = lvl.level;
    xp.title = lvl.title;
  }

  // Show badge toasts
  if (gamification.badgesUnlocked?.length > 0) {
    for (const badge of gamification.badgesUnlocked) {
      achievements.unlocked.push({
        badge_id: badge.id,
        badge_definitions: badge,
      });
      achievements.latest = badge;
    }
  }
}

// ─── TDEE Calculation ───────────────────────────────────────

/**
 * Calculate TDEE using Mifflin-St Jeor equation
 * and adjust macros based on goal type.
 */
export function calculateGoals(profileData) {
  if (!profileData) return;

  const { sex, weight, height, age, activity_level, goal_type } = profileData;
  const w = weight || profileData.weight_kg || 70;
  const h = height || profileData.height_cm || 170;
  const a = age || 25;

  // 1. BMR (Mifflin-St Jeor)
  let bmr;
  if (sex === 'male') {
    bmr = 10 * w + 6.25 * h - 5 * a + 5;
  } else if (sex === 'female') {
    bmr = 10 * w + 6.25 * h - 5 * a - 161;
  } else {
    // Average for other/non-binary: (5 - 161) / 2 = -78
    bmr = 10 * w + 6.25 * h - 5 * a - 78;
  }

  // 2. Activity multiplier
  const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    light: 1.375,
    moderately_active: 1.55,
    moderate: 1.55,
    very_active: 1.725,
    active: 1.725,
    extra_active: 1.9,
  };
  const tdee = Math.round(bmr * (activityMultipliers[activity_level] || 1.55));

  // 3. Adjust for goal
  let targetKcal;
  let proteinPerKg;
  let fatPct;
  let carbPct; // remaining after protein & fat

  switch (goal_type) {
    case 'weight_loss':
      targetKcal = Math.round(tdee * 0.80); // 20% deficit
      proteinPerKg = 2.0;   // preserve muscle
      fatPct = 0.25;
      break;
    case 'weight_gain':
      targetKcal = Math.round(tdee * 1.15); // 15% surplus
      proteinPerKg = 1.8;
      fatPct = 0.25;
      break;
    case 'hypertrophy':
      targetKcal = Math.round(tdee * 1.10); // 10% surplus
      proteinPerKg = 2.2;   // high protein for muscle
      fatPct = 0.25;
      break;
    case 'health':
    default:
      targetKcal = tdee;     // maintenance
      proteinPerKg = 1.6;
      fatPct = 0.30;
      break;
  }

  const targetPtn = Math.round(proteinPerKg * w);
  const targetFat = Math.round((targetKcal * fatPct) / 9);
  const ptnCals = targetPtn * 4;
  const fatCals = targetFat * 9;
  const targetCarb = Math.round((targetKcal - ptnCals - fatCals) / 4);

  return { kcal: targetKcal, ptn: targetPtn, carb: Math.max(0, targetCarb), fat: targetFat };
}

// ─── Init Auth Listener ─────────────────────────────────────

/**
 * Key insight: On page refresh, Supabase fires events in this order:
 *   1. SIGNED_IN  — fired during token recovery, client NOT fully ready
 *   2. INITIAL_SESSION — fired after client is fully initialized
 *
 * Fetching data on SIGNED_IN hangs because the REST client isn't ready yet.
 * We MUST wait for INITIAL_SESSION on the initial page load.
 * After that, SIGNED_IN from explicit logins should be handled normally.
 */
let _initialSessionReceived = false;
let _safetyTimeoutId = null;

export function initAuth() {
  // Safety timeout: force exit loading after 8s no matter what
  _safetyTimeoutId = setTimeout(() => {
    if (auth.loading) {
      console.warn('[Auth] Safety timeout reached');
      auth.loading = false;
      if (!auth.session) router.page = 'login';
    }
  }, 8000);

  const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
    auth.session = session;

    // ── INITIAL_SESSION: the definitive event for page load ──
    if (event === 'INITIAL_SESSION') {
      _initialSessionReceived = true;
      clearSafetyTimeout();

      if (session?.user) {
        await loadUserDataSafe(session.user.id);
      } else {
        resetToLogin();
      }
      return;
    }

    // ── SIGNED_IN before INITIAL_SESSION: skip (token recovery, not ready) ──
    if (event === 'SIGNED_IN' && !_initialSessionReceived) {
      // Clean OAuth params if present
      cleanOAuthParams();
      return; // Do NOT load data — wait for INITIAL_SESSION
    }

    // ── SIGNED_IN after INITIAL_SESSION: real login (user clicked sign in) ──
    if (event === 'SIGNED_IN' && _initialSessionReceived) {
      cleanOAuthParams();
      if (session?.user) {
        auth.loading = true;
        await loadUserDataSafe(session.user.id);
      }
      return;
    }

    // ── TOKEN_REFRESHED: update session silently ──
    if (event === 'TOKEN_REFRESHED') {
      return; // session already updated above, nothing else to do
    }

    // ── SIGNED_OUT ──
    if (event === 'SIGNED_OUT') {
      resetToLogin();
      return;
    }
  });
}

function clearSafetyTimeout() {
  if (_safetyTimeoutId) {
    clearTimeout(_safetyTimeoutId);
    _safetyTimeoutId = null;
  }
}

function cleanOAuthParams() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) {
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url.pathname);
  }
}

function resetToLogin() {
  profile.data = null;
  profile.needsSetup = false;
  auth.loading = false;
  router.page = 'login';
  clearSafetyTimeout();
}

async function loadUserDataSafe(userId) {
  try {
    await loadUserData(userId);
  } catch (err) {
    console.error('[Auth] Error loading user data:', err);
    auth.loading = false;
    router.page = 'dashboard'; // show dashboard even on partial failure
  }
}

async function loadUserData(userId) {
  profile.loading = true;
  auth.loading = true;

  try {
    const p = await fetchProfile(userId);
    profile.data = p;

    if (!p || !p.goal_type) {
      profile.needsSetup = true;
      router.page = 'setup';
    } else {
      profile.needsSetup = false;
      const calculated = calculateGoals(p);
      if (calculated) {
        goals.kcal = calculated.kcal;
        goals.ptn = calculated.ptn;
        goals.carb = calculated.carb;
        goals.fat = calculated.fat;
      }

      // Load gamification data in parallel
      const [s, a] = await Promise.all([
        fetchStreak(userId).catch(() => null),
        fetchAchievements(userId).catch(() => []),
      ]);

      if (s) {
        streak.current = s.current_streak || 0;
        streak.longest = s.longest_streak || 0;
        streak.lastLogDate = s.last_log_date;
      }
      achievements.unlocked = a || [];

      if (p.xp_total) {
        xp.total = p.xp_total;
        const lvl = computeLevel(p.xp_total);
        xp.level = lvl.level;
        xp.title = lvl.title;
      }

      // Load social data (non-blocking)
      loadSocialData(userId).catch(() => {});

      router.page = 'dashboard';
    }
  } catch (err) {
    console.error('[Auth] Error loading user data:', err);
    router.page = 'dashboard';
  } finally {
    profile.loading = false;
    auth.loading = false;
  }
}
