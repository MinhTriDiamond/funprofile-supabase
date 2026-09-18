import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDeleteAdminSecret, type AdminSecretRow } from "@/hooks/useAdminSecrets";

interface Props {
  secret: AdminSecretRow | null;
  onClose: () => void;
}

export default function DeleteSecretDialog({ secret, onClose }: Props) {
  const [confirm, setConfirm] = useState("");
  const del = useDeleteAdminSecret();

  useEffect(() => {
    setConfirm("");
  }, [secret?.id]);

  if (!secret) return null;

  const canDelete = confirm.trim().toUpperCase() === secret.name;

  const handleDelete = async () => {
    try {
      await del.mutateAsync(secret.name);
      toast.success(`Đã xóa ${secret.name}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Xóa secret
          </AlertDialogTitle>
          <AlertDialogDescription>
            Hành động này không thể hoàn tác. Các Edge Function dùng <span className="font-mono">{secret.name}</span>{" "}
            sẽ ngừng hoạt động.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">
            Gõ <span className="font-mono font-semibold">{secret.name}</span> để xác nhận
          </Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={secret.name}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete || del.isPending}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Xóa vĩnh viễn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
