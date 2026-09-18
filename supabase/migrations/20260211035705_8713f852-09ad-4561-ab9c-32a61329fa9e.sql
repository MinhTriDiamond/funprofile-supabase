
-- Step 1: Fix duplicate usernames (append suffix to newer records)
UPDATE profiles SET username = username || '_2' WHERE id = '2376c41b-7c4a-47aa-9080-593014dd653a'; -- angel hoa đỗ (newer)
UPDATE profiles SET username = trim(username) || '_2' WHERE id = '49fcc9b7-14cb-4e53-9b09-c3c6319db9cd'; -- Angelkieuphi  (newer, has trailing space)
UPDATE profiles SET username = username || '_2' WHERE id = 'fc042e3b-691a-4b6c-b1e9-efe97d3430db'; -- hoangtydo88 (newer)
UPDATE profiles SET username = username || '_2' WHERE id = 'c241a6c1-92f3-4f38-be53-96b506e8d6a3'; -- Phạm Lương (newer)

-- Also trim trailing spaces on the originals
UPDATE profiles SET username = trim(username) WHERE id = '3755ae49-b9f9-48ce-a93d-7fb67dd2ecd4'; -- "Angel Hoa Đỗ "
UPDATE profiles SET username = trim(username) WHERE id = '04d802a5-1fd2-47e9-9d99-a9c3c847cd41'; -- "Phạm Lương "

-- Step 2: Add username_normalized column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_normalized text
  GENERATED ALWAYS AS (lower(trim(username))) STORED;

-- Step 3: Create unique index on username_normalized
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_normalized 
  ON profiles (username_normalized);
