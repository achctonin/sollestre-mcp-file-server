import fs from 'node:fs';
import path from 'node:path';

export interface CallLogEntry {
  role: string;
  session_id: string | undefined;
  tool: string;
  args: unknown;
  ok: boolean;
  error?: string;
  duration_ms: number;
}

const MAX_ARG_CHARS = 200;

/** Shorten long strings (file content, old_str...) so one log line stays small. */
export function truncateArgs(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_ARG_CHARS ? `${value.slice(0, MAX_ARG_CHARS)}…(+${value.length - MAX_ARG_CHARS} chars)` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(truncateArgs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, truncateArgs(v)]));
  }
  return value;
}

export function logFilePath(): string {
  return path.resolve(process.env.LOG_DIR ?? path.join(__dirname, '..', 'logs'), 'calls.jsonl');
}

/** Append one JSON line per tool call. A logging failure must never break a tool call. */
export function logCall(entry: CallLogEntry): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    role: entry.role,
    session_id: entry.session_id ?? null,
    tool: entry.tool,
    args: truncateArgs(entry.args),
    ok: entry.ok,
    ...(entry.error ? { error: entry.error.slice(0, 300) } : {}),
    duration_ms: entry.duration_ms,
  });
  try {
    const file = logFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line + '\n');
  } catch (e) {
    console.error('could not write call log:', (e as Error).message);
  }
}
