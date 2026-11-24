export type MarketingContentInput = { topic: string; audience: string; cta: string; brandGuidance?: string };
export function createMarketingContentPreview(input: MarketingContentInput, generatedAt?: string): {
  generatedAt: string;
  status: 'testing_preview';
  topic: string;
  audience: string;
  cta: string;
  content: string;
  repurposing: Array<{ channel: string; draft: string }>;
  qualitySummary: string;
  humanReviewRequired: true;
  evidenceBoundary: string;
};
export function marketingContentPreviewToMarkdown(preview: ReturnType<typeof createMarketingContentPreview>): string;
