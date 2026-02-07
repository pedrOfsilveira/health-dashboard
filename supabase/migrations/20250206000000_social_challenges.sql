-- =============================================
-- Bio-Tracker v3 — Social & Challenges Migration
-- =============================================
-- Adds:
--   1. xp_total column to profiles
--   2. friendships table (friend requests)
--   3. challenges catalog table
--   4. challenge_instances (active challenges)
--   5. challenge_participants (progress tracking)
--   6. RLS policies for all new tables
--   7. Seed fun challenge catalog
-- =============================================

-- =========================
-- 1. ADD xp_total TO PROFILES
-- =========================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_total INTEGER DEFAULT 0;

-- =========================
-- 2. FRIENDSHIPS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Both sides can read friendships involving them
CREATE POLICY "Users can read own friendships"
    ON friendships FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Anyone can send a friend request
CREATE POLICY "Users can send friend requests"
    ON friendships FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

-- Both sides can update (accept/reject)
CREATE POLICY "Users can update own friendships"
    ON friendships FOR UPDATE
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Either side can delete (unfriend)
CREATE POLICY "Users can delete own friendships"
    ON friendships FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Trigger for updated_at
CREATE TRIGGER friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- =========================
-- 3. CHALLENGES CATALOG
-- =========================
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '🏆',
    type TEXT CHECK (type IN ('solo', 'duo', 'group')) DEFAULT 'solo',
    metric TEXT CHECK (metric IN ('streak', 'kcal_pct', 'ptn_pct', 'meals_logged', 'days_active', 'sleep_logged', 'goals_hit')) NOT NULL,
    target_value INTEGER NOT NULL DEFAULT 1,
    duration_days INTEGER NOT NULL DEFAULT 7,
    xp_reward INTEGER NOT NULL DEFAULT 100,
    difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard', 'legendary')) DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- Challenges catalog is public-read
CREATE POLICY "Anyone can read challenges"
    ON challenges FOR SELECT
    USING (true);


-- =========================
-- 4. CHALLENGE INSTANCES
-- =========================
CREATE TABLE IF NOT EXISTS challenge_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE NOT NULL,
    creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    status TEXT CHECK (status IN ('active', 'completed', 'expired', 'cancelled')) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE challenge_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create challenge instances"
    ON challenge_instances FOR INSERT
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own challenge instances"
    ON challenge_instances FOR UPDATE
    USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_challenge_instances_creator ON challenge_instances(creator_id);
CREATE INDEX IF NOT EXISTS idx_challenge_instances_status ON challenge_instances(status);


-- =========================
-- 5. CHALLENGE PARTICIPANTS
-- =========================
CREATE TABLE IF NOT EXISTS challenge_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES challenge_instances(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    progress INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instance_id, user_id)
);

ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can join challenges"
    ON challenge_participants FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
    ON challenge_participants FOR UPDATE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_instance ON challenge_participants(instance_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);


-- =========================
-- 5b. CROSS-TABLE RLS POLICIES (must come after both tables exist)
-- =========================

-- Users can read instances they participate in
CREATE POLICY "Users can read own challenge instances"
    ON challenge_instances FOR SELECT
    USING (
        creator_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM challenge_participants cp
            WHERE cp.instance_id = challenge_instances.id AND cp.user_id = auth.uid()
        )
    );

-- Users can read participants of instances they're part of
CREATE POLICY "Users can read challenge participants"
    ON challenge_participants FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM challenge_participants cp2
            WHERE cp2.instance_id = challenge_participants.instance_id AND cp2.user_id = auth.uid()
        )
    );


-- =========================
-- 6. ALLOW PROFILE SEARCH BY EMAIL (for friend invites)
-- =========================
-- Add a policy so users can search others by exact email match
-- We expose only id, name, user_id through a function to avoid leaking data

CREATE OR REPLACE FUNCTION search_user_by_email(search_email TEXT)
RETURNS TABLE (
    user_id UUID,
    name TEXT,
    xp_total INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.user_id, p.name, COALESCE(p.xp_total, 0)
    FROM profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE u.email = search_email
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================
-- 7. FRIEND PROFILE READ (for leaderboard)
-- =========================
-- Allow reading profiles of accepted friends
CREATE POLICY "Users can read friend profiles"
    ON profiles FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM friendships f
            WHERE f.status = 'accepted'
            AND (
                (f.requester_id = auth.uid() AND f.addressee_id = profiles.user_id) OR
                (f.addressee_id = auth.uid() AND f.requester_id = profiles.user_id)
            )
        )
    );

-- Allow reading friend streaks for leaderboard
CREATE POLICY "Users can read friend streaks"
    ON streaks FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM friendships f
            WHERE f.status = 'accepted'
            AND (
                (f.requester_id = auth.uid() AND f.addressee_id = streaks.user_id) OR
                (f.addressee_id = auth.uid() AND f.requester_id = streaks.user_id)
            )
        )
    );


-- =========================
-- 8. SEED CHALLENGE CATALOG
-- =========================
INSERT INTO challenges (title, description, icon, type, metric, target_value, duration_days, xp_reward, difficulty) VALUES
    -- Solo challenges
    ('🔥 Streak de 3 dias',       'Registre refeições por 3 dias consecutivos',                   '🔥', 'solo', 'streak',       3,  3,  100, 'easy'),
    ('⭐ Semana Perfeita',         'Registre refeições todos os 7 dias da semana',                  '⭐', 'solo', 'days_active',   7,  7,  200, 'medium'),
    ('💪 Mestre da Proteína',     'Bata a meta de proteína 5 vezes em uma semana',                '💪', 'solo', 'ptn_pct',       5,  7,  250, 'medium'),
    ('🎯 Meta Total',             'Atinja 90%+ de kcal E proteína em 3 dias',                     '🎯', 'solo', 'goals_hit',     3,  7,  300, 'hard'),
    ('😴 Sono Sagrado',           'Registre 7+ horas de sono por 5 dias',                         '😴', 'solo', 'sleep_logged',  5,  7,  200, 'medium'),
    ('🍽️ Maratonista',            'Registre 15 refeições em uma semana',                           '🍽️', 'solo', 'meals_logged',  15, 7,  200, 'medium'),
    ('💎 Mês de Ferro',           'Mantenha um streak de 30 dias consecutivos',                    '💎', 'solo', 'streak',       30, 30, 500, 'legendary'),

    -- Duo challenges (with friends)
    ('🤝 Parceiros de Meta',      'Ambos batem a meta calórica por 3 dias na mesma semana',        '🤝', 'duo',  'kcal_pct',      3,  7,  300, 'medium'),
    ('🏃 Corrida de Streaks',     'Quem consegue o maior streak em 7 dias? Registre todo dia!',    '🏃', 'duo',  'streak',        7,  7,  350, 'hard'),
    ('💥 Duelo de Proteína',      'Quem bate a meta de proteína mais vezes em 7 dias?',            '💥', 'duo',  'ptn_pct',       5,  7,  300, 'hard'),
    ('📊 Desafio de Consistência','Quem registra mais refeições em 7 dias?',                       '📊', 'duo',  'meals_logged',  10, 7,  250, 'medium'),
    ('🌙 Duelo do Sono',          'Quem registra mais noites de sono na semana?',                  '🌙', 'duo',  'sleep_logged',  5,  7,  250, 'medium')
ON CONFLICT DO NOTHING;
