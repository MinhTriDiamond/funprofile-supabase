import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';

const ScoringApiAndVersioningDocs = () => {
  return (
    <>
      {/* ====== SCORING RULE VERSIONING ====== */}
      <DocSection id="scoring-versioning" title="🔄 Scoring Rule Versioning">
        <DocParagraph>
          Công thức tính điểm PPLP sẽ tiến hóa theo thời gian. Hệ thống cần cơ chế quản lý phiên bản an toàn, 
          đảm bảo không làm xáo trộn điểm của người dùng khi nâng cấp.
        </DocParagraph>

        <DocSubSection title="Lịch Sử Phiên Bản">
          <DocTable
            headers={['Version', 'Ngày Áp Dụng', 'Thay Đổi Chính']}
            rows={[
              ['v1.0', 'Launch', 'Công thức gốc: 5 Pillars × Community × Reputation × Consistency − Penalty'],
              ['v1.1', 'TBD', 'Thêm Sequence Multiplier, tinh chỉnh Integrity Penalty decay rate'],
              ['v2.0', 'TBD', 'AI-assisted pillar scoring, cross-platform weight normalization'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Migration Strategy (An Toàn)">
          <DocParagraph>
            Khi chuyển V1 → V2, hệ thống tuân thủ nguyên tắc: không tính lại quá khứ, chỉ áp dụng từ epoch mới.
          </DocParagraph>
          <DocList ordered items={[
            'Không tính lại điểm quá khứ — giữ nguyên kết quả đã ghi nhận',
            'Chỉ áp dụng rule mới từ epoch tiếp theo',
            'Hiển thị rõ cho cộng đồng: "Light Model Updated" khi có thay đổi',
            'Giữ v_old config để rollback bất cứ lúc nào',
          ]} />
          <DocAlert type="info">
            Điều này bảo vệ: niềm tin cộng đồng, ổn định hệ thống, và không gây sốc tâm lý cho người dùng.
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="Rollback Strategy">
          <DocAlert type="info">
            Mỗi bản ghi trong <code>light_score_ledger</code> đều lưu <code>scoring_version</code>. 
            Nếu cần rollback, hệ thống có thể tính lại điểm từ events gốc bằng phiên bản cũ.
          </DocAlert>
          <DocList items={[
            'Mọi event là immutable (append-only) — nguồn sự thật duy nhất',
            'Scoring là hàm thuần túy: cùng input + cùng version = cùng output',
            'Rollback = re-run scoring engine với version cũ trên event stream',
          ]} />
        </DocSubSection>

        <DocSubSection title="Schema: scoring_rule_versions">
          <DocTable
            headers={['Field', 'Type', 'Mô tả']}
            rows={[
              ['version_id', 'string (pk)', 'Mã phiên bản (v1.0, v1.1, v2.0…)'],
              ['formula_config_json', 'jsonb', 'Toàn bộ config công thức: weights, thresholds, multipliers'],
              ['activated_at', 'timestamp', 'Thời điểm bắt đầu áp dụng chính thức'],
              ['deactivated_at', 'timestamp?', 'Thời điểm ngừng sử dụng (null = đang active)'],
              ['status', 'enum', 'draft | shadow | active | archived'],
              ['changelog', 'text', 'Mô tả thay đổi so với phiên bản trước'],
              ['created_by', 'string', 'Admin/team tạo phiên bản'],
              ['created_at', 'timestamp', 'Thời điểm tạo'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== API ENDPOINTS ====== */}
      <DocSection id="api-endpoints" title="🔌 API Endpoints (Dev Reference)">
        <DocParagraph>
          Các endpoint chuẩn để dev team implement. Tất cả đều yêu cầu Authentication (JWT Bearer Token) 
          trừ khi ghi chú khác.
        </DocParagraph>

        <DocSubSection title="1. Event Ingest">
          <DocTable
            headers={['Thuộc tính', 'Chi tiết']}
            rows={[
              ['Method', 'POST'],
              ['Path', '/api/v1/events'],
              ['Auth', 'Bearer Token (required)'],
              ['Mô tả', 'Ghi nhận một hành động của user vào Event Store'],
            ]}
          />
          <DocSubSection title="Request Body">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "actor_user_id": "u123",
  "event_type": "POST_CREATED",
  "target_id": "content_456",
  "context_id": "thread_789",
  "payload": {
    "length": 842,
    "language": "vi"
  }
}`}
            </pre>
          </DocSubSection>
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "status": "accepted",
  "event_id": "evt_abc123"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="2. Submit PPLP Rating">
          <DocTable
            headers={['Thuộc tính', 'Chi tiết']}
            rows={[
              ['Method', 'POST'],
              ['Path', '/api/v1/pplp/rate'],
              ['Auth', 'Bearer Token (required)'],
              ['Mô tả', 'Gửi đánh giá PPLP cho một nội dung (5 trụ cột, mỗi trụ 0-2)'],
            ]}
          />
          <DocSubSection title="Request Body">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "content_id": "content_456",
  "pillar_truth": 2,
  "pillar_sustain": 1,
  "pillar_heal_love": 2,
  "pillar_life_service": 1,
  "pillar_unity_source": 2,
  "comment": "Rất rõ và có trách nhiệm"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="3. Get Light Summary (Public-safe)">
          <DocTable
            headers={['Thuộc tính', 'Chi tiết']}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/light/profile/{user_id}'],
              ['Auth', 'Bearer Token (required)'],
              ['Mô tả', 'Trả về Level và Trend của user — KHÔNG trả raw score'],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "level": "Light Builder",
  "trend": "Growing",
  "consistency_streak": 42,
  "sequence_active": 2
}`}
            </pre>
          </DocSubSection>
          <DocAlert type="warning">
            ⚠ Không trả raw score cho public view. Chỉ hiển thị Level và Trend.
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="4. Get Private Score Detail (Self-only)">
          <DocTable
            headers={['Thuộc tính', 'Chi tiết']}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/light/me'],
              ['Auth', 'Bearer Token (required — chỉ xem được của chính mình)'],
              ['Mô tả', 'Chi tiết điểm cá nhân — chỉ chính user mới thấy'],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "period": "2026-W09",
  "final_light_score": 87.4,
  "reputation_weight": 1.3,
  "sequence_multiplier": 1.2,
  "integrity_penalty": 0.05,
  "reason_codes": [
    "CONSISTENCY_STRONG",
    "MENTOR_CHAIN_COMPLETED"
  ]
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="5. Mint Epoch Summary">
          <DocTable
            headers={['Thuộc tính', 'Chi tiết']}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/mint/epoch/current'],
              ['Auth', 'Bearer Token (required)'],
              ['Mô tả', 'Trạng thái mint epoch hiện tại'],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "epoch_id": "2026-M02",
  "mint_pool": 125000,
  "total_light": 847230,
  "rule_version": "V1.2"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="Error Codes Chung">
          <DocTable
            headers={['Code', 'HTTP', 'Mô tả']}
            rows={[
              ['AUTH_REQUIRED', '401', 'Chưa xác thực — cần Bearer Token'],
              ['FORBIDDEN', '403', 'Không có quyền truy cập resource này'],
              ['RATE_LIMITED', '429', 'Vượt giới hạn tần suất — thử lại sau'],
              ['INVALID_INPUT', '400', 'Dữ liệu đầu vào không hợp lệ'],
              ['NOT_ELIGIBLE', '403', 'User chưa đủ điều kiện (chưa accept PPLP, chưa verify…)'],
              ['EPOCH_NOT_ACTIVE', '409', 'Epoch hiện tại chưa mở hoặc đã kết thúc'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== REASON CODES MICROCOPY ====== */}
      <DocSection id="reason-codes" title="💬 Reason Codes & Microcopy">
        <DocParagraph>
          Mọi thông báo hiển thị cho người dùng đều tuân theo nguyên tắc: 
          <strong> Tích cực — Không phán xét — Khuyến khích tăng trưởng</strong>.
        </DocParagraph>

        <DocAlert type="info">
          Nguyên tắc vàng: Không dùng từ "phạt", "trừ điểm", "vi phạm". 
          Thay bằng "cân bằng", "điều chỉnh", "bảo vệ", "nuôi dưỡng".
        </DocAlert>

        <DocSubSection title="Reason Codes — Tích Cực (Positive)">
          <DocTable
            headers={['Code', 'Microcopy (hiển thị cho user)', 'Ghi chú']}
            rows={[
              ['QUALITY_HIGH', '✨ Nội dung của bạn được cộng đồng đánh giá cao', 'Điểm PPLP trung bình cao'],
              ['SEQUENCE_COMPLETE', '🔗 Bạn đã hoàn thành chuỗi hành động tích cực', 'Sequence đạt chuẩn'],
              ['CONSISTENCY_BONUS', '🌱 Nhịp đóng góp đều đặn của bạn được ghi nhận', 'Streak ≥ 30 ngày'],
              ['MENTOR_IMPACT', '💛 Người bạn hướng dẫn đã tạo ra giá trị', 'Mentor chain thành công'],
              ['COMMUNITY_BUILDER', '🏘 Bạn đang xây dựng một cộng đồng nhỏ tích cực', 'Tạo group/thread có giá trị'],
              ['HEALING_CONTRIBUTION', '💚 Năng lượng chữa lành của bạn lan tỏa đến người khác', 'Pillar heal_love cao'],
              ['GOVERNANCE_ACTIVE', '🗳 Tiếng nói quản trị của bạn đang tạo ảnh hưởng tích cực', 'Tham gia vote có trách nhiệm'],
              ['ONCHAIN_VERIFIED', '⛓ Hành động on-chain của bạn đã được xác thực', 'Staking, mint NFT…'],
              ['FIRST_CONTRIBUTION', '🌟 Chào mừng đóng góp đầu tiên của bạn!', 'User mới bắt đầu'],
              ['CROSS_PLATFORM', '🌐 Đóng góp đa nền tảng của bạn được ghi nhận', 'Hoạt động trên nhiều FUN platforms'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Reason Codes — Điều Chỉnh (Adjustment)">
          <DocTable
            headers={['Code', 'Microcopy (hiển thị cho user)', 'Ghi chú nội bộ']}
            rows={[
              ['INTEGRITY_ADJUSTMENT', '🔄 Hệ thống đang cân bằng năng lượng để bảo vệ cộng đồng', 'Phát hiện pattern bất thường'],
              ['COOLDOWN_ACTIVE', '⏳ Hệ thống đang trong giai đoạn nghỉ — hãy quay lại sau', 'Rate limit đạt ngưỡng'],
              ['REVIEW_PENDING', '🔍 Đóng góp đang được xem xét để đảm bảo chất lượng', 'AI flagged, chờ review'],
              ['ENERGY_BALANCE', '☯ Năng lượng đang được điều hòa tự nhiên', 'Time decay applied'],
              ['GROWTH_OPPORTUNITY', '🌿 Đây là cơ hội để bạn phát triển sâu hơn', 'Điểm thấp nhưng khuyến khích'],
              ['DIVERSITY_NEEDED', '🎨 Hãy thử đa dạng hóa loại đóng góp của bạn', 'Quá tập trung vào 1 loại'],
              ['VERIFICATION_NEEDED', '🔐 Cần xác thực thêm để tiếp tục nhận ghi nhận', 'KYC hoặc wallet verify'],
              ['PATTERN_LEARNING', '📊 Hệ thống đang học nhịp đóng góp của bạn', 'User mới, chưa đủ data'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Nguyên Tắc Viết Microcopy PPLP">
          <DocList ordered items={[
            'Luôn bắt đầu bằng emoji phù hợp — tạo cảm xúc tích cực',
            'Dùng ngôi "bạn" — tạo kết nối cá nhân, không xa cách',
            'Không bao giờ dùng: "phạt", "trừ", "vi phạm", "cảnh cáo"',
            'Thay bằng: "cân bằng", "điều chỉnh", "bảo vệ", "nuôi dưỡng", "cơ hội"',
            'Mỗi thông báo adjustment phải kèm hướng tích cực (next step)',
            'Không hiển thị con số cụ thể bị trừ — chỉ hiện trend',
            'Tone giọng: như người thầy nhẹ nhàng, không như cảnh sát',
          ]} />
        </DocSubSection>

        <DocSubSection title="Ví Dụ Đối Chiếu">
          <DocTable
            headers={['❌ Cách viết cũ (Ego-driven)', '✅ Cách viết PPLP (Light-driven)']}
            rows={[
              ['Bạn bị trừ 50 điểm vì spam', '🔄 Hệ thống đang cân bằng năng lượng để bảo vệ cộng đồng'],
              ['Cảnh cáo: Hành vi bất thường', '🌿 Đây là cơ hội để bạn phát triển sâu hơn'],
              ['Bạn đứng hạng #47', '🌱 Light Growing — nhịp đóng góp của bạn đang tăng trưởng'],
              ['Điểm của bạn: 1,247.5', '💡 Light Builder — bạn đang tạo giá trị bền vững'],
              ['Vi phạm quy định lần 2', '☯ Năng lượng đang được điều hòa tự nhiên'],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== LEVEL SYSTEM ====== */}
      <DocSection id="level-system" title="🌟 Level System (Không Tạo Cạnh Tranh)">
        <DocParagraph>
          Hệ thống Level hiển thị mức độ đóng góp dưới dạng tên gọi ý nghĩa — không bao giờ hiển thị ranking hay thứ hạng.
        </DocParagraph>

        <DocSubSection title="Light Level Mapping">
          <DocTable
            headers={['Light Score Range', 'Level Name', 'Ý Nghĩa']}
            rows={[
              ['0 – 20', '🌱 Light Seed', 'Hạt giống ánh sáng — bắt đầu hành trình'],
              ['21 – 40', '🌿 Light Sprout', 'Mầm non — đang nảy mầm giá trị'],
              ['41 – 60', '🏗 Light Builder', 'Người xây dựng — tạo giá trị bền vững'],
              ['61 – 80', '🛡 Light Guardian', 'Người bảo vệ — giữ gìn hệ sinh thái'],
              ['81+', '🏛 Light Architect', 'Kiến trúc sư — định hình tầm nhìn'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Hiển Thị Xu Hướng (Trend)">
          <DocTable
            headers={['Trend', 'Hiển thị', 'Ý Nghĩa']}
            rows={[
              ['Stable', '☀️ Stable', 'Nhịp đóng góp ổn định'],
              ['Growing', '📈 Growing', 'Đang tăng trưởng tích cực'],
              ['Reflecting', '🌙 Reflecting', 'Đang trong giai đoạn suy ngẫm'],
              ['Rebalancing', '☯ Rebalancing', 'Năng lượng đang được điều hòa'],
            ]}
          />
        </DocSubSection>

        <DocAlert type="warning">
          Quy tắc bất biến: Không hiển thị Top 10, Rank #, hay bất kỳ bảng xếp hạng cạnh tranh nào. 
          Chỉ hiển thị Level cá nhân và Trend.
        </DocAlert>
      </DocSection>

      {/* ====== MINT ENGINE CHI TIẾT ====== */}
      <DocSection id="mint-engine" title="⚙️ Mint Engine Chi Tiết">
        <DocParagraph>
          Quy trình mint FUN Money theo epoch, đảm bảo công bằng và chống tập trung.
        </DocParagraph>

        <DocSubSection title="Epoch Flow (7 Bước)">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`1. Freeze Score Snapshot
        ↓
2. Remove Flagged Allocations
        ↓
3. Calculate Proportional Share
        ↓
4. Apply Anti-Whale Cap (max 3% / user)
        ↓
5. Finalize Mint Pool
        ↓
6. Execute On-chain Batch Mint
        ↓
7. Publish Transparency Summary`}
          </pre>
          <DocList ordered items={[
            'Freeze Score Snapshot — Chụp ảnh điểm toàn hệ tại thời điểm kết thúc epoch',
            'Remove Flagged — Loại bỏ các allocation bị flag bởi anti-farm signals',
            'Calculate Share — Tính tỷ lệ phân bổ theo đóng góp thực',
            'Anti-Whale Cap — Giới hạn tối đa 3% mint pool cho mỗi user',
            'Finalize — Xác nhận tổng mint pool cuối cùng',
            'On-chain Mint — Thực thi batch mint trên blockchain',
            'Transparency — Công bố tổng kết công khai (không hiện cá nhân)',
          ]} />
        </DocSubSection>

        <DocSubSection title="Anti-Whale Protection">
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
              max_share_per_user = 3% of epoch_pool
            </p>
          </div>
          <DocParagraph>
            Bảo vệ hệ sinh thái khỏi tập trung quyền lực kinh tế. Không ai có thể chiếm phần lớn mint pool, 
            dù Light Score rất cao.
          </DocParagraph>
        </DocSubSection>

        <DocSubSection title="Slow Mint Curve">
          <DocList items={[
            'Total supply tăng từ từ — đúng nguyên tắc "FUN mint theo giá trị thật"',
            'Mint pool mỗi epoch được giới hạn và tăng dần theo sức khỏe hệ sinh thái',
            'Không có "big bang" mint — mọi thứ diễn ra chậm, bền, minh bạch',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* ====== TRANSPARENCY DASHBOARD ====== */}
      <DocSection id="transparency-dashboard" title="📊 Transparency Dashboard (Không Nuôi Ego)">
        <DocParagraph>
          Dashboard công khai hiển thị sức khỏe hệ sinh thái — không bao giờ hiển thị thông tin cá nhân cụ thể.
        </DocParagraph>

        <DocSubSection title="Public Hiển Thị">
          <DocList items={[
            '🌍 Tổng Light toàn hệ sinh thái',
            '💰 Tổng FUN Minted kỳ này',
            '📊 % phân bổ theo Level (Seed / Sprout / Builder / Guardian / Architect)',
            '🔗 Tổng số Mentor Chain hoàn thành',
            '🔄 Tổng số Value Loop đang hoạt động',
            '📈 Xu hướng tăng trưởng hệ sinh thái theo tuần/tháng',
          ]} />
        </DocSubSection>

        <DocSubSection title="Không Hiển Thị">
          <DocAlert type="warning">
            Tuyệt đối không hiển thị: điểm cá nhân cụ thể, bảng xếp hạng, số FUN minted của từng người, 
            hay bất kỳ thông tin nào có thể tạo so sánh giữa các cá nhân.
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ====== BẢO VỆ DÀI HẠN ====== */}
      <DocSection id="long-term-protection" title="🛡 Bảo Vệ Dài Hạn (3 Lớp Chiến Lược)">
        <DocParagraph>
          Ba lớp bảo vệ chiến lược đảm bảo hệ thống PPLP luôn đúng tinh thần "Không nuôi Ego" theo thời gian.
        </DocParagraph>

        <DocSubSection title="1️⃣ Model Drift Monitor">
          <DocParagraph>
            Theo dõi liên tục xem hành vi cộng đồng có đang lệch về hướng Ego hay không.
          </DocParagraph>
          <DocList items={[
            'Phát hiện khi hành vi bắt đầu tập trung vào "chạy điểm" thay vì "tạo giá trị"',
            'Tự động đề xuất cập nhật scoring rules khi phát hiện drift',
            'Báo cáo định kỳ cho Guardian Council',
          ]} />
        </DocSubSection>

        <DocSubSection title="2️⃣ Community Council Review">
          <DocList items={[
            'Light Guardian + Light Architect review định kỳ (hàng tháng)',
            'Đánh giá sức khỏe hệ sinh thái qua Transparency Dashboard',
            'Đề xuất điều chỉnh scoring rules nếu cần',
            'Không có quyền can thiệp trực tiếp vào điểm cá nhân',
          ]} />
        </DocSubSection>

        <DocSubSection title="3️⃣ Slow Mint Curve Protection">
          <DocList items={[
            'Total supply tăng từ từ — không bao giờ mint đột biến',
            'Mint pool mỗi epoch có giới hạn cứng (hard cap)',
            'Tốc độ tăng supply được kiểm soát bởi governance vote',
          ]} />
        </DocSubSection>

        <DocAlert type="success">
          Tổng kết: Hệ thống PPLP hoàn chỉnh = Event Engine → Feature Builder → A.I. Support → 
          Deterministic Scoring → Epoch Mint → Transparency (Level-based, không ranking). 
          Đây là hệ kinh tế thưởng cho nhịp sống tử tế, không thưởng cho ồn ào. 💎
        </DocAlert>
      </DocSection>
    </>
  );
};

export default ScoringApiAndVersioningDocs;
