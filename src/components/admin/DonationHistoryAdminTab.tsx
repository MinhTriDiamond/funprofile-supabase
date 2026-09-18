import { useState } from 'react';
import { 
  Gift, Search, Download, RefreshCw, Loader2,
  ChevronLeft, ChevronRight, Sparkles, ArrowUpDown, ScanSearch, ArrowLeft, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminDonationHistory } from '@/hooks/useAdminDonationHistory';
import { DonationRecord } from '@/types/donation';
import { DonationSuccessCard } from '@/components/donations/DonationSuccessCard';
import { DonationReceivedCard } from '@/components/donations/DonationReceivedCard';
import type { UnmappableTransaction } from '@/types/adminResponses';
import { useUnifiedTransactionsExport } from '@/hooks/useUnifiedTransactionsExport';
import { mapUnifiedToRows } from '@/utils/export/mapUnifiedRows';
import { exportTransactionsExcel } from '@/utils/export';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import { formatNumber, formatDate } from '@/lib/formatters';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';


interface MissingTransaction {
  id: string;
  tx_hash: string;
  from_address: string;
  to_address: string;
  amount: string;
  token_symbol: string;
  created_at: string;
  sender_id: string;
  sender_username: string;
  recipient_id: string;
  recipient_username: string;
}

export function DonationHistoryAdminTab() {
  const {
    donations,
    totalCount,
    totalPages,
    stats,
    filters,
    isLoading,
    isStatsLoading,
    updateFilters,
    resetFilters,
    refetch,
  } = useAdminDonationHistory();

  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminRole();
  const { fetchRaw: fetchUnifiedRaw } = useUnifiedTransactionsExport({
    scope: 'admin_all',
    filters: {
      token: filters.tokenSymbol,
      status: filters.status,
      dateFrom: filters.dateFrom,
      // Giữ đúng hành vi cũ: dateTo bao trọn cả ngày (23:59:59).
      dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59` : filters.dateTo,
      search: filters.searchTerm,
    },
  });


  const [selectedDonation, setSelectedDonation] = useState<DonationRecord | null>(null);
  const [celebrationType, setCelebrationType] = useState<'sent' | 'received'>('sent');
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [viewMode, setViewMode] = useState<'donations' | 'scanResults'>('donations');
  const [missingTx, setMissingTx] = useState<MissingTransaction[]>([]);
  const [unmappableTx, setUnmappableTx] = useState<UnmappableTransaction[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);

  const handleDonationClick = (donation: DonationRecord) => {
    setSelectedDonation(donation);
    // Default to "sent" view (gold card)
    setCelebrationType('sent');
    setIsCelebrationOpen(true);
  };

  const handleCloseCelebration = () => {
    setIsCelebrationOpen(false);
    setSelectedDonation(null);
  };

  const handleScan = async () => {
    try {
      setIsScanning(true);
      const { data, error } = await supabase.functions.invoke('backfill-donations', {
        body: { mode: 'scan' },
      });
      if (error) throw error;
      setMissingTx(data.missing || []);
      setUnmappableTx(data.unmappable || []);
      setTotalScanned(data.totalScanned || 0);
      setViewMode('scanResults');
      if (data.missing?.length === 0) {
        toast.success('Không có giao dịch nào bị thiếu!');
      }
    } catch (error: unknown) {
      console.error('Scan error:', error);
      toast.error('Lỗi khi quét: ' + (error instanceof Error ? error.message : 'Unknown'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleBackfill = async () => {
    try {
      setIsBackfilling(true);
      const ids = missingTx.map((t) => t.id);
      const { data, error } = await supabase.functions.invoke('backfill-donations', {
        body: { mode: 'backfill', transactionIds: ids },
      });
      if (error) throw error;
      toast.success(`Đã bổ sung ${data.inserted} giao dịch, bỏ qua ${data.skipped}`);
      setViewMode('donations');
      setMissingTx([]);
      refetch();
    } catch (error: unknown) {
      console.error('Backfill error:', error);
      toast.error('Lỗi khi backfill: ' + (error instanceof Error ? error.message : 'Unknown'));
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      // PILOT #3: đổi sang nguồn unified (SSOT) + Excel có mask PII + audit log.
      // Giữ ĐÚNG phạm vi cũ: chỉ nhánh `donations`. Nhánh `transactions` hiện có
      // 40 dòng amount_decimal chưa scale theo decimals (raw wei) → chưa đưa vào
      // export cho tới khi lỗi scale được xử lý riêng.
      const raw = (await fetchUnifiedRaw()).filter((r) => r.source_table === 'donations');
      let rows = mapUnifiedToRows(raw);

      // 2 filter RPC chưa hỗ trợ → lọc client-side đúng như luồng cũ.
      if (filters.type !== 'all') {
        rows = rows.filter((r) => (r.type ?? '').toLowerCase().includes(filters.type));
      }
      if (filters.onlyOnchain) {
        rows = rows.filter((r) => !!r.txHash);
      }
      rows = rows.map((r, i) => ({ ...r, stt: i + 1 }));


      if (rows.length === 0) {
        toast.error('Không có dữ liệu để xuất');
        return;
      }

      await exportTransactionsExcel({
        rows,
        meta: {
          title: 'Lịch Sử Tặng Thưởng Toàn Hệ Thống',
          userDisplayName: 'Admin',
          isOwner: false,
          surface: 'admin_donation_history',
          filterParams: {
            dateFrom: filters.dateFrom || null,
            dateTo: filters.dateTo || null,
            token: filters.tokenSymbol,
            status: filters.status,
            type: filters.type,
            search: filters.searchTerm || null,
            onlyOnchain: filters.onlyOnchain,
          },
          totalAvailable: rows.length,
        },
        filenameBase: 'admin-donations',
        currentUserId: userId,
        isAdminRole: isAdmin,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Lỗi khi xuất file');
    } finally {
      setIsExporting(false);
    }
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Thành công</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Đang xử lý</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Thất bại</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {viewMode === 'scanResults' ? (
        /* ===== SCAN RESULTS FULL PAGE ===== */
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode('donations')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Quay lại
              </Button>
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                <ScanSearch className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">Kết Quả Quét Giao Dịch Thiếu</h2>
                <p className="text-sm text-muted-foreground">So sánh transactions on-chain với donations đã ghi nhận</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tổng đã quét</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalScanned)}</div>
                <p className="text-xs text-muted-foreground">giao dịch on-chain</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  GD thiếu (có thể bổ sung)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{missingTx.length}</div>
                <p className="text-xs text-muted-foreground">đã map được người nhận</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Không xác định</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">{unmappableTx.length}</div>
                <p className="text-xs text-muted-foreground">không map được người nhận</p>
              </CardContent>
            </Card>
          </div>

          {/* Missing Transactions Table */}
          <Card>
            <CardContent className="p-0">
              {missingTx.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Người gửi</TableHead>
                        <TableHead>Người nhận</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>TX Hash</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingTx.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium">@{tx.sender_username}</TableCell>
                          <TableCell className="font-medium">@{tx.recipient_username}</TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(parseFloat(tx.amount))}</TableCell>
                          <TableCell><Badge variant="outline">{tx.token_symbol}</Badge></TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                            {tx.tx_hash}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(tx.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="p-4 border-t">
                    <Button
                      onClick={handleBackfill}
                      disabled={isBackfilling}
                      className="w-full"
                      size="lg"
                    >
                      {isBackfilling ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Backfill tất cả ({missingTx.length} giao dịch)
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-1">Không có giao dịch nào bị thiếu!</h3>
                  <p className="text-muted-foreground">Tất cả giao dịch on-chain đã được ghi nhận đầy đủ trong hệ thống.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
      /* ===== NORMAL DONATIONS VIEW ===== */
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Lịch Sử Tặng Thưởng Toàn Hệ Thống</h2>
            <p className="text-sm text-muted-foreground">Quản lý tất cả giao dịch tặng quà</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ScanSearch className="w-4 h-4 mr-2" />
            )}
            Quét GD thiếu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || donations.length === 0}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng giao dịch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatNumber(stats?.totalCount || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.confirmedCount || 0} thành công
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng CAMLY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {isStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatNumber(stats?.totalByToken?.CAMLY || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng BNB</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {isStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatNumber(stats?.totalByToken?.BNB || 0, 4)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              Light Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {isStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatNumber(stats?.totalLightScore || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo username..."
                  value={filters.searchTerm}
                  onChange={(e) => updateFilters({ searchTerm: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>

            <Select
              value={filters.tokenSymbol}
              onValueChange={(value) => updateFilters({ tokenSymbol: value })}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Token" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả token</SelectItem>
                <SelectItem value="CAMLY">CAMLY</SelectItem>
                <SelectItem value="BNB">BNB</SelectItem>
                <SelectItem value="FUN">FUN</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(value: any) => updateFilters({ status: value })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="confirmed">Thành công</SelectItem>
                <SelectItem value="pending">Đang xử lý</SelectItem>
                <SelectItem value="failed">Thất bại</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilters({ dateFrom: e.target.value })}
              className="w-[150px]"
              placeholder="Từ ngày"
            />

            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilters({ dateTo: e.target.value })}
              className="w-[150px]"
              placeholder="Đến ngày"
            />

            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Xóa lọc
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : donations.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-muted-foreground">Không có giao dịch nào</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người gửi</TableHead>
                    <TableHead>Người nhận</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Light Score</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Thời gian
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((donation) => (
                    <TableRow
                      key={donation.id}
                      className="cursor-pointer hover:bg-amber-50/50"
                      onClick={() => handleDonationClick(donation)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={donation.sender?.avatar_url || undefined} />
                            <AvatarFallback>
                              {donation.sender?.username?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">@{donation.sender?.username || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={donation.recipient?.avatar_url || undefined} />
                            <AvatarFallback>
                              {donation.recipient?.username?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">@{donation.recipient?.username || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatNumber(parseFloat(donation.amount))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{donation.token_symbol}</Badge>
                      </TableCell>
                      <TableCell>
                        {donation.light_score_earned ? (
                          <span className="text-purple-600 font-medium">
                            +{donation.light_score_earned}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(donation.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(donation.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Hiển thị {donations.length} / {totalCount} giao dịch
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFilters({ page: filters.page - 1 })}
                    disabled={filters.page <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Trang {filters.page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFilters({ page: filters.page + 1 })}
                    disabled={filters.page >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Celebration Cards */}
      {selectedDonation && celebrationType === 'sent' && (
        <DonationSuccessCard
          isOpen={isCelebrationOpen}
          onClose={handleCloseCelebration}
          data={{
            id: selectedDonation.id,
            amount: selectedDonation.amount,
            tokenSymbol: selectedDonation.token_symbol,
            senderUsername: selectedDonation.sender?.username || 'Unknown',
            senderAvatarUrl: selectedDonation.sender?.avatar_url,
            recipientUsername: selectedDonation.recipient?.username || 'Unknown',
            recipientAvatarUrl: selectedDonation.recipient?.avatar_url,
            message: selectedDonation.message,
            txHash: selectedDonation.tx_hash,
            lightScoreEarned: selectedDonation.light_score_earned || 0,
            createdAt: selectedDonation.created_at,
          }}
        />
      )}

      {selectedDonation && celebrationType === 'received' && (
        <DonationReceivedCard
          isOpen={isCelebrationOpen}
          onClose={handleCloseCelebration}
          data={{
            id: selectedDonation.id,
            amount: selectedDonation.amount,
            tokenSymbol: selectedDonation.token_symbol,
            senderUsername: selectedDonation.sender?.username || 'Unknown',
            senderAvatarUrl: selectedDonation.sender?.avatar_url,
            senderId: selectedDonation.sender?.id || '',
            message: selectedDonation.message,
            txHash: selectedDonation.tx_hash,
            createdAt: selectedDonation.created_at,
          }}
        />
      )}

      </>
      )}
    </div>
  );
}
