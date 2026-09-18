import { Card } from "@/components/ui/card";

export default function ConnectorSpecPage() {
  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold">CONNECTOR — First On-chain Giver</h1>
        <p className="text-muted-foreground italic">
          "Referral is claimed by words. Connector is proven by giving."
        </p>
      </header>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">1. Định nghĩa</h2>
        <p>
          <b>Connector</b> là thành viên FUN.Rich đầu tiên gửi token hợp lệ (≥ ngưỡng tối thiểu) vào ví của một
          user mới <b>trong vòng 48 giờ</b> kể từ khi user đó tạo account.
        </p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Mỗi user mới chỉ có <b>1 Connector duy nhất</b> và không thể thay đổi.</li>
          <li>User không thể tự gán mình làm Connector.</li>
          <li>Ví ngoài (chưa có account FUN.Rich) <b>không</b> được ghi nhận.</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">2. Mức tối thiểu</h2>
        <ul className="grid grid-cols-2 gap-1 text-sm">
          <li>FUN: 9</li>
          <li>USDT: 1</li>
          <li>CAMLY: 1.000</li>
          <li>BNB: 0,001</li>
          <li>BTC: 0,00001</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">3. Light Score thưởng</h2>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Base khi xác nhận Connector: <b>+10</b></li>
          <li>User mới hoàn thiện hồ sơ: <b>+2</b></li>
          <li>User mới có đóng góp đầu tiên: <b>+5</b></li>
          <li>User mới đạt Level 1: <b>+10</b></li>
          <li>User mới active 30 ngày: <b>+20</b></li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">4. Tie-break (cùng block)</h2>
        <p className="text-sm">
          Khi nhiều giao dịch cùng đến trong cùng block, hệ thống chọn theo thứ tự:
          <code className="text-primary mx-1">blockNumber → txIndex → logIndex</code> (giao dịch nhỏ nhất là chính
          thức).
        </p>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">5. Anti-sybil</h2>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Connector cần Trust Confidence ≥ 0.15 và không bị flag sybil.</li>
          <li>Cùng IP/device giữa Connector và user mới sẽ bị từ chối.</li>
          <li>Quản trị viên có quyền revert (trừ điểm) khi phát hiện vi phạm.</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-2 text-center italic">
        <p>The first valid on-chain giver becomes the official Connector.</p>
        <p>The act of giving opens the flow.</p>
        <p>The flow is recorded transparently.</p>
        <p>The light is recognized through Light Score.</p>
      </Card>
    </div>
  );
}
