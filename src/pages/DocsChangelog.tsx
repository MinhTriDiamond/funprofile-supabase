import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { Link } from 'react-router-dom';

const DocsChangelog = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-foreground">
                  📊 Báo Cáo Tổng Hợp
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Toàn bộ thay đổi FUN Profile sau 6 tài liệu mới
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/docs/architecture">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">🏗 Architecture</span>
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <Home className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
        {/* Thống kê tổng */}
        <DocSection id="stats" title="📈 Thống Kê Tổng Hợp">
          <DocTable
            headers={['Chỉ số', 'Số lượng']}
            rows={[
              ['Tổng file component mới', '4 components'],
              ['Tổng dòng code docs', '~1,291 dòng'],
              ['Tổng section TOC', '40 mục'],
              ['Bảng DB thiết kế', '11 bảng + 1 bảng sequence'],
              ['API Endpoints', '5 endpoint REST'],
              ['Reason Codes', '18 codes (10 positive + 8 adjustment)'],
              ['Unit Test Cases', '4 kịch bản'],
              ['Level / Trend', '5 cấp độ + 4 xu hướng'],
              ['Config tham số', '7 nhóm, 20+ tham số'],
            ]}
          />
        </DocSection>

        {/* Bảng tổng hợp 6 tài liệu */}
        <DocSection id="documents" title="📚 Tổng Hợp 6 Tài Liệu Kỹ Thuật">
          <DocTable
            headers={['#', 'Tài liệu', 'Dòng code', 'Sections', 'Nội dung chính']}
            rows={[
              ['1', 'LightScoreActivities', '~248', '9 mục (I–IX)', 'Hoạt động cá nhân, cộng đồng, nội dung, Web3, hệ sinh thái, chuỗi hành động, cấp độ, chống farm, công thức'],
              ['2', 'PplpMintAndDbDocs', '~384', '6 mục', 'Cơ chế Mint 3 lớp, PPLP Score 5 trụ cột, chống Ego 3 lớp, 8 Thần Chú, 11 bảng DB, Pipeline 6 bước, AI chấm điểm'],
              ['3', 'ScoringApiAndVersioningDocs', '~455', '7 mục', 'Versioning, 5 API REST, 18 Reason Codes, 5 Level, Mint Engine 7 bước, Dashboard, Bảo vệ dài hạn 3 lớp'],
              ['4', 'ScoringConfigAndExampleDocs', '~204', '5 mục', 'Config V1 YAML/JSON 7 nhóm, E2E Example 8 bước → 8.67, Mint 86.7 FUN, 4 Unit Tests, 6 đảm bảo'],
            ]}
          />
        </DocSection>

        {/* Chi tiết từng tài liệu */}
        <DocSection id="detail-1" title="1️⃣ LightScoreActivities (~248 dòng)">
          <DocParagraph>
            Định nghĩa toàn bộ hoạt động được ghi nhận trong hệ Light Score, chia thành 9 mục lớn.
          </DocParagraph>
          <DocList items={[
            'I. Hoạt Động Cá Nhân — checkin, profile, learn & earn',
            'II. Tương Tác Cộng Đồng — like, comment, share, mentor',
            'III. Tạo Giá Trị Nội Dung — post, video, course, bug report',
            'IV. Kinh Tế Web3 — donate, stake, governance vote',
            'V. Đóng Góp Hệ Sinh Thái — referral, proposal, charity',
            'VI. Chuỗi Hành Động (Sequence) — bonus khi hoàn thành chuỗi',
            'VII. Cấp Độ Light Score — Seed → Sprout → Bloom → Guardian → Architect',
            'VIII. Chống Farm Điểm — velocity check, pattern detection, cooldown',
            'IX. Công Thức Tính Điểm — L = (w_B × B + w_C × C) × M_cons × M_seq × Integrity',
          ]} />
          <DocAlert type="info">
            <Link to="/docs/architecture#activities-personal" className="underline text-inherit">
              → Xem chi tiết trong Architecture Docs
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-2" title="2️⃣ PplpMintAndDbDocs (~384 dòng)">
          <DocParagraph>
            Cơ chế tính thưởng, Mint FUN Money, thiết kế DB và kiến trúc AI chấm điểm.
          </DocParagraph>
          <DocSubSection title="Cơ Chế Mint 3 Lớp">
            <DocList items={[
              'Lớp 1: Light Score → tính điểm hành vi',
              'Lớp 2: PPLP Rating → đánh giá cộng đồng 5 trụ cột',
              'Lớp 3: Mint Allocation → phân phối FUN Money theo epoch',
            ]} />
          </DocSubSection>
          <DocSubSection title="PPLP Score (5 Trụ Cột)">
            <DocTable
              headers={['Trụ cột', 'Ý nghĩa']}
              rows={[
                ['Truth (Chân Lý)', 'Nội dung trung thực, không thao túng'],
                ['Sustain (Bền Vững)', 'Đóng góp dài hạn, không bùng nổ rồi biến mất'],
                ['Healing (Chữa Lành)', 'Tạo giá trị tích cực, giảm xung đột'],
                ['Service (Phụng Sự)', 'Hỗ trợ người khác vô điều kiện'],
                ['Unity (Hợp Nhất)', 'Kết nối cộng đồng, không chia rẽ'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="Thiết Kế DB (11 Bảng)">
            <DocList items={[
              'users, profiles — danh tính người dùng',
              'content — nội dung đã tạo',
              'events — sự kiện hành vi',
              'pplp_ratings — đánh giá PPLP từ cộng đồng',
              'signals_anti_farm — tín hiệu chống farm',
              'features_user_day — features tổng hợp theo ngày',
              'light_score_ledger — sổ cái điểm ánh sáng',
              'score_explanations — giải thích điểm cho user',
              'mint_epochs — kỷ nguyên mint',
              'mint_allocations — phân bổ mint cho từng user',
            ]} />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#pplp-mint-mechanism" className="underline text-inherit">
              → Xem chi tiết trong Architecture Docs
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-3" title="3️⃣ ScoringApiAndVersioningDocs (~455 dòng)">
          <DocParagraph>
            Versioning, API endpoints, Reason Codes, Level System, Mint Engine và bảo vệ dài hạn.
          </DocParagraph>
          <DocSubSection title="5 API Endpoints">
            <DocTable
              headers={['Endpoint', 'Method', 'Chức năng']}
              rows={[
                ['POST /v1/events', 'POST', 'Ingest sự kiện hành vi'],
                ['POST /v1/pplp/rate', 'POST', 'Submit PPLP rating'],
                ['GET /v1/light/{uid}/summary', 'GET', 'Lấy Light Score tổng hợp'],
                ['GET /v1/light/{uid}/private', 'GET', 'Điểm chi tiết (chỉ owner)'],
                ['GET /v1/mint/epoch/{date}', 'GET', 'Thông tin Mint Epoch'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="Reason Codes">
            <DocParagraph>
              10 Positive Codes (RC_STREAK, RC_MENTOR, RC_QUALITY...) + 8 Adjustment Codes (RC_SPAM, RC_RING, RC_VELOCITY...) — giúp user hiểu tại sao điểm tăng/giảm.
            </DocParagraph>
          </DocSubSection>
          <DocSubSection title="Level System (5 Cấp Độ)">
            <DocTable
              headers={['Level', 'Light Score', 'Quyền lợi']}
              rows={[
                ['🌱 Seed', '0–20', 'Cơ bản'],
                ['🌿 Sprout', '20–50', 'Mint thường'],
                ['🌸 Bloom', '50–80', 'Mint ưu tiên + Đề xuất'],
                ['🛡 Guardian', '80–95', 'Vote weight cao + Review'],
                ['🏛 Architect', '95–100', 'Governance + Council'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="Bảo Vệ Dài Hạn (3 Lớp)">
            <DocList items={[
              'Model Drift Detection — phát hiện mô hình lệch',
              'Council Review — hội đồng đánh giá định kỳ',
              'Slow Mint Curve — đường cong mint chậm, chống lạm phát',
            ]} />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#scoring-versioning" className="underline text-inherit">
              → Xem chi tiết trong Architecture Docs
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-4" title="4️⃣ ScoringConfigAndExampleDocs (~204 dòng)">
          <DocParagraph>
            Config chuẩn V1, ví dụ tính điểm end-to-end với số cụ thể, và 4 unit test cases.
          </DocParagraph>
          <DocSubSection title="Config V1 (7 Nhóm Tham Số)">
            <DocTable
              headers={['Nhóm', 'Tham số chính', 'Giá trị']}
              rows={[
                ['weights', 'base_action / content', '0.4 / 0.6'],
                ['reputation', 'alpha, w_min, w_max', '0.25, 0.5, 2.0'],
                ['content', 'gamma, type_multiplier', '1.3, post=1.0 video=1.2 course=1.5'],
                ['consistency', 'beta, lambda', '0.6, 30'],
                ['sequence', 'eta, kappa', '0.5, 5'],
                ['penalty', 'theta, max_penalty', '0.8, 0.5'],
                ['mint', 'epoch, anti_whale, min_light', 'monthly, 3%, 10'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="Ví Dụ End-to-End (User u_ly)">
            <DocTable
              headers={['Bước', 'Phép tính', 'Kết quả']}
              rows={[
                ['1. Content Score', 'h(P_c) = (P_c/10)^1.3 cho 3 bài', 'C = 2.33'],
                ['2. Base Action', 'Checkin + Mentor + Comment', 'B = 10'],
                ['3. Raw Score', '0.4×10 + 0.6×2.33', 'L_raw = 5.398'],
                ['4. Consistency', '1 + 0.6(1 - e^(-30/30))', 'M_cons = 1.379'],
                ['5. Sequence', '1 + 0.5×tanh(3/5)', 'M_seq = 1.268'],
                ['6. Penalty', '1 - min(0.5, 0.8×0.1)', '0.92'],
                ['7. Final Score', '5.398 × 1.379 × 1.268 × 0.92', '★ 8.67'],
                ['8. Mint', '100,000 × (8.67/10,000)', '86.7 FUN'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="4 Unit Test Cases">
            <DocTable
              headers={['Test', 'Điều kiện', 'Kết quả mong đợi']}
              rows={[
                ['Spam Burst', '50 posts/ngày, rating thấp', 'Điểm rất thấp (content exponent)'],
                ['Viral Drama', 'Nhiều rating, healing = 0', 'P_c thấp → không tăng mint'],
                ['Silent Contributor', '60 ngày ổn định, ít bài chất lượng', 'Multiplier cao, vượt người ồn ào'],
                ['Rating Ring', '5 user chấm lẫn nhau', 'Reputation giảm + penalty kích hoạt'],
              ]}
            />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#scoring-config" className="underline text-inherit">
              → Xem chi tiết trong Architecture Docs
            </Link>
          </DocAlert>
        </DocSection>

        {/* Đảm bảo hệ thống */}
        <DocSection id="guarantees" title="🛡 6 Đảm Bảo Hệ Thống">
          <DocList items={[
            '✔ Không có đột biến mint — slow curve bảo vệ',
            '✔ Không có "post → tiền ngay" — phải qua epoch',
            '✔ Không có ranking công khai — chỉ thấy điểm của mình',
            '✔ Không thể farm vô hạn — velocity + cooldown + cap',
            '✔ Chất lượng > Số lượng — content exponent gamma = 1.3',
            '✔ Bền vững > Bùng nổ — consistency multiplier + time decay',
          ]} />
          <DocAlert type="success">
            Hệ Light Score đã đủ mạnh để gọi đối tác kỹ thuật, trình bày trước investor Web3, hoặc đưa vào Whitepaper chính thức.
          </DocAlert>
        </DocSection>
      </main>
    </div>
  );
};

export default DocsChangelog;
