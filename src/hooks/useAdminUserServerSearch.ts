import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServerSearchUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  is_banned: boolean;
  created_at: string | null;
  reward_status: string;
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
 * Tìm kiếm user PHÍA SERVER trên profiles (username, username_normalized,
 * full_name, display_name, các ví) bằng ilike — dùng làm nguồn kết quả chính
 * cho ô tìm kiếm ở trang quản trị người dùng, thay cho việc chờ tải toàn bộ
 * danh sách về client rồi mới lọc.
 * Có debounce 300ms để không bắn truy vấn theo từng phím gõ.
 */
export function useAdminUserServerSearch(query: string, enabled: boolean = true) {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const q = debouncedQuery;
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
          "id, username, username_normalized, full_name, display_name, avatar_url, wallet_address, public_wallet_address, btc_address, is_banned, created_at, reward_status, pending_reward, approved_reward"
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
        created_at: p.created_at ?? null,
        reward_status: p.reward_status ?? "pending",
        pending_reward: Number(p.pending_reward) || 0,
        approved_reward: Number(p.approved_reward) || 0,
        email: null,
      }));
    },
  });
}
