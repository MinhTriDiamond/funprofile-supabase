import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link2, RefreshCw, ExternalLink, Coins } from "lucide-react";
import TreasuryBalanceCard from "./TreasuryBalanceCard";
interface ClaimData {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string;
  created_at: string;
  username?: string;
}

interface BlockchainTabProps {
  adminId: string;
}

const BlockchainTab = ({ adminId }: BlockchainTabProps) => {
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadClaims();
  }, []);

  const loadClaims = async () => {
    try {
      const { data: claimsData, error } = await supabase
        .from('reward_claims')
        .select('id, user_id, amount, wallet_address, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (claimsData && claimsData.length > 0) {
        // Get usernames
        const userIds = [...new Set(claimsData.map(c => c.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        const usernameMap = new Map(profiles?.map(p => [p.id, p.username]) || []);
        
        setClaims(claimsData.map(claim => ({
          ...claim,
          username: usernameMap.get(claim.user_id) || 'Unknown'
        })));
      }
    } catch (error) {
      console.error("Error loading claims:", error);
      toast.error("Lỗi khi tải dữ liệu claims");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadClaims();
    toast.success("Đã cập nhật dữ liệu");
    setRefreshing(false);
  };

  const formatNumber = (num: number) => num.toLocaleString('vi-VN');
  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('vi-VN');
  const truncateAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;

  // Calculate stats
  const totalClaimed = claims.reduce((sum, c) => sum + c.amount, 0);
  const uniqueWallets = new Set(claims.map(c => c.wallet_address.toLowerCase())).size;
  const uniqueUsers = new Set(claims.map(c => c.user_id)).size;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Đang tải dữ liệu blockchain...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Treasury Balance Card */}
      <TreasuryBalanceCard />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{formatNumber(totalClaimed)}</p>
            <p className="text-sm text-muted-foreground">Tổng CAMLY đã claim</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-blue-600">{claims.length}</p>
            <p className="text-sm text-muted-foreground">Tổng giao dịch</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-purple-600">{uniqueWallets}</p>
            <p className="text-sm text-muted-foreground">Ví duy nhất</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-orange-600">{uniqueUsers}</p>
            <p className="text-sm text-muted-foreground">Users đã claim</p>
          </CardContent>
        </Card>
      </div>

      {/* Claims List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-purple-500" />
            Lịch sử Claims On-chain
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Chưa có giao dịch claim nào
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-medium">User</th>
                    <th className="text-left py-3 px-2 text-sm font-medium">Wallet</th>
                    <th className="text-right py-3 px-2 text-sm font-medium">Amount</th>
                    <th className="text-left py-3 px-2 text-sm font-medium">Thời gian</th>
                    <th className="text-center py-3 px-2 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map(claim => (
                    <tr key={claim.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <p className="font-medium">{claim.username}</p>
                        <p className="text-xs text-muted-foreground font-mono">{claim.user_id.slice(0, 8)}...</p>
                      </td>
                      <td className="py-3 px-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {truncateAddress(claim.wallet_address)}
                        </code>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          <Coins className="w-3 h-3 mr-1" />
                          {formatNumber(claim.amount)}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {formatDate(claim.created_at)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          className="gap-1"
                        >
                          <a 
                            href={`https://bscscan.com/address/${claim.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            BscScan
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlockchainTab;
