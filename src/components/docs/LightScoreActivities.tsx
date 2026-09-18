import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';

const LightScoreActivities = () => {
  return (
    <>
      {/* I. Hoạt Động Cá Nhân */}
      <DocSection id="activities-personal" title="👤 I. Hoạt Động Cá Nhân (Self Light Actions)">
        <DocSubSection title="1. Daily Presence">
          <DocList items={[
            'Đăng nhập mỗi ngày',
            'Hoàn thành "Light Check-in"',
            'Xác nhận 1 hành động tích cực trong ngày',
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Hồ Sơ Chuẩn Light Identity">
          <DocList items={[
            'Hoàn thiện hồ sơ 100%',
            'KYC minh bạch (nếu bật chế độ Verified)',
            'Kết nối ví FUN Wallet',
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Thực Hành PPLP">
          <DocList items={[
            'Đồng ý 5 trụ cột PPLP',
            'Cam kết 5 lời hứa cộng đồng',
            'Đọc & xác nhận 8 câu thần chú',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* II. Hoạt Động Tương Tác Cộng Đồng */}
      <DocSection id="activities-community" title="🤝 II. Hoạt Động Tương Tác Cộng Đồng">
        <DocSubSection title="1. Light Interaction">
          <DocList items={[
            'Like tích cực',
            'Comment mang tính xây dựng',
            'Share nội dung có giá trị',
            'Gửi lời biết ơn công khai',
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Mentorship / Support">
          <DocList items={[
            'Hướng dẫn thành viên mới',
            'Trả lời câu hỏi chuyên môn',
            'Giải quyết tranh luận bằng ngôn ngữ tích cực',
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Conflict Transformation">
          <DocList items={[
            'Báo cáo vi phạm đúng cách',
            'Tham gia hoà giải',
            'Đề xuất giải pháp thay vì chỉ trích',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* III. Hoạt Động Tạo Giá Trị Nội Dung */}
      <DocSection id="activities-content" title="📝 III. Hoạt Động Tạo Giá Trị Nội Dung">
        <DocSubSection title="1. Content Creation">
          <DocList items={[
            'Viết bài gốc',
            'Video chia sẻ kiến thức',
            'Phân tích chuyên môn',
            'Case study minh bạch',
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Content Quality Signals">
          <DocList items={[
            'Được cộng đồng đánh giá tích cực',
            'Được lưu lại / bookmark',
            'Được trích dẫn bởi người khác',
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Knowledge Contribution">
          <DocList items={[
            'Tạo khóa Learn & Earn',
            'Viết tài liệu hướng dẫn',
            'Đề xuất cải tiến hệ thống',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* IV. Hoạt Động Kinh Tế – Web3 */}
      <DocSection id="activities-web3" title="💎 IV. Hoạt Động Kinh Tế – Web3">
        <DocSubSection title="1. On-chain Actions">
          <DocList items={[
            'Mint NFT có giá trị thật',
            'Giao dịch minh bạch',
            'Staking FUN / Camly Coin',
            'Tham gia Governance vote',
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Earn & Give">
          <DocList items={[
            'Tham gia Learn & Earn',
            'Give & Gain (quyên góp FUN Charity)',
            'Thưởng lại người khác',
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Value Flow Integrity">
          <DocAlert type="warning">
            Không spam — Không thao túng — Không farm tương tác giả. Vi phạm sẽ bị trừ Light Score.
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* V. Đóng Góp Hệ Sinh Thái FUN */}
      <DocSection id="activities-ecosystem" title="🌍 V. Đóng Góp Hệ Sinh Thái FUN">
        <DocSubSection title="1. Cross-Platform Contribution">
          <DocList items={[
            'Tạo nội dung trên FUN Play',
            'Tham gia FUN Academy',
            'Đóng góp FUN Legal',
            'Tham gia FUN Earth',
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Builder Actions">
          <DocList items={[
            'Phát hiện bug',
            'Đề xuất cải tiến UX',
            'Đóng góp code',
            'Đóng góp chiến lược',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* VI. Chuỗi Hành Động */}
      <DocSection id="behavior-sequences" title="🔗 VI. Chuỗi Hành Động (Behavior Sequences)">
        <DocAlert type="info">
          Light Score không chỉ tính hành động rời rạc — chuỗi hành vi logic nhận điểm cao hơn đáng kể.
        </DocAlert>

        <DocSubSection title="1. Light Growth Chain">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Đăng bài giá trị
  → Cộng đồng tương tác tích cực
    → Tác giả phản hồi xây dựng
      → Tạo thêm nội dung nâng cao
        → Hình thành mini-community`}
          </pre>
          <DocParagraph>Chuỗi này được tính điểm cao hơn hành động đơn lẻ.</DocParagraph>
        </DocSubSection>

        <DocSubSection title="2. Mentorship Chain">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Thành viên mới
  → Được hướng dẫn
    → Hoàn thành hồ sơ
      → Tạo nội dung đầu tiên
        → Được cộng đồng công nhận`}
          </pre>
          <DocParagraph>Người mentor nhận Light Score bậc cao.</DocParagraph>
        </DocSubSection>

        <DocSubSection title="3. Value Creation Loop">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Tạo khóa học
  → Người khác học
    → Áp dụng
      → Tạo kết quả
        → Chia sẻ lại kết quả`}
          </pre>
          <DocParagraph>Đây là vòng lặp ánh sáng — "Light Loop".</DocParagraph>
        </DocSubSection>

        <DocSubSection title="4. Conflict → Harmony Sequence">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Có tranh luận
  → Phản hồi bình tĩnh
    → Đưa giải pháp
      → Cộng đồng xác nhận tích cực`}
          </pre>
          <DocParagraph>Điểm Light rất cao — biến xung đột thành hoà hợp.</DocParagraph>
        </DocSubSection>

        <DocSubSection title="5. Economic Integrity Sequence">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Tham gia Learn & Earn
  → Tạo giá trị thật
    → Nhận thưởng
      → Phân bổ lại 1 phần cho cộng đồng`}
          </pre>
          <DocParagraph>Đây là "Pure Love Flow" — dòng chảy tình yêu thuần khiết.</DocParagraph>
        </DocSubSection>
      </DocSection>

      {/* VII. Phân Loại Cấp Độ */}
      <DocSection id="light-tiers" title="⭐ VII. Phân Loại Cấp Độ Light Score">
        <DocTable
          headers={['Cấp Độ', 'Tên Gọi', 'Mô Tả']}
          rows={[
            ['Tier 1', 'Light Presence', 'Hiện diện tích cực — đăng nhập, check-in'],
            ['Tier 2', 'Light Contributor', 'Người tạo giá trị — nội dung, tương tác'],
            ['Tier 3', 'Light Builder', 'Người xây dựng hệ sinh thái — code, chiến lược'],
            ['Tier 4', 'Light Guardian', 'Người bảo vệ văn hóa — hoà giải, mentorship'],
            ['Tier 5', 'Light Architect', 'Người thiết kế cấu trúc — governance, protocol'],
          ]}
        />
      </DocSection>

      {/* VIII. Cơ Chế Chống Farm */}
      <DocSection id="anti-farm" title="🛡 VIII. Cơ Chế Chống Farm Điểm">
        <DocParagraph>
          Để bảo vệ tính thuần khiết của PPLP, hệ thống áp dụng các cơ chế chống gian lận:
        </DocParagraph>
        <DocList ordered items={[
          'Giới hạn điểm tương tác lặp lại — không thể farm bằng hành động giống nhau',
          'AI phát hiện spam cảm xúc giả — nhận diện pattern không tự nhiên',
          'Weight dựa trên reputation của người đánh giá — đánh giá từ người uy tín có trọng số cao hơn',
          'Điểm tăng chậm – giảm chậm – không dao động cực đoan',
          'Sequence Multiplier chỉ kích hoạt khi đủ chuỗi logic hoàn chỉnh',
        ]} />
      </DocSection>

      {/* IX. Công Thức Cơ Bản */}
      <DocSection id="score-formula" title="📐 IX. Công Thức Tính Light Score">
        <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
          <p className="font-mono text-sm sm:text-base text-foreground font-semibold leading-relaxed">
            Light Score = (Positive Actions × Quality Weight) × (Sequence Multiplier) × (Community Validation Weight) − (Integrity Penalty)
          </p>
        </div>

        <DocSubSection title="Giải thích">
          <DocList items={[
            'Positive Actions — tổng hành động tích cực đã xác thực',
            'Quality Weight — trọng số chất lượng (charity > spam)',
            'Sequence Multiplier — hệ số nhân chuỗi hành vi',
            'Community Validation Weight — trọng số xác thực cộng đồng',
            'Integrity Penalty — điểm trừ khi vi phạm nguyên tắc',
          ]} />
        </DocSubSection>

        <DocSubSection title="Checklist cho Dev Team">
          <DocList items={[
            '☐ Phân loại hành động theo 6 nhóm',
            '☐ Thiết kế trọng số cho từng loại',
            '☐ Thiết kế Sequence Engine',
            '☐ Thiết kế Anti-Farm Layer',
            '☐ Thiết kế Transparency Dashboard',
            '☐ Tạo API tính điểm real-time',
          ]} />
        </DocSubSection>
      </DocSection>
    </>
  );
};

export default LightScoreActivities;
