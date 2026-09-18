import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MysteryBoxInventory } from '@/modules/mystery-box/components/MysteryBoxInventory';
import { MysteryBoxShop } from '@/modules/mystery-box/components/MysteryBoxShop';
import { MysteryBoxHistoryTab } from '@/modules/mystery-box/components/MysteryBoxHistoryTab';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { BackToHomeBar, BackToHomeCTA } from '@/components/layout/BackToHome';

const STORAGE_KEY = 'mystery-box-tab';

export default function MysteryBoxPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'inventory';
    return localStorage.getItem(STORAGE_KEY) || 'inventory';
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, tab); }, [tab]);

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-4xl mx-auto px-4 py-4 pb-32 space-y-5">
          <BackToHomeBar />

          <header className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-amber-500" />
                {t('mysteryBox')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Mở hộp để nhận Light Score, CAMLY, vật phẩm Pet và nhiều phần thưởng khác.
              </p>
            </div>
            <a
              href="/treasury"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Xem Treasury công khai →
            </a>
          </header>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="inventory">{t('mysteryBoxInventory')}</TabsTrigger>
              <TabsTrigger value="shop">{t('mysteryBoxShop')}</TabsTrigger>
              <TabsTrigger value="history">{t('mysteryBoxHistory')}</TabsTrigger>
            </TabsList>
            <TabsContent value="inventory"><MysteryBoxInventory /></TabsContent>
            <TabsContent value="shop"><MysteryBoxShop /></TabsContent>
            <TabsContent value="history"><MysteryBoxHistoryTab /></TabsContent>
          </Tabs>

          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
