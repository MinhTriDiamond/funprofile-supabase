ALTER TABLE public.light_actions DROP CONSTRAINT IF EXISTS light_actions_action_type_check;
ALTER TABLE public.light_actions ADD CONSTRAINT light_actions_action_type_check
CHECK (action_type = ANY (ARRAY[
  'post','comment','reaction','share','friend','livestream','new_user_bonus',
  'question_ask','feedback_give','vision_create','post_create','content_create',
  'comment_create','journal_write','gratitude_practice','help_community',
  'share_content','idea_submit','donate_support','QUEST_REWARD',
  'INNER_WORK','CHANNELING','GIVING','HELPING','GRATITUDE','SERVICE'
]));

UPDATE public.posts
SET pplp_pillar = 'inner_work'
WHERE id = '714b4244-3b46-4cfc-a5d7-a77c11d4fe3a' AND pplp_pillar IS NULL;

INSERT INTO public.light_actions (user_id, action_type, base_reward, light_score, reference_id, reference_type, is_eligible, created_at, evaluated_at)
SELECT '5f9de7c5-0c80-49aa-8e1c-92d8058558e4'::uuid, 'INNER_WORK', 30, 30, '714b4244-3b46-4cfc-a5d7-a77c11d4fe3a'::uuid, 'post', true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.light_actions
  WHERE user_id = '5f9de7c5-0c80-49aa-8e1c-92d8058558e4'::uuid
    AND action_type = 'INNER_WORK'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
);