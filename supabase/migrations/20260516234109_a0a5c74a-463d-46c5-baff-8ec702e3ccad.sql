UPDATE public.live_sessions
SET status = 'replay_temp_ready',
    is_input_armed = false,
    armed_session_token = NULL,
    updated_at = now()
WHERE id = '8d40e1ad-de65-4c1e-bba8-9f338fcc09cf';