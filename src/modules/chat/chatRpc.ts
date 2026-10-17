import { supabase } from '@/integrations/supabase/client';

// Keep RPC signatures local: generated Supabase types are managed externally.
const rpc = supabase.rpc.bind(supabase) as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) {
    const safeMessage = error.code === '23505'
      ? 'Đã có cuộc gọi đang hoạt động hoặc yêu cầu bị trùng.'
      : error.code === '42501'
        ? 'Bạn không có quyền thực hiện thao tác này hoặc không thể kết nối với người dùng.'
        : error.code === '22023'
          ? 'Thông tin yêu cầu không hợp lệ.'
          : 'Không thể hoàn tất thao tác lúc này. Vui lòng thử lại.';
    throw new Error(safeMessage);
  }
  return data as T;
}

export const chatRpc = {
  createDirectConversation: (otherUserId: string) => call<string>('create_direct_conversation', { p_other_user_id: otherUserId }),
  createGroupConversation: (name: string, memberIds: string[]) => call<string>('create_group_conversation', { p_name: name, p_member_ids: memberIds }),
  manageConversationMember: (conversationId: string, userId: string, action: 'add' | 'remove') => call<boolean>('manage_conversation_member', { p_conversation_id: conversationId, p_user_id: userId, p_action: action }),
  leaveConversation: (conversationId: string) => call<boolean>('leave_conversation', { p_conversation_id: conversationId }),
  getMyBlockRelationships: () => call<Array<{ blocker_id: string; blocked_id: string; created_at: string }>>('get_my_block_relationships'),
  startCallSession: (conversationId: string, callType: 'voice' | 'video') => call<Record<string, unknown>>('start_call_session', { p_conversation_id: conversationId, p_call_type: callType }),
  acceptCallSession: (callSessionId: string) => call<boolean>('accept_call_session', { p_call_session_id: callSessionId }),
  declineCallSession: (callSessionId: string) => call<boolean>('decline_call_session', { p_call_session_id: callSessionId }),
  endCallSession: (callSessionId: string, durationSeconds: number) => call<boolean>('end_call_session', { p_call_session_id: callSessionId, p_duration_seconds: durationSeconds }),
  markCallMissed: (callSessionId: string) => call<boolean>('mark_call_missed', { p_call_session_id: callSessionId }),
  updateCallParticipant: (callSessionId: string, isMuted: boolean, isVideoOff: boolean) => call<boolean>('update_call_participant', { p_call_session_id: callSessionId, p_is_muted: isMuted, p_is_video_off: isVideoOff }),
};
