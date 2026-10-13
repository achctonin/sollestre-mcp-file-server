import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logCall, truncateArgs, logFilePath } from '../src/logger';

test('logCall appends one JSON line with required fields and truncated content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
  process.env.LOG_DIR = dir;
  logCall({ role: 'builder', session_id: 's1', tool: 'write_file', args: { path: 'a.ts', content: 'x'.repeat(5000) }, ok: true, duration_ms: 3 });
  logCall({ role: 'planner', session_id: undefined, tool: 'read_file', args: {}, ok: false, error: 'boom', duration_ms: 1 });
  const lines = fs.readFileSync(logFilePath(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  for (const k of ['timestamp', 'role', 'session_id', 'tool', 'args', 'ok', 'duration_ms']) assert.ok(k in lines[0], k);
  assert.ok(lines[0].args.content.length < 260);
  assert.equal(lines[1].ok, false);
  assert.equal(lines[1].error, 'boom');
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.LOG_DIR;
});

test('truncateArgs shortens nested strings', () => {
  const out = truncateArgs({ paths: ['a', 'b'], n: 1, s: 'y'.repeat(300) }) as { s: string };
  assert.ok(out.s.endsWith('chars)'));
});
