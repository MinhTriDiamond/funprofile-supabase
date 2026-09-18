import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Ban, AlertTriangle, UserCheck, Settings } from 'lucide-react';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  is_restricted: boolean;
  reward_status?: string;
  admin_notes?: string | null;
  created_at?: string;
}

interface UserListItemProps {
  user: UserProfile;
  viewMode: 'all' | 'active' | 'banned' | 'restricted';
  onBan: (user: UserProfile, ban: boolean) => void;
  onRestrict: (user: UserProfile, restrict: boolean) => void;
}

export const UserListItem = memo(({ user, viewMode, onBan, onRestrict }: UserListItemProps) => {
  const getUserStatusBadge = () => {
    if (user.is_banned) return <Badge className="bg-red-500 text-white">Đã cấm</Badge>;
    if (user.is_restricted) return <Badge className="bg-yellow-500 text-white">Hạn chế</Badge>;
    return <Badge className="bg-green-500 text-white">Hoạt động</Badge>;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-background border rounded-lg hover:shadow-sm transition-shadow">
      <Avatar className="w-10 h-10">
        <AvatarImage src={user.avatar_url || ""} />
        <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{user.username}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{user.id}</p>
      </div>
      <div className="flex items-center gap-2">
        {getUserStatusBadge()}
        
        {/* Contextual Actions based on view mode */}
        {viewMode === "active" && (
          <>
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => onBan(user, true)}
            >
              <Ban className="w-3 h-3 mr-1" />
              Cấm
            </Button>
            <Button 
              size="sm" 
              className="bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 text-white rounded-full border-2 border-white/30 shadow-[0_0_15px_rgba(234,179,8,0.5)] hover:shadow-[0_0_25px_rgba(234,179,8,0.7)] hover:scale-105"
              onClick={() => onRestrict(user, true)}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Hạn chế
            </Button>
          </>
        )}
        
        {viewMode === "restricted" && (
          <>
            <Button 
              size="sm" 
              variant="default"
              onClick={() => onRestrict(user, false)}
            >
              <UserCheck className="w-3 h-3 mr-1" />
              Bỏ hạn chế
            </Button>
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => onBan(user, true)}
            >
              <Ban className="w-3 h-3 mr-1" />
              Cấm
            </Button>
          </>
        )}
        
        {viewMode === "banned" && (
          <>
            <Button 
              size="sm" 
              variant="default"
              onClick={() => onBan(user, false)}
            >
              <UserCheck className="w-3 h-3 mr-1" />
              Bỏ cấm
            </Button>
            <Button 
              size="sm" 
              className="bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 text-white rounded-full border-2 border-white/30 shadow-[0_0_15px_rgba(234,179,8,0.5)] hover:shadow-[0_0_25px_rgba(234,179,8,0.7)] hover:scale-105"
              onClick={async () => {
                await onBan(user, false);
                await onRestrict(user, true);
              }}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Chuyển hạn chế
            </Button>
          </>
        )}

        {viewMode === "all" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Settings className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!user.is_banned && (
                <DropdownMenuItem 
                  onClick={() => onBan(user, true)}
                  className="text-red-600"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Cấm user
                </DropdownMenuItem>
              )}
              {user.is_banned && (
                <DropdownMenuItem 
                  onClick={() => onBan(user, false)}
                  className="text-green-600"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Bỏ cấm
                </DropdownMenuItem>
              )}
              {!user.is_restricted && !user.is_banned && (
                <DropdownMenuItem 
                  onClick={() => onRestrict(user, true)}
                  className="text-yellow-600"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Hạn chế user
                </DropdownMenuItem>
              )}
              {user.is_restricted && (
                <DropdownMenuItem 
                  onClick={() => onRestrict(user, false)}
                  className="text-green-600"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Bỏ hạn chế
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

UserListItem.displayName = 'UserListItem';
