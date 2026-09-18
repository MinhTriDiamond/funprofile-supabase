import { Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { Shield, User, Bell, Monitor, Volume2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lazyWithChunkRecovery } from '@/lib/appUpdateRecovery';


const SecuritySettingsContent = lazyWithChunkRecovery(
  () => import('@/components/settings/SecuritySettingsContent'),
  'SecuritySettingsContent',
);
const SoundSettingsContent = lazyWithChunkRecovery(
  () => import('@/components/settings/SoundSettingsContent'),
  'SoundSettingsContent',
);
const PetSettingsContent = lazyWithChunkRecovery(
  () => import('@/components/settings/PetSettingsContent'),
  'PetSettingsContent',
);

const TABS = [
  { key: 'security', label: 'Bảo mật', icon: Shield },
  { key: 'sound', label: 'Âm thanh', icon: Volume2, i18n: 'settingsTabSound' as const },
  { key: 'pet', label: 'Linh thú', icon: Sparkles, i18n: 'settingsTabPet' as const },
  { key: 'account', label: 'Tài khoản', icon: User },
  { key: 'notifications', label: 'Thông báo', icon: Bell },
  { key: 'display', label: 'Hiển thị', icon: Monitor },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PlaceholderTab = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
    <p className="text-lg font-medium">{label}</p>
    <p className="text-sm mt-1">Sắp ra mắt</p>
  </div>
);

const Settings = () => {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const activeTab: TabKey = TABS.some(t => t.key === tab) ? (tab as TabKey) : 'security';

  const setTab = (key: TabKey) => {
    navigate(`/settings/${key}`, { replace: true });
  };

  const fallback = (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'security':
        return <Suspense fallback={fallback}><SecuritySettingsContent /></Suspense>;
      case 'sound':
        return <Suspense fallback={fallback}><SoundSettingsContent /></Suspense>;
      case 'pet':
        return <Suspense fallback={fallback}><PetSettingsContent /></Suspense>;
      case 'account':
        return <PlaceholderTab label="Tài khoản" />;
      case 'notifications':
        return <PlaceholderTab label="Thông báo" />;
      case 'display':
        return <PlaceholderTab label="Hiển thị" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Cài đặt</h1>

          {/* Mobile: horizontal scrollable tabs */}
          {isMobile ? (
            <div className="flex gap-1 overflow-x-auto pb-3 mb-4 -mx-4 px-4 scrollbar-none">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    activeTab === t.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex gap-6">
            {/* Desktop sidebar */}
            {!isMobile && (
              <nav className="w-56 flex-shrink-0">
                <div className="sticky top-0 space-y-1">
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                        activeTab === t.key
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </nav>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              {renderContent()}
            </div>
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default Settings;
