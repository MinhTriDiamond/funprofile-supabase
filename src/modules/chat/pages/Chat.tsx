import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useConversations } from '../hooks/useConversations';
import { useGroupConversations } from '../hooks/useGroupConversations';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { NewConversationDialog } from '../components/NewConversationDialog';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { ChatSettingsDialog } from '../components/ChatSettingsDialog';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { useIsMobile, useIsMobileOrTablet } from '@/hooks/use-mobile';
import { ArrowLeft, MessageSquarePlus, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const isMobileOrTablet = useIsMobileOrTablet();
  const { userId, isLoading: authLoading } = useCurrentUser();
  const [username, setUsername] = useState<string | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!authLoading && !userId) { navigate('/auth'); return; }
    if (!userId) return;
    const fetchUsername = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();
      setUsername(profile?.username || null);
    };
    fetchUsername();
  }, [userId, authLoading, navigate]);

  const { conversations, isLoading, createDirectConversation } = useConversations(userId);
  const { createGroupConversation } = useGroupConversations(userId);
  const queryClient = useQueryClient();

  useChatNotifications(userId, conversationId || null);

  const handleSelectConversation = (id: string) => navigate(`/chat/${id}`);
  const handleBack = () => navigate('/chat');

  const handleNewConversation = async (otherUserId: string) => {
    const result = await createDirectConversation.mutateAsync(otherUserId);
    if (result) navigate(`/chat/${result.id}`);
    setShowNewConversation(false);
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const result = await createGroupConversation.mutateAsync({ name, memberIds });
    if (result) navigate(`/chat/${result.id}`);
    setShowCreateGroup(false);
  };

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (conversationId) await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  }, [queryClient, conversationId]);

  const headerButtons = (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="rounded-full">
        <Settings className="h-5 w-5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowNewConversation(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" /> Tin nhắn mới
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowCreateGroup(true)}>
            <Users className="h-4 w-4 mr-2" /> Tạo nhóm
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const dialogs = (
    <>
      <NewConversationDialog open={showNewConversation} onOpenChange={setShowNewConversation} currentUserId={userId} onSelectUser={handleNewConversation} />
      <CreateGroupDialog open={showCreateGroup} onOpenChange={setShowCreateGroup} currentUserId={userId} onCreateGroup={handleCreateGroup} isCreating={createGroupConversation.isPending} />
      <ChatSettingsDialog open={showSettings} onOpenChange={setShowSettings} userId={userId} />
    </>
  );

  if (isMobileOrTablet) {
    return (
      <div className="h-dvh flex flex-col bg-background/80">
        {!conversationId && <FacebookNavbar />}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background/90">
          {conversationId ? (
            <MessageThread conversationId={conversationId} userId={userId} username={username} onBack={handleBack} />
          ) : (
            <PullToRefreshContainer onRefresh={handlePullRefresh} className="h-full">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h1 className="text-xl font-bold">Tin nhắn</h1>
                  {headerButtons}
                </div>
                <ConversationList conversations={conversations} selectedId={null} currentUserId={userId} onSelect={handleSelectConversation} isLoading={isLoading} />
              </div>
            </PullToRefreshContainer>
          )}
        </main>
        {!conversationId && <MobileBottomNav />}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main className="app-main flex overflow-hidden">
        <div className="w-80 border-r bg-card/80 flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b">
            <h1 className="text-xl font-bold">Tin nhắn</h1>
            {headerButtons}
          </div>
          <ConversationList conversations={conversations} selectedId={conversationId || null} currentUserId={userId} onSelect={handleSelectConversation} isLoading={isLoading} />
        </div>
        <div className="flex-1 flex flex-col h-full">
          {conversationId ? (
            <MessageThread conversationId={conversationId} userId={userId} username={username} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquarePlus className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Chọn cuộc trò chuyện để bắt đầu</p>
              </div>
            </div>
          )}
        </div>
      </main>
      {dialogs}
    </div>
  );
}
