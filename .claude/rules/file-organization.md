# Rule: File Organization

## Purpose

Define file naming, organization, and structure conventions for the project.

## Naming Conventions

- **Source files**: `kebab-case.ts` (e.g., `message-queue.ts`)
- **Test files**: `<component>.test.ts` or `<feature>-compat.test.ts`
- **Spec files**: `<number>-<component>.md` (e.g., `02-topic.md`)
- **Index files**: Always `index.ts`

## Guidelines

- **One class per file** for public API components
- **Create new files** for new public classes, complex internal components, or grouped types
- **Don't create files** for single functions or tiny utilities - add to existing related file
- **Max ~500 lines** per file - split if larger

## Import Conventions

```typescript
// Same directory
import { Something } from './something';

// Parent directory
import { PubSub } from '../pubsub';

// Type-only imports
import type { PubSubOptions } from './types';
```

## Reference

See `docs/project-structure.md` for complete directory structure, index file examples, and detailed directory explanations.
