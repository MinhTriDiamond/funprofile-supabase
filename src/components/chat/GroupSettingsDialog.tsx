import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  UserMinus, 
  UserPlus, 
  LogOut, 
  Crown, 
  Loader2,
  ImagePlus,
} from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/hooks/useConversations';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface GroupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  currentUserId: string | null;
  onUpdate: () => void;
  onLeave: () => void;
}

export function GroupSettingsDialog({
  open,
  onOpenChange,
  conversation,
  currentUserId,
  onUpdate,
  onLeave,
}: GroupSettingsDialogProps) {
  const [groupName, setGroupName] = useState(conversation.name || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const participants = conversation.participants?.filter((p) => !p.left_at) || [];
  const currentParticipant = participants.find((p) => p.user_id === currentUserId);
  const isAdmin = currentParticipant?.role === 'admin';

  const handleUpdateName = async () => {
    if (!groupName.trim() || groupName === conversation.name) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ name: groupName.trim() })
        .eq('id', conversation.id);

      if (error) throw error;
      toast.success('Đã cập nhật tên nhóm');
      onUpdate();
    } catch (error) {
      console.error('Error updating group name:', error);
      toast.error('Không thể cập nhật tên nhóm');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('user_id', userId);

      if (error) throw error;
      toast.success('Đã xóa thành viên');
      onUpdate();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Không thể xóa thành viên');
    }
  };

  const handleLeaveGroup = async () => {
    setIsLeaving(true);
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('user_id', currentUserId);

      if (error) throw error;
      toast.success('Đã rời nhóm');
      onLeave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Không thể rời nhóm');
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Cài đặt nhóm
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={conversation.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {(conversation.name || 'G')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <button className="absolute bottom-0 right-0 p-1 bg-primary rounded-full text-primary-foreground hover:bg-primary/90">
                  <ImagePlus className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Group name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tên nhóm</label>
            <div className="flex gap-2">
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                disabled={!isAdmin}
              />
              {isAdmin && (
                <Button
                  onClick={handleUpdateName}
                  disabled={isUpdating || !groupName.trim() || groupName === conversation.name}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Thành viên ({participants.length})</span>
              {isAdmin && (
                <Button variant="ghost" size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Thêm
                </Button>
              )}
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {participants.map((participant) => {
                  const profile = participant.profile;
                  const isCurrentUser = participant.user_id === currentUserId;
                  const isMemberAdmin = participant.role === 'admin';

                  return (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {(profile?.username || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {profile?.full_name || profile?.username || 'Người dùng'}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">Bạn</Badge>
                          )}
                          {isMemberAdmin && (
                            <Crown className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          @{profile?.username}
                        </p>
                      </div>

                      {isAdmin && !isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(participant.user_id)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Leave group */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <LogOut className="h-4 w-4 mr-2" />
                Rời nhóm
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rời khỏi nhóm?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bạn sẽ không thể xem tin nhắn mới trong nhóm này sau khi rời đi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeaveGroup} disabled={isLeaving}>
                  {isLeaving ? 'Đang rời...' : 'Rời nhóm'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
