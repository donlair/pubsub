# Pub/Sub - Local Development Library

A lightweight, in-memory Pub/Sub implementation with API-compatible core features for Google Cloud Pub/Sub. Start developing locally without cloud dependencies, then migrate to Google Cloud when you're ready to scale.

## Why Use This?

**Start Fast, Scale Later**
- No emulators, no cloud setup, no credentials during development
- API-compatible with `@google-cloud/pubsub` for core publish/subscribe operations
- Perfect for local development, testing, and CI/CD pipelines

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

## Use Cases

Perfect for local development, testing, and prototyping event-driven systems. [See detailed use cases and examples →](docs/use-cases.md)

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

**Features requiring code changes:**
- **Schemas** - Replace JSON Schema with AVRO or Protocol Buffers (or implement client-side validation)
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

**Storage & Scale:**
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
