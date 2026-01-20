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

Start local, migrate to cloud when ready.

### Project Structure

```
src/
├── lib/
│   └── pubsub.ts          # Factory function - swap implementation here
├── services/
│   ├── order-service.ts   # Business logic - never changes
│   └── inventory-service.ts
├── handlers/
│   └── order-handlers.ts  # Message handlers - never changes
└── main.ts                # Wires everything together
```

### Phase 1: Local Development

Create a factory function that returns the appropriate implementation:

```typescript
// src/lib/pubsub.ts
import type { PubSub as PubSubType } from '@google-cloud/pubsub';

export type PubSubClient = PubSubType;

export async function createPubSub(): Promise<PubSubClient> {
  // Local development - in-memory, no setup required
  const { PubSub } = await import('pubsub');
  return new PubSub() as unknown as PubSubClient;
}
```

Your services use the factory and never import PubSub directly:

```typescript
// src/services/order-service.ts
import type { PubSubClient } from '../lib/pubsub';
import type { Order } from '../types';

export class OrderService {
  private topic;

  constructor(private pubsub: PubSubClient) {
    this.topic = pubsub.topic('orders');
  }

  async createOrder(order: Order): Promise<string> {
    // Business logic here...
    const messageId = await this.topic.publishJSON({
      type: 'order.created',
      data: order,
      timestamp: Date.now()
    });
    return messageId;
  }
}
```

### Phase 2: Add Environment Switching

Update the factory to support both implementations:

```typescript
// src/lib/pubsub.ts
import type { PubSub as PubSubType } from '@google-cloud/pubsub';

export type PubSubClient = PubSubType;

interface PubSubConfig {
  projectId?: string;
  keyFilename?: string;
}

export async function createPubSub(config?: PubSubConfig): Promise<PubSubClient> {
  const useCloud = process.env.USE_CLOUD_PUBSUB === 'true'
    || process.env.NODE_ENV === 'production';

  if (useCloud) {
    const { PubSub } = await import('@google-cloud/pubsub');
    return new PubSub({
      projectId: config?.projectId || process.env.GCP_PROJECT_ID,
      keyFilename: config?.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  const { PubSub } = await import('pubsub');
  return new PubSub() as unknown as PubSubClient;
}
```

Now you can test against real Pub/Sub in staging:

```bash
# Local development (default)
bun run dev

# Test against real Pub/Sub
USE_CLOUD_PUBSUB=true GCP_PROJECT_ID=my-project bun run dev
```

### Phase 3: Production

In production, the factory automatically uses Google Cloud Pub/Sub:

```typescript
// src/main.ts
import { createPubSub } from './lib/pubsub';
import { OrderService } from './services/order-service';

async function main() {
  const pubsub = await createPubSub();

  // Ensure topics/subscriptions exist
  const [topic] = await pubsub.createTopic('orders').catch(() =>
    pubsub.topic('orders').get()
  );

  const orderService = new OrderService(pubsub);

  // Start your app...
}
```

**Your business logic never changes** - only the factory function knows which implementation to use.

### Message Handler Pattern

Keep message handlers separate from Pub/Sub wiring:

```typescript
// src/handlers/order-handlers.ts
import type { Order } from '../types';
import { InventoryService } from '../services/inventory-service';

export function createOrderHandlers(inventoryService: InventoryService) {
  return {
    async handleOrderCreated(data: { type: string; data: Order }) {
      if (data.type !== 'order.created') return;

      await inventoryService.reserveItems(data.data.items);
      console.log(`Reserved inventory for order ${data.data.orderId}`);
    }
  };
}
```

Wire them up in main:

```typescript
// src/main.ts
import { createPubSub } from './lib/pubsub';
import { createOrderHandlers } from './handlers/order-handlers';

async function main() {
  const pubsub = await createPubSub();
  const handlers = createOrderHandlers(inventoryService);

  const subscription = pubsub.subscription('inventory-service');
  subscription.on('message', async (message) => {
    try {
      const data = JSON.parse(message.data.toString());
      await handlers.handleOrderCreated(data);
      message.ack();
    } catch (error) {
      console.error('Handler error:', error);
      message.nack();
    }
  });
  subscription.open();
}
```

### Testing Strategy

Always use the local library for tests - fast, deterministic, no credentials:

```typescript
// tests/order-service.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from 'pubsub';
import { OrderService } from '../src/services/order-service';

let pubsub: PubSub;

beforeEach(async () => {
  pubsub = new PubSub();
  await pubsub.createTopic('orders');
});

afterEach(async () => {
  await pubsub.close(); // Cleans up all state
});

test('createOrder publishes order.created event', async () => {
  const [subscription] = await pubsub.createSubscription('orders', 'test');

  const received: unknown[] = [];
  subscription.on('message', (msg) => {
    received.push(JSON.parse(msg.data.toString()));
    msg.ack();
  });
  subscription.open();

  const orderService = new OrderService(pubsub);
  await orderService.createOrder({ orderId: 123, items: [], amount: 99.99 });

  // Wait for async message delivery
  await new Promise(r => setTimeout(r, 50));

  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({
    type: 'order.created',
    data: { orderId: 123 }
  });
});
```

### Schema Validation Strategy

Use [Zod](https://zod.dev) for type-safe validation that works with both implementations:

```typescript
// src/schemas/order.ts
import { z } from 'zod';

export const OrderEventSchema = z.object({
  type: z.enum(['order.created', 'order.updated', 'order.cancelled']),
  data: z.object({
    orderId: z.number(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().int().positive()
    })),
    amount: z.number().positive()
  }),
  timestamp: z.number()
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;
```

Validate before publishing:

```typescript
// src/services/order-service.ts
import { OrderEventSchema, type OrderEvent } from '../schemas/order';

export class OrderService {
  async createOrder(order: Order): Promise<string> {
    const event: OrderEvent = {
      type: 'order.created',
      data: order,
      timestamp: Date.now()
    };

    // Validate before publishing - fails fast with clear errors
    OrderEventSchema.parse(event);

    return this.topic.publishJSON(event);
  }
}
```

Validate when receiving:

```typescript
subscription.on('message', async (message) => {
  try {
    const raw = JSON.parse(message.data.toString());
    const event = OrderEventSchema.parse(raw); // Type-safe from here

    await handlers.handleOrderCreated(event);
    message.ack();
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid message schema:', error.errors);
      message.ack(); // Don't retry invalid messages
    } else {
      message.nack(); // Retry processing errors
    }
  }
});
```

### Checklist: Migration-Ready Code

- [ ] PubSub instantiation goes through a factory function
- [ ] Services receive PubSub as a constructor parameter (dependency injection)
- [ ] Message handlers are pure functions, separate from Pub/Sub wiring
- [ ] Schemas defined with Zod for type-safe validation
- [ ] Tests use local library directly (fast, deterministic)
- [ ] Environment variables control which implementation to use
- [ ] No direct imports of `pubsub` or `@google-cloud/pubsub` in business logic
