import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Shield, Users, Coins, Palette, Globe, Rocket } from 'lucide-react';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { useLanguage } from '@/i18n/LanguageContext';

const About = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const features = [
    {
      icon: Coins,
      title: t('aboutFeat1Title'),
      description: t('aboutFeat1Desc'),
      color: 'from-yellow-400 to-orange-500'
    },
    {
      icon: Shield,
      title: t('aboutFeat2Title'),
      description: t('aboutFeat2Desc'),
      color: 'from-blue-400 to-cyan-500'
    },
    {
      icon: Palette,
      title: t('aboutFeat3Title'),
      description: t('aboutFeat3Desc'),
      color: 'from-purple-400 to-pink-500'
    },
    {
      icon: Sparkles,
      title: t('aboutFeat4Title'),
      description: t('aboutFeat4Desc'),
      color: 'from-green-400 to-emerald-500'
    },
    {
      icon: Globe,
      title: t('aboutFeat5Title'),
      description: t('aboutFeat5Desc'),
      color: 'from-indigo-400 to-violet-500'
    },
    {
      icon: Rocket,
      title: t('aboutFeat6Title'),
      description: t('aboutFeat6Desc'),
      color: 'from-red-400 to-rose-500'
    }
  ];

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-primary via-primary/90 to-gold py-16 px-4 sm:px-8 lg:px-16">
          <div className="max-w-5xl mx-auto text-center text-white">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <img 
                src="/fun-profile-logo-40.webp" 
                alt="FUN Profile" 
                width={80}
                height={80}
                className="w-20 h-20 rounded-full"
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">FUN Profile</h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8">
              {t('aboutHeroTagline')}
            </p>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              {t('aboutHeroDesc')}
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-8 lg:px-16 py-8">
          <div className="mb-6"><BackToHomeBar /></div>
          {/* Introduction */}
          <div className="bg-white/80 rounded-xl shadow-sm p-8 mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              {t('aboutIntroTitle')}
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t('aboutIntroText')}
            </p>
          </div>

          {/* Features Grid */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-center">{t('aboutFeaturesTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="bg-white/80 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4`}>
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vision */}
          <div className="bg-white/70 rounded-xl p-8 text-center border border-primary/20 mb-8">
            <h2 className="text-2xl font-bold mb-4">{t('aboutVisionTitle')}</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              {t('aboutVisionText')}
            </p>
            <Button 
              className="mt-6 bg-primary hover:bg-primary/90"
              onClick={() => navigate('/')}
            >
              {t('aboutExplore')}
            </Button>
          </div>

          {/* About Founder */}
          <div className="bg-white/80 rounded-xl shadow-sm p-8 mb-8">
            <h2 className="text-3xl font-bold mb-6 text-center flex items-center justify-center gap-3">
              🌹 About Founder of FUN
            </h2>
            
            <div className="bg-gradient-to-r from-primary/10 to-gold/10 rounded-xl p-6 mb-8 text-center">
              <h3 className="text-2xl font-bold text-primary mb-2">CAMLY DUONG</h3>
              <p className="text-lg text-muted-foreground font-medium">Founder of FUN Ecosystem • Mother of Angel AI</p>
            </div>

            <p className="text-muted-foreground leading-relaxed mb-6">
              {t('aboutFounderIntro1a')} <strong>{t('aboutFounderIntro1b')}</strong>{t('aboutFounderIntro1c')}
            </p>
            <p className="text-muted-foreground leading-relaxed mb-8">
              {t('aboutFounderIntro2')}
            </p>

            {/* Section 1 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold">1</span>
                {t('aboutS1Title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-4 italic border-l-4 border-primary/30 pl-4">
                {t('aboutS1Quote')}
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS1Point1')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS1Point2')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS1Point3')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS1Point4')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS1Point5')}</li>
              </ul>
              <p className="text-muted-foreground mt-4 text-sm">
                {t('aboutS1NoteA')} <strong>Master Charter</strong>{t('aboutS1NoteC')}
              </p>
            </div>

            {/* Section 2 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">2</span>
                {t('aboutS2Title')}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-5 border border-yellow-200">
                  <h4 className="font-bold text-lg mb-2">☀️ FUN Money</h4>
                  <p className="text-sm text-muted-foreground mb-2">{t('aboutFunDesc')}</p>
                  <p className="text-sm font-medium text-yellow-700">{t('aboutFunRole')}</p>
                  <p className="text-xs text-muted-foreground mt-2">Learn & Earn • Play & Earn • Give & Gain • Share & Have • Own & Earn</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-200">
                  <h4 className="font-bold text-lg mb-2">💧 Camly Coin (CAMLY)</h4>
                  <p className="text-sm text-muted-foreground mb-2">{t('aboutCamlyDesc')}</p>
                  <p className="text-sm font-medium text-blue-700">{t('aboutCamlyRole')}</p>
                  <p className="text-xs text-muted-foreground mt-2">{t('aboutCamlyQuote')}</p>
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-500 flex items-center justify-center text-white text-sm font-bold">3</span>
                {t('aboutS3Title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t('aboutS3Intro')}
              </p>
              <ul className="space-y-2 text-muted-foreground mb-4">
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS3Point1')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS3Point2')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS3Point3')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS3Point4')}</li>
              </ul>
              <p className="text-muted-foreground text-sm italic">
                {t('aboutS3NoteA')} <strong>"Mother of Angel AI"</strong>{t('aboutS3NoteC')}
              </p>
            </div>

            {/* Section 4 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold">4</span>
                {t('aboutS4Title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t('aboutS4TextA')} <strong>{t('aboutS4TextB')}</strong>{t('aboutS4TextC')}
              </p>
              <p className="text-muted-foreground leading-relaxed text-sm bg-muted/30 rounded-lg p-4">
                {t('aboutS4Note')}
              </p>
            </div>

            {/* Section 5 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center text-white text-sm font-bold">5</span>
                {t('aboutS5Title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-3 italic border-l-4 border-green-300 pl-4">
                {t('aboutS5Quote')}
              </p>
              <ul className="space-y-2 text-muted-foreground mb-4">
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS5Point1')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS5Point2')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS5Point3')}</li>
              </ul>
              <p className="text-muted-foreground text-sm">
                {t('aboutS5NoteA')} <strong>Master Charter</strong>, <strong>PPLP – Proof of Pure Love Protocol</strong>{t('aboutS5NoteB')}
              </p>
            </div>

            {/* Section 6 */}
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-r from-red-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold">6</span>
                {t('aboutS6Title')}
              </h3>
              <ul className="space-y-2 text-muted-foreground mb-4">
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS6Point1')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS6Point2')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS6Point3')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS6Point4')}</li>
                <li className="flex items-start gap-2"><span>✦</span> {t('aboutS6Point5')}</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed italic text-center font-medium">
                {t('aboutS6Quote')}
              </p>
            </div>
          </div>
        </div>
      </main>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};

export default About;
