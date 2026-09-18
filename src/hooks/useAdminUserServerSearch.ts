import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServerSearchUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  is_banned: boolean;
  pending_reward: number;
  approved_reward: number;
  posts_count?: number;
  email?: string | null;
  username_normalized?: string | null;
}

const normalizeVi = (s: string): string =>
  s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

// Escape ký tự nguy hiểm cho PostgREST .or() filter
const escapeForOr = (s: string): string =>
  s.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Fallback search server-side khi local cache không tìm thấy user.
 * Tìm trên profiles theo username, username_normalized, full_name, email, các ví.
 */
export function useAdminUserServerSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery<ServerSearchUser[]>({
    queryKey: ["admin-user-server-search", q],
    enabled: enabled && q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const safe = escapeForOr(q);
      if (!safe) return [];
      const safeNorm = escapeForOr(normalizeVi(q));
      // LƯU Ý: KHÔNG query cột `email` — quyền SELECT cột này đã bị thu hồi
      // với role `authenticated`; đưa vào select/filter sẽ khiến truy vấn lỗi.
      const filters = [
        `username.ilike.%${safe}%`,
        `username_normalized.ilike.%${safeNorm}%`,
        `full_name.ilike.%${safe}%`,
        `display_name.ilike.%${safe}%`,
        `wallet_address.ilike.%${safe}%`,
        `public_wallet_address.ilike.%${safe}%`,
        `btc_address.ilike.%${safe}%`,
      ].join(",");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, username_normalized, full_name, display_name, avatar_url, wallet_address, public_wallet_address, btc_address, is_banned"
        )
        .or(filters)
        .limit(50);

      // Không nuốt lỗi: để UI hiện lỗi thật thay vì "không tìm thấy"
      if (error) throw error;

      return (data ?? []).map((p: any) => ({
        id: p.id,
        username: p.username ?? "",
        username_normalized: p.username_normalized ?? null,
        full_name: p.full_name ?? p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
        wallet_address: p.wallet_address ?? p.public_wallet_address ?? p.btc_address ?? null,
        is_banned: !!p.is_banned,
        pending_reward: 0,
        approved_reward: 0,
        email: null,
      }));
    },
  });
}
