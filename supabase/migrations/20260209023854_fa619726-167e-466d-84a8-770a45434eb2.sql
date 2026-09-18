-- Re-create triggers (functions already exist)
DROP TRIGGER IF EXISTS on_friend_request ON public.friendships;
DROP TRIGGER IF EXISTS on_friend_accepted ON public.friendships;
DROP TRIGGER IF EXISTS on_friend_removed ON public.friendships;

CREATE TRIGGER on_friend_request
  AFTER INSERT ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_request_notification();

CREATE TRIGGER on_friend_accepted
  AFTER UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_accepted_notification();

CREATE TRIGGER on_friend_removed
  AFTER DELETE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_removed_notification();