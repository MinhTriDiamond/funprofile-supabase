export type AgoraCallTokenFacts = { authenticated: boolean; isActiveMember: boolean; callStatus: string; blocked: boolean };
export type AgoraCallTokenDecision = { allowed: boolean; status: number; code: string; message: string };

export function evaluateAgoraCallTokenAccess(facts: AgoraCallTokenFacts): AgoraCallTokenDecision {
  if (!facts.authenticated) return { allowed: false, status: 401, code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập để tham gia cuộc gọi.' };
  if (!facts.isActiveMember) return { allowed: false, status: 403, code: 'CALL_FORBIDDEN', message: 'Bạn không còn là thành viên của cuộc trò chuyện này.' };
  if (facts.blocked) return { allowed: false, status: 403, code: 'CALL_BLOCKED', message: 'Không thể tham gia cuộc gọi này.' };
  if (!['ringing', 'active'].includes(facts.callStatus)) return { allowed: false, status: 409, code: 'CALL_NOT_ACTIVE', message: 'Cuộc gọi này không còn hoạt động.' };
  return { allowed: true, status: 200, code: 'OK', message: 'Được phép tham gia cuộc gọi.' };
}
