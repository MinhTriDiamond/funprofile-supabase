import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminUserServerSearch, type ServerSearchUser } from './useAdminUserServerSearch';

export interface UserDirectoryEntry {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  created_at: string | null;
  is_banned: boolean;
  email?: string | null;
  // Activity
  posts_count: number;
  comments_count: number;
  reactions_on_posts: number;
  friends_count: number;
  shares_count: number;
  livestreams_count: number;
  // Light Score
  total_light_score: number;
  tier: number;
  total_minted: number;
  // CAMLY rewards
  camly_calculated: number;
  camly_today: number;
  pending_reward: number;
  approved_reward: number;
  reward_status: string;
  camly_claimed: number;
  // USDT
  usdt_received: number;
  // Donations
  internal_sent: number;
  internal_received: number;
  web3_sent: number;
  web3_received: number;
}

export interface UserDirectoryStats {
  totalUsers: number;
  totalCamlyCalculated: number;
  totalCamlyClaimed: number;
  totalLightScore: number;
  totalPending: number;
  totalApproved: number;
  totalMinted: number;
  totalPosts: number;
  totalComments: number;
  totalInternalSent: number;
  totalInternalReceived: number;
  totalWeb3Sent: number;
  totalWeb3Received: number;
  totalWithdrawn: number;
}

export interface UserDirectoryFilters {
  scoreRange: 'all' | 'high' | 'medium' | 'low';
  funMoney: 'all' | 'has' | 'none';
  withdrawn: 'all' | 'yes' | 'no';
  status: 'all' | 'active' | 'suspended' | 'banned';
  wallet: 'all' | 'has' | 'none';
}

const TIER_NAMES: Record<number, string> = {
  0: 'New Soul',
  1: 'Light Seeker',
  2: 'Light Bearer',
  3: 'Light Guardian',
  4: 'Light Master',
};

export const getTierName = (tier: number) => TIER_NAMES[tier] || `Tier ${tier}`;

/**
 * Dựng một UserDirectoryEntry từ kết quả tìm phía server (bảng profiles).
 * Dùng cho user chưa có trong danh sách directory đã tải (directory vẫn đang
 * tải nền hoặc chưa tải tới) để kết quả tìm hiện thành hàng ngay.
 * Các số liệu nặng (bài viết, Light Score, CAMLY, tặng quà) chưa nạp ở đây —
 * khi directory tải xong, entry đầy đủ theo id sẽ tự thay thế (xem filtered).
 */
const entryFromServerResult = (u: ServerSearchUser, email?: string | null): UserDirectoryEntry => ({
  id: u.id,
  username: u.username || 'unknown',
  full_name: u.full_name,
  avatar_url: u.avatar_url,
  wallet_address: u.wallet_address,
  created_at: u.created_at,
  is_banned: u.is_banned,
  email: email ?? u.email ?? null,
  posts_count: 0,
  comments_count: 0,
  reactions_on_posts: 0,
  friends_count: 0,
  shares_count: 0,
  livestreams_count: 0,
  total_light_score: 0,
  tier: 0,
  total_minted: 0,
  camly_calculated: 0,
  camly_today: 0,
  pending_reward: u.pending_reward || 0,
  approved_reward: u.approved_reward || 0,
  reward_status: u.reward_status || 'pending',
  camly_claimed: 0,
  usdt_received: 0,
  internal_sent: 0,
  internal_received: 0,
  web3_sent: 0,
  web3_received: 0,
});

const RPC_PAGE_SIZE = 1000;

/**
 * QUAN TRỌNG: Data API chỉ trả tối đa 1.000 dòng mỗi request.
 * Hệ thống đã có >1.700 profile ⇒ phải phân trang, nếu không danh sách
 * thành viên bị cắt và tìm kiếm client-side sẽ "không tìm thấy" user
 * xếp sau hạng 1.000.
 */
const fetchUserDirectory = async (isAdmin: boolean): Promise<UserDirectoryEntry[]> => {
  /**
   * Bảo mật: bản công khai `get_user_directory_summary` chỉ trả 23 cột đã hoàn tất
   * (không email, không pending/approved/reward_status/camly_today).
   * Admin dùng `get_user_directory_admin` để có đủ 28 cột.
   */
  const rpcName = isAdmin ? 'get_user_directory_admin' : 'get_user_directory_summary';
  const rows: any[] = [];
  for (let from = 0; ; from += RPC_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc(rpcName as 'get_user_directory_summary')
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data as any[]) || [];
    rows.push(...page);
    if (page.length < RPC_PAGE_SIZE) break;
  }


  return rows.map((r: any) => ({
    id: r.id,
    username: r.username || 'unknown',
    full_name: r.full_name || null,
    avatar_url: r.avatar_url,
    wallet_address: r.wallet_address || null,
    created_at: r.created_at || null,
    is_banned: r.is_banned || false,
    posts_count: Number(r.posts_count) || 0,
    comments_count: Number(r.comments_count) || 0,
    reactions_on_posts: Number(r.reactions_on_posts) || 0,
    friends_count: Number(r.friends_count) || 0,
    shares_count: Number(r.shares_count) || 0,
    livestreams_count: Number(r.livestreams_count) || 0,
    total_light_score: Number(r.total_light_score) || 0,
    tier: Number(r.tier) || 0,
    total_minted: Number(r.total_minted) || 0,
    camly_calculated: Number(r.camly_calculated) || 0,
    camly_today: Number(r.camly_today) || 0,
    pending_reward: Number(r.pending_reward) || 0,
    approved_reward: Number(r.approved_reward) || 0,
    reward_status: r.reward_status || 'pending',
    camly_claimed: Number(r.camly_claimed) || 0,
    usdt_received: Number(r.usdt_received) || 0,
    internal_sent: Number(r.internal_sent) || 0,
    internal_received: Number(r.internal_received) || 0,
    web3_sent: Number(r.web3_sent) || 0,
    web3_received: Number(r.web3_received) || 0,
  }));
};

const fetchTotals = async (): Promise<UserDirectoryStats> => {
  const { data, error } = await supabase.rpc('get_user_directory_totals');
  if (error) throw error;

  /* RPC returns a single row or array — normalize */
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null ?? {};
  return {
    totalUsers: Number(row?.total_users) || 0,
    totalCamlyCalculated: Number(row?.total_camly_calculated) || 0,
    totalCamlyClaimed: Number(row?.total_camly_claimed) || 0,
    totalLightScore: Number(row?.total_light_score) || 0,
    totalPending: Number(row?.total_pending) || 0,
    totalApproved: Number(row?.total_approved) || 0,
    totalMinted: Number(row?.total_minted) || 0,
    totalPosts: Number(row?.total_posts) || 0,
    totalComments: Number(row?.total_comments) || 0,
    totalInternalSent: Number(row?.total_internal_sent) || 0,
    totalInternalReceived: Number(row?.total_internal_received) || 0,
    totalWeb3Sent: Number(row?.total_web3_sent) || 0,
    totalWeb3Received: Number(row?.total_web3_received) || 0,
    totalWithdrawn: Number(row?.total_withdrawn) || 0,
  };
};

export type SortBy = 'default' | 'username-asc' | 'username-desc' | 'email-asc' | 'email-desc';

export const useUserDirectory = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [filters, setFilters] = useState<UserDirectoryFilters>({
    scoreRange: 'all',
    funMoney: 'all',
    withdrawn: 'all',
    status: 'all',
    wallet: 'all',
  });
  const pageSize = 50;

  // Check admin status
  const { userId } = useCurrentUser();
  const { data: adminData } = useQuery({
    queryKey: ['user-directory-admin-check', userId],
    queryFn: async () => {
      if (!userId) return { isAdmin: false, emails: new Map<string, string>() };
      
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      
      if (!roleData) return { isAdmin: false, emails: new Map<string, string>() };
      
      // Cũng phải phân trang: Data API cắt ở 1.000 dòng
      const emails = new Map<string, string>();
      for (let from = 0; ; from += RPC_PAGE_SIZE) {
        const { data: emailsData } = await supabase
          .rpc('get_user_emails_for_admin', { p_admin_id: userId })
          .range(from, from + RPC_PAGE_SIZE - 1);
        const page = (emailsData as Array<{ user_id: string; email: string }>) || [];
        page.forEach((e) => emails.set(e.user_id, e.email));
        if (page.length < RPC_PAGE_SIZE) break;
      }
      return { isAdmin: true, emails };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });

  const isAdmin = adminData?.isAdmin || false;
  const emailsMap = adminData?.emails || new Map<string, string>();

  // Tìm kiếm PHÍA SERVER: khi ô tìm có từ 2 ký tự, kết quả lấy thẳng từ
  // truy vấn profiles (ilike) thay vì chờ tải toàn bộ directory về rồi lọc.
  const isServerSearchMode = search.trim().length >= 2;
  const { data: serverResults, isFetching: isSearchingServer } = useAdminUserServerSearch(
    search,
    isServerSearchMode,
  );

  // Single RPC call for all user data
  const { data: allUsers, isLoading, error } = useQuery<UserDirectoryEntry[]>({
    queryKey: ['user-directory', isAdmin ? 'admin' : 'public'],
    queryFn: () => fetchUserDirectory(isAdmin),

    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Separate lightweight RPC for totals
  const { data: stats } = useQuery({
    queryKey: ['user-directory-totals'],
    queryFn: fetchTotals,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const clientFiltered = useMemo(() => {
    if (!allUsers) return [];
    let result = allUsers;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(u => {
        const email = emailsMap.get(u.id);
        return u.username.toLowerCase().includes(q) ||
          u.full_name?.toLowerCase().includes(q) ||
          u.wallet_address?.toLowerCase().includes(q) ||
          (isAdmin && email?.toLowerCase().includes(q));
      });
    }

    if (filters.scoreRange === 'high') result = result.filter(u => u.total_light_score >= 1000);
    else if (filters.scoreRange === 'medium') result = result.filter(u => u.total_light_score >= 100 && u.total_light_score < 1000);
    else if (filters.scoreRange === 'low') result = result.filter(u => u.total_light_score < 100);

    if (filters.funMoney === 'has') result = result.filter(u => u.total_minted > 0);
    else if (filters.funMoney === 'none') result = result.filter(u => u.total_minted === 0);

    if (filters.withdrawn === 'yes') result = result.filter(u => u.camly_claimed > 0);
    else if (filters.withdrawn === 'no') result = result.filter(u => u.camly_claimed === 0);

    if (filters.status === 'active') result = result.filter(u => !u.is_banned && u.reward_status !== 'on_hold');
    else if (filters.status === 'suspended') result = result.filter(u => u.reward_status === 'on_hold' && !u.is_banned);
    else if (filters.status === 'banned') result = result.filter(u => u.is_banned);

    if (filters.wallet === 'has') result = result.filter(u => !!u.wallet_address);
    else if (filters.wallet === 'none') result = result.filter(u => !u.wallet_address);

    // Sort - create copy for new reference so React re-renders
    if (sortBy !== 'default') result = [...result];
    if (sortBy === 'username-asc') result.sort((a, b) => a.username.localeCompare(b.username));
    else if (sortBy === 'username-desc') result.sort((a, b) => b.username.localeCompare(a.username));
    else if (sortBy === 'email-asc') result.sort((a, b) => (emailsMap.get(a.id) || '').localeCompare(emailsMap.get(b.id) || ''));
    else if (sortBy === 'email-desc') result.sort((a, b) => (emailsMap.get(b.id) || '').localeCompare(emailsMap.get(a.id) || ''));

    return result;
  }, [allUsers, search, filters, isAdmin, emailsMap, sortBy]);

  /**
   * Kết quả hiển thị cuối cùng.
   * - Ngoài chế độ tìm: dùng kết quả lọc client như trước.
   * - Đang tìm (từ 2 ký tự): dùng kết quả SERVER đã trả về. Mỗi user khớp
   *   được ghép với entry directory đầy đủ theo id nếu đã tải (giữ nguyên
   *   số liệu nặng); user chưa có trong directory thì dựng hàng từ dữ liệu
   *   profiles của kết quả server để hiện ngay, không chờ tải toàn bộ.
   *   Trong lúc truy vấn server chưa trả về lần đầu, tạm giữ kết quả lọc
   *   client làm cầu nối để bảng không trống chớp nhoáng.
   */
  const filtered = useMemo(() => {
    if (!isServerSearchMode) return clientFiltered;
    if (serverResults === undefined) return clientFiltered;

    const byId = new Map((allUsers ?? []).map(u => [u.id, u]));
    const partialIds = new Set<string>();
    let result = serverResults.map(sr => {
      const full = byId.get(sr.id);
      if (full) return isAdmin && emailsMap.size > 0 ? { ...full, email: full.email ?? emailsMap.get(sr.id) ?? null } : full;
      partialIds.add(sr.id);
      return entryFromServerResult(sr, isAdmin ? emailsMap.get(sr.id) ?? null : null);
    });

    // Áp các bộ lọc như chế độ thường. Riêng các lọc theo số liệu nặng
    // (điểm sáng / FUN / đã rút) chỉ áp cho entry đã có số liệu thật —
    // entry tạm (partial) được giữ lại để khỏi loại oan user vừa tìm thấy.
    if (filters.status === 'active') result = result.filter(u => !u.is_banned && u.reward_status !== 'on_hold');
    else if (filters.status === 'suspended') result = result.filter(u => u.reward_status === 'on_hold' && !u.is_banned);
    else if (filters.status === 'banned') result = result.filter(u => u.is_banned);

    if (filters.wallet === 'has') result = result.filter(u => !!u.wallet_address);
    else if (filters.wallet === 'none') result = result.filter(u => !u.wallet_address);

    if (filters.scoreRange !== 'all') {
      result = result.filter(u => {
        if (partialIds.has(u.id)) return true;
        if (filters.scoreRange === 'high') return u.total_light_score >= 1000;
        if (filters.scoreRange === 'medium') return u.total_light_score >= 100 && u.total_light_score < 1000;
        return u.total_light_score < 100;
      });
    }
    if (filters.funMoney !== 'all') {
      result = result.filter(u => partialIds.has(u.id) || (filters.funMoney === 'has' ? u.total_minted > 0 : u.total_minted === 0));
    }
    if (filters.withdrawn !== 'all') {
      result = result.filter(u => partialIds.has(u.id) || (filters.withdrawn === 'yes' ? u.camly_claimed > 0 : u.camly_claimed === 0));
    }

    if (sortBy === 'username-asc') result = [...result].sort((a, b) => a.username.localeCompare(b.username));
    else if (sortBy === 'username-desc') result = [...result].sort((a, b) => b.username.localeCompare(a.username));
    else if (sortBy === 'email-asc') result = [...result].sort((a, b) => (emailsMap.get(a.id) || a.email || '').localeCompare(emailsMap.get(b.id) || b.email || ''));
    else if (sortBy === 'email-desc') result = [...result].sort((a, b) => (emailsMap.get(b.id) || b.email || '').localeCompare(emailsMap.get(a.id) || a.email || ''));

    return result;
  }, [isServerSearchMode, serverResults, clientFiltered, allUsers, filters, sortBy, isAdmin, emailsMap]);

  const paginated = useMemo(() => {
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    if (isAdmin && emailsMap.size > 0) {
      return slice.map(u => ({ ...u, email: emailsMap.get(u.id) || null }));
    }
    return slice;
  }, [filtered, page, isAdmin, emailsMap]);

  const totalPages = Math.ceil(filtered.length / pageSize);

  const defaultStats: UserDirectoryStats = {
    totalUsers: 0, totalCamlyCalculated: 0, totalCamlyClaimed: 0, totalLightScore: 0,
    totalPending: 0, totalApproved: 0, totalMinted: 0, totalPosts: 0, totalComments: 0,
    totalInternalSent: 0, totalInternalReceived: 0, totalWeb3Sent: 0, totalWeb3Received: 0, totalWithdrawn: 0,
  };

  const exportCSV = () => {
    if (!filtered || filtered.length === 0) return;
    const headers = ['STT', 'Username', 'Họ tên', 'Trạng thái', 'Ngày tham gia', 'Wallet', 'Posts', 'Comments', 'Reactions', 'Friends', 'Shares', 'Livestreams', 'Light Score', 'Tier', 'FUN Minted', 'CAMLY Tính Toán', 'CAMLY Đã Thưởng', 'Pending', 'Approved', 'Tặng NB (gửi)', 'Tặng NB (nhận)', 'Tặng Web3 (gửi)', 'Tặng Web3 (nhận)', 'USDT'];
    const rows = filtered.map((u, i) => [
      i + 1, u.username, u.full_name || '', u.is_banned ? 'Cấm' : 'Hoạt động',
      u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '',
      u.wallet_address || '', u.posts_count, u.comments_count,
      u.reactions_on_posts, u.friends_count, u.shares_count, u.livestreams_count,
      u.total_light_score, getTierName(u.tier), u.total_minted,
      u.camly_calculated, u.camly_claimed, u.pending_reward, u.approved_reward,
      u.internal_sent, u.internal_received, u.web3_sent, u.web3_received, u.usdt_received,
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `danh-sach-thanh-vien-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return {
    users: paginated,
    allUsers: filtered,
    isLoading,
    isSearchingServer: isServerSearchMode && isSearchingServer,
    error,
    stats: stats || defaultStats,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    exportCSV,
    filters,
    setFilters,
    isAdmin,
    emailsMap,
    sortBy,
    setSortBy,
  };
};
