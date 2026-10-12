-- FUN Profile baseline
-- B4B: functions requiring views

\set ON_ERROR_STOP on
BEGIN;

-- buddy_quest_complete(uuid,text)
CREATE OR REPLACE FUNCTION public.buddy_quest_complete(_circle_id uuid, _quest_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_quest public.buddy_daily_quests;
  v_just_completed boolean := false;
  v_done_today int;
  v_total_quests int;
  v_all_done boolean := false;
  v_inserted int := 0;
  v_ok boolean := false;
  v_buddy_ids uuid[];
  v_match_clause text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_buddy_member(_circle_id, v_me) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO v_quest FROM public.buddy_daily_quests WHERE id=_quest_id;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'QUEST_NOT_FOUND'; END IF;

  -- Tập member khác trong circle để verify
  SELECT array_agg(user_id) INTO v_buddy_ids
    FROM public.buddy_members
    WHERE circle_id=_circle_id AND user_id<>v_me;

  -- === VERIFY THEO QUEST ===
  IF _quest_id = 'gratitude_to_buddy' THEN
    -- Cần post hôm nay ≥ 50 ký tự VÀ nhắc tới ít nhất 1 buddy (username hoặc display_name)
    IF v_buddy_ids IS NULL OR array_length(v_buddy_ids,1) IS NULL THEN
      v_ok := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.user_id = v_me
          AND (p.created_at AT TIME ZONE 'UTC')::date = v_today
          AND length(coalesce(p.content,'')) >= 50
          AND EXISTS (
            SELECT 1 FROM public.public_profiles pp
            WHERE pp.id = ANY(v_buddy_ids)
              AND (
                (pp.username IS NOT NULL AND p.content ILIKE '%@' || pp.username || '%')
                OR (pp.display_name IS NOT NULL AND length(pp.display_name) >= 2
                    AND p.content ILIKE '%' || pp.display_name || '%')
              )
          )
      ) INTO v_ok;
    END IF;
  ELSIF _quest_id = 'cheer_buddy' THEN
    IF v_buddy_ids IS NULL OR array_length(v_buddy_ids,1) IS NULL THEN
      v_ok := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.pet_cheers c
        WHERE c.from_user_id = v_me
          AND c.to_user_id = ANY(v_buddy_ids)
          AND (c.created_at AT TIME ZONE 'UTC')::date = v_today
      ) INTO v_ok;
    END IF;
  ELSIF _quest_id = 'inner_work_share' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.user_id = v_me
        AND (p.created_at AT TIME ZONE 'UTC')::date = v_today
        AND length(coalesce(p.content,'')) >= 50
    ) INTO v_ok;
  ELSE
    -- Quest chưa định nghĩa luật verify → mặc định không cho
    v_ok := false;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'QUEST_NOT_DONE_YET';
  END IF;

  INSERT INTO public.buddy_daily_progress (circle_id, user_id, quest_id, utc_date)
  VALUES (_circle_id, v_me, _quest_id, v_today)
  ON CONFLICT (circle_id, user_id, quest_id, utc_date) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_just_completed := v_inserted > 0;

  SELECT count(*) INTO v_done_today FROM public.buddy_daily_progress
    WHERE circle_id=_circle_id AND user_id=v_me AND utc_date=v_today;
  SELECT count(*) INTO v_total_quests FROM public.buddy_daily_quests;
  v_all_done := v_done_today >= v_total_quests;

  IF v_just_completed AND v_all_done THEN
    PERFORM public.apply_pet_xp_grant(v_me, COALESCE(v_quest.xp_reward,30) * v_total_quests, 'buddy_circle');
    IF v_quest.mood_boost THEN
      UPDATE public.pet_states SET mood='happy', last_interaction_at=now()
        WHERE user_id=v_me AND mood IN ('sad','hungry','sleepy','calm');
    END IF;
    INSERT INTO public.notifications(user_id, type, metadata)
    VALUES (v_me, 'buddy_quest_complete',
            jsonb_build_object(
              'circle_id', _circle_id,
              'date', v_today,
              'title', 'Hôm nay nhóm bạn cùng toả sáng',
              'message', 'Bạn vừa hoàn thành đủ 3 nhiệm vụ Đôi bạn cùng tiến hôm nay. +XP Lumi & năng lượng.'
            ));
  END IF;

  RETURN jsonb_build_object(
    'just_completed', v_just_completed,
    'done_today', v_done_today,
    'total_quests', v_total_quests,
    'all_done_today', v_all_done
  );
END; $function$;

-- get_content_users_by_period_vn(text,text,text)
CREATE OR REPLACE FUNCTION public.get_content_users_by_period_vn(p_type text, p_date text, p_mode text)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, post_count bigint, social_links jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date := p_date::date;
  v_cutoff CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+07';
BEGIN
  IF p_mode = 'day' THEN
    v_start := (v_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := v_start + interval '1 day';
  ELSIF p_mode = 'week' THEN
    v_start := (v_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := v_start + interval '7 days';
  ELSIF p_mode = 'month' THEN
    v_start := (date_trunc('month', v_date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := (date_trunc('month', v_date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  IF p_type = 'posts' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'photos' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND (p.image_url IS NOT NULL OR (p.media_urls IS NOT NULL AND p.media_urls::text <> '[]'))
        AND p.video_url IS NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('video', 'gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'videos' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND p.video_url IS NOT NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('live', 'gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT ls.host_user_id AS user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM live_sessions ls
      JOIN public_profiles pr ON pr.id = ls.host_user_id
      WHERE ls.started_at >= v_start AND ls.started_at < v_end
        AND ls.status = 'ended'
      GROUP BY ls.host_user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      WITH user_rewards AS (
        -- New user bonus: 50k
        SELECT pr.id AS uid, 50000::numeric AS reward
        FROM profiles pr
        WHERE pr.is_banned = false AND pr.created_at >= v_start AND pr.created_at < v_end

        UNION ALL
        -- Posts OLD: 10k each
        SELECT p.user_id AS uid, 10000
        FROM posts p
        WHERE p.created_at >= v_start AND p.created_at < v_end AND p.created_at < v_cutoff
          AND COALESCE(p.is_reward_eligible, true) = true
          AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')

        UNION ALL
        -- Posts NEW: 5k, max 10/user/day
        SELECT uid, LEAST(cnt, 10) * 5000
        FROM (
          SELECT p.user_id AS uid, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM posts p
          WHERE p.created_at >= v_start AND p.created_at < v_end AND p.created_at >= v_cutoff
            AND COALESCE(p.is_reward_eligible, true) = true
            AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')
          GROUP BY p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        -- Reactions OLD: 1k (post owner)
        SELECT po.user_id AS uid, 1000
        FROM reactions r INNER JOIN posts po ON r.post_id = po.id
        WHERE r.created_at >= v_start AND r.created_at < v_end AND r.created_at < v_cutoff

        UNION ALL
        -- Reactions NEW: 1k, max 50/owner/day
        SELECT uid, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id AS uid, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM reactions r INNER JOIN posts po ON r.post_id = po.id
          WHERE r.created_at >= v_start AND r.created_at < v_end AND r.created_at >= v_cutoff
          GROUP BY po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        -- Comments OLD: 2k
        SELECT po.user_id AS uid, 2000
        FROM comments c INNER JOIN posts po ON c.post_id = po.id
        WHERE c.created_at >= v_start AND c.created_at < v_end AND c.created_at < v_cutoff

        UNION ALL
        -- Comments NEW: 1k, >20 chars, max 50/owner/day
        SELECT uid, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id AS uid, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM comments c INNER JOIN posts po ON c.post_id = po.id
          WHERE c.created_at >= v_start AND c.created_at < v_end AND c.created_at >= v_cutoff
            AND length(c.content) > 20
          GROUP BY po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        -- Shares OLD: 10k
        SELECT po.user_id AS uid, 10000
        FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE sp.created_at >= v_start AND sp.created_at < v_end AND sp.created_at < v_cutoff

        UNION ALL
        -- Shares NEW: 1k, max 10/owner/day
        SELECT uid, LEAST(cnt, 10) * 1000
        FROM (
          SELECT po.user_id AS uid, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
          WHERE sp.created_at >= v_start AND sp.created_at < v_end AND sp.created_at >= v_cutoff
          GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        -- Friends OLD: 10k both sides
        SELECT f.user_id AS uid, 10000 FROM friendships f WHERE f.status='accepted' AND f.created_at >= v_start AND f.created_at < v_end AND f.created_at < v_cutoff
        UNION ALL
        SELECT f.friend_id AS uid, 10000 FROM friendships f WHERE f.status='accepted' AND f.created_at >= v_start AND f.created_at < v_end AND f.created_at < v_cutoff

        UNION ALL
        -- Friends NEW: 10k, max 10/user/day both sides
        SELECT uid, LEAST(cnt, 10) * 10000
        FROM (
          SELECT uid, rday, COUNT(*) AS cnt FROM (
            SELECT f2.user_id AS uid, (f2.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships f2 WHERE f2.status='accepted' AND f2.created_at >= v_start AND f2.created_at < v_end AND f2.created_at >= v_cutoff
            UNION ALL
            SELECT f3.friend_id AS uid, (f3.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships f3 WHERE f3.status='accepted' AND f3.created_at >= v_start AND f3.created_at < v_end AND f3.created_at >= v_cutoff
          ) ff GROUP BY uid, rday
        ) x

        UNION ALL
        -- Livestreams NEW: 20k, max 5/user/day
        SELECT uid, LEAST(cnt, 5) * 20000
        FROM (
          SELECT ls.host_user_id AS uid, (ls.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM live_sessions ls
          WHERE ls.started_at >= v_start AND ls.started_at < v_end AND ls.started_at >= v_cutoff AND ls.status = 'ended'
          GROUP BY ls.host_user_id, (ls.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        -- PPLP Mint rewards
        SELECT la.user_id AS uid, COALESCE(la.mint_amount, 0)
        FROM light_actions la
        WHERE la.created_at >= v_start AND la.created_at < v_end
          AND la.mint_status = 'minted' AND la.mint_amount > 0
      )
      SELECT ur.uid, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, SUM(ur.reward)::bigint AS post_count, pr.social_links::jsonb
      FROM user_rewards ur
      JOIN public_profiles pr ON pr.id = ur.uid
      GROUP BY ur.uid, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;
  END IF;
END;
$function$;

-- get_profile_shared_posts(uuid,integer,integer,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.get_profile_shared_posts(p_user_id uuid, p_limit integer DEFAULT 11, p_offset integer DEFAULT 0, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_is_friend boolean;
  v_limit integer := GREATEST(COALESCE(p_limit, 11), 0);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_window integer;
  v_rows jsonb[];
BEGIN
  IF p_user_id IS NULL OR v_limit = 0 THEN
    RETURN;
  END IF;

  -- Mọi dòng shared_posts trả về đều có user_id = p_user_id ⇒ 2 nhánh
  -- "chủ sở hữu" và "bạn bè" của chính dòng đó là hằng số, tính 1 lần.
  v_is_owner := (v_uid IS NOT NULL AND p_user_id = v_uid);
  v_is_friend := public.is_friend(p_user_id);

  -- Cửa sổ ứng viên: đọc theo index (user_id, created_at DESC) rồi mới ghép bài gốc.
  v_window := (v_limit + v_offset) * 5 + 20;

  FOR i IN 1..2 LOOP
    SELECT array_agg(row_json ORDER BY created_at DESC)
      INTO v_rows
    FROM (
      SELECT sp.created_at, jsonb_build_object(
        'id', sp.id,
        'user_id', sp.user_id,
        'original_post_id', sp.original_post_id,
        'created_at', sp.created_at,
        'caption', sp.caption,
        'visibility', sp.visibility,
        'posts', jsonb_build_object(
          'id', p.id,
          'slug', p.slug,
          'public_id', p.public_id,
          'share_code', p.share_code,
          'user_id', p.user_id,
          'content', p.content,
          'image_url', p.image_url,
          'video_url', p.video_url,
          'media_urls', p.media_urls,
          'created_at', p.created_at,
          'visibility', p.visibility,
          'post_type', p.post_type,
          'metadata', p.metadata,
          'replay_status', p.replay_status,
          'replay_ready', p.replay_ready,
          'playback_provider', p.playback_provider,
          'processing_message', p.processing_message,
          'gift_sender_id', p.gift_sender_id,
          'gift_recipient_id', p.gift_recipient_id,
          'gift_token', p.gift_token,
          'gift_amount', p.gift_amount,
          'gift_message', p.gift_message,
          'tx_hash', p.tx_hash,
          'is_highlighted', p.is_highlighted,
          'highlight_expires_at', p.highlight_expires_at,
          'deleted_at', p.deleted_at,
          'public_profiles', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
            'username', pr.username,
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url,
            'full_name', pr.full_name,
            'public_wallet_address', pr.public_wallet_address,
            'btc_address', pr.btc_address,
            'is_live', pr.is_live,
            'current_live_session_id', pr.current_live_session_id,
            'live_started_at', pr.live_started_at
          ) END
        )
      ) AS row_json
      FROM (
        SELECT sp2.*
        FROM public.shared_posts sp2
        WHERE sp2.user_id = p_user_id
          AND (p_cursor IS NULL OR sp2.created_at < p_cursor)
          AND (sp2.visibility = 'public' OR v_is_owner OR (sp2.visibility = 'friends' AND v_is_friend))
        ORDER BY sp2.created_at DESC
        LIMIT CASE WHEN i = 1 THEN v_window ELSE NULL END
      ) sp
      JOIN public.posts p ON p.id = sp.original_post_id
      LEFT JOIN public.public_profiles pr ON pr.id = p.user_id
      WHERE p.deleted_at IS NULL
        AND (
          p.visibility = 'public'
          OR (v_uid IS NOT NULL AND p.user_id = v_uid)
          OR (p.visibility = 'friends' AND public.is_friend(p.user_id))
        )
      ORDER BY sp.created_at DESC
      LIMIT v_limit + v_offset
    ) q;

    v_rows := COALESCE(v_rows, ARRAY[]::jsonb[]);
    -- Nếu cửa sổ nhỏ chưa đủ số dòng cần, chạy lại không giới hạn cửa sổ.
    EXIT WHEN i = 2 OR cardinality(v_rows) >= v_limit + v_offset;
  END LOOP;

  RETURN QUERY
  SELECT r FROM unnest(v_rows) WITH ORDINALITY AS t(r, ord)
  WHERE t.ord > v_offset
  ORDER BY t.ord;
END;
$function$;

-- get_unified_admin_stats(timestamp with time zone,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.get_unified_admin_stats(_from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _vn_start timestamptz;
  _vn_end   timestamptz;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: admin stats requires auth' USING ERRCODE = '42501';
  END IF;
  _is_admin := public.has_role(_caller, 'admin');
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: admin stats requires admin role' USING ERRCODE = '42501';
  END IF;

  -- Ghi audit (best-effort — không block RPC nếu insert lỗi).
  BEGIN
    INSERT INTO public.admin_sql_audit(admin_id, sql_hash, sql_preview, mode, ip, row_count)
    VALUES (
      _caller,
      md5('rpc:get_unified_admin_stats'),
      left('rpc:get_unified_admin_stats(from=' || COALESCE(_from_ts::text,'') ||
           ' to=' || COALESCE(_to_ts::text,'') || ')', 200),
      'read', NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Múi giờ VN (UTC+7) — 1 ngày = [00:00 VN, 24:00 VN).
  _vn_start := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  _vn_end   := _vn_start + interval '1 day';

  WITH filtered AS (
    SELECT * FROM (
      SELECT v.*,
        ROW_NUMBER() OVER (
          PARTITION BY v.source_table || '|' || v.source_id
          ORDER BY (v.direction = 'out') DESC, v.id
        ) AS _rn
      FROM public.v_unified_transactions_primary v
      WHERE v.source_table = 'donations'
        AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
        AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
        AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
        AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
        AND (_to_ts   IS NULL OR v.occurred_at <= _to_ts)
    ) x WHERE _rn = 1
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint AS total_count,
      COUNT(*) FILTER (WHERE status IN ('success','confirmed','completed'))::bigint AS confirmed_count,
      COUNT(*) FILTER (WHERE status IN ('pending','processing'))::bigint AS pending_count,
      COUNT(*) FILTER (WHERE COALESCE(created_at, occurred_at) >= _vn_start
                         AND COALESCE(created_at, occurred_at) <  _vn_end)::bigint AS today_count,
      COALESCE(SUM(amount_decimal), 0)::numeric AS total_value,
      COALESCE(SUM((metadata->>'light_score_earned')::numeric)
               FILTER (WHERE metadata ? 'light_score_earned'), 0)::numeric AS total_light_score
    FROM filtered
  ),
  by_token AS (
    SELECT COALESCE(jsonb_object_agg(token_symbol, sum_amt), '{}'::jsonb) AS data
    FROM (
      SELECT token_symbol, COALESCE(SUM(amount_decimal), 0)::numeric AS sum_amt
      FROM filtered
      WHERE token_symbol IS NOT NULL
      GROUP BY token_symbol
    ) t
  )
  SELECT jsonb_build_object(
    'total_count',      t.total_count,
    'confirmed_count',  t.confirmed_count,
    'pending_count',    t.pending_count,
    'today_count',      t.today_count,
    'total_value',      t.total_value,
    'total_light_score',t.total_light_score,
    'by_token',         (SELECT data FROM by_token)
  ) INTO _result
  FROM totals t;

  RETURN _result;
END;
$function$;

-- get_unified_counterparties(text,uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,boolean,integer)
CREATE OR REPLACE FUNCTION public.get_unified_counterparties(_scope text, _target_user_id uuid DEFAULT NULL::uuid, _direction text DEFAULT NULL::text, _chain text DEFAULT NULL::text, _token_symbol text DEFAULT NULL::text, _tx_type text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _search text DEFAULT NULL::text, _external_only boolean DEFAULT NULL::boolean, _limit integer DEFAULT 200)
 RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, tx_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _statuses text[] := CASE
    WHEN _status IS NULL OR _status = 'all' THEN NULL
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
  _s        text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low    text := lower(COALESCE(_s, ''));
  _s_norm   text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len    int  := COALESCE(length(_s_norm), 0);
  _s_pat    text := '%' || _s_low  || '%';
  _n_pat    text := '%' || _s_norm || '%';
  _n_prefix text := _s_norm || '%';
  _is_alnum boolean := _s_norm ~ '^[a-z0-9]+$';
  _is_hex     boolean := _s_norm ~ '^[0-9a-f]+$';
  _is_txhash  boolean := _is_hex AND _s_len = 64;
  _is_evm_full   boolean := _is_hex AND _s_len = 40;
  _is_evm_suffix boolean := _is_hex AND _s_len BETWEEN 8 AND 39;
  _can_expand_evm boolean := (_is_evm_full OR _is_evm_suffix) AND NOT _is_txhash;
  _addr_ok    boolean := _s_len >= 6;
  _addr_prefix boolean := _s_len >= 4;
  _uids       uuid[] := NULL;
  _keys       text[] := NULL;
  _cw_uids    uuid[] := NULL;
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := false;
  ELSE
    _is_global := true;
  END IF;

  IF _s IS NOT NULL AND _can_expand_evm THEN
    SELECT array_agg(uid) INTO _cw_uids FROM (
      SELECT p.id AS uid FROM public.profiles p
      WHERE
        (_is_evm_full AND (
            lower(p.public_wallet_address)    = '0x' || _s_norm
         OR lower(p.custodial_wallet_address) = '0x' || _s_norm
         OR lower(p.external_wallet_address)  = '0x' || _s_norm))
        OR
        (_is_evm_suffix AND (
            lower(p.public_wallet_address)    LIKE '%' || _s_norm
         OR lower(p.custodial_wallet_address) LIKE '%' || _s_norm
         OR lower(p.external_wallet_address)  LIKE '%' || _s_norm))
    ) q;
    IF _cw_uids IS NULL OR array_length(_cw_uids, 1) <> 1 THEN
      _cw_uids := NULL;
    END IF;
  END IF;

  IF _s IS NOT NULL THEN
    WITH
    cu AS (
      SELECT p.id AS uid FROM public.profiles p
      WHERE p.username ILIKE _s_pat OR p.display_name ILIKE _s_pat OR p.full_name ILIKE _s_pat
    ),
    ck AS (
      SELECT d.sender_id AS uid, 'donations'::text AS st, d.id::text AS sid FROM public.donations d
      WHERE d.sender_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(w.tx_hash) LIKE _n_pat OR lower(w.counterparty_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(w.tx_hash) LIKE _n_prefix OR lower(w.counterparty_address) LIKE _n_prefix))
        ))
        OR upper(w.token_symbol) = upper(_s)
      )
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(t.tx_hash) LIKE _n_pat OR lower(t.from_address) LIKE _n_pat OR lower(t.to_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(t.tx_hash) LIKE _n_prefix OR lower(t.from_address) LIKE _n_prefix OR lower(t.to_address) LIKE _n_prefix))
        ))
        OR upper(t.token_symbol) = upper(_s)
      )
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IS NOT NULL AND _is_alnum AND (
        (_addr_ok AND lower(s.tx_hash) LIKE _n_pat)
        OR (NOT _addr_ok AND _addr_prefix AND lower(s.tx_hash) LIKE _n_prefix)
      )
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE d.sender_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.sender_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.recipient_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE _cw_uids IS NOT NULL AND w.user_id = ANY(_cw_uids) AND w.chain_id IN (1,56,97)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE _cw_uids IS NOT NULL AND t.user_id = ANY(_cw_uids) AND t.chain_id IN (1,56,97)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE _cw_uids IS NOT NULL AND s.user_id = ANY(_cw_uids) AND s.chain_id IN (1,56,97)
    )
    SELECT
      COALESCE(array_agg(DISTINCT uid) FILTER (WHERE uid IS NOT NULL), ARRAY[]::uuid[]),
      COALESCE(array_agg(DISTINCT (st || '|' || sid)), ARRAY[]::text[])
    INTO _uids, _keys FROM ck;

    IF _uids IS NULL OR array_length(_uids, 1) IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT v.counterparty_user_id AS counterparty_user_id, v.user_id AS owner_user_id,
      (
        v.counterparty_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id <> v.user_id
            AND (
              lower(p2.public_wallet_address)    = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.custodial_wallet_address) = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.external_wallet_address)  = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.btc_address)             = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
            )
        )
      ) AS _resolved_external
    FROM public.v_unified_transactions_primary v
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (_direction IS NULL OR _direction = 'all' OR v.direction = _direction OR _is_global)
      AND (_chain IS NULL OR _chain = 'all' OR v.chain = _chain)
      AND (_token_symbol IS NULL OR _token_symbol = 'all' OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR _tx_type = 'all' OR v.tx_type = _tx_type OR _is_global)
      AND (_statuses IS NULL OR v.status = ANY(_statuses) OR _is_global)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (_s IS NULL OR v.user_id = ANY(_uids))
      AND (_s IS NULL OR (v.source_table || '|' || v.source_id) = ANY(_keys))
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  ),
  expanded AS (
    SELECT counterparty_user_id AS uid FROM base
      WHERE counterparty_user_id IS NOT NULL AND (_external_only IS NOT TRUE OR _resolved_external = true)
    UNION ALL
    SELECT owner_user_id AS uid FROM base WHERE _is_global AND owner_user_id IS NOT NULL
  ),
  agg AS (SELECT uid, COUNT(*)::bigint AS c FROM expanded GROUP BY uid)
  SELECT a.uid, p.display_name, p.username, p.avatar_url, a.c
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.uid
  ORDER BY a.c DESC, COALESCE(p.display_name, p.username, '') ASC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
END;
$function$;

-- get_unified_facets(text,uuid)
CREATE OR REPLACE FUNCTION public.get_unified_facets(_scope text, _target_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _tokens text[];
  _chains text[];
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := false;
  ELSE
    _is_global := true;
  END IF;

  WITH base AS (
    SELECT v.token_symbol, v.chain
    FROM public.v_unified_transactions_primary v
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  )
  SELECT
    COALESCE((SELECT array_agg(DISTINCT token_symbol ORDER BY token_symbol) FROM base WHERE token_symbol IS NOT NULL), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT chain        ORDER BY chain)        FROM base WHERE chain        IS NOT NULL), ARRAY[]::text[])
  INTO _tokens, _chains;

  RETURN jsonb_build_object(
    'scope', _scope,
    'target_user_id', _effective,
    'tokens', to_jsonb(_tokens),
    'chains', to_jsonb(_chains)
  );
END;
$function$;

-- get_unified_summary(text,uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,boolean,uuid)
CREATE OR REPLACE FUNCTION public.get_unified_summary(_scope text, _target_user_id uuid DEFAULT NULL::uuid, _direction text DEFAULT NULL::text, _chain text DEFAULT NULL::text, _token_symbol text DEFAULT NULL::text, _tx_type text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _search text DEFAULT NULL::text, _external_only boolean DEFAULT NULL::boolean, _counterparty_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _is_admin_all boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _s          text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low      text := lower(COALESCE(_s, ''));
  _s_norm     text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len      int  := COALESCE(length(_s_norm), 0);
  _s_pat      text := '%' || _s_low  || '%';
  _n_pat      text := '%' || _s_norm || '%';
  _n_prefix   text := _s_norm || '%';
  _is_alnum   boolean := _s_norm ~ '^[a-z0-9]+$';
  _is_hex     boolean := _s_norm ~ '^[0-9a-f]+$';
  _is_txhash  boolean := _is_hex AND _s_len = 64;
  _is_evm_full   boolean := _is_hex AND _s_len = 40;
  _is_evm_suffix boolean := _is_hex AND _s_len BETWEEN 8 AND 39;
  _can_expand_evm boolean := (_is_evm_full OR _is_evm_suffix) AND NOT _is_txhash;
  _addr_ok    boolean := _s_len >= 6;
  _addr_prefix boolean := _s_len >= 4;
  _uids       uuid[]  := NULL;
  _keys       text[]  := NULL;
  _cw_uids    uuid[]  := NULL;
  _statuses text[] := CASE
    WHEN _status = 'all' THEN NULL
    WHEN _status IS NULL THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
  _result jsonb;
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global','admin_all') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := false;
  ELSIF _scope = 'admin_all' THEN
    IF _caller IS NULL OR NOT _is_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: scope=admin_all requires admin role' USING ERRCODE = '42501';
    END IF;
    _is_admin_all := true;
  ELSE
    _is_global := true;
  END IF;

  IF _s IS NOT NULL AND _can_expand_evm THEN
    SELECT array_agg(uid) INTO _cw_uids FROM (
      SELECT p.id AS uid FROM public.profiles p
      WHERE
        (_is_evm_full AND (
            lower(p.public_wallet_address)    = '0x' || _s_norm
         OR lower(p.custodial_wallet_address) = '0x' || _s_norm
         OR lower(p.external_wallet_address)  = '0x' || _s_norm))
        OR
        (_is_evm_suffix AND (
            lower(p.public_wallet_address)    LIKE '%' || _s_norm
         OR lower(p.custodial_wallet_address) LIKE '%' || _s_norm
         OR lower(p.external_wallet_address)  LIKE '%' || _s_norm))
    ) q;
    IF _cw_uids IS NULL OR array_length(_cw_uids, 1) <> 1 THEN
      _cw_uids := NULL;
    END IF;
  END IF;

  IF _s IS NOT NULL THEN
    WITH
    cu AS (
      SELECT p.id AS uid FROM public.profiles p
      WHERE p.username ILIKE _s_pat OR p.display_name ILIKE _s_pat OR p.full_name ILIKE _s_pat
    ),
    ck AS (
      SELECT d.sender_id AS uid, 'donations'::text AS st, d.id::text AS sid FROM public.donations d
      WHERE d.sender_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(w.tx_hash) LIKE _n_pat OR lower(w.counterparty_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(w.tx_hash) LIKE _n_prefix OR lower(w.counterparty_address) LIKE _n_prefix))
        ))
        OR upper(w.token_symbol) = upper(_s)
      )
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(t.tx_hash) LIKE _n_pat OR lower(t.from_address) LIKE _n_pat OR lower(t.to_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(t.tx_hash) LIKE _n_prefix OR lower(t.from_address) LIKE _n_prefix OR lower(t.to_address) LIKE _n_prefix))
        ))
        OR upper(t.token_symbol) = upper(_s)
      )
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IS NOT NULL AND _is_alnum AND (
        (_addr_ok AND lower(s.tx_hash) LIKE _n_pat)
        OR (NOT _addr_ok AND _addr_prefix AND lower(s.tx_hash) LIKE _n_prefix)
      )
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE d.sender_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.sender_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.recipient_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE _cw_uids IS NOT NULL AND w.user_id = ANY(_cw_uids) AND w.chain_id IN (1,56,97)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE _cw_uids IS NOT NULL AND t.user_id = ANY(_cw_uids) AND t.chain_id IN (1,56,97)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE _cw_uids IS NOT NULL AND s.user_id = ANY(_cw_uids) AND s.chain_id IN (1,56,97)
    )
    SELECT
      COALESCE(array_agg(DISTINCT uid) FILTER (WHERE uid IS NOT NULL), ARRAY[]::uuid[]),
      COALESCE(array_agg(DISTINCT (st || '|' || sid)), ARRAY[]::text[])
    INTO _uids, _keys FROM ck;

    IF _uids IS NULL OR array_length(_uids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'scope', _scope,
        'target_user_id', _effective,
        'totals', jsonb_build_object(
          'count_in', 0, 'count_out', 0, 'count_unknown', 0, 'count_pending', 0, 'count_total', 0,
          'sum_in', 0, 'sum_out', 0, 'sum_unknown', 0, 'net', 0
        ),
        'by_token', '[]'::jsonb, 'by_chain', '[]'::jsonb,
        'by_type', '[]'::jsonb, 'by_status', '[]'::jsonb
      );
    END IF;
  END IF;

  WITH base AS (
    SELECT v.*,
      (
        v.counterparty_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id <> v.user_id
            AND (
              lower(p2.public_wallet_address)    = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.custodial_wallet_address) = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.external_wallet_address)  = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.btc_address)             = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
            )
        )
      ) AS _resolved_external
    FROM public.v_unified_transactions_primary v
    WHERE
      (
        _is_admin_all
        OR (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (_direction IS NULL OR _direction = 'all' OR v.direction = _direction OR _is_global)
      AND (_chain IS NULL OR _chain = 'all' OR v.chain = _chain)
      AND (_token_symbol IS NULL OR _token_symbol = 'all' OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR _tx_type = 'all' OR v.tx_type = _tx_type OR _is_global)
      AND (_statuses IS NULL OR v.status = ANY(_statuses) OR _is_global)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (_counterparty_user_id IS NULL OR v.counterparty_user_id = _counterparty_user_id
           OR (_is_global AND v.user_id = _counterparty_user_id)
           OR (_is_admin_all AND v.user_id = _counterparty_user_id))
      AND (_s IS NULL OR v.user_id = ANY(_uids) OR (_is_admin_all AND v.user_id IS NULL))
      AND (_s IS NULL OR (v.source_table || '|' || v.source_id) = ANY(_keys))
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  ),
  filtered_raw AS (
    SELECT * FROM base WHERE (_external_only IS NOT TRUE OR _resolved_external = true)
  ),
  filtered AS (
    SELECT * FROM (
      SELECT fr.*,
        ROW_NUMBER() OVER (
          PARTITION BY CASE
            WHEN _is_admin_all AND fr.source_table = 'donations'
              THEN fr.source_table || '|' || fr.source_id
            ELSE fr.id
          END
          ORDER BY (fr.direction = 'out') DESC, fr.id
        ) AS _rn
      FROM filtered_raw fr
    ) x WHERE _rn = 1
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE direction = 'in')      AS count_in,
      COUNT(*) FILTER (WHERE direction = 'out')     AS count_out,
      COUNT(*) FILTER (WHERE direction = 'unknown') AS count_unknown,
      COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS count_pending,
      COUNT(*)                                       AS count_total,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'in'),      0) AS sum_in,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'out'),     0) AS sum_out,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'unknown'), 0) AS sum_unknown
    FROM filtered
  ),
  by_token AS (
    SELECT jsonb_agg(jsonb_build_object(
      'token_symbol', token_symbol, 'direction', direction,
      'count', cnt, 'sum_amount', sum_amt
    )) AS data
    FROM (
      SELECT token_symbol, direction, COUNT(*) AS cnt, COALESCE(SUM(amount_decimal),0) AS sum_amt
      FROM filtered GROUP BY token_symbol, direction
    ) t
  ),
  by_chain AS (
    SELECT jsonb_agg(jsonb_build_object('chain', chain, 'direction', direction, 'count', cnt)) AS data
    FROM ( SELECT chain, direction, COUNT(*) AS cnt FROM filtered GROUP BY chain, direction ) t
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('tx_type', tx_type, 'count', cnt)) AS data
    FROM ( SELECT tx_type, COUNT(*) AS cnt FROM filtered GROUP BY tx_type ) t
  ),
  by_status AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM ( SELECT status, COUNT(*) AS cnt FROM filtered GROUP BY status ) t
  )
  SELECT jsonb_build_object(
    'scope', _scope,
    'target_user_id', _effective,
    'totals', jsonb_build_object(
      'count_in', t.count_in, 'count_out', t.count_out, 'count_unknown', t.count_unknown,
      'count_pending', t.count_pending, 'count_total', t.count_total,
      'sum_in', t.sum_in, 'sum_out', t.sum_out, 'sum_unknown', t.sum_unknown,
      'net', (t.sum_in - t.sum_out)
    ),
    'by_token',  COALESCE((SELECT data FROM by_token),  '[]'::jsonb),
    'by_chain',  COALESCE((SELECT data FROM by_chain),  '[]'::jsonb),
    'by_type',   COALESCE((SELECT data FROM by_type),   '[]'::jsonb),
    'by_status', COALESCE((SELECT data FROM by_status), '[]'::jsonb)
  )
  INTO _result
  FROM totals t;

  RETURN _result;
END;
$function$;

-- get_unified_transaction_detail(text,text,text)
CREATE OR REPLACE FUNCTION public.get_unified_transaction_detail(_tx_hash text DEFAULT NULL::text, _source_table text DEFAULT NULL::text, _source_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _rows jsonb;
  _primary jsonb;
  _counterpart jsonb;
  _sender jsonb;
  _recipient jsonb;
  _sender_uid uuid;
  _recipient_uid uuid;
  _sender_addr text;
  _recipient_addr text;
  _explorer text;
  _chain text;
  _tx_hash_val text;
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  IF (_tx_hash IS NULL OR _tx_hash = '') AND (_source_id IS NULL OR _source_id = '') THEN
    RAISE EXCEPTION 'tx_hash or source_id required' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(to_jsonb(v) ORDER BY v.direction)
  INTO _rows
  FROM public.v_unified_transactions v
  WHERE
    (_tx_hash IS NULL OR v.tx_hash = _tx_hash)
    AND (_source_table IS NULL OR v.source_table = _source_table)
    AND (_source_id IS NULL OR v.source_id = _source_id);

  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN jsonb_build_object('primary', NULL, 'counterpart', NULL,
      'sender', NULL, 'recipient', NULL, 'explorer_url', NULL, 'confirmations', NULL);
  END IF;

  -- ưu tiên row của caller làm primary; fallback row đầu
  SELECT elem
  INTO _primary
  FROM jsonb_array_elements(_rows) elem
  WHERE _caller IS NOT NULL AND (elem->>'user_id')::uuid = _caller
  LIMIT 1;

  IF _primary IS NULL THEN
    _primary := _rows->0;
  END IF;

  SELECT elem
  INTO _counterpart
  FROM jsonb_array_elements(_rows) elem
  WHERE elem->>'id' <> (_primary->>'id')
  LIMIT 1;

  -- Suy sender / recipient từ direction của primary
  IF (_primary->>'direction') = 'out' THEN
    _sender_uid := NULLIF(_primary->>'user_id','')::uuid;
    _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  ELSIF (_primary->>'direction') = 'in' THEN
    _recipient_uid := NULLIF(_primary->>'user_id','')::uuid;
    _sender_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  ELSE
    _sender_uid := NULLIF(_primary->>'user_id','')::uuid;
    _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  END IF;

  _sender_addr := _primary->>'sender_address';
  _recipient_addr := _primary->>'recipient_address';

  _sender := COALESCE(public._unified_profile_lite(_sender_uid),
    jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));
  _sender := _sender || jsonb_build_object('address', _sender_addr);

  _recipient := COALESCE(public._unified_profile_lite(_recipient_uid),
    jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));
  _recipient := _recipient || jsonb_build_object('address', _recipient_addr);

  _chain := _primary->>'chain';
  _tx_hash_val := _primary->>'tx_hash';
  IF _tx_hash_val IS NOT NULL THEN
    IF _chain = 'bsc' THEN
      _explorer := 'https://bscscan.com/tx/' || _tx_hash_val;
    ELSIF _chain = 'bsc_testnet' THEN
      _explorer := 'https://testnet.bscscan.com/tx/' || _tx_hash_val;
    ELSIF _chain = 'btc' THEN
      _explorer := 'https://mempool.space/tx/' || _tx_hash_val;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'primary', _primary,
    'counterpart', _counterpart,
    'sender', _sender,
    'recipient', _recipient,
    'explorer_url', _explorer,
    'confirmations', NULL,
    'raw', _rows
  );
END;
$function$;

-- get_unified_transactions(text,uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,integer,integer,boolean,uuid)
CREATE OR REPLACE FUNCTION public.get_unified_transactions(_scope text, _target_user_id uuid DEFAULT NULL::uuid, _direction text DEFAULT NULL::text, _chain text DEFAULT NULL::text, _token_symbol text DEFAULT NULL::text, _tx_type text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _external_only boolean DEFAULT NULL::boolean, _counterparty_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, source_table text, source_id text, user_id uuid, counterparty_user_id uuid, tx_hash text, chain text, chain_id integer, network text, token_symbol text, token_address text, decimals integer, direction text, direction_confidence text, tx_type text, status text, is_external boolean, amount_raw text, amount_decimal numeric, fee_raw text, block_number bigint, occurred_at timestamp with time zone, confirmed_at timestamp with time zone, created_at timestamp with time zone, memo text, sender_address text, recipient_address text, metadata jsonb, total_count bigint, owner_display_name text, owner_username text, owner_avatar_url text, counterparty_display_name text, counterparty_username text, counterparty_avatar_url text, sender_user_id uuid, sender_display_name text, sender_username text, sender_avatar_url text, sender_wallet_address text, recipient_user_id uuid, recipient_display_name text, recipient_username text, recipient_avatar_url text, recipient_wallet_address text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _is_admin_all boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 5000);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
  _s          text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low      text := lower(COALESCE(_s, ''));
  _s_norm     text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len      int  := COALESCE(length(_s_norm), 0);
  _s_pat      text := '%' || _s_low  || '%';
  _n_pat      text := '%' || _s_norm || '%';
  _n_prefix   text := _s_norm || '%';
  _is_alnum   boolean := _s_norm ~ '^[a-z0-9]+$';
  _is_hex     boolean := _s_norm ~ '^[0-9a-f]+$';
  _is_txhash  boolean := _is_hex AND _s_len = 64;
  _is_evm_full   boolean := _is_hex AND _s_len = 40;
  _is_evm_suffix boolean := _is_hex AND _s_len BETWEEN 8 AND 39;
  _can_expand_evm boolean := (_is_evm_full OR _is_evm_suffix) AND NOT _is_txhash;
  _addr_ok    boolean := _s_len >= 6;
  _addr_prefix boolean := _s_len >= 4;
  _uids       uuid[]  := NULL;
  _keys       text[]  := NULL;
  _cw_uids    uuid[]  := NULL;
  _statuses text[] := CASE
    WHEN _status = 'all' THEN NULL
    WHEN _status IS NULL THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global','admin_all') THEN
    RAISE EXCEPTION 'INVALID_SCOPE: must be self|profile|global|admin_all' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: scope=self requires auth' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET: scope=profile requires _target_user_id' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := false;
  ELSIF _scope = 'admin_all' THEN
    IF _caller IS NULL OR NOT _is_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: scope=admin_all requires admin role' USING ERRCODE = '42501';
    END IF;
    _is_admin_all := true;
    BEGIN
      INSERT INTO public.admin_sql_audit(admin_id, sql_hash, sql_preview, mode, ip, row_count)
      VALUES (
        _caller,
        md5('rpc:get_unified_transactions:admin_all'),
        left('rpc:get_unified_transactions(admin_all)'
             || ' token=' || COALESCE(_token_symbol,'')
             || ' status=' || COALESCE(_status,'')
             || ' search=' || COALESCE(_s,''), 200),
        'read',
        NULL,
        NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSE
    _is_global := true;
  END IF;

  IF _s IS NOT NULL AND _can_expand_evm THEN
    SELECT array_agg(uid) INTO _cw_uids FROM (
      SELECT p.id AS uid FROM public.profiles p
      WHERE
        (_is_evm_full AND (
            lower(p.public_wallet_address)    = '0x' || _s_norm
         OR lower(p.custodial_wallet_address) = '0x' || _s_norm
         OR lower(p.external_wallet_address)  = '0x' || _s_norm))
        OR
        (_is_evm_suffix AND (
            lower(p.public_wallet_address)    LIKE '%' || _s_norm
         OR lower(p.custodial_wallet_address) LIKE '%' || _s_norm
         OR lower(p.external_wallet_address)  LIKE '%' || _s_norm))
    ) q;
    IF _cw_uids IS NULL OR array_length(_cw_uids, 1) <> 1 THEN
      _cw_uids := NULL;
    END IF;
  END IF;

  IF _s IS NOT NULL THEN
    WITH
    cu AS (
      SELECT p.id AS uid FROM public.profiles p
      WHERE p.username ILIKE _s_pat OR p.display_name ILIKE _s_pat OR p.full_name ILIKE _s_pat
    ),
    ck AS (
      SELECT d.sender_id AS uid, 'donations'::text AS st, d.id::text AS sid FROM public.donations d
      WHERE d.sender_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(w.tx_hash) LIKE _n_pat OR lower(w.counterparty_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(w.tx_hash) LIKE _n_prefix OR lower(w.counterparty_address) LIKE _n_prefix))
        ))
        OR upper(w.token_symbol) = upper(_s)
      )
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(t.tx_hash) LIKE _n_pat OR lower(t.from_address) LIKE _n_pat OR lower(t.to_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(t.tx_hash) LIKE _n_prefix OR lower(t.from_address) LIKE _n_prefix OR lower(t.to_address) LIKE _n_prefix))
        ))
        OR upper(t.token_symbol) = upper(_s)
      )
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IS NOT NULL AND _is_alnum AND (
        (_addr_ok AND lower(s.tx_hash) LIKE _n_pat)
        OR (NOT _addr_ok AND _addr_prefix AND lower(s.tx_hash) LIKE _n_prefix)
      )
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE d.sender_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.sender_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.recipient_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE _cw_uids IS NOT NULL AND w.user_id = ANY(_cw_uids) AND w.chain_id IN (1,56,97)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE _cw_uids IS NOT NULL AND t.user_id = ANY(_cw_uids) AND t.chain_id IN (1,56,97)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE _cw_uids IS NOT NULL AND s.user_id = ANY(_cw_uids) AND s.chain_id IN (1,56,97)
    )
    SELECT
      COALESCE(array_agg(DISTINCT uid) FILTER (WHERE uid IS NOT NULL), ARRAY[]::uuid[]),
      COALESCE(array_agg(DISTINCT (st || '|' || sid)), ARRAY[]::text[])
    INTO _uids, _keys FROM ck;

    IF _uids IS NULL OR array_length(_uids, 1) IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  WITH
  base AS (
    SELECT v.*,
      own.display_name AS _own_dn, own.username AS _own_un, own.avatar_url AS _own_av, own.full_name AS _own_fn,
      own.public_wallet_address AS _own_pw, own.custodial_wallet_address AS _own_cw,
      own.external_wallet_address AS _own_ew, own.btc_address AS _own_btc,
      cpt.display_name AS _cpt_dn, cpt.username AS _cpt_un, cpt.avatar_url AS _cpt_av, cpt.full_name AS _cpt_fn,
      cpt.public_wallet_address AS _cpt_pw, cpt.custodial_wallet_address AS _cpt_cw,
      cpt.external_wallet_address AS _cpt_ew, cpt.btc_address AS _cpt_btc,
      (
        v.counterparty_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id <> v.user_id
            AND (
              lower(p2.public_wallet_address)    = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.custodial_wallet_address) = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.external_wallet_address)  = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.btc_address)             = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
            )
        )
      ) AS _resolved_external
    FROM public.v_unified_transactions_primary v
    LEFT JOIN public.profiles own ON own.id = v.user_id
    LEFT JOIN public.profiles cpt ON cpt.id = v.counterparty_user_id
    WHERE
      (
        _is_admin_all
        OR (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (_direction IS NULL OR _direction = 'all' OR v.direction = _direction OR _is_global)
      AND (_chain IS NULL OR _chain = 'all' OR v.chain = _chain)
      AND (_token_symbol IS NULL OR _token_symbol = 'all' OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR _tx_type = 'all' OR v.tx_type = _tx_type OR _is_global)
      AND (_statuses IS NULL OR v.status = ANY(_statuses) OR _is_global)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (_counterparty_user_id IS NULL OR v.counterparty_user_id = _counterparty_user_id
           OR (_is_global AND v.user_id = _counterparty_user_id)
           OR (_is_admin_all AND v.user_id = _counterparty_user_id))
      AND (_s IS NULL OR v.user_id = ANY(_uids) OR (_is_admin_all AND v.user_id IS NULL))
      AND (_s IS NULL OR (v.source_table || '|' || v.source_id) = ANY(_keys))
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  ),
  filtered_raw AS (
    SELECT * FROM base WHERE (_external_only IS NOT TRUE OR _resolved_external = true)
  ),
  filtered AS (
    SELECT * FROM (
      SELECT fr.*,
        ROW_NUMBER() OVER (
          PARTITION BY CASE
            WHEN _is_admin_all AND fr.source_table = 'donations'
              THEN fr.source_table || '|' || fr.source_id
            ELSE fr.id
          END
          ORDER BY (fr.direction = 'out') DESC, fr.id
        ) AS _rn
      FROM filtered_raw fr
    ) x WHERE _rn = 1
  ),
  counted AS ( SELECT COUNT(*)::bigint AS c FROM filtered ),
  page AS (
    SELECT b.* FROM filtered b
    ORDER BY b.occurred_at DESC NULLS LAST, b.id
    LIMIT _lim OFFSET _off
  )
  SELECT p.id, p.source_table, p.source_id, p.user_id, p.counterparty_user_id,
         p.tx_hash, p.chain, p.chain_id, p.network,
         p.token_symbol, p.token_address, p.decimals,
         p.direction, p.direction_confidence, p.tx_type, p.status,
         p._resolved_external AS is_external,
         p.amount_raw, p.amount_decimal, p.fee_raw, p.block_number,
         p.occurred_at, p.confirmed_at, p.created_at,
         p.memo, p.sender_address, p.recipient_address,
         CASE WHEN _is_admin THEN p.metadata ELSE NULL END AS metadata,
         (SELECT c FROM counted) AS total_count,
         p._own_dn, p._own_un, p._own_av,
         p._cpt_dn, p._cpt_un, p._cpt_av,
         CASE WHEN p.direction = 'out' THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'out' THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'out' THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'out' THEN p._own_av ELSE p._cpt_av END,
         COALESCE(p.sender_address, CASE WHEN p.direction = 'out' THEN p._own_pw ELSE p._cpt_pw END),
         CASE WHEN p.direction = 'in'  THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'in'  THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'in'  THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'in'  THEN p._own_av ELSE p._cpt_av END,
         COALESCE(p.recipient_address, CASE WHEN p.direction = 'in'  THEN p._own_pw ELSE p._cpt_pw END)
  FROM page p
  ORDER BY p.occurred_at DESC NULLS LAST, p.id;
END;
$function$;

-- get_unified_light_score(uuid)
CREATE OR REPLACE FUNCTION public.get_unified_light_score(p_user_id uuid)
 RETURNS TABLE(user_id uuid, v1_light_score numeric, v2_light_score numeric, combined_light_score numeric, v1_actions_count bigint, v2_actions_count bigint, v1_tier integer, v1_streak integer, v2_minted_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    u.user_id,
    u.v1_light_score,
    u.v2_light_score,
    u.combined_light_score,
    u.v1_actions_count,
    u.v2_actions_count,
    u.v1_tier,
    u.v1_streak,
    u.v2_minted_amount
  FROM public.unified_user_light_score u
  WHERE u.user_id = p_user_id;
$function$;

-- get_user_donation_summary(uuid)
CREATE OR REPLACE FUNCTION public.get_user_donation_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT public.get_unified_summary('profile', p_user_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) AS j
  ),
  by_token AS (
    SELECT
      CASE
        WHEN upper(x->>'token_symbol') = 'BNB' AND (x->>'chain_id')::int = 97 THEN 'BNB (BSC Testnet)'
        WHEN upper(x->>'token_symbol') = 'BNB' THEN 'BNB (BSC Chain)'
        ELSE x->>'token_symbol'
      END AS token_symbol,
      x->>'direction' AS direction,
      SUM((x->>'count')::numeric) AS cnt,
      SUM((x->>'sum_amount')::numeric) AS sum_amount
    FROM raw, jsonb_array_elements(j->'by_token') AS x
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'received', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', sum_amount, 'count', cnt))
      FROM by_token WHERE direction = 'in'
    ), '{}'::jsonb),
    'sent', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', sum_amount, 'count', cnt))
      FROM by_token WHERE direction = 'out'
    ), '{}'::jsonb)
  );
$function$;

-- pet_leaderboard_top(integer)
CREATE OR REPLACE FUNCTION public.pet_leaderboard_top(_limit integer DEFAULT 50)
 RETURNS TABLE(user_id uuid, name text, evolution_stage integer, level integer, cheers_received_total integer, equipped_skin_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT user_id, name, evolution_stage, level, cheers_received_total, equipped_skin_slug
  FROM public.public_pet_states
  ORDER BY level DESC, cheers_received_total DESC, evolution_stage DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;

COMMIT;
