import React from 'react';
import { DocSection, DocSubSection, DocParagraph, DocTable, DocList, DocAlert } from '@/components/docs/DocSection';

const ScoringConfigAndExampleDocs: React.FC = () => {
  return (
    <>
      {/* ===== PHẦN A: Scoring Config V1 ===== */}
      <DocSection id="scoring-config" title="⚙️ Scoring Config V1 (YAML/JSON Chuẩn)">
        <DocParagraph>
          Đây là bộ config chuẩn V1 dùng cho toàn bộ hệ thống Light Score. Dev team có thể copy trực tiếp để triển khai hoặc viết unit test.
        </DocParagraph>

        <pre className="bg-slate-950 text-slate-50 rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 font-mono leading-relaxed">
{`rule_version: "LS-Math-v1.0"

weights:
  base_action_weight: 0.4
  content_weight: 0.6

reputation:
  alpha: 0.25
  w_min: 0.5
  w_max: 2.0

content:
  gamma: 1.3
  type_multiplier:
    post: 1.0
    comment: 0.6
    video: 1.2
    course: 1.5
    bug_report: 1.1
    proposal: 1.3

consistency:
  beta: 0.6
  lambda: 30

sequence:
  eta: 0.5
  kappa: 5

penalty:
  theta: 0.8
  max_penalty: 0.5

mint:
  epoch_type: "monthly"
  anti_whale_cap: 0.03
  min_light_threshold: 10`}
        </pre>

        <DocSubSection title="Giải Thích Tham Số">
          <DocTable
            headers={['Nhóm', 'Tham số', 'Giá trị', 'Ý nghĩa']}
            rows={[
              ['weights', 'base_action_weight', '0.4', 'Trọng số hành động cơ bản (40%)'],
              ['weights', 'content_weight', '0.6', 'Trọng số nội dung (60%)'],
              ['reputation', 'alpha', '0.25', 'Hệ số ảnh hưởng reputation'],
              ['reputation', 'w_min / w_max', '0.5 / 2.0', 'Giới hạn trọng số reputation'],
              ['content', 'gamma', '1.3', 'Exponent chuẩn hóa nội dung — phạt nhẹ rating thấp'],
              ['consistency', 'beta', '0.6', 'Biên độ tối đa consistency multiplier'],
              ['consistency', 'lambda', '30', 'Tốc độ bão hòa (ngày)'],
              ['sequence', 'eta', '0.5', 'Biên độ tối đa sequence multiplier'],
              ['sequence', 'kappa', '5', 'Tốc độ bão hòa sequence bonus'],
              ['penalty', 'theta', '0.8', 'Hệ số phạt integrity'],
              ['penalty', 'max_penalty', '0.5', 'Phạt tối đa 50%'],
              ['mint', 'anti_whale_cap', '0.03', 'Tối đa 3% pool/user/epoch'],
              ['mint', 'min_light_threshold', '10', 'Điểm tối thiểu để đủ điều kiện mint'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN B: End-to-End Example ===== */}
      <DocSection id="e2e-example" title="🧮 Ví Dụ Tính Điểm End-to-End">
        <DocAlert type="info">
          Mô phỏng thực tế cho user <strong>u_ly</strong> — Epoch tháng 02/2026 — Mint Pool 100,000 FUN — Tổng Light hệ thống: 10,000
        </DocAlert>

        <DocSubSection title="Hoạt Động Trong Tháng">
          <DocList items={[
            '3 bài post được cộng đồng rating',
            '1 mentor chain hoàn thành',
            '30 ngày đóng góp liên tục (streak)',
            '1 signal "interaction unstable" nhẹ (risk = 0.1)',
          ]} />
        </DocSubSection>

        {/* Bước 1: Content Score */}
        <DocSubSection title="Bước 1 — Content Score">
          <DocParagraph>
            Công thức: <code className="bg-muted px-2 py-1 rounded text-sm font-mono">h(P_c) = (P_c / 10)^γ</code> với γ = 1.3
          </DocParagraph>
          <DocTable
            headers={['Bài viết', 'Rating tổng (P_c)', 'Chuẩn hóa (P_c/10)', 'h(P_c) = x^1.3', 'Kết quả']}
            rows={[
              ['Post 1', '8.5', '0.85', '(0.85)^1.3', '≈ 0.80'],
              ['Post 2', '7.2', '0.72', '(0.72)^1.3', '≈ 0.65'],
              ['Post 3', '9.0', '0.90', '(0.90)^1.3', '≈ 0.88'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              C = 0.80 + 0.65 + 0.88 = 2.33
            </p>
          </div>
        </DocSubSection>

        {/* Bước 2: Base Action Score */}
        <DocSubSection title="Bước 2 — Base Action Score">
          <DocTable
            headers={['Hành động', 'Điểm']}
            rows={[
              ['Check-in đều đặn', '3.0'],
              ['Mentor chain hoàn thành', '5.0'],
              ['Comment hỗ trợ cộng đồng', '2.0'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              B = 3.0 + 5.0 + 2.0 = 10
            </p>
          </div>
        </DocSubSection>

        {/* Bước 3: Raw Score */}
        <DocSubSection title="Bước 3 — Raw Score">
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              L_raw = 0.4 × B + 0.6 × C = 0.4 × 10 + 0.6 × 2.33 = 4 + 1.398 = 5.398
            </p>
          </div>
        </DocSubSection>

        {/* Bước 4: Consistency Multiplier */}
        <DocSubSection title="Bước 4 — Consistency Multiplier">
          <DocParagraph>
            Công thức: <code className="bg-muted px-2 py-1 rounded text-sm font-mono">M_cons = 1 + β(1 − e^(−streak/λ))</code>
          </DocParagraph>
          <DocTable
            headers={['Tham số', 'Giá trị', 'Tính toán']}
            rows={[
              ['β (beta)', '0.6', ''],
              ['λ (lambda)', '30', ''],
              ['streak', '30 ngày', ''],
              ['e^(−30/30)', '', 'e^(−1) ≈ 0.367'],
              ['1 − 0.367', '', '0.633'],
              ['0.6 × 0.633', '', '0.379'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              M_cons = 1 + 0.379 = 1.379
            </p>
          </div>
        </DocSubSection>

        {/* Bước 5: Sequence Multiplier */}
        <DocSubSection title="Bước 5 — Sequence Multiplier">
          <DocParagraph>
            Công thức: <code className="bg-muted px-2 py-1 rounded text-sm font-mono">M_seq = 1 + η × tanh(bonus/κ)</code>
          </DocParagraph>
          <DocTable
            headers={['Tham số', 'Giá trị', 'Tính toán']}
            rows={[
              ['η (eta)', '0.5', ''],
              ['κ (kappa)', '5', ''],
              ['Mentor chain bonus', '3', ''],
              ['tanh(3/5)', '', 'tanh(0.6) ≈ 0.537'],
              ['0.5 × 0.537', '', '0.268'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              M_seq = 1 + 0.268 = 1.268
            </p>
          </div>
        </DocSubSection>

        {/* Bước 6: Integrity Penalty */}
        <DocSubSection title="Bước 6 — Integrity Penalty">
          <DocParagraph>
            Công thức: <code className="bg-muted px-2 py-1 rounded text-sm font-mono">Penalty = 1 − min(max_penalty, θ × risk)</code>
          </DocParagraph>
          <DocTable
            headers={['Tham số', 'Giá trị', 'Tính toán']}
            rows={[
              ['θ (theta)', '0.8', ''],
              ['max_penalty', '0.5', ''],
              ['risk', '0.1', ''],
              ['θ × risk', '', '0.8 × 0.1 = 0.08'],
              ['min(0.5, 0.08)', '', '0.08'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              Integrity Factor = 1 − 0.08 = 0.92
            </p>
          </div>
        </DocSubSection>

        {/* Bước 7: Final Light Score */}
        <DocSubSection title="Bước 7 — Final Light Score">
          <DocTable
            headers={['Bước', 'Phép tính', 'Kết quả']}
            rows={[
              ['L_raw × M_cons', '5.398 × 1.379', '≈ 7.44'],
              ['× M_seq', '7.44 × 1.268', '≈ 9.43'],
              ['× Integrity', '9.43 × 0.92', '≈ 8.67'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-base text-foreground font-bold">
              ✨ Light Score tháng 02/2026 = 8.67
            </p>
          </div>
        </DocSubSection>

        {/* Phần C: Mint Calculation */}
        <DocSubSection title="Mint Calculation">
          <DocTable
            headers={['Chỉ số', 'Giá trị', 'Ghi chú']}
            rows={[
              ['User Light Score', '8.67', ''],
              ['Tổng Light hệ thống', '10,000', ''],
              ['Share', '8.67 / 10,000 = 0.000867', ''],
              ['Mint Pool', '100,000 FUN', 'Epoch tháng 02/2026'],
              ['Allocation', '100,000 × 0.000867', '= 86.7 FUN'],
              ['Anti-Whale Cap (3%)', '3,000 FUN', '86.7 < 3,000 → ✅ OK'],
            ]}
          />
          <DocAlert type="success">
            User u_ly nhận <strong>86.7 FUN</strong> trong epoch tháng 02/2026. Dưới ngưỡng anti-whale cap → phân bổ hợp lệ.
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN D: Unit Test Cases ===== */}
      <DocSection id="unit-test-cases" title="🧪 Unit Test Cases (Cho Dev Team)">
        <DocParagraph>
          4 test case quan trọng giúp dev team kiểm tra tính đúng đắn của scoring engine. Mỗi test mô phỏng một kịch bản edge-case thực tế.
        </DocParagraph>

        <DocSubSection title="Test 1 — Spam Burst">
          <DocTable
            headers={['Mục', 'Chi tiết']}
            rows={[
              ['Kịch bản', '50 posts/ngày, rating thấp (P_c ≈ 2.0)'],
              ['Công thức', 'h(2.0/10) = (0.2)^1.3 ≈ 0.14 mỗi bài'],
              ['Kết quả mong đợi', 'Content Score rất thấp dù số lượng lớn'],
              ['Lý do', 'Exponent γ=1.3 phạt mạnh nội dung rating thấp. Số lượng không bù được chất lượng'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 2 — Viral Drama">
          <DocTable
            headers={['Mục', 'Chi tiết']}
            rows={[
              ['Kịch bản', 'Nội dung viral, nhiều rating nhưng pillar healing = 0'],
              ['Công thức', 'P_c thiếu healing → tổng rating thấp → h(P_c) giảm'],
              ['Kết quả mong đợi', 'Không tăng mint dù engagement cao'],
              ['Lý do', 'Hệ thống đánh giá theo 5 trụ cột, thiếu trụ nào = P_c giảm toàn bộ'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 3 — Silent Consistent Contributor">
          <DocTable
            headers={['Mục', 'Chi tiết']}
            rows={[
              ['Kịch bản', '60 ngày ổn định, ít bài nhưng chất lượng cao (P_c ≈ 9.0)'],
              ['Consistency', 'M_cons = 1 + 0.6(1 − e^(−60/30)) = 1 + 0.6(0.865) ≈ 1.519'],
              ['Kết quả mong đợi', 'Vượt user ồn ào nhờ multiplier cao'],
              ['Lý do', 'Kiên nhẫn bền vững > bùng nổ ngắn hạn'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 4 — Rating Ring">
          <DocTable
            headers={['Mục', 'Chi tiết']}
            rows={[
              ['Kịch bản', '5 user chấm lẫn nhau liên tục'],
              ['Phát hiện', 'Reputation weight giảm (cluster detection) + risk tăng'],
              ['Kết quả mong đợi', 'Integrity penalty kích hoạt → điểm giảm mạnh'],
              ['Lý do', 'θ × risk cao → penalty lớn. Hệ thống tự bảo vệ khỏi rating ring'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN E: System Guarantees ===== */}
      <DocSection id="system-guarantees" title="🛡 Đảm Bảo Hệ Thống">
        <DocList items={[
          '✔ Không có đột biến mint — phân bổ luôn proportional',
          '✔ Không có "post → tiền ngay" — phải chờ epoch kết thúc',
          '✔ Không có ranking — chỉ level + xu hướng',
          '✔ Không thể farm vô hạn — exponent + cap + penalty',
          '✔ Chất lượng > số lượng — γ=1.3 đảm bảo',
          '✔ Bền vững > bùng nổ — consistency multiplier thưởng kiên nhẫn',
        ]} />
        <DocAlert type="success">
          Hệ thống được thiết kế để thưởng cho nhịp sống tử tế, không thưởng cho ồn ào. Đủ mạnh để gọi đối tác kỹ thuật, trình bày trước investor Web3, hoặc đưa vào Whitepaper chính thức.
        </DocAlert>
      </DocSection>
    </>
  );
};

export default ScoringConfigAndExampleDocs;
