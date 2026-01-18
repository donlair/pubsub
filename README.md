# Pub/Sub - Local Development Library

A lightweight, in-memory Pub/Sub implementation that's 100% API-compatible with Google Cloud Pub/Sub. Start developing locally without cloud dependencies, then seamlessly migrate to Google Cloud when you're ready to scale.

## Why Use This?

**Start Fast, Scale Later**
- No emulators, no cloud setup, no credentials during development
- Drop-in compatible with `@google-cloud/pubsub` - just change the import
- Perfect for local development, testing, and CI/CD pipelines

**Real Pub/Sub Features**
- Message ordering and delivery guarantees
- Dead letter queues and retry policies
- Flow control and batching
- JSON Schema validation
- EventEmitter-based subscriptions

**Production-Ready Migration Path**
```typescript
// Development
import { PubSub } from 'pubsub';
const pubsub = new PubSub();

// Production (just change the import)
import { PubSub } from '@google-cloud/pubsub';
const pubsub = new PubSub({ projectId: 'your-project' });
```

## Quick Start

### Installation

```bash
bun install @your-org/pubsub
```

### Basic Example

```typescript
import { PubSub } from 'pubsub';

const pubsub = new PubSub();

// Create a topic
const [topic] = await pubsub.createTopic('orders');

// Create a subscription
const [subscription] = await pubsub.createSubscription('orders', 'order-processor');

// Listen for messages
subscription.on('message', (message) => {
  console.log('Received:', message.data.toString());
  console.log('Attributes:', message.attributes);

  // Process the message
  processOrder(JSON.parse(message.data.toString()));

  // Acknowledge when done
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

subscription.open();

// Publish messages
await topic.publishMessage({
  data: Buffer.from(JSON.stringify({ orderId: 123, amount: 99.99 })),
  attributes: { type: 'order.created', version: '1.0' }
});
```

## Features

### Publishing

**Simple Publishing**
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

**Batching**
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

### Subscribing

**EventEmitter-Based Subscriptions**
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

**Flow Control**
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

**Error Handling**
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

### Message Ordering

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

### Dead Letter Queues

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

### Schema Validation

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

## Use Cases

### Local Development
```typescript
// No cloud setup needed - just start coding
const pubsub = new PubSub();
const topic = pubsub.topic('dev-events');
await topic.create();

// Develop your event-driven architecture locally
```

### Testing & CI/CD
```typescript
// Fast, in-memory testing
import { test, expect } from 'bun:test';
import { PubSub } from 'pubsub';

test('order processing', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('orders');
  await topic.create();

  const subscription = topic.subscription('test-sub');
  await subscription.create();

  const received: any[] = [];
  subscription.on('message', (msg) => {
    received.push(JSON.parse(msg.data.toString()));
    msg.ack();
  });

  subscription.open();

  await topic.publishJSON({ orderId: 123 });
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(received).toHaveLength(1);
  expect(received[0].orderId).toBe(123);
});
```

### Prototyping Event-Driven Systems
```typescript
// Quickly prototype event flows
const pubsub = new PubSub();

// Order events
const orders = pubsub.topic('orders');
await orders.create();

// Inventory service listens
const inventory = orders.subscription('inventory-service');
await inventory.create();
inventory.on('message', (msg) => {
  updateInventory(JSON.parse(msg.data.toString()));
  msg.ack();
});
inventory.open();

// Shipping service listens
const shipping = orders.subscription('shipping-service');
await shipping.create();
shipping.on('message', (msg) => {
  createShipment(JSON.parse(msg.data.toString()));
  msg.ack();
});
shipping.open();

// One event, multiple consumers
await orders.publishJSON({ orderId: 123, items: [...] });
```

## Migration to Google Cloud

When you're ready for production scale, just change the import:

```typescript
// Before (local development)
import { PubSub } from 'pubsub';
const pubsub = new PubSub();

// After (Google Cloud)
import { PubSub } from '@google-cloud/pubsub';
const pubsub = new PubSub({
  projectId: 'your-project',
  keyFilename: 'path/to/credentials.json'
});

// Everything else stays the same!
```

## Performance Characteristics

This library is optimized for **local development and testing**, not high-throughput production:

- **Default throughput**: ~9K messages/second (10ms pull interval, 100 msg batches)
- **Tunable range**: ~100 msg/s (conservative) to ~100K+ msg/s (aggressive)
- **Publishing**: 200-400K messages/second (in-memory writes)
- **End-to-End**: ~9K messages/second (publish → subscribe → ack)
- **Burst Capacity**: 262K messages/second (1,000 concurrent publishers)
- **Fan-out**: 5,000 deliveries/second (100 msg/s × 50 subscribers)
- **Latency**: < 30ms P99 for typical workloads
- **Memory**: < 100MB for typical usage

**Tuning examples:**
```typescript
// High throughput mode (batch processing)
streamingOptions: { pullInterval: 1, maxPullSize: 1000 }

// Low CPU mode (background jobs)
streamingOptions: { pullInterval: 100, maxPullSize: 50 }
```

**Best For**:
- Local development and testing
- CI/CD pipelines
- Low-to-medium traffic workloads (< 5K msg/s with defaults)
- Prototyping event-driven architectures

**Not For**:
- High-throughput production (> 10K msg/s sustained without tuning)
- Durable message storage (in-memory only)
- Multi-datacenter replication

## Limitations

**In-Memory Only**
- Messages don't persist across restarts
- Not suitable for scenarios requiring durability

**Schema Support**
- ✅ JSON Schema (fully supported)
- ⚠️ AVRO/Protocol Buffers (stubbed - use Google Cloud for these)

**Cloud Features**
- IAM and snapshots have API signatures but limited functionality
- Some advanced features are stubs for compatibility

## API Compatibility

This library implements the same API as `@google-cloud/pubsub` v5.2.0+:
- Same method signatures and return types
- Same error codes (gRPC status codes)
- Same event names and behaviors
- Same default configuration values

See Google's [Pub/Sub documentation](https://cloud.google.com/pubsub/docs) for complete API reference.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Type check
bun run typecheck

# Lint
bun run lint

# Full verification (typecheck + lint + tests)
bun run verify
```

## Technology

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **Language**: TypeScript with strict mode
- **Testing**: `bun test` with 486 passing tests
- **Performance**: 9 benchmark scenarios validating performance

## Documentation

- **API Reference**: Compatible with [Google Cloud Pub/Sub docs](https://cloud.google.com/pubsub/docs)
- **Specifications**: See `specs/` for detailed component specifications
- **Benchmarks**: See `bench/` for performance testing methodology
- **Examples**: See usage examples above

## License

MIT

---

**Ready to build event-driven systems without cloud dependencies?** Install and start coding in seconds.
