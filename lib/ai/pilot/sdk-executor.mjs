/**
 * CareerDev Global: isolated Vercel AI SDK adapter.
 *
 * Deliberately has no public API route and cannot be called in NODE_ENV=production.
 * This is NOT a replacement for the Supabase runtime's existing auth/credit workflow.
 * Provider credentials are only read from explicit development-only configuration.
 */
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { runSyntheticProviderPilot, PilotPolicyError, SYNTHETIC_AGENT_ID } from "./provider-routing.mjs";

function allowlisted(id, allowlist) {
  return typeof id === "string" && Array.isArray(allowlist) &&
    allowlist.length > 0 && allowlist.includes(id);
}

/**
 * @param {{
 *   prompt:string,
 *   record:(event:object)=>Promise<void>,
 *   config:{
 *      enabled:boolean,
 *      environment:"isolated-test",
 *      openaiKey:string, groqKey?:string,
 *      openaiModelId:string, groqModelId?:string,
 *      openaiModelAllowlist:string[], groqModelAllowlist?:string[],
 *      groqFallbackEnabled?:boolean,
 *   },
 *   generate?: typeof generateText
 * }} request
 */
export async function runSdkSyntheticPilot(request) {
  if (process.env.NODE_ENV === "production") throw new PilotPolicyError("PRODUCTION_ENVIRONMENT_BLOCKED");
  if (request?.config?.enabled !== true || request?.config?.environment !== "isolated-test") {
    throw new PilotPolicyError("PILOT_DISABLED");
  }
  if (typeof request?.record !== "function") throw new PilotPolicyError("AUDIT_WRITER_REQUIRED");

  const cfg = request.config;
  if (typeof cfg.openaiKey !== "string" || cfg.openaiKey.length < 3 ||
      !allowlisted(cfg.openaiModelId, cfg.openaiModelAllowlist)) {
    throw new PilotPolicyError("PRIMARY_PROVIDER_NOT_CONFIGURED");
  }
  if (cfg.groqFallbackEnabled === true &&
      (typeof cfg.groqKey !== "string" || cfg.groqKey.length < 3 ||
       !allowlisted(cfg.groqModelId, cfg.groqModelAllowlist))) {
    throw new PilotPolicyError("FALLBACK_PROVIDER_NOT_CONFIGURED");
  }

  const openai = createOpenAI({apiKey:cfg.openaiKey});
  const groq = cfg.groqFallbackEnabled ? createGroq({apiKey:cfg.groqKey}) : null;
  const doGenerate = request.generate ?? generateText;
  if (typeof doGenerate !== "function") throw new PilotPolicyError("INVALID_GENERATOR");

  return runSyntheticProviderPilot({
    enabled:true, agentId:SYNTHETIC_AGENT_ID, synthetic:true,
    requestId:crypto.randomUUID(), prompt:request.prompt,
    primary:{provider:"openai",modelId:cfg.openaiModelId},
    fallbackEnabled:cfg.groqFallbackEnabled === true,
    fallback:cfg.groqFallbackEnabled ? {provider:"groq",modelId:cfg.groqModelId} : undefined,
    record:request.record,
    invoke:async ({provider,modelId,prompt}) => {
      const model=provider==="openai" ? openai(modelId) : groq(modelId);
      const result=await doGenerate({
        model, prompt, maxOutputTokens:400,
        // generateText retries twice by default. Disable SDK-level retries so
        // our one-primary / at-most-one-fallback policy remains auditable.
        maxRetries:0,
        abortSignal:AbortSignal.timeout(15000),
      });
      return {text:result.text,usage:result.usage};
    },
  });
}
