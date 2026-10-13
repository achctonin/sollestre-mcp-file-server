# Demo transcript (to be generated)

> **Status: not generated yet.** This file must come from a real run against a real MCP client. Nothing here is simulated.

## How to produce it
1. Start the server and tunnel (README sections 4-6). Connect a client to `/mcp/planner` (session 1) and run the planner prompt in `docs/DEMO.md`.
2. Open a **new** conversation connected to `/mcp/builder` (session 2) and run the builder prompt in `docs/DEMO.md`.
3. Export each client conversation (Claude: "copy" / export the chat; Claude Code: `/export`) and paste the tool-call sections below, in order.
4. Commit `logs/calls.jsonl` (the server wrote it) as the machine-readable record, and copy the final `PLAN_LOG.md` and `CHECKPOINTS.md` from `WORKSPACE_ROOT` into `docs/evidence/`.

## Session 1 (planner)
_paste here_

## Session 2 (builder)
_paste here_
