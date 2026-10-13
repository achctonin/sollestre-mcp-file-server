import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const RoleSchema = z
  .object({
    description: z.string(),
    tools: z.array(z.string()).min(1),
    writeScope: z.object({ tools: z.array(z.string()), files: z.array(z.string()).min(1) }).strict().optional(),
  })
  .strict();
const RolesFileSchema = z.record(RoleSchema);
export type RoleDef = z.infer<typeof RoleSchema>;

let cache: Record<string, RoleDef> | undefined;

/** Loads and validates config/roles.json (once). */
export function loadRoles(): Record<string, RoleDef> {
  if (!cache) {
    const file = process.env.ROLES_FILE ?? path.resolve(__dirname, '..', 'config', 'roles.json');
    cache = RolesFileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return cache;
}

export const roleNames = (): string[] => Object.keys(loadRoles());
export const getRole = (role: string): RoleDef | undefined => (Object.prototype.hasOwnProperty.call(loadRoles(), role) ? loadRoles()[role] : undefined);
export const roleAllowsTool = (role: string, tool: string): boolean => !!getRole(role)?.tools.includes(tool);
