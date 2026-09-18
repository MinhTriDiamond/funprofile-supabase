import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, UserCheck, Clock, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { usePplpEvaluate } from "@/hooks/usePplpEvaluate";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FriendRequestButtonProps {
  userId: string;
  currentUserId: string;
}

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "accepted";

export const FriendRequestButton = ({ userId, currentUserId }: FriendRequestButtonProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { evaluateAsync } = usePplpEvaluate();
  const [status, setStatus] = useState<FriendshipStatus>("none");
  const [loading, setLoading] = useState(false);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  // Only check friendship status when both IDs are valid
  useEffect(() => {
    if (!currentUserId || !userId || currentUserId === userId) return;
    checkFriendshipStatus();
  }, [userId, currentUserId]);

  const checkFriendshipStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select("id, user_id, friend_id, status")
        .or(`and(user_id.eq.${currentUserId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUserId})`)
        .maybeSingle();

      if (error) return;

      if (!data) {
        setStatus("none");
        setFriendshipId(null);
      } else {
        setFriendshipId(data.id);
        if (data.status === "accepted") {
          setStatus("accepted");
        } else if (data.user_id === currentUserId) {
          setStatus("pending_sent");
        } else {
          setStatus("pending_received");
        }
      }
    } catch {
      // Silent fail
    }
  };

  const sendFriendRequest = async () => {
    if (!currentUserId) {
      toast.error('Vui lòng đăng nhập để kết bạn', {
        action: { label: 'Đăng nhập', onClick: () => navigate('/auth') }
      });
      return;
    }
    
    // Optimistic update
    setStatus("pending_sent");
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("friendships")
        .insert({ user_id: currentUserId, friend_id: userId, status: "pending" })
        .select("id")
        .single();

      if (error) {
        // Rollback
        setStatus("none");
        toast.error("Failed to send friend request");
      } else {
        setFriendshipId(data.id);
        toast.success(t('requestSent') + '!');
        evaluateAsync({ action_type: 'friend', reference_id: userId });
      }
    } catch {
      setStatus("none");
      toast.error("Failed to send friend request");
    }
    setLoading(false);
  };

  const acceptFriendRequest = async () => {
    if (!friendshipId) return;
    
    // Optimistic update
    setStatus("accepted");
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);

      if (error) {
        // Rollback
        setStatus("pending_received");
        toast.error("Failed to accept friend request");
      } else {
        toast.success(t('acceptRequest') + '!');
        // Không thưởng cho người accept — chỉ người chủ động gửi lời mời mới được nhận quà.
      }
    } catch {
      setStatus("pending_received");
      toast.error("Failed to accept friend request");
    }
    setLoading(false);
  };

  const removeFriend = async () => {
    if (!friendshipId) return;
    
    // Save previous state for rollback
    const prevStatus = status;
    const prevFriendshipId = friendshipId;
    
    // Optimistic update
    setStatus("none");
    setFriendshipId(null);
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", prevFriendshipId);

      if (error) {
        // Rollback
        setStatus(prevStatus);
        setFriendshipId(prevFriendshipId);
        toast.error("Failed to remove friend");
      } else {
        toast.success(t('unfriend'));
      }
    } catch {
      setStatus(prevStatus);
      setFriendshipId(prevFriendshipId);
      toast.error("Failed to remove friend");
    }
    setLoading(false);
  };

  if (status === "none") {
    return (
      <Button onClick={sendFriendRequest} disabled={loading} size="sm" variant="secondary">
        <UserPlus className="w-4 h-4 mr-2 text-gold" />
        {t('addFriendBtn')}
      </Button>
    );
  }

  if (status === "pending_sent") {
    return (
      <Button onClick={removeFriend} disabled={loading} variant="outline" size="sm">
        <Clock className="w-4 h-4 mr-2 text-gold" />
        {t('requestSent')}
      </Button>
    );
  }

  if (status === "pending_received") {
    return (
      <div className="flex gap-2">
        <Button onClick={acceptFriendRequest} disabled={loading} size="sm">
          <UserCheck className="w-4 h-4 mr-2" />
          {t('acceptRequest')}
        </Button>
        <Button onClick={removeFriend} disabled={loading} variant="outline" size="sm">
          {t('declineRequest')}
        </Button>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" disabled={loading}>
            <UserCheck className="w-4 h-4 mr-2 text-gold" />
            {t('friendStatus')}
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={removeFriend} className="text-destructive">
            <UserMinus className="w-4 h-4 mr-2" />
            {t('unfriend')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return null;
};
