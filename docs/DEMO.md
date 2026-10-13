# 5-minute live demo script (rehearse with a timer)

Setup before you start: `pm2 status` shows both apps online; two client windows (planner, builder); a terminal with `tail -f logs/calls.jsonl`; a fresh workspace (`rm -rf workspace` then restart `mcp-server` so templates are re-seeded).

| Time | Segment | What to do / say |
|---|---|---|
| 0:00-0:30 | Overview | Show the diagram in the README: client > tunnel > two role endpoints > sandbox > handoff files. One sentence on each: 8 tools, 2 roles, pm2 keeps it alive. |
| 0:30-1:30 | Sandbox escape rejected | In the builder client ask: "read `../../etc/passwd`", then "write `/tmp/x`", then (prepared symlink) "read `escape/secret.txt`". Show the three clear `isError` messages. Mention `resolveSafePath` is the only door and uses realpath. |
| 1:30-3:00 | Session 1, planner | Prompt: *"Read PROJECT_STATE.md and the latest CHECKPOINTS entry. Goal: create a small CLI to-do app in the workspace (add, list, done). Log your plan in PLAN_LOG.md first, update PROJECT_STATE.md, then write CHECKPOINT CP-1. Stop after the checkpoint."* Point out: plan logged before acting, no whole-file reads, a stop condition. Try `delete_file` on this endpoint: it is not even registered. |
| 3:00-4:30 | Session 2, builder (new chat) | Prompt: *"You are the builder. Read only the handoff files, implement the next stage, use search_text to locate things and str_replace for edits, run git_status, git_commit your files, then write CP-2 and update PROJECT_STATE.md. Stop after the checkpoint."* Show that it knows the plan without any chat history. |
| 4:30-5:00 | Delete gate + logs | Ask the builder to delete `todo.js` with `confirm: "yes"`: refused. Then `confirm: "DELETE"`: works (or skip if you want to keep the app). Show `logs/calls.jsonl` lines for both roles. |

Backup plan if the tunnel is down: run the same demo against `http://127.0.0.1:3000/...` in Inspector or Claude Code.
