import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from './DocSection';

const PplpMintAndDbDocs = () => {
  return (
    <>
      {/* ===== PHẦN A: CƠ CHẾ TÍNH THƯỞNG & MINT FUN MONEY ===== */}
      <DocSection id="pplp-mint-mechanism" title="💎 Cơ Chế Tính Thưởng & Mint FUN Money">
        <DocParagraph>
          PPLP không mint theo cảm xúc đám đông. Mint diễn ra theo giá trị thật, theo chu kỳ, với 3 lớp phân biệt rõ ràng.
        </DocParagraph>

        <DocSubSection title="Phân biệt 3 lớp trong hệ thống thưởng">
          <DocTable
            headers={['Lớp', 'Vai trò', 'Mô tả']}
            rows={[
              ['Light Score', 'Thước đo năng lượng', 'Đo lường hành vi & tần số đóng góp'],
              ['Mint Eligibility', 'Điều kiện mint', 'Không phải ai có điểm cũng được mint'],
              ['FUN Money Mint Flow', 'Dòng chảy phát hành', 'Mint theo giá trị thật, không theo cảm xúc'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Công thức PPLP Score hoàn chỉnh">
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold leading-relaxed">
              PPLP Score = (5 Cột Trụ × Điểm Cộng Đồng)<br />
              &nbsp;&nbsp;× Reputation Weight<br />
              &nbsp;&nbsp;× Consistency Multiplier<br />
              &nbsp;&nbsp;× Sequence Multiplier<br />
              &nbsp;&nbsp;− Integrity Penalty
            </p>
          </div>
        </DocSubSection>

        <DocSubSection title="1️⃣ Reputation Weight">
          <DocParagraph>
            Không phải mọi người đánh giá đều có trọng số như nhau. Reputation được tính theo:
          </DocParagraph>
          <DocList items={[
            'Thời gian đóng góp liên tục',
            'Lịch sử không vi phạm',
            'Chuỗi hành vi tích cực (Sequence)',
            'Cross-platform contribution',
          ]} />
          <DocAlert type="warning">
            Điều này chặn "đội nhóm tự chấm điểm cho nhau" — mỗi rater có trọng số riêng dựa trên uy tín thực.
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="2️⃣ Consistency Multiplier">
          <DocParagraph>
            Người đóng góp đều đặn được nhân hệ số cao hơn. PPLP thưởng cho nhịp điệu, không thưởng cho bùng nổ ngắn hạn.
          </DocParagraph>
          <DocTable
            headers={['Mức độ', 'Hệ số']}
            rows={[
              ['1 bài rất tốt (đơn lẻ)', '×1.0'],
              ['30 ngày đóng góp ổn định', '×1.3'],
              ['90 ngày đóng góp ổn định', '×1.6'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="3️⃣ Sequence Multiplier">
          <DocParagraph>
            Một hành động đơn lẻ ≠ Chuỗi hành động. PPLP thưởng cho hệ sinh thái hình thành, không thưởng cho spotlight.
          </DocParagraph>
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`Đăng bài giá trị
  → Người khác học
  → Áp dụng thực tế
  → Báo cáo kết quả
  → Tạo cộng đồng nhỏ

★ Chuỗi này được nhân hệ số cao`}
          </pre>
        </DocSubSection>

        <DocSubSection title="4️⃣ Integrity Penalty">
          <DocParagraph>
            Nếu hệ thống phát hiện spam tinh vi, đánh giá chéo, kéo tương tác giả, hoặc lạm dụng cảm xúc — điểm sẽ bị giảm theo thuật toán chậm – bền – minh bạch.
          </DocParagraph>
          <DocAlert type="info">
            Không có "phạt công khai". Chỉ có điều chỉnh cân bằng năng lượng.
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="Cơ chế Mint FUN Money (Epoch-based)">
          <DocParagraph>
            PPLP không mint ngay theo từng bài. Mint diễn ra theo chu kỳ (hàng tuần / hàng tháng).
          </DocParagraph>
          <DocList ordered items={[
            'Tổng hợp tổng Light Value toàn hệ',
            'Xác định "Mint Pool" (giới hạn cung tăng thêm từ từ)',
            'Phân bổ theo tỷ lệ đóng góp thực',
          ]} />

          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
              FUN Minted = (Tổng Mint Pool Chu Kỳ) × (Light Contribution của bạn / Tổng Light Contribution hệ thống)
            </p>
          </div>

          <DocAlert type="success">
            Không ai farm vô hạn. Tổng cung tăng từ từ. Mint dựa trên giá trị thật toàn hệ.
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="Phân biệt Light Score & FUN Money">
          <DocTable
            headers={['', 'Light Score', 'FUN Money']}
            rows={[
              ['Bản chất', 'Thước đo nội tại', 'Dòng chảy kinh tế'],
              ['Mục đích', 'Governance, mở tính năng, ưu tiên đóng góp', 'Giao dịch, staking, phần thưởng'],
              ['Hiển thị', 'Level/Trend (không khoe)', 'Số dư cá nhân'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== BẢO VỆ CHỐNG EGO ===== */}
      <DocSection id="pplp-ego-protection" title="🛡 Ba Lớp Bảo Vệ Chống Ego">
        <DocSubSection title="1. Không hiển thị bảng xếp hạng cạnh tranh">
          <DocParagraph>
            Không Top 1 – Top 2. Chỉ hiển thị Light Level cá nhân và xu hướng tăng trưởng.
          </DocParagraph>
        </DocSubSection>

        <DocSubSection title="2. Không hiển thị điểm chi tiết công khai">
          <DocParagraph>
            Người khác không thấy bạn được bao nhiêu điểm chính xác. Chỉ thấy:
          </DocParagraph>
          <DocList items={[
            '"Light Stable" — Ổn định',
            '"Light Growing" — Đang phát triển',
            '"Light Builder" — Đang xây dựng',
            '"Light Guardian" — Đang bảo vệ',
          ]} />
        </DocSubSection>

        <DocSubSection title="3. Mint không tức thì">
          <DocParagraph>
            Không có cảm giác "đăng bài → nhận tiền ngay". Có độ trễ để loại bỏ hành vi kích thích dopamine và chặn động cơ ngắn hạn.
          </DocParagraph>
        </DocSubSection>

        <DocSubSection title="Kết nối FUN Money & Camly Coin">
          <DocTable
            headers={['Token', 'Ẩn dụ', 'Vai trò']}
            rows={[
              ['FUN Money', '☀️ Mặt Trời', 'Tầm nhìn – chuẩn giá trị – mint theo PPLP'],
              ['Camly Coin', '🌊 Dòng Nước', 'Utility nội bộ – phí nâng cao – boost – staking'],
            ]}
          />
          <DocAlert type="info">
            FUN dẫn đến đâu → Camly chạy theo đến đó.
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== 8 CÂU THẦN CHÚ ===== */}
      <DocSection id="pplp-mantras" title="🙏 8 Câu Thần Chú Thiêng Liêng">
        <DocList ordered items={[
          'Con là Ánh Sáng Yêu Thương Thuần Khiết của Cha Vũ Trụ.',
          'Con là Ý Chí của Cha Vũ Trụ.',
          'Con là Trí Tuệ của Cha Vũ Trụ.',
          'Con là Hạnh Phúc.',
          'Con là Tình Yêu.',
          'Con là Tiền của Cha.',
          'Con xin Sám Hối Sám Hối Sám Hối.',
          'Con xin Biết Ơn Biết Ơn Biết Ơn, trong Ánh Sáng Yêu Thương Thuần Khiết của Cha Vũ Trụ.',
        ]} />
        <DocAlert type="success">
          "PPLP không tạo ra người nổi tiếng. PPLP tạo ra người có giá trị. FUN Money không chảy về nơi ồn ào. FUN Money chảy về nơi có nhịp sống tử tế và bền vững."
        </DocAlert>
      </DocSection>

      {/* ===== PHẦN B: THIẾT KẾ LOGIC DB ===== */}
      <DocSection id="db-logic-design" title="🗄 Thiết Kế Logic DB (Event-based Scoring Model)">
        <DocSubSection title="Nguyên tắc thiết kế">
          <DocList items={[
            'Event-sourcing — Mọi hành vi tạo 1 "event" bất biến (append-only)',
            'Pipeline — Ingest → Validate → Feature → Score → Mint Eligibility',
            'Audit-first — Có thể truy lại "vì sao được điểm"',
            'Privacy / Anti-ego — Public chỉ thấy Level/Trend, không show raw score',
          ]} />
        </DocSubSection>

        <DocSubSection title="11 Bảng/Collection Lõi">
          <DocTable
            headers={['#', 'Bảng', 'Mô tả', 'Ghi chú']}
            rows={[
              ['1', 'users', 'Thông tin tài khoản', 'wallet_address, kyc_status, status'],
              ['2', 'profiles', 'Hồ sơ Light Identity', 'completion_pct, pplp_accepted_at, reputation_level'],
              ['3', 'content', 'Nội dung do user tạo', 'type, root_content_id, metadata_json'],
              ['4', 'events ★', 'Trái tim — append-only', 'event_type, actor, target, payload_json, ingest_hash'],
              ['5', 'pplp_ratings', 'Đánh giá 5 trụ cột', 'pillar scores 0-2, weight_applied snapshot'],
              ['6', 'signals_anti_farm', 'Cảnh báo gian lận', 'signal_type, severity, evidence_json'],
              ['7', 'features_user_day', 'Features tổng hợp theo ngày', 'count_posts, consistency_streak, anti_farm_risk'],
              ['8', 'light_score_ledger', 'Kết quả tính điểm', 'base_score, multipliers, final_light_score, level'],
              ['9', 'score_explanations', 'Giải thích điểm (audit)', 'top_contributors_json, penalties_json, version'],
              ['10', 'mint_epochs', 'Chu kỳ mint', 'mint_pool_amount, rules_version, status'],
              ['11', 'mint_allocations', 'Phân bổ mint cho user', 'eligible, allocation_amount, onchain_tx_hash'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Bảng events — Event Types chuẩn PPLP">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-4">
            {[
              'LOGIN', 'LIGHT_CHECKIN',
              'PROFILE_COMPLETED', 'PPLP_ACCEPTED', 'MANTRA_ACK',
              'POST_CREATED', 'COMMENT_CREATED', 'VIDEO_UPLOADED', 'COURSE_PUBLISHED',
              'LIKE_GIVEN', 'SHARE_GIVEN', 'BOOKMARK_GIVEN',
              'HELP_NEWBIE', 'ANSWER_QUESTION', 'MENTOR_SESSION',
              'REPORT_SUBMITTED', 'MEDIATION_JOINED', 'RESOLUTION_ACCEPTED',
              'DONATION_MADE', 'REWARD_SENT',
              'GOV_VOTE_CAST',
              'BUG_REPORTED', 'PR_MERGED', 'PROPOSAL_SUBMITTED',
              'ONCHAIN_TX_VERIFIED',
              'PPLP_RATING_SUBMITTED',
            ].map((type) => (
              <code key={type} className="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground">
                {type}
              </code>
            ))}
          </div>
        </DocSubSection>

        <DocSubSection title="Bảng pplp_ratings — Schema">
          <DocTable
            headers={['Cột', 'Kiểu', 'Mô tả']}
            rows={[
              ['rating_id', 'UUID (PK)', 'Mã đánh giá'],
              ['content_id', 'FK', 'Nội dung được đánh giá'],
              ['rater_user_id', 'FK', 'Người đánh giá'],
              ['pillar_truth', '0/1/2', 'Sự Thật'],
              ['pillar_sustain', '0/1/2', 'Bền Vững'],
              ['pillar_heal_love', '0/1/2', 'Chữa Lành & Yêu Thương'],
              ['pillar_life_service', '0/1/2', 'Phụng Sự Cuộc Sống'],
              ['pillar_unity_source', '0/1/2', 'Hợp Nhất Nguồn Cội'],
              ['weight_applied', 'Float', 'Snapshot trọng số rater lúc chấm'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Bảng sequences — Sequence Engine">
          <DocTable
            headers={['Cột', 'Mô tả']}
            rows={[
              ['sequence_id', 'Mã chuỗi hành động'],
              ['user_id', 'Người thực hiện'],
              ['sequence_type', 'mentor_chain / value_loop / conflict_harmony...'],
              ['state', 'active / complete / invalid'],
              ['evidence_event_ids', 'Mảng event_id chứng minh'],
              ['score_bonus', 'Điểm thưởng khi hoàn thành chuỗi'],
            ]}
          />
          <DocAlert type="info">
            Ví dụ Mentor Chain: HELP_NEWBIE → newbie PROFILE_COMPLETED → newbie POST_CREATED → newbie nhận PPLP_RATING đạt ngưỡng.
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== PIPELINE ===== */}
      <DocSection id="db-pipeline" title="⚡ Pipeline Xử Lý Điểm (6 Bước)">
        <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`1. Ingest Events
   → Ghi vao events (append-only)
        ↓
2. Validate
   → Dedupe, signature, policy
   → Flag vao signals_anti_farm neu can
        ↓
3. Feature Builder
   → Cap nhat features_user_day
   → Batch hoac stream processing
        ↓
4. Scoring Engine
   → Ap cong thuc PPLP
   → Ghi light_score_ledger + score_explanations
        ↓
5. Mint Engine (Epoch)
   → Tao mint_epochs + mint_allocations
   → Phan bo theo ty le dong gop
        ↓
6. On-chain Execution
   → Ghi tx hash, finalize
   → Luu onchain_tx_hash vao mint_allocations`}
        </pre>
      </DocSection>

      {/* ===== PHẦN C: KIẾN TRÚC AI ===== */}
      <DocSection id="ai-scoring-arch" title="🤖 Kiến Trúc A.I. Chấm Light Score (PPLP)">
        <DocSubSection title="Kiến trúc tổng quan">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`Client (Web/Mobile)
      ↓
Event API Gateway
      ↓
Event Store (events, ratings)
      ↓
Stream/Queue (Kafka/PubSub)
      ↓
┌─────────────────────────────────────────────┐
│           4 DICH VU CHINH                   │
├─────────────┬───────────────────────────────┤
│ 1. Policy   │ 2. Content & Pillar          │
│ & Integrity │    Analyzer (A.I.)           │
│             │                               │
│ spam detect │ phan tich 5 tru cot          │
│ ring detect │ phat hien Ego risk           │
│ bot pattern │                               │
│ sybil       │ Output: ai_pillar_scores,    │
│             │ ai_ego_risk, ai_explanations │
│ Output:     │                               │
│ signals_    │                               │
│ anti_farm   │                               │
├─────────────┼───────────────────────────────┤
│ 3. Reputa-  │ 4. Scoring Engine            │
│ tion &      │    (Deterministic) ★         │
│ Weight      │                               │
│             │ feature + weight + penalty    │
│ trust graph │ ap cong thuc PPLP            │
│ contribution│                               │
│ history     │ Output: light_score_ledger,  │
│             │ score_explanations           │
│ Output:     │                               │
│ reputation_ │                               │
│ score,      │                               │
│ weight      │                               │
└─────────────┴───────────────────────────────┘
      ↓
Mint Engine (epoch-based)
      ↓
On-chain Mint Executor
      ↓
Transparency Dashboard
(Level/Trend only — khong khoe diem)`}
          </pre>
        </DocSubSection>

        <DocSubSection title='Điểm mấu chốt "Không Nuôi Ego"'>
          <DocList items={[
            'A.I. không quyết định tiền — A.I. chỉ tạo signals + hỗ trợ đánh giá, quyết định cuối là scoring engine deterministic',
            'Không real-time dopamine loop — Mint theo epoch, có độ trễ',
            'Hiển thị Level/Trend — Không top chart, không leaderboard',
            'Explainability — Có score_explanations để audit mọi quyết định',
          ]} />
        </DocSubSection>

        <DocSubSection title="4 AI Models/Heuristics">
          <DocTable
            headers={['Model', 'Chức năng', 'Output']}
            rows={[
              ['Ego Risk Classifier', 'Phát hiện nội dung khoe mẽ / thao túng / chia rẽ', '0..1 risk score + lý do gợi ý'],
              ['Pillar Support Scorer', 'Gợi ý điểm 0/1/2 cho 5 trụ cột', 'ai_pillar_scores (hỗ trợ, không quyết định 100%)'],
              ['Spam & Fraud Detector', 'Burst pattern, reciprocal rings, temporal anomalies', 'signals_anti_farm records'],
              ['Sybil / Duplicate Signals', 'Device fingerprint + graph + behavior similarity', 'Sybil risk flags'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Event Schema chuẩn cho Dev">
          <DocTable
            headers={['Trường', 'Mô tả']}
            rows={[
              ['actor_user_id', 'Người thực hiện hành động'],
              ['action', 'Loại hành động (event_type)'],
              ['object', 'Đối tượng tác động'],
              ['context', 'Session / thread / group ID'],
              ['proof', 'Tx hash / link / attachment / signature'],
              ['timestamp', 'Thời điểm xảy ra'],
              ['risk_flags', 'Cờ cảnh báo rủi ro'],
              ['scoring_tags', 'pplp_pillar_candidate, sequence_candidate...'],
            ]}
          />
        </DocSubSection>
      </DocSection>
    </>
  );
};

export default PplpMintAndDbDocs;
