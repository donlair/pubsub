# Features Guide

This guide provides detailed examples of all Pub/Sub features.

## Publishing

### Simple Publishing

```typescript
const topic = pubsub.topic('events');
await topic.create();

// Publish with data and attributes
await topic.publishMessage({
  data: Buffer.from('Hello, World!'),
  attributes: { source: 'web', userId: '123' }
});

// Publish JSON directly
await topic.publishJSON({
  event: 'user.signup',
  userId: 456
});
```

### Batching

Configure batching for high throughput:

```typescript
// Configure batching for high throughput
topic.setPublishOptions({
  batching: {
    maxMessages: 100,      // Batch up to 100 messages
    maxMilliseconds: 10,   // Or wait 10ms
    maxBytes: 1024 * 1024  // Or 1MB of data
  }
});

// Publish many messages quickly - they'll batch automatically
for (let i = 0; i < 1000; i++) {
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
}

// Flush any pending batches
await topic.flush();
```

## Subscribing

### EventEmitter-Based Subscriptions

```typescript
const subscription = topic.subscription('my-sub');
await subscription.create();

subscription.on('message', (message) => {
  // Process the message
  console.log(message.data.toString());

  // Acknowledge or reject
  message.ack();    // Remove from queue
  message.nack();   // Requeue for redelivery
});

subscription.open();  // Start receiving
```

### Flow Control

Control memory usage and concurrency:

```typescript
// Control memory usage and concurrency
const subscription = pubsub.subscription('processor', {
  flowControl: {
    maxMessages: 1000,                // Max 1000 in-flight messages
    maxBytes: 100 * 1024 * 1024       // Max 100MB in-flight
  },
  ackDeadlineSeconds: 60              // 60s to process before redelivery
});
```

### Throughput Tuning

Control message delivery rate by adjusting the streaming pull behavior:

```typescript
const subscription = pubsub.subscription('processor', {
  streamingOptions: {
    pullInterval: 1,     // Pull every 1ms (10x faster than default)
    maxPullSize: 1000    // Pull up to 1000 messages per interval (10x larger)
  }
});

// Theoretical max throughput: 1000 messages/ms = 1M msg/s
// Actual throughput depends on processing speed and flow control limits
```

**Performance Trade-offs:**

- **Default (10ms, 100 messages)**: ~10K msg/s, predictable latency, low CPU
- **Aggressive (1ms, 1000 messages)**: ~100K+ msg/s, higher CPU, larger spikes
- **Conservative (100ms, 10 messages)**: ~100 msg/s, minimal CPU, very smooth

**When to tune:**
- **Increase throughput**: Batch processing, high-volume workloads
- **Decrease throughput**: Rate limiting, resource-constrained environments
- **Keep defaults**: Balanced performance for most local development use cases

### Error Handling

```typescript
subscription.on('message', async (message) => {
  try {
    await processMessage(message.data);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();  // Requeue for retry
  }
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});
```

## Message Ordering

Guarantee messages with the same key are delivered in order:

```typescript
const topic = pubsub.topic('user-events');
await topic.create();

topic.setPublishOptions({ messageOrdering: true });

const subscription = topic.subscription('event-processor');
await subscription.create({ enableMessageOrdering: true });

subscription.on('message', async (message) => {
  const userId = message.orderingKey;
  console.log(`Processing event for user ${userId} in order`);

  await updateUserState(userId, message.data);
  message.ack();
});

subscription.open();

// Publish events for a user - guaranteed to arrive in order
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

## Dead Letter Queues

Automatically move failed messages to a dead letter queue:

```typescript
// Create dead letter topic
const [dlqTopic] = await pubsub.createTopic('order-failures');

// Create subscription with DLQ
const [subscription] = await pubsub.createSubscription('orders', 'processor', {
  deadLetterPolicy: {
    deadLetterTopic: 'order-failures',
    maxDeliveryAttempts: 5
  }
});

// After 5 failed delivery attempts, message moves to DLQ automatically
```

## Schema Validation

Validate messages against JSON schemas:

```typescript
// Create a schema
const schema = pubsub.schema('order-schema');
await schema.create('JSON', JSON.stringify({
  type: 'object',
  properties: {
    orderId: { type: 'number' },
    amount: { type: 'number' }
  },
  required: ['orderId', 'amount']
}));

// Create topic with schema
const topic = pubsub.topic('orders');
await topic.create({
  schemaSettings: {
    schema: 'order-schema',
    encoding: 'JSON'
  }
});

// Valid messages pass
await topic.publishJSON({
  orderId: 123,
  amount: 99.99
});

// Invalid messages are rejected
await topic.publishJSON({
  orderId: 'invalid',  // Error: must be number
  amount: 99.99
});
```
