CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, username, username_normalized, avatar_url, bio, cover_url, created_at, full_name, display_name, social_links, public_wallet_address, is_banned, location, workplace, education, relationship_status, btc_address
FROM profiles p;