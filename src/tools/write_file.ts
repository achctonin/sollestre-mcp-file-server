import fsp from 'node:fs/promises';
import nodePath from 'node:path';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail } from './common';

export const writeFile = defineTool({
  name: 'write_file',
  description:
    'Create a file (parent folders are created). Fails if the file already exists unless overwrite=true. For small edits to an existing file use str_replace instead.',
  schema: z
    .object({
      path: z.string().min(1).max(500).describe('File path relative to the workspace root.'),
      content: z.string().max(1_000_000).describe('Full file content (max 1,000,000 characters).'),
      overwrite: z.boolean().default(false).describe('Set true to replace an existing file.'),
    })
    .strict(),
  handler: async ({ path, content, overwrite }) => {
    const abs = resolveSafePath(path, { write: true });
    const rel = relToRoot(abs);
    let existing: 'none' | 'file' | 'dir' = 'none';
    try {
      existing = (await fsp.stat(abs)).isDirectory() ? 'dir' : 'file';
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (existing === 'dir') return fail(`'${rel}' is a directory. Choose a file path.`);
    if (existing === 'file' && !overwrite) {
      return fail(`'${rel}' already exists. Pass overwrite=true to replace it, or use str_replace for a targeted edit.`);
    }
    await fsp.mkdir(nodePath.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' });
    return ok(`${existing === 'file' ? 'Overwrote' : 'Created'} ${rel} (${Buffer.byteLength(content)} bytes).`);
  },
});
