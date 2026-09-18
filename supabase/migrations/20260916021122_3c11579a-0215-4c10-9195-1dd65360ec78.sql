-- 1) Hash plaintext client_secret sang bcrypt (chỉ các dòng chưa hash)
UPDATE public.oauth_clients
SET client_secret = extensions.crypt(client_secret, extensions.gen_salt('bf', 10)),
    updated_at = now()
WHERE client_secret IS NOT NULL
  AND client_secret NOT LIKE '$2%';

-- 2) Bỏ mọi redirect_uri localhost / 127.0.0.1 khỏi cấu hình OAuth production
UPDATE public.oauth_clients
SET redirect_uris = (
      SELECT COALESCE(array_agg(u ORDER BY u), ARRAY[]::text[])
      FROM unnest(redirect_uris) AS u
      WHERE u NOT ILIKE 'http://localhost%'
        AND u NOT ILIKE 'https://localhost%'
        AND u NOT ILIKE '%://127.0.0.1%'
    ),
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM unnest(redirect_uris) AS u
  WHERE u ILIKE '%localhost%' OR u ILIKE '%127.0.0.1%'
);