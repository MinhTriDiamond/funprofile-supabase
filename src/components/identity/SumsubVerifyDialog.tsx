import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { identityVerificationService } from "@/services/identity/identityVerificationService";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

declare global {
  interface Window {
    snsWebSdk?: any;
  }
}

const SDK_SRC = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";

async function ensureSdk(): Promise<any> {
  if (window.snsWebSdk) return window.snsWebSdk;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SDK_LOAD_FAILED")));
      if ((existing as any).dataset.loaded === "1") resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => {
      (s as any).dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("SDK_LOAD_FAILED"));
    document.head.appendChild(s);
  });
  if (!window.snsWebSdk) throw new Error("SDK_NOT_AVAILABLE");
  return window.snsWebSdk;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SumsubVerifyDialog({ open, onOpenChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let sdkInstance: any = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Ensure applicant exists first
        await identityVerificationService.createApplicant();

        // CRITICAL: Sumsub WebSDK requires a valid initial token in .init().
        // Passing empty string causes "Access token required". Fetch BEFORE init.
        const tokenRes: any = await identityVerificationService.getAccessToken();
        console.log("[KYC] get-access-token response:", tokenRes);
        const initialToken: string | undefined =
          tokenRes?.token || tokenRes?.accessToken || tokenRes?.data?.token;
        console.log("[KYC] accessToken exists:", !!initialToken);
        if (!initialToken) {
          throw new Error("Không nhận được access token từ máy chủ KYC");
        }

        const snsWebSdk = await ensureSdk();
        if (cancelled) return;
        const sdk = snsWebSdk
          .init(initialToken, async () => {
            const res: any = await identityVerificationService.getAccessToken();
            const t: string | undefined =
              res?.token || res?.accessToken || res?.data?.token;
            if (!t) throw new Error("ACCESS_TOKEN_REFRESH_FAILED");
            return t;
          })
          .withConf({ lang: "vi" })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .on("idCheck.onApplicantSubmitted", () => {
            toast.success("Đã nộp hồ sơ KYC", { description: "Hệ thống đang xem xét." });
            qc.invalidateQueries({ queryKey: ["identity-verification"] });
          })
          .on("idCheck.onError", (e: unknown) => {
            console.error("[sumsub-websdk] error", e);
          })
          .build();
        if (cancelled) return;
        sdkInstance = sdk;
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          sdk.launch(containerRef.current);
        }
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[KYC] init error", e);
        setError(e?.message || "Không khởi tạo được KYC");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        sdkInstance?.destroy?.();
      } catch {}
    };
  }, [open, qc, retryKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Xác minh danh tính (KYC)</DialogTitle>
          <DialogDescription>
            FUN Profile chỉ lưu kết quả xác minh — không lưu ảnh giấy tờ hay selfie của bạn.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Đang chuẩn bị phiên xác minh...
          </div>
        )}
        {error && (
          <div className="py-6 text-center space-y-3">
            <div className="text-sm text-destructive">{error}</div>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="text-sm px-4 py-2 rounded-md border border-border hover:bg-accent transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}
        <div ref={containerRef} className="min-h-[400px]" />
      </DialogContent>
    </Dialog>
  );
}
