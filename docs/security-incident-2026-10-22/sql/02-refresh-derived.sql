-- Incident 2026-10-22: refresh every derived surface immediately after isolating the fake rows
SELECT public.refresh_donation_board_base();
SELECT public.refresh_gift_breakdown_cache();
SELECT public.refresh_user_light_totals();
SELECT public.refresh_unified_transactions_snapshot();
SELECT public.donation_board_usd_total() AS board_total_usd,
       (SELECT count(*) FROM public.unified_transactions_snapshot
        WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445'
           OR counterparty_user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS snapshot_rows_for_suspect;
