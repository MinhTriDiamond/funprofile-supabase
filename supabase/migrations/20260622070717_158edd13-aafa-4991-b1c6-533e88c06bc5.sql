
CREATE UNIQUE INDEX IF NOT EXISTS transactions_tx_hash_user_unique
  ON public.transactions (tx_hash, user_id)
  WHERE tx_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.backfill_transactions_from_sources()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s INT := 0; v_r INT := 0; v_w INT := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
    SELECT d.sender_id, d.tx_hash, COALESCE(d.sender_address,''), COALESCE(d.recipient_address,''),
      d.amount, d.token_symbol, d.token_address, d.chain_id, 'confirmed', COALESCE(d.confirmed_at, d.created_at)
    FROM public.donations d
    WHERE d.status='confirmed' AND d.tx_hash IS NOT NULL AND d.sender_id IS NOT NULL
    ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING
    RETURNING 1
  ) SELECT COUNT(*) INTO v_s FROM ins;

  WITH ins AS (
    INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
    SELECT d.recipient_id, d.tx_hash, COALESCE(d.sender_address,''), COALESCE(d.recipient_address,''),
      d.amount, d.token_symbol, d.token_address, d.chain_id, 'confirmed', COALESCE(d.confirmed_at, d.created_at)
    FROM public.donations d
    WHERE d.status='confirmed' AND d.tx_hash IS NOT NULL AND d.recipient_id IS NOT NULL
    ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING
    RETURNING 1
  ) SELECT COUNT(*) INTO v_r FROM ins;

  WITH ins AS (
    INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
    SELECT w.user_id, w.tx_hash,
      CASE WHEN w.direction='in' THEN COALESCE(w.counterparty_address,'') ELSE '' END,
      CASE WHEN w.direction='out' THEN COALESCE(w.counterparty_address,'') ELSE '' END,
      w.amount, w.token_symbol, w.token_address, w.chain_id,
      COALESCE(w.status,'confirmed'), w.created_at
    FROM public.wallet_transfers w
    WHERE w.tx_hash IS NOT NULL AND w.user_id IS NOT NULL
    ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING
    RETURNING 1
  ) SELECT COUNT(*) INTO v_w FROM ins;

  RETURN jsonb_build_object('sender_inserted',v_s,'recipient_inserted',v_r,'wallet_transfers_inserted',v_w);
END; $$;

SELECT public.backfill_transactions_from_sources();

CREATE OR REPLACE FUNCTION public.sync_donation_to_transactions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status='confirmed' AND NEW.tx_hash IS NOT NULL THEN
    IF NEW.sender_id IS NOT NULL THEN
      INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
      VALUES (NEW.sender_id, NEW.tx_hash, COALESCE(NEW.sender_address,''), COALESCE(NEW.recipient_address,''),
        NEW.amount, NEW.token_symbol, NEW.token_address, NEW.chain_id, 'confirmed',
        COALESCE(NEW.confirmed_at, NEW.created_at, now()))
      ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING;
    END IF;
    IF NEW.recipient_id IS NOT NULL THEN
      INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
      VALUES (NEW.recipient_id, NEW.tx_hash, COALESCE(NEW.sender_address,''), COALESCE(NEW.recipient_address,''),
        NEW.amount, NEW.token_symbol, NEW.token_address, NEW.chain_id, 'confirmed',
        COALESCE(NEW.confirmed_at, NEW.created_at, now()))
      ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_donation_to_transactions ON public.donations;
CREATE TRIGGER trg_sync_donation_to_transactions
AFTER INSERT OR UPDATE OF status, tx_hash ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.sync_donation_to_transactions();

CREATE OR REPLACE FUNCTION public.sync_wallet_transfer_to_transactions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tx_hash IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.transactions (user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at)
    VALUES (NEW.user_id, NEW.tx_hash,
      CASE WHEN NEW.direction='in' THEN COALESCE(NEW.counterparty_address,'') ELSE '' END,
      CASE WHEN NEW.direction='out' THEN COALESCE(NEW.counterparty_address,'') ELSE '' END,
      NEW.amount, NEW.token_symbol, NEW.token_address, NEW.chain_id,
      COALESCE(NEW.status,'confirmed'), COALESCE(NEW.created_at, now()))
    ON CONFLICT (tx_hash, user_id) WHERE tx_hash IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_wallet_transfer_to_transactions ON public.wallet_transfers;
CREATE TRIGGER trg_sync_wallet_transfer_to_transactions
AFTER INSERT OR UPDATE OF tx_hash, status ON public.wallet_transfers
FOR EACH ROW EXECUTE FUNCTION public.sync_wallet_transfer_to_transactions();
