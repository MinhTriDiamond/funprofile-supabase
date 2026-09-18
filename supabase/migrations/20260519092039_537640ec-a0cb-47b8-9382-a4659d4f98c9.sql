CREATE OR REPLACE FUNCTION public.buddy_circle_create(_name text, _max_members int)
RETURNS public.buddy_circles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.buddy_circles;
  v_code text;
  v_active int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _max_members < 2 OR _max_members > 10 THEN
    RAISE EXCEPTION 'max_members must be 2..10';
  END IF;
  SELECT count(*) INTO v_active FROM public.buddy_circles
    WHERE owner_id = v_uid AND status = 'active';
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Bạn chỉ được tạo tối đa 3 nhóm cùng lúc';
  END IF;

  LOOP
    v_code := upper(substring(
      translate(md5(random()::text || clock_timestamp()::text || v_uid::text),
                'abcdefghij', '0123456789')
      from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.buddy_circles WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO public.buddy_circles (name, owner_id, max_members, invite_code)
  VALUES (trim(_name), v_uid, _max_members, v_code)
  RETURNING * INTO v_row;

  INSERT INTO public.buddy_members (circle_id, user_id, role)
  VALUES (v_row.id, v_uid, 'owner');

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_circle_join_by_code(_code text)
RETURNS public.buddy_circles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.buddy_circles;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_row FROM public.buddy_circles WHERE invite_code = upper(trim(_code)) AND status='active';
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Mã không hợp lệ hoặc nhóm đã đóng'; END IF;
  SELECT count(*) INTO v_count FROM public.buddy_members WHERE circle_id = v_row.id;
  IF v_count >= v_row.max_members THEN
    RAISE EXCEPTION 'Nhóm đã đầy';
  END IF;
  INSERT INTO public.buddy_members (circle_id, user_id, role)
  VALUES (v_row.id, v_uid, 'member')
  ON CONFLICT (circle_id, user_id) DO NOTHING;
  RETURN v_row;
END;
$$;