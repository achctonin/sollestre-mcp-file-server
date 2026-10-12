# DECISIONS
Each entry: decision, reason, alternatives rejected.

### D1. TypeScript + Node 20 + official @modelcontextprotocol/sdk + zod
- Reason: the brief's default; you did not ask for Python.
- Rejected: Python MCP SDK (only if you say you prefer it).

### D2. CommonJS build output (no "type": "module")
- Reason: pm2 loads `ecosystem.config.js` with require(); an ESM package makes that file fail. CJS keeps the file name the brief asks for.
- Rejected: ESM + `ecosystem.config.cjs`.

### D3. Low-level `Server` + our own strict zod validation, not `McpServer.registerTool`
- Reason: `.strict()` must reject unknown fields, and every failure must come back as our own `isError` text. The high-level helper strips unknown keys and reports schema errors in its own format.
- Rejected: `McpServer.registerTool` with raw shapes.

### D4. zod v3 + `zod-to-json-schema` to publish each tool's input schema
- Reason: stable, tiny, emits `additionalProperties: false` for `.strict()` schemas.
- Rejected: zod v4 native JSON schema (version coupling with the SDK).

### D5. Express for HTTP; one stateful Streamable HTTP session per client, per role
- Reason: the SDK's documented pattern; session ids are needed for logs/calls.jsonl.
- Rejected: stateless mode (no session id to log), raw `http` module.

### D6. Roles are endpoints: `/mcp/planner`, `/mcp/builder`; a session id is only valid on the endpoint that created it
- Reason: brief requires one endpoint per role, no auth.
- Rejected: role in a header or query string (spoofable and easy to mistype).

### D7. Planner write scope = write_file/str_replace on the four handoff files only (checked in code from config/roles.json)
- Reason: brief. The check runs after resolveSafePath, so `./PLAN_LOG.md` and `a/../PLAN_LOG.md` are treated the same.
- Rejected: giving the planner no write tools (it could not log or checkpoint).

### D8. Append-only files are appended with str_replace on a `<!-- END -->` marker
- Reason: no 9th tool is allowed, and write_file would replace the whole log. The marker makes an append a one-line, unambiguous edit. Append-only is a convention enforced by AGENTS.md, not by code.
- Rejected: an append tool (extra feature), overwrite via write_file.

### D9. Build-time handoff files live in the repo root; the demo's copies live in WORKSPACE_ROOT (seeded from templates/ on startup if missing)
- Reason: the brief asks the builder to keep PLAN_LOG/CHECKPOINTS during the build and the demo agents to keep theirs in the workspace.
- Rejected: one shared set (would mix build history with demo evidence).

### D10. cloudflared quick tunnel by default; optional named tunnel via CLOUDFLARE_TUNNEL_NAME
- Reason: no account needed to start. Quick-tunnel URLs change whenever the tunnel process restarts, so the README says when a named tunnel is required for a URL that survives reboot.
- Rejected: ngrok (needs an account/authtoken for any use).

### D11. search_text is a literal, case-sensitive substring search that skips symlinks, binary files and files over 1 MB
- Reason: simplest option, and never following symlinks avoids sandbox escapes through the walker.
- Rejected: regex (ReDoS risk, more schema surface), ripgrep (extra install).

### D12. read_file returns plain lines with a header `[path | lines a-b of N | next_offset=X]`; offset is a 0-based line index
- Reason: copy-paste-exact text for str_replace; the header carries all the navigation info.
- Rejected: line-number prefixes inside the body.

### D13. Tests use node:test run through tsx
- Reason: no test framework dependency.
- Rejected: jest, vitest.

### D14. `git init -b main`, commits use `--no-verify`, and the identity falls back to "MCP Agent <agent@localhost>"
- Reason: works on machines with no git identity. Requires git >= 2.28.
- Rejected: relying on the user's global git config.
