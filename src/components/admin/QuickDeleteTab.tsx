import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trash2, Ban, AlertTriangle, Mail, UserX, Loader2 } from "lucide-react";
import { useAdminUserServerSearch } from "@/hooks/useAdminUserServerSearch";

interface UserData {
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

// Chuẩn hoá: bỏ dấu, đ/Đ, gộp khoảng trắng, bỏ ký tự đặc biệt (giữ chữ/số/@._-)
const normalizeVi = (s: string | null | undefined): string =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

interface QuickDeleteTabProps {
  users: UserData[];
  adminId: string;
  onRefresh: () => void;
}

const QuickDeleteTab = ({ users, adminId, onRefresh }: QuickDeleteTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  
  // Ban confirmation dialog
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [banReason, setBanReason] = useState("");

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = (raw: string): UserData[] => {
    const rawTrim = raw.trim();
    if (!rawTrim) return [];
    const termLower = rawTrim.toLowerCase();
    const termNorm = normalizeVi(rawTrim);
    const tokens = termNorm.split(" ").filter(Boolean);
    if (tokens.length === 0) return [];

    return users.filter(u => {
      // ID exact (UUID)
      if (u.id.toLowerCase() === termLower) return true;

      const haystack = [
        normalizeVi(u.username),
        normalizeVi(u.username_normalized),
        normalizeVi(u.full_name),
        (u.email ?? "").toLowerCase(),
        (u.wallet_address ?? "").toLowerCase(),
      ].join(" ");

      // Mọi token đều phải xuất hiện trong haystack
      return tokens.every(t => haystack.includes(t));
    });
  };

  const handleSearch = () => {
    const results = runSearch(searchTerm);
    setSearchResults(results);
    setHasSearched(true);
  };

  // Live search debounce 200ms — gõ tới đâu lọc tới đó
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    const t = setTimeout(() => {
      setSearchResults(runSearch(searchTerm));
      setHasSearched(true);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, users]);

  // Fallback server-side: bật khi local rỗng và đã gõ ≥ 2 ký tự
  const serverEnabled = hasSearched && searchResults.length === 0 && searchTerm.trim().length >= 2;
  const { data: serverResults = [], isFetching: serverLoading } = useAdminUserServerSearch(
    searchTerm,
    serverEnabled
  );
  const localIds = new Set(searchResults.map(u => u.id));
  const extraServerResults = serverResults.filter(u => !localIds.has(u.id));


  // High risk users suggestion
  const highRiskUsers = users
    .filter(u => !u.is_banned)
    .map(user => {
      let riskScore = 0;
      const reasons: string[] = [];
      
      if (user.pending_reward > 500000 && (user.posts_count || 0) === 0) {
        riskScore += 2;
        reasons.push("Pending cao, không bài viết");
      }
      if (!user.avatar_url) {
        riskScore += 1;
        reasons.push("Không avatar");
      }
      if (!user.full_name) {
        riskScore += 1;
        reasons.push("Không tên");
      }
      if (user.pending_reward > 2000000) {
        riskScore += 2;
        reasons.push("Pending rất cao");
      }
      
      return { ...user, riskScore, reasons };
    })
    .filter(u => u.riskScore >= 2)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  const openBanDialog = (user: UserData) => {
    setSelectedUser(user);
    setBanReason("");
    setBanDialogOpen(true);
  };

  const openDeleteDialog = (user: UserData) => {
    setDeleteUser(user);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleBan = async () => {
    if (!selectedUser) return;
    if (!banReason.trim()) {
      toast.error("Vui lòng nhập lý do cấm");
      return;
    }

    setLoading(selectedUser.id);
    try {
      const { error } = await supabase.rpc('ban_user_permanently', {
        p_admin_id: adminId,
        p_user_id: selectedUser.id,
        p_reason: banReason
      });

      if (error) throw error;
      
      toast.success(`Đã cấm vĩnh viễn ${selectedUser.username}`);
      setBanDialogOpen(false);
      setSelectedUser(null);
      setSearchResults(prev => prev.filter(u => u.id !== selectedUser.id));
      onRefresh();
    } catch (error: any) {
      console.error("Error banning user:", error);
      toast.error(error.message || "Lỗi khi cấm user");
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteUser) return;
    if (deleteConfirmText !== deleteUser.username) {
      toast.error("Vui lòng nhập đúng username để xác nhận");
      return;
    }

    setLoading(deleteUser.id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: deleteUser.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success(`Đã xóa vĩnh viễn tài khoản ${deleteUser.username}`);
      setDeleteDialogOpen(false);
      setDeleteUser(null);
      setSearchResults(prev => prev.filter(u => u.id !== deleteUser.id));
      onRefresh();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Lỗi khi xóa tài khoản");
    } finally {
      setLoading(null);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString('vi-VN');

  const getRiskBadge = (riskScore: number) => {
    if (riskScore >= 4) return <Badge className="bg-red-500">Rủi ro cao</Badge>;
    if (riskScore >= 2) return <Badge className="bg-yellow-500">Nghi ngờ</Badge>;
    return <Badge variant="outline">Theo dõi</Badge>;
  };

  const UserCard = ({ user, showRisk = false, riskScore = 0, reasons = [] }: { 
    user: UserData; 
    showRisk?: boolean; 
    riskScore?: number;
    reasons?: string[];
  }) => (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-shadow">
      <Avatar className="w-12 h-12">
        <AvatarImage src={user.avatar_url || ""} />
        <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{user.username}</p>
          {user.is_banned && <Badge variant="destructive">Đã cấm</Badge>}
          {showRisk && getRiskBadge(riskScore)}
        </div>
        {user.full_name && (
          <p className="text-sm text-foreground/80 truncate">{user.full_name}</p>
        )}
        {user.email && (
          <div className="flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground truncate max-w-[250px]">{user.email}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground font-mono truncate">{user.id}</p>
        {showRisk && reasons.length > 0 && (
          <p className="text-xs text-orange-600 mt-1">{reasons.join(" • ")}</p>
        )}
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span>Pending: {formatNumber(user.pending_reward)}</span>
          <span>Approved: {formatNumber(user.approved_reward)}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        {!user.is_banned && (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1"
            onClick={() => openBanDialog(user)}
            disabled={loading === user.id}
          >
            <Ban className="w-4 h-4" />
            Cấm
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="gap-1 bg-red-900 hover:bg-red-950"
          onClick={() => openDeleteDialog(user)}
          disabled={loading === user.id}
        >
          <UserX className="w-4 h-4" />
          Xóa TK
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Tìm & Xóa nhanh
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nhập UUID, username, tên đầy đủ, email hoặc địa chỉ ví..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} className="gap-2">
              <Search className="w-4 h-4" />
              Tìm
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mẹo: gõ tên không dấu, đảo thứ tự từ, hoặc dán UUID / ví / email đều được.
          </p>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tìm thấy {searchResults.length} kết quả trong {users.length} thành viên
              </p>
              {searchResults.map(user => (
                <UserCard key={user.id} user={user} />
              ))}
            </div>
          )}

          {extraServerResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Badge variant="secondary">Server</Badge>
                Kết quả mở rộng từ toàn hệ thống ({extraServerResults.length})
              </p>
              {extraServerResults.map(user => (
                <UserCard key={user.id} user={user as UserData} />
              ))}
            </div>
          )}

          {serverEnabled && serverLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang dò toàn bộ hệ thống…
            </div>
          )}

          {hasSearched && searchResults.length === 0 && extraServerResults.length === 0 && !serverLoading && searchTerm.trim() && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Không khớp user nào trong <strong>{users.length}</strong> thành viên đã tải và cũng không có trên server.
              Thử ID (UUID), username, tên đầy đủ (có hoặc không dấu), email hoặc địa chỉ ví.
            </div>
          )}
        </CardContent>
      </Card>

      {/* High Risk Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Gợi ý rủi ro cao ({highRiskUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {highRiskUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Không có user rủi ro cao
            </p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {highRiskUsers.map(user => (
                <UserCard 
                  key={user.id} 
                  user={user} 
                  showRisk 
                  riskScore={user.riskScore}
                  reasons={user.reasons}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ban Confirmation Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Cấm vĩnh viễn tài khoản
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-800">
                <strong>Cảnh báo:</strong> Hành động này sẽ:
              </p>
              <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                <li>Khóa tài khoản vĩnh viễn</li>
                <li>Reset toàn bộ thưởng về 0</li>
                <li>Đưa ví vào danh sách đen</li>
                <li>Gửi thông báo cho user</li>
              </ul>
            </div>
            
            <div>
              <p className="text-sm mb-2">
                Tài khoản: <strong>{selectedUser?.username}</strong>
              </p>
              {selectedUser?.email && (
                <p className="text-sm text-muted-foreground">
                  Email: {selectedUser.email}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Pending: {formatNumber(selectedUser?.pending_reward || 0)} CAMLY
              </p>
            </div>
            
            <Textarea
              placeholder="Nhập lý do cấm (bắt buộc)..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBan} 
              disabled={loading !== null}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Xác nhận cấm vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <UserX className="w-5 h-5" />
              Xóa vĩnh viễn tài khoản
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-100 rounded-lg border border-red-300">
              <p className="text-sm text-red-900 font-bold">
                ⚠️ CẢNH BÁO: Hành động này KHÔNG THỂ hoàn tác!
              </p>
              <ul className="text-sm text-red-800 mt-2 list-disc list-inside">
                <li>Xóa toàn bộ dữ liệu trên 30+ bảng</li>
                <li>Xóa tài khoản đăng nhập vĩnh viễn</li>
                <li>Bài viết, bình luận, tin nhắn sẽ bị xóa hết</li>
                <li>Không thể khôi phục bằng bất kỳ cách nào</li>
              </ul>
            </div>
            
            <div>
              <p className="text-sm mb-1">
                Tài khoản: <strong>{deleteUser?.username}</strong>
              </p>
              {deleteUser?.email && (
                <p className="text-sm text-muted-foreground">
                  Email: {deleteUser.email}
                </p>
              )}
              <p className="text-xs text-muted-foreground font-mono">{deleteUser?.id}</p>
            </div>
            
            <div>
              <p className="text-sm mb-2">
                Nhập <strong>{deleteUser?.username}</strong> để xác nhận xóa:
              </p>
              <Input
                placeholder={`Nhập "${deleteUser?.username}" để xác nhận`}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount} 
              disabled={loading !== null || deleteConfirmText !== deleteUser?.username}
              className="gap-2 bg-red-900 hover:bg-red-950"
            >
              <UserX className="w-4 h-4" />
              Xóa vĩnh viễn tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuickDeleteTab;
