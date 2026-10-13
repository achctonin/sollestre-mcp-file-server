import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail } from './common';
import { git, hasRepo } from './git_common';

export const gitCommit = defineTool({
  name: 'git_commit',
  description:
    'Stage ONLY the listed paths and commit them with the given message. Runs git init in the workspace if there is no repository yet. Other changed files are left uncommitted.',
  schema: z
    .object({
      message: z.string().min(1).max(200).describe('Commit message (max 200 characters).'),
      paths: z.array(z.string().min(1).max(500)).min(1).max(50).describe('Files or folders to commit, relative to the workspace root.'),
    })
    .strict(),
  handler: async ({ message, paths }) => {
    const rels = [...new Set(paths.map((p) => relToRoot(resolveSafePath(p, { write: true }))))];
    if (rels.includes('.')) {
      return fail('Pass specific files or folders, not "." (the whole workspace). Use git_status to see what changed, then list those paths.');
    }
    if (!hasRepo()) await git(['init', '-q', '-b', 'main']);
    await git(['add', '--', ...rels]);
    await git(['commit', '--no-verify', '-q', '-m', message, '--', ...rels]);
    const hash = (await git(['rev-parse', '--short', 'HEAD'])).trim();
    return ok(`Committed ${hash}: ${message} (${rels.length} path${rels.length === 1 ? '' : 's'}: ${rels.join(', ')})`);
  },
});
