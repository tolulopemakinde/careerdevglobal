"use client";
import { useEffect } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase-browser";

export default function BlogViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    const key = `cdg-blog-viewed-${postId}`;
    if (sessionStorage.getItem(key)) return;
    const supabase = createSupabaseBrowserClient();
    supabase.from("blog_views").insert({
      post_id: postId,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent || null,
    }).then(() => sessionStorage.setItem(key, "1"));
  }, [postId]);
  return null;
}
