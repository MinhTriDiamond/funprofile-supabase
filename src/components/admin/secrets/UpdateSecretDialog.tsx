import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUpsertAdminSecrets, type AdminSecretRow } from "@/hooks/useAdminSecrets";

interface Props {
  secret: AdminSecretRow | null;
  onClose: () => void;
}

export default function UpdateSecretDialog({ secret, onClose }: Props) {
  const [value, setValue] = useState("");
  const upsert = useUpsertAdminSecrets();

  useEffect(() => {
    setValue(""); // never preload old value
  }, [secret?.id]);

  if (!secret) return null;

  const handleSave = async () => {
    if (!value) {
      toast.error("Vui lòng nhập giá trị mới");
      return;
    }
    try {
      const res = await upsert.mutateAsync([{ name: secret.name, value }]);
      const r = res.results[0];
      if (r?.ok) {
        toast.success(`Đã cập nhật ${secret.name}`);
        setValue("");
        onClose();
      } else {
        toast.error(r?.error || "Lỗi cập nhật");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cập nhật secret</DialogTitle>
          <DialogDescription>
            Giá trị cũ không hiển thị vì lý do bảo mật. Nhập giá trị mới để ghi đè.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={secret.name} disabled className="font-mono" />
          </div>
          <div>
            <Label className="text-xs">New value</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Nhập giá trị mới"
              spellCheck={false}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending || !value}>
            {upsert.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
