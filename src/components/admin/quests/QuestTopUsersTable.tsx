import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTopQuestUsers } from '@/hooks/useAdminQuests';
import { useDebounce } from '@/hooks/useDebounce';

export default function QuestTopUsersTable() {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const { data = [], isLoading } = useTopQuestUsers(debounced);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Tìm theo username hoặc tên…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Streak</TableHead>
              <TableHead className="text-right">Longest</TableHead>
              <TableHead className="text-right">Quests done</TableHead>
              <TableHead className="text-right">Total LS</TableHead>
              <TableHead className="text-right">Freeze</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Đang tải…</TableCell></TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Không có dữ liệu.</TableCell></TableRow>
            )}
            {data.map((u, i) => (
              <TableRow key={u.user_id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback>{(u.full_name ?? u.username ?? '?').slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="leading-tight">
                      <div className="font-medium text-sm">{u.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">@{u.username ?? u.user_id.slice(0, 8)}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">{u.current_streak}</TableCell>
                <TableCell className="text-right">{u.longest_streak}</TableCell>
                <TableCell className="text-right">{u.total_quests_completed}</TableCell>
                <TableCell className="text-right font-medium">{u.total_ls_from_quests.toFixed(0)}</TableCell>
                <TableCell className="text-right">{u.freeze_passes_remaining}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
