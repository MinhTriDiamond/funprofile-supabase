import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { SEO } from '@/components/seo/SEO';

const NotFound = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <SEO titleKey="errors404Title" descriptionKey="errors404Description" />

      <header className="bg-white shadow-sm py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <img
            src="/fun-profile-logo-40.webp"
            alt="FUN Profile"
            width={40}
            height={40}
            className="w-10 h-10 rounded-full cursor-pointer"
            onClick={() => navigate('/')}
          />
          <span className="text-2xl font-bold text-primary">FUN Profile</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-lg">
          <div className="mb-8">
            <div className="text-[150px] leading-none font-bold text-gray-200 select-none">
              404
            </div>
            <div className="relative -mt-20">
              <div className="w-32 h-32 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-6xl">🔍</span>
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {t('errors404Title')}
          </h1>

          <p className="text-gray-600 mb-8">
            {t('errors404Description')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate('/')}
              className="bg-primary hover:bg-primary/90"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('errors404GoHome')}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('errors404GoBack')}
            </Button>
          </div>

          <div className="mt-12 pt-8 border-t">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">{t('errors404UsefulLinks')}</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <button onClick={() => navigate('/')} className="text-primary hover:underline text-sm">
                {t('home')}
              </button>
              <button onClick={() => navigate('/friends')} className="text-primary hover:underline text-sm">
                {t('friends')}
              </button>
              <button onClick={() => navigate('/leaderboard')} className="text-primary hover:underline text-sm">
                {t('leaderboard')}
              </button>
              <button onClick={() => navigate('/about')} className="text-primary hover:underline text-sm">
                {t('about')}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-sm text-gray-500">
        FUN Profile © 2025
      </footer>
    </div>
  );
};

export default NotFound;
