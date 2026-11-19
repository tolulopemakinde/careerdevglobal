import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODEL = Deno.env.get("INTERVIEW_COACH_GROQ_MODEL") || "openai/gpt-oss-20b";
const MAX_QUESTION_LIMIT = 10;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: { type: "string" },
    competency: { type: "string" },
    follow_up: { type: "boolean" },
    answer_feedback: { type: "string" },
    finished: { type: "boolean" },
    final_feedback: {
      type: "object",
      additionalProperties: false,
      properties: {
        overall: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        practice_plan: { type: "array", items: { type: "string" } },
      },
      required: ["overall", "strengths", "improvements", "practice_plan"],
    },
  },
  required: ["question", "competency", "follow_up", "answer_feedback", "finished", "final_feedback"],
};

function assertFreeProvider() {
  if (!Deno.env.get("GROQ_API_KEY") || Deno.env.get("GROQ_FREE_TIER_CONFIRMED") !== "true") {
    const err = new Error("Add a Groq API key from a confirmed Free-tier account. No paid provider fallback is enabled.");
    (err as Error & { code?: string }).code = "FREE_PROVIDER_NOT_CONFIGURED";
    throw err;
  }
}
function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validHttpUrl(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (typeof item !== "string" || item.length > 500) return [];
    try {
      const url = new URL(item);
      return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
}

async function groqTurn(context: Record<string, unknown>, turns: Array<Record<string, unknown>>, limit: number) {
  const key = Deno.env.get("GROQ_API_KEY");
  const freeTierConfirmed = Deno.env.get("GROQ_FREE_TIER_CONFIRMED") === "true";
  if (!key || !freeTierConfirmed) {
    const err = new Error("Free Groq inference is not configured. No paid provider fallback was attempted.");
    (err as Error & { code?: string }).code = "FREE_PROVIDER_NOT_CONFIGURED";
    throw err;
  }

  const system = [
    "You are CareerDev Global's interactive Interview Coach.",
    "Run a realistic, supportive mock interview one question at a time.",
    "Tailor questions only to the supplied job role, industry, company name, job description, company notes, and candidate context.",
    "The company notes and source URLs are user-supplied context. Do not claim that you visited or verified a company website.",
    "Never invent candidate experience, achievements, qualifications, metrics, company facts, or hiring criteria.",
    "Ask a concise follow-up when the candidate's answer needs evidence or clarification; otherwise advance to a different relevant competency.",
    "Do not reveal private reasoning. Give brief actionable answer feedback after each candidate answer.",
    "Finish when the question limit is reached or the candidate asks to finish. At completion, provide an evidence-grounded summary, strengths, improvements, and a short practice plan.",
    "Do not promise that practice will secure employment. Keep feedback respectful, job-related, and non-discriminatory.",
    "Return only JSON that conforms to the supplied schema.",
  ].join(" ");

  const messages = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ context, question_limit: limit, turns }) },
  ];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_completion_tokens: 1400,
      response_format: {
        type: "json_schema",
        json_schema: { name: "interview_coach_turn", strict: true, schema: responseSchema },
      },
    }),
  });
  if (res.status === 429) {
    const err = new Error("Groq free-tier rate limit reached. Your session is saved; please try again later.");
    (err as Error & { code?: string }).code = "FREE_PROVIDER_RATE_LIMIT";
    throw err;
  }
  if (!res.ok) throw new Error("Free inference provider returned HTTP " + res.status);
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Free inference provider returned no structured answer.");
  const result = JSON.parse(content);
  if (typeof result.question !== "string" || typeof result.finished !== "boolean") {
    throw new Error("Interview response did not match the expected contract.");
  }
  return { result, usage: payload.usage || {} };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active" || !["client", "coach", "admin", "staff"].includes(profile.role)) {
    return json({ error: "Active CareerDev Global access is required" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body.action;

  try {
    if (action === "start") {
      const jobRole = boundedText(body.job_role, 160);
      const industry = boundedText(body.industry, 160);
      const companyName = boundedText(body.company_name, 200);
      const jobDescription = boundedText(body.job_description, 16000);
      const candidateContext = boundedText(body.candidate_context, 8000);
      const companyContext = boundedText(body.company_context, 8000);
      const sourceUrls = validHttpUrl(body.source_urls);
      const questionLimit = Math.trunc(Math.max(3, Math.min(MAX_QUESTION_LIMIT, Number(body.question_limit) || 6)));
      if (body.external_ai_consent !== true) return json({ error: "Consent is required before interview context is sent to Groq." }, 400);
      assertFreeProvider();
      if (!jobRole || !industry || !companyName) {
        return json({ error: "Job role, industry, and company are required." }, 400);
      }
      if (!jobDescription && !companyContext) {
        return json({ error: "Add the job description or company notes so practice can be tailored to the opportunity." }, 400);
      }

      const { data: session, error: insertError } = await admin.from("interview_coach_sessions").insert({
        user_id: user.id, job_role: jobRole, industry, company_name: companyName,
        job_description: jobDescription, candidate_context: candidateContext,
        company_context: companyContext, source_urls: sourceUrls, question_limit: questionLimit,
        external_ai_consent_at: new Date().toISOString(),
        provider: "groq_free", model: MODEL,
      }).select("id").single();
      if (insertError || !session) return json({ error: "Could not create the interview session." }, 500);
      const context = {
        job_role: jobRole, industry, company_name: companyName, job_description: jobDescription,
        candidate_context: candidateContext, company_context: companyContext, source_urls: sourceUrls,
      };
      const generated = await groqTurn(context, [], questionLimit);
      const first = generated.result;
      if (!first.question.trim()) throw new Error("Interview Coach did not generate a question.");
      const { error: turnError } = await admin.from("interview_coach_turns").insert({
        session_id: session.id, sequence: 1, speaker: "interviewer", content: first.question,
        competency: first.competency, follow_up: first.follow_up,
        metadata: { provider: "groq_free", model: MODEL, token_usage: generated.usage },
      });
      if (turnError) throw turnError;
      await admin.from("interview_coach_sessions").update({ questions_asked: 1, updated_at: new Date().toISOString() }).eq("id", session.id);
      return json({ session_id: session.id, status: "in_progress", question: first.question, competency: first.competency });
    }

    if (action === "respond") {
      const sessionId = boundedText(body.session_id, 80);
      const answer = boundedText(body.answer, 8000);
      if (!sessionId || !answer) return json({ error: "session_id and answer are required." }, 400);
      assertFreeProvider();
      const { data: session } = await admin.from("interview_coach_sessions").select("*").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
      if (!session) return json({ error: "Interview session not found." }, 404);
      if (session.status !== "in_progress") return json({ error: "This interview session is not active." }, 409);

      const { data: priorTurns, error: turnsError } = await admin.from("interview_coach_turns").select("*").eq("session_id", sessionId).order("sequence");
      if (turnsError) return json({ error: "Could not load interview turns." }, 500);
      const sequence = (priorTurns || []).length + 1;
      const priorWithAnswer = [...(priorTurns || []), { speaker: "candidate", content: answer }];
      const context = {
        job_role: session.job_role, industry: session.industry, company_name: session.company_name,
        job_description: session.job_description, candidate_context: session.candidate_context,
        company_context: session.company_context, source_urls: session.source_urls,
      };
      const generated = await groqTurn(context, priorWithAnswer, Number(session.question_limit));
      const output = generated.result;
      if (Number(session.questions_asked) >= Number(session.question_limit)) output.finished = true;
      const { error: answerError } = await admin.from("interview_coach_turns").insert({
        session_id: sessionId, sequence, speaker: "candidate", content: answer,
      });
      if (answerError) return json({ error: "Could not save your answer." }, 500);
      const nextSequence = sequence + 1;
      const turnRecord: Record<string, unknown> = {
        session_id: sessionId, sequence: nextSequence, speaker: "interviewer",
        content: output.finished ? "Interview practice complete." : output.question,
        competency: output.competency, follow_up: output.follow_up,
        feedback: output.answer_feedback,
        metadata: { provider: "groq_free", model: MODEL, token_usage: generated.usage, final_feedback: output.final_feedback },
      };
      const { error: nextError } = await admin.from("interview_coach_turns").insert(turnRecord);
      if (nextError) return json({ error: "Could not save the next interview turn." }, 500);
      const asked = Number(session.questions_asked) + (output.finished ? 0 : 1);
      const status = output.finished ? "completed" : "in_progress";
      const { error: updateError } = await admin.from("interview_coach_sessions")
        .update({ status, questions_asked: asked, final_feedback: output.finished ? output.final_feedback : null, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (updateError) return json({ error: "Could not update the interview session." }, 500);
      return json({
        session_id: sessionId, status, finished: output.finished,
        question: output.finished ? "" : output.question,
        competency: output.competency,
        answer_feedback: output.answer_feedback,
        final_feedback: output.finished ? output.final_feedback : null,
      });
    }
    return json({ error: "action must be start or respond" }, 400);
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "FREE_PROVIDER_NOT_CONFIGURED") return json({ error: (error as Error).message, code }, 503);
    if (code === "FREE_PROVIDER_RATE_LIMIT") return json({ error: (error as Error).message, code }, 429);
    return json({ error: error instanceof Error ? error.message : "Interview Coach failed." }, 502);
  }
});
