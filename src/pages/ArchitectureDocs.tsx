import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Share2 } from 'lucide-react';
import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { TableOfContents } from '@/components/docs/TableOfContents';
import LightScoreActivities from '@/components/docs/LightScoreActivities';
import PplpMintAndDbDocs from '@/components/docs/PplpMintAndDbDocs';
import ScoringApiAndVersioningDocs from '@/components/docs/ScoringApiAndVersioningDocs';
import ScoringConfigAndExampleDocs from '@/components/docs/ScoringConfigAndExampleDocs';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const tocItems = [
  { id: 'overview', title: 'Tổng Quan Kiến Trúc' },
  { id: 'layer-0', title: 'Layer 0 – Infrastructure' },
  { id: 'layer-1', title: 'Layer 1 – Identity (DIB Core)' },
  { id: 'layer-2', title: 'Layer 2 – Activity & Event Engine' },
  { id: 'layer-3', title: 'Layer 3 – Light Score Engine (PPLP)' },
  { id: 'layer-4', title: 'Layer 4 – Reward & Token Engine' },
  { id: 'layer-5', title: 'Layer 5 – Protection & Anti-Manipulation' },
  { id: 'layer-6', title: 'Layer 6 – Governance' },
  { id: 'layer-7', title: 'Layer 7 – Cross-Platform Integration' },
  { id: 'activities-personal', title: 'I. Hoạt Động Cá Nhân' },
  { id: 'activities-community', title: 'II. Tương Tác Cộng Đồng' },
  { id: 'activities-content', title: 'III. Tạo Giá Trị Nội Dung' },
  { id: 'activities-web3', title: 'IV. Kinh Tế Web3' },
  { id: 'activities-ecosystem', title: 'V. Đóng Góp Hệ Sinh Thái' },
  { id: 'behavior-sequences', title: 'VI. Chuỗi Hành Động' },
  { id: 'light-tiers', title: 'VII. Cấp Độ Light Score' },
  { id: 'anti-farm', title: 'VIII. Chống Farm Điểm' },
  { id: 'score-formula', title: 'IX. Công Thức Tính Điểm' },
  { id: 'pplp-mint-mechanism', title: 'Cơ Chế Tính Thưởng & Mint' },
  { id: 'pplp-ego-protection', title: 'Bảo Vệ Chống Ego' },
  { id: 'pplp-mantras', title: '8 Thần Chú Thiêng Liêng' },
  { id: 'db-logic-design', title: 'Thiết Kế Logic DB' },
  { id: 'db-pipeline', title: 'Pipeline Xử Lý Điểm' },
  { id: 'ai-scoring-arch', title: 'Kiến Trúc AI Chấm Điểm' },
  { id: 'scoring-versioning', title: 'Scoring Rule Versioning' },
  { id: 'api-endpoints', title: 'API Endpoints' },
  { id: 'reason-codes', title: 'Reason Codes Microcopy' },
  { id: 'level-system', title: 'Level System' },
  { id: 'mint-engine', title: 'Mint Engine Chi Tiết' },
  { id: 'transparency-dashboard', title: 'Transparency Dashboard' },
  { id: 'long-term-protection', title: 'Bảo Vệ Dài Hạn' },
  { id: 'scoring-config', title: 'Scoring Config V1' },
  { id: 'e2e-example', title: 'Ví Dụ Tính Điểm End-to-End' },
  { id: 'unit-test-cases', title: 'Unit Test Cases' },
  { id: 'system-guarantees', title: 'Đảm Bảo Hệ Thống' },
  { id: 'data-flow', title: 'Data Flow Summary' },
  { id: 'design-rules', title: 'Critical Design Rules' },
  { id: 'scalability', title: 'Scalability Plan' },
  { id: 'conclusion', title: 'Kết Luận Chiến Lược' },
];

const ArchitectureDocs = () => {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState('overview');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );
    tocItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'FUN Ecosystem Core Architecture',
        text: 'Kiến trúc 7 layers - Digital Identity Bank + Light Score PPLP',
        url: window.location.href,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-foreground">
                  🏗 FUN Ecosystem Core Architecture
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Digital Identity Bank + Light Score PPLP — 7 Layers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link to="/docs/pplp">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">📜 PPLP</span>
                </Button>
              </Link>
              <Link to="/docs/ecosystem">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">🌐 SSO</span>
                </Button>
              </Link>
              <Link to="/docs/changelog">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">📊 Báo Cáo</span>
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleShare} className="h-8 px-2 sm:px-3">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <Home className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex gap-4 lg:gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <TableOfContents items={tocItems} activeId={activeId} />
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Overview */}
            <DocSection id="overview" title="🏗 Tổng Quan Kiến Trúc">
              <DocParagraph>
                FUN Ecosystem Core Architecture được thiết kế theo chuẩn CTO-level system architecture, với các nguyên tắc:
              </DocParagraph>
              <DocList items={[
                'Scalable — Mở rộng theo chiều ngang',
                'Anti-manipulation — Chống thao túng từ ngày đầu',
                'On-chain anchored — Neo giữ dữ liệu quan trọng trên blockchain',
                'Modular — Các module độc lập, dễ thay thế',
                'Cross-platform ready — Sẵn sàng cho mọi nền tảng FUN',
              ]} />
              <DocAlert type="info">
                Kiến trúc chia thành 7 layers rõ ràng, từ hạ tầng đến tích hợp đa nền tảng.
              </DocAlert>

              {/* ASCII Diagram */}
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-6 text-foreground font-mono leading-relaxed">
{`            ┌──────────────────────────┐
            │      User + Wallet       │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │   Digital Identity Bank  │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │     Event Engine         │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │    Light Score Engine    │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │ Reward & Governance      │
            └──────────────────────────┘`}
              </pre>
            </DocSection>

            {/* Layer 0 */}
            <DocSection id="layer-0" title="🌐 Layer 0 – Infrastructure Layer">
              <DocParagraph>
                Tầng hạ tầng nền tảng đảm bảo hệ thống hoạt động ổn định, mở rộng linh hoạt.
              </DocParagraph>
              <DocTable
                headers={['Thành phần', 'Mô tả']}
                rows={[
                  ['Cloud (AWS/GCP)', 'Nền tảng đám mây chính'],
                  ['Containerized (K8s)', 'Đóng gói dịch vụ trong container'],
                  ['CDN', 'Phân phối nội dung toàn cầu'],
                  ['Load Balancer', 'Cân bằng tải tự động'],
                  ['API Gateway', 'Cổng vào API thống nhất'],
                  ['Monitoring', 'Prometheus / Grafana giám sát hệ thống'],
                ]}
              />
              <DocSubSection title="Mục tiêu">
                <DocList items={[
                  'Horizontal scaling — Mở rộng theo chiều ngang',
                  'Zero-downtime deploy — Triển khai không gián đoạn',
                  'Service isolation — Các dịch vụ cách ly hoàn toàn',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 1 */}
            <DocSection id="layer-1" title="🧬 Layer 1 – Identity Layer (Digital Identity Bank Core)">
              <DocParagraph>
                Tầng danh tính số — trái tim của hệ sinh thái. Mỗi user có một bản sắc duy nhất, không thể giả mạo.
              </DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`User
  ↓
Wallet (Metamask / FUN Wallet)
  ↓
DID Service
  ↓
Soulbound Identity NFT
  ↓
Identity Metadata Store`}
              </pre>

              <DocSubSection title="1️⃣ Wallet Binding">
                <DocList items={[
                  '1 Primary Wallet — ví chính duy nhất',
                  'Optional secondary wallets — ví phụ tùy chọn',
                  'Anti-multi-account fingerprinting — chống tạo nhiều tài khoản',
                ]} />
              </DocSubSection>

              <DocSubSection title="2️⃣ DID Engine">
                <DocList items={[
                  'Generates unique Decentralized ID',
                  '1 DID = 1 Light Root — mỗi DID là một gốc ánh sáng',
                ]} />
              </DocSubSection>

              <DocSubSection title="3️⃣ Soulbound NFT">
                <DocParagraph>
                  NFT không thể chuyển nhượng (non-transferable), đại diện cho neo danh tính.
                </DocParagraph>
                <DocList items={[
                  'DID hash — mã băm danh tính phi tập trung',
                  'Creation timestamp — dấu thời gian tạo',
                  'Trust seed — hạt giống tin cậy ban đầu',
                ]} />
              </DocSubSection>

              <DocSubSection title="4️⃣ Identity Metadata Store">
                <DocList items={[
                  'Encrypted off-chain storage — lưu trữ ngoài chuỗi mã hóa',
                  'On-chain hash pointer — con trỏ hash trên chuỗi',
                  'KYC optional module (future) — module KYC tùy chọn',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 2 */}
            <DocSection id="layer-2" title="⚙️ Layer 2 – Activity & Event Engine">
              <DocParagraph>
                Tầng thu thập và chuẩn hóa mọi hoạt động trên hệ sinh thái.
              </DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Platform Events
      ↓
Event Validator
      ↓
Event Normalizer
      ↓
Event Ledger`}
              </pre>

              <DocSubSection title="Event Types">
                <DocList items={[
                  'Learn & Earn — học hỏi và thịnh vượng',
                  'Give & Gain — cho đi và nhận lại',
                  'Governance vote — bỏ phiếu quản trị',
                  'Community support — hỗ trợ cộng đồng',
                  'Referral (weighted) — giới thiệu có trọng số',
                  'Content creation — sáng tạo nội dung',
                  'Charity contribution — đóng góp từ thiện',
                ]} />
              </DocSubSection>

              <DocSubSection title="Yêu Cầu Xác Thực">
                <DocAlert type="warning">
                  Mỗi event phải đáp ứng đủ 4 điều kiện: Verified DID + Verified Wallet + Context Validation + Anti-bot filter.
                </DocAlert>
              </DocSubSection>
            </DocSection>

            {/* Layer 3 */}
            <DocSection id="layer-3" title="💡 Layer 3 – Light Score Engine (PPLP Core)">
              <DocParagraph>
                Tầng tính điểm ánh sáng — trái tim của giao thức PPLP.
              </DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Event Ledger
      ↓
Scoring Algorithm
      ↓
Contribution Weighting
      ↓
Score Snapshot Generator
      ↓
On-chain Hash Anchor`}
              </pre>

              <DocSubSection title="Light Score Formula (Conceptual)">
                <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
                  <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
                    Light Score = Σ (Verified Contribution × Weight × Time Decay Factor × Trust Multiplier)
                  </p>
                </div>
              </DocSubSection>

              <DocSubSection title="1️⃣ Weight Engine">
                <DocList items={[
                  'Mỗi platform có weight coefficient riêng',
                  'Charity > Content spam — từ thiện luôn có trọng số cao hơn',
                  'Long-term contribution multiplier — hệ số nhân đóng góp dài hạn',
                ]} />
              </DocSubSection>

              <DocSubSection title="2️⃣ Trust Multiplier">
                <DocParagraph>Dựa trên:</DocParagraph>
                <DocList items={[
                  'Account age — tuổi tài khoản',
                  'Governance participation — tham gia quản trị',
                  'Community validation — được cộng đồng xác thực',
                ]} />
              </DocSubSection>

              <DocSubSection title="3️⃣ Time Decay">
                <DocList items={[
                  'Đóng góp cũ giảm dần trọng số theo thời gian',
                  'Khuyến khích tạo giá trị liên tục, không ngừng nghỉ',
                ]} />
              </DocSubSection>

              <DocSubSection title="4️⃣ Score Snapshot">
                <DocList items={[
                  'Chụp ảnh điểm định kỳ (periodic snapshot)',
                  'Hash lưu on-chain để chống giả mạo',
                  'Prevent tampering — không ai sửa được điểm',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 4 */}
            <DocSection id="layer-4" title="💰 Layer 4 – Reward & Token Engine">
              <DocParagraph>
                Tầng phân phối phần thưởng dựa trên Light Score.
              </DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Light Score Snapshot
        ↓
Reward Allocator
        ↓
FUN Money Mint Logic
        ↓
Distribution Smart Contract`}
              </pre>

              <DocSubSection title="Reward Logic">
                <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
                  <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
                    User Reward = (User Light Score / Total Ecosystem Light Score) × Reward Pool
                  </p>
                </div>
                <DocAlert type="info">
                  Không fixed reward — phần thưởng luôn proportional (tỷ lệ thuận) với đóng góp thực tế.
                </DocAlert>
              </DocSubSection>
            </DocSection>

            {/* Layer 5 */}
            <DocSection id="layer-5" title="🛡 Layer 5 – Protection & Anti-Manipulation">
              <DocParagraph>
                Tầng bảo vệ hệ thống khỏi gian lận và thao túng.
              </DocParagraph>
              <DocTable
                headers={['Module', 'Chức năng']}
                rows={[
                  ['Sybil Detection', 'Phát hiện tài khoản giả mạo'],
                  ['AI Behavior Analysis', 'Phân tích hành vi bằng AI'],
                  ['Anomaly Detection', 'Phát hiện bất thường'],
                  ['Velocity Check', 'Kiểm tra tốc độ hành động'],
                  ['Wallet Graph Analysis', 'Phân tích đồ thị ví'],
                ]}
              />

              <DocSubSection title="Anti-Abuse Framework">
                <DocList ordered items={[
                  'Multi-wallet detection — phát hiện nhiều ví cùng người',
                  'Event frequency limit — giới hạn tần suất sự kiện',
                  'Behavior similarity clustering — gom nhóm hành vi giống nhau',
                  'Governance weight locking — khóa quyền quản trị khi nghi vấn',
                  'Light Score freezing if anomaly — đóng băng điểm khi bất thường',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 6 */}
            <DocSection id="layer-6" title="🏛 Layer 6 – Governance Layer">
              <DocParagraph>
                Tầng quản trị phi tập trung dựa trên Light Score.
              </DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Light Score
      ↓
Governance Weight
      ↓
Proposal Engine
      ↓
Voting Smart Contract`}
              </pre>

              <DocSubSection title="Quyền Lợi Theo Light Score">
                <DocList items={[
                  'Higher Light Score → Higher proposal eligibility (đủ điều kiện đề xuất)',
                  'Higher vote weight — trọng số phiếu bầu cao hơn',
                  'Not absolute dominance — không chi phối tuyệt đối (quadratic model possible)',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 7 */}
            <DocSection id="layer-7" title="🌎 Layer 7 – Cross-Platform Integration">
              <DocParagraph>
                Tầng tích hợp đa nền tảng — tất cả FUN platforms kết nối qua API thống nhất.
              </DocParagraph>
              <DocTable
                headers={['API', 'Chức năng']}
                rows={[
                  ['DIB API', 'Quản lý danh tính số'],
                  ['Event API', 'Thu thập sự kiện hoạt động'],
                  ['Light Score API', 'Truy vấn điểm ánh sáng'],
                  ['Reward API', 'Phân phối phần thưởng'],
                ]}
              />
              <DocSubSection title="Platforms Kết Nối">
                <DocList items={[
                  'FUN Profile — tiếng nói ánh sáng',
                  'FUN Play — niềm vui & kết nối',
                  'FUN Academy — học & thịnh vượng',
                  'FUN Charity — yêu thương & chữa lành',
                  'FUN Market — thị trường ánh sáng',
                  'Angel A.I. — trí tuệ thiên thần',
                  'COSMIC GAME — cuộc chơi thức tỉnh',
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Light Score Activities & Behavior Sequences */}
            <LightScoreActivities />

            {/* PPLP Mint, DB Logic & AI Scoring Architecture */}
            <PplpMintAndDbDocs />

            {/* Scoring Versioning, API Endpoints & Reason Codes */}
            <ScoringApiAndVersioningDocs />

            {/* Scoring Config V1, E2E Example & Unit Test Cases */}
            <ScoringConfigAndExampleDocs />

            {/* Data Flow */}
            <DocSection id="data-flow" title="🔁 Data Flow Summary">
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`User Action
      ↓
Event Engine (validate + normalize)
      ↓
Light Score Engine (score + weight)
      ↓
Snapshot (hash on-chain)
      ↓
Reward Engine (proportional allocation)
      ↓
Token Distribution (smart contract)

★ Identity anchors everything.`}
              </pre>
            </DocSection>

            {/* Design Rules */}
            <DocSection id="design-rules" title="🔐 Critical Design Rules">
              <DocAlert type="warning">
                5 quy tắc bất biến — không bao giờ được vi phạm.
              </DocAlert>
              <DocList ordered items={[
                '1 DID = 1 Soulbound NFT — Mỗi danh tính duy nhất một NFT linh hồn',
                '1 Soulbound NFT = 1 Light Root — Mỗi NFT linh hồn là một gốc ánh sáng',
                'No Light Score without verified event — Không có điểm nếu không có sự kiện đã xác thực',
                'No Reward without snapshot hash — Không có phần thưởng nếu không có hash snapshot',
                'All important states anchored on-chain — Mọi trạng thái quan trọng neo trên chuỗi',
              ]} />
            </DocSection>

            {/* Scalability */}
            <DocSection id="scalability" title="🚀 Scalability Plan">
              <DocTable
                headers={['Phase', 'Mô tả', 'Chi tiết']}
                rows={[
                  ['Phase 1', 'Centralized', 'Scoring tập trung, on-chain hash anchor'],
                  ['Phase 2', 'Hybrid', 'Partial smart contract scoring, dần phi tập trung'],
                  ['Phase 3', 'Full Modular', 'Full modular smart scoring + cross-chain expansion'],
                ]}
              />
              <DocAlert type="success">
                Lộ trình cho phép phát triển dần dần mà không cần thay đổi kiến trúc tổng thể.
              </DocAlert>
            </DocSection>

            {/* Conclusion */}
            <DocSection id="conclusion" title="🎯 Kết Luận Chiến Lược">
              <DocList items={[
                'DIB là tầng không được phép sai — danh tính sai = toàn bộ hệ thống sai',
                'Light Score là tầng dễ bị game nhất — cần anti-abuse ngay từ ngày đầu',
                'Phải thiết kế anti-abuse ngay từ ngày đầu — không chờ đến khi bị tấn công',
                'Không cho phép chỉnh sửa điểm thủ công — mọi thay đổi phải qua protocol',
              ]} />
              <DocAlert type="info">
                Bé Ly đang tiến gần tới thiết kế cấp độ blockchain protocol thật sự. Tiếp theo có thể triển khai: Smart Contract Architecture chi tiết, Token Mint Flow, hoặc Database Schema cho DIB + PPLP.
              </DocAlert>
            </DocSection>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureDocs;
