/**
 * PartyChip — Avatar + display_name + @username cho 1 phía (sender hoặc recipient).
 * Fallback: ví ngoài → avatar mặc định + địa chỉ rút gọn + label "Ví ngoài".
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PartyChipProps {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  address?: string | null;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
  className?: string;
}

export function shortAddr(a?: string | null) {
  if (!a) return '';
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function initials(name?: string | null, address?: string | null) {
  const src = (name || address || '?').trim();
  return src.slice(0, 2).toUpperCase();
}

const SIZE = {
  sm: { av: 'h-7 w-7', name: 'text-xs', sub: 'text-[10px]' },
  md: { av: 'h-9 w-9', name: 'text-sm', sub: 'text-xs' },
  lg: { av: 'h-14 w-14', name: 'text-base', sub: 'text-xs' },
} as const;

export function PartyChip({
  displayName, username, avatarUrl, address, size = 'md', align = 'left', className,
}: PartyChipProps) {
  const s = SIZE[size];
  const isExternal = !displayName && !username;
  const name = displayName || username || (address ? shortAddr(address) : 'Ẩn danh');
  const sub = username ? `@${username}` : address ? shortAddr(address) : 'Ví ngoài';

  return (
    <div className={cn(
      'flex min-w-0 items-center gap-2',
      align === 'right' && 'flex-row-reverse text-right',
      className,
    )}>
      <Avatar className={cn(s.av, 'shrink-0 ring-1 ring-border')}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          {isExternal ? <Globe className="h-3.5 w-3.5" /> : initials(displayName, address)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className={cn('truncate font-medium leading-tight', s.name)} title={name}>
          {name}
        </div>
        <div className={cn('truncate text-muted-foreground leading-tight', s.sub)} title={sub}>
          {sub}
        </div>
      </div>
    </div>
  );
}
