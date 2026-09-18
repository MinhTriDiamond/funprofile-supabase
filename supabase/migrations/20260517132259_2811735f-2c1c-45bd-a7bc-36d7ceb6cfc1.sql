CREATE TABLE IF NOT EXISTS public.wallet_custom_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL DEFAULT 56,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  logo_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_custom_tokens_bnb_only CHECK (chain_id = 56),
  CONSTRAINT wallet_custom_tokens_address_format CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT wallet_custom_tokens_decimals_range CHECK (decimals >= 0 AND decimals <= 36)
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_custom_tokens_user_chain_address_key
  ON public.wallet_custom_tokens (user_id, chain_id, lower(address));

CREATE INDEX IF NOT EXISTS idx_wallet_custom_tokens_user_chain
  ON public.wallet_custom_tokens (user_id, chain_id)
  WHERE is_hidden = false;

ALTER TABLE public.wallet_custom_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own custom wallet tokens" ON public.wallet_custom_tokens;
CREATE POLICY "Users can view own custom wallet tokens"
  ON public.wallet_custom_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own custom wallet tokens" ON public.wallet_custom_tokens;
CREATE POLICY "Users can insert own custom wallet tokens"
  ON public.wallet_custom_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own custom wallet tokens" ON public.wallet_custom_tokens;
CREATE POLICY "Users can update own custom wallet tokens"
  ON public.wallet_custom_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own custom wallet tokens" ON public.wallet_custom_tokens;
CREATE POLICY "Users can delete own custom wallet tokens"
  ON public.wallet_custom_tokens FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_wallet_custom_tokens_updated_at ON public.wallet_custom_tokens;
CREATE TRIGGER update_wallet_custom_tokens_updated_at
  BEFORE UPDATE ON public.wallet_custom_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();