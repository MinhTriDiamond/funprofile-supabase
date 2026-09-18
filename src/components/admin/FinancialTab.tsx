import { useState, useEffect } from "react";
import { usePersistedTab } from "@/hooks/usePersistedTab";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  RefreshCw,
  Search,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
  History,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Download,
  Calculator,
  Eye,
  RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface GrandTotals {
  totalDeposit: number;
  totalWithdraw: number;
  totalBet: number;
  totalWin: number;
  totalLoss: number;
  totalProfit: number;
  userCount: number;
}

interface UserFinancial {
  id: string;
  username: string;
  avatar_url: string | null;
  grand_total_deposit: number;
  grand_total_withdraw: number;
  grand_total_bet: number;
  grand_total_win: number;
  grand_total_loss: number;
  grand_total_profit: number;
  financial_updated_at: string | null;
}

interface PlatformData {
  id: string;
  client_id: string;
  user_id: string;
  total_deposit: number;
  total_withdraw: number;
  total_bet: number;
  total_win: number;
  total_loss: number;
  total_profit: number;
  last_sync_at: string;
  sync_count: number;
  username?: string;
  avatar_url?: string | null;
}

interface OAuthClient {
  client_id: string;
  client_name: string;
  platform_name: string | null;
  logo_url: string | null;
}

interface FinancialTransaction {
  id: string;
  user_id: string;
  client_id: string;
  action: string;
  amount: number;
  currency: string;
  transaction_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

interface ReconciliationLog {
  id: string;
  run_at: string;
  status: string;
  level: number;
  discrepancies: Array<{
    user_id: string;
    client_id: string;
    stored: number;
    calculated: number;
    diff: number;
    diff_percent: number;
    level: number;
  }>;
  total_checked: number;
  total_mismatched: number;
  auto_adjusted: boolean;
  notes: string | null;
}

const formatNumber = (value: number): string => {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B';
  } else if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  } else if (value >= 1_000) {
    return (value / 1_000).toFixed(2) + 'K';
  }
  return value.toLocaleString();
};

const formatFullNumber = (value: number): string => {
  return value.toLocaleString('vi-VN');
};

const getActionColor = (action: string): string => {
  switch (action) {
    case 'DEPOSIT':
    case 'RECEIVE_MONEY':
    case 'WIN':
    case 'CLAIM_REWARD':
    case 'ADJUSTMENT_ADD':
      return 'text-green-600';
    case 'WITHDRAW':
    case 'SEND_MONEY':
    case 'LOSS':
    case 'ADJUSTMENT_SUB':
      return 'text-red-600';
    case 'BET':
      return 'text-purple-600';
    default:
      return 'text-muted-foreground';
  }
};

const getLevelBadge = (level: number) => {
  switch (level) {
    case 1:
      return <Badge variant="secondary" className="bg-green-100 text-green-700">Level 1 - Auto</Badge>;
    case 2:
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">Level 2 - Review</Badge>;
    case 3:
      return <Badge variant="destructive">Level 3 - Critical</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'ok':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'minor_adjustment':
      return <CheckCircle className="w-4 h-4 text-blue-600" />;
    case 'mismatch':
      return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    case 'critical':
      return <XCircle className="w-4 h-4 text-red-600" />;
    default:
      return null;
  }
};

const FinancialTab = () => {
  const [loading, setLoading] = useState(true);
  const [grandTotals, setGrandTotals] = useState<GrandTotals | null>(null);
  const [userFinancials, setUserFinancials] = useState<UserFinancial[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [reconciliationLogs, setReconciliationLogs] = useState<ReconciliationLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({
    key: 'grand_total_bet',
    direction: 'desc'
  });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedRecon, setExpandedRecon] = useState<string | null>(null);
  const [runningReconciliation, setRunningReconciliation] = useState(false);
  const [recalculateDialogOpen, setRecalculateDialogOpen] = useState(false);
  const [selectedUserForRecalc, setSelectedUserForRecalc] = useState<{userId: string, clientId: string, username: string} | null>(null);
  const [activeTab, setActiveTab] = usePersistedTab('admin-financial-tab', 'users', ['users', 'platforms', 'transactions', 'reconciliation'] as const);
  const [transactionDialogUser, setTransactionDialogUser] = useState<string | null>(null);
  const { userId: currentAdminId } = useCurrentUser();

  useEffect(() => {
    loadData();
  }, []);

  // Get latest critical reconciliation issue
  const latestCriticalLog = reconciliationLogs.find(log => 
    log.status === 'critical' || log.status === 'mismatch'
  );

  // Recalculate from discrepancy row
  const handleRecalculateFromDiscrepancy = async (userId: string, clientId: string) => {
    if (!currentAdminId) {
      toast.error("Admin ID not found");
      return;
    }
    
    try {
      const { error } = await supabase.rpc('recalculate_user_financial', {
        p_user_id: userId,
        p_client_id: clientId,
        p_admin_id: currentAdminId
      });
      
      if (error) throw error;
      
      toast.success("Đã tính lại số dư từ transaction log");
      await loadData();
    } catch (error) {
      console.error("Error recalculating:", error);
      toast.error("Lỗi khi tính lại số dư");
    }
  };

  // View transactions for specific user
  const handleViewUserTransactions = (userId: string) => {
    setTransactionDialogUser(userId);
    setActiveTab("transactions");
    setSearchTerm(userId);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadGrandTotals(),
        loadUserFinancials(),
        loadPlatformData(),
        loadOAuthClients(),
        loadTransactions(),
        loadReconciliationLogs()
      ]);
    } catch (error) {
      console.error("Error loading financial data:", error);
      toast.error("Không thể tải dữ liệu tài chính");
    } finally {
      setLoading(false);
    }
  };

  const loadGrandTotals = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('grand_total_deposit, grand_total_withdraw, grand_total_bet, grand_total_win, grand_total_loss, grand_total_profit')
      .gt('grand_total_bet', 0);

    if (error) throw error;

    const totals = data?.reduce((acc, user) => ({
      totalDeposit: acc.totalDeposit + (user.grand_total_deposit || 0),
      totalWithdraw: acc.totalWithdraw + (user.grand_total_withdraw || 0),
      totalBet: acc.totalBet + (user.grand_total_bet || 0),
      totalWin: acc.totalWin + (user.grand_total_win || 0),
      totalLoss: acc.totalLoss + (user.grand_total_loss || 0),
      totalProfit: acc.totalProfit + (user.grand_total_profit || 0),
      userCount: acc.userCount + 1
    }), {
      totalDeposit: 0,
      totalWithdraw: 0,
      totalBet: 0,
      totalWin: 0,
      totalLoss: 0,
      totalProfit: 0,
      userCount: 0
    });

    setGrandTotals(totals || null);
  };

  const loadUserFinancials = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, grand_total_deposit, grand_total_withdraw, grand_total_bet, grand_total_win, grand_total_loss, grand_total_profit, financial_updated_at')
      .gt('grand_total_bet', 0)
      .order('grand_total_bet', { ascending: false });

    if (error) throw error;
    setUserFinancials(data || []);
  };

  const loadPlatformData = async () => {
    const { data, error } = await supabase
      .from('platform_financial_data')
      .select('*')
      .order('total_bet', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const enrichedData = data.map(d => ({
        ...d,
        username: profileMap.get(d.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(d.user_id)?.avatar_url
      }));

      setPlatformData(enrichedData);
    } else {
      setPlatformData([]);
    }
  };

  const loadOAuthClients = async () => {
    const { data, error } = await supabase
      .from('oauth_clients')
      .select('client_id, client_name, platform_name, logo_url')
      .eq('is_active', true);

    if (error) throw error;
    setOauthClients(data || []);
  };

  const loadTransactions = async () => {
    const { data, error } = await supabase
      .from('financial_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error loading transactions:", error);
      return;
    }

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const enrichedData = data.map(d => ({
        ...d,
        username: profileMap.get(d.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(d.user_id)?.avatar_url,
        metadata: (d.metadata || {}) as Record<string, unknown>
      }));

      setTransactions(enrichedData);
    } else {
      setTransactions([]);
    }
  };

  const loadReconciliationLogs = async () => {
    const { data, error } = await supabase
      .from('reconciliation_logs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error loading reconciliation logs:", error);
      return;
    }

    const logs = (data || []).map(d => ({
      ...d,
      discrepancies: (d.discrepancies || []) as ReconciliationLog['discrepancies']
    }));
    setReconciliationLogs(logs);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedUsers = [...userFinancials]
    .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortConfig.key as keyof UserFinancial] as number || 0;
      const bVal = b[sortConfig.key as keyof UserFinancial] as number || 0;
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });

  const filteredPlatformData = platformData
    .filter(d => selectedClient === 'all' || d.client_id === selectedClient)
    .filter(d => d.username?.toLowerCase().includes(searchTerm.toLowerCase()));

  const filteredTransactions = transactions
    .filter(t => selectedClient === 'all' || t.client_id === selectedClient)
    .filter(t => selectedAction === 'all' || t.action === selectedAction)
    .filter(t => t.username?.toLowerCase().includes(searchTerm.toLowerCase()) || t.transaction_id.includes(searchTerm));

  const getClientName = (clientId: string) => {
    const client = oauthClients.find(c => c.client_id === clientId);
    return client?.platform_name || client?.client_name || clientId;
  };

  const getUserPlatformBreakdown = (userId: string) => {
    return platformData.filter(d => d.user_id === userId);
  };

  const runReconciliation = async () => {
    if (!currentAdminId) {
      toast.error("Admin ID not found");
      return;
    }
    
    setRunningReconciliation(true);
    try {
      // p_dry_run: false — tường minh áp dụng điều chỉnh (giữ đúng hành vi cũ khi admin chủ động bấm)
      const { data, error } = await supabase.rpc('run_financial_reconciliation', {
        p_admin_id: currentAdminId,
        p_dry_run: false
      });
      
      if (error) throw error;
      
      toast.success("Đối soát hoàn tất!");
      await loadReconciliationLogs();
      await loadData();
    } catch (error) {
      console.error("Error running reconciliation:", error);
      toast.error("Lỗi khi chạy đối soát");
    } finally {
      setRunningReconciliation(false);
    }
  };

  const recalculateUserBalance = async () => {
    if (!selectedUserForRecalc) return;
    
    if (!currentAdminId) {
      toast.error("Admin ID not found");
      return;
    }
    
    try {
      const { data, error } = await supabase.rpc('recalculate_user_financial', {
        p_user_id: selectedUserForRecalc.userId,
        p_client_id: selectedUserForRecalc.clientId === 'all' ? null : selectedUserForRecalc.clientId,
        p_admin_id: currentAdminId
      });
      
      if (error) throw error;
      
      toast.success(`Đã tính lại số dư cho ${selectedUserForRecalc.username}`);
      await loadData();
    } catch (error) {
      console.error("Error recalculating balance:", error);
      toast.error("Lỗi khi tính lại số dư");
    } finally {
      setRecalculateDialogOpen(false);
      setSelectedUserForRecalc(null);
    }
  };

  const exportTransactionsCSV = () => {
    const headers = ['Time', 'User', 'Platform', 'Action', 'Amount', 'Currency', 'Transaction ID'];
    const rows = filteredTransactions.map(t => [
      t.created_at,
      t.username || '',
      getClientName(t.client_id),
      t.action,
      t.amount.toString(),
      t.currency,
      t.transaction_id
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Critical Alert Banner - Phase C */}
      {latestCriticalLog && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-red-700 dark:text-red-400 font-semibold">
            ⚠️ Phát hiện sai lệch tài chính!
          </AlertTitle>
          <AlertDescription className="text-red-600 dark:text-red-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
              <span>
                Đối soát lúc {format(new Date(latestCriticalLog.run_at), 'HH:mm dd/MM/yyyy')} 
                phát hiện <strong>{latestCriticalLog.total_mismatched}</strong> sai lệch 
                (Level {latestCriticalLog.level}: {latestCriticalLog.status === 'critical' ? 'Nghiêm trọng' : 'Cần xem xét'})
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-red-400 text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 w-fit"
                onClick={() => setActiveTab("reconciliation")}
              >
                <Eye className="w-4 h-4 mr-1" />
                Xem chi tiết
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Grand Totals Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{grandTotals?.userCount || 0}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Total Deposit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalDeposit || 0)}>
              {formatNumber(grandTotals?.totalDeposit || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/10 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Total Withdraw
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalWithdraw || 0)}>
              {formatNumber(grandTotals?.totalWithdraw || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-600 flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Total Bet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalBet || 0)}>
              {formatNumber(grandTotals?.totalBet || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Win
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalWin || 0)}>
              {formatNumber(grandTotals?.totalWin || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Total Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalLoss || 0)}>
              {formatNumber(grandTotals?.totalLoss || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${(grandTotals?.totalProfit || 0) >= 0 ? 'from-teal-500/10 to-teal-600/10 border-teal-200' : 'from-rose-500/10 to-rose-600/10 border-rose-200'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${(grandTotals?.totalProfit || 0) >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
              <BarChart3 className="w-4 h-4" />
              Total Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" title={formatFullNumber(grandTotals?.totalProfit || 0)}>
              {(grandTotals?.totalProfit || 0) >= 0 ? '+' : ''}{formatNumber(grandTotals?.totalProfit || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Per User
            </TabsTrigger>
            <TabsTrigger value="platforms" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Per Platform
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2">
              <History className="w-4 h-4" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="gap-2 relative">
              <Calculator className="w-4 h-4" />
              Reconciliation
              {latestCriticalLog && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Tìm user..." 
                className="pl-9 w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Per User Tab */}
        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">User</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_deposit')}
                      >
                        Deposit {sortConfig.key === 'grand_total_deposit' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_withdraw')}
                      >
                        Withdraw {sortConfig.key === 'grand_total_withdraw' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_bet')}
                      >
                        Bet {sortConfig.key === 'grand_total_bet' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_win')}
                      >
                        Win {sortConfig.key === 'grand_total_win' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_loss')}
                      >
                        Loss {sortConfig.key === 'grand_total_loss' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('grand_total_profit')}
                      >
                        Profit {sortConfig.key === 'grand_total_profit' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Chưa có dữ liệu tài chính
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedUsers.map((user) => (
                        <>
                          <TableRow key={user.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={user.avatar_url || undefined} />
                                  <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{user.username}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-green-600 font-medium">
                              {formatNumber(user.grand_total_deposit)}
                            </TableCell>
                            <TableCell className="text-red-600 font-medium">
                              {formatNumber(user.grand_total_withdraw)}
                            </TableCell>
                            <TableCell className="text-purple-600 font-medium">
                              {formatNumber(user.grand_total_bet)}
                            </TableCell>
                            <TableCell className="text-emerald-600 font-medium">
                              {formatNumber(user.grand_total_win)}
                            </TableCell>
                            <TableCell className="text-orange-600 font-medium">
                              {formatNumber(user.grand_total_loss)}
                            </TableCell>
                            <TableCell className={`font-bold ${user.grand_total_profit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                              {user.grand_total_profit >= 0 ? '+' : ''}{formatNumber(user.grand_total_profit)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                                >
                                  {expandedUser === user.id ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Recalculate from transactions"
                                  onClick={() => {
                                    setSelectedUserForRecalc({ userId: user.id, clientId: 'all', username: user.username });
                                    setRecalculateDialogOpen(true);
                                  }}
                                >
                                  <Calculator className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedUser === user.id && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-4">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm">Breakdown per Platform</h4>
                                  {getUserPlatformBreakdown(user.id).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No platform data</p>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {getUserPlatformBreakdown(user.id).map((pd) => (
                                        <Card key={pd.id} className="p-3">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="secondary">{getClientName(pd.client_id)}</Badge>
                                              <span className="text-xs text-muted-foreground">
                                                {pd.sync_count} syncs
                                              </span>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0"
                                              title="Recalculate this platform"
                                              onClick={() => {
                                                setSelectedUserForRecalc({ userId: user.id, clientId: pd.client_id, username: user.username });
                                                setRecalculateDialogOpen(true);
                                              }}
                                            >
                                              <Calculator className="w-3 h-3" />
                                            </Button>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 text-xs">
                                            <div>
                                              <span className="text-muted-foreground">Deposit:</span>
                                              <p className="font-medium text-green-600">{formatNumber(pd.total_deposit)}</p>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground">Bet:</span>
                                              <p className="font-medium text-purple-600">{formatNumber(pd.total_bet)}</p>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground">Profit:</span>
                                              <p className={`font-medium ${pd.total_profit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                                                {pd.total_profit >= 0 ? '+' : ''}{formatNumber(pd.total_profit)}
                                              </p>
                                            </div>
                                          </div>
                                        </Card>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per Platform Tab */}
        <TabsContent value="platforms">
          <div className="space-y-4">
            {/* Platform Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedClient === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedClient('all')}
              >
                All Platforms
              </Button>
              {oauthClients.map((client) => (
                <Button
                  key={client.client_id}
                  variant={selectedClient === client.client_id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedClient(client.client_id)}
                >
                  {client.platform_name || client.client_name}
                </Button>
              ))}
            </div>

            {/* Platform Stats Cards */}
            {selectedClient !== 'all' && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {(() => {
                  const clientData = platformData.filter(d => d.client_id === selectedClient);
                  const stats = clientData.reduce((acc, d) => ({
                    deposit: acc.deposit + d.total_deposit,
                    withdraw: acc.withdraw + d.total_withdraw,
                    bet: acc.bet + d.total_bet,
                    win: acc.win + d.total_win,
                    loss: acc.loss + d.total_loss,
                    profit: acc.profit + d.total_profit,
                    users: acc.users + 1
                  }), { deposit: 0, withdraw: 0, bet: 0, win: 0, loss: 0, profit: 0, users: 0 });

                  return (
                    <>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Users</p>
                        <p className="text-lg font-bold">{stats.users}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Deposit</p>
                        <p className="text-lg font-bold text-green-600">{formatNumber(stats.deposit)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Withdraw</p>
                        <p className="text-lg font-bold text-red-600">{formatNumber(stats.withdraw)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Total Bet</p>
                        <p className="text-lg font-bold text-purple-600">{formatNumber(stats.bet)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Win/Loss</p>
                        <p className="text-lg font-bold">{formatNumber(stats.win)} / {formatNumber(stats.loss)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Profit</p>
                        <p className={`text-lg font-bold ${stats.profit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                          {stats.profit >= 0 ? '+' : ''}{formatNumber(stats.profit)}
                        </p>
                      </Card>
                    </>
                  );
                })()}
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">User</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Deposit</TableHead>
                        <TableHead>Withdraw</TableHead>
                        <TableHead>Bet</TableHead>
                        <TableHead>Win</TableHead>
                        <TableHead>Loss</TableHead>
                        <TableHead>Profit</TableHead>
                        <TableHead>Syncs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPlatformData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            Chưa có dữ liệu per-platform
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPlatformData.map((data) => (
                          <TableRow key={data.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-7 h-7">
                                  <AvatarImage src={data.avatar_url || undefined} />
                                  <AvatarFallback>{data.username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-sm">{data.username}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{getClientName(data.client_id)}</Badge>
                            </TableCell>
                            <TableCell className="text-green-600">{formatNumber(data.total_deposit)}</TableCell>
                            <TableCell className="text-red-600">{formatNumber(data.total_withdraw)}</TableCell>
                            <TableCell className="text-purple-600">{formatNumber(data.total_bet)}</TableCell>
                            <TableCell className="text-emerald-600">{formatNumber(data.total_win)}</TableCell>
                            <TableCell className="text-orange-600">{formatNumber(data.total_loss)}</TableCell>
                            <TableCell className={`font-bold ${data.total_profit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                              {data.total_profit >= 0 ? '+' : ''}{formatNumber(data.total_profit)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{data.sync_count}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {oauthClients.map((client) => (
                    <SelectItem key={client.client_id} value={client.client_id}>
                      {client.platform_name || client.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="DEPOSIT">Deposit</SelectItem>
                  <SelectItem value="WITHDRAW">Withdraw</SelectItem>
                  <SelectItem value="BET">Bet</SelectItem>
                  <SelectItem value="WIN">Win</SelectItem>
                  <SelectItem value="LOSS">Loss</SelectItem>
                  <SelectItem value="CLAIM_REWARD">Claim Reward</SelectItem>
                  <SelectItem value="SEND_MONEY">Send Money</SelectItem>
                  <SelectItem value="RECEIVE_MONEY">Receive Money</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={exportTransactionsCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>

              <Badge variant="secondary" className="ml-auto">
                {filteredTransactions.length} transactions
              </Badge>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Time</TableHead>
                        <TableHead className="w-[150px]">User</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="w-[200px]">Transaction ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Chưa có giao dịch
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((tx) => (
                          <TableRow key={tx.id} className="hover:bg-muted/50">
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(tx.created_at), 'dd/MM HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={tx.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">{tx.username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{tx.username}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{getClientName(tx.client_id)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={getActionColor(tx.action)}>
                                {tx.action}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${getActionColor(tx.action)}`}>
                              {formatNumber(tx.amount)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{tx.currency}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]" title={tx.transaction_id}>
                              {tx.transaction_id}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation">
          <div className="space-y-4">
            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button 
                onClick={runReconciliation} 
                disabled={runningReconciliation}
              >
                {runningReconciliation ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Reconciliation Now
              </Button>
              
              {reconciliationLogs.length > 0 && reconciliationLogs[0].status === 'critical' && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-md">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Critical discrepancies detected!</span>
                </div>
              )}
            </div>

            {/* Recent Reconciliation Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">Reconciliation History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Run Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Checked</TableHead>
                        <TableHead>Mismatched</TableHead>
                        <TableHead>Auto-adjusted</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliationLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Chưa có lịch sử đối soát
                          </TableCell>
                        </TableRow>
                      ) : (
                        reconciliationLogs.map((log) => (
                          <>
                            <TableRow key={log.id} className="hover:bg-muted/50">
                              <TableCell className="text-sm">
                                {format(new Date(log.run_at), 'dd/MM/yyyy HH:mm')}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(log.status)}
                                  <span className="capitalize">{log.status.replace('_', ' ')}</span>
                                </div>
                              </TableCell>
                              <TableCell>{getLevelBadge(log.level)}</TableCell>
                              <TableCell>{log.total_checked}</TableCell>
                              <TableCell className={log.total_mismatched > 0 ? 'text-yellow-600 font-medium' : ''}>
                                {log.total_mismatched}
                              </TableCell>
                              <TableCell>
                                {log.auto_adjusted ? (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">Yes</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {log.discrepancies && log.discrepancies.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedRecon(expandedRecon === log.id ? null : log.id)}
                                  >
                                    {expandedRecon === log.id ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {expandedRecon === log.id && log.discrepancies && log.discrepancies.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={7} className="bg-muted/30 p-4">
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm">Discrepancies</h4>
                                    <div className="overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>User ID</TableHead>
                                            <TableHead>Platform</TableHead>
                                            <TableHead className="text-right">Stored</TableHead>
                                            <TableHead className="text-right">Calculated</TableHead>
                                            <TableHead className="text-right">Diff</TableHead>
                                            <TableHead className="text-right">Diff %</TableHead>
                                            <TableHead>Level</TableHead>
                                            <TableHead>Actions</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {log.discrepancies.map((d, i) => (
                                            <TableRow key={i}>
                                              <TableCell className="font-mono text-xs">{d.user_id.slice(0, 8)}...</TableCell>
                                              <TableCell>{getClientName(d.client_id)}</TableCell>
                                              <TableCell className="text-right">{formatNumber(d.stored)}</TableCell>
                                              <TableCell className="text-right">{formatNumber(d.calculated)}</TableCell>
                                              <TableCell className={`text-right font-medium ${d.diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {d.diff > 0 ? '+' : ''}{formatNumber(d.diff)}
                                              </TableCell>
                                              <TableCell className="text-right">{d.diff_percent.toFixed(4)}%</TableCell>
                                              <TableCell>{getLevelBadge(d.level)}</TableCell>
                                              <TableCell>
                                                <div className="flex items-center gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => handleViewUserTransactions(d.user_id)}
                                                    title="View Transactions"
                                                  >
                                                    <Eye className="w-3 h-3 mr-1" />
                                                    TX
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                                    onClick={() => handleRecalculateFromDiscrepancy(d.user_id, d.client_id)}
                                                    title="Recalculate from Transactions"
                                                  >
                                                    <RotateCcw className="w-3 h-3 mr-1" />
                                                    Fix
                                                  </Button>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Recalculate Confirmation Dialog */}
      <AlertDialog open={recalculateDialogOpen} onOpenChange={setRecalculateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Balance from Transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will recalculate the financial balance for <strong>{selectedUserForRecalc?.username}</strong>
              {selectedUserForRecalc?.clientId !== 'all' && (
                <> on platform <strong>{getClientName(selectedUserForRecalc?.clientId || '')}</strong></>
              )}
              {selectedUserForRecalc?.clientId === 'all' && <> across all platforms</>}.
              <br /><br />
              The balance will be computed from the transaction log (Source of Truth).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={recalculateUserBalance}>
              Recalculate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FinancialTab;
