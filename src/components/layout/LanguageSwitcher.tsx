import React, { memo, useState } from 'react';
import { useLanguage, ACTIVE_LANGUAGES } from '@/i18n/LanguageContext';
import { LANGUAGE_LIST } from '@/i18n/registry';
import { Globe, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'pill' | 'icon' | 'full' | 'dropdown';
}

const LanguageSwitcher = memo(({
  className,
  variant = 'pill'
}: LanguageSwitcherProps) => {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'vi' : 'en');
  };

  // Driven by i18n registry — adding a new file in `src/i18n/locales/` shows up here automatically.
  const currentLang =
    LANGUAGE_LIST.find((l) => l.code === language) ?? LANGUAGE_LIST.find((l) => l.code === 'en')!;

  // New dropdown variant with 13 languages
  if (variant === 'dropdown') {
    return (
      <div className={cn("relative", className)}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-primary/50 transition-all shadow-sm"
        >
          <img
            src={currentLang.flagUrl}
            alt={currentLang.nativeName}
            className="w-6 h-4 object-cover rounded-sm shadow-sm"
          />
          <span className="font-medium text-sm text-gray-700">{currentLang.nativeName}</span>
          <ChevronDown className={cn("w-4 h-4 text-gray-500 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown menu */}
            <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2 min-w-[200px] max-h-[400px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-1 px-2">
                {LANGUAGE_LIST.map((lang) => {
                  const isActive = ACTIVE_LANGUAGES.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      disabled={!isActive}
                      onClick={() => {
                        if (!isActive) return;
                        setLanguage(lang.code);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                        language === lang.code
                          ? 'bg-primary/10 text-primary font-medium'
                          : isActive
                            ? 'hover:bg-gray-100 text-gray-700'
                            : 'opacity-40 cursor-not-allowed text-gray-400'
                      )}
                      title={isActive ? lang.nativeName : `${lang.nativeName} — Coming soon`}
                    >
                      {lang.flagUrl && (
                        <img
                          src={lang.flagUrl}
                          alt={lang.nativeName}
                          className="w-5 h-4 object-cover rounded-sm shadow-sm"
                        />
                      )}
                      <span>{lang.nativeName}</span>
                      {!isActive && <span className="ml-auto text-[10px]">soon</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <button 
        onClick={toggleLanguage} 
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full",
          "bg-card hover:bg-primary/10 border border-border",
          "transition-all duration-300",
          "hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]",
          className
        )} 
        aria-label={`Switch to ${language === 'en' ? 'Vietnamese' : 'English'}`} 
        title={language === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'}
      >
        <Globe className="w-5 h-5 text-primary" />
        <span className="absolute -bottom-1 -right-1 text-xs font-bold text-primary">
          {language.toUpperCase()}
        </span>
      </button>
    );
  }

  if (variant === 'full') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="relative flex items-center bg-muted rounded-lg p-1">
          {/* Sliding background indicator */}
          <div 
            className={cn(
              "absolute h-[calc(100%-8px)] w-[calc(50%-4px)] bg-primary rounded-md",
              "transition-all duration-300 ease-out",
              "shadow-[0_0_12px_rgba(34,197,94,0.6)]",
              language === 'en' ? "left-1" : "left-[calc(50%+2px)]"
            )} 
          />
          <button 
            onClick={() => setLanguage('en')} 
            className={cn(
              "relative z-10 px-3 py-1 rounded-md text-sm font-medium",
              "transition-all duration-300 ease-out",
              language === 'en' ? "text-primary-foreground scale-105" : "text-muted-foreground hover:text-foreground"
            )}
          >
            EN
          </button>
          <button 
            onClick={() => setLanguage('vi')} 
            className={cn(
              "relative z-10 px-3 py-1 rounded-md text-sm font-medium",
              "transition-all duration-300 ease-out",
              language === 'vi' ? "text-primary-foreground scale-105" : "text-muted-foreground hover:text-foreground"
            )}
          >
            VI
          </button>
        </div>
      </div>
    );
  }

  // Default: pill variant
  return (
    <button 
      onClick={toggleLanguage} 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-card hover:bg-primary/10 border-2 border-yellow-400/50",
        "transition-all duration-300",
        "hover:border-yellow-400 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)]",
        "text-sm font-semibold",
        className
      )} 
      aria-label={`Switch to ${language === 'en' ? 'Vietnamese' : 'English'}`} 
      title={language === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'}
    >
      <Globe className="w-4 h-4 text-primary" />
      <span className={cn("transition-all duration-300", language === 'en' ? "text-primary" : "text-muted-foreground")}>
        EN
      </span>
      <span className="text-muted-foreground">/</span>
      <span className={cn("transition-all duration-300", language === 'vi' ? "text-primary" : "text-muted-foreground")}>
        VI
      </span>
    </button>
  );
});

LanguageSwitcher.displayName = 'LanguageSwitcher';
export default LanguageSwitcher;
