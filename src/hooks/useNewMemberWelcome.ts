import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Module-level dedupe set: tồn tại xuyên suốt vòng đời tab,
// chống hiển thị trùng khi hook remount hoặc realtime reconnect.
const SHOWN_PROFILE_IDS = new Set<string>();
// Bỏ qua các profile đã tồn tại trước khi tab này mở
// (tránh replay event cũ khi reconnect realtime).
const MOUNT_TIMESTAMP = Date.now();

export function useNewMemberWelcome() {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const channel = supabase
      .channel('new-member-welcome')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const profile = payload.new as {
            id?: string;
            username?: string;
            full_name?: string;
            avatar_url?: string;
            created_at?: string;
          };

          if (!profile.id) return;

          // Dedupe: mỗi profile chỉ thông báo 1 lần / tab
          if (SHOWN_PROFILE_IDS.has(profile.id)) return;

          // Bỏ qua profile được tạo trước khi tab này mở
          // (event replay từ realtime reconnect)
          if (profile.created_at) {
            const createdMs = new Date(profile.created_at).getTime();
            if (createdMs < MOUNT_TIMESTAMP - 5000) {
              SHOWN_PROFILE_IDS.add(profile.id);
              return;
            }
          }

          SHOWN_PROFILE_IDS.add(profile.id);

          const name = profile.full_name || profile.username || 'Thành viên mới';
          toast(`🎉 ${name} đã tham gia Fun.Rich!`, {
            id: `welcome-${profile.id}`, // sonner cũng dedupe theo id
            description: 'Chào mừng thành viên mới!',
            duration: 8000,
            position: 'bottom-right',
          });
        }
      )
      .subscribe();

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, []);
}
