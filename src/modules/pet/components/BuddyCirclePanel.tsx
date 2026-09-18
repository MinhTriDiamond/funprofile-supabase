import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Heart, Users, Sparkles, Copy, LogOut, UserPlus, Check, Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useMyBuddyCircles, useBuddyMembers, useBuddyQuests, useBuddyProgressToday,
  useCreateBuddyCircle, useJoinBuddyByCode, useInviteToBuddy, useLeaveBuddy,
  useCompleteBuddyQuest, useSearchBuddyCandidates, buddyErrorToMessage,
} from '@/modules/pet/hooks/useBuddyCircle';

export function BuddyCirclePanel() {
  const { userId } = useCurrentUser();
  const { data: circles } = useMyBuddyCircles();
  const { data: quests } = useBuddyQuests();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (circles && circles.length > 0 && !activeId) setActiveId(circles[0].id);
    if (circles && !circles.find(c => c.id === activeId)) {
      setActiveId(circles?.[0]?.id ?? null);
    }
  }, [circles, activeId]);

  const active = circles?.find(c => c.id === activeId) ?? null;
  const { data: members } = useBuddyMembers(activeId);
  const { data: progress } = useBuddyProgressToday(activeId);
  const completeQuest = useCompleteBuddyQuest();
  const leave = useLeaveBuddy();

  const myDoneIds = useMemo(
    () => new Set((progress ?? []).filter(p => p.user_id === userId).map(p => p.quest_id)),
    [progress, userId],
  );

  const onComplete = async (questId: string) => {
    if (!activeId) return;
    try {
      const r = await completeQuest.mutateAsync({ circle_id: activeId, quest_id: questId });
      if (r.just_completed && r.all_done_today) {
        toast.success('Hôm nay nhóm bạn cùng toả sáng! +XP Lumi & năng lượng.');
      } else if (r.just_completed) {
        toast.success(`Đã ghi nhận ${r.done_today}/${r.total_quests} nhiệm vụ hôm nay.`);
      } else {
        toast.info('Bạn đã đánh dấu nhiệm vụ này hôm nay rồi.');
      }
    } catch (e) {
      toast.error(buddyErrorToMessage(e));
    }
  };

  const onLeave = async () => {
    if (!activeId) return;
    if (!confirm('Bạn chắc chắn muốn rời nhóm này?')) return;
    try {
      await leave.mutateAsync(activeId);
      toast.success('Đã rời nhóm.');
      setActiveId(null);
    } catch (e) {
      toast.error(buddyErrorToMessage(e));
    }
  };

  const copyCode = () => {
    if (!active) return;
    navigator.clipboard.writeText(active.invite_code);
    toast.success('Đã sao chép mã mời.');
  };

  // === Empty state ===
  if (!circles || circles.length === 0) {
    return (
      <>
        <Card className="p-5 bg-gradient-to-br from-pink-50/60 to-amber-50/60 dark:from-pink-950/20 dark:to-amber-950/20 border-pink-200/40">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-pink-100 dark:bg-pink-900/40 p-2 shrink-0">
              <Heart className="w-5 h-5 text-pink-600 dark:text-pink-300" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold">Đôi bạn cùng tiến</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Rủ 1 bạn thân (hoặc nhóm tới 10 người) cùng làm 3 nhiệm vụ Ánh Sáng mỗi
                  ngày — biết ơn nhau, vỗ tay cho nhau, chia sẻ khoảnh khắc tỉnh thức. Hoàn
                  thành đủ 3, bạn được +XP Lumi và mood "Vui vẻ".
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCreateOpen(true)}>
                  <Sparkles className="w-4 h-4 mr-1" /> Tạo nhóm mới
                </Button>
                <Button variant="outline" onClick={() => setJoinOpen(true)}>
                  <Users className="w-4 h-4 mr-1" /> Tham gia bằng mã
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => setActiveId(id)} />
        <JoinDialog open={joinOpen} onOpenChange={setJoinOpen} onJoined={(id) => setActiveId(id)} />
      </>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selector + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeId ?? undefined} onValueChange={(v) => setActiveId(v)}>
          <SelectTrigger className="w-auto min-w-[200px]">
            <SelectValue placeholder="Chọn nhóm" />
          </SelectTrigger>
          <SelectContent>
            {circles.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Sparkles className="w-4 h-4 mr-1" /> Nhóm mới
        </Button>
        <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)}>
          <Users className="w-4 h-4 mr-1" /> Tham gia mã
        </Button>
      </div>

      {active && (
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-base">{active.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <span>Mã mời:</span>
                <code className="bg-muted px-2 py-0.5 rounded font-mono text-foreground">{active.invite_code}</code>
                <button onClick={copyCode} className="hover:text-foreground" aria-label="Copy">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <span>· {members?.length ?? 0}/{active.max_members} thành viên</span>
              </div>
            </div>
            <div className="flex gap-2">
              {(members?.length ?? 0) < active.max_members && (
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-1" /> Mời bạn
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onLeave} disabled={leave.isPending}>
                <LogOut className="w-4 h-4 mr-1" /> Rời
              </Button>
            </div>
          </div>

          {/* Members */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Thành viên · tiến độ hôm nay</div>
            <div className="space-y-1.5">
              {members?.map(m => {
                const done = (progress ?? []).filter(p => p.user_id === m.user_id).length;
                const total = quests?.length ?? 3;
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.avatar_url ?? undefined} />
                        <AvatarFallback>{(m.display_name ?? m.username ?? '?')[0]}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {m.display_name ?? m.username ?? 'Ẩn danh'}
                          {m.role === 'owner' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Người tạo</Badge>}
                          {m.user_id === userId && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Bạn</Badge>}
                        </div>
                      </div>
                    </div>
                    <Badge variant={done >= total ? 'default' : 'secondary'}>
                      {done}/{total} {done >= total && '✨'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quests */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Nhiệm vụ Ánh Sáng hôm nay</div>
            <div className="space-y-2">
              {quests?.map(q => {
                const done = myDoneIds.has(q.id);
                const otherMembers = (members ?? []).filter(m => m.user_id !== userId);
                const firstBuddy = otherMembers[0];
                const buddyTag = firstBuddy?.username
                  ? `@${firstBuddy.username}`
                  : (firstBuddy?.display_name ?? 'tên bạn cùng nhóm');
                const BACK_TO_BUDDY = encodeURIComponent('/pet/arena#buddy');
                let hint: { label: string; href: string } | null = null;
                if (q.id === 'gratitude_to_buddy') {
                  const prefill = firstBuddy?.username ? `@${firstBuddy.username} ` : '';
                  const href = prefill
                    ? `/?compose=post&prefill=${encodeURIComponent(prefill)}&back=${BACK_TO_BUDDY}`
                    : `/?compose=post&back=${BACK_TO_BUDDY}`;
                  hint = { label: `Viết lời biết ơn (≥50 ký tự, có ${buddyTag})`, href };
                } else if (q.id === 'cheer_buddy' && firstBuddy) {
                  const base = firstBuddy.username
                    ? `/@${firstBuddy.username}`
                    : `/profile/${firstBuddy.user_id}`;
                  const href = `${base}?back=${BACK_TO_BUDDY}#lumi`;
                  hint = { label: `Mở Lumi của ${firstBuddy.display_name ?? firstBuddy.username ?? 'bạn cùng nhóm'} & vỗ tay`, href };
                } else if (q.id === 'inner_work_share') {
                  hint = { label: 'Viết một khoảnh khắc tỉnh thức (≥150 ký tự)', href: `/?compose=inner_work&back=${BACK_TO_BUDDY}` };
                }
                return (
                  <div key={q.id} className={`p-3 rounded-lg border ${done ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60' : 'bg-card'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{q.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{q.description}</div>
                        {!done && hint && (
                          <Link
                            to={hint.href}
                            className="inline-flex items-center text-[11px] mt-1.5 text-primary hover:underline"
                          >
                            → {hint.label}
                          </Link>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={done ? 'secondary' : 'default'}
                        disabled={done || completeQuest.isPending}
                        onClick={() => onComplete(q.id)}
                      >
                        {done ? <><Check className="w-4 h-4 mr-1" /> Đã làm</> : 'Đã làm xong'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {myDoneIds.size >= (quests?.length ?? 3) && (
              <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-amber-100 to-pink-100 dark:from-amber-950/40 dark:to-pink-950/40 text-sm font-medium text-center">
                ✨ Hôm nay bạn đã cùng nhóm toả sáng — Lumi của bạn vừa nhận năng lượng mới!
              </div>
            )}
          </div>
        </Card>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => setActiveId(id)} />
      <JoinDialog open={joinOpen} onOpenChange={setJoinOpen} onJoined={(id) => setActiveId(id)} />
      {active && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          circleId={active.id}
          excludeIds={(members ?? []).map(m => m.user_id)}
        />
      )}
    </div>
  );
}

// ============ Sub-dialogs ============

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [size, setSize] = useState(2);
  const create = useCreateBuddyCircle();
  useEffect(() => { if (!open) { setName(''); setSize(2); } }, [open]);

  const onSubmit = async () => {
    try {
      const c = await create.mutateAsync({ name: name.trim(), max_members: size });
      toast.success('Đã tạo nhóm Ánh Sáng. Mời bạn của bạn cùng tham gia nào!');
      onCreated(c.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(buddyErrorToMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo nhóm "Đôi bạn cùng tiến"</DialogTitle>
          <DialogDescription>Đặt tên ý nghĩa và chọn sức chứa (2–10 người).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Tên nhóm</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='VD: "Đôi bạn Ánh Sáng An & Tâm"' maxLength={60} />
          </div>
          <div>
            <label className="text-xs font-medium">Số người tối đa</label>
            <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
              <SelectTrigger className="w-full justify-between">
                <SelectValue placeholder="Chọn số người" />
              </SelectTrigger>
              <SelectContent className="z-[100] max-h-72">
                <SelectItem value="2">2 người — Đôi bạn cùng tiến</SelectItem>
                <SelectItem value="3">3 người — Bộ ba ấm áp</SelectItem>
                <SelectItem value="4">4 người — Nhóm nhỏ thân thiết</SelectItem>
                <SelectItem value="5">5 người — Vòng tròn Ánh Sáng</SelectItem>
                <SelectItem value="6">6 người — Nhóm gắn kết</SelectItem>
                <SelectItem value="7">7 người — Bảy sắc cầu vồng</SelectItem>
                <SelectItem value="8">8 người — Cộng đồng ấm</SelectItem>
                <SelectItem value="9">9 người — Đại gia đình nhỏ</SelectItem>
                <SelectItem value="10">10 người — Đại gia đình Ánh Sáng</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Đã chọn: <span className="font-semibold text-foreground">{size} người</span>
            </p>
          </div>

          <Button onClick={onSubmit} disabled={create.isPending || name.trim().length < 2} className="w-full">
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Tạo nhóm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JoinDialog({ open, onOpenChange, onJoined }: { open: boolean; onOpenChange: (o: boolean) => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('');
  const join = useJoinBuddyByCode();
  useEffect(() => { if (!open) setCode(''); }, [open]);

  const onSubmit = async () => {
    try {
      const c = await join.mutateAsync(code);
      toast.success(`Đã tham gia nhóm "${c.name}".`);
      onJoined(c.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(buddyErrorToMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tham gia nhóm bằng mã</DialogTitle>
          <DialogDescription>Nhập mã 8 ký tự bạn nhận được từ người tạo nhóm.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            maxLength={8}
            className="font-mono uppercase tracking-widest text-center"
          />
          <Button onClick={onSubmit} disabled={join.isPending || code.length < 4} className="w-full">
            {join.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Tham gia
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ open, onOpenChange, circleId, excludeIds }: { open: boolean; onOpenChange: (o: boolean) => void; circleId: string; excludeIds: string[] }) {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(raw), 300); return () => clearTimeout(t); }, [raw]);
  useEffect(() => { if (!open) { setRaw(''); setQ(''); } }, [open]);
  const { data, isFetching } = useSearchBuddyCandidates(q, excludeIds);
  const invite = useInviteToBuddy();

  const onInvite = async (uid: string) => {
    try {
      await invite.mutateAsync({ circle_id: circleId, user_id: uid });
      toast.success('Đã gửi lời mời vào nhóm.');
    } catch (e) {
      toast.error(buddyErrorToMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mời bạn vào nhóm</DialogTitle>
          <DialogDescription>Tìm theo tên/username. Hệ thống sẽ gửi thông báo cho bạn ấy.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Nhập tên hoặc username..." className="pl-9" autoFocus />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {q.length < 2 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nhập ít nhất 2 ký tự để tìm.</p>
          ) : isFetching ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tìm...
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Không tìm thấy ai khớp.</p>
          ) : data.map(u => (
            <div key={u.user_id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/40">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback>{(u.display_name ?? u.username ?? '?')[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.display_name ?? u.username ?? 'Ẩn danh'}</div>
                  <div className="text-xs text-muted-foreground">{u.has_pet ? 'Đã có Lumi' : 'Chưa có Lumi'}</div>
                </div>
              </div>
              <Button size="sm" onClick={() => onInvite(u.user_id)} disabled={invite.isPending}>Mời</Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
