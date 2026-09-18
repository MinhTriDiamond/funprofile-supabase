import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';

interface Participant {
  id: string;
  username: string;
}

interface MessageSearchProps {
  conversationId: string;
  participants: Participant[];
  excludedSenderIds?: string[];
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

interface SearchResult {
  id: string;
  content: string | null;
  sender_id: string;
  created_at: string | null;
  senderName?: string;
}

export function MessageSearch({
  conversationId,
  participants,
  excludedSenderIds = [],
  onClose,
  onSelectMessage,
}: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const dateLocale = useDateLocale();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null);

  const participantMap = new Map(participants.map(p => [p.id, p.username]));

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      let q = supabase
        .from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', conversationId)
        .ilike('content', `%${query.trim()}%`)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedSenderId) {
        q = q.eq('sender_id', selectedSenderId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const filtered = (data || []).filter(m => !excludedSenderIds.includes(m.sender_id));
      setResults(filtered.map(m => ({
        ...m,
        senderName: participantMap.get(m.sender_id) || 'Người dùng',
      })));
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm tin nhắn..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9 pr-8"
            autoFocus
          />
          {query && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => { setQuery(''); setResults([]); }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Sender filter */}
      {participants.length > 1 && (
        <div className="px-3 py-2 border-b flex gap-1 flex-wrap">
          <Button
            variant={selectedSenderId === null ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setSelectedSenderId(null)}
          >
            Tất cả
          </Button>
          {participants.map(p => (
            <Button
              key={p.id}
              variant={selectedSenderId === p.id ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setSelectedSenderId(p.id)}
            >
              {p.username}
            </Button>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1">
        {isSearching ? (
          <div className="p-4 text-center text-muted-foreground">Đang tìm...</div>
        ) : results.length === 0 && query ? (
          <div className="p-4 text-center text-muted-foreground">Không tìm thấy</div>
        ) : (
          <div className="p-2 space-y-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => onSelectMessage(r.id)}
                className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-muted-foreground">{r.senderName}</span>
                  {r.created_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: false, locale: dateLocale })}
                    </span>
                  )}
                </div>
                <p className="text-sm truncate mt-0.5">{r.content}</p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
