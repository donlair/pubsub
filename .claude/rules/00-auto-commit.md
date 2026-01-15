# Rule: Automatic Git Commits

## Purpose

Automatically create git commits after each significant change to create a clear audit trail.

## When to Commit

- Implementing a complete acceptance criteria from specs
- Completing a test file with passing tests
- Implementing a complete component class
- Fixing a bug or adding a feature that works

## Commit Message Format

Use Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Types

`feat` | `fix` | `test` | `refactor` | `docs` | `chore`

### Scope

`pubsub` | `topic` | `subscription` | `message` | `publisher` | `subscriber` | `queue` | `schema` | `types`

### Subject

Short description (50 chars max)

### Body

- What was implemented
- Which spec/acceptance criteria it satisfies
- Key technical decisions

## Example

```
feat(topic): implement publishMessage with batching

Implemented Topic.publishMessage() method with batching support.
Satisfies specs/02-topic.md AC-001, AC-002, AC-004.

- Added Publisher instance to Topic
- Configured default batching (100 msgs, 10ms, 1MB)
- Returns Promise<string> with message ID

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Best Practices

1. **Atomic commits**: Each commit represents one logical change
2. **Buildable commits**: Code compiles and tests pass after each commit
3. **Reference specs**: Link commits to acceptance criteria they satisfy
4. **Co-author attribution**: Always include the Co-Authored-By line
