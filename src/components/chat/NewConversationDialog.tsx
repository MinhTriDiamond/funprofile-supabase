import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  onSelectUser: (userId: string) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  currentUserId,
  onSelectUser,
}: NewConversationDialogProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Fetch friends first
  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends-for-chat', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];

      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendIds = friendships?.map((f) =>
        f.user_id === currentUserId ? f.friend_id : f.user_id
      ) || [];

      if (friendIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', friendIds);

      return profiles || [];
    },
    enabled: open && !!currentUserId,
  });

  // Search all users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users-chat', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', currentUserId)
        .or(`username_normalized.ilike.%${debouncedSearch.toLowerCase()}%,full_name.ilike.%${debouncedSearch}%`)
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const displayUsers = useMemo(() => {
    if (debouncedSearch.length >= 2) {
      return searchResults || [];
    }
    return friends || [];
  }, [debouncedSearch, friends, searchResults]);

  const isLoading = friendsLoading || (debouncedSearch.length >= 2 && searchLoading);

  const handleSelect = (userId: string) => {
    onSelectUser(userId);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cuộc trò chuyện mới</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm người dùng..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {debouncedSearch.length >= 2
                ? 'Không tìm thấy người dùng'
                : 'Bạn chưa có bạn bè nào'}
            </div>
          ) : (
            <div className="space-y-1">
              {!debouncedSearch && friends && friends.length > 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">Bạn bè</p>
              )}
              {displayUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
                    <AvatarFallback>
                      {user.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user.full_name || user.username}</p>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
