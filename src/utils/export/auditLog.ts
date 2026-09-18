import { supabase } from '@/integrations/supabase/client';
import type { ExportFilterParams } from './types';

interface AuditPayload {
  userId: string;
  exportType: 'excel' | 'pdf' | 'csv';
  surface: string;
  filterParams: ExportFilterParams;
  rowCount: number;
  role?: 'user' | 'admin';
  status?: 'success' | 'failed' | 'blocked_limit';
  errorMessage?: string | null;
}

/** Ghi 1 dòng vào export_audit_logs. Không throw — fail-silent để không chặn UX. */
export async function recordExportAudit(p: AuditPayload): Promise<void> {
  try {
    await supabase.from('export_audit_logs').insert({
      user_id: p.userId,
      export_type: p.exportType,
      surface: p.surface,
      filter_params: p.filterParams as never,
      row_count: p.rowCount,
      role: p.role ?? 'user',
      status: p.status ?? 'success',
      error_message: p.errorMessage ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export-audit] insert failed', e);
  }
}
