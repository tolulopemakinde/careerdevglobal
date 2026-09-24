import type { MetadataRoute } from "next";
import { createSupabaseServerClient } from "../lib/supabase-server";

const SITE_URL = "https://careerdevglobal-career-dev-global.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createSupabaseServerClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .eq("status", "published");

  const blogUrls = (posts || []).map((post: any) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at || post.published_at || new Date().toISOString(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/career-intelligence`, changeFrequency: "monthly", priority: 0.8 },
    ...blogUrls,
  ];
}
