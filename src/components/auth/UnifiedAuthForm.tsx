import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logger from '@/lib/logger';
import { EmailOtpLogin } from './EmailOtpLogin';
import { WalletLogin } from './WalletLogin';
import { SocialLogin } from './SocialLogin';
import { ClassicEmailLogin } from './ClassicEmailLogin';
import { Mail, Wallet, Users, Loader2, Sparkles, KeyRound } from 'lucide-react';
import { getDeviceHash, FINGERPRINT_VERSION } from '@/utils/deviceFingerprint';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';

interface UnifiedAuthFormProps {
  ssoFlow?: boolean;
}

export const UnifiedAuthForm = ({ ssoFlow = false }: UnifiedAuthFormProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { evaluateAsync } = usePplpEvaluate();
  const [activeTab, setActiveTab] = useState('email');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStep, setSetupStep] = useState<'wallet' | 'complete' | null>(null);

  const handleNewUserSetup = async (userId: string, hasExternalWallet: boolean) => {
    setIsSettingUp(true);

    try {
      // law_of_light đã được xử lý ở handleAuthSuccess
      setSetupStep('complete');
      toast.success(t('accountSetupComplete'));
      
      // Small delay to show completion state
      await new Promise(resolve => setTimeout(resolve, 800));

      // Kiểm tra lại trạng thái law_of_light
      const { data: profile } = await supabase
        .from('profiles')
        .select('law_of_light_accepted')
        .eq('id', userId)
        .single();

      if (profile?.law_of_light_accepted) {
        navigate('/');
      } else {
        navigate('/law-of-light');
      }
    } catch (error) {
      console.error('[Setup] Setup error:', error);
      navigate('/');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleAuthSuccess = async (userId: string, isNewUser: boolean, hasExternalWallet = false) => {
    // Verify session is properly set before proceeding
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      logger.error('[Auth] No session found after auth success');
      toast.error(t('authErrorGeneric'));
      return;
    }

    logger.debug('[Auth] Session verified for user:', userId, 'isNewUser:', isNewUser);

    // Fire-and-forget: Log login IP + device fingerprint
    getDeviceHash()
      .then(deviceHash => {
        supabase.functions.invoke('log-login-ip', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { device_hash: deviceHash, fingerprint_version: FINGERPRINT_VERSION },
        });
      })
      .catch(e => logger.warn('[Auth] Failed to log IP:', e));

    // Fire-and-forget: Sync law_of_light from localStorage
    const lawOfLightPending = localStorage.getItem('law_of_light_accepted_pending');
    if (lawOfLightPending === 'true') {
      localStorage.removeItem('law_of_light_accepted_pending');
      Promise.resolve(
        supabase.from('profiles').update({
          law_of_light_accepted: true,
          law_of_light_accepted_at: new Date().toISOString()
        }).eq('id', userId)
      )
        .then(() => logger.debug('[Auth] law_of_light synced'))
        .catch(e => logger.warn('[Auth] law_of_light sync failed:', e));
    }

    if (isNewUser) {
      evaluateAsync({ action_type: 'new_user_bonus', reference_id: userId });
      
      if (ssoFlow) {
        toast.success(t('welcomeNewUser'));
        return;
      }
      await handleNewUserSetup(userId, hasExternalWallet);
    } else {
      if (ssoFlow) {
        return;
      }

      // Navigate immediately, check law_of_light in parallel
      const { data: profile } = await supabase
        .from('profiles')
        .select('law_of_light_accepted')
        .eq('id', userId)
        .single();

      if (profile?.law_of_light_accepted) {
        navigate('/');
      } else {
        navigate('/law-of-light');
      }
    }
  };

  // Callback handlers for each auth method
  const handleOtpSuccess = (userId: string, isNewUser: boolean) => {
    handleAuthSuccess(userId, isNewUser, false); // No external wallet
  };

  const handleWalletSuccess = (userId: string, isNewUser: boolean) => {
    handleAuthSuccess(userId, isNewUser, true); // Has external wallet
  };

  const handleSocialSuccess = (userId: string, isNewUser: boolean) => {
    handleAuthSuccess(userId, isNewUser, false); // No external wallet
  };

  const handleClassicSuccess = (userId: string, isNewUser: boolean) => {
    handleAuthSuccess(userId, isNewUser, false); // No external wallet
  };

  // Show setup progress overlay - simplified for performance
  if (isSettingUp) {
    return (
      <div className="w-full max-w-md relative">
        <div className="relative p-2 rounded-3xl bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-500 shadow-lg">
          <Card className="relative border-0 overflow-hidden rounded-2xl bg-card/80">
            <CardContent className="p-8">
              <div className="text-center space-y-6 py-8">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
                  <Sparkles className="text-primary-foreground" size={40} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">
                    {t('welcomeNewUser')}
                  </h3>
                  
                  <div className="space-y-3 mt-6">
                    <SetupStepIndicator
                      step="wallet"
                      currentStep={setupStep}
                      label={t('creatingWallet')}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg relative">
      {/* Outer Frame - Hologram gradient */}
      <div 
        className="relative hologram-border p-[4px] rounded-3xl"
        style={{
          boxShadow: '0 0 25px rgba(147, 51, 234, 0.3), 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)'
        }}
      >
        
        <Card className="relative border-0 overflow-hidden rounded-[20px] bg-card/80 shadow-inner p-2">
          <CardHeader className="pb-4">
            <CardTitle className="hologram-text text-4xl font-bold text-center">
              {t('lightCloakWelcome')}
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground text-base mt-2">
              {t('lightCloakDescription')}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6 bg-muted/50 p-1.5 rounded-full border border-purple-500/30">
                <TabsTrigger 
                  value="email" 
                  className="flex items-center gap-1.5 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-md transition-colors text-sm sm:text-base font-semibold text-purple-700"
                >
                  <Mail size={16} />
                  <span className="hidden sm:inline">OTP</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="wallet"
                  className="flex items-center gap-1.5 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-md transition-colors text-sm sm:text-base font-semibold text-purple-700"
                >
                  <Wallet size={16} />
                  <span className="hidden sm:inline">{t('authMethodWallet')}</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="social"
                  className="flex items-center gap-1.5 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-md transition-colors text-sm sm:text-base font-semibold text-purple-700"
                >
                  <Users size={16} />
                  <span className="hidden sm:inline">{t('authMethodSocial')}</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="classic"
                  className="flex items-center gap-1.5 rounded-full data-[state=active]:bg-card data-[state=active]:shadow-md transition-colors text-sm sm:text-base font-semibold text-purple-700"
                >
                  <KeyRound size={16} />
                  <span className="hidden sm:inline">{t('classicLogin')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="mt-0">
                <EmailOtpLogin onSuccess={handleOtpSuccess} />
              </TabsContent>

              <TabsContent value="wallet" className="mt-0">
                {activeTab === 'wallet' ? <WalletLogin onSuccess={handleWalletSuccess} /> : null}
              </TabsContent>

              <TabsContent value="social" className="mt-0">
                <SocialLogin onSuccess={handleSocialSuccess} />
              </TabsContent>

              <TabsContent value="classic" className="mt-0">
                <ClassicEmailLogin onSuccess={handleClassicSuccess} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Helper component for setup progress - simplified styles
const SetupStepIndicator = ({ 
  step, 
  currentStep, 
  label 
}: { 
  step: 'wallet'; 
  currentStep: 'wallet' | 'complete' | null; 
  label: string;
}) => {
  const stepOrder = ['wallet', 'complete'];
  const currentIndex = currentStep ? stepOrder.indexOf(currentStep) : -1;
  const stepIndex = stepOrder.indexOf(step);
  
  const isActive = currentStep === step;
  const isComplete = currentIndex > stepIndex;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl ${
      isActive ? 'bg-primary/10 border border-primary/20' : 
      isComplete ? 'bg-primary/5' : 'bg-muted'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        isComplete ? 'bg-primary text-primary-foreground' :
        isActive ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/20 text-muted-foreground'
      }`}>
        {isComplete ? '✓' : isActive ? <Loader2 className="animate-spin" size={16} /> : '○'}
      </div>
      <span className={`text-sm ${
        isActive ? 'text-primary font-medium' : 
        isComplete ? 'text-primary' : 'text-muted-foreground'
      }`}>
        {label}
      </span>
    </div>
  );
};
