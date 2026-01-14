# Specification: Topic

## Purpose

The Topic class represents a Pub/Sub topic. It provides methods for publishing messages and managing topic lifecycle. Topics delegate actual publishing to a Publisher instance that handles batching and flow control.

## API Surface

### Constructor

```typescript
class Topic {
  constructor(pubsub: PubSub, name: string)
}
```

### Properties

```typescript
name: string;                    // Fully-qualified topic name
publisher: Publisher;            // Associated publisher instance
metadata?: TopicMetadata;
```

### Methods

#### Publishing Methods

```typescript
publish(data: Buffer, attributes?: Attributes): Promise<string>
publishMessage(message: PubSubMessage): Promise<string>
publishJSON(json: object, attributes?: Attributes): Promise<string>
setPublishOptions(options: PublishOptions): void
getPublishOptionDefaults(): PublishOptions
flush(): Promise<void>
flowControlled(): FlowControlledPublisher
resumePublishing(orderingKey: string): void
```

#### Lifecycle Methods

```typescript
create(options?: CreateTopicOptions): Promise<[Topic, any]>
delete(): Promise<[any]>
exists(): Promise<[boolean]>
get(options?: GetTopicOptions): Promise<[Topic, any]>
getMetadata(): Promise<[TopicMetadata]>
setMetadata(metadata: TopicMetadata): Promise<[any]>
```

#### Subscription Methods

```typescript
createSubscription(name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, any]>
subscription(name: string, options?: SubscriptionOptions): Subscription
getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], any, any]>
```

### Type Definitions

```typescript
interface PubSubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}

interface Attributes {
  [key: string]: string;
}

interface PublishOptions {
  batching?: {
    maxMessages?: number;        // Default: 100
    maxMilliseconds?: number;    // Default: 10
    maxBytes?: number;           // Default: 1024 * 1024 (1MB)
  };
  messageOrdering?: boolean;     // Default: false
  flowControlOptions?: {
    maxOutstandingMessages?: number;
    maxOutstandingBytes?: number;
  };
  gaxOpts?: CallOptions;         // gRPC and retry configuration
  enableOpenTelemetryTracing?: boolean; // Default: false
}

interface CreateTopicOptions {
  messageStoragePolicy?: MessageStoragePolicy;
  schemaSettings?: SchemaSettings;
  labels?: { [key: string]: string };
  messageRetentionDuration?: Duration;
}

interface MessageStoragePolicy {
  allowedPersistenceRegions?: string[];
}

interface SchemaSettings {
  schema?: string;
  encoding?: 'JSON' | 'BINARY';
}

interface Duration {
  seconds?: number;
  nanos?: number;
}
```

## Behavior Requirements

### BR-001: Topic Creation
**Given** a Topic instance is created
**When** `create()` is called
**Then** the topic is registered in the MessageQueue
**And** metadata is stored
**And** exists() returns true

### BR-002: Publish Message
**Given** a topic exists
**When** `publishMessage({data, attributes})` is called
**Then** the message is sent to the Publisher for batching
**And** a Promise<string> is returned with the message ID
**And** the message ID is a unique identifier

### BR-003: Publish with Attributes
**Given** a topic exists
**When** publishing with attributes
**Then** all attribute keys must be strings
**And** all attribute values must be strings
**And** attributes are delivered with the message

### BR-004: Publish JSON
**Given** a topic exists
**When** `publishJSON(object)` is called
**Then** the object is serialized to JSON
**And** published as Buffer with data = JSON.stringify(object)

### BR-005: Batching Behavior
**Given** batching is enabled (default)
**When** multiple messages are published quickly
**Then** messages are accumulated until batch threshold is reached
**And** batch publishes when maxMessages OR maxMilliseconds OR maxBytes is reached
**And** all messages in batch are published atomically

### BR-006: Message Ordering
**Given** messageOrdering is enabled
**When** messages with same orderingKey are published
**Then** they are delivered in order to subscribers
**And** messages without orderingKey are delivered as soon as possible

### BR-007: Flush Behavior
**Given** messages are batched
**When** `flush()` is called
**Then** all pending batches are published immediately
**And** Promise resolves when all publishes complete

### BR-008: Topic Deletion
**Given** a topic exists with subscriptions
**When** `delete()` is called
**Then** the topic is removed from MessageQueue
**And** all subscriptions are detached (but not deleted)
**And** subsequent publishes throw NotFoundError

### BR-009: Get Subscriptions
**Given** a topic has multiple subscriptions
**When** `getSubscriptions()` is called
**Then** return array of all Subscription instances for this topic

## Acceptance Criteria

### AC-001: Create and Publish
```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');
await topic.create();

const messageId = await topic.publishMessage({
  data: Buffer.from('Hello World')
});

expect(messageId).toBeDefined();
expect(typeof messageId).toBe('string');
```

### AC-002: Publish with Attributes
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

const messageId = await topic.publishMessage({
  data: Buffer.from('test'),
  attributes: {
    origin: 'test',
    timestamp: Date.now().toString()
  }
});

expect(messageId).toBeDefined();
```

### AC-003: Publish JSON
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

const messageId = await topic.publishJSON({
  userId: 123,
  action: 'login'
});

expect(messageId).toBeDefined();
```

### AC-004: Batching Accumulates Messages
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 10,
    maxMilliseconds: 100
  }
});

// Publish 5 messages quickly
const promises = Array.from({ length: 5 }, (_, i) =>
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
);

const messageIds = await Promise.all(promises);
expect(messageIds).toHaveLength(5);
```

### AC-005: Flush Publishes Immediately
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

// Start publish but don't await
topic.publishMessage({ data: Buffer.from('test') });

// Flush should complete the publish
await topic.flush();
```

### AC-006: Message Ordering
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

await topic.publishMessage({
  data: Buffer.from('First'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('Second'),
  orderingKey: 'user-123'
});

// Verify messages are delivered in order (tested in subscription)
```

### AC-007: Topic Exists Check
```typescript
const topic = pubsub.topic('my-topic');
expect(await topic.exists()).toBe(false);

await topic.create();
expect(await topic.exists()).toBe(true);

await topic.delete();
expect(await topic.exists()).toBe(false);
```

### AC-008: Get Topic Subscriptions
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

await topic.createSubscription('sub-1');
await topic.createSubscription('sub-2');

const [subscriptions] = await topic.getSubscriptions();
expect(subscriptions).toHaveLength(2);
```

### AC-009: Publish to Non-Existent Topic Throws
```typescript
const topic = pubsub.topic('non-existent');

await expect(
  topic.publishMessage({ data: Buffer.from('test') })
).rejects.toThrow('Topic not found');
```

### AC-010: Deprecated publish() Method
```typescript
// This method exists for compatibility but delegates to publishMessage
const topic = pubsub.topic('my-topic');
await topic.create();

const messageId = await topic.publish(Buffer.from('test'), {
  key: 'value'
});

expect(messageId).toBeDefined();
```

## Dependencies

- PubSub client (parent)
- Publisher (composition)
- MessageQueue (singleton)

## Error Handling

### Not Found Error
```typescript
{
  code: 5,
  message: 'Topic not found: projects/PROJECT/topics/TOPIC_NAME'
}
```

### Invalid Argument Error
```typescript
{
  code: 3,
  message: 'Message data must be a Buffer'
}
```

## Performance Considerations

- Default batching settings: 100 messages, 10ms delay, 1MB size
- Each topic has its own Publisher instance
- Batching reduces API calls and improves throughput
- Message ordering reduces throughput (1 MBps per ordering key)

## Examples

### Basic Publishing
```typescript
const topic = pubsub.topic('orders');
await topic.create();

const messageId = await topic.publishMessage({
  data: Buffer.from(JSON.stringify({
    orderId: 12345,
    customerId: 67890
  })),
  attributes: {
    type: 'order.created',
    version: '1.0'
  }
});

console.log(`Published message: ${messageId}`);
```

### Custom Batching
```typescript
const topic = pubsub.topic('high-volume');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 500,
    maxMilliseconds: 50,
    maxBytes: 5 * 1024 * 1024  // 5MB
  }
});

// Publish many messages - they'll batch automatically
for (let i = 0; i < 1000; i++) {
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
}

await topic.flush();
```

### Ordered Publishing
```typescript
const topic = pubsub.topic('user-events');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

// Messages with same key are delivered in order
await topic.publishMessage({
  data: Buffer.from('User logged in'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('User viewed page'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('User logged out'),
  orderingKey: 'user-123'
});
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
