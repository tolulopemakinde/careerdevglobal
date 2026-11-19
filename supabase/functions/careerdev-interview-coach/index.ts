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
    job_criteria: { type: "array", items: { type: "string" } },
    final_feedback: {
      type: "object",
      additionalProperties: false,
      properties: {
        overall: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        practice_plan: { type: "array", items: { type: "string" } },
        criteria_assessments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              criterion: { type: "string" },
              assessment: { type: "string", enum: ["strong_evidence", "partial_evidence", "not_demonstrated"] },
              evidence: { type: "string" },
              gap: { type: "string" },
              next_step: { type: "string" },
            },
            required: ["criterion", "assessment", "evidence", "gap", "next_step"],
          },
        },
      },
      required: ["overall", "strengths", "improvements", "practice_plan", "criteria_assessments"],
    },
  },
  required: ["question", "competency", "follow_up", "answer_feedback", "finished", "job_criteria", "final_feedback"],
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
    "Use only the supplied role, industry, company name, job description, company notes, candidate context, and interview answers. Never claim that you opened links or researched the company.",
    "Derive a stable list of 4 to 8 explicit job criteria from the job description and company notes. Include named operating models, evidence requirements, and responsibilities. Return them in job_criteria and reuse the same criteria throughout the session.",
    "Ask questions that collectively cover these criteria. Each follow-up should probe a specific evidence gap such as the candidate's actions, dates, measures, stakeholders, or outcomes.",
    "Tie answer feedback to the candidate's actual answer and the criterion tested. Do not infer experience from profile links or invent candidate experience, achievements, metrics, company facts, or hiring criteria.",
    "Never invent candidate experience, achievements, qualifications, metrics, company facts, or hiring criteria.",
    "Ask a concise follow-up when the candidate's answer needs evidence or clarification; otherwise advance to a different relevant competency.",
    "Do not reveal private reasoning. Give brief, specific and actionable answer feedback after each candidate answer.",
    "Finish when the question limit is reached or the candidate asks to finish. At completion, provide an evidence-grounded summary, strengths, improvements, and a short practice plan. Include one criteria_assessments entry per job criterion with status, answer evidence, gap, and next step. If a criterion was not demonstrated, state that plainly rather than inventing evidence.",
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
    const err = new Error("Groq Free-tier rate limit reached. Your previous answers are saved and your latest answer is still in the form; please try again later.");
    (err as Error & { code?: string }).code = "FREE_PROVIDER_RATE_LIMIT";
    throw err;
  }
  if (!res.ok) {
    const responseText = await res.text();
    let providerError: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(responseText);
      providerError = parsed?.error && typeof parsed.error === "object" ? parsed.error : {};
    } catch { /* Never log provider body or candidate-submitted text. */ }
    const safeField = (value: unknown) => typeof value === "string" ? value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) : "";
    const providerCode = safeField(providerError.code);
    const providerType = safeField(providerError.type);
    const providerParam = safeField(providerError.param);
    console.error("Interview Coach Groq request rejected", { status: res.status, model: MODEL, code: providerCode, type: providerType, param: providerParam });
    const details = [providerCode && `code=${providerCode}`, providerType && `type=${providerType}`, providerParam && `param=${providerParam}`].filter(Boolean).join(", ");
    const err = new Error(`Groq Free rejected this turn (HTTP ${res.status}${details ? `; ${details}` : ""}). Your answer is kept in the form; retry once, or shorten it if the error repeats.`);
    (err as Error & { code?: string }).code = "PROVIDER_REQUEST_REJECTED";
    throw err;
  }
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Free inference provider returned no structured answer.");
  const result = JSON.parse(content);
  if (typeof result.question !== "string" || typeof result.finished !== "boolean" || !Array.isArray(result.job_criteria) || !Array.isArray(result.final_feedback?.criteria_assessments)) {
    throw new Error("Interview response did not match the expected contract.");
  }
  return { result, usage: payload.usage || {} };
}

async function governedGroqTurn(
  caller: ReturnType<typeof createClient>,
  admin: ReturnType<typeof createClient>,
  userId: string,
  context: Record<string, unknown>,
  turns: Array<Record<string, unknown>>,
  limit: number,
  idempotencyKey: string,
) {
  const input = { context, question_limit: limit, turns };
  const { data: requestId, error: requestError } = await caller.rpc("request_ai_agent_execution", {
    p_agent_key: "interview_coach_agent",
    p_workflow_key: "interview_coach_agent_session",
    p_trigger_source: "manual",
    p_input_payload: { input, feature: "interactive_interview_practice" },
  });
  if (requestError || !requestId) {
    const err = new Error(requestError?.message || "This account or plan cannot use Interview Coach.");
    (err as Error & { code?: string }).code = "GOVERNANCE_DENIED";
    throw err;
  }
  const { data: prepared, error: prepareError } = await caller.rpc("prepare_ai_agent_execution", { p_request_id: requestId });
  const executionId = prepared?.execution_id;
  if (prepareError || !executionId) {
    const reason = prepareError?.message || "Execution preparation failed";
    await admin.from("ai_agent_execution_requests").update({ status: "blocked", denial_reason: reason, completed_at: new Date().toISOString() }).eq("id", requestId);
    const err = new Error(reason);
    (err as Error & { code?: string }).code = "GOVERNANCE_DENIED";
    throw err;
  }
  const { data: reservationRows, error: reserveError } = await caller.rpc("reserve_ai_credits", {
    p_operation_key: "interview_coach_agent", p_execution_id: executionId, p_request_id: requestId,
    p_idempotency_key: idempotencyKey, p_metadata: { feature: "interactive_interview_practice" },
  });
  const reservation = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
  if (reserveError || !reservation?.allowed) {
    const reason = reserveError?.message || reservation?.reason || "AI credits are unavailable for this request.";
    const finishedAt = new Date().toISOString();
    await admin.from("ai_agent_execution_requests").update({ status: "blocked", denial_reason: reason, completed_at: finishedAt }).eq("id", requestId);
    await admin.from("ai_agent_executions").update({ status: "blocked", error_message: reason, completed_at: finishedAt, updated_at: finishedAt }).eq("id", executionId);
    await admin.from("ai_agent_execution_events").insert({ request_id: requestId, execution_id: executionId, event_type: "blocked", event_data: { reason }, actor_id: userId });
    const err = new Error(reason);
    (err as Error & { code?: string }).code = "GOVERNANCE_DENIED";
    throw err;
  }
  let claimed = false;
  const ledgerId = reservation.ledger_id || null;
  try {
    if (ledgerId) {
      const { data: claim, error: claimError } = await admin.rpc("claim_ai_runtime_credit", { p_ledger_id: ledgerId, p_user_id: userId });
      if (claimError || claim !== true) throw new Error(claimError?.message || "Could not claim reserved AI credit.");
      claimed = true;
    }
    const startedAt = new Date().toISOString();
    await admin.from("ai_agent_execution_requests").update({ status: "running" }).eq("id", requestId);
    await admin.from("ai_agent_executions").update({ status: "running", started_at: startedAt, updated_at: startedAt }).eq("id", executionId);
    await admin.from("ai_agent_execution_events").insert({ request_id: requestId, execution_id: executionId, event_type: "started", event_data: { provider: "groq_free", model: MODEL }, actor_id: userId });
    const generated = await groqTurn(context, turns, limit);
    if (ledgerId) {
      const { error: settleError } = await admin.rpc("settle_ai_credit_charge", {
        p_ledger_id: ledgerId, p_user_id: userId, p_outcome: "consumed",
        p_metadata: { provider: "groq_free", model: MODEL, token_usage: generated.usage, job_criteria: generated.result.job_criteria },
      });
      if (settleError) throw settleError;
    }
    const finishedAt = new Date().toISOString();
    await admin.from("ai_agent_executions").update({ status: "completed", output_snapshot: generated.result, completed_at: finishedAt, updated_at: finishedAt }).eq("id", executionId);
    await admin.from("ai_agent_execution_requests").update({ status: "completed", completed_at: finishedAt }).eq("id", requestId);
    await admin.from("ai_agent_execution_events").insert({ request_id: requestId, execution_id: executionId, event_type: "completed", event_data: { provider: "groq_free", model: MODEL, token_usage: generated.usage }, actor_id: userId });
    return generated;
  } catch (error) {
    if (ledgerId && claimed) {
      await admin.rpc("settle_ai_credit_charge", {
        p_ledger_id: ledgerId, p_user_id: userId, p_outcome: "released",
        p_metadata: { provider: "groq_free", model: MODEL, failure: error instanceof Error ? error.message : "generation_failed" },
      });
    }
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Interview generation failed.";
    await admin.from("ai_agent_executions").update({ status: "failed", error_message: message.slice(0, 1000), completed_at: failedAt, updated_at: failedAt }).eq("id", executionId);
    await admin.from("ai_agent_execution_requests").update({ status: "failed", denial_reason: message.slice(0, 1000), completed_at: failedAt }).eq("id", requestId);
    await admin.from("ai_agent_execution_events").insert({ request_id: requestId, execution_id: executionId, event_type: "failed", event_data: { error: message.slice(0, 1000) }, actor_id: userId });
    throw error;
  }
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
        company_context: companyContext, question_limit: questionLimit,
        external_ai_consent_at: new Date().toISOString(),
        provider: "groq_free", model: MODEL,
      }).select("id").single();
      if (insertError || !session) return json({ error: "Could not create the interview session." }, 500);
      const context = {
        job_role: jobRole, industry, company_name: companyName, job_description: jobDescription,
        candidate_context: candidateContext, company_context: companyContext,
      };
      let generated;
      try {
        generated = await governedGroqTurn(caller, admin, user.id, context, [], questionLimit, `interview:${session.id}:start`);
      } catch (error) {
        await admin.from("interview_coach_sessions").delete().eq("id", session.id).eq("user_id", user.id);
        throw error;
      }
      const first = generated.result;
      if (!first.question.trim()) throw new Error("Interview Coach did not generate a question.");
      const { error: turnError } = await admin.from("interview_coach_turns").insert({
        session_id: session.id, sequence: 1, speaker: "interviewer", content: first.question,
        competency: first.competency, follow_up: first.follow_up,
        metadata: { provider: "groq_free", model: MODEL, token_usage: generated.usage },
      });
      if (turnError) throw turnError;
      await admin.from("interview_coach_sessions").update({ questions_asked: 1, updated_at: new Date().toISOString() }).eq("id", session.id);
      return json({ session_id: session.id, status: "in_progress", question: first.question, competency: first.competency, job_criteria: first.job_criteria });
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
        company_context: session.company_context,
         job_criteria: Array.isArray(priorTurns?.[0]?.metadata?.job_criteria) ? priorTurns[0].metadata.job_criteria : [],
      };
      const generated = await governedGroqTurn(caller, admin, user.id, context, priorWithAnswer, Number(session.question_limit), `interview:${sessionId}:turn:${sequence}`);
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
    if (code === "GOVERNANCE_DENIED") return json({ error: (error as Error).message, code }, 403);
    if (code === "FREE_PROVIDER_RATE_LIMIT") return json({ error: (error as Error).message, code }, 429);
    if (code === "PROVIDER_REQUEST_REJECTED") return json({ error: (error as Error).message, code }, 502);
    return json({ error: error instanceof Error ? error.message : "Interview Coach failed." }, 502);
  }
});
