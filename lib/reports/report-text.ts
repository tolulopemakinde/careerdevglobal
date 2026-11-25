export type ReportSource = "career-intelligence" | "career-coach" | "career-research" | "interview-coach" | "agent-worksheet";
export type ReportSection = readonly [heading: string, content: string | readonly string[] | null | undefined];

export function formatAgentReport(title: string, sections: readonly ReportSection[]) {
  const blocks = sections.flatMap(([heading, content]) => {
    if (typeof content === "string") return content.trim() ? [`${heading}\n${content.trim()}`] : [];
    const items = Array.isArray(content) ? content.filter(item => typeof item === "string" && item.trim()).map(item => `• ${item.trim()}`) : [];
    return items.length ? [[heading, ...items].join("\n")] : [];
  });
  return [title.trim(), ...blocks].join("\n\n");
}

export function reportFileName(title: string) {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${stem || "careerdev-report"}.txt`;
}

export function downloadAgentReport(title: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(title);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
