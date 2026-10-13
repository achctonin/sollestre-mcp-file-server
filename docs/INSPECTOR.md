# MCP Inspector checklist (R5)

Run `npx @modelcontextprotocol/inspector`, choose **Streamable HTTP**, and connect to each endpoint in turn:
`http://127.0.0.1:3000/mcp/planner` then `http://127.0.0.1:3000/mcp/builder`. Save a screenshot or copied output of every row into `docs/inspector/`.

First check **Tools > List**: planner shows 6 tools, builder shows 8, every schema has `additionalProperties: false`.

| # | Tool | Success case | Error case (expect `isError: true`) |
|---|------|--------------|-------------------------------------|
| 1 | list_dir | `{"path":"."}` | `{"path":"../"}` |
| 2 | read_file | `{"path":"PROJECT_STATE.md"}` | `{"path":"PROJECT_STATE.md","offset":999}` |
| 3 | write_file (builder) | `{"path":"scratch/a.txt","content":"hi"}` | same call again (already exists) |
| 4 | str_replace (builder) | `{"path":"scratch/a.txt","old_str":"hi","new_str":"hello"}` | `{"path":"scratch/a.txt","old_str":"zzz","new_str":"x"}` |
| 5 | delete_file (builder) | `{"path":"scratch/a.txt","confirm":"DELETE"}` | `{"path":"scratch/a.txt","confirm":"yes"}` |
| 6 | search_text | `{"query":"Goal"}` | `{"query":"x","path":"/etc"}` |
| 7 | git_status | `{}` | `{"extra":1}` |
| 8 | git_commit (builder) | `{"message":"scratch","paths":["scratch/a.txt"]}` | `{"message":"x","paths":[".git/config"]}` |

Role checks on the planner endpoint: calling `delete_file` or `git_commit` must fail with "not available to role 'planner'";
`write_file` to `src/x.ts` must fail with "may only modify these files"; `write_file` to `PLAN_LOG.md` (overwrite) must work.
Sandbox checks on both: `../x`, `/etc/passwd`, and a path through a symlink all return a clear message and no stack trace.
Finally check that `logs/calls.jsonl` has one line per call.
