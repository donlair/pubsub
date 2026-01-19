# Development Guide

This guide covers development workflows, testing, and contributing to the library.

## Setup

```bash
# Install dependencies
bun install
```

## Development Workflow

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/topic.test.ts

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

### Type Checking

```bash
# Type check all files
bun run typecheck

# Watch mode
bun run typecheck --watch
```

### Linting

```bash
# Run linter
bun run lint

# Auto-fix issues
bun run lint:fix
```

### Full Verification

Before committing, always run:

```bash
# Runs typecheck + lint + tests
bun run verify
```

This ensures:
- TypeScript compiles without errors
- Code passes linting rules
- All tests pass

## Testing Philosophy

We follow Test-Driven Development (TDD):

1. **Write test first** - Define expected behavior
2. **Run test** - Should fail initially
3. **Write minimal code** - Make test pass
4. **Refactor** - Clean up code
5. **Repeat** - Next test

### Test Organization

```
tests/
├── unit/              # Single component, mocked dependencies
├── integration/       # Multiple components working together
└── compatibility/     # Google API compatibility verification
```

### Test Coverage Goals

- **90%+ line coverage** for all source code
- **100% coverage** for public API methods
- **All edge cases** tested
- **All error conditions** tested

## Code Style

### TypeScript

- **Strict mode enabled** - No `any`, explicit return types
- **Type compatibility** - Match `@google-cloud/pubsub` types exactly
- **Null safety** - Use optional chaining and nullish coalescing

### Comments

- **No inline comments** - Code should be self-documenting
- **JSDoc for public APIs** - When it adds value
- **Explain why, not what** - Comment reasoning, not mechanics

### File Organization

- **One class per file** for public API components
- **Kebab-case naming** - `message-queue.ts`
- **Test files** - `<component>.test.ts`
- **Max ~500 lines** per file

## Git Workflow

We use atomic commits with conventional commit messages:

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

**Example:**
```
feat(topic): add message ordering support

Implements message ordering with orderingKey support.
Satisfies acceptance criteria from specs/02-topic.md.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## API Compatibility

**Critical**: This library must be 100% API-compatible with `@google-cloud/pubsub`.

### Verification

```bash
# Type compatibility
bun run typecheck

# Runtime compatibility
bun test tests/compatibility/
```

### Compatibility Rules

1. **Match signatures exactly** - Same methods, parameters, return types
2. **Match defaults** - Same default values as Google's library
3. **Use gRPC error codes** - NOT_FOUND=5, INVALID_ARGUMENT=3, etc.
4. **Tuple returns** - Admin ops return `[result, metadata]`
5. **EventEmitter overloads** - Type-safe event methods

## Performance Testing

### Benchmarking

```bash
# Run default benchmark
bun run bench

# Run all scenarios
bun run bench:scenarios

# Constrained environments (containers)
bun run bench:constrained:micro
bun run bench:constrained:small
bun run bench:constrained:medium
```

### Adding Benchmarks

Benchmarks live in `bench/scenarios/`:

```typescript
import { runBenchmark } from '../runner';

await runBenchmark({
  name: 'My Scenario',
  messageCount: 10000,
  messageSize: 1024,
  publishBatchSize: 100,
  // ... other options
});
```

## Documentation

### Structure

```
docs/
├── features.md         # Feature examples
├── use-cases.md        # Common use cases
├── performance.md      # Performance guide
├── development.md      # This file
└── api/               # API reference (if needed)
```

### When to Update Docs

- **Adding features** - Update features.md
- **Performance changes** - Update performance.md
- **API changes** - Update README and API docs
- **New examples** - Add to appropriate doc file

## Troubleshooting

### Tests Failing

```bash
# Clean install
rm -rf node_modules bun.lockb
bun install
bun test
```

### Type Errors

```bash
# Check for type mismatches
bun run typecheck

# Compare with @google-cloud/pubsub types
bun install @google-cloud/pubsub
```

### Linting Errors

```bash
# Auto-fix most issues
bun run lint:fix

# Check remaining issues
bun run lint
```

## Contributing

1. **Fork and clone** the repository
2. **Create a branch** - `git checkout -b feature/my-feature`
3. **Write tests first** - TDD approach
4. **Make changes** - Implement feature
5. **Verify** - `bun run verify` passes
6. **Commit** - Use conventional commits
7. **Push and PR** - Submit for review

## Resources

- **API Reference**: [Google Cloud Pub/Sub Docs](https://cloud.google.com/pubsub/docs)
- **Type Definitions**: `node_modules/@google-cloud/pubsub/build/src/*.d.ts`
- **Specifications**: `specs/` directory
- **Examples**: See docs/features.md and docs/use-cases.md
