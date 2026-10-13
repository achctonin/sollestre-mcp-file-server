import { runHandler, fail, describeError } from './common';
import type { ToolDef, ToolContext, ToolResult } from './common';
import { getRole } from '../roles';
import { resolveSafePath, relToRoot } from '../sandbox';
import { listDir } from './list_dir';
import { readFile } from './read_file';
import { writeFile } from './write_file';
import { strReplace } from './str_replace';
import { deleteFile } from './delete_file';
import { searchText } from './search_text';
import { gitStatus } from './git_status';
import { gitCommit } from './git_commit';

/** Exactly the eight tools from the brief. Which role sees which is decided by config/roles.json. */
export const allTools: ToolDef[] = [listDir, readFile, writeFile, strReplace, deleteFile, searchText, gitStatus, gitCommit];

/** Tools a role may see and call. */
export function toolsForRole(role: string): ToolDef[] {
  const def = getRole(role);
  return def ? allTools.filter((t) => def.tools.includes(t.name)) : [];
}

/**
 * Single entry point used by the HTTP server: role registration check, role write-scope
 * check, strict argument validation, handler. Never throws; always returns a ToolResult.
 */
export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const visible = toolsForRole(ctx.role);
  const tool = visible.find((t) => t.name === name);
  if (!tool) {
    return fail(`Tool '${name}' is not available to role '${ctx.role}'. Available tools: ${visible.map((t) => t.name).join(', ') || '(none)'}.`);
  }
  const scope = getRole(ctx.role)?.writeScope;
  if (scope && scope.tools.includes(name)) {
    const rawPath = (rawArgs as { path?: unknown } | null)?.path;
    if (typeof rawPath === 'string') {
      try {
        const rel = relToRoot(resolveSafePath(rawPath, { write: true }));
        if (!scope.files.includes(rel)) {
          return fail(`Role '${ctx.role}' may only modify these files: ${scope.files.join(', ')}. '${rel}' is not one of them; hand the task to the builder role.`);
        }
      } catch (e) {
        return fail(describeError(e));
      }
    }
  }
  return runHandler(tool, rawArgs, ctx);
}
