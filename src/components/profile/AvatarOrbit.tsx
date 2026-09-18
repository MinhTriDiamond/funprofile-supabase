import React, { useEffect, useRef, useState, useCallback } from 'react';
import diamondSrc from '@/assets/diamond-user.png';
import { X, Plus, Check, Pencil, GripVertical } from 'lucide-react';
import { PLATFORM_PRESETS, PLATFORM_ORDER } from './SocialLinksEditor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { toJson } from '@/utils/supabaseJsonHelpers';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// Static orbit — icons spread from bottom upward

export interface SocialLink {
  platform: string;
  label: string;
  url: string;
  color: string;
  favicon: string;
  avatarUrl?: string;
  /** The URL that was used to fetch the current avatarUrl — used for staleness detection */
  avatarSourceUrl?: string;
}

const ORBIT_RADIUS = 115;
const ORBIT_SIZE = 40;
const AVATAR_SIZE = 176;
// Wrapper lớn đủ chứa orbit không bị clip: 176 + (115+40)*2 = 486px
const WRAPPER_SIZE = AVATAR_SIZE + (ORBIT_RADIUS + ORBIT_SIZE) * 2;
const CENTER = WRAPPER_SIZE / 2; // 243px

// Cache the processed diamond so we only compute it once per session
let _cachedDiamondUrl: string | null = null;

function useTransparentDiamond(src: string) {
  const [dataUrl, setDataUrl] = useState<string>(_cachedDiamondUrl ?? src);
  useEffect(() => {
    if (_cachedDiamondUrl) {
      setDataUrl(_cachedDiamondUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) data[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);
        _cachedDiamondUrl = canvas.toDataURL('image/png');
        setDataUrl(_cachedDiamondUrl);
      } catch {
        // CORS or canvas taint — fallback to original src
        setDataUrl(src);
      }
    };
    img.onerror = () => setDataUrl(src);
    img.src = src;
  }, [src]);
  return dataUrl;
}

/**
 * Compute static angles spreading from bottom (180°) upward to both sides.
 * 1 icon → [180°]
 * 2 icons → [150°, 210°]
 * 3 icons → [140°, 180°, 220°]
 * etc.
 */
function computeAngles(n: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [180];
  const GAP = 35; // degrees between each icon
  const totalSpread = GAP * (n - 1);
  const startAngle = 180 - totalSpread / 2;
  return Array.from({ length: n }, (_, i) => startAngle + i * GAP);
}

function computeAddAngle(n: number): number {
  // Place the + button at the next position in the fan
  const angles = computeAngles(n + 1);
  return angles[angles.length - 1] ?? 180;
}

function angleToPos(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * ORBIT_RADIUS, y: -Math.cos(rad) * ORBIT_RADIUS };
}

interface AvatarOrbitProps {
  children: React.ReactNode;
  socialLinks?: SocialLink[];
  isOwner?: boolean;
  userId?: string;
  onLinksChanged?: (links: SocialLink[]) => void;
}

export function AvatarOrbit({ children, socialLinks = [], isOwner = false, userId, onLinksChanged }: AvatarOrbitProps) {
  const transparentDiamond = useTransparentDiamond(diamondSrc);
  // GUARD: chỉ cho phép write khi userId của profile đang xem KHỚP với user đang đăng nhập.
  // KHÔNG phụ thuộc vào prop isOwner (có thể stale khi chuyển profile nhanh) — chỉ dựa vào auth.
  // isOwner chỉ dùng cho UI (hiện nút Edit), không dùng cho điều kiện ghi DB.
  const { userId: authUserId } = useCurrentUser();
  const canWrite = !!userId && !!authUserId && userId === authUserId;

  // Static orbit — no animation, refs kept for drag compatibility
  const isOrbitHovered = useRef(false);
  const isDragging = useRef(false);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const baseAnglesRef = useRef<number[]>([]);

  // Edit state
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);

  // Pending new slot
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState('');
  // Show link input popup for a saved (but empty-url) link
  const [promptingPlatform, setPromptingPlatform] = useState<string | null>(null);
  const [promptUrl, setPromptUrl] = useState('');

  // Add picker
  const [showAddPicker, setShowAddPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder state
  const dragIndexRef = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [localLinks, setLocalLinks] = useState<SocialLink[]>(socialLinks);
  const localLinksRef = useRef<SocialLink[]>(socialLinks);
  // Track which userId the current localLinks belong to, to prevent cross-user writes
  const currentUserIdRef = useRef<string | undefined>(userId);
  const onLinksChangedRef = useRef(onLinksChanged);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onLinksChangedRef.current = onLinksChanged;
  }, [onLinksChanged]);

  const isCurrentProfileActive = useCallback(
    (targetUserId?: string) => Boolean(targetUserId) && isMountedRef.current && currentUserIdRef.current === targetUserId,
    []
  );

  const applyLinksUpdate = useCallback((targetUserId: string, links: SocialLink[]) => {
    if (!isCurrentProfileActive(targetUserId)) return;
    localLinksRef.current = links;
    setLocalLinks(links);
    onLinksChangedRef.current?.(links);
  }, [isCurrentProfileActive]);

  // Reset ALL state when userId changes to prevent cross-user data leaks
  useEffect(() => {
    currentUserIdRef.current = userId;
    localLinksRef.current = socialLinks;
    setLocalLinks(socialLinks);
    setSaving(false);
    // Reset all edit/popup states
    setEditingPlatform(null);
    setEditUrl('');
    setPendingPlatform(null);
    setPendingUrl('');
    setPromptingPlatform(null);
    setPromptUrl('');
    setShowAddPicker(false);
    setHoveredPlatform(null);
    setDraggingIndex(null);
    dragIndexRef.current = null;
  }, [userId]);

  // Sync localLinks when props change (but only if userId hasn't changed)
  useEffect(() => {
    if (currentUserIdRef.current === userId) {
      localLinksRef.current = socialLinks;
      setLocalLinks(socialLinks);
    }
  }, [socialLinks, userId]);

  useEffect(() => {
    localLinksRef.current = localLinks;
  }, [localLinks]);

  const usedPlatforms = new Set(localLinks.map((l) => l.platform));
  const availablePlatforms = PLATFORM_ORDER.filter((p) => !usedPlatforms.has(p));

  const UNAVATAR_PLATFORMS = ['youtube', 'twitter', 'tiktok', 'telegram', 'instagram', 'github', 'linkedin'];
  const NO_AVATAR_PLATFORMS: string[] = [];
  const BAD_AVATAR_URLS = ['funplay-og-image', 'static.xx.fbcdn.net/rsrc.php', 'unavatar.io/facebook', 'unavatar.io/youtube', 'unavatar.io/telegram', 'unavatar.io/tiktok'];
  const GENERIC_PLACEHOLDER_PATTERNS = ['storage.googleapis.com', 'social-images', 'default-avatar', 'placeholder'];

  /** Check if an avatarUrl is a known generic/placeholder image */
  const isGenericAvatar = (url: string | undefined): boolean => {
    if (!url) return true;
    return GENERIC_PLACEHOLDER_PATTERNS.some(p => url.includes(p)) || BAD_AVATAR_URLS.some(p => url.includes(p));
  };

  // Sanitize HTML entities in avatar URLs (e.g. &amp; → &)
  const sanitizeUrl = (url: string | undefined): string | undefined => {
    if (!url) return url;
    return url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  };

  // Proxy Facebook/fbcdn URLs through edge function to avoid CORS
  const getDisplayAvatarUrl = (link: SocialLink): string | undefined => {
    const raw = sanitizeUrl(link.avatarUrl);
    if (!raw) return undefined;
    if (raw.includes('graph.facebook.com') || raw.includes('fbcdn.net')) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      return `${supabaseUrl}/functions/v1/fetch-link-preview?proxy=${encodeURIComponent(raw)}`;
    }
    return raw;
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchMissing = async () => {
      const currentLinks = localLinksRef.current;
      const linksToRefetch = currentLinks.filter((l) => {
        if (!l.url) return false;
        if (NO_AVATAR_PLATFORMS.includes(l.platform)) return false;
        // Force refetch if avatarSourceUrl doesn't match current url
        if (l.avatarSourceUrl && l.avatarSourceUrl !== l.url) return true;
        // Force refetch if avatar is a known generic/placeholder
        if (isGenericAvatar(l.avatarUrl)) return true;
        if (l.avatarUrl && BAD_AVATAR_URLS.some((d) => l.avatarUrl!.includes(d))) return true;
        if (l.avatarUrl?.includes('&amp;')) return true;
        if (l.platform === 'facebook' && l.avatarUrl?.includes('graph.facebook.com')) return true;
        if (l.platform === 'angel' && !l.avatarUrl) return true;
        if (l.platform === 'zalo' && !l.avatarUrl) return true;
        if (!l.avatarUrl) return true;
        if (UNAVATAR_PLATFORMS.includes(l.platform) && !l.avatarUrl.includes('unavatar.io')) return true;
        return false;
      });
      if (linksToRefetch.length === 0) return;

      let updated = false;
      for (const link of linksToRefetch) {
        if (cancelled || !isCurrentProfileActive(userId)) return;

        try {
          const { data } = await supabase.functions.invoke('fetch-link-preview', {
            body: { url: link.url, platform: link.platform },
          });

          if (cancelled || !isCurrentProfileActive(userId)) return;

          const newLinks = [...localLinksRef.current];
          const idx = newLinks.findIndex((l) => l.platform === link.platform);
          if (idx !== -1) {
            if (newLinks[idx].url !== link.url) continue;

            if (data?.avatarUrl && data.avatarUrl !== newLinks[idx].avatarUrl) {
              newLinks[idx] = { ...newLinks[idx], avatarUrl: data.avatarUrl, avatarSourceUrl: link.url };
              localLinksRef.current = newLinks;
              updated = true;
            } else if (!data?.avatarUrl && newLinks[idx].avatarSourceUrl !== link.url) {
              // URL changed but no avatar found — clear stale avatar
              const { avatarUrl: _old, avatarSourceUrl: _oldSrc, ...rest } = newLinks[idx];
              newLinks[idx] = { ...rest, avatarSourceUrl: link.url } as SocialLink;
              localLinksRef.current = newLinks;
              updated = true;
            } else if (newLinks[idx].avatarUrl && BAD_AVATAR_URLS.some((d) => newLinks[idx].avatarUrl!.includes(d))) {
              const { avatarUrl: _bad, ...rest } = newLinks[idx];
              newLinks[idx] = { ...rest, avatarSourceUrl: link.url } as SocialLink;
              localLinksRef.current = newLinks;
              updated = true;
            }
          }
        } catch {
          if (cancelled) return;
        }
      }

      if (!updated || cancelled || !isCurrentProfileActive(userId)) return;

      const finalLinks = [...localLinksRef.current];
      // Chỉ ghi DB khi xác thực được userId === authUserId (tránh ghi nhầm cross-user khi chuyển profile)
      if (canWrite && userId === authUserId) {
        await supabase.from('profiles').update({ social_links: toJson(finalLinks as unknown as Record<string, unknown>) }).eq('id', userId);
        if (cancelled || !isCurrentProfileActive(userId)) return;
      }

      applyLinksUpdate(userId, finalLinks);
    };
    fetchMissing();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, canWrite, authUserId, isCurrentProfileActive, applyLinksUpdate]);

  // Default links for users who haven't set up social_links
  const defaultLinks: SocialLink[] = PLATFORM_ORDER.map(p => {
    const preset = PLATFORM_PRESETS[p];
    return { platform: p, label: preset.label, url: '', color: preset.color, favicon: preset.favicon };
  });

  // Use default icons when user has no links configured or all links have empty URLs
  const hasAnyUrl = localLinks.some(l => l.url && l.url.trim() !== '');
  const displayLinks = (localLinks.length === 0 || (!hasAnyUrl && !isOwner))
    ? defaultLinks
    : localLinks.length > 0 ? localLinks : defaultLinks;

  const allLinks: (SocialLink & { isPending?: boolean; isEmpty?: boolean })[] = [
    ...displayLinks
      .map((l) => ({ ...l, isEmpty: !l.url })),
    ...(pendingPlatform && PLATFORM_PRESETS[pendingPlatform]
      ? [{ platform: pendingPlatform, label: PLATFORM_PRESETS[pendingPlatform].label, url: '', color: PLATFORM_PRESETS[pendingPlatform].color, favicon: PLATFORM_PRESETS[pendingPlatform].favicon, isPending: true }]
      : []),
  ];

  const angles = computeAngles(allLinks.length);

  // Close popups on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showAddPicker && pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowAddPicker(false);
      if (editingPlatform && editRef.current && !editRef.current.contains(e.target as Node)) setEditingPlatform(null);
      if (pendingPlatform && pendingRef.current && !pendingRef.current.contains(e.target as Node)) {
        setPendingPlatform(null); setPendingUrl('');
      }
      if (promptingPlatform && promptRef.current && !promptRef.current.contains(e.target as Node)) {
        setPromptingPlatform(null); setPromptUrl('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddPicker, editingPlatform, pendingPlatform, promptingPlatform]);

  const fetchLinkAvatar = async (url: string, platform: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-link-preview', { body: { url, platform } });
      if (error || !data?.avatarUrl) return null;
      return data.avatarUrl;
    } catch { return null; }
  };

  const persistLinks = async (targetUserId: string, links: SocialLink[]) => {
    // GUARD CHỐNG GHI NHẦM: chỉ ghi nếu targetUserId khớp với user đang đăng nhập
    if (!authUserId) {
      console.warn('[AvatarOrbit] Blocked write — chưa đăng nhập', { targetUserId });
      toast.error('Vui lòng đăng nhập lại để lưu liên kết');
      return { error: new Error('not authenticated') as any, data: null } as any;
    }
    if (targetUserId !== authUserId) {
      console.warn('[AvatarOrbit] Blocked cross-user write attempt', { targetUserId, authUserId });
      toast.error('Không thể lưu — vui lòng tải lại trang');
      return { error: new Error('cross-user write blocked') as any, data: null } as any;
    }
    return await supabase
      .from('profiles')
      .update({ social_links: toJson(links as unknown as Record<string, unknown>) })
      .eq('id', targetUserId);
  };

  // Save link URL for existing slot (was empty)
  const savePromptLink = async (platform: string, url: string) => {
    const targetUserId = userId;
    if (!targetUserId || !isCurrentProfileActive(targetUserId) || !url.trim()) return;
    setSaving(true);
    const normalized = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    const fetchedAvatarUrl = await fetchLinkAvatar(normalized, platform);
    if (!isCurrentProfileActive(targetUserId)) return;
    const baseLinks = [...localLinksRef.current];
    let newLinks: SocialLink[];
    const existingIdx = baseLinks.findIndex((l) => l.platform === platform);
    if (existingIdx !== -1) {
      // URL changed → always clear old avatar, use fresh one only
      newLinks = baseLinks.map((l) =>
        l.platform === platform ? { ...l, url: normalized, avatarUrl: fetchedAvatarUrl || undefined, avatarSourceUrl: normalized } : l
      );
    } else {
      // Platform not in list, add new entry
      const preset = PLATFORM_PRESETS[platform];
      if (!preset) { setSaving(false); return; }
      newLinks = [...baseLinks, { platform, label: preset.label, url: normalized, color: preset.color, favicon: preset.favicon, avatarUrl: fetchedAvatarUrl || undefined, avatarSourceUrl: normalized }];
    }
    const { error } = await persistLinks(targetUserId, newLinks);
    if (isMountedRef.current) setSaving(false);
    if (!isCurrentProfileActive(targetUserId)) return;
    if (error) { toast.error('Không thể lưu link'); return; }
    toast.success('Đã lưu!');
    applyLinksUpdate(targetUserId, newLinks);
    setPromptingPlatform(null); setPromptUrl('');
  };

  const saveLink = async (platform: string, url: string, isNew = false) => {
    const targetUserId = userId;
    if (!targetUserId || !isCurrentProfileActive(targetUserId)) return;
    setSaving(true);
    const normalized = url.trim() ? (url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`) : '';
    const fetchedAvatarUrl = normalized ? await fetchLinkAvatar(normalized, platform) : null;
    if (!isCurrentProfileActive(targetUserId)) return;

    const baseLinks = [...localLinksRef.current];
    let newLinks: SocialLink[];
    if (isNew) {
      const preset = PLATFORM_PRESETS[platform];
      if (!preset) { setSaving(false); return; }
      newLinks = [...baseLinks, { platform, label: preset.label, url: normalized, color: preset.color, favicon: preset.favicon, avatarUrl: fetchedAvatarUrl || undefined, avatarSourceUrl: normalized }];
    } else {
      // URL changed → clear old avatar, use fresh one only (never fallback to stale avatar)
      newLinks = baseLinks.map((l) => l.platform === platform ? { ...l, url: normalized, avatarUrl: fetchedAvatarUrl || undefined, avatarSourceUrl: normalized } : l);
    }
    const { error } = await persistLinks(targetUserId, newLinks);
    if (isMountedRef.current) setSaving(false);
    if (!isCurrentProfileActive(targetUserId)) return;
    if (error) { toast.error('Không thể lưu link'); return; }
    toast.success('Đã lưu!');
    applyLinksUpdate(targetUserId, newLinks);
    setEditingPlatform(null);
    setPendingPlatform(null); setPendingUrl('');
    setShowAddPicker(false);
  };

  const removeLink = async (platform: string) => {
    const targetUserId = userId;
    if (!targetUserId || !isCurrentProfileActive(targetUserId)) return;
    const baseLinks = [...localLinksRef.current];
    const newLinks = baseLinks.filter((l) => l.platform !== platform);
    const { error } = await persistLinks(targetUserId, newLinks);
    if (!isCurrentProfileActive(targetUserId)) return;
    if (error) { toast.error('Không thể xoá link'); return; }
    toast.success('Đã xoá!');
    applyLinksUpdate(targetUserId, newLinks);
    setEditingPlatform(null);
  };

  // Pick platform → save immediately as empty-url slot, appear on orbit right away
  const handlePickPlatform = async (platform: string) => {
    const targetUserId = userId;
    if (!targetUserId || !isCurrentProfileActive(targetUserId)) return;
    setShowAddPicker(false);
    const preset = PLATFORM_PRESETS[platform];
    if (!preset) return;
    const baseLinks = [...localLinksRef.current];
    if (baseLinks.some((l) => l.platform === platform)) {
      setPromptingPlatform(platform);
      setPromptUrl('');
      return;
    }
    const newLink: SocialLink = { platform, label: preset.label, url: '', color: preset.color, favicon: preset.favicon };
    const newLinks = [...baseLinks, newLink];
    const { error } = await persistLinks(targetUserId, newLinks);
    if (!isCurrentProfileActive(targetUserId)) return;
    if (error) { toast.error('Không thể thêm link'); return; }
    applyLinksUpdate(targetUserId, newLinks);
    setPromptingPlatform(platform);
    setPromptUrl('');
  };

  // Drag-to-reorder handlers
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
    isDragging.current = true;
    isOrbitHovered.current = true;
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    const baseLinks = [...localLinksRef.current];
    const fromIdx = dragIndexRef.current;
    if (fromIdx >= baseLinks.length || index >= baseLinks.length) return;
    const [moved] = baseLinks.splice(fromIdx, 1);
    baseLinks.splice(index, 0, moved);
    dragIndexRef.current = index;
    localLinksRef.current = baseLinks;
    setLocalLinks(baseLinks);
  }, []);

  const handleDragEnd = useCallback(async () => {
    isDragging.current = false;
    isOrbitHovered.current = false;
    setDraggingIndex(null);
    dragIndexRef.current = null;
    const targetUserId = userId;
    if (!targetUserId || !isCurrentProfileActive(targetUserId)) return;
    const linksToSave = [...localLinksRef.current];
    if (linksToSave.length === 0) return;
    const { error } = await persistLinks(targetUserId, linksToSave);
    if (error || !isCurrentProfileActive(targetUserId)) return;
    applyLinksUpdate(targetUserId, linksToSave);
  }, [userId, isCurrentProfileActive, applyLinksUpdate]);

  const addAngle = computeAddAngle(allLinks.length);
  const addPos = angleToPos(addAngle);
  const showAddBtn = isOwner && allLinks.length < 9 && !pendingPlatform;

  return (
    <div
      className="relative"
      style={{ width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px`, flexShrink: 0, overflow: 'visible' }}
    >
      {/* Kim cương - phía trên avatar, đặt trong wrapper 486px để không bị clip */}
      <div
        className="pointer-events-none diamond-sparkle"
        style={{
          position: 'absolute',
          left: `${(AVATAR_SIZE - WRAPPER_SIZE) / 2}px`,
          top: `${(AVATAR_SIZE - WRAPPER_SIZE) / 2}px`,
          width: `${WRAPPER_SIZE}px`,
          height: `${WRAPPER_SIZE}px`,
          zIndex: 40,
          willChange: 'filter',
          overflow: 'visible',
        }}
      >
        {/* Kim cương: mũi nhọn dưới chạm sát viền ngoài avatar */}
        <div style={{ position: 'absolute', left: '50%', top: '90px', transform: 'translateX(-50%)' }}>
          {/* Sparkle dots */}
          <span className="sparkle-dot-1 absolute text-yellow-300" style={{ top: '18%', left: '10%', fontSize: '8px' }}>✦</span>
          <span className="sparkle-dot-2 absolute text-cyan-300" style={{ top: '5%', left: '55%', fontSize: '7px' }}>✦</span>
          <span className="sparkle-dot-3 absolute text-white" style={{ top: '22%', right: '8%', fontSize: '9px' }}>✦</span>
          <span className="sparkle-dot-4 absolute text-yellow-200" style={{ top: '55%', left: '5%', fontSize: '6px' }}>✦</span>
          <span className="sparkle-dot-5 absolute text-purple-300" style={{ top: '8%', left: '30%', fontSize: '7px' }}>✦</span>
          <span className="sparkle-dot-6 absolute text-cyan-200" style={{ top: '45%', right: '5%', fontSize: '6px' }}>✦</span>
          <span className="sparkle-dot-7 absolute text-yellow-100" style={{ top: '70%', left: '20%', fontSize: '5px' }}>✦</span>
          <span className="sparkle-dot-8 absolute text-white" style={{ top: '65%', right: '18%', fontSize: '7px' }}>✦</span>
          <img src={transparentDiamond} alt="Kim cương xanh" style={{ width: '100px', height: '100px', objectFit: 'contain', display: 'block' }} />
        </div>
      </div>

      {/* Avatar ở tâm */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        {children}
      </div>

      {/* Wrapper orbit 486px - absolute centered, overflow:visible → slots hiển thị đầy đủ trên mobile */}
      <div
        style={{
          position: 'absolute',
          width: `${WRAPPER_SIZE}px`,
          height: `${WRAPPER_SIZE}px`,
          left: `${(AVATAR_SIZE - WRAPPER_SIZE) / 2}px`,
          top: `${(AVATAR_SIZE - WRAPPER_SIZE) / 2}px`,
          overflow: 'visible',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >


        {/* Social link orbital slots */}
        {(() => {
          baseAnglesRef.current = angles;
          return allLinks.map((link, i) => {
            const { x, y } = angleToPos(angles[i]);
            const isEditing = editingPlatform === link.platform;
            const isPending = !!link.isPending;
            const isEmpty = !!link.isEmpty;
            const isHovered = hoveredPlatform === link.platform;
            const isPrompting = promptingPlatform === link.platform;
            const isDraggingThis = draggingIndex === i;

            return (
              <div
                key={link.platform}
                ref={(el) => { slotRefs.current[i] = el; }}
                className="absolute"
                style={{
                  left: `${CENTER + x - ORBIT_SIZE / 2}px`,
                  top: `${CENTER + y - ORBIT_SIZE / 2}px`,
                  width: `${ORBIT_SIZE}px`,
                  height: `${ORBIT_SIZE}px`,
                  zIndex: (isEditing || isPending || isPrompting || isDraggingThis || isHovered) ? 9999 : 20,
                  opacity: isDraggingThis ? 0.6 : 1,
                  transition: isDragging.current ? 'none' : 'opacity 0.2s',
                  cursor: isOwner && !isPending ? 'grab' : 'default',
                  overflow: 'visible',
                  pointerEvents: 'auto',
                }}
                onMouseEnter={() => { setHoveredPlatform(link.platform); isOrbitHovered.current = true; }}
                onMouseLeave={() => { if (!isEditing && !isPrompting) { setHoveredPlatform(null); if (!isDragging.current) isOrbitHovered.current = false; } }}
                onTouchStart={() => { setHoveredPlatform(link.platform); isOrbitHovered.current = true; }}
                onTouchEnd={() => { if (!isEditing && !isPrompting) { setTimeout(() => { setHoveredPlatform(null); isOrbitHovered.current = false; }, 1500); } }}
                draggable={isOwner && !isPending && !isEditing && !isPrompting}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(i); }}
                onDragEnd={handleDragEnd}
              >

                {/* Prompt popup — enter URL for newly added (empty) slot */}
                {isPrompting && isOwner && (
                  <div
                    ref={promptRef}
                    className="fixed md:absolute z-50 bg-card border border-border rounded-xl shadow-xl p-4 md:p-3"
                    style={{
                      width: 'min(340px, 90vw)',
                      /* Mobile: fixed center; Desktop: above icon */
                      ...(window.innerWidth < 768
                        ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                        : { bottom: '110%', left: '50%', transform: 'translateX(-50%)' }
                      ),
                    }}
                    onMouseEnter={() => { isOrbitHovered.current = true; }}
                    onMouseLeave={() => { isOrbitHovered.current = true; }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${link.color}` }}>
                        <img src={link.favicon} alt="" className="w-3.5 h-3.5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: link.color }}>{link.label}</span>
                      <button type="button" onClick={() => { setPromptingPlatform(null); setPromptUrl(''); }} className="ml-auto p-1 rounded hover:bg-muted transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Nhập link trang cá nhân của bạn (có thể bỏ qua)</p>
                    <input
                      autoFocus
                      type="url"
                      value={promptUrl}
                      onChange={(e) => setPromptUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePromptLink(link.platform, promptUrl); }}
                      placeholder={`https://${link.label.toLowerCase()}.com/...`}
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { removeLink(link.platform); setPromptingPlatform(null); setPromptUrl(''); }}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Xoá
                      </button>
                      <button
                        type="button"
                        disabled={saving || !promptUrl.trim()}
                        onClick={() => savePromptLink(link.platform, promptUrl)}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> Lưu
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit popup (existing link) */}
                {isEditing && isOwner && !isPending && (
                  <div
                    ref={editRef}
                    className="fixed md:absolute z-50 bg-card border border-border rounded-xl shadow-xl p-4 md:p-3"
                    style={{
                      width: 'min(340px, 90vw)',
                      ...(window.innerWidth < 768
                        ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                        : { bottom: '110%', left: '50%', transform: 'translateX(-50%)' }
                      ),
                    }}
                    onMouseEnter={() => { isOrbitHovered.current = true; }}
                    onMouseLeave={() => { isOrbitHovered.current = true; }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${link.color}` }}>
                        <img src={link.favicon} alt="" className="w-3.5 h-3.5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: link.color }}>{link.label}</span>
                      <button type="button" onClick={() => setEditingPlatform(null)} className="ml-auto p-1 rounded hover:bg-muted transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <input
                      autoFocus
                      type="url"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveLink(link.platform, editUrl); }}
                      placeholder="https://..."
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => removeLink(link.platform)}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Xoá
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => saveLink(link.platform, editUrl)}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> Lưu
                      </button>
                    </div>
                  </div>
                )}

                {/* Tooltip */}
                {isHovered && !isPending && !isEditing && !isPrompting && !isDraggingThis && (
                  <div
                    className="absolute pointer-events-none flex flex-col items-center gap-0.5"
                    style={{
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      minWidth: '100px',
                      maxWidth: '220px',
                      zIndex: 99999,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div className="px-2.5 py-1.5 rounded-lg text-xs shadow-lg" style={{ background: link.color, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {link.label}
                    </div>
                    {link.url && (
                      <div className="px-2 py-1 rounded-md text-xs shadow-md font-semibold" style={{ background: 'rgba(255,255,255,0.97)', color: '#15803d', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid #bbf7d0' }}>
                        {link.url.replace(/^https?:\/\//, '')}
                      </div>
                    )}
                    {!link.url && isOwner && (
                      <div className="px-2 py-1 rounded-md text-xs shadow-md font-semibold" style={{ background: 'rgba(255,255,255,0.97)', color: '#15803d', whiteSpace: 'nowrap', border: '1px solid #bbf7d0' }}>
                        Nhấn ✏️ để thêm link
                      </div>
                    )}
                  </div>
                )}

                {/* Slot icon */}
                {isPending ? (
                  <div
                    className="w-full h-full rounded-full bg-white flex items-center justify-center shadow-md animate-pulse overflow-hidden"
                    style={{ border: `2.5px dashed ${link.color}`, boxShadow: `0 0 8px ${link.color}44`, opacity: 0.85 }}
                  >
                    <img src={link.favicon} alt={link.label} className="w-6 h-6 object-cover rounded-full" style={{ pointerEvents: 'none' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const p = e.currentTarget.parentElement;
                        if (p && !p.querySelector('.fallback-letter')) {
                          const s = document.createElement('span');
                          s.className = 'fallback-letter text-xs font-bold';
                          s.style.color = link.color;
                          s.textContent = link.label[0];
                          p.appendChild(s);
                        }
                      }}
                    />
                  </div>
                ) : isEmpty ? (
                  /* Empty-url slot — show favicon with dashed border */
                  <button
                    type="button"
                    onClick={() => { if (isOwner) { setPromptingPlatform(link.platform); setPromptUrl(''); } }}
                    className="w-full h-full rounded-full bg-white flex items-center justify-center shadow-md overflow-hidden transition-transform duration-200 hover:scale-110"
                    style={{ border: `2.5px dashed ${link.color}`, boxShadow: `0 0 8px ${link.color}44` }}
                  >
                    <img src={link.favicon} alt={link.label} className="w-6 h-6 object-cover rounded-full" style={{ pointerEvents: 'none' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const p = e.currentTarget.parentElement;
                        if (p && !p.querySelector('.fallback-letter')) {
                          const s = document.createElement('span');
                          s.className = 'fallback-letter text-xs font-bold';
                          s.style.color = link.color;
                          s.textContent = link.label[0];
                          p.appendChild(s);
                        }
                      }}
                    />
                  </button>
                ) : (
                  /* Saved slot with URL */
                  <a
                    href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full rounded-full bg-white flex items-center justify-center transition-transform duration-200 shadow-md hover:scale-110 cursor-pointer overflow-hidden"
                    style={{ display: 'flex', border: `2.5px solid ${link.color}`, boxShadow: `0 0 8px ${link.color}66` }}
                  >
                    {link.avatarUrl ? (
                      <img
                        src={getDisplayAvatarUrl(link)}
                        alt={link.label}
                        className="w-full h-full object-cover rounded-full"
                        style={{ pointerEvents: 'none' }}
                        onError={(e) => {
                          e.currentTarget.src = link.favicon;
                          e.currentTarget.className = 'w-6 h-6 object-cover rounded-full';
                        }}
                      />
                    ) : (
                      <img
                        src={link.favicon}
                        alt={link.label}
                        className="w-6 h-6 object-cover rounded-full"
                        style={{ pointerEvents: 'none' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const p = e.currentTarget.parentElement;
                          if (p && !p.querySelector('.fallback-letter')) {
                            const s = document.createElement('span');
                            s.className = 'fallback-letter text-xs font-bold';
                            s.style.color = link.color;
                            s.textContent = link.label[0];
                            p.appendChild(s);
                          }
                        }}
                      />
                    )}
                  </a>
                )}

                {/* Pencil edit button (owner only, on hover) */}
                {isOwner && isHovered && !isEditing && !isPending && !isPrompting && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isEmpty) {
                        setPromptingPlatform(link.platform);
                        setPromptUrl('');
                      } else {
                        setEditingPlatform(link.platform);
                        setEditUrl(link.url);
                      }
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors z-40"
                    title="Sửa link"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                )}

                {/* Drag handle indicator on hover */}
                {isOwner && isHovered && !isEditing && !isPending && !isPrompting && (
                  <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 rounded-full bg-card border border-border shadow flex items-center justify-center cursor-grab z-40 opacity-70">
                    <GripVertical className="w-2.5 h-2.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          });
        })()}

        {/* Nút + */}
        {showAddBtn && (
          <div
            className="absolute"
            style={{
              left: `${CENTER + addPos.x - ORBIT_SIZE / 2}px`,
              top: `${CENTER + addPos.y - ORBIT_SIZE / 2}px`,
              width: `${ORBIT_SIZE}px`,
              height: `${ORBIT_SIZE}px`,
              zIndex: showAddPicker ? 30 : 20,
              pointerEvents: 'auto',
            }}
          >
            {showAddPicker && (
              <div
                ref={pickerRef}
                className="fixed md:absolute z-50 bg-card border border-border rounded-xl shadow-xl p-4 md:p-3"
                style={{
                  width: 'min(340px, 90vw)',
                  ...(window.innerWidth < 768
                    ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                    : { bottom: '110%', left: '50%', transform: 'translateX(-50%)' }
                  ),
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-foreground">Chọn mạng xã hội</p>
                  <button type="button" onClick={() => setShowAddPicker(false)} className="p-0.5 rounded hover:bg-muted">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {availablePlatforms.map((p) => {
                    const preset = PLATFORM_PRESETS[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePickPlatform(p)}
                        className="flex flex-col items-center gap-1 px-1 py-2 rounded-lg border border-border text-[10px] transition-all hover:border-current hover:scale-105"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = preset.color; (e.currentTarget as HTMLButtonElement).style.background = `${preset.color}18`; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = ''; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
                      >
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm" style={{ border: `1.5px solid ${preset.color}` }}>
                          <img src={preset.favicon} alt={preset.label} className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        </div>
                        <span className="truncate w-full text-center font-medium leading-tight">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowAddPicker(!showAddPicker)}
              className="w-full h-full rounded-full bg-primary text-primary-foreground hover:scale-110 hover:bg-primary/90 transition-all duration-200 shadow-md flex items-center justify-center"
              style={{ boxShadow: '0 0 10px hsl(var(--primary) / 0.5)' }}
              title="Thêm mạng xã hội"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
