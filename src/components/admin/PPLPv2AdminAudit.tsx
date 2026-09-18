import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Eye, Shield, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface AuditAction {
  id: string;
  user_id: string;
  action_type_code: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  source_platform: string | null;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

interface PPLPv2AdminAuditProps {
  adminId: string;
}

const PPLPv2AdminAudit = ({ adminId }: PPLPv2AdminAuditProps) => {
  const { t } = useLanguage();
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [autoAttesting, setAutoAttesting] = useState(false);

  const handleAutoAttestInternal = async () => {
    const pendingCount = actions.filter(a => a.status === 'proof_pending').length;
    if (pendingCount === 0) {
      toast.info('Không có hành động nào ở trạng thái chờ bằng chứng');
      return;
    }
    const ok = window.confirm(
      `Auto-attest ${pendingCount} hành động "chờ bằng chứng" dựa trên log nội bộ của hệ thống?\n\n` +
      `→ Tạo proof system_log + chạy lại validation engine (NLP + fraud check vẫn áp dụng).\n` +
      `→ Gửi notification cho user.`,
    );
    if (!ok) return;

    setAutoAttesting(true);
    try {
      const ids = actions.filter(a => a.status === 'proof_pending').map(a => a.id);
      const { data, error } = await supabase.functions.invoke('pplp-v2-auto-attest-internal', {
        body: { action_ids: ids, notify: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const r = data as any;
      toast.success(
        `Auto-attest xong: ${r.succeeded}/${r.processed} thành công` +
        (r.failed?.length ? ` · ${r.failed.length} lỗi` : '') +
        (r.skipped?.length ? ` · ${r.skipped.length} bỏ qua` : ''),
      );
      console.log('[auto-attest] details', r);
      fetchFlaggedActions();
    } catch (err: any) {
      console.error('Auto-attest error:', err);
      toast.error(err?.message || 'Không thể auto-attest');
    } finally {
      setAutoAttesting(false);
    }
  };

  const fetchFlaggedActions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pplp_v2_user_actions')
        .select('id, user_id, action_type_code, title, description, status, created_at, source_platform')
        .in('status', ['manual_review', 'flagged', 'proof_pending'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(a => a.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const enriched = data.map(a => ({
          ...a,
          profiles: profileMap.get(a.user_id) || null,
        }));
        setActions(enriched);
      } else {
        setActions([]);
      }
    } catch (err) {
      console.error('Error fetching flagged actions:', err);
      toast.error('Không thể tải danh sách hành động cần duyệt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlaggedActions();
  }, []);

  const handleApprove = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const { error } = await supabase.functions.invoke('pplp-v2-validate-action', {
        body: { action_id: actionId, admin_override: true, admin_decision: 'approved', admin_note: reviewNote || 'Admin approved' },
      });
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        admin_id: adminId,
        action: 'pplp_v2_action_approved',
        target_user_id: actions.find(a => a.id === actionId)?.user_id || null,
        details: { action_id: actionId, note: reviewNote },
      });

      toast.success('Đã duyệt hành động thành công');
      setReviewNote('');
      setSelectedAction(null);
      fetchFlaggedActions();
    } catch (err) {
      console.error('Approve error:', err);
      toast.error('Không thể duyệt hành động');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const { error: updateError } = await supabase
        .from('pplp_v2_user_actions')
        .update({ status: 'rejected' })
        .eq('id', actionId);
      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        admin_id: adminId,
        action: 'pplp_v2_action_rejected',
        target_user_id: actions.find(a => a.id === actionId)?.user_id || null,
        details: { action_id: actionId, note: reviewNote },
        reason: reviewNote || 'Admin rejected',
      });

      toast.success('Đã từ chối hành động');
      setReviewNote('');
      setSelectedAction(null);
      fetchFlaggedActions();
    } catch (err) {
      console.error('Reject error:', err);
      toast.error('Không thể từ chối hành động');
    } finally {
      setProcessing(null);
    }
  };

  const handleFlagSpam = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const action = actions.find(a => a.id === actionId);
      
      // Mark as rejected
      await supabase
        .from('pplp_v2_user_actions')
        .update({ status: 'rejected' })
        .eq('id', actionId);

      // Trust decay
      if (action?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('trust_level')
          .eq('id', action.user_id)
          .single();

        const currentTrust = (profile as any)?.trust_level ?? 1.0;
        await supabase
          .from('profiles')
          .update({ trust_level: Math.max(0, currentTrust - 0.05) })
          .eq('id', action.user_id);
      }

      await supabase.from('audit_logs').insert({
        admin_id: adminId,
        action: 'pplp_v2_action_flagged_spam',
        target_user_id: action?.user_id || null,
        details: { action_id: actionId, note: reviewNote },
        reason: reviewNote || 'Flagged as spam',
      });

      toast.success('Đã đánh dấu spam và giảm trust_level');
      setReviewNote('');
      setSelectedAction(null);
      fetchFlaggedActions();
    } catch (err) {
      console.error('Flag spam error:', err);
      toast.error('Không thể đánh dấu spam');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'manual_review': return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Cần duyệt</Badge>;
      case 'flagged': return <Badge variant="destructive">Bị gắn cờ</Badge>;
      case 'proof_pending': return <Badge variant="secondary">Chờ bằng chứng</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">PPLP v2 — Duyệt hành động thủ công</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleAutoAttestInternal}
            disabled={autoAttesting || loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Sparkles className={`w-4 h-4 mr-2 ${autoAttesting ? 'animate-pulse' : ''}`} />
            {autoAttesting ? 'Đang xử lý…' : 'Auto-attest log nội bộ'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchFlaggedActions} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">{actions.filter(a => a.status === 'manual_review').length}</p>
            <p className="text-sm text-muted-foreground">Cần duyệt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-red-600">{actions.filter(a => a.status === 'flagged').length}</p>
            <p className="text-sm text-muted-foreground">Bị gắn cờ</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-muted-foreground">{actions.filter(a => a.status === 'proof_pending').length}</p>
            <p className="text-sm text-muted-foreground">Chờ bằng chứng</p>
          </CardContent>
        </Card>
      </div>

      <ScrollArea className="h-[600px]">
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : actions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-medium">Không có hành động nào cần duyệt</p>
              </CardContent>
            </Card>
          ) : (
            actions.map(action => (
              <Card key={action.id} className={`transition-all ${selectedAction === action.id ? 'ring-2 ring-primary' : ''}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(action.status)}
                        <Badge variant="outline">{action.action_type_code}</Badge>
                        {action.source_platform && <Badge variant="secondary">{action.source_platform}</Badge>}
                      </div>
                      <h3 className="font-semibold truncate">{action.title}</h3>
                      {action.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{action.profiles?.full_name || 'Unknown'}</span>
                        <span>•</span>
                        <span>{new Date(action.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setSelectedAction(selectedAction === action.id ? null : action.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedAction === action.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <Textarea
                        placeholder="Ghi chú duyệt (không bắt buộc)..."
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="bg-green-600 hover:bg-green-700"
                          disabled={processing === action.id}
                          onClick={() => handleApprove(action.id)}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Duyệt
                        </Button>
                        <Button
                          size="sm" variant="destructive"
                          disabled={processing === action.id}
                          onClick={() => handleReject(action.id)}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Từ chối
                        </Button>
                        <Button
                          size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                          disabled={processing === action.id}
                          onClick={() => handleFlagSpam(action.id)}
                        >
                          <AlertTriangle className="w-4 h-4 mr-1" /> Spam
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PPLPv2AdminAudit;
