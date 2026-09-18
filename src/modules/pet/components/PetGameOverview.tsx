import { Link } from 'react-router-dom';
import {
  Sparkles,
  TrendingUp,
  Smile,
  Users,
  Gift,
  ShoppingBag,
  Swords,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface StatItem {
  key: string;
  label: string;
  desc: string;
  Icon: typeof Sparkles;
}

interface FeatureItem {
  key: string;
  label: string;
  desc: string;
  to?: string;
  Icon: typeof Sparkles;
}

const STATS: StatItem[] = [
  { key: 'level', label: 'Level', desc: 'Tăng theo XP, mở khoá Shop (Lv.3+). Arena mở cho mọi cấp.', Icon: TrendingUp },
  { key: 'xp', label: 'XP', desc: 'Nhận từ Light Score, Quest, Mystery Box, Cheer', Icon: Sparkles },
  { key: 'mood', label: 'Mood', desc: 'Tâm trạng cao giúp buff thêm XP', Icon: Smile },
];

const FEATURES: FeatureItem[] = [
  { key: 'cheer', label: 'Cheer bạn bè', desc: 'Vào tab Friends để tiếp năng lượng cho Lumi của bạn bè và nhận XP đáp lại.', to: '/friends', Icon: Users },
  { key: 'box', label: 'Mystery Box', desc: '5 tier hộp quà với phần thưởng XP, CAMLY, skin và phụ kiện ngẫu nhiên.', to: '/mystery-box', Icon: Gift },
  { key: 'shop', label: 'Shop CAMLY on-chain', desc: 'Mua skin / phụ kiện bằng CAMLY thật trên BSC để nâng cấp vẻ ngoài Lumi.', to: '/pet/shop', Icon: ShoppingBag },
  { key: 'arena', label: 'Arena 1v1', desc: 'Mở cho mọi cấp Lumi — so tài với người chơi khác để leo bảng xếp hạng.', to: '/pet/arena', Icon: Swords },
  { key: 'risk', label: 'Risk Engine & Anti-farm', desc: 'Hệ thống chấm rủi ro EMA 7 ngày giữ sân chơi sạch; có kênh kháng nghị nếu bị gắn nhầm.', to: '/pet/appeal', Icon: ShieldAlert },
];

export function PetGameOverview() {
  return (
    <Card className="p-4 space-y-4 bg-gradient-to-br from-purple-50 via-fuchsia-50 to-pink-50 border-purple-200">
      <header className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-purple-600" />
        <h2 className="text-base sm:text-lg font-semibold">Chi tiết Lumi & Hệ thống trò chơi</h2>
      </header>

      <Accordion type="multiple" defaultValue={['what']} className="space-y-2">
        <AccordionItem value="what" className="border rounded-lg bg-background/60 px-3">
          <AccordionTrigger className="text-sm sm:text-base font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              Lumi là gì?
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
            Lumi là pet ánh sáng gắn liền với tài khoản FUN.RICH của bạn. Mỗi hành động Light Score
            (sám hối, biết ơn, phụng sự, giúp đỡ, trao tặng) đều khiến Lumi mạnh hơn, đẹp hơn và
            mở thêm khả năng mới trong hệ sinh thái.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="stats" className="border rounded-lg bg-background/60 px-3">
          <AccordionTrigger className="text-sm sm:text-base font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Ba chỉ số chính
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STATS.map(({ key, label, desc, Icon }) => (
                <div key={key} className="rounded-md border bg-background p-3 space-y-1">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <Icon className="w-4 h-4 text-purple-500" />
                    {label}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="features" className="border rounded-lg bg-background/60 px-3">
          <AccordionTrigger className="text-sm sm:text-base font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-pink-500" />
              Các tính năng chính
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-2">
              {FEATURES.map(({ key, label, desc, to, Icon }) => (
                <li key={key} className="rounded-md border bg-background p-3 flex gap-3">
                  <Icon className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{label}</span>
                      {to && (
                        <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                          <Link to={to}>Mở →</Link>
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="space-y-2">
        <p className="text-xs sm:text-sm font-medium text-foreground">Khám phá ngay</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/pet/arena">
              <Swords className="w-4 h-4 mr-1.5" />
              Arena 1v1
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/mystery-box">
              <Gift className="w-4 h-4 mr-1.5" />
              Mystery Box
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/pet/shop">
              <ShoppingBag className="w-4 h-4 mr-1.5" />
              Shop CAMLY
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/friends">
              <Users className="w-4 h-4 mr-1.5" />
              Cheer bạn bè
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
