# Specification: Message Ordering

## Purpose

Message ordering ensures that messages with the same ordering key are delivered to subscribers in the order they were published. This feature is critical for use cases where event sequence matters (e.g., user actions, database changes, state transitions).

## Architecture Overview

Message ordering is a cross-cutting concern that affects:
- **Publisher**: Maintains separate batches per ordering key
- **MessageQueue**: Maintains separate queues per ordering key
- **Subscriber**: Delivers messages sequentially per ordering key

## Ordering Guarantees

### What is Guaranteed
- Messages with the **same ordering key** are delivered in **publish order**
- Messages remain ordered across redelivery attempts
- Order is maintained even with multiple subscribers (each gets ordered copy)

### What is NOT Guaranteed
- Messages with **different ordering keys** may be delivered in any order
- Messages **without ordering keys** may be delivered in any order
- Ordering across different topics

## Behavior Requirements

### BR-001: Enable Ordering on Topic
**Given** a topic is being created or configured
**When** topic is created with ordering-compatible configuration
**Then** topic can accept messages with ordering keys
**And** publisher maintains separate batches per ordering key

### BR-002: Enable Ordering on Subscription
**Given** a subscription is being created
**When** created with `enableMessageOrdering: true` option
**Then** enable ordered delivery for the subscription
**And** deliver messages sequentially per ordering key

### BR-003: Publish with Ordering Key
**Given** messageOrdering is enabled on topic
**When** messages with orderingKey are published
**Then** batch messages separately by orderingKey
**And** maintain publish order within each key

### BR-004: Ordered Message Storage
**Given** messages with ordering keys arrive at MessageQueue
**When** stored in subscription queues
**Then** maintain separate queue per orderingKey
**And** preserve order within each queue

### BR-005: Sequential Delivery per Key
**Given** subscription has messageOrdering enabled
**When** messages with same orderingKey are available
**Then** deliver first message
**And** wait for ack before delivering next with same key
**And** messages with different keys can be concurrent

### BR-006: Ordering with Redelivery
**Given** a message with orderingKey is redelivered (nack or timeout)
**When** returned to queue
**Then** maintain original position in ordering sequence
**And** block subsequent messages with same key until redelivered message is acked

### BR-007: Mixed Ordering Keys
**Given** messages with different ordering keys
**When** delivered to subscriber
**Then** each ordering key sequence is independent
**And** messages from different keys can be concurrent
**And** overall throughput is sum of all key throughputs

### BR-008: No Ordering Key Messages
**Given** messageOrdering is enabled
**When** messages without orderingKey are published
**Then** deliver immediately without ordering constraints
**And** do not block ordered messages

### BR-009: Ordering Throughput Limits
**Given** messageOrdering is enabled
**When** publishing to single ordering key
**Then** throughput limited to sequential processing
**And** recommend multiple keys for higher throughput

### BR-010: Ordering Key Format
**Given** an ordering key is provided
**When** validated
**Then** must be non-empty string
**And** max length 1024 bytes
**And** any UTF-8 characters allowed

## Acceptance Criteria

### AC-001: Create Topic and Publish with Ordering Key
```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('ordered-events');
await topic.create();

// Topics accept messages with ordering keys
// Publisher will batch messages by ordering key
await topic.publishMessage({
  data: Buffer.from('event-1'),
  orderingKey: 'user-123'
});
```

### AC-002: Messages with Same Key Delivered in Order
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

const subscription = topic.subscription('ordered-sub');
await subscription.create({ enableMessageOrdering: true });

const receivedOrder: string[] = [];

subscription.on('message', (message) => {
  receivedOrder.push(message.data.toString());
  message.ack();
});

subscription.open();

// Publish sequence
await topic.publishMessage({
  data: Buffer.from('first'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('second'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('third'),
  orderingKey: 'user-123'
});

await new Promise(resolve => setTimeout(resolve, 100));

expect(receivedOrder).toEqual(['first', 'second', 'third']);
```

### AC-003: Sequential Processing per Key
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

const subscription = topic.subscription('ordered-sub');
await subscription.create();
subscription.setOptions({ messageOrdering: true });

let concurrentCount = 0;
let maxConcurrent = 0;

subscription.on('message', async (message) => {
  concurrentCount++;
  maxConcurrent = Math.max(maxConcurrent, concurrentCount);

  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 50));

  concurrentCount--;
  message.ack();
});

subscription.open();

// Publish 5 messages with same key
for (let i = 0; i < 5; i++) {
  await topic.publishMessage({
    data: Buffer.from(`msg-${i}`),
    orderingKey: 'user-123'
  });
}

await new Promise(resolve => setTimeout(resolve, 300));

// With ordering, should process one at a time
expect(maxConcurrent).toBe(1);
```

### AC-004: Different Keys Concurrent
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

const subscription = topic.subscription('ordered-sub');
await subscription.create();
subscription.setOptions({ messageOrdering: true });

let concurrentCount = 0;
let maxConcurrent = 0;

subscription.on('message', async (message) => {
  concurrentCount++;
  maxConcurrent = Math.max(maxConcurrent, concurrentCount);

  await new Promise(resolve => setTimeout(resolve, 50));

  concurrentCount--;
  message.ack();
});

subscription.open();

// Publish to different keys
await topic.publishMessage({
  data: Buffer.from('user1-msg1'),
  orderingKey: 'user-1'
});

await topic.publishMessage({
  data: Buffer.from('user2-msg1'),
  orderingKey: 'user-2'
});

await topic.publishMessage({
  data: Buffer.from('user3-msg1'),
  orderingKey: 'user-3'
});

await new Promise(resolve => setTimeout(resolve, 100));

// Different keys can be concurrent
expect(maxConcurrent).toBeGreaterThan(1);
```

### AC-005: Ordering Preserved on Redelivery
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

const subscription = topic.subscription('ordered-sub');
await subscription.create({
  enableMessageOrdering: true,
  ackDeadline: 1
});

const receivedMessages: string[] = [];
let firstMessageDelivered = false;

subscription.on('message', (message) => {
  receivedMessages.push(message.data.toString());

  if (message.data.toString() === 'first' && !firstMessageDelivered) {
    firstMessageDelivered = true;
    // Don't ack - let it timeout
    return;
  }

  message.ack();
});

subscription.open();

await topic.publishMessage({
  data: Buffer.from('first'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('second'),
  orderingKey: 'user-123'
});

await new Promise(resolve => setTimeout(resolve, 1500));

// First should be redelivered before second is delivered
const firstIndices = receivedMessages
  .map((msg, idx) => msg === 'first' ? idx : -1)
  .filter(idx => idx !== -1);

const secondIndices = receivedMessages
  .map((msg, idx) => msg === 'second' ? idx : -1)
  .filter(idx => idx !== -1);

// Second should only appear after first is acked (after redelivery)
expect(Math.max(...firstIndices)).toBeLessThan(Math.min(...secondIndices));
```

### AC-006: No Ordering Key Not Blocked
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

const subscription = topic.subscription('ordered-sub');
await subscription.create({ enableMessageOrdering: true });

const receivedMessages: string[] = [];

subscription.on('message', async (message) => {
  receivedMessages.push(message.data.toString());

  // Don't ack messages with ordering key
  if (message.orderingKey) {
    // Block ordered messages
    return;
  }

  message.ack();
});

subscription.open();

// Publish ordered message (won't be acked)
await topic.publishMessage({
  data: Buffer.from('blocked'),
  orderingKey: 'user-123'
});

// Publish unordered message
await topic.publishMessage({
  data: Buffer.from('unordered')
});

await new Promise(resolve => setTimeout(resolve, 100));

// Unordered message should be delivered despite blocked ordered message
expect(receivedMessages).toContain('unordered');
```

### AC-007: Multiple Subscriptions Ordered Independently
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

const sub1 = topic.subscription('sub-1');
const sub2 = topic.subscription('sub-2');
await sub1.create({ enableMessageOrdering: true });
await sub2.create({ enableMessageOrdering: true });

const received1: string[] = [];
const received2: string[] = [];

sub1.on('message', (msg) => { received1.push(msg.data.toString()); msg.ack(); });
sub2.on('message', (msg) => { received2.push(msg.data.toString()); msg.ack(); });

sub1.open();
sub2.open();

// Publish ordered sequence
await topic.publishMessage({
  data: Buffer.from('first'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('second'),
  orderingKey: 'user-123'
});

await new Promise(resolve => setTimeout(resolve, 100));

// Both subscriptions receive ordered
expect(received1).toEqual(['first', 'second']);
expect(received2).toEqual(['first', 'second']);
```

### AC-008: Ordering Key Validation
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

// Empty ordering key should throw
await expect(
  topic.publishMessage({
    data: Buffer.from('test'),
    orderingKey: ''
  })
).rejects.toThrow('Ordering key cannot be empty');

// Very long ordering key should throw
const longKey = 'x'.repeat(1025);
await expect(
  topic.publishMessage({
    data: Buffer.from('test'),
    orderingKey: longKey
  })
).rejects.toThrow('Ordering key exceeds maximum length');
```

### AC-009: Ordering Key Accepted Without Explicit Enable
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

// Ordering keys can be used without explicitly enabling message ordering
// The ordering key is treated as message metadata
const messageId = await topic.publishMessage({
  data: Buffer.from('test'),
  orderingKey: 'user-123'
});

expect(messageId).toBeDefined();
```

### AC-010: Batching with Ordering Keys
```typescript
const topic = pubsub.topic('ordered-events');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 10,
    maxMilliseconds: 50
  }
});

// Publish multiple messages with different keys quickly
const promises: Promise<string>[] = [];

for (let i = 0; i < 20; i++) {
  const key = `user-${i % 5}`;  // 5 different keys
  promises.push(
    topic.publishMessage({
      data: Buffer.from(`msg-${i}`),
      orderingKey: key
    })
  );
}

const messageIds = await Promise.all(promises);

// All should succeed with batching
expect(messageIds).toHaveLength(20);
expect(messageIds.every(id => typeof id === 'string')).toBe(true);
```

## Dependencies

- Publisher (maintains separate batches per key)
- MessageQueue (maintains separate queues per key)
- MessageStream (enforces sequential delivery per key)
- OrderingManager (internal component to manage ordering state)

## Error Handling

### Ordering Not Enabled
```typescript
{
  code: 3,
  message: 'Message ordering must be enabled on topic to use ordering keys'
}
```

### Invalid Ordering Key
```typescript
{
  code: 3,
  message: 'Ordering key cannot be empty'
}

{
  code: 3,
  message: 'Ordering key exceeds maximum length of 1024 bytes'
}
```

## Performance Considerations

- **Throughput per key**: Limited to sequential processing (~100-1000 msgs/sec)
- **Throughput overall**: Scales linearly with number of unique keys
- **Best practice**: Distribute load across many ordering keys
- **Avoid**: Single ordering key for high-volume streams
- **Memory**: Each ordering key maintains separate queue (bounded by flow control)

## Implementation Notes

- Use `Map<orderingKey, Queue<Message>>` for message storage
- Track in-flight message per ordering key (only one at a time)
- Batching: Use `Map<orderingKey, Batch>` for separate batches
- Ordering key is part of message immutable data
- Empty string is invalid ordering key
- Null/undefined ordering key means unordered

## Examples

### User Event Stream
```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('user-events');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

const subscription = topic.subscription('event-processor');
await subscription.create();
subscription.setOptions({ messageOrdering: true });

subscription.on('message', async (message) => {
  const userId = message.orderingKey;
  const event = JSON.parse(message.data.toString());

  console.log(`Processing ${event.type} for user ${userId}`);

  // Update user state - guaranteed in order
  await updateUserState(userId, event);

  message.ack();
});

subscription.open();

// Publish user events
const userId = 'user-123';

await topic.publishJSON({ type: 'login', timestamp: Date.now() }, {
  orderingKey: userId
});

await topic.publishJSON({ type: 'page_view', page: '/home', timestamp: Date.now() }, {
  orderingKey: userId
});

await topic.publishJSON({ type: 'logout', timestamp: Date.now() }, {
  orderingKey: userId
});

// Events are processed in exact order
```

### Database Change Stream
```typescript
const topic = pubsub.topic('database-changes');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

// Publish changes with table row as ordering key
async function publishChange(table: string, rowId: string, change: any) {
  await topic.publishJSON(change, {
    orderingKey: `${table}:${rowId}`
  });
}

// Changes to same row are ordered
await publishChange('users', '123', { action: 'INSERT', data: {...} });
await publishChange('users', '123', { action: 'UPDATE', data: {...} });
await publishChange('users', '123', { action: 'DELETE' });

// Changes to different rows can be concurrent
await publishChange('users', '456', { action: 'INSERT', data: {...} });
await publishChange('orders', '789', { action: 'INSERT', data: {...} });
```

### IoT Device Telemetry
```typescript
const topic = pubsub.topic('device-telemetry');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

// Each device sends ordered telemetry
async function sendTelemetry(deviceId: string, data: any) {
  await topic.publishJSON(data, {
    orderingKey: deviceId
  });
}

// Device readings arrive in order
await sendTelemetry('device-001', { temp: 20.5, humidity: 65 });
await sendTelemetry('device-001', { temp: 21.0, humidity: 64 });
await sendTelemetry('device-001', { temp: 21.5, humidity: 63 });

// Different devices process concurrently
await sendTelemetry('device-002', { temp: 18.5, humidity: 70 });
await sendTelemetry('device-003', { temp: 22.0, humidity: 60 });
```

## Best Practices

### ✅ DO
- Use ordering keys for entity-level sequencing (user ID, order ID, device ID)
- Distribute load across many ordering keys for high throughput
- Keep ordering key consistent for same logical entity
- Use ordering for state machines, event sourcing, CDC

### ❌ DON'T
- Use single ordering key for all messages (limits throughput)
- Use ordering for unrelated messages
- Rely on ordering across different topics
- Use very long ordering keys (keep under 100 chars)

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
