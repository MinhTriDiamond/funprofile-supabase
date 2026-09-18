import { useState, useEffect, useCallback } from "react";
import { usePersistedTab } from "@/hooks/usePersistedTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isClaimWalletMismatch } from "@/lib/claimWalletMismatch";
import { CheckCircle, XCircle, Search, ArrowUpDown, Coins, RefreshCw, TrendingUp, ShieldCheck, ShieldX, Filter, CheckCheck, Clock, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

interface UserWithReward {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  public_wallet_address: string | null;
  cover_url: string | null;
  posts_count: number;
  comments_count: number;
  reactions_count: number;
  friends_count: number;
  shares_count: number;
  reactions_on_posts: number;
  livestreams_count: number;
  today_reward: number;
  total_reward: number;
  claimed_amount: number;
  claimable_amount: number;
  last_claimed_at: string | null;
  reward_requested_at: string | null;
  reward_status: string | null;
}

interface RewardApprovalTabProps {
  adminId: string;
  onRefresh: () => void;
}

const MINIMUM_CLAIM = 200000;
const MAX_DAILY_CLAIM = 500000;

const formatNumber = (num: number) => num.toLocaleString('vi-VN');

const isValidWallet = (addr: string | null) =>
  !!addr && /^0x[a-fA-F0-9]{40}$/.test(addr);

const isProfileComplete = (user: UserWithReward) =>
  !!user.avatar_url &&
  !!user.cover_url &&
  !!(user.full_name && user.full_name.trim().length >= 2) &&
  isValidWallet(user.public_wallet_address) &&
  user.today_reward > 0;

const isEligibleForApproval = (u: UserWithReward) =>
  isProfileComplete(u) && u.claimable_amount >= MINIMUM_CLAIM;

const getMissingItems = (user: UserWithReward): string[] => {
  const missing: string[] = [];
  if (!user.avatar_url) missing.push("Ảnh đại diện");
  if (!user.cover_url) missing.push("Ảnh bìa");
  if (!user.full_name || user.full_name.trim().length < 2) missing.push("Tên đầy đủ");
  if (!isValidWallet(user.public_wallet_address)) missing.push("Ví công khai");
  if (user.today_reward <= 0) missing.push("Bài đăng hôm nay");
  return missing;
};

const ProfileBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge
    variant="outline"
    className={`text-[10px] px-1.5 py-0 ${ok ? 'bg-green-50 text-green-700 border-green-300' : 'bg-red-50 text-red-600 border-red-300'}`}
  >
    {ok ? '✓' : '✗'} {label}
  </Badge>
);

const formatDateTime = (dateStr: string) =>
  new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const RewardApprovalTab = ({ adminId, onRefresh }: RewardApprovalTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"alpha_asc" | "claimable_desc" | "claimable_asc" | "total_desc">("alpha_asc");
  const [profileFilter, setProfileFilter] = useState<"all" | "ready" | "incomplete">("all");
  const [loading, setLoading] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [users, setUsers] = useState<UserWithReward[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithReward | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Pending claims state
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [pendingClaimsLoading, setPendingClaimsLoading] = useState(true);
  const [claimActionLoading, setClaimActionLoading] = useState<string | null>(null);
  const [rejectClaimDialogOpen, setRejectClaimDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [rejectClaimReason, setRejectClaimReason] = useState("");

  const [activeTab, setActiveTab] = usePersistedTab('admin-reward-tab', 'pending-claims', ['pending-claims', 'approve', 'history'] as const);

  useEffect(() => {
    loadRewardData();
    loadPendingClaims();
  }, []);

  const loadRewardData = async () => {
    setDataLoading(true);
    try {
      // 1. Chỉ lấy user đang chờ duyệt (thường vài chục) — tránh quét toàn bộ 1000+ user gây timeout
      const { data: pendingProfiles, error: pendingErr } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, public_wallet_address, cover_url, reward_status, updated_at')
        .eq('reward_status', 'pending')
        .order('updated_at', { ascending: true })
        .limit(200);
      if (pendingErr) throw pendingErr;

      const pendingIds = (pendingProfiles || []).map(p => p.id);

      if (pendingIds.length === 0) {
        setUsers([]);
        setSelectedIds(new Set());
        return;
      }

      // 2. Tính reward riêng cho từng user (RPC nhẹ, song song theo chunk 20)
      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };
      const rewardsData: any[] = [];
      for (const batch of chunk(pendingIds, 20)) {
        const results = await Promise.all(
          batch.map(async (uid) => {
            const { data, error } = await supabase.rpc('get_user_rewards_v2_single', { target_user_id: uid });
            if (error) {
              console.warn('get_user_rewards_v2_single failed for', uid, error.message);
              return null;
            }
            const row = Array.isArray(data) ? data[0] : data;
            return row ? { ...row, id: uid } : null;
          })
        );
        results.forEach(r => { if (r) rewardsData.push(r); });
      }

      // 3. Chỉ lấy reward_claims của các user pending
      const [claimsRes, profilesRes] = await Promise.all([
        supabase.from('reward_claims').select('user_id, amount, created_at').in('user_id', pendingIds).order('created_at', { ascending: false }),
        Promise.resolve({ data: pendingProfiles, error: null as any }),
      ]);

      if (claimsRes.error) throw claimsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const claimedMap = new Map<string, number>();
      const lastClaimedMap = new Map<string, string>();
      claimsRes.data?.forEach(claim => {
        claimedMap.set(claim.user_id, (claimedMap.get(claim.user_id) || 0) + claim.amount);
        if (!lastClaimedMap.has(claim.user_id)) {
          lastClaimedMap.set(claim.user_id, claim.created_at);
        }
      });

      const profileMap = new Map<string, { full_name: string | null; public_wallet_address: string | null; cover_url: string | null; reward_status: string | null; updated_at: string | null }>();
      profilesRes.data?.forEach(p => {
        profileMap.set(p.id, { full_name: p.full_name, public_wallet_address: p.public_wallet_address, cover_url: p.cover_url, reward_status: p.reward_status, updated_at: p.updated_at });
      });

      const combinedUsers: UserWithReward[] = (rewardsData || []).map((r: any) => {
        const claimed = claimedMap.get(r.id) || 0;
        const profile = profileMap.get(r.id);
        return {
          id: r.id,
          username: r.username,
          avatar_url: r.avatar_url,
          full_name: profile?.full_name || null,
          public_wallet_address: profile?.public_wallet_address || null,
          cover_url: profile?.cover_url || null,
          posts_count: Number(r.posts_count) || 0,
          comments_count: Number(r.comments_count) || 0,
          reactions_count: Number(r.reactions_count) || 0,
          friends_count: Number(r.friends_count) || 0,
          shares_count: Number(r.shares_count) || 0,
          reactions_on_posts: Number(r.reactions_on_posts) || 0,
          livestreams_count: Number(r.livestreams_count) || 0,
          today_reward: Number(r.today_reward) || 0,
          total_reward: Number(r.total_reward) || 0,
          claimed_amount: claimed,
          claimable_amount: Math.max(0, Number(r.total_reward) - claimed),
          last_claimed_at: lastClaimedMap.get(r.id) || null,
          reward_requested_at: profile?.updated_at || null,
          reward_status: profile?.reward_status || null,
        };
      });

      setUsers(combinedUsers);
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error("Error loading reward data:", error);
      toast.error(`Lỗi khi tải dữ liệu thưởng: ${error?.message || 'Không xác định'}`);
    } finally {
      setDataLoading(false);
    }
  };

  const loadPendingClaims = async () => {
    setPendingClaimsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pending_claims')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for these claims
      const userIds = [...new Set((data || []).map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, public_wallet_address')
        .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setPendingClaims((data || []).map(c => ({
        ...c,
        profile: profileMap.get(c.user_id) || null,
      })));
    } catch (error) {
      console.error("Error loading pending claims:", error);
      toast.error("Lỗi khi tải danh sách claim");
    } finally {
      setPendingClaimsLoading(false);
    }
  };

  const handleApproveClaim = async (claimId: string) => {
    setClaimActionLoading(claimId);
    try {
      const response = await supabase.functions.invoke('approve-claim', {
        body: { claim_id: claimId, action: 'approve' },
      });

      if (response.error) {
        let msg = response.error.message;
        try { const b = await response.error.context?.json(); if (b?.message) msg = b.message; } catch {}
        throw new Error(msg);
      }

      const data = response.data;
      if (data?.error) throw new Error(data.message);

      toast.success(`✅ Đã duyệt và gửi ${Number(data.amount).toLocaleString('vi-VN')} CAMLY on-chain!`);
      loadPendingClaims();
      loadRewardData();
      onRefresh();
    } catch (error: any) {
      console.error("Error approving claim:", error);
      toast.error(error.message || "Lỗi khi duyệt claim");
    } finally {
      setClaimActionLoading(null);
    }
  };

  const handleRejectClaim = async () => {
    if (!selectedClaim) return;
    if (!rejectClaimReason.trim()) { toast.error("Vui lòng nhập lý do từ chối"); return; }

    setClaimActionLoading(selectedClaim.id);
    try {
      const response = await supabase.functions.invoke('approve-claim', {
        body: { claim_id: selectedClaim.id, action: 'reject', admin_note: rejectClaimReason },
      });

      if (response.error) {
        let msg = response.error.message;
        try { const b = await response.error.context?.json(); if (b?.message) msg = b.message; } catch {}
        throw new Error(msg);
      }

      toast.success(`Đã từ chối claim của ${selectedClaim.profile?.username || 'user'}`);
      setRejectClaimDialogOpen(false);
      setSelectedClaim(null);
      loadPendingClaims();
    } catch (error: any) {
      console.error("Error rejecting claim:", error);
      toast.error(error.message || "Lỗi khi từ chối claim");
    } finally {
      setClaimActionLoading(null);
    }
  };

  // Only show users who actively requested approval (pending), exclude inactive
  const pendingUsers = users.filter(u => u.reward_status === 'pending');

  const filteredUsers = pendingUsers
    .filter(u => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.id.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (profileFilter === "ready") return isProfileComplete(u);
      if (profileFilter === "incomplete") return !isProfileComplete(u);
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "alpha_asc": return (a.full_name || a.username).localeCompare((b.full_name || b.username), 'vi');
        case "claimable_desc": return b.claimable_amount - a.claimable_amount;
        case "claimable_asc": return a.claimable_amount - b.claimable_amount;
        case "total_desc": return b.total_reward - a.total_reward;
        default: return (a.full_name || a.username).localeCompare((b.full_name || b.username), 'vi');
      }
    });

  const eligibleFilteredUsers = filteredUsers.filter(isEligibleForApproval);
  const allEligibleSelected = eligibleFilteredUsers.length > 0 && eligibleFilteredUsers.every(u => selectedIds.has(u.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleFilteredUsers.map(u => u.id)));
    }
  };

  const handleApprove = async (user: UserWithReward) => {
    if (user.claimable_amount < MINIMUM_CLAIM) {
      toast.error(`Chưa đủ tối thiểu ${formatNumber(MINIMUM_CLAIM)} CAMLY để duyệt`);
      return false;
    }
    setLoading(user.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pending_reward: 0, approved_reward: user.claimable_amount, reward_status: 'approved' })
        .eq('id', user.id);
      if (error) throw error;

      await supabase.from('reward_approvals').insert({
        user_id: user.id, amount: user.claimable_amount, status: 'approved',
        admin_id: adminId, admin_note: 'Đã duyệt thưởng (RPC V2)', reviewed_at: new Date().toISOString()
      });

      await supabase.from('audit_logs').insert({
        admin_id: adminId, action: 'APPROVE_REWARD_V2', target_user_id: user.id,
        reason: 'Đã duyệt thưởng', details: { amount: user.claimable_amount, total_reward: user.total_reward }
      });

      toast.success(`Đã duyệt ${formatNumber(user.claimable_amount)} CAMLY cho ${user.username}`);
      return true;
    } catch (error: any) {
      console.error("Error approving reward:", error);
      toast.error(error.message || "Lỗi khi duyệt thưởng");
      return false;
    } finally {
      setLoading(null);
    }
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    const usersToApprove = filteredUsers.filter(u => ids.includes(u.id) && isEligibleForApproval(u));
    if (usersToApprove.length === 0) return;

    setBatchLoading(true);
    let success = 0;
    let fail = 0;

    for (const user of usersToApprove) {
      const ok = await handleApprove(user);
      if (ok) success++; else fail++;
    }

    toast.success(`Đã duyệt hàng loạt: ${success} thành công${fail > 0 ? `, ${fail} thất bại` : ''}`);
    setSelectedIds(new Set());
    setBatchLoading(false);
    loadRewardData();
    onRefresh();
  };

  const openRejectDialog = (user: UserWithReward) => {
    setSelectedUser(user);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedUser) return;
    if (!rejectReason.trim()) { toast.error("Vui lòng nhập lý do từ chối"); return; }

    setLoading(selectedUser.id);
    try {
      await supabase.from('reward_approvals').insert({
        user_id: selectedUser.id, amount: selectedUser.claimable_amount, status: 'rejected',
        admin_id: adminId, admin_note: rejectReason, reviewed_at: new Date().toISOString()
      });
      await supabase.from('profiles').update({ reward_status: 'rejected' }).eq('id', selectedUser.id);
      await supabase.from('audit_logs').insert({
        admin_id: adminId, action: 'REJECT_REWARD_V2', target_user_id: selectedUser.id,
        reason: rejectReason, details: { amount: selectedUser.claimable_amount }
      });

      toast.success(`Đã từ chối thưởng của ${selectedUser.username}`);
      setRejectDialogOpen(false);
      setSelectedUser(null);
      loadRewardData();
      onRefresh();
    } catch (error: any) {
      console.error("Error rejecting reward:", error);
      toast.error(error.message || "Lỗi khi từ chối thưởng");
    } finally {
      setLoading(null);
    }
  };

  const readyCount = pendingUsers.filter(isEligibleForApproval).length;
  const incompleteCount = pendingUsers.length - readyCount;
  const totalClaimable = pendingUsers.reduce((s, u) => s + u.claimable_amount, 0);
  const totalRewardAll = users.reduce((s, u) => s + u.total_reward, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="w-7 h-7 text-orange-600" />
              <div>
                <p className="text-xs text-muted-foreground">Chờ duyệt claim</p>
                <p className="text-lg font-bold text-orange-700">{pendingClaims.length} lệnh</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Coins className="w-7 h-7 text-yellow-600" />
              <div>
                <p className="text-xs text-muted-foreground">Tổng Claimable</p>
                <p className="text-lg font-bold text-yellow-700">{formatNumber(totalClaimable)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Tổng Reward</p>
                <p className="text-lg font-bold text-green-700">{formatNumber(totalRewardAll)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
              <div>
                <p className="text-xs text-muted-foreground">Sẵn sàng duyệt</p>
                <p className="text-lg font-bold text-emerald-700">{readyCount} users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <ShieldX className="w-7 h-7 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">Chưa đủ ĐK</p>
                <p className="text-lg font-bold text-amber-700">{incompleteCount} users</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending-claims" className="gap-2">
            <Clock className="w-4 h-4" />
            Duyệt Claim ({pendingClaims.length})
          </TabsTrigger>
          <TabsTrigger value="approve-users" className="gap-2">
            <ShieldCheck className="w-4 h-4" />
            Duyệt User ({pendingUsers.length})
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: PENDING CLAIMS ===== */}
        <TabsContent value="pending-claims">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  Lệnh Claim chờ duyệt
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadPendingClaims} disabled={pendingClaimsLoading} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${pendingClaimsLoading ? 'animate-spin' : ''}`} />
                  Làm mới
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pendingClaimsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingClaims.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  ✅ Không có lệnh claim nào đang chờ duyệt
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingClaims.map((claim) => (
                    <div key={claim.id} className="flex items-center gap-4 p-4 border rounded-lg bg-orange-50/50 border-orange-200">
                      <a href={`/${claim.profile?.username}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Avatar className="w-12 h-12 cursor-pointer ring-2 ring-transparent hover:ring-primary/40 transition-all">
                          <AvatarImage src={claim.profile?.avatar_url || ""} />
                          <AvatarFallback>{(claim.profile?.username || '?')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </a>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <a href={`/${claim.profile?.username}`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline hover:text-primary">
                            {claim.profile?.username || 'Unknown'}
                          </a>
                          {claim.profile?.full_name && <span className="text-xs text-muted-foreground">({claim.profile.full_name})</span>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">{claim.user_id}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                          <span>
                            Ví: <span className="font-mono">{claim.wallet_address.slice(0, 8)}...{claim.wallet_address.slice(-6)}</span>
                          </span>
                          {isClaimWalletMismatch(claim.wallet_address, claim.profile?.public_wallet_address) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Ví khác với ví đăng ký
                            </Badge>
                          )}
                        </p>
                        {isClaimWalletMismatch(claim.wallet_address, claim.profile?.public_wallet_address) && (
                          <p className="text-[11px] text-destructive mt-0.5">
                            Ví đăng ký:{' '}
                            <span className="font-mono">
                              {claim.profile?.public_wallet_address
                                ? `${claim.profile.public_wallet_address.slice(0, 8)}...${claim.profile.public_wallet_address.slice(-6)}`
                                : 'chưa có'}
                            </span>
                          </p>
                        )}
                        <p className="text-xs text-blue-600 mt-0.5">
                          📋 Yêu cầu: {formatDateTime(claim.created_at)}
                        </p>
                      </div>

                      <div className="text-right min-w-[120px]">
                        <p className="text-xl font-bold text-orange-700">{formatNumber(Number(claim.amount))}</p>
                        <p className="text-xs text-muted-foreground">CAMLY</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white gap-1"
                          onClick={() => handleApproveClaim(claim.id)}
                          disabled={claimActionLoading === claim.id}
                        >
                          {claimActionLoading === claim.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                          Duyệt & Gửi
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => {
                            setSelectedClaim(claim);
                            setRejectClaimReason("");
                            setRejectClaimDialogOpen(true);
                          }}
                          disabled={claimActionLoading === claim.id}
                        >
                          <XCircle className="w-4 h-4" />
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 2: APPROVE USERS ===== */}
        <TabsContent value="approve-users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-500" />
                  Duyệt thưởng V2 ({filteredUsers.length} users)
                </CardTitle>
                <div className="flex gap-2">
                  {selectedIds.size > 0 && (
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600 text-white gap-1"
                      onClick={handleBatchApprove}
                      disabled={batchLoading}
                    >
                      <CheckCheck className="w-4 h-4" />
                      Duyệt hàng loạt ({selectedIds.size})
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={loadRewardData} disabled={dataLoading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
                    Làm mới
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search, Filter, Sort */}
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo username hoặc ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-1">
                  {([
                    { key: 'all', label: 'Tất cả', icon: Filter },
                    { key: 'ready', label: 'Sẵn sàng', icon: ShieldCheck },
                    { key: 'incomplete', label: 'Chưa đủ', icon: ShieldX },
                  ] as const).map(f => (
                    <Button
                      key={f.key}
                      size="sm"
                      variant={profileFilter === f.key ? "default" : "outline"}
                      onClick={() => setProfileFilter(f.key)}
                      className="gap-1 text-xs"
                    >
                      <f.icon className="w-3 h-3" />
                      {f.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortBy(prev => {
                    if (prev === "alpha_asc") return "claimable_desc";
                    if (prev === "claimable_desc") return "claimable_asc";
                    if (prev === "claimable_asc") return "total_desc";
                    return "alpha_asc";
                  })}
                  className="gap-1"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  {sortBy === "alpha_asc" && "A-Z"}
                  {sortBy === "claimable_desc" && "Claimable ↓"}
                  {sortBy === "claimable_asc" && "Claimable ↑"}
                  {sortBy === "total_desc" && "Total ↓"}
                </Button>
              </div>

              {/* Select all header */}
              {eligibleFilteredUsers.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md">
                  <Checkbox
                    checked={allEligibleSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Chọn tất cả đủ điều kiện ({eligibleFilteredUsers.length})
                  </span>
                </div>
              )}

              {/* User List */}
              {dataLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto space-y-3">
                  {filteredUsers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Không có user nào đang chờ duyệt thưởng
                    </p>
                  ) : (
                    filteredUsers.map((user) => {
                      const complete = isProfileComplete(user);
                      const missing = getMissingItems(user);
                      return (
                        <div
                          key={user.id}
                          className={`flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-shadow ${complete ? 'bg-background' : 'bg-amber-50/50 border-amber-200'}`}
                        >
                          {isEligibleForApproval(user) ? (
                            <Checkbox
                              checked={selectedIds.has(user.id)}
                              onCheckedChange={() => toggleSelect(user.id)}
                            />
                          ) : (
                            <div className="w-4" />
                          )}

                          <a href={`/${user.username}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <Avatar className="w-12 h-12 cursor-pointer ring-2 ring-transparent hover:ring-primary/40 transition-all">
                              <AvatarImage src={user.avatar_url || ""} />
                              <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </a>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={`/${user.username}`} target="_blank" rel="noopener noreferrer" className="font-semibold truncate hover:underline hover:text-primary transition-colors">
                                {user.username}
                              </a>
                              {user.full_name && <span className="text-xs text-muted-foreground">({user.full_name})</span>}
                              {user.today_reward > 0 && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  +{formatNumber(user.today_reward)} hôm nay
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono truncate">{user.id}</p>
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              <ProfileBadge ok={!!user.avatar_url} label="Avatar" />
                              <ProfileBadge ok={!!user.cover_url} label="Bìa" />
                              <ProfileBadge ok={!!(user.full_name && user.full_name.trim().length >= 2)} label="Tên" />
                              <ProfileBadge ok={isValidWallet(user.public_wallet_address)} label="Ví" />
                              <ProfileBadge ok={user.today_reward > 0} label="Hôm nay" />
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>📝 {user.posts_count}</span>
                              <span>❤️ {user.reactions_on_posts}</span>
                              <span>💬 {user.comments_count}</span>
                              <span>🔄 {user.shares_count}</span>
                              <span>👥 {user.friends_count}</span>
                              {user.livestreams_count > 0 && <span>📺 {user.livestreams_count}</span>}
                            </div>
                          </div>

                          <div className="text-right min-w-[140px]">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <p className="text-lg font-bold text-yellow-600">
                                {formatNumber(user.claimable_amount)} CAMLY
                              </p>
                              {user.claimable_amount < MINIMUM_CLAIM && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Chưa đủ 200K
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Total: {formatNumber(user.total_reward)}</p>
                            <p className="text-xs text-green-600">Claimed: {formatNumber(user.claimed_amount)}</p>
                            {user.reward_requested_at && (
                              <p className="text-[10px] text-blue-600">
                                📋 Yêu cầu: {formatDateTime(user.reward_requested_at)}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      size="sm"
                                      className="bg-green-500 hover:bg-green-600 text-white gap-1"
                                      onClick={() => { handleApprove(user).then(() => { loadRewardData(); onRefresh(); }); }}
                                      disabled={loading === user.id || !isEligibleForApproval(user)}
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                      Duyệt
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {!isEligibleForApproval(user) && (
                                  <TooltipContent side="left" className="max-w-xs">
                                    <p className="text-sm font-medium">Chưa đủ điều kiện:</p>
                                    <ul className="text-xs list-disc pl-4">
                                      {missing.map(m => <li key={m}>{m}</li>)}
                                      {user.claimable_amount < MINIMUM_CLAIM && (
                                        <li>Chưa đủ tối thiểu {formatNumber(MINIMUM_CLAIM)} CAMLY</li>
                                      )}
                                    </ul>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1"
                              onClick={() => openRejectDialog(user)}
                              disabled={loading === user.id}
                            >
                              <XCircle className="w-4 h-4" />
                              Từ chối
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject User Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối thưởng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Từ chối thưởng của <strong>{selectedUser?.username}</strong> ({formatNumber(selectedUser?.claimable_amount || 0)} CAMLY)
            </p>
            <Textarea
              placeholder="Nhập lý do từ chối..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading !== null}>Xác nhận từ chối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Claim Dialog */}
      <Dialog open={rejectClaimDialogOpen} onOpenChange={setRejectClaimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối lệnh Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Từ chối claim <strong>{formatNumber(Number(selectedClaim?.amount) || 0)} CAMLY</strong> của <strong>{selectedClaim?.profile?.username}</strong>
            </p>
            <Textarea
              placeholder="Nhập lý do từ chối..."
              value={rejectClaimReason}
              onChange={(e) => setRejectClaimReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectClaimDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleRejectClaim} disabled={claimActionLoading !== null}>Xác nhận từ chối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardApprovalTab;
