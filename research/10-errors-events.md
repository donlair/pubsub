# Google Cloud Pub/Sub Errors and Events

## Overview

Comprehensive error handling and event management for robust Pub/Sub applications.

## Error Classes

### AckError
Acknowledgment operation failures.

```typescript
subscription.on('message', async (message) => {
  try {
    await message.ackWithResponse();
  } catch (error) {
    if (error.name === 'AckError') {
      console.error('Ack failed:', error.message);
    }
  }
});
```

### BatchError
Batch operation failures.

```typescript
try {
  await topic.flush();
} catch (error) {
  if (error.name === 'BatchError') {
    console.error('Batch publish failed:', error.message);
  }
}
```

### ChannelError
gRPC channel connection errors.

```typescript
subscription.on('error', (error) => {
  if (error.name === 'ChannelError') {
    console.error('Channel error:', error.message);
    // Subscription will automatically reconnect
  }
});
```

### PublishError
Message publishing failures.

```typescript
try {
  await topic.publish(Buffer.from('data'));
} catch (error) {
  if (error.name === 'PublishError') {
    console.error('Publish failed:', error.message);
    // Retry logic here
  }
}
```

### StatusError
gRPC status code errors.

```typescript
try {
  await topic.create();
} catch (error) {
  if (error.name === 'StatusError') {
    console.error('Status code:', error.code);
    console.error('Details:', error.details);
  }
}
```

## gRPC Error Codes

### Common Status Codes

**OK (0)**
- Not an error; returned on success
- Successful operation completion

```typescript
try {
  await topic.publish(Buffer.from('data'));
  // Success - error.code would be 0 if checked
  console.log('Message published successfully');
} catch (error) {
  // Error occurred
}
```

**CANCELLED (1)**
- Operation was cancelled by caller
- Request explicitly cancelled by client

```typescript
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  await topic.publish(Buffer.from('data'), {
    signal: controller.signal
  });

  clearTimeout(timeout);
} catch (error) {
  if (error.code === 1) {
    console.log('Operation was cancelled');
  }
}
```

**INVALID_ARGUMENT (3)**
- Invalid request parameters
- Malformed request data

```typescript
try {
  await topic.publish(null); // Invalid argument
} catch (error) {
  if (error.code === 3) {
    console.error('Invalid argument:', error.message);
  }
}
```

**DEADLINE_EXCEEDED (4)**
- Operation timeout
- Increase timeout or retry

```typescript
try {
  await topic.publish(Buffer.from('data'));
} catch (error) {
  if (error.code === 4) {
    console.log('Request timeout - increase timeout setting');
  }
}
```

**NOT_FOUND (5)**
- Resource doesn't exist
- Topic or subscription not found

```typescript
try {
  await topic.getMetadata();
} catch (error) {
  if (error.code === 5) {
    console.log('Topic does not exist');
    await topic.create();
  }
}
```

**ALREADY_EXISTS (6)**
- Resource already exists
- Trying to create existing topic/subscription

```typescript
try {
  await pubsub.createTopic('my-topic');
} catch (error) {
  if (error.code === 6) {
    console.log('Topic already exists');
    // Use existing topic
  }
}
```

**PERMISSION_DENIED (7)**
- Insufficient permissions
- IAM configuration issue

```typescript
try {
  await topic.publish(Buffer.from('data'));
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied - check IAM roles');
  }
}
```

**RESOURCE_EXHAUSTED (8)**
- Quota exceeded
- Rate limit hit

```typescript
try {
  await topic.publish(Buffer.from('data'));
} catch (error) {
  if (error.code === 8) {
    console.log('Quota exceeded - implementing backoff');
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Retry
  }
}
```

**FAILED_PRECONDITION (9)**
- Operation rejected due to system state
- Example: deleting topic with active subscriptions

**ABORTED (10)**
- Operation aborted
- Retry recommended

**OUT_OF_RANGE (11)**
- Invalid parameter range

**UNIMPLEMENTED (12)**
- Operation not supported

**INTERNAL (13)**
- Internal server error
- Retry with exponential backoff

**UNAVAILABLE (14)**
- Service temporarily unavailable
- Most common transient error
- Retry recommended

```typescript
async function publishWithRetry(topic: Topic, data: Buffer, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await topic.publish(data);
    } catch (error) {
      if (error.code === 14 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

**DATA_LOSS (15)**
- Unrecoverable data loss or corruption
- Critical error requiring immediate attention

```typescript
try {
  await topic.publish(Buffer.from('data'));
} catch (error) {
  if (error.code === 15) {
    console.error('CRITICAL: Data loss detected');
    // Alert operations team
    // Log for investigation
  }
}
```

**UNAUTHENTICATED (16)**
- Missing valid authentication credentials
- Authentication required but not provided

```typescript
try {
  const pubsub = new PubSub({
    projectId: 'my-project'
    // Missing credentials
  });
  await pubsub.topic('my-topic').publish(Buffer.from('data'));
} catch (error) {
  if (error.code === 16) {
    console.error('Authentication required - provide valid credentials');
    // Check GOOGLE_APPLICATION_CREDENTIALS
    // Or provide keyFilename/credentials in config
  }
}
```

## Event Types

### Subscription Events

**'message'** - New message received

```typescript
subscription.on('message', (message: Message) => {
  console.log('Received:', message.data.toString());
  message.ack();
});
```

**'error'** - Error occurred

```typescript
subscription.on('error', (error: Error) => {
  console.error('Subscription error:', error);
  // Don't exit - subscription will reconnect
});
```

**'close'** - Subscription closed

```typescript
subscription.on('close', () => {
  console.log('Subscription closed');
  // Clean up resources
});
```

**'debug'** - Debug information

```typescript
subscription.on('debug', (message: string) => {
  console.log('Debug:', message);
});
```

### Topic Events

Topics don't emit events directly, but publishing operations return promises that can be monitored.

## Error Handling Patterns

### Basic Error Handling

```typescript
try {
  const messageId = await topic.publish(Buffer.from('data'));
  console.log('Published:', messageId);
} catch (error) {
  console.error('Publish failed:', error.message);
  // Handle error
}
```

### Retry with Exponential Backoff

```typescript
async function publishWithBackoff(
  topic: Topic,
  data: Buffer,
  maxRetries = 5
): Promise<string> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await topic.publish(data);
    } catch (error) {
      lastError = error;

      // Don't retry non-transient errors
      if (error.code === 3 || error.code === 7) {
        throw error;
      }

      // Calculate backoff delay
      const delay = Math.min(1000 * Math.pow(2, attempt), 32000);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

// Usage
const breaker = new CircuitBreaker();

async function publishSafe(topic: Topic, data: Buffer) {
  return breaker.execute(() => topic.publish(data));
}
```

### Graceful Degradation

```typescript
async function publishWithFallback(
  primaryTopic: Topic,
  fallbackTopic: Topic,
  data: Buffer
): Promise<string> {
  try {
    return await primaryTopic.publish(data);
  } catch (error) {
    console.warn('Primary topic failed, using fallback:', error);
    return await fallbackTopic.publish(data);
  }
}
```

### Dead Letter Queue Pattern

```typescript
const mainTopic = pubsub.topic('main-topic');
const dlqTopic = pubsub.topic('dlq-topic');

subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);

    // Check delivery attempts
    if (message.deliveryAttempt && message.deliveryAttempt >= 5) {
      // Send to DLQ
      await dlqTopic.publish(message.data, {
        ...message.attributes,
        'original-message-id': message.id,
        'failure-reason': error.message
      });
      message.ack(); // Ack to remove from main subscription
    } else {
      message.nack(); // Retry
    }
  }
});
```

## Comprehensive Error Handler

```typescript
class RobustSubscriber {
  private subscription: Subscription;
  private maxRetries = 3;

  constructor(private pubsub: PubSub, subscriptionName: string) {
    this.subscription = pubsub.subscription(subscriptionName);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.subscription.on('message', this.handleMessage.bind(this));
    this.subscription.on('error', this.handleError.bind(this));
    this.subscription.on('close', this.handleClose.bind(this));
  }

  private async handleMessage(message: Message) {
    const attempt = message.deliveryAttempt || 1;

    try {
      await this.processMessage(message);
      await this.ackSafely(message);
    } catch (error) {
      await this.handleProcessingError(message, error, attempt);
    }
  }

  private async processMessage(message: Message) {
    // Processing logic
    const data = JSON.parse(message.data.toString());
    // ... process data
  }

  private async ackSafely(message: Message) {
    try {
      message.ack();
    } catch (error) {
      console.error('Ack failed:', error);
      // Ack failures are usually not critical
      // Message will be redelivered
    }
  }

  private async handleProcessingError(
    message: Message,
    error: Error,
    attempt: number
  ) {
    console.error(`Processing failed (attempt ${attempt}):`, error);

    if (this.isRetryable(error) && attempt < this.maxRetries) {
      message.nack();
    } else {
      // Max retries exceeded or non-retryable error
      await this.sendToDLQ(message, error);
      message.ack();
    }
  }

  private isRetryable(error: Error): boolean {
    // Network errors, timeouts, temporary failures
    const retryableCodes = [4, 8, 10, 13, 14];
    return retryableCodes.includes((error as any).code);
  }

  private async sendToDLQ(message: Message, error: Error) {
    const dlqTopic = this.pubsub.topic('dead-letter-queue');

    try {
      await dlqTopic.publish(message.data, {
        ...message.attributes,
        'dlq-reason': error.message,
        'original-message-id': message.id,
        'failed-at': new Date().toISOString()
      });
    } catch (dlqError) {
      console.error('Failed to send to DLQ:', dlqError);
    }
  }

  private handleError(error: Error) {
    console.error('Subscription error:', error);

    // Channel errors are usually transient
    if (error.name === 'ChannelError') {
      console.log('Channel error - subscription will reconnect');
      return;
    }

    // Other errors might need attention
    console.error('Critical subscription error:', error);
  }

  private handleClose() {
    console.log('Subscription closed');
  }

  async close() {
    await this.subscription.close();
  }
}
```

## Timeout Configuration

### Publishing Timeout

```typescript
const topic = pubsub.topic('my-topic', {
  gaxOpts: {
    timeout: 60000 // 60 seconds
  }
});
```

### Subscription Timeout

```typescript
const subscription = pubsub.subscription('my-subscription', {
  streamingOptions: {
    timeout: 300000 // 5 minutes
  }
});
```

## Monitoring and Alerting

```typescript
class ErrorMonitor {
  private errors: Map<string, number> = new Map();
  private alertThreshold = 10;

  trackError(errorType: string) {
    const count = (this.errors.get(errorType) || 0) + 1;
    this.errors.set(errorType, count);

    if (count >= this.alertThreshold) {
      this.sendAlert(errorType, count);
    }
  }

  private sendAlert(errorType: string, count: number) {
    console.error(`ALERT: ${errorType} occurred ${count} times`);
    // Send to monitoring system
  }

  getMetrics() {
    return Object.fromEntries(this.errors);
  }

  reset() {
    this.errors.clear();
  }
}

// Usage
const monitor = new ErrorMonitor();

subscription.on('error', (error) => {
  monitor.trackError(error.name);
});
```

## Best Practices

### 1. Always Handle Errors

```typescript
// ✅ Handle all errors
subscription.on('message', async (message) => {
  try {
    await process(message);
    message.ack();
  } catch (error) {
    console.error('Error:', error);
    message.nack();
  }
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});
```

### 2. Implement Retry Logic

```typescript
// ✅ Retry transient errors
async function publishWithRetry(topic: Topic, data: Buffer) {
  for (let i = 0; i < 3; i++) {
    try {
      return await topic.publish(data);
    } catch (error) {
      if (i === 2 || !isTransient(error)) throw error;
      await delay(1000 * (i + 1));
    }
  }
}
```

### 3. Monitor Error Rates

```typescript
// ✅ Track and alert on errors
const errorCount = 0;
const totalCount = 0;

setInterval(() => {
  const errorRate = errorCount / totalCount;
  if (errorRate > 0.05) {
    console.error('High error rate:', errorRate);
  }
}, 60000);
```

### 4. Use Circuit Breakers

```typescript
// ✅ Prevent cascading failures
const breaker = new CircuitBreaker();
await breaker.execute(() => topic.publish(data));
```

### 5. Implement DLQ

```typescript
// ✅ Handle poison messages
if (message.deliveryAttempt >= 5) {
  await dlqTopic.publish(message.data);
  message.ack();
}
```

## Official Documentation

- [Error Handling](https://googleapis.dev/nodejs/pubsub/latest/)
- [gRPC Status Codes](https://grpc.github.io/grpc/core/md_doc_statuscodes.html)
- [Pub/Sub Quotas](https://cloud.google.com/pubsub/quotas)
- [Best Practices](https://cloud.google.com/pubsub/docs/publisher)
