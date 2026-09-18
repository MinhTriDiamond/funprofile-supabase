import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Check, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

export interface TaggedFriend {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface FriendTagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  selectedFriends: TaggedFriend[];
  onTagFriends: (friends: TaggedFriend[]) => void;
}

export const FriendTagDialog = ({
  isOpen,
  onClose,
  currentUserId,
  selectedFriends,
  onTagFriends,
}: FriendTagDialogProps) => {
  const [friends, setFriends] = useState<TaggedFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<TaggedFriend[]>(selectedFriends);
  
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch friends list
  useEffect(() => {
    const fetchFriends = async () => {
      if (!currentUserId) return;
      
      setLoading(true);
      try {
        // Get all accepted friendships
        const { data: friendships, error } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'accepted')
          .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

        if (error) throw error;

        // Extract friend IDs (the other user in each friendship)
        const friendIds = friendships?.map(f => 
          f.user_id === currentUserId ? f.friend_id : f.user_id
        ) || [];

        if (friendIds.length === 0) {
          setFriends([]);
          setLoading(false);
          return;
        }

        // Fetch friend profiles
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', friendIds);

        if (profileError) throw profileError;

        setFriends(profiles || []);
      } catch (error) {
        console.error('Error fetching friends:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchFriends();
      setSelected(selectedFriends);
    }
  }, [isOpen, currentUserId, selectedFriends]);

  // Filter friends based on search
  const filteredFriends = useMemo(() => {
    if (!debouncedSearch) return friends;
    
    const query = debouncedSearch.toLowerCase();
    return friends.filter(friend => 
      friend.username?.toLowerCase().includes(query) ||
      friend.full_name?.toLowerCase().includes(query)
    );
  }, [friends, debouncedSearch]);

  const toggleFriend = (friend: TaggedFriend) => {
    setSelected(prev => {
      const isSelected = prev.some(f => f.id === friend.id);
      if (isSelected) {
        return prev.filter(f => f.id !== friend.id);
      }
      return [...prev, friend];
    });
  };

  const isSelected = (friendId: string) => selected.some(f => f.id === friendId);

  const handleConfirm = () => {
    onTagFriends(selected);
    onClose();
  };

  const removeSelected = (friendId: string) => {
    setSelected(prev => prev.filter(f => f.id !== friendId));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent className="sm:max-w-[425px] p-0 max-h-[80vh] flex flex-col z-[200]">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-center">Gắn thẻ bạn bè</DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm bạn bè..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Selected Friends Preview */}
        {selected.length > 0 && (
          <div className="px-4 py-2 border-b border-border">
            <p className="text-xs text-muted-foreground mb-2">Đã chọn ({selected.length})</p>
            <div className="flex flex-wrap gap-2">
              {selected.map(friend => (
                <div
                  key={friend.id}
                  className="flex items-center gap-1 bg-primary/10 text-primary rounded-full pl-1 pr-2 py-0.5"
                >
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={friend.avatar_url || ''} />
                    <AvatarFallback className="text-[10px] bg-primary/20">
                      {friend.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium">{friend.full_name || friend.username}</span>
                  <button
                    onClick={() => removeSelected(friend.id)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends List */}
        <ScrollArea className="flex-1 max-h-[300px]">
          <div className="p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {friends.length === 0 ? 'Chưa có bạn bè nào' : 'Không tìm thấy bạn bè'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredFriends.map(friend => (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                      isSelected(friend.id) 
                        ? 'bg-primary/10' 
                        : 'hover:bg-secondary'
                    }`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={friend.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {friend.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{friend.full_name || friend.username}</p>
                      <p className="text-xs text-muted-foreground">@{friend.username}</p>
                    </div>
                    {isSelected(friend.id) && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Confirm Button */}
        <div className="p-4 border-t border-border">
          <Button onClick={handleConfirm} className="w-full">
            Xong {selected.length > 0 && `(${selected.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
