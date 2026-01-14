# Rule: TypeScript Types and API Compatibility

## Purpose

Ensure all TypeScript types match the `@google-cloud/pubsub` API exactly for drop-in compatibility. Types must be compatible at the binary level - existing code using `@google-cloud/pubsub` should work with our implementation without type errors.

## Type Compatibility Principles

### 1. Match Official Types Exactly

```typescript
// From @google-cloud/pubsub research
// Our types must match these signatures exactly

// ✅ CORRECT
interface PubSubOptions {
  projectId?: string;
  apiEndpoint?: string;
  keyFilename?: string;
  credentials?: object;
}

// ❌ WRONG - Different property name
interface PubSubOptions {
  project?: string; // Should be projectId
}
```

### 2. Method Signatures Must Match

```typescript
// From @google-cloud/pubsub
// Topic.publishMessage signature:

// ✅ CORRECT
class Topic {
  publishMessage(message: PubSubMessage): Promise<string>;
}

// ❌ WRONG - Different return type
class Topic {
  publishMessage(message: PubSubMessage): Promise<number>; // Should be string
}

// ❌ WRONG - Additional required parameter
class Topic {
  publishMessage(message: PubSubMessage, options: object): Promise<string>;
}
```

### 3. Optional vs Required Parameters

```typescript
// ✅ CORRECT - Matches Google API
interface CreateSubscriptionOptions {
  ackDeadline?: number;        // Optional
  messageOrdering?: boolean;   // Optional
  flowControl?: {
    maxMessages?: number;      // Optional
  };
}

// ❌ WRONG - Required should be optional
interface CreateSubscriptionOptions {
  ackDeadline: number;         // Should be optional
}
```

### 4. Default Values

Document defaults in comments to match Google's behavior:

```typescript
interface BatchingOptions {
  maxMessages?: number;        // Default: 100
  maxMilliseconds?: number;    // Default: 10
  maxBytes?: number;           // Default: 1024 * 1024 (1MB)
}
```

## Core Type Definitions

### PubSub Options

```typescript
interface PubSubOptions {
  projectId?: string;
  apiEndpoint?: string;
  keyFilename?: string;
  credentials?: {
    client_email?: string;
    private_key?: string;
  };
}
```

### Topic Options

```typescript
interface CreateTopicOptions {
  schema?: string | Schema;
  messageRetentionDuration?: number;
  labels?: { [key: string]: string };
}

interface PublishOptions {
  batching?: {
    maxMessages?: number;        // Default: 100
    maxMilliseconds?: number;    // Default: 10
    maxBytes?: number;           // Default: 1024 * 1024
  };
  messageOrdering?: boolean;     // Default: false
  flowControlOptions?: {
    maxOutstandingMessages?: number;
    maxOutstandingBytes?: number;
  };
}
```

### Subscription Options

```typescript
interface SubscriptionOptions {
  flowControl?: {
    maxMessages?: number;        // Default: 1000
    maxBytes?: number;           // Default: 100 * 1024 * 1024
    allowExcessMessages?: boolean; // Default: false
  };
  ackDeadline?: number;          // Default: 60
  messageOrdering?: boolean;     // Default: false
  streamingOptions?: {
    maxStreams?: number;         // Default: 5
    highWaterMark?: number;      // Default: 0
  };
}

interface CreateSubscriptionOptions extends SubscriptionOptions {
  topic?: string | Topic;
  pushConfig?: PushConfig;
  deadLetterPolicy?: {
    deadLetterTopic?: string;
    maxDeliveryAttempts?: number; // Default: 5
  };
  retryPolicy?: {
    minimumBackoff?: number;
    maximumBackoff?: number;
  };
  filter?: string;
}
```

### Message Types

```typescript
interface PubSubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}

interface Attributes {
  [key: string]: string;
}

interface MessageProperties {
  readonly id: string;
  readonly ackId: string;
  readonly data: Buffer;
  readonly attributes: Attributes;
  readonly publishTime: Date;
  readonly orderingKey?: string;
  readonly deliveryAttempt?: number;
  readonly length: number;
}
```

### Schema Types

```typescript
enum SchemaType {
  AVRO = 'AVRO',
  PROTOCOL_BUFFER = 'PROTOCOL_BUFFER'
}

enum Encoding {
  BINARY = 'BINARY',
  JSON = 'JSON'
}

interface CreateSchemaOptions {
  definition?: string;
}
```

## Return Type Patterns

### Tuple Returns (Google Pattern)

Many Google Cloud APIs return tuples `[result, metadata, apiResponse]`:

```typescript
// ✅ CORRECT
class PubSub {
  createTopic(name: string): Promise<[Topic, any]>;
  getTopics(): Promise<[Topic[], any, any]>;
}

class Topic {
  create(): Promise<[Topic, any]>;
  getSubscriptions(): Promise<[Subscription[], any, any]>;
}

// ❌ WRONG - Don't simplify return types
class PubSub {
  createTopic(name: string): Promise<Topic>; // Missing metadata
}
```

### Promise<string> for IDs

```typescript
// ✅ CORRECT
class Topic {
  publishMessage(message: PubSubMessage): Promise<string>;
}

// ❌ WRONG
class Topic {
  publishMessage(message: PubSubMessage): Promise<number>;
}
```

### Promise<void> for Operations

```typescript
// ✅ CORRECT
class Topic {
  delete(): Promise<[any]>; // Google returns tuple with metadata
  flush(): Promise<void>;   // But flush returns void
}
```

## EventEmitter Types

Subscription extends EventEmitter with specific event types:

```typescript
// ✅ CORRECT
import { EventEmitter } from 'events';

class Subscription extends EventEmitter {
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;

  // Support generic overload for other events
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}
```

## Type Exports

All public types must be exported from main index:

```typescript
// src/index.ts
export { PubSub } from './pubsub';
export { Topic } from './topic';
export { Subscription } from './subscription';
export { Message } from './message';
export { Schema } from './schema';

// Export all type definitions
export type {
  PubSubOptions,
  PublishOptions,
  SubscriptionOptions,
  CreateSubscriptionOptions,
  PubSubMessage,
  Attributes,
  BatchingOptions,
  FlowControlOptions,
  SchemaType,
  Encoding
} from './types';
```

## Generic Types

Use generics sparingly and only when needed:

```typescript
// ✅ GOOD - When needed for flexibility
interface CallOptions<T> {
  timeout?: number;
  retry?: RetryOptions;
  autoPaginate?: boolean;
}

// ❌ BAD - Unnecessary generic
interface Message<T> { // Message doesn't need to be generic
  data: T;
}
```

## Type Inference

Let TypeScript infer types where obvious, but always explicit for public APIs:

```typescript
// ✅ GOOD - Inference for internal
private messages = new Map<string, Message>(); // Inferred Map type

// ✅ GOOD - Explicit for public
public publishMessage(message: PubSubMessage): Promise<string> {
  // Implementation
}

// ❌ BAD - Missing type on public method
public publishMessage(message) { // Implicit any
  // Implementation
}
```

## Compatibility Testing

Create type-compatibility tests:

```typescript
// tests/compatibility/types.test.ts
import { expectType } from 'tsd';
import { PubSub, Topic, Message } from '../src';

// Test type compatibility
const pubsub = new PubSub({ projectId: 'test' });
expectType<PubSub>(pubsub);

const topic = pubsub.topic('test');
expectType<Topic>(topic);

// Test method signatures
const publishPromise = topic.publishMessage({
  data: Buffer.from('test')
});
expectType<Promise<string>>(publishPromise);
```

## Type Documentation

Use JSDoc for additional type information:

```typescript
/**
 * Publishes a message to the topic.
 *
 * @param message - The message to publish
 * @returns Promise that resolves with the message ID
 *
 * @example
 * ```typescript
 * const messageId = await topic.publishMessage({
 *   data: Buffer.from('Hello World'),
 *   attributes: { key: 'value' }
 * });
 * ```
 */
publishMessage(message: PubSubMessage): Promise<string> {
  // Implementation
}
```

## Common Type Patterns

### Callback Style (Legacy Support)

Google APIs support both Promise and callback styles:

```typescript
// ✅ Support both patterns
function publish(data: Buffer): Promise<string>;
function publish(data: Buffer, callback: Callback<string>): void;
function publish(
  data: Buffer,
  callback?: Callback<string>
): Promise<string> | void {
  if (callback) {
    // Callback style
    this.publishAsync(data)
      .then(id => callback(null, id))
      .catch(err => callback(err));
    return;
  }
  // Promise style
  return this.publishAsync(data);
}
```

### Overloaded Methods

```typescript
// ✅ CORRECT - Multiple signatures
class Subscription {
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}

// ❌ WRONG - Single generic signature loses type safety
class Subscription {
  on(event: string, listener: Function): this;
}
```

## Type Guards

Implement type guards for runtime type checking:

```typescript
// ✅ GOOD
export function isPubSubMessage(value: unknown): value is PubSubMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Buffer.isBuffer((value as PubSubMessage).data)
  );
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
```

## Best Practices

1. **Reference research docs** - Check `research/11-typescript-types.md` for official types
2. **Match exactly** - Don't "improve" Google's API, match it exactly
3. **Tuple returns** - Use `[result, metadata]` pattern for admin operations
4. **Explicit public types** - All public methods have explicit return types
5. **Export all types** - Users need access to all types for their code
6. **Type guards** - Provide runtime type checking utilities
7. **JSDoc comments** - Document complex types and methods
8. **Test compatibility** - Write tests that verify type compatibility
9. **Readonly where appropriate** - Message properties should be readonly
10. **Const assertions** - Use `as const` for literal types

## Verification

Before committing, verify type compatibility:

```bash
# TypeScript compilation
bun run tsc --noEmit

# Type tests (if using tsd)
bun run tsd

# Run type compatibility tests
bun test tests/compatibility/types.test.ts
```

All types must match `@google-cloud/pubsub` exactly for API compatibility.
