import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';

interface FoundUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface Props {
  query: string;
}

const formatVN = (iso: string) => {
  const dt = new Date(iso);
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const y = dt.getUTCFullYear();
  return `${d}/${m}/${y}`;
};

export const NewMembersGlobalSearch = ({ query }: Props) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [users, setUsers] = useState<FoundUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const safe = q.replace(/[%_\\]/g, '\\$&');
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('id, username, full_name, avatar_url, created_at')
          .or(`username_normalized.ilike.%${safe.toLowerCase()}%,full_name.ilike.%${safe}%`)
          .order('created_at', { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (error) {
          setUsers([]);
        } else {
          setUsers((data as FoundUser[]) || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  if (loading) {
    return (
      <div className="space-y-3 p-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {language === 'vi' ? 'Không tìm thấy thành viên' : 'No members found'}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {users.map((user) => {
        const displayName = user.full_name || user.username || 'User';
        const initials = displayName.slice(0, 2).toUpperCase();
        return (
          <button
            key={user.id}
            onClick={() => navigate(user.username ? `/@${user.username}` : `/profile/${user.id}`)}
            className="w-full text-left rounded-lg hover:bg-muted/50 transition-colors p-2.5 flex items-start gap-3"
          >
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarImage src={user.avatar_url || ''} sizeHint="sm" />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-semibold truncate text-green-800 dark:text-green-300">
                  {displayName}
                </div>
                <span className="text-[12px] text-green-700/70 dark:text-green-300/70 shrink-0 tabular-nums">
                  {formatVN(user.created_at)}
                </span>
              </div>
              {user.username && (
                <div className="text-[13px] text-green-700/70 dark:text-green-300/70 truncate">
                  @{user.username}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
