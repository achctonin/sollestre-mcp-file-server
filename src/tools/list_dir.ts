import fsp from 'node:fs/promises';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail } from './common';

export const listDir = defineTool({
  name: 'list_dir',
  description:
    'List the entries of one directory in the workspace (directories end with "/"). Not recursive. Use search_text to find things by content.',
  schema: z
    .object({
      path: z.string().min(1).max(500).default('.').describe('Directory relative to the workspace root, e.g. "." or "src".'),
      max_entries: z.number().int().min(1).max(1000).default(200).describe('Maximum entries to return (1-1000).'),
    })
    .strict(),
  handler: async ({ path, max_entries }) => {
    const abs = resolveSafePath(path);
    const st = await fsp.stat(abs);
    if (!st.isDirectory()) return fail(`'${path}' is a file, not a directory. Use read_file to read it.`);
    const entries = (await fsp.readdir(abs, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    const shown = entries.slice(0, max_entries).map((e) => e.name + (e.isDirectory() ? '/' : e.isSymbolicLink() ? '@' : ''));
    if (entries.length === 0) return ok(`${relToRoot(abs)}: (empty directory)`);
    let out = `${relToRoot(abs)}: ${shown.length} of ${entries.length} entries\n${shown.join('\n')}`;
    if (entries.length > shown.length) {
      out += `\n[truncated: ${entries.length - shown.length} more entries. Use a subdirectory path, a larger max_entries (max 1000), or search_text.]`;
    }
    return ok(out);
  },
});
