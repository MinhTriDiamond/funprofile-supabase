import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from '@/i18n/LanguageContext';
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

const LIVE_ACTIVE_CHANGE_EVENT = "funprofile:live-active-change";
const UPDATE_TOAST_ID = "funprofile-app-update";

function isLiveActive() {
  return Boolean((window as Window & { __LIVE_ACTIVE__?: boolean }).__LIVE_ACTIVE__);
}

export function UpdateNotification() {
  const { t } = useLanguage();
  const { updateAvailable, applyUpdate } = useVersionCheck();
  const [deferredUpdate, setDeferredUpdate] = useState(false);
  const hasShownRef = useRef(false);

  const showUpdateToast = useCallback(() => {
    if (hasShownRef.current) return;
    hasShownRef.current = true;
    setDeferredUpdate(false);

    toast(t('chrUpdateAvailable'), {
      id: UPDATE_TOAST_ID,
      description: t('chrUpdateDesc'),
      duration: Infinity,
      icon: <RefreshCw className="h-4 w-4 text-primary" />,
      action: {
        label: t('chrUpdateNow'),
        onClick: applyUpdate,
      },
      cancel: {
        label: t('close'),
        onClick: () => toast.dismiss(UPDATE_TOAST_ID),
      },
      className: "max-w-sm rounded-2xl border-primary/20 shadow-xl",
    });
  }, [applyUpdate, t]);

  // Show toast when update detected, but never cover an active live session.
  useEffect(() => {
    if (!updateAvailable) return;
    if (isLiveActive()) {
      setDeferredUpdate(true);
      toast.dismiss(UPDATE_TOAST_ID);
      return;
    }
    showUpdateToast();
  }, [updateAvailable, showUpdateToast]);

  useEffect(() => {
    const handleLiveActiveChange = () => {
      if (isLiveActive()) {
        if (updateAvailable) {
          setDeferredUpdate(true);
          hasShownRef.current = false;
        }
        toast.dismiss(UPDATE_TOAST_ID);
        return;
      }

      if (updateAvailable && (deferredUpdate || !hasShownRef.current)) {
        showUpdateToast();
      }
    };

    window.addEventListener(LIVE_ACTIVE_CHANGE_EVENT, handleLiveActiveChange);
    return () => {
      window.removeEventListener(LIVE_ACTIVE_CHANGE_EVENT, handleLiveActiveChange);
    };
  }, [deferredUpdate, showUpdateToast, updateAvailable]);

  return null;
}
