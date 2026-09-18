import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, Download, Search, Users, Wallet, Trophy, Clock, Loader2 } from "lucide-react";

interface QualifiedUser {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  real_links_count: number;
  days_active: number;
  donation_count: number;
  total_donated: number;
  light_score: number;
  tier: number;
  wallet_address: string | null;
  reward_status: string;
  created_at: string;
}

interface QualifiedUsersTabProps {
  adminId: string;
}

const QualifiedUsersTab = ({ adminId }: QualifiedUsersTabProps) => {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["qualified-reward-users", adminId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_qualified_reward_users", {
        p_admin_id: adminId,
      });
      if (error) throw error;
      return (data as unknown as QualifiedUser[]) || [];
    },
    enabled: !!adminId,
  });

  const filtered = users.filter(
    (u) =>
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    approved: users.filter((u) => u.reward_status === "approved").length,
    onHold: users.filter((u) => u.reward_status === "on_hold" || u.reward_status === "pending").length,
    noWallet: users.filter((u) => !u.wallet_address).length,
  };

  const handleAction = async (userId: string, action: "approved" | "rejected") => {
    setProcessingIds((prev) => new Set(prev).add(userId));
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ reward_status: action })
        .eq("id", userId);
      if (updateError) throw updateError;

      await supabase.from("audit_logs").insert({
        admin_id: adminId,
        action: action === "approved" ? "QUALIFY_APPROVE" : "QUALIFY_REJECT",
        target_user_id: userId,
        reason: `Admin ${action} user qua tab Đủ tiêu chí`,
      });

      toast.success(action === "approved" ? "Đã duyệt thành công" : "Đã từ chối");
      refetch();
    } catch (err: unknown) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : "Unknown"));
    } finally {
      setProcessingIds((prev) => {
        const s = new Set(prev);
        s.delete(userId);
        return s;
      });
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await handleAction(id, "approved");
    }
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.user_id)));
    }
  };

  const exportCSV = () => {
    const BOM = "\uFEFF";
    const header = "Username,Tên,Social Links,Ngày hoạt động,Donations,Tổng tặng,Light Score,Tier,Ví BSC,Trạng thái\n";
    const rows = users
      .map(
        (u) =>
          `${u.username},"${u.full_name || ""}",${u.real_links_count},${u.days_active},${u.donation_count},${u.total_donated},${u.light_score},${u.tier},"${u.wallet_address || "Chưa có"}",${u.reward_status}`
      )
      .join("\n");
    const blob = new Blob([BOM + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualified_users_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã xuất CSV thành công");
  };

  const tierLabel = (t: number) => {
    switch (t) {
      case 3: return "Guardian";
      case 2: return "Bearer";
      case 1: return "Seeker";
      default: return "New";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      case "banned":
        return <Badge className="bg-red-700/20 text-red-500 border-red-700/30">Banned</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{status || "pending"}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Đủ tiêu chí
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> Đã Approved
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" /> On Hold / Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-yellow-500">{stats.onHold}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-orange-500" /> Chưa có ví
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold text-orange-500">{stats.noWallet}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleBatchApprove} size="sm" className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Approve {selectedIds.size} user
            </Button>
          )}
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Xuất CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-center">Social</TableHead>
                <TableHead className="text-center">Ngày HĐ</TableHead>
                <TableHead className="text-center">Donations</TableHead>
                <TableHead className="text-right">Light Score</TableHead>
                <TableHead className="text-center">Ví BSC</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u, i) => (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.user_id)}
                      onChange={() => toggleSelect(u.user_id)}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                      <img
                        src={u.avatar_url || "/placeholder.svg"}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-medium text-sm">{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.full_name || "—"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">{u.real_links_count}</TableCell>
                  <TableCell className="text-center">{u.days_active}</TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm">{u.donation_count}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Number(u.total_donated).toLocaleString()})
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div>
                      <span className="font-medium">{Number(u.light_score).toLocaleString()}</span>
                      <Badge variant="outline" className="ml-1 text-xs">
                        {tierLabel(u.tier)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {u.wallet_address ? (
                      <Badge variant="outline" className="text-xs">
                        {u.wallet_address.slice(0, 6)}...{u.wallet_address.slice(-4)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-orange-500">Chưa có</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{statusBadge(u.reward_status)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex gap-1 justify-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                        onClick={() => handleAction(u.user_id, "approved")}
                        disabled={processingIds.has(u.user_id) || u.reward_status === "approved"}
                        title="Approve"
                      >
                        {processingIds.has(u.user_id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => handleAction(u.user_id, "rejected")}
                        disabled={processingIds.has(u.user_id) || u.reward_status === "rejected"}
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Không tìm thấy user nào
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default QualifiedUsersTab;
