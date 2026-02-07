-- =============================================
-- Bio-Tracker v2 — Multi-user Schema Migration
-- =============================================
-- Run this AFTER backing up your existing data.
-- This script:
--   1. Creates profiles, streaks, badge_definitions, user_achievements tables
--   2. Adds user_id to existing tables (chat_logs, days, meals, meal_items)
--   3. Sets up Row Level Security (RLS) policies
-- =============================================

-- =========================
-- 1. PROFILES TABLE
-- =========================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    age INTEGER,
    sex TEXT CHECK (sex IN ('male', 'female')) DEFAULT 'male',
    weight NUMERIC(5,1),        -- kg
    height NUMERIC(5,1),        -- cm
    activity_level TEXT CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active')) DEFAULT 'moderately_active',
    goal_type TEXT CHECK (goal_type IN ('health', 'weight_loss', 'weight_gain', 'hypertrophy')) DEFAULT 'health',
    target_weight NUMERIC(5,1), -- kg (optional, for weight_loss/weight_gain)
    health_conditions TEXT DEFAULT '',
    -- Calculated goals (stored for edge functions / quick reads)
    goal_kcal INTEGER DEFAULT 2000,
    goal_ptn INTEGER DEFAULT 100,
    goal_carb INTEGER DEFAULT 250,
    goal_fat INTEGER DEFAULT 67,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =========================
-- 2. STREAKS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_log_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own streak"
    ON streaks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streak"
    ON streaks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streak"
    ON streaks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =========================
-- 3. BADGE DEFINITIONS
-- =========================
CREATE TABLE IF NOT EXISTS badge_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏆',
    description TEXT DEFAULT '',
    xp_reward INTEGER DEFAULT 50,
    category TEXT DEFAULT 'general'
);

-- Insert default badges
INSERT INTO badge_definitions (id, name, icon, description, xp_reward, category) VALUES
    ('first_meal',     'Primeira Refeição', '🍽️', 'Registrou sua primeira refeição',       50,  'milestone'),
    ('streak_3',       'Constância 3',      '🔥', '3 dias seguidos registrando',            100, 'streak'),
    ('streak_7',       'Semana Perfeita',    '⭐', '7 dias seguidos registrando',            200, 'streak'),
    ('streak_30',      'Mês de Ferro',       '💎', '30 dias seguidos registrando',           500, 'streak'),
    ('protein_master', 'Mestre em Proteína', '💪', 'Bateu a meta de proteína 7 vezes',      150, 'nutrition'),
    ('goal_hit',       'Meta Atingida',      '🎯', 'Bateu todas as metas do dia',           100, 'nutrition'),
    ('early_bird',     'Madrugador',         '🐦', 'Registrou refeição antes das 8h',        75, 'habit'),
    ('sleep_master',   'Sono Sagrado',       '😴', '7+ horas de sono por 7 dias seguidos',  200, 'health'),
    ('level_5',        'Nível 5',            '🌟', 'Alcançou level 5',                      250, 'milestone'),
    ('level_10',       'Lendário',           '⚡', 'Alcançou level 10',                     500, 'milestone')
ON CONFLICT (id) DO NOTHING;

-- No RLS needed — badge_definitions are public/read-only
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read badges"
    ON badge_definitions FOR SELECT
    USING (true);


-- =========================
-- 4. USER ACHIEVEMENTS
-- =========================
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    badge_id TEXT REFERENCES badge_definitions(id) NOT NULL,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own achievements"
    ON user_achievements FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
    ON user_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- =========================
-- 5. ADD user_id TO EXISTING TABLES
-- =========================

-- 5a. chat_logs
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5b. days
ALTER TABLE days ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5c. meals
ALTER TABLE meals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5d. meal_items (inherits from meals, but adding for direct queries)
ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;


-- =========================
-- 6. DROP OLD PERMISSIVE POLICIES & CREATE USER-SCOPED ONES
-- =========================

-- chat_logs
DROP POLICY IF EXISTS "Allow all for chat_logs" ON chat_logs;
DROP POLICY IF EXISTS "Users can read own chat_logs" ON chat_logs;
DROP POLICY IF EXISTS "Users can insert own chat_logs" ON chat_logs;
DROP POLICY IF EXISTS "Users can update own chat_logs" ON chat_logs;

CREATE POLICY "Users can read own chat_logs"
    ON chat_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat_logs"
    ON chat_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat_logs"
    ON chat_logs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- days
DROP POLICY IF EXISTS "Allow all for days" ON days;
DROP POLICY IF EXISTS "Users can read own days" ON days;
DROP POLICY IF EXISTS "Users can insert own days" ON days;
DROP POLICY IF EXISTS "Users can update own days" ON days;

CREATE POLICY "Users can read own days"
    ON days FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own days"
    ON days FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own days"
    ON days FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- meals
DROP POLICY IF EXISTS "Allow all for meals" ON meals;
DROP POLICY IF EXISTS "Users can read own meals" ON meals;
DROP POLICY IF EXISTS "Users can insert own meals" ON meals;
DROP POLICY IF EXISTS "Users can delete own meals" ON meals;

CREATE POLICY "Users can read own meals"
    ON meals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meals"
    ON meals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meals"
    ON meals FOR DELETE
    USING (auth.uid() = user_id);

-- meal_items
DROP POLICY IF EXISTS "Allow all for meal_items" ON meal_items;
DROP POLICY IF EXISTS "Users can read own meal_items" ON meal_items;
DROP POLICY IF EXISTS "Users can insert own meal_items" ON meal_items;
DROP POLICY IF EXISTS "Users can delete own meal_items" ON meal_items;

CREATE POLICY "Users can read own meal_items"
    ON meal_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal_items"
    ON meal_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal_items"
    ON meal_items FOR DELETE
    USING (auth.uid() = user_id);


-- =========================
-- 7. SERVICE ROLE POLICIES (for Edge Functions)
-- =========================
-- Edge functions use service_role key, which bypasses RLS by default.
-- No extra policies needed for server-side operations.


-- =========================
-- 8. INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_days_user_id ON days(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_user_id ON meal_items(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user_id ON streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_days_user_date ON days(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date DESC);


-- =========================
-- 9. HELPER FUNCTION: auto-update updated_at
-- =========================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER streaks_updated_at
    BEFORE UPDATE ON streaks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
