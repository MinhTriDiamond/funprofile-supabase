import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    let limit = 10, offset = 0;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      limit = body.limit || 10;
      offset = body.offset || 0;
    } else {
      const url = new URL(req.url);
      limit = parseInt(url.searchParams.get("limit") || "10");
      offset = parseInt(url.searchParams.get("offset") || "0");
    }

    // Extract user_id from JWT token
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) {
        userId = data.user.id;
      }
    }

    // Fetch public active reels with creator info
    const { data: reels, error } = await supabaseAdmin
      .from("reels")
      .select(`
        *,
        profiles:user_id (id, username, avatar_url, full_name)
      `)
      .eq("visibility", "public")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // If user is logged in, fetch their like/bookmark status
    let userLikes: Set<string> = new Set();
    let userBookmarks: Set<string> = new Set();

    if (userId && reels && reels.length > 0) {
      const reelIds = reels.map((r: any) => r.id);

      const [likesRes, bookmarksRes] = await Promise.all([
        supabaseAdmin
          .from("reel_likes")
          .select("reel_id")
          .eq("user_id", userId)
          .in("reel_id", reelIds),
        supabaseAdmin
          .from("reel_bookmarks")
          .select("reel_id")
          .eq("user_id", userId)
          .in("reel_id", reelIds),
      ]);

      if (likesRes.data) {
        userLikes = new Set(likesRes.data.map((l: any) => l.reel_id));
      }
      if (bookmarksRes.data) {
        userBookmarks = new Set(bookmarksRes.data.map((b: any) => b.reel_id));
      }
    }

    const enrichedReels = (reels || []).map((reel: any) => ({
      ...reel,
      is_liked: userLikes.has(reel.id),
      is_bookmarked: userBookmarks.has(reel.id),
    }));

    return new Response(JSON.stringify(enrichedReels), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
