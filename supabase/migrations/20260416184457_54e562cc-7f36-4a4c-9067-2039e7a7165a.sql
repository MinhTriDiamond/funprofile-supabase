DELETE FROM public.rate_limit_state 
WHERE key IN (
  'otp_request:trang73790104@gmail.com',
  'otp_request:TRANG73790104@GMAIL.COM'
) OR key ILIKE 'otp_request:trang73790104%';