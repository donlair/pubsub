# Google Pub/Sub API Compatibility Reference

This document provides detailed patterns, examples, and reference information for maintaining 100% API compatibility with `@google-cloud/pubsub` v5.2.0+.

## Table of Contents

- [Core Requirements with Examples](#core-requirements-with-examples)
- [Default Values Reference](#default-values-reference)
- [Key Patterns Detail](#key-patterns-detail)
- [Testing Compatibility](#testing-compatibility)
- [Migration Example](#migration-example)
- [API Surface References](#api-surface-references)

## Core Requirements with Examples

### 1. Match Signatures Exactly

Every public method, property, and return type must match Google's API precisely.

```typescript
// ✅ CORRECT - Matches Google API
class Topic {
  publishMessage(message: PubSubMessage): Promise<string>
}

// ❌ WRONG - Added optional parameter not in Google API
class Topic {
  publishMessage(message: PubSubMessage, options?: PublishOptions): Promise<string>
}

// ❌ WRONG - Changed return type
class Topic {
  publishMessage(message: PubSubMessage): Promise<number>
}
```

### 2. Match Default Values

All configuration defaults must match Google's exact values.

```typescript
// Batching defaults
const DEFAULT_BATCHING = {
  maxMessages: 100,         // Batch after 100 messages
  maxMilliseconds: 10,      // Batch after 10ms
  maxBytes: 1024 * 1024     // Batch after 1MB
};

// Flow control defaults
const DEFAULT_FLOW_CONTROL = {
  maxMessages: 1000,                // Max 1000 messages in flight
  maxBytes: 100 * 1024 * 1024       // Max 100MB in flight
};

// Subscription defaults
const DEFAULT_ACK_DEADLINE = 60;    // 60 seconds
const DEFAULT_MAX_MESSAGES = 1000;  // Pull batch size
```

### 3. Use gRPC Error Codes

All errors must use standard gRPC status codes.

```typescript
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

// Examples
throw new PubSubError('Topic not found', ErrorCode.NOT_FOUND);
throw new PubSubError('Invalid message data', ErrorCode.INVALID_ARGUMENT);
throw new PubSubError('Flow control limit exceeded', ErrorCode.RESOURCE_EXHAUSTED);
```

### 4. Admin Operations Return Tuples

Administrative operations follow Google's pattern of returning `[result, metadata]` tuples.

```typescript
// ✅ CORRECT - Google pattern with tuple
class PubSub {
  createTopic(name: string): Promise<[Topic, any]>
  getTopic(name: string): Promise<[Topic, any]>
  getTopics(): Promise<[Topic[], any, any]>

  createSubscription(name: string, options?: SubscriptionOptions): Promise<[Subscription, any]>
  getSubscriptions(): Promise<[Subscription[], any, any]>
}

// Usage example
const [topic, metadata] = await pubsub.createTopic('my-topic');
const [topics, nextQuery, response] = await pubsub.getTopics();

// ❌ WRONG - Simplified return without tuple
createTopic(name: string): Promise<Topic>
```

### 5. EventEmitter Type Overloads

Subscription class must provide type-safe event overloads matching Google's API.

```typescript
class Subscription extends EventEmitter {
  // Typed overloads for each event
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;

  // Generic fallback
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  // Repeat for once, removeListener, etc.
  once(event: 'message', listener: (message: Message) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

// Type-safe usage
subscription.on('message', (message) => {
  // TypeScript knows message is Message type
  console.log(message.id);
});

subscription.on('error', (error) => {
  // TypeScript knows error is Error type
  console.error(error.message);
});
```

## Default Values Reference

| Configuration | Parameter | Default Value | Description |
|---------------|-----------|---------------|-------------|
| **Batching** | maxMessages | 100 | Max messages per batch |
| | maxMilliseconds | 10 | Max wait time (ms) |
| | maxBytes | 1048576 | Max batch size (1MB) |
| **Flow Control** | maxMessages | 1000 | Max in-flight messages |
| | maxBytes | 104857600 | Max in-flight bytes (100MB) |
| **Subscription** | ackDeadline | 60 | Ack deadline (seconds) |
| | maxMessages | 1000 | Pull batch size |
| | streamingOptions.maxStreams | 1 | Concurrent streams |
| **Publisher** | gaxOpts.timeout | 60000 | Publish timeout (ms) |

## Key Patterns Detail

### Resource Naming

All resources use fully-qualified names with project ID.

```typescript
// Pattern: projects/${projectId}/topics/${topicId}
const fullTopicName = `projects/my-project/topics/my-topic`;

// Pattern: projects/${projectId}/subscriptions/${subscriptionId}
const fullSubscriptionName = `projects/my-project/subscriptions/my-sub`;

// Implementation example
class Topic {
  private fullName: string;

  constructor(pubsub: PubSub, name: string) {
    // Auto-qualify if not already qualified
    if (name.includes('/')) {
      this.fullName = name;
    } else {
      this.fullName = `projects/${pubsub.projectId}/topics/${name}`;
    }
  }
}
```

### Batching Triggers

Messages are batched and flushed when **any** condition is met (first wins).

```typescript
interface BatchingOptions {
  maxMessages?: number;      // Trigger: batch size reaches this count
  maxMilliseconds?: number;  // Trigger: time since first message in batch
  maxBytes?: number;         // Trigger: total byte size reaches this
}

// Example: Batch flushes when ANY condition met
class BatchPublisher {
  private batch: PubSubMessage[] = [];
  private batchBytes = 0;
  private batchTimer: Timer | null = null;

  addMessage(message: PubSubMessage): void {
    this.batch.push(message);
    this.batchBytes += message.data.length;

    // Start timer on first message
    if (this.batch.length === 1) {
      this.batchTimer = setTimeout(
        () => this.flush(),
        this.options.maxMilliseconds
      );
    }

    // Check if any limit reached
    if (this.batch.length >= this.options.maxMessages ||
        this.batchBytes >= this.options.maxBytes) {
      this.flush();
    }
  }
}
```

### Flow Control

Subscriber pauses when **any** limit is exceeded (blocks until capacity available).

```typescript
interface FlowControlOptions {
  maxMessages?: number;  // Max messages in flight
  maxBytes?: number;     // Max bytes in flight
}

// Example: Block when ANY limit exceeded
class MessageStream {
  private inFlightMessages = 0;
  private inFlightBytes = 0;

  private async pullLoop(): Promise<void> {
    while (this.isActive) {
      // Wait if at capacity
      if (this.inFlightMessages >= this.flowControl.maxMessages ||
          this.inFlightBytes >= this.flowControl.maxBytes) {
        await this.waitForCapacity();
      }

      await this.pullMessages();
    }
  }

  private async waitForCapacity(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.inFlightMessages < this.flowControl.maxMessages &&
            this.inFlightBytes < this.flowControl.maxBytes) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}
```

### Message Ordering

Messages with the same `orderingKey` are delivered sequentially; different keys are concurrent.

```typescript
class MessageStream {
  private orderingKeyLocks = new Map<string, Promise<void>>();

  private async emitMessage(message: Message): Promise<void> {
    const key = message.orderingKey;

    if (key && this.options.messageOrdering) {
      // Sequential: Wait for previous message with same key
      const previousPromise = this.orderingKeyLocks.get(key) || Promise.resolve();

      const currentPromise = previousPromise.then(() => {
        return new Promise<void>(resolve => {
          this.subscription.emit('message', message);

          // Resolve when acked or nacked
          const cleanup = () => resolve();
          message.once('ack', cleanup);
          message.once('nack', cleanup);
        });
      });

      this.orderingKeyLocks.set(key, currentPromise);
      await currentPromise;

      // Clean up completed promise
      if (this.orderingKeyLocks.get(key) === currentPromise) {
        this.orderingKeyLocks.delete(key);
      }
    } else {
      // Concurrent: Emit immediately
      setImmediate(() => {
        this.subscription.emit('message', message);
      });
    }
  }
}

// Example usage
await topic.publishMessage({
  data: Buffer.from('Message 1'),
  orderingKey: 'user-123'  // Sequential with other user-123 messages
});

await topic.publishMessage({
  data: Buffer.from('Message 2'),
  orderingKey: 'user-456'  // Concurrent with user-123 messages
});
```

## Testing Compatibility

### Test Return Types

```typescript
test('createTopic returns tuple', async () => {
  const result = await pubsub.createTopic('test');
  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(2);
  expect(result[0]).toBeInstanceOf(Topic);
});

test('getTopics returns triple', async () => {
  const [topics, nextQuery, response] = await pubsub.getTopics();
  expect(Array.isArray(topics)).toBe(true);
  expect(nextQuery).toBeDefined();
  expect(response).toBeDefined();
});
```

### Test Event Types

```typescript
test('Subscription has correct event types', () => {
  const sub = pubsub.subscription('test');

  // Should compile and have correct types
  sub.on('message', (msg) => {
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('data');
    expect(msg).toHaveProperty('ack');
  });

  sub.on('error', (err) => {
    expect(err).toBeInstanceOf(Error);
  });

  sub.on('close', () => {
    expect(true).toBe(true);
  });
});
```

### Test Error Codes

```typescript
test('NotFoundError has correct gRPC code', async () => {
  try {
    await pubsub.getTopic('non-existent');
    fail('Should have thrown');
  } catch (error: any) {
    expect(error.code).toBe(5); // NOT_FOUND
  }
});

test('InvalidArgumentError has correct gRPC code', async () => {
  try {
    await topic.publishMessage({ data: 'invalid' as any });
    fail('Should have thrown');
  } catch (error: any) {
    expect(error.code).toBe(3); // INVALID_ARGUMENT
  }
});
```

### Test Default Values

```typescript
test('Publisher uses Google default batching', () => {
  const topic = pubsub.topic('test');
  const publishOptions = topic.getPublishOptions();

  expect(publishOptions.batching.maxMessages).toBe(100);
  expect(publishOptions.batching.maxMilliseconds).toBe(10);
  expect(publishOptions.batching.maxBytes).toBe(1024 * 1024);
});

test('Subscription uses Google default flow control', async () => {
  const [sub] = await pubsub.createSubscription('test-sub');

  expect(sub.flowControl.maxMessages).toBe(1000);
  expect(sub.flowControl.maxBytes).toBe(100 * 1024 * 1024);
  expect(sub.ackDeadline).toBe(60);
});
```

### Test Method Signatures

```typescript
test('Topic.publishMessage signature matches Google', async () => {
  const topic = pubsub.topic('test');
  await topic.create();

  // Should accept exact Google API message format
  const messageId = await topic.publishMessage({
    data: Buffer.from('test'),
    attributes: { key: 'value' },
    orderingKey: 'key-1'
  });

  expect(typeof messageId).toBe('string');
});

test('Message class has Google API methods', async () => {
  const sub = pubsub.subscription('test-sub');
  await sub.create();

  let message: Message | null = null;

  sub.on('message', (msg) => {
    message = msg;
  });

  sub.open();
  await topic.publishMessage({ data: Buffer.from('test') });
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(message).not.toBeNull();
  expect(typeof message!.ack).toBe('function');
  expect(typeof message!.nack).toBe('function');
  expect(typeof message!.modifyAckDeadline).toBe('function');
});
```

## Migration Example

Existing Google Pub/Sub code should work with only an import change.

### Before (Google Cloud)

```typescript
import { PubSub, Topic, Subscription, Message } from '@google-cloud/pubsub';

// Create client
const pubsub = new PubSub({
  projectId: 'my-project',
  keyFilename: './service-account.json'
});

// Create topic
const [topic] = await pubsub.createTopic('my-topic');

// Configure batching
topic.setPublishOptions({
  batching: {
    maxMessages: 100,
    maxMilliseconds: 10
  }
});

// Publish messages
const messageId = await topic.publishMessage({
  data: Buffer.from('Hello World'),
  attributes: { source: 'app' }
});

// Create subscription
const [subscription] = await topic.createSubscription('my-sub', {
  ackDeadline: 60,
  flowControl: {
    maxMessages: 1000
  }
});

// Handle messages
subscription.on('message', (message: Message) => {
  console.log(`Received: ${message.data.toString()}`);
  console.log('Attributes:', message.attributes);
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Error:', error);
});

subscription.open();
```

### After (Local Pub/Sub)

```typescript
// ONLY CHANGE: Import from local library
import { PubSub, Topic, Subscription, Message } from '@local/pubsub';

// Everything else IDENTICAL
const pubsub = new PubSub({
  projectId: 'my-project',
  keyFilename: './service-account.json'
});

const [topic] = await pubsub.createTopic('my-topic');

topic.setPublishOptions({
  batching: {
    maxMessages: 100,
    maxMilliseconds: 10
  }
});

const messageId = await topic.publishMessage({
  data: Buffer.from('Hello World'),
  attributes: { source: 'app' }
});

const [subscription] = await topic.createSubscription('my-sub', {
  ackDeadline: 60,
  flowControl: {
    maxMessages: 1000
  }
});

subscription.on('message', (message: Message) => {
  console.log(`Received: ${message.data.toString()}`);
  console.log('Attributes:', message.attributes);
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Error:', error);
});

subscription.open();
```

## API Surface References

### PubSub Client

Complete API details in `research/01-pubsub-client.md`.

Key methods:
- `constructor(options?: PubSubOptions)`
- `createTopic(name: string): Promise<[Topic, any]>`
- `topic(name: string): Topic`
- `getTopic(name: string): Promise<[Topic, any]>`
- `getTopics(): Promise<[Topic[], any, any]>`
- `createSubscription(name: string, options?: SubscriptionOptions): Promise<[Subscription, any]>`
- `subscription(name: string, options?: SubscriptionOptions): Subscription`
- `getSubscriptions(): Promise<[Subscription[], any, any]>`

### Topic Class

Complete API details in `research/02-topic-api.md` (17 methods).

Key methods:
- `create(): Promise<[Topic, any]>`
- `delete(): Promise<void>`
- `exists(): Promise<boolean>`
- `get(): Promise<[Topic, any]>`
- `publishMessage(message: PubSubMessage): Promise<string>`
- `setPublishOptions(options: PublishOptions): void`
- `createSubscription(name: string, options?: SubscriptionOptions): Promise<[Subscription, any]>`
- `subscription(name: string, options?: SubscriptionOptions): Subscription`
- `getSubscriptions(): Promise<[Subscription[], any, any]>`

### Subscription Class

Complete API details in `research/03-subscription-api.md` (14 methods).

Key methods:
- `create(options?: SubscriptionOptions): Promise<[Subscription, any]>`
- `delete(): Promise<void>`
- `exists(): Promise<boolean>`
- `get(): Promise<[Subscription, any]>`
- `open(): void`
- `close(): Promise<void>`
- `on(event: 'message', listener: (message: Message) => void): this`
- `on(event: 'error', listener: (error: Error) => void): this`
- `on(event: 'close', listener: () => void): this`

### Message Class

Complete API details in `research/04-message-api.md`.

Key properties and methods:
- `id: string`
- `ackId: string`
- `data: Buffer`
- `attributes: Attributes`
- `publishTime: Date`
- `orderingKey?: string`
- `ack(): void`
- `nack(): void`
- `modifyAckDeadline(deadline: number): void`

## What Can Differ

### ✅ OK to Differ

These aspects can be implemented differently from Google Cloud Pub/Sub:

- **Internal data structures** - Use any data structures for internal state (Map, Array, custom classes)
- **Algorithms** - Use any algorithms for routing, batching, ordering (as long as behavior matches)
- **Storage mechanism** - In-memory, SQLite, Redis, etc. (we use in-memory)
- **Performance characteristics** - Latency, throughput, memory usage can differ
- **Private methods/properties** - Any private implementation details
- **Internal helpers** - Any utility functions not exposed in public API
- **Network layer** - No actual gRPC calls (we use in-process message queue)

### ❌ Must Match Exactly

These aspects must match Google Cloud Pub/Sub precisely:

- **Public API signatures** - All method names, parameters, return types
- **Method names** - Exact spelling and casing (e.g., `publishMessage` not `publish`)
- **Property names** - Exact spelling and casing (e.g., `ackDeadline` not `ackTimeout`)
- **Return types** - Including tuple returns for admin operations
- **Error codes** - Use gRPC status codes
- **Default values** - All configuration defaults (batching, flow control, ack deadline)
- **Event names** - Exact event names ('message', 'error', 'close')
- **Behavior guarantees** - Message ordering, flow control blocking, at-least-once delivery

## Reference Sources

When verifying API compatibility, consult these sources in order:

1. **`research/` folder** - Verified API details specific to this project
   - `research/01-pubsub-client.md` - PubSub class
   - `research/02-topic-api.md` - Topic class
   - `research/03-subscription-api.md` - Subscription class
   - `research/04-message-api.md` - Message class

2. **Official documentation** - [googleapis.dev/nodejs/pubsub](https://googleapis.dev/nodejs/pubsub/latest/)
   - Method signatures and descriptions
   - Configuration options
   - Usage examples

3. **Type definitions** - `@google-cloud/pubsub` package TypeScript types
   - Install: `bun add -D @google-cloud/pubsub`
   - View: `node_modules/@google-cloud/pubsub/build/src/*.d.ts`

**Always prefer matching exactly over "improving" the API.**

## Verification Checklist

Before committing code, verify:

- [ ] TypeScript compiles: `bun run tsc --noEmit`
- [ ] All tests pass: `bun test`
- [ ] Compatibility tests pass: `bun test tests/compatibility/`
- [ ] Method signatures match Google API
- [ ] Default values match Google defaults
- [ ] Error codes use gRPC status codes
- [ ] Admin operations return tuples
- [ ] EventEmitter has type overloads
- [ ] Resource names use full paths
- [ ] Batching triggers on first limit met
- [ ] Flow control blocks when any limit exceeded
- [ ] Message ordering works per orderingKey
