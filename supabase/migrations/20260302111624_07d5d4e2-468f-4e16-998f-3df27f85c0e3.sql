
-- Bước 1: Thêm cột streak vào light_reputation
ALTER TABLE public.light_reputation
  ADD COLUMN IF NOT EXISTS consistency_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date DATE,
  ADD COLUMN IF NOT EXISTS sequence_bonus NUMERIC DEFAULT 0;

-- Bước 4: Thêm cột multiplier vào light_actions cho audit trail
ALTER TABLE public.light_actions
  ADD COLUMN IF NOT EXISTS consistency_multiplier NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS sequence_multiplier NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS integrity_penalty NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;
