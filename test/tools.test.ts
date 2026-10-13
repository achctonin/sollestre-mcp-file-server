import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { executeTool } from '../src/tools';
import { initWorkspace } from '../src/sandbox';

let tmp: string, root: string, outside: string;
const B = { role: 'builder' };
const P = { role: 'planner' };
const run = (name: string, args: unknown, ctx = B) => executeTool(name, args, ctx);
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const expectErr = async (name: string, args: unknown, re: RegExp, ctx = B) => {
  const r = await run(name, args, ctx);
  assert.equal(r.isError, true, `expected isError for ${name}: ${text(r)}`);
  assert.match(text(r), re);
  assert.doesNotMatch(text(r), /\n\s+at .*\(/, 'no stack traces');
  return r;
};
const expectOk = async (name: string, args: unknown, ctx = B) => {
  const r = await run(name, args, ctx);
  assert.notEqual(r.isError, true, `unexpected error: ${text(r)}`);
  return text(r);
};

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'));
  root = path.join(tmp, 'ws');
  outside = path.join(tmp, 'outside');
  process.env.WORKSPACE_ROOT = root;
  process.env.GIT_AUTHOR_NAME = 'Test';
  process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
  initWorkspace();
  fs.symlinkSync(outside, path.join(root, 'escape'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('roles: planner cannot see delete_file/git_commit; unknown tools and fields are errors', async () => {
  await expectErr('delete_file', { path: 'a', confirm: 'DELETE' }, /not available to role 'planner'/, P);
  await expectErr('git_commit', { message: 'm', paths: ['a'] }, /not available to role 'planner'/, P);
  await expectErr('nope', {}, /not available/);
  await expectErr('list_dir', { path: '.', bogus: 1 }, /Invalid arguments for list_dir.*Unrecognized key/);
  await expectErr('read_file', { path: 'x', limit: 9999 }, /limit/);
  await expectErr('write_file', { path: 'x' }, /content/);
});

test('list_dir: ok, truncation, file, missing, escape', async () => {
  await expectOk('write_file', { path: 'src/a.ts', content: 'a' });
  await expectOk('write_file', { path: 'src/b.ts', content: 'b' });
  await expectOk('write_file', { path: 'src/c.ts', content: 'c' });
  assert.match(await expectOk('list_dir', { path: 'src' }), /3 of 3 entries\na\.ts\nb\.ts\nc\.ts/);
  assert.match(await expectOk('list_dir', {}), /src\//);
  assert.match(await expectOk('list_dir', { path: 'src', max_entries: 2 }), /truncated: 1 more entries/);
  await expectErr('list_dir', { path: 'src/a.ts' }, /is a file/);
  await expectErr('list_dir', { path: 'nope' }, /does not exist/);
  await expectErr('list_dir', { path: '../' }, /outside the workspace/);
  await expectErr('list_dir', { path: 'escape' }, /symbolic link/);
});

test('read_file: chunking, next_offset, caps, errors', async () => {
  const body = Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  await expectOk('write_file', { path: 'big.txt', content: body });
  const first = await expectOk('read_file', { path: 'big.txt' });
  assert.match(first, /^\[big\.txt \| lines 1-200 of 450 \| next_offset=200\]\nline 1\n/);
  assert.ok(!first.includes('line 201'));
  assert.match(await expectOk('read_file', { path: 'big.txt', offset: 400, limit: 200 }), /lines 401-450 of 450 \| next_offset=none/);
  await expectErr('read_file', { path: 'big.txt', offset: 450 }, /past the end.*total_lines=450/);
  await expectErr('read_file', { path: 'src' }, /is a directory/);
  await expectErr('read_file', { path: 'missing.txt' }, /does not exist/);
  fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
  await expectErr('read_file', { path: 'bin.dat' }, /binary/);
  await expectErr('read_file', { path: '/etc/passwd' }, /Absolute paths/);
  assert.match(await expectOk('write_file', { path: 'empty.txt', content: '' }), /Created/);
  assert.match(await expectOk('read_file', { path: 'empty.txt' }), /empty file/);
  // hard output cap: 500 very long lines
  await expectOk('write_file', { path: 'wide.txt', content: Array.from({ length: 500 }, () => 'x'.repeat(1900)).join('\n') });
  const wide = await expectOk('read_file', { path: 'wide.txt', limit: 500 });
  assert.ok(wide.length < 21_500);
  assert.match(wide, /output cut at 20000 chars; continue with offset=\d+/);
});

test('write_file: create, no-overwrite, overwrite, dir, escape, .git', async () => {
  assert.match(await expectOk('write_file', { path: 'deep/er/file.txt', content: 'one' }), /Created deep\/er\/file\.txt/);
  await expectErr('write_file', { path: 'deep/er/file.txt', content: 'two' }, /already exists.*overwrite=true/);
  assert.match(await expectOk('write_file', { path: 'deep/er/file.txt', content: 'two', overwrite: true }), /Overwrote/);
  assert.equal(fs.readFileSync(path.join(root, 'deep/er/file.txt'), 'utf8'), 'two');
  await expectErr('write_file', { path: 'deep', content: 'x', overwrite: true }, /is a directory/);
  await expectErr('write_file', { path: '../evil.txt', content: 'x' }, /outside the workspace/);
  await expectErr('write_file', { path: 'escape/evil.txt', content: 'x' }, /symbolic link/);
  assert.ok(!fs.existsSync(path.join(outside, 'evil.txt')));
  await expectErr('write_file', { path: '.git/config', content: 'x', overwrite: true }, /\.git/);
});

test('str_replace: unique ok, missing, multiple, identical, missing file', async () => {
  await expectOk('write_file', { path: 'app.ts', content: 'let a = 1;\nlet b = 2;\nfoo();\nfoo();\n' });
  assert.match(await expectOk('str_replace', { path: 'app.ts', old_str: 'let b = 2;', new_str: 'let b = 3;' }), /at line 2/);
  assert.equal(fs.readFileSync(path.join(root, 'app.ts'), 'utf8'), 'let a = 1;\nlet b = 3;\nfoo();\nfoo();\n');
  await expectErr('str_replace', { path: 'app.ts', old_str: 'zzz', new_str: 'y' }, /not found in app\.ts/);
  await expectErr('str_replace', { path: 'app.ts', old_str: 'foo();', new_str: 'bar();' }, /appears 2 times in app\.ts\. Add surrounding lines/);
  await expectErr('str_replace', { path: 'app.ts', old_str: 'let a', new_str: 'let a' }, /identical/);
  await expectErr('str_replace', { path: 'nope.ts', old_str: 'a', new_str: 'b' }, /does not exist/);
  await expectErr('str_replace', { path: 'app.ts', old_str: '', new_str: 'b' }, /old_str/);
  // "$&" in new_str is literal text, not a regex back-reference
  await expectOk('str_replace', { path: 'app.ts', old_str: 'let a = 1;', new_str: 'let a = "$&";' });
  assert.match(fs.readFileSync(path.join(root, 'app.ts'), 'utf8'), /let a = "\$&";/);
});

test('delete_file: gate, role, dir, .git, ok', async () => {
  await expectOk('write_file', { path: 'trash.txt', content: 'x' });
  await expectErr('delete_file', { path: 'trash.txt', confirm: 'yes' }, /confirm must be the exact string "DELETE"/);
  await expectErr('delete_file', { path: 'trash.txt', confirm: 'delete' }, /exact string "DELETE"/);
  assert.ok(fs.existsSync(path.join(root, 'trash.txt')));
  await expectErr('delete_file', { path: 'trash.txt', confirm: 'DELETE' }, /not available to role 'planner'/, P);
  await expectErr('delete_file', { path: 'src', confirm: 'DELETE' }, /is a directory/);
  await expectErr('delete_file', { path: 'nope.txt', confirm: 'DELETE' }, /does not exist/);
  await expectErr('delete_file', { path: '../x', confirm: 'DELETE' }, /outside the workspace/);
  assert.match(await expectOk('delete_file', { path: 'trash.txt', confirm: 'DELETE' }), /Deleted trash\.txt/);
  assert.ok(!fs.existsSync(path.join(root, 'trash.txt')));
});

test('search_text: file:line:snippet, ignores .git/node_modules/symlinks, truncation, errors', async () => {
  await expectOk('write_file', { path: 'src/hello.ts', content: 'const x = 1;\nexport function NEEDLE() {}\n' });
  fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/pkg/i.js'), 'NEEDLE');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git/HEAD'), 'NEEDLE');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'NEEDLE');
  const out = await expectOk('search_text', { query: 'NEEDLE' });
  assert.equal(out, 'src/hello.ts:2:export function NEEDLE() {}');
  assert.match(await expectOk('search_text', { query: 'NEEDLE', path: 'src/hello.ts' }), /src\/hello\.ts:2:/);
  assert.match(await expectOk('search_text', { query: 'not-there-xyz' }), /No matches/);
  await expectOk('write_file', { path: 'many.txt', content: Array.from({ length: 30 }, () => 'hit').join('\n') });
  assert.match(await expectOk('search_text', { query: 'hit', path: 'many.txt', max_results: 5 }), /truncated at 5 results/);
  await expectErr('search_text', { query: '' }, /query/);
  await expectErr('search_text', { query: 'a', path: 'missing' }, /does not exist/);
  await expectErr('search_text', { query: 'a', path: '../outside' }, /outside the workspace/);
  await expectErr('search_text', { query: 'a', path: 'escape' }, /symbolic link/);
});

test('git_status / git_commit: init, only listed paths, errors', async () => {
  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
  assert.match(await expectOk('git_status', {}), /No git repository/);
  await expectErr('git_status', { extra: 1 }, /Unrecognized key/);
  await expectOk('write_file', { path: 'one.txt', content: '1' });
  await expectOk('write_file', { path: 'two.txt', content: '2' });
  await expectErr('git_commit', { message: 'x', paths: [] }, /paths/);
  await expectErr('git_commit', { message: 'x', paths: ['.'] }, /specific files/);
  await expectErr('git_commit', { message: 'x', paths: ['.git/config'] }, /\.git/);
  await expectErr('git_commit', { message: 'x', paths: ['../outside/secret.txt'] }, /outside the workspace/);
  await expectErr('git_commit', { message: 'x', paths: ['does-not-exist.txt'] }, /git add failed/);
  const done = await expectOk('git_commit', { message: 'add one; touch $(whoami) `id`', paths: ['one.txt'] });
  assert.match(done, /Committed [0-9a-f]{7,}: add one/);
  const log = execFileSync('git', ['log', '--format=%s', '-1'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(log, 'add one; touch $(whoami) `id`'); // message is literal: no shell involved
  const status = await expectOk('git_status', {});
  assert.match(status, /\?\? two\.txt/);
  assert.doesNotMatch(status, /one\.txt/);
  await expectErr('git_commit', { message: 'again', paths: ['one.txt'] }, /git commit failed.*nothing/i);
  await expectOk('write_file', { path: 'one.txt', content: 'changed', overwrite: true });
  assert.match(await expectOk('git_status', {}), / M one\.txt/);
  await expectOk('delete_file', { path: 'one.txt', confirm: 'DELETE' });
  assert.match(await expectOk('git_commit', { message: 'remove one', paths: ['one.txt'] }), /Committed/);
});

test('planner write scope: only the four handoff files', async () => {
  await expectErr('write_file', { path: 'src/evil.ts', content: 'x' }, /may only modify.*PROJECT_STATE\.md/, P);
  await expectErr('write_file', { path: './sub/../src/evil.ts', content: 'x' }, /may only modify/, P);
  await expectErr('str_replace', { path: 'app.ts', old_str: 'a', new_str: 'b' }, /may only modify/, P);
  await expectErr('write_file', { path: '../PLAN_LOG.md', content: 'x' }, /outside the workspace/, P);
  assert.match(await expectOk('write_file', { path: 'PLAN_LOG.md', content: '# log\n<!-- END -->\n' }, P), /Created PLAN_LOG\.md/);
  assert.match(await expectOk('write_file', { path: './PLAN_LOG.md', content: '# log\n<!-- END -->\n', overwrite: true }, P), /Overwrote/);
  assert.match(await expectOk('str_replace', { path: 'PLAN_LOG.md', old_str: '<!-- END -->', new_str: 'entry\n<!-- END -->' }, P), /Replaced/);
  assert.match(await expectOk('read_file', { path: 'PLAN_LOG.md' }, P), /entry/);
  assert.match(await expectOk('list_dir', {}, P), /PLAN_LOG\.md/);
  assert.match(await expectOk('git_status', {}, P), /##/);
});
