import { Eye, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { LiveViewer } from '@/modules/live/hooks/useLivePresence';

interface LiveViewerStatsProps {
  viewers: LiveViewer[];
}

export function LiveViewerStats({ viewers }: LiveViewerStatsProps) {
  const recent = viewers.slice(0, 8);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Eye className="h-4 w-4" />
          Người xem
        </div>
        <span className="text-sm font-semibold">{viewers.length}</span>
      </div>

      {recent.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {recent.map((viewer) => (
            <div key={viewer.userId} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs">
              <Avatar className="h-5 w-5">
                <AvatarImage src={viewer.avatar_url} />
                <AvatarFallback className="text-[10px]">{viewer.username?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
              </Avatar>
              <span className="max-w-[96px] truncate">{viewer.username}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <UserPlus className="h-4 w-4" />
          Chưa có người xem trong phòng điều khiển.
        </div>
      )}
    </div>
  );
}
