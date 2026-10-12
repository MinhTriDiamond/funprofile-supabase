import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Activity, Coins, Users, Shield, Wallet, X } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDebounce } from "@/hooks/useDebounce";
import { useLanguage } from "@/i18n/LanguageContext";

const LOCALES: Record<string, string> = { vi: "vi-VN", en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", th: "th-TH", fr: "fr-FR", id: "id-ID", es: "es-ES", pt: "pt-PT", de: "de-DE", ru: "ru-RU", ar: "ar-EG" };

interface LimitsResponse {
  generated_at: string;
  cache_ttl_seconds?: number;
  soft_ceiling: {
    limit: number;
    used_month: number;
    remaining: number;
    used_pct: number;
    system_stage: string;
    base_rate: number;
  };
  per_action_today: Array<{
    action: string;
    daily_cap: number;
    used_today: number;
    remaining: number;
    used_pct: number;
  }>;
  per_user_monthly_cap: number;
  user_status: null | {
    user_id: string;
    monthly_cap: number;
    used_this_month: number;
    remaining: number;
    used_pct: number;
    request_count_month: number;
  };
  constants: {
    ON_CHAIN_DAILY_CAP_PER_ACTION: number;
    MAX_MINT_PER_USER_PER_MONTH: number;
    theoretical_monthly_ceiling: number;
  };
  wallet_lookup?: null | {
    input: string;
    normalized: string;
    resolved: boolean;
    source: string | null;
    profile: { id: string; username: string | null; display_name: string | null } | null;
  };
}

const fmt = (n: number, loc = "vi-VN") =>
  new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(n);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const POLL_INTERVAL_MS = 30_000;
// Ngưỡng thay đổi tối thiểu (% used) để re-render — tránh nhấp nháy UI
const SIGNIFICANT_PCT_DELTA = 0.5;

function isSignificantChange(prev: LimitsResponse | null, next: LimitsResponse): boolean {
  if (!prev) return true;
  if (Math.abs(prev.soft_ceiling.used_pct - next.soft_ceiling.used_pct) >= SIGNIFICANT_PCT_DELTA) return true;
  if ((prev.user_status?.used_pct ?? 0) !== (next.user_status?.used_pct ?? 0)) {
    if (Math.abs((prev.user_status?.used_pct ?? 0) - (next.user_status?.used_pct ?? 0)) >= SIGNIFICANT_PCT_DELTA) return true;
  }
  for (let i = 0; i < next.per_action_today.length; i++) {
    const p = prev.per_action_today[i]?.used_pct ?? 0;
    const n = next.per_action_today[i].used_pct;
    if (Math.abs(p - n) >= SIGNIFICANT_PCT_DELTA) return true;
  }
  if (prev.soft_ceiling.system_stage !== next.soft_ceiling.system_stage) return true;
  return false;
}

export default function TokenLimitsDocs() {
  const { user } = useCurrentUser();
  const { t, language } = useLanguage();
  const loc = LOCALES[language] || "en-US";
  const fmtL = (n: number) => fmt(n, loc);
  const [data, setData] = useState<LimitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string>("");

  // Bộ chọn ví: ưu tiên ví đang nhập; nếu trống thì dùng user đang đăng nhập.
  const [walletInput, setWalletInput] = useState<string>("");
  const debouncedWallet = useDebounce(walletInput.trim(), 600);
  const isValidWallet = /^0x[a-fA-F0-9]{40}$/.test(debouncedWallet);

  const etagRef = useRef<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<LimitsResponse | null>(null);

  // Reset etag khi đổi mode (wallet vs user) để không trả nhầm 304 dữ liệu cũ
  useEffect(() => {
    etagRef.current = null;
    dataRef.current = null;
  }, [debouncedWallet, user?.id]);

  const doFetch = useCallback(async () => {
    if (inFlightRef.current) inFlightRef.current.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;

    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (isValidWallet) {
        params.set("wallet", debouncedWallet.toLowerCase());
      } else if (!debouncedWallet && user?.id) {
        params.set("user_id", user.id);
      }

      const headers: HeadersInit = {};
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/token-limits-status?${params}`,
        { cache: "no-store", headers, signal: ctrl.signal }
      );

      setCacheStatus(res.headers.get("x-cache") ?? "");
      const newEtag = res.headers.get("etag");
      if (newEtag) etagRef.current = newEtag;

      if (res.status === 304) {
        setLastSync(new Date());
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as LimitsResponse;
      // Khi đổi target (wallet/user) cần render ngay → bỏ qua threshold nếu user_status đổi user
      const targetChanged =
        dataRef.current?.user_status?.user_id !== json.user_status?.user_id;
      if (targetChanged || isSignificantChange(dataRef.current, json)) {
        dataRef.current = json;
        setData(json);
      } else {
        dataRef.current = json;
      }
      setLastSync(new Date());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error ? e.message : t("tokErrFallback"));
    } finally {
      if (inFlightRef.current === ctrl) inFlightRef.current = null;
      setLoading(false);
    }
  }, [user?.id, debouncedWallet, isValidWallet, t]);

  // Debounce wrapper — gộp các trigger gần nhau trong 30s
  const scheduleFetch = useCallback((delay = 0) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doFetch();
    }, delay);
  }, [doFetch]);

  // Polling với pause khi tab ẩn
  useEffect(() => {
    scheduleFetch(0);

    let timer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => scheduleFetch(0), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleFetch(0);
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (inFlightRef.current) inFlightRef.current.abort();
    };
  }, [scheduleFetch]);

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" />
              Token Limits & Realtime Status
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("tokDescA")}{SIGNIFICANT_PCT_DELTA}%.
            </p>
          </div>
          <Button onClick={() => scheduleFetch(0)} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("tokRefresh")}
          </Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          {lastSync && <span>{t("tokSyncAt")}{lastSync.toLocaleTimeString(loc)}</span>}
          {cacheStatus && (
            <Badge variant="outline" className="text-xs">
              cache: {cacheStatus}
            </Badge>
          )}
          {data?.cache_ttl_seconds && (
            <span>TTL server: {data.cache_ttl_seconds}s</span>
          )}
        </div>
      </header>

      {err && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {t("tokErrPrefix")}{err}
          </CardContent>
        </Card>
      )}

      {/* Bộ chọn ví */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            {t("tokWalletTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wallet-input" className="text-xs">
              {t("tokWalletLabel")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="wallet-input"
                placeholder="0xabc...123"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
              />
              {walletInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setWalletInput("")}
                  aria-label={t("tokClear")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {debouncedWallet && !isValidWallet && (
            <p className="text-xs text-destructive">
              {t("tokInvalidWallet")}
            </p>
          )}

          {data?.wallet_lookup && (
            <div className="text-xs space-y-1 rounded-md border bg-muted/30 p-3">
              {data.wallet_lookup.resolved ? (
                <>
                  <div className="text-emerald-600 font-medium">
                    {t("tokMatched")}
                  </div>
                  <div>
                    {t("tokNameLabel")}{" "}
                    <strong>
                      {data.wallet_lookup.profile?.display_name ||
                        data.wallet_lookup.profile?.username ||
                        "—"}
                    </strong>
                  </div>
                  <div className="font-mono break-all">
                    user_id: {data.user_status?.user_id}
                  </div>
                  <div className="text-muted-foreground">
                    {t("tokSourceLabel")}{data.wallet_lookup.source}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">
                  {t("tokNotFound")}
                </div>
              )}
            </div>
          )}

          {!walletInput && user?.id && (
            <p className="text-xs text-muted-foreground">
              {t("tokEmptyHint")}
            </p>
          )}
        </CardContent>
      </Card>

      {data && (
        <>
          {/* SoftCeiling */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  {t("tokSoftTitle")}
                </span>
                <Badge variant="secondary">
                  Stage: {data.soft_ceiling.system_stage}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>
                  {t("tokMinted")}<strong>{fmtL(data.soft_ceiling.used_month)}</strong> FUN
                </span>
                <span>
                  {t("tokCeiling")}<strong>{fmtL(data.soft_ceiling.limit)}</strong> FUN
                </span>
              </div>
              <Progress value={Math.min(100, data.soft_ceiling.used_pct)} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{data.soft_ceiling.used_pct.toFixed(2)}{t("tokUsedSuffix")}</span>
                <span>
                  {t("tokRemaining")}<strong>{fmtL(data.soft_ceiling.remaining)}</strong> FUN
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Base rate: {fmtL(data.soft_ceiling.base_rate)}{t("tokBaseRateB")}
              </p>
            </CardContent>
          </Card>

          {/* Per-user */}
          {data.user_status ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {t("tokUserTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>
                    {t("tokMinted")}<strong>{fmtL(data.user_status.used_this_month)}</strong> FUN
                  </span>
                  <span>
                    {t("tokCeiling")}<strong>{fmtL(data.user_status.monthly_cap)}</strong> FUN
                  </span>
                </div>
                <Progress value={Math.min(100, data.user_status.used_pct)} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{data.user_status.used_pct.toFixed(2)}{t("tokUsedSuffix")}</span>
                  <span>
                    {t("tokRemaining")}<strong>{fmtL(data.user_status.remaining)}</strong> FUN
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  {t("tokUserNoteA")}{" "}
                  <strong>{data.user_status.request_count_month}</strong>{t("tokUserNoteB")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground text-center">
                {t("tokLoginA")}{" "}
                {fmtL(data.per_user_monthly_cap)}{t("tokLoginB")}
              </CardContent>
            </Card>
          )}

          {/* Per-action today */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                {t("tokActionTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.per_action_today.map((a) => (
                <div key={a.action} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-muted-foreground">
                      {fmtL(a.used_today)} / {fmtL(a.daily_cap)} FUN
                    </span>
                  </div>
                  <Progress value={Math.min(100, a.used_pct)} />
                  <div className="text-xs text-muted-foreground text-right">
                    {t("tokRemainA")}{fmtL(a.remaining)} FUN ({a.used_pct.toFixed(1)}{t("tokRemainC")}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {t("tokTheoryA")}{" "}
                <strong>
                  {fmtL(data.constants.theoretical_monthly_ceiling)}
                </strong>{" "}
                {t("tokTheoryB")}
              </p>
            </CardContent>
          </Card>

          {/* Tóm tắt */}
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base">{t("tokSummaryTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <strong>1. Per-user:</strong>{" "}
                {fmtL(data.constants.MAX_MINT_PER_USER_PER_MONTH)}{t("tokSum1")}
              </div>
              <div>
                <strong>2. SoftCeiling:</strong>{" "}
                {fmtL(data.soft_ceiling.limit)}{t("tokSum2")}
              </div>
              <div>
                <strong>3. On-chain:</strong>{" "}
                {fmtL(data.constants.ON_CHAIN_DAILY_CAP_PER_ACTION)}{t("tokSum3")}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
