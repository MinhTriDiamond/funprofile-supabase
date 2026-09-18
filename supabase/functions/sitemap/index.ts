import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

const DOMAIN = "https://fun.rich";
const ITEMS_PER_SITEMAP = 5000;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/sitemap/", "").replace(/^\//, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  // Route: sitemap-index.xml
  if (!path || path === "index.xml") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${DOMAIN}/sitemap/users-1.xml</loc></sitemap>
  <sitemap><loc>${DOMAIN}/sitemap/posts-1.xml</loc></sitemap>
  <sitemap><loc>${DOMAIN}/sitemap/videos-1.xml</loc></sitemap>
  <sitemap><loc>${DOMAIN}/sitemap/lives-1.xml</loc></sitemap>
</sitemapindex>`;
    return new Response(xml, { headers: corsHeaders });
  }

  // Parse type and page: e.g. "posts-1.xml"
  const match = path.match(/^(users|posts|videos|lives)-(\d+)\.xml$/);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const type = match[1];
  const page = parseInt(match[2]) - 1;
  const offset = page * ITEMS_PER_SITEMAP;

  let urls: string[] = [];

  if (type === "users") {
    const { data } = await supabase
      .from("profiles")
      .select("username, updated_at")
      .not("username", "is", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + ITEMS_PER_SITEMAP - 1);

    urls = (data || []).map(
      (u: any) =>
        `  <url>
    <loc>${DOMAIN}/${u.username}</loc>
    <lastmod>${new Date(u.updated_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    );
  } else if (type === "posts") {
    const { data } = await supabase
      .from("posts")
      .select("slug, created_at, public_profiles!posts_user_id_fkey(username)")
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + ITEMS_PER_SITEMAP - 1);

    urls = (data || [])
      .filter((p: any) => p.public_profiles?.username && p.slug)
      .map(
        (p: any) =>
          `  <url>
    <loc>${DOMAIN}/${p.public_profiles.username}/post/${p.slug}</loc>
    <lastmod>${new Date(p.created_at).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
      );
  } else if (type === "videos") {
    const { data } = await supabase
      .from("reels")
      .select("slug, created_at, profiles!reels_user_id_fkey(username)")
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + ITEMS_PER_SITEMAP - 1);

    urls = (data || [])
      .filter((v: any) => (v.profiles?.username) && v.slug)
      .map(
        (v: any) =>
          `  <url>
    <loc>${DOMAIN}/${v.profiles.username}/video/${v.slug}</loc>
    <lastmod>${new Date(v.created_at).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
      );
  } else if (type === "lives") {
    const { data } = await supabase
      .from("live_sessions")
      .select("slug, created_at, profiles!live_sessions_owner_id_fkey(username)")
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + ITEMS_PER_SITEMAP - 1);

    urls = (data || [])
      .filter((l: any) => (l.profiles?.username) && l.slug)
      .map(
        (l: any) =>
          `  <url>
    <loc>${DOMAIN}/${l.profiles.username}/live/${l.slug}</loc>
    <lastmod>${new Date(l.created_at).toISOString().split("T")[0]}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>`
      );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, { headers: corsHeaders });
});
