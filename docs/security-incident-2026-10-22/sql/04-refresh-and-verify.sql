-- Incident 2026-10-22: refresh derived surfaces after scope-2 cleanup, then verify
SELECT public.refresh_user_light_totals();
SELECT public.refresh_unified_transactions_snapshot();
SELECT public.donation_board_usd_total() AS board_total_usd,
       (SELECT count(*) FROM public.unified_transactions_snapshot
        WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445'
           OR counterparty_user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS snapshot_rows_for_suspect,
       (SELECT coalesce(total_score, 0) FROM public.user_light_totals
        WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS suspect_light_total,
       (SELECT count(*) FROM public.donations WHERE sender_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445'
           OR recipient_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS donations_touching_suspect;
