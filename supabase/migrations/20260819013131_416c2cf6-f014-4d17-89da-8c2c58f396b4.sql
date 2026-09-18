SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pplp-post-edit-after-score-daily';

SELECT cron.schedule(
  'pplp-post-edit-after-score-daily',
  '30 3 * * *',
  $$SELECT public.pplp_post_edit_after_score_check(20, 0.05);$$
);