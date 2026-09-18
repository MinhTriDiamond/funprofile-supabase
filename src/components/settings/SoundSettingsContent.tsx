import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Volume2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserVolume, setUserVolume, playCappedSound } from '@/lib/soundPlayback';
import { usePetState, updatePetSettings } from '@/modules/pet/hooks/usePetState';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';

const SoundSettingsContent = () => {
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const { data: pet } = usePetState();
  const qc = useQueryClient();

  const [celebrationOn, setCelebrationOn] = useState(true);
  const [petVoiceOn, setPetVoiceOn] = useState(true);
  const [volume, setVolume] = useState(60);

  useEffect(() => {
    try {
      setCelebrationOn(localStorage.getItem('celebration_muted') !== 'true');
    } catch { /* ignore */ }
    setVolume(Math.round(getUserVolume(0.6) * 100));
  }, []);

  useEffect(() => {
    if (pet) setPetVoiceOn(pet.voice_enabled);
  }, [pet?.voice_enabled, pet]);

  const handleCelebrationToggle = (v: boolean) => {
    setCelebrationOn(v);
    try {
      if (v) localStorage.removeItem('celebration_muted');
      else localStorage.setItem('celebration_muted', 'true');
    } catch { /* ignore */ }
  };

  const handlePetVoiceToggle = async (v: boolean) => {
    if (!userId || !pet) return;
    setPetVoiceOn(v);
    try {
      await updatePetSettings(userId, { voice_enabled: v });
      qc.invalidateQueries({ queryKey: ['pet-state', userId] });
    } catch (e) {
      setPetVoiceOn(!v);
      toast.error((e as Error).message);
    }
  };

  const handleVolume = (vals: number[]) => {
    const v = vals[0] ?? 60;
    setVolume(v);
    setUserVolume(v / 100);
  };

  const handlePreview = () => {
    playCappedSound('/sounds/rich-1.mp3', { maxMs: 3000 });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="w-5 h-5" />
            {t('settingsTabSound')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Label htmlFor="snd-celebration" className="text-sm font-medium">
                {t('soundEnableCelebration')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('soundEnableCelebrationDesc')}
              </p>
            </div>
            <Switch id="snd-celebration" checked={celebrationOn} onCheckedChange={handleCelebrationToggle} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Label htmlFor="snd-pet" className="text-sm font-medium">
                {t('soundEnablePet')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('soundEnablePetDesc')}
              </p>
            </div>
            <Switch
              id="snd-pet"
              checked={petVoiceOn}
              onCheckedChange={handlePetVoiceToggle}
              disabled={!pet}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('soundVolume')}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{volume}%</span>
            </div>
            <Slider value={[volume]} min={0} max={100} step={5} onValueChange={handleVolume} />
          </div>

          <Button variant="outline" size="sm" onClick={handlePreview} className="gap-2">
            <Play className="w-4 h-4" />
            {t('soundPreview')}
          </Button>

          <p className="text-xs text-muted-foreground italic">
            {t('soundCappedNote')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SoundSettingsContent;
