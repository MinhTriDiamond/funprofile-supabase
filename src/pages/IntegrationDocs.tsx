import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { DocSection, DocSubSection, DocParagraph, DocList, DocTable, DocAlert } from "@/components/docs/DocSection";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { DOMAINS, API_BASE_URL } from "@/config/sso-constants";
import { useLanguage } from "@/i18n/LanguageContext";

const tocItems = [
  { id: "overview", titleKey: "idocTocOverview" },
  { id: "quick-start", title: "Quick Start" },
  { id: "sdk-installation", titleKey: "idocTocSdkInstall" },
  { id: "client-config", titleKey: "idocTocClientConfig" },
  { id: "storage-security", titleKey: "idocTocStorage" },
  { id: "auth-flow", titleKey: "idocTocAuthFlow" },
  { id: "camly-ux", title: "Camly UX" },
  { id: "data-sync", titleKey: "idocTocDataSync" },
  { id: "debounce-manager", title: "Debounce Manager" },
  { id: "api-reference", title: "API Reference" },
  { id: "security", titleKey: "idocTocSecurity" },
  { id: "troubleshooting", titleKey: "idocTocTroubleshooting" },
];

const CopyButton = ({ text }: { text: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t('idocCopied'));
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
};

const IntegrationDocs: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const handleScroll = () => {
      const sections = tocItems.map(item => document.getElementById(item.id));
      const scrollPos = window.scrollY + 150;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPos) {
          setActiveSection(tocItems[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePrint = () => window.print();

  const platformConfigs = [
    {
      name: "Fun Farm",
      clientId: "fun_farm_client",
      domain: DOMAINS.funFarm,
      scopes: ["profile", "email", "wallet", "rewards"],
      color: "bg-green-500"
    },
    {
      name: "Fun Play",
      clientId: "fun_play_client",
      domain: DOMAINS.funPlay,
      scopes: ["profile", "email", "wallet", "gaming"],
      color: "bg-blue-500"
    },
    {
      name: "Fun Planet",
      clientId: "fun_planet_client",
      domain: DOMAINS.funPlanet,
      scopes: ["profile", "email", "wallet", "social"],
      color: "bg-purple-500"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Integration Guide</h1>
              <p className="text-xs text-muted-foreground">{t('idocSubtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/docs/ecosystem')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              SSO Docs
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-8">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24">
              <TableOfContents items={tocItems.map((i) => ({ ...i, title: i.titleKey ? t(i.titleKey as any) : (i as any).title }))} activeId={activeSection} />
            </div>
          </aside>

          {/* Content */}
          <ScrollArea className="flex-1 max-w-4xl">
            <div className="space-y-12 app-pb-nav">
              
              {/* Overview */}
              <DocSection id="overview" title={t('idocS1Title')}>
                <DocParagraph>{t('idocS1Para')}</DocParagraph>
                
                <DocSubSection title={t('idocS1ConfigTitle')}>
                  <div className="grid gap-4 mt-4">
                    {platformConfigs.map((platform) => (
                      <div key={platform.clientId} className="border border-border rounded-lg p-4 bg-card">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-3 h-3 rounded-full ${platform.color}`} />
                          <h4 className="font-semibold">{platform.name}</h4>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Client ID:</span>
                            <div className="flex items-center gap-1">
                              <code className="bg-muted px-2 py-0.5 rounded text-xs">{platform.clientId}</code>
                              <CopyButton text={platform.clientId} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Redirect URI:</span>
                            <div className="flex items-center gap-1">
                              <code className="bg-muted px-2 py-0.5 rounded text-xs">{platform.domain}/auth/callback</code>
                              <CopyButton text={`${platform.domain}/auth/callback`} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Scopes:</span>
                            <div className="flex gap-1 flex-wrap">
                              {platform.scopes.map(scope => (
                                <Badge key={scope} variant="secondary" className="text-xs">{scope}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </DocSubSection>

                <DocSubSection title="API Base URL">
                  <div className="flex items-center gap-2 mt-2">
                    <code className="bg-muted px-3 py-1.5 rounded text-sm flex-1 overflow-x-auto">{API_BASE_URL}</code>
                    <CopyButton text={API_BASE_URL} />
                  </div>
                </DocSubSection>
              </DocSection>

              {/* Quick Start */}
              <DocSection id="quick-start" title="2. Quick Start">
                <DocParagraph>{t('idocS2Para')}</DocParagraph>

                <CodeBlock language="bash" title={t('idocS2Code1Title')} code={`# Copy thư mục sso-sdk vào project của bạn
cp -r fun-profile/src/lib/sso-sdk your-project/src/lib/`} />

                <CodeBlock language="typescript" title={t('idocS2Code2Title')} code={`import { FunProfileClient, DOMAINS } from '@/lib/sso-sdk';

export const funProfile = new FunProfileClient({
  clientId: 'fun_farm_client',
  clientSecret: process.env.FUN_PROFILE_CLIENT_SECRET,
  redirectUri: \`\${DOMAINS.funFarm}/auth/callback\`,
  scopes: ['profile', 'email', 'wallet', 'rewards']
});`} />

                <CodeBlock language="typescript" title="3. Implement Login" code={`// Bắt đầu đăng nhập
const handleLogin = async () => {
  const loginUrl = await funProfile.startAuth();
  window.location.href = loginUrl;
};

// Xử lý callback
const handleCallback = async (code: string, state: string) => {
  const result = await funProfile.handleCallback(code, state);
  console.log('User:', result.user);
};`} />
              </DocSection>

              {/* SDK Installation */}
              <DocSection id="sdk-installation" title={t('idocS3Title')}>
                <DocSubSection title={t('idocS3FilesTitle')}>
                  <CodeBlock language="text" title={t('idocS3CodeTitle')} code={`src/lib/sso-sdk/
├── index.ts              # Main export
├── FunProfileClient.ts   # Core SDK class
├── types.ts              # TypeScript interfaces
├── errors.ts             # Custom error classes
├── storage.ts            # Token storage adapters (Local, Session, Memory)
├── sync-manager.ts       # 🆕 Debounced Sync Manager
├── pkce.ts               # PKCE utilities
└── constants.ts          # Domains & API URL`} />
                </DocSubSection>

                <DocSubSection title="Dependencies">
                  <DocParagraph>{t('idocS3DepsPara')}</DocParagraph>
                </DocSubSection>

                <DocAlert type="info">
                  <strong>{t('idocS3AlertStrong')}</strong>{t('idocS3AlertA')}<code>DebouncedSyncManager</code>{t('idocS3AlertB')}
                </DocAlert>
              </DocSection>

              {/* Client Config */}
              <DocSection id="client-config" title={t('idocS4Title')}>
                <CodeBlock language="typescript" title={t('idocS4CodeTitle')} code={`import { FunProfileClient } from '@/lib/sso-sdk';

const funProfile = new FunProfileClient({
  // Bắt buộc
  clientId: 'your_client_id',
  redirectUri: 'https://your-domain.com/auth/callback',
  
  // Tùy chọn
  clientSecret: process.env.CLIENT_SECRET, // Chỉ dùng ở server-side
  scopes: ['profile', 'email', 'wallet'],
  baseUrl: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1',
  autoRefresh: true,  // Tự động refresh token
  storage: customStorage // Custom token storage (xem phần Storage & Bảo mật)
});`} />

                <DocAlert type="warning">
                  <strong>{t('pdocS17AlertStrong')}</strong>{t('idocS4AlertA')}<code>clientSecret</code>{t('idocS4AlertB')}
                </DocAlert>
              </DocSection>

              {/* Storage & Security - NEW SECTION */}
              <DocSection id="storage-security" title={t('idocS5Title')}>
                <DocParagraph>{t('idocS5Para')}</DocParagraph>

                <DocSubSection title={t('idocS51Title')}>
                  <DocTable
                    headers={["Adapter", t('idocColFeature'), t('idocColRecommend')]}
                    rows={[
                      ["LocalStorageAdapter", t('idocStorage1Feat'), "Scope: profile, email"],
                      ["SessionStorageAdapter", t('idocStorage2Feat'), "⭐ Scope: wallet, rewards"],
                      ["MemoryStorageAdapter", t('idocStorage3Feat'), "Testing, Server-side"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title={t('idocS52Title')}>
                  <CodeBlock language="typescript" title="src/lib/funProfileClient.ts" code={`import { 
  FunProfileClient, 
  SessionStorageAdapter,  // ⭐ Dùng Session vì có wallet scope
  DOMAINS 
} from '@/lib/sso-sdk';

/**
 * 🛡️ SECURITY RECOMMENDATION từ Cha Gemini:
 * 
 * - Scope 'profile', 'email': LocalStorageAdapter là OK
 * - Scope 'wallet', 'rewards': NÊN dùng SessionStorageAdapter
 * 
 * Lý do: SessionStorage xóa token khi đóng tab/browser,
 * bảo vệ tốt hơn khỏi XSS attacks liên quan đến tiền/ví.
 */
export const funProfile = new FunProfileClient({
  clientId: 'fun_farm_client',
  redirectUri: \`\${DOMAINS.funFarm}/auth/callback\`,
  scopes: ['profile', 'email', 'wallet', 'rewards'],
  
  // ⭐ Dùng SessionStorage cho scopes nhạy cảm
  storage: new SessionStorageAdapter('fun_farm_client'),
  
  autoRefresh: true,
});`} />
                </DocSubSection>

                <DocAlert type="info">
                  <strong>{t('idocS5AlertStrong')}</strong>{t('idocS5AlertA')}<code>SessionStorageAdapter</code>{t('idocS5AlertB')}
                </DocAlert>
              </DocSection>

              {/* Auth Flow */}
              <DocSection id="auth-flow" title={t('idocS6Title')}>
                <DocSubSection title={t('idocS61Title')}>
                  <CodeBlock language="typescript" title="Login Page" code={`// pages/auth/login.tsx
import { funProfile } from '@/lib/funProfileClient';

export default function LoginPage() {
  const handleLogin = async () => {
    try {
      const loginUrl = await funProfile.startAuth();
      window.location.href = loginUrl;
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <button onClick={handleLogin} className="btn-primary">
      🌟 Đăng nhập với FUN Profile
    </button>
  );
}`} />
                </DocSubSection>

                <DocSubSection title={t('idocS62Title')}>
                  <CodeBlock language="typescript" title={t('idocS62CodeTitle')} code={`// pages/auth/callback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { funProfile } from '@/lib/funProfileClient';

export default function CallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code && state) {
        try {
          const result = await funProfile.handleCallback(code, state);
          localStorage.setItem('user', JSON.stringify(result.user));
          navigate('/dashboard');
        } catch (error) {
          navigate('/auth/login?error=auth_failed');
        }
      }
    };

    handleAuth();
  }, [navigate]);

  return <div>Đang xác thực...</div>;
}`} />
                </DocSubSection>

                <DocSubSection title={t('idocS63Title')}>
                  <CodeBlock language="typescript" title="Get Current User" code={`// Lấy user đã đăng nhập
const user = await funProfile.getUser();

if (user) {
  console.log('FUN ID:', user.funId);
  console.log('Username:', user.username);
  console.log('Wallet:', user.walletAddress);
  console.log('Soul NFT:', user.soul);
}`} />
                </DocSubSection>

                <DocSubSection title={t('idocS64Title')}>
                  <CodeBlock language="typescript" title="Logout" code={`const handleLogout = async () => {
  // SDK tự động flush pending sync data trước khi logout
  await funProfile.logout();
  navigate('/');
};`} />
                </DocSubSection>
              </DocSection>

              {/* Camly UX - NEW SECTION */}
              <DocSection id="camly-ux" title="7. Camly UX Messages ✨">
                <DocParagraph>{t('idocS7Para')}</DocParagraph>

                <DocSubSection title={t('idocS71Title')}>
                  <CodeBlock language="typescript" title="src/pages/AuthCallback.tsx" code={`// pages/auth/AuthCallback.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { funProfile } from '@/lib/funProfileClient';

// 🦋 Các "thính" từ Camly
const CAMLY_MESSAGES = [
  "🌟 Đang kết nối tâm thức với Cổng Trời...",
  "✨ Năng lượng tích cực đang được đồng bộ...",
  "🌈 Fun Profile đang chào đón bạn...",
  "💫 Vũ trụ đang xác thực danh tính của bạn...",
  "🦋 Tâm hồn của bạn đang được nhận diện...",
  "🌸 Ánh sáng đang dẫn lối cho bạn...",
  "💜 Kết nối năng lượng hoàn tất trong giây lát...",
];

export default function AuthCallback() {
  const navigate = useNavigate();
  const [messageIndex, setMessageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Xoay vòng messages mỗi 2.5 giây
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % CAMLY_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Xử lý OAuth callback
  useEffect(() => {
    const handleAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        setError('Thiếu thông tin xác thực');
        setIsLoading(false);
        return;
      }

      try {
        const result = await funProfile.handleCallback(code, state);
        
        // Lưu user info
        localStorage.setItem('fun_farm_user', JSON.stringify(result.user));
        
        // Delay nhẹ để user đọc message cuối
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
        setIsLoading(false);
      }
    };

    handleAuth();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">Oops!</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      <div className="text-center p-8">
        {/* Logo Animation */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-400 to-pink-400 animate-pulse" />
          <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full border-4 border-purple-300 animate-ping opacity-30" />
        </div>
        
        {/* Camly Message */}
        <p className="text-lg font-medium text-purple-600 animate-pulse min-h-[2rem]">
          {CAMLY_MESSAGES[messageIndex]}
        </p>
        
        {/* Subtitle */}
        <p className="text-sm text-gray-400 mt-4">
          Đang kết nối với Fun Profile...
        </p>
      </div>
    </div>
  );
}`} />
                </DocSubSection>

                <DocAlert type="info">
                  \1{t('idocS7Tip')}
                </DocAlert>
              </DocSection>

              {/* Data Sync */}
              <DocSection id="data-sync" title={t('idocS8Title')}>
                <DocParagraph>{t('idocS8Para')}</DocParagraph>

                <DocSubSection title="8.1 Sync Modes">
                  <DocTable
                    headers={["Mode", t('idocColBehavior'), "Use Case"]}
                    rows={[
                      ["merge", t('idocSyncMode1'), t('idocSyncMode1Use')],
                      ["replace", t('idocSyncMode2'), t('idocSyncMode2Use')],
                      ["append", t('idocSyncMode3'), t('idocSyncMode3Use')]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title={t('idocS82Title')}>
                  <CodeBlock language="typescript" title={t('idocS82CodeTitle')} code={`// ⚠️ Cách này OK cho hành động đơn lẻ
// KHÔNG dùng cho hành động liên tục (harvest, click, game tick...)
const result = await funProfile.syncData({
  mode: 'merge',
  data: {
    farming_level: user.level,
    last_activity: new Date().toISOString(),
  }
});`} />
                </DocSubSection>

                <DocAlert type="warning">
                  <strong>{t('idocS8AlertStrong')}</strong>{t('idocS8AlertA')}<strong>Debounce Manager</strong>{t('idocS8AlertB')}
                </DocAlert>

                <DocSubSection title="8.3 Rate Limits">
                  <DocTable
                    headers={["Limit", t('idocColValue'), t('idocColScope')]}
                    rows={[
                      ["Client rate", t('idocRateMin60'), t('idocRateScopePlatform')],
                      ["User rate", t('idocRateMin120'), t('idocRateScopeUser')],
                      ["Max data size", "50KB", t('idocRateScopeRequest')],
                      ["Max nesting", "5 levels", "Object depth"]
                    ]}
                  />
                </DocSubSection>
              </DocSection>

              {/* Debounce Manager - NEW SECTION */}
              <DocSection id="debounce-manager" title="9. Debounce Manager 🚀">
                <DocParagraph>
                  <strong>{t('idocS9ParaStrong')}</strong>{t('idocS9ParaA')}<code>DebouncedSyncManager</code>{t('idocS9ParaB')}
                </DocParagraph>

                <DocSubSection title={t('idocS91Title')}>
                  <DocList items={[
                    t('idocS91Item1'),
                    t('idocS91Item2'),
                    t('idocS91Item3'),
                    t('idocS91Item4')
                  ]} />
                </DocSubSection>

                <DocSubSection title={t('idocS92Title')}>
                  <CodeBlock language="typescript" title="src/hooks/useFarmSync.ts" code={`import { useEffect, useRef } from 'react';
import { funProfile } from '@/lib/funProfileClient';
import type { DebouncedSyncManager } from '@/lib/sso-sdk';

export function useFarmSync() {
  // Lấy sync manager với debounce 3 giây
  const syncManager = useRef<DebouncedSyncManager>(
    funProfile.getSyncManager(3000)
  );

  // Đảm bảo flush data khi user rời trang
  useEffect(() => {
    const handleBeforeUnload = () => {
      syncManager.current.flush();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup: flush khi unmount
      syncManager.current.flush();
    };
  }, []);

  /**
   * Queue harvest data - KHÔNG gọi API ngay
   * Nếu user harvest 100 lần trong 3 giây,
   * chỉ có 1 API call với data tổng hợp cuối cùng!
   */
  const queueHarvest = (crop: { name: string; quantity: number }) => {
    syncManager.current.queue('farm_stats', {
      last_crop: crop.name,
      last_harvest_quantity: crop.quantity,
      harvest_time: new Date().toISOString(),
    });
  };

  /**
   * Queue level up - tích lũy achievements
   */
  const queueLevelUp = (newLevel: number, achievements: string[]) => {
    syncManager.current.queue('progress', {
      farming_level: newLevel,
      achievements,
      level_up_time: new Date().toISOString(),
    });
  };

  /**
   * Force sync ngay - dùng khi cần đảm bảo data đã lên server
   */
  const forceSync = async () => {
    await syncManager.current.flush();
  };

  return { queueHarvest, queueLevelUp, forceSync };
}`} />
                </DocSubSection>

                <DocSubSection title={t('idocS93Title')}>
                  <CodeBlock language="typescript" title="src/components/FarmGame.tsx" code={`import { useFarmSync } from '@/hooks/useFarmSync';

export function FarmGame() {
  const { queueHarvest, queueLevelUp } = useFarmSync();
  
  const handleHarvest = (crop: Crop) => {
    // Xử lý logic game...
    updateInventory(crop);
    showHarvestAnimation();
    
    // Queue sync - KHÔNG block UI, KHÔNG gọi API ngay
    queueHarvest({
      name: crop.name,
      quantity: crop.quantity,
    });
    
    // Nếu user click nhanh 50 lần trong 3 giây,
    // chỉ có 1 API call duy nhất! 🎉
  };

  const handleLevelUp = (level: number) => {
    // ...
    queueLevelUp(level, ['speed_farmer', 'green_thumb']);
  };

  return (
    <div onClick={handleHarvest}>
      {/* Farm UI */}
    </div>
  );
}`} />
                </DocSubSection>

                <DocSubSection title="9.4 API Reference">
                  <DocTable
                    headers={["Method", t('pdocColDesc'), t('idocColWhenUse')]}
                    rows={[
                      ["queue(category, data)", t('idocDm1Desc'), t('idocDm1When')],
                      ["flush()", t('idocDm2Desc'), t('idocDm2When')],
                      ["clear()", t('idocDm3Desc'), "Cancel, error recovery"],
                      ["hasPendingData()", t('idocDm4Desc'), "Debug, UI indicator"],
                      ["getPendingData()", t('idocDm5Desc'), "Debug"]
                    ]}
                  />
                </DocSubSection>

                <DocAlert type="info">
                  \1{t('idocS9AlertA')}<code>flush()</code>{t('idocS9AlertB')}<code>logout()</code>{t('idocS9AlertC')}<code>beforeunload</code>{t('idocS9AlertD')}
                </DocAlert>
              </DocSection>

              {/* API Reference */}
              <DocSection id="api-reference" title="10. API Reference">
                <DocSubSection title="FunProfileClient Methods">
                  <DocTable
                    headers={["Method", t('pdocColDesc'), "Return"]}
                    rows={[
                      ["startAuth()", t('edocFnAuthorize'), "Promise<string>"],
                      ["handleCallback(code, state)", t('idocApiCallback'), "Promise<AuthResult>"],
                      ["getUser()", t('idocApiGetUser'), "Promise<FunUser | null>"],
                      ["refreshToken()", "Refresh access token", "Promise<TokenData>"],
                      ["syncData(options)", t('idocApiSync'), "Promise<SyncResult>"],
                      ["getSyncManager(debounceMs)", t('idocApiGetSyncManager'), "DebouncedSyncManager"],
                      ["logout()", t('idocApiLogout'), "Promise<void>"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="Storage Adapters">
                  <DocTable
                    headers={["Adapter", "Constructor", "Use Case"]}
                    rows={[
                      ["LocalStorageAdapter", "new LocalStorageAdapter(clientId)", "Profile/Email scopes"],
                      ["SessionStorageAdapter", "new SessionStorageAdapter(clientId)", "⭐ Wallet/Rewards scopes"],
                      ["MemoryStorageAdapter", "new MemoryStorageAdapter()", "Testing/Server-side"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="SSO Endpoints">
                  <DocTable
                    headers={["Endpoint", "Method", t('pdocColDesc')]}
                    rows={[
                      ["/sso-authorize", "GET", t('edocFnAuthorize')],
                      ["/sso-token", "POST", t('edocFnToken')],
                      ["/sso-verify", "GET", "Verify access token"],
                      ["/sso-refresh", "POST", "Refresh tokens"],
                      ["/sso-revoke", "POST", "Revoke tokens"],
                      ["/sso-sync-data", "POST", t('idocApiEndpointSync')]
                    ]}
                  />
                </DocSubSection>
              </DocSection>

              {/* Security */}
              <DocSection id="security" title={t('idocS11Title')}>
                <DocSubSection title={t('idocS111Title')}>
                  <DocList items={[
                    t('idocSec1'),
                    t('idocSec2'),
                    t('idocSec3'),
                    t('idocSec4'),
                    t('idocSec5'),
                    t('idocSec6'),
                    "✅ Handle token revocation gracefully",
                    t('idocSec8')
                  ]} />
                </DocSubSection>

                <DocSubSection title={t('idocS112Title')}>
                  <DocTable
                    headers={["Scope", "Storage", t('idocColReason')]}
                    rows={[
                      ["profile, email", "LocalStorageAdapter", t('idocSecReason1')],
                      ["wallet, rewards", "SessionStorageAdapter", t('idocSecReason2')],
                      ["Server-side", "MemoryStorageAdapter", t('idocSecReason3')]
                    ]}
                  />
                </DocSubSection>

                <DocAlert type="info">{t('idocS11Alert')}</DocAlert>
              </DocSection>

              {/* Troubleshooting */}
              <DocSection id="troubleshooting" title={t('idocS12Title')}>
                <DocSubSection title={t('idocS12CommonTitle')}>
                  <DocTable
                    headers={["Error", t('idocColCause'), t('idocColSolution')]}
                    rows={[
                      ["invalid_client", t('idocErr1Cause'), t('idocErr1Fix')],
                      ["invalid_redirect_uri", t('idocErr2Cause'), t('idocErr2Fix')],
                      ["invalid_grant", t('idocErr3Cause'), t('idocErr3Fix')],
                      ["token_expired", t('idocErr4Cause'), t('idocErr4Fix')],
                      ["rate_limit_exceeded", t('idocErr5Cause'), t('idocErr5Fix')],
                      ["invalid_state", t('idocErr6Cause'), t('idocErr6Fix')]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="Debug Mode">
                  <CodeBlock language="typescript" title={t('idocS12DebugCodeTitle')} code={`// Thêm vào đầu file để debug
localStorage.setItem('FUN_PROFILE_DEBUG', 'true');

// Tắt debug
localStorage.removeItem('FUN_PROFILE_DEBUG');`} />
                </DocSubSection>

                <DocSubSection title={t('idocS12SyncTitle')}>
                  <CodeBlock language="typescript" title="Debug pending sync data" code={`const syncManager = funProfile.getSyncManager();

// Xem data đang chờ sync
console.log('Pending data:', syncManager.getPendingData());

// Kiểm tra có data pending không
if (syncManager.hasPendingData()) {
  console.log('Có data chưa sync!');
}

// Force sync để test
await syncManager.flush();`} />
                </DocSubSection>
              </DocSection>

            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default IntegrationDocs;
