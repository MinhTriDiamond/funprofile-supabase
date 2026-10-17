import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { chatRpc } from '../chatRpc';
import { sanitizeProfileSearch } from '../chatSearch';

interface Candidate { id: string; username: string; full_name: string | null; avatar_url: string | null }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; conversationId: string; existingUserIds: string[]; onAdded: () => void }

export function AddGroupMemberDialog({ open, onOpenChange, conversationId, existingUserIds, onAdded }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const search = async (value: string) => {
    setQuery(value);
    const safeQuery = sanitizeProfileSearch(value);
    if (safeQuery.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%`).limit(20);
      if (error) throw error;
      setResults((data || []).filter((user) => !existingUserIds.includes(user.id)));
    } catch {
      setResults([]);
      toast.error('Không thể tìm thành viên.');
    } finally { setLoading(false); }
  };

  const add = async (user: Candidate) => {
    setAddingId(user.id);
    try {
      await chatRpc.manageConversationMember(conversationId, user.id, 'add');
      toast.success('Đã thêm thành viên.');
      setResults((current) => current.filter((candidate) => candidate.id !== user.id));
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thêm thành viên.');
    } finally { setAddingId(null); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Thêm thành viên</DialogTitle></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={query} onChange={(event) => void search(event.target.value)} placeholder="Tìm theo tên hoặc username" />
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-muted-foreground">Đang tìm…</p>}
        {results.map((user) => <div key={user.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{user.full_name || user.username}</p><p className="text-xs text-muted-foreground">@{user.username}</p></div>
          <Button size="sm" disabled={addingId !== null} onClick={() => void add(user)}><UserPlus className="mr-2 h-4 w-4" />Thêm</Button>
        </div>)}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
