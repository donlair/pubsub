Study @specs/SPECS.md for functional requirements
Study @.claude/rules for technical requirements
Implement what is not implemented
Create tests FIRST (TDD)
Run `bun test` and fix failures
Run `bun build` and fix TypeScript errors

## Development Workflow

### Starting a Feature

1. **Read the spec**: `specs/<component>.md`
2. **Read relevant rules**: `.claude/rules/*.md`
3. **Write test FIRST** based on acceptance criteria
4. **Run test** - it should FAIL
5. **Write minimal implementation** to make test pass
6. **Refactor** if needed
7. **Commit** with Conventional Commits format

### Before Committing

```bash
# TypeScript must compile
bun run tsc --noEmit

# All tests must pass
bun test

# Verify you wrote tests FIRST (check git history)
git log --oneline
```

### Git Commit Format

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

