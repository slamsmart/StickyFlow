# TASK.md

## Task

Describe the task clearly.

## Success Criteria

- [ ] Requested outcome is implemented
- [ ] Existing behavior is preserved
- [ ] No unrelated files changed
- [ ] No secrets exposed
- [ ] Verification is run or limitation is stated
- [ ] Risk is documented

## Scope

Allowed areas:

- `src/...`

Forbidden areas:

- Production secrets
- Unrelated modules
- Global config unless required

## Verification Commands

Adjust to your project:

```bash
pnpm lint
pnpm test
pnpm build
```

## Expected Report

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
