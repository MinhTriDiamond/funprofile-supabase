-- Cập nhật redirect_uris cho Fun Farm
UPDATE oauth_clients 
SET redirect_uris = ARRAY['https://farm.fun.rich/auth/callback', 'http://localhost:3000/auth/callback'],
    updated_at = now()
WHERE client_id = 'fun_farm_client';

-- Cập nhật redirect_uris cho Fun Play
UPDATE oauth_clients 
SET redirect_uris = ARRAY['https://play.fun.rich/auth/callback', 'http://localhost:3001/auth/callback'],
    updated_at = now()
WHERE client_id = 'fun_play_client';

-- Cập nhật redirect_uris cho Fun Planet
UPDATE oauth_clients 
SET redirect_uris = ARRAY['https://planet.fun.rich/auth/callback', 'http://localhost:3002/auth/callback'],
    updated_at = now()
WHERE client_id = 'fun_planet_client';