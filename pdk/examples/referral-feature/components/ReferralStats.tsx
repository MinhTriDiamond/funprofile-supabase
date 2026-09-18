import { Card, CardHeader, CardTitle, CardContent } from "@/pdk/core/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/pdk/core/components/ui/avatar";
import { Separator } from "@/pdk/core/components/ui/separator";
import { Users, Coins, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface ReferralUse {
  id: string;
  referredUser: {
    username: string;
    avatarUrl?: string;
  };
  rewardAmount: number;
  createdAt: string;
}

interface ReferralStatsProps {
  totalReferrals: number;
  totalRewards: number;
  recentReferrals: ReferralUse[];
}

export function ReferralStats({ totalReferrals, totalRewards, recentReferrals }: ReferralStatsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Thống Kê Giới Thiệu
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <div className="p-2 bg-primary/10 rounded-full">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReferrals}</p>
              <p className="text-sm text-muted-foreground">Bạn bè đã mời</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <div className="p-2 bg-primary/10 rounded-full">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalRewards}</p>
              <p className="text-sm text-muted-foreground">Tổng thưởng (FUN)</p>
            </div>
          </div>
        </div>

        {/* Recent Referrals */}
        {recentReferrals.length > 0 && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">
                Lời Mời Gần Đây
              </h4>
              
              <div className="space-y-3">
                {recentReferrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={referral.referredUser.avatarUrl} />
                        <AvatarFallback>
                          {referral.referredUser.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {referral.referredUser.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(referral.createdAt), {
                            addSuffix: true,
                            locale: vi,
                          })}
                        </p>
                      </div>
                    </div>
                    
                    <span className="text-sm font-medium text-primary">
                      +{referral.rewardAmount} FUN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {recentReferrals.length === 0 && (
          <div className="text-center py-6">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Chưa có ai sử dụng mã của bạn.
            </p>
            <p className="text-sm text-muted-foreground">
              Chia sẻ mã với bạn bè để nhận thưởng!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
