import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  allowedOrigin,
  consumeRateLimit,
  diagnosticRecord,
  preflightResponse,
  readJsonWithLimit,
  requestKey,
  securityError,
  securityResponse,
  validateCoachMatchingInput,
} from "../_shared/edge-security.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const model = new Supabase.ai.Session("gte-small");

const publicCoach = (coach: any) => ({
  coach_id: coach.coach_id,
  display_name: coach.display_name,
  headline: coach.headline,
  bio: coach.bio,
  specializations: coach.specializations,
  coaching_formats: coach.coaching_formats,
  languages: coach.languages,
  timezone: coach.timezone,
  country: coach.country,
  years_coaching: coach.years_coaching,
});

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const originHeader = request.headers.get("origin");
  const origin = allowedOrigin(request, configuredOrigins);

  if (request.method === "OPTIONS") {
    return originHeader && !origin
      ? securityError("FORBIDDEN_ORIGIN", 403, requestId)
      : preflightResponse(requestId, origin);
  }
  if (originHeader && !origin) return securityError("FORBIDDEN_ORIGIN", 403, requestId);
  if (request.method !== "POST") return securityError("METHOD_NOT_ALLOWED", 405, requestId, origin);

  const budget = consumeRateLimit(requestKey(request));
  if (!budget.allowed) {
    return securityError("RATE_LIMITED", 429, requestId, origin, { retryAfterSeconds: budget.retryAfterSeconds });
  }

  try {
    const parsed = await readJsonWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) return securityError(parsed.code, parsed.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, requestId, origin);
    const validated = validateCoachMatchingInput(parsed.value);
    if (!validated.ok) return securityError("INVALID_INPUT", 400, requestId, origin);

    const { goal, mode, signals } = validated.value;
    const supabase = createClient(supabaseUrl, publishableKey);
    const { data: candidates, error: candidateError } = await supabase.rpc("get_public_coach_matching_candidates", { p_limit: 20 });
    if (candidateError) throw candidateError;

    const list = Array.isArray(candidates) ? candidates : [];
    const available = list.map(publicCoach);
    const embedding = Array.from(await model.run([goal, ...signals].join(". "), { mean_pool: true, normalize: true }));
    const { data, error } = await supabase.rpc("find_public_coach_matches", {
      p_query_embedding: embedding,
      p_mode: mode,
      p_limit: 10,
    });
    if (error) throw error;

    let ranked = Array.isArray(data) ? data : [];
    let fallback = false;
    if (ranked.length === 0) {
      const scored: any[] = [];
      for (const coach of list) {
        if (!coach.source_text) continue;
        const vector = Array.from(await model.run(coach.source_text, { mean_pool: true, normalize: true }));
        let dot = 0;
        const length = Math.min(embedding.length, vector.length);
        for (let index = 0; index < length; index += 1) dot += Number(embedding[index] ?? 0) * Number(vector[index] ?? 0);
        const semantic = Math.max(0, Math.min(1, dot));
        const modeFit = mode === "Any format" || (coach.coaching_formats ?? []).includes(mode) ? 1 : 0;
        const combined = semantic * 75 + modeFit * 25;
        scored.push({
          ...publicCoach(coach),
          semantic_score: Number((semantic * 100).toFixed(2)),
          combined_score: Number(combined.toFixed(2)),
          match_reasons: [semantic >= 0.55 ? "Semantic goal and expertise alignment identified" : "Relevant active coach available for your goal", modeFit ? "Preferred coaching format matches" : null].filter(Boolean),
          mismatch_flags: modeFit ? [] : ["Preferred coaching format differs"],
        });
      }
      scored.sort((left, right) => right.combined_score - left.combined_score);
      ranked = scored.slice(0, 10);
      fallback = true;
    }

    return securityResponse({ engine: "07B.92", model: "gte-small", goal, mode, signals, matches: ranked, available_coaches: available, fallback }, 200, requestId, origin);
  } catch (error) {
    console.error(JSON.stringify(diagnosticRecord(requestId, error)));
    return securityError("INTERNAL_ERROR", 500, requestId, origin);
  }
});
