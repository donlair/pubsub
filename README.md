# Pub/Sub - Local Development Library

A lightweight, in-memory Pub/Sub implementation with API-compatible core features for Google Cloud Pub/Sub. Start developing locally without cloud dependencies, then migrate to Google Cloud when you're ready to scale.

## Why Use This?

**Start Fast, Scale Later**
- No emulators, no cloud setup, no credentials during development
- API-compatible with `@google-cloud/pubsub` for core publish/subscribe operations
- Perfect for single-process apps, testing, and CI/CD pipelines

**Real Pub/Sub Features**
- Message ordering and delivery guarantees
- Dead letter queues and retry policies
- Flow control and batching
- EventEmitter-based subscriptions
- Schema validation (JSON only - local extension)

**Migration Path**
```typescript
// Development
import { PubSub } from 'pubsub';
const pubsub = new PubSub();

// Production (change import + add config)
import { PubSub } from '@google-cloud/pubsub';
const pubsub = new PubSub({ projectId: 'your-project' });

// Core pub/sub code works unchanged
// See "Migration to Google Cloud" section for schema/IAM/snapshot changes
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

## Core Features

- **Publishing** - Simple publishing, batching, JSON support → [See examples](docs/features.md#publishing)
- **Subscribing** - EventEmitter-based, flow control, error handling → [See examples](docs/features.md#subscribing)
- **Throughput Tuning** - Configure pull intervals and batch sizes → [See examples](docs/features.md#throughput-tuning)
- **Message Ordering** - Sequential delivery per ordering key → [See examples](docs/features.md#message-ordering)
- **Dead Letter Queues** - Automatic failed message handling → [See examples](docs/features.md#dead-letter-queues)
- **Schema Validation** - JSON schema enforcement → [See examples](docs/features.md#schema-validation)

**📖 Full feature documentation and code examples:** [docs/features.md](docs/features.md)

## Architecture

This library is an **in-memory, single-process** Pub/Sub emulator. All publishers and subscribers share state through an in-memory singleton - there is no network layer.

```
┌─────────────────────────────────────────────────┐
│  Single Node/Bun Process                        │
│                                                 │
│  ┌─────────┐       ┌──────────────┐            │
│  │ Publisher│──────▶│              │            │
│  └─────────┘       │ MessageQueue │            │
│                    │  (singleton) │            │
│  ┌─────────┐       │              │            │
│  │Subscriber│◀─────│  In-Memory   │            │
│  └─────────┘       └──────────────┘            │
└─────────────────────────────────────────────────┘
```

**This means:**
- ✅ Multiple services/modules in the same process can communicate
- ✅ Unit tests, integration tests, and CI/CD pipelines work perfectly
- ❌ Separate processes cannot communicate (no IPC/network layer)
- ❌ Multiple instances of your app have isolated message queues

**For multi-process local development**, use [Google's Pub/Sub Emulator](https://cloud.google.com/pubsub/docs/emulator) instead.

## Use Cases

Perfect for local development, testing, and prototyping event-driven systems. [See detailed use cases and examples →](docs/use-cases.md)

## Recommended Setup for Easy Migration

Structure your code to swap implementations without changes to business logic:

### Option 1: Factory Function (Simplest)

```typescript
// lib/pubsub.ts
import type { PubSub as PubSubType } from '@google-cloud/pubsub';

export async function createPubSub(): Promise<PubSubType> {
  if (process.env.NODE_ENV === 'production') {
    const { PubSub } = await import('@google-cloud/pubsub');
    return new PubSub({ projectId: process.env.GCP_PROJECT_ID });
  }
  const { PubSub } = await import('pubsub');
  return new PubSub() as unknown as PubSubType;
}

// Usage - same everywhere
const pubsub = await createPubSub();
const [topic] = await pubsub.createTopic('orders');
```

### Option 2: Dependency Injection

```typescript
// services/order-service.ts
import type { PubSub, Topic } from '@google-cloud/pubsub';

export class OrderService {
  constructor(private pubsub: PubSub) {}

  async publishOrder(order: Order) {
    const topic = this.pubsub.topic('orders');
    await topic.publishJSON(order);
  }
}

// main.ts - inject the appropriate implementation
const pubsub = await createPubSub();
const orderService = new OrderService(pubsub);
```

### Option 3: Message Bus Abstraction

```typescript
// lib/message-bus.ts
import type { PubSub } from '@google-cloud/pubsub';

export class MessageBus {
  private pubsub: PubSub;

  constructor(pubsub: PubSub) {
    this.pubsub = pubsub;
  }

  async publish<T>(topicName: string, data: T, attributes?: Record<string, string>) {
    const topic = this.pubsub.topic(topicName);
    return topic.publishJSON(data, attributes);
  }

  async subscribe(topicName: string, subscriptionName: string, handler: (data: unknown) => Promise<void>) {
    const subscription = this.pubsub.subscription(subscriptionName);
    subscription.on('message', async (message) => {
      try {
        await handler(JSON.parse(message.data.toString()));
        message.ack();
      } catch (error) {
        message.nack();
      }
    });
    subscription.open();
    return subscription;
  }
}

// Usage - completely implementation-agnostic
const bus = new MessageBus(await createPubSub());
await bus.publish('orders', { orderId: 123 });
```

### Testing Strategy

```typescript
// tests/order-service.test.ts
import { PubSub } from 'pubsub'; // Always use local for tests

test('publishes order events', async () => {
  const pubsub = new PubSub();
  const [topic] = await pubsub.createTopic('orders');
  const [subscription] = await topic.createSubscription('test');

  const orderService = new OrderService(pubsub);

  const received: Order[] = [];
  subscription.on('message', (msg) => {
    received.push(JSON.parse(msg.data.toString()));
    msg.ack();
  });
  subscription.open();

  await orderService.publishOrder({ orderId: 123, amount: 99.99 });
  await new Promise(r => setTimeout(r, 50)); // Let message deliver

  expect(received).toHaveLength(1);
  expect(received[0].orderId).toBe(123);
});
```

## Migration to Google Cloud

**Core publish/subscribe code works unchanged** - just update the import:

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
```

**What changes automatically:**
- Transport: in-memory → gRPC network calls
- Storage: process memory → Google Cloud infrastructure
- Scale: single-process → distributed, multi-region

**Features requiring code changes:**
- **Schemas** - Replace JSON Schema with AVRO or Protocol Buffers (recommended: keep [Zod](https://zod.dev) client-side validation)
- **IAM** - Add IAM policy management if using access control
- **Snapshots** - Add snapshot/seek functionality if using message replay
- **Push subscriptions** - Configure push endpoints if using push delivery

[See migration guide →](docs/use-cases.md#migration-strategy)

## Performance

Optimized for **local development and testing**, not high-throughput production.

| Environment | Simulates | Throughput | P99 Latency |
|-------------|-----------|------------|-------------|
| **Native** | Dev machine | 8,000 msg/s | 1,200ms |
| **Micro** | t3.micro / e2-micro | 4,000 msg/s | 2,300ms |

*10K messages, 1KB payload*

**Best for:** Local development, testing, CI/CD, workloads < 5K msg/s
**Not for:** High-throughput production (> 10K msg/s), durable storage, multi-datacenter replication

[Complete performance guide and benchmarking →](docs/performance.md)

## Limitations

**Architecture:**
- **Single-Process Only** - No network/IPC layer; publishers and subscribers must be in the same process
- **In-Memory Only** - Messages don't persist across restarts
- **Throughput** - Optimized for < 5K msg/s; not for high-throughput production

**Unimplemented Features** (throw `UnimplementedError`):
- **AVRO Schemas** - Validation not implemented (JSON Schema only)
- **Protocol Buffer Schemas** - Validation not implemented (JSON Schema only)
- **IAM Operations** - `getPolicy()`, `setPolicy()`, `testPermissions()` not implemented
- **Snapshots** - `create()`, `delete()`, `seek()`, `getMetadata()` not implemented
- **Push Subscriptions** - `modifyPushConfig()` returns empty response

**⚠️ Breaking Change on Migration:**
- **JSON Schema is a local-only extension** - Not supported by Google Cloud Pub/Sub. Use AVRO or Protocol Buffers for production.

## API Compatibility

This library matches the `@google-cloud/pubsub` **API surface** (method signatures, return types, error codes) - not the distributed messaging capability. Your code works unchanged; only the transport differs (in-memory vs. network).

**Core Features** - Fully compatible with `@google-cloud/pubsub` v5.2.0+:
- ✅ Publishing (simple, batched, ordered)
- ✅ Subscribing (pull, streaming, flow control)
- ✅ Topics and subscriptions (create, delete, list, metadata)
- ✅ Message acknowledgment (ack, nack, modifyAckDeadline)
- ✅ Dead letter queues
- ✅ Error codes (gRPC status codes)

**Advanced Features** - API signatures match, but functionality limited:
- ⚠️ Schemas (JSON only; AVRO/Protobuf unimplemented)
- ⚠️ IAM (methods exist but throw `UnimplementedError`)
- ⚠️ Snapshots (methods exist but throw `UnimplementedError`)
- ⚠️ Push subscriptions (stub implementation)

See [Google Cloud Pub/Sub docs](https://cloud.google.com/pubsub/docs) for complete API reference.

## Development

```bash
bun install          # Install dependencies
bun test             # Run tests
bun run verify       # Full verification (typecheck + lint + tests)
```

[Complete development guide →](docs/development.md)

## Documentation

- **[Features Guide](docs/features.md)** - Detailed feature examples and code
- **[Use Cases](docs/use-cases.md)** - Common use cases and patterns
- **[Performance Guide](docs/performance.md)** - Benchmarking and capacity planning
- **[Development Guide](docs/development.md)** - Contributing and testing
- **[API Reference](https://cloud.google.com/pubsub/docs)** - Google Cloud Pub/Sub docs (compatible)
- **[Specifications](specs/)** - Component specifications

## Technology

**Runtime:** [Bun](https://bun.sh) | **Language:** TypeScript (strict) | **Tests:** 486 passing | **Benchmarks:** 9 scenarios

## License

MIT
