/**
 * useCreatePost — extracted submit logic, validation, auth, abort from FacebookCreatePost
 */
import { useState, useRef, useCallback } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';
import { toast } from 'sonner';
import type { UploadQueue } from '@/utils/uploadQueue';
import type { TaggedFriend } from '@/components/feed/FriendTagDialog';
import type { FeelingActivity } from '@/components/feed/FeelingActivityDialog';

const MAX_CONTENT_LENGTH = 20000;

const postSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, `Nội dung tối đa ${MAX_CONTENT_LENGTH.toLocaleString()} ký tự`),
});

export interface CreatePostProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type SubmitStep = 'idle' | 'auth' | 'prepare_media' | 'saving' | 'done';

interface UseCreatePostOptions {
  onPostCreated: () => void;
  uploadQueueRef: React.RefObject<UploadQueue | null>;
}

export function useCreatePost({ onPostCreated, uploadQueueRef }: UseCreatePostOptions) {
  const { userId } = useCurrentUser();
  const { t, language } = useLanguage();
  const { evaluateAsync } = usePplpEvaluate();

  const [profile, setProfile] = useState<CreatePostProfile | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [privacy, setPrivacy] = useState('public');
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [feeling, setFeeling] = useState<FeelingActivity | null>(null);
  const [submitStep, setSubmitStep] = useState<SubmitStep>('idle');
  const submitAbortRef = useRef<AbortController | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }, [userId]);

  const getSubmitButtonText = useCallback((isVideoUploading: boolean) => {
    if (isVideoUploading) return t('uploadingVideo');
    switch (submitStep) {
      case 'auth': return t('authenticating');
      case 'prepare_media': return t('preparingMedia');
      case 'saving': return t('savingPost');
      default: return loading ? t('posting') : t('postButton');
    }
  }, [submitStep, loading, t]);

  const handleCancelSubmit = useCallback(() => {
    submitAbortRef.current?.abort();
    setLoading(false);
    setSubmitStep('idle');
    toast.info(t('cancelledPost'));
  }, [t]);

  const handleSubmit = useCallback(async (opts: {
    uploadItems: { status: string }[];
    uppyVideoResult: { uid: string; url: string; thumbnailUrl: string; localThumbnail?: string } | null;
    isVideoUploading: boolean;
    onSuccess: () => void;
  }) => {
    const { uploadItems, uppyVideoResult, isVideoUploading, onSuccess } = opts;
    const completedMedia = uploadQueueRef.current?.getCompletedUrls() || [];
    const pendingUploads = uploadItems.filter(item => item.status === 'uploading' || item.status === 'queued');

    if (pendingUploads.length > 0) {
      toast.error(`${t('waitForFileUpload')} (${pendingUploads.length})`);
      return;
    }
    if (!content.trim() && completedMedia.length === 0 && !uppyVideoResult) {
      toast.error(t('pleaseAddContent'));
      return;
    }
    if (isVideoUploading) {
      toast.error(t('waitForVideoUpload'));
      return;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      toast.error(`${t('contentTooLongDetail')} (${content.length.toLocaleString()}/${MAX_CONTENT_LENGTH.toLocaleString()})`);
      return;
    }
    const validation = postSchema.safeParse({ content: content.trim() });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    const abortController = new AbortController();
    submitAbortRef.current = abortController;
    const watchdogTimeout = setTimeout(() => {
      abortController.abort();
      setLoading(false);
      setSubmitStep('idle');
      toast.error(t('postTimeout'));
    }, 45000);

    setLoading(true);
    setSubmitStep('auth');

    try {
      if (abortController.signal.aborted) throw new Error('Đã huỷ');

      let session;
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session;

      if (!session || (session.expires_at && session.expires_at * 1000 - Date.now() < 300000)) {
        try {
          const { data: refreshData } = await Promise.race([
            supabase.auth.refreshSession(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('refreshSession timeout (15s)')), 15000)
            )
          ]);
          if (refreshData.session) session = refreshData.session;
        } catch {
          // Continue with existing session if refresh fails
        }
      }

      if (!session) throw new Error(t('sessionExpired'));

      setSubmitStep('prepare_media');
      if (abortController.signal.aborted) throw new Error('Đã huỷ');

      const mediaUrls: Array<{ url: string; type: 'image' | 'video' }> = [];
      if (uppyVideoResult) {
        mediaUrls.push({ url: uppyVideoResult.url, type: 'video' });
      }
      for (const media of completedMedia) {
        mediaUrls.push(media);
      }

      if (abortController.signal.aborted) throw new Error('Đã huỷ');

      const firstImage = mediaUrls.find((m) => m.type === 'image');
      const firstVideo = mediaUrls.find((m) => m.type === 'video');

      setSubmitStep('saving');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: content.trim() || '',
          media_urls: mediaUrls,
          image_url: firstImage?.url || null,
          video_url: firstVideo?.url || null,
          location,
          tagged_user_ids: taggedFriends.map(f => f.id),
          visibility: privacy,
        }),
        signal: abortController.signal,
      });

      let result;
      try {
        result = await response.json();
      } catch {
        if (response.ok) {
          result = { ok: true };
        } else {
          throw new Error(t('serverConnectionError'));
        }
      }

      if (!response.ok) {
        // Handle blocked by repetitive content
        if (result.blocked) {
          toast.warning(
            result.warning_message || 'Angel thấy bạn đã chia sẻ nội dung tương tự nhiều lần rồi nè 💛 Hãy dành thời gian viết những trải nghiệm thật sự của bạn nhé ✨',
            { duration: 10000 }
          );
          return; // Don't reset form so user can edit
        }
        throw new Error(result.error || t('cannotSavePost'));
      }

      setSubmitStep('done');

      // Reset state
      uploadQueueRef.current?.cancelAll();
      setContent('');
      setTaggedFriends([]);
      setLocation(null);
      setPrivacy('public');
      setFeeling(null);

      // Handle moderation & warnings & Angel feedback
      if (result.repetitive_warning) {
        toast.warning(
          'Angel nhắc nhẹ: bài viết này khá giống với bài trước của bạn nên sẽ không được tính điểm nha 💛 Hãy chia sẻ điều mới mẻ hơn nhé ✨',
          { duration: 8000 }
        );
      } else if (result.moderation_status === 'pending_review') {
        toast.info(
          language === 'vi' ? 'Bài viết của bạn đang được xem xét ✨' : 'Your post is being reviewed ✨',
          { duration: 5000 }
        );
      } else if (result.duplicate_detected) {
        toast.info(t('duplicatePostMessage') + ' ✨🙏', { duration: 8000 });
      } else if (result.angel_feedback && !result.is_reward_eligible) {
        // Angel AI evaluated but post didn't meet reward threshold
        toast.info(result.angel_feedback, { duration: 8000, icon: '💛' });
        // Still evaluate for PPLP Light Score
        evaluateAsync({
          action_type: 'post',
          reference_id: result.postId,
          content: content.trim(),
        });
      } else {
        toast.success(t('postPublished'));
        evaluateAsync({
          action_type: 'post',
          reference_id: result.postId,
          content: content.trim(),
        });
      }

      onSuccess();
      onPostCreated();
    } catch (error: any) {
      if (error.name !== 'AbortError' && error.message !== 'Đã huỷ') {
        toast.error(error.message || t('cannotPost'));
      }
    } finally {
      clearTimeout(watchdogTimeout);
      setLoading(false);
      setSubmitStep('idle');
      submitAbortRef.current = null;
    }
  }, [content, privacy, taggedFriends, location, uploadQueueRef, t, language, evaluateAsync, onPostCreated]);

  return {
    profile, setProfile, fetchProfile,
    content, setContent,
    loading,
    privacy, setPrivacy,
    taggedFriends, setTaggedFriends,
    location, setLocation,
    feeling, setFeeling,
    submitStep,
    getSubmitButtonText,
    handleCancelSubmit,
    handleSubmit,
    MAX_CONTENT_LENGTH,
  };
}
