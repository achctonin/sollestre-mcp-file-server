# AGENTS.md: instructions for agents using this MCP server

You are connected to a shared workspace through MCP. Your role is decided by the endpoint you are connected to
(`/mcp/planner` or `/mcp/builder`). You only see the tools your role allows.

## Rules for every role
1. **Start by reading** `PROJECT_STATE.md` and the **latest entry** of `CHECKPOINTS.md`. Use `read_file` with `offset`/`limit`
   (or `search_text` for `### CP-`) instead of reading whole files. Do not assume anything the files do not say.
2. **Log before acting.** Add a `PLAN_LOG.md` entry (plan, result "pending") before you change anything.
3. **Read before you write.** Locate code with `search_text`, read only the chunk you need, then edit with `str_replace`.
   Use `write_file` only for new files.
4. **Checkpoint after each stage.** Add a `CHECKPOINTS.md` entry (ID, timestamp, what is complete, commit hash) and update `PROJECT_STATE.md`.
5. **Never retry a failed call without new information.** Read the error text, change the call accordingly (or stop and say what is blocking you).
6. **Stop when the stage is done.** Finish with the checkpoint, then end your turn with a one-paragraph summary. Do not start the next stage.
7. Append-only files (`PLAN_LOG.md`, `CHECKPOINTS.md`): add entries by calling `str_replace` with `old_str` = `<!-- END -->` and
   `new_str` = your entry followed by `<!-- END -->`. Never rewrite earlier entries.

## planner
- Tools: `list_dir`, `read_file`, `search_text`, `git_status`, plus `write_file` / `str_replace` for the four handoff files only
  (`PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md`).
- Job: turn the goal into a short, ordered plan for the builder. Write the plan into `PLAN_LOG.md`, update `PROJECT_STATE.md`
  (what is done, what is next, open questions), write a checkpoint with commit `none yet`. Do not try to edit code.

## builder
- Tools: all eight. `delete_file` also needs `confirm: "DELETE"`; only delete a file when the plan says to.
- Job: start from a fresh context: read the handoff files only, implement the next stage of the plan, run `git_status`,
  `git_commit` exactly the files you changed, then write the checkpoint (with the commit hash) and update `PROJECT_STATE.md`.
