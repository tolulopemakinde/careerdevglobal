/** 
 * Explicit isolated-development entry point. Not imported by Next.js routes.
 * Run only with dedicated test-only provider credentials and synthetic data.
 */
import { runSdkSyntheticPilot } from "../../lib/ai/pilot/sdk-executor.mjs";

const modelAllowlist = (value) =>
  typeof value === "string" ? value.split(",").map(x=>x.trim()).filter(Boolean) : [];

export async function runExampleSyntheticPilot(prompt, auditWriter) {
  return runSdkSyntheticPilot({
    prompt,
    record:auditWriter,
    config:{
      enabled:process.env.CAREERDEV_AI_PROVIDER_PILOT==="true",
      environment:"isolated-test",
      openaiKey:process.env.OPENAI_PILOT_API_KEY,
      groqKey:process.env.GROQ_PILOT_API_KEY,
      openaiModelId:process.env.OPENAI_PILOT_MODEL,
      groqModelId:process.env.GROQ_PILOT_MODEL,
      openaiModelAllowlist:modelAllowlist(process.env.OPENAI_PILOT_ALLOWED_MODELS),
      groqModelAllowlist:modelAllowlist(process.env.GROQ_PILOT_ALLOWED_MODELS),
      groqFallbackEnabled:process.env.CAREERDEV_GROQ_FALLBACK==="true",
    },
  });
}
