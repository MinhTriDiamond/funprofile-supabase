import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLanguage } from '@/i18n/LanguageContext';
import {
  applyHardUpdate,
  getLazyImportLabel,
  recoverFromChunkLoadError,
  shouldAutoRecoverFromUpdateError,
} from "@/lib/appUpdateRecovery";

interface Props {
  children: ReactNode;
}

interface InnerProps extends Props {
  t: (key: string) => string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
  lazyLabel: string | null;
  recoveryStarted: boolean;
  autoRetryInSec: number | null;
}

const AUTO_RETRY_SECONDS = 5;

class ErrorBoundaryInner extends Component<InnerProps, State> {
  private retryTimer: number | null = null;

  constructor(props: InnerProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
      lazyLabel: null,
      recoveryStarted: false,
      autoRetryInSec: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const isChunkError = shouldAutoRecoverFromUpdateError(error);
    return {
      hasError: true,
      error,
      isChunkError,
      lazyLabel: getLazyImportLabel(error),
      recoveryStarted: false,
      autoRetryInSec: isChunkError ? AUTO_RETRY_SECONDS : null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    if (recoverFromChunkLoadError(error)) {
      this.setState({ recoveryStarted: true });
      this.stopAutoRetry();
    } else if (this.state.isChunkError || shouldAutoRecoverFromUpdateError(error)) {
      // Recovery loop đã chặn (>= 2 lần reload trong 60s). Tự đếm ngược rồi thử lại lần cuối.
      this.startAutoRetry();
    }
  }

  componentWillUnmount() {
    this.stopAutoRetry();
  }

  private startAutoRetry = () => {
    this.stopAutoRetry();
    this.retryTimer = window.setInterval(() => {
      this.setState((prev) => {
        if (prev.autoRetryInSec === null) return prev;
        const next = prev.autoRetryInSec - 1;
        if (next <= 0) {
          this.stopAutoRetry();
          window.setTimeout(() => this.handleReload(), 0);
          return { ...prev, autoRetryInSec: 0 };
        }
        return { ...prev, autoRetryInSec: next };
      });
    }, 1000);
  };

  private stopAutoRetry = () => {
    if (this.retryTimer !== null) {
      window.clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  };

  handleReload = () => {
    this.stopAutoRetry();
    applyHardUpdate({ resetRecovery: true, fallbackToHome: true, rescue: true, reason: 'unknown' });
  };

  handleOpenFreshHome = () => {
    this.stopAutoRetry();
    applyHardUpdate({ resetRecovery: true, fallbackToHome: true, rescue: true, reason: 'unknown' });
  };

  handleOpenWallet = () => {
    this.stopAutoRetry();
    try {
      sessionStorage.removeItem('fun_profile_chunk_recovery');
      localStorage.removeItem('fun_profile_chunk_recovery');
    } catch {
      // best effort
    }
    const url = new URL('/wallet', window.location.origin);
    url.searchParams.set('__fun_update', String(Date.now()));
    window.location.replace(url.toString());
  };


  render() {
    if (this.state.hasError) {
      const { isChunkError, recoveryStarted, autoRetryInSec } = this.state;
      const { t } = this.props;
      const showCountdown =
        isChunkError && !recoveryStarted && autoRetryInSec !== null && autoRetryInSec > 0;
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="text-6xl">!</div>
            <h1 className="text-2xl font-bold text-foreground">
              {isChunkError ? t('erbUpdateTitle') : t('errorOccurred')}
            </h1>
            <p className="text-muted-foreground">
              {isChunkError
                ? recoveryStarted
                  ? t('erbUpdating')
                  : t('erbStaleDesc')
                : t('erbGenericDesc')}
            </p>
            {isChunkError && !recoveryStarted && (
              <p className="text-xs text-muted-foreground">
                {t('erbHardRefreshHint')}
              </p>
            )}
            {showCountdown && (
              <p className="text-xs text-muted-foreground">
                {t('erbAutoRetryPrefix')}{autoRetryInSec}{t('erbAutoRetrySuffix')}
              </p>
            )}
            {this.state.lazyLabel && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                {t('erbModuleLabel')}<span className="font-semibold">{this.state.lazyLabel}</span>
              </div>
            )}
            {this.state.error && !isChunkError && (
              <pre className="text-left text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 text-destructive">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                {isChunkError ? t('chrUpdateNow') : t('reloadPage')}
              </button>
              {isChunkError && (
                <button
                  onClick={this.handleOpenFreshHome}
                  className="inline-flex items-center justify-center px-6 py-3 border border-primary text-primary font-semibold rounded-lg hover:bg-primary/10 transition-colors"
                >
                  {t('erbOpenFreshHome')}
                </button>
              )}
              {isChunkError && (
                <button
                  onClick={this.handleOpenWallet}
                  className="inline-flex items-center justify-center px-6 py-3 border border-emerald-600 text-emerald-700 font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  {t('erbOpenWallet')}
                </button>
              )}
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: Props) {
  const { t } = useLanguage();
  return <ErrorBoundaryInner {...props} t={t} />;
}
