-- Chuẩn hóa registered_from
UPDATE profiles SET registered_from = 'FUN Profile' WHERE registered_from IN ('fun_profile', 'web3', 'otp_email');
UPDATE profiles SET registered_from = 'FUN Farm' WHERE registered_from = 'fun_farm';

-- Chuẩn hóa oauth_provider
UPDATE profiles SET oauth_provider = 'Wallet' WHERE oauth_provider IN ('metamask', 'web3');
UPDATE profiles SET oauth_provider = 'Email OTP' WHERE oauth_provider IN ('otp_email', 'otp');
UPDATE profiles SET oauth_provider = 'Google' WHERE oauth_provider = 'google';
UPDATE profiles SET oauth_provider = 'Password' WHERE oauth_provider = 'password';

-- Chuẩn hóa last_login_platform
UPDATE profiles SET last_login_platform = 'FUN Profile' WHERE last_login_platform IN ('web3', 'otp_email', 'otp-email', 'fun_profile');
UPDATE profiles SET last_login_platform = 'FUN Farm' WHERE last_login_platform = 'fun_farm';

-- Thêm index cho platform_user_data để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_platform_user_data_user_client ON platform_user_data(user_id, client_id);