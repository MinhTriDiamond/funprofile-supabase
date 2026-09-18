import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRecentQuestActivity } from '@/hooks/useAdminQuests';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function QuestActivityTable() {
  const { data = [], isLoading } = useRecentQuestActivity();

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        50 lần hoàn thành quest mới nhất trong 24h. Tự refresh mỗi 60s.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Quest</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">LS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Đang tải…</TableCell></TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chưa có hoạt động trong 24h.</TableCell></TableRow>
            )}
            {data.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.completed_at), { addSuffix: true, locale: vi })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback>{(r.full_name ?? r.username ?? '?').slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{r.full_name ?? `@${r.username ?? r.user_id.slice(0, 8)}`}</span>
                  </div>
                </TableCell>
                <TableCell>{r.quest_title ?? <span className="text-muted-foreground italic">unknown</span>}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono text-xs">{r.period_key}</Badge></TableCell>
                <TableCell className="text-right font-medium">+{r.ls_awarded}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
