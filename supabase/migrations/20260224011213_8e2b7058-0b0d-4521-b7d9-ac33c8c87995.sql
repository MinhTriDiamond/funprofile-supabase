
-- Reserved usernames table
CREATE TABLE public.reserved_usernames (
  username TEXT PRIMARY KEY,
  reason TEXT DEFAULT 'system_reserved',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow public read for validation checks
ALTER TABLE public.reserved_usernames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reserved usernames" ON public.reserved_usernames
  FOR SELECT USING (true);

-- Seed reserved usernames
INSERT INTO public.reserved_usernames (username) VALUES
  ('admin'), ('administrator'), ('root'), ('support'), ('api'), ('assets'), ('static'),
  ('post'), ('video'), ('live'), ('auth'), ('settings'), ('me'), ('home'),
  ('camly'), ('camlyd'), ('camlyduong'), ('father'), ('fun'),
  ('moderator'), ('mod'), ('system'), ('help'), ('about'), ('contact'),
  ('terms'), ('privacy'), ('search'), ('explore'), ('trending'), ('notifications'),
  ('messages'), ('chat'), ('profile'), ('user'), ('users'), ('login'), ('signup'),
  ('register'), ('logout'), ('dashboard'), ('feed'), ('reels'), ('stories'),
  ('null'), ('undefined'), ('true'), ('false'), ('test'), ('demo'),
  ('official'), ('verified'), ('staff'), ('team'), ('blog'), ('news'),
  ('status'), ('billing'), ('account'), ('security'), ('developer'), ('developers'),
  ('app'), ('apps'), ('download'), ('docs'), ('documentation'), ('legal'),
  ('report'), ('abuse'), ('spam'), ('bot'), ('bots'), ('webhook'), ('webhooks');

-- Add DB constraint: username must match strict pattern  
-- Trigger to validate username format on profiles insert/update
CREATE OR REPLACE FUNCTION public.validate_username_format()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if username is being set/changed
  IF NEW.username IS NOT NULL AND NEW.username != '' THEN
    -- Must match strict regex: lowercase, a-z0-9_, no leading/trailing _, no __
    IF NEW.username !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'Username must contain only lowercase letters, numbers, and single underscores (not at start/end)';
    END IF;
    
    -- Length check 3-30
    IF LENGTH(NEW.username) < 3 OR LENGTH(NEW.username) > 30 THEN
      RAISE EXCEPTION 'Username must be between 3 and 30 characters';
    END IF;
    
    -- Check reserved usernames
    IF EXISTS (SELECT 1 FROM public.reserved_usernames WHERE username = NEW.username) THEN
      RAISE EXCEPTION 'This username is reserved';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_username_format
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_username_format();
