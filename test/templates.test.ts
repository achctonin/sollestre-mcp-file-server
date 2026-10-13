import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// str_replace on the END marker only works if the marker appears exactly once.
test('append-only templates contain the END marker exactly once', () => {
  for (const f of ['PLAN_LOG.md', 'CHECKPOINTS.md', 'DECISIONS.md']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'templates', f), 'utf8');
    assert.equal(text.split('<!-- END -->').length - 1, 1, f);
  }
});
test('all four handoff templates exist', () => {
  for (const f of ['PROJECT_STATE.md', 'PLAN_LOG.md', 'CHECKPOINTS.md', 'DECISIONS.md']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'templates', f)), f);
  }
});
