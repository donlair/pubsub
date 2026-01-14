# Specification: Subscriber (Message Stream)

## Purpose

The Subscriber implements streaming pull for continuous message delivery. It manages flow control, ack deadline tracking, and message distribution to subscription event listeners. Each Subscription has an internal MessageStream that handles the continuous pull operation.

## API Surface

### Constructor

```typescript
class MessageStream {
  constructor(subscription: Subscription, options: SubscriberOptions)
}
```

### Methods

```typescript
start(): void                    // Begin streaming pull
stop(): Promise<void>            // Stop streaming and cleanup
pause(): void                    // Temporarily pause message flow
resume(): void                   // Resume message flow
setOptions(options: SubscriberOptions): void
```

### Type Definitions

```typescript
interface SubscriberOptions {
  flowControl?: FlowControlOptions;
  ackDeadline?: number;          // Seconds, default: 60
  messageOrdering?: boolean;     // Default: false
  streamingOptions?: StreamingOptions;
}

interface FlowControlOptions {
  maxMessages?: number;          // Default: 1000
  maxBytes?: number;             // Default: 100 * 1024 * 1024 (100MB)
  allowExcessMessages?: boolean; // Default: false
}

interface StreamingOptions {
  maxStreams?: number;           // Default: 5
  highWaterMark?: number;        // Default: 0 (no buffering)
}
```

## Behavior Requirements

### BR-001: Start Streaming Pull
**Given** a subscription exists and is not open
**When** `start()` is called
**Then** begin continuous polling of MessageQueue
**And** emit 'message' events as messages arrive
**And** respect flow control limits

### BR-002: Flow Control - Max Messages
**Given** flowControl.maxMessages is set to N
**When** N messages are in-flight (unacked)
**Then** stop pulling new messages
**And** resume pulling when acked count drops below N

### BR-003: Flow Control - Max Bytes
**Given** flowControl.maxBytes is set to N bytes
**When** in-flight messages total >= N bytes
**Then** stop pulling new messages
**And** resume when bytes drop below N

### BR-004: Flow Control - Allow Excess
**Given** allowExcessMessages is true
**When** flow control limit is reached mid-pull
**Then** allow the current batch to complete
**And** then pause until capacity available

### BR-005: Ack Deadline Tracking
**Given** ackDeadline is set to N seconds
**When** a message is delivered
**Then** start lease timer for N seconds
**And** if not acked within N seconds, make available for redelivery
**And** emit 'message' event again with same message

### BR-006: Message Ordering
**Given** messageOrdering is enabled
**When** messages with same orderingKey arrive
**Then** deliver them sequentially in order
**And** wait for ack before delivering next message with same key
**And** messages with different keys can be concurrent

### BR-007: Pause/Resume Streaming
**Given** streaming is active
**When** `pause()` is called
**Then** stop pulling new messages
**And** in-flight messages continue processing
**When** `resume()` is called
**Then** resume pulling messages

### BR-008: Stop Streaming
**Given** streaming is active
**When** `stop()` is called
**Then** stop pulling new messages
**And** wait for all in-flight messages to be acked or deadline expire
**And** clear all timers and state
**And** emit 'close' event on subscription

### BR-009: Error Recovery
**Given** an error occurs during message pull
**When** error is recoverable (e.g., temporary queue issue)
**Then** emit 'error' event on subscription
**And** retry with exponential backoff
**When** error is fatal (e.g., subscription deleted)
**Then** emit 'error' event and stop streaming

### BR-010: Multiple Streams
**Given** maxStreams is set to N
**When** streaming is active
**Then** simulate N concurrent pull streams
**And** distribute messages across streams
**And** increase total throughput

## Acceptance Criteria

### AC-001: Basic Streaming Pull
```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');
await topic.create();

const subscription = topic.subscription('my-sub');
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
  message.ack();
});

subscription.open();  // Starts MessageStream

// Publish messages
await topic.publishMessage({ data: Buffer.from('msg1') });
await topic.publishMessage({ data: Buffer.from('msg2') });
await topic.publishMessage({ data: Buffer.from('msg3') });

await new Promise(resolve => setTimeout(resolve, 50));

expect(receivedMessages.length).toBe(3);

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
  // Don't ack - keep in-flight
});

subscription.open();

// Publish 5 messages
for (let i = 0; i < 5; i++) {
  await topic.publishMessage({ data: Buffer.from(`msg${i}`) });
}

await new Promise(resolve => setTimeout(resolve, 50));

// Should only deliver 2 due to maxMessages
expect(receivedMessages.length).toBe(2);

// Ack first message
receivedMessages[0].ack();

await new Promise(resolve => setTimeout(resolve, 50));

// Should deliver one more
expect(receivedMessages.length).toBe(3);
```

### AC-003: Flow Control Max Bytes
```typescript
const subscription = pubsub.subscription('my-sub', {
  flowControl: {
    maxBytes: 1024  // 1KB
  }
});
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
});

subscription.open();

// Publish 3 messages of 512 bytes each
const data = Buffer.alloc(512);
await topic.publishMessage({ data });
await topic.publishMessage({ data });
await topic.publishMessage({ data });

await new Promise(resolve => setTimeout(resolve, 50));

// Should only deliver 2 (1024 bytes)
expect(receivedMessages.length).toBe(2);

// Ack to free space
receivedMessages[0].ack();

await new Promise(resolve => setTimeout(resolve, 50));

// Should deliver third
expect(receivedMessages.length).toBe(3);
```

### AC-004: Ack Deadline Redelivery
```typescript
const subscription = pubsub.subscription('my-sub', {
  ackDeadline: 1  // 1 second
});
await subscription.create();

let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;
  // Don't ack on first delivery
  if (deliveryCount > 1) {
    message.ack();
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait for initial delivery
await new Promise(resolve => setTimeout(resolve, 50));
expect(deliveryCount).toBe(1);

// Wait for ack deadline
await new Promise(resolve => setTimeout(resolve, 1100));

// Should be redelivered
expect(deliveryCount).toBe(2);
```

### AC-005: Message Ordering Sequential Delivery
```typescript
const subscription = pubsub.subscription('my-sub', {
  messageOrdering: true
});
await subscription.create();

const receivedOrder: string[] = [];
const processingTimes: number[] = [];

subscription.on('message', async (message) => {
  const startTime = Date.now();
  receivedOrder.push(message.data.toString());

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 50));

  processingTimes.push(Date.now() - startTime);
  message.ack();
});

subscription.open();

// Publish with ordering key
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

await new Promise(resolve => setTimeout(resolve, 200));

// Should be received in order
expect(receivedOrder).toEqual(['first', 'second', 'third']);

// Processing should be sequential (not parallel)
expect(processingTimes[0]).toBeGreaterThanOrEqual(50);
expect(processingTimes[1]).toBeGreaterThanOrEqual(50);
```

### AC-006: Pause and Resume
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
  message.ack();
});

subscription.open();

// Publish and receive
await topic.publishMessage({ data: Buffer.from('msg1') });
await new Promise(resolve => setTimeout(resolve, 50));
expect(receivedMessages.length).toBe(1);

// Pause
subscription.pause();

// Publish more
await topic.publishMessage({ data: Buffer.from('msg2') });
await new Promise(resolve => setTimeout(resolve, 50));

// Should not receive while paused
expect(receivedMessages.length).toBe(1);

// Resume
subscription.resume();
await new Promise(resolve => setTimeout(resolve, 50));

// Should now receive
expect(receivedMessages.length).toBe(2);
```

### AC-007: Stop Waits for In-Flight
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

let processingComplete = false;

subscription.on('message', async (message) => {
  // Simulate long processing
  await new Promise(resolve => setTimeout(resolve, 100));
  processingComplete = true;
  message.ack();
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait for message to start processing
await new Promise(resolve => setTimeout(resolve, 20));

// Stop should wait for processing to complete
const stopPromise = subscription.close();

// Processing should complete before stop resolves
await stopPromise;
expect(processingComplete).toBe(true);
```

### AC-008: Error Event on Failure
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

// Wait for error detection
await new Promise(resolve => setTimeout(resolve, 100));

expect(errors.length).toBeGreaterThan(0);
```

### AC-009: Multiple Concurrent Messages
```typescript
const subscription = pubsub.subscription('my-sub', {
  flowControl: {
    maxMessages: 10
  }
});
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
  // Delay ack to keep concurrent
  setTimeout(() => message.ack(), 100);
});

subscription.open();

// Publish many messages quickly
for (let i = 0; i < 10; i++) {
  await topic.publishMessage({ data: Buffer.from(`msg${i}`) });
}

await new Promise(resolve => setTimeout(resolve, 50));

// Should receive up to maxMessages concurrently
expect(receivedMessages.length).toBe(10);
```

### AC-010: Allow Excess Messages
```typescript
const subscription = pubsub.subscription('my-sub', {
  flowControl: {
    maxMessages: 5,
    allowExcessMessages: true
  }
});
await subscription.create();

const receivedMessages: Message[] = [];
subscription.on('message', (message) => {
  receivedMessages.push(message);
  // Don't ack
});

subscription.open();

// Publish batch of 10
for (let i = 0; i < 10; i++) {
  await topic.publishMessage({ data: Buffer.from(`msg${i}`) });
}

await new Promise(resolve => setTimeout(resolve, 50));

// With allowExcessMessages, might receive more than maxMessages in one batch
expect(receivedMessages.length).toBeGreaterThanOrEqual(5);
```

## Dependencies

- Subscription (parent)
- LeaseManager (manages ack deadline timers)
- FlowControl (tracks in-flight messages/bytes)
- MessageQueue (singleton, pulls messages)

## Error Handling

### Subscription Not Found
```typescript
{
  code: 5,
  message: 'Subscription not found'
}
```

### Flow Control Exceeded (if not allowed)
```typescript
{
  code: 8,
  message: 'Flow control: max messages exceeded'
}
```

## Performance Considerations

- Default flow control (1000 messages, 100MB) suitable for most cases
- Higher maxMessages increases throughput but uses more memory
- Lower maxMessages reduces memory but may underutilize
- Message ordering significantly reduces throughput
- Multiple streams (maxStreams) increase parallelism

## Implementation Notes

- Use setInterval or continuous loop for pulling messages
- Track in-flight messages in Set or Map
- Use setTimeout for ack deadline tracking (per message)
- Ordering requires queuing messages per orderingKey
- Pause should stop pulling but not stop ack deadline timers

## Examples

### High-Throughput Subscriber
```typescript
const subscription = pubsub.subscription('high-volume', {
  flowControl: {
    maxMessages: 5000,
    maxBytes: 500 * 1024 * 1024  // 500MB
  },
  streamingOptions: {
    maxStreams: 10
  }
});

await subscription.create();

subscription.on('message', async (message) => {
  await processMessage(message.data);
  message.ack();
});

subscription.open();
```

### Low-Latency Subscriber
```typescript
const subscription = pubsub.subscription('real-time', {
  flowControl: {
    maxMessages: 100
  },
  ackDeadline: 30
});

await subscription.create();

subscription.on('message', (message) => {
  // Process quickly
  handleRealTimeEvent(message.data);
  message.ack();
});

subscription.open();
```

### Ordered Message Processing
```typescript
const subscription = pubsub.subscription('user-events', {
  messageOrdering: true,
  ackDeadline: 300  // 5 minutes for complex processing
});

await subscription.create();

subscription.on('message', async (message) => {
  const userId = message.orderingKey;
  console.log(`Processing event for user ${userId}`);

  // Events arrive in order per user
  await updateUserState(userId, message.data);

  message.ack();
});

subscription.open();
```

### Graceful Shutdown
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

subscription.on('message', async (message) => {
  await processMessage(message.data);
  message.ack();
});

subscription.open();

// Handle shutdown signal
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  // Stop receiving new messages, wait for in-flight to complete
  await subscription.close();

  console.log('All messages processed, exiting');
  process.exit(0);
});
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
