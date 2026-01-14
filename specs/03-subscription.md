# Specification: Subscription

## Purpose

The Subscription class represents a Pub/Sub subscription. It provides an EventEmitter interface for receiving messages via streaming pull, manages subscription lifecycle, and handles flow control for message processing.

## API Surface

### Constructor

```typescript
class Subscription extends EventEmitter {
  constructor(pubsub: PubSub, name: string, options?: SubscriptionOptions)
}
```

### Properties

```typescript
name: string;                    // Fully-qualified subscription name
topic?: Topic | string;          // Associated topic
metadata?: SubscriptionMetadata;
isOpen: boolean;                 // Whether subscription is actively listening
detached: boolean;               // Whether subscription is detached from its topic
```

### Events

```typescript
on(event: 'message', listener: (message: Message) => void): this
on(event: 'error', listener: (error: Error) => void): this
on(event: 'close', listener: () => void): this
on(event: 'debug', listener: (msg: string) => void): this
```

### Methods

#### Lifecycle Methods

```typescript
create(options?: CreateSubscriptionOptions): Promise<[Subscription, any]>
delete(gaxOptions?: CallOptions): Promise<[any]>
exists(options?: CallOptions): Promise<[boolean]>
get(options?: GetOptions): Promise<[Subscription, any]>
getMetadata(options?: CallOptions): Promise<[SubscriptionMetadata, GetSubscriptionResponse]>
setMetadata(metadata: SubscriptionMetadata, options?: CallOptions): Promise<[SubscriptionMetadata, any]>
```

#### Message Reception Methods

```typescript
open(): void                     // Start listening for messages (streaming pull)
close(): Promise<void>           // Stop listening and close streams
```

#### Configuration Methods

```typescript
setOptions(options: SubscriptionOptions): void
```

#### Advanced Methods

```typescript
seek(snapshot: string | Snapshot | Date, options?: CallOptions): Promise<[any]>
createSnapshot(name: string): Promise<[Snapshot, any]>
modifyPushConfig(config: PushConfig, options?: CallOptions): Promise<[any]>
snapshot(name: string): Snapshot
pull(options?: PullOptions): Promise<[Message[], any]>
```

### Type Definitions

```typescript
interface SubscriptionOptions {
  flowControl?: {
    maxMessages?: number;        // Default: 1000
    maxBytes?: number;           // Default: 100 * 1024 * 1024 (100MB)
    allowExcessMessages?: boolean; // Default: false
    maxExtension?: number;       // Default: 3600 seconds (max time to extend ack deadline)
  };
  ackDeadlineSeconds?: number;   // Seconds (10-600), default: 10
  minAckDeadline?: number;       // Minimum ack deadline in seconds, default: 10
  maxAckDeadline?: number;       // Maximum ack deadline in seconds, default: 600
  maxExtensionTime?: number;     // Maximum extension time in seconds, default: 3600
  enableMessageOrdering?: boolean; // Default: false
  batching?: BatchOptions;       // Batching for ack/nack operations
  useLegacyFlowControl?: boolean; // Use client-side only flow control, default: false
  streamingOptions?: {
    maxStreams?: number;         // Default: 5
    timeout?: number;            // Default: 300000 (5 minutes in milliseconds)
  };
  closeOptions?: SubscriberCloseOptions; // Behavior when closing subscription
}

interface CreateSubscriptionOptions extends SubscriptionOptions {
  topic?: string | Topic;
  pushConfig?: PushConfig;
  deadLetterPolicy?: DeadLetterPolicy;
  retryPolicy?: RetryPolicy;
  filter?: string;
  enableExactlyOnceDelivery?: boolean; // Default: false
  expirationPolicy?: ExpirationPolicy;
  labels?: { [key: string]: string };
  messageRetentionDuration?: Duration;  // Range: 10 minutes to 7 days, default: 7 days
  gaxOpts?: CallOptions;               // Optional gax configuration for API calls
}

interface DeadLetterPolicy {
  deadLetterTopic?: string;
  maxDeliveryAttempts?: number;  // Default: 5
}

interface RetryPolicy {
  minimumBackoff?: Duration;     // Default: 10s
  maximumBackoff?: Duration;     // Default: 600s
  // Backoff formula: min(minimumBackoff * 2^(deliveryAttempt - 1), maximumBackoff)
}

interface ExpirationPolicy {
  ttl?: Duration;                // Time-to-live before auto-deletion
}

interface Duration {
  seconds?: number;
  nanos?: number;
  // Note: Duration can also be a simple number representing seconds
  // Example: messageRetentionDuration: 86400 is equivalent to { seconds: 86400 }
}

interface BatchOptions {
  maxMessages?: number;        // Default: 3000 (max acks/nacks before sending)
  maxMilliseconds?: number;    // Default: 100 (max wait time before sending batch)
}

interface SubscriberCloseOptions {
  behavior?: 'NACK' | 'WAIT';       // NACK: nack immediately, WAIT: wait for processing then nack
  timeout?: Duration;               // Max time to wait for pending operations
}

interface CallOptions {
  timeout?: number;            // Request timeout in milliseconds
  retry?: RetryOptions;        // Retry configuration
  autoPaginate?: boolean;      // Auto-fetch all pages
}

interface RetryOptions {
  retries?: number;            // Maximum retry attempts
  backoffSettings?: {
    initialRetryDelayMillis?: number;
    retryDelayMultiplier?: number;
    maxRetryDelayMillis?: number;
  };
}
```

## Behavior Requirements

### BR-001: Subscription Creation
**Given** a topic exists
**When** `create()` is called on a subscription
**Then** the subscription is registered with the topic in MessageQueue
**And** metadata is stored
**And** exists() returns true

### BR-002: Message Event Stream
**Given** a subscription exists and is opened
**When** messages are published to the topic
**Then** 'message' events are emitted for each message
**And** the message includes data, attributes, id, publishTime
**And** messages are delivered respecting flow control limits

### BR-003: Flow Control - Max Messages
**Given** flowControl.maxMessages is set to N
**When** N messages are in-flight (not acked)
**Then** no new messages are delivered
**Until** at least one message is acked or nacked

### BR-004: Flow Control - Max Bytes
**Given** flowControl.maxBytes is set to N bytes
**When** in-flight messages total >= N bytes
**Then** no new messages are delivered
**Until** enough messages are acked to reduce bytes below threshold

### BR-005: Ack Deadline
**Given** ackDeadlineSeconds is set to N seconds
**When** a message is delivered
**Then** if not acked within N seconds, it is redelivered
**And** the message can extend deadline with modifyAckDeadline()

### BR-006: Message Ordering
**Given** enableMessageOrdering is enabled on subscription
**When** messages with same orderingKey are received
**Then** they are delivered in order
**And** next message with same key waits for previous to be acked

### BR-007: Error Handling
**Given** a subscription is open
**When** an error occurs (e.g., connection issue)
**Then** emit 'error' event with error details
**And** subscription remains open (auto-retry)

### BR-008: Close Behavior
**Given** a subscription is open
**When** `close()` is called
**Then** stop pulling new messages
**And** wait for in-flight messages to be acked
**And** emit 'close' event
**And** set isOpen = false

### BR-009: Subscription Deletion
**Given** a subscription exists and is open
**When** `delete()` is called
**Then** close() is called first
**And** subscription is removed from MessageQueue
**And** subsequent operations throw NotFoundError

### BR-010: Dead Letter Policy
**Given** a deadLetterPolicy is configured
**When** a message fails delivery maxDeliveryAttempts times
**Then** the message is published to deadLetterTopic
**And** removed from original subscription

## Acceptance Criteria

### AC-001: Create and Receive Messages
```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');
await topic.create();

const subscription = topic.subscription('my-sub');
await subscription.create();

const messages: Message[] = [];
subscription.on('message', (message) => {
  messages.push(message);
  message.ack();
});

// Start listening
subscription.open();

// Publish a message
await topic.publishMessage({ data: Buffer.from('Hello') });

// Wait for message
await new Promise(resolve => setTimeout(resolve, 50));

expect(messages).toHaveLength(1);
expect(messages[0].data.toString()).toBe('Hello');

await subscription.close();
```

### AC-002: Flow Control Max Messages
```typescript
const subscription = pubsub.subscription('my-sub', {
  flowControl: {
    maxMessages: 2
  }
});
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
  // Don't ack immediately
});

subscription.open();

// Publish 5 messages
for (let i = 0; i < 5; i++) {
  await topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
}

await new Promise(resolve => setTimeout(resolve, 50));

// Should only receive 2 (maxMessages)
expect(receivedMessages.length).toBeLessThanOrEqual(2);

// Ack them
receivedMessages.forEach(m => m.ack());

// Wait for more
await new Promise(resolve => setTimeout(resolve, 50));

// Should receive remaining
expect(receivedMessages.length).toBeGreaterThan(2);
```

### AC-003: Ack Deadline Redelivery
```typescript
const subscription = pubsub.subscription('my-sub', {
  ackDeadlineSeconds: 1  // 1 second
});
await subscription.create();

let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;
  // Don't ack - let it timeout
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait for initial delivery
await new Promise(resolve => setTimeout(resolve, 100));
expect(deliveryCount).toBe(1);

// Wait past ack deadline
await new Promise(resolve => setTimeout(resolve, 1100));

// Should be redelivered
expect(deliveryCount).toBeGreaterThan(1);
```

### AC-004: Message Ordering
```typescript
const subscription = pubsub.subscription('my-sub', {
  enableMessageOrdering: true
});
await subscription.create();

const receivedData: string[] = [];
subscription.on('message', async (message) => {
  receivedData.push(message.data.toString());
  message.ack();
});

subscription.open();

// Publish with ordering key
await topic.publishMessage({
  data: Buffer.from('First'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('Second'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('Third'),
  orderingKey: 'user-123'
});

await new Promise(resolve => setTimeout(resolve, 100));

expect(receivedData).toEqual(['First', 'Second', 'Third']);
```

### AC-005: Error Event Emission
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

const errors: Error[] = [];
subscription.on('error', (error) => {
  errors.push(error);
});

subscription.open();

// Simulate error condition (e.g., topic deleted)
await topic.delete();

await new Promise(resolve => setTimeout(resolve, 100));

expect(errors.length).toBeGreaterThan(0);
```

### AC-006: Close Stops Message Flow
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

let messageCount = 0;
subscription.on('message', (message) => {
  messageCount++;
  message.ack();
});

subscription.open();

// Publish message
await topic.publishMessage({ data: Buffer.from('test') });
await new Promise(resolve => setTimeout(resolve, 50));

const countBeforeClose = messageCount;

// Close subscription
await subscription.close();

// Publish more messages
await topic.publishMessage({ data: Buffer.from('test2') });
await new Promise(resolve => setTimeout(resolve, 50));

// Count should not increase
expect(messageCount).toBe(countBeforeClose);
```

### AC-007: Set Options After Creation
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

subscription.setOptions({
  flowControl: {
    maxMessages: 500
  },
  ackDeadlineSeconds: 30
});

subscription.open();
// Verify new options take effect
```

### AC-008: Subscription Exists Check
```typescript
const subscription = pubsub.subscription('my-sub');
expect(await subscription.exists()).toBe(false);

await subscription.create();
expect(await subscription.exists()).toBe(true);

await subscription.delete();
expect(await subscription.exists()).toBe(false);
```

### AC-009: Multiple Subscriptions Same Topic
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

const sub1 = topic.subscription('sub-1');
const sub2 = topic.subscription('sub-2');
await sub1.create();
await sub2.create();

const messages1: Message[] = [];
const messages2: Message[] = [];

sub1.on('message', (m) => { messages1.push(m); m.ack(); });
sub2.on('message', (m) => { messages2.push(m); m.ack(); });

sub1.open();
sub2.open();

await topic.publishMessage({ data: Buffer.from('test') });
await new Promise(resolve => setTimeout(resolve, 50));

// Both subscriptions receive copy
expect(messages1).toHaveLength(1);
expect(messages2).toHaveLength(1);
```

## Dependencies

- PubSub client (parent)
- MessageStream (internal, manages streaming pull)
- LeaseManager (internal, manages ack deadlines)
- MessageQueue (singleton)

## Error Handling

### Not Found Error
```typescript
{
  code: 5,
  message: 'Subscription not found: projects/PROJECT/subscriptions/SUB_NAME'
}
```

### Resource Exhausted Error
```typescript
{
  code: 8,
  message: 'Flow control limits exceeded'
}
```

## Performance Considerations

- Default flow control: 1000 messages, 100MB
- Streaming pull uses persistent connection (simulated with EventEmitter)
- Message ordering reduces throughput
- Higher maxStreams allows more concurrent message processing

## Examples

### Basic Subscription
```typescript
const subscription = pubsub.subscription('order-processor');
await subscription.create();

subscription.on('message', (message) => {
  console.log(`Received: ${message.data.toString()}`);
  console.log(`Attributes:`, message.attributes);

  // Process message
  processOrder(JSON.parse(message.data.toString()));

  // Acknowledge
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

subscription.open();
```

### Custom Flow Control
```typescript
const subscription = pubsub.subscription('high-volume', {
  flowControl: {
    maxMessages: 5000,
    maxBytes: 500 * 1024 * 1024  // 500MB
  },
  ackDeadlineSeconds: 120  // 2 minutes
});

await subscription.create();

subscription.on('message', async (message) => {
  try {
    await processLongRunningTask(message.data);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();
  }
});

subscription.open();
```

### Ordered Message Processing
```typescript
const subscription = pubsub.subscription('user-events', {
  enableMessageOrdering: true
});

await subscription.create();

subscription.on('message', async (message) => {
  const userId = message.orderingKey;
  console.log(`Processing event for user ${userId}`);

  // Events with same orderingKey arrive in order
  await updateUserState(userId, message.data);

  message.ack();
});

subscription.open();
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
