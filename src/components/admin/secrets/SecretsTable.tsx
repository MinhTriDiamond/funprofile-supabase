import { useState } from "react";
import { Pencil, Trash2, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminSecrets, type AdminSecretRow } from "@/hooks/useAdminSecrets";
import UpdateSecretDialog from "./UpdateSecretDialog";
import DeleteSecretDialog from "./DeleteSecretDialog";

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString("vi-VN");
  } catch {
    return d;
  }
}

export default function SecretsTable() {
  const { data: secrets = [], isLoading } = useAdminSecrets();
  const [editing, setEditing] = useState<AdminSecretRow | null>(null);
  const [deleting, setDeleting] = useState<AdminSecretRow | null>(null);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-base font-semibold">Saved secrets</h3>
          <p className="text-xs text-muted-foreground">
            Hệ thống chỉ hiển thị tên và metadata. Giá trị luôn bị che để bảo mật.
          </p>
        </div>
        <Badge variant="secondary">{secrets.length} secret</Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[180px]">Value</TableHead>
              <TableHead className="w-[180px]">Created</TableHead>
              <TableHead className="w-[180px]">Updated</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Đang tải…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && secrets.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có secret nào. Hãy thêm ở form bên trên.
                </TableCell>
              </TableRow>
            )}
            {secrets.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {s.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">••••••••</span>
                    <Badge variant="outline" className="text-[10px]">
                      Configured
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmt(s.created_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmt(s.updated_at)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Update
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UpdateSecretDialog secret={editing} onClose={() => setEditing(null)} />
      <DeleteSecretDialog secret={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
