/**
 * Global reactive stores for auth, profile, goals, and app routing.
 * Uses Svelte 5 runes in a .svelte.js module.
 */
import { supabase, fetchProfile, fetchStreak, fetchAchievements } from './supabase.js';

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
  /** @type {'login' | 'register' | 'setup' | 'dashboard' | 'profile'} */
  page: 'login',
});

export function navigate(page) {
  router.page = page;
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
  } else {
    bmr = 10 * w + 6.25 * h - 5 * a - 161;
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

export function initAuth() {
  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    auth.session = session;
    auth.loading = false;

    if (session?.user) {
      await loadUserData(session.user.id);
    } else {
      profile.data = null;
      profile.needsSetup = false;
      router.page = 'login';
    }
  });

  // Check initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    auth.session = session;
    auth.loading = false;
    if (session?.user) {
      loadUserData(session.user.id);
    }
  });
}

async function loadUserData(userId) {
  profile.loading = true;

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

      // Load gamification data
      const s = await fetchStreak(userId);
      if (s) {
        streak.current = s.current_streak || 0;
        streak.longest = s.longest_streak || 0;
        streak.lastLogDate = s.last_log_date;
      }

      const a = await fetchAchievements(userId);
      achievements.unlocked = a || [];

      // Calculate XP from profile
      if (p.xp_total) {
        xp.total = p.xp_total;
        const lvl = computeLevel(p.xp_total);
        xp.level = lvl.level;
        xp.title = lvl.title;
      }

      router.page = 'dashboard';
    }
  } catch (err) {
    console.error('Error loading user data:', err);
    router.page = 'dashboard'; // still show dashboard even if profile load fails
  } finally {
    profile.loading = false;
  }
}
