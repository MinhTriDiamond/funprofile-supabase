/**
 * Optimistic Feed helpers (Tầng 3 — Optimistic UI khi đăng bài).
 *
 * Ngay khi user bấm "Đăng", ta prepend một "ghost post" vào cache
 * `['feed-posts', userId]` để bài xuất hiện tức thì trên feed, sau đó:
 *   - Server trả OK → gỡ ghost + invalidate để fetch bản thật.
 *   - Server lỗi → gỡ ghost, composer sẽ tự mở lại kèm draft.
 *
 * Ghost mang cờ `metadata.__optimistic = true` để Feed render dạng
 * PendingPostCard (không cho reaction/comment, hiện chip "Đang đăng…").
 */
import { queryClient } from '@/lib/queryClient';
import type { FeedPost } from '@/hooks/useFeedPosts';

export interface OptimisticGhostInput {
  tempId: string;
  content: string;
  userId: string;
  privacy: string;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  media: Array<{ url: string; type: 'image' | 'video' }>;
}

export function buildOptimisticGhost(input: OptimisticGhostInput): FeedPost {
  const now = new Date().toISOString();
  const firstImage = input.media.find((m) => m.type === 'image')?.url ?? null;
  const firstVideo = input.media.find((m) => m.type === 'video')?.url ?? null;
  return {
    id: input.tempId,
    content: input.content,
    image_url: firstImage,
    video_url: firstVideo,
    media_urls: input.media.length ? input.media : null,
    created_at: now,
    user_id: input.userId,
    visibility: input.privacy,
    post_type: 'post',
    metadata: { __optimistic: true },
    profiles: {
      username: input.profile.username,
      display_name: input.profile.display_name,
      avatar_url: input.profile.avatar_url,
    },
    attachments: input.media.map((m, i) => ({
      id: `${input.tempId}-att-${i}`,
      file_url: m.url,
      storage_key: null,
      file_type: m.type,
      mime_type: null,
      width: null,
      height: null,
      size_bytes: null,
      sort_order: i,
      alt_text: null,
    })),
  } as FeedPost;
}

type FeedInfinite = {
  pages: Array<{ posts: any[]; postStats: Record<string, unknown>; nextCursor: string | null }>;
  pageParams: unknown[];
};

export function addOptimisticGhost(ghost: FeedPost) {
  queryClient.setQueriesData<FeedInfinite>({ queryKey: ['feed-posts'] }, (old) => {
    if (!old?.pages?.length) return old;
    const [first, ...rest] = old.pages;
    // tránh chèn trùng
    if (first.posts.some((p) => p?.id === ghost.id)) return old;
    return {
      ...old,
      pages: [
        {
          ...first,
          posts: [ghost, ...first.posts],
          postStats: {
            ...first.postStats,
            [ghost.id]: { reactions: [], commentCount: 0, shareCount: 0 },
          },
        },
        ...rest,
      ],
    };
  });
}

export function removeOptimisticGhost(tempId: string) {
  queryClient.setQueriesData<FeedInfinite>({ queryKey: ['feed-posts'] }, (old) => {
    if (!old?.pages?.length) return old;
    return {
      ...old,
      pages: old.pages.map((page, i) =>
        i === 0
          ? { ...page, posts: page.posts.filter((p) => p?.id !== tempId) }
          : page,
      ),
    };
  });
}

export function isOptimisticGhost(post: any): boolean {
  return Boolean(post?.metadata && (post.metadata as any).__optimistic);
}
