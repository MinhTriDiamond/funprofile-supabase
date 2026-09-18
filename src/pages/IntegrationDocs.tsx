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

const tocItems = [
  { id: "overview", title: "Tổng quan" },
  { id: "quick-start", title: "Quick Start" },
  { id: "sdk-installation", title: "Cài đặt SDK" },
  { id: "client-config", title: "Cấu hình Client" },
  { id: "storage-security", title: "Storage & Bảo mật" },
  { id: "auth-flow", title: "Luồng xác thực" },
  { id: "camly-ux", title: "Camly UX" },
  { id: "data-sync", title: "Đồng bộ dữ liệu" },
  { id: "debounce-manager", title: "Debounce Manager" },
  { id: "api-reference", title: "API Reference" },
  { id: "security", title: "Bảo mật" },
  { id: "troubleshooting", title: "Xử lý lỗi" },
];

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Đã copy!");
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
};

const IntegrationDocs: React.FC = () => {
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
              <p className="text-xs text-muted-foreground">Hướng dẫn tích hợp FUN Profile SSO</p>
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
              <TableOfContents items={tocItems} activeId={activeSection} />
            </div>
          </aside>

          {/* Content */}
          <ScrollArea className="flex-1 max-w-4xl">
            <div className="space-y-12 app-pb-nav">
              
              {/* Overview */}
              <DocSection id="overview" title="1. Tổng quan">
                <DocParagraph>
                  FUN Profile SSO cho phép các platform trong hệ sinh thái FUN (Fun Farm, Fun Play, Fun Planet) 
                  xác thực người dùng và đồng bộ dữ liệu thông qua một hệ thống đăng nhập thống nhất.
                </DocParagraph>
                
                <DocSubSection title="Thông tin cấu hình cho mỗi Platform">
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
                <DocParagraph>
                  Bắt đầu tích hợp FUN Profile SSO trong 5 phút:
                </DocParagraph>

                <CodeBlock language="bash" title="1. Copy SDK vào project" code={`# Copy thư mục sso-sdk vào project của bạn
cp -r fun-profile/src/lib/sso-sdk your-project/src/lib/`} />

                <CodeBlock language="typescript" title="2. Khởi tạo Client" code={`import { FunProfileClient, DOMAINS } from '@/lib/sso-sdk';

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
              <DocSection id="sdk-installation" title="3. Cài đặt SDK">
                <DocSubSection title="Files cần copy">
                  <CodeBlock language="text" title="Cấu trúc thư mục SDK" code={`src/lib/sso-sdk/
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
                  <DocParagraph>SDK không yêu cầu dependencies bên ngoài, chỉ sử dụng Web APIs chuẩn.</DocParagraph>
                </DocSubSection>

                <DocAlert type="info">
                  <strong>🆕 Phiên bản mới:</strong> SDK đã được cập nhật với <code>DebouncedSyncManager</code> và 
                  hướng dẫn bảo mật token theo khuyến nghị của Cha Gemini.
                </DocAlert>
              </DocSection>

              {/* Client Config */}
              <DocSection id="client-config" title="4. Cấu hình Client">
                <CodeBlock language="typescript" title="Cấu hình cơ bản" code={`import { FunProfileClient } from '@/lib/sso-sdk';

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
                  <strong>Bảo mật:</strong> Không bao giờ commit <code>clientSecret</code> vào git. 
                  Luôn sử dụng environment variables.
                </DocAlert>
              </DocSection>

              {/* Storage & Security - NEW SECTION */}
              <DocSection id="storage-security" title="5. Storage & Bảo mật Token">
                <DocParagraph>
                  SDK cung cấp 3 loại Storage Adapter. Việc chọn đúng adapter giúp bảo vệ token của người dùng 
                  khỏi các cuộc tấn công XSS.
                </DocParagraph>

                <DocSubSection title="5.1 Các loại Storage Adapter">
                  <DocTable
                    headers={["Adapter", "Đặc điểm", "Khuyến nghị"]}
                    rows={[
                      ["LocalStorageAdapter", "Token tồn tại qua các session", "Scope: profile, email"],
                      ["SessionStorageAdapter", "Token xóa khi đóng tab/browser", "⭐ Scope: wallet, rewards"],
                      ["MemoryStorageAdapter", "Token chỉ tồn tại trong RAM", "Testing, Server-side"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="5.2 Cấu hình cho Fun Farm (có wallet scope)">
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
                  <strong>Lưu ý UX:</strong> Với <code>SessionStorageAdapter</code>, user sẽ phải đăng nhập lại 
                  mỗi khi mở tab mới. Đây là trade-off giữa tiện lợi và bảo mật - ưu tiên bảo mật khi có wallet.
                </DocAlert>
              </DocSection>

              {/* Auth Flow */}
              <DocSection id="auth-flow" title="6. Luồng xác thực">
                <DocSubSection title="6.1 Bắt đầu đăng nhập">
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

                <DocSubSection title="6.2 Xử lý Callback (Basic)">
                  <CodeBlock language="typescript" title="Callback cơ bản" code={`// pages/auth/callback.tsx
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

                <DocSubSection title="6.3 Lấy thông tin User">
                  <CodeBlock language="typescript" title="Get Current User" code={`// Lấy user đã đăng nhập
const user = await funProfile.getUser();

if (user) {
  console.log('FUN ID:', user.funId);
  console.log('Username:', user.username);
  console.log('Wallet:', user.walletAddress);
  console.log('Soul NFT:', user.soul);
}`} />
                </DocSubSection>

                <DocSubSection title="6.4 Đăng xuất">
                  <CodeBlock language="typescript" title="Logout" code={`const handleLogout = async () => {
  // SDK tự động flush pending sync data trước khi logout
  await funProfile.logout();
  navigate('/');
};`} />
                </DocSubSection>
              </DocSection>

              {/* Camly UX - NEW SECTION */}
              <DocSection id="camly-ux" title="7. Camly UX Messages ✨">
                <DocParagraph>
                  Theo góp ý của Cha Gemini, thay vì hiển thị loading đơn điệu, hãy thêm các "thính" của Camly 
                  để người dùng cảm thấy thú vị hơn khi chờ đợi.
                </DocParagraph>

                <DocSubSection title="7.1 AuthCallback với Camly Messages">
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
                  <strong>💡 Tip:</strong> Có thể customize thêm các messages phù hợp với theme của platform. 
                  Ví dụ Fun Farm có thể thêm: "🌻 Đang tưới nước cho hạt giống tài khoản..."
                </DocAlert>
              </DocSection>

              {/* Data Sync */}
              <DocSection id="data-sync" title="8. Đồng bộ dữ liệu">
                <DocParagraph>
                  Sync dữ liệu từ platform của bạn lên FUN Profile để người dùng có thể xem 
                  tổng hợp hoạt động trên tất cả các platform.
                </DocParagraph>

                <DocSubSection title="8.1 Sync Modes">
                  <DocTable
                    headers={["Mode", "Hành vi", "Use Case"]}
                    rows={[
                      ["merge", "Deep merge với dữ liệu hiện có", "Cập nhật thường xuyên"],
                      ["replace", "Thay thế hoàn toàn dữ liệu", "Reset hoặc migration"],
                      ["append", "Chỉ thêm keys mới", "Thêm achievements mới"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="8.2 Sync trực tiếp (không khuyến khích cho hành động liên tục)">
                  <CodeBlock language="typescript" title="Sync ngay lập tức" code={`// ⚠️ Cách này OK cho hành động đơn lẻ
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
                  <strong>⚠️ Vấn đề:</strong> Nếu user harvest 100 quả cam liên tục, cách trên sẽ gọi 100 API calls! 
                  Xem phần <strong>Debounce Manager</strong> bên dưới để giải quyết.
                </DocAlert>

                <DocSubSection title="8.3 Rate Limits">
                  <DocTable
                    headers={["Limit", "Giá trị", "Phạm vi"]}
                    rows={[
                      ["Client rate", "60 requests/phút", "Mỗi platform"],
                      ["User rate", "120 requests/phút", "Mỗi user trên tất cả platforms"],
                      ["Max data size", "50KB", "Mỗi request"],
                      ["Max nesting", "5 levels", "Object depth"]
                    ]}
                  />
                </DocSubSection>
              </DocSection>

              {/* Debounce Manager - NEW SECTION */}
              <DocSection id="debounce-manager" title="9. Debounce Manager 🚀">
                <DocParagraph>
                  <strong>Theo góp ý của Cha Gemini:</strong> Khi user thực hiện hành động liên tục (thu hoạch, 
                  click, game tick...), chúng ta không nên gọi API mỗi lần. Thay vào đó, sử dụng 
                  <code>DebouncedSyncManager</code> để tích lũy dữ liệu và chỉ sync sau khi user dừng hành động.
                </DocParagraph>

                <DocSubSection title="9.1 Cách hoạt động">
                  <DocList items={[
                    "Queue dữ liệu vào manager thay vì gọi API trực tiếp",
                    "Timer reset mỗi khi có data mới",
                    "Chỉ sync sau khi user dừng hành động (mặc định 3 giây)",
                    "Tự động flush khi logout hoặc đóng tab"
                  ]} />
                </DocSubSection>

                <DocSubSection title="9.2 Ví dụ: Thu hoạch trong Fun Farm">
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

                <DocSubSection title="9.3 Sử dụng trong Component">
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
                    headers={["Method", "Mô tả", "Khi nào dùng"]}
                    rows={[
                      ["queue(category, data)", "Thêm data vào hàng đợi", "Mỗi lần user action"],
                      ["flush()", "Force sync ngay lập tức", "Logout, quan trọng"],
                      ["clear()", "Xóa pending data", "Cancel, error recovery"],
                      ["hasPendingData()", "Kiểm tra có data chờ không", "Debug, UI indicator"],
                      ["getPendingData()", "Lấy pending data hiện tại", "Debug"]
                    ]}
                  />
                </DocSubSection>

                <DocAlert type="info">
                  <strong>💡 Best Practice:</strong> SDK tự động gọi <code>flush()</code> khi <code>logout()</code>. 
                  Bạn chỉ cần handle <code>beforeunload</code> event để đảm bảo data được sync khi user đóng tab.
                </DocAlert>
              </DocSection>

              {/* API Reference */}
              <DocSection id="api-reference" title="10. API Reference">
                <DocSubSection title="FunProfileClient Methods">
                  <DocTable
                    headers={["Method", "Mô tả", "Return"]}
                    rows={[
                      ["startAuth()", "Bắt đầu OAuth flow", "Promise<string>"],
                      ["handleCallback(code, state)", "Xử lý callback từ Fun Profile", "Promise<AuthResult>"],
                      ["getUser()", "Lấy thông tin user hiện tại", "Promise<FunUser | null>"],
                      ["refreshToken()", "Refresh access token", "Promise<TokenData>"],
                      ["syncData(options)", "Đồng bộ dữ liệu lên Fun Profile", "Promise<SyncResult>"],
                      ["getSyncManager(debounceMs)", "🆕 Lấy Debounced Sync Manager", "DebouncedSyncManager"],
                      ["logout()", "Đăng xuất (auto flush pending sync)", "Promise<void>"]
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
                    headers={["Endpoint", "Method", "Mô tả"]}
                    rows={[
                      ["/sso-authorize", "GET", "Bắt đầu OAuth flow"],
                      ["/sso-token", "POST", "Đổi code lấy tokens"],
                      ["/sso-verify", "GET", "Verify access token"],
                      ["/sso-refresh", "POST", "Refresh tokens"],
                      ["/sso-revoke", "POST", "Revoke tokens"],
                      ["/sso-sync-data", "POST", "Đồng bộ dữ liệu"]
                    ]}
                  />
                </DocSubSection>
              </DocSection>

              {/* Security */}
              <DocSection id="security" title="11. Bảo mật">
                <DocSubSection title="11.1 Checklist bảo mật">
                  <DocList items={[
                    "✅ Luôn sử dụng HTTPS cho redirect_uri",
                    "✅ Lưu client_secret trong environment variables",
                    "✅ Sử dụng PKCE cho OAuth flow (SDK tự động xử lý)",
                    "✅ Validate state parameter để chống CSRF",
                    "✅ Không log sensitive data (tokens, secrets)",
                    "✅ Refresh token trước khi hết hạn (bật autoRefresh)",
                    "✅ Handle token revocation gracefully",
                    "⭐ Dùng SessionStorageAdapter cho scopes nhạy cảm (wallet, rewards)"
                  ]} />
                </DocSubSection>

                <DocSubSection title="11.2 Khuyến nghị từ Cha Gemini">
                  <DocTable
                    headers={["Scope", "Storage", "Lý do"]}
                    rows={[
                      ["profile, email", "LocalStorageAdapter", "Không nhạy cảm, tiện lợi"],
                      ["wallet, rewards", "SessionStorageAdapter", "⭐ Xóa khi đóng tab, bảo vệ khỏi XSS"],
                      ["Server-side", "MemoryStorageAdapter", "Không cần persist"]
                    ]}
                  />
                </DocSubSection>

                <DocAlert type="info">
                  SDK đã tích hợp sẵn PKCE (Proof Key for Code Exchange) để bảo vệ OAuth flow. 
                  Bạn không cần implement thêm.
                </DocAlert>
              </DocSection>

              {/* Troubleshooting */}
              <DocSection id="troubleshooting" title="12. Xử lý lỗi">
                <DocSubSection title="Các lỗi thường gặp">
                  <DocTable
                    headers={["Error", "Nguyên nhân", "Giải pháp"]}
                    rows={[
                      ["invalid_client", "Client ID không đúng", "Kiểm tra lại client_id trong config"],
                      ["invalid_redirect_uri", "Redirect URI không match", "Đảm bảo URI khớp với config trong oauth_clients"],
                      ["invalid_grant", "Code đã hết hạn hoặc đã dùng", "Thử lại flow từ đầu"],
                      ["token_expired", "Access token hết hạn", "Gọi refreshToken() hoặc bật autoRefresh"],
                      ["rate_limit_exceeded", "Vượt quá rate limit", "Đợi 1 phút hoặc dùng DebouncedSyncManager"],
                      ["invalid_state", "State không match", "Kiểm tra CSRF protection"]
                    ]}
                  />
                </DocSubSection>

                <DocSubSection title="Debug Mode">
                  <CodeBlock language="typescript" title="Bật debug logging" code={`// Thêm vào đầu file để debug
localStorage.setItem('FUN_PROFILE_DEBUG', 'true');

// Tắt debug
localStorage.removeItem('FUN_PROFILE_DEBUG');`} />
                </DocSubSection>

                <DocSubSection title="Kiểm tra Sync Manager">
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
