import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Tag, Loader2, Pencil } from 'lucide-react';
import {
  useExternalWalletLabels,
  useUpsertWalletLabel,
  useDeleteWalletLabel,
} from '@/hooks/useExternalWalletLabels';
import { shortenAddress } from '@/lib/formatters';

export default function ExternalWalletLabelsTab() {
  const { data: labels = [], isLoading } = useExternalWalletLabels();
  const upsert = useUpsertWalletLabel();
  const remove = useDeleteWalletLabel();

  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleAdd = () => {
    if (!newAddress.trim() || !newLabel.trim()) return;
    upsert.mutate(
      { wallet_address: newAddress.trim(), label: newLabel.trim() },
      { onSuccess: () => { setNewAddress(''); setNewLabel(''); } }
    );
  };

  const handleSaveEdit = (address: string) => {
    if (!editLabel.trim()) return;
    upsert.mutate(
      { wallet_address: address, label: editLabel.trim() },
      { onSuccess: () => setEditId(null) }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-orange-500" />
          Nhãn Ví Ngoài ({labels.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Địa chỉ ví (0x...)"
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Input
            placeholder="Tên hiển thị"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="w-[200px]"
          />
          <Button onClick={handleAdd} disabled={upsert.isPending} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Thêm
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : labels.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có nhãn ví ngoài nào</p>
        ) : (
          <div className="space-y-2">
            {labels.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-muted-foreground">{shortenAddress(l.wallet_address, 8)}</div>
                  {editId === l.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className="h-7 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSaveEdit(l.wallet_address)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(l.wallet_address)} disabled={upsert.isPending}>
                        Lưu
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Huỷ</Button>
                    </div>
                  ) : (
                    <div className="font-semibold text-sm">{l.label}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditId(l.id); setEditLabel(l.label); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => remove.mutate(l.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
