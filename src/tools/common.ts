import { z } from 'zod';
import { SandboxError } from '../sandbox';

export interface ToolContext {
  role: string;
  sessionId?: string;
}
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}
export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

/** Declare a tool with typed args (the handler sees the parsed zod output type). */
export function defineTool<S extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  schema: S;
  handler: (args: z.output<S>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDef {
  return def as ToolDef;
}

/** Expected failure with a client-safe message. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export const MAX_OUTPUT_CHARS = 20_000; // hard cap for any tool output
export const MAX_FILE_BYTES = 2_000_000; // largest file read_file / str_replace will load

export const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
export const fail = (text: string): ToolResult => ({ isError: true, content: [{ type: 'text', text }] });

export function capOutput(text: string, hint: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + `\n[truncated at ${MAX_OUTPUT_CHARS} chars; ${hint}]`;
}

/** Turn any thrown value into a short, actionable message. Never includes a stack trace. */
export function describeError(e: unknown): string {
  if (e instanceof SandboxError || e instanceof ToolError) return e.message;
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'ENOENT':
      return 'File or directory does not exist. Use list_dir or search_text to find the right path.';
    case 'EISDIR':
      return 'That path is a directory, not a file. Use list_dir to see what is inside it.';
    case 'ENOTDIR':
      return 'A folder in that path is actually a file. Check the path with list_dir.';
    case 'EEXIST':
      return 'It already exists. For write_file pass overwrite=true, or use str_replace for a small edit.';
    case 'EACCES':
    case 'EPERM':
      return 'The operating system denied access to that path. Choose a different path.';
    case 'ELOOP':
      return 'Too many symbolic links in that path. Use a path without symlinks.';
    default:
      return `Unexpected internal error${code ? ` (${code})` : ''}. Nothing was changed. See logs/calls.jsonl or the server console.`;
  }
}

/** Validate args with the tool's strict schema, run the handler, convert every failure to isError. */
export async function runHandler(def: ToolDef, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.length ? i.path.join('.') : 'arguments'}: ${i.message}`)
      .join('; ');
    return fail(`Invalid arguments for ${def.name}: ${problems}. Fix the arguments and call again.`);
  }
  try {
    return await def.handler(parsed.data, ctx);
  } catch (e) {
    if (!(e instanceof SandboxError || e instanceof ToolError || (e as NodeJS.ErrnoException)?.code)) {
      console.error(`[${def.name}] unexpected error:`, e); // server console only, never sent to the client
    }
    return fail(describeError(e));
  }
}

export const pathField = (what = 'File path') =>
  z.string().min(1).max(500).describe(`${what}, relative to the workspace root (no absolute paths, no "..").`);
