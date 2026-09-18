import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Trophy, BicepsFlexed, Handshake, Sparkles, Gift, ShoppingBag, Heart, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { PetBattle } from '../hooks/usePetBattle';

interface Props {
  battle: PetBattle | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function BattleResultDialog({ battle, open, onOpenChange }: Props) {
  const { userId } = useCurrentUser();
  if (!battle) return null;

  const isChallenger = battle.challenger_id === userId;
  const myXp = isChallenger ? battle.xp_award_challenger : battle.xp_award_opponent;
  const me = isChallenger ? battle.challenger_snapshot : battle.opponent_snapshot;
  const other = isChallenger ? battle.opponent_snapshot : battle.challenger_snapshot;
  const myProfile = isChallenger ? battle.challenger_profile : battle.opponent_profile;
  const otherProfile = isChallenger ? battle.opponent_profile : battle.challenger_profile;

  const myDisplay =
    myProfile?.display_name ||
    (myProfile?.username ? `@${myProfile.username}` : null) ||
    me?.pet_name ||
    'Bạn';
  const otherDisplay =
    otherProfile?.display_name ||
    (otherProfile?.username ? `@${otherProfile.username}` : null) ||
    other?.pet_name ||
    'Người chơi ẩn danh';
  const mySub = myProfile?.display_name && myProfile?.username ? `@${myProfile.username}` : null;
  const otherSub = otherProfile?.display_name && otherProfile?.username ? `@${otherProfile.username}` : null;
  const myInitial = (myProfile?.display_name || myProfile?.username || me?.pet_name || 'B').charAt(0).toUpperCase();
  const otherInitial = (otherProfile?.display_name || otherProfile?.username || other?.pet_name || '?').charAt(0).toUpperCase();

  const outcome = battle.winner_id === null
    ? 'draw'
    : battle.winner_id === userId ? 'win' : 'lose';

  const Icon = outcome === 'win' ? Trophy : outcome === 'lose' ? BicepsFlexed : Handshake;
  const title = outcome === 'win' ? 'Toả sáng rực rỡ!' : outcome === 'lose' ? 'Cùng luyện thêm nhé' : 'Cân bằng Ánh Sáng';
  const color = outcome === 'win' ? 'text-amber-500' : outcome === 'lose' ? 'text-destructive' : 'text-muted-foreground';

  const encouragement =
    outcome === 'win'
      ? 'Lumi tự hào về bạn! Ánh Sáng của bạn lan toả mạnh mẽ hôm nay 🌟'
      : outcome === 'draw'
        ? 'Cân bằng tuyệt đẹp! Hai Lumi cùng nhau toả sáng 💫'
        : 'Không sao đâu, mỗi trận đấu là một bước trưởng thành. Lumi tin bạn sẽ toả sáng rực rỡ lần sau 💛';

  const myLv = me?.pet_level ?? 1;
  const otherLv = other?.pet_level ?? 1;
  const gap = Math.max(0, otherLv - myLv);
  const showTips = outcome === 'lose' || gap >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${color}`} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 py-2">
          <div className="flex-1 flex flex-col items-center text-center min-w-0">
            <Avatar className="h-12 w-12 ring-2 ring-primary/30">
              {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} alt={myDisplay} />}
              <AvatarFallback>{myInitial}</AvatarFallback>
            </Avatar>
            <div className="text-[10px] text-primary font-semibold uppercase tracking-wider mt-1.5">Bạn</div>
            <div className="text-sm font-semibold truncate max-w-full px-1">{myDisplay}</div>
            {mySub && <div className="text-[11px] text-muted-foreground truncate max-w-full px-1">{mySub}</div>}
            <div className="font-bold text-base mt-0.5">Lv.{me?.pet_level}</div>
          </div>
          <Badge variant="outline" className="font-bold px-3 py-1 bg-muted/30 shrink-0 mt-4">VS</Badge>
          <div className="flex-1 flex flex-col items-center text-center min-w-0">
            <Avatar className="h-12 w-12 ring-2 ring-muted">
              {otherProfile?.avatar_url && <AvatarImage src={otherProfile.avatar_url} alt={otherDisplay} />}
              <AvatarFallback>{otherInitial}</AvatarFallback>
            </Avatar>
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1.5">Đối thủ</div>
            <div className="text-sm font-semibold truncate max-w-full px-1">{otherDisplay}</div>
            {otherSub && <div className="text-[11px] text-muted-foreground truncate max-w-full px-1">{otherSub}</div>}
            <div className="font-bold text-base mt-0.5">Lv.{other?.pet_level}</div>
          </div>
        </div>


        <div className="space-y-1.5">
          {battle.rounds.map((r, i) => (
            <motion.div
              key={r.round}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
              className="flex justify-between items-center bg-muted/40 rounded-md px-3 py-2 text-sm"
            >
              <span className="text-xs text-muted-foreground w-12">Round {r.round}</span>
              <span className={isChallenger ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>
                {isChallenger ? r.dmg_challenger : r.dmg_opponent}
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className={!isChallenger ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>
                {isChallenger ? r.dmg_opponent : r.dmg_challenger}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="text-center text-sm">
          <Badge variant={myXp > 10 ? 'default' : 'secondary'}>+{myXp} XP</Badge>
        </div>

        {/* Lời nhắn dễ thương từ Lumi */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 text-sm flex gap-2">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-900 dark:text-amber-100 leading-relaxed">{encouragement}</p>
        </div>

        {/* Gợi ý nâng cấp khi thua hoặc lệch cấp nhiều */}
        {showTips && (
          <div className="bg-muted/40 rounded-lg p-3 space-y-2.5">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Cách giúp Lumi mạnh hơn
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Lumi của bạn đang <b>Lv.{myLv}</b>, {otherDisplay} đang <b>Lv.{otherLv}</b>
              {gap > 0 && <> — cần thêm khoảng <b>~{gap * 100} XP</b> để đuổi kịp.</>}
            </p>

            <div className="space-y-1.5 text-sm">
              <Link
                to="/pet"
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-background transition-colors"
              >
                <Heart className="h-4 w-4 text-pink-500 shrink-0 mt-0.5" />
                <span>
                  <b>Vỗ tay cho bạn bè</b> mỗi ngày — Lumi nhận XP đều đặn, không tốn token.
                </span>
              </Link>

              <Link
                to="/mystery-box"
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-background transition-colors"
              >
                <Gift className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                <span>
                  <b>Mở Hộp Bí Ẩn</b> để săn trang phục hiếm — tăng ATK/DEF tức thì cho Lumi.
                </span>
              </Link>

              <Link
                to="/pet/shop"
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-background transition-colors"
              >
                <ShoppingBag className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <b>Ghé Shop Lumi</b> đổi trang phục bằng CAMLY — cộng chỉ số lâu dài.
                </span>
              </Link>

              <Link
                to="/"
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-background transition-colors"
              >
                <PenLine className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                <span>
                  <b>Đăng Inner Work / bài chất lượng</b> — vừa tăng Light Score, vừa nuôi XP cho Lumi.
                </span>
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
