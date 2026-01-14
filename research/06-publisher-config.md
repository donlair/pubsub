# Google Cloud Pub/Sub Publisher Configuration

## Overview

Publisher configuration controls batching, flow control, ordering, and other publishing behaviors.

## PublishOptions Interface

```typescript
interface PublishOptions {
  batching?: BatchPublishOptions;
  flowControlOptions?: FlowControlOptions;
  gaxOpts?: CallOptions;
  messageOrdering?: boolean;
  enableOpenTelemetryTracing?: boolean;
}
```

## Batching Settings

Control how messages are batched before sending to Pub/Sub.

### BatchPublishOptions

```typescript
interface BatchPublishOptions {
  maxMessages?: number;        // Default: 100
  maxBytes?: number;           // Default: 1 MB (1024 * 1024)
  maxMilliseconds?: number;    // Default: 10 ms
}
```

### Configuration

```typescript
const topic = pubsub.topic('my-topic', {
  batching: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024, // 10 MB
    maxMilliseconds: 100
  }
});
```

### How Batching Works

Messages are sent when ANY of these conditions is met:
1. **maxMessages** reached
2. **maxBytes** reached
3. **maxMilliseconds** elapsed since first message in batch

### Batching Examples

```typescript
// High throughput - larger batches
const highThroughputTopic = pubsub.topic('events', {
  batching: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024,
    maxMilliseconds: 100
  }
});

// Low latency - smaller batches
const lowLatencyTopic = pubsub.topic('urgent', {
  batching: {
    maxMessages: 10,
    maxBytes: 100 * 1024,
    maxMilliseconds: 1
  }
});

// Balanced
const balancedTopic = pubsub.topic('standard', {
  batching: {
    maxMessages: 100,
    maxBytes: 1024 * 1024,
    maxMilliseconds: 10
  }
});
```

## Flow Control Options

Limit memory usage by controlling outstanding publish requests.

### FlowControlOptions

```typescript
interface FlowControlOptions {
  maxOutstandingMessages?: number;
  maxOutstandingBytes?: number;
}
```

### Configuration

```typescript
const topic = pubsub.topic('my-topic', {
  flowControlOptions: {
    maxOutstandingMessages: 1000,
    maxOutstandingBytes: 100 * 1024 * 1024 // 100 MB
  }
});
```

### Flow Control Behavior

When limits are exceeded:
- New publish calls are queued
- Memory usage is controlled
- Backpressure prevents OOM errors

### Example

```typescript
const topic = pubsub.topic('my-topic', {
  flowControlOptions: {
    maxOutstandingMessages: 500
  }
});

// This will queue internally if 500 messages are already outstanding
for (let i = 0; i < 1000; i++) {
  topic.publish(Buffer.from(`Message ${i}`))
    .then(id => console.log(`Published: ${id}`))
    .catch(err => console.error('Error:', err));
}
```

## Message Ordering

Enable ordered message delivery using ordering keys.

> **See also:** [Advanced Features - Message Ordering](08-advanced-features.md#message-ordering) for comprehensive examples and best practices.

### Configuration

```typescript
const topic = pubsub.topic('my-topic', {
  messageOrdering: true
});
```

### Publishing with Ordering

```typescript
// Messages with same ordering key are delivered in order
await topic.publishMessage({
  data: Buffer.from('First message'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('Second message'),
  orderingKey: 'user-123'  // Same key = ordered
});

await topic.publishMessage({
  data: Buffer.from('Independent message'),
  orderingKey: 'user-456'  // Different key = independent
});
```

### Resuming After Error

```typescript
try {
  await topic.publishMessage({
    data: Buffer.from('Message'),
    orderingKey: 'user-123'
  });
} catch (error) {
  console.error('Publish failed:', error);

  // Resume publishing for this ordering key
  topic.resumePublishing('user-123');

  // Retry
  await topic.publishMessage({
    data: Buffer.from('Message'),
    orderingKey: 'user-123'
  });
}
```

## gRPC and Retry Options

Advanced gRPC and retry configuration.

### Configuration

```typescript
const topic = pubsub.topic('my-topic', {
  gaxOpts: {
    timeout: 60000, // 60 seconds
    retry: {
      retryCodes: [10, 14], // ABORTED, UNAVAILABLE
      backoffSettings: {
        initialRetryDelayMillis: 100,
        retryDelayMultiplier: 1.3,
        maxRetryDelayMillis: 60000,
        initialRpcTimeoutMillis: 60000,
        rpcTimeoutMultiplier: 1,
        maxRpcTimeoutMillis: 600000,
        totalTimeoutMillis: 600000
      }
    }
  }
});
```

## OpenTelemetry Tracing

Enable distributed tracing for publish operations.

```typescript
const topic = pubsub.topic('my-topic', {
  enableOpenTelemetryTracing: true
});
```

## Complete Configuration Example

```typescript
import { PubSub, Topic, PublishOptions } from '@google-cloud/pubsub';

const publishOptions: PublishOptions = {
  // Batching for high throughput
  batching: {
    maxMessages: 500,
    maxBytes: 5 * 1024 * 1024, // 5 MB
    maxMilliseconds: 50
  },

  // Flow control to prevent memory issues
  flowControlOptions: {
    maxOutstandingMessages: 1000,
    maxOutstandingBytes: 100 * 1024 * 1024 // 100 MB
  },

  // Enable message ordering
  messageOrdering: true,

  // Retry configuration
  gaxOpts: {
    timeout: 60000,
    retry: {
      retryCodes: [10, 14],
      backoffSettings: {
        initialRetryDelayMillis: 100,
        retryDelayMultiplier: 1.3,
        maxRetryDelayMillis: 60000
      }
    }
  },

  // Enable tracing
  enableOpenTelemetryTracing: true
};

const topic = pubsub.topic('my-topic', publishOptions);
```

## Publisher Patterns

### Synchronous Publishing

```typescript
const messageId = await topic.publish(Buffer.from('Message'));
console.log('Published:', messageId);
```

### Fire-and-Forget

```typescript
topic.publish(Buffer.from('Message'))
  .then(id => console.log('Published:', id))
  .catch(err => console.error('Error:', err));
```

### Batch Publishing

```typescript
const messages = ['msg1', 'msg2', 'msg3'];
const promises = messages.map(msg =>
  topic.publish(Buffer.from(msg))
);
const messageIds = await Promise.all(promises);
```

### Ordered Publishing

```typescript
async function publishOrdered(userId: string, events: string[]) {
  for (const event of events) {
    await topic.publishMessage({
      data: Buffer.from(event),
      orderingKey: userId
    });
  }
}
```

### Flow-Controlled Publishing

```typescript
const publisher = topic.flowControlled();

for (let i = 0; i < 10000; i++) {
  await publisher.publish(Buffer.from(`Message ${i}`));
}
```

## Performance Tuning

### High Throughput

```typescript
const topic = pubsub.topic('events', {
  batching: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024,
    maxMilliseconds: 100
  },
  flowControlOptions: {
    maxOutstandingMessages: 10000,
    maxOutstandingBytes: 1024 * 1024 * 1024 // 1 GB
  }
});
```

### Low Latency

```typescript
const topic = pubsub.topic('realtime', {
  batching: {
    maxMessages: 1,
    maxBytes: 1024,
    maxMilliseconds: 1
  }
});
```

### Balanced

```typescript
const topic = pubsub.topic('standard', {
  batching: {
    maxMessages: 100,
    maxBytes: 1024 * 1024,
    maxMilliseconds: 10
  },
  flowControlOptions: {
    maxOutstandingMessages: 1000,
    maxOutstandingBytes: 100 * 1024 * 1024
  }
});
```

## Dynamic Configuration

```typescript
class ConfigurablePublisher {
  private topic: Topic;

  constructor(private pubsub: PubSub, topicName: string) {
    this.topic = pubsub.topic(topicName);
    this.setDefaultConfig();
  }

  setDefaultConfig() {
    this.topic.setPublishOptions({
      batching: {
        maxMessages: 100,
        maxMilliseconds: 10
      }
    });
  }

  setHighThroughput() {
    this.topic.setPublishOptions({
      batching: {
        maxMessages: 1000,
        maxMilliseconds: 100
      }
    });
  }

  setLowLatency() {
    this.topic.setPublishOptions({
      batching: {
        maxMessages: 1,
        maxMilliseconds: 1
      }
    });
  }

  async publish(data: Buffer) {
    return this.topic.publish(data);
  }
}
```

## Best Practices

1. **Use batching for efficiency** - Default settings work well for most cases
2. **Configure flow control** - Prevent memory issues with large volumes
3. **Enable ordering sparingly** - Only when truly needed (impacts throughput)
4. **Tune for your workload** - High throughput vs low latency
5. **Monitor performance** - Track publish latency and throughput
6. **Handle errors properly** - Retry failed publishes
7. **Use flush() before shutdown** - Ensure all messages are sent

## Monitoring

```typescript
class MonitoredPublisher {
  private publishCount = 0;
  private errorCount = 0;
  private totalLatency = 0;

  async publish(topic: Topic, data: Buffer) {
    const start = Date.now();

    try {
      const messageId = await topic.publish(data);
      this.publishCount++;
      this.totalLatency += Date.now() - start;
      return messageId;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }

  getMetrics() {
    return {
      published: this.publishCount,
      errors: this.errorCount,
      avgLatency: this.totalLatency / this.publishCount
    };
  }
}
```

## Official Documentation

- [Publishing Best Practices](https://cloud.google.com/pubsub/docs/publish-best-practices)
- [Batch Messaging](https://cloud.google.com/pubsub/docs/batch-messaging)
- [Message Ordering](https://cloud.google.com/pubsub/docs/ordering)
- [Flow Control](https://cloud.google.com/pubsub/docs/flow-control-messages)
