import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAgentReport, reportFileName } from '../lib/reports/report-text.ts';

test('preserves report sections, source URLs, and uncertainty in a portable text copy', () => {
  const body = formatAgentReport(' Career research ', [
    ['Summary', ' Reviewed role requirements. '],
    ['Sources', ['Official listing\nhttps://example.test/role', '']],
    ['Uncertainty', ['Closing date needs verification.']],
    ['Empty notes', undefined],
  ]);
  assert.equal(body, 'Career research\n\nSummary\nReviewed role requirements.\n\nSources\n• Official listing\nhttps://example.test/role\n\nUncertainty\n• Closing date needs verification.');
});

test('avoids paths or executable suffixes in download filenames', () => {
  assert.equal(reportFileName('../April/report.exe'), 'april-report-exe.txt');
  assert.equal(reportFileName('•••'), 'careerdev-report.txt');
  assert.equal(reportFileName('a'.repeat(150)).length, 84);
});
