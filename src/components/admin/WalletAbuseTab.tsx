import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Users, AlertTriangle, Ban, FileText, Smartphone, CheckCircle, Trash2, Globe, Monitor, Zap, RefreshCw, Clock, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface UserData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  is_banned: boolean;
  pending_reward: number;
  approved_reward?: number;
  reward_status?: string;
  created_at?: string;
  bio?: string | null;
}

interface WalletAbuseTabProps {
  users: UserData[];
  adminId: string;
  onRefresh: () => void;
}

interface IpInfo {
  ip_address: string;
  user_agent: string | null;
  created_at: string;
}

interface DeviceGroup {
  device_hash: string;
  users: { user_id: string; username: string }[];
  totalCamly: number;
}

interface FarmDetectorEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  claim_count: number;
  total_claimed_24h: number;
  last_claim_at: string;
  signal_type: string;
}

interface EmailCluster {
  emailBase: string;
  accounts: { id: string; username: string; email: string; reward_status?: string; pending_reward: number; approved_reward: number }[];
  totalCamly: number;
}

const WalletAbuseTab = ({ users, adminId, onRefresh }: WalletAbuseTabProps) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [ipMap, setIpMap] = useState<Record<string, IpInfo>>({});
  const [farmVelocity, setFarmVelocity] = useState<FarmDetectorEntry[]>([]);
  const [farmUTCExploiters, setFarmUTCExploiters] = useState<FarmDetectorEntry[]>([]);
  const [farmRefreshing, setFarmRefreshing] = useState(false);
  const [emailClusters, setEmailClusters] = useState<EmailCluster[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [banningCluster, setBanningCluster] = useState<string | null>(null);

  // Fetch shared devices + IP logs + Farm Detector on mount
  const fetchFarmDetectorData = async () => {
    setFarmRefreshing(true);
    try {
      // Claim Velocity: user rút >= 3 lần trong 24h
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: velocityData } = await supabase
        .from('reward_claims')
        .select('user_id, amount, created_at')
        .gte('created_at', last24h)
        .order('created_at', { ascending: false });

      if (velocityData) {
        const userClaimMap: Record<string, { count: number; total: number; last_at: string }> = {};
        velocityData.forEach((c: any) => {
          if (!userClaimMap[c.user_id]) {
            userClaimMap[c.user_id] = { count: 0, total: 0, last_at: c.created_at };
          }
          userClaimMap[c.user_id].count += 1;
          userClaimMap[c.user_id].total += Number(c.amount);
        });

        const velocityEntries: FarmDetectorEntry[] = Object.entries(userClaimMap)
          .filter(([_, v]) => v.count >= 2)
          .map(([uid, v]) => {
            const u = users.find(u => u.id === uid);
            return {
              user_id: uid,
              username: u?.username || uid.slice(0, 8),
              avatar_url: u?.avatar_url || null,
              claim_count: v.count,
              total_claimed_24h: v.total,
              last_claim_at: v.last_at,
              signal_type: 'CLAIM_VELOCITY',
            };
          })
          .sort((a, b) => b.claim_count - a.claim_count);
        setFarmVelocity(velocityEntries);

        // UTC Gap Exploiters: user có claim trong window 23:00-01:00 UTC (00:00-08:00 VN gap)
        const utcGapData = velocityData.filter((c: any) => {
          const h = new Date(c.created_at).getUTCHours();
          return h >= 22 || h <= 1; // 22:00-01:59 UTC = 05:00-08:59 VN (khoảng nguy hiểm)
        });
        const utcGapMap: Record<string, { count: number; total: number; last_at: string }> = {};
        utcGapData.forEach((c: any) => {
          if (!utcGapMap[c.user_id]) utcGapMap[c.user_id] = { count: 0, total: 0, last_at: c.created_at };
          utcGapMap[c.user_id].count += 1;
          utcGapMap[c.user_id].total += Number(c.amount);
        });
        const utcEntries: FarmDetectorEntry[] = Object.entries(utcGapMap)
          .map(([uid, v]) => {
            const u = users.find(u => u.id === uid);
            return {
              user_id: uid,
              username: u?.username || uid.slice(0, 8),
              avatar_url: u?.avatar_url || null,
              claim_count: v.count,
              total_claimed_24h: v.total,
              last_claim_at: v.last_at,
              signal_type: 'UTC_GAP',
            };
          })
          .sort((a, b) => b.total_claimed_24h - a.total_claimed_24h);
        setFarmUTCExploiters(utcEntries);
      }
    } finally {
      setFarmRefreshing(false);
    }
  };

  // Fetch email farm clusters
  const fetchEmailClusters = async () => {
    setEmailLoading(true);
    try {
      const { data: signals } = await supabase
        .from('pplp_fraud_signals')
        .select('actor_id, details, created_at')
        .eq('signal_type', 'EMAIL_FARM')
        .order('created_at', { ascending: false });

      const emailGroups: Record<string, EmailCluster['accounts']> = {};
      
      if (signals?.length) {
        for (const signal of signals) {
          const details = signal.details as any;
          if (details?.email_base && details?.user_ids) {
            if (!emailGroups[details.email_base]) emailGroups[details.email_base] = [];
            for (let i = 0; i < details.user_ids.length; i++) {
              const uid = details.user_ids[i];
              const u = users.find(u => u.id === uid);
              if (u && !emailGroups[details.email_base].find(a => a.id === uid)) {
                emailGroups[details.email_base].push({
                  id: uid, username: u.username,
                  email: details.emails?.[i] || '',
                  reward_status: u.reward_status,
                  pending_reward: u.pending_reward,
                  approved_reward: u.approved_reward || 0,
                });
              }
            }
          }
        }
      }

      const clusters = Object.entries(emailGroups)
        .filter(([_, accounts]) => accounts.length >= 3)
        .map(([emailBase, accounts]) => ({
          emailBase, accounts,
          totalCamly: accounts.reduce((sum, a) => sum + a.pending_reward + a.approved_reward, 0),
        }))
        .sort((a, b) => b.accounts.length - a.accounts.length);

      setEmailClusters(clusters);
    } catch (err) {
      console.error('Error fetching email clusters:', err);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleBanEmailCluster = async (cluster: EmailCluster) => {
    if (!confirm(`⚠️ Cấm tất cả ${cluster.accounts.length} tài khoản trong cụm email "${cluster.emailBase}"?`)) return;
    setBanningCluster(cluster.emailBase);
    try {
      for (const account of cluster.accounts) {
        if (users.find(u => u.id === account.id)?.is_banned) continue;
        await supabase.rpc('ban_user_permanently', {
          p_admin_id: adminId,
          p_user_id: account.id,
          p_reason: `Gmail farm cluster: ${cluster.emailBase}`
        });
      }
      toast.success(`Đã cấm ${cluster.accounts.length} tài khoản cụm "${cluster.emailBase}"`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm cụm email");
    } finally {
      setBanningCluster(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      // Fetch device groups
      const { data: deviceData } = await supabase
        .from('pplp_device_registry')
        .select('device_hash, user_id');

      if (deviceData) {
        const groups: Record<string, string[]> = {};
        deviceData.forEach((d: any) => {
          if (!groups[d.device_hash]) groups[d.device_hash] = [];
          if (!groups[d.device_hash].includes(d.user_id)) {
            groups[d.device_hash].push(d.user_id);
          }
        });

        const shared = Object.entries(groups)
          .filter(([_, uids]) => uids.length > 1)
          .map(([hash, uids]) => {
            const groupUsers = uids.map(uid => {
              const u = users.find(u => u.id === uid);
              return { user_id: uid, username: u?.username || uid.slice(0, 8) };
            });
            const totalCamly = uids.reduce((sum, uid) => {
              const u = users.find(u => u.id === uid);
              return sum + (u?.pending_reward || 0) + (u?.approved_reward || 0);
            }, 0);
            return { device_hash: hash, users: groupUsers, totalCamly };
          })
          .sort((a, b) => b.totalCamly - a.totalCamly);

        setDeviceGroups(shared);

        // Fetch IP logs for all users in shared device groups
        const allUserIds = shared.flatMap(g => g.users.map(u => u.user_id));
        if (allUserIds.length > 0) {
          const { data: ipData } = await supabase
            .from('login_ip_logs')
            .select('user_id, ip_address, user_agent, created_at')
            .in('user_id', allUserIds)
            .order('created_at', { ascending: false });

          if (ipData) {
            const map: Record<string, IpInfo> = {};
            ipData.forEach((log: any) => {
              if (!map[log.user_id]) {
                map[log.user_id] = {
                  ip_address: log.ip_address,
                  user_agent: log.user_agent,
                  created_at: log.created_at,
                };
              }
            });
            setIpMap(map);
          }
        }
      }
    };
    fetchData();
    fetchFarmDetectorData();
    fetchEmailClusters();
  }, [users]);

  // Detect shared wallets
  const sharedWallets = useMemo(() => {
    const walletGroups: Record<string, UserData[]> = {};
    users.forEach(user => {
      if (user.wallet_address && !user.is_banned) {
        const wallet = user.wallet_address.toLowerCase();
        if (!walletGroups[wallet]) walletGroups[wallet] = [];
        walletGroups[wallet].push(user);
      }
    });
    return Object.entries(walletGroups)
      .filter(([_, userList]) => userList.length > 1)
      .map(([wallet, userList]) => ({
        wallet_address: wallet,
        users: userList,
        total_pending: userList.reduce((sum, u) => sum + u.pending_reward, 0)
      }))
      .sort((a, b) => b.total_pending - a.total_pending);
  }, [users]);

  // Detect duplicate bios
  const sharedBios = useMemo(() => {
    const bioGroups: Record<string, UserData[]> = {};
    users.forEach(user => {
      if (user.bio && !user.is_banned) {
        const normalized = user.bio.toLowerCase().trim().replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '');
        if (normalized.length > 10) {
          if (!bioGroups[normalized]) bioGroups[normalized] = [];
          bioGroups[normalized].push(user);
        }
      }
    });
    return Object.entries(bioGroups)
      .filter(([_, userList]) => userList.length > 1)
      .map(([_, userList]) => ({
        bio_preview: userList[0].bio!.slice(0, 60) + '...',
        users: userList,
        total_pending: userList.reduce((sum, u) => sum + u.pending_reward, 0)
      }))
      .sort((a, b) => b.total_pending - a.total_pending);
  }, [users]);

  // Detect fake names
  const isFakeName = (name: string | null): boolean => {
    if (!name) return true;
    const trimmed = name.trim();
    if (trimmed.length < 3) return true;
    if (/^\d+$/.test(trimmed)) return true;
    if (/^[a-z]{1,4}\d{5,}$/i.test(trimmed)) return true;
    if (/^(test|user|admin|guest|demo|abc|xyz)\d*$/i.test(trimmed)) return true;
    return false;
  };

  const fakeNameUsers = useMemo(() => {
    return users.filter(u => !u.is_banned && isFakeName(u.full_name)).sort((a, b) => b.pending_reward - a.pending_reward);
  }, [users]);

  // Missing profile users
  const missingProfileUsers = useMemo(() => {
    return users.filter(u => !u.is_banned && !u.full_name && !u.avatar_url && u.pending_reward > 0).sort((a, b) => b.pending_reward - a.pending_reward);
  }, [users]);

  const handleBanUser = async (user: UserData) => {
    setLoading(user.id);
    try {
      const { error } = await supabase.rpc('ban_user_permanently', {
        p_admin_id: adminId,
        p_user_id: user.id,
        p_reason: 'Lạm dụng ví/profile'
      });
      if (error) throw error;
      toast.success(`Đã cấm ${user.username}`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm user");
    } finally {
      setLoading(null);
    }
  };

  const handlePermanentDelete = async (user: UserData) => {
    if (!confirm(`⚠️ Xóa vĩnh viễn ${user.username}?\nHành động này không thể hoàn tác!`)) return;
    setLoading(`delete-${user.id}`);
    try {
      const { error: banError } = await supabase.rpc('ban_user_permanently', {
        p_admin_id: adminId,
        p_user_id: user.id,
        p_reason: 'Xóa vĩnh viễn - lạm dụng đa tài khoản'
      });
      if (banError) throw banError;

      await supabase.from('profiles').update({
        pending_reward: 0,
        approved_reward: 0,
        reward_status: 'banned'
      }).eq('id', user.id);

      await supabase.from('audit_logs').insert({
        admin_id: adminId,
        target_user_id: user.id,
        action: 'permanent_delete',
        reason: 'Xóa vĩnh viễn - lạm dụng đa tài khoản'
      });

      toast.success(`Đã xóa vĩnh viễn ${user.username}`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi xóa user");
    } finally {
      setLoading(null);
    }
  };

  const handleReapprove = async (user: UserData) => {
    setLoading(`reapprove-${user.id}`);
    try {
      const { error } = await supabase.from('profiles').update({
        reward_status: 'approved'
      }).eq('id', user.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        admin_id: adminId,
        target_user_id: user.id,
        action: 'reapprove_reward',
        reason: 'Admin duyệt lại từ tab Lạm dụng'
      });

      toast.success(`Đã duyệt lại ${user.username}`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi duyệt lại");
    } finally {
      setLoading(null);
    }
  };

  const handleReapproveGroup = async (group: DeviceGroup) => {
    setLoading(`reapprove-group-${group.device_hash}`);
    try {
      for (const u of group.users) {
        await supabase.from('profiles').update({ reward_status: 'approved' }).eq('id', u.user_id);
        await supabase.from('audit_logs').insert({
          admin_id: adminId,
          target_user_id: u.user_id,
          action: 'reapprove_reward',
          reason: 'Admin duyệt lại nhóm thiết bị từ tab Lạm dụng'
        });
      }
      toast.success(`Đã duyệt lại ${group.users.length} tài khoản`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi duyệt lại nhóm");
    } finally {
      setLoading(null);
    }
  };

  const handleBanWalletGroup = async (walletGroup: { wallet_address: string; users: UserData[] }) => {
    setLoading(walletGroup.wallet_address);
    try {
      for (const user of walletGroup.users) {
        await supabase.rpc('ban_user_permanently', {
          p_admin_id: adminId,
          p_user_id: user.id,
          p_reason: `Ví dùng chung: ${walletGroup.wallet_address}`
        });
      }
      toast.success(`Đã cấm ${walletGroup.users.length} tài khoản dùng chung ví`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm nhóm");
    } finally {
      setLoading(null);
    }
  };

  const handleBanDeviceGroup = async (group: DeviceGroup) => {
    if (!confirm(`⚠️ Cấm tất cả ${group.users.length} tài khoản trong nhóm thiết bị này?`)) return;
    setLoading(`ban-group-${group.device_hash}`);
    try {
      for (const u of group.users) {
        const userData = users.find(usr => usr.id === u.user_id);
        if (userData) {
          await supabase.rpc('ban_user_permanently', {
            p_admin_id: adminId,
            p_user_id: u.user_id,
            p_reason: `Thiết bị dùng chung: ${group.device_hash.slice(0, 16)}`
          });
        }
      }
      toast.success(`Đã cấm ${group.users.length} tài khoản`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm nhóm");
    } finally {
      setLoading(null);
    }
  };

  const handleBanBioGroup = async (bioGroup: { users: UserData[] }) => {
    setLoading('bio-group');
    try {
      for (const user of bioGroup.users) {
        await supabase.rpc('ban_user_permanently', {
          p_admin_id: adminId,
          p_user_id: user.id,
          p_reason: 'Bio trùng - nghi ngờ multi-account'
        });
      }
      toast.success(`Đã cấm ${bioGroup.users.length} tài khoản trùng bio`);
      onRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm nhóm");
    } finally {
      setLoading(null);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString('vi-VN');
  const truncateAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  const parseUserAgent = (ua: string | null): string => {
    if (!ua) return 'Không rõ';
    const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|Samsung)/i)?.[1] || '';
    const os = ua.match(/(Android|iPhone|iPad|Windows|Mac|Linux)/i)?.[1] || '';
    return `${browser}/${os}`.replace(/^\/|\/$/g, '') || ua.slice(0, 30);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'on_hold':
        return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">⏸️ Tạm ngưng</Badge>;
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">✅ Đã duyệt</Badge>;
      case 'banned':
        return <Badge className="bg-red-500/20 text-red-700 border-red-500/30">🚫 Bị cấm</Badge>;
      default:
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">⏳ Chờ duyệt</Badge>;
    }
  };

  const getAccountAge = (createdAt?: string) => {
    if (!createdAt) return '';
    try {
      return formatDistanceToNow(new Date(createdAt), { addSuffix: false, locale: vi });
    } catch {
      return '';
    }
  };

  // Enhanced user card for device tab
  const DeviceUserCard = ({ userId, username }: { userId: string; username: string }) => {
    const userData = users.find(u => u.id === userId);
    const ipInfo = ipMap[userId];
    if (!userData) return null;

    return (
      <div className="border rounded-lg p-3 bg-card space-y-2">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={userData.avatar_url || ""} />
            <AvatarFallback>{username[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{username}</p>
              {getStatusBadge(userData.reward_status)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {userData.full_name || '(chưa có tên)'}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pl-[52px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Globe className="w-3 h-3" />
            <span>IP: {ipInfo?.ip_address || 'Chưa có'}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Monitor className="w-3 h-3" />
            <span>{parseUserAgent(ipInfo?.user_agent || null)}</span>
          </div>
          <div>
            <span className="text-amber-600 font-medium">{formatNumber(userData.pending_reward)} pending</span>
          </div>
          <div>
            <span className="text-green-600 font-medium">{formatNumber(userData.approved_reward || 0)} approved</span>
          </div>
          {userData.created_at && (
            <div className="col-span-2 text-muted-foreground">
              📅 Tạo: {new Date(userData.created_at).toLocaleDateString('vi-VN')} ({getAccountAge(userData.created_at)})
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end pt-1">
          {userData.reward_status === 'on_hold' && (
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-300 hover:bg-green-50 text-xs"
              onClick={() => handleReapprove(userData)}
              disabled={loading === `reapprove-${userData.id}`}
            >
              <CheckCircle className="w-3 h-3 mr-1" /> Duyệt lại
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="text-xs"
            onClick={() => handlePermanentDelete(userData)}
            disabled={loading === `delete-${userData.id}` || loading === userData.id}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Xóa vĩnh viễn
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-purple-500" />
          Phát hiện lạm dụng
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="farm">
          <TabsList className="grid w-full grid-cols-7 mb-4">
            <TabsTrigger value="farm" className="gap-1 text-xs sm:text-sm">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
              <span className="hidden sm:inline">🚨 Farm</span> ({farmVelocity.length + farmUTCExploiters.length})
            </TabsTrigger>
            <TabsTrigger value="email-farm" className="gap-1 text-xs sm:text-sm">
              <Mail className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
              <span className="hidden sm:inline">📧 Email</span> ({emailClusters.length})
            </TabsTrigger>
            <TabsTrigger value="device" className="gap-1 text-xs sm:text-sm">
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Thiết bị</span> ({deviceGroups.length})
            </TabsTrigger>
            <TabsTrigger value="shared" className="gap-1 text-xs sm:text-sm">
              <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Ví chung</span> ({sharedWallets.length})
            </TabsTrigger>
            <TabsTrigger value="bio" className="gap-1 text-xs sm:text-sm">
              <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Bio trùng</span> ({sharedBios.length})
            </TabsTrigger>
            <TabsTrigger value="fake" className="gap-1 text-xs sm:text-sm">
              <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Tên ảo</span> ({fakeNameUsers.length})
            </TabsTrigger>
            <TabsTrigger value="missing" className="gap-1 text-xs sm:text-sm">
              <Ban className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Thiếu</span> ({missingProfileUsers.length})
            </TabsTrigger>
          </TabsList>

          {/* ===== FARM DETECTOR TAB ===== */}
          <TabsContent value="farm" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-destructive flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Farm Detector — Realtime
                </h3>
                <p className="text-xs text-muted-foreground">Phát hiện sớm hành vi farm coin qua Claim Velocity và UTC Gap</p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchFarmDetectorData} disabled={farmRefreshing} className="gap-1">
                <RefreshCw className={`w-3 h-3 ${farmRefreshing ? 'animate-spin' : ''}`} /> Làm mới
              </Button>
            </div>

            {/* Claim Velocity - rút >= 2 lần trong 24h */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                ⚡ Claim Velocity — Rút nhiều lần trong 24h
                <Badge variant="destructive" className="text-xs">{farmVelocity.length} tài khoản</Badge>
              </h4>
              {farmVelocity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">✅ Không phát hiện claim velocity bất thường</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {farmVelocity.map((entry) => {
                    const userData = users.find(u => u.id === entry.user_id);
                    return (
                      <div key={entry.user_id} className="flex items-center gap-3 p-3 border rounded-lg bg-orange-50/50">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={entry.avatar_url || ""} />
                          <AvatarFallback>{entry.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{entry.username}</p>
                            <Badge variant="destructive" className="text-xs">
                              {entry.claim_count} lần rút
                            </Badge>
                            {userData?.reward_status && (
                              <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                {userData.reward_status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Tổng: {entry.total_claimed_24h.toLocaleString('vi-VN')} CAMLY trong 24h • Lần cuối: {formatDistanceToNow(new Date(entry.last_claim_at), { addSuffix: true, locale: vi })}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {userData && !userData.is_banned && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs"
                              onClick={() => handleBanUser(userData)}
                              disabled={loading === userData.id}
                            >
                              <Ban className="w-3 h-3 mr-1" /> Cấm
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* UTC Gap Exploiters - claim trong giờ nhạy cảm */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-red-500" />
                🌏 UTC Gap Exploiters — Rút trong window 22:00-02:00 UTC (05:00-09:00 VN)
                <Badge variant="destructive" className="text-xs">{farmUTCExploiters.length} tài khoản</Badge>
              </h4>
              <p className="text-xs text-muted-foreground bg-red-50 p-2 rounded">
                ⚠️ Đây là cửa sổ thời gian kẻ farm lợi dụng để rút 2 lần trong cùng 1 ngày thực tế. Hệ thống đã được vá nhưng cần theo dõi các tài khoản cũ.
              </p>
              {farmUTCExploiters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">✅ Không phát hiện khai thác UTC gap</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {farmUTCExploiters.map((entry) => {
                    const userData = users.find(u => u.id === entry.user_id);
                    return (
                      <div key={entry.user_id} className="flex items-center gap-3 p-3 border rounded-lg bg-red-50/50">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={entry.avatar_url || ""} />
                          <AvatarFallback>{entry.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{entry.username}</p>
                            <Badge className="text-xs bg-red-100 text-red-800 border-red-300">UTC Gap</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {entry.claim_count} lần trong giờ nhạy cảm • {entry.total_claimed_24h.toLocaleString('vi-VN')} CAMLY • {formatDistanceToNow(new Date(entry.last_claim_at), { addSuffix: true, locale: vi })}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {userData && !userData.is_banned && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs"
                              onClick={() => handleBanUser(userData)}
                              disabled={loading === userData.id}
                            >
                              <Ban className="w-3 h-3 mr-1" /> Cấm
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== EMAIL FARM TAB ===== */}
          <TabsContent value="email-farm" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-destructive flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email Farm Detector
                </h3>
                <p className="text-xs text-muted-foreground">Tự động nhóm tài khoản có email prefix giống nhau (≥3 tài khoản)</p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchEmailClusters} disabled={emailLoading} className="gap-1">
                <RefreshCw className={`w-3 h-3 ${emailLoading ? 'animate-spin' : ''}`} /> Làm mới
              </Button>
            </div>

            {emailClusters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {emailLoading ? '⏳ Đang tải...' : '✅ Không phát hiện cụm email farm'}
              </p>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {emailClusters.map((cluster) => (
                  <div key={cluster.emailBase} className="border-2 border-destructive/20 rounded-xl p-4 space-y-3 bg-destructive/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-2">
                          📧 Cụm: <span className="font-mono text-destructive">{cluster.emailBase}*@gmail.com</span>
                          <Badge variant="destructive" className="text-xs">{cluster.accounts.length} tài khoản</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tổng CAMLY: <span className="font-semibold text-destructive">{formatNumber(cluster.totalCamly)}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleBanEmailCluster(cluster)}
                        disabled={banningCluster === cluster.emailBase}
                      >
                        <Ban className="w-3 h-3 mr-1" /> Cấm tất cả
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      {cluster.accounts.map((account) => {
                        const userData = users.find(u => u.id === account.id);
                        return (
                          <div key={account.id} className="flex items-center gap-3 p-2 border rounded-lg bg-card">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={userData?.avatar_url || ""} />
                              <AvatarFallback>{account.username[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{account.username}</p>
                                {getStatusBadge(account.reward_status)}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {account.email} • {formatNumber(account.pending_reward + account.approved_reward)} CAMLY
                              </p>
                            </div>
                            {userData && !userData.is_banned && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="text-xs"
                                onClick={() => handleBanUser(userData)}
                                disabled={loading === userData.id}
                              >
                                <Ban className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="device" className="max-h-[600px] overflow-y-auto space-y-4">
            {deviceGroups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không phát hiện thiết bị dùng chung</p>
            ) : (
              deviceGroups.map((group, idx) => (
                <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 space-y-3 bg-orange-50/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold">🖥️ Device: {group.device_hash.slice(0, 16)}...</p>
                      <p className="text-sm text-muted-foreground">
                        {group.users.length} tài khoản • <span className="text-red-600 font-semibold">Tổng CAMLY nhóm: {formatNumber(group.totalCamly)}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-300 hover:bg-green-50 text-xs"
                        onClick={() => handleReapproveGroup(group)}
                        disabled={loading === `reapprove-group-${group.device_hash}`}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Duyệt lại tất cả
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleBanDeviceGroup(group)}
                        disabled={loading === `ban-group-${group.device_hash}`}
                      >
                        <Ban className="w-3 h-3 mr-1" /> Cấm tất cả
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {group.users.map(u => (
                      <DeviceUserCard key={u.user_id} userId={u.user_id} username={u.username} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Shared Wallets */}
          <TabsContent value="shared" className="max-h-[500px] overflow-y-auto space-y-4">
            {sharedWallets.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không phát hiện ví dùng chung</p>
            ) : (
              sharedWallets.map((group, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm">{truncateAddress(group.wallet_address)}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.users.length} tài khoản • Tổng pending: {formatNumber(group.total_pending)} CAMLY
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleBanWalletGroup(group)} disabled={loading === group.wallet_address}>
                      <Ban className="w-4 h-4 mr-1" /> Cấm tất cả
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {group.users.map(user => (
                      <div key={user.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user.avatar_url || ""} />
                          <AvatarFallback>{user.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(user.pending_reward)} CAMLY</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Shared Bios */}
          <TabsContent value="bio" className="max-h-[500px] overflow-y-auto space-y-4">
            {sharedBios.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không phát hiện bio trùng</p>
            ) : (
              sharedBios.map((group, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm italic text-muted-foreground">"{group.bio_preview}"</p>
                      <p className="text-xs text-muted-foreground">
                        {group.users.length} tài khoản • Tổng pending: {formatNumber(group.total_pending)} CAMLY
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleBanBioGroup(group)} disabled={loading === 'bio-group'}>
                      <Ban className="w-4 h-4 mr-1" /> Cấm tất cả
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {group.users.map(user => (
                      <div key={user.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user.avatar_url || ""} />
                          <AvatarFallback>{user.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">{user.full_name || '(trống)'} • {formatNumber(user.pending_reward)} CAMLY</p>
                        </div>
                        <Button size="sm" variant="destructive" onClick={() => handleBanUser(user)} disabled={loading === user.id}>
                          <Ban className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Fake Names */}
          <TabsContent value="fake" className="max-h-[500px] overflow-y-auto space-y-3">
            {fakeNameUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không phát hiện tên ảo</p>
            ) : (
              fakeNameUsers.map(user => (
                <div key={user.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={user.avatar_url || ""} />
                    <AvatarFallback>{user.username[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{user.username}</p>
                    <p className="text-xs text-muted-foreground">Tên: {user.full_name || "(trống)"} • Pending: {formatNumber(user.pending_reward)}</p>
                  </div>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-700">Tên nghi ngờ</Badge>
                  <Button size="sm" variant="destructive" onClick={() => handleBanUser(user)} disabled={loading === user.id}>
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          {/* Missing Profile */}
          <TabsContent value="missing" className="max-h-[500px] overflow-y-auto space-y-3">
            {missingProfileUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có profile thiếu thông tin</p>
            ) : (
              missingProfileUsers.map(user => (
                <div key={user.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback>{user.username[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{user.username}</p>
                    <p className="text-xs text-muted-foreground">Pending: {formatNumber(user.pending_reward)} CAMLY</p>
                  </div>
                  <Badge variant="outline" className="bg-red-100 text-red-700">Thiếu thông tin</Badge>
                  <Button size="sm" variant="destructive" onClick={() => handleBanUser(user)} disabled={loading === user.id}>
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default WalletAbuseTab;
