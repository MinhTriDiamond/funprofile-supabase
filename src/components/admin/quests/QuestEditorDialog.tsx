import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { QuestDefinition, QuestDefinitionInput, useUpsertQuest } from '@/hooks/useAdminQuests';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: QuestDefinition | null;
}

const CATEGORIES = ['create', 'engage', 'giving', 'grow', 'identity', 'habit', 'channeling', 'other'];
const FREQUENCIES = ['daily', 'weekly', 'once', 'per_event'] as const;
const TIERS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
const TRIGGER_HINTS = [
  'post_created', 'reaction_added', 'donation_sent', 'comment_created',
  'follow_created', 'identity_onboarded', 'channeling_attended', 'login',
];

const empty = (): QuestDefinitionInput => ({
  code: '',
  title_vi: '',
  title_en: '',
  description: '',
  category: 'engage',
  ls_base: 20,
  target_count: 1,
  frequency: 'daily',
  trigger_event: 'post_created',
  trigger_filter: null,
  trust_tier_min: 'T0',
  icon: '✨',
  sort_order: 100,
  is_active: true,
});

export default function QuestEditorDialog({ open, onOpenChange, initial }: Props) {
  const isEdit = !!initial;
  const [form, setForm] = useState<QuestDefinitionInput>(empty());
  const [filterText, setFilterText] = useState('');
  const upsert = useUpsertQuest();

  useEffect(() => {
    if (open) {
      const base = initial
        ? { ...initial }
        : empty();
      setForm(base);
      setFilterText(initial?.trigger_filter ? JSON.stringify(initial.trigger_filter, null, 2) : '');
    }
  }, [open, initial]);

  const set = <K extends keyof QuestDefinitionInput>(k: K, v: QuestDefinitionInput[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.code.trim()) return toast.error('Thiếu code');
    if (!form.title_vi.trim()) return toast.error('Thiếu tiêu đề tiếng Việt');
    let trigger_filter: Record<string, unknown> | null = null;
    if (filterText.trim()) {
      try {
        trigger_filter = JSON.parse(filterText);
      } catch {
        return toast.error('trigger_filter không phải JSON hợp lệ');
      }
    }
    await upsert.mutateAsync({ ...form, trigger_filter });
    onOpenChange(false);
  };

  const overCap = form.ls_base * form.target_count > 200;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa quest' : 'Tạo quest mới'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code (unique)</Label>
              <Input value={form.code} disabled={isEdit} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="DAILY_REACT_5" />
            </div>
            <div>
              <Label>Icon (emoji)</Label>
              <Input value={form.icon ?? ''} onChange={e => set('icon', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tiêu đề (VI)</Label>
              <Input value={form.title_vi} onChange={e => set('title_vi', e.target.value)} />
            </div>
            <div>
              <Label>Tiêu đề (EN)</Label>
              <Input value={form.title_en} onChange={e => set('title_en', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Mô tả</Label>
            <Textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={v => set('frequency', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trust tier tối thiểu</Label>
              <Select value={form.trust_tier_min} onValueChange={v => set('trust_tier_min', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>LS base</Label>
              <Input type="number" min={1} max={200} value={form.ls_base} onChange={e => set('ls_base', Number(e.target.value))} />
            </div>
            <div>
              <Label>Target count</Label>
              <Input type="number" min={1} value={form.target_count} onChange={e => set('target_count', Number(e.target.value))} />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))} />
            </div>
          </div>

          {overCap && (
            <p className="text-xs text-amber-500">
              ⚠️ ls_base × target_count = {form.ls_base * form.target_count} vượt cap 200 LS/ngày — engine sẽ tự cap khi award.
            </p>
          )}

          <div>
            <Label>Trigger event</Label>
            <Input
              value={form.trigger_event}
              onChange={e => set('trigger_event', e.target.value)}
              list="trigger-hints"
            />
            <datalist id="trigger-hints">
              {TRIGGER_HINTS.map(h => <option key={h} value={h} />)}
            </datalist>
          </div>

          <div>
            <Label>Trigger filter (JSON, optional)</Label>
            <Textarea
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              rows={4}
              placeholder='{"min_chars": 50}'
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            <Label>Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo quest'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
