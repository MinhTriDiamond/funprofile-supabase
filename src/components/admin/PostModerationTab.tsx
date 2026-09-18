import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi, enUS } from "date-fns/locale";
import { useLanguage } from "@/i18n/LanguageContext";

interface PendingPost {
  id: string;
  content: string;
  media_urls: unknown[];
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

const PostModerationTab = () => {
  const { t, language } = useLanguage();
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const dateLocale = language === 'vi' ? vi : enUS;

  const fetchPendingPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("id, content, media_urls, created_at, user_id, public_profiles!posts_user_id_fkey(username, avatar_url)")
      .eq("moderation_status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching pending posts:", error);
      toast.error(t('adminCannotLoadPosts'));
    } else {
      setPosts((data || []).map((p: Record<string, unknown>) => ({ ...p, profiles: (p as Record<string, unknown>).public_profiles || (p as Record<string, unknown>).profiles })) as unknown as PendingPost[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPendingPosts();
  }, []);

  const handleModerate = async (postId: string, status: "approved" | "rejected") => {
    setActionLoading(postId);
    const { error } = await supabase
      .from("posts")
      .update({ moderation_status: status })
      .eq("id", postId);

    if (error) {
      toast.error("Error: " + error.message);
    } else {
      toast.success(status === "approved" ? t('adminPostApproved') : t('adminPostRejected'));
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('adminPendingPosts')}{" "}
          <Badge variant="destructive" className="ml-2">{posts.length}</Badge>
        </h2>
        <Button variant="outline" size="sm" onClick={fetchPendingPosts} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('adminRefresh')}
        </Button>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('adminNoPendingPosts')}
          </CardContent>
        </Card>
      ) : (
        posts.map((post) => (
          <Card key={post.id}>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={post.profiles?.avatar_url || ""} />
                  <AvatarFallback>{post.profiles?.username?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{post.profiles?.username || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale })}
                  </p>
                </div>
                <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                  {t('adminPendingReview')}
                </Badge>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap break-words">
                  {post.content || <span className="italic text-muted-foreground">{t('adminNoContent')}</span>}
                </p>
                {post.media_urls && post.media_urls.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">📎 {post.media_urls.length} media</p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-red-600 hover:bg-red-50"
                  onClick={() => handleModerate(post.id, "rejected")}
                  disabled={actionLoading === post.id}
                >
                  <XCircle className="w-4 h-4" />
                  {t('adminReject')}
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => handleModerate(post.id, "approved")}
                  disabled={actionLoading === post.id}
                >
                  {actionLoading === post.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {t('adminApprove')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default PostModerationTab;
