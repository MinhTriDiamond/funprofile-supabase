// Mystery Box sprite assets - 5 tier
import common from '@/assets/mystery-box/box-common.png';
import rare from '@/assets/mystery-box/box-rare.png';
import epic from '@/assets/mystery-box/box-epic.png';
import legendary from '@/assets/mystery-box/box-legendary.png';
import cosmic from '@/assets/mystery-box/box-cosmic.png';
import type { BoxTier } from '../types';

export const BOX_SPRITES: Record<BoxTier, string> = {
  common,
  rare,
  epic,
  legendary,
  cosmic,
};
