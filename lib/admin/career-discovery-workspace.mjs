const MAX_FIELD_LENGTH = 500;

function clean(value, label, required = false) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const result = value.trim();
  if (result.length > MAX_FIELD_LENGTH) throw new Error(`${label} must be ${MAX_FIELD_LENGTH} characters or fewer.`);
  if (required && !result) throw new Error(`Enter ${label.toLowerCase()} using synthetic test data.`);
  return result;
}

export function createCareerDiscoveryPreview(input, generatedAt = new Date().toISOString()) {
  const education = clean(input?.education, 'Education', true);
  const experience = clean(input?.experience, 'Experience', true);
  const skills = clean(input?.skills, 'Skills', true).split(',').map((item) => item.trim()).filter(Boolean);
  const goal = clean(input?.goal, 'Career goal', true);
  const roleTargets = clean(input?.roleTargets || '', 'Target roles').split(',').map((item) => item.trim()).filter(Boolean);
  if (!skills.length) throw new Error('Enter at least one skill using synthetic test data.');

  return {
    generatedAt,
    status: 'testing_preview',
    input: { education, experience, skills, goal, roleTargets },
    profileSummary: `${education}; ${experience}; skills supplied: ${skills.join(', ')}.`,
    careerDirection: `Explore options related to: ${goal}`,
    targetRoles: roleTargets,
    recommendations: [
      'Compare each target role with current job descriptions and confirm required qualifications.',
      'Collect examples that verify the supplied skills and experience before using them in an application.',
      'Discuss preferred direction and constraints with a human career adviser.',
    ],
    gaps: roleTargets.length ? ['Role requirements and profile evidence have not been independently verified.'] : ['No target roles were supplied; select roles for a meaningful comparison.'],
    evidenceBoundary: 'This is a deterministic local preview of supplied synthetic text. It does not infer qualifications, verify evidence, or use real profile data.',
    humanReviewRequired: true,
  };
}

export function careerDiscoveryPreviewToMarkdown(preview) {
  return [
    '# Career Discovery AI — testing preview',
    '',
    `Generated: ${preview.generatedAt}`,
    '',
    '## Supplied synthetic profile',
    `- Education: ${preview.input.education}`,
    `- Experience: ${preview.input.experience}`,
    `- Skills: ${preview.input.skills.join(', ')}`,
    `- Goal: ${preview.input.goal}`,
    `- Target roles: ${preview.targetRoles.length ? preview.targetRoles.join(', ') : 'Not supplied'}`,
    '',
    '## Preview',
    `- Career direction: ${preview.careerDirection}`,
    `- Profile summary: ${preview.profileSummary}`,
    '',
    '### Recommendations',
    ...preview.recommendations.map((item) => `- ${item}`),
    '',
    '### Gaps and evidence boundary',
    ...preview.gaps.map((item) => `- ${item}`),
    `- ${preview.evidenceBoundary}`,
    '- Human review required: yes. Testing only; no operational use.',
    '',
  ].join('\n');
}
