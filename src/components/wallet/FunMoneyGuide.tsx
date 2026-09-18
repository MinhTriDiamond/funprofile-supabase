import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, FileText, Coins, Shield, Wallet, ChevronDown, ChevronUp, Bot, CheckCircle2, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const STORAGE_KEY = 'fun-money-guide-dismissed';

export function FunMoneyGuide() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  });

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(STORAGE_KEY, next ? 'false' : 'true');
  };

  const steps = [
    { icon: FileText, title: t('funMoneyStep1Title'), desc: t('funMoneyStep1Desc'), role: 'user' as const },
    { icon: BarChart3, title: t('funMoneyStep2Title'), desc: t('funMoneyStep2Desc'), role: 'system' as const },
    { icon: Coins, title: t('funMoneyStep3Title'), desc: t('funMoneyStep3Desc'), role: 'user' as const },
    { icon: Shield, title: t('funMoneyStep4Title'), desc: t('funMoneyStep4Desc'), role: 'admin' as const },
    { icon: Bot, title: t('funMoneyStep5Title'), desc: t('funMoneyStep5Desc'), role: 'system' as const },
    { icon: Wallet, title: t('funMoneyStep6Title'), desc: t('funMoneyStep6Desc'), role: 'user' as const },
  ];

  const roleColors = {
    user: 'bg-primary/10 text-primary',
    admin: 'bg-amber-500/10 text-amber-600',
    system: 'bg-emerald-500/10 text-emerald-600',
  };

  const roleBadge = {
    user: { label: 'User', color: 'bg-primary/15 text-primary' },
    admin: { label: 'GOV', color: 'bg-amber-500/15 text-amber-700' },
    system: { label: 'Auto', color: 'bg-emerald-500/15 text-emerald-700' },
  };

  return (
    <Card className="shadow-md border-border overflow-hidden h-fit">
      <CardHeader
        className="pb-3 border-b border-border cursor-pointer select-none"
        onClick={toggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-600" />
            </div>
            {t('funMoneyGuideTitle')}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); toggle(); }}>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-1">
            {Object.entries(roleBadge).map(([key, { label, color }]) => (
              <span key={key} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${color}`}>
                {label}
              </span>
            ))}
          </div>

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex gap-3 items-start">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${roleColors[step.role]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${roleBadge[step.role].color}`}>
                      {roleBadge[step.role].label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
                </div>
              </div>
            );
          })}

          {/* Flow summary */}
          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-foreground">{t('funMoneyFlowSummary')}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground flex-wrap">
              <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">Hoạt động</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 font-medium">Epoch Snapshot</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">1× Claim</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-700 font-medium">3/3 GOV</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 font-medium">Auto Submit</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">Activate & Claim</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center italic pt-1">
            {t('funMoneyGuideTip')}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
