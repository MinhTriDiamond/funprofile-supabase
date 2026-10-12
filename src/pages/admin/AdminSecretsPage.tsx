import { ShieldAlert, Info } from "lucide-react";
import { useLanguage } from '@/i18n/LanguageContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SecretsForm from "@/components/admin/secrets/SecretsForm";
import SecretsTable from "@/components/admin/secrets/SecretsTable";

export default function AdminSecretsPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
        <p className="text-sm text-muted-foreground">
          {t('aspDesc')}
        </p>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{t('aspAdminOnly')}</AlertTitle>
        <AlertDescription className="text-xs">
          {t('aspLogNote')}
        </AlertDescription>
      </Alert>

      <Alert variant="default" className="border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900 dark:text-amber-200">{t('aspSyncTitle')}</AlertTitle>
        <AlertDescription className="text-xs text-amber-900/80 dark:text-amber-200/80">
          {t('aspSyncBodyA')}<span className="font-mono">AGORA_*</span>, <span className="font-mono">CLOUDFLARE_*</span>,{" "}
          <span className="font-mono">RESTREAM_*</span>{t('aspSyncBodyC')}<span className="font-mono">Deno.env.get</span>{t('aspSyncBodyD')}
          <span className="font-mono">app_secret_get</span>.
        </AlertDescription>
      </Alert>

      <SecretsForm />
      <SecretsTable />
    </div>
  );
}
