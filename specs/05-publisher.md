# Specification: Publisher

## Purpose

The Publisher handles message publishing with batching and flow control. Each Topic has its own Publisher instance that accumulates messages and publishes them in batches based on configurable thresholds (count, size, time).

## API Surface

### Constructor

```typescript
class Publisher {
  constructor(topic: Topic, options?: PublishOptions)
}
```

### Methods

```typescript
publish(data: Buffer, attributes?: Attributes, orderingKey?: string): Promise<string>
publishMessage(message: PubSubMessage): Promise<string>
flush(): Promise<void>
setOptions(options: PublishOptions): void
```

### Type Definitions

```typescript
interface PublishOptions {
  batching?: BatchingOptions;
  messageOrdering?: boolean;     // Default: false
  flowControlOptions?: FlowControlOptions;
}

interface BatchingOptions {
  maxMessages?: number;          // Default: 100
  maxMilliseconds?: number;      // Default: 10
  maxBytes?: number;             // Default: 1024 * 1024 (1MB)
}

interface FlowControlOptions {
  maxOutstandingMessages?: number;  // Default: Infinity
  maxOutstandingBytes?: number;     // Default: Infinity
}

interface PubSubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}
```

## Behavior Requirements

### BR-001: Message Batching
**Given** batching is enabled (default)
**When** messages are published
**Then** accumulate messages in a batch
**And** publish batch when ANY threshold is reached:
  - maxMessages count reached
  - maxMilliseconds time elapsed
  - maxBytes size reached

### BR-002: Batch Publish Atomicity
**Given** a batch contains multiple messages
**When** the batch is published to MessageQueue
**Then** all messages in batch receive unique message IDs
**And** all promises resolve with their respective message IDs
**And** all messages are routed atomically

### BR-003: Time-Based Batching
**Given** maxMilliseconds is set to 10ms (default)
**When** first message is added to empty batch
**Then** start timer for 10ms
**And** publish batch after 10ms even if other thresholds not reached

### BR-004: Count-Based Batching
**Given** maxMessages is set to 100 (default)
**When** 100th message is added to batch
**Then** immediately publish batch
**And** reset batch for next messages

### BR-005: Size-Based Batching
**Given** maxBytes is set to 1MB (default)
**When** adding message would exceed 1MB
**Then** publish current batch first
**And** start new batch with the new message

### BR-006: Flush Immediate Publish
**Given** messages are batched but not yet published
**When** `flush()` is called
**Then** immediately publish all pending batches
**And** wait for all publishes to complete
**And** return when all message IDs are assigned

### BR-007: Message Ordering Keys
**Given** messageOrdering is enabled
**When** messages with same orderingKey are published
**Then** maintain separate batch per orderingKey
**And** ensure ordered delivery to MessageQueue
**And** messages without orderingKey use default batch

### BR-008: Flow Control - Max Outstanding Messages
**Given** maxOutstandingMessages is set to N
**When** N messages are awaiting publish confirmation
**Then** block new publish() calls
**Until** previous messages are published and confirmed

### BR-009: Flow Control - Max Outstanding Bytes
**Given** maxOutstandingBytes is set to N bytes
**When** N bytes are awaiting publish confirmation
**Then** block new publish() calls
**Until** enough bytes are published to go below threshold

### BR-010: Disable Batching
**Given** all batching thresholds set to 1
**When** a message is published
**Then** publish immediately without batching

## Acceptance Criteria

### AC-001: Default Batching Behavior
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

// Default: maxMessages=100, maxMilliseconds=10, maxBytes=1MB
const promises = Array.from({ length: 50 }, (_, i) =>
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
);

const messageIds = await Promise.all(promises);

expect(messageIds).toHaveLength(50);
expect(messageIds.every(id => typeof id === 'string')).toBe(true);
```

### AC-002: Time-Based Batch Trigger
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 20,  // 20ms
    maxBytes: 10 * 1024 * 1024
  }
});

const startTime = Date.now();

// Publish just 5 messages
const promises = Array.from({ length: 5 }, (_, i) =>
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
);

const messageIds = await Promise.all(promises);
const duration = Date.now() - startTime;

// Should take ~20ms due to time-based batching
expect(duration).toBeGreaterThanOrEqual(15);
expect(duration).toBeLessThan(50);
expect(messageIds).toHaveLength(5);
```

### AC-003: Count-Based Batch Trigger
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 10,
    maxMilliseconds: 1000,
    maxBytes: 10 * 1024 * 1024
  }
});

const startTime = Date.now();

// Publish exactly 10 messages
const promises = Array.from({ length: 10 }, (_, i) =>
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
);

const messageIds = await Promise.all(promises);
const duration = Date.now() - startTime;

// Should publish immediately (count threshold)
expect(duration).toBeLessThan(50);
expect(messageIds).toHaveLength(10);
```

### AC-004: Size-Based Batch Trigger
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 1000,
    maxBytes: 1024  // 1KB
  }
});

// Each message is 512 bytes
const largeData = Buffer.alloc(512);

const promises = [
  topic.publishMessage({ data: largeData }),  // 512 bytes
  topic.publishMessage({ data: largeData }),  // 1024 bytes total - triggers
  topic.publishMessage({ data: largeData })   // New batch
];

const messageIds = await Promise.all(promises);
expect(messageIds).toHaveLength(3);
```

### AC-005: Flush Publishes Immediately
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 5000  // Long delay
  }
});

// Publish without awaiting
topic.publishMessage({ data: Buffer.from('test1') });
topic.publishMessage({ data: Buffer.from('test2') });

// Flush should complete immediately
const flushStart = Date.now();
await topic.flush();
const flushDuration = Date.now() - flushStart;

expect(flushDuration).toBeLessThan(100);  // Much less than 5000ms
```

### AC-006: Message Ordering Separate Batches
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  messageOrdering: true,
  batching: {
    maxMessages: 100,
    maxMilliseconds: 50
  }
});

// Publish messages with different ordering keys
await Promise.all([
  topic.publishMessage({
    data: Buffer.from('user-1-msg-1'),
    orderingKey: 'user-1'
  }),
  topic.publishMessage({
    data: Buffer.from('user-2-msg-1'),
    orderingKey: 'user-2'
  }),
  topic.publishMessage({
    data: Buffer.from('user-1-msg-2'),
    orderingKey: 'user-1'
  })
]);

// Verify ordering is maintained (test via subscription)
```

### AC-007: Flow Control Max Messages
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  flowControlOptions: {
    maxOutstandingMessages: 10
  },
  batching: {
    maxMessages: 5,
    maxMilliseconds: 100
  }
});

// Publish 15 messages quickly
const startTime = Date.now();
const promises = Array.from({ length: 15 }, (_, i) =>
  topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
);

await Promise.all(promises);
const duration = Date.now() - startTime;

// Should be throttled - takes longer than immediate
expect(duration).toBeGreaterThan(50);
```

### AC-008: Disable Batching
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 1,
    maxMilliseconds: 0,
    maxBytes: 1
  }
});

// Each message publishes immediately
const messageIds = await Promise.all([
  topic.publishMessage({ data: Buffer.from('test1') }),
  topic.publishMessage({ data: Buffer.from('test2') })
]);

expect(messageIds).toHaveLength(2);
```

### AC-009: Unique Message IDs
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

const messageIds = await Promise.all(
  Array.from({ length: 100 }, (_, i) =>
    topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
  )
);

// All message IDs should be unique
const uniqueIds = new Set(messageIds);
expect(uniqueIds.size).toBe(100);
```

### AC-010: Empty Message Batch
```typescript
const topic = pubsub.topic('my-topic');
await topic.create();

// Flush with no messages should not throw
await expect(topic.flush()).resolves.not.toThrow();
```

## Dependencies

- Topic (parent)
- BatchPublisher (internal, manages batch accumulation)
- FlowControl (internal, manages flow control)
- MessageQueue (singleton, receives published messages)

## Error Handling

### Invalid Message Data
```typescript
{
  code: 3,
  message: 'Message data must be a Buffer'
}
```

### Message Too Large
```typescript
{
  code: 3,
  message: 'Message size exceeds maximum of 10MB'
}
```

### Flow Control Timeout
```typescript
{
  code: 8,
  message: 'Flow control: max outstanding messages exceeded'
}
```

## Performance Considerations

- Default batching (100 msgs, 10ms, 1MB) optimized for most use cases
- Higher maxMessages increases throughput but increases latency
- Lower maxMilliseconds decreases latency but reduces batching efficiency
- Message ordering reduces throughput (separate batches per key)
- Flow control prevents memory exhaustion during high publish rates

## Implementation Notes

- Use Timer for maxMilliseconds (clear/reset on batch publish)
- Track batch size in bytes (sum of message.data.length)
- Message IDs should be unique strings (use uuid or incremental)
- Ordering keys require Map<orderingKey, Batch>
- Flow control blocks publish() promise until capacity available

## Examples

### High-Throughput Publishing
```typescript
const topic = pubsub.topic('high-volume');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 500,
    maxMilliseconds: 50,
    maxBytes: 5 * 1024 * 1024  // 5MB
  },
  flowControlOptions: {
    maxOutstandingMessages: 10000,
    maxOutstandingBytes: 50 * 1024 * 1024  // 50MB
  }
});

// Publish thousands of messages
for (let i = 0; i < 10000; i++) {
  topic.publishMessage({
    data: Buffer.from(`Message ${i}`)
  });
}

await topic.flush();
```

### Low-Latency Publishing
```typescript
const topic = pubsub.topic('real-time');
await topic.create();

topic.setPublishOptions({
  batching: {
    maxMessages: 10,
    maxMilliseconds: 1,  // 1ms
    maxBytes: 100 * 1024  // 100KB
  }
});

// Messages publish within ~1ms
const messageId = await topic.publishMessage({
  data: Buffer.from('urgent message')
});
```

### Ordered Publishing with Batching
```typescript
const topic = pubsub.topic('user-events');
await topic.create();

topic.setPublishOptions({
  messageOrdering: true,
  batching: {
    maxMessages: 50,
    maxMilliseconds: 20
  }
});

// Multiple users, messages batched per user
const users = ['user-1', 'user-2', 'user-3'];
for (let i = 0; i < 100; i++) {
  const user = users[i % users.length];
  topic.publishMessage({
    data: Buffer.from(`Event ${i}`),
    orderingKey: user
  });
}

await topic.flush();
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
