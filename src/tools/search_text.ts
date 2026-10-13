import fsp from 'node:fs/promises';
import nodePath from 'node:path';
import { z } from 'zod';
import { resolveSafePath, relToRoot } from '../sandbox';
import { defineTool, ok, fail, capOutput } from './common';

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const MAX_SEARCH_FILE_BYTES = 1_000_000;

async function searchFile(abs: string, query: string, results: string[], max: number): Promise<void> {
  const st = await fsp.stat(abs);
  if (!st.isFile() || st.size > MAX_SEARCH_FILE_BYTES) return;
  const buf = await fsp.readFile(abs);
  if (buf.subarray(0, 8000).includes(0)) return; // binary
  const rel = relToRoot(abs);
  const lines = buf.toString('utf8').split('\n');
  for (let i = 0; i < lines.length && results.length < max; i++) {
    if (lines[i].includes(query)) results.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 160)}`);
  }
}

export const searchText = defineTool({
  name: 'search_text',
  description:
    'Literal, case-sensitive text search under a file or directory. Returns file:line:snippet. Ignores .git and node_modules, binary files, files over 1 MB, and symlinks.',
  schema: z
    .object({
      query: z.string().min(1).max(200).describe('Exact text to look for (not a regex).'),
      path: z.string().min(1).max(500).default('.').describe('File or directory to search, relative to the workspace root.'),
      max_results: z.number().int().min(1).max(100).default(50).describe('Maximum matches to return (1-100).'),
    })
    .strict(),
  handler: async ({ query, path, max_results }) => {
    const start = resolveSafePath(path);
    const st = await fsp.stat(start);
    const results: string[] = [];

    if (st.isFile()) {
      await searchFile(start, query, results, max_results);
    } else {
      const stack = [start];
      while (stack.length > 0 && results.length < max_results) {
        const dir = stack.pop() as string;
        const entries = (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
        const subdirs: string[] = [];
        for (const e of entries) {
          if (results.length >= max_results) break;
          if (e.isSymbolicLink()) continue;
          const full = nodePath.join(dir, e.name);
          if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) subdirs.push(full);
          } else if (e.isFile()) {
            await searchFile(full, query, results, max_results);
          }
        }
        stack.push(...subdirs.reverse());
      }
    }

    if (results.length === 0) return ok(`No matches for "${query}" under ${relToRoot(start)}.`);
    const note =
      results.length >= max_results
        ? `\n[truncated at ${max_results} results; there may be more. Narrow the query or path, or raise max_results (max 100).]`
        : '';
    return ok(capOutput(results.join('\n') + note, 'narrow the query or path'));
  },
});
