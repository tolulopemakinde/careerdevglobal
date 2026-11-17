import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const keyName = ['SERVICE', 'ROLE', 'KEY'].join('_');
function audit(path, source) {
  const root = mkdtempSync(join(tmpdir(), 'careerdev-source-audit-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(resolve('scripts/audit-source-config.mjs'), join(root, 'scripts/audit-source-config.mjs'));
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
    const result = spawnSync(process.execPath, ['scripts/audit-source-config.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return result.status;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('generated local server credential lookup passes only in the fixture runner', () => {
  assert.equal(audit('tests/calendly-local-supabase.mjs', `const key = process.env.${keyName};`), 0);
  assert.equal(audit('app/client.tsx', `const key = process.env.${keyName};`), 1);
  assert.equal(audit('tests/other.mjs', `const key = process.env.${keyName};`), 1);
});

test('literal credential assignments remain blocked in the fixture runner', () => {
  assert.equal(audit('tests/calendly-local-supabase.mjs', `const ${keyName} = 'fake-fixture-value';`), 1);
  assert.equal(audit('tests/calendly-local-supabase.mjs', `const ${keyName.toLowerCase()} = 'fake-fixture-value';`), 1);
});
