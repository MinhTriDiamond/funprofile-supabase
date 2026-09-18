import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DOMAIN = "https://fun.rich";
const DEFAULT_IMAGE = `${DOMAIN}/pwa-512.png`;
const SITE_NAME = "FUN Profile";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Crawler detection ───
const BOT_UA =
  /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkshare|w3c_validator|whatsapp|telegram|discordbot|applebot/i;

function isBot(ua: string | null): boolean {
  return !!ua && BOT_UA.test(ua);
}

// ─── Path parser ───
interface ParsedRoute {
  type: "profile" | "post" | "video" | "live" | "unknown";
  username?: string;
  slug?: string;
  directId?: string;
}

function parsePath(path: string): ParsedRoute {
  const p = path.replace(/^\/+|\/+$/g, "");
  const segments = p.split("/");

  // /{username}/post/{slug}
  if (segments.length === 3 && segments[1] === "post") {
    return { type: "post", username: segments[0], slug: segments[2] };
  }
  // /{username}/video/{slug}
  if (segments.length === 3 && segments[1] === "video") {
    return { type: "video", username: segments[0], slug: segments[2] };
  }
  // /{username}/live/{slug}
  if (segments.length === 3 && segments[1] === "live") {
    return { type: "live", username: segments[0], slug: segments[2] };
  }
  // /post/{id}
  if (segments.length === 2 && segments[0] === "post") {
    return { type: "post", directId: segments[1] };
  }
  // /reels/{id}
  if (segments.length === 2 && segments[0] === "reels") {
    return { type: "video", directId: segments[1] };
  }
  // /live/{id}
  if (segments.length === 2 && segments[0] === "live") {
    return { type: "live", directId: segments[1] };
  }
  // /{username} — profile
  if (segments.length === 1 && segments[0] && !segments[0].includes(".")) {
    return { type: "profile", username: segments[0] };
  }
  return { type: "unknown" };
}

// ─── HTML builder ───
function buildHTML(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  image: string;
  ogType: string;
  jsonLd?: Record<string, unknown>;
  redirectUrl?: string;
  videoUrl?: string;
}): string {
  const { title, description, canonicalUrl, image, ogType, jsonLd, redirectUrl, videoUrl } = opts;
  const fullTitle = `${title} | ${SITE_NAME}`;

  const videoTags = videoUrl ? `
  <meta property="og:video" content="${escHtml(videoUrl)}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="720">
  <meta property="og:video:height" content="1280">` : "";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(fullTitle)}</title>
  <meta name="description" content="${escHtml(description)}">
  <link rel="canonical" href="${escHtml(canonicalUrl)}">
  ${redirectUrl ? `<meta http-equiv="refresh" content="0;url=${escHtml(redirectUrl)}">` : ""}

  <!-- Open Graph -->
  <meta property="og:title" content="${escHtml(fullTitle)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url" content="${escHtml(canonicalUrl)}">
  <meta property="og:image" content="${escHtml(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="${escHtml(ogType)}">
  <meta property="og:site_name" content="${SITE_NAME}">${videoTags}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(fullTitle)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image" content="${escHtml(image)}">

  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p>${escHtml(description)}</p>
  <a href="${escHtml(canonicalUrl)}">View on ${SITE_NAME}</a>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function extractPostImage(post: Record<string, any>): string | null {
  if (post.image_url) return post.image_url;
  if (Array.isArray(post.media_urls)) {
    const img = post.media_urls.find((m: any) => m.type === 'image');
    if (img?.url) return img.url;
  }
  return null;
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/";
  const userAgent = req.headers.get("user-agent");

  // Only serve SSR HTML to bots; humans get redirected to SPA
  if (!isBot(userAgent)) {
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${DOMAIN}${path}` },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  const route = parsePath(path);
  const cacheHeaders = {
    ...corsHeaders,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  };

  try {
    // ─── Profile ───
    if (route.type === "profile" && route.username) {
      // Check username_history for redirect
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, display_name, full_name, avatar_url, bio")
        .eq("username", route.username)
        .maybeSingle();

      if (!profile) {
        const { data: history } = await supabase
          .from("username_history")
          .select("new_username")
          .eq("old_username", route.username)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (history?.new_username) {
          return new Response(null, {
            status: 301,
            headers: { ...corsHeaders, Location: `${DOMAIN}/${history.new_username}` },
          });
        }
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      const name = profile.display_name || profile.full_name || profile.username;
      const canonicalUrl = `${DOMAIN}/${profile.username}`;
      return new Response(
        buildHTML({
          title: name,
          description: (profile.bio || `${name} on ${SITE_NAME}`).slice(0, 160),
          canonicalUrl,
          image: profile.avatar_url || DEFAULT_IMAGE,
          ogType: "profile",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            url: canonicalUrl,
            image: profile.avatar_url || DEFAULT_IMAGE,
            description: profile.bio,
          },
        }),
        { status: 200, headers: cacheHeaders }
      );
    }

    // ─── Post ───
    if (route.type === "post") {
      const post = await resolveContent(supabase, {
        table: "posts",
        userIdColumn: "user_id",
        profileRelation: "public_profiles!posts_user_id_fkey",
        contentType: "post",
        urlPrefix: "post",
        ...route,
      });

      if (post === "not_found") return new Response("Not found", { status: 404, headers: corsHeaders });
      if (typeof post === "string") {
        return new Response(null, { status: 301, headers: { ...corsHeaders, Location: post } });
      }

      const authorName = post.profile?.display_name || post.profile?.username || "FUN User";
      const content = (post.content || "").slice(0, 160);
      const canonicalUrl = `${DOMAIN}/${post.profile?.username}/post/${post.slug}`;

      return new Response(
        buildHTML({
          title: `${authorName} - Post`,
          description: content || `Post by ${authorName}`,
          canonicalUrl,
          image: extractPostImage(post) || post.profile?.avatar_url || DEFAULT_IMAGE,
          ogType: "article",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `Post by ${authorName}`,
            description: content,
            url: canonicalUrl,
            image: extractPostImage(post) || post.profile?.avatar_url || DEFAULT_IMAGE,
            author: { "@type": "Person", name: authorName },
            datePublished: post.created_at,
            publisher: { "@type": "Organization", name: SITE_NAME },
          },
        }),
        { status: 200, headers: cacheHeaders }
      );
    }

    // ─── Video ───
    if (route.type === "video") {
      const reel = await resolveContent(supabase, {
        table: "reels",
        userIdColumn: "user_id",
        profileRelation: "profiles!reels_user_id_fkey",
        contentType: "reel",
        urlPrefix: "video",
        ...route,
      });

      if (reel === "not_found") return new Response("Not found", { status: 404, headers: corsHeaders });
      if (typeof reel === "string") {
        return new Response(null, { status: 301, headers: { ...corsHeaders, Location: reel } });
      }

      const authorName = reel.profile?.display_name || reel.profile?.username || "FUN User";
      const desc = (reel.title || reel.description || "").slice(0, 160);
      const canonicalUrl = `${DOMAIN}/${reel.profile?.username}/video/${reel.slug}`;

      return new Response(
        buildHTML({
          title: reel.title || `Video by ${authorName}`,
          description: desc || `Video by ${authorName}`,
          canonicalUrl,
          image: reel.thumbnail_url || DEFAULT_IMAGE,
          ogType: "video.other",
          videoUrl: reel.video_url || undefined,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            name: reel.title || `Video by ${authorName}`,
            description: desc,
            url: canonicalUrl,
            thumbnailUrl: reel.thumbnail_url,
            uploadDate: reel.created_at,
            publisher: { "@type": "Organization", name: SITE_NAME },
          },
        }),
        { status: 200, headers: cacheHeaders }
      );
    }

    // ─── Live ───
    if (route.type === "live") {
      const live = await resolveContent(supabase, {
        table: "live_sessions",
        userIdColumn: "owner_id",
        profileRelation: "profiles!live_sessions_owner_id_fkey",
        contentType: "live",
        urlPrefix: "live",
        ...route,
      });

      if (live === "not_found") return new Response("Not found", { status: 404, headers: corsHeaders });
      if (typeof live === "string") {
        return new Response(null, { status: 301, headers: { ...corsHeaders, Location: live } });
      }

      const authorName = live.profile?.display_name || live.profile?.username || "FUN User";
      const canonicalUrl = `${DOMAIN}/${live.profile?.username}/live/${live.slug}`;

      return new Response(
        buildHTML({
          title: live.title || `Live by ${authorName}`,
          description: (live.title || `Live session by ${authorName}`).slice(0, 160),
          canonicalUrl,
          image: DEFAULT_IMAGE,
          ogType: "website",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Event",
            name: live.title || `Live by ${authorName}`,
            url: canonicalUrl,
            organizer: { "@type": "Person", name: authorName },
          },
        }),
        { status: 200, headers: cacheHeaders }
      );
    }

    // Unknown route — fallback
    return new Response(
      buildHTML({
        title: SITE_NAME,
        description: "FUN Profile - Mạng xã hội Web3 kết hợp AI",
        canonicalUrl: DOMAIN,
        image: DEFAULT_IMAGE,
        ogType: "website",
      }),
      { status: 200, headers: cacheHeaders }
    );
  } catch (err) {
    console.error("seo-render error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});

// ─── Content resolver with redirect support ───
interface ResolveOpts {
  table: string;
  userIdColumn: string;
  profileRelation: string;
  contentType: string;
  urlPrefix: string;
  username?: string;
  slug?: string;
  directId?: string;
}

async function resolveContent(
  supabase: ReturnType<typeof createClient>,
  opts: ResolveOpts
): Promise<Record<string, any> | string | "not_found"> {
  const { table, userIdColumn, profileRelation, contentType, urlPrefix, username, slug, directId } = opts;

  // Direct ID lookup
  if (directId) {
    const { data } = await (supabase
      .from(table as any)
      .select(`*, ${profileRelation}(username, display_name, avatar_url)`)
      .eq("id", directId)
      .maybeSingle() as any);

    if (!data) return "not_found";
    const profile = (data as any)[profileRelation.split("!")[0].split("(")[0]] ||
      (data as any).profiles || (data as any).public_profiles;

    // Redirect to canonical slug URL if available
    if (profile?.username && data.slug) {
      return `${DOMAIN}/${profile.username}/${urlPrefix}/${data.slug}`;
    }
    return { ...data, profile };
  }

  if (!username || !slug) return "not_found";

  // Step 1: Resolve username
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", username)
    .maybeSingle();

  if (!profileData) {
    // Check username_history
    const { data: history } = await supabase
      .from("username_history")
      .select("new_username")
      .eq("old_username", username)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (history?.new_username) {
      return `${DOMAIN}/${history.new_username}/${urlPrefix}/${slug}`;
    }
    return "not_found";
  }

  // Step 2: Resolve slug
  const { data: content } = await (supabase
    .from(table as any)
    .select("*")
    .eq(userIdColumn, profileData.id)
    .eq("slug", slug)
    .maybeSingle() as any);

  if (content) {
    return { ...content, profile: profileData };
  }

  // Step 3: Check slug_history
  const { data: slugHistory } = await supabase
    .from("slug_history")
    .select("new_slug")
    .eq("content_type", contentType)
    .eq("user_id", profileData.id)
    .eq("old_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (slugHistory?.new_slug) {
    return `${DOMAIN}/${username}/${urlPrefix}/${slugHistory.new_slug}`;
  }

  return "not_found";
}
