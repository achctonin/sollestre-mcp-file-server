import fsp from 'node:fs/promises';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail, MAX_OUTPUT_CHARS, MAX_FILE_BYTES } from './common';

const MAX_LINE_CHARS = 2000;

export const readFile = defineTool({
  name: 'read_file',
  description:
    'Read a chunk of a text file. offset is a 0-based line index; the header reports total lines and next_offset so you can continue. Prefer search_text to locate things, then read only the chunk you need.',
  schema: z
    .object({
      path: z.string().min(1).max(500).describe('File path relative to the workspace root.'),
      offset: z.number().int().min(0).default(0).describe('0-based index of the first line to return.'),
      limit: z.number().int().min(1).max(500).default(200).describe('Maximum lines to return (1-500).'),
    })
    .strict(),
  handler: async ({ path, offset, limit }) => {
    const abs = resolveSafePath(path);
    const st = await fsp.stat(abs);
    if (st.isDirectory()) return fail(`'${path}' is a directory. Use list_dir instead.`);
    if (st.size > MAX_FILE_BYTES) {
      return fail(`'${path}' is ${st.size} bytes, over the ${MAX_FILE_BYTES}-byte limit. Use search_text to find the part you need.`);
    }
    const buf = await fsp.readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) return fail(`'${path}' looks like a binary file; read_file only reads text.`);

    const lines = buf.toString('utf8').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const total = buf.length === 0 ? 0 : lines.length;
    const rel = relToRoot(abs);
    if (total === 0) return ok(`[${rel} | empty file, 0 lines]`);
    if (offset >= total) return fail(`offset ${offset} is past the end of '${path}' (total_lines=${total}). Use an offset below ${total}.`);

    const out: string[] = [];
    let chars = 0;
    let i = offset;
    for (; i < Math.min(total, offset + limit); i++) {
      const line = lines[i].length > MAX_LINE_CHARS ? lines[i].slice(0, MAX_LINE_CHARS) + ' …[line truncated]' : lines[i];
      if (chars + line.length + 1 > MAX_OUTPUT_CHARS && out.length > 0) break;
      out.push(line);
      chars += line.length + 1;
    }
    const next = i < total ? i : null;
    const header = `[${rel} | lines ${offset + 1}-${i} of ${total} | next_offset=${next ?? 'none (end of file)'}]`;
    const note = next !== null && i < offset + limit ? `\n[output cut at ${MAX_OUTPUT_CHARS} chars; continue with offset=${next}]` : '';
    return ok(`${header}\n${out.join('\n')}${note}`);
  },
});
