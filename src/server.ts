import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { initWorkspace } from './sandbox';
import { roleNames, getRole } from './roles';
import { executeTool, toolsForRole } from './tools';
import { logCall } from './logger';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HANDOFF_FILES = ['PROJECT_STATE.md', 'PLAN_LOG.md', 'CHECKPOINTS.md', 'DECISIONS.md'];

/** One MCP server instance per client session; it only knows the tools its role allows. */
export function createMcpServer(role: string, getSessionId: () => string | undefined): Server {
  const server = new Server({ name: `file-server-${role}`, version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolsForRole(role).map((t) => {
      const { $schema, ...inputSchema } = zodToJsonSchema(t.schema, { $refStrategy: 'none' }) as Record<string, unknown>;
      return { name: t.name, description: t.description, inputSchema: inputSchema as { type: 'object'; [k: string]: unknown } };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const started = Date.now();
    const { name, arguments: args } = request.params;
    const sessionId = getSessionId();
    const result = await executeTool(name, args ?? {}, { role, sessionId });
    logCall({
      role,
      session_id: sessionId,
      tool: name,
      args: args ?? {},
      ok: !result.isError,
      error: result.isError ? result.content[0]?.text : undefined,
      duration_ms: Date.now() - started,
    });
    return result;
  });

  return server;
}

/** Copy templates/ into the workspace for any handoff file that does not exist yet. */
function seedHandoffFiles(root: string): void {
  for (const f of HANDOFF_FILES) {
    const target = path.join(root, f);
    const template = path.join(PROJECT_ROOT, 'templates', f);
    if (!fs.existsSync(target) && fs.existsSync(template)) fs.copyFileSync(template, target);
  }
}

function rpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  const sessions = new Map<string, { role: string; transport: StreamableHTTPServerTransport }>();
  const roleHint = `Use one of: ${roleNames().map((r) => `/mcp/${r}`).join(', ')}.`;

  app.post('/mcp/:role', async (req: Request, res: Response) => {
    try {
      const role = String(req.params.role);
      if (!getRole(role)) return rpcError(res, 404, `Unknown role '${role}'. ${roleHint}`);
      const sid = req.headers['mcp-session-id'] as string | undefined;

      if (sid && sessions.has(sid)) {
        const entry = sessions.get(sid)!;
        if (entry.role !== role) return rpcError(res, 400, `This session belongs to /mcp/${entry.role}, not /mcp/${role}.`);
        return await entry.transport.handleRequest(req, res, req.body);
      }
      if (!sid && isInitializeRequest(req.body)) {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { role, transport });
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await createMcpServer(role, () => transport.sessionId).connect(transport);
        return await transport.handleRequest(req, res, req.body);
      }
      return rpcError(res, 400, 'No valid session. Send an initialize request first (clients do this automatically).');
    } catch (e) {
      console.error('POST /mcp error:', e);
      if (!res.headersSent) rpcError(res, 500, 'Internal server error.');
    }
  });

  const sessionRequest = async (req: Request, res: Response) => {
    try {
      const role = String(req.params.role);
      const sid = req.headers['mcp-session-id'] as string | undefined;
      const entry = sid ? sessions.get(sid) : undefined;
      if (!entry) return rpcError(res, 400, 'Missing or unknown mcp-session-id header.');
      if (entry.role !== role) return rpcError(res, 400, `This session belongs to /mcp/${entry.role}, not /mcp/${role}.`);
      await entry.transport.handleRequest(req, res);
    } catch (e) {
      console.error('session request error:', e);
      if (!res.headersSent) rpcError(res, 500, 'Internal server error.');
    }
  };
  app.get('/mcp/:role', sessionRequest);
  app.delete('/mcp/:role', sessionRequest);
  app.all('/mcp', (_req, res) => rpcError(res, 404, `Pick a role endpoint. ${roleHint}`));

  return app;
}

function main(): void {
  try {
    process.loadEnvFile(path.join(PROJECT_ROOT, '.env'));
  } catch {
    /* no .env file: use the real environment */
  }
  const root = initWorkspace();
  seedHandoffFiles(root);
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`MCP file server on http://127.0.0.1:${port}  roles: ${roleNames().map((r) => `/mcp/${r}`).join(' ')}`);
    console.log(`workspace: ${root}`);
  });
}

if (require.main === module) main();
