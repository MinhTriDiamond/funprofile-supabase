import React from 'react';

interface MermaidDiagramProps {
  title?: string;
  children: React.ReactNode;
}

// Simple visual representation without mermaid library
export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ title, children }) => {
  return (
    <div className="my-6 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-border">
      {title && (
        <h4 className="text-lg font-semibold text-foreground mb-4 text-center">{title}</h4>
      )}
      {children}
    </div>
  );
};

// FUN-ID Concept Diagram - NEW
export const FunIDConceptDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="🌟 FUN-ID = Web3 Universal Identity">
      <div className="flex flex-col items-center gap-6">
        {/* FUN-ID Central Hub */}
        <div className="relative">
          <div className="w-56 h-28 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-2xl flex items-center justify-center text-white font-bold shadow-2xl shadow-purple-500/40 animate-pulse">
            <div className="text-center">
              <div className="text-xl">🪪 FUN-ID</div>
              <div className="text-xs opacity-90">Hộ Chiếu Linh Hồn</div>
            </div>
          </div>
        </div>

        {/* 4 Components */}
        <div className="flex flex-wrap justify-center gap-4">
          <div className="w-40 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white font-semibold shadow-lg shadow-emerald-500/30">
            <div className="text-center">
              <div className="text-2xl mb-1">💰</div>
              <div>FUN Wallet</div>
              <div className="text-xs opacity-80">Ví Web3</div>
            </div>
          </div>
          <div className="w-40 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center text-white font-semibold shadow-lg shadow-blue-500/30">
            <div className="text-center">
              <div className="text-2xl mb-1">👤</div>
              <div>FUN Profile</div>
              <div className="text-xs opacity-80">Hồ sơ User</div>
            </div>
          </div>
          <div className="w-40 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-white font-semibold shadow-lg shadow-amber-500/30">
            <div className="text-center">
              <div className="text-2xl mb-1">✨</div>
              <div>Soul NFT</div>
              <div className="text-xs opacity-80">Định danh linh hồn</div>
            </div>
          </div>
          <div className="w-40 h-24 bg-gradient-to-br from-rose-400 to-pink-600 rounded-xl flex items-center justify-center text-white font-semibold shadow-lg shadow-rose-500/30">
            <div className="text-center">
              <div className="text-2xl mb-1">🔐</div>
              <div>SSO Passport</div>
              <div className="text-xs opacity-80">Đăng nhập 1 lần</div>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-border">
          <p className="text-center text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Một tài khoản → Mở mọi cánh cửa</span>
            <br />
            Đăng ký 1 lần, trải nghiệm toàn bộ FUN Ecosystem
          </p>
        </div>
      </div>
    </MermaidDiagram>
  );
};

// Web3 Auth Flow Diagram - NEW
export const Web3AuthFlowDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="🔗 Web3 Sign Up Flow (1-Click Connect Wallet)">
      <div className="space-y-4">
        {[
          { step: 1, from: 'User', to: 'Platform', action: 'Click "Connect Wallet"', icon: '👆' },
          { step: 2, from: 'Platform', to: 'MetaMask/WalletConnect', action: 'Yêu cầu kết nối ví', icon: '🦊' },
          { step: 3, from: 'User', to: 'Wallet', action: 'Approve connection + Sign message', icon: '✍️' },
          { step: 4, from: 'Platform', to: 'Fun Profile API', action: 'POST /sso-web3-auth với signature', icon: '🔐' },
          { step: 5, from: 'Fun Profile', to: 'Database', action: 'Verify signature → Tạo/tìm user', icon: '✅' },
          { step: 6, from: 'Fun Profile', to: 'NFT Contract', action: 'Mint Soul NFT Identity (background)', icon: '✨' },
          { step: 7, from: 'Fun Profile', to: 'Platform', action: 'Trả về tokens + user data + soul_nft_id', icon: '🎉' },
        ].map((item) => (
          <div key={item.step} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-border hover:border-primary/50 transition-colors">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
              {item.step}
            </div>
            <div className="text-2xl">{item.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{item.from}</span>
                <span className="text-primary">→</span>
                <span className="font-medium text-foreground">{item.to}</span>
              </div>
              <div className="text-xs text-muted-foreground">{item.action}</div>
            </div>
          </div>
        ))}
      </div>
    </MermaidDiagram>
  );
};

// Web2 Auto Wallet Flow Diagram - NEW
export const Web2AutoWalletDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="📱 Web2 Sign Up + Auto-create Wallet">
      <div className="space-y-4">
        {[
          { step: 1, from: 'User', to: 'Platform', action: 'Nhập Email hoặc Phone', icon: '📧' },
          { step: 2, from: 'Platform', to: 'Fun Profile', action: 'POST /sso-otp-request', icon: '📤' },
          { step: 3, from: 'Fun Profile', to: 'User', action: 'Gửi OTP 4 số qua Email/SMS', icon: '🔢' },
          { step: 4, from: 'User', to: 'Platform', action: 'Nhập OTP xác thực', icon: '✅' },
          { step: 5, from: 'Platform', to: 'Fun Profile', action: 'POST /sso-otp-verify', icon: '🔐' },
          { step: 6, from: 'Fun Profile', to: 'Key Management', action: 'Tạo keypair → Mã hóa private key', icon: '🔑' },
          { step: 7, from: 'Fun Profile', to: 'Custodial Wallet', action: 'Lưu encrypted wallet vào DB', icon: '💰' },
          { step: 8, from: 'Fun Profile', to: 'NFT Contract', action: 'Mint Soul NFT (background)', icon: '✨' },
          { step: 9, from: 'Fun Profile', to: 'Platform', action: 'FUN-ID kích hoạt! Trả tokens + user', icon: '🎊' },
        ].map((item) => (
          <div key={item.step} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-border hover:border-emerald-500/50 transition-colors">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
              {item.step}
            </div>
            <div className="text-2xl">{item.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{item.from}</span>
                <span className="text-emerald-500">→</span>
                <span className="font-medium text-foreground">{item.to}</span>
              </div>
              <div className="text-xs text-muted-foreground">{item.action}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
        <p className="text-sm text-emerald-800 dark:text-emerald-200 text-center">
          💡 <strong>Người dùng Web2 không cần biết gì về Web3</strong> - Ví được tạo tự động, NFT mint ẩn trong background
        </p>
      </div>
    </MermaidDiagram>
  );
};

// Auto Login Cross Platform Diagram - NEW
export const AutoLoginDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="⚡ Auto-Login Cross Platform">
      <div className="flex flex-col items-center gap-6">
        {/* User logged in to Fun Farm */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white text-2xl shadow-lg">
            🌾
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">User đang dùng Fun Farm</div>
            <div className="text-xs text-muted-foreground">Đã đăng nhập với FUN-ID</div>
          </div>
        </div>

        {/* Arrow down */}
        <div className="flex flex-col items-center text-muted-foreground">
          <span className="text-2xl">↓</span>
          <span className="text-xs">Click chuyển sang Fun Play</span>
        </div>

        {/* Auto detection */}
        <div className="w-full max-w-md p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border border-primary/20">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-xl">🔍</span>
            <span className="font-semibold text-foreground">SSO Session Check</span>
          </div>
          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>1. Kiểm tra SSO token trong localStorage/cookie</p>
            <p>2. Verify token với Fun Profile</p>
            <p>3. Token valid → Auto login!</p>
          </div>
        </div>

        {/* Arrow down */}
        <div className="flex flex-col items-center text-emerald-500">
          <span className="text-2xl">↓</span>
          <span className="text-xs font-semibold">Không cần đăng nhập lại!</span>
        </div>

        {/* User in Fun Play */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl shadow-lg">
            🎮
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">Tự động vào Fun Play</div>
            <div className="text-xs text-muted-foreground">Profile, wallet, rewards đồng bộ 100%</div>
          </div>
        </div>
      </div>
    </MermaidDiagram>
  );
};

// 5D Design Principles Diagram - NEW
export const Design5DDiagram: React.FC = () => {
  const principles = [
    { 
      icon: '1️⃣', 
      title: 'Đơn Giản Tuyệt Đối', 
      desc: '3 click để vào hệ thống',
      color: 'from-blue-400 to-blue-600'
    },
    { 
      icon: '2️⃣', 
      title: 'Không Gây Sợ Web3', 
      desc: 'Đăng ký Web2 trước, Web3 tự động sau',
      color: 'from-emerald-400 to-emerald-600'
    },
    { 
      icon: '3️⃣', 
      title: 'Linh Hồn Là Trung Tâm', 
      desc: 'Soul NFT = Chìa khóa thăng cấp',
      color: 'from-amber-400 to-orange-500'
    },
    { 
      icon: '4️⃣', 
      title: 'Siêu Ứng Dụng 5D', 
      desc: 'Toàn Ecosystem như một app thống nhất',
      color: 'from-purple-400 to-pink-500'
    },
    { 
      icon: '5️⃣', 
      title: 'Angel AI Dẫn Đường', 
      desc: 'Thiên thần hướng dẫn, không phải chatbot',
      color: 'from-rose-400 to-red-500'
    },
  ];

  return (
    <MermaidDiagram title="🌈 Nguyên Tắc Thiết Kế 5D">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {principles.map((p, i) => (
          <div 
            key={i}
            className={`p-4 bg-gradient-to-br ${p.color} rounded-xl text-white shadow-lg hover:scale-105 transition-transform`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{p.icon}</span>
              <span className="font-bold">{p.title}</span>
            </div>
            <p className="text-sm opacity-90">{p.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        <p className="text-lg font-semibold text-foreground">
          "FUN-ID không chỉ là tài khoản - đó là <span className="text-primary">Passport để bước vào New Earth</span>"
        </p>
      </div>
    </MermaidDiagram>
  );
};

// Soul NFT Diagram - NEW
export const SoulNFTDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="✨ Soul NFT Identity - Định Danh Linh Hồn">
      <div className="flex flex-col items-center gap-6">
        {/* Soul NFT Visual */}
        <div className="relative">
          <div className="w-32 h-40 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/50">
            <div className="text-center text-white">
              <div className="text-4xl mb-2">👼</div>
              <div className="text-xs font-semibold">SOUL #12345</div>
              <div className="text-xs opacity-80">Level 5</div>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center text-sm shadow-lg">
            ⭐
          </div>
        </div>

        {/* Properties */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-border text-center">
            <div className="text-xl mb-1">🔒</div>
            <div className="text-xs font-semibold text-foreground">Soulbound</div>
            <div className="text-xs text-muted-foreground">Không thể chuyển nhượng</div>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-border text-center">
            <div className="text-xl mb-1">📈</div>
            <div className="text-xs font-semibold text-foreground">Thăng Cấp</div>
            <div className="text-xs text-muted-foreground">Level up qua hoạt động</div>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-border text-center">
            <div className="text-xl mb-1">💰</div>
            <div className="text-xs font-semibold text-foreground">Earn Rewards</div>
            <div className="text-xs text-muted-foreground">Nhận thưởng xuyên suốt</div>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-border text-center">
            <div className="text-xl mb-1">🌍</div>
            <div className="text-xs font-semibold text-foreground">Cross-Platform</div>
            <div className="text-xs text-muted-foreground">Dùng được mọi nơi</div>
          </div>
        </div>

        {/* Explanation */}
        <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-lg border border-violet-200 dark:border-violet-800 max-w-md">
          <p className="text-sm text-center text-violet-800 dark:text-violet-200">
            Soul NFT là <strong>chứng nhận định danh linh hồn</strong> trên blockchain.
            <br />Càng hoạt động nhiều → Level càng cao → Phần thưởng càng lớn!
          </p>
        </div>
      </div>
    </MermaidDiagram>
  );
};

// Architecture diagram component (Updated)
export const ArchitectureDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="🏗️ Kiến Trúc FUN Ecosystem">
      <div className="flex flex-col items-center gap-6">
        {/* Fun Profile - Center Hub */}
        <div className="relative">
          <div className="w-56 h-28 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/30">
            <div className="text-center">
              <div className="text-lg">🎯 FUN Profile</div>
              <div className="text-xs opacity-80">Auth Hub + SSO + FUN-ID</div>
            </div>
          </div>
        </div>

        {/* Arrows */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>↑↓</span>
          <span className="text-xs">OAuth 2.0 + Web3 Auth + Webhooks</span>
          <span>↑↓</span>
        </div>

        {/* Other Platforms */}
        <div className="flex flex-wrap justify-center gap-4">
          <div className="w-36 h-20 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-amber-500/30">
            <div className="text-center">
              <div>🌾 FUN Farm</div>
              <div className="text-xs opacity-80">Farming Game</div>
            </div>
          </div>
          <div className="w-36 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
            <div className="text-center">
              <div>🎮 FUN Play</div>
              <div className="text-xs opacity-80">Mini Games</div>
            </div>
          </div>
          <div className="w-36 h-20 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/30">
            <div className="text-center">
              <div>🌍 FUN Planet</div>
              <div className="text-xs opacity-80">Metaverse</div>
            </div>
          </div>
        </div>

        {/* Shared Resources */}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-full text-sm">
            🪪 FUN-ID (Unified Account)
          </div>
          <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-full text-sm">
            💰 FUN Wallet
          </div>
          <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-full text-sm">
            ✨ Soul NFT Identity
          </div>
          <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-full text-sm">
            🏆 Cross-Platform Rewards
          </div>
        </div>
      </div>
    </MermaidDiagram>
  );
};

// OAuth Flow diagram
export const OAuthFlowDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="🔐 OAuth 2.0 Authorization Flow">
      <div className="space-y-4">
        {[
          { step: 1, from: 'User', to: 'Fun Farm', action: 'Click "Đăng nhập bằng Fun Profile"' },
          { step: 2, from: 'Fun Farm', to: 'Fun Profile', action: 'Redirect → /auth/authorize?client_id=fun_farm' },
          { step: 3, from: 'User', to: 'Fun Profile', action: 'Đăng nhập (nếu chưa login)' },
          { step: 4, from: 'Fun Profile', to: 'Fun Farm', action: 'Redirect với authorization code' },
          { step: 5, from: 'Fun Farm', to: 'Fun Profile', action: 'Exchange code → tokens (Backend)' },
          { step: 6, from: 'Fun Profile', to: 'Fun Farm', action: 'Trả về access_token + user data' },
        ].map((item) => (
          <div key={item.step} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-border">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
              {item.step}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{item.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium text-foreground">{item.to}</span>
              </div>
              <div className="text-xs text-muted-foreground">{item.action}</div>
            </div>
          </div>
        ))}
      </div>
    </MermaidDiagram>
  );
};

// Proxy Sign Up Flow diagram
export const ProxySignUpDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="📝 Proxy Sign Up Flow (Đăng ký từ Platform khác)">
      <div className="space-y-4">
        {[
          { step: 1, from: 'User', to: 'Fun Farm', action: 'Điền form đăng ký tại Fun Farm' },
          { step: 2, from: 'Fun Farm', to: 'Fun Profile API', action: 'POST /sso-register với user data' },
          { step: 3, from: 'Fun Profile', to: 'Database', action: 'Tạo user + profile + tokens' },
          { step: 4, from: 'Fun Profile', to: 'Fun Farm', action: 'Trả về access_token + user info' },
          { step: 5, from: 'Fun Farm', to: 'User', action: 'Tự động đăng nhập user' },
        ].map((item) => (
          <div key={item.step} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-border">
            <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
              {item.step}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{item.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium text-foreground">{item.to}</span>
              </div>
              <div className="text-xs text-muted-foreground">{item.action}</div>
            </div>
          </div>
        ))}
      </div>
    </MermaidDiagram>
  );
};

// User Flow Diagram - NEW
export const UserFlowDiagram: React.FC = () => {
  return (
    <MermaidDiagram title="🌀 User Flow Tổng Thể - Mượt Như Ánh Sáng">
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-950/50 dark:to-purple-950/50 rounded-xl">
          <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">
{`User → ANY Platform →
    IF no FUN-ID →
        Create FUN-ID (Web3 / Web2)
            → Auto-create FUN Wallet
            → Auto-create Soul NFT Identity
            → Sync profile across ecosystem
    ELSE →
        Auto-login (SSO Token valid)
→ User uses platform →
→ Rewards (FUN Money, Camly Coin, XP) → Stored in FUN-ID
→ Use any platform → Auto recognized by SSO + Angel AI`}
          </pre>
        </div>
        
        <div className="flex flex-wrap justify-center gap-2">
          <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-semibold">
            ✅ 3 click vào hệ thống
          </span>
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
            ✅ Không friction
          </span>
          <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">
            ✅ Không đăng nhập lại
          </span>
          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
            ✅ Đồng bộ 100%
          </span>
        </div>
      </div>
    </MermaidDiagram>
  );
};
