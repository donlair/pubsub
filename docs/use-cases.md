# Use Cases

This guide demonstrates common use cases for the Pub/Sub library.

## Local Development

No cloud setup needed - just start coding:

```typescript
// No cloud setup needed - just start coding
const pubsub = new PubSub();
const topic = pubsub.topic('dev-events');
await topic.create();

// Develop your event-driven architecture locally
```

**Benefits:**
- No emulators to install or configure
- No cloud credentials required
- Instant startup for rapid iteration
- Works offline

## Testing & CI/CD

Fast, in-memory testing:

```typescript
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

**Benefits:**
- Fast test execution (in-memory, no I/O)
- Deterministic behavior (no network flakiness)
- Easy to set up and tear down
- Perfect for CI/CD pipelines

## Prototyping Event-Driven Systems

Quickly prototype event flows:

```typescript
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

**Benefits:**
- Rapidly test different event-driven architectures
- Multiple services consuming the same events
- Easy to add/remove subscribers
- Validate patterns before cloud deployment

## Migration Strategy

Start local, migrate to cloud when ready:

### Phase 1: Local Development
```typescript
import { PubSub } from 'pubsub';
const pubsub = new PubSub();
```

### Phase 2: Integration Testing
```typescript
// Use environment variable to switch
const pubsub = process.env.USE_GCP_PUBSUB
  ? new (await import('@google-cloud/pubsub')).PubSub({ projectId: 'test-project' })
  : new (await import('pubsub')).PubSub();
```

### Phase 3: Production
```typescript
import { PubSub } from '@google-cloud/pubsub';
const pubsub = new PubSub({
  projectId: 'your-project',
  keyFilename: 'path/to/credentials.json'
});
```

**All your code stays the same** - just change the import and configuration!
