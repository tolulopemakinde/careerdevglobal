export type CvLinkedInInput = { targetRole: string; summary: string; experience: string; skills: string };
export function createCvLinkedInPreview(input: CvLinkedInInput, generatedAt?: string): {
  generatedAt: string;
  status: 'testing_preview';
  targetRole: string;
  cvDraft: string;
  linkedinDraft: string;
  sourceEvidence: { experience: string[]; skills: string[] };
  qualitySummary: string;
  unsupportedClaimsAdded: false;
  humanReviewRequired: true;
  evidenceBoundary: string;
};
export function cvLinkedInPreviewToMarkdown(preview: ReturnType<typeof createCvLinkedInPreview>): string;
