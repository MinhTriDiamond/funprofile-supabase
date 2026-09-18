import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, X, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  isCreating?: boolean;
}

interface User {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreateGroup,
  isCreating = false,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  // Fetch friends
  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends-for-group', currentUserId],
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

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users-group', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', currentUserId)
        .or(`username.ilike.%${debouncedSearch}%,full_name.ilike.%${debouncedSearch}%`)
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const displayUsers = useMemo(() => {
    const users = debouncedSearch.length >= 2 ? searchResults || [] : friends || [];
    return users.filter((u) => !selectedUsers.some((s) => s.id === u.id));
  }, [debouncedSearch, friends, searchResults, selectedUsers]);

  const isLoading = friendsLoading || searchLoading;

  const handleSelectUser = (user: User) => {
    setSelectedUsers((prev) => [...prev, user]);
    setSearch('');
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = () => {
    if (groupName.trim() && selectedUsers.length >= 1) {
      onCreateGroup(groupName.trim(), selectedUsers.map((u) => u.id));
      // Reset state
      setGroupName('');
      setSelectedUsers([]);
      setSearch('');
    }
  };

  const canCreate = groupName.trim().length > 0 && selectedUsers.length >= 1 && !isCreating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Tạo nhóm mới
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group name */}
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Tên nhóm..."
          />

          {/* Selected members */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {user.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{user.full_name || user.username}</span>
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Thêm thành viên..."
              className="pl-9"
            />
          </div>

          {/* User list */}
          <ScrollArea className="h-[200px]">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : displayUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {debouncedSearch.length >= 2
                  ? 'Không tìm thấy người dùng'
                  : 'Chọn bạn bè để thêm vào nhóm'}
              </div>
            ) : (
              <div className="space-y-1">
                {displayUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
                      <AvatarFallback>
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.full_name || user.username}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang tạo...
              </>
            ) : (
              'Tạo nhóm'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
