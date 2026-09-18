import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { downloadCSV, stamp } from '@/lib/csv';
import { toast } from 'sonner';

/**
 * Tải toàn bộ snapshot Founder Dashboard ra một file CSV duy nhất (nhiều section).
 * Gọi lại các RPC `get_founder_*` để đảm bảo dữ liệu mới nhất, không phụ thuộc cache panel.
 */
export function ExportAllButton() {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const [ov, id, ec] = await Promise.all([
        (supabase as any).rpc('get_founder_overview_stats'),
        (supabase as any).rpc('get_founder_identity_stats'),
        (supabase as any).rpc('get_founder_economy_stats'),
      ]);
      if (ov.error || id.error || ec.error) {
        throw new Error(ov.error?.message || id.error?.message || ec.error?.message || 'Lỗi không xác định');
      }
      const o = ov.data || {};
      const i = id.data || {};
      const e = ec.data || {};

      const rows: (string | number)[][] = [
        ['# Founder Dashboard — Export All', new Date().toLocaleString('vi-VN')],
        [],
        ['## TỔNG QUAN'],
        ['Chỉ số', 'Giá trị'],
        ['Light Score (raw)', Number(o.total_light_score_raw || 0)],
        ['Light Score (display)', Number(o.total_light_score_display || 0)],
        ['Tổng FUN đã mint', Number(o.total_fun_minted || 0)],
        ['Tổng hành động (tháng)', Number(o.total_actions_month || 0)],
        ['Tỷ lệ xác thực (%)', Number(o.validation_rate || 0)],
        ['DAU', Number(o.dau || 0)],
        ['WAU', Number(o.wau || 0)],
        ['MAU', Number(o.mau || 0)],
        [],
        ['## NHÓM HÀNH ĐỘNG (30d)'],
        ['Mã', 'Số lượng'],
        ...((o.top_categories || []) as any[]).map((c) => [c.code, Number(c.count)]),
        [],
        ['## DANH TÍNH & TÍN NHIỆM'],
        ['Chỉ số', 'Giá trị'],
        ['Tổng DID', Number(i.total_dids || 0)],
        ['DID mới 7 ngày', Number(i.new_dids_7d || 0)],
        ['TC trung bình', Number(i.avg_tc || 0).toFixed(3)],
        ['SBT đang hoạt động', Number(i.total_sbts_active || 0)],
        ['Khiếu nại chờ', Number(i.dispute_pending || 0)],
        ['Recovery đang chạy', Number(i.recovery_active || 0)],
        [],
        ['DID Level', 'Số lượng'],
        ...Object.entries(i.by_level || {}).map(([k, v]) => [k, Number(v)]),
        [],
        ['Trust Tier', 'Số lượng'],
        ...Object.entries(i.by_tier || {}).map(([k, v]) => [k, Number(v)]),
        [],
        ['Sybil Risk', 'Số lượng'],
        ...Object.entries(i.by_sybil || {}).map(([k, v]) => [k, Number(v)]),
        [],
        ['SBT Category', 'Số lượng'],
        ...Object.entries(i.sbt_by_category || {}).map(([k, v]) => [k, Number(v)]),
        [],
        ['## KINH TẾ'],
        ['Chỉ số', 'Giá trị'],
        ['Tổng FUN đã mint', Number(e.total_fun_minted || 0)],
        ['User share (99%)', Number(e.user_share || 0)],
        ['Platform share (1%)', Number(e.platform_share || 0)],
        ['Số lệnh xác nhận', Number(e.confirmed_count || 0)],
        ['Số ví minter', Number(e.unique_minters || 0)],
        [],
        ['Ngày', 'FUN'],
        ...((e.daily_flow || []) as any[]).map((f) => [f.date, Number(f.amount)]),
        [],
        ['Action', 'FUN'],
        ...((e.top_actions || []) as any[]).map((a) => [a.code, Number(a.amount)]),
      ];

      downloadCSV(`founder-dashboard-all-${stamp()}.csv`, rows);
      toast.success('Đã tải snapshot toàn bộ dashboard');
    } catch (err: any) {
      toast.error(`Lỗi xuất tổng: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Xuất tất cả
    </Button>
  );
}
