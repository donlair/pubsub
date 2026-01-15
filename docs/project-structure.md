# Project Structure

Complete directory structure and file organization for the Node-Compatible Google Pub/Sub Library.

## Directory Tree

```
pubsub/
├── src/                           # Source code
│   ├── index.ts                   # Main exports (PubSub, Topic, etc.)
│   ├── pubsub.ts                  # PubSub client class
│   ├── topic.ts                   # Topic class
│   ├── subscription.ts            # Subscription class
│   ├── message.ts                 # Message class
│   ├── schema.ts                  # Schema class
│   │
│   ├── publisher/                 # Publisher components
│   │   ├── index.ts               # Export Publisher only
│   │   ├── publisher.ts
│   │   ├── batch-publisher.ts     # Internal
│   │   └── flow-control.ts        # Internal
│   │
│   ├── subscriber/                # Subscriber components
│   │   ├── index.ts
│   │   ├── message-stream.ts
│   │   ├── lease-manager.ts
│   │   └── flow-control.ts
│   │
│   ├── internal/                  # Internal (not exported)
│   │   ├── message-queue.ts
│   │   ├── message-router.ts
│   │   ├── ack-manager.ts
│   │   └── ordering-manager.ts
│   │
│   └── types/                     # Type definitions
│       ├── index.ts               # Re-export all types
│       ├── pubsub-options.ts
│       ├── topic-options.ts
│       ├── subscription-options.ts
│       ├── message-types.ts
│       └── schema-types.ts
│
├── tests/                         # Test files mirror src/ structure
│   ├── unit/                      # e.g., topic.test.ts
│   ├── integration/               # e.g., publish-subscribe.test.ts
│   └── compatibility/             # e.g., google-api-compat.test.ts
│
├── specs/                         # Specifications (01-pubsub.md, etc.)
├── docs/                          # Documentation
└── .claude/rules/                 # Technical rules
```

## Directory Purpose

### `src/` - Source Code

Root level files contain public API classes. Each subdirectory organizes related functionality.

**Root Files**:
- `index.ts` - Main entry point, exports all public APIs
- `pubsub.ts` - PubSub client class (factory for topics/subscriptions)
- `topic.ts` - Topic class (publishing interface)
- `subscription.ts` - Subscription class (EventEmitter for message delivery)
- `message.ts` - Message class (received message with ack/nack)
- `schema.ts` - Schema class (message validation)

### `src/publisher/` - Publishing Components

Batching and flow control for message publishing.

- `publisher.ts` - Main Publisher class (public API)
- `batch-publisher.ts` - Internal batching logic
- `flow-control.ts` - Publishing flow control

### `src/subscriber/` - Subscription Components

Streaming pull and message delivery.

- `message-stream.ts` - Streaming pull implementation
- `lease-manager.ts` - Message lease management
- `flow-control.ts` - Subscriber flow control

### `src/internal/` - Internal Components

Not exported. Used by public API classes.

- `message-queue.ts` - Singleton in-memory message broker
- `message-router.ts` - Routes messages to subscriptions
- `ack-manager.ts` - Tracks message acknowledgments
- `ordering-manager.ts` - Ensures ordering key guarantees

### `src/types/` - Type Definitions

All TypeScript types and interfaces.

- Each file contains related types
- `index.ts` re-exports all types for easy importing

### `tests/` - Test Files

Mirrors `src/` structure.

- `unit/` - Component-level tests (fast, isolated)
- `integration/` - Multi-component tests (end-to-end flows)
- `compatibility/` - Google API compatibility tests

### `specs/` - Specifications

Acceptance criteria and requirements for each component.

### `docs/` - Documentation

Reference documentation and guides.

### `.claude/rules/` - Technical Rules

Development guidelines and patterns.

## Index Files

### Main Entry Point

```typescript
// src/index.ts - Main exports
export { PubSub } from './pubsub';
export { Topic } from './topic';
export { Subscription } from './subscription';
export { Message } from './message';
export { Schema } from './schema';
export * from './types';
```

### Type Exports

```typescript
// src/types/index.ts - Re-export all types
export * from './pubsub-options';
export * from './topic-options';
export * from './subscription-options';
export * from './message-types';
export * from './schema-types';
```

### Selective Exports

```typescript
// src/publisher/index.ts - Export public only
export { Publisher } from './publisher';
// Don't export batch-publisher, flow-control (internal)
```

## Import Conventions

### Same Directory

```typescript
import { Something } from './something';
```

### Parent Directory

```typescript
import { PubSub } from '../pubsub';
```

### Type-Only Imports

```typescript
import type { PubSubOptions } from './types';
```

### Subdirectory Imports

```typescript
// Import from index (public API)
import { Publisher } from './publisher';

// Don't import internal files directly
// ❌ import { BatchPublisher } from './publisher/batch-publisher';
```

## File Naming

- **Source files**: `kebab-case.ts` (e.g., `message-queue.ts`)
- **Test files**: `<component>.test.ts` or `<feature>-compat.test.ts`
- **Spec files**: `<number>-<component>.md` (e.g., `02-topic.md`)
- **Index files**: Always `index.ts`

## Guidelines

- **One class per file** for public API components
- **Create new files** for:
  - New public classes
  - Complex internal components
  - Grouped types
- **Don't create files** for:
  - Single functions or tiny utilities
  - Add to existing related file instead
- **Max ~500 lines** per file - split if larger

## Example Structure

```
src/
├── index.ts                    # Exports: PubSub, Topic, Subscription, Message, Schema, types
├── pubsub.ts                   # class PubSub (300 lines)
├── topic.ts                    # class Topic (250 lines)
├── subscription.ts             # class Subscription (400 lines)
├── message.ts                  # class Message (150 lines)
├── schema.ts                   # class Schema (200 lines)
│
├── publisher/
│   ├── index.ts                # export { Publisher }
│   ├── publisher.ts            # class Publisher (200 lines)
│   ├── batch-publisher.ts      # class BatchPublisher (300 lines) [internal]
│   └── flow-control.ts         # class FlowControl (150 lines) [internal]
│
└── types/
    ├── index.ts                # export * from all type files
    ├── pubsub-options.ts       # PubSubOptions interface
    ├── topic-options.ts        # PublishOptions, BatchingOptions
    └── message-types.ts        # PubSubMessage, Attributes
```
