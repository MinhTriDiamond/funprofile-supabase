import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface EpochRow {
  epoch_month: string;
  count: number;
  users: number;
  fun: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');

export function UnclaimedByEpochCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-unclaimed-by-epoch'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: EpochRow[]; totalFun: number; totalUsers: number }> => {
      const { data: allocs, error } = await supabase
        .from('mint_allocations')
        .select('user_id, allocation_amount_capped, epoch_id, mint_epochs!inner(epoch_month)')
        .eq('status', 'pending');
      if (error) throw error;

      const byEpoch = new Map<string, { fun: number; count: number; users: Set<string> }>();
      const allUsers = new Set<string>();
      let totalFun = 0;

      for (const row of (allocs || []) as any[]) {
        const month = row.mint_epochs?.epoch_month || 'chưa gán';
        const amount = Number(row.allocation_amount_capped || 0);
        const cur = byEpoch.get(month) || { fun: 0, count: 0, users: new Set<string>() };
        cur.fun += amount;
        cur.count += 1;
        cur.users.add(row.user_id);
        byEpoch.set(month, cur);
        allUsers.add(row.user_id);
        totalFun += amount;
      }

      const rows = Array.from(byEpoch.entries())
        .map(([epoch_month, v]) => ({ epoch_month, fun: v.fun, count: v.count, users: v.users.size }))
        .sort((a, b) => (a.epoch_month < b.epoch_month ? 1 : -1));

      return { rows, totalFun, totalUsers: allUsers.size };
    },
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          ⏳ Chưa claim theo epoch
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isLoading && data && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{fmt(data.totalFun)} FUN chưa nhận</Badge>
              <Badge variant="outline">{data.totalUsers} user</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Epoch</th>
                    <th className="py-2 pr-3 text-right">Allocation</th>
                    <th className="py-2 pr-3 text-right">User</th>
                    <th className="py-2 text-right">FUN</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.epoch_month} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium">{r.epoch_month}</td>
                      <td className="py-2 pr-3 text-right">{r.count}</td>
                      <td className="py-2 pr-3 text-right">{r.users}</td>
                      <td className="py-2 text-right">{fmt(r.fun)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        Không còn allocation nào chưa claim.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default UnclaimedByEpochCard;
