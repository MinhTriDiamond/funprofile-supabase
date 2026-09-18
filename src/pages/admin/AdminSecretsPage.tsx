import { ShieldAlert, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SecretsForm from "@/components/admin/secrets/SecretsForm";
import SecretsTable from "@/components/admin/secrets/SecretsTable";

export default function AdminSecretsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý app secrets nội bộ của FUN.RICH. Giá trị được mã hóa khi lưu và không bao giờ được trả lại
          giao diện sau khi đã lưu.
        </p>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Chỉ admin/super_admin truy cập</AlertTitle>
        <AlertDescription className="text-xs">
          Mọi thao tác (create/update/delete) đều được ghi log với tên secret và actor — không log giá trị.
        </AlertDescription>
      </Alert>

      <Alert variant="default" className="border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900 dark:text-amber-200">Lưu ý sync với Lovable Cloud Secrets</AlertTitle>
        <AlertDescription className="text-xs text-amber-900/80 dark:text-amber-200/80">
          Các secret như <span className="font-mono">AGORA_*</span>, <span className="font-mono">CLOUDFLARE_*</span>,{" "}
          <span className="font-mono">RESTREAM_*</span> nếu cần dùng trực tiếp trong Edge Function của Lovable Cloud
          (qua <span className="font-mono">Deno.env.get</span>) vẫn phải được sync thủ công qua Workspace Settings →
          Secrets. Tab này lưu các "app secrets nội bộ" trong DB, dùng cho Edge Function nội bộ qua RPC{" "}
          <span className="font-mono">app_secret_get</span>.
        </AlertDescription>
      </Alert>

      <SecretsForm />
      <SecretsTable />
    </div>
  );
}
