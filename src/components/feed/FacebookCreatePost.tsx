/**
 * CreatePost — Compose UI + Dialog shell
 * Supports: clipboard paste (Ctrl+V), drag-drop, image editor, DraftAttachment local state
 * Video upload still uses Uppy. Keeps guest mode, limited account, feeling, location, friend tag.
 */
import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Bot, Check, CheckCircle2, Gift, Hash, ImagePlus, Info, Loader2, MapPin, PenLine, Radio, ShieldAlert, SmilePlus, Sparkles, Upload, Video, Wand2, Feather, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { compressPostImage, getVideoDuration } from '@/utils/imageCompression';
import { generateVideoPoster } from '@/utils/videoPoster';
import { uploadToR2 } from '@/utils/r2Upload';
import {
  detectMediaKind,
  MEDIA_LIMIT_MESSAGES,
  MEDIA_LIMITS,
  validateImageFile,
  validatePostMediaCounts,
  validateVideoFile,
} from '@/config/uploadLimits';
import { EmojiPicker } from './EmojiPicker';
import { FriendTagDialog, TaggedFriend } from './FriendTagDialog';
import { LocationCheckin } from './LocationCheckin';
import { PrivacySelector } from './PrivacySelector';
import { FeelingActivityDialog, FeelingActivity } from './FeelingActivityDialog';
import { CreatePostToolbar } from './CreatePostToolbar';
import { CreatePostActionButton } from './CreatePostActionButton';
import { getComposerPlaceholder } from './composerPlaceholder';
import { AttachmentPreviewGrid } from '@/modules/feed/components/post/AttachmentPreviewGrid';
import { ImageEditorModal } from '@/modules/feed/components/post/ImageEditorModal';
import { StartLiveDialog } from '@/modules/live/components/StartLiveDialog';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAccountCapabilities } from '@/hooks/useAccountCapabilities';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';
import { useHaptics } from '@/hooks/useHaptics';
import type { DraftAttachment, AttachmentPayload } from '@/modules/feed/types';
import {
  usePostDraftAutoSave,
  getPostDraft,
  clearPostDraft,
  savePostDraftNow,
  restoreDraftAttachments,
  setDialogOpenState,
  getDialogOpenState,
  type PostComposerDraft,
} from '@/hooks/usePostDraft';
import { MIN_POST_LENGTH_FOR_LS } from '@/config/pplp';
import {
  addOptimisticGhost,
  buildOptimisticGhost,
  removeOptimisticGhost,
} from '@/lib/optimisticFeed';

const MAX_CONTENT_LENGTH = 20000;
const MAX_ATTACHMENTS = MEDIA_LIMITS.maxTotalMediaPerPost;
const FRIENDLY_PLACEHOLDERS = [
  'fcpPhSharePositive',
  'fcpPhGratitudeToday',
  'fcpPhMoment',
];
const INSPIRATION_CHIPS = [
  { id: 'gratitude', labelKey: 'fcpChipGratitudeLabel', textKey: 'fcpChipGratitudeText' },
  { id: 'inspire', labelKey: 'fcpChipInspireLabel', textKey: 'fcpChipInspireText' },
  { id: 'win', labelKey: 'fcpChipWinLabel', textKey: 'fcpChipWinText' },
  { id: 'moment', labelKey: 'fcpChipMomentLabel', textKey: 'fcpChipMomentText' },
  { id: 'love', labelKey: 'fcpChipLoveLabel', textKey: 'fcpChipLoveText' },
];

const legacyPostSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, 'fcpContentMax'),
});

const CLEAN_FRIENDLY_PLACEHOLDERS = [
  'fcpPhGratitudeClean',
  'fcpPhPositiveCommunity',
  'fcpPhMoment',
];

const CLEAN_INSPIRATION_CHIPS = [
  { id: 'gratitude', labelKey: 'fcpChipGratitudeLabel', textKey: 'fcpChipGratitudeText' },
  { id: 'inspire', labelKey: 'fcpChipInspireLabel', textKey: 'fcpChipInspireText' },
  { id: 'win', labelKey: 'fcpChipWinLabel', textKey: 'fcpChipWinText' },
  { id: 'moment', labelKey: 'fcpChipMomentLabel', textKey: 'fcpChipMomentText' },
  { id: 'love', labelKey: 'fcpChipLoveLabel', textKey: 'fcpChipLoveText' },
];

const postSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, 'fcpContentMax'),
});

function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function revokePreview(url?: string) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function revokeDraftBlobs(draft: DraftAttachment) {
  revokePreview(draft.previewUrl);
  revokePreview(draft.thumbnailUrl);
}

function reorderAttachments(items: DraftAttachment[]) {
  return items.map((a, i) => ({ ...a, sortOrder: i }));
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = objectUrl;
  });
}

async function buildImageDraft(file: File, sortOrder: number, source: DraftAttachment['source']): Promise<DraftAttachment> {
  const { width, height } = await getImageDimensions(file);
  return {
    id: createDraftId(),
    kind: 'image',
    file,
    previewUrl: URL.createObjectURL(file),
    width,
    height,
    sizeBytes: file.size,
    mimeType: file.type,
    uploadStatus: 'local',
    sortOrder,
    source,
    altText: '',
  };
}

function normalizeVideoDurationSeconds(duration?: number | null): number | undefined {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return undefined;
  return Math.ceil(duration);
}

async function buildVideoDraft(file: File, sortOrder: number, source: DraftAttachment['source']): Promise<DraftAttachment> {
  const duration = normalizeVideoDurationSeconds(await getVideoDuration(file));
  // Best-effort poster từ frame đầu — không chặn nếu thất bại.
  let thumbnailUrl: string | undefined;
  let posterWidth: number | undefined;
  let posterHeight: number | undefined;
  try {
    const poster = await generateVideoPoster(file);
    if (poster) {
      thumbnailUrl = poster.posterUrl;
      posterWidth = poster.width;
      posterHeight = poster.height;
    }
  } catch {
    // Không sao — grid sẽ hiện icon Play mặc định.
  }
  return {
    id: createDraftId(),
    kind: 'video',
    file,
    previewUrl: URL.createObjectURL(file),
    thumbnailUrl,
    width: posterWidth,
    height: posterHeight,
    duration,
    sizeBytes: file.size,
    mimeType: file.type || 'video/mp4',
    uploadStatus: 'local',
    progress: 0,
    sortOrder,
    source,
    altText: '',
  };
}

interface FacebookCreatePostProps {
  onPostCreated: () => void;
  initialAction?: 'compose' | 'live' | 'media' | 'feeling';
}

type ComposerMode = 'composer' | 'focus' | 'afterWriting';
type AiAssistAction = 'continue' | 'polish' | 'gratitude' | 'caption' | 'hashtag' | 'shorter';
type CloseComposerOptions = {
  forcePrompt?: boolean;
};

const AI_ACTIONS: Array<{ labelKey: string; action: AiAssistAction; icon: typeof PenLine }> = [
  { labelKey: 'fcpAiContinue', action: 'continue', icon: PenLine },
  { labelKey: 'fcpAiPolish', action: 'polish', icon: Wand2 },
  { labelKey: 'fcpAiGratitude', action: 'gratitude', icon: CheckCircle2 },
  { labelKey: 'fcpAiCaption', action: 'caption', icon: Feather },
  { labelKey: 'fcpAiShorter', action: 'shorter', icon: Sparkles },
  { labelKey: 'fcpAiHashtag', action: 'hashtag', icon: Hash },
];

const CLEAN_AI_ACTIONS: Array<{ labelKey: string; action: AiAssistAction; icon: typeof PenLine }> = [
  { labelKey: 'fcpAiContinue', action: 'continue', icon: PenLine },
  { labelKey: 'fcpAiPolish', action: 'polish', icon: Wand2 },
  { labelKey: 'fcpAiGratitude', action: 'gratitude', icon: CheckCircle2 },
  { labelKey: 'fcpAiCaption', action: 'caption', icon: Feather },
  { labelKey: 'fcpAiShorter', action: 'shorter', icon: Sparkles },
  { labelKey: 'fcpAiHashtag', action: 'hashtag', icon: Hash },
];

export const CreatePost = ({ onPostCreated, initialAction }: FacebookCreatePostProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const composeParam = searchParams.get('compose');
  const prefillParam = (searchParams.get('prefill') ?? '').slice(0, 200);
  const backParam = searchParams.get('back');
  const decodedBack = backParam ? (() => { try { return decodeURIComponent(backParam); } catch { return null; } })() : null;
  const [innerWorkToggle, setInnerWorkToggle] = useState(false);
  const isInnerWorkMode = composeParam === 'inner_work' || innerWorkToggle;
  const isStoryMediaMode = composeParam === 'story_media';
  const shouldAutoOpenComposer = composeParam === 'inner_work' || composeParam === 'post' || composeParam === 'story_media';
  const INNER_WORK_MIN = 150;
  const { t, language } = useLanguage();
  const { userId } = useCurrentUser();
  const { canCreatePost, isLimitedAccount, isLoading: capLoading } = useAccountCapabilities();
  const { evaluateAsync } = usePplpEvaluate();
  const haptic = useHaptics();

  // Profile
  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    display_name: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  // Composer state
  const [isDialogOpen, setIsDialogOpenRaw] = useState(false);

  // Wrap setIsDialogOpen to persist open state
  const setIsDialogOpen = useCallback((open: boolean) => {
    setIsDialogOpenRaw(open);
    setDialogOpenState(open);
  }, []);
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedInspirationChip, setSelectedInspirationChip] = useState<string | null>(null);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('composer');
  const [isMobileComposerViewport, setIsMobileComposerViewport] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 639px)').matches;
  });
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
  const [pendingRestoreDraft, setPendingRestoreDraft] = useState<PostComposerDraft | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusHistoryGuardRef = useRef(false);
  const composerHistoryGuardRef = useRef(false);

  // Attachments (images stored locally, uploaded on submit)
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const [isElevatedMediaAccount, setIsElevatedMediaAccount] = useState(false);

  // Image editor
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);

  // Social features
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [feeling, setFeeling] = useState<FeelingActivity | null>(null);

  const composerMeta = useMemo(() => ({
    innerWorkToggle,
    composeParam,
    prefillParam,
    storyMediaMode: isStoryMediaMode,
  }), [composeParam, innerWorkToggle, isStoryMediaMode, prefillParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileComposerViewport(event.matches);
      if (!event.matches && composerMode === 'focus') {
        setComposerMode(content.trim() || attachmentsRef.current.length > 0 ? 'afterWriting' : 'composer');
      }
    };

    setIsMobileComposerViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [composerMode, content]);

  // Restore draft prompt on mount
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!userId) {
      return;
    }

    setDraftRestored(false);
    let cancelled = false;
    void (async () => {
      const draft = await getPostDraft(userId);
      if (cancelled) return;

      const hasMeaningful = Boolean(draft && (
        (draft.content || '').trim().length > 0
        || draft.attachments.length > 0
        || draft.privacy !== 'public'
        || draft.feeling !== null
        || draft.location !== null
        || (draft.taggedFriends || []).length > 0
        || draft.composerMeta?.innerWorkToggle
      ));

      if (draft && hasMeaningful) {
        setPendingRestoreDraft(draft);
        setRestoreDraftOpen(true);
        if (getDialogOpenState() || shouldAutoOpenComposer) {
          setIsDialogOpenRaw(true);
        }
        setDraftRestored(false);
        return;
      }
      setDraftRestored(true);
    })();

    return () => { cancelled = true; };
  }, [shouldAutoOpenComposer, userId]);

  // Auto-save draft (only after restore is done to avoid race condition)
  usePostDraftAutoSave({ content, privacy, feeling, location, taggedFriends, attachments, composerMeta }, draftRestored, userId);

  // Auto-open composer from quick-create links.
  useEffect(() => {
    if (shouldAutoOpenComposer) {
      setIsDialogOpenRaw(true);
      setDialogOpenState(true);
    }
  }, [shouldAutoOpenComposer]);

  useEffect(() => {
    if (!isDialogOpen || composerMode !== 'focus') return;
    if (!focusHistoryGuardRef.current) {
      window.history.pushState({ funComposerFocus: true }, '');
      focusHistoryGuardRef.current = true;
    }

    const handlePopState = () => {
      if (composerMode === 'focus') {
        setComposerMode(content.trim() || attachments.length > 0 ? 'afterWriting' : 'composer');
        textareaRef.current?.blur();
        focusHistoryGuardRef.current = false;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [attachments.length, composerMode, content, isDialogOpen]);
  // Apply prefill text from quick-create links (e.g. Buddy Circle "Viết lời biết ơn @username").
  // Chỉ áp dụng khi đã restore draft xong và composer đang trống — tránh đè nội dung đang soạn.
  useEffect(() => {
    if (!draftRestored || !prefillParam) return;
    setContent((prev) => (prev.trim().length === 0 ? `${prefillParam} ` : prev));
  }, [draftRestored, prefillParam]);

  // Dialogs
  const [showFriendTagDialog, setShowFriendTagDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showFeelingDialog, setShowFeelingDialog] = useState(false);

  // Refs
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const editingAttachment = useMemo(() => attachments.find((a) => a.id === editingAttachmentId) ?? null, [attachments, editingAttachmentId]);

  // Fetch profile
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('id, username, display_name, full_name, avatar_url').eq('id', userId).single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [userId]);

  // Keep ref in sync
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsElevatedMediaAccount(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();
        if (!cancelled) setIsElevatedMediaAccount(Boolean(data));
      } catch {
        if (!cancelled) setIsElevatedMediaAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { attachmentsRef.current.forEach((a) => revokeDraftBlobs(a)); };
  }, []);

  // ─── Background pre-upload (Facebook-style) ───
  // Ngay khi user chọn file, upload chạy nền song song để lúc bấm Đăng gần như tức thời.
  const runningUploadsRef = useRef<Set<string>>(new Set());
  const updateAttachmentRef = useRef<((id: string, updates: Partial<DraftAttachment>) => void) | null>(null);

  const startBackgroundUpload = useCallback(async (draft: DraftAttachment) => {
    if (runningUploadsRef.current.has(draft.id)) return;
    if (draft.uploadStatus !== 'local' || !draft.file) return;
    runningUploadsRef.current.add(draft.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('fcpSessionExpired'));
      const accessToken = session.access_token;
      const updater = updateAttachmentRef.current;
      if (!updater) return;
      updater(draft.id, { uploadStatus: 'uploading', progress: 0, error: undefined });

      if (draft.kind === 'image') {
        const compressed = await compressPostImage(draft.file);
        updater(draft.id, { progress: 15 });
        const dimensions = await getImageDimensions(compressed);
        const upload = await uploadToR2(compressed, 'posts', undefined, accessToken, (p) => {
          updater(draft.id, { progress: Math.max(15, p) });
        });
        updater(draft.id, {
          fileUrl: upload.url,
          storageKey: upload.key,
          width: dimensions.width,
          height: dimensions.height,
          sizeBytes: compressed.size,
          mimeType: compressed.type || draft.mimeType,
          uploadStatus: 'uploaded',
          progress: 100,
        });
      } else {
        const upload = await uploadToR2(
          draft.file,
          'videos',
          undefined,
          accessToken,
          (p) => updater(draft.id, { progress: p }),
          { durationSeconds: normalizeVideoDurationSeconds(draft.duration) },
        );
        updater(draft.id, {
          fileUrl: upload.url,
          storageKey: upload.key,
          uploadStatus: 'uploaded',
          progress: 100,
        });
      }
    } catch (err: any) {
      const updater = updateAttachmentRef.current;
      updater?.(draft.id, {
        uploadStatus: 'error',
        error: draft.kind === 'video'
          ? t('fcpVideoUploadFailed')
          : (err?.message || t('uploadFailed')),
      });
    } finally {
      runningUploadsRef.current.delete(draft.id);
    }
  }, []);

  // Trigger background upload cho attachments mới thêm (status = 'local')
  useEffect(() => {
    const CONCURRENCY = 3;
    let running = 0;
    for (const a of attachments) {
      if (a.uploadStatus !== 'local' || !a.file) continue;
      if (runningUploadsRef.current.has(a.id)) { running++; continue; }
      if (running >= CONCURRENCY) break;
      running++;
      void startBackgroundUpload(a);
    }
  }, [attachments, startBackgroundUpload]);


  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !isDialogOpen) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 120), 360)}px`;
  }, [content, isDialogOpen]);

  const resetComposer = useCallback(() => {
    attachments.forEach((a) => revokeDraftBlobs(a));
    setContent('');
    setPrivacy('public');
    setAttachments([]);
    setTaggedFriends([]);
    setLocation(null);
    setFeeling(null);
    setEditingAttachmentId(null);
    setIsDragging(false);
    setInnerWorkToggle(false);
    setSelectedInspirationChip(null);
    setAiAssistOpen(false);
    setAiSheetOpen(false);
    setComposerMode('composer');
    setConfirmDiscardOpen(false);
    setRestoreDraftOpen(false);
    setPendingRestoreDraft(null);
  }, [attachments]);

  // ─── Image handling ───

  const appendImages = useCallback(async (files: File[], source: DraftAttachment['source']) => {
    const imageCount = attachments.filter((a) => a.kind === 'image').length;
    const videoCount = attachments.filter((a) => a.kind === 'video').length;
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    const remainingImages = MEDIA_LIMITS.maxImagesPerPost - imageCount;
    if (remainingSlots <= 0) {
      toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
      return;
    }
    if (remainingImages <= 0) {
      toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
      return;
    }
    const available = Math.min(remainingSlots, remainingImages);
    const nextFiles = files.slice(0, available);
    if (files.length > available) {
      toast.info(MEDIA_LIMIT_MESSAGES.maxTotal);
    }
    const validFiles: File[] = [];
    for (const file of nextFiles) {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(validationError.message);
        continue;
      }
      validFiles.push(file);
    }
    const countError = validatePostMediaCounts({ images: imageCount + validFiles.length, videos: videoCount });
    if (countError) {
      toast.error(countError.message);
      return;
    }
    if (validFiles.length === 0) return;
    const baseOrder = attachments.length;
    try {
      const drafts = await Promise.all(
        validFiles.map((file, index) => buildImageDraft(file, baseOrder + index, source))
      );
      setAttachments((current) => reorderAttachments([...current, ...drafts]));
      setComposerMode('afterWriting');
      setIsDialogOpen(true);
    } catch (error: any) {
      toast.error(error?.message || t('createPostErrProcessImage'));
    }
  }, [attachments]);

  const appendVideos = useCallback(async (files: File[], source: DraftAttachment['source']) => {
    const imageCount = attachments.filter((a) => a.kind === 'image').length;
    const videoCount = attachments.filter((a) => a.kind === 'video').length;
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    const remainingVideos = MEDIA_LIMITS.maxVideosPerPost - videoCount;
    if (remainingSlots <= 0) {
      toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
      return;
    }
    if (remainingVideos <= 0) {
      toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
      return;
    }
    const available = Math.min(remainingSlots, remainingVideos);
    const nextFiles = files.slice(0, available);
    if (files.length > available) {
      toast.info(MEDIA_LIMIT_MESSAGES.maxTotal);
    }

    const drafts: DraftAttachment[] = [];
    for (const file of nextFiles) {
      const basicValidationError = validateVideoFile(file, { isElevatedMediaAccount });
      if (basicValidationError) {
        toast.error(basicValidationError.message);
        continue;
      }
      try {
        const draft = await buildVideoDraft(file, attachments.length + drafts.length, source);
        const durationValidationError = validateVideoFile(file, {
          durationSeconds: draft.duration,
          isElevatedMediaAccount,
        });
        if (durationValidationError) {
          toast.error(durationValidationError.message);
          revokeDraftBlobs(draft);
          continue;
        }
        drafts.push(draft);
      } catch {
        toast.error(t('createPostCannotRead', { name: file.name }));
      }
    }

    const countError = validatePostMediaCounts({ images: imageCount, videos: videoCount + drafts.length });
    if (countError) {
      drafts.forEach((draft) => revokeDraftBlobs(draft));
      toast.error(countError.message);
      return;
    }

    if (drafts.length > 0) {
      setAttachments((current) => reorderAttachments([...current, ...drafts]));
      setComposerMode('afterWriting');
      setIsDialogOpen(true);
    }
  }, [attachments, isElevatedMediaAccount]);

  const handleFileSelection = useCallback(async (files: FileList | null, source: DraftAttachment['source']) => {
    if (!files || files.length === 0) return;
    const images: File[] = [];
    const videos: File[] = [];
    let plannedImages = attachments.filter((a) => a.kind === 'image').length;
    let plannedVideos = attachments.filter((a) => a.kind === 'video').length;
    Array.from(files).forEach((file) => {
      const kind = detectMediaKind(file);
      if (!kind) {
        toast.error(MEDIA_LIMIT_MESSAGES.unsupportedType);
        return;
      }
      const totalAfter = plannedImages + plannedVideos + 1;
      if (totalAfter > MEDIA_LIMITS.maxTotalMediaPerPost) {
        toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
        return;
      }
      if (kind === 'image') {
        if (plannedImages >= MEDIA_LIMITS.maxImagesPerPost) {
          toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
          return;
        }
        plannedImages++;
        images.push(file);
      } else {
        if (plannedVideos >= MEDIA_LIMITS.maxVideosPerPost) {
          toast.error(MEDIA_LIMIT_MESSAGES.maxTotal);
          return;
        }
        plannedVideos++;
        videos.push(file);
      }
    });
    if (images.length > 0) await appendImages(images, source);
    if (videos.length > 0) await appendVideos(videos, source);
  }, [appendImages, appendVideos, attachments]);

  // ─── Paste & Drag-Drop ───

  const handlePasteCapture = useCallback(async (event: React.ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    await appendImages(imageFiles, 'paste');
    toast.success(t('createPostPasted', { count: imageFiles.length }));
  }, [appendImages]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    await handleFileSelection(event.dataTransfer.files, 'drop');
  }, [handleFileSelection]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  // ─── Attachment actions ───

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((a) => a.id === id);
      if (target) revokeDraftBlobs(target);
      return reorderAttachments(current.filter((a) => a.id !== id));
    });
  }, []);

  const moveAttachment = useCallback((id: string, direction: -1 | 1) => {
    setAttachments((current) => {
      const index = current.findIndex((a) => a.id === id);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return reorderAttachments(next);
    });
  }, []);

  const replaceEditedAttachment = useCallback((payload: {
    file: File;
    previewUrl: string;
    width?: number;
    height?: number;
    altText: string;
    transformMeta?: Record<string, unknown> | null;
  }) => {
    setAttachments((current) =>
      current.map((a) => {
        if (a.id !== editingAttachmentId) return a;
        revokeDraftBlobs(a);
        return {
          ...a,
          file: payload.file,
          previewUrl: payload.previewUrl,
          width: payload.width || a.width,
          height: payload.height || a.height,
          sizeBytes: payload.file.size,
          mimeType: payload.file.type,
          altText: payload.altText,
          transformMeta: payload.transformMeta,
          uploadStatus: 'local' as const,
        };
      })
    );
    setEditingAttachmentId(null);
  }, [editingAttachmentId]);

  const updateAttachment = useCallback((id: string, updates: Partial<DraftAttachment>) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === id ? { ...attachment, ...updates } : attachment
      )
    );
  }, []);

  // Cho background upload dùng qua ref (tránh vòng phụ thuộc)
  useEffect(() => { updateAttachmentRef.current = updateAttachment; }, [updateAttachment]);


  const retryAttachment = useCallback((id: string) => {
    updateAttachment(id, { uploadStatus: 'local', progress: 0, error: undefined });
  }, [updateAttachment]);

  // ─── Submit ───

  const buildMediaPayloads = useCallback(async (accessToken: string): Promise<AttachmentPayload[]> => {
    const sorted = [...attachments].sort((a, b) => a.sortOrder - b.sortOrder);
    const payloads: AttachmentPayload[] = [];

    for (const attachment of sorted) {
      try {
        let readyAttachment = attachment;

        if (!readyAttachment.fileUrl) {
          if (!readyAttachment.file) throw new Error(t('createPostErrAttachment'));
          updateAttachment(readyAttachment.id, { uploadStatus: 'uploading', progress: 0, error: undefined });

          if (readyAttachment.kind === 'image') {
            const compressed = await compressPostImage(readyAttachment.file);
            updateAttachment(readyAttachment.id, { progress: 15 });
            const dimensions = await getImageDimensions(compressed);
            const upload = await uploadToR2(compressed, 'posts', undefined, accessToken, (progress) => {
              updateAttachment(readyAttachment.id, { progress: Math.max(15, progress) });
            });
            readyAttachment = {
              ...readyAttachment,
              fileUrl: upload.url,
              storageKey: upload.key,
              width: dimensions.width,
              height: dimensions.height,
              sizeBytes: compressed.size,
              mimeType: compressed.type || readyAttachment.mimeType,
              uploadStatus: 'uploaded',
              progress: 100,
            };
          } else {
            const upload = await uploadToR2(
              readyAttachment.file,
              'videos',
              undefined,
              accessToken,
              (progress) => updateAttachment(readyAttachment.id, { progress }),
              { durationSeconds: normalizeVideoDurationSeconds(readyAttachment.duration) },
            );
            readyAttachment = {
              ...readyAttachment,
              fileUrl: upload.url,
              storageKey: upload.key,
              uploadStatus: 'uploaded',
              progress: 100,
            };
          }

          updateAttachment(readyAttachment.id, readyAttachment);
        }

        if (!readyAttachment.fileUrl) throw new Error(t('createPostErrAttachment'));
        payloads.push({
          file_url: readyAttachment.fileUrl,
          storage_key: readyAttachment.storageKey || null,
          file_type: readyAttachment.kind,
          mime_type: readyAttachment.mimeType,
          width: readyAttachment.width || null,
          height: readyAttachment.height || null,
          duration_seconds: readyAttachment.kind === 'video' ? normalizeVideoDurationSeconds(readyAttachment.duration) || null : null,
          size_bytes: readyAttachment.sizeBytes,
          sort_order: readyAttachment.sortOrder,
          alt_text: readyAttachment.altText || null,
          transform_meta: readyAttachment.transformMeta || null,
        });
      } catch (error: any) {
        const isVideo = attachment.kind === 'video';
        updateAttachment(attachment.id, {
          uploadStatus: 'error',
          error: isVideo ? t('fcpVideoUploadFailed') : (error?.message || t('uploadFailed')),
        });
        throw error;
      }
    }

    return payloads;
  }, [attachments, t, updateAttachment]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim() && attachments.length === 0) {
      toast.error(t('pleaseAddContent'));
      return;
    }
    // Nếu media đang upload nền, chờ xong thay vì chặn (Facebook-style)
    if (attachments.some((attachment) => attachment.uploadStatus === 'uploading' || attachment.uploadStatus === 'local')) {
      toast.info(t('fcpMediaUploadFinishing'), { duration: 3000 });
      setLoading(true);
      try {
        await new Promise<void>((resolve, reject) => {
          const started = Date.now();
          const tick = () => {
            const list = attachmentsRef.current;
            if (list.every((a) => a.uploadStatus === 'uploaded' || a.uploadStatus === 'error')) {
              const bad = list.find((a) => a.uploadStatus === 'error');
              if (bad) reject(new Error(bad.error || t('fcpMediaUploadFailed')));
              else resolve();
              return;
            }
            if (Date.now() - started > 5 * 60 * 1000) {
              reject(new Error(t('fcpMediaUploadTimeout')));
              return;
            }
            setTimeout(tick, 250);
          };
          tick();
        });
      } catch (err: any) {
        setLoading(false);
        toast.error(err?.message || t('fcpMediaUploadFailed'));
        return;
      }
      // Đã tải xong, tiếp tục submit
    }

    if (attachments.some((attachment) => attachment.uploadStatus === 'error')) {
      toast.error(t('fcpMediaErrorRetry'));
      return;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      toast.error(`${t('contentTooLongDetail')} (${content.length.toLocaleString()}/${MAX_CONTENT_LENGTH.toLocaleString()})`);
      return;
    }
    const mediaCountError = validatePostMediaCounts({
      images: attachments.filter((attachment) => attachment.kind === 'image').length,
      videos: attachments.filter((attachment) => attachment.kind === 'video').length,
    });
    if (mediaCountError) {
      toast.error(mediaCountError.message);
      return;
    }
    const validation = postSchema.safeParse({ content: content.trim() });
    if (!validation.success) {
      toast.error(t(validation.error.errors[0].message, { count: MAX_CONTENT_LENGTH.toLocaleString() }));
      return;
    }

    setLoading(true);
    // Build attachment payloads (đã upload nền, gần như tức thời)
    let attachmentPayloads: AttachmentPayload[] = [];
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
    try {
      const sessionRes = await supabase.auth.getSession();
      session = sessionRes.data.session;
      if (!session) throw new Error(t('sessionExpired'));
      attachmentPayloads = await buildMediaPayloads(session.access_token);
    } catch (error: any) {
      setLoading(false);
      toast.error(error?.message || t('cannotPost'));
      return;
    }

    const firstImage = attachmentPayloads.find((a) => a.file_type === 'image');
    const firstVideo = attachmentPayloads.find((a) => a.file_type === 'video');

    // ─── Optimistic UI (Tầng 3) ───
    // Bài xuất hiện tức thì trên feed, dialog đóng ngay, người dùng có thể tiếp
    // tục thao tác trong lúc create-post chạy nền.
    const tempId = `ghost-${(crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    const ghost = buildOptimisticGhost({
      tempId,
      content: content.trim(),
      userId: userId || '',
      privacy,
      profile: {
        username: profile?.username || t('youLabel'),
        display_name: profile?.display_name || profile?.full_name || null,
        avatar_url: profile?.avatar_url || null,
      },
      media: attachmentPayloads.map((a) => ({
        url: a.file_url,
        type: a.file_type as 'image' | 'video',
      })),
    });

    // Lưu draft phòng trường hợp server lỗi → có thể mở lại composer với nội dung cũ.
    await savePostDraftNow(
      { content, privacy, feeling, location, taggedFriends, attachments, composerMeta },
      userId,
    ).catch(() => null);

    addOptimisticGhost(ghost);
    setIsDialogOpen(false);
    setLoading(false);
    if (composeParam || prefillParam || backParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('compose');
      next.delete('prefill');
      next.delete('back');
      setSearchParams(next, { replace: true });
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          visibility: privacy,
          location,
          tagged_user_ids: taggedFriends.map((f) => f.id),
          image_url: firstImage?.file_url || null,
          video_url: firstVideo?.file_url || null,
          media_urls: attachmentPayloads.map((a) => ({ url: a.file_url, type: a.file_type })),
          attachments: attachmentPayloads,
          pplp_pillar: isInnerWorkMode ? 'inner_work' : null,
        }),
      });

      const result = await response.json().catch(() => ({ error: t('serverConnectionError') }));
      if (!response.ok) throw new Error(result.error || t('cannotSavePost'));

      // Handle moderation
      const lightLang = result.light_language as { level?: string; loving_message?: string } | undefined;
      if (lightLang && (lightLang.level === 'toxic' || lightLang.level === 'negative')) {
        const msg = lightLang.loving_message ||
          (lightLang.level === 'toxic'
            ? t('fcpModerationToxic')
            : t('fcpModerationNegative'));
        toast.info(msg, { duration: 9000 });
      } else if (result.moderation_status === 'pending_review') {
        toast.info(
          t('createPostUnderReview'),
          { duration: 5000 }
        );
      } else if (result.duplicate_detected) {
        toast.info(t('duplicatePostMessage') + ' ✨🙏', { duration: 8000 });
      } else {
        if (isInnerWorkMode && content.trim().length < INNER_WORK_MIN) {
          toast.warning(t('fcpInnerWorkTooShort', { count: INNER_WORK_MIN }));
        } else if (isInnerWorkMode) {
          toast.success(t('fcpInnerWorkPosted'));
        } else {
          toast.success(t('postPublished'));
        }
        evaluateAsync({
          action_type: 'post',
          reference_id: result.postId,
          content: content.trim(),
          pplp_pillar: isInnerWorkMode ? 'inner_work' : null,
        });
        // Trigger quest re-evaluation ngay lập tức để badge nhảy 1/1
        if (isInnerWorkMode) {
          setTimeout(() => {
            supabase.functions.invoke('quest-evaluate').catch(() => null);
          }, 1500);
        }
      }

      // Gỡ ghost + invalidate feed để bài thật thay thế
      removeOptimisticGhost(tempId);
      resetComposer();
      void clearPostDraft(userId);
      onPostCreated();

      // Nếu đến từ nhiệm vụ (có ?back=…), tự đưa cha quay về đúng panel
      if (decodedBack) {
        toast.success(t('fcpBackToQuestToast'));
        setTimeout(() => navigate(decodedBack), 350);
      }
    } catch (error: any) {
      // Rollback: gỡ ghost, mở lại composer với nội dung cũ (draft đã lưu)
      removeOptimisticGhost(tempId);
      toast.error(error?.message || t('cannotPost'));
      setIsDialogOpen(true);
    }
  }, [content, attachments, privacy, taggedFriends, location, feeling, composerMeta, profile, buildMediaPayloads, resetComposer, onPostCreated, t, evaluateAsync, isInnerWorkMode, composeParam, prefillParam, backParam, decodedBack, navigate, searchParams, setSearchParams, setIsDialogOpen, userId]);

  const handleEmojiSelect = (emoji: string) => setContent((prev) => prev + emoji);
  const insertComposerText = useCallback((text: string) => {
    setContent((prev) => {
      const textarea = textareaRef.current;
      if (!textarea) return prev ? `${prev}\n${text}` : text;
      const start = textarea.selectionStart ?? prev.length;
      const end = textarea.selectionEnd ?? prev.length;
      const prefix = prev.slice(0, start);
      const suffix = prev.slice(end);
      const spacer = prefix && !prefix.endsWith('\n') && !prefix.endsWith(' ') ? ' ' : '';
      return `${prefix}${spacer}${text}${suffix}`;
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleInspirationChip = useCallback((chip: typeof CLEAN_INSPIRATION_CHIPS[number]) => {
    haptic('light');
    setSelectedInspirationChip(chip.id);
    insertComposerText(t(chip.textKey));
    window.setTimeout(() => setSelectedInspirationChip(null), 450);
  }, [haptic, insertComposerText, t]);

  const handleAiAssistAction = useCallback((action: AiAssistAction) => {
    haptic('light');
    if (action === 'continue') {
      insertComposerText(content.trim() ? t('fcpAiInsertContinueSuffix') : t('fcpAiInsertContinueStart'));
      return;
    }
    if (action === 'gratitude') {
      insertComposerText(content.trim() ? t('fcpAiInsertGratitudeSuffix') : t('fcpChipGratitudeText'));
      return;
    }
    if (action === 'caption') {
      insertComposerText(content.trim() ? t('fcpAiInsertCaptionSuffix') : t('fcpAiInsertCaptionStart'));
      return;
    }
    if (action === 'hashtag') {
      insertComposerText('\n\n#FUNProfile #SongTichCuc #BietOn');
      return;
    }
    if (!content.trim()) {
      toast.info(t('fcpAiWriteFirstHint'));
      return;
    }
    toast.info(action === 'shorter' ? t('fcpAiShorterSoon') : t('fcpAiPolishSoon'));
  }, [content, haptic, insertComposerText, t]);

  const handleFeelingSelect = (selectedFeeling: FeelingActivity) => {
    setFeeling(selectedFeeling);
    setIsDialogOpen(true);
  };
  const [showStartLiveDialog, setShowStartLiveDialog] = useState(false);
  const handleLiveVideoClick = () => {
    haptic('light');
    setShowStartLiveDialog(true);
  };
  const handleUiReadyAction = useCallback((message: string) => {
    haptic('light');
    toast.info(message);
  }, [haptic]);
  const initialActionHandledRef = useRef(false);

  useEffect(() => {
    if (!initialAction || initialActionHandledRef.current || !profile || capLoading || !canCreatePost) return;
    initialActionHandledRef.current = true;

    if (initialAction === 'live') {
      handleLiveVideoClick();
      return;
    }

    if (initialAction === 'media') {
      setIsDialogOpen(true);
      window.setTimeout(() => mediaInputRef.current?.click(), 0);
      return;
    }

    if (initialAction === 'feeling') {
      setShowFeelingDialog(true);
      return;
    }

    setComposerMode(content.trim() || attachments.length > 0 ? 'afterWriting' : 'composer');
    setIsDialogOpen(true);
  }, [attachments.length, canCreatePost, capLoading, content, initialAction, profile]);

  const hasMediaBusy = attachments.some((attachment) => attachment.uploadStatus === 'uploading');
  const hasMediaError = attachments.some((attachment) => attachment.uploadStatus === 'error');
  const uploadProgress = attachments.length > 0
    ? Math.round(
        attachments.reduce((sum, a) => {
          if (a.uploadStatus === 'uploaded') return sum + 100;
          if (a.uploadStatus === 'uploading') return sum + (a.progress || 0);
          return sum;
        }, 0) / attachments.length,
      )
    : 0;
  const isSubmitDisabled = loading || hasMediaBusy || hasMediaError || content.length > MAX_CONTENT_LENGTH || (!content.trim() && attachments.length === 0);
  const hasUnsavedChanges = Boolean(
    content.trim()
    || attachments.length > 0
    || taggedFriends.length > 0
    || location
    || feeling
    || privacy !== 'public'
    || innerWorkToggle
  );

  const currentDraftData = useMemo(() => ({
    content,
    privacy,
    feeling,
    location,
    taggedFriends,
    attachments,
    composerMeta,
  }), [attachments, composerMeta, content, feeling, location, privacy, taggedFriends]);

  const saveCurrentDraft = useCallback(async () => {
    const ok = await savePostDraftNow(currentDraftData, userId);
    if (!ok && attachments.length > 0) {
      toast.warning(t('fcpDraftMediaWarning'));
    }
    return ok;
  }, [attachments.length, currentDraftData, userId]);

  const clearComposeParam = useCallback(() => {
    if (composeParam === 'post' || composeParam === 'story_media' || composeParam === 'inner_work' || prefillParam || backParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('compose');
      next.delete('prefill');
      next.delete('back');
      setSearchParams(next, { replace: true });
    }
  }, [composeParam, prefillParam, backParam, searchParams, setSearchParams]);

  const closeComposerNow = useCallback((discard = false) => {
    setEditingAttachmentId(null);
    setComposerMode('composer');
    setConfirmDiscardOpen(false);
    setRestoreDraftOpen(false);
    setAiSheetOpen(false);
    setAiAssistOpen(false);
    setIsDialogOpen(false);
    clearComposeParam();
    if (discard) {
      resetComposer();
      void clearPostDraft(userId);
    }
  }, [clearComposeParam, resetComposer, setIsDialogOpen, userId]);

  const saveDraftAndClose = useCallback(async () => {
    await saveCurrentDraft();
    toast.success(t('fcpDraftSaved'));
    closeComposerNow(false);
  }, [closeComposerNow, saveCurrentDraft]);

  const restorePendingDraft = useCallback(() => {
    if (!pendingRestoreDraft) return;

    attachments.forEach((attachment) => revokeDraftBlobs(attachment));
    const restoredAttachments = restoreDraftAttachments(pendingRestoreDraft);
    if (pendingRestoreDraft.attachments.length > 0 && restoredAttachments.length === 0) {
      toast.warning(t('fcpDraftMediaRestoreFailed'));
    }

    setContent(pendingRestoreDraft.content || '');
    setPrivacy(pendingRestoreDraft.privacy || 'public');
    setFeeling(pendingRestoreDraft.feeling || null);
    setLocation(pendingRestoreDraft.location || null);
    setTaggedFriends(pendingRestoreDraft.taggedFriends || []);
    setAttachments(restoredAttachments);
    setInnerWorkToggle(Boolean(pendingRestoreDraft.composerMeta?.innerWorkToggle));
    setComposerMode((pendingRestoreDraft.content || restoredAttachments.length > 0) ? 'afterWriting' : 'composer');
    setIsDialogOpen(true);
    setPendingRestoreDraft(null);
    setRestoreDraftOpen(false);
    setDraftRestored(true);
    toast.success(t('fcpDraftRestored'));
  }, [attachments, pendingRestoreDraft, setIsDialogOpen]);

  const skipPendingDraft = useCallback(async () => {
    await clearPostDraft(userId);
    setPendingRestoreDraft(null);
    setRestoreDraftOpen(false);
    setDraftRestored(true);
    if (!isDialogOpen && shouldAutoOpenComposer) {
      setIsDialogOpen(true);
    }
  }, [isDialogOpen, setIsDialogOpen, shouldAutoOpenComposer, userId]);

  const requestCloseComposer = useCallback((options: CloseComposerOptions = {}) => {
    if (loading) return;
    if (composerMode === 'focus' && !options.forcePrompt) {
      setComposerMode(content.trim() || attachments.length > 0 ? 'afterWriting' : 'composer');
      textareaRef.current?.blur();
      return;
    }
    if (hasUnsavedChanges) {
      textareaRef.current?.blur();
      setAiAssistOpen(false);
      setAiSheetOpen(false);
      setConfirmDiscardOpen(true);
      return;
    }
    closeComposerNow(false);
  }, [attachments.length, closeComposerNow, composerMode, content, hasUnsavedChanges, loading]);

  useEffect(() => {
    if (!isDialogOpen) {
      composerHistoryGuardRef.current = false;
      return;
    }

    if (!composerHistoryGuardRef.current) {
      window.history.pushState({ funComposerOpen: true }, '');
      composerHistoryGuardRef.current = true;
    }

    const handlePopState = () => {
      composerHistoryGuardRef.current = false;
      requestCloseComposer();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDialogOpen, requestCloseComposer]);

  const finishFocusWriting = useCallback(() => {
    haptic('light');
    textareaRef.current?.blur();
    setComposerMode(content.trim() || attachments.length > 0 ? 'afterWriting' : 'composer');
  }, [attachments.length, content, haptic]);

  useEffect(() => {
    if (!isDialogOpen || !hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      void saveCurrentDraft();
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isDialogOpen, saveCurrentDraft]);

  // ─── Guest mode ───
  if (!profile) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-2.5 sm:p-3 mb-3">
        <div className="flex items-center gap-2">
          <Avatar className="w-10 h-10 ring-2 ring-primary/20 shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground">G</AvatarFallback>
          </Avatar>
          <button
            onClick={() => toast.error(t('loginToPostMessage'), { action: { label: t('loginButton'), onClick: () => navigate('/auth') } })}
            className="flex-1 text-left px-4 py-2.5 bg-muted hover:bg-muted/80 rounded-full text-muted-foreground text-[15px] transition-colors truncate"
          >
            {getComposerPlaceholder(null, t)}
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            {[
              { icon: <Video className="w-5 h-5 text-destructive" />, title: t('liveVideo') },
              { icon: <ImagePlus className="w-5 h-5 text-[#45BD62]" />, title: t('photoVideo') },
              { icon: <SmilePlus className="w-5 h-5 text-amber-500" />, title: t('feeling') },
            ].map((btn, i) => (
              <CreatePostActionButton
                key={i}
                onClick={() => toast.error(t('loginToPostMessage'), { action: { label: t('loginButton'), onClick: () => navigate('/auth') } })}
                icon={btn.icon}
                label={btn.title}
                variant="iconOnly"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Limited account ───
  if (!canCreatePost && !capLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-3 sm:p-4 mb-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 ring-2 ring-primary/20 shrink-0">
            <AvatarImage src={profile.avatar_url} sizeHint="sm" alt={profile.username || 'User avatar'} />
            <AvatarFallback className="bg-primary text-primary-foreground">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 px-4 py-2.5 bg-muted rounded-full text-muted-foreground text-[15px]">
            {t('createPostVerifyEmailTitle')}
          </div>
        </div>
        <div className="border-t border-border mt-3 pt-3">
          <div className="flex items-center gap-2 px-2">
            <ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0" />
            <p className="text-sm text-muted-foreground flex-1">
              {t('createPostVerifyEmailDesc')}
            </p>
            <Button size="sm" onClick={() => navigate('/settings/security')} className="shrink-0">
              {t('createPostVerifyEmailCta')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Composer ───
  return (
    <>
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => { handleFileSelection(e.target.files, 'picker'); e.target.value = ''; }}
        className="hidden"
      />

      {/* Create Post Card */}
      <div className="bg-card/95 rounded-2xl shadow-sm border border-border/80 px-2.5 sm:px-3 py-2 transition-all duration-200 hover:shadow-md">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <Avatar
              className="w-10 h-10 cursor-pointer ring-2 ring-primary/20 shadow-sm transition-transform hover:scale-105"
              onClick={() => navigate(`/profile/${profile.id}`)}
            >
              <AvatarImage src={profile.avatar_url} sizeHint="sm" alt={profile.username || 'User avatar'} />
              <AvatarFallback className="bg-primary text-primary-foreground">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
          </div>
          <button
            onClick={() => {
              setComposerMode(content.trim() || attachments.length > 0 ? 'afterWriting' : 'composer');
              setIsDialogOpen(true);
            }}
            className="flex-1 text-left px-4 py-2.5 bg-muted hover:bg-primary/5 hover:text-foreground rounded-full text-muted-foreground text-[15px] transition-all duration-200 truncate"
          >
            {getComposerPlaceholder(profile, t)}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <CreatePostActionButton
              onClick={handleLiveVideoClick}
              icon={<Video />}
              label={t('liveVideo')}
              colorClass="text-red-500"
              variant="iconOnly"
            />
            <CreatePostActionButton
              onClick={() => mediaInputRef.current?.click()}
              icon={<ImagePlus />}
              label={t('photoVideo')}
              colorClass="text-emerald-500"
              variant="iconOnly"
            />
            <CreatePostActionButton
              onClick={() => setShowFeelingDialog(true)}
              icon={<SmilePlus />}
              label={t('feeling')}
              colorClass="text-amber-500"
              active={!!feeling}
              variant="iconOnly"
            />
          </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (open) {
          setIsDialogOpen(true);
          return;
        }
        requestCloseComposer({ forcePrompt: true });
      }}>
        <DialogContent
          overlayClassName="bg-black/55 backdrop-blur-sm"
          className="inset-0 h-[100dvh] max-h-[100dvh] rounded-none p-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:max-w-[640px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-3xl overflow-hidden flex flex-col gap-0 border-border/70 bg-background shadow-2xl animate-in fade-in-0 slide-in-from-bottom-3 sm:zoom-in-95 [&>button.absolute]:hidden"
        >
          {/* Mobile drag handle (visual only) — FB-style bottom sheet feel */}
          <div className="flex justify-center pt-1.5 pb-0.5 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
          </div>
          <DialogHeader className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 shrink-0 backdrop-blur">
            {decodedBack && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                <span className="truncate">{t('fcpQuestBannerText')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  onClick={() => { closeComposerNow(false); setTimeout(() => navigate(decodedBack), 50); }}
                >
                  {t('fcpQuestBackButton')}
                </Button>
              </div>
            )}
            <div className="flex min-h-11 items-center justify-between gap-2 sm:hidden">
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => requestCloseComposer({ forcePrompt: true })} aria-label={t('close')}>
                <X className="h-5 w-5" />
              </Button>
              <DialogTitle className="min-w-0 flex-1 text-center text-base font-bold tracking-tight">
                {composerMode === 'focus' ? t('fcpAddTextTitle') : t('fcpNewPostTitle')}
              </DialogTitle>
              {composerMode === 'focus' ? (
                <Button type="button" variant="ghost" className="h-10 rounded-full px-4 font-bold text-primary" onClick={finishFocusWriting}>
                  {t('fcpDone')}
                </Button>
              ) : (
                <Button type="button" size="sm" className="h-10 rounded-full px-4 font-bold" onClick={handleSubmit} disabled={isSubmitDisabled}>
                  {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {t('postButton')}
                </Button>
              )}
            </div>
            <div className="relative hidden min-h-11 items-center justify-center sm:flex">
              <DialogTitle className="text-center text-xl font-bold tracking-tight">
                {isInnerWorkMode ? t('fcpInnerWorkTitle') : isStoryMediaMode ? t('fcpCreateStoryTitle') : t('createPost')}
              </DialogTitle>
              {composerMode === 'focus' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute right-11 top-1/2 h-9 -translate-y-1/2 rounded-full px-4 font-bold text-primary transition-all hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={finishFocusWriting}
                >
                  {t('fcpDone')}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => requestCloseComposer({ forcePrompt: true })}
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {isInnerWorkMode && (
              <p className="text-center text-xs text-muted-foreground mt-1">
                {t('fcpInnerWorkInfo', { count: INNER_WORK_MIN })}
              </p>
            )}
            {isStoryMediaMode && (
              <p className="text-center text-xs text-muted-foreground mt-1">
                {t('fcpStoryMediaHint')}
              </p>
            )}
            {/* Toggle Sám Hối — luôn hiển thị để user có thể đánh dấu bất kỳ bài nào */}
            <button
              type="button"
              onClick={() => setInnerWorkToggle((v) => !v)}
              className={`mt-2 mx-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border hover:-translate-y-0.5 active:scale-95 ${
                isInnerWorkMode
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
              }`}
              title={t('fcpInnerWorkToggleTitle')}
            >
              <span>{isInnerWorkMode ? t('fcpInnerWorkToggleOn') : t('fcpInnerWorkToggleOff')}</span>
            </button>
          </DialogHeader>

          <div
            className={`flex-1 overflow-y-auto p-3 sm:p-4 relative transition-colors duration-200 ${isDragging ? 'ring-2 ring-primary ring-inset bg-primary/5' : 'bg-gradient-to-b from-background to-muted/20'}`}
            onPasteCapture={(e) => void handlePasteCapture(e)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
          >
            {composerMode === 'focus' ? (
              <div className="flex min-h-full flex-col bg-background px-1 py-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                <Textarea
                  ref={textareaRef}
                  placeholder={t('fcpPhGratitudeClean')}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[calc(100dvh-190px)] flex-1 resize-none border-0 bg-transparent px-1 text-[22px] leading-relaxed shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0 focus-visible:ring-offset-0"
                  disabled={loading}
                  autoFocus
                />
                <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-background/95 py-3 backdrop-blur">
                  <span className={cn(
                    'text-xs',
                    content.length > MAX_CONTENT_LENGTH ? 'font-semibold text-destructive' : 'text-muted-foreground',
                  )}>
                    {content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-2 rounded-full border-primary/25 bg-primary/5 text-primary"
                    onClick={() => setAiSheetOpen(true)}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI
                  </Button>
                </div>
              </div>
            ) : (
              <>
            {/* User Info */}
            <div className="mb-3 flex items-center gap-3 rounded-3xl border border-border/60 bg-card/75 p-3 shadow-sm backdrop-blur">
              <div className="relative shrink-0">
                <Avatar className="w-11 h-11 ring-2 ring-primary/20 shadow-md">
                  <AvatarImage src={profile.avatar_url} sizeHint="sm" alt={profile.username || 'User avatar'} />
                  <AvatarFallback className="bg-primary text-primary-foreground">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold leading-tight">{profile.display_name || profile.username}</span>
                  {feeling && (
                    <span className="text-muted-foreground text-sm">
                      {' '}{t('feelingPrefix')}{' '}
                      <button onClick={() => setShowFeelingDialog(true)} className="text-foreground font-semibold hover:underline inline-flex items-center gap-1">
                        {feeling.emoji} {feeling.label}
                      </button>
                    </span>
                  )}
                  {taggedFriends.length > 0 && (
                    <span className="text-muted-foreground text-sm">
                      {' '}{t('withPrefix')}{' '}
                      <button onClick={() => setShowFriendTagDialog(true)} className="text-foreground font-semibold hover:underline">
                        {taggedFriends.length === 1
                          ? (taggedFriends[0].full_name || taggedFriends[0].username)
                          : `${taggedFriends[0].full_name || taggedFriends[0].username} ${t('andOthers')} ${taggedFriends.length - 1}`}
                      </button>
                    </span>
                  )}
                  {location && (
                    <span className="text-muted-foreground text-sm">
                      {' '}{t('atPrefix')}{' '}
                      <button onClick={() => setShowLocationDialog(true)} className="text-foreground font-semibold hover:underline">{location}</button>
                    </span>
                  )}
                </div>
                <PrivacySelector value={privacy} onChange={setPrivacy} disabled={loading} />
              </div>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
              {[
                { label: t('photoVideo'), icon: ImagePlus, color: 'text-emerald-600', onClick: () => mediaInputRef.current?.click(), active: attachments.length > 0 },
                { label: 'GIF', icon: Sparkles, color: 'text-pink-500', onClick: () => handleUiReadyAction(t('fcpGifComingSoon')), active: false },
                { label: t('fcpLive'), icon: Radio, color: 'text-red-500', onClick: handleLiveVideoClick, active: false },
                { label: t('fcpFeelingLabel'), icon: SmilePlus, color: 'text-amber-500', onClick: () => setShowFeelingDialog(true), active: !!feeling },
                { label: t('fcpLocationLabel'), icon: MapPin, color: 'text-rose-500', onClick: () => setShowLocationDialog(true), active: !!location },
                { label: t('fcpAiSupport'), icon: Bot, color: 'text-primary', onClick: () => setAiSheetOpen(true), active: false },
                { label: t('fcpGiftCoin'), icon: Gift, color: 'text-yellow-600', onClick: () => handleUiReadyAction(t('fcpGiftCoinComingSoon')), active: false },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <CreatePostActionButton
                    key={action.label}
                    disabled={loading}
                    onClick={action.onClick}
                    icon={<Icon className={cn(action.color)} />}
                    label={action.label}
                    active={action.active}
                    variant="toolbar"
                  />
                );
              })}
            </div>

            {/* Content */}
            <div className="relative rounded-3xl border border-border/60 bg-background/80 p-3 shadow-sm transition-all duration-200 focus-within:border-primary/35 focus-within:bg-background focus-within:shadow-[0_0_0_4px_rgba(34,197,94,0.10),0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="flex items-start gap-3">
                <Avatar className="mt-1 h-10 w-10 shrink-0 ring-2 ring-primary/15 shadow-sm">
                  <AvatarImage src={profile.avatar_url} sizeHint="sm" alt={profile.username || 'User avatar'} />
                  <AvatarFallback className="bg-primary text-primary-foreground">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Textarea
                    ref={textareaRef}
                    placeholder={isInnerWorkMode
                      ? t('fcpInnerWorkPlaceholder', { count: INNER_WORK_MIN })
                      : isStoryMediaMode
                      ? t('fcpStoryCaptionPlaceholder')
                      : getComposerPlaceholder(profile, t)}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onFocus={() => {
                      if (isMobileComposerViewport) setComposerMode('focus');
                    }}
                    className="min-h-[132px] max-h-[360px] resize-none overflow-y-auto border-0 bg-transparent px-0 text-[17px] leading-relaxed shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={loading}
                    autoFocus={isInnerWorkMode}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-[11px] text-muted-foreground">
                  {t('createPostPasteHint')}
                </span>
                <span className={`text-xs ${
                  content.length > MAX_CONTENT_LENGTH ? 'text-destructive font-semibold' :
                  content.length > MAX_CONTENT_LENGTH * 0.9 ? 'text-yellow-500' :
                  content.length > MAX_CONTENT_LENGTH * 0.8 ? 'text-yellow-600/70' : 'text-muted-foreground'
                }`}>
                  {content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 px-1">
                {CLEAN_INSPIRATION_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => handleInspirationChip(chip)}
                    disabled={loading}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 disabled:opacity-50 ${
                      selectedInspirationChip === chip.id ? 'scale-105 border-primary/50 bg-primary/15 text-primary shadow-sm' : 'border-border/70 bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {selectedInspirationChip === chip.id && <Check className="h-3.5 w-3.5" />}
                    {t(chip.labelKey)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-end px-1">
                <Popover open={aiAssistOpen} onOpenChange={setAiAssistOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      className="h-9 gap-2 rounded-full border-primary/25 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-amber-400/10 text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/10 hover:shadow-md"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('fcpAiAssistTitle')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(92vw,320px)] rounded-3xl border-primary/15 bg-background/95 p-2 shadow-2xl backdrop-blur">
                    <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-emerald-500/10 to-amber-400/10 px-3 py-3">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {t('fcpAiSuggestions')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('fcpAiUiReadyNote')}</p>
                    </div>
                    {[
                      { label: t('fcpAiContinue'), icon: PenLine, action: 'continue' as const },
                      { label: t('fcpAiPolish'), icon: Wand2, action: 'polish' as const },
                      { label: t('fcpAiGratitude'), icon: CheckCircle2, action: 'gratitude' as const },
                      { label: t('fcpAiCaption'), icon: Feather, action: 'caption' as const },
                      { label: t('fcpAiHashtag'), icon: Hash, action: 'hashtag' as const },
                      { label: t('fcpAiShorter'), icon: Sparkles, action: 'shorter' as const },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.action}
                          type="button"
                          onClick={() => {
                            handleAiAssistAction(item.action);
                            setAiAssistOpen(false);
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]"
                        >
                          <Icon className="h-4 w-4 text-primary" />
                          {item.label}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>
              {/* Light Score eligibility hint */}
              {(() => {
                const trimmedLen = content.trim().length;
                const hasMedia = attachments.length > 0;
                const minRequired = isInnerWorkMode ? INNER_WORK_MIN : MIN_POST_LENGTH_FOR_LS;
                const eligible = isInnerWorkMode
                  ? trimmedLen >= INNER_WORK_MIN
                  : (hasMedia || trimmedLen >= MIN_POST_LENGTH_FOR_LS);
                const message = eligible
                  ? (isInnerWorkMode
                    ? t('fcpInnerWorkEligible')
                    : 'Light Score eligible')
                  : (isInnerWorkMode
                    ? t('fcpCharsNeeded', { min: INNER_WORK_MIN, current: trimmedLen })
                    : t('fcpCharsOrMediaNeeded', { min: minRequired, current: trimmedLen }));
                return (
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                          eligible
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}>
                          <span>{eligible ? '✨' : '⚠'}</span>
                          <span>{message}</span>
                          <Info className="h-3.5 w-3.5 opacity-70" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('fcpLightScoreHint')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
            </div>

            {/* Attachments Preview Grid — FB-style asymmetric */}
            {attachments.length > 0 ? (
              <div className="mt-3">
                <AttachmentPreviewGrid
                  attachments={attachments}
                  disabled={loading}
                  maxAttachments={MAX_ATTACHMENTS}
                  onEdit={setEditingAttachmentId}
                  onRemove={removeAttachment}
                  onMove={moveAttachment}
                  onRetry={retryAttachment}
                  onAddMore={() => mediaInputRef.current?.click()}
                />
              </div>
            ) : (
              <div className={cn(
                'mt-3 rounded-3xl border-2 border-dashed border-border/80 bg-card/60 p-6 text-center transition-all duration-200 hover:border-primary/35 hover:bg-primary/5',
                composerMode === 'composer' && 'hidden sm:block',
              )}>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('createPostDropHint')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('fcpMediaLimitsNote')}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={loading}
                  className="mt-4 min-h-10 rounded-full gap-2 px-4"
                >
                  <ImagePlus className="h-4 w-4" />
                  {t('fcpAddMedia')}
                </Button>
              </div>
            )}

            {/* Toolbar */}
            <div className={cn('mt-3', composerMode === 'composer' && 'hidden sm:block')}>
              <CreatePostToolbar
                loading={loading}
                taggedFriendsCount={taggedFriends.length}
                hasLocation={!!location}
                onShowMediaUpload={() => mediaInputRef.current?.click()}
                onShowFriendTag={() => setShowFriendTagDialog(true)}
                onShowLocation={() => setShowLocationDialog(true)}
                onShowFeeling={() => setShowFeelingDialog(true)}
                onShowLive={handleLiveVideoClick}
                onShowAi={() => setAiAssistOpen(true)}
                onShowVoice={() => handleUiReadyAction(t('fcpVoiceComingSoon'))}
                onShowGiftCoin={() => handleUiReadyAction(t('fcpGiftCoinComingSoon'))}
                onEmojiSelect={handleEmojiSelect}
              />
            </div>
              </>
            )}
          </div>

          {/* Submit */}
          <div className={cn(
            'sticky bottom-0 z-10 border-t border-border/70 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0 backdrop-blur',
            composerMode === 'focus' && 'hidden sm:block',
          )}>
            {/* Aggregate upload progress strip */}
            {(hasMediaBusy || loading) && (
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-[width] duration-200"
                  style={{ width: `${loading ? Math.max(uploadProgress, 30) : uploadProgress}%` }}
                />
              </div>
            )}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="h-12 w-full rounded-full bg-gradient-to-r from-emerald-600 to-green-500 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:from-emerald-700 hover:to-green-600 hover:shadow-[0_0_26px_rgba(34,197,94,0.34)] active:scale-[0.99] disabled:translate-y-0 disabled:bg-muted disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {(loading || hasMediaBusy) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? t('posting') : hasMediaBusy ? t('fcpUploading', { percent: uploadProgress }) : t('postButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer open={aiSheetOpen} onOpenChange={setAiSheetOpen}>
        <DrawerContent className="max-h-[78dvh] rounded-t-3xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              {t('fcpAiAssistTitle')}
            </DrawerTitle>
          </DrawerHeader>
          <div className="rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-amber-400/10 p-3">
            <p className="text-sm font-semibold">{t('fcpAiSheetSubtitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('fcpAiUiReadyNote')}</p>
          </div>
          <div className="mt-3 space-y-1">
            {CLEAN_AI_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => {
                    handleAiAssistAction(item.action);
                    setAiSheetOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition hover:bg-muted active:scale-[0.98]"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent className="z-[260] max-w-[calc(100vw-2rem)] rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fcpSaveDraftTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fcpSaveDraftDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-full">{t('fcpContinueEditing')}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(event) => {
                event.preventDefault();
                void saveDraftAndClose();
              }}
            >
              {t('fcpSaveDraft')}
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => closeComposerNow(true)}
            >
              {t('fcpDiscardPost')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
        <AlertDialogContent className="z-[260] max-w-[calc(100vw-2rem)] rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fcpRestoreDraftTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fcpRestoreDraftDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              className="rounded-full"
              onClick={(event) => {
                event.preventDefault();
                void skipPendingDraft();
              }}
            >
              {t('fcpSkip')}
            </AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={restorePendingDraft}>
              {t('fcpRestore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sub-dialogs */}
      <FriendTagDialog isOpen={showFriendTagDialog} onClose={() => setShowFriendTagDialog(false)} currentUserId={profile?.id || ''} selectedFriends={taggedFriends} onTagFriends={setTaggedFriends} />
      <LocationCheckin isOpen={showLocationDialog} onClose={() => setShowLocationDialog(false)} currentLocation={location} onSelectLocation={setLocation} />
      <FeelingActivityDialog isOpen={showFeelingDialog} onClose={() => setShowFeelingDialog(false)} onSelect={handleFeelingSelect} />
      <StartLiveDialog open={showStartLiveDialog} onOpenChange={setShowStartLiveDialog} />

      {/* Image Editor */}
      <ImageEditorModal
        open={Boolean(editingAttachment)}
        attachment={editingAttachment}
        onClose={() => setEditingAttachmentId(null)}
        onSave={replaceEditedAttachment}
      />
    </>
  );
};

/** @deprecated Use CreatePost instead */
export const FacebookCreatePost = CreatePost;

// Default export cho React.lazy() — bắt buộc cho lazyWithChunkRecovery.
// Không xoá dòng này: xem incident 2026-07-16 "LazyImportMissingDefaultError" trên fun.rich.
export default CreatePost;
