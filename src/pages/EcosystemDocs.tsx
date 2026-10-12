import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Printer, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { DocSection, DocSubSection, DocParagraph, DocList, DocTable, DocAlert } from '@/components/docs/DocSection';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { useLanguage } from '@/i18n/LanguageContext';
import { 
  ArchitectureDiagram, 
  OAuthFlowDiagram, 
  ProxySignUpDiagram,
  FunIDConceptDiagram,
  Web3AuthFlowDiagram,
  Web2AutoWalletDiagram,
  AutoLoginDiagram,
  Design5DDiagram,
  SoulNFTDiagram,
  UserFlowDiagram
} from '@/components/docs/MermaidDiagram';

const tocItems = [
  { id: 'vision-5d', titleKey: 'edocTocVision' },
  { id: 'fun-id-concept', title: 'FUN-ID Concept', level: 2 },
  { id: 'design-5d', titleKey: 'edocTocDesign', level: 2 },
  { id: 'user-flow', titleKey: 'edocTocUserFlow', level: 2 },
  { id: 'overview', titleKey: 'edocTocOverview' },
  { id: 'auth-flows', titleKey: 'edocTocAuthFlows' },
  { id: 'web2-signup', title: 'Web2 Sign Up (OTP + Auto Wallet)', level: 2 },
  { id: 'web3-signup', title: 'Web3 Sign Up (Connect Wallet)', level: 2 },
  { id: 'oauth-flow', title: 'OAuth Login', level: 2 },
  { id: 'proxy-signup', title: 'Proxy Sign Up', level: 2 },
  { id: 'auto-login', title: '4. Auto-Login Cross Platform' },
  { id: 'soul-nft', title: '5. Soul NFT Identity' },
  { id: 'fun-wallet', title: '6. FUN Wallet System' },
  { id: 'fun-profile-plan', titleKey: 'edocTocPlan' },
  { id: 'phase-1', title: 'Phase 1: Database Schema', level: 2 },
  { id: 'phase-2', title: 'Phase 2: SSO Edge Functions', level: 2 },
  { id: 'phase-3', title: 'Phase 3: Web3 Auth System', level: 2 },
  { id: 'phase-4', title: 'Phase 4: Wallet & Soul NFT', level: 2 },
  { id: 'phase-5', title: 'Phase 5: Webhook System', level: 2 },
  { id: 'fun-farm', titleKey: 'edocTocFarm' },
  { id: 'fun-play', titleKey: 'edocTocPlay' },
  { id: 'fun-planet', titleKey: 'edocTocPlanet' },
  { id: 'api-reference', title: '11. API Reference' },
  { id: 'timeline', titleKey: 'edocTocTimeline' },
];

const EcosystemDocs: React.FC = () => {
  const { t, language } = useLanguage();
  const [activeSection, setActiveSection] = useState('vision-5d');

  useEffect(() => {
    const handleScroll = () => {
      const sections = tocItems.map(item => document.getElementById(item.id));
      const scrollPosition = window.scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(tocItems[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">FUN Ecosystem SSO Documentation</h1>
              <p className="text-sm text-muted-foreground">{t('edocSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrint}
              className="border-primary bg-white text-primary hover:bg-primary/10"
            >
              <Printer className="h-4 w-4 mr-2" />
              {t('pdocPrint')}
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar - Table of Contents */}
          <aside className="hidden lg:block w-64 flex-shrink-0 print:hidden">
            <TableOfContents items={tocItems.map((i) => ({ ...i, title: i.titleKey ? t(i.titleKey as any) : (i as any).title }))} activeId={activeSection} />
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Section 1: Tầm Nhìn 5D - FUN-ID */}
            <DocSection id="vision-5d" title={t('edocS1Title')}>
              <DocAlert type="success">
                <strong>{t('edocS1AlertStrong')}</strong>{t('edocS1Alert')}
              </DocAlert>

              <div id="fun-id-concept">
                <DocSubSection title="FUN-ID Concept">
                  <DocParagraph>
                    \1{t('edocS1ConceptA')}
                  </DocParagraph>
                  <FunIDConceptDiagram />
                  
                  <DocList items={[
                    t('edocS1Item1'),
                    t('edocS1Item2'),
                    t('edocS1Item3'),
                    t('edocS1Item4')
                  ]} />
                </DocSubSection>
              </div>

              <div id="design-5d">
                <DocSubSection title={t('edocTocDesign')}>
                  <Design5DDiagram />
                </DocSubSection>
              </div>

              <div id="user-flow">
                <DocSubSection title={t('edocTocUserFlow')}>
                  <DocParagraph>
                    {t('edocS1FlowA')}<strong>{t('edocS1FlowQuote')}</strong>:
                  </DocParagraph>
                  <UserFlowDiagram />
                </DocSubSection>
              </div>
            </DocSection>

            {/* Section 2: Tổng Quan */}
            <DocSection id="overview" title={t('edocS2Title')}>
              <DocParagraph>
                {t('edocS2ParaA')}<strong>Fun Profile</strong>{t('edocS2ParaB')}<strong>Auth Hub</strong>{t('edocS2ParaC')}<strong>FUN-ID</strong>{t('edocS2ParaD')}
              </DocParagraph>

              <ArchitectureDiagram />

              <DocSubSection title={t('edocS2BenefitsTitle')}>
                <DocList items={[
                  t('edocS2Ben1'),
                  t('edocS2Ben2'),
                  t('edocS2Ben3'),
                  t('edocS2Ben4'),
                  t('edocS2Ben5'),
                  t('edocS2Ben6')
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Section 3: Các Flow Đăng Ký */}
            <DocSection id="auth-flows" title={t('edocS3Title')}>
              <DocParagraph>{t('edocS3Para')}</DocParagraph>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-foreground mb-2">📱 Web2 Sign Up</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('edocS3Web2Card')}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-violet-200 dark:border-violet-800">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-foreground mb-2">🔗 Web3 Sign Up</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('edocS3Web3Card')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div id="web2-signup" className="mt-8">
                <DocSubSection title="Web2 Sign Up (OTP + Auto Wallet)">
                  <DocAlert type="info">
                    <strong>{t('edocForStrong')}</strong>{t('edocS3Web2Alert')}
                  </DocAlert>
                  <Web2AutoWalletDiagram />

                  <CodeBlock 
                    title="sso-otp-request/index.ts"
                    language="typescript"
                    code={`// Edge Function: Gửi OTP 4 số
serve(async (req) => {
  const { email_or_phone } = await req.json();
  
  // Generate OTP 4 digits
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  
  // Store OTP with 5min expiry
  await supabase.from('otp_codes').insert({
    identifier: email_or_phone,
    code: otp,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
  
  // Send via Email or SMS
  if (email_or_phone.includes('@')) {
    await sendEmail(email_or_phone, \`Mã OTP của bạn: \${otp}\`);
  } else {
    await sendSMS(email_or_phone, \`Mã OTP FUN: \${otp}\`);
  }
  
  return new Response(JSON.stringify({ success: true }));
});`}
                  />

                  <CodeBlock 
                    title="sso-otp-verify/index.ts"
                    language="typescript"
                    code={`// Edge Function: Xác thực OTP + Tạo FUN-ID
serve(async (req) => {
  const { email_or_phone, otp, username } = await req.json();
  
  // 1. Verify OTP
  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('identifier', email_or_phone)
    .eq('code', otp)
    .gt('expires_at', new Date().toISOString())
    .single();
    
  if (!otpRecord) throw new Error('Invalid or expired OTP');
  
  // 2. Create user in Supabase Auth
  const { data: authData } = await supabase.auth.admin.createUser({
    email: email_or_phone.includes('@') ? email_or_phone : undefined,
    phone: !email_or_phone.includes('@') ? email_or_phone : undefined,
    email_confirm: true,
    user_metadata: { username }
  });
  
  // 3. Update profile
  await supabase.from('profiles').update({
    username
  }).eq('id', authData.user.id);
  
  // 5. Mint Soul NFT (async background)
  mintSoulNFT(authData.user.id, wallet_address); // Fire and forget
  
  // 6. Generate tokens
  const tokens = await generateTokens(authData.user.id);
  
  return new Response(JSON.stringify({
    ...tokens,
    user: { id: authData.user.id, username, wallet_address }
  }));
});`}
                  />
                </DocSubSection>
              </div>

              <div id="web3-signup" className="mt-8">
                <DocSubSection title="Web3 Sign Up (Connect Wallet 1-Click)">
                  <DocAlert type="info">
                    <strong>{t('edocForStrong')}</strong>{t('edocS3Web3Alert')}
                  </DocAlert>
                  <Web3AuthFlowDiagram />

                  <CodeBlock 
                    title="sso-web3-auth/index.ts"
                    language="typescript"
                    code={`// Edge Function: Web3 Authentication
import { ethers } from 'https://esm.sh/ethers@6';

serve(async (req) => {
  const { wallet_address, signature, message, client_id } = await req.json();
  
  // 1. Verify client
  const { data: client } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('client_id', client_id)
    .single();
    
  if (!client) throw new Error('Invalid client');
  
  // 2. Verify signature (EIP-191)
  const recoveredAddress = ethers.verifyMessage(message, signature);
  if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
    throw new Error('Invalid signature');
  }
  
  // 3. Check if wallet exists
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', wallet_address.toLowerCase())
    .single();
    
  if (!profile) {
    // 4. New user - Create account
    const { data: authData } = await supabase.auth.admin.createUser({
      email: \`\${wallet_address.toLowerCase()}@wallet.fun\`,
      email_confirm: true,
      user_metadata: { wallet_address, auth_type: 'web3' }
    });
    
    // 5. Update profile
    await supabase.from('profiles').update({
      wallet_address: wallet_address.toLowerCase()
    }).eq('id', authData.user.id);
    
    // 6. Store wallet connection
    await supabase.from('wallet_connections').insert({
      user_id: authData.user.id,
      wallet_address: wallet_address.toLowerCase(),
      wallet_type: 'external', // metamask, walletconnect
      is_primary: true
    });
    
    // 7. Mint Soul NFT (background)
    mintSoulNFT(authData.user.id, wallet_address);
    
    profile = { id: authData.user.id, wallet_address };
  }
  
  // 8. Generate tokens
  const tokens = await generateTokens(profile.id, client_id);
  
  return new Response(JSON.stringify({
    ...tokens,
    user: profile
  }));
});`}
                  />

                  <CodeBlock 
                    title="src/components/auth/Web3LoginButton.tsx"
                    language="typescript"
                    code={`// React Component: Web3 Login Button
import { useConnect, useAccount, useSignMessage } from 'wagmi';
import { SSO_CONFIG } from '@/config/sso';

export const Web3LoginButton: React.FC = () => {
  const { connect, connectors } = useConnect();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const handleWeb3Login = async () => {
    if (!isConnected) {
      // Connect to MetaMask
      const connector = connectors.find(c => c.name === 'MetaMask');
      await connect({ connector });
      return;
    }
    
    // Create message to sign
    const message = \`Sign in to FUN Ecosystem\\nWallet: \${address}\\nNonce: \${Date.now()}\`;
    
    // Sign message
    const signature = await signMessageAsync({ message });
    
    // Call backend
    const response = await fetch(SSO_CONFIG.WEB3_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: address,
        signature,
        message,
        client_id: SSO_CONFIG.CLIENT_ID
      })
    });
    
    const data = await response.json();
    
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/';
    }
  };
  
  return (
    <Button onClick={handleWeb3Login} className="w-full bg-violet-500 hover:bg-violet-600">
      {isConnected ? '✍️ Sign to Login' : '🦊 Connect Wallet'}
    </Button>
  );
};`}
                  />
                </DocSubSection>
              </div>

              <div id="oauth-flow" className="mt-8">
                <DocSubSection title={t('edocS3OauthTitle')}>
                  <DocParagraph>{t('edocS3OauthPara')}</DocParagraph>
                  <OAuthFlowDiagram />
                </DocSubSection>
              </div>

              <div id="proxy-signup" className="mt-8">
                <DocSubSection title={t('edocS3ProxyTitle')}>
                  <DocParagraph>{t('edocS3ProxyPara')}</DocParagraph>
                  <ProxySignUpDiagram />
                </DocSubSection>
              </div>
            </DocSection>

            {/* Section 4: Auto-Login */}
            <DocSection id="auto-login" title="4. Auto-Login Cross Platform">
              <DocParagraph>{t('edocS4Para')}</DocParagraph>
              
              <AutoLoginDiagram />

              <CodeBlock 
                title="src/hooks/useAutoLogin.ts"
                language="typescript"
                code={`// Hook kiểm tra và auto-login khi vào platform
import { useEffect, useState } from 'react';
import { SSO_CONFIG } from '@/config/sso';

export const useAutoLogin = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkSSOSession = async () => {
      // 1. Check for existing token
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        // 2. Verify token with Fun Profile
        const response = await fetch(SSO_CONFIG.VERIFY_URL, {
          headers: { Authorization: \`Bearer \${token}\` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // 3. Try refresh token
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            const refreshResponse = await fetch(SSO_CONFIG.REFRESH_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken })
            });
            
            if (refreshResponse.ok) {
              const data = await refreshResponse.json();
              localStorage.setItem('access_token', data.access_token);
              setUser(data.user);
            } else {
              // Token invalid, clear storage
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
            }
          }
        }
      } catch (error) {
        console.error('Auto-login check failed:', error);
      }
      
      setLoading(false);
    };
    
    checkSSOSession();
  }, []);
  
  return { user, loading, isAuthenticated: !!user };
};`}
              />
            </DocSection>

            {/* Section 5: Soul NFT */}
            <DocSection id="soul-nft" title="5. Soul NFT Identity">
              <DocParagraph>
                {t('edocS5ParaA')}<strong>{t('edocS5ParaStrong')}</strong>{t('edocS5ParaB')}
              </DocParagraph>

              <SoulNFTDiagram />

              <DocSubSection title="Database Schema">
                <CodeBlock 
                  title="soul_nfts.sql"
                  language="sql"
                  code={`-- Bảng soul_nfts: Lưu trữ NFT định danh linh hồn
CREATE TABLE public.soul_nfts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_id TEXT UNIQUE, -- NFT token ID on-chain
  contract_address TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- name, image, attributes
  level INTEGER NOT NULL DEFAULT 1,
  experience_points BIGINT NOT NULL DEFAULT 0,
  minted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: 1 user = 1 soul NFT
CREATE UNIQUE INDEX idx_soul_nfts_user ON public.soul_nfts(user_id);

-- Enable RLS
ALTER TABLE public.soul_nfts ENABLE ROW LEVEL SECURITY;

-- Users can view their own soul NFT
CREATE POLICY "Users can view own soul NFT"
  ON public.soul_nfts FOR SELECT
  USING (auth.uid() = user_id);

-- Public can view basic info (for leaderboard)
CREATE POLICY "Public can view soul NFT basics"
  ON public.soul_nfts FOR SELECT
  USING (true);`}
                />
              </DocSubSection>

              <DocSubSection title="Mint Soul NFT Edge Function">
                <CodeBlock 
                  title="mint-soul-nft/index.ts"
                  language="typescript"
                  code={`// Edge Function: Mint Soul NFT cho user
serve(async (req) => {
  const { user_id, wallet_address } = await req.json();
  
  // 1. Check if user already has Soul NFT
  const { data: existing } = await supabase
    .from('soul_nfts')
    .select('*')
    .eq('user_id', user_id)
    .single();
    
  if (existing?.token_id) {
    return new Response(JSON.stringify({ 
      message: 'User already has Soul NFT',
      soul_nft: existing 
    }));
  }
  
  // 2. Prepare metadata
  const metadata = {
    name: \`FUN Soul #\${Date.now()}\`,
    description: 'Soul Identity NFT for FUN Ecosystem',
    image: 'ipfs://...', // Generate unique soul image
    attributes: [
      { trait_type: 'Level', value: 1 },
      { trait_type: 'Created', value: new Date().toISOString() }
    ]
  };
  
  // 3. Call NFT Contract to mint (Soulbound)
  const contract = new ethers.Contract(SOUL_NFT_CONTRACT, ABI, signer);
  const tx = await contract.mint(wallet_address, JSON.stringify(metadata));
  await tx.wait();
  
  // 4. Get token ID from event
  const receipt = await tx.wait();
  const tokenId = receipt.logs[0].topics[3];
  
  // 5. Store in database
  const { data: soulNft } = await supabase
    .from('soul_nfts')
    .upsert({
      user_id,
      token_id: tokenId,
      contract_address: SOUL_NFT_CONTRACT,
      metadata,
      minted_at: new Date().toISOString()
    })
    .select()
    .single();
  
  // 6. Trigger webhook
  await triggerWebhook('soul_nft.minted', { user_id, soul_nft: soulNft });
  
  return new Response(JSON.stringify({ soul_nft: soulNft }));
});`}
                />
              </DocSubSection>
            </DocSection>

            {/* Section 6: FUN Wallet */}
            <DocSection id="fun-wallet" title="6. FUN Wallet System">
              <DocParagraph>
                {t('edocS6ParaA')}<strong>Custodial Wallet</strong>{t('edocS6ParaB')}<strong> Non-custodial Wallet</strong>{t('edocS6ParaC')}
              </DocParagraph>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-foreground mb-2">🔐 Custodial Wallet</h4>
                    <DocList items={[
                      t('edocS6Cust1'),
                      t('edocS6Cust2'),
                      t('edocS6Cust3'),
                      t('edocS6Cust4')
                    ]} />
                  </CardContent>
                </Card>
                <Card className="border-violet-200 dark:border-violet-800">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-foreground mb-2">🦊 Non-custodial Wallet</h4>
                    <DocList items={[
                      t('edocS6NonCust1'),
                      t('edocS6NonCust2'),
                      "Full control over assets",
                      t('edocS6NonCust4')
                    ]} />
                  </CardContent>
                </Card>
              </div>

              <DocSubSection title="Database Schema">
                <CodeBlock 
                  title="wallet_tables.sql"
                  language="sql"
                  code={`-- Bảng wallet_connections: Ví external đã kết nối
CREATE TABLE public.wallet_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT 'external',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wallet_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wallet connections"
  ON public.wallet_connections FOR ALL
  USING (auth.uid() = user_id);`}
                />
              </DocSubSection>
            </DocSection>

            {/* Section 7: Kế Hoạch Fun Profile */}
            <DocSection id="fun-profile-plan" title={t('edocS7Title')}>
              <DocAlert type="info">
                <strong>{t('edocNoteStrong')}</strong>{t('edocS7Alert')}
              </DocAlert>

              {/* Phase 1 */}
              <div id="phase-1">
                <DocSubSection title={t('edocPhase1Title')}>
                  <DocParagraph>{t('edocPhase1Para')}</DocParagraph>

                  <DocTable 
                    headers={[t('edocColTable'), t('pdocColPurpose'), t('edocColRelation')]}
                    rows={[
                      ['oauth_clients', t('edocT1R1'), 'Standalone'],
                      ['oauth_codes', t('edocT1R2'), 'FK → profiles, oauth_clients'],
                      ['cross_platform_tokens', 'Access & refresh tokens', 'FK → profiles, oauth_clients'],
                      ['otp_codes', t('edocT1R4'), 'Standalone'],
                      ['wallet_connections', t('edocT1R5'), 'FK → profiles'],
                      ['wallet_connections', t('edocT1R5'), 'FK → profiles'],
                      ['soul_nfts', t('edocT1R7'), 'FK → profiles'],
                      ['webhook_endpoints', t('edocT1R8'), 'FK → oauth_clients'],
                      ['platform_activities', t('edocT1R9'), 'FK → profiles'],
                    ]}
                  />

                  <CodeBlock 
                    title="oauth_clients.sql"
                    language="sql"
                    code={`-- Bảng oauth_clients: Quản lý các platform được phép kết nối
CREATE TABLE public.oauth_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL, -- Đã hash bằng bcrypt
  platform_name TEXT NOT NULL, -- fun_farm, fun_play, fun_planet
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  allowed_scopes TEXT[] NOT NULL DEFAULT '{profile}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

-- Chỉ admins có quyền CRUD
CREATE POLICY "Admins can manage oauth_clients"
  ON public.oauth_clients
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));`}
                  />
                </DocSubSection>
              </div>

              {/* Phase 2 */}
              <div id="phase-2">
                <DocSubSection title={t('edocPhase2Title')}>
                  <DocTable 
                    headers={['Function', 'Endpoint', t('pdocColDesc')]}
                    rows={[
                      ['sso-register', 'POST /sso-register', t('edocFnReg')],
                      ['sso-authorize', 'GET /sso-authorize', t('edocFnAuthorize')],
                      ['sso-token', 'POST /sso-token', t('edocFnToken')],
                      ['sso-verify', 'GET /sso-verify', t('edocFnVerify')],
                      ['sso-refresh', 'POST /sso-refresh', t('edocFnRefresh')],
                      ['sso-revoke', 'POST /sso-revoke', t('edocFnRevoke')],
                    ]}
                  />
                </DocSubSection>
              </div>

              {/* Phase 3 */}
              <div id="phase-3">
                <DocSubSection title={t('edocPhase3Title')}>
                  <DocTable 
                    headers={['Function', 'Endpoint', t('pdocColDesc')]}
                    rows={[
                      ['sso-web3-auth', 'POST /sso-web3-auth', t('edocFnWeb3')],
                      ['sso-otp-request', 'POST /sso-otp-request', t('edocFnOtpReq')],
                      ['sso-otp-verify', 'POST /sso-otp-verify', t('edocFnOtpVerify')],
                    ]}
                  />
                </DocSubSection>
              </div>

              {/* Phase 4 */}
              <div id="phase-4">
                <DocSubSection title={t('edocPhase4Title')}>
                  <DocTable 
                    headers={['Function', 'Endpoint', t('pdocColDesc')]}
                    rows={[
                      ['create-custodial-wallet', 'Internal', t('edocFnCreateWallet')],
                      ['mint-soul-nft', 'Internal', 'Mint Soul NFT Identity'],
                      ['get-soul-nft', 'GET /get-soul-nft', t('edocFnGetSoul')],
                      ['upgrade-soul-level', 'POST /upgrade-soul-level', t('edocFnUpgradeSoul')],
                    ]}
                  />
                </DocSubSection>
              </div>

              {/* Phase 5 */}
              <div id="phase-5">
                <DocSubSection title={t('edocPhase5Title')}>
                  <DocTable 
                    headers={['Event', 'Trigger', 'Payload']}
                    rows={[
                      ['user.created', t('edocWh1'), '{ user_id, email, username, auth_type }'],
                      ['user.updated', t('edocWh2'), '{ user_id, changes: {...} }'],
                      ['wallet.updated', t('edocWh3'), '{ user_id, wallet_address }'],
                      ['soul_nft.minted', t('edocWh4'), '{ user_id, token_id, level }'],
                      ['reward.claimed', t('edocWh5'), '{ user_id, amount, tx_hash }'],
                    ]}
                  />
                </DocSubSection>
              </div>
            </DocSection>

            {/* Section 8: Hướng Dẫn Fun Farm */}
            <DocSection id="fun-farm" title={t('edocS8Title')}>
              <DocAlert type="success">
                <strong>{t('edocS8AlertStrong')}</strong>{t('edocS8Alert')}
              </DocAlert>

              <Tabs defaultValue="step1" className="mt-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="step1">{t('edocStep1')}</TabsTrigger>
                  <TabsTrigger value="step2">{t('edocStep2')}</TabsTrigger>
                  <TabsTrigger value="step3">{t('edocStep3')}</TabsTrigger>
                  <TabsTrigger value="step4">{t('edocStep4')}</TabsTrigger>
                </TabsList>

                <TabsContent value="step1" className="mt-4">
                  <DocSubSection title={t('edocFarmStep1Title')}>
                    <DocParagraph>{t('edocFarmStep1Para')}</DocParagraph>
                    <DocList items={[
                      "client_id: fun_farm_production",
                      t('edocFarmStep1Secret'),
                      "redirect_uri: https://funfarm.app/auth/callback"
                    ]} />
                    <DocAlert type="warning">
                      <strong>{t('edocSecurityStrong')}</strong>{t('edocFarmStep1Alert')}
                    </DocAlert>
                  </DocSubSection>
                </TabsContent>

                <TabsContent value="step2" className="mt-4">
                  <DocSubSection title={t('edocFarmStep2Title')}>
                    <CodeBlock 
                      title="src/config/sso.ts"
                      language="typescript"
                      code={`// Fun Farm SSO Configuration
// Domain: https://farm.fun.rich

export const SSO_CONFIG = {
  // Fun Profile Auth Hub URL
  AUTH_URL: 'https://fun.rich',
  
  // OAuth endpoints (API)
  API_BASE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1',
  AUTHORIZE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-authorize',
  TOKEN_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-token',
  REGISTER_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-register',
  VERIFY_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-verify',
  REFRESH_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-refresh',
  
  // Web3 Auth
  WEB3_AUTH_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-web3-auth',
  OTP_REQUEST_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-otp-request',
  OTP_VERIFY_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-otp-verify',
  
  // Client credentials
  CLIENT_ID: 'fun_farm_production',
  REDIRECT_URI: 'https://farm.fun.rich/auth/callback',
  
  // Scopes to request
  SCOPES: ['profile', 'wallet', 'rewards', 'soul_nft'],
};

// Fun Ecosystem Domains
export const DOMAINS = {
  funProfile: 'https://fun.rich',
  funFarm: 'https://farm.fun.rich',
  funPlay: 'https://play.fun.rich',
  funPlanet: 'https://planet.fun.rich',
};`}
                    />
                  </DocSubSection>
                </TabsContent>

                <TabsContent value="step3" className="mt-4">
                  <DocSubSection title={t('edocFarmStep3Title')}>
                    <DocParagraph>{t('edocFarmStep3Para')}</DocParagraph>
                    <CodeBlock 
                      title="src/components/auth/AuthPage.tsx"
                      language="typescript"
                      code={`// Auth Page với cả Web2 và Web3 options
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OTPSignUpForm } from './OTPSignUpForm';
import { Web3LoginButton } from './Web3LoginButton';
import { SSOLoginButton } from './SSOLoginButton';

export const AuthPage: React.FC = () => {
  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold text-center mb-6">
        🌟 Tham gia FUN Ecosystem
      </h1>
      
      <Tabs defaultValue="web2" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="web2">📱 Email/Phone</TabsTrigger>
          <TabsTrigger value="web3">🔗 Connect Wallet</TabsTrigger>
        </TabsList>
        
        <TabsContent value="web2" className="mt-4">
          <OTPSignUpForm />
          <div className="my-4 text-center text-muted-foreground">
            hoặc
          </div>
          <SSOLoginButton />
        </TabsContent>
        
        <TabsContent value="web3" className="mt-4">
          <Web3LoginButton />
          <p className="text-xs text-center text-muted-foreground mt-4">
            Đăng nhập 1-click với MetaMask hoặc WalletConnect
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};`}
                    />
                  </DocSubSection>
                </TabsContent>

                <TabsContent value="step4" className="mt-4">
                  <DocSubSection title={t('edocFarmStep4Title')}>
                    <CodeBlock 
                      title="src/App.tsx"
                      language="typescript"
                      code={`// Sử dụng hook để auto-login
import { useAutoLogin } from '@/hooks/useAutoLogin';

function App() {
  const { user, loading, isAuthenticated } = useAutoLogin();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <AuthPage />;
  }
  
  return (
    <MainApp user={user} />
  );
}`}
                    />
                  </DocSubSection>
                </TabsContent>
              </Tabs>
            </DocSection>

            {/* Section 9: Fun Play */}
            <DocSection id="fun-play" title={t('edocS9Title')}>
              <DocAlert type="success">
                <strong>{t('edocS9AlertStrong')}</strong>{t('edocS9Alert')}
              </DocAlert>

              <DocParagraph>{t('edocS9Para')}</DocParagraph>

              <DocList items={[
                t('edocS9Step1'),
                t('edocS9Step2'),
                "3. Set redirect_uri: https://play.fun.rich/auth/callback",
                t('edocS9Step4'),
                t('edocS9Step5')
              ]} />

              <CodeBlock 
                title="src/config/sso.ts (Fun Play version)"
                language="typescript"
                code={`// Fun Play SSO Configuration
// Domain: https://play.fun.rich

export const SSO_CONFIG = {
  AUTH_URL: 'https://fun.rich',
  API_BASE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1',
  AUTHORIZE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-authorize',
  TOKEN_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-token',
  REGISTER_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-register',
  WEB3_AUTH_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-web3-auth',
  
  CLIENT_ID: 'fun_play_production',
  REDIRECT_URI: 'https://play.fun.rich/auth/callback',
  SCOPES: ['profile', 'wallet', 'rewards', 'soul_nft'],
};`}
              />
            </DocSection>

            {/* Section 10: Fun Planet */}
            <DocSection id="fun-planet" title={t('edocS10Title')}>
              <DocAlert type="success">
                <strong>{t('edocS10AlertStrong')}</strong>{t('edocS10Alert')}
              </DocAlert>

              <DocParagraph>{t('edocS10Para')}</DocParagraph>

              <DocList items={[
                "client_id: fun_planet_production",
                "redirect_uri: https://planet.fun.rich/auth/callback",
                t('edocS10Item3')
              ]}
              />

              <CodeBlock 
                title="src/config/sso.ts (Fun Planet version)"
                language="typescript"
                code={`// Fun Planet SSO Configuration
// Domain: https://planet.fun.rich

export const SSO_CONFIG = {
  AUTH_URL: 'https://fun.rich',
  API_BASE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1',
  AUTHORIZE_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-authorize',
  TOKEN_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-token',
  REGISTER_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-register',
  WEB3_AUTH_URL: 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/sso-web3-auth',
  
  CLIENT_ID: 'fun_planet_production',
  REDIRECT_URI: 'https://planet.fun.rich/auth/callback',
  SCOPES: ['profile', 'wallet', 'rewards', 'soul_nft'],
};`}
              />
            </DocSection>

            {/* Section 11: API Reference */}
            <DocSection id="api-reference" title="11. API Reference">
              <DocSubSection title="SSO Endpoints">
                <DocTable 
                  headers={['Method', 'Endpoint', t('pdocColDesc'), 'Auth']}
                  rows={[
                    ['POST', '/sso-register', 'Proxy Sign Up', 'client_id + client_secret'],
                    ['GET', '/sso-authorize', t('edocFnAuthorize'), 'None'],
                    ['POST', '/sso-token', 'Exchange code → tokens', 'client_id + client_secret'],
                    ['GET', '/sso-verify', 'Verify token, get user info', 'Bearer token'],
                    ['POST', '/sso-refresh', 'Refresh access token', 'client_id + client_secret'],
                    ['POST', '/sso-revoke', 'Revoke tokens', 'client_id + client_secret'],
                  ]}
                />
              </DocSubSection>

              <DocSubSection title="Web3 & OTP Endpoints">
                <DocTable 
                  headers={['Method', 'Endpoint', t('pdocColDesc'), 'Auth']}
                  rows={[
                    ['POST', '/sso-web3-auth', 'Web3 wallet authentication', 'client_id'],
                    ['POST', '/sso-otp-request', t('edocFnOtpReq'), 'None'],
                    ['POST', '/sso-otp-verify', t('edocApiOtpVerify'), 'None'],
                  ]}
                />
              </DocSubSection>

              <DocSubSection title="Webhook Events">
                <DocTable 
                  headers={['Event', t('edocColWhen'), 'Payload']}
                  rows={[
                    ['user.created', t('edocWhA1'), '{ user_id, email, username, auth_type }'],
                    ['user.updated', t('edocWhA2'), '{ user_id, changes: { field: new_value } }'],
                    ['wallet.updated', t('edocWhA3'), '{ user_id, wallet_address }'],
                    ['soul_nft.minted', t('edocWhA4'), '{ user_id, token_id, level }'],
                    ['reward.claimed', t('edocWhA5'), '{ user_id, amount, tx_hash }'],
                  ]}
                />
              </DocSubSection>

              <DocSubSection title="Error Codes">
                <DocTable 
                  headers={['Code', t('pdocColMeaning'), t('edocColFix')]}
                  rows={[
                    ['invalid_client', t('edocErr1Meaning'), t('edocErr1Fix')],
                    ['invalid_secret', t('edocErr2Meaning'), t('edocErr2Fix')],
                    ['invalid_redirect_uri', t('edocErr3Meaning'), t('edocErr3Fix')],
                    ['expired_code', t('edocErr4Meaning'), t('edocErr4Fix')],
                    ['invalid_token', t('edocErr5Meaning'), t('edocErr5Fix')],
                    ['invalid_otp', t('edocErr6Meaning'), t('edocErr6Fix')],
                    ['invalid_signature', t('edocErr7Meaning'), t('edocErr7Fix')],
                  ]}
                />
              </DocSubSection>
            </DocSection>

            {/* Section 12: Timeline */}
            <DocSection id="timeline" title={t('edocTocTimeline')}>
              <DocTable 
                headers={['Phase', t('edocColWork'), 'Platform', t('edocColTime')]}
                rows={[
                  ['Phase 1', t('edocTl1'), 'Fun Profile', t('edocDays15')],
                  ['Phase 2', 'SSO Edge Functions (6 functions)', 'Fun Profile', t('edocDays34')],
                  ['Phase 3', 'Web3 Auth System (web3-auth, otp)', 'Fun Profile', t('edocDays23')],
                  ['Phase 4', 'Wallet & Soul NFT System', 'Fun Profile', t('edocDays23')],
                  ['Phase 5', 'Webhook System', 'Fun Profile', t('edocDays2')],
                  ['Phase 6', 'Rewards Aggregation', 'Fun Profile', t('edocDays12')],
                  ['Phase 7', t('edocTlIntegrate'), 'Fun Farm', t('edocDays15')],
                  ['Phase 8', t('edocTlIntegrate'), 'Fun Play', t('edocDays15')],
                  ['Phase 9', t('edocTlIntegrate'), 'Fun Planet', t('edocDays15')],
                  ['Phase 10', 'Testing E2E', t('edocTlAll'), t('edocDays23')],
                ]}
              />

              <DocAlert type="info">
                <strong>{t('edocS12AlertStrong')}</strong>{t('edocS12Alert')}
              </DocAlert>

              <DocSubSection title={t('edocChecklistTitle')}>
                <DocList items={[
                  t('edocCheck1'),
                  t('edocCheck2'),
                  t('edocCheck3'),
                  t('edocCheck4'),
                  "✅ Fun Profile: Auto-create Custodial Wallet",
                  "✅ Fun Profile: Soul NFT Minting",
                  t('edocCheck7'),
                  t('edocCheck8'),
                  t('edocCheck9'),
                  t('edocCheck10'),
                  t('edocCheck11'),
                  "✅ Rewards sync realtime"
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Footer */}
            <div className="mt-12 p-6 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-xl text-center border border-violet-200 dark:border-violet-800">
              <p className="text-lg font-semibold text-foreground mb-2">
                {t('edocFooterQuote')}
              </p>
              <p className="text-muted-foreground mb-4">
                {t('edocFooterContact')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('edocFooterUpdated')} {new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : language)}
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default EcosystemDocs;
