/**
 * BulkRecipientInput — paste danh sách @username hoặc 0x… để thêm hàng loạt người nhận.
 * Hỗ trợ CSV (address,amount per line) — amount sẽ override khi gửi.
 *
 * v2 (06/2026): hiển thị lỗi chi tiết theo từng dòng (lineNo + reason) cho dễ sửa.
 */

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { tokenize, resolveBulkTokens, type BulkInvalidEntry } from './parseBulkInput';
import type { ResolvedRecipient } from './types';
import { MAX_RECIPIENTS_TOTAL } from '@/config/disperse';
import { toast } from 'sonner';

interface BulkRecipientInputProps {
  senderUserId: string | null;
  existingRecipients: ResolvedRecipient[];
  onAdd: (recipients: ResolvedRecipient[], amounts: Record<string, string>) => void;
}

interface RowIssue extends BulkInvalidEntry {
  severity: 'error' | 'warn';
}

export function BulkRecipientInput({
  senderUserId,
  existingRecipients,
  onAdd,
}: BulkRecipientInputProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    added: number;
    issues: RowIssue[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_RECIPIENTS_TOTAL - existingRecipients.length;

  const handleParse = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setSummary(null);
    try {
      const tokens = tokenize(text);
      if (tokens.length === 0) {
        toast.error('Không tìm thấy địa chỉ hoặc username nào để xử lý');
        return;
      }
      if (tokens.length > remaining) {
        toast.warning(`Chỉ thêm được ${remaining} ví nữa (đã đạt ${MAX_RECIPIENTS_TOTAL - remaining}/${MAX_RECIPIENTS_TOTAL})`);
      }
      const sliced = tokens.slice(0, Math.max(0, remaining));
      const result = await resolveBulkTokens(sliced, senderUserId, existingRecipients);
      onAdd(result.resolved, result.amounts);

      const issues: RowIssue[] = [
        ...result.invalid.map(e => ({ ...e, severity: 'error' as const })),
        ...result.notFound.map(e => ({ ...e, severity: 'error' as const })),
        ...result.selfReferences.map(e => ({ ...e, severity: 'error' as const })),
        ...result.duplicates.map(e => ({ ...e, severity: 'warn' as const })),
      ].sort((a, b) => a.lineNo - b.lineNo);

      setSummary({
        added: result.resolved.length,
        issues,
      });
      if (result.resolved.length > 0) setText('');
    } catch (err) {
      console.error('[BulkRecipientInput] parse error', err);
      toast.error('Lỗi khi xử lý danh sách');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error('File quá lớn (tối đa 1MB)');
      return;
    }
    const content = await file.text();
    setText(content);
  };

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary" />
          Thêm hàng loạt (tối đa {MAX_RECIPIENTS_TOTAL} ví)
        </label>
        <span className="text-xs text-muted-foreground">
          Còn lại: <strong className="text-foreground">{remaining}</strong>
        </span>
      </div>

      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Dán danh sách, mỗi dòng/dấu phẩy là 1 ví:\n@username1, @username2\nhttps://fun.rich/leminhtri\n0xabc...123\n0xdef...456, 100   (CSV: amount riêng)`}
        rows={5}
        className="text-xs font-mono resize-none"
        disabled={busy}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleParse}
          disabled={busy || !text.trim() || remaining === 0}
          className="flex-1"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
          Phân tích & thêm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload className="w-3.5 h-3.5 mr-1" />
          CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {summary && (() => {
        const duplicateCount = summary.issues.filter(i => i.severity === 'warn').length;
        const errorCount = summary.issues.filter(i => i.severity === 'error').length;
        return (
          <div className="text-xs space-y-1.5 pt-1 border-t">
            {summary.added > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Đã thêm <strong>{summary.added}</strong> ví
              </div>
            )}
            {duplicateCount > 0 && (
              <div className="flex items-start gap-1.5 text-amber-600 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  ⚠ Có <strong>{duplicateCount}</strong> ví/username trùng — đã tự bỏ qua. Xem chi tiết bên dưới.
                </span>
              </div>
            )}
            {summary.issues.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {summary.issues.length} dòng có vấn đề{errorCount > 0 ? ` (${errorCount} lỗi)` : ''}:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1 rounded border border-border/60 bg-background/60 p-1.5">
                  {summary.issues.map((issue, i) => (
                    <div
                      key={`${issue.lineNo}-${i}`}
                      className={`flex items-start gap-1.5 text-[11px] leading-snug ${
                        issue.severity === 'error' ? 'text-destructive' : 'text-amber-600'
                      }`}
                    >
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="break-all">
                        {issue.severity === 'error' ? '✘' : '⚠'} Dòng {issue.lineNo}:{' '}
                        <code className="font-mono">{issue.raw}</code> — {issue.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        💡 Hỗ trợ paste hỗn hợp <code>@username</code>, link profile (vd <code>fun.rich/leminhtri</code>), và <code>0x...</code>. CSV per line: <code>địa_chỉ,số_tiền</code> (số tiền tùy chọn — nếu có sẽ ghi đè amount mặc định). Trùng username hoặc ví sẽ tự bị loại bỏ.
      </p>
    </div>
  );
}
