-- Authorized one-TX recovery; no blockchain transfer, schema or reward writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('gift-recovery:0x0e47286f240e22b9006cf5f58b6a3ea12d6e33022c1e0d753a6443efd03e5ad4',0));
DO $recovery$
DECLARE
  h constant text := '0x0e47286f240e22b9006cf5f58b6a3ea12d6e33022c1e0d753a6443efd03e5ad4';
  s constant uuid := '1c98a6eb-b939-43ab-aa6a-96a50b7b559f';
  r constant uuid := '5812ad63-2fc7-4858-9cea-264a7d151ce6';
  d constant uuid := 'da0c3856-8c02-404a-ac2f-4d44bec72206';
  p constant uuid := '0082e117-2559-40c4-8c77-2822f3ba66b7';
  occurred constant timestamptz := '2026-11-12T15:59:05Z';
BEGIN
  IF EXISTS (SELECT 1 FROM public.donations WHERE tx_hash=h)
    OR EXISTS (SELECT 1 FROM public.posts WHERE tx_hash=h)
    OR EXISTS (SELECT 1 FROM public.transactions WHERE tx_hash=h)
    OR EXISTS (SELECT 1 FROM public.unified_transactions_snapshot WHERE tx_hash=h) THEN
    RAISE EXCEPTION 'TX already has application records; stop and recheck instead of duplicating';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=s AND username='angelquangvu')
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=r AND username='amosmuhwezi'
      AND lower(public_wallet_address)='0x8b73415e530163df2e1ec4d45a641858a4af4bfb') THEN
    RAISE EXCEPTION 'Profile identities changed; stop recovery';
  END IF;
  INSERT INTO public.donations
    (id,sender_id,recipient_id,amount,token_symbol,token_address,chain_id,chain_family,tx_hash,status,
     block_number,message,message_template,light_score_earned,card_theme,card_sound,
     sender_address,recipient_address,is_external,created_at,confirmed_at,metadata)
  VALUES
    (d,s,r,'200000','CAMLY','0x0910320181889fefde0bb1ca63962b0a8882e413',56,'evm',h,'confirmed',
     133188051,'Cảm ơn bạn rất nhiều! 🙏','custom',0,'celebration','rich-1',
     '0x7e12ce3a5e95ce580b647a1a3f5700266f471ec8','0x8b73415e530163df2e1ec4d45a641858a4af4bfb',false,
     occurred,occurred,jsonb_build_object('recovered',true,'recovered_at',now(),
       'source','android-gift-recovery-2026-11-13','receipt_verified',true));
  INSERT INTO public.posts
    (id,user_id,content,post_type,tx_hash,gift_sender_id,gift_recipient_id,gift_token,gift_amount,
     gift_message,metadata,is_highlighted,highlight_expires_at,visibility,moderation_status,
     is_reward_eligible,created_at)
  VALUES
    (p,s,'🎉 @angelquangvu đã trao gửi 200.000 CAMLY cho @amosmuhwezi ❤️' || E'\n\n' || '“Cảm ơn bạn rất nhiều! 🙏”',
     'gift_celebration',h,s,r,'CAMLY','200000','Cảm ơn bạn rất nhiều! 🙏',
     jsonb_build_object('chain_id',56,'chain_family','evm','recovered',true,'source','android-gift-recovery-2026-11-13'),
     true,occurred+interval '24 hours','public','approved',false,occurred);
  UPDATE public.donations SET post_id=p WHERE id=d;
  IF (SELECT count(*) FROM public.transactions WHERE tx_hash=h AND user_id IN (s,r)) <> 2 THEN
    RAISE EXCEPTION 'Transaction sync incomplete; roll back';
  END IF;
  IF (SELECT count(*) FROM public.unified_transactions_snapshot WHERE tx_hash=h AND source_id=d::text) <> 2 THEN
    RAISE EXCEPTION 'Public history sync incomplete; roll back';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.donations x JOIN public.posts y ON y.id=x.post_id
    WHERE x.id=d AND y.id=p AND y.post_type='gift_celebration' AND y.visibility='public') THEN
    RAISE EXCEPTION 'Gift post linkage incomplete; roll back';
  END IF;
END;
$recovery$;
COMMIT;
