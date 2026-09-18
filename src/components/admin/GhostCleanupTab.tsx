import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Ghost, Ban, RefreshCw, Users, AlertTriangle, CheckCircle2 } from "lucide-react";

interface GhostUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  reward_status: string;
  is_banned: boolean;
  pending_reward: number;
  approved_reward: number;
  device_hash?: string | null;
}

interface Props {
  adminId: string;
  onNavigate?: (tab: string) => void;
}

const GhostCleanupTab = ({ adminId, onNavigate }: Props) => {
  const [ghostUsers, setGhostUsers] = useState<GhostUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [banning, setBanning] = useState(false);
  const [stats, setStats] = useState({ total: 0, onHold: 0, banned: 0 });

  useEffect(() => {
    loadGhostUsers();
  }, []);

  const loadGhostUsers = async () => {
    setLoading(true);
    try {
      // Get profiles with no avatar AND no full_name
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, created_at, reward_status, is_banned, pending_reward, approved_reward")
        .or("avatar_url.is.null,full_name.is.null")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get activity counts for these users
      const userIds = profiles?.map(p => p.id) || [];
      
      // Get post counts
      const { data: postCounts } = await supabase
        .from("posts")
        .select("user_id")
        .in("user_id", userIds);

      // Get comment counts  
      const { data: commentCounts } = await supabase
        .from("comments")
        .select("user_id")
        .in("user_id", userIds);

      const postMap = new Map<string, number>();
      postCounts?.forEach(p => postMap.set(p.user_id, (postMap.get(p.user_id) || 0) + 1));
      
      const commentMap = new Map<string, number>();
      commentCounts?.forEach(c => commentMap.set(c.user_id, (commentMap.get(c.user_id) || 0) + 1));

      // Filter to only true ghosts (no posts, no comments)
      const ghosts = (profiles || []).filter(p => 
        !p.is_banned && 
        (postMap.get(p.id) || 0) === 0 && 
        (commentMap.get(p.id) || 0) === 0
      );

      // Get device hashes for ghost users
      const { data: devices } = await supabase
        .from("pplp_device_registry" as any)
        .select("user_id, device_hash")
        .in("user_id", ghosts.map(g => g.id));

      const deviceMap = new Map<string, string>();
      (devices as any[])?.forEach(d => deviceMap.set(d.user_id, d.device_hash));

      const enrichedGhosts: GhostUser[] = ghosts.map(g => ({
        ...g,
        device_hash: deviceMap.get(g.id) || null,
      }));

      setGhostUsers(enrichedGhosts);
      
      // Stats
      const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { count: onHoldCount } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("reward_status", "on_hold");
      const { count: bannedCount } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_banned", true);
      
      setStats({
        total: totalUsers || 0,
        onHold: onHoldCount || 0,
        banned: bannedCount || 0,
      });
    } catch (error) {
      console.error("Error loading ghost users:", error);
      toast.error("Lỗi khi tải danh sách");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === ghostUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ghostUsers.map(u => u.id)));
    }
  };

  const batchBan = async () => {
    if (selectedIds.size === 0) return;
    
    const confirmed = window.confirm(
      `Bạn có chắc muốn CẤM ${selectedIds.size} tài khoản ảo? Hành động này không thể hoàn tác.`
    );
    if (!confirmed) return;

    setBanning(true);
    try {
      const { data, error } = await supabase.rpc("batch_ban_ghost_users", {
        user_ids: Array.from(selectedIds),
        admin_id: adminId,
      });

      if (error) throw error;

      toast.success(`Đã cấm ${data} tài khoản ảo thành công! 🎉`);
      setSelectedIds(new Set());
      await loadGhostUsers();
    } catch (error: unknown) {
      console.error("Batch ban error:", error);
      toast.error(error instanceof Error ? error.message : "Lỗi khi cấm hàng loạt");
    } finally {
      setBanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Ghost className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{ghostUsers.length}</div>
            <div className="text-xs text-muted-foreground">Tài khoản ma</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold">{stats.onHold}</div>
            <div className="text-xs text-muted-foreground">Đang on_hold</div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-red-400 hover:shadow-md hover:scale-[1.02] transition-all"
          onClick={() => onNavigate?.("surveillance")}
          title="Nhấn để xem danh sách bị cấm"
        >
          <CardContent className="p-4 text-center">
            <Ban className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <div className="text-2xl font-bold">{stats.banned}</div>
            <div className="text-xs text-muted-foreground">Đã bị cấm</div>
            <div className="text-xs text-red-400 mt-1">→ Xem danh sách</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Tổng tài khoản</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Ghost className="w-5 h-5" />
              Tài khoản ma ({ghostUsers.length})
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadGhostUsers}>
                <RefreshCw className="w-4 h-4 mr-1" /> Làm mới
              </Button>
              <Button variant="outline" size="sm" onClick={selectAll}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {selectedIds.size === ghostUsers.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={batchBan}
                disabled={selectedIds.size === 0 || banning}
              >
                <Ban className="w-4 h-4 mr-1" />
                {banning ? "Đang cấm..." : `Cấm ${selectedIds.size} đã chọn`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {ghostUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              🎉 Không có tài khoản ma nào! Hệ thống sạch sẽ.
            </p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {ghostUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.has(user.id)}
                    onCheckedChange={() => toggleSelect(user.id)}
                  />
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <Ghost className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{user.username}</span>
                      {!user.full_name && (
                        <Badge variant="outline" className="text-xs">Không tên</Badge>
                      )}
                      {!user.avatar_url && (
                        <Badge variant="outline" className="text-xs">Không avatar</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3">
                      <span>Tạo: {new Date(user.created_at).toLocaleDateString("vi-VN")}</span>
                      <span>Status: {user.reward_status}</span>
                      {user.device_hash && (
                        <span>Device: {user.device_hash.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div>Pending: {user.pending_reward}</div>
                    <div>Approved: {user.approved_reward}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GhostCleanupTab;
