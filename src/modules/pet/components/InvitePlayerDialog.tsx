import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSearchArenaCandidates, useChallengePet, petBattleErrorToMessage,
  useArenaOpponents,
} from '@/modules/pet/hooks/usePetBattle';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CandidateRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  pet_level: number;
  eligible: boolean;
}

export function InvitePlayerDialog({ open, onOpenChange }: Props) {
  const [raw, setRaw] = useState('');
  const [debounced, setDebounced] = useState('');
  const challenge = useChallengePet();
  const { data: searchResults, isFetching: searching } = useSearchArenaCandidates(debounced);
  const { data: suggestions, isFetching: loadingSuggestions } = useArenaOpponents(30);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw), 300);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setDebounced('');
    }
  }, [open]);

  const onInvite = async (uid: string) => {
    try {
      await challenge.mutateAsync(uid);
      toast.success('Đã gửi lời mời so tài Ánh Sáng!');
      onOpenChange(false);
    } catch (e) {
      toast.error(petBattleErrorToMessage(e));
    }
  };

  const isSearching = debounced.length >= 2;

  const rows: CandidateRow[] = useMemo(() => {
    if (isSearching) {
      return (searchResults ?? []).map((u) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        username: u.username,
        avatar_url: u.avatar_url,
        pet_level: u.pet_level,
        eligible: u.eligible,
      }));
    }
    return (suggestions ?? []).map((o) => ({
      user_id: o.user_id,
      display_name: o.display_name,
      username: o.username,
      avatar_url: o.avatar_url,
      pet_level: o.pet_level,
      eligible: true,
    }));
  }, [isSearching, searchResults, suggestions]);

  const loading = isSearching ? searching : loadingSuggestions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-500" />
            Tìm &amp; mời bạn so tài
          </DialogTitle>
          <DialogDescription>
            Khi để trống, hệ thống sẽ gợi ý sẵn các thành viên đang có Lumi.
            Bạn cũng có thể gõ tên hoặc username để tìm chính xác hơn.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Nhập tên hoặc username..."
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="text-[11px] text-muted-foreground -mt-1">
          {isSearching ? 'Kết quả tìm kiếm' : 'Gợi ý người chơi đang có Lumi'}
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2 -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {isSearching
                ? 'Không tìm thấy thành viên nào khớp.'
                : 'Chưa có thành viên nào sẵn sàng — hãy mời bạn thân tham gia nhé!'}
            </p>
          ) : (
            rows.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={u.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(u.display_name ?? u.username ?? '?')[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {u.display_name ?? u.username ?? 'Ẩn danh'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.pet_level > 0 ? `Lv.${u.pet_level}` : 'Chưa có Lumi'}
                    </div>
                  </div>
                </div>
                {u.eligible ? (
                  <Button
                    size="sm"
                    onClick={() => onInvite(u.user_id)}
                    disabled={challenge.isPending}
                  >
                    Mời so tài
                  </Button>
                ) : (
                  <Badge variant="secondary" className="shrink-0">
                    Chưa có Lumi
                  </Badge>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
