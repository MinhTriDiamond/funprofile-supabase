import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, DatabaseZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminBackfill,
  type BackfillCandidate,
  type BackfillClassification,
  type BackfillScope,
} from "@/hooks/useAdminBackfill";

const CLASS_LABEL: Record<BackfillClassification, string> = {
  internal: "Nội bộ",
  external_in: "Ví ngoài → hệ thống",
  swap_suspect: "Nghi swap (chỉ lưu vết)",
  dust_filtered: "Dưới ngưỡng (dust)",
  already_in_db: "Đã có trong DB",
};

const CLASS_ORDER: BackfillClassification[] = [
  "internal",
  "external_in",
  "swap_suspect",
  "dust_filtered",
  "already_in_db",
];

const PRESETS = [
  { label: "24 giờ", hours: 24 },
  { label: "7 ngày", hours: 24 * 7 },
  { label: "30 ngày", hours: 24 * 30 },
];

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function BackfillTab() {
  const {
    job,
    candidates,
    isCreating,
    isScanning,
    isWriting,
    createJob,
    toggleSelection,
    writeSelected,
    refresh,
    jobId,
  } = useAdminBackfill();

  const [scope, setScope] = useState<BackfillScope>("single");
  const [singleWallet, setSingleWallet] = useState("");
  const [multiWallets, setMultiWallets] = useState("");
  const [fromTs, setFromTs] = useState(() => isoLocal(new Date(Date.now() - 24 * 3600_000)));
  const [toTs, setToTs] = useState(() => isoLocal(new Date()));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const applyPreset = (hours: number) => {
    setFromTs(isoLocal(new Date(Date.now() - hours * 3600_000)));
    setToTs(isoLocal(new Date()));
  };

  const grouped = useMemo(() => {
    const map = new Map<BackfillClassification, BackfillCandidate[]>();
    for (const c of candidates) {
      const list = map.get(c.classification) ?? [];
      list.push(c);
      map.set(c.classification, list);
    }
    return map;
  }, [candidates]);

  const selectedCount = candidates.filter((c) => c.selected && !c.written).length;

  const handleScan = async () => {
    const wallets =
      scope === "single"
        ? [singleWallet]
        : scope === "multi"
          ? multiWallets.split(/[\s,;\n]+/).filter(Boolean)
          : [];
    if (scope !== "all" && wallets.filter(Boolean).length === 0) {
      toast.error("Cần nhập ít nhất 1 địa chỉ ví");
      return;
    }
    if (new Date(fromTs) >= new Date(toTs)) {
      toast.error("Mốc bắt đầu phải trước mốc kết thúc");
      return;
    }
    await createJob({
      scope,
      wallets,
      fromTs: new Date(fromTs).toISOString(),
      toTs: new Date(toTs).toISOString(),
    });
  };

  const toggleGroup = (list: BackfillCandidate[], selected: boolean) => {
    const ids = list.filter((c) => !c.written && c.classification !== "swap_suspect").map((c) => c.id);
    if (ids.length === 0) {
      toast.info("Nhóm này không thể chọn ghi donations");
      return;
    }
    void toggleSelection(ids, selected);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Backfill giao dịch on-chain
          </CardTitle>
          <CardDescription>
            Quét bù giao dịch bị sót → xem trước → tick chọn → ghi. Chỉ Admin, mọi lượt ghi đều lưu audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Phạm vi</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as BackfillScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">1 ví cụ thể</SelectItem>
                  <SelectItem value="multi">Nhiều ví (tối đa 50)</SelectItem>
                  <SelectItem value="all">Toàn bộ ví hệ thống (4 giờ/lần)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Khoảng nhanh</Label>
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => applyPreset(p.hours)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {scope === "single" && (
              <div className="space-y-2 md:col-span-2">
                <Label>Địa chỉ ví</Label>
                <Input
                  value={singleWallet}
                  onChange={(e) => setSingleWallet(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                />
              </div>
            )}

            {scope === "multi" && (
              <div className="space-y-2 md:col-span-2">
                <Label>Danh sách ví (mỗi dòng 1 địa chỉ)</Label>
                <Textarea
                  value={multiWallets}
                  onChange={(e) => setMultiWallets(e.target.value)}
                  rows={4}
                  placeholder={"0x…\n0x…"}
                  spellCheck={false}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Từ thời điểm</Label>
              <Input type="datetime-local" value={fromTs} onChange={(e) => setFromTs(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Đến thời điểm</Label>
              <Input type="datetime-local" value={toTs} onChange={(e) => setToTs(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleScan} disabled={isCreating || isScanning} className="gap-2">
              {isCreating || isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Quét
            </Button>
            {jobId && (
              <Button variant="outline" onClick={() => void refresh(jobId)} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Làm mới
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lượt quét hiện tại</CardTitle>
            <CardDescription>
              Trạng thái: <Badge variant="secondary">{job.status}</Badge>{" "}
              {job.from_block !== null && job.to_block !== null && (
                <>
                  block {job.from_block.toLocaleString()} → {job.to_block.toLocaleString()}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={job.progress_pct ?? 0} />
            <p className="text-sm text-muted-foreground">
              Tiến độ {job.progress_pct ?? 0}% — đã tìm {candidates.length} dòng
            </p>
            {job.error && <p className="text-sm text-destructive">{job.error}</p>}
          </CardContent>
        </Card>
      )}

      {candidates.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Xem trước</CardTitle>
              <CardDescription>
                Nghi swap chỉ lưu vết vào lịch sử giao dịch, không tính donations. Dust không ghi.
              </CardDescription>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={selectedCount === 0 || isWriting || job?.status !== "preview_ready"}
              className="gap-2"
            >
              {isWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />}
              Ghi {selectedCount} dòng đã chọn
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {CLASS_ORDER.filter((k) => grouped.has(k)).map((k) => {
              const list = grouped.get(k)!;
              const selectable = k === "internal" || k === "external_in";
              return (
                <div key={k} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-sm">
                      {CLASS_LABEL[k]} <span className="text-muted-foreground">({list.length})</span>
                    </h4>
                    {selectable && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleGroup(list, true)}>
                          Chọn hết
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleGroup(list, false)}>
                          Bỏ hết
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border divide-y">
                    {list.slice(0, 200).map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 text-sm">
                        <Checkbox
                          checked={c.selected}
                          disabled={!selectable || c.written}
                          onCheckedChange={(v) => void toggleSelection([c.id], Boolean(v))}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {c.amount_display ?? c.amount_raw} {c.token_symbol}
                            {c.usd_value !== null && (
                              <span className="text-muted-foreground"> (~${c.usd_value.toLocaleString()})</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground break-all">
                            {c.from_address} → {c.to_address}
                          </p>
                          <p className="text-xs text-muted-foreground break-all">
                            block {c.block_number.toLocaleString()} · {c.tx_hash}
                          </p>
                        </div>
                        {c.written && <Badge variant="secondary">đã ghi</Badge>}
                      </div>
                    ))}
                    {list.length > 200 && (
                      <p className="p-3 text-xs text-muted-foreground">
                        …còn {list.length - 200} dòng nữa (thu nhỏ phạm vi để xem hết)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận ghi dữ liệu</AlertDialogTitle>
            <AlertDialogDescription>
              Sẽ ghi {selectedCount} dòng đã chọn vào lịch sử giao dịch và donations (theo đúng phân loại).
              Hành động được lưu audit và không tạo bài chúc mừng cho ví ngoài.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => void writeSelected()}>Ghi ngay</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
