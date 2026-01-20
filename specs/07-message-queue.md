# Specification: MessageQueue (Internal Broker)

## Purpose

The MessageQueue is the internal message broker that acts as the central hub for message routing. It's a singleton that manages all topics, subscriptions, message storage, routing, and acknowledgment tracking. This component is internal and not exposed in the public API.

## API Surface

### Singleton Pattern

```typescript
class MessageQueue {
  private static instance: MessageQueue;
  static getInstance(): MessageQueue
}
```

### Methods

#### Topic Management

```typescript
registerTopic(topicName: string, metadata?: TopicMetadata): void
unregisterTopic(topicName: string): void
topicExists(topicName: string): boolean
getTopic(topicName: string): TopicMetadata | undefined
getAllTopics(): TopicMetadata[]
```

#### Subscription Management

```typescript
registerSubscription(
  subscriptionName: string,
  topicName: string,
  options?: SubscriptionOptions
): void
unregisterSubscription(subscriptionName: string): void
subscriptionExists(subscriptionName: string): boolean
getSubscription(subscriptionName: string): SubscriptionMetadata | undefined
getSubscriptionsForTopic(topicName: string): SubscriptionMetadata[]
getAllSubscriptions(): SubscriptionMetadata[]
```

#### Message Operations

```typescript
publish(topicName: string, messages: InternalMessage[]): string[]
pull(subscriptionName: string, maxMessages: number): InternalMessage[]
ack(ackId: string): void
nack(ackId: string): void
modifyAckDeadline(ackId: string, seconds: number): void
```

### Type Definitions

```typescript
interface InternalMessage {
  id: string;
  data: Buffer;
  attributes: Attributes;
  publishTime: PreciseDate;
  orderingKey?: string;
  deliveryAttempt: number;
  length: number;                // Size in bytes (convenience property)
}

interface MessageLease {
  message: InternalMessage;
  ackId: string;
  subscription: string;
  deadline: Date;
  deadlineExtensions: number;
}

interface TopicMetadata {
  name: string;
  created: Date;
}

interface SubscriptionMetadata {
  name: string;
  topic: string;
  created: Date;
  options: SubscriptionOptions;
}
```

## Behavior Requirements

### BR-001: Singleton Instance
**Given** MessageQueue is accessed multiple times
**When** `getInstance()` is called
**Then** return the same instance every time
**And** ensure thread-safe initialization

### BR-002: Register Topic
**Given** a topic name is provided
**When** `registerTopic()` is called
**Then** create topic entry in internal registry
**And** initialize empty message queue for topic
**And** track topic metadata

### BR-003: Publish to Topic
**Given** a topic exists and has subscriptions
**When** `publish(topicName, messages)` is called
**Then** generate unique message ID for each message
**And** set publishTime for each message
**And** copy messages to each subscription's queue
**And** return array of message IDs

### BR-004: Publish to Topic Without Subscriptions
**Given** a topic exists but has no subscriptions
**When** `publish(topicName, messages)` is called
**Then** generate and return message IDs
**And** discard messages (no subscribers)

### BR-005: Pull Messages
**Given** a subscription has pending messages
**When** `pull(subscriptionName, maxMessages)` is called
**Then** return up to maxMessages messages
**And** create unique ackId for each message
**And** start ack deadline timer for each message
**And** mark messages as in-flight (not available for re-pull)

### BR-006: Message Acknowledgment
**Given** a message is in-flight
**When** `ack(ackId)` is called
**Then** remove message from subscription queue
**And** remove from in-flight tracking
**And** cancel ack deadline timer

### BR-007: Negative Acknowledgment
**Given** a message is in-flight
**When** `nack(ackId)` is called
**Then** return message to subscription queue immediately
**And** increment deliveryAttempt counter
**And** remove from in-flight tracking
**And** make available for immediate re-pull

### BR-008: Ack Deadline Expiry
**Given** a message is in-flight with ack deadline (10-600 seconds, default 10)
**When** deadline expires without ack or nack
**Then** automatically return message to queue
**And** increment deliveryAttempt counter
**And** make available for re-pull (subject to retry backoff if configured)

### BR-009: Modify Ack Deadline
**Given** a message is in-flight
**When** `modifyAckDeadline(ackId, seconds)` is called
**Then** extend the deadline by specified seconds
**And** update deadline timer
**And** allow multiple extensions

### BR-010: Message Ordering
**Given** messages have orderingKey
**When** pulled by subscription with messageOrdering enabled
**Then** messages with same orderingKey are delivered in order
**And** next message with same key not available until previous is acked
**And** messages with different orderingKeys can be pulled concurrently
**And** messages without orderingKey are not blocked by ordered messages

### BR-011: Subscription Deletion
**Given** a subscription exists with pending messages
**When** `unregisterSubscription()` is called
**Then** remove subscription from registry
**And** clear all pending messages for that subscription
**And** cancel all in-flight ack timers

### BR-012: Topic Deletion
**Given** a topic exists with subscriptions
**When** `unregisterTopic()` is called
**Then** remove topic from registry
**And** detach all subscriptions (but don't delete them)
**And** clear all messages

### BR-013: Flow Control Enforcement
**Given** a subscription has flow control limits configured
**When** `pull()` is called and in-flight messages >= maxMessages OR in-flight bytes >= maxBytes
**Then** return empty array (no messages available)
**And** resume returning messages when capacity becomes available
**And** track both message count and byte size for flow control

### BR-014: Track In-Flight Metrics
**Given** messages are pulled by subscriptions
**When** tracking in-flight messages
**Then** track total count of in-flight messages per subscription
**And** track total bytes of in-flight messages per subscription
**And** decrement counts when messages are acked or nacked
**And** use for flow control limit enforcement

### BR-015: Retry Backoff
**Given** a subscription has retryPolicy configured
**When** message is nacked or ack deadline expires
**Then** calculate backoff delay: min(minimumBackoff * 2^(deliveryAttempt-1), maximumBackoff)
**And** message becomes available after backoff delay (not immediately)
**And** if no retryPolicy specified, use immediate redelivery (0s backoff)

### BR-016: Dead Letter Queue
**Given** a subscription has deadLetterPolicy configured
**When** message.deliveryAttempt >= deadLetterPolicy.maxDeliveryAttempts
**Then** automatically publish message to deadLetterPolicy.deadLetterTopic
**And** remove from original subscription queue
**And** preserve original message metadata (publishTime, attributes, orderingKey)

### BR-017: Message Size Validation
**Given** messages are being published
**When** `publish()` is called
**Then** validate total message size (data + attributes + metadata) <= 10MB
**And** validate attribute key length <= 256 bytes
**And** validate attribute value length <= 1024 bytes
**And** validate attribute keys are non-empty
**And** validate attribute keys don't start with reserved prefixes ('goog', 'googclient_')
**And** validate all attribute values are strings
**And** throw InvalidArgumentError (code 3) if validation fails

### BR-018: Ack ID Lifecycle
**Given** a message is delivered to a subscription
**When** ackId is generated
**Then** format as unique string per delivery (e.g., {messageId}-{deliveryAttempt})
**And** invalidate previous ackIds for same message
**And** throw InvalidArgumentError when ack/nack uses invalid or expired ackId
**And** only current ackId is valid for a message

### BR-019: Message Queue Ordering
**Given** messages are stored in subscription queues
**When** messages are pulled
**Then** return messages in publish order (FIFO) by default
**And** maintain oldest-first ordering for messages without orderingKey
**And** maintain separate ordered queues per orderingKey when message ordering enabled

### BR-020: MessageLease Cleanup
**Given** messages are acked or nacked
**When** ack/nack operations complete
**Then** remove MessageLease from in-flight tracking immediately
**And** clear ackId from lookup map
**And** cancel associated timeout timer
**And** prevent memory leaks from accumulated leases

### BR-021: Topic Deletion with In-Flight Messages
**Given** a topic has subscriptions with in-flight messages
**When** `unregisterTopic()` is called
**Then** remove topic from registry
**And** detach all subscriptions (subscriptions remain but topic reference cleared)
**And** cancel all in-flight ack timers for all subscriptions
**And** clear all pending messages in subscription queues
**And** prevent further message delivery to those subscriptions

### BR-022: Queue Size Limits
**Given** a subscription queue is accepting messages
**When** queue size reaches maximum threshold (10,000 messages or 100MB)
**Then** reject new messages to that subscription
**And** log warning about queue capacity reached
**And** continue accepting messages for other subscriptions
**And** resume accepting messages when queue size drops below threshold
**Note**: Messages published to topic are discarded for subscriptions at capacity

## Acceptance Criteria

### AC-001: Singleton Pattern
```typescript
const queue1 = MessageQueue.getInstance();
const queue2 = MessageQueue.getInstance();

expect(queue1).toBe(queue2);
```

### AC-002: Register and Check Topic
```typescript
const queue = MessageQueue.getInstance();

expect(queue.topicExists('test-topic')).toBe(false);

queue.registerTopic('test-topic');

expect(queue.topicExists('test-topic')).toBe(true);
```

### AC-003: Publish and Pull Messages
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic');

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('Hello'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

const messageIds = queue.publish('test-topic', messages);
expect(messageIds).toHaveLength(1);

const pulled = queue.pull('test-sub', 10);
expect(pulled).toHaveLength(1);
expect(pulled[0].data.toString()).toBe('Hello');
```

### AC-004: Multiple Subscriptions Receive Copies
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('sub-1', 'test-topic');
queue.registerSubscription('sub-2', 'test-topic');

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled1 = queue.pull('sub-1', 10);
const pulled2 = queue.pull('sub-2', 10);

expect(pulled1).toHaveLength(1);
expect(pulled2).toHaveLength(1);
```

### AC-005: Ack Removes Message
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic');

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled1 = queue.pull('test-sub', 10);
expect(pulled1).toHaveLength(1);

// Ack the message
queue.ack(pulled1[0].ackId);

// Should not be available again
const pulled2 = queue.pull('test-sub', 10);
expect(pulled2).toHaveLength(0);
```

### AC-006: Nack Redelivers Immediately
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic');

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled1 = queue.pull('test-sub', 10);
expect(pulled1[0].deliveryAttempt).toBe(1);

// Nack the message
queue.nack(pulled1[0].ackId);

// Should be available immediately
const pulled2 = queue.pull('test-sub', 10);
expect(pulled2).toHaveLength(1);
expect(pulled2[0].deliveryAttempt).toBe(2);
```

### AC-007: Ack Deadline Expiry Redelivers
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic', {
  ackDeadlineSeconds: 10  // 10 seconds (minimum valid)
});

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled1 = queue.pull('test-sub', 10);
expect(pulled1).toHaveLength(1);

// Don't ack - wait for deadline
await new Promise(resolve => setTimeout(resolve, 10100));

// Should be available for redelivery
const pulled2 = queue.pull('test-sub', 10);
expect(pulled2).toHaveLength(1);
expect(pulled2[0].deliveryAttempt).toBe(2);
```

### AC-008: Modify Ack Deadline
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic', {
  ackDeadlineSeconds: 10  // 10 seconds (minimum valid)
});

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled1 = queue.pull('test-sub', 10);

// Extend deadline by 15 seconds
queue.modifyAckDeadline(pulled1[0].ackId, 15);

// Wait past original deadline but within extended
await new Promise(resolve => setTimeout(resolve, 12000));

// Should NOT be available (extended deadline not expired yet)
const pulled2 = queue.pull('test-sub', 10);
expect(pulled2).toHaveLength(0);

// Ack it
queue.ack(pulled1[0].ackId);
```

### AC-009: Message Ordering
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic', {
  messageOrdering: true
});

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('first'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: 'user-123',
    deliveryAttempt: 1
  },
  {
    id: 'msg-2',
    data: Buffer.from('second'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: 'user-123',
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

// Pull first message
const pulled1 = queue.pull('test-sub', 10);
expect(pulled1).toHaveLength(1);
expect(pulled1[0].data.toString()).toBe('first');

// Second message should not be available until first is acked
const pulled2 = queue.pull('test-sub', 10);
expect(pulled2).toHaveLength(0);

// Ack first
queue.ack(pulled1[0].ackId);

// Now second should be available
const pulled3 = queue.pull('test-sub', 10);
expect(pulled3).toHaveLength(1);
expect(pulled3[0].data.toString()).toBe('second');
```

### AC-010: Publish Without Subscriptions
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
// No subscriptions

const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('test'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

// Should not throw
const messageIds = queue.publish('test-topic', messages);
expect(messageIds).toHaveLength(1);
```

### AC-011: Get Subscriptions for Topic
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('sub-1', 'test-topic');
queue.registerSubscription('sub-2', 'test-topic');

const subs = queue.getSubscriptionsForTopic('test-topic');
expect(subs).toHaveLength(2);
```

### AC-012: Unregister Topic Detaches Subscriptions
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic');

queue.unregisterTopic('test-topic');

expect(queue.topicExists('test-topic')).toBe(false);
expect(queue.subscriptionExists('test-sub')).toBe(true);

// Subscription still exists but detached
const sub = queue.getSubscription('test-sub');
expect(sub?.topic).toBe('test-topic');
```

### AC-013: FIFO Message Ordering Without Ordering Key
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('test-topic');
queue.registerSubscription('test-sub', 'test-topic');

// Publish messages in order: A, B, C (no orderingKey)
const messages: InternalMessage[] = [
  {
    id: 'msg-1',
    data: Buffer.from('A'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  },
  {
    id: 'msg-2',
    data: Buffer.from('B'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  },
  {
    id: 'msg-3',
    data: Buffer.from('C'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
];

queue.publish('test-topic', messages);

const pulled = queue.pull('test-sub', 10);

// Must be delivered in publish order (FIFO)
expect(pulled).toHaveLength(3);
expect(pulled[0].data.toString()).toBe('A');
expect(pulled[1].data.toString()).toBe('B');
expect(pulled[2].data.toString()).toBe('C');
```

## Dependencies

- None (internal singleton, used by all other components)

## Error Handling

### Topic Not Found
```typescript
{
  code: 5,
  message: 'Topic not found: test-topic'
}
```

### Subscription Not Found
```typescript
{
  code: 5,
  message: 'Subscription not found: test-sub'
}
```

### Invalid Ack ID
```typescript
{
  code: 3,
  message: 'Invalid ack ID: abc123'
}
```

## Performance Considerations

- Use Map for O(1) topic/subscription lookups
- Use efficient queue data structure (Array or linked list)
- Index messages by orderingKey for ordering feature
- **Limit queue size per subscription**: 10,000 messages or 100MB per subscription
- **Clean up expired leases periodically**: Run cleanup every 60 seconds to prevent memory leaks
- **Message retention**: Enforce 7-day retention (configurable via messageRetentionDuration)
- **Ack ID garbage collection**: Remove expired ackIds after 10 minutes

## Implementation Notes

- Singleton pattern with lazy initialization
- Use setTimeout for ack deadline timers (one per message)
- Store in-flight messages in Map<ackId, MessageLease>
- For ordering, maintain Map<orderingKey, Queue<Message>>
- Generate ackIds as unique strings (uuid or incremental)
- Message IDs should be unique across all topics

## Examples

### Basic Queue Operations
```typescript
// Internal usage - not exposed to users
const queue = MessageQueue.getInstance();

// Register topic and subscription
queue.registerTopic('orders');
queue.registerSubscription('order-processor', 'orders', {
  ackDeadlineSeconds: 60
});

// Publish messages
const messageIds = queue.publish('orders', [
  {
    id: 'msg-1',
    data: Buffer.from('Order #1'),
    attributes: { orderId: '12345' },
    publishTime: new Date(),
    orderingKey: undefined,
    deliveryAttempt: 1
  }
]);

// Pull messages
const messages = queue.pull('order-processor', 10);

// Ack message
queue.ack(messages[0].ackId);
```

### Ordered Message Queue
```typescript
const queue = MessageQueue.getInstance();

queue.registerTopic('user-events');
queue.registerSubscription('event-processor', 'user-events', {
  messageOrdering: true,
  ackDeadlineSeconds: 120
});

// Publish ordered messages
queue.publish('user-events', [
  {
    id: 'msg-1',
    data: Buffer.from('login'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: 'user-123',
    deliveryAttempt: 1
  },
  {
    id: 'msg-2',
    data: Buffer.from('page-view'),
    attributes: {},
    publishTime: new Date(),
    orderingKey: 'user-123',
    deliveryAttempt: 1
  }
]);

// Pull delivers in order, one at a time per orderingKey
const msg1 = queue.pull('event-processor', 10);
queue.ack(msg1[0].ackId);

const msg2 = queue.pull('event-processor', 10);
queue.ack(msg2[0].ackId);
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
