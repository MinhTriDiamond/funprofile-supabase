import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { PetGuideLink } from './PetGuideLink';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { updatePetSettings, type PetState } from '../hooks/usePetState';
import { STAGE_NAMES } from '../lib/petAssets';
import { PetCosmeticInventory } from './PetCosmeticInventory';
import { usePetRename, petErrorToMessage } from '../hooks/usePublicPet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet: PetState & { last_renamed_at?: string | null };
  userId: string;
}

export function PetSettingsDialog({ open, onOpenChange, pet, userId }: Props) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [name, setName] = useState(pet.name);
  const [voiceEnabled, setVoiceEnabled] = useState(pet.voice_enabled);
  const [visible, setVisible] = useState(pet.visible);
  const [saving, setSaving] = useState(false);
  const renameMutation = usePetRename();

  const lastRenamedAt = pet.last_renamed_at ? new Date(pet.last_renamed_at) : null;
  const cooldownUntil = lastRenamedAt ? new Date(lastRenamedAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
  const nameLocked = !!cooldownUntil && cooldownUntil.getTime() > Date.now();
  const nameChanged = name.trim() !== (pet.name || '').trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      if (nameChanged) {
        if (nameLocked) {
          throw new Error('RENAME_COOLDOWN');
        }
        await renameMutation.mutateAsync(name.trim());
      }
      await updatePetSettings(userId, {
        voice_enabled: voiceEnabled,
        visible,
      });
      qc.invalidateQueries({ queryKey: ['pet-state', userId] });
      toast.success(t('petSettingsSaved') || 'Đã lưu');
      onOpenChange(false);
    } catch (e) {
      toast.error(petErrorToMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>{t('petSettingsTitle') || 'Linh thú của bạn'}</DialogTitle>
            <PetGuideLink className="text-xs shrink-0" />
          </div>
        </DialogHeader>

        <Tabs defaultValue="settings">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings">Cài đặt</TabsTrigger>
            <TabsTrigger value="cosmetics">Trang phục</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>{t('petStage') || 'Giai đoạn'}</span><span className="font-semibold">{STAGE_NAMES[pet.evolution_stage]}</span></div>
              <div className="flex justify-between"><span>{t('petLevel') || 'Cấp'}</span><span className="font-semibold">{pet.level}</span></div>
              <div className="flex justify-between"><span>XP</span><span className="font-semibold">{pet.xp}</span></div>
              <div className="flex justify-between"><span>{t('petMood') || 'Tâm trạng'}</span><span className="font-semibold capitalize">{pet.mood}</span></div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pet-name">{t('petName') || 'Tên'}</Label>
              <Input
                id="pet-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                minLength={2}
                disabled={nameLocked}
              />
              <p className="text-[11px] text-muted-foreground">
                {nameLocked && cooldownUntil
                  ? `Có thể đổi tên lại sau ngày ${cooldownUntil.toLocaleDateString('vi-VN')}.`
                  : 'Tên 2–20 ký tự. Mỗi 7 ngày chỉ đổi tên 1 lần.'}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pet-voice">{t('petVoiceToggle') || 'Bật âm thanh'}</Label>
              <Switch id="pet-voice" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pet-visible">{t('petVisibleToggle') || 'Hiển thị Lumi'}</Label>
              <Switch id="pet-visible" checked={visible} onCheckedChange={setVisible} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel') || 'Huỷ'}</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '...' : (t('save') || 'Lưu')}</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="cosmetics" className="py-2 max-h-[60vh] overflow-y-auto space-y-3">
            <Button asChild variant="outline" size="sm" className="w-full gap-2" onClick={() => onOpenChange(false)}>
              <Link to="/pet/shop">
                <ShoppingBag className="w-4 h-4" /> Mở Cửa hàng Lumi (CAMLY)
              </Link>
            </Button>
            <PetCosmeticInventory />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
