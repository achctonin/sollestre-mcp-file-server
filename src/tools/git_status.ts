import { z } from 'zod';
import { defineTool, ok, capOutput } from './common';
import { git, hasRepo } from './git_common';

const MAX_LINES = 100;

export const gitStatus = defineTool({
  name: 'git_status',
  description: 'Short git status of the workspace (porcelain format with a branch line). Takes no arguments.',
  schema: z.object({}).strict(),
  handler: async () => {
    if (!hasRepo()) return ok('No git repository in the workspace yet. git_commit will create one.');
    const lines = (await git(['status', '--porcelain=v1', '--branch'])).trimEnd().split('\n');
    if (lines.length === 1) return ok(`${lines[0]}\n(clean: nothing to commit)`);
    const shown = lines.slice(0, MAX_LINES);
    let out = shown.join('\n');
    if (lines.length > MAX_LINES) out += `\n[truncated: ${lines.length - MAX_LINES} more lines. Commit or list specific folders with list_dir.]`;
    return ok(capOutput(out, 'commit some changes'));
  },
});
