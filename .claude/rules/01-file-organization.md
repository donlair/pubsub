# Rule: File Organization

## Directory Structure

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
└── .claude/rules/                 # Technical rules
```

## Naming Conventions

- **Source files**: `kebab-case.ts` (e.g., `message-queue.ts`)
- **Test files**: `<component>.test.ts` or `<feature>-compat.test.ts`
- **Spec files**: `<number>-<component>.md` (e.g., `02-topic.md`)
- **Index files**: Always `index.ts`

## Index Files

```typescript
// src/index.ts - Main exports
export { PubSub } from './pubsub';
export { Topic } from './topic';
export { Subscription } from './subscription';
export { Message } from './message';
export { Schema } from './schema';
export * from './types';

// src/types/index.ts - Re-export all types
export * from './pubsub-options';
export * from './topic-options';
// ...etc

// src/publisher/index.ts - Export public only
export { Publisher } from './publisher';
// Don't export batch-publisher, flow-control (internal)
```

## Import Conventions

```typescript
// Same directory
import { Something } from './something';

// Parent directory
import { PubSub } from '../pubsub';

// Type-only imports
import type { PubSubOptions } from './types';
```

## Guidelines

- **One class per file** for public API components
- **Create new files** for new public classes, complex internal components, or grouped types
- **Don't create files** for single functions or tiny utilities - add to existing related file
- **Max ~500 lines** per file - split if larger
