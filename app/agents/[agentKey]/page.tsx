import { notFound } from "next/navigation";
import { isStructuredAgent, structuredClientCoachAgents } from "../../../supabase/functions/careerdev-ai-agent-runtime/client-coach-structured";
import "../../career-intelligence/styles.css";
import GuidedAgentWorkspace from "./workspace";

export default async function AgentWorkspacePage({ params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params;
  if (!isStructuredAgent(agentKey)) notFound();

  return (
    <main className="ci-page">
      <nav className="ci-subnav" aria-label="Agent navigation">
        <div className="ci-container ci-subnav-inner">
          <a href="/agents">All AI agents</a>
          <a href="/career-intelligence#profile">Career Intelligence profile</a>
        </div>
      </nav>
      <section className="ci-section">
        <div className="ci-container" style={{ maxWidth: 820 }}>
          <h1>{structuredClientCoachAgents[agentKey].name}</h1>
          <GuidedAgentWorkspace agentKey={agentKey} />
        </div>
      </section>
    </main>
  );
}
