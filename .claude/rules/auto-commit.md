# Rule: Automatic Git Commits

## Purpose

Automatically create git commits after each significant change to create a clear audit trail.

## When to Commit

- Implementing a complete acceptance criteria from specs
- Completing a test file with passing tests
- Implementing a complete component class
- Fixing a bug or adding a feature that works

## Format

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types**: `feat` | `fix` | `test` | `refactor` | `docs` | `chore`

**Scopes**: `pubsub` | `topic` | `subscription` | `message` | `publisher` | `subscriber` | `queue` | `schema` | `types`

**Subject**: Imperative mood, 50 chars max, no period

**Body**:
- What was implemented
- Which spec/acceptance criteria it satisfies
- Key technical decisions

## Best Practices

1. **Atomic commits**: Each commit represents one logical change
2. **Buildable commits**: Code compiles and tests pass after each commit
3. **Reference specs**: Link commits to acceptance criteria they satisfy
4. **Co-author attribution**: Always include the Co-Authored-By line

## Reference

See `docs/git-workflow.md` for detailed examples and explanations.
