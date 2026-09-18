import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Plus } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  QuestDefinition, useAdminQuestDefinitions, useDeleteQuest, useToggleQuestActive,
} from '@/hooks/useAdminQuests';
import QuestEditorDialog from './QuestEditorDialog';

export default function QuestDefinitionsTable() {
  const { data = [], isLoading } = useAdminQuestDefinitions();
  const toggle = useToggleQuestActive();
  const del = useDeleteQuest();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuestDefinition | null>(null);
  const [confirmDel, setConfirmDel] = useState<QuestDefinition | null>(null);

  const openCreate = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (q: QuestDefinition) => { setEditing(q); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Tổng: <strong>{data.length}</strong> quest · Active: <strong>{data.filter(q => q.is_active).length}</strong>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Quest mới
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Cat</TableHead>
              <TableHead>Freq</TableHead>
              <TableHead className="text-right">LS</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Đang tải…</TableCell></TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Chưa có quest nào.</TableCell></TableRow>
            )}
            {data.map(q => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs">{q.icon} {q.code}</TableCell>
                <TableCell className="max-w-[280px] truncate">{q.title_vi}</TableCell>
                <TableCell><Badge variant="secondary">{q.category}</Badge></TableCell>
                <TableCell><Badge variant="outline">{q.frequency}</Badge></TableCell>
                <TableCell className="text-right">{q.ls_base}</TableCell>
                <TableCell className="text-right">{q.target_count}</TableCell>
                <TableCell>{q.trust_tier_min}</TableCell>
                <TableCell>
                  <Switch
                    checked={q.is_active}
                    onCheckedChange={v => toggle.mutate({ id: q.id, value: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(q)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setConfirmDel(q)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <QuestEditorDialog open={editorOpen} onOpenChange={setEditorOpen} initial={editing} />

      <AlertDialog open={!!confirmDel} onOpenChange={v => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá quest "{confirmDel?.title_vi}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ xoá được nếu chưa có user nào tích tiến độ cho quest này.
              Nếu đã có dữ liệu, hãy tắt <code>is_active</code> thay vì xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDel) del.mutate(confirmDel.id); setConfirmDel(null); }}
              className="bg-destructive text-destructive-foreground"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
