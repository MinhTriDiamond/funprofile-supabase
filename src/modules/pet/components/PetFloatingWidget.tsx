import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePetState } from '../hooks/usePetState';
import { usePetVoiceLine } from '../hooks/usePetVoiceLine';
import { PET_SPRITES, STAGE_NAMES, EVOLUTION_THRESHOLDS, nextThreshold, resolvePetSprite, resolveFrameSprite, resolveHatSprite, resolveAuraSprite, resolveAccessorySprite, getAccessoryPlacement } from '../lib/petAssets';
import { PetSettingsDialog } from './PetSettingsDialog';
import { usePetCosmetics } from '../hooks/usePetCosmetics';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { playCappedSound } from '@/lib/soundPlayback';

const RARITY_GLOW: Record<string, string> = {
  common: 'drop-shadow-[0_0_8px_rgba(148,163,184,0.5)]',
  rare: 'drop-shadow-[0_0_10px_rgba(59,130,246,0.65)]',
  epic: 'drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]',
  legendary: 'drop-shadow-[0_0_14px_rgba(245,158,11,0.8)]',
  cosmic: 'drop-shadow-[0_0_18px_rgba(236,72,153,0.9)]',
};

const HIDDEN_ROUTES = [/^\/auth/, /^\/live\//, /^\/host-live/, /^\/audience-live/];
const PET_POSITION_KEY = 'funprofile-pet-floating-position';
const PET_BUTTON_SIZE = 64;
const PET_DRAG_THRESHOLD = 8;
const PET_EDGE_PADDING = 8;
const PET_BOTTOM_CLEARANCE = 88;

function shouldHidePet(pathname: string): boolean {
  return HIDDEN_ROUTES.some((re) => re.test(pathname));
}

function playChime() {
  playCappedSound('/sounds/rich-1.mp3', { volume: 0.25 });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDefaultPetPosition() {
  return {
    x: 12,
    y: Math.max(PET_EDGE_PADDING, window.innerHeight - PET_BUTTON_SIZE - PET_BOTTOM_CLEARANCE),
  };
}

function loadPetPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(PET_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      // Kẹp lại theo viewport hiện tại để tránh Lumi nằm ngoài mép
      // khi user chuyển từ desktop sang điện thoại (vị trí cũ rất lớn).
      const maxX = Math.max(PET_EDGE_PADDING, window.innerWidth - PET_BUTTON_SIZE - PET_EDGE_PADDING);
      const maxY = Math.max(PET_EDGE_PADDING, window.innerHeight - PET_BUTTON_SIZE - PET_EDGE_PADDING);
      return {
        x: clamp(parsed.x, PET_EDGE_PADDING, maxX),
        y: clamp(parsed.y, PET_EDGE_PADDING, maxY),
      };
    }
  } catch {
    // Ignore broken saved positions and fall back to the default.
  }
  return null;
}


export function PetFloatingWidget() {
  const { userId, isAuthenticated } = useCurrentUser();
  const { t, language } = useLanguage();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();
  const equippedSkin = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'skin');
  const equippedFrame = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'background');
  const equippedHat = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'hat');
  const equippedAura = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'aura');
  const equippedAccessory = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'accessory');
  const glowClass = equippedSkin ? RARITY_GLOW[equippedSkin.catalog.rarity] : 'drop-shadow-[0_0_8px_rgba(255,200,100,0.4)]';
  const framePath = resolveFrameSprite(equippedFrame?.catalog.slug);
  const hatPath = resolveHatSprite(equippedHat?.catalog.slug);
  const auraPath = resolveAuraSprite(equippedAura?.catalog.slug);
  const accessoryPath = resolveAccessorySprite(equippedAccessory?.catalog.slug);

  const getVoiceLine = usePetVoiceLine();

  const [bubble, setBubble] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => loadPetPosition() || getDefaultPetPosition());
  const lastMoodRef = useRef<string | null>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });

  // Hide on certain routes
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handler);
    // Also listen to pushState (router internal navigations)
    const interval = setInterval(handler, 1000);
    return () => { window.removeEventListener('popstate', handler); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        const next = {
          x: clamp(prev.x, PET_EDGE_PADDING, window.innerWidth - PET_BUTTON_SIZE - PET_EDGE_PADDING),
          y: clamp(prev.y, PET_EDGE_PADDING, window.innerHeight - PET_BUTTON_SIZE - PET_EDGE_PADDING),
        };
        localStorage.setItem(PET_POSITION_KEY, JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showBubble = useCallback(async (mood: string, trigger: string) => {
    const line = await getVoiceLine(mood as 'happy', trigger);
    if (!line) return;
    const text = language === 'vi' ? line.text_vi : line.text_en;
    setBubble(text);
    setJumping(true);
    if (pet?.voice_enabled) playChime();
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), 5000);
    setTimeout(() => setJumping(false), 500);
  }, [getVoiceLine, language, pet?.voice_enabled]);

  // React to mood change
  useEffect(() => {
    if (!pet) return;
    if (lastMoodRef.current && lastMoodRef.current !== pet.mood) {
      const triggerMap: Record<string, string> = {
        happy: 'quest_completed',
        excited: 'donation_sent',
        sad: 'streak_break',
        hungry: 'inactive_24h',
        sleepy: 'midnight_utc',
        calm: 'login',
      };
      showBubble(pet.mood, triggerMap[pet.mood] || 'login');
    }
    lastMoodRef.current = pet.mood;
  }, [pet?.mood, pet, showBubble]);

  // Listen to mystery box open event for extra animation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ rarity?: string }>).detail;
      setJumping(true);
      if (pet?.voice_enabled) playChime();
      showBubble('excited', 'box_opened');
      setTimeout(() => setJumping(false), 1500);
      void detail;
    };
    window.addEventListener('pet-box-opened', handler as EventListener);
    return () => window.removeEventListener('pet-box-opened', handler as EventListener);
  }, [pet?.voice_enabled, showBubble]);

  if (!isAuthenticated || !userId || !pet || !pet.visible) return null;
  if (shouldHidePet(pathname)) return null;

  const sprite = resolvePetSprite(pet.evolution_stage, equippedSkin?.catalog.slug);
  const next = nextThreshold(pet.evolution_stage);
  const currentBase = EVOLUTION_THRESHOLDS[pet.evolution_stage] || 0;
  const xpProgress = next ? Math.min(100, ((pet.xp - currentBase) / (next - currentBase)) * 100) : 100;

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (bubble) {
      setBubble(null);
      return;
    }
    showBubble(pet.mood, 'login');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) > PET_DRAG_THRESHOLD) {
      dragRef.current.moved = true;
      suppressClickRef.current = true;
    }
    if (!dragRef.current.moved) return;

    const next = {
      x: clamp(event.clientX - dragRef.current.offsetX, PET_EDGE_PADDING, window.innerWidth - PET_BUTTON_SIZE - PET_EDGE_PADDING),
      y: clamp(event.clientY - dragRef.current.offsetY, PET_EDGE_PADDING, window.innerHeight - PET_BUTTON_SIZE - PET_EDGE_PADDING),
    };
    setPosition(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (dragRef.current.moved) {
      setPosition((prev) => {
        const next = {
          x: clamp(prev.x, PET_EDGE_PADDING, window.innerWidth - PET_BUTTON_SIZE - PET_EDGE_PADDING),
          y: clamp(prev.y, PET_EDGE_PADDING, window.innerHeight - PET_BUTTON_SIZE - PET_EDGE_PADDING),
        };
        localStorage.setItem(PET_POSITION_KEY, JSON.stringify(next));
        return next;
      });
    }
    dragRef.current.pointerId = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <>
      <div
        className="fixed z-40 pointer-events-none"
        style={{ left: position.x, top: position.y }}
      >
        <AnimatePresence>
          {bubble && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              className="pointer-events-auto absolute bottom-full left-0 mb-2 max-w-[200px] rounded-2xl bg-background border border-border shadow-lg px-3 py-2 text-xs text-foreground"
            >
              {bubble}
              <div className="absolute -bottom-1 left-6 w-2 h-2 bg-background border-r border-b border-border rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-auto relative group">
          <motion.button
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            animate={
              jumping
                ? { y: [0, -14, 0], rotate: [0, -8, 8, 0] }
                : pet.mood === 'sleepy'
                ? { rotate: [0, -3, 0, 3, 0] }
                : { y: [0, -3, 0] }
            }
            transition={{
              duration: jumping ? 0.5 : pet.mood === 'sleepy' ? 4 : 2.5,
              repeat: jumping ? 0 : Infinity,
              ease: 'easeInOut',
            }}
            className={cn(
              'block w-14 h-14 md:w-16 md:h-16 rounded-full cursor-grab active:cursor-grabbing touch-none select-none focus:outline-none focus:ring-2 focus:ring-primary',
              pet.mood === 'sad' && 'opacity-70',
              pet.mood === 'hungry' && 'grayscale-[0.3]',
            )}
            aria-label={pet.name}
          >
            {auraPath && (
              <img
                src={auraPath}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none -z-20 opacity-85 scale-110"
              />
            )}
            {framePath && (
              <img
                src={framePath}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none -z-10 opacity-90"
              />
            )}
            <img
              src={sprite}
              alt={pet.name}
              loading="lazy"
              width={64}
              height={64}
              className={cn('relative z-0 w-full h-full object-contain', glowClass)}
            />
            {hatPath && (
              <img
                src={hatPath}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-3/4 h-3/4 object-contain pointer-events-none z-10"
              />
            )}
            {accessoryPath && (() => {
              const p = getAccessoryPlacement(equippedAccessory?.catalog.slug);
              return (
                <img
                  src={accessoryPath}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className={cn('absolute left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none drop-shadow-sm', p.extraClass)}
                  style={{ top: p.top, width: p.width, height: p.width, zIndex: p.zIndex }}
                />
              );
            })()}

          </motion.button>

          {/* Settings button shown on hover */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border rounded-full p-1 shadow"
            aria-label={t('petSettingsTitle') || 'Pet settings'}
          >
            <Settings className="w-3 h-3" />
          </button>

          {/* XP progress ring */}
          {next && (
            <div className="absolute -bottom-1 left-0 right-0 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-pink-500 transition-all"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <PetSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pet={pet}
        userId={userId}
      />
    </>
  );
}
