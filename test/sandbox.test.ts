import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSafePath, relToRoot, initWorkspace, SandboxError } from '../src/sandbox';

let tmp: string, root: string, outside: string;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-'));
  root = path.join(tmp, 'ws');
  outside = path.join(tmp, 'outside');
  process.env.WORKSPACE_ROOT = root;
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'top secret');
  initWorkspace();
  fs.mkdirSync(path.join(root, 'a'));
  fs.writeFileSync(path.join(root, 'a', 'b.txt'), 'hi');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link-file'));
  fs.symlinkSync(outside, path.join(root, 'link-dir'));
  fs.symlinkSync(path.join(outside, 'does-not-exist-yet'), path.join(root, 'dangling'));
  fs.symlinkSync(path.join(root, 'a'), path.join(root, 'inside-link'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const rejects = (p: string, re: RegExp, write = false) =>
  assert.throws(() => resolveSafePath(p, { write }), (e: unknown) => e instanceof SandboxError && re.test(e.message));

test('initWorkspace creates the root', () => assert.ok(fs.statSync(root).isDirectory()));

test('accepts normal, nested, not-yet-existing and dot paths', () => {
  assert.equal(relToRoot(resolveSafePath('a/b.txt')), 'a/b.txt');
  assert.equal(relToRoot(resolveSafePath('a/../a/b.txt')), 'a/b.txt');
  assert.equal(relToRoot(resolveSafePath('new/dir/file.ts', { write: true })), 'new/dir/file.ts');
  assert.equal(relToRoot(resolveSafePath('.')), '.');
  assert.equal(relToRoot(resolveSafePath('')), '.');
});

test('rejects ../ traversal', () => {
  rejects('../outside/secret.txt', /outside the workspace/);
  rejects('a/../../outside/secret.txt', /outside the workspace/);
  rejects('..', /outside the workspace/);
});

test('rejects absolute paths', () => {
  rejects('/etc/passwd', /Absolute paths/);
  rejects(path.join(outside, 'secret.txt'), /Absolute paths/);
  rejects('C:\\Windows\\system32', /Absolute paths/);
  rejects('\\\\server\\share', /Absolute paths/);
});

test('rejects null bytes', () => {
  rejects('a/b.txt\0.png', /null byte/);
});

test('rejects symlink escapes (file, directory, not-yet-existing child, dangling)', () => {
  rejects('link-file', /symbolic link/);
  rejects('link-dir', /symbolic link/);
  rejects('link-dir/secret.txt', /symbolic link/);
  rejects('link-dir/new-file.txt', /symbolic link/, true);
  rejects('link-dir/new/deeper/file.txt', /symbolic link/, true);
  rejects('dangling', /broken symbolic link/, true);
});

test('allows a symlink that stays inside the workspace', () => {
  assert.equal(relToRoot(resolveSafePath('inside-link/b.txt')), 'a/b.txt');
});

test('blocks writes/deletes inside .git but allows reads', () => {
  rejects('.git/config', /\.git/, true);
  rejects('.git', /\.git/, true);
  rejects('a/.git/hooks/pre-commit', /\.git/, true);
  rejects('.GIT/config', /\.git/, true);
  assert.equal(relToRoot(resolveSafePath('.git/config')), '.git/config');
});

test('errors are plain messages (no stack text in message)', () => {
  try {
    resolveSafePath('../x');
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof SandboxError);
    assert.doesNotMatch((e as Error).message, /\n\s+at /);
  }
});
