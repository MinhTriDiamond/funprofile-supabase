ALTER TABLE public.light_actions
DROP CONSTRAINT IF EXISTS light_actions_action_type_check;

ALTER TABLE public.light_actions
ADD CONSTRAINT light_actions_action_type_check
CHECK (
  action_type = ANY (
    ARRAY[
      'post'::text,
      'comment'::text,
      'reaction'::text,
      'share'::text,
      'friend'::text,
      'livestream'::text,
      'new_user_bonus'::text,
      'question_ask'::text,
      'feedback_give'::text,
      'vision_create'::text,
      'post_create'::text,
      'content_create'::text,
      'comment_create'::text,
      'journal_write'::text,
      'gratitude_practice'::text,
      'help_community'::text,
      'share_content'::text,
      'idea_submit'::text,
      'donate_support'::text
    ]
  )
);