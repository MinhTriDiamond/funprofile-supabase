// Keep new chat attachments paused until member-authorized reads are available.
export const CHAT_MEDIA_UPLOADS_ENABLED = false;
export const CHAT_MEDIA_PAUSED_MESSAGE = 'Gửi tệp đang tạm dừng để nâng cấp bảo vệ quyền riêng tư.';

export function getChatMediaUploadDenial(key: string): { status: number; code: string; message: string } | null {
  return key.startsWith('chat-media/') && !CHAT_MEDIA_UPLOADS_ENABLED
    ? { status: 503, code: 'CHAT_ATTACHMENTS_PAUSED', message: CHAT_MEDIA_PAUSED_MESSAGE }
    : null;
}
