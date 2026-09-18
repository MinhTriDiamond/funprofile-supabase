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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, Clock, XCircle, Settings, Plus, Minus, RotateCcw, Info } from 'lucide-react';

export interface UserWithReward {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  is_restricted: boolean;
  claimable: number;
  status: 'pending' | 'approved' | 'on_hold' | 'rejected';
  admin_notes?: string | null;
  created_at?: string;
}

interface RewardListItemProps {
  user: UserWithReward;
  onApprove: (user: UserWithReward) => void;
  onHold: (user: UserWithReward) => void;
  onReject: (user: UserWithReward) => void;
  onAdjust: (user: UserWithReward, type: 'add' | 'deduct' | 'refund') => void;
}

const formatNumber = (num: number) => num.toLocaleString('vi-VN');

export const RewardListItem = memo(({ user, onApprove, onHold, onReject, onAdjust }: RewardListItemProps) => {
  const getStatusBadge = () => {
    switch (user.status) {
      case 'approved':
        return <Badge className="bg-green-500">Đã duyệt</Badge>;
      case 'on_hold':
        return <Badge className="bg-yellow-500">Đang treo</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500">Từ chối</Badge>;
      default:
        return <Badge variant="outline">Chờ duyệt</Badge>;
    }
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
      <div className="text-right mr-2">
        <p className="font-bold text-primary">{formatNumber(user.claimable)}</p>
        <p className="text-xs text-muted-foreground">CAMLY</p>
      </div>
      <div className="flex items-center gap-1.5">
        {getStatusBadge()}
        
        {/* Show admin notes tooltip if exists */}
        {user.admin_notes && (user.status === 'on_hold' || user.status === 'rejected') && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm">{user.admin_notes}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Action Buttons */}
        <Button 
          size="sm" 
          variant="default"
          className="h-8"
          onClick={() => onApprove(user)}
          disabled={user.status === 'approved'}
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Duyệt
        </Button>
        <Button 
          size="sm" 
          className="bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 text-white rounded-full border-2 border-white/30 shadow-[0_0_15px_rgba(234,179,8,0.5)] hover:shadow-[0_0_25px_rgba(234,179,8,0.7)] hover:scale-105 h-8"
          onClick={() => onHold(user)}
          disabled={user.status === 'on_hold'}
        >
          <Clock className="w-3 h-3 mr-1" />
          Treo
        </Button>
        <Button 
          size="sm" 
          variant="destructive"
          className="h-8"
          onClick={() => onReject(user)}
          disabled={user.status === 'rejected'}
        >
          <XCircle className="w-3 h-3 mr-1" />
          Từ chối
        </Button>
        
        {/* Adjust Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <Settings className="w-3 h-3 mr-1" />
              Điều chỉnh
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAdjust(user, 'add')} className="text-green-600">
              <Plus className="w-4 h-4 mr-2" />
              Thêm thưởng
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdjust(user, 'deduct')} className="text-red-600">
              <Minus className="w-4 h-4 mr-2" />
              Trừ thưởng
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdjust(user, 'refund')} className="text-blue-600">
              <RotateCcw className="w-4 h-4 mr-2" />
              Hoàn tiền
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

RewardListItem.displayName = 'RewardListItem';
