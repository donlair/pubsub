# Git Workflow Guide

This guide provides detailed examples and explanations for creating well-structured git commits following the Conventional Commits format.

## Commit Message Structure

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Components Explained

#### Type
Indicates the category of change. Choose one:

- **feat**: New feature or functionality
- **fix**: Bug fix
- **test**: Adding or updating tests
- **refactor**: Code restructuring without changing behavior
- **docs**: Documentation changes
- **chore**: Maintenance tasks (build, dependencies, etc.)

#### Scope
Identifies the component or area affected. Common scopes:

- **pubsub**: Main PubSub client
- **topic**: Topic class and publishing
- **subscription**: Subscription class and streaming
- **message**: Message class and acknowledgment
- **publisher**: Publisher and batching logic
- **subscriber**: Subscriber and message streaming
- **queue**: Internal message queue
- **schema**: Schema validation
- **types**: Type definitions

#### Subject
Brief summary of the change (50 characters or less):
- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize first letter
- No period at the end
- Be specific but concise

#### Body
Detailed explanation with:
- **What** was implemented or changed
- **Which** spec or acceptance criteria it satisfies
- **Key technical decisions** or implementation details

Use bullet points for clarity. Leave one blank line between subject and body.

#### Co-Author
Always include the co-author line to attribute AI assistance:
```
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Detailed Examples

### Example 1: Feature Implementation

```
feat(topic): implement publishMessage with batching

Implemented Topic.publishMessage() method with batching support.
Satisfies specs/02-topic.md AC-001, AC-002, AC-004.

- Added Publisher instance to Topic
- Configured default batching (100 msgs, 10ms, 1MB)
- Returns Promise<string> with message ID

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Why this works:**
- Type `feat` indicates new functionality
- Scope `topic` clearly identifies the component
- Subject is concise and uses imperative mood
- Body explains what was done and links to specs
- Technical details provide implementation context

### Example 2: Test Implementation

```
test(subscription): add streaming pull integration tests

Added comprehensive integration tests for Subscription streaming pull.
Satisfies specs/03-subscription.md AC-005, AC-006, AC-007.

- Tests message delivery via events
- Tests flow control (maxMessages, maxBytes)
- Tests message ordering with orderingKey
- Tests error handling and reconnection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Why this works:**
- Type `test` clearly indicates test-only changes
- Lists all test scenarios covered
- Links to specific acceptance criteria

### Example 3: Bug Fix

```
fix(message): correct ack deadline extension logic

Fixed bug where ack deadline was not properly extended when
modAckDeadline() was called multiple times.

- Changed lease manager to track cumulative extensions
- Added validation to prevent deadline exceeding 10 minutes
- Updated unit tests to verify cumulative behavior

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Why this works:**
- Type `fix` indicates bug resolution
- Explains the problem and solution
- Details technical changes made
- Mentions test updates

### Example 4: Refactoring

```
refactor(publisher): extract batch logic into BatchPublisher

Refactored Publisher class to delegate batching logic to separate
BatchPublisher class for better separation of concerns.

- Created new BatchPublisher class in publisher/batch-publisher.ts
- Moved batch accumulation and flushing logic
- Publisher now acts as facade to BatchPublisher
- No behavior changes, all tests pass

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Why this works:**
- Type `refactor` indicates no functional changes
- Explains motivation (separation of concerns)
- Details what was moved where
- Confirms no behavior changes

### Example 5: Documentation

```
docs(types): add JSDoc comments to public API types

Added comprehensive JSDoc documentation to all public type
definitions in src/types/ for better IDE support.

- Documented all options interfaces
- Added @default tags for optional properties
- Included usage examples in complex types
- Added @throws tags for error conditions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Why this works:**
- Type `docs` indicates documentation-only changes
- Lists specific documentation improvements
- Explains benefit (better IDE support)

### Example 6: Multiple Scopes

When changes affect multiple components, choose the primary scope:

```
feat(pubsub): implement topic and subscription factory methods

Implemented topic() and subscription() factory methods on PubSub client.
Satisfies specs/01-pubsub.md AC-002, AC-003.

- Added topic(name, options?) method returning Topic instance
- Added subscription(name, options?) method returning Subscription instance
- Both methods validate names and create resource objects
- Does not make network calls (lazy initialization)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Example 7: Type Definitions

```
feat(types): complete Phase 1 type definitions

Completed all type definitions for Phase 1 (Type Definitions layer).
Satisfies specs/IMPLEMENTATION_PLAN.md Phase 1 completion.

- Defined all option types (PubSubOptions, TopicOptions, etc.)
- Defined message types (PubSubMessage, Message, Attributes)
- Defined schema types (SchemaType, SchemaView, Schema)
- Created comprehensive type exports in types/index.ts
- All types match @google-cloud/pubsub API

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## When to Commit

Create a commit when you've completed one of these:

1. **Implementing a complete acceptance criteria from specs**
   - Example: AC-001 from specs/02-topic.md is fully implemented and tested

2. **Completing a test file with passing tests**
   - Example: tests/unit/topic.test.ts written and all tests pass

3. **Implementing a complete component class**
   - Example: Topic class with all core methods working

4. **Fixing a bug or adding a feature that works**
   - Example: Bug in ack logic is fixed and verified with tests

## Best Practices

### 1. Atomic Commits
Each commit should represent **one logical change**:

✅ Good:
```
feat(topic): add publishMessage method
test(topic): add publishMessage tests
```

❌ Bad:
```
feat(topic): add publishMessage and fix subscription bug
```

### 2. Buildable Commits
Code should compile and tests should pass after each commit:

```bash
# Before committing, verify:
bun run tsc --noEmit  # TypeScript compiles
bun test              # All tests pass
```

### 3. Reference Specs
Always link commits to the specifications they satisfy:

```
Satisfies specs/02-topic.md AC-001, AC-002
Implements specs/IMPLEMENTATION_PLAN.md Phase 2, Layer 3
Addresses specs/03-subscription.md Section 4.2
```

### 4. Co-Author Attribution
Always include the co-author line when AI assists:

```
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Quick Reference

### Common Type + Scope Combinations

```
feat(pubsub)        - New PubSub client features
feat(topic)         - New Topic features
feat(subscription)  - New Subscription features
feat(message)       - New Message features
feat(types)         - New type definitions
test(topic)         - Topic tests
test(subscription)  - Subscription tests
fix(publisher)      - Publisher bug fixes
fix(subscriber)     - Subscriber bug fixes
refactor(queue)     - Internal queue refactoring
docs(api)           - API documentation
chore(deps)         - Dependency updates
```

### Subject Line Examples

```
implement publishMessage with batching
add streaming pull support
fix ack deadline extension logic
extract batch logic into separate class
add JSDoc comments to public API
update dependencies to latest versions
complete Phase 1 type definitions
add integration tests for publish-subscribe flow
correct default batching values
rename getCwd to getCurrentWorkingDirectory
```

## Verification Checklist

Before creating a commit:

- [ ] Code compiles (`bun run tsc --noEmit`)
- [ ] All tests pass (`bun test`)
- [ ] Commit message follows format
- [ ] Subject is 50 characters or less
- [ ] Body explains what, which specs, and key decisions
- [ ] Co-author line is included
- [ ] Change is atomic (one logical change)
- [ ] References spec/acceptance criteria
