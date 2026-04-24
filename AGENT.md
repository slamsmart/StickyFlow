# AGENT.md

## Purpose

This file defines how an AI coding agent must behave inside this repository.

Primary goal:

**Deliver correct, secure, maintainable, production-ready changes with minimal regression risk.**

---

## Rule Zero

**Do not break existing working behavior.**

If uncertain:

1. Do less.
2. Preserve stability.
3. Follow existing patterns.
4. Ask only when a decision is truly required.
5. Choose the safest maintainable solution.

---

## Instruction Priority

1. Current user instruction
2. Folder-level rules
3. Project-level rules
4. `SYSTEM_MAP.md` / `map.md`
5. This `AGENT.md`
6. General assumptions

If instructions conflict, follow the highest-priority source.

---

## Relationship With SYSTEM_MAP.md / map.md

Map files define:

- Architecture
- Entrypoints
- Runtime flow
- Project structure
- Where to start tracing

This file defines:

- Editing behavior
- Debugging rules
- Verification rules
- Communication style

If conflict occurs:

- Follow map files for architecture and navigation.
- Follow AGENT.md for execution discipline.

---

## Mandatory Workflow

For every task:

1. Read `AGENT.md`.
2. Read `SYSTEM_MAP.md` / `map.md` if available.
3. Identify exact target files.
4. Plan minimal changes.
5. Edit only required files.
6. Run verification where possible.
7. Report measurable results.

Use targeted tracing:

```text
Trigger/UI -> Page/Handler -> Service/Logic -> Data Access -> DB/API/File
```

---

## MCP Usage Rules

Use MCP tools only for:

- Targeted file reads
- Targeted edits
- Git status/diff
- Tests/lint/build/typecheck
- Browser validation
- Development database inspection

Do not use MCP tools for:

- Mass editing
- Unrelated directories
- Production database writes
- Reading secrets unless explicitly required
- Destructive commands without confirmation
- Global machine changes

Use the safest tool that can complete the job.

---

## Execution Modes

### PATCH

Default.

- Minimal changes
- No unnecessary refactor
- Preserve behavior

### EXTEND

For new features.

- Follow existing patterns
- Add only necessary code
- Include relevant states

### REFACTOR

Restricted.

Only if requested or necessary.

### AUDIT

No code changes unless requested.

Report by severity:

- Critical
- High
- Medium
- Low

---

## File Rules

Do:

- Modify only necessary files
- Keep changes small
- Follow existing structure
- Update docs/maps if behavior changes

Do not:

- Create unnecessary files
- Rename/move without reason
- Change global config without reason
- Reformat whole files
- Remove tests unless invalid
- Rewrite architecture silently

---

## Security Baseline

Always check:

- Auth and authorization
- Input validation
- Output encoding
- XSS
- CSRF
- SQL injection
- File upload safety
- Secret exposure
- Unsafe command execution
- Dependency risks

Never hardcode secrets.

---

## Verification Rules

Run relevant commands when available:

- lint
- test
- typecheck
- build

Never claim verification passed unless actually run.

If not run, say why.

---

## Output Contract

For simple tasks:

```text
Done. Fixed X by doing Y. Verify via Z.
```

For complex tasks:

```markdown
## Result
Done / Partial / Blocked

## Changed
- File: reason

## Verification
- Command: ...
- Result: passed / failed / not run

## Risk
Low / Medium / High

## Next Step
...
```

---

## Hard Limits

Never:

- Invent APIs or files
- Assume hidden systems
- Change architecture silently
- Overwrite large sections unnecessarily
- Introduce breaking changes without warning
- Expose secrets
- Ignore errors
- Add unnecessary dependencies
- Modify unrelated files

---

## Final Standard

**Zero regression. Minimal diff. Maximum correctness. Full alignment with the existing system.**
