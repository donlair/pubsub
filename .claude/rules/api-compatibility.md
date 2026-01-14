# Rule: Google Pub/Sub API Compatibility

## Purpose

Ensure 100% API compatibility with `@google-cloud/pubsub` v5.2.0+. This library must be a drop-in replacement - existing code using Google's library should work without modification.

## Compatibility Requirements

### 1. Exact Method Signatures

Every public method must match Google's API exactly:

```typescript
// ✅ CORRECT - Matches Google API
class Topic {
  publishMessage(message: PubSubMessage): Promise<string> {
    // Implementation
  }
}

// ❌ WRONG - Different signature
class Topic {
  publishMessage(message: PubSubMessage, options?: PublishOptions): Promise<string> {
    // Added optional parameter not in Google API
  }
}
```

### 2. Property Names and Types

All properties must match:

```typescript
// ✅ CORRECT
interface Message {
  readonly id: string;
  readonly ackId: string;
  readonly data: Buffer;
  readonly attributes: { [key: string]: string };
  readonly publishTime: Date;
  readonly orderingKey?: string;
}

// ❌ WRONG - Different property names
interface Message {
  readonly messageId: string;  // Should be 'id'
  readonly timestamp: Date;    // Should be 'publishTime'
}
```

### 3. Default Values

Match Google's default values exactly:

```typescript
// ✅ CORRECT - Google's defaults
const DEFAULT_BATCHING = {
  maxMessages: 100,
  maxMilliseconds: 10,
  maxBytes: 1024 * 1024  // 1MB
};

const DEFAULT_FLOW_CONTROL = {
  maxMessages: 1000,
  maxBytes: 100 * 1024 * 1024  // 100MB
};

const DEFAULT_ACK_DEADLINE = 60; // seconds
```

### 4. Return Types

Match return types exactly, including tuple patterns:

```typescript
// ✅ CORRECT - Google returns tuples for admin operations
class PubSub {
  createTopic(name: string): Promise<[Topic, any]> {
    // Implementation
  }
}

// ❌ WRONG - Simplified return type
class PubSub {
  createTopic(name: string): Promise<Topic> {
    // Missing metadata in return tuple
  }
}
```

### 5. Error Codes

Use Google Cloud error codes (gRPC status codes):

```typescript
// ✅ CORRECT - Google Cloud error codes
enum ErrorCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16
}

class PubSubError extends Error {
  constructor(message: string, public code: number) {
    super(message);
  }
}

// Throw with correct codes
throw new PubSubError('Topic not found', 5); // NOT_FOUND
throw new PubSubError('Already exists', 6); // ALREADY_EXISTS
```

## API Surface Checklist

### PubSub Client

Must implement all methods from `research/01-pubsub-client.md`:

```typescript
class PubSub {
  constructor(options?: PubSubOptions);

  // Topic methods
  topic(name: string): Topic;
  createTopic(name: string, options?: CreateTopicOptions): Promise<[Topic, any]>;
  getTopic(name: string): Promise<[Topic, any]>;
  getTopics(options?: GetTopicsOptions): Promise<[Topic[], any, any]>;

  // Subscription methods
  subscription(name: string, options?: SubscriptionOptions): Subscription;
  createSubscription(topic: string | Topic, name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, any]>;
  getSubscription(name: string): Promise<[Subscription, any]>;
  getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], any, any]>;

  // Schema methods
  createSchema(schemaId: string, type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, any]>;
  schema(id: string): Schema;

  // Properties
  projectId: string;
  isEmulator: boolean;
}
```

### Topic (17 methods from research)

Must implement all from `research/02-topic-api.md`:

```typescript
class Topic {
  // Publishing methods
  publish(data: Buffer, attributes?: Attributes): Promise<string>;
  publishMessage(message: PubSubMessage): Promise<string>;
  publishJSON(json: object, attributes?: Attributes): Promise<string>;
  setPublishOptions(options: PublishOptions): void;
  flush(): Promise<void>;

  // Lifecycle methods
  create(options?: CreateTopicOptions): Promise<[Topic, any]>;
  delete(): Promise<[any]>;
  exists(): Promise<[boolean]>;
  get(options?: GetTopicOptions): Promise<[Topic, any]>;
  getMetadata(): Promise<[any]>;
  setMetadata(metadata: any): Promise<[any]>;

  // Subscription methods
  createSubscription(name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, any]>;
  subscription(name: string, options?: SubscriptionOptions): Subscription;
  getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], any, any]>;

  // Properties
  name: string;
  publisher: any; // Internal Publisher instance
}
```

### Subscription (14 methods from research)

Must implement all from `research/03-subscription-api.md`:

```typescript
class Subscription extends EventEmitter {
  // Lifecycle methods
  create(options?: CreateSubscriptionOptions): Promise<[Subscription, any]>;
  delete(): Promise<[any]>;
  exists(): Promise<[boolean]>;
  get(options?: GetOptions): Promise<[Subscription, any]>;
  getMetadata(): Promise<[any]>;
  setMetadata(metadata: any): Promise<[any]>;

  // Message handling
  open(): void;
  close(): Promise<void>;

  // Configuration
  setOptions(options: SubscriptionOptions): void;

  // Advanced methods
  seek(snapshot: string | Date): Promise<[any]>;
  createSnapshot(name: string): Promise<[any, any]>;
  modifyPushConfig(config: any): Promise<[any]>;

  // Properties
  name: string;
  topic?: Topic | string;
  isOpen: boolean;

  // Events
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}
```

### Message

Must implement all from `research/04-message-api.md`:

```typescript
class Message {
  // Properties (all readonly)
  readonly id: string;
  readonly ackId: string;
  readonly data: Buffer;
  readonly attributes: { [key: string]: string };
  readonly publishTime: Date;
  readonly orderingKey?: string;
  readonly deliveryAttempt?: number;
  readonly length: number;

  // Methods
  ack(): void;
  nack(): void;
  modifyAckDeadline(seconds: number): void;
}
```

## Behavior Compatibility

### 1. Resource Naming

Follow Google's resource naming convention:

```typescript
// ✅ CORRECT
const topicName = `projects/${projectId}/topics/${topicId}`;
const subscriptionName = `projects/${projectId}/subscriptions/${subscriptionId}`;

// ❌ WRONG - Simplified names
const topicName = topicId;
```

### 2. Batching Behavior

Match Google's batching:

```typescript
// ✅ CORRECT - Batch triggers
const shouldPublish =
  messages.length >= maxMessages ||          // Count threshold
  totalBytes >= maxBytes ||                   // Size threshold
  (Date.now() - batchStartTime) >= maxMilliseconds; // Time threshold

// First condition met triggers batch publish
```

### 3. Flow Control

Match Google's flow control:

```typescript
// ✅ CORRECT - Check both messages and bytes
const canPull =
  inFlightMessages < maxMessages &&
  inFlightBytes < maxBytes;

// Block pulling when either limit exceeded
```

### 4. Ordering Guarantees

Match Google's ordering:

```typescript
// ✅ CORRECT - Sequential per ordering key
// Messages with same orderingKey delivered in order
// Messages with different keys can be concurrent
// Messages without orderingKey delivered immediately
```

## Testing Compatibility

Write compatibility tests that verify API matches:

```typescript
// tests/compatibility/google-api-compat.test.ts

test('PubSub constructor accepts same options as Google', () => {
  // Should accept all Google options
  const pubsub = new PubSub({
    projectId: 'test-project',
    keyFilename: '/path/to/key.json',
    apiEndpoint: 'localhost:8085',
    credentials: { /* ... */ }
  });

  expect(pubsub).toBeDefined();
});

test('Topic.publishMessage returns string Promise', async () => {
  const topic = pubsub.topic('test');
  await topic.create();

  const messageId = await topic.publishMessage({
    data: Buffer.from('test')
  });

  // Must return string, not number or object
  expect(typeof messageId).toBe('string');
});

test('createTopic returns tuple like Google', async () => {
  const result = await pubsub.createTopic('test-topic');

  // Must be array with Topic and metadata
  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(2);
  expect(result[0]).toBeInstanceOf(Topic);
});

test('Subscription emits correct event types', async () => {
  const subscription = pubsub.subscription('test-sub');

  // Should accept these event types without errors
  subscription.on('message', (msg) => {});
  subscription.on('error', (err) => {});
  subscription.on('close', () => {});
});
```

## Migration from Google Pub/Sub

Code using Google's library should work with just import change:

```typescript
// Before - Using Google's library
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({ projectId: 'my-project' });
const topic = pubsub.topic('my-topic');
await topic.publishMessage({ data: Buffer.from('Hello') });

// After - Using our library (ONLY IMPORT CHANGES)
import { PubSub } from '@local/pubsub';

const pubsub = new PubSub({ projectId: 'my-project' });
const topic = pubsub.topic('my-topic');
await topic.publishMessage({ data: Buffer.from('Hello') });
// Everything else identical!
```

## What Can Be Different

Only internal implementation can differ:

### ✅ OK to Differ
- Internal data structures
- Implementation algorithms
- Storage mechanism (in-memory vs cloud)
- Performance characteristics
- Internal helper functions
- Private methods and properties

### ❌ Must Match Exactly
- Public API signatures
- Method names
- Property names
- Return types
- Error codes
- Default values
- Event names
- Behavior guarantees

## Reference Documentation

Always check these sources:

1. **Research folder** - `research/` contains verified API details
2. **Official docs** - [Google Cloud Pub/Sub Node.js Client](https://googleapis.dev/nodejs/pubsub/latest/)
3. **Type definitions** - `@google-cloud/pubsub` package types
4. **Examples** - Official Google examples in documentation

## Compatibility Verification

Before committing:

```bash
# TypeScript should compile with no errors
bun run tsc --noEmit

# Run compatibility tests
bun test tests/compatibility/

# Verify against real usage patterns
bun test tests/integration/
```

## Best Practices

1. **Consult research first** - Check `research/` before implementing
2. **Match exactly** - Don't "improve" or "simplify" Google's API
3. **Test compatibility** - Write tests that verify API matches
4. **Use correct defaults** - Match Google's default values
5. **Follow naming conventions** - Use Google's resource naming
6. **Error codes** - Use gRPC status codes
7. **Return types** - Match tuple patterns for admin operations
8. **Events** - Use same event names and signatures
9. **Deprecations** - Support deprecated methods if Google does
10. **Documentation** - Reference Google's docs in comments

## When in Doubt

If uncertain about any API detail:

1. Check `research/` folder documentation
2. Consult official Google Cloud Pub/Sub Node.js docs
3. Look at `@google-cloud/pubsub` TypeScript types
4. Test with real Google Pub/Sub API if possible
5. Prefer matching Google exactly over "better" alternatives

**The goal is 100% compatibility, not improvement.**
