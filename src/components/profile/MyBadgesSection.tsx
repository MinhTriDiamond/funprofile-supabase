import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import {
  Award, ChevronRight, Sparkles,
  ShieldCheck, Gem, HandHeart, GraduationCap,
  Flag, Crown, Landmark, Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { SBTEvidenceDialog } from '@/components/identity/SBTEvidenceDialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const CAT_COLOR: Record<string, string> = {
  identity: 'from-emerald-400 to-teal-500',
  trust: 'from-sky-400 to-blue-500',
  contribution: 'from-violet-400 to-purple-500',
  credential: 'from-amber-400 to-orange-500',
  milestone: 'from-rose-400 to-pink-500',
  legacy: 'from-yellow-400 to-amber-600',
  governance: 'from-indigo-400 to-blue-600',
  social: 'from-pink-400 to-fuchsia-500',
};

const CAT_VI: Record<string, string> = {
  identity: 'Danh Tính',
  trust: 'Tín Nhiệm',
  contribution: 'Cống Hiến',
  credential: 'Chứng Chỉ',
  milestone: 'Cột Mốc',
  legacy: 'Di Sản',
  governance: 'Quản Trị',
  social: 'Cộng Đồng',
};

const CAT_ICON: Record<string, LucideIcon> = {
  identity: ShieldCheck,
  trust: Gem,
  contribution: HandHeart,
  credential: GraduationCap,
  milestone: Flag,
  legacy: Crown,
  governance: Landmark,
  social: Users,
};


// Ưu tiên sắp xếp theo độ quý
const CAT_RANK: Record<string, number> = {
  legacy: 1, milestone: 2, identity: 3, trust: 4,
  contribution: 5, credential: 6, governance: 7, social: 8,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function MyBadgesSection({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // 1) DID + SBTs đã có
  const { data: sbts, isLoading } = useQuery({
    queryKey: ['my-badges', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: did } = await (supabase as any)
        .from('did_registry').select('did_id').eq('owner_user_id', userId).maybeSingle();
      if (!did?.did_id) return [];
      const { data } = await (supabase as any)
        .from('sbt_registry').select('*').eq('did_id', did.did_id)
        .order('issued_at', { ascending: false });
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // 2) Rule catalog (display_name, description, category)
  const { data: rules } = useQuery({
    queryKey: ['sbt-rules-catalog'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('sbt_issuance_rules')
        .select('sbt_type, category, display_name, description, auto_conditions, is_active, mode');
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // 3) Quest streaks → progress cho upcoming
  const { data: questStreak } = useQuery({
    queryKey: ['quest-streaks', userId],
    enabled: !!userId && isOwner,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('quest_streaks').select('*').eq('user_id', userId).maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const ruleMap = useMemo(() => {
    const m = new Map<string, any>();
    (rules ?? []).forEach((r: any) => m.set(r.sbt_type, r));
    return m;
  }, [rules]);

  const sortedSbts = useMemo(() => {
    const list = (sbts ?? []) as any[];
    return [...list].sort((a, b) => {
      const ra = CAT_RANK[a.sbt_category] ?? 99;
      const rb = CAT_RANK[b.sbt_category] ?? 99;
      if (ra !== rb) return ra - rb;
      return new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime();
    });
  }, [sbts]);

  // Upcoming (chỉ owner): active auto rules user chưa có
  const upcoming = useMemo(() => {
    if (!isOwner) return [];
    const owned = new Set((sbts ?? []).map((s: any) => s.sbt_type));
    return (rules ?? [])
      .filter((r: any) => r.is_active && r.mode === 'auto' && !owned.has(r.sbt_type))
      .map((r: any) => {
        let progress: { current: number; target: number; label: string } | null = null;
        const c = r.auto_conditions ?? {};
        if (r.sbt_type === 'quest_first_light') {
          const cur = questStreak?.total_quests_completed ?? 0;
          progress = { current: Math.min(cur, 1), target: 1, label: `${cur}/1 quest hoàn thành` };
        } else if (r.sbt_type === 'quest_pilgrim_7d') {
          const cur = questStreak?.longest_streak ?? 0;
          progress = { current: Math.min(cur, 7), target: 7, label: `${cur}/7 ngày streak` };
        } else if (r.sbt_type === 'quest_devotee_30d') {
          const cur = questStreak?.longest_streak ?? 0;
          progress = { current: Math.min(cur, 30), target: 30, label: `${cur}/30 ngày streak` };
        } else if (r.sbt_type === 'quest_light_bringer') {
          const cur = Math.floor(Number(questStreak?.total_ls_from_quests ?? 0));
          progress = { current: Math.min(cur, 1000), target: 1000, label: `${cur}/1000 LS từ Quest` };
        } else if (r.sbt_type === '100_day_consistency') {
          const cur = questStreak?.longest_streak ?? 0;
          progress = { current: Math.min(cur, 100), target: 100, label: `${cur}/100 ngày` };
        } else if (c.min_consecutive_days) {
          progress = { current: 0, target: c.min_consecutive_days, label: `≥ ${c.min_consecutive_days} ngày đăng bài` };
        } else if (c.min_internal_donations) {
          progress = { current: 0, target: c.min_internal_donations, label: `≥ ${c.min_internal_donations} lần tặng quà` };
        } else if (c.min_lovehub_sessions) {
          progress = { current: 0, target: c.min_lovehub_sessions, label: `≥ ${c.min_lovehub_sessions} buổi LoveHUB` };
        } else if (c.min_reactions_on_post) {
          progress = { current: 0, target: c.min_reactions_on_post, label: `1 bài ≥ ${c.min_reactions_on_post} reactions` };
        }
        return { ...r, progress };
      })
      .sort((a: any, b: any) => {
        const pa = a.progress ? a.progress.current / a.progress.target : 0;
        const pb = b.progress ? b.progress.current / b.progress.target : 0;
        return pb - pa;
      })
      .slice(0, 6);
  }, [rules, sbts, isOwner, questStreak]);

  if (isLoading) return null;
  if (!sortedSbts.length && !isOwner) return null;

  const visible = expanded ? sortedSbts : sortedSbts.slice(0, 6);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 space-y-3">
        <Card className="p-4 sm:p-5 border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" /> Danh Hiệu Ánh Sáng
              <span className="text-xs font-normal text-muted-foreground">({sortedSbts.length})</span>
            </h3>
            {sortedSbts.length > 6 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} className="text-xs h-7">
                {expanded ? 'Thu gọn' : 'Xem tất cả'}<ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>

          {sortedSbts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có danh hiệu nào.</p>
              {isOwner && <p className="text-xs mt-1">Hệ thống sẽ tự cấp khi con đạt điều kiện thật.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
              {visible.map((sbt: any) => {
                const rule = ruleMap.get(sbt.sbt_type);
                const name = rule?.display_name ?? sbt.metadata?.display_name ?? sbt.sbt_type.replace(/_/g,' ');
                const desc = rule?.description ?? sbt.metadata?.description ?? '';
                const grad = CAT_COLOR[sbt.sbt_category] ?? 'from-slate-400 to-slate-500';
                const Icon = CAT_ICON[sbt.sbt_category] ?? Award;
                return (
                  <div key={sbt.token_id} className="relative group text-left w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <SBTEvidenceDialog sbt={sbt}>
                            <button className="group text-left w-full">
                              <div className={`aspect-square rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center relative overflow-hidden shadow-md group-hover:shadow-xl transition-all duration-500 group-hover:scale-[1.03]`}>
                                {/* Cầu vồng xoay nền */}
                                <div className="absolute -inset-2 opacity-60 mix-blend-screen [background:conic-gradient(from_0deg,#ff5e7e,#ffb347,#fff176,#7cf5a4,#5ec8ff,#b388ff,#ff7ad9,#ff5e7e)] animate-[spin_12s_linear_infinite] blur-[6px]" />
                                {/* Halo trắng pulse */}
                                <div className="absolute inset-2 rounded-full bg-white/40 blur-2xl animate-pulse" />
                                {/* Tia sáng xoay (conic trắng) */}
                                <div className="absolute inset-0 opacity-50 mix-blend-overlay [background:repeating-conic-gradient(from_0deg,transparent_0_18deg,rgba(255,255,255,0.7)_22deg,transparent_26deg)] animate-[spin_18s_linear_infinite]" />
                                {/* Vòng sáng mờ ngoài */}
                                <div className="absolute inset-3 rounded-full border border-white/50" />
                                {/* Bệ tròn 3D nổi cho icon */}
                                <div className="absolute w-[68%] h-[68%] rounded-full bg-gradient-to-br from-white/70 via-white/30 to-white/10 backdrop-blur-[2px] shadow-[inset_0_2px_6px_rgba(255,255,255,0.8),inset_0_-3px_8px_rgba(0,0,0,0.15),0_6px_14px_rgba(0,0,0,0.18)]" />
                                {/* Icon riêng theo category */}
                                <Icon
                                  strokeWidth={1.8}
                                  className="relative w-[44%] h-[44%] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.95)] drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]"
                                />
                                {/* Lấp lánh sparkle nhỏ */}
                                <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)] animate-ping" />
                                <span className="absolute bottom-2 right-2 w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,1)] animate-pulse" />
                                <span className="absolute top-2 right-3 w-0.5 h-0.5 rounded-full bg-white/90 animate-ping [animation-delay:0.6s]" />
                                {/* Shimmer sweep khi hover */}
                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
                              </div>
                              <p className="mt-1.5 text-[11px] font-semibold leading-tight line-clamp-2">{name}</p>
                              <p className="text-[10px] text-muted-foreground">{CAT_VI[sbt.sbt_category] ?? sbt.sbt_category}</p>
                              <p className="text-[9px] text-muted-foreground/80">Cấp {formatDate(sbt.issued_at)}</p>
                            </button>
                          </SBTEvidenceDialog>
                        </div>
                      </TooltipTrigger>
                      {desc && (
                        <TooltipContent side="bottom" className="max-w-[240px]">
                          <p className="font-semibold text-xs mb-1">{name}</p>
                          <p className="text-[11px] opacity-90">{desc}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>

                  </div>
                );
              })}
            </div>
          )}

          {isOwner && (
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              🔒 Soulbound — không thể chuyển nhượng. Hệ thống tự cấp dựa trên hành động thật.
            </p>
          )}
        </Card>

        {/* Sắp đạt được — chỉ owner */}
        {isOwner && upcoming.length > 0 && (
          <Card className="p-4 sm:p-5 border-border/60 bg-muted/30">
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" /> Danh hiệu sắp đạt được
              <span className="text-xs font-normal text-muted-foreground">({upcoming.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              {upcoming.map((r: any) => {
                const grad = CAT_COLOR[r.category] ?? 'from-slate-400 to-slate-500';
                const pct = r.progress ? Math.round((r.progress.current / r.progress.target) * 100) : 0;
                return (
                  <div key={r.sbt_type} className="flex gap-2.5 p-2.5 rounded-lg bg-background border border-border/40">
                    <div className={`shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br ${grad} opacity-40 flex items-center justify-center`}>
                      <Award className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-tight truncate">{r.display_name}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{r.description}</p>
                      {r.progress && (
                        <div className="mt-1.5 space-y-0.5">
                          <Progress value={pct} className="h-1" />
                          <p className="text-[10px] text-muted-foreground">{r.progress.label} · {pct}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
