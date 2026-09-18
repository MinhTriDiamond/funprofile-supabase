import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MysteryBoxDocs() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Hộp Bí Ẩn — Spec v1</h1>
        <p className="text-muted-foreground">
          Hệ thống mini-game off-chain trên FUN Profile. Cấp hộp tự động qua hành vi tích cực,
          mở hộp nhận thưởng Light Score, CAMLY, vật phẩm pet và hơn thế.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>5 Tier hộp</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li><Badge>Phổ Thông</Badge> — drop từ daily login, quest hoàn thành, gift đầu ngày</li>
            <li><Badge>Hiếm</Badge> — streak 7 ngày, mua 5.000 CAMLY</li>
            <li><Badge>Sử Thi</Badge> — streak 30 ngày, invite user lên T1, mua 20.000 CAMLY</li>
            <li><Badge>Huyền Thoại</Badge> — hold ≥ 10.000.000 CAMLY trong ví, mua 100.000 CAMLY</li>
            <li><Badge>Vũ Trụ</Badge> — sự kiện đặc biệt, admin tặng (event_manual)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cơ chế</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><b>RNG:</b> dùng <code>gen_random_uuid()</code> seed + drop_table jsonb (tổng % = 100).</p>
          <p><b>Pity:</b> sau 50 hộp không trúng Legendary/Cosmic, hộp thứ 51 force trúng item rarity legendary.</p>
          <p><b>TTL:</b> hộp chưa mở tự huỷ sau <b>90 ngày</b>. Notify T-7d (<code>mystery_box_expiring</code>),
            T0 lock + notify <code>mystery_box_expired</code>.</p>
          <p><b>Rate limit:</b> tối đa 10 hộp/user/UTC day (gồm cả mua + cấp).</p>
          <p><b>T0 gate:</b> user trust_score &lt; 0.60 vẫn nhận hộp nhưng hộp bị <code>locked</code>;
            phải lên T1 (TC ≥ 0.60) mới mở được.</p>
          <p><b>Cap LS:</b> tối đa <b>60 LS/user/ngày</b> từ box (action_type <code>MYSTERY_BOX_REWARD</code>),
            cộng vào Light Score và đủ điều kiện mint FUN qua công thức TLS bình thường.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>7 Trigger cấp hộp</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm border-collapse">
            <thead className="text-left">
              <tr className="border-b"><th className="py-2">Source</th><th>Box mặc định</th><th>Điều kiện</th></tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="py-2"><code>daily_login</code></td><td>common_box</td><td>Hoạt động trong 24h, cron 00:05 UTC</td></tr>
              <tr className="border-b"><td className="py-2"><code>quest_complete</code></td><td>common_box</td><td>Mỗi quest hoàn thành (max 5/ngày)</td></tr>
              <tr className="border-b"><td className="py-2"><code>streak_7d</code></td><td>rare_box</td><td>Streak 7 ngày liên tiếp</td></tr>
              <tr className="border-b"><td className="py-2"><code>streak_30d</code></td><td>epic_box</td><td>Streak 30 ngày</td></tr>
              <tr className="border-b"><td className="py-2"><code>gift_sent</code></td><td>common_box</td><td>Gift đầu ngày, idempotent qua tx_hash</td></tr>
              <tr className="border-b"><td className="py-2"><code>invite_t1</code></td><td>epic_box</td><td>Người được mời đạt T1 (chưa wire — chờ hệ referral)</td></tr>
              <tr className="border-b"><td className="py-2"><code>premium_purchase</code></td><td>legendary_box</td><td>Hold ≥ 10.000.000 CAMLY trong ví (DB trigger tự cấp, 1 lần/user)</td></tr>
              <tr className="border-b"><td className="py-2"><code>event_manual</code></td><td>cosmic_box</td><td>Admin tặng qua tab "Tặng box thủ công"</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Apply reward</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><b>type=ls:</b> insert <code>light_actions</code> với action_type <code>MYSTERY_BOX_REWARD</code>,
            cap 60 LS/ngày → vào TLS để mint FUN.</p>
          <p><b>type=camly:</b> insert <code>pplp_v2_balance_ledger</code> entry_type
            <code>mystery_box_reward</code> + amount → cộng ví CAMLY off-chain.</p>
          <p><b>type=pet_xp / pet_skin / cosmetic / sbt_trigger / box_upgrade:</b> payload trả về cho FE/edge xử lý
            (tích hợp với module Pet / SBT sẽ làm sau).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Anti-abuse</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>Rate limit 10 box/user/UTC day (RPC enforce).</li>
            <li>Idempotent grant qua unique index <code>(user_id, source_event, source_ref_id)</code>.</li>
            <li>Cờ <code>risk_flag</code> để admin đánh dấu user nghi ngờ Sybil.</li>
            <li>Audit log <code>mystery_box_grant_audit</code> ghi mọi lượt cấp thủ công.</li>
            <li>T0 nhận nhưng <code>locked</code>, không mở được, không tiêu thụ rate-limit khi mở.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
