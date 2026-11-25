"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase-browser";
import "../../blog/blog.css";

const blankArticle: any = {
  id: "", title: "", slug: "", excerpt: "", content: "", category: "Career Development", tags: "",
  featured_image_url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1800&q=85",
  status: "draft", featured: false, seo_title: "", seo_description: "", canonical_url: "", og_image_url: "",
};

const syntheticContentPreview = {
  title: "Career Development Starts With Clear Next Steps",
  slug: "career-development-clear-next-steps",
  excerpt: "A practical way to turn career goals into focused next steps.",
  content: "[Synthetic test draft] Begin with a clear career question, review the evidence you already have, and identify one skill or experience gap to address. Compare your next steps with current role requirements and ask a qualified coach or colleague to review important decisions. This sample contains no researched claims or external sources.",
  category: "Career Development",
  tags: ["career planning", "skills development"],
  seo_title: "Career Development: A Practical Next-Step Guide",
  seo_description: "A synthetic test draft showing the content fields and review boundaries for Marketing Content AI.",
  cta: "Explore CareerDev Global career development support.",
  source_refs: [],
  verification_gate: false,
  human_review_required: true,
};

export default function AdminBlog() {
  const supabase = createSupabaseBrowserClient();
  const [form, setForm] = useState<any>(blankArticle);
  const [posts, setPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [marketingAgent, setMarketingAgent] = useState<any>(null);
  const [mockDraft, setMockDraft] = useState<any>(null);

  async function load() {
    const [postResult, commentResult, agentResult] = await Promise.all([
      supabase.from("blog_posts").select("*").order("created_at", { ascending: false }),
      supabase.from("blog_comments").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_agent_registry").select("status,active,human_approval_required").eq("agent_key", "marketing_content_ai").maybeSingle(),
    ]);
    setPosts(postResult.data || []);
    setComments(commentResult.data || []);
    setMarketingAgent(agentResult.error ? null : agentResult.data);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { location.href = "/admin/login"; return; }
      const { data: role } = await supabase.rpc("get_my_role");
      if (role?.role !== "admin") { location.href = "/admin"; return; }
      await load();
    });
  }, []);

  async function save() {
    const payload = {
      ...form,
      tags: form.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean),
      published_at: form.status === "published" ? (form.published_at || new Date().toISOString()) : null,
    };
    delete payload.id;
    const query = form.id
      ? supabase.from("blog_posts").update(payload).eq("id", form.id)
      : supabase.from("blog_posts").insert(payload);
    const { error } = await query;
    setMessage(error?.message || "Article saved.");
    if (!error) { setForm(blankArticle); await load(); }
  }

  async function deleteArticle(id: string) {
    if (!confirm("Delete this article?")) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    setMessage(error?.message || "Article deleted.");
    await load();
  }

  function runSyntheticContentPreview() {
    setMockDraft(syntheticContentPreview);
    setMessage("Synthetic content preview generated locally. It was not saved, published, or sent to an AI provider.");
  }

  async function generateAIDraft() {
    const { data: agent, error: agentError } = await supabase.from("ai_agent_registry")
      .select("status,active,human_approval_required").eq("agent_key", "marketing_content_ai").maybeSingle();
    if (agentError || agent?.status !== "active" || agent?.active !== true || agent?.human_approval_required !== true) {
      setMarketingAgent(agent || null);
      setMessage("Live Marketing Content AI is unavailable while the agent is testing or its human-review gate is not confirmed. Use the local synthetic preview; no request or provider call was made.");
      return;
    }

    setAiBusy(true);
    setMessage("Running governed Marketing & Content AI draft workflow…");
    try {
      const topic = "Choose a timely, useful CareerDev Global career-development topic that complements the existing Blog library and does not duplicate an existing published article.";
      const input = {
        topic,
        audience: "professionals, students, graduates, executives and globally mobile talent",
        brand_guidance: "CareerDev Global — Developing careers, leaders, and talents across borders. Practical, evidence-grounded, inclusive, globally relevant. Never fabricate facts or sources. Create a draft only; never publish automatically.",
        content_strategy: "Build search-friendly and AI-discoverable educational content with a clear structure, concise answers, practical steps, relevant internal-link opportunities, SEO/GEO metadata, and a non-intrusive CareerDev Global service CTA.",
        output_schema: {
          type: "object", additionalProperties: false,
          properties: {
            title: { type: "string" }, slug: { type: "string" }, excerpt: { type: "string" }, content: { type: "string" },
            category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, seo_title: { type: "string" },
            seo_description: { type: "string" }, canonical_url: { type: "string" }, og_image_url: { type: "string" }, cta: { type: "string" },
            source_refs: { type: "array", items: { type: "string" } }, verification_gate: { type: "boolean" }, human_review_required: { type: "boolean" },
          },
          required: ["title", "slug", "excerpt", "content", "category", "tags", "seo_title", "seo_description", "canonical_url", "og_image_url", "cta", "source_refs", "verification_gate", "human_review_required"],
        },
      };
      const request = await supabase.rpc("request_ai_agent_execution", { p_agent_key: "marketing_content_ai", p_workflow_key: "weekly_blog_draft", p_trigger_source: "admin_blog_draft", p_input_payload: input });
      if (request.error || !request.data) throw new Error(request.error?.message || "Could not create governed Blog AI request.");
      const prepared = await supabase.rpc("prepare_ai_agent_execution", { p_request_id: request.data });
      if (prepared.error || !prepared.data) throw new Error(prepared.error?.message || "Could not prepare governed Blog AI execution.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const runtimeUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ufmhrmzumqkjvaezrmxf.supabase.co") + "/functions/v1/careerdev-ai-agent-runtime";
      const response = await fetch(runtimeUrl, { method: "POST", headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ request_id: request.data }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Governed AI runtime failed.");
      const output = body?.output;
      if (!output) throw new Error("The AI workflow returned no draft.");
      const duplicate = posts.some((post) => post.slug === output.slug || String(post.title || "").toLowerCase() === String(output.title || "").toLowerCase());
      if (duplicate) { setMessage("AI produced a title/slug already present in the Blog. No draft was inserted. Generate again after changing the topic."); return; }
      setForm({ ...blankArticle, title: output.title || "", slug: output.slug || "", excerpt: output.excerpt || "", content: output.content || "", category: output.category || "Career Development", tags: Array.isArray(output.tags) ? output.tags.join(", ") : "", seo_title: output.seo_title || output.title || "", seo_description: output.seo_description || output.excerpt || "", canonical_url: output.canonical_url || "", og_image_url: output.og_image_url || blankArticle.og_image_url, status: "draft", featured: false, ai_generated: true, ai_generation_notes: JSON.stringify({ workflow: "weekly_blog_draft", source_refs: output.source_refs || [], verification_gate: output.verification_gate, human_review_required: output.human_review_required, generated_at: new Date().toISOString() }), id: "" });
      setMessage("AI draft generated and loaded into the editor. Review and edit it before saving or publishing.");
    } catch (error: any) {
      setMessage(error?.message || "AI Blog draft failed.");
    } finally {
      setAiBusy(false);
    }
  }

  async function moderateComment(id: string, status: string) {
    const { error } = await supabase.from("blog_comments").update({ status }).eq("id", id);
    setMessage(error?.message || "Comment updated.");
    await load();
  }

  const liveDraftEnabled = marketingAgent?.status === "active" && marketingAgent?.active === true && marketingAgent?.human_approval_required === true;

  return <main className="admin-blog"><div className="admin-blog-shell">
    <div className="admin-blog-header"><div><div className="blog-kicker">CAREERDEV GLOBAL ADMIN</div><h1>Blog Management</h1><p>Create, edit, publish and moderate every Blog article.</p></div><div className="admin-actions"><a className="admin-btn secondary" href="/admin">← Admin Dashboard</a><a className="admin-btn" href="/blog">View Blog</a></div></div>
    <div className="admin-grid">
      <section className="panel"><h2>{form.id ? "Edit article" : "Create article"}</h2><div className="admin-form">
        {["title", "slug", "excerpt", "featured_image_url", "seo_title", "seo_description", "canonical_url", "og_image_url"].map((key) => <input key={key} placeholder={key.replaceAll("_", " ")} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}
        <input placeholder="tags, comma separated" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
        <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Career Development</option><option>Career Intelligence</option><option>Leadership</option><option>Talent Mobility</option><option>Employability</option><option>Education & Research</option><option>AI & Future of Work</option></select>
        <textarea placeholder="Article content (HTML supported)" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
        <label><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /> Featured article</label>
        <div className="admin-actions"><button className="admin-btn" onClick={save}>Save article</button><button className="admin-btn secondary" onClick={runSyntheticContentPreview}>Run synthetic content preview</button><button className="admin-btn secondary" onClick={generateAIDraft} disabled={aiBusy || !liveDraftEnabled} title={!liveDraftEnabled ? "Available only after the agent is approved and active." : undefined}>{aiBusy ? "Generating AI draft…" : "Generate governed AI draft"}</button><button className="admin-btn secondary" onClick={() => setForm(blankArticle)}>Clear</button></div>
        {!liveDraftEnabled && <p role="note">Marketing Content AI is in testing. Live generation is disabled; synthetic previews make no AI or runtime calls.</p>}
        {message && <p role="status">{message}</p>}
        {mockDraft && <article aria-label="Synthetic content preview" style={{ marginTop: 16, padding: 16, border: "1px solid #c8d9e8", borderRadius: 12, background: "#f8fcff" }}><strong>Synthetic Marketing Content preview</strong><p><b>{mockDraft.title}</b></p><p>{mockDraft.excerpt}</p><div style={{ whiteSpace: "pre-wrap" }}>{mockDraft.content}</div><p><b>CTA:</b> {mockDraft.cta}</p><p><b>Sources:</b> None — synthetic fixture</p><p><b>Human review required:</b> Yes</p></article>}
      </div></section>
      <section className="panel"><h2>Articles</h2><div className="admin-list">{posts.map((post) => <div className="admin-item" key={post.id}><strong>{post.title}</strong><span className="status-pill">{post.status}{post.ai_generated ? " · AI draft" : ""}</span><div className="admin-actions"><button className="admin-btn secondary" onClick={() => setForm({ ...post, tags: (post.tags || []).join(", ") })}>Edit</button><button className="admin-btn secondary" onClick={() => deleteArticle(post.id)}>Delete</button>{post.status === "published" && <a className="admin-btn secondary" href={"/blog/" + post.slug}>View</a>}</div></div>)}</div>
        <h2 style={{ marginTop: 28 }}>Comments</h2><div className="admin-list">{comments.map((comment) => <div className="admin-item" key={comment.id}><strong>{comment.content}</strong><span className="status-pill">{comment.status}</span><div className="admin-actions">{["approved", "rejected", "pending"].map((status) => <button key={status} className="admin-btn secondary" onClick={() => moderateComment(comment.id, status)}>{status}</button>)}</div></div>)}</div>
      </section>
    </div>
  </div></main>;
}
