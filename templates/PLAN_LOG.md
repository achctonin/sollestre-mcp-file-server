# PLAN_LOG (append-only)

Never edit or delete old entries. Add a new entry directly above the final marker comment of this file by calling
str_replace on that marker (exact steps are in AGENTS.md).

Entry format:

    ### <ISO timestamp> | <agent role>
    - plan: <what you are about to do>
    - result: <outcome, or "pending">

<!-- END -->
