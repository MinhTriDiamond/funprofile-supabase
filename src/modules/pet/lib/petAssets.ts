import stage1 from '@/assets/pet/lumi-stage-1.png';
import stage2 from '@/assets/pet/lumi-stage-2.png';
import stage3 from '@/assets/pet/lumi-stage-3.png';
import stage4 from '@/assets/pet/lumi-stage-4.png';
import stage5 from '@/assets/pet/lumi-stage-5.png';
import skinBasic from '@/assets/pet/skin-lumi-basic.png';
import skinAurora from '@/assets/pet/skin-lumi-aurora.png';
import skinPhoenix from '@/assets/pet/skin-lumi-phoenix.png';
import skinDragon from '@/assets/pet/skin-lumi-dragon.png';
import skinGalaxy from '@/assets/pet/skin-lumi-galaxy.png';
import skinPastel from '@/assets/pet/skin-lumi-pastel.png';
import skinForest from '@/assets/pet/skin-lumi-forest.png';
import skinOcean from '@/assets/pet/skin-lumi-ocean.png';
import frameSilver from '@/assets/pet/frame-silver.png';
import frameGold from '@/assets/pet/frame-gold.png';
import frameSakura from '@/assets/pet/frame-sakura.png';
import frameGalaxy from '@/assets/pet/frame-galaxy.png';
import hatCrown from '@/assets/pet/hat-crown.png';
import hatWitch from '@/assets/pet/hat-witch.png';
import hatHalo from '@/assets/pet/hat-halo.png';
import hatParty from '@/assets/pet/hat-party.png';
import auraFire from '@/assets/pet/aura-fire.png';
import auraIce from '@/assets/pet/aura-ice.png';
import auraRainbow from '@/assets/pet/aura-rainbow.png';
import accGlasses from '@/assets/pet/acc-glasses.png';
import accBowtie from '@/assets/pet/acc-bowtie.png';
import accWings from '@/assets/pet/acc-wings.png';

export const PET_SPRITES: Record<number, string> = {
  1: stage1,
  2: stage2,
  3: stage3,
  4: stage4,
  5: stage5,
};

export const SKIN_SPRITES: Record<string, string> = {
  lumi_basic: skinBasic,
  lumi_aurora: skinAurora,
  lumi_phoenix: skinPhoenix,
  lumi_dragon: skinDragon,
  lumi_galaxy: skinGalaxy,
  lumi_pastel: skinPastel,
  lumi_forest: skinForest,
  lumi_ocean: skinOcean,
};

export const FRAME_SPRITES: Record<string, string> = {
  frame_silver: frameSilver,
  frame_gold: frameGold,
  frame_sakura: frameSakura,
  frame_galaxy: frameGalaxy,
};

export const HAT_SPRITES: Record<string, string> = {
  hat_crown: hatCrown,
  hat_witch: hatWitch,
  hat_halo: hatHalo,
  hat_party: hatParty,
};

export const AURA_SPRITES: Record<string, string> = {
  aura_fire: auraFire,
  aura_ice: auraIce,
  aura_rainbow: auraRainbow,
};

export const ACCESSORY_SPRITES: Record<string, string> = {
  acc_glasses: accGlasses,
  acc_bowtie: accBowtie,
  acc_wings: accWings,
};

export const STAGE_NAMES: Record<number, string> = {
  1: 'Seed',
  2: 'Sprout',
  3: 'Glow',
  4: 'Star',
  5: 'Cosmic',
};

export const EVOLUTION_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 50,
  3: 200,
  4: 500,
  5: 1500,
};

export function nextThreshold(stage: number): number | null {
  if (stage >= 5) return null;
  return EVOLUTION_THRESHOLDS[stage + 1];
}

export function resolvePetSprite(stage: number, skinSlug?: string | null): string {
  if (skinSlug && SKIN_SPRITES[skinSlug]) return SKIN_SPRITES[skinSlug];
  return PET_SPRITES[stage] || PET_SPRITES[1];
}

export function resolveFrameSprite(slug?: string | null): string | null {
  if (!slug) return null;
  return FRAME_SPRITES[slug] || null;
}

export function resolveHatSprite(slug?: string | null): string | null {
  if (!slug) return null;
  return HAT_SPRITES[slug] || null;
}

export function resolveAuraSprite(slug?: string | null): string | null {
  if (!slug) return null;
  return AURA_SPRITES[slug] || null;
}

export function resolveAccessorySprite(slug?: string | null): string | null {
  if (!slug) return null;
  return ACCESSORY_SPRITES[slug] || null;
}

export interface AccessoryPlacement {
  top: string;
  width: string;
  zIndex: number;
  extraClass?: string;
}

/**
 * Vị trí riêng cho từng phụ kiện để không che mặt Lumi.
 * - bowtie: dưới cằm
 * - glasses: phủ vùng mắt
 * - wings: sau lưng, lớn hơn sprite
 */
export function getAccessoryPlacement(slug?: string | null): AccessoryPlacement {
  switch (slug) {
    case 'acc_bowtie':
      return { top: '82%', width: '42%', zIndex: 20 };
    case 'acc_glasses':
      return { top: '40%', width: '52%', zIndex: 25 };
    case 'acc_wings':
      return { top: '50%', width: '118%', zIndex: 5, extraClass: 'opacity-95' };
    default:
      return { top: '78%', width: '42%', zIndex: 20 };
  }
}

/**
 * Resolve sprite cho thẻ shop/inventory/preview theo đúng slot của item.
 * Trả null nếu chưa có asset cho slug đó — caller tự render fallback (icon Sparkles…).
 */
export function resolveItemSprite(
  slot: string,
  slug?: string | null,
  fallbackStage: number = 3,
): string | null {
  switch (slot) {
    case 'skin':
      return resolvePetSprite(fallbackStage, slug);
    case 'background':
      return resolveFrameSprite(slug);
    case 'hat':
      return resolveHatSprite(slug);
    case 'aura':
      return resolveAuraSprite(slug);
    case 'accessory':
      return resolveAccessorySprite(slug);
    default:
      return null;
  }
}

