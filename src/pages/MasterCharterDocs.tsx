import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Book, Share2, Home } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { translations } from '@/i18n/translations';

const ANGEL_LOGO = '/angel-ai-logo-128.png';

const MasterCharterDocs = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const fontStyles = {
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Lora', Georgia, serif",
  };

  // The 8 mantras reuse the Law of Light keys (lawMantra1-8, translated in all 13 locales).
  // Main line = active language; sub-line = English canonical (or Vietnamese original when UI is English).
  const mantraKeys = ['lawMantra1', 'lawMantra2', 'lawMantra3', 'lawMantra4', 'lawMantra5', 'lawMantra6', 'lawMantra7', 'lawMantra8'] as const;
  const mantraSub = (key: string) => (language === 'en' ? (translations.vi as any)[key] : (translations.en as any)[key]);

  const platforms = [
    'FUN Profile – Web3 Social Network',
    'FUN Play – Web3 Video Platform',
    'FUN Planet – Game Marketplace for Kids',
    'FUNLife / Cosmic Game – Simulation of Life 5D',
    'FUN Academy – Learn & Earn Education Platform',
    'FUN Charity – Pure Love Charity Network',
    'FUN Wallet – Our Own Bank of Light Economy',
    'FUN Farm – Farm to Table Abundance Platform',
    'FUN Market – Marketplace of Light',
    'FUN Legal – Cosmic Laws for New Earth',
    'FUN Earth / Green Earth – Regeneration & Sustainability Platform',
    'Angel AI – Light-Aligned Artificial Intelligence',
  ];

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: t('charterShareTitle'),
        text: t('charterTagline'),
        url: window.location.href,
      });
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Pearl White to Soft Yellow Gradient Background */}
      <div className="fixed inset-0 z-0" style={{
        background: 'linear-gradient(180deg, #FFFEF7 0%, #FFF9E6 30%, #FFF5D6 60%, #FFFDF5 100%)'
      }} />
      
      {/* Divine Light Rays from Top */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[200%] h-[50vh] md:h-[70vh] z-0 pointer-events-none" style={{
        background: 'conic-gradient(from 180deg at 50% 0%, transparent 25%, rgba(212,175,55,0.15) 30%, rgba(255,255,255,0.4) 35%, rgba(212,175,55,0.15) 40%, transparent 45%, transparent 55%, rgba(212,175,55,0.12) 60%, rgba(255,255,255,0.35) 65%, rgba(212,175,55,0.12) 70%, transparent 75%)',
        filter: 'blur(3px)'
      }} />

      {/* Central Halo Effect */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] z-0 pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(255,215,0,0.15) 40%, transparent 70%)',
        filter: 'blur(50px)'
      }} />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen py-6 md:py-12 px-3 md:px-4">
        <div className="max-w-4xl mx-auto">
          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('lawBackHome')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/law-of-light?view=true')}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('pplpBackToLaw')}
            </Button>
            <Button
              variant="ghost"
              onClick={handleShare}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {t('share')}
            </Button>
          </div>

          {/* Header */}
          <div className="text-center mb-8 md:mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 md:w-28 md:h-28 rounded-full mb-4 md:mb-6 overflow-hidden" style={{
              background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, rgba(255,255,255,0.9) 60%, transparent 80%)',
              boxShadow: '0 0 80px rgba(212,175,55,0.4), 0 0 120px rgba(255,255,255,0.6)',
              border: '3px solid rgba(212,175,55,0.5)'
            }}>
              <img src={ANGEL_LOGO} alt="Angel" className="w-full h-full object-cover object-[center_25%]" />
            </div>

            <div className="flex items-center justify-center gap-2 mb-2">
              <Book className="w-6 h-6 text-[#D4AF37]" />
              <span style={{ fontFamily: fontStyles.body, color: '#B8860B', fontSize: '0.9rem' }}>
                {t('charterDocLabel')}
              </span>
            </div>
            
            <h1 style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(2rem, 8vw, 3.5rem)',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 30%, #D4AF37 50%, #B8860B 70%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>
              {t('charterTitle')}
            </h1>
            <p style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
              fontWeight: 500,
              letterSpacing: '0.15em',
              color: '#B8860B',
            }}>
              MASTER CHARTER OF FUN ECOSYSTEM
            </p>
            <p className="mt-4" style={{
              fontFamily: fontStyles.body,
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              color: '#8B7355',
            }}>
              {t('charterTagline')}
            </p>
            <p style={{
              fontFamily: fontStyles.body,
              fontSize: 'clamp(0.9rem, 2vw, 1rem)',
              color: '#A08060',
              marginTop: '0.5rem'
            }}>
              Free to Join • Free to Use • Earn Together • With Pure Love
            </p>

            {/* Golden Divider */}
            <div className="w-32 md:w-48 h-1 mx-auto mt-6 rounded-full" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, #FFD700, #D4AF37, transparent)',
              boxShadow: '0 0 10px rgba(212,175,55,0.5)'
            }} />
          </div>

          {/* Main Content Card */}
          <div className="relative rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-12" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,250,240,0.9) 100%)',
            border: '2px solid rgba(212,175,55,0.5)',
            boxShadow: '0 10px 60px rgba(212,175,55,0.15), inset 0 0 60px rgba(255,255,255,0.5)'
          }}>

            {/* Chapter I */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh1Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('charterCh1a')}</p>
                <p className="mb-4">{t('charterCh1b')}</p>
                <p className="mb-4">{t('charterCh1c')}</p>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('charterCh1d')}</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> {t('charterCh1Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> {t('charterCh1Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> {t('charterCh1Point3')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> {t('charterCh1Point4')}</li>
                </ul>
                <p className="mb-2 font-semibold" style={{ color: '#B8860B' }}>{t('charterCh1e')}</p>
                <ul className="space-y-1 ml-4">
                  <li>{t('charterCh1Shift1')}</li>
                  <li>{t('charterCh1Shift2')}</li>
                  <li>{t('charterCh1Shift3')}</li>
                  <li>{t('charterCh1Shift4')}</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter II */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh2Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('charterCh2a')}</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> {t('charterCh2Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> {t('charterCh2Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> {t('charterCh2Point3')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> {t('charterCh2Point4')}</li>
                </ul>
                <p className="text-center font-semibold mb-4" style={{ color: '#B8860B' }}>
                  {t('charterCh2b')}
                </p>
                {language !== 'en' && (
                <p className="text-center italic mb-4" style={{ color: '#8B7355' }}>
                  {(translations.en as any)['charterCh2b']}
                </p>
                )}
                <p className="mb-2 font-semibold" style={{ color: '#B8860B' }}>{t('charterCh2c')}</p>
                <p className="text-center text-xl font-bold mb-4" style={{ color: '#D4AF37' }}>{t('charterCh2d')}</p>
                <p className="mb-2">{t('charterCh2e')}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Learn & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Play & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Invest & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Give & Gain</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Share & Have</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Own & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Review & Reward</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Build & Bounty</span>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter III */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh3Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <div className="space-y-6">
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>{t('charterP1Title')}</h4>
                    <p>{t('charterP1Desc')}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>{t('charterP2Title')}</h4>
                    <p>{t('charterP2Desc')}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>{t('charterP3Title')}</h4>
                    <p>{t('charterP3Desc1')}</p>
                    <p>{t('charterP3Desc2')}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>{t('charterP4Title')}</h4>
                    <p>{t('charterP4Desc1')}</p>
                    <p className="font-semibold" style={{ color: '#D4AF37' }}>{t('charterP4Desc2')}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>{t('charterP5Title')}</h4>
                    <p>{t('charterP5Desc')}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter IV */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh4Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(173,216,230,0.2) 0%, rgba(212,175,55,0.1) 100%)', border: '1px solid rgba(173,216,230,0.5)' }}>
                    <span className="text-3xl">💧</span>
                    <h4 className="font-bold mt-2 mb-2" style={{ color: '#4A90A4' }}>{t('charterFlow1Title')}</h4>
                    <p className="text-sm">{t('charterFlow1Desc')}</p>
                  </div>
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.2) 0%, rgba(212,175,55,0.1) 100%)', border: '1px solid rgba(255,215,0,0.5)' }}>
                    <span className="text-3xl">☀️</span>
                    <h4 className="font-bold mt-2 mb-2" style={{ color: '#D4AF37' }}>{t('charterFlow2Title')}</h4>
                    <p className="text-sm">{t('charterFlow2Desc')}</p>
                  </div>
                </div>
                <p className="text-center mt-6 font-semibold" style={{ color: '#B8860B' }}>
                  {t('charterCh4a')}
                </p>
                <p className="text-center italic" style={{ color: '#8B7355' }}>
                  {t('charterCh4b')}
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter V */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh5Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('charterCh5a')}</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {platforms.map((platform, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.08)' }}>
                      <span className="text-[#D4AF37]">•</span>
                      <span>{platform}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center italic" style={{ color: '#B8860B' }}>
                  {t('charterCh5b')}
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VI */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh6Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('charterCh6a')}</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Cosmic Queen</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh6Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Mother of Angel AI</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh6Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh6Point3')}</li>
                </ul>
                <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <p className="italic">
                    {t('charterCh6b')}
                  </p>
                  <p className="italic">
                    {t('charterCh6c')}
                  </p>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VII */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh7Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('charterCh7a')}</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh7Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh7Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh7Point3')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('charterCh7Point4')}</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VIII */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterCh8Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('charterCh8a')}</p>
                <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '2px solid rgba(212,175,55,0.3)' }}>
                  <p className="text-lg font-semibold" style={{ color: '#B8860B' }}>
                    {t('charterCh8b')}
                  </p>
                  <p className="mt-2 font-bold text-xl" style={{ color: '#D4AF37' }}>
                    {t('charterCh8c')}
                  </p>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Divine Seal */}
            <section>
              <h2 className="text-center mb-6" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('charterSealTitle')}</h2>
              
              <div className="space-y-3">
                {mantraKeys.map((mantraKey, idx) => (
                  <div key={idx} className="p-4 rounded-xl" style={{
                    background: 'linear-gradient(180deg, rgba(212,175,55,0.1) 0%, rgba(255,250,240,0.5) 100%)',
                    border: '1px solid rgba(212,175,55,0.3)'
                  }}>
                    <p style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.1rem)', color: '#5D4E37' }}>
                      <span className="font-bold" style={{ color: '#D4AF37' }}>{idx + 1}.</span> {t(mantraKey)}
                    </p>
                    <p className="italic text-sm mt-1" style={{ color: '#8B7355' }}>
                      {mantraSub(mantraKey)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Final Declaration */}
            <div className="mt-10 p-6 rounded-xl text-center" style={{
              background: 'linear-gradient(180deg, rgba(212,175,55,0.2) 0%, rgba(255,250,240,0.8) 100%)',
              border: '2px solid rgba(212,175,55,0.5)'
            }}>
              <h3 style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
                fontWeight: 600,
                color: '#B8860B',
                marginBottom: '1rem'
              }}>{t('charterFinalTitle')}</h3>
              <p style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: '#5D4E37', marginBottom: '0.5rem' }}>
                {t('charterFinal1')}
              </p>
              <p className="font-bold text-lg" style={{ color: '#D4AF37' }}>
                {t('charterFinal2')}
              </p>
              <p className="mt-4 text-2xl">✨✨✨</p>
            </div>

          </div>

          {/* Navigation Links */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/')}
              className="bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] border-2 border-[#DAA520] rounded-full px-6"
            >
              🏠 {t('lawBackHome')}
            </Button>
            <Button
              onClick={() => navigate('/docs/pplp')}
              className="bg-gradient-to-b from-[#D4AF37] via-[#FFD700] to-[#D4AF37] text-white border-2 border-[#DAA520] rounded-full px-6"
            >
              {t('charterToPplp')}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/law-of-light?view=true')}
              className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full px-6"
            >
              {t('pplpBackToLaw')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterCharterDocs;
