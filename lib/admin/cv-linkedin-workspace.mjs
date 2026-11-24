const MAX_LENGTH = 1500;

function requiredText(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`Enter ${label.toLowerCase()} using synthetic source facts.`);
  if (cleaned.length > MAX_LENGTH) throw new Error(`${label} must be ${MAX_LENGTH} characters or fewer.`);
  return cleaned;
}

function list(value, label) {
  const cleaned = requiredText(value, label);
  return cleaned.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function createCvLinkedInPreview(input, generatedAt = new Date().toISOString()) {
  const targetRole = requiredText(input?.targetRole, 'Target role');
  const summary = requiredText(input?.summary, 'Career summary');
  const experience = list(input?.experience, 'Experience evidence');
  const skills = list(input?.skills, 'Skills');
  const cvDraft = [
    `# ${targetRole} — CV testing draft`,
    '',
    '## Professional summary',
    summary,
    '',
    '## Experience evidence supplied',
    ...experience.map((item) => `- ${item}`),
    '',
    '## Skills supplied',
    skills.join(' · '),
  ].join('\n');
  const linkedinDraft = [
    `Headline: ${targetRole} | ${skills.slice(0, 3).join(' · ')}`,
    '',
    'About draft:',
    summary,
    '',
    'Experience evidence to review:',
    ...experience.map((item) => `- ${item}`),
  ].join('\n');

  return {
    generatedAt,
    status: 'testing_preview',
    targetRole,
    cvDraft,
    linkedinDraft,
    sourceEvidence: { experience, skills },
    qualitySummary: 'Draft formatting uses only supplied synthetic source facts; no achievements, dates, metrics, or credentials were inferred.',
    unsupportedClaimsAdded: false,
    humanReviewRequired: true,
    evidenceBoundary: 'Verify every statement against source documents before sharing. This local preview is not a final CV or LinkedIn profile.',
  };
}

export function cvLinkedInPreviewToMarkdown(preview) {
  return [
    '# CV & LinkedIn AI — testing preview',
    '',
    `Generated: ${preview.generatedAt}`,
    '',
    '## CV draft',
    preview.cvDraft,
    '',
    '## LinkedIn draft',
    preview.linkedinDraft,
    '',
    '## Quality and review',
    `- ${preview.qualitySummary}`,
    `- Unsupported claims added: ${preview.unsupportedClaimsAdded ? 'yes' : 'no'}`,
    `- ${preview.evidenceBoundary}`,
    '- Human review required: yes. Testing only; no operational use.',
    '',
  ].join('\n');
}
