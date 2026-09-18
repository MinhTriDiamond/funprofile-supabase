import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePetState, updatePetSettings } from '@/modules/pet/hooks/usePetState';
import { PET_SPRITES, STAGE_NAMES, EVOLUTION_THRESHOLDS, nextThreshold } from '@/modules/pet/lib/petAssets';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const PetSettingsContent = () => {
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const { data: pet, isLoading } = usePetState();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [visible, setVisible] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (pet) {
      setName(pet.name);
      setVisible(pet.visible);
      setVoiceEnabled(pet.voice_enabled);
    }
  }, [pet]);

  if (isLoading || !pet || !userId) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sprite = PET_SPRITES[pet.evolution_stage] || PET_SPRITES[1];
  const next = nextThreshold(pet.evolution_stage);
  const currentBase = EVOLUTION_THRESHOLDS[pet.evolution_stage] || 0;
  const xpProgress = next ? Math.min(100, ((pet.xp - currentBase) / (next - currentBase)) * 100) : 100;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePetSettings(userId, {
        name: name.trim() || 'Lumi',
        visible,
        voice_enabled: voiceEnabled,
      });
      qc.invalidateQueries({ queryKey: ['pet-state', userId] });
      toast.success(t('petSettingsSaved') || 'Đã lưu');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetMood = async () => {
    setResetting(true);
    try {
      const { error } = await supabase
        .from('pet_states' as never)
        .update({ mood: 'calm' } as never)
        .eq('user_id', userId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['pet-state', userId] });
      toast.success(t('petResetMoodDone') || 'Đã đặt lại tâm trạng');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5" />
            {t('petSettingsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sprite + status */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <img
              src={sprite}
              alt={pet.name}
              className="w-20 h-20 object-contain drop-shadow-[0_0_12px_rgba(255,200,100,0.45)]"
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-lg truncate">{pet.name}</div>
              <div className="text-xs text-muted-foreground">
                {STAGE_NAMES[pet.evolution_stage]} • {t('petLevel')} {pet.level} • <span className="capitalize">{pet.mood}</span>
              </div>
              <div className="mt-2 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-pink-500 transition-all"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                XP {pet.xp}{next ? ` / ${next}` : ''}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pet-name-settings">{t('petName')}</Label>
            <Input
              id="pet-name-settings"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="Lumi"
            />
          </div>

          {/* Display toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Label htmlFor="pet-visible-settings" className="text-sm font-medium">
                {t('petDisplayOnScreen')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('petDisplayOnScreenDesc')}
              </p>
            </div>
            <Switch id="pet-visible-settings" checked={visible} onCheckedChange={setVisible} />
          </div>

          {/* Voice */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Label htmlFor="pet-voice-settings" className="text-sm font-medium">
                {t('soundEnablePet')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('soundEnablePetDesc')}
              </p>
            </div>
            <Switch id="pet-voice-settings" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? '...' : 'Lưu'}
            </Button>
            <Button variant="outline" onClick={handleResetMood} disabled={resetting} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              {resetting ? '...' : t('petResetMood')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PetSettingsContent;
