import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type ContentType = 'post' | 'reel' | 'live';

interface SlugResolverConfig {
  contentType: ContentType;
  table: string;
  userIdColumn: string;
  /** The direct ID from params (legacy UUID route) */
  directId?: string;
  /** Username from slug route */
  username?: string;
  /** Slug from slug route */
  slug?: string;
  /** URL path prefix for redirect, e.g. 'post', 'video', 'live' */
  urlPrefix: string;
}

/**
 * Resolves a slug-based URL to a content ID.
 * If the slug is outdated (in slug_history), navigates to the canonical URL (301-style).
 */
export function useSlugResolver({
  contentType,
  table,
  userIdColumn,
  directId,
  username,
  slug,
  urlPrefix,
}: SlugResolverConfig) {
  const navigate = useNavigate();
  const [resolvedId, setResolvedId] = useState<string | undefined>(directId);
  const [loading, setLoading] = useState(!directId && !!username && !!slug);

  useEffect(() => {
    if (directId) {
      setResolvedId(directId);
      setLoading(false);
      return;
    }
    if (!username || !slug) {
      setResolvedId(undefined);
      setLoading(false);
      return;
    }

    const resolve = async () => {
      setLoading(true);

      // Step 1: find user by username
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (!profile) {
        // Check username_history for old username → redirect
        const { data: usernameHistory } = await supabase
          .from('username_history')
          .select('new_username')
          .eq('old_username', username)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (usernameHistory?.new_username) {
          navigate(`/${usernameHistory.new_username}/${urlPrefix}/${slug}`, { replace: true });
          return;
        }
        
        setResolvedId(undefined);
        setLoading(false);
        return;
      }

      // Dynamic table query — type cast needed for dynamic table name
      const { data: content } = await (supabase
        .from(table as 'posts')
        .select('id')
        .eq(userIdColumn as 'user_id', profile.id)
        .eq('slug' as 'slug', slug)
        .maybeSingle());

      if (content?.id) {
        setResolvedId(content.id);
        setLoading(false);
        return;
      }

      // Step 3: check slug_history for old slug → redirect to new
      const { data: history } = await supabase
        .from('slug_history')
        .select('new_slug')
        .eq('content_type', contentType)
        .eq('user_id', profile.id)
        .eq('old_slug', slug)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (history?.new_slug) {
        // Client-side "301" redirect to canonical URL
        navigate(`/${username}/${urlPrefix}/${history.new_slug}`, { replace: true });
        return;
      }

      // Not found
      setResolvedId(undefined);
      setLoading(false);
    };

    resolve();
  }, [directId, username, slug, table, userIdColumn, contentType, urlPrefix, navigate]);

  return { resolvedId, loading };
}
