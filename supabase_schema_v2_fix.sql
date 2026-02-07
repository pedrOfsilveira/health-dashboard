-- =============================================
-- Bio-Tracker v2.1 — Fix days table for multi-user
-- =============================================
-- PROBLEM: days.date is the PRIMARY KEY, so two users can't have the same date.
-- SOLUTION: Add a surrogate UUID PK, make (user_id, date) UNIQUE, update meals FK.
-- 
-- Run this AFTER supabase_schema_v2.sql
-- =============================================

-- Step 1: Drop the FK from meals to days(date) first
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_date_fkey;

-- Step 2: Drop the old primary key on days
ALTER TABLE days DROP CONSTRAINT IF EXISTS days_pkey;

-- Step 3: Add a proper UUID primary key to days
ALTER TABLE days ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE days SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE days ADD PRIMARY KEY (id);

-- Step 4: Add UNIQUE constraint on (user_id, date) for multi-user
-- First, handle any existing data without user_id (set to NULL-safe unique)
ALTER TABLE days ADD CONSTRAINT days_user_date_unique UNIQUE (user_id, date);

-- Step 5: Add a date column to meals if not already referencing correctly
-- meals already has a `date` column — we keep it as a denormalized field for quick queries
-- No FK needed back to days since we query by (user_id, date) now

-- Step 6: Fix activity_level CHECK to include all values used in the app
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_activity_level_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_activity_level_check 
    CHECK (activity_level IN ('sedentary', 'lightly_active', 'light', 'moderately_active', 'moderate', 'very_active', 'active', 'extra_active'));

-- Step 7: Drop the old permissive policy name variants
DROP POLICY IF EXISTS "Permitir acesso total" ON days;
DROP POLICY IF EXISTS "Permitir acesso total" ON meals;
DROP POLICY IF EXISTS "Permitir acesso total" ON meal_items;
