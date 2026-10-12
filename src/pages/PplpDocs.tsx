import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles, Share2, Home } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { translations } from '@/i18n/translations';

const ANGEL_LOGO = '/angel-ai-logo-128.png';

const PplpDocs = () => {
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

  const fivePillars = [
    { icon: '🌱', titleKey: 'pplpPillar1Title', qKey: 'pplpPillar1Q' },
    { icon: '💎', titleKey: 'pplpPillar2Title', qKey: 'pplpPillar2Q' },
    { icon: '💗', titleKey: 'pplpPillar3Title', qKey: 'pplpPillar3Q' },
    { icon: '🏗️', titleKey: 'pplpPillar4Title', qKey: 'pplpPillar4Q' },
    { icon: '🤝', titleKey: 'pplpPillar5Title', qKey: 'pplpPillar5Q' },
  ];

  const platformKeys = ['pplpPlatform1', 'pplpPlatform2', 'pplpPlatform3', 'pplpPlatform4', 'pplpPlatform5', 'pplpPlatform6'] as const;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Proof of Pure Love Protocol - FUN Ecosystem',
        text: t('pplpShareText'),
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
              <Sparkles className="w-6 h-6 text-[#D4AF37]" />
              <span style={{ fontFamily: fontStyles.body, color: '#B8860B', fontSize: '0.9rem' }}>
                {t('pplpSacredLabel')}
              </span>
            </div>
            
            <h1 style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(1.6rem, 6vw, 2.8rem)',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 30%, #D4AF37 50%, #B8860B 70%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem',
              lineHeight: 1.2
            }}>
              {t('pplpTitle1')}<br />{t('pplpTitle2')}
            </h1>
            <p style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(0.9rem, 2vw, 1.2rem)',
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: '#B8860B',
            }}>
              PROOF OF PURE LOVE PROTOCOL (PPLP)
            </p>
            <p className="mt-4" style={{
              fontFamily: fontStyles.body,
              fontSize: 'clamp(0.9rem, 2vw, 1rem)',
              color: '#8B7355',
            }}>
              {t('pplpTagline')}
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

            {/* Light Summary */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpSummaryTitle')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4 italic">
                  {t('pplpSummary1')}
                </p>
                <p className="mb-4">{t('pplpSummary2')}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  <span className="p-2 rounded-lg text-center font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: '#B8860B' }}>{t('pplpSummaryChip1')}</span>
                  <span className="p-2 rounded-lg text-center font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: '#B8860B' }}>{t('pplpSummaryChip2')}</span>
                  <span className="p-2 rounded-lg text-center font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: '#B8860B' }}>{t('pplpSummaryChip3')}</span>
                  <span className="p-2 rounded-lg text-center font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: '#B8860B' }}>{t('pplpSummaryChip4')}</span>
                </div>
                <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <p className="font-semibold" style={{ color: '#B8860B' }}>
                    {t('pplpSummary3')}
                  </p>
                  <p className="mt-2 italic">
                    {t('pplpSummary4')}
                  </p>
                </div>
                <p className="mt-4 text-center font-bold text-lg" style={{ color: '#D4AF37' }}>
                  {t('pplpSummary5')}
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 1 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS1Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS1a')}</p>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('pplpS1b')}</p>
                <p className="italic">{t('pplpS1c')}</p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 2 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS2Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS2a')}</p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(128,128,128,0.1)' }}>
                    <span className="font-mono">Proof of Work</span><span>{t('pplpProofEnergy')}</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(128,128,128,0.1)' }}>
                    <span className="font-mono">Proof of Stake</span><span>{t('pplpProofAssets')}</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(128,128,128,0.1)' }}>
                    <span className="font-mono">Proof of Authority</span><span>{t('pplpProofIdentity')}</span>
                  </div>
                </div>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('pplpS2b')}</p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
                    <span className="text-[#D4AF37]">✅</span><span className="font-bold" style={{ color: '#D4AF37' }}>Proof of Pure Love</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
                    <span className="text-[#D4AF37]">✅</span><span className="font-bold" style={{ color: '#D4AF37' }}>Proof of Unity Contribution</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
                    <span className="text-[#D4AF37]">✅</span><span className="font-bold" style={{ color: '#D4AF37' }}>Proof of Light</span>
                  </div>
                </div>
                <p className="italic text-center" style={{ color: '#8B7355' }}>
                  {t('pplpS2c')}
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 3 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS3Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <div className="p-6 rounded-xl mb-4" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '2px solid rgba(212,175,55,0.3)' }}>
                  <p className="font-semibold text-lg mb-2" style={{ color: '#B8860B' }}>{t('pplpS3a')}</p>
                  <p className="italic">
                    {t('pplpS3b')}
                  </p>
                </div>
                <p className="mb-2 font-semibold" style={{ color: '#B8860B' }}>{t('pplpS3c')}</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS3Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS3Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS3Point3')}</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 4 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS4Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS4a')}</p>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('pplpS4b')}</p>
                <div className="p-4 rounded-xl mb-4 text-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
                  <p className="font-bold text-lg" style={{ color: '#D4AF37' }}>
                    {t('pplpS4c')}
                  </p>
                </div>
                <p className="mb-2">{t('pplpS4d')}</p>
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  <span className="px-4 py-2 rounded-full font-bold" style={{ background: 'rgba(212,175,55,0.2)', color: '#D4AF37' }}>✅ Mint-to-Light</span>
                  <span className="px-4 py-2 rounded-full font-bold" style={{ background: 'rgba(212,175,55,0.2)', color: '#D4AF37' }}>✅ Mint-to-Unity</span>
                  <span className="px-4 py-2 rounded-full font-bold" style={{ background: 'rgba(212,175,55,0.2)', color: '#D4AF37' }}>✅ Mint-to-Contribution</span>
                </div>
                <p className="mb-2">{t('pplpS4e')}</p>
                <p className="font-semibold" style={{ color: '#B8860B' }}>{t('pplpS4f')}</p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 5 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS5Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS5a')}</p>
                <div className="p-4 rounded-xl mb-4 text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.2) 0%, rgba(255,250,240,0.5) 100%)', border: '2px solid rgba(212,175,55,0.4)' }}>
                  <p className="font-bold text-xl" style={{ color: '#D4AF37' }}>Proof of Light Contribution (POLC)</p>
                  <p className="italic mt-2" style={{ color: '#8B7355' }}>{t('pplpS5PolcSub')}</p>
                </div>
                <p className="mb-2">{t('pplpS5b')}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <span className="p-2 rounded-lg text-center" style={{ background: 'rgba(212,175,55,0.1)' }}>{t('pplpS5Chip1')}</span>
                  <span className="p-2 rounded-lg text-center" style={{ background: 'rgba(212,175,55,0.1)' }}>{t('pplpS5Chip2')}</span>
                  <span className="p-2 rounded-lg text-center" style={{ background: 'rgba(212,175,55,0.1)' }}>{t('pplpS5Chip3')}</span>
                  <span className="p-2 rounded-lg text-center" style={{ background: 'rgba(212,175,55,0.1)' }}>{t('pplpS5Chip4')}</span>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 6 - 5 Pillars */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS6Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS6a')}</p>
                <div className="space-y-4">
                  {fivePillars.map((pillar, idx) => (
                    <div key={idx} className="p-4 rounded-xl" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.1) 0%, rgba(255,250,240,0.5) 100%)', border: '1px solid rgba(212,175,55,0.3)' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{pillar.icon}</span>
                        <div>
                          <h4 className="font-bold" style={{ color: '#B8860B' }}>{t('pplpPillarLabel')} {idx + 1} — {t(pillar.titleKey as any)}</h4>
                          {language !== 'en' && (<span className="text-sm italic" style={{ color: '#8B7355' }}>{(translations.en as any)[pillar.titleKey]}</span>)}
                        </div>
                      </div>
                      <p className="ml-10 italic">{t(pillar.qKey as any)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-xl text-center" style={{ background: 'rgba(212,175,55,0.15)', border: '2px solid rgba(212,175,55,0.4)' }}>
                  <p className="font-bold" style={{ color: '#D4AF37' }}>{t('pplpS6Close')}</p>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 7 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS7Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS7a')}</p>
                <div className="p-6 rounded-xl mb-4 text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '2px solid rgba(212,175,55,0.3)' }}>
                  <p className="font-bold text-xl" style={{ color: '#D4AF37' }}>{t('pplpS7b')}</p>
                </div>
                <p className="mb-4">{t('pplpS7c')}</p>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>{t('pplpS7d')}</p>
                <p className="mb-2">{t('pplpS7e')}</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS7Point1')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS7Point2')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS7Point3')}</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> {t('pplpS7Point4')}</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 8 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS8Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS8a')}</p>
                <div className="grid md:grid-cols-2 gap-2 mb-4">
                  {platformKeys.map((platformKey, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.08)' }}>
                      <span className="text-[#D4AF37]">•</span>
                      <span>{t(platformKey)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-center font-semibold" style={{ color: '#B8860B' }}>
                  {t('pplpS8Close')}
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 9 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS9Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS9a')}</p>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(147,112,219,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '1px solid rgba(147,112,219,0.3)' }}>
                    <h4 className="font-bold text-lg mb-2" style={{ color: '#8B7355' }}>{t('pplpS9Key1Title')}</h4>
                    <p className="italic">{t('pplpS9Key1Desc')}</p>
                  </div>
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '1px solid rgba(212,175,55,0.3)' }}>
                    <h4 className="font-bold text-lg mb-2" style={{ color: '#D4AF37' }}>{t('pplpS9Key2Title')}</h4>
                    <p className="italic">{t('pplpS9Key2Desc')}</p>
                  </div>
                </div>
                <p className="text-center">{t('pplpS9b')}</p>
                <p className="text-center font-bold text-lg mt-2" style={{ color: '#D4AF37' }}>{t('pplpS9c')}</p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Section 10 */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpS10Title')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">{t('pplpS10a')}</p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <span className="text-[#D4AF37]">✅</span> {t('pplpS10Item1')}
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <span className="text-[#D4AF37]">✅</span> Universal Blessing Income
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <span className="text-[#D4AF37]">✅</span> {t('pplpS10Item3')}
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <span className="text-[#D4AF37]">✅</span> {t('pplpS10Item4')}
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <span className="text-[#D4AF37]">✅</span> {t('pplpS10Item5')}
                  </div>
                </div>
                <p className="mb-2">{t('pplpS10b')}</p>
                <p className="font-bold text-lg text-center" style={{ color: '#D4AF37' }}>{t('pplpS10c')}</p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Conclusion */}
            <section className="mb-10">
              <h2 className="text-center mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>{t('pplpEndTitle')}</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="text-center mb-4">{t('pplpEnd1')}</p>
                <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.2) 0%, rgba(255,250,240,0.8) 100%)', border: '2px solid rgba(212,175,55,0.5)' }}>
                  <p className="font-bold text-xl mb-2" style={{ color: '#D4AF37' }}>{t('pplpEnd2')}</p>
                  <p className="font-bold text-2xl" style={{ color: '#B8860B' }}>{t('pplpEnd3')}</p>
                </div>
                <p className="text-center mt-4 font-semibold" style={{ color: '#B8860B' }}>
                  {t('pplpEnd4')}
                </p>
                <p className="text-center font-semibold" style={{ color: '#B8860B' }}>
                  {t('pplpEnd5')}
                </p>
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
              }}>{t('pplpSealTitle')}</h2>
              
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
              onClick={() => navigate('/docs/master-charter')}
              className="bg-gradient-to-b from-[#D4AF37] via-[#FFD700] to-[#D4AF37] text-white border-2 border-[#DAA520] rounded-full px-6"
            >
              {t('pplpReadCharter')}
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

export default PplpDocs;
