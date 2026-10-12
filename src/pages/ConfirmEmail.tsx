import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

type State = "loading" | "success" | "error";

export default function ConfirmEmail() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage(t("cemMissingToken"));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("auth-signup-confirm", { body: { token } });
        if (cancelled) return;
        if (error || (data as any)?.error) {
          setState("error");
          setMessage((data as any)?.error || error?.message || t("cemFailed"));
          return;
        }
        setEmail((data as any)?.email || null);
        setState("success");
      } catch (err: any) {
        if (cancelled) return;
        setState("error");
        setMessage(err?.message || t("cemSystemError"));
      }
    })();
    return () => { cancelled = true; };
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>{t("cemTitle")}</CardTitle>
          <CardDescription>
            {state === "loading" && t("cemLoading")}
            {state === "success" && t("cemSuccess")}
            {state === "error" && t("cemLinkBad")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && (
            <div className="flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          )}
          {state === "success" && (
            <div className="text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-sm text-muted-foreground">{email ? `${t("cemEmailConfirmedA")}${email}${t("cemEmailConfirmedB")}` : t("cemEmailConfirmedPlain")}{t("cemLoginNow")}</p>
              <Button className="w-full" onClick={() => navigate("/auth")}>{t("cemLoginBtn")}</Button>
            </div>
          )}
          {state === "error" && (
            <div className="text-center space-y-3">
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button asChild variant="outline" className="w-full"><Link to="/auth">{t("cemBackToLogin")}</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
