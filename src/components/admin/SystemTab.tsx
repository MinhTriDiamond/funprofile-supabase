import { useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, CloudUpload, GitMerge, RefreshCw, Database, Trash2, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BackfillScanResult, BackfillResult, DeleteBannedResult } from '@/types/adminResponses';
import BlockchainTab from "./BlockchainTab";
import MediaMigrationTab from "./MediaMigrationTab";
import { MergeRequestsTab } from "./MergeRequestsTab";
import TransactionLookup from "./TransactionLookup";
import AllTransactions from "./AllTransactions";
import ManualDonation from "./ManualDonation";
import ExternalWalletLabelsTab from "./ExternalWalletLabelsTab";
import EpochT4MigrationCard from "./EpochT4MigrationCard";
import { PPLPv25EnginePanel } from "./PPLPv25EnginePanel";
import { LightScoreParameterPanel } from "./LightScoreParameterPanel";
import { IdentityTrustAdminPanel } from "./IdentityTrustAdminPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SystemTabProps {
  adminId: string;
}

const SystemTab = ({ adminId }: SystemTabProps) => {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [deletingBanned, setDeletingBanned] = useState(false);
  const [deleteBannedResult, setDeleteBannedResult] = useState<DeleteBannedResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<BackfillScanResult | null>(null);

  const handleScanOnly = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("auto-backfill-donations", {
        body: { mode: "scan_only" },
      });
      if (error) throw error;
      setScanResult(data);
      const totalMissing = (data?.summary?.missing_donations_count || 0) + (data?.summary?.missing_posts_count || 0);
      if (totalMissing > 0) {
        toast.info(`Tìm thấy ${totalMissing} bản ghi bị thiếu`);
      } else {
        toast.success("Không có giao dịch nào bị thiếu!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      console.error("Scan error:", msg);
      toast.error("Lỗi khi quét: " + msg);
    } finally {
      setScanning(false);
    }
  };

  const handleBackfillDonations = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("auto-backfill-donations");
      if (error) throw error;
      setBackfillResult(data);
      setScanResult(null); // Clear scan after backfill
      toast.success(`Backfill hoàn tất: ${data?.inserted || 0} giao dịch được phục hồi`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      console.error("Backfill error:", msg);
      toast.error("Lỗi khi chạy backfill: " + msg);
    } finally {
      setBackfilling(false);
    }
  };

  const handleDeleteBannedUsers = async () => {
    setDeletingBanned(true);
    setDeleteBannedResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("batch-delete-banned-users");
      if (error) throw error;
      setDeleteBannedResult(data);
      if (data?.deleted > 0) {
        toast.success(`Đã xoá ${data.deleted} tài khoản bị ban`);
      } else {
        toast.info(data?.message || "Không có user bị ban nào để xoá");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      console.error("Delete banned users error:", msg);
      toast.error("Lỗi: " + msg);
    } finally {
      setDeletingBanned(false);
    }
  };

  const shortenTxHash = (hash: string) => {
    if (!hash) return "—";
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <PPLPv25EnginePanel />
      <LightScoreParameterPanel />
      <IdentityTrustAdminPanel />
      <EpochT4MigrationCard />

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-primary" />
            Công cụ Migration & dọn dẹp media
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Mở trang migration đầy đủ để dọn video orphan trên Cloudflare Stream, migrate media và kiểm tra trước khi xoá.
          </p>
          <Button asChild className="shrink-0">
            <Link to="/admin/migration">
              Mở Admin Migration
              <CloudUpload className="w-4 h-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Backfill Donations Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-500" />
            Phục hồi giao dịch bị thiếu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Quét tất cả giao dịch đã xác nhận và tạo bản ghi donations cho những giao dịch bị thiếu. 
            Hỗ trợ tìm người nhận qua cả wallet_address và public_wallet_address.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={handleScanOnly} 
              disabled={scanning}
              variant="outline"
              className="gap-2"
            >
              <Search className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? "Đang quét..." : "Quét kiểm tra"}
            </Button>
            <Button 
              onClick={handleBackfillDonations} 
              disabled={backfilling}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
              {backfilling ? "Đang phục hồi..." : "Chạy Backfill ngay"}
            </Button>
          </div>

          {/* Scan Results */}
          {scanResult && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
                <p>📊 Đã quét: <strong>{scanResult.total_scanned}</strong> giao dịch</p>
                <p>🔴 Thiếu donation: <strong>{scanResult.summary?.missing_donations_count || 0}</strong> (phục hồi được: {scanResult.summary?.recoverable_donations || 0}, không xác định người nhận: {scanResult.summary?.unrecoverable_donations || 0})</p>
                <p>🟡 Thiếu bài chúc mừng: <strong>{scanResult.summary?.missing_posts_count || 0}</strong></p>
              </div>

              {/* Missing Donations Table */}
              {scanResult.missing_donations?.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">🔴 Giao dịch thiếu Donation ({scanResult.missing_donations.length})</p>
                  <div className="max-h-80 overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Người gửi</TableHead>
                          <TableHead>Người nhận</TableHead>
                          <TableHead>Số tiền</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead>TX Hash</TableHead>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Trạng thái</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scanResult.missing_donations.map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{i + 1}</TableCell>
                            <TableCell className="text-xs font-medium">@{item.sender_username}</TableCell>
                            <TableCell className="text-xs font-medium">
                              {item.recipient_username ? `@${item.recipient_username}` : <span className="text-destructive">Không xác định</span>}
                            </TableCell>
                            <TableCell className="text-xs">{item.amount}</TableCell>
                            <TableCell className="text-xs">{item.token_symbol}</TableCell>
                            <TableCell className="text-xs font-mono">{shortenTxHash(item.tx_hash)}</TableCell>
                            <TableCell className="text-xs">{formatDate(item.created_at)}</TableCell>
                            <TableCell className="text-xs">
                              {item.can_recover 
                                ? <span className="text-green-600">✅ Phục hồi được</span>
                                : <span className="text-destructive">❌ Không thể</span>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Missing Posts Table */}
              {scanResult.missing_posts?.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">🟡 Donation thiếu bài chúc mừng ({scanResult.missing_posts.length})</p>
                  <div className="max-h-80 overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Người gửi</TableHead>
                          <TableHead>Người nhận</TableHead>
                          <TableHead>Số tiền</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead>TX Hash</TableHead>
                          <TableHead>Thời gian</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scanResult.missing_posts.map((item, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{i + 1}</TableCell>
                            <TableCell className="text-xs font-medium">@{item.sender_username}</TableCell>
                            <TableCell className="text-xs font-medium">@{item.recipient_username}</TableCell>
                            <TableCell className="text-xs">{item.amount}</TableCell>
                            <TableCell className="text-xs">{item.token_symbol}</TableCell>
                            <TableCell className="text-xs font-mono">{shortenTxHash(item.tx_hash)}</TableCell>
                            <TableCell className="text-xs">{formatDate(item.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {scanResult.missing_donations?.length === 0 && scanResult.missing_posts?.length === 0 && (
                <p className="text-sm text-green-600 font-medium">✅ Tất cả giao dịch đều đầy đủ, không cần phục hồi!</p>
              )}
            </div>
          )}

          {/* Backfill Results */}
          {backfillResult && (
            <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
              <p>📊 Đã quét: <strong>{backfillResult.scanned}</strong> giao dịch</p>
              <p>🔍 Thiếu donation: <strong>{backfillResult.missing}</strong></p>
              <p>✅ Đã phục hồi donation: <strong>{backfillResult.inserted}</strong></p>
              <p>🎉 Bài chúc mừng đã tạo: <strong>{backfillResult.posts_created ?? 0}</strong></p>
              <p>⏭️ Bỏ qua (không tìm được người nhận): <strong>{backfillResult.skipped}</strong></p>
              
              {backfillResult.posts_details && backfillResult.posts_details.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="font-medium mb-2">📋 Chi tiết bài chúc mừng đã phục hồi:</p>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {backfillResult.posts_details.map((d, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        • <strong>@{d.sender}</strong> → <strong>@{d.recipient}</strong>: {d.amount} {d.token}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Lookup */}
      <TransactionLookup />

      {/* All Transactions */}
      <AllTransactions />

      {/* Manual Donation */}
      <ManualDonation />

      {/* Delete Banned Users Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Xoá tất cả user bị ban
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Xoá vĩnh viễn tất cả tài khoản đã bị cấm (is_banned = true). 
            Thao tác này không thể hoàn tác - tất cả dữ liệu liên quan sẽ bị xoá.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
                disabled={deletingBanned}
                className="gap-2"
              >
                <Trash2 className={`w-4 h-4 ${deletingBanned ? 'animate-spin' : ''}`} />
                {deletingBanned ? "Đang xoá..." : "Xoá tất cả user bị ban"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận xoá tất cả user bị ban?</AlertDialogTitle>
                <AlertDialogDescription>
                  Thao tác này sẽ xoá vĩnh viễn tất cả tài khoản đã bị cấm cùng toàn bộ dữ liệu liên quan 
                  (bài viết, bình luận, tin nhắn, giao dịch, ví...). 
                  Không thể hoàn tác sau khi thực hiện.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteBannedUsers} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Xoá tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {deleteBannedResult && (
            <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
              <p>📊 Tổng user bị ban: <strong>{deleteBannedResult.total_banned}</strong></p>
              <p>✅ Đã xoá thành công: <strong>{deleteBannedResult.deleted}</strong></p>
              {deleteBannedResult.errors?.length > 0 && (
                <div>
                  <p className="text-destructive">❌ Lỗi: {deleteBannedResult.errors.length}</p>
                  {deleteBannedResult.errors.map((e, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground ml-4">
                      • {e.username} ({e.userId.slice(0, 8)}...): {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="blockchain" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="blockchain" className="gap-2 py-2">
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Blockchain</span>
          </TabsTrigger>
          <TabsTrigger value="migration" className="gap-2 py-2">
            <CloudUpload className="w-4 h-4" />
            <span className="hidden sm:inline">Migration</span>
          </TabsTrigger>
          <TabsTrigger value="merge" className="gap-2 py-2">
            <GitMerge className="w-4 h-4" />
            <span className="hidden sm:inline">Merge User</span>
          </TabsTrigger>
          <TabsTrigger value="wallet-labels" className="gap-2 py-2">
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Nhãn Ví</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blockchain">
          <BlockchainTab adminId={adminId} />
        </TabsContent>
        <TabsContent value="migration">
          <MediaMigrationTab />
        </TabsContent>
        <TabsContent value="merge">
          <MergeRequestsTab />
        </TabsContent>
        <TabsContent value="wallet-labels">
          <ExternalWalletLabelsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemTab;
