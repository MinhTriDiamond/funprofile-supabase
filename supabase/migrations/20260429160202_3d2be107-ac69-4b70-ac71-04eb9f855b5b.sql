-- 1) Bảng quản trị ngôn ngữ động
CREATE TABLE IF NOT EXISTS public.i18n_languages (
  code text PRIMARY KEY,
  name text NOT NULL,
  native_name text NOT NULL,
  flag_url text,
  direction text NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
  is_active boolean NOT NULL DEFAULT false,
  coverage_percent integer NOT NULL DEFAULT 0 CHECK (coverage_percent BETWEEN 0 AND 100),
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.i18n_languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read i18n_languages" ON public.i18n_languages;
CREATE POLICY "Anyone can read i18n_languages"
  ON public.i18n_languages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage i18n_languages" ON public.i18n_languages;
CREATE POLICY "Admins manage i18n_languages"
  ON public.i18n_languages
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_i18n_languages_updated_at ON public.i18n_languages;
CREATE TRIGGER trg_i18n_languages_updated_at
  BEFORE UPDATE ON public.i18n_languages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed 13 ngôn ngữ hiện có; chỉ bật vi & en
INSERT INTO public.i18n_languages (code, name, native_name, flag_url, direction, is_active, coverage_percent, sort_order) VALUES
  ('vi','Vietnamese','Tiếng Việt','https://flagcdn.com/w40/vn.png','ltr',true,100,10),
  ('en','English','English','https://flagcdn.com/w40/us.png','ltr',true,100,20),
  ('zh','Chinese (Simplified)','中文','https://flagcdn.com/w40/cn.png','ltr',false,5,30),
  ('ja','Japanese','日本語','https://flagcdn.com/w40/jp.png','ltr',false,5,40),
  ('ko','Korean','한국어','https://flagcdn.com/w40/kr.png','ltr',false,5,50),
  ('th','Thai','ไทย','https://flagcdn.com/w40/th.png','ltr',false,5,60),
  ('id','Indonesian','Bahasa Indonesia','https://flagcdn.com/w40/id.png','ltr',false,5,70),
  ('fr','French','Français','https://flagcdn.com/w40/fr.png','ltr',false,5,80),
  ('es','Spanish','Español','https://flagcdn.com/w40/es.png','ltr',false,5,90),
  ('de','German','Deutsch','https://flagcdn.com/w40/de.png','ltr',false,5,100),
  ('pt','Portuguese','Português','https://flagcdn.com/w40/br.png','ltr',false,5,110),
  ('ru','Russian','Русский','https://flagcdn.com/w40/ru.png','ltr',false,5,120),
  ('ar','Arabic','العربية','https://flagcdn.com/w40/sa.png','rtl',false,5,130)
ON CONFLICT (code) DO NOTHING;

-- 3) Thay constraint cứng bằng FK tới bảng động
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_language_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_language_fkey
      FOREIGN KEY (preferred_language) REFERENCES public.i18n_languages(code)
      ON UPDATE CASCADE ON DELETE SET DEFAULT;
  END IF;
END $$;