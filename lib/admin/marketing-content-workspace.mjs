const MAX_LENGTH = 400;

function readField(value, label, required = false) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`Enter ${label.toLowerCase()} using synthetic test data.`);
  if (cleaned.length > MAX_LENGTH) throw new Error(`${label} must be ${MAX_LENGTH} characters or fewer.`);
  return cleaned;
}

export function createMarketingContentPreview(input, generatedAt = new Date().toISOString()) {
  const topic = readField(input?.topic, 'Topic', true);
  const audience = readField(input?.audience, 'Audience', true);
  const cta = readField(input?.cta, 'Call to action', true);
  const brandGuidance = readField(input?.brandGuidance || '', 'Brand guidance');
  const content = `For ${audience}, a practical starting point for ${topic} is to clarify one goal, review the experience you already have, and choose one useful next step. Use a specific example from your own work to make the message relevant. ${brandGuidance ? `Brand note: ${brandGuidance}` : ''}`.trim();
  const repurposing = [{ channel: 'LinkedIn', draft: `${topic}: Start with one clear goal, use a real example, and share one next step. ${cta}` }];
  return {
    generatedAt,
    status: 'testing_preview',
    topic,
    audience,
    cta,
    content,
    repurposing,
    qualitySummary: 'Deterministic template preview; no unsupported statistics, promises, or factual claims were added.',
    humanReviewRequired: true,
    evidenceBoundary: 'This preview uses only the supplied synthetic fields. It has not been fact-checked, saved, published, or sent.',
  };
}

export function marketingContentPreviewToMarkdown(preview) {
  return [
    '# Marketing Content AI — testing preview',
    '',
    `Generated: ${preview.generatedAt}`,
    `Topic: ${preview.topic}`,
    `Audience: ${preview.audience}`,
    '',
    '## Draft',
    preview.content,
    '',
    '## Call to action',
    preview.cta,
    '',
    '## Repurposing',
    ...preview.repurposing.map((item) => `### ${item.channel}\n${item.draft}`),
    '',
    '## Review',
    `- ${preview.qualitySummary}`,
    `- ${preview.evidenceBoundary}`,
    '- Human review required: yes. Testing only; no publishing or external action.',
    '',
  ].join('\n');
}
