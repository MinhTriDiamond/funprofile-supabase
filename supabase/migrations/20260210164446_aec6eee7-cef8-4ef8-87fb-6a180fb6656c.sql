ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS card_theme text DEFAULT 'celebration',
  ADD COLUMN IF NOT EXISTS card_background text,
  ADD COLUMN IF NOT EXISTS card_sound text DEFAULT 'rich-1';