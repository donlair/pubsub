# Rule: Automatic Git Commits

## Purpose

Automatically create git commits after implementing each significant change. This creates a clear audit trail and makes it easy to review, rollback, or understand the evolution of the codebase.

## When to Commit

Create a commit after:
- Implementing a complete acceptance criteria from specs
- Completing a test file with passing tests
- Implementing a complete component class
- Fixing a bug or error
- Adding a new feature that works

## Commit Message Format

Use the Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `chore`: Build process or auxiliary tool changes

### Scope
The component or area affected:
- `pubsub` - PubSub client
- `topic` - Topic class
- `subscription` - Subscription class
- `message` - Message class
- `publisher` - Publisher component
- `subscriber` - Subscriber component
- `queue` - MessageQueue internal
- `schema` - Schema validation
- `types` - TypeScript type definitions

### Subject
Short description (50 chars max) of what changed

### Body
- What was implemented
- Which spec/acceptance criteria it satisfies
- Any important technical decisions

## Examples

### Feature Implementation
```
feat(topic): implement publishMessage with batching

Implemented Topic.publishMessage() method with batching support.
Satisfies specs/02-topic.md AC-001, AC-002, AC-004.

- Added Publisher instance to Topic
- Configured default batching (100 msgs, 10ms, 1MB)
- Returns Promise<string> with message ID

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Test Implementation
```
test(subscription): add streaming pull tests

Implemented tests for subscription message streaming.
Covers specs/03-subscription.md AC-001 through AC-006.

- Basic message reception
- Flow control max messages
- Ack deadline redelivery
- Pause/resume functionality

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Bug Fix
```
fix(queue): correct ack deadline timer cleanup

Fixed memory leak where ack deadline timers were not
properly cleaned up after message acknowledgment.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Commit Workflow

```bash
# Stage changed files
git add <files>

# Create commit with detailed message
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

## What NOT to Commit

- Incomplete implementations
- Code that doesn't compile
- Tests that don't pass
- Experimental code
- Debug statements or console.logs
- Work-in-progress

## Commit Frequency

Aim for commits every 15-30 minutes of productive work. Smaller, focused commits are better than large, monolithic ones.

## Best Practices

1. **Atomic commits**: Each commit should represent one logical change
2. **Buildable commits**: Code should compile and tests should pass after each commit
3. **Clear messages**: Anyone should understand what changed by reading the message
4. **Reference specs**: Link commits to acceptance criteria they satisfy
5. **Co-author attribution**: Always include the Co-Authored-By line
