import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getRealRoot } from '../sandbox';
import { ToolError } from './common';

/** True only if the workspace itself holds a .git (a parent repo does not count). */
export function hasRepo(): boolean {
  return fs.existsSync(path.join(getRealRoot(), '.git'));
}

/**
 * Run git in the workspace. Always execFile with an args array and no shell, so
 * agent-supplied text (commit message, paths) can never be interpreted as shell syntax.
 * --literal-pathspecs stops path arguments being read as pathspec magic.
 */
export function git(args: string[]): Promise<string> {
  const name = process.env.GIT_AUTHOR_NAME || 'MCP Agent';
  const email = process.env.GIT_AUTHOR_EMAIL || 'agent@localhost';
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--literal-pathspecs', ...args],
      {
        cwd: getRealRoot(),
        timeout: 15_000,
        maxBuffer: 1_000_000,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: email,
          GIT_COMMITTER_NAME: name,
          GIT_COMMITTER_EMAIL: email,
        },
      },
      (err, stdout, stderr) => {
        if (!err) return resolve(stdout);
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === 'ENOENT') return reject(new ToolError('git is not installed or not on PATH. Install git (>= 2.28) and restart the server.'));
        if (e.killed) return reject(new ToolError(`git ${args[0]} timed out after 15s.`));
        const full = (String(stderr) || String(stdout) || 'unknown error').trim();
        if (/nothing (added )?to commit|no changes added/i.test(String(stdout) + full)) {
          return reject(new ToolError(`git ${args[0]} failed: nothing to commit for the listed paths (no changes). Use git_status to see what changed, then list those paths.`));
        }
        const text = full.split('\n').slice(0, 5).join(' | ');
        reject(new ToolError(`git ${args[0]} failed: ${text}`));
      },
    );
  });
}
