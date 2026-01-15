# Rule: Google Pub/Sub API Compatibility

## Purpose

Ensure 100% API compatibility with `@google-cloud/pubsub` v5.2.0+. This library must be a drop-in replacement - existing code using Google's library should work without modification.

**The goal is 100% compatibility, not improvement.**

## Core Requirements

1. **Match signatures exactly** - All public methods, properties, return types must match Google's API precisely
2. **Match default values** - Batching (100, 10ms, 1MB), flow control (1000, 100MB), ack deadline (60s)
3. **Use gRPC error codes** - All errors use standard gRPC status codes (NOT_FOUND=5, INVALID_ARGUMENT=3, etc.)
4. **Admin operations return tuples** - `createTopic()` returns `[Topic, any]`, `getTopics()` returns `[Topic[], any, any]`
5. **EventEmitter type overloads** - Subscription provides type-safe event methods for 'message', 'error', 'close'

## Key Patterns

- **Resource naming**: `projects/${projectId}/topics/${topicId}`
- **Batching triggers**: maxMessages OR maxBytes OR maxMilliseconds (first met)
- **Flow control**: Block when maxMessages OR maxBytes exceeded
- **Ordering**: Sequential per orderingKey, concurrent across keys

## What Can Differ

### ✅ OK to Differ
- Internal data structures, algorithms, storage mechanism
- Performance characteristics
- Private methods/properties, internal helpers

### ❌ Must Match Exactly
- Public API signatures, method/property names
- Return types, error codes, default values
- Event names, behavior guarantees

## Migration

Existing Google Pub/Sub code should work with only import change:

```typescript
// Before: import { PubSub } from '@google-cloud/pubsub';
// After:  import { PubSub } from '@local/pubsub';
```

## Reference Sources

1. **`research/` folder** - Verified API details for this project
2. **Official docs** - [googleapis.dev/nodejs/pubsub](https://googleapis.dev/nodejs/pubsub/latest/)
3. **Type definitions** - `@google-cloud/pubsub` package types

When uncertain, check `research/` first, then Google's docs. Always prefer matching exactly over "improving" the API.

**See `docs/google-api-compatibility.md` for detailed patterns, examples, and testing.**

## Verification

```bash
bun run tsc --noEmit           # Must compile
bun test tests/compatibility/  # All compatibility tests pass
```
