import fs from 'node:fs';
import path from 'node:path';

/** Thrown for any path the sandbox refuses. The message is safe to show to the client. */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/** WORKSPACE_ROOT from the environment, as an absolute (not yet realpath'd) path. */
export function getWorkspaceRoot(): string {
  const raw = process.env.WORKSPACE_ROOT;
  if (!raw || raw.includes('\0')) {
    throw new SandboxError('WORKSPACE_ROOT is not set. Set it in .env (see .env.example) and restart the server.');
  }
  return path.resolve(raw);
}

/** Create the workspace root if needed (called on startup). Returns the realpath of the root. */
export function initWorkspace(): string {
  fs.mkdirSync(getWorkspaceRoot(), { recursive: true });
  return getRealRoot();
}

/** Realpath of the workspace root (creates it if missing). */
export function getRealRoot(): string {
  const root = getWorkspaceRoot();
  fs.mkdirSync(root, { recursive: true });
  return fs.realpathSync(root);
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

/**
 * realpath of the nearest existing ancestor, with the not-yet-existing tail appended.
 * A dangling symlink is refused: writing through it would create a file at its target.
 */
function realpathNearest(p: string, original: string): string {
  let current = p;
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...tail.reverse());
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') {
        throw new SandboxError(`Path '${original}' contains a symbolic-link loop. Use a path without symlinks.`);
      }
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e;
      let linkExists = false;
      try {
        fs.lstatSync(current);
        linkExists = true;
      } catch {
        /* really does not exist: keep climbing */
      }
      if (linkExists) {
        throw new SandboxError(`Path '${original}' goes through a broken symbolic link. Refusing; use a real path inside the workspace.`);
      }
      const parent = path.dirname(current);
      if (parent === current) throw e;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

export interface ResolveOptions {
  /** True for anything that creates, changes or deletes: blocks the .git folder. */
  write?: boolean;
}

/**
 * THE one place every tool turns a client-supplied path into a filesystem path.
 * Returns an absolute path whose real location is inside WORKSPACE_ROOT.
 * Throws SandboxError (clear message, no stack shown to clients) otherwise.
 */
export function resolveSafePath(userPath: string, opts: ResolveOptions = {}): string {
  if (typeof userPath !== 'string') {
    throw new SandboxError('Path must be a string relative to the workspace root, e.g. "src/app.ts".');
  }
  if (userPath.includes('\0')) {
    throw new SandboxError('Path contains a null byte. Remove it and use a plain relative path.');
  }
  if (path.isAbsolute(userPath) || path.win32.isAbsolute(userPath) || /^[a-zA-Z]:/.test(userPath)) {
    throw new SandboxError(`Absolute paths are not allowed ('${userPath}'). Use a path relative to the workspace root, e.g. "src/app.ts".`);
  }

  const realRoot = getRealRoot();
  const root = getWorkspaceRoot();
  const lexical = path.resolve(root, userPath === '' ? '.' : userPath);
  if (!isInside(root, lexical)) {
    throw new SandboxError(`Path '${userPath}' resolves outside the workspace. Remove the '..' segments and use a path inside the workspace.`);
  }

  const real = realpathNearest(lexical, userPath);
  if (!isInside(realRoot, real)) {
    throw new SandboxError(`Path '${userPath}' resolves outside the workspace through a symbolic link. Use a path that stays inside the workspace.`);
  }

  if (opts.write) {
    const segs = [...path.relative(root, lexical).split(path.sep), ...path.relative(realRoot, real).split(path.sep)];
    if (segs.some((s) => s.toLowerCase() === '.git')) {
      throw new SandboxError(`Writing to or deleting inside '.git' is blocked ('${userPath}'). Use git_commit to change history.`);
    }
  }
  return real;
}

/** Workspace-relative display path with forward slashes ('.' for the root). */
export function relToRoot(abs: string): string {
  const rel = path.relative(getRealRoot(), abs);
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}
