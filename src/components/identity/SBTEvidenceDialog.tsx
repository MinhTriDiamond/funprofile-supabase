import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Award, ShieldCheck, ExternalLink, Hash, Calendar, User } from 'lucide-react';

const CAT_VI: Record<string, string> = {
  identity: 'Danh Tính',
  trust: 'Tín Nhiệm',
  contribution: 'Cống Hiến',
  credential: 'Chứng Chỉ',
  milestone: 'Cột Mốc',
  legacy: 'Di Sản',
  governance: 'Quản Trị',
  social: 'Cộng Đồng',
};

const PRIVACY_VI: Record<string, string> = {
  public: 'Công khai',
  private: 'Riêng tư',
  selective: 'Chọn lọc',
};

const STATUS_VI: Record<string, string> = {
  active: 'Đang hiệu lực',
  revoked: 'Đã thu hồi',
  expired: 'Hết hạn',
  suspended: 'Tạm ngưng',
};

export function SBTEvidenceDialog({ sbt, children }: { sbt: any; children?: React.ReactNode }) {
  const meta = sbt.metadata ?? {};
  const evidence = sbt.evidence_hash;
  const title = meta.display_name ?? sbt.sbt_type.replace(/_/g, ' ');

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? <Button size="sm" variant="ghost" className="text-[10px] h-6">Xem bằng chứng</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <span className="capitalize">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{CAT_VI[sbt.sbt_category] ?? sbt.sbt_category}</Badge>
            <Badge variant="outline">{PRIVACY_VI[sbt.privacy_level] ?? sbt.privacy_level}</Badge>
            <Badge variant="outline">{STATUS_VI[sbt.status] ?? sbt.status}</Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="w-3 h-3" />trọng số {Number(sbt.trust_weight).toFixed(2)}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <Row icon={Calendar} label="Ngày cấp" value={new Date(sbt.issued_at).toLocaleString('vi-VN')} />
            {sbt.expires_at && <Row icon={Calendar} label="Ngày hết hạn" value={new Date(sbt.expires_at).toLocaleString('vi-VN')} />}
            <Row icon={User} label="Đơn vị cấp" value={sbt.issuer ?? 'hệ thống'} mono />
            <Row icon={Hash} label="Mã danh hiệu" value={sbt.token_id} mono truncate />
            {evidence && <Row icon={Hash} label="Mã bằng chứng" value={evidence} mono truncate />}
            {sbt.revocation_reason && (
              <Row icon={Hash} label="Lý do thu hồi" value={sbt.revocation_reason} />
            )}
          </div>

          {Object.keys(meta).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1 text-muted-foreground">Thông tin chi tiết</p>
              <pre className="text-[10px] bg-muted/50 p-2 rounded overflow-x-auto max-h-48">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          )}

          {meta.evidence_url && (
            <Button asChild variant="outline" size="sm" className="w-full gap-2">
              <a href={meta.evidence_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" />Mở liên kết bằng chứng
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, label, value, mono, truncate }: any) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-muted-foreground min-w-[90px]">{label}:</span>
      <span className={`flex-1 ${mono ? 'font-mono' : ''} ${truncate ? 'break-all' : ''}`}>{value}</span>
    </div>
  );
}
