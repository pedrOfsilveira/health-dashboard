-- ──────────────────────────────────────────────────────────
-- Weekly Meal Planner tables
-- ──────────────────────────────────────────────────────────

-- A generated weekly meal plan
CREATE TABLE IF NOT EXISTS meal_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date NOT NULL,               -- Monday of the week
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  preferences jsonb DEFAULT '{}',          -- e.g. { "restrictions": ["lactose-free"], "cuisine": "brazilian" }
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

-- Individual entries inside a meal plan
CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon, 6=Sun
  meal_type    text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snack', 'dinner')),
  title        text NOT NULL,
  description  text,
  kcal         integer DEFAULT 0,
  ptn          real DEFAULT 0,
  carb         real DEFAULT 0,
  fat          real DEFAULT 0,
  ingredients  jsonb DEFAULT '[]',         -- array of { name, qty, unit }
  sort_order   smallint DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_plan ON meal_plan_entries(plan_id);

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_entries ENABLE ROW LEVEL SECURITY;

-- meal_plans: users can CRUD their own plans
CREATE POLICY "Users manage own meal plans"
  ON meal_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- meal_plan_entries: users can CRUD entries on their own plans
CREATE POLICY "Users manage own plan entries"
  ON meal_plan_entries FOR ALL
  USING (plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()))
  WITH CHECK (plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_meal_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_meal_plan_updated
  BEFORE UPDATE ON meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_plan_timestamp();
