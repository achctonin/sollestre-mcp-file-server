import fsp from 'node:fs/promises';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { roleAllowsTool } from '../roles';
import { defineTool, ok, fail } from './common';

export const deleteFile = defineTool({
  name: 'delete_file',
  description:
    'DESTRUCTIVE. Delete one file. Refuses unless confirm is exactly the string "DELETE" and the calling role allows deletion. Files only, not directories. Cannot touch .git.',
  schema: z
    .object({
      path: z.string().min(1).max(500).describe('File path relative to the workspace root.'),
      confirm: z.string().max(20).describe('Must be exactly "DELETE" to proceed.'),
    })
    .strict(),
  handler: async ({ path, confirm }, ctx) => {
    if (!roleAllowsTool(ctx.role, 'delete_file')) {
      return fail(`Role '${ctx.role}' is not allowed to delete files. Ask the builder role to do it.`);
    }
    if (confirm !== 'DELETE') {
      return fail('Refusing to delete: confirm must be the exact string "DELETE". Check the path, then call again with confirm="DELETE".');
    }
    const abs = resolveSafePath(path, { write: true });
    const rel = relToRoot(abs);
    const st = await fsp.lstat(abs);
    if (st.isDirectory()) return fail(`'${rel}' is a directory. delete_file only removes single files.`);
    await fsp.unlink(abs);
    return ok(`Deleted ${rel}.`);
  },
});
