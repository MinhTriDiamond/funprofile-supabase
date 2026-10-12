import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, FlaskConical, Search, Copy, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useAdminKycList, useAdminKycDetail, type AdminKycItem, type AdminKycFilters } from '@/hooks/admin/useAdminKycList';
import { format } from 'date-fns';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40' },
    pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40' },
    in_review: { label: 'In review', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40' },
    rejected: { label: 'Rejected', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40' },
    expired: { label: 'Expired', cls: 'bg-muted text-muted-foreground border-muted-foreground/30' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <Badge variant="outline" className={`${m.cls} text-xs`}>{m.label}</Badge>;
}

function EnvBadge({ env, isTest }: { env: string; isTest: boolean }) {
  if (isTest || env === 'sandbox') {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] border-muted-foreground/30 text-muted-foreground bg-muted/40">
        <FlaskConical className="w-3 h-3" /> Sandbox
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
      <ShieldCheck className="w-3 h-3" /> Production
    </Badge>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ?? ''}`}>{value.toLocaleString()}</p>
    </Card>
  );
}

export default function AdminKycPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  const [filters, setFilters] = useState<AdminKycFilters>({ page: 1, page_size: 50 });
  const [selected, setSelected] = useState<AdminKycItem | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, refetch } = useAdminKycList(filters, isAdmin);
  const detail = useAdminKycDetail(selected?.id, selected?.user_id);

  if (roleLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-64" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{t('kycNoAccess')}</p>
        </Card>
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const applySearch = () => setFilters((f) => ({ ...f, q: searchInput.trim() || undefined, page: 1 }));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">KYC Dashboard</h1>
          <p className="text-xs text-muted-foreground">{t('kycPhaseNote')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label={t('kycTotalApplicants')} value={Number(summary.total_applicants ?? 0)} />
        <SummaryCard label="Approved" value={Number(summary.approved ?? 0)} accent="text-emerald-600 dark:text-emerald-400" />
        <SummaryCard label="In review" value={Number(summary.in_review ?? 0)} accent="text-blue-600 dark:text-blue-400" />
        <SummaryCard label="Rejected" value={Number(summary.rejected ?? 0)} accent="text-rose-600 dark:text-rose-400" />
      </div>

      <Card className="p-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[200px] flex gap-2">
            <Input
              placeholder={t('kycSearchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            />
            <Button size="icon" variant="secondary" onClick={applySearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? undefined : v, page: 1 }))}
          >
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('kycAllStatus')}</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.environment ?? 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, environment: v === 'all' ? undefined : (v as any), page: 1 }))}
          >
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Env" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('kycAllEnv')}</SelectItem>
              <SelectItem value="sandbox">Sandbox</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.is_test === undefined ? 'all' : String(filters.is_test)}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, is_test: v === 'all' ? undefined : v === 'true', page: 1 }))
            }
          >
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Test?" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Test + Real</SelectItem>
              <SelectItem value="true">{t('kycOnlyTest')}</SelectItem>
              <SelectItem value="false">{t('kycOnlyReal')}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={!!filters.mismatch_only}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, mismatch_only: !!v, page: 1 }))}
            />
            {t('kycOnlyMismatch')}
          </label>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Applicant ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Doc / Country</TableHead>
              <TableHead className="hidden md:table-cell">Level</TableHead>
              <TableHead>Env</TableHead>
              <TableHead className="hidden lg:table-cell">Verified At</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{t('kycNoData')}</TableCell></TableRow>
            )}
            {items.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                <TableCell>
                  <div className="font-medium">{row.profile?.display_name ?? row.profile?.username ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">@{row.profile?.username ?? '—'}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">{row.email ?? '—'}</TableCell>
                <TableCell>
                  <button
                    className="flex items-center gap-1 text-xs font-mono hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(row.provider_applicant_id ?? '').then(() => toast.success(t('kycCopied')));
                    }}
                  >
                    {row.provider_applicant_id?.slice(0, 10)}…
                    <Copy className="w-3 h-3" />
                  </button>
                </TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {row.selected_document_type || row.actual_document_type ? (
                    <div className="space-y-0.5">
                      <div className={row.doc_mismatch ? 'text-rose-600 font-medium' : ''}>
                        {row.actual_document_type ?? '—'} / {row.actual_issuing_country ?? '—'}
                      </div>
                      {(row.selected_document_type !== row.actual_document_type || row.selected_country !== row.actual_issuing_country) && (
                        <div className="text-[10px] text-muted-foreground">
                          selected: {row.selected_document_type ?? '—'} / {row.selected_country ?? '—'}
                        </div>
                      )}
                      {row.doc_mismatch && (
                        <Badge variant="outline" className="gap-1 text-[10px] border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10">
                          <AlertTriangle className="w-2.5 h-2.5" /> Mismatch
                        </Badge>
                      )}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">{row.level_name ?? '—'}</TableCell>
                <TableCell>
                  <EnvBadge env={row.verification_environment} isTest={row.is_test_verification} />
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {row.verified_at ? format(new Date(row.verified_at), 'yyyy-MM-dd HH:mm') : '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('kycTotalPrefix')}{total.toLocaleString()}{t('kycPageMid')}{filters.page ?? 1}</span>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >Prev</Button>
          <Button
            variant="outline" size="sm"
            disabled={items.length < (filters.page_size ?? 50)}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >Next</Button>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('kycSheetTitle')}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">User:</span> {selected.profile?.display_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Email:</span> {selected.email ?? '—'}</div>
                <div className="col-span-2 font-mono text-xs break-all">
                  <span className="text-muted-foreground">Applicant:</span> {selected.provider_applicant_id}
                </div>
                <div><StatusBadge status={selected.status} /></div>
                <div><EnvBadge env={selected.verification_environment} isTest={selected.is_test_verification} /></div>
                <div><span className="text-muted-foreground">Level:</span> {selected.level_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Verified:</span> {selected.verified_at ? format(new Date(selected.verified_at), 'yyyy-MM-dd HH:mm') : '—'}</div>
                {selected.rejected_reason && (
                  <div className="col-span-2 text-xs text-rose-600">Reason: {selected.rejected_reason}</div>
                )}
              </div>

              <Card className={`p-3 ${selected.doc_mismatch ? 'border-rose-500/50 bg-rose-500/5' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Document Verification</h4>
                  {selected.doc_mismatch && (
                    <Badge variant="outline" className="gap-1 text-xs border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10">
                      <AlertTriangle className="w-3 h-3" /> Doc mismatch
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Selected document</div>
                    <div className="font-medium">{selected.selected_document_type ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Actual document</div>
                    <div className={`font-medium ${selected.doc_mismatch && selected.selected_document_type !== selected.actual_document_type ? 'text-rose-600' : ''}`}>
                      {selected.actual_document_type ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Selected country</div>
                    <div className="font-medium">{selected.selected_country ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Actual issuing country</div>
                    <div className={`font-medium ${selected.doc_mismatch && selected.selected_country !== selected.actual_issuing_country ? 'text-rose-600' : ''}`}>
                      {selected.actual_issuing_country ?? '—'}
                    </div>
                  </div>
                  {selected.kyc_risk_flag && (
                    <div className="col-span-2 text-rose-600">
                      <span className="text-muted-foreground">Risk flag:</span> {selected.kyc_risk_flag}
                    </div>
                  )}
                </div>
                {selected.is_test_verification && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {t('kycSandboxWarn')}
                  </p>
                )}
              </Card>

              <Tabs defaultValue="events">
                <TabsList>
                  <TabsTrigger value="events">Webhook Events</TabsTrigger>
                  <TabsTrigger value="audit">Audit Logs</TabsTrigger>
                </TabsList>
                <TabsContent value="events">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {(detail.data?.events ?? []).map((ev: any) => (
                        <Card key={ev.id} className="p-3 text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium">{ev.event_type ?? ev.status}</span>
                            <span className="text-muted-foreground">{ev.received_at && format(new Date(ev.received_at), 'HH:mm:ss')}</span>
                          </div>
                          <div className="text-muted-foreground mt-1">
                            sig: {ev.signature_valid ? '✓' : '✗'} • {ev.processing_status}
                          </div>
                          {ev.error_message && <div className="text-rose-600 mt-1">{ev.error_message}</div>}
                        </Card>
                      ))}
                      {!detail.isLoading && (detail.data?.events ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">{t('kycNoEvents')}</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="audit">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {(detail.data?.audits ?? []).map((a: any) => (
                        <Card key={a.id} className="p-3 text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium">{a.action}</span>
                            <span className="text-muted-foreground">{format(new Date(a.created_at), 'HH:mm:ss')}</span>
                          </div>
                          <div className="text-muted-foreground mt-1">
                            {a.source} • {a.actor_type}
                            {a.old_status && a.new_status && ` • ${a.old_status} → ${a.new_status}`}
                          </div>
                        </Card>
                      ))}
                      {!detail.isLoading && (detail.data?.audits ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">{t('kycNoAudit')}</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
