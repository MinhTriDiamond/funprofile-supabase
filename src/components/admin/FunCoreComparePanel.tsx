import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, ShieldOff } from "lucide-react";
import { useFunCorePilotFlag, isUserInPilot } from "@/hooks/useFunCorePilotFlag";
import { useFunCoreProfile, useFunCoreBadges, useFunCoreLightScore } from "@/hooks/useFunCoreProfileData";

interface Props {
  userId: string;
}

function MetaBadges({ resp }: { resp: any }) {
  if (!resp) return null;
  const status = resp._http?.status;
  const dur = resp._http?.durationMs;
  const schema = resp.meta?.schemaVersion;
  const trace = resp.meta?.traceId;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      <Badge variant={resp.success ? "default" : "destructive"} className="text-[10px]">
        {resp.success ? "ok" : resp.error?.code ?? "error"}
      </Badge>
      {status != null && <Badge variant="outline" className="text-[10px]">HTTP {status || "—"}</Badge>}
      {dur != null && <Badge variant="outline" className="text-[10px]">{dur} ms</Badge>}
      {schema && <Badge variant="secondary" className="text-[10px]">schema: {schema}</Badge>}
      {trace && <Badge variant="secondary" className="text-[10px]">trace: {String(trace).slice(0, 8)}…</Badge>}
    </div>
  );
}

function CompareRow({ label, internal, external }: { label: string; internal: any; external: any }) {
  const both = internal != null && external != null;
  const match = both ? String(internal) === String(external) : null;
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b last:border-0 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono truncate" title={String(internal ?? "—")}>{String(internal ?? "—")}</div>
      <div className="font-mono truncate flex items-center gap-1.5" title={String(external ?? "—")}>
        <span className="truncate">{String(external ?? "—")}</span>
        {match === true && <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />}
        {match === false && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
    </div>
  );
}

export default function FunCoreComparePanel({ userId }: Props) {
  const { data: flag, isLoading: flagLoading } = useFunCorePilotFlag();

  // Internal data
  const internal = useQuery({
    queryKey: ["internal-profile-snapshot", userId],
    enabled: !!userId && !!flag?.enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: profile }, { data: light }] = await Promise.all([
        supabase.from("profiles").select("id, username, full_name, fun_id").eq("id", userId).maybeSingle(),
        supabase.from("light_reputation").select("total_light_score, tier, actions_count").eq("user_id", userId).maybeSingle(),
      ]);
      return { profile, light };
    },
  });

  // FUN Core data (only when in allowlist + admin)
  const fc = {
    profile: useFunCoreProfile(userId),
    badges: useFunCoreBadges(userId),
    lightScore: useFunCoreLightScore(userId),
  };

  if (flagLoading) {
    return <Card><CardContent className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (!flag?.enabled) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <ShieldOff className="h-5 w-5" />
          <span>Pilot FUN Core đang <strong>TẮT</strong>. Bật bằng <code className="text-xs">app_settings.fun_core_pilot_enabled = 'true'</code>.</span>
        </CardContent>
      </Card>
    );
  }

  if (!isUserInPilot(flag, userId)) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <span>userId <code className="text-xs">{userId.slice(0, 8)}…</code> không nằm trong allowlist pilot. Thêm vào <code className="text-xs">fun_core_pilot_allowed_user_ids</code> để bật đối soát.</span>
        </CardContent>
      </Card>
    );
  }

  const intProfile = internal.data?.profile;
  const intLight = internal.data?.light;
  const fcProfileData: any = fc.profile.data?.success ? fc.profile.data.data : null;
  const fcLightData: any = fc.lightScore.data?.success ? fc.lightScore.data.data : null;
  const fcBadgesData: any = fc.badges.data?.success ? fc.badges.data.data : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        Đối soát <strong>read-only</strong>: cột "Nội bộ" là DB FUN Profile, cột "FUN Core" là API <code>apifunrich.lovable.app</code>. Không ghi vào DB nội bộ.
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Profile</span>
            <MetaBadges resp={fc.profile.data} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fc.profile.isLoading || internal.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-2 pb-2 border-b text-[11px] font-semibold uppercase text-muted-foreground">
                <div>Trường</div><div>Nội bộ</div><div>FUN Core</div>
              </div>
              <CompareRow label="display_name" internal={intProfile?.full_name ?? intProfile?.username} external={fcProfileData?.displayName} />
              <CompareRow label="username/fun_id" internal={intProfile?.fun_id ?? intProfile?.username} external={fcProfileData?.username ?? fcProfileData?.handle} />
              <CompareRow label="language" internal={null} external={fcProfileData?.language} />
              <CompareRow label="country" internal={null} external={fcProfileData?.country} />
              <CompareRow label="did" internal={null} external={fcProfileData?.did} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Light Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Light Score</span>
            <MetaBadges resp={fc.lightScore.data} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fc.lightScore.isLoading || internal.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-2 pb-2 border-b text-[11px] font-semibold uppercase text-muted-foreground">
                <div>Trường</div><div>Nội bộ</div><div>FUN Core</div>
              </div>
              <CompareRow label="lightScore" internal={intLight?.total_light_score} external={fcLightData?.lightScore} />
              <CompareRow label="tier" internal={intLight?.tier} external={fcLightData?.rankTier} />
              <CompareRow label="trustLevel" internal={null} external={fcLightData?.trustLevel} />
              <CompareRow label="badgeCount" internal={null} external={fcLightData?.badgeCount} />
              <CompareRow label="contributionPoints" internal={intLight?.actions_count} external={fcLightData?.contributionPoints} />
              <CompareRow label="lastRecomputedAt" internal={null} external={fcLightData?.lastRecomputedAt} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Badges (FUN Core)</span>
            <MetaBadges resp={fc.badges.data} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fc.badges.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : fcBadgesData ? (
            <div className="text-sm">
              <div className="mb-2">Tổng: <strong>{fcBadgesData.count ?? 0}</strong></div>
              {(fcBadgesData.badges?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có badge nào trên FUN Core.</p>
              ) : (
                <ul className="text-xs space-y-1 list-disc pl-5">
                  {fcBadgesData.badges.map((b: any, i: number) => (
                    <li key={i}>
                      <span className="font-mono">{b.id ?? b.code ?? `#${i}`}</span>
                      {b.name && <span className="ml-1">— {b.name}</span>}
                      {b.issuedAt && <span className="ml-1 text-muted-foreground">({new Date(b.issuedAt).toLocaleDateString("vi-VN")})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-destructive">{fc.badges.data?.error?.message ?? "Không có dữ liệu."}</p>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Nguồn: FUN Core API (read-only) · Service identity <code>fun-profile</code> · Pilot scope
      </p>
    </div>
  );
}
