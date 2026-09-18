ALTER TABLE public.light_actions DROP CONSTRAINT light_actions_actor_id_fkey;
ALTER TABLE public.light_actions ADD CONSTRAINT light_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pending_claims DROP CONSTRAINT pending_claims_admin_id_fkey;
ALTER TABLE public.pending_claims ADD CONSTRAINT pending_claims_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pplp_v2_review_queue DROP CONSTRAINT pplp_v2_review_queue_assigned_to_fkey;
ALTER TABLE public.pplp_v2_review_queue ADD CONSTRAINT pplp_v2_review_queue_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pplp_v2_review_queue DROP CONSTRAINT pplp_v2_review_queue_resolved_by_fkey;
ALTER TABLE public.pplp_v2_review_queue ADD CONSTRAINT pplp_v2_review_queue_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;