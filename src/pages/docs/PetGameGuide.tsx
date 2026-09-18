import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function PetGameGuideDocs() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Hướng Dẫn Chơi Lumi — Pet Game v1</h1>
        <p className="text-muted-foreground">
          Lumi là pet ánh sáng phản ánh hành trình Light Score của bạn trên FUN.Rich.
          Không gambling, không pay-to-win — mọi cấp độ, vật phẩm và xếp hạng đều đến từ
          hành động đóng góp thật cho cộng đồng.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Mục lục</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li><a className="hover:underline text-primary" href="#lumi-la-gi">Lumi là gì</a></li>
            <li><a className="hover:underline text-primary" href="#nuoi-lumi">Tạo & nuôi Lumi</a></li>
            <li><a className="hover:underline text-primary" href="#cheer">Cheer giữa bạn bè</a></li>
            <li><a className="hover:underline text-primary" href="#mystery-box">Mystery Box</a></li>
            <li><a className="hover:underline text-primary" href="#shop">Shop CAMLY on-chain</a></li>
            <li><a className="hover:underline text-primary" href="#risk">Risk Engine & Anti-farm</a></li>
            <li><a className="hover:underline text-primary" href="#arena">Arena 1v1</a></li>
            <li><a className="hover:underline text-primary" href="#settings">Cài đặt & cá nhân hoá</a></li>
            <li><a className="hover:underline text-primary" href="#voice">Voice Lumi (Phase 8B)</a></li>
            <li><a className="hover:underline text-primary" href="#nguyen-tac">Nguyên tắc cốt lõi</a></li>
            <li><a className="hover:underline text-primary" href="#faq">FAQ</a></li>
            <li><a className="hover:underline text-primary" href="#changelog">Changelog</a></li>
          </ol>
        </CardContent>
      </Card>

      <Card id="lumi-la-gi">
        <CardHeader><CardTitle>1. Lumi là gì</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Lumi là <b>pet ánh sáng</b> gắn liền với tài khoản FUN.Rich. Mỗi hành động
            Light Score (sám hối, biết ơn, phụng sự, giúp đỡ, trao tặng) đều khiến Lumi
            mạnh hơn, đẹp hơn và mở thêm khả năng.
          </p>
          <p>
            Truy cập tại <Link className="text-primary hover:underline" to="/pet">/pet</Link>.
            Lumi không thể bán, không thể chuyển nhượng — nó là <b>danh thiếp ánh sáng</b> của bạn.
          </p>
        </CardContent>
      </Card>

      <Card id="nuoi-lumi">
        <CardHeader><CardTitle>2. Tạo & nuôi Lumi</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Ba chỉ số chính:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge variant="secondary">Level</Badge> tăng theo XP tích luỹ, mở khoá Shop (Lv.3+), cosmetic cao cấp. Arena mở cho tất cả từ Lv.1.</li>
            <li><Badge variant="secondary">XP</Badge> nhận từ Light Score, tham dự Live, hoàn thành Quest, mở Mystery Box.</li>
            <li><Badge variant="secondary">Mood</Badge> phản ánh nhịp tương tác gần đây; mood cao buff XP nhẹ khi cheer.</li>
          </ul>
          <p><b>Cap:</b> tối đa <b>500 XP/user/UTC day</b> để tránh farm.</p>
        </CardContent>
      </Card>

      <Card id="cheer">
        <CardHeader><CardTitle>3. Cheer giữa bạn bè</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Tab <b>Friends</b> trong <code>/pet</code> cho phép cheer pet người khác.
            Mỗi cheer cộng XP cả hai bên, tạo vòng tròn lan toả tích cực.
          </p>
          <p>
            Hệ thống ghi <code>pet_risk_signals</code> để phát hiện <b>self-loop</b>
            (A cheer B, B cheer lại A liên tục) và các pattern bất thường.
            Cheer vượt ngưỡng sẽ bị triệt giảm XP.
          </p>
        </CardContent>
      </Card>

      <Card id="mystery-box">
        <CardHeader><CardTitle>4. Mystery Box</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Hộp bí ẩn cấp tự động qua hành vi tích cực (daily login, streak, gift, mua CAMLY).
            5 tier: Phổ Thông → Hiếm → Sử Thi → Huyền Thoại → Vũ Trụ.
            Mở hộp nhận XP cho Lumi, cosmetic, CAMLY, SBT.
          </p>
          <p>
            Xem chi tiết tại{" "}
            <Link to="/docs/mystery-box" className="text-primary hover:underline">
              /docs/mystery-box
            </Link>.
          </p>
        </CardContent>
      </Card>

      <Card id="shop">
        <CardHeader><CardTitle>5. Shop CAMLY on-chain (Phase 6)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Truy cập <Link className="text-primary hover:underline" to="/pet/shop">/pet/shop</Link>.
            Catalog gồm cosmetic (mũ, kính, hào quang, nền) với <code>price_camly</code>,
            <code>level_required</code> và <code>stock</code>.
          </p>
          <p><b>Cơ chế thanh toán:</b></p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Bấm Mua → tạo order <Badge variant="outline">pending</Badge>.</li>
            <li>Ví bạn gửi CAMLY về ví <code>funtreasury</code> (BSC).</li>
            <li>Edge <code>pet-shop-confirm</code> verify on-chain Transfer log, finalize order, cấp item vào tủ.</li>
          </ol>
          <p className="text-muted-foreground">
            Không cần trung gian, không refund ngoài dây chuyền — tất cả minh bạch on-chain.
          </p>
        </CardContent>
      </Card>

      <Card id="risk">
        <CardHeader><CardTitle>6. Risk Engine & Anti-farm (Phase 7)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Hệ thống tính điểm rủi ro EMA 7 ngày, chia 4 tier:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge>safe</Badge> &lt; 0.25 — full quyền lợi.</li>
            <li><Badge variant="secondary">watch</Badge> 0.25 – 0.55 — quan sát.</li>
            <li><Badge variant="outline">restricted</Badge> 0.55 – 0.80 — giảm 50% XP, hạn chế Shop & cheer.</li>
            <li><Badge variant="destructive">frozen</Badge> ≥ 0.80 — đóng băng Shop, Arena, cheer.</li>
          </ul>
          <p>
            Cron chạy 04:30 UTC mỗi ngày, quét các tín hiệu xp_burst, cheer_loop, shop_velocity, tc_low.
            Bị đánh nhầm? Gửi kháng nghị tại{" "}
            <Link to="/pet/appeal" className="text-primary hover:underline">/pet/appeal</Link>.
          </p>
        </CardContent>
      </Card>

      <Card id="arena">
        <CardHeader><CardTitle>7. Arena 1v1 (Phase 8A)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Mở cho mọi cấp độ Lumi. Truy cập <Link to="/pet/arena" className="text-primary hover:underline">/pet/arena</Link>.
          </p>
          <p><b>4 chỉ số chiến đấu:</b></p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge>ATK</Badge> sát thương cơ bản</li>
            <li><Badge>DEF</Badge> giảm sát thương nhận</li>
            <li><Badge>SPD</Badge> ưu thế ra đòn trước</li>
            <li><Badge>LCK</Badge> tăng tỉ lệ crit & né</li>
          </ul>
          <p>
            <b>5 round tất định</b> — kết quả tính từ seed lưu trong DB, có thể tái dựng và audit.
            Snapshot stats được khoá lúc thách đấu, không ai farm giữa chừng được.
          </p>
          <p>
            <b>Giới hạn:</b> 10 trận / 24h / user. Pending challenge tự huỷ sau 24h.
            <br />
            <b>Leaderboard tuần</b> reset Chủ nhật 00:00 UTC, top XP nhận thưởng cosmetic mùa.
          </p>
        </CardContent>
      </Card>

      <Card id="settings">
        <CardHeader><CardTitle>8. Cài đặt & cá nhân hoá</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Trong <code>/pet</code>, bấm icon ⚙️ để mở <b>PetSettingsDialog</b>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Đổi tên Lumi (1 lần / 7 ngày)</li>
            <li>Trang bị cosmetic đã sở hữu</li>
            <li>Bật/tắt âm thanh nền & hiệu ứng</li>
            <li>(Sắp ra) Bật giọng nói Lumi — xem mục 9</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="voice">
        <CardHeader><CardTitle>9. Voice Lumi (Phase 8B)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Phase 8B sẽ tích hợp ElevenLabs TTS để Lumi "nói" trong các khoảnh khắc:
            level-up, mở hộp hiếm, thắng Arena, được cheer.
          </p>
          <p>
            <Badge variant="outline">Trạng thái</Badge> Đang chờ kích hoạt API key{" "}
            <code>ELEVENLABS_API_KEY</code>. Khi sẵn sàng sẽ có toggle riêng trong
            PetSettingsDialog, mặc định tắt để tôn trọng môi trường yên tĩnh.
          </p>
        </CardContent>
      </Card>

      <Card id="nguyen-tac">
        <CardHeader><CardTitle>10. Nguyên tắc cốt lõi</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>No gambling.</b> Mystery Box dùng pity & cap để minh bạch, không phải casino.</li>
            <li><b>No pay-to-win.</b> CAMLY chỉ mua cosmetic, không mua sức mạnh chiến đấu.</li>
            <li><b>Light Score là gốc.</b> Mọi XP, stats Arena, vật phẩm đều quy về hành vi tích cực thật.</li>
            <li><b>Audit-friendly.</b> Battle seed, shop tx, risk signals — đều lưu lại để truy vết.</li>
            <li><b>Soulbound.</b> Lumi không bán, không chuyển — gắn vĩnh viễn với tài khoản.</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="faq">
        <CardHeader><CardTitle>FAQ</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">Tôi xoá tài khoản, Lumi có mất không?</p>
            <p className="text-muted-foreground">Có. Lumi gắn 1-1 với user; xoá user là xoá Lumi cùng cosmetic.</p>
          </div>
          <div>
            <p className="font-semibold">Chuyển sang ví khác có giữ được Lumi không?</p>
            <p className="text-muted-foreground">Có — Lumi gắn với user ID, không phải ví. Bạn có thể đổi/đa-ví thoải mái.</p>
          </div>
          <div>
            <p className="font-semibold">Tôi bị tier <code>frozen</code> phải làm gì?</p>
            <p className="text-muted-foreground">Vào <Link className="text-primary hover:underline" to="/pet/appeal">/pet/appeal</Link> mô tả tình huống. Admin sẽ xem xét trong 48h.</p>
          </div>
          <div>
            <p className="font-semibold">Mua nhầm cosmetic, refund được không?</p>
            <p className="text-muted-foreground">Vì giao dịch on-chain đã finalize, không refund tự động. Có thể tặng/đổi trong các phase sau (đang nghiên cứu).</p>
          </div>
          <div>
            <p className="font-semibold">Arena có random ăn may không?</p>
            <p className="text-muted-foreground">Có thành phần LCK + seed, nhưng kết quả tất định và có thể tái dựng. Người mạnh hơn vẫn thắng đa số.</p>
          </div>
        </CardContent>
      </Card>

      <Card id="changelog">
        <CardHeader><CardTitle>Changelog</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li><Badge variant="outline">Phase 1–5</Badge> Pet core, XP, Mood, cheer, cosmetic miễn phí.</li>
            <li><Badge variant="outline">Phase 6</Badge> Shop CAMLY on-chain (treasury <code>funtreasury</code>).</li>
            <li><Badge variant="outline">Phase 7</Badge> Risk Engine 4 tier + Appeal flow.</li>
            <li><Badge variant="outline">Phase 8A</Badge> Arena 1v1, leaderboard tuần.</li>
            <li><Badge>Phase 8B</Badge> ElevenLabs Voice — chờ kích hoạt API key.</li>
          </ul>
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground">
            Tài liệu này cập nhật theo phiên bản hệ thống. Nếu phát hiện sai lệch, vui lòng báo trong group quản trị.
          </p>
        </CardContent>
      </Card>

      <section className="mt-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl p-8 sm:p-10 shadow-2xl ring-1 ring-white/20 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col items-center text-center gap-4">
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-lg" />
              <span className="text-4xl sm:text-5xl">🎮</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">
              Sẵn sàng đồng hành cùng Lumi?
            </h2>
            <p className="text-white/90 max-w-xl text-sm sm:text-base">
              Mở giao diện chơi game thực tế — đầy đủ Friends, Mystery Box, Shop CAMLY,
              Arena 1v1, Cài đặt và Risk Tier của bạn.
            </p>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto h-auto px-8 py-6 text-lg sm:text-xl font-bold rounded-full bg-white text-purple-700 border-0 shadow-xl hover:bg-white hover:scale-105 hover:shadow-2xl transition-all duration-300"
            >
              <Link to="/pet">🎮 Chơi Lumi Ngay</Link>
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-2 text-sm">
              <Link to="/pet" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                ✨ Lumi của tôi
              </Link>
              <Link to="/pet/shop" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                🛍️ Shop CAMLY
              </Link>
              <Link to="/pet/arena" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                ⚔️ Arena 1v1
              </Link>
              <Link to="/pet/appeal" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                📩 Kháng nghị
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
