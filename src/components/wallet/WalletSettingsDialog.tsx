import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface WalletSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WalletSettingsDialog = ({ open, onOpenChange }: WalletSettingsDialogProps) => {
  const { t } = useLanguage();
  const [showBalance, setShowBalance] = useState(true);
  const [currency, setCurrency] = useState('USD');
  const [autoLock, setAutoLock] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('wallet_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setShowBalance(parsed.showBalance ?? true);
        setCurrency(parsed.currency ?? 'USD');
        setAutoLock(parsed.autoLock ?? false);
        setNotifications(parsed.notifications ?? true);
      } catch { /* localStorage parse — safe to ignore, use defaults */ }
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('wallet_settings', JSON.stringify({
      showBalance,
      currency,
      autoLock,
      notifications,
    }));
    toast.success(t('wsdSavedToast'));
    onOpenChange(false);
  };

  const handleResetSettings = () => {
    setShowBalance(true);
    setCurrency('USD');
    setAutoLock(false);
    setNotifications(true);
    localStorage.removeItem('wallet_settings');
    toast.success(t('wsdResetToast'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('wsdTitle')}</DialogTitle>
          <DialogDescription>
            {t('wsdDescription')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {/* Display Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t('setTabDisplay')}</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="show-balance" className="flex flex-col gap-1">
                <span>{t('wsdShowBalance')}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {t('wsdShowBalanceDesc')}
                </span>
              </Label>
              <Switch
                id="show-balance"
                checked={showBalance}
                onCheckedChange={setShowBalance}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t('wsdCurrency')}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">{t('wsdCurrencyUsd')}</SelectItem>
                  <SelectItem value="VND">{t('wsdCurrencyVnd')}</SelectItem>
                  <SelectItem value="EUR">{t('wsdCurrencyEur')}</SelectItem>
                  <SelectItem value="GBP">{t('wsdCurrencyGbp')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Security Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t('setTabSecurity')}</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-lock" className="flex flex-col gap-1">
                <span>{t('wsdAutoLock')}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {t('wsdAutoLockDesc')}
                </span>
              </Label>
              <Switch
                id="auto-lock"
                checked={autoLock}
                onCheckedChange={setAutoLock}
              />
            </div>
          </div>

          <Separator />

          {/* Notification Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t('setTabNotifications')}</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications" className="flex flex-col gap-1">
                <span>{t('wsdTxNotifications')}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {t('wsdTxNotificationsDesc')}
                </span>
              </Label>
              <Switch
                id="notifications"
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t('wsdAdvanced')}</h3>
            
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => toast.info(t('wsdFeatureInDevelopment'))}
            >
              {t('wsdManageCustomNetworks')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => toast.info(t('wsdFeatureInDevelopment'))}
            >
              {t('wsdClearAppData')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-destructive"
              onClick={handleResetSettings}
            >
              {t('wsdResetDefaults')}
            </Button>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {t('cancel')}
            </Button>
            <Button onClick={handleSaveSettings} className="flex-1">
              {t('editPostBtnSave')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
