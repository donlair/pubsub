# Google Cloud Pub/Sub Subscriber Configuration

## Overview

Subscriber configuration controls message flow, acknowledgment behavior, and resource usage for message consumption.

## SubscriberOptions Interface

```typescript
interface SubscriberOptions {
  ackDeadline?: number;
  flowControl?: FlowControlOptions;
  batching?: BatchOptions;
  streamingOptions?: StreamingOptions;
}
```

## Acknowledgment Deadline

Time (in seconds) a message has before being redelivered if not acknowledged.

### Configuration

```typescript
const subscription = pubsub.subscription('my-subscription', {
  ackDeadline: 60 // 60 seconds
});
```

### Default Value

- **Default**: 10 seconds
- **Range**: 10-600 seconds (10 seconds to 10 minutes)

### When to Adjust

- **Increase** for long-running processing
- **Decrease** for fast processing with quick retries
- Consider processing time + network latency

### Example

```typescript
// Long processing time
const batchSubscription = pubsub.subscription('batch-jobs', {
  ackDeadline: 600 // 10 minutes for batch processing
});

// Quick processing
const realtimeSubscription = pubsub.subscription('realtime', {
  ackDeadline: 10 // 10 seconds for fast processing
});
```

## Flow Control

Controls memory usage and concurrency by limiting outstanding messages.

> **See also:** [Advanced Features - Flow Control](08-advanced-features.md#flow-control) for in-depth discussion and advanced patterns.

### FlowControlOptions

```typescript
interface FlowControlOptions {
  maxMessages?: number;
  maxBytes?: number;
  allowExcessMessages?: boolean;
}
```

### Properties

**maxMessages** (number)
- Maximum number of unacknowledged messages
- Default: 1000
- Controls concurrency

**maxBytes** (number)
- Maximum bytes of unacknowledged messages
- Default: 100 MB (100 * 1024 * 1024)
- Controls memory usage

**allowExcessMessages** (boolean)
- Allow messages beyond limit if already in flight
- Default: false
- Set to true to prevent message loss

### Configuration

```typescript
const subscription = pubsub.subscription('my-subscription', {
  flowControl: {
    maxMessages: 500,
    maxBytes: 50 * 1024 * 1024, // 50 MB
    allowExcessMessages: false
  }
});
```

### Tuning Examples

```typescript
// High concurrency
const highConcurrency = pubsub.subscription('parallel-tasks', {
  flowControl: {
    maxMessages: 5000,
    maxBytes: 500 * 1024 * 1024
  }
});

// Limited resources
const lowMemory = pubsub.subscription('resource-limited', {
  flowControl: {
    maxMessages: 100,
    maxBytes: 10 * 1024 * 1024
  }
});

// Sequential processing
const sequential = pubsub.subscription('sequential', {
  flowControl: {
    maxMessages: 1,
    maxBytes: 1024 * 1024
  }
});
```

## Batching Options

Controls batching of acknowledgments and modifyAckDeadline calls.

### BatchOptions

```typescript
interface BatchOptions {
  maxMessages?: number;        // Default: 3000
  maxMilliseconds?: number;    // Default: 100 ms
}
```

### Configuration

```typescript
const subscription = pubsub.subscription('my-subscription', {
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 50
  }
});
```

### How It Works

Acknowledgments are batched and sent when:
- **maxMessages** acks accumulated
- **maxMilliseconds** elapsed

This reduces API calls and improves efficiency.

## Streaming Options

Controls gRPC streaming connections for pull subscriptions.

### StreamingOptions

```typescript
interface StreamingOptions {
  maxStreams?: number;
  timeout?: number;
}
```

### Properties

**maxStreams** (number)
- Number of concurrent streaming pull connections
- Default: 5
- More streams = higher throughput

**timeout** (number)
- Milliseconds before stream timeout
- Default: 300000 (5 minutes)

### Configuration

```typescript
const subscription = pubsub.subscription('my-subscription', {
  streamingOptions: {
    maxStreams: 10,
    timeout: 600000 // 10 minutes
  }
});
```

## Complete Configuration Example

```typescript
import { PubSub, Subscription, SubscriberOptions } from '@google-cloud/pubsub';

const subscriberOptions: SubscriberOptions = {
  // Acknowledgment deadline
  ackDeadline: 60,

  // Flow control
  flowControl: {
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024, // 100 MB
    allowExcessMessages: false
  },

  // Batching
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 50
  },

  // Streaming
  streamingOptions: {
    maxStreams: 5,
    timeout: 300000 // 5 minutes
  }
};

const subscription = pubsub.subscription('my-subscription', subscriberOptions);
```

## Subscriber Patterns

### Message Listener Pattern

Most common - event-driven message handling.

```typescript
const subscription = pubsub.subscription('my-subscription', {
  flowControl: { maxMessages: 100 }
});

subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();
  }
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});
```

### Pull Pattern

Synchronous message pulling (less common).

```typescript
async function pullMessages(subscription: Subscription, maxMessages: number) {
  const [response] = await subscription.pull({ maxMessages });

  for (const message of response.receivedMessages || []) {
    try {
      await processMessage(message);
      await subscription.acknowledge({
        ackIds: [message.ackId]
      });
    } catch (error) {
      await subscription.modifyAckDeadline({
        ackIds: [message.ackId],
        ackDeadlineSeconds: 0 // Immediate redelivery
      });
    }
  }
}
```

### Streaming Pull Pattern

Automatic streaming (default for message listeners).

```typescript
const subscription = pubsub.subscription('my-subscription');

subscription.on('message', messageHandler);

// Opens streaming connection automatically
// Handles reconnection and flow control
```

### Exactly-Once Delivery Pattern

For subscriptions with exactly-once delivery enabled.

```typescript
const subscription = pubsub.subscription('exactly-once-sub', {
  flowControl: { maxMessages: 100 }
});

subscription.on('message', async (message) => {
  try {
    await processMessage(message);

    // Use ackWithResponse for exactly-once
    const response = await message.ackWithResponse();

    if (response === 0) {
      console.log('Message acknowledged successfully');
    } else {
      console.error('Ack failed:', response);
      // Handle failure
    }
  } catch (error) {
    await message.nackWithResponse();
  }
});
```

## Performance Tuning

### High Throughput Configuration

```typescript
const subscription = pubsub.subscription('high-throughput', {
  flowControl: {
    maxMessages: 5000,
    maxBytes: 1024 * 1024 * 1024, // 1 GB
    allowExcessMessages: true
  },
  streamingOptions: {
    maxStreams: 10
  },
  batching: {
    maxMessages: 3000,
    maxMilliseconds: 100
  }
});
```

### Low Latency Configuration

```typescript
const subscription = pubsub.subscription('low-latency', {
  flowControl: {
    maxMessages: 10,
    maxBytes: 1024 * 1024 // 1 MB
  },
  batching: {
    maxMessages: 10,
    maxMilliseconds: 1
  }
});
```

### Resource-Constrained Configuration

```typescript
const subscription = pubsub.subscription('limited-resources', {
  flowControl: {
    maxMessages: 50,
    maxBytes: 10 * 1024 * 1024 // 10 MB
  },
  streamingOptions: {
    maxStreams: 1
  }
});
```

## Dynamic Configuration

```typescript
class AdaptiveSubscriber {
  constructor(private subscription: Subscription) {}

  setHighThroughput() {
    this.subscription.setOptions({
      flowControl: {
        maxMessages: 5000,
        maxBytes: 1024 * 1024 * 1024
      }
    });
  }

  setLowLatency() {
    this.subscription.setOptions({
      flowControl: {
        maxMessages: 10,
        maxBytes: 1024 * 1024
      }
    });
  }

  setResourceSaving() {
    this.subscription.setOptions({
      flowControl: {
        maxMessages: 50,
        maxBytes: 10 * 1024 * 1024
      },
      streamingOptions: {
        maxStreams: 1
      }
    });
  }
}
```

## Advanced Message Handling

### Concurrent Processing

```typescript
const subscription = pubsub.subscription('concurrent', {
  flowControl: {
    maxMessages: 100
  }
});

subscription.on('message', async (message) => {
  // Each message processed concurrently
  await processMessage(message);
  message.ack();
});
```

### Sequential Processing

```typescript
const subscription = pubsub.subscription('sequential', {
  flowControl: {
    maxMessages: 1 // Process one at a time
  }
});

subscription.on('message', async (message) => {
  await processMessage(message);
  message.ack();
});
```

### Batched Processing

```typescript
class BatchProcessor {
  private batch: Message[] = [];
  private batchSize = 10;

  constructor(private subscription: Subscription) {
    subscription.on('message', this.addToBatch.bind(this));
  }

  private addToBatch(message: Message) {
    this.batch.push(message);

    if (this.batch.length >= this.batchSize) {
      this.processBatch();
    }
  }

  private async processBatch() {
    const messages = this.batch;
    this.batch = [];

    try {
      await this.processMessages(messages);
      messages.forEach(m => m.ack());
    } catch (error) {
      messages.forEach(m => m.nack());
    }
  }

  private async processMessages(messages: Message[]) {
    // Batch processing logic
  }
}
```

### Deadline Extension

```typescript
subscription.on('message', async (message) => {
  // Extend deadline for long processing
  const extender = setInterval(() => {
    message.modifyAckDeadline(60);
  }, 30000); // Extend every 30 seconds

  try {
    await longRunningProcess(message);
    clearInterval(extender);
    message.ack();
  } catch (error) {
    clearInterval(extender);
    message.nack();
  }
});
```

## Monitoring and Metrics

```typescript
class MonitoredSubscriber {
  private processedCount = 0;
  private errorCount = 0;
  private totalLatency = 0;

  constructor(private subscription: Subscription) {
    this.setupHandlers();
  }

  private setupHandlers() {
    this.subscription.on('message', this.handleMessage.bind(this));
    this.subscription.on('error', this.handleError.bind(this));
  }

  private async handleMessage(message: Message) {
    const start = Date.now();

    try {
      await this.processMessage(message);
      message.ack();
      this.processedCount++;
      this.totalLatency += Date.now() - start;
    } catch (error) {
      this.errorCount++;
      message.nack();
    }
  }

  private handleError(error: Error) {
    console.error('Subscription error:', error);
  }

  private async processMessage(message: Message) {
    // Processing logic
  }

  getMetrics() {
    return {
      processed: this.processedCount,
      errors: this.errorCount,
      avgLatency: this.processedCount > 0
        ? this.totalLatency / this.processedCount
        : 0,
      errorRate: this.processedCount > 0
        ? this.errorCount / (this.processedCount + this.errorCount)
        : 0
    };
  }
}
```

## Best Practices

### 1. Set Appropriate Flow Control

```typescript
// ✅ Match your processing capacity
const subscription = pubsub.subscription('tasks', {
  flowControl: {
    maxMessages: 100 // Based on your capacity
  }
});

// ❌ Don't use unlimited
const subscription = pubsub.subscription('tasks', {
  flowControl: {
    maxMessages: 100000 // Will OOM
  }
});
```

### 2. Tune Ack Deadline

```typescript
// ✅ Match processing time
const subscription = pubsub.subscription('batch-jobs', {
  ackDeadline: 300 // 5 minutes for long jobs
});

// ❌ Too short causes redeliveries
const subscription = pubsub.subscription('batch-jobs', {
  ackDeadline: 10 // Jobs take 5 minutes!
});
```

### 3. Use Appropriate Batching

```typescript
// ✅ Batch acks for efficiency
const subscription = pubsub.subscription('events', {
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 100
  }
});
```

### 4. Handle Errors Properly

```typescript
subscription.on('message', async (message) => {
  try {
    await process(message);
    message.ack();
  } catch (error) {
    console.error('Error:', error);
    message.nack(); // Always ack or nack
  }
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
  // Don't exit - subscription will reconnect
});
```

### 5. Close Gracefully

```typescript
process.on('SIGTERM', async () => {
  console.log('Closing subscription...');
  await subscription.close();
  process.exit(0);
});
```

### 6. Monitor Performance

```typescript
setInterval(() => {
  const metrics = subscriber.getMetrics();
  console.log('Metrics:', metrics);
}, 60000); // Every minute
```

## Official Documentation

- [Subscribing Best Practices](https://cloud.google.com/pubsub/docs/subscribe-best-practices)
- [Flow Control](https://cloud.google.com/pubsub/docs/flow-control-messages)
- [Pull Subscriptions](https://cloud.google.com/pubsub/docs/pull)
- [Subscription Class Reference](https://googleapis.dev/nodejs/pubsub/latest/Subscription.html)
