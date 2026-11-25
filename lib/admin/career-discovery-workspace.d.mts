export type CareerDiscoveryInput = {
  education: string;
  experience: string;
  skills: string;
  goal: string;
  roleTargets?: string;
};

export function createCareerDiscoveryPreview(input: CareerDiscoveryInput, generatedAt?: string): {
  generatedAt: string;
  status: 'testing_preview';
  input: { education: string; experience: string; skills: string[]; goal: string; roleTargets: string[] };
  profileSummary: string;
  careerDirection: string;
  targetRoles: string[];
  recommendations: string[];
  gaps: string[];
  evidenceBoundary: string;
  humanReviewRequired: true;
};
export function careerDiscoveryPreviewToMarkdown(preview: ReturnType<typeof createCareerDiscoveryPreview>): string;
