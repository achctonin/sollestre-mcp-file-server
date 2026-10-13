# MCP File-Server Connector

A small [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents a **sandboxed shared workspace**
(8 file/git tools), served over **Streamable HTTP**, exposed through a **cloudflared tunnel**, and kept alive by **pm2**.
Two roles share the same workspace through four handoff files: **planner** (read-only plus the handoff files) and **builder** (all tools).

```
 MCP client ──HTTPS──> cloudflared ──> 127.0.0.1:PORT  Express
                                         ├─ POST/GET/DELETE /mcp/planner  -> 6 tools
                                         └─ POST/GET/DELETE /mcp/builder  -> 8 tools
                                              │ executeTool: role check -> strict zod -> write-scope -> handler
                                              ▼
                              resolveSafePath()  ->  WORKSPACE_ROOT (own git repo)   + logs/calls.jsonl
```

## 1. Prerequisites
- Node.js **>= 20.12** (uses `process.loadEnvFile`) and npm
- git **>= 2.28**
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) on your PATH
- pm2: `npm install -g pm2`

## 2. Install
```bash
git clone <your-repo-url> mcp-file-server && cd mcp-file-server
npm install
cp .env.example .env
npm run build
npm test            # unit tests: sandbox, every tool's error paths, roles, logger
```
Always run commands from the repo root (relative paths in `.env` resolve from the current directory).

## 3. Environment variables (`.env`)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Local port (server binds to `127.0.0.1` only) |
| `WORKSPACE_ROOT` | none (required) | Sandbox folder, created on startup. Missing handoff files are copied into it from `templates/` |
| `LOG_DIR` | `./logs` | Where `calls.jsonl` is written |
| `CLOUDFLARE_TUNNEL_NAME` | empty | If set, pm2 runs a named tunnel (stable URL). Empty = quick tunnel |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `MCP Agent` / `agent@localhost` | Identity for `git_commit` |

## 4. Run locally
```bash
npm start                      # or: npm run dev  (tsx, no build step)
# MCP endpoints: http://127.0.0.1:3000/mcp/planner  and  http://127.0.0.1:3000/mcp/builder
```
Quick check: `curl -s -X POST http://127.0.0.1:3000/mcp/planner` should answer with a JSON-RPC error ("No valid session"). That means the server is up.

## 5. Run with pm2
```bash
npm run build
pm2 start ecosystem.config.js     # starts mcp-server AND mcp-tunnel, both with autorestart
pm2 status
pm2 save                          # remember the process list
pm2 startup                       # prints one command: copy it and run it (sudo) so pm2 itself starts at boot
```
Crash test: `pm2 stop mcp-server` is *not* a crash; use `kill -9 $(pm2 pid mcp-server)` and watch `pm2 status` bring it back (restart count +1).
Reboot test: reboot, then `pm2 status` should show both apps `online`.

## 6. Get the public HTTPS URL
- **Quick tunnel (default, no account):** the URL is printed in the tunnel log:
  ```bash
  pm2 logs mcp-tunnel --nostream --lines 100 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
  ```
  Your endpoints are `<that URL>/mcp/planner` and `<that URL>/mcp/builder`.
  **Important:** a quick-tunnel URL changes whenever the tunnel process restarts (crash or reboot), so a connector configured with it breaks.
- **Named tunnel (stable URL, survives reboot):** needs a free Cloudflare account and a domain on it.
  ```bash
  cloudflared tunnel login
  cloudflared tunnel create mcp-files
  cloudflared tunnel route dns mcp-files mcp.yourdomain.com
  # ~/.cloudflared/config.yml:  tunnel: mcp-files / credentials-file: ... / ingress: [{hostname: mcp.yourdomain.com, service: http://127.0.0.1:3000}, {service: http_status:404}]
  echo 'CLOUDFLARE_TUNNEL_NAME=mcp-files' >> .env
  pm2 restart mcp-tunnel --update-env
  ```
  Then use `https://mcp.yourdomain.com/mcp/planner` and `/mcp/builder`.

## 7. Connect a client
- **Claude (custom connector):** Settings > Connectors > Add custom connector, paste `https://<url>/mcp/planner` (add a second connector for `/mcp/builder`). No auth is configured.
- **Claude Code:**
  ```bash
  claude mcp add --transport http files-planner https://<url>/mcp/planner
  claude mcp add --transport http files-builder https://<url>/mcp/builder
  ```
- **Claude Desktop:** add the same URL as a custom connector (config-file entries use stdio, which this server does not offer).

## 8. Test with MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Transport **Streamable HTTP**, URL `http://127.0.0.1:3000/mcp/planner`, then repeat for `/mcp/builder`. The full list of calls to run (one success and one error per tool) is in [`docs/INSPECTOR.md`](docs/INSPECTOR.md).

## 9. The 8 tools
| Tool | Arguments (all strict: unknown fields are rejected) | Roles |
|---|---|---|
| `list_dir` | `path="."`, `max_entries=200` (1-1000) | both |
| `read_file` | `path`, `offset=0` (0-based line), `limit=200` (1-500). Returns total lines + `next_offset`; output hard-capped at 20,000 chars | both |
| `write_file` | `path`, `content` (<=1,000,000 chars), `overwrite=false`. Creates parent dirs; planner: handoff files only | both |
| `str_replace` | `path`, `old_str`, `new_str`. Fails if `old_str` is missing or appears more than once; planner: handoff files only | both |
| `delete_file` | `path`, `confirm` (must be the literal `"DELETE"`) | builder |
| `search_text` | `query` (literal, case-sensitive), `path="."`, `max_results=50` (1-100). Returns `file:line:snippet` | both |
| `git_status` | none | both |
| `git_commit` | `message`, `paths[]` (stages only these paths; runs `git init` if needed) | builder |

Every failure returns `{ isError: true, content: [{ type: "text", text: "<what went wrong + how to fix it>" }] }`; no tool throws and none returns a stack trace.

## 10. Handoff protocol
The workspace holds `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md` (templates in `templates/`). [`AGENTS.md`](AGENTS.md) tells each role how to use them.
Roles live in `config/roles.json`. Every tool call is appended to `logs/calls.jsonl` (timestamp, role, session id, tool, truncated args, ok/error, duration).

## 11. Layout
`src/` (`server.ts`, `sandbox.ts`, `roles.ts`, `logger.ts`, `tools/*`), `config/roles.json`, `templates/`, `ecosystem.config.js`, `logs/`, `docs/` (`REPORT.md`, `DEMO.md`, `INSPECTOR.md`, `transcript.md`), `test/`, `DECISIONS.md` (build decisions).

## 12. Troubleshooting
| Symptom | Fix |
|---|---|
| `WORKSPACE_ROOT is not set` | `cp .env.example .env`, run from the repo root |
| `Cannot find module 'dist/server.js'` under pm2 | `npm run build` first |
| Client says it cannot reach the server | Check `pm2 status` (both online); re-read the tunnel URL (quick tunnels change on restart) |
| `404 Unknown role` / `No valid session` | Use the full `/mcp/planner` or `/mcp/builder` path; a session id only works on the endpoint that created it |
| `EADDRINUSE` | Another process uses `PORT`; change it in `.env` and restart both pm2 apps |
| `git is not installed` / `git init -b` fails | Install git >= 2.28 |
| Quick tunnel URL changed after reboot | Use a named tunnel (section 6) |
| Tool says "Role 'planner' may only modify..." | Expected: the planner can write only the four handoff files; use the builder endpoint |
| Tests fail on Windows | Symlink tests need Developer Mode or admin rights; run them in WSL |
