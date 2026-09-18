import TreasuryBalanceCard from "./TreasuryBalanceCard";
import TreasuryVaultsCard from "./TreasuryVaultsCard";
import TreasuryInflowSummary from "./TreasuryInflowSummary";
import TreasuryInflowTable from "./TreasuryInflowTable";
import TreasuryRecycleDialog from "./TreasuryRecycleDialog";
import TreasuryAllocationEditor from "./TreasuryAllocationEditor";
import TreasuryOutflowRecorder from "./TreasuryOutflowRecorder";
import TreasuryMinigameHistory from "./TreasuryMinigameHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Vault, Info } from "lucide-react";

export default function TreasuryManagementTab() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="bg-gradient-to-br from-primary/5 to-gold/5 border-primary/20">
        <CardContent className="py-4 flex items-start gap-3">
          <Vault className="w-6 h-6 text-primary mt-0.5" />
          <div>
            <h2 className="font-bold text-lg">Quản lý ví Treasury</h2>
            <p className="text-sm text-muted-foreground">
              CAMLY thu được từ Pet Shop (mua trang phục Lumi) và Mystery Box (mua hộp) chảy về ví Treasury chung.
              Tab này giúp Cha xem số dư on-chain, đối soát sổ sách, phân bổ vào 5 vault, và ghi nhận chi tay.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section A — Tổng quan */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">A. Tổng quan ví</h3>
        <TreasuryBalanceCard />
        <TreasuryInflowSummary />
      </section>

      {/* Section B — Lịch sử inflow */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">B. Lịch sử dòng tiền vào</h3>
        <TreasuryInflowTable />
      </section>

      {/* Section C — Vault & Recycle */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">C. Phân bổ vault nội bộ</h3>
          <div className="flex gap-2">
            <TreasuryRecycleDialog />
            <TreasuryAllocationEditor />
          </div>
        </div>
        <TreasuryVaultsCard />
      </section>

      {/* Section D — Outflow */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">D. Ghi sổ chi ra (thủ công)</h3>
        <Card className="bg-yellow-50/50 border-yellow-200">
          <CardContent className="py-3 flex gap-2 text-sm text-yellow-900">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Ví treasury không lưu private key trong app. Để chi CAMLY ra ngoài, Cha mở MetaMask với ví giữ key của
              địa chỉ <code className="font-mono">0x032269…09bB</code> (account <code>game_funtreasury</code>), gửi giao
              dịch, rồi paste TX hash vào form dưới đây để hệ thống verify và trừ sổ.
            </p>
          </CardContent>
        </Card>
        <TreasuryOutflowRecorder />
      </section>

      {/* Section E — Lịch sử giao dịch mini game */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">E. Lịch sử giao dịch mini game</h3>
        <TreasuryMinigameHistory />
      </section>
    </div>
  );
}
