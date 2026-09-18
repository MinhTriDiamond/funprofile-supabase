import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserMinus, UserCheck, X, UserPlus, MoreHorizontal, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { LazyImage } from "@/components/ui/LazyImage";
import { PetMiniBadge } from "@/modules/pet/components/PetMiniBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Friend {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  friendship_id: string;
}

interface FriendsListProps {
  userId: string;
}

export const FriendsList = ({ userId }: FriendsListProps) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFriends();
    fetchPendingRequests();
    fetchSentRequests();
    fetchSuggestions();
    
    const channel = supabase
      .channel('friendships-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships'
        },
        () => {
          fetchFriends();
          fetchPendingRequests();
          fetchSentRequests();
          fetchSuggestions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchFriends = async () => {
    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "accepted")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error || !data) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const userIds = data.map(f => 
      f.user_id === userId ? f.friend_id : f.user_id
    );

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const friendsList: Friend[] = data.map(friendship => {
      const friendId = friendship.user_id === userId ? friendship.friend_id : friendship.user_id;
      const profile = profilesData?.find(p => p.id === friendId);
      
      return {
        id: profile?.id || friendId,
        username: profile?.username || "Unknown",
        full_name: profile?.full_name || "",
        avatar_url: profile?.avatar_url || "",
        friendship_id: friendship.id
      };
    }).filter(f => f.username !== "Unknown");

    setFriends(friendsList);
    setLoading(false);
  };

  const fetchPendingRequests = async () => {
    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "pending")
      .eq("friend_id", userId);

    if (error || !data?.length) {
      setPendingRequests([]);
      return;
    }

    const userIds = data.map(f => f.user_id);
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const requests: Friend[] = data.map(friendship => {
      const profile = profilesData?.find(p => p.id === friendship.user_id);
      return {
        id: profile?.id || friendship.user_id,
        username: profile?.username || "Unknown",
        full_name: profile?.full_name || "",
        avatar_url: profile?.avatar_url || "",
        friendship_id: friendship.id
      };
    }).filter(f => f.username !== "Unknown");

    setPendingRequests(requests);
  };

  const fetchSentRequests = async () => {
    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "pending")
      .eq("user_id", userId);

    if (error || !data?.length) {
      setSentRequests([]);
      return;
    }

    const friendIds = data.map(f => f.friend_id);
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", friendIds);

    const requests: Friend[] = data.map(friendship => {
      const profile = profilesData?.find(p => p.id === friendship.friend_id);
      return {
        id: profile?.id || friendship.friend_id,
        username: profile?.username || "Unknown",
        full_name: profile?.full_name || "",
        avatar_url: profile?.avatar_url || "",
        friendship_id: friendship.id
      };
    }).filter(f => f.username !== "Unknown");

    setSentRequests(requests);
  };

  const fetchSuggestions = async () => {
    const { data: existingRelations } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    const excludedUserIds = new Set([userId]);
    existingRelations?.forEach(rel => {
      excludedUserIds.add(rel.user_id);
      excludedUserIds.add(rel.friend_id);
    });

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .not("id", "in", `(${Array.from(excludedUserIds).join(',')})`)
      .limit(10);

    const suggestionsList: Friend[] = (profilesData || []).map(profile => ({
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name || "",
      avatar_url: profile.avatar_url || "",
      friendship_id: ""
    }));

    setSuggestions(suggestionsList);
  };

  const handleUnfriend = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (error) {
      toast.error("Không thể hủy kết bạn");
    } else {
      toast.success("Đã hủy kết bạn");
      fetchFriends();
    }
  };

  const handleAccept = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);

    if (error) {
      toast.error("Không thể chấp nhận lời mời");
    } else {
      toast.success("Đã chấp nhận lời mời kết bạn!");
      fetchFriends();
      fetchPendingRequests();
    }
  };

  const handleReject = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (error) {
      toast.error("Không thể từ chối lời mời");
    } else {
      toast.success("Đã từ chối lời mời");
      fetchPendingRequests();
    }
  };

  const handleCancelRequest = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (error) {
      toast.error("Không thể hủy lời mời");
    } else {
      toast.success("Đã hủy lời mời kết bạn");
      fetchSentRequests();
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    const { error } = await supabase
      .from("friendships")
      .insert({
        user_id: userId,
        friend_id: targetUserId,
        status: "pending"
      });

    if (error) {
      toast.error("Không thể gửi lời mời kết bạn");
    } else {
      toast.success("Đã gửi lời mời kết bạn!");
      fetchSuggestions();
      fetchSentRequests();
    }
  };

  // Mobile-first Friend Item Component
  const FriendItem = ({ 
    friend, 
    actions 
  }: { 
    friend: Friend; 
    actions: React.ReactNode;
  }) => (
    <div className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-transparent px-2 py-2 touch-pan-y hover:bg-white hover:shadow-[0_0_12px_rgba(34,197,94,0.5)] hover:border-[#C9A84C]/40 sm:p-3 sm:rounded-full transition-all duration-300">
      {/* Avatar - shrink-0 prevents squishing */}
      <div className="relative shrink-0">
        <Avatar
          className="w-12 h-12 cursor-pointer"
          onClick={() => navigate(`/profile/${friend.id}`)}
        >
          {friend.avatar_url ? (
            <AvatarImage src={friend.avatar_url} sizeHint="md" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-muted text-lg">
            {friend.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Lumi mini badge — overlay góc dưới-phải avatar */}
        <div className="absolute -bottom-1 -right-1 z-10">
          <PetMiniBadge userId={friend.id} size="sm" />
        </div>
      </div>

      {/* Info - min-w-0 + truncate prevents overflow */}
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

      {/* Actions - shrink-0 keeps buttons visible */}
      <div className="shrink-0 flex items-center gap-1">
        {actions}
      </div>
    </div>
  );

  return (
    <div className="p-0 sm:p-4">
      <Tabs defaultValue="friends" className="w-full">
        {/* Scrollable tabs on mobile */}
        <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0 mb-4 touch-pan-y">
          <TabsTrigger 
            value="friends" 
            className="flex-1 min-w-[80px] text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-2 border border-[#C9A84C]/40 data-[state=active]:border-[#C9A84C]"
          >
            Bạn bè ({friends.length})
          </TabsTrigger>
          <TabsTrigger 
            value="requests"
            className="flex-1 min-w-[80px] text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-2 border border-[#C9A84C]/40 data-[state=active]:border-[#C9A84C]"
          >
            Lời mời ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger 
            value="sent"
            className="flex-1 min-w-[80px] text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-2 border border-[#C9A84C]/40 data-[state=active]:border-[#C9A84C]"
          >
            Đã gửi ({sentRequests.length})
          </TabsTrigger>
          <TabsTrigger 
            value="suggestions"
            className="flex-1 min-w-[80px] text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-2 border border-[#C9A84C]/40 data-[state=active]:border-[#C9A84C]"
          >
            Gợi ý
          </TabsTrigger>
        </TabsList>

        {/* Friends Tab */}
        <TabsContent value="friends" className="mt-0">
          <div className="touch-pan-y md:max-h-[60vh] md:overflow-y-auto md:overscroll-contain">
            {friends.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có bạn bè</p>
            ) : (
              <div className="divide-y divide-border/50">
                {friends.map((friend) => (
                  <FriendItem 
                    key={friend.id} 
                    friend={friend}
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9">
                            <MoreHorizontal className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/profile/${friend.id}`)}>
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Nhắn tin
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleUnfriend(friend.friendship_id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="w-4 h-4 mr-2" />
                            Hủy kết bạn
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Pending Requests Tab */}
        <TabsContent value="requests" className="mt-0">
          <div className="touch-pan-y md:max-h-[60vh] md:overflow-y-auto md:overscroll-contain">
            {pendingRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có lời mời nào</p>
            ) : (
              <div className="divide-y divide-border/50">
                {pendingRequests.map((request) => (
                  <FriendItem 
                    key={request.id} 
                    friend={request}
                    actions={
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(request.friendship_id)}
                          className="h-8 px-3"
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleReject(request.friendship_id)}
                          className="h-8 px-3"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Sent Requests Tab */}
        <TabsContent value="sent" className="mt-0">
          <div className="touch-pan-y md:max-h-[60vh] md:overflow-y-auto md:overscroll-contain">
            {sentRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có lời mời đã gửi</p>
            ) : (
              <div className="divide-y divide-border/50">
                {sentRequests.map((request) => (
                  <FriendItem 
                    key={request.id} 
                    friend={request}
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCancelRequest(request.friendship_id)}
                        className="h-8 px-3"
                      >
                        Hủy
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-0">
          <div className="touch-pan-y md:max-h-[60vh] md:overflow-y-auto md:overscroll-contain">
            {suggestions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có gợi ý</p>
            ) : (
              <div className="divide-y divide-border/50">
                {suggestions.map((suggestion) => (
                  <FriendItem 
                    key={suggestion.id} 
                    friend={suggestion}
                    actions={
                      <Button
                        size="sm"
                        onClick={() => handleSendRequest(suggestion.id)}
                        className="h-8 px-3"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Kết bạn</span>
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
