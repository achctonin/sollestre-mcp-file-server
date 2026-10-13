import fsp from 'node:fs/promises';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail, MAX_FILE_BYTES } from './common';

export const strReplace = defineTool({
  name: 'str_replace',
  description:
    'Replace exactly one occurrence of old_str with new_str in a file. Fails if old_str is missing or appears more than once (and says which). Copy old_str exactly, including whitespace.',
  schema: z
    .object({
      path: z.string().min(1).max(500).describe('File path relative to the workspace root.'),
      old_str: z.string().min(1).max(100_000).describe('Exact text to find. Must appear exactly once.'),
      new_str: z.string().max(100_000).describe('Replacement text (may be empty to delete old_str).'),
    })
    .strict(),
  handler: async ({ path, old_str, new_str }) => {
    const abs = resolveSafePath(path, { write: true });
    const rel = relToRoot(abs);
    const st = await fsp.stat(abs);
    if (st.isDirectory()) return fail(`'${rel}' is a directory, not a file.`);
    if (st.size > MAX_FILE_BYTES) return fail(`'${rel}' is larger than ${MAX_FILE_BYTES} bytes; str_replace will not load it.`);
    if (old_str === new_str) return fail('old_str and new_str are identical, so nothing would change.');

    const text = await fsp.readFile(abs, 'utf8');
    let count = 0;
    let first = -1;
    for (let i = text.indexOf(old_str); i !== -1; i = text.indexOf(old_str, i + old_str.length)) {
      if (count === 0) first = i;
      count++;
    }
    if (count === 0) {
      return fail(`old_str was not found in ${rel}. Use search_text or read_file to copy the exact text, including whitespace.`);
    }
    if (count > 1) return fail(`old_str appears ${count} times in ${rel}. Add surrounding lines to make it unique.`);

    await fsp.writeFile(abs, text.slice(0, first) + new_str + text.slice(first + old_str.length), 'utf8');
    const line = text.slice(0, first).split('\n').length;
    return ok(`Replaced 1 occurrence in ${rel} at line ${line}.`);
  },
});
