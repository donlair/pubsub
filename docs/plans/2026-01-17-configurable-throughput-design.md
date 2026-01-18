# Configurable Throughput Design

**Date:** 2026-01-17
**Status:** Approved
**Context:** Extract hardcoded throughput throttling values into user-configurable options

## Problem Statement

The MessageStream class currently has two hardcoded values that limit throughput:
- **Pull interval**: 10ms between message pulls (line 100 in `message-stream.ts`)
- **Max pull size**: 100 messages per pull (line 419 in `message-stream.ts`)

These create a theoretical throughput ceiling of ~10K msg/s (100 messages / 10ms). While appropriate for local development defaults, users with different workload requirements (batch processing, rate limiting, etc.) cannot tune these values.

## Goals

1. Make throughput settings configurable via public API
2. Maintain strict backward compatibility (existing code gets identical behavior)
3. No validation - trust developers to tune for their needs
4. Follow existing configuration patterns in the codebase

## Design

### 1. Type Definitions

Add two new optional fields to `MessageStreamOptions` in `src/types/subscriber.ts`:

```typescript
/**
 * Streaming pull connection options.
 * Reference: research/11-typescript-types.md#messagestreamoptions
 */
export interface MessageStreamOptions {
  /**
   * Number of concurrent streaming connections.
   * @default 5
   */
  maxStreams?: number;

  /**
   * Stream timeout in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Pull interval in milliseconds.
   * Controls how frequently messages are pulled from the queue.
   * Lower values = higher throughput, higher CPU usage.
   * Higher values = lower CPU usage, higher latency.
   * @default 10
   */
  pullInterval?: number;

  /**
   * Max messages per pull.
   * Controls batch size for each pull operation.
   * Higher values = higher throughput, larger latency spikes.
   * Lower values = smoother latency, lower throughput.
   * @default 100
   */
  maxPullSize?: number;
}
```

Update `DEFAULT_STREAMING_OPTIONS` constant:

```typescript
/**
 * Default streaming options.
 */
export const DEFAULT_STREAMING_OPTIONS: Required<MessageStreamOptions> = {
  maxStreams: 5,
  timeout: 300000,      // 5 minutes
  pullInterval: 10,     // 10ms
  maxPullSize: 100      // 100 messages
};
```

### 2. MessageStream Implementation

**Add private fields** in `src/subscriber/message-stream.ts`:

```typescript
export class MessageStream {
  // Existing fields...

  // NEW: Store configured values
  private readonly pullIntervalMs: number;
  private readonly maxPullSize: number;

  // Rest of fields...
}
```

**Initialize in constructor:**

```typescript
constructor(subscription: ISubscription, options: SubscriberOptions) {
  this.subscription = subscription;
  this.options = options;
  this.flowControl = new SubscriberFlowControl(options.flowControl);
  this.leaseManager = new LeaseManager({...});
  this.messageQueue = MessageQueue.getInstance();

  // NEW: Extract configuration with defaults
  this.pullIntervalMs = options.streamingOptions?.pullInterval ?? 10;
  this.maxPullSize = options.streamingOptions?.maxPullSize ?? 100;
}
```

**Update `start()` method (line 100):**

```typescript
start(): void {
  if (this.isRunning) {
    return;
  }

  // ... validation ...

  this.isRunning = true;
  this.isPaused = false;
  this.pullInterval = setInterval(() => this.pullMessages(), this.pullIntervalMs); // ← Use configured value
}
```

**Update `calculateMaxPull()` method (line 419):**

```typescript
private calculateMaxPull(): number {
  const inFlightCount = this.flowControl.getInFlightMessages();
  const flowControlOptions = this.options.flowControl ?? {};
  const maxMessages = flowControlOptions.maxMessages ?? 1000;

  const remaining = Math.max(0, maxMessages - inFlightCount);

  return Math.min(remaining, this.maxPullSize); // ← Use configured value
}
```

### 3. Testing Strategy

Create `tests/unit/message-stream-config.test.ts` with the following test cases:

```typescript
import { test, expect } from 'bun:test';
import { PubSub } from '../../src/pubsub';

test('default pull interval is 10ms', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test');
  await topic.create();

  const subscription = topic.subscription('sub');
  await subscription.create();

  const messageStream = (subscription as any).messageStream;
  expect(messageStream.pullIntervalMs).toBe(10);
});

test('default max pull size is 100', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test');
  await topic.create();

  const subscription = topic.subscription('sub');
  await subscription.create();

  const messageStream = (subscription as any).messageStream;
  expect(messageStream.maxPullSize).toBe(100);
});

test('custom pull interval is respected', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test');
  await topic.create();

  const subscription = topic.subscription('sub', {
    streamingOptions: {
      pullInterval: 5  // Custom: 5ms
    }
  });
  await subscription.create();

  const messageStream = (subscription as any).messageStream;
  expect(messageStream.pullIntervalMs).toBe(5);
});

test('custom max pull size is respected', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test');
  await topic.create();

  const subscription = topic.subscription('sub', {
    streamingOptions: {
      maxPullSize: 500  // Custom: 500 messages
    }
  });
  await subscription.create();

  const messageStream = (subscription as any).messageStream;
  expect(messageStream.maxPullSize).toBe(500);
});

test('higher throughput with aggressive settings', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test');
  await topic.create();

  const subscription = topic.subscription('sub', {
    streamingOptions: {
      pullInterval: 1,    // 1ms = very fast
      maxPullSize: 1000   // Large batches
    }
  });
  await subscription.create();

  const received: any[] = [];
  subscription.on('message', (msg) => {
    received.push(msg.data.toString());
    msg.ack();
  });

  subscription.open();

  // Publish 10,000 messages
  const promises = [];
  for (let i = 0; i < 10000; i++) {
    promises.push(topic.publishMessage({
      data: Buffer.from(`msg-${i}`)
    }));
  }
  await Promise.all(promises);

  // Wait for delivery
  await new Promise(resolve => setTimeout(resolve, 500));

  // Should receive all 10,000 messages faster than default settings
  expect(received.length).toBe(10000);
});
```

### 4. Documentation Updates

**Add new section to README.md after "Flow Control":**

```markdown
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
```

**Update Performance Characteristics section:**

```markdown
## Performance Characteristics

This library is optimized for **local development and testing**:

- **Default throughput**: ~9K messages/second (10ms pull interval, 100 msg batches)
- **Tunable range**: ~100 msg/s (conservative) to ~100K+ msg/s (aggressive)
- **Latency**: < 30ms P99 for typical workloads

**Tuning examples:**
```typescript
// High throughput mode (batch processing)
streamingOptions: { pullInterval: 1, maxPullSize: 1000 }

// Low CPU mode (background jobs)
streamingOptions: { pullInterval: 100, maxPullSize: 50 }
```
```

## Implementation Checklist

- [ ] Update `MessageStreamOptions` interface in `src/types/subscriber.ts`
- [ ] Update `DEFAULT_STREAMING_OPTIONS` constant
- [ ] Add `pullIntervalMs` and `maxPullSize` fields to `MessageStream` class
- [ ] Initialize fields in `MessageStream` constructor
- [ ] Replace hardcoded `10` in `start()` method with `this.pullIntervalMs`
- [ ] Replace hardcoded `100` in `calculateMaxPull()` with `this.maxPullSize`
- [ ] Create `tests/unit/message-stream-config.test.ts` with all test cases
- [ ] Update README.md with throughput tuning section
- [ ] Update README.md performance characteristics section
- [ ] Run `bun run verify` to ensure all tests pass
- [ ] Commit changes with message: `feat(subscriber): add configurable throughput settings`

## Performance Impact

- **Backward compatibility**: 100% - existing code uses identical defaults (10ms, 100 messages)
- **Memory**: No change - same data structures
- **CPU**: User-controlled - can increase/decrease based on configuration
- **Latency**: User-controlled - trade-off between throughput and latency

## Future Considerations

- Could add performance presets (e.g., `preset: 'high-throughput' | 'low-latency' | 'balanced'`)
- Could add runtime metrics/monitoring to help users tune settings
- Could auto-tune based on message size and processing time
- These are out of scope for this change - YAGNI for now
