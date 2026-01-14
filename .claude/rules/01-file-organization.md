# Rule: File Organization

## Purpose

Define clear conventions for where files belong in the codebase. Consistent organization makes the codebase easy to navigate and understand.

## Directory Structure

```
pubsub/
├── src/                      # Source code
│   ├── index.ts             # Main exports
│   ├── pubsub.ts            # PubSub client
│   ├── topic.ts             # Topic class
│   ├── subscription.ts      # Subscription class
│   ├── message.ts           # Message class
│   ├── schema.ts            # Schema class
│   │
│   ├── publisher/           # Publisher components
│   │   ├── index.ts
│   │   ├── publisher.ts
│   │   ├── batch-publisher.ts
│   │   └── flow-control.ts
│   │
│   ├── subscriber/          # Subscriber components
│   │   ├── index.ts
│   │   ├── message-stream.ts
│   │   ├── lease-manager.ts
│   │   └── flow-control.ts
│   │
│   ├── internal/            # Internal implementation
│   │   ├── message-queue.ts
│   │   ├── message-router.ts
│   │   ├── ack-manager.ts
│   │   └── ordering-manager.ts
│   │
│   └── types/               # Type definitions
│       ├── index.ts
│       ├── pubsub-options.ts
│       ├── topic-options.ts
│       ├── subscription-options.ts
│       ├── message-types.ts
│       └── schema-types.ts
│
├── tests/                   # Test files
│   ├── unit/
│   ├── integration/
│   └── compatibility/
│
├── specs/                   # Specifications
└── .claude/rules/          # Technical rules
```

## File Naming Conventions

### Source Files
- **Classes**: `kebab-case.ts` (e.g., `message-queue.ts`, `batch-publisher.ts`)
- **Types**: `kebab-case.ts` (e.g., `pubsub-options.ts`, `message-types.ts`)
- **Index files**: Always `index.ts`

### Test Files
- **Unit tests**: `<component>.test.ts` (e.g., `topic.test.ts`)
- **Integration tests**: `<feature>.test.ts` (e.g., `publish-subscribe.test.ts`)
- **Compatibility tests**: `<api-area>-compat.test.ts`

### Specification Files
- **Specs**: `<number>-<component>.md` (e.g., `02-topic.md`)

## Where to Put New Files

### Public API Components
Place in `src/` root:
- PubSub client → `src/pubsub.ts`
- Topic → `src/topic.ts`
- Subscription → `src/subscription.ts`
- Message → `src/message.ts`
- Schema → `src/schema.ts`

### Publisher Components
Place in `src/publisher/`:
- Publisher → `src/publisher/publisher.ts`
- Batch logic → `src/publisher/batch-publisher.ts`
- Flow control → `src/publisher/flow-control.ts`

### Subscriber Components
Place in `src/subscriber/`:
- Message stream → `src/subscriber/message-stream.ts`
- Lease manager → `src/subscriber/lease-manager.ts`
- Flow control → `src/subscriber/flow-control.ts`

### Internal Components (Not Exported)
Place in `src/internal/`:
- Message queue → `src/internal/message-queue.ts`
- Message router → `src/internal/message-router.ts`
- Ack manager → `src/internal/ack-manager.ts`
- Ordering manager → `src/internal/ordering-manager.ts`

### Type Definitions
Place in `src/types/`:
- Options types → `src/types/<component>-options.ts`
- Data types → `src/types/<component>-types.ts`
- Always export from `src/types/index.ts`

### Tests
- **Unit tests** → `tests/unit/<component>.test.ts`
- **Integration tests** → `tests/integration/<feature>.test.ts`
- **Compatibility tests** → `tests/compatibility/<api>-compat.test.ts`

## Index Files

### src/index.ts
Main export file for the library:
```typescript
export { PubSub } from './pubsub';
export { Topic } from './topic';
export { Subscription } from './subscription';
export { Message } from './message';
export { Schema } from './schema';

// Export all types
export * from './types';
```

### src/types/index.ts
Export all type definitions:
```typescript
export * from './pubsub-options';
export * from './topic-options';
export * from './subscription-options';
export * from './message-types';
export * from './schema-types';
```

### Subdirectory index files
Export public components from subdirectory:
```typescript
// src/publisher/index.ts
export { Publisher } from './publisher';
// Don't export internal components like batch-publisher
```

## Import Conventions

### Imports from Same Directory
```typescript
import { Something } from './something';
```

### Imports from Parent Directory
```typescript
import { PubSub } from '../pubsub';
```

### Imports from Subdirectory
```typescript
import { Publisher } from './publisher';
// Or if index.ts exists:
import { Publisher } from './publisher/publisher';
```

### Type Imports
```typescript
import type { PubSubOptions } from './types';
// Or with value and type:
import { type PubSubOptions, PubSub } from './types';
```

## File Size Guidelines

- **Maximum 500 lines**: If a file exceeds 500 lines, consider splitting
- **Single responsibility**: Each file should have one primary purpose
- **Related concerns**: Group related functions/classes in same file

## When to Create New Files

Create a new file when:
- Adding a new public API class
- Implementing a complex internal component
- Grouping related types or interfaces
- Creating a new test suite

Don't create new files for:
- Single functions (add to existing related file)
- Tiny utility functions (create `utils.ts` if needed)
- One-off helpers

## Co-location Principle

Tests should mirror the source structure:
```
src/topic.ts           → tests/unit/topic.test.ts
src/publisher/publisher.ts → tests/unit/publisher.test.ts
```

## Module Boundaries

### Public API (exported from src/index.ts)
- PubSub, Topic, Subscription, Message, Schema
- All type definitions

### Internal API (not exported)
- MessageQueue, MessageRouter, AckManager
- BatchPublisher, MessageStream, LeaseManager
- OrderingManager

### Clear Separation
- Public classes use internal components
- Internal components never import public classes
- Types can be imported by both

## Best Practices

1. **One class per file** for public API components
2. **Group related utilities** in single file
3. **Index files** for clean exports from directories
4. **Test file mirrors** source file location
5. **Types separated** from implementation
6. **Internal hidden** from public exports
