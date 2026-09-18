import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Edit, Gift, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { TIER_COLORS, TIER_LABEL_VI, type BoxTier } from '@/modules/mystery-box/types';
import { useMysteryBoxStatsDaily } from '@/modules/mystery-box/hooks/useMysteryBoxStats';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, CartesianGrid } from 'recharts';

interface DropEntry { reward_code: string; pct: number; type: string; value_int: number; rarity?: string }
interface Def {
  id: string; code: string; name_vi: string; name_en: string; tier: BoxTier;
  source_type: string; cost_camly: number | null; is_active: boolean;
  pity_threshold: number; drop_table: DropEntry[];
}
interface Reward {
  id: string; code: string; type: string; value_int: number; rarity: string;
  metadata: Record<string, unknown>;
}
interface AuditRow {
  id: string; target_user_id: string; source: string; box_code: string | null;
  reason: string | null; created_at: string;
}
interface OpenLogRow {
  id: string; user_id: string; reward_code: string; opened_at: string;
  inventory: { definition: { tier: BoxTier; name_vi: string } | null } | null;
}
interface RiskRow {
  id: string; user_id: string; risk_type: string; details: Record<string, unknown>;
  resolved: boolean; created_at: string;
}

export default function MysteryBoxAdminTab() {
  const [defs, setDefs] = useState<Def[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [liveOpens, setLiveOpens] = useState<OpenLogRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [stats, setStats] = useState<{ total: number; opened: number; purchased: number; byTier: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Def | null>(null);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const sb = supabase as any;
      const [{ data: defsData }, { data: rewardsData }, { data: invs }, { data: auditData }, { data: opensData }, { data: risksData }] = await Promise.all([
        sb.from('mystery_box_definitions').select('*').order('tier'),
        sb.from('mystery_box_rewards').select('*').order('rarity'),
        sb.from('mystery_box_inventory').select('source_event, opened_at, definition:mystery_box_definitions(tier)'),
        sb.from('mystery_box_grant_audit').select('*').order('created_at', { ascending: false }).limit(50),
        sb.from('mystery_box_open_log').select('id, user_id, reward_code, opened_at, inventory:mystery_box_inventory(definition:mystery_box_definitions(tier, name_vi))').order('opened_at', { ascending: false }).limit(50),
        sb.from('mystery_box_risk_log').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      setDefs((defsData ?? []) as Def[]);
      setRewards((rewardsData ?? []) as Reward[]);
      setAudits((auditData ?? []) as AuditRow[]);
      setLiveOpens((opensData ?? []) as OpenLogRow[]);
      setRisks((risksData ?? []) as RiskRow[]);
      const items = (invs ?? []) as { source_event: string; opened_at: string | null; definition?: { tier: string } }[];
      const byTier: Record<string, number> = {};
      let opened = 0, purchased = 0;
      for (const i of items) {
        const t = i.definition?.tier ?? 'common';
        byTier[t] = (byTier[t] ?? 0) + 1;
        if (i.opened_at) opened++;
        if (i.source_event === 'premium_purchase') purchased++;
      }
      setStats({ total: items.length, opened, purchased, byTier });
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  // Realtime live opens
  useEffect(() => {
    const ch = supabase
      .channel('admin-mb-opens')
      .on('postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'mystery_box_open_log' } as never,
        () => reload(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-bold">Hộp Bí Ẩn</h2>
        <div className="flex gap-2">
          <Button onClick={reload} variant="outline" size="sm" className="gap-2"><RefreshCw className="w-4 h-4" /> Làm mới</Button>
          <Button onClick={() => setGrantOpen(true)} size="sm" className="gap-2">
            <Gift className="w-4 h-4" /> Tặng box thủ công
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="stats">Thống kê</TabsTrigger>
          <TabsTrigger value="defs">Định nghĩa</TabsTrigger>
          <TabsTrigger value="rewards">Phần thưởng</TabsTrigger>
          <TabsTrigger value="live">Live opens</TabsTrigger>
          <TabsTrigger value="lookup">User lookup</TabsTrigger>
          <TabsTrigger value="risk">
            Risk {risks.filter(r => !r.resolved).length > 0 && <Badge variant="destructive" className="ml-2">{risks.filter(r => !r.resolved).length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4 mt-4">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Tổng hộp đã cấp" value={stats.total} />
              <StatCard label="Đã mở" value={stats.opened} />
              <StatCard label="Mua CAMLY" value={stats.purchased} />
              <StatCard label="Tỉ lệ mở (%)" value={stats.total ? Math.round(stats.opened / stats.total * 100) : 0} />
            </div>
          )}
          <Card>
            <CardHeader><CardTitle>Phân bố theo tier</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['common','rare','epic','legendary','cosmic'] as BoxTier[]).map(t => (
                  <div key={t} className={`rounded-lg p-3 bg-gradient-to-br ${TIER_COLORS[t].bg} ${TIER_COLORS[t].text} text-center`}>
                    <div className="text-xs uppercase opacity-80">{TIER_LABEL_VI[t]}</div>
                    <div className="text-2xl font-bold">{stats?.byTier?.[t] ?? 0}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <DropRateChart defs={defs} />
        </TabsContent>

        <TabsContent value="defs" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Định nghĩa hộp ({defs.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {defs.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Badge className={`bg-gradient-to-br ${TIER_COLORS[d.tier].bg} ${TIER_COLORS[d.tier].text} border-0`}>
                    {TIER_LABEL_VI[d.tier]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{d.name_vi}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      <code>{d.code}</code> · {d.source_type} · pity {d.pity_threshold}
                      {d.cost_camly ? ` · ${d.cost_camly.toLocaleString()} CAMLY` : ''}
                      {' · drop sum '}{(d.drop_table ?? []).reduce((s, e) => s + (e.pct || 0), 0)}%
                    </div>
                  </div>
                  <Badge variant={d.is_active ? 'default' : 'secondary'}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Catalog phần thưởng ({rewards.length})</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {rewards.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded border-b last:border-0">
                  <code className="text-xs w-48 shrink-0">{r.code}</code>
                  <Badge variant="outline" className="shrink-0">{r.type}</Badge>
                  <span className="font-medium w-20 text-right shrink-0">{r.value_int.toLocaleString()}</span>
                  <Badge className="shrink-0">{r.rarity}</Badge>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditingReward(r)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <Card>
            <CardHeader><CardTitle>50 lần mở gần nhất (realtime)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {liveOpens.map(l => {
                  const tier = l.inventory?.definition?.tier ?? 'common';
                  return (
                    <div key={l.id} className="flex gap-3 py-2 border-b last:border-0">
                      <span className="text-muted-foreground w-32 shrink-0 text-xs">{new Date(l.opened_at).toLocaleString('vi-VN')}</span>
                      <Badge className={`bg-gradient-to-br ${TIER_COLORS[tier].bg} ${TIER_COLORS[tier].text} border-0 shrink-0`}>{TIER_LABEL_VI[tier]}</Badge>
                      <code className="text-xs shrink-0">{l.reward_code}</code>
                      <span className="text-xs text-muted-foreground truncate">{l.user_id}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lookup" className="mt-4">
          <UserLookup />
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Risk log ({risks.filter(r => !r.resolved).length} chưa xử lý)</CardTitle></CardHeader>
            <CardContent>
              {risks.length === 0 ? (
                <div className="text-sm text-muted-foreground">Không có cảnh báo nào.</div>
              ) : (
                <div className="space-y-1 text-sm">
                  {risks.map(r => (
                    <div key={r.id} className="flex gap-3 py-2 border-b last:border-0">
                      <span className="text-xs text-muted-foreground w-32 shrink-0">{new Date(r.created_at).toLocaleString('vi-VN')}</span>
                      <Badge variant={r.resolved ? 'secondary' : 'destructive'} className="shrink-0">{r.risk_type}</Badge>
                      <span className="text-xs truncate">{r.user_id}</span>
                      <span className="text-xs text-muted-foreground truncate">{JSON.stringify(r.details)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle>50 lần cấp gần nhất</CardTitle></CardHeader>
            <CardContent>
              {audits.length === 0 ? (
                <div className="text-sm text-muted-foreground">Chưa có audit nào.</div>
              ) : (
                <div className="space-y-1 text-sm">
                  {audits.map(a => (
                    <div key={a.id} className="flex gap-3 py-2 border-b last:border-0">
                      <span className="text-muted-foreground w-32 shrink-0 text-xs">{new Date(a.created_at).toLocaleString('vi-VN')}</span>
                      <Badge variant="outline" className="shrink-0">{a.source}</Badge>
                      <code className="text-xs shrink-0">{a.box_code}</code>
                      <span className="text-xs text-muted-foreground truncate">{a.target_user_id}</span>
                      <span className="text-xs italic truncate">{a.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editing && <EditDefDialog def={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {editingReward && <EditRewardDialog reward={editingReward} onClose={() => setEditingReward(null)} onSaved={reload} />}
      {grantOpen && <GrantDialog onClose={() => setGrantOpen(false)} onGranted={reload} defs={defs} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className="text-3xl font-bold mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function DropRateChart({ defs }: { defs: Def[] }) {
  const { data: stats = [], isLoading } = useMysteryBoxStatsDaily(7);
  if (isLoading) return null;
  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Tỉ lệ rơi 7 ngày (chưa có dữ liệu)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cron `mystery-box-stats-recompute-daily` chạy 04:30 UTC mỗi ngày. Gọi thủ công edge function nếu cần test ngay.
        </CardContent>
      </Card>
    );
  }
  // Aggregate by reward_code
  const map: Record<string, { reward_code: string; expected: number; actual: number; opens: number }> = {};
  for (const s of stats) {
    const k = s.reward_code;
    if (!map[k]) map[k] = { reward_code: k, expected: s.expected_pct, actual: 0, opens: 0 };
    map[k].opens += s.opens_count;
    map[k].actual += s.actual_pct * s.opens_count;
  }
  const data = Object.values(map).map(d => ({
    reward_code: d.reward_code,
    expected: Number(d.expected.toFixed(1)),
    actual: d.opens > 0 ? Number((d.actual / d.opens).toFixed(1)) : 0,
  }));

  return (
    <Card>
      <CardHeader><CardTitle>Tỉ lệ rơi thực tế vs thiết kế (7 ngày)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="reward_code" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis unit="%" />
              <Tooltip />
              <Legend />
              <Bar dataKey="expected" fill="#94a3b8" name="Thiết kế %" />
              <Bar dataKey="actual" fill="#f59e0b" name="Thực tế %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function EditDefDialog({ def, onClose, onSaved }: { def: Def; onClose: () => void; onSaved: () => void }) {
  const [nameVi, setNameVi] = useState(def.name_vi);
  const [nameEn, setNameEn] = useState(def.name_en);
  const [costCamly, setCostCamly] = useState(def.cost_camly?.toString() ?? '');
  const [pity, setPity] = useState(def.pity_threshold.toString());
  const [isActive, setIsActive] = useState(def.is_active);
  const [dropJson, setDropJson] = useState(JSON.stringify(def.drop_table ?? [], null, 2));
  const [saving, setSaving] = useState(false);

  const dropError = (() => {
    try {
      const parsed = JSON.parse(dropJson);
      if (!Array.isArray(parsed)) return 'drop_table phải là mảng';
      const sum = parsed.reduce((s: number, e: { pct?: number }) => s + (Number(e?.pct) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) return `Tổng pct = ${sum}, phải = 100`;
      for (const e of parsed) {
        if (!e.reward_code || !e.type || typeof e.pct !== 'number') return 'Mỗi entry cần reward_code, type, pct';
      }
      return null;
    } catch { return 'JSON không hợp lệ'; }
  })();

  const save = async () => {
    if (dropError) { toast.error(dropError); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('mystery_box_definitions')
      .update({
        name_vi: nameVi, name_en: nameEn,
        cost_camly: costCamly ? parseInt(costCamly) : null,
        pity_threshold: parseInt(pity),
        is_active: isActive,
        drop_table: JSON.parse(dropJson),
      })
      .eq('id', def.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Đã lưu');
    onSaved(); onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Sửa: <code>{def.code}</code></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tên (VI)</Label><Input value={nameVi} onChange={e => setNameVi(e.target.value)} /></div>
            <div><Label>Tên (EN)</Label><Input value={nameEn} onChange={e => setNameEn(e.target.value)} /></div>
            <div><Label>Cost CAMLY</Label><Input type="number" value={costCamly} onChange={e => setCostCamly(e.target.value)} /></div>
            <div><Label>Pity threshold</Label><Input type="number" value={pity} onChange={e => setPity(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active</label>
          <div>
            <Label>drop_table (JSON, tổng pct phải = 100)</Label>
            <Textarea value={dropJson} onChange={e => setDropJson(e.target.value)} className="font-mono text-xs h-48" />
            {dropError ? (
              <p className="text-xs text-destructive mt-1">⚠ {dropError}</p>
            ) : (
              <p className="text-xs text-emerald-600 mt-1">✓ Hợp lệ</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button onClick={save} disabled={saving || !!dropError}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRewardDialog({ reward, onClose, onSaved }: { reward: Reward; onClose: () => void; onSaved: () => void }) {
  const [valueInt, setValueInt] = useState(reward.value_int.toString());
  const [rarity, setRarity] = useState(reward.rarity);
  const [meta, setMeta] = useState(JSON.stringify(reward.metadata ?? {}, null, 2));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let parsedMeta: unknown;
    try { parsedMeta = JSON.parse(meta); } catch { toast.error('Metadata JSON sai'); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('mystery_box_rewards')
      .update({ value_int: parseInt(valueInt), rarity, metadata: parsedMeta })
      .eq('id', reward.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Đã lưu');
    onSaved(); onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Sửa reward: <code>{reward.code}</code></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Value</Label><Input type="number" value={valueInt} onChange={e => setValueInt(e.target.value)} /></div>
            <div><Label>Rarity</Label><Input value={rarity} onChange={e => setRarity(e.target.value)} /></div>
          </div>
          <div><Label>Metadata (JSON)</Label><Textarea value={meta} onChange={e => setMeta(e.target.value)} className="font-mono text-xs h-32" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserLookup() {
  const [uid, setUid] = useState('');
  const [data, setData] = useState<{ inv: unknown[]; opens: unknown[]; pity: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!uid.trim()) return;
    setLoading(true);
    const sb = supabase as any;
    const [{ data: inv }, { data: opens }] = await Promise.all([
      sb.from('mystery_box_inventory').select('*, definition:mystery_box_definitions(tier, name_vi)').eq('user_id', uid.trim()).order('created_at', { ascending: false }),
      sb.from('mystery_box_open_log').select('*').eq('user_id', uid.trim()).order('opened_at', { ascending: false }).limit(20),
    ]);
    const items = (inv ?? []) as { pity_counter?: number }[];
    const maxPity = items.reduce((m, i) => Math.max(m, i.pity_counter ?? 0), 0);
    setData({ inv: items, opens: opens ?? [], pity: maxPity });
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Search className="w-5 h-5" /> User Lookup</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="user_id (UUID)" value={uid} onChange={e => setUid(e.target.value)} />
          <Button onClick={search} disabled={loading || !uid.trim()}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tìm'}</Button>
        </div>
        {data && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Tổng box" value={data.inv.length} />
              <StatCard label="Đã mở" value={data.opens.length} />
              <StatCard label="Pity max" value={data.pity} />
            </div>
            <div className="text-xs text-muted-foreground">Inventory: {data.inv.length} entries · Open log: {data.opens.length} entries</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GrantDialog({ onClose, onGranted, defs }: { onClose: () => void; onGranted: () => void; defs: Def[] }) {
  const [userId, setUserId] = useState('');
  const [boxCode, setBoxCode] = useState(defs[0]?.code ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!userId || !boxCode) { toast.error('Thiếu thông tin'); return; }
    setSubmitting(true);
    const { data, error } = await (supabase as any).functions.invoke('mystery-box-trigger', {
      body: { target_user_id: userId, source: 'event_manual', box_code: boxCode, reason },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error || 'Lỗi');
      return;
    }
    toast.success('Đã tặng box');
    onGranted(); onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tặng box thủ công (event_manual)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>User ID (UUID)</Label><Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="xxxxxxxx-..." /></div>
          <div>
            <Label>Box</Label>
            <select className="w-full border rounded p-2 bg-background" value={boxCode} onChange={e => setBoxCode(e.target.value)}>
              {defs.map(d => <option key={d.code} value={d.code}>{d.name_vi} ({d.tier})</option>)}
            </select>
          </div>
          <div><Label>Lý do (audit)</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Sự kiện sinh nhật, giải thi đấu..." /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tặng'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
