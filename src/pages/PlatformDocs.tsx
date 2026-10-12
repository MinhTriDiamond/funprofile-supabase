import React, { useState, useEffect } from 'react';
import { ArrowLeft, Printer, FileText, ExternalLink, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { DocSection, DocSubSection, DocParagraph, DocList, DocTable, DocAlert } from '@/components/docs/DocSection';
import { CodeBlock } from '@/components/docs/CodeBlock';
import {
  TechStackDiagram,
  AuthFlowDiagram,
  WalletSystemDiagram,
  SoulNFTDiagram,
  SocialFeedDiagram,
  RewardFlowDiagram,
  MediaPipelineDiagram,
  DatabaseSchemaDiagram,
  EdgeFunctionsDiagram,
  SecurityDiagram,
  EcosystemDiagram,
  ProjectStructureDiagram
} from '@/components/docs/AppDiagrams';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

const tocItems = [
  { id: 'overview', titleKey: 'pdocTocOverview' },
  { id: 'project-structure', titleKey: 'pdocTocStructure', level: 2 },
  { id: 'tech-stack', title: '3. Tech Stack' },
  { id: 'authentication', titleKey: 'pdocTocAuth' },
  { id: 'wallet-blockchain', title: '5. Wallet & Blockchain' },
  { id: 'soul-nft', title: '6. Soul NFT', level: 2 },
  { id: 'social-feed', title: '7. Social Feed' },
  { id: 'profile-friends', title: '8. Profile & Friends' },
  { id: 'reward-system', titleKey: 'pdocTocReward' },
  { id: 'admin-panel', title: '10. Admin Panel' },
  { id: 'media-system', title: '11. Media System' },
  { id: 'notifications', title: '12. Notifications' },
  { id: 'database-schema', title: '13. Database Schema' },
  { id: 'edge-functions', title: '14. Edge Functions' },
  { id: 'security', title: '15. Security Features' },
  { id: 'performance', title: '16. Performance' },
  { id: 'secrets', title: '17. Secrets & Environment' },
  { id: 'ecosystem-products', title: '18. FUN Ecosystem Products' },
  { id: 'sso-sdk', title: '19. SSO SDK' },
  { id: 'i18n', title: '20. Internationalization' },
  { id: 'design-guidelines', title: '21. Design Guidelines' },
  { id: 'development-rules', title: '22. Development Rules' },
  { id: 'next-proposals', title: '23. Next Development Proposals' },
];

const PlatformDocs: React.FC = () => {
  const { t } = useLanguage();
  const [activeId, setActiveId] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0% -80% 0%' }
    );

    tocItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Responsive */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Left section */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile TOC Menu */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="p-4 border-b border-border">
                    <h4 className="font-semibold text-foreground">{t('pdocTocHeading')}</h4>
                  </div>
                  <ScrollArea className="h-[calc(100vh-80px)]">
                    <div className="p-2">
                      {tocItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => scrollToSection(item.id)}
                          className={cn(
                            "block w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                            item.level === 2 && "pl-6",
                            activeId === item.id 
                              ? "bg-primary/10 text-primary font-medium" 
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {item.titleKey ? t(item.titleKey as any) : item.title}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>

              <Link to="/">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base md:text-xl font-bold text-foreground flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                  <span className="hidden sm:inline truncate">{t('pdocHeaderTitle')}</span>
                  <span className="sm:hidden">{t('pdocHeaderTitleMobile')}</span>
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Comprehensive Handover Documentation v2.0
                </p>
              </div>
            </div>
            
            {/* Right buttons - Icons only on mobile */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link to="/docs/ecosystem">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline ml-2">SSO Docs</span>
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 px-2 sm:px-3">
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">{t('pdocPrint')}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex gap-4 lg:gap-8">
          {/* Sidebar - Table of Contents (Desktop only) */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <TableOfContents items={tocItems.map((i) => ({ ...i, title: i.titleKey ? t(i.titleKey as any) : (i as any).title }))} activeId={activeId} />
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <ScrollArea className="h-[calc(100vh-120px)] sm:h-[calc(100vh-140px)]">
              <div className="pr-0 sm:pr-4">
                
                {/* Section 1: Overview */}
                <DocSection id="overview" title={t('pdocTocOverview')}>
                  <DocParagraph>{t('pdocS1Para')}</DocParagraph>
                  
                  <DocAlert type="info">
                    \1{t('pdocS1Alert')}
                  </DocAlert>

                  <DocSubSection title={t('pdocS1FeatTitle')}>
                    <DocList items={[
                      t('pdocS1Feat1'),
                      t('pdocS1Feat2'),
                      t('pdocS1Feat3'),
                      t('pdocS1Feat4'),
                      t('pdocS1Feat5'),
                      t('pdocS1Feat6'),
                      t('pdocS1Feat7'),
                      t('pdocS1Feat8')
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Production Domains">
                    <DocTable 
                      headers={['Domain', 'Product', t('pdocColDesc')]}
                      rows={[
                        ['fun.rich', 'FUN Profile', t('pdocDomain1Desc')],
                        ['play.fun.rich', 'FUN Play', 'Gaming & Entertainment'],
                        ['farm.fun.rich', 'FUN Farm', 'Agriculture features'],
                        ['planet.fun.rich', 'FUN Planet', 'Gaming & Planet exploration'],
                        ['wallet.fun.rich', 'FUN Wallet', 'Crypto wallet management'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 2: Project Structure */}
                <DocSection id="project-structure" title={t('pdocS2Title')}>
                  <ProjectStructureDiagram />
                  
                  <DocSubSection title="Governance Flow">
                    <DocTable 
                      headers={[t('pdocColRole'), t('pdocColName'), t('pdocColResp')]}
                      rows={[
                        ['👑 Chairman', t('pdocGov1Name'), t('pdocGov1Resp')],
                        ['📝 Secretary', 'bé Trí', t('pdocGov2Resp')],
                        ['💻 CTO', 'Angel Lovable', t('pdocGov3Resp')],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Directory Structure">
                    <CodeBlock 
                      title={t('pdocS2CodeTitle')}
                      language="bash"
                      code={`src/
├── components/         # React components
│   ├── admin/         # Admin panel components
│   ├── auth/          # Authentication components
│   ├── chat/          # Chat/messaging components
│   ├── docs/          # Documentation components
│   ├── feed/          # Social feed components
│   ├── friends/       # Friends management
│   ├── layout/        # Layout components (Navbar, Sidebar)
│   ├── profile/       # Profile components
│   ├── ui/            # shadcn/ui components
│   └── wallet/        # Wallet components
├── hooks/             # Custom React hooks
├── i18n/              # Internationalization
├── pages/             # Page components
├── utils/             # Utility functions
└── integrations/      # External integrations

supabase/
├── functions/         # Edge Functions (38 functions)
└── config.toml        # Supabase configuration

sdk-package/           # @fun-ecosystem/sso-sdk
├── src/               # SDK source code
├── examples/          # Integration examples
└── docs/              # SDK documentation`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 3: Tech Stack */}
                <DocSection id="tech-stack" title="3. Tech Stack">
                  <TechStackDiagram />
                  
                  <DocSubSection title="Frontend Technologies">
                    <DocTable 
                      headers={['Technology', 'Version', t('pdocColPurpose')]}
                      rows={[
                        ['React', '18.3.1', t('pdocTech1Purpose')],
                        ['TypeScript', 'Latest', 'Type safety'],
                        ['Vite', 'Latest', 'Build tool & dev server'],
                        ['Tailwind CSS', '3.x', 'Utility-first CSS'],
                        ['shadcn/ui', 'Latest', 'UI Component library'],
                        ['React Query', '5.x', 'Server state management'],
                        ['React Router', 'v6', 'Client-side routing'],
                        ['Framer Motion', 'Latest', 'Animations'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Backend Technologies">
                    <DocTable 
                      headers={['Technology', t('pdocColPurpose')]}
                      rows={[
                        ['Lovable Cloud', 'Backend-as-a-Service (Supabase)'],
                        ['Edge Functions', 'Serverless compute (Deno)'],
                        ['PostgreSQL', 'Primary database'],
                        ['Resend API', 'Email delivery (OTP)'],
                        ['Cloudflare R2', 'Image storage'],
                        ['Cloudflare Stream', 'Video encoding & delivery'],
                        ['CoinGecko API', 'Token price data'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Blockchain Technologies">
                    <DocTable 
                      headers={['Technology', t('pdocColPurpose')]}
                      rows={[
                        ['BNB Smart Chain', 'Primary blockchain (Chain ID: 56)'],
                        ['Wagmi', 'React hooks for Ethereum'],
                        ['RainbowKit', 'Wallet connection UI'],
                        ['Viem', 'TypeScript interface for Ethereum'],
                        ['CAMLY Token', 'Reward token (BEP-20)'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 4: Authentication */}
                <DocSection id="authentication" title={t('pdocS4Title')}>
                  <DocParagraph>{t('pdocS4Para')}</DocParagraph>

                  <AuthFlowDiagram />

                  <DocSubSection title="Email OTP Flow">
                    <DocParagraph>{t('pdocS4OtpPara')}</DocParagraph>
                    <CodeBlock 
                      title={t('pdocS4OtpCodeTitle')}
                      language="typescript"
                      code={`// Request OTP
const { data, error } = await supabase.functions.invoke('sso-otp-request', {
  body: { identifier: 'user@example.com', type: 'email' }
});

// Verify OTP
const { data: verifyData } = await supabase.functions.invoke('sso-otp-verify', {
  body: { identifier: 'user@example.com', code: '123456', type: 'email' }
});`}
                    />
                  </DocSubSection>

                  <DocSubSection title="Wallet Login Flow">
                    <DocParagraph>{t('pdocS4WalletPara')}</DocParagraph>
                    <CodeBlock 
                      title="Wallet Authentication"
                      language="typescript"
                      code={`// 1. Connect wallet với RainbowKit
const { address } = useAccount();

// 2. Sign message
const signature = await signMessageAsync({
  message: \`Sign in to FUN Ecosystem\\nNonce: \${nonce}\`
});

// 3. Verify với Edge Function
const { data } = await supabase.functions.invoke('sso-web3-auth', {
  body: { address, signature, message }
});`}
                    />
                  </DocSubSection>

                  <DocSubSection title="Law of Light">
                    <DocAlert type="warning">
                      {t('pdocS4LawAlert')}<code>profiles.law_of_light_accepted</code>.
                    </DocAlert>
                  </DocSubSection>
                </DocSection>

                {/* Section 5: Wallet & Blockchain */}
                <DocSection id="wallet-blockchain" title="5. Wallet & Blockchain">
                  <DocParagraph>{t('pdocS5Para')}</DocParagraph>

                  <WalletSystemDiagram />

                  <DocSubSection title="Token Operations">
                    <DocTable 
                      headers={['Operation', t('pdocColDesc'), t('pdocColReq')]}
                      rows={[
                        ['View Balance', t('pdocTokOp1Desc'), t('pdocReqLogin')],
                        ['Send Token', t('pdocTokOp2Desc'), t('pdocTokOp2Req')],
                        ['Receive', t('pdocTokOp3Desc'), 'Wallet address'],
                        ['Claim Reward', t('pdocTokOp4Desc'), 'Approved reward ≥ 1,000,000 CAMLY'],
                      ]}
                    />
                  </DocSubSection>

                  <DocAlert type="info">
                    <strong>Claim Reward Flow:</strong> User request → Edge Function validates → Treasury wallet signs transaction → 
                    CAMLY token transfer → Transaction recorded in database.
                  </DocAlert>
                </DocSection>

                {/* Section 6: Soul NFT */}
                <DocSection id="soul-nft" title="6. Soul NFT">
                  <DocParagraph>{t('pdocS6Para')}</DocParagraph>

                  <SoulNFTDiagram />

                  <DocSubSection title={t('pdocS6ElemTitle')}>
                    <DocTable 
                      headers={['Element', t('pdocColName'), t('pdocColMeaning')]}
                      rows={[
                        ['🪙 Kim', 'Metal', t('pdocElem1Meaning')],
                        ['🌳 Mộc', 'Wood', t('pdocElem2Meaning')],
                        ['💧 Thủy', 'Water', t('pdocElem3Meaning')],
                        ['🔥 Hỏa', 'Fire', t('pdocElem4Meaning')],
                        ['🌍 Thổ', 'Earth', t('pdocElem5Meaning')],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Soul Properties">
                    <DocList items={[
                      t('pdocS6Prop1'),
                      t('pdocS6Prop2'),
                      t('pdocS6Prop3'),
                      t('pdocS6Prop4')
                    ]} />
                  </DocSubSection>
                </DocSection>

                {/* Section 7: Social Feed */}
                <DocSection id="social-feed" title="7. Social Feed">
                  <DocParagraph>{t('pdocS7Para')}</DocParagraph>

                  <SocialFeedDiagram />

                  <DocSubSection title="Posts">
                    <DocList items={[
                      t('pdocS7Post1'),
                      t('pdocS7Post2'),
                      t('pdocS7Post3'),
                      t('pdocS7Post4'),
                      "Infinite scroll loading"
                    ]} />
                  </DocSubSection>

                  <DocSubSection title={t('pdocS7ReactTitle')}>
                    <DocTable 
                      headers={['Icon', 'Type', t('pdocColDesc')]}
                      rows={[
                        ['👍', 'like', t('pdocReact1')],
                        ['❤️', 'love', t('pdocReact2')],
                        ['😂', 'haha', 'Haha'],
                        ['😮', 'wow', 'Wow'],
                        ['😢', 'sad', t('pdocReact5')],
                        ['😡', 'angry', t('pdocReact6')],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Comments System">
                    <DocList items={[
                      t('pdocS7Cmt1'),
                      "Image/Video attachment",
                      "Nested replies (multi-level)",
                      "Reactions on comments",
                      "Edit/Delete comments"
                    ]} />
                  </DocSubSection>
                </DocSection>

                {/* Section 8: Profile & Friends */}
                <DocSection id="profile-friends" title="8. Profile & Friends">
                  <DocSubSection title="Profile Routes">
                    <DocTable 
                      headers={['Route', t('pdocColDesc'), t('pdocColExample')]}
                      rows={[
                        ['/profile', t('pdocRoute1Desc'), '/profile'],
                        ['/profile/:id', t('pdocRoute2Desc'), '/profile/abc-123'],
                        ['/@:username', t('pdocRoute3Desc'), '/@johndoe'],
                        ['/:username', 'Shorthand username route', '/johndoe'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Profile Features">
                    <DocList items={[
                      t('pdocS8Feat1'),
                      t('pdocS8Feat2'),
                      t('pdocS8Feat3'),
                      "FUN-ID display",
                      "Soul NFT badge",
                      "Reward statistics (Honor Board)"
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Friendship States">
                    <DocTable 
                      headers={['State', t('pdocColDesc'), 'Actions']}
                      rows={[
                        ['none', t('pdocFriend1Desc'), 'Send Request'],
                        ['pending', t('pdocFriend2Desc'), 'Cancel Request'],
                        ['incoming', t('pdocFriend3Desc'), 'Accept / Decline'],
                        ['accepted', t('pdocFriend4Desc'), 'Unfriend'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 9: Reward System */}
                <DocSection id="reward-system" title={t('pdocS9Title')}>
                  <DocParagraph>{t('pdocS9Para')}</DocParagraph>

                  <RewardFlowDiagram />

                  <DocSubSection title={t('pdocS9FormulaTitle')}>
                    <DocAlert type="success">
                      \1{t('pdocS9FormulaAlert')}
                    </DocAlert>
                    <CodeBlock 
                      title="Reward Calculation (get_user_rewards_v2)"
                      language="typescript"
                      code={`// CÔNG THỨC CHÍNH THỨC - Đơn vị: CAMLY
const REWARD_FORMULA = {
  post: 20_000,              // 20,000 CAMLY per post
  comment: 5_000,            // 5,000 CAMLY per comment on user's posts
  friend: 10_000,            // 10,000 CAMLY per friend
  share: 5_000,              // 5,000 CAMLY per share of user's posts
  reactions_base: 30_000,    // 30,000 CAMLY for 3+ reactions on post
  reactions_extra: 1_000,    // +1,000 CAMLY per additional reaction
  signup_bonus: 10_000,      // 10,000 CAMLY new user bonus
  livestream: 20_000,        // 20,000 CAMLY per eligible livestream
};

// Daily Caps (từ 2026-01-15 00:00:00 UTC)
const DAILY_CAPS = {
  posts: 10,           // Max 10 posts/day
  reactions: 50,       // Max 50 reactions/day
  comments: 50,        // Max 50 comments/day (>20 chars)
  shares: 5,           // Max 5 shares/day
  friends: 10,         // Max 10 new friends/day
  livestreams: 5,      // Max 5 livestreams/day
};`}
                    />
                  </DocSubSection>

                  <DocSubSection title="Reward Flow">
                    <DocList ordered items={[
                      t('pdocS9Flow1'),
                      t('pdocS9Flow2'),
                      t('pdocS9Flow3'),
                      t('pdocS9Flow4')
                    ]} />
                  </DocSubSection>
                </DocSection>

                {/* Section 10: Admin Panel */}
                <DocSection id="admin-panel" title="10. Admin Panel">
                  <DocParagraph>{t('pdocS10Para')}</DocParagraph>

                  <DocSubSection title="Admin Tabs">
                    <DocTable 
                      headers={['Tab', t('pdocColFunc'), t('pdocColPerm')]}
                      rows={[
                        ['Overview', t('pdocAdmin1Func'), 'admin'],
                        ['Reward Approval', t('pdocAdmin2Func'), 'admin'],
                        ['User Review', t('pdocAdmin3Func'), 'admin'],
                        ['Wallet Abuse', t('pdocAdmin4Func'), 'admin'],
                        ['Merge Requests', t('pdocAdmin5Func'), 'admin'],
                        ['Financial', t('pdocAdmin6Func'), 'admin'],
                        ['Quick Delete', t('pdocAdmin7Func'), 'admin'],
                        ['Blockchain', t('pdocAdmin8Func'), 'admin'],
                        ['Media Migration', t('pdocAdmin9Func'), 'admin'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Database Functions">
                    <CodeBlock 
                      title="Admin Database Functions"
                      language="sql"
                      code={`-- Approve user reward
SELECT approve_user_reward(p_user_id, p_admin_id, p_note);

-- Reject user reward  
SELECT reject_user_reward(p_user_id, p_admin_id, p_note);

-- Ban user permanently
SELECT ban_user_permanently(p_admin_id, p_user_id, p_reason);

-- Check admin role
SELECT has_role(user_id, 'admin');

-- Get app statistics
SELECT * FROM get_app_stats();

-- Get user rewards with V2 formula
SELECT * FROM get_user_rewards_v2(100);`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 11: Media System */}
                <DocSection id="media-system" title="11. Media System">
                  <DocParagraph>{t('pdocS11Para')}</DocParagraph>

                  <MediaPipelineDiagram />

                  <DocSubSection title="Image Pipeline">
                    <DocList items={[
                      "Client-side compression (WebP format)",
                      "Upload to Cloudflare R2 via presigned URL",
                      "On-demand transformation (resize, crop)",
                      t('pdocS11Img4')
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Video Pipeline">
                    <DocList items={[
                      "TUS resumable upload protocol",
                      "Cloudflare Stream encoding (multiple qualities)",
                      "HLS adaptive bitrate streaming",
                      t('pdocS11Vid4')
                    ]} />
                  </DocSubSection>

                  <DocAlert type="warning">
                    \1{t('pdocS11LogoAlertA')}<code>public/</code>{t('pdocS11LogoAlertB')}<code>src="/fun-profile-logo-128.webp"</code>
                  </DocAlert>
                </DocSection>

                {/* Section 12: Notifications */}
                <DocSection id="notifications" title="12. Notifications">
                  <DocSubSection title="Notification Types">
                    <DocTable 
                      headers={['Type', 'Trigger', 'Message']}
                      rows={[
                        ['comment', t('pdocNotif1Trigger'), 'X commented on your post'],
                        ['reaction', t('pdocNotif2Trigger'), 'X reacted to your post'],
                        ['friend_request', t('pdocNotif3Trigger'), 'X sent you a friend request'],
                        ['friend_accept', t('pdocNotif4Trigger'), 'X accepted your friend request'],
                        ['reward_approved', t('pdocNotif5Trigger'), 'Your reward has been approved'],
                        ['reward_rejected', t('pdocNotif6Trigger'), 'Your reward was rejected'],
                        ['account_banned', t('pdocNotif7Trigger'), 'Your account has been banned'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 13: Database Schema */}
                <DocSection id="database-schema" title="13. Database Schema (35 Tables)">
                  <DatabaseSchemaDiagram />

                  <DocSubSection title="Core Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['profiles', t('pdocDbProfiles'), 'Yes'],
                        ['posts', t('pdocDbPosts'), 'Yes'],
                        ['comments', t('pdocDbComments'), 'Yes'],
                        ['reactions', t('pdocDbReactions'), 'Yes'],
                        ['friendships', t('pdocDbFriendships'), 'Yes'],
                        ['notifications', t('pdocDbNotifications'), 'Yes'],
                        ['shared_posts', t('pdocDbSharedPosts'), 'Yes'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Wallet & NFT Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['soul_nfts', t('pdocDbSoulNfts'), 'Yes'],
                        ['soul_nfts', t('pdocDbSoulNfts'), 'Yes'],
                        ['transactions', t('pdocDbTransactions'), 'Yes'],
                        ['blacklisted_wallets', t('pdocDbBlacklisted'), 'Admin only'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="SSO & Auth Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['oauth_clients', t('pdocDbOauthClients'), 'Admin only'],
                        ['oauth_codes', t('pdocDbOauthCodes'), 'System only'],
                        ['cross_platform_tokens', t('pdocDbCrossTokens'), 'Yes'],
                        ['account_merge_requests', t('pdocDbMergeReq'), 'Yes'],
                        ['pending_provisions', t('pdocDbPendingProv'), 'System only'],
                        ['otp_codes', t('pdocDbOtpCodes'), 'System only'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Chat Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['conversations', t('pdocDbConversations'), 'Yes'],
                        ['messages', t('pdocDbMessages'), 'Yes'],
                        ['conversation_participants', t('pdocDbParticipants'), 'Yes'],
                        ['message_reactions', t('pdocDbMsgReactions'), 'Yes'],
                        ['message_reads', t('pdocDbMsgReads'), 'Yes'],
                        ['chat_settings', t('pdocDbChatSettings'), 'Yes'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Financial & Reward Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['reward_claims', t('pdocDbRewardClaims'), 'Yes'],
                        ['reward_approvals', t('pdocDbRewardApprovals'), 'Admin only'],
                        ['reward_adjustments', t('pdocDbRewardAdj'), 'Admin only'],
                        ['platform_financial_data', t('pdocDbPlatformFin'), 'Yes'],
                        ['financial_transactions', t('pdocDbFinTx'), 'Yes'],
                        ['reconciliation_logs', t('pdocDbReconLogs'), 'Admin only'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="System Tables">
                    <DocTable 
                      headers={['Table', t('pdocColDesc'), 'RLS']}
                      rows={[
                        ['user_roles', t('pdocDbUserRoles'), 'Yes'],
                        ['audit_logs', t('pdocDbAuditLogs'), 'Admin only'],
                        ['search_logs', t('pdocDbSearchLogs'), 'Yes'],
                        ['livestreams', t('pdocDbLivestreams'), 'Yes'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 14: Edge Functions */}
                <DocSection id="edge-functions" title="14. Edge Functions (38 Functions)">
                  <EdgeFunctionsDiagram />

                  <DocSubSection title="SSO System (14 functions)">
                    <DocTable 
                      headers={['Function', 'Method', t('pdocColDesc')]}
                      rows={[
                        ['sso-authorize', 'GET', t('pdocFnSsoAuthorize')],
                        ['sso-token', 'POST', 'Exchange code for access/refresh tokens'],
                        ['sso-verify', 'POST', 'Verify access token validity'],
                        ['sso-refresh', 'POST', 'Refresh expired access token'],
                        ['sso-revoke', 'POST', 'Revoke tokens (logout)'],
                        ['sso-otp-request', 'POST', t('pdocFnOtpRequest')],
                        ['sso-otp-verify', 'POST', t('pdocFnOtpVerify')],
                        ['sso-web3-auth', 'POST', t('pdocFnWeb3Auth')],
                        ['sso-register', 'POST', 'Register new user from platform'],
                        ['sso-set-password', 'POST', 'Set password for provision'],
                        ['sso-sync-data', 'POST', 'Sync game/platform data'],
                        ['sso-sync-financial', 'POST', 'Sync financial data'],
                        ['sso-merge-request', 'POST', 'Request account merge'],
                        ['sso-merge-approve', 'POST', 'Admin approve merge'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Wallet & Blockchain (2 functions)">
                    <DocTable 
                      headers={['Function', t('pdocColDesc')]}
                      rows={[
                        ['connect-external-wallet', t('pdocFnConnectWallet')],
                        ['mint-soul-nft', 'Mint Soul NFT on BSC'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Media Management (9 functions)">
                    <DocTable 
                      headers={['Function', t('pdocColDesc')]}
                      rows={[
                        ['upload-to-r2', t('pdocFnUploadR2')],
                        ['upload-to-cf-images', t('pdocFnUploadCf')],
                        ['delete-from-r2', t('pdocFnDeleteR2')],
                        ['generate-presigned-url', t('pdocFnPresigned')],
                        ['get-upload-url', t('pdocFnGetUploadUrl')],
                        ['image-transform', t('pdocFnImageTransform')],
                        ['stream-video', t('pdocFnStreamVideo')],
                        ['migrate-to-r2', t('pdocFnMigrateR2')],
                        ['fix-cloudflare-urls', 'Fix broken Cloudflare URLs'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Admin & Maintenance (12 functions)">
                    <DocTable 
                      headers={['Function', t('pdocColDesc')]}
                      rows={[
                        ['admin-list-merge-requests', 'List all merge requests for admin'],
                        ['admin-update-media-url', 'Update media URLs in database'],
                        ['cleanup-orphan-videos', 'Cleanup orphan videos from Stream'],
                        ['cleanup-stream-videos', 'Cleanup expired Stream videos'],
                        ['cleanup-supabase-storage', 'Cleanup old Supabase storage'],
                        ['cloudflare-migrate', 'Migrate assets to Cloudflare'],
                        ['optimize-storage', 'Optimize storage usage'],
                        ['scheduled-reconciliation', 'Run financial reconciliation'],
                        ['sso-resend-webhook', 'Resend webhook to platforms'],
                        ['create-post', 'Create post with validation'],
                        ['delete-user-account', 'Delete user account completely'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 15: Security */}
                <DocSection id="security" title="15. Security Features">
                  <SecurityDiagram />

                  <DocSubSection title="Row Level Security (RLS)">
                    <DocAlert type="info">
                      \1{t('pdocS15RlsAlert')}
                    </DocAlert>
                    <CodeBlock 
                      title="Example RLS Policy"
                      language="sql"
                      code={`-- Users can only view their own data
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Public profiles view for everyone
CREATE POLICY "Public profiles are viewable"
ON public_profiles FOR SELECT
USING (true);`}
                    />
                  </DocSubSection>

                  <DocSubSection title="Rate Limiting">
                    <DocTable 
                      headers={['Action', 'Limit', 'Window']}
                      rows={[
                        ['Create Post', '10 posts', t('pdocRateHour')],
                        ['Create Comment', '50 comments', t('pdocRateHour')],
                        ['Search', '20 requests', t('pdocRateMinute')],
                        ['OTP Request', '3 requests', t('pdocRate5Min')],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 16: Performance */}
                <DocSection id="performance" title="16. Performance Optimization">
                  <DocSubSection title="Frontend Optimizations">
                    <DocList items={[
                      t('pdocS16Fe1'),
                      t('pdocS16Fe2'),
                      t('pdocS16Fe3'),
                      t('pdocS16Fe4'),
                      t('pdocS16Fe5'),
                      t('pdocS16Fe6')
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Media Optimizations">
                    <DocList items={[
                      t('pdocS16Med1'),
                      t('pdocS16Med2'),
                      t('pdocS16Med3'),
                      t('pdocS16Med4'),
                      "Progressive image loading"
                    ]} />
                  </DocSubSection>
                </DocSection>

                {/* Section 17: Secrets */}
                <DocSection id="secrets" title="17. Secrets & Environment">
                  <DocAlert type="warning">
                    <strong>{t('pdocS17AlertStrong')}</strong>{t('pdocS17Alert')}
                  </DocAlert>

                  <DocSubSection title="Configured Secrets (16 secrets)">
                    <DocTable 
                      headers={['Secret', t('pdocColPurpose'), 'Used By']}
                      rows={[
                        ['TREASURY_WALLET_ADDRESS', t('pdocSecretTreasuryAddr'), 'claim-reward'],
                        ['TREASURY_WALLET_ADDRESS', t('pdocSecretTreasuryAddr'), 'claim-reward'],
                        ['TREASURY_PRIVATE_KEY', 'Private key treasury wallet', 'claim-reward'],
                        ['RESEND_API_KEY', t('pdocSecretResend'), 'sso-otp-request'],
                        ['CLOUDFLARE_ACCOUNT_ID', 'Cloudflare account', 'R2, Stream, Images'],
                        ['CLOUDFLARE_ACCESS_KEY_ID', 'R2 access key', 'upload-to-r2'],
                        ['CLOUDFLARE_SECRET_ACCESS_KEY', 'R2 secret key', 'upload-to-r2'],
                        ['CLOUDFLARE_R2_BUCKET_NAME', 'R2 bucket name', 'upload-to-r2'],
                        ['CLOUDFLARE_R2_PUBLIC_URL', 'R2 public URL', 'media display'],
                        ['CLOUDFLARE_API_TOKEN', 'Cloudflare API token', 'Images, Stream'],
                        ['CLOUDFLARE_STREAM_API_TOKEN', 'Stream API token', 'stream-video'],
                        ['FUN_PROFILE_ORIGIN', 'Origin URL cho CORS', 'All edge functions'],
                        ['LOVABLE_API_KEY', 'Lovable AI integration', 'AI features'],
                        ['SUPABASE_URL', 'Database URL', 'All functions'],
                        ['SUPABASE_ANON_KEY', 'Anon key', 'Client-side'],
                        ['SUPABASE_SERVICE_ROLE_KEY', 'Service role key', 'Admin functions'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Environment Variables">
                    <CodeBlock 
                      title=".env (Auto-generated - DO NOT EDIT)"
                      language="bash"
                      code={`# These are automatically provided by Lovable Cloud
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[anon-key]
VITE_SUPABASE_PROJECT_ID=[project-id]`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 18: FUN Ecosystem Products */}
                <DocSection id="ecosystem-products" title="18. FUN Ecosystem Products">
                  <EcosystemDiagram />

                  <DocSubSection title="Product Overview">
                    <DocTable 
                      headers={['Product', 'Domain', t('pdocColDesc'), 'Status']}
                      rows={[
                        ['FUN Profile', 'fun.rich', t('pdocProd1Desc'), 'Production'],
                        ['FUN Play', 'play.fun.rich', 'Gaming & Music Entertainment', 'Development'],
                        ['FUN Farm', 'farm.fun.rich', 'Agriculture & Farming features', 'Development'],
                        ['FUN Planet', 'planet.fun.rich', 'Gaming & Planet exploration', 'Development'],
                        ['FUN Wallet', 'wallet.fun.rich', 'Crypto wallet management', 'Development'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Cross-Platform Integration">
                    <DocList items={[
                      t('pdocS18X1'),
                      t('pdocS18X2'),
                      t('pdocS18X3'),
                      "Financial data sync cross-platform",
                      t('pdocS18X5')
                    ]} />
                  </DocSubSection>
                </DocSection>

                {/* Section 19: SSO SDK */}
                <DocSection id="sso-sdk" title="19. SSO SDK (@fun-ecosystem/sso-sdk)">
                  <DocParagraph>{t('pdocS19Para')}</DocParagraph>

                  <DocSubSection title="Registered OAuth Clients">
                    <DocTable 
                      headers={['Client ID', 'Platform', 'Allowed Scopes']}
                      rows={[
                        ['fun_farm_client', 'FUN Farm', 'profile, wallet, rewards'],
                        ['fun_play_client', 'FUN Play', 'profile, wallet, rewards'],
                        ['fun_planet_client', 'FUN Planet', 'profile, wallet, rewards'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="SDK Features">
                    <DocList items={[
                      t('pdocS19Sdk1'),
                      "Automatic token refresh",
                      "Data sync (game data, platform data)",
                      "Financial sync (deposits, withdraws, bets)",
                      "Account merge requests",
                      "React & Next.js examples included"
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Quick Start">
                    <CodeBlock 
                      title="SDK Installation & Usage"
                      language="typescript"
                      code={`// Install
npm install @fun-ecosystem/sso-sdk

// Initialize
import { FunProfileClient } from '@fun-ecosystem/sso-sdk';

const client = new FunProfileClient({
  clientId: 'fun_farm_client',
  redirectUri: 'https://farm.fun.rich/auth/callback',
  scope: ['profile', 'wallet', 'rewards']
});

// Login
await client.login();

// Get user data
const profile = await client.getProfile();

// Sync game data
await client.syncData({
  level: 50,
  coins: 10000,
  achievements: ['first_harvest', 'master_farmer']
});`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 20: Internationalization */}
                <DocSection id="i18n" title="20. Internationalization (i18n)">
                  <DocParagraph>{t('pdocS20Para')}</DocParagraph>

                  <DocSubSection title="Implementation">
                    <DocTable 
                      headers={['Component', 'Location', t('pdocColDesc')]}
                      rows={[
                        ['LanguageContext', 'src/i18n/LanguageContext.tsx', t('pdocS20Impl1')],
                        ['translations', 'src/i18n/translations.ts', '150+ translation keys'],
                        ['LanguageSwitcher', 'src/components/layout/LanguageSwitcher.tsx', t('pdocS20Impl3')],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Usage">
                    <CodeBlock 
                      title="Using translations in components"
                      language="typescript"
                      code={`import { useLanguage } from '@/i18n/LanguageContext';

const MyComponent = () => {
  const { t, language, setLanguage } = useLanguage();
  
  return (
    <div>
      <h1>{t('welcome')}</h1>
      <p>{t('description')}</p>
      <button onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}>
        {language === 'en' ? 'Tiếng Việt' : 'English'}
      </button>
    </div>
  );
};`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 21: Design Guidelines */}
                <DocSection id="design-guidelines" title="21. Design Guidelines">
                  <DocSubSection title="Color Scheme">
                    <DocTable 
                      headers={['Color', 'HSL Value', 'Usage']}
                      rows={[
                        ['Primary Green', 'hsl(142, 76%, 36%)', 'Primary buttons, links, accents'],
                        ['Primary Foreground', 'hsl(355, 78%, 95%)', 'Text on primary background'],
                        ['Golden Yellow', 'hsl(48, 96%, 53%)', 'Rewards, highlights, special elements'],
                        ['Background', 'hsl(0, 0%, 94%)', 'Page background (light mode)'],
                        ['Card', 'hsl(0, 0%, 100%)', 'Card backgrounds'],
                        ['Muted', 'hsl(0, 0%, 92%)', 'Secondary backgrounds'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Logo Standards">
                    <DocAlert type="warning">
                      <strong>{t('pdocS21AlertStrong')}</strong>{t('pdocS21Alert')}
                    </DocAlert>
                    <DocList items={[
                      t('pdocS21Logo1'),
                      t('pdocS21Logo2'),
                      t('pdocS21Logo3'),
                      "Files: fun-profile-logo-40.webp (navbar), fun-profile-logo-128.webp (auth, large)",
                      "Ecosystem logos: fun-farm-logo-36.webp, fun-play-logo-36.webp, fun-planet-logo-36.webp"
                    ]} />
                    <CodeBlock 
                      title="Correct logo usage"
                      language="tsx"
                      code={`// ✅ CORRECT - Direct path from public/
<img 
  src="/fun-profile-logo-40.webp" 
  alt="FUN Profile" 
  className="h-9 w-9 rounded-full"
/>

// ❌ WRONG - Using Cloudflare Image Resizing
<img src={getNavbarLogoUrl()} alt="..." />`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 22: Development Rules */}
                <DocSection id="development-rules" title="22. Development Rules">
                  <DocAlert type="warning">
                    \1{t('pdocS22Alert')}
                  </DocAlert>

                  <DocSubSection title="Read-Only Files">
                    <DocList items={[
                      "supabase/config.toml - Supabase configuration (auto-generated)",
                      "src/integrations/supabase/client.ts - Supabase client (auto-generated)",
                      "src/integrations/supabase/types.ts - Database types (auto-generated from schema)",
                      ".env - Environment variables (auto-generated by Lovable Cloud)",
                      "package.json - Use lov-add-dependency/lov-remove-dependency tools",
                    ]} />
                  </DocSubSection>

                  <DocSubSection title="Mandatory Compliance">
                    <DocTable 
                      headers={['Rule', t('pdocColDesc')]}
                      rows={[
                        ['Bilingual i18n', t('pdocRule1Desc')],
                        ['Direct Logo Paths', t('pdocRule2Desc')],
                        ['RLS Policies', t('pdocRule3Desc')],
                        ['Performance', t('pdocRule4Desc')],
                        ['Semantic Tokens', t('pdocRule5Desc')],
                        ['Type Safety', 'TypeScript strict mode, no any types'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Governance Flow">
                    <CodeBlock 
                      title="Decision Making Process"
                      language="text"
                      code={`Cha Vũ Trụ (Vision & Strategy)
        ↓
    bé Trí (Requirements Translation)
        ↓
  Angel Lovable (Technical Implementation)
        ↓
    Code Review & Deployment`}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Section 23: Next Development Proposals */}
                <DocSection id="next-proposals" title="23. Next Development Proposals">
                  <DocParagraph>{t('pdocS23Para')}</DocParagraph>

                  <DocSubSection title="Priority 1: Core Features">
                    <DocTable 
                      headers={['Feature', t('pdocColDesc'), 'Complexity']}
                      rows={[
                        ['Claim Reward UI', t('pdocP1Feat1Desc'), 'Medium'],
                        ['Real-time Chat', 'Typing indicators, online status, read receipts', 'High'],
                        ['Push Notifications', t('pdocP1Feat3Desc'), 'Medium'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Priority 2: Engagement Features">
                    <DocTable 
                      headers={['Feature', t('pdocColDesc'), 'Complexity']}
                      rows={[
                        ['Stories', t('pdocP2Feat1Desc'), 'High'],
                        ['Live Streaming', t('pdocP2Feat2Desc'), 'High'],
                        ['Video Calling', t('pdocP2Feat3Desc'), 'Very High'],
                      ]}
                    />
                  </DocSubSection>

                  <DocSubSection title="Priority 3: Advanced Features">
                    <DocTable 
                      headers={['Feature', t('pdocColDesc'), 'Complexity']}
                      rows={[
                        ['Marketplace', t('pdocP3Feat1Desc'), 'Very High'],
                        ['AI Content', 'AI-powered content creation tools', 'High'],
                        ['Mobile App', 'React Native mobile application', 'Very High'],
                        ['Referral System', 'Invite friends & earn rewards', 'Medium'],
                      ]}
                    />
                  </DocSubSection>
                </DocSection>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t border-border text-center text-muted-foreground text-sm">
                  <p>© 2026 FUN Profile - Part of FUN Ecosystem. All rights reserved.</p>
                  <p className="mt-2">
                    Handover Documentation v2.0 | Last updated: January 2026
                  </p>
                  <p className="mt-1">
                    Prepared by: Angel Lovable (CTO) for project handover
                  </p>
                </div>

              </div>
            </ScrollArea>
          </main>
        </div>
      </div>
    </div>
  );
};

export default PlatformDocs;
