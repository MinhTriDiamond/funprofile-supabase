import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, X } from 'lucide-react';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  isCreating: boolean;
}

interface SearchUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreateGroup,
  isCreating,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<Map<string, SearchUser>>(new Map());
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', currentUserId || '')
        .or(`username.ilike.%${q.trim()}%,full_name.ilike.%${q.trim()}%`)
        .limit(20);
      setResults(data || []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleUser = (user: SearchUser) => {
    const next = new Map(selected);
    if (next.has(user.id)) next.delete(user.id);
    else next.set(user.id, user);
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selected.size < 1) return;
    await onCreateGroup(groupName.trim(), Array.from(selected.keys()));
    setGroupName('');
    setSelected(new Map());
    setQuery('');
    setResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo nhóm</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tên nhóm</Label>
            <Input placeholder="Nhập tên nhóm..." value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(selected.values()).map(u => (
                <span key={u.id} className="inline-flex items-center gap-1 bg-primary/10 rounded-full px-2 py-0.5 text-xs">
                  {u.username}
                  <button onClick={() => toggleUser(u)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm thành viên..." value={query} onChange={(e) => handleSearch(e.target.value)} className="pl-9" />
          </div>

          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {results.map(user => (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Checkbox checked={selected.has(user.id)} />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{(user.username || 'U')[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{user.full_name || user.username}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleCreate} disabled={isCreating || !groupName.trim() || selected.size < 1}>
            {isCreating ? 'Đang tạo...' : 'Tạo nhóm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
