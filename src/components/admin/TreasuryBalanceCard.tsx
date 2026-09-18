import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Wallet, 
  RefreshCw, 
  ExternalLink, 
  Copy, 
  AlertTriangle,
  CheckCircle,
  Coins
} from "lucide-react";

interface TreasuryBalance {
  treasury_address: string;
  bnb_balance: string;
  camly_balance: string;
  updated_at: string;
}

// Thresholds for warnings
const BNB_WARNING = 0.05;
const BNB_CRITICAL = 0.01;
const CAMLY_WARNING = 500000;
const CAMLY_CRITICAL = 100000;

const TreasuryBalanceCard = () => {
  const [balances, setBalances] = useState<TreasuryBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTreasuryBalance();
  }, []);

  const fetchTreasuryBalance = async () => {
    try {
      setError(null);
      const { data, error: invokeError } = await supabase.functions.invoke("treasury-balance");
      
      if (invokeError) {
        throw new Error(invokeError.message);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      setBalances(data);
    } catch (err) {
      console.error("Error fetching treasury balance:", err);
      setError(err instanceof Error ? err.message : "Không thể tải số dư Treasury");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTreasuryBalance();
    if (!error) {
      toast.success("Đã cập nhật số dư Treasury");
    }
    setRefreshing(false);
  };

  const copyAddress = () => {
    if (balances?.treasury_address) {
      navigator.clipboard.writeText(balances.treasury_address);
      toast.success("Đã copy địa chỉ Treasury");
    }
  };

  const truncateAddress = (addr: string) => 
    `${addr.slice(0, 10)}...${addr.slice(-8)}`;

  const formatNumber = (num: string) => 
    parseFloat(num).toLocaleString("vi-VN", { maximumFractionDigits: 6 });

  const getBnbStatus = (balance: number) => {
    if (balance < BNB_CRITICAL) return { status: "critical", label: "⚠️ Thiếu gas!", color: "text-red-600" };
    if (balance < BNB_WARNING) return { status: "warning", label: "⚡ Sắp hết gas", color: "text-yellow-600" };
    return { status: "ok", label: "✅ Đủ gas fee", color: "text-green-600" };
  };

  const getCamlyStatus = (balance: number) => {
    if (balance < CAMLY_CRITICAL) return { status: "critical", label: "⚠️ Thiếu CAMLY!", color: "text-red-600" };
    if (balance < CAMLY_WARNING) return { status: "warning", label: "⚡ Sắp hết thưởng", color: "text-yellow-600" };
    return { status: "ok", label: "✅ Đủ trả thưởng", color: "text-green-600" };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Đang tải số dư Treasury...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <p className="text-red-700 font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Thử lại
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!balances) return null;

  const bnbBalance = parseFloat(balances.bnb_balance);
  const camlyBalance = parseFloat(balances.camly_balance);
  const bnbStatus = getBnbStatus(bnbBalance);
  const camlyStatus = getCamlyStatus(camlyBalance);
  const hasWarning = bnbStatus.status !== "ok" || camlyStatus.status !== "ok";

  return (
    <Card className={hasWarning ? "border-yellow-300 bg-yellow-50/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-primary">
          <Wallet className="w-5 h-5 text-purple-500" />
          💰 Treasury Wallet
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">📍 Address:</span>
          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
            {truncateAddress(balances.treasury_address)}
          </code>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyAddress}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a
              href={`https://bscscan.com/address/${balances.treasury_address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* BNB Balance */}
          <div className="border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2 mb-2">
              <img 
                src="/src/assets/tokens/bnb-logo.webp" 
                alt="BNB" 
                className="w-6 h-6"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="font-semibold">BNB</span>
              <Badge variant="outline" className="text-xs">Gas Fee</Badge>
            </div>
            <p className="text-2xl font-bold">{formatNumber(balances.bnb_balance)} BNB</p>
            <p className={`text-sm mt-1 ${bnbStatus.color}`}>
              {bnbStatus.label}
            </p>
          </div>

          {/* CAMLY Balance */}
          <div className="border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-6 h-6 text-green-500" />
              <span className="font-semibold">CAMLY</span>
              <Badge variant="outline" className="text-xs">Reward Token</Badge>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {formatNumber(balances.camly_balance)} CAMLY
            </p>
            <p className={`text-sm mt-1 ${camlyStatus.color}`}>
              {camlyStatus.label}
            </p>
          </div>
        </div>

        {/* Warnings */}
        {hasWarning && (
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Cảnh báo số dư thấp!</p>
                <ul className="mt-1 space-y-1">
                  {bnbStatus.status !== "ok" && (
                    <li>• BNB thấp: Cần ít nhất {BNB_WARNING} BNB để trả gas fee</li>
                  )}
                  {camlyStatus.status !== "ok" && (
                    <li>• CAMLY thấp: Cần nạp thêm token để trả thưởng cho users</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <p className="text-xs text-muted-foreground text-right">
          Cập nhật: {new Date(balances.updated_at).toLocaleString("vi-VN")}
        </p>
      </CardContent>
    </Card>
  );
};

export default TreasuryBalanceCard;
