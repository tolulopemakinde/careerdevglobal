/**
 * INACTIVE REFERENCE IMPLEMENTATION ONLY.
 *
 * Do not import from a live Next.js route or Supabase Edge Function.
 * This example cannot run until "ai", "@ai-sdk/openai" and
 * "@ai-sdk/groq" have been installed with a coherent npm lockfile
 * in an isolated development environment and checked against that
 * installed SDK version's bundled documentation.
 */
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { SYNTHETIC_AGENT_ID, runSyntheticProviderPilot } from "../../lib/ai/pilot/provider-routing.mjs";

export async function runSdkSyntheticExample(prompt, record) {
  if (process.env.CAREERDEV_AI_PROVIDER_PILOT !== "true") {
    throw new Error("PILOT_DISABLED");
  }
  const primaryModelId = process.env.OPENAI_PILOT_MODEL;
  const fallbackModelId = process.env.GROQ_PILOT_MODEL;
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!primaryModelId || !openaiKey) throw new Error("PRIMARY_PROVIDER_NOT_CONFIGURED");
  if (process.env.CAREERDEV_GROQ_FALLBACK === "true" &&
      (!fallbackModelId || !groqKey)) {
    throw new Error("FALLBACK_PROVIDER_NOT_CONFIGURED");
  }

  const openai = createOpenAI({ apiKey: openaiKey });
  const groq = groqKey ? createGroq({ apiKey: groqKey }) : null;

  return runSyntheticProviderPilot({
    enabled: true,
    agentId: SYNTHETIC_AGENT_ID,
    synthetic: true,
    requestId: crypto.randomUUID(),
    prompt,
    primary: { provider: "openai", modelId: primaryModelId },
    fallbackEnabled: process.env.CAREERDEV_GROQ_FALLBACK === "true",
    fallback: fallbackModelId ? { provider: "groq", modelId: fallbackModelId } : undefined,
    record, // Inject isolated audit writer; do not log prompts/outputs.
    invoke: async ({ provider, modelId, prompt: syntheticPrompt }) => {
      const model = provider === "openai" ? openai(modelId) : groq?.(modelId);
      if (!model) throw new Error("PROVIDER_UNCONFIGURED");
      const result = await generateText({
        model,
        prompt: syntheticPrompt,
        maxOutputTokens: 450,
        abortSignal: AbortSignal.timeout(15_000),
      });
      return { text: result.text, usage: result.usage };
    },
  });
}
