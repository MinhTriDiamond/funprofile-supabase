import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fingerprint } from 'lucide-react';

const SECTIONS = [
  { id: 'I', title: 'Mục tiêu', body: '6 việc: chống sybil/clone, tạo hồ sơ danh tiếng không giả mạo, nền cho TC, gốc neo lịch sử đóng góp, mở khóa governance/mint, xây nền cho DIB.' },
  { id: 'II', title: 'Kiến trúc tổng thể', body: '3 khối chính: DID Layer (định danh gốc) → SBT Layer (Soulbound NFT neo trust) → DIB Layer (ngân hàng tài sản số). Trust Engine là tim của layer này.' },
  { id: 'III', title: 'DID Layer', body: '5 cấp L0–L4. One Core Identity, Many Linked Surfaces — neo wallet/device/social về 1 DID gốc. Status engine động: pending/basic/verified/trusted/restricted/suspended.' },
  { id: 'IV', title: 'SBT Layer', body: '6 nhóm: Identity / Trust / Contribution / Credential / Milestone / Legacy. Non-transferable, revocable theo rule, minimal public + rich private.' },
  { id: 'V', title: 'DIB — Digital Identity Bank', body: '7 vault: Identity / Trust / Reputation / Contribution / Credential / Governance / Economic Access. Lưu hash root mỗi epoch, nguồn dữ liệu mở khóa giá trị kinh tế.' },
  { id: 'VI', title: 'Trust Engine', body: 'Input: identity/behavior/social/on-chain signals. Output: TC, Trust Tier, Risk Scores, Permission Flags.' },
  { id: 'VII', title: 'Trust Confidence Formula', body: 'TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF. Range 0.30–1.50.' },
  { id: 'VIII', title: 'Trust Tier Table', body: 'T0 (0.30–0.59) Unknown · T1 (0.60–0.79) Basic · T2 (0.80–0.99) Verified · T3 (1.00–1.24) Trusted · T4 (1.25–1.50) Core.' },
  { id: 'IX', title: 'Anti-Sybil Logic', body: 'Dấu hiệu: nhiều account cùng device, referral chéo bất thường, hành vi bot, social weak nhưng activity cao. Penalty: low→theo dõi, medium→giảm reward, high→freeze referral, critical→manual review.' },
  { id: 'X', title: 'Recovery & Safety', body: '4 lớp: primary (email/passkey), wallet backup, trusted guardian (2-3 attestations), governance recovery cho core. Mỗi recovery: log, +risk score tạm thời, cooldown.' },
  { id: 'XI', title: 'Activation Matrix', body: 'Basic: L0 + TC 0.3+. Earn basic: L1 + TC 0.8+. Vote: T2/T3 + TC 1.0+. Proposal: T3 + TC 1.1+. SBT issuer: T4 + TC 1.25+.' },
  { id: 'XII', title: 'Liên kết Light Score', body: 'TC đi vào VVU = B × Q × TC × IIS × IM × AAF × ERP. Trust Tier mở khóa multiplier tốt hơn. SBT tăng Reliability + Historical Trust.' },
  { id: 'XIII', title: 'Liên kết Mint Engine', body: 'Mint = ΔLS × TC × StabilityIndex × Phase. Sybil cao → reward locked. T4 Trusted → governance mint.' },
];

export default function IdentityTrustLayerDocs() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="text-center space-y-2">
        <Fingerprint className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-3xl font-bold">Identity + Trust Layer Spec v1.0</h1>
        <p className="text-muted-foreground text-sm">DID + SBT + DIB — bộ xương và hệ thần kinh của FUN Ecosystem</p>
      </div>
      <div className="grid gap-3">
        {SECTIONS.map((s) => (
          <Card key={s.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base"><span className="text-primary mr-2">{s.id}.</span>{s.title}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{s.body}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-0 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-6 text-center text-sm italic">
          "Identity là gốc. Trust là dòng chảy. SBT là dấu neo. DIB là ngân hàng của uy tín và ánh sáng."
        </CardContent>
      </Card>
    </div>
  );
}
