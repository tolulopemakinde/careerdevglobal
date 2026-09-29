import * as Sentry from "@sentry/nextjs";

export type CareerDevAgentRun = {
  agent: string;
  runId?: string;
  workflow?: string;
  role?: "client" | "coach" | "admin" | "system";
};

export async function withCareerDevAgentObservability<T>(
  context: CareerDevAgentRun,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  return Sentry.startSpan(
    {
      name: `CareerDev AI Agent: ${context.agent}`,
      op: "ai.agent.run",
      attributes: {
        "ai.agent.name": context.agent,
        "ai.agent.run_id": context.runId ?? "unknown",
        "ai.workflow": context.workflow ?? "unknown",
        "careerdev.role": context.role ?? "system",
      },
    },
    async (span) => {
      try {
        const result = await operation();
        span.setAttribute("ai.agent.success", true);
        span.setAttribute("ai.agent.duration_ms", Date.now() - startedAt);
        return result;
      } catch (error) {
        span.setAttribute("ai.agent.success", false);
        span.setAttribute("ai.agent.duration_ms", Date.now() - startedAt);
        Sentry.captureException(error, {
          tags: {
            "careerdev.ai_agent": context.agent,
            "careerdev.workflow": context.workflow ?? "unknown",
          },
          extra: {
            agent_run_id: context.runId ?? "unknown",
            role: context.role ?? "system",
          },
        });
        throw error;
      }
    },
  );
}
