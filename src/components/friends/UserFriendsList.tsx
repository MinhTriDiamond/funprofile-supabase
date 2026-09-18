import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface FriendInfo {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
}

interface UserFriendsListProps {
  profileUserId: string;
  currentUserId: string | null;
}

type RelationStatus = "friend" | "pending_sent" | "pending_received" | "none" | "self";

export const UserFriendsList = ({ profileUserId, currentUserId }: UserFriendsListProps) => {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [relationMap, setRelationMap] = useState<Record<string, { status: RelationStatus; friendshipId?: string }>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFriendsOfUser();
  }, [profileUserId, currentUserId]);

  const fetchFriendsOfUser = async () => {
    setLoading(true);

    // 1. Get all accepted friendships of profileUserId via RPC (bypasses RLS)
    const { data: friendships } = await supabase
      .rpc("get_user_friends" as any, { target_user_id: profileUserId });

    const friendData = friendships as { friend_id: string; friendship_id: string }[] | null;

    if (!friendData?.length) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const friendIds = friendData.map(f => f.friend_id);

    // 2. Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", friendIds);

    const friendsList: FriendInfo[] = (profiles || []).map(p => ({
      id: p.id,
      username: p.username || "Unknown",
      full_name: p.full_name || "",
      avatar_url: p.avatar_url || "",
    }));

    setFriends(friendsList);

    // 3. Build relation map for currentUserId
    if (currentUserId) {
      const { data: myRelations } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

      const map: Record<string, { status: RelationStatus; friendshipId?: string }> = {};

      friendsList.forEach(friend => {
        if (friend.id === currentUserId) {
          map[friend.id] = { status: "self" };
          return;
        }

        const rel = myRelations?.find(r =>
          (r.user_id === currentUserId && r.friend_id === friend.id) ||
          (r.friend_id === currentUserId && r.user_id === friend.id)
        );

        if (!rel) {
          map[friend.id] = { status: "none" };
        } else if (rel.status === "accepted") {
          map[friend.id] = { status: "friend", friendshipId: rel.id };
        } else if (rel.status === "pending" && rel.user_id === currentUserId) {
          map[friend.id] = { status: "pending_sent", friendshipId: rel.id };
        } else if (rel.status === "pending" && rel.friend_id === currentUserId) {
          map[friend.id] = { status: "pending_received", friendshipId: rel.id };
        } else {
          map[friend.id] = { status: "none" };
        }
      });

      setRelationMap(map);
    }

    setLoading(false);
  };

  const handleSendRequest = async (targetUserId: string) => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from("friendships")
      .insert({ user_id: currentUserId, friend_id: targetUserId, status: "pending" });

    if (error) {
      toast.error("Không thể gửi lời mời kết bạn");
    } else {
      toast.success("Đã gửi lời mời kết bạn!");
      setRelationMap(prev => ({ ...prev, [targetUserId]: { status: "pending_sent" } }));
    }
  };

  const handleAccept = async (friendshipId: string, friendId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);

    if (error) {
      toast.error("Không thể chấp nhận lời mời");
    } else {
      toast.success("Đã chấp nhận lời mời kết bạn!");
      setRelationMap(prev => ({ ...prev, [friendId]: { status: "friend", friendshipId } }));
    }
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Đang tải...</p>;
  }

  if (friends.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Chưa có bạn bè</p>;
  }

  return (
    <div className="divide-y divide-border/50 touch-pan-y">
      {friends.map((friend) => {
        const relation = relationMap[friend.id] || { status: "none" };

        return (
          <div
            key={friend.id}
            className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-transparent px-2 py-2 touch-pan-y hover:bg-white hover:shadow-[0_0_12px_rgba(34,197,94,0.5)] hover:border-[#C9A84C]/40 sm:p-3 sm:rounded-full transition-all duration-300"
          >
            <Avatar
              className="w-12 h-12 shrink-0 cursor-pointer"
              onClick={() => navigate(`/profile/${friend.id}`)}
            >
              {friend.avatar_url ? (
                <AvatarImage src={friend.avatar_url} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-muted text-lg">
                {friend.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => navigate(`/profile/${friend.id}`)}
            >
              <p className="font-medium text-base truncate">
                {friend.full_name || friend.username}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                @{friend.username}
              </p>
            </div>

            <div className="shrink-0">
              {relation.status === "self" ? null : relation.status === "friend" ? (
                <Badge variant="secondary" className="gap-1">
                  <UserCheck className="w-3 h-3" />
                  Bạn bè
                </Badge>
              ) : relation.status === "pending_sent" ? (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  Đã gửi
                </Badge>
              ) : relation.status === "pending_received" ? (
                <Button
                  size="sm"
                  onClick={() => handleAccept(relation.friendshipId!, friend.id)}
                  className="h-8 px-3"
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  Chấp nhận
                </Button>
              ) : currentUserId ? (
                <Button
                  size="sm"
                  onClick={() => handleSendRequest(friend.id)}
                  className="h-8 px-3"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Kết bạn</span>
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
