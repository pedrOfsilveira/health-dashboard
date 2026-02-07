-- Migration to add 'other' option to sex field in profiles table

-- Drop the old constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_sex_check;

-- Add the new constraint with 'other' option
ALTER TABLE profiles 
ADD CONSTRAINT profiles_sex_check 
CHECK (sex IN ('male', 'female', 'other'));
