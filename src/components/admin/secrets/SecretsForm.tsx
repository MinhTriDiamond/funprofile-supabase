import { useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  SECRET_NAME_REGEX,
  SUGGESTED_SECRET_NAMES,
  useUpsertAdminSecrets,
} from "@/hooks/useAdminSecrets";

interface Row {
  name: string;
  value: string;
}

const empty = (): Row => ({ name: "", value: "" });

export default function SecretsForm({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([empty()]);
  const upsert = useUpsertAdminSecrets();

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const removeRow = (i: number) =>
    setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const handleSave = async () => {
    const items = rows
      .map((r) => ({ name: r.name.trim().toUpperCase(), value: r.value }))
      .filter((r) => r.name && r.value);

    if (!items.length) {
      toast.error("Vui lòng nhập ít nhất một secret hợp lệ");
      return;
    }
    for (const it of items) {
      if (!SECRET_NAME_REGEX.test(it.name)) {
        toast.error(`Tên không hợp lệ: ${it.name}`);
        return;
      }
    }
    try {
      const res = await upsert.mutateAsync(items);
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) {
        toast.error(`Lưu thất bại ${failed.length}/${res.results.length}: ${failed[0].error}`);
      } else {
        toast.success(`Đã lưu ${res.results.length} secret`);
        setRows([empty()]);
        onDone?.();
      }
    } catch (e) {
      toast.error((e as Error).message || "Lỗi không xác định");
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Thêm secret mới</h3>
        <p className="text-xs text-muted-foreground">
          Giá trị được mã hóa khi lưu. Sau khi lưu, giá trị không thể đọc lại từ giao diện.
        </p>
      </div>

      <datalist id="secret-name-suggestions">
        {SUGGESTED_SECRET_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              {i === 0 && <Label className="text-xs">Name</Label>}
              <Input
                list="secret-name-suggestions"
                placeholder="VD: AGORA_APP_ID"
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value.toUpperCase() })}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              {i === 0 && <Label className="text-xs">Value</Label>}
              <Input
                type="password"
                placeholder="Giá trị secret"
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              aria-label="Xóa dòng"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, empty()])}>
          <Plus className="mr-1 h-4 w-4" />
          Add another
        </Button>
        <div className="flex-1" />
        <Button type="button" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
