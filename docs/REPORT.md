# Report: MCP File-Server Connector

## Stack and why
TypeScript on Node 20 with the official `@modelcontextprotocol/sdk`, `zod` for schemas, Express for the Streamable HTTP endpoint, `cloudflared` for public HTTPS and `pm2` to keep the server and the tunnel alive.
TypeScript gives typed tool arguments end to end; the official SDK keeps the protocol details (sessions, SSE, JSON-RPC) correct; cloudflared needs no inbound port and gives HTTPS for free; pm2 gives autorestart plus boot persistence (`pm2 save`, `pm2 startup`).
The build is CommonJS so pm2 can load `ecosystem.config.js` directly. The architecture is deliberately flat: HTTP layer (`server.ts`) > `executeTool` (role check, strict validation, write scope) > tool handler > `resolveSafePath`. Every choice and its rejected alternatives is in `DECISIONS.md`.

## Tool design
- **Single-purpose tools, exactly eight.** Each does one thing and its description says when to use it and what to use instead (for example `read_file` points to `search_text`).
- **Strict schemas.** Every input is a zod `.strict()` object with types and min/max limits, so unknown fields are rejected and the same schema is published to clients as JSON Schema with `additionalProperties: false`. The server validates itself instead of relying on the SDK helper, which would strip unknown keys.
- **Chunked, capped reads.** `read_file` takes `offset`/`limit`, reports total lines and `next_offset`, and has a hard 20,000-character output cap. `search_text` and `list_dir` truncate with a note that tells the agent how to narrow the call. This keeps context small and makes "search, then read a chunk" the natural pattern.
- **Gated delete.** `delete_file` needs the literal `confirm: "DELETE"` and is only registered for the builder; the handler re-checks the role.
- **Helpful `isError` results.** Every failure is a short message with a fix ("old_str appears 3 times in src/app.ts. Add surrounding lines to make it unique."). Handlers never throw to the client and unexpected errors are reduced to a code with the detail kept in the server console, never a stack trace.
- **Handoff files instead of chat memory.** `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md` and `DECISIONS.md` carry context between sessions. Append-only files are appended with `str_replace` on a `<!-- END -->` marker because no ninth tool is allowed.

## Security: what the sandbox stops
`resolveSafePath` is the only way a path argument reaches the filesystem. It rejects absolute paths (POSIX and Windows forms), null bytes and `..` escapes, then resolves the real path of the target (or of the nearest existing parent for new files) and rejects anything outside the real workspace root, which stops symlink escapes, including symlinked directories and dangling links. Writes and deletes inside `.git` are blocked. `git_commit` calls git with `execFile` and an argument array (never a shell string) plus `--literal-pathspecs`, so a commit message such as `$(rm -rf ~)` is just text. Tool output sizes and input sizes are bounded. Unit tests cover traversal, absolute paths, null bytes, symlink escapes and `.git`.

## Security: what it does not stop
- **No authentication.** Anyone who has the tunnel URL can call every tool for that role. A public tunnel makes the server reachable from the whole internet; the only protections are URL secrecy and the sandbox. Quick-tunnel URLs are random but not secret by design.
- **Roles are endpoints, not identities.** Nothing proves a client is "the planner"; anyone can connect to `/mcp/builder`. The split reduces accidents by agents, not attacks. The append-only rule for `PLAN_LOG.md` and `CHECKPOINTS.md` is a convention, not enforced by code.
- **Symlink and race limits.** Checks happen before the operation (time-of-check/time-of-use). A process that can create symlinks inside the workspace at the same instant could still race a write. The tools offer no way to create symlinks, but anything else with access to the folder (or a repo containing symlinks) could.
- **Git.** Content in the workspace repo is trusted by git: hooks inside `.git` cannot be written through the tools, but a pre-existing repository with hooks would run them (`--no-verify` is passed on commit). The shell-injection risk is mitigated as described above, not eliminated for all git behaviour.
- **Resource use.** Size caps limit each call, but there is no rate limiting or per-session quota.
- **Visibility.** `logs/calls.jsonl` truncates content, so it is an audit trail of actions, not a backup.

## Results (fill in after your run)
Unit tests: 20 passing (`npm test`). Inspector run: _link the screenshots in `docs/inspector/`_. Real-client run and transcript: _`docs/transcript.md`_. Efficiency numbers for the demo (calls per session, retries): _from `logs/calls.jsonl`_.
