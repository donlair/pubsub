# Advanced Pub/Sub Features

This document covers advanced Google Cloud Pub/Sub features that enable sophisticated messaging patterns, reliability guarantees, and performance optimizations.

## Table of Contents

1. [Dead Letter Topics](#dead-letter-topics)
2. [Retry Policies](#retry-policies)
3. [Message Filtering](#message-filtering)
4. [Exactly-Once Delivery](#exactly-once-delivery)
5. [Message Ordering](#message-ordering)
6. [Flow Control](#flow-control)
7. [Snapshots and Seek](#snapshots-and-seek)

---

## 1. Dead Letter Topics

Dead letter topics provide a mechanism to handle messages that cannot be successfully processed after repeated delivery attempts. When a message exceeds the maximum delivery attempts, it's forwarded to a designated dead letter topic for inspection and manual intervention.

### Configuration

Dead letter topics are configured at the subscription level:

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();

async function createSubscriptionWithDeadLetter() {
  const topicName = 'my-topic';
  const subscriptionName = 'my-subscription';
  const deadLetterTopicName = 'my-dead-letter-topic';

  // Ensure the dead letter topic exists
  const [deadLetterTopic] = await pubsub
    .topic(deadLetterTopicName)
    .get({ autoCreate: true });

  const [subscription] = await pubsub
    .topic(topicName)
    .createSubscription(subscriptionName, {
      deadLetterPolicy: {
        deadLetterTopic: deadLetterTopic.name,
        maxDeliveryAttempts: 5
      }
    });

  console.log(`Subscription ${subscriptionName} created with dead letter topic`);
  return subscription;
}
```

### IAM Requirements

The Pub/Sub service account requires specific permissions to forward messages to the dead letter topic:

```typescript
async function grantDeadLetterPermissions() {
  const projectId = await pubsub.getClientConfig().projectId;
  const deadLetterTopicName = 'my-dead-letter-topic';
  const subscriptionName = 'my-subscription';

  const serviceAccount = `serviceAccount:service-${projectId}@gcp-sa-pubsub.iam.gserviceaccount.com`;

  // Grant publisher role on dead letter topic
  await pubsub.topic(deadLetterTopicName).iam.setPolicy({
    bindings: [
      {
        role: 'roles/pubsub.publisher',
        members: [serviceAccount]
      }
    ]
  });

  // Grant subscriber role on the subscription
  await pubsub.subscription(subscriptionName).iam.setPolicy({
    bindings: [
      {
        role: 'roles/pubsub.subscriber',
        members: [serviceAccount]
      }
    ]
  });

  console.log('Dead letter permissions granted');
}
```

### Metadata Attributes

When messages are forwarded to a dead letter topic, Pub/Sub adds metadata attributes:

```typescript
async function processDeadLetterMessages() {
  const subscription = pubsub.subscription('dead-letter-subscription');

  subscription.on('message', (message) => {
    // Original subscription that couldn't process the message
    const originalSubscription = message.attributes['cloudPubSubDeadLetterSourceSubscription'];

    // Number of delivery attempts before forwarding
    const deliveryAttempts = message.deliveryAttempt;

    console.log('Dead letter message received:');
    console.log(`  Original subscription: ${originalSubscription}`);
    console.log(`  Delivery attempts: ${deliveryAttempts}`);
    console.log(`  Message data: ${message.data.toString()}`);
    console.log(`  Original attributes:`, message.attributes);

    // Process or log for manual intervention
    message.ack();
  });
}
```

### Best Practices

1. **Separate Dead Letter Topic Per Service**: Use dedicated dead letter topics for each service or logical component to simplify troubleshooting.

2. **Monitor Dead Letter Topics**: Set up alerts when messages arrive in dead letter topics:

```typescript
async function monitorDeadLetterTopic() {
  const subscription = pubsub.subscription('dead-letter-subscription');

  let messageCount = 0;
  const alertThreshold = 10;

  subscription.on('message', (message) => {
    messageCount++;

    if (messageCount >= alertThreshold) {
      // Trigger alert (e.g., send to monitoring service)
      console.error(`ALERT: ${messageCount} messages in dead letter topic`);
    }

    // Store for analysis but don't ack immediately
    storeForAnalysis(message).then(() => {
      message.ack();
    });
  });
}
```

3. **Set Appropriate Max Delivery Attempts**: Balance between retry costs and message loss risk. Typical values: 5-10 attempts.

4. **Dead Letter Topic Processing**: Create a subscription on the dead letter topic for inspection:

```typescript
async function setupDeadLetterProcessing() {
  const deadLetterTopic = pubsub.topic('my-dead-letter-topic');
  const [subscription] = await deadLetterTopic.createSubscription(
    'dead-letter-analysis',
    {
      // Long retention for manual inspection
      retentionDuration: { seconds: 604800 }, // 7 days
      ackDeadlineSeconds: 600 // 10 minutes for analysis
    }
  );

  return subscription;
}
```

5. **Reprocessing Pattern**: Implement a mechanism to republish messages from dead letter topics after fixing issues:

```typescript
async function reprocessDeadLetterMessages(messageIds: string[]) {
  const deadLetterSub = pubsub.subscription('dead-letter-analysis');
  const originalTopic = pubsub.topic('my-topic');

  for (const messageId of messageIds) {
    // In practice, you'd pull specific messages
    // This is a simplified example
    deadLetterSub.on('message', async (message) => {
      if (message.id === messageId) {
        // Remove dead letter metadata
        const {
          cloudPubSubDeadLetterSourceSubscription,
          ...originalAttributes
        } = message.attributes;

        // Republish to original topic
        await originalTopic.publishMessage({
          data: message.data,
          attributes: originalAttributes
        });

        message.ack();
        console.log(`Reprocessed message ${messageId}`);
      }
    });
  }
}
```

---

## 2. Retry Policies

Retry policies control how Pub/Sub handles redelivery of unacknowledged messages, using exponential backoff to avoid overwhelming failing subscribers.

### Exponential Backoff Configuration

```typescript
async function createSubscriptionWithRetryPolicy() {
  const [subscription] = await pubsub
    .topic('my-topic')
    .createSubscription('my-subscription', {
      retryPolicy: {
        minimumBackoff: { seconds: 10 },   // Initial retry delay
        maximumBackoff: { seconds: 600 }    // Max retry delay (10 minutes)
      }
    });

  console.log('Subscription created with retry policy');
  return subscription;
}
```

### Exponential Backoff Algorithm

Pub/Sub calculates retry delay using:

```
delay = min(minimumBackoff * 2^(delivery_attempt - 1), maximumBackoff)
```

Example with `minimumBackoff: 10s` and `maximumBackoff: 600s`:
- Attempt 1: 10 seconds
- Attempt 2: 20 seconds
- Attempt 3: 40 seconds
- Attempt 4: 80 seconds
- Attempt 5: 160 seconds
- Attempt 6: 320 seconds
- Attempt 7+: 600 seconds (capped at maximum)

### Per-Message Retry Tracking

Each message tracks its own delivery attempts:

```typescript
function handleMessageWithRetryTracking(message: Message) {
  const deliveryAttempt = message.deliveryAttempt;

  console.log(`Processing message (attempt ${deliveryAttempt})`);

  try {
    // Process the message
    processMessage(message.data);
    message.ack();
  } catch (error) {
    console.error(`Processing failed (attempt ${deliveryAttempt}):`, error);

    if (deliveryAttempt >= 3) {
      // Log for investigation after multiple failures
      logFailedMessage(message, error);
    }

    // Nack to trigger retry with backoff
    message.nack();
  }
}
```

### Retry Policy Best Practices

1. **Choose Appropriate Backoff Windows**:

```typescript
// Fast retries for transient errors (e.g., rate limits)
const fastRetryPolicy = {
  minimumBackoff: { seconds: 5 },
  maximumBackoff: { seconds: 60 }
};

// Slow retries for infrastructure issues (e.g., database outages)
const slowRetryPolicy = {
  minimumBackoff: { seconds: 30 },
  maximumBackoff: { seconds: 3600 }
};

// Balanced default for most use cases
const defaultRetryPolicy = {
  minimumBackoff: { seconds: 10 },
  maximumBackoff: { seconds: 600 }
};
```

2. **Combine with Dead Letter Topics**:

```typescript
async function createSubscriptionWithRetryAndDeadLetter() {
  const [subscription] = await pubsub
    .topic('my-topic')
    .createSubscription('my-subscription', {
      retryPolicy: {
        minimumBackoff: { seconds: 10 },
        maximumBackoff: { seconds: 600 }
      },
      deadLetterPolicy: {
        deadLetterTopic: pubsub.topic('my-dead-letter-topic').name,
        maxDeliveryAttempts: 5
      }
    });

  return subscription;
}
```

3. **Idempotent Message Processing**: Since messages may be redelivered, ensure processing is idempotent:

```typescript
const processedMessageIds = new Set<string>();

function idempotentMessageHandler(message: Message) {
  // Check if already processed
  if (processedMessageIds.has(message.id)) {
    console.log(`Message ${message.id} already processed, skipping`);
    message.ack();
    return;
  }

  try {
    processMessage(message.data);
    processedMessageIds.add(message.id);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();
  }
}
```

4. **Monitoring Retry Metrics**:

```typescript
class RetryMetrics {
  private attemptHistogram: Map<number, number> = new Map();

  recordDeliveryAttempt(attempt: number) {
    const count = this.attemptHistogram.get(attempt) || 0;
    this.attemptHistogram.set(attempt, count + 1);
  }

  getMetrics() {
    return {
      totalMessages: Array.from(this.attemptHistogram.values())
        .reduce((sum, count) => sum + count, 0),
      attemptDistribution: Object.fromEntries(this.attemptHistogram),
      highRetryCount: Array.from(this.attemptHistogram.entries())
        .filter(([attempt]) => attempt >= 3)
        .reduce((sum, [, count]) => sum + count, 0)
    };
  }
}

const metrics = new RetryMetrics();

subscription.on('message', (message) => {
  metrics.recordDeliveryAttempt(message.deliveryAttempt);
  handleMessage(message);
});
```

---

## 3. Message Filtering

Message filtering allows subscribers to receive only messages that match specific criteria, reducing network traffic and processing overhead.

### Filter Syntax

Filters use a SQL-like syntax to match message attributes:

```typescript
async function createFilteredSubscription() {
  // Basic attribute matching
  await pubsub.topic('events').createSubscription('high-priority-events', {
    filter: 'attributes.priority = "high"'
  });

  // Multiple conditions with AND
  await pubsub.topic('events').createSubscription('prod-errors', {
    filter: 'attributes.environment = "production" AND attributes.level = "error"'
  });

  // Multiple conditions with OR
  await pubsub.topic('events').createSubscription('critical-alerts', {
    filter: 'attributes.severity = "critical" OR attributes.severity = "high"'
  });

  // Numeric comparisons
  await pubsub.topic('metrics').createSubscription('large-values', {
    filter: 'attributes.value > "1000"'
  });
}
```

### hasPrefix Operator

The `hasPrefix` operator matches string prefixes:

```typescript
async function createPrefixFilteredSubscriptions() {
  // Match messages with specific prefix
  await pubsub.topic('logs').createSubscription('user-events', {
    filter: 'hasPrefix(attributes.eventType, "user.")'
  });

  // Matches: user.login, user.logout, user.signup, etc.

  // Multiple prefix patterns
  await pubsub.topic('logs').createSubscription('auth-events', {
    filter: 'hasPrefix(attributes.eventType, "auth.") OR hasPrefix(attributes.eventType, "security.")'
  });
}
```

### Filter Operators

Supported operators in filter expressions:

```typescript
// Comparison operators
const comparisonFilters = {
  equals: 'attributes.status = "active"',
  notEquals: 'attributes.status != "inactive"',
  greaterThan: 'attributes.count > "100"',
  greaterThanOrEqual: 'attributes.count >= "100"',
  lessThan: 'attributes.priority < "5"',
  lessThanOrEqual: 'attributes.priority <= "5"'
};

// Logical operators
const logicalFilters = {
  and: 'attributes.env = "prod" AND attributes.region = "us-east1"',
  or: 'attributes.level = "error" OR attributes.level = "critical"',
  not: 'NOT attributes.status = "disabled"'
};

// String operators
const stringFilters = {
  hasPrefix: 'hasPrefix(attributes.eventType, "order.")',
  combined: 'hasPrefix(attributes.namespace, "app.") AND attributes.version = "v2"'
};
```

### Attribute Filtering Examples

```typescript
// Publishing messages with attributes for filtering
async function publishFilterableMessages() {
  const topic = pubsub.topic('events');

  // High priority production error
  await topic.publishMessage({
    data: Buffer.from(JSON.stringify({ error: 'Database timeout' })),
    attributes: {
      priority: 'high',
      environment: 'production',
      service: 'api',
      level: 'error'
    }
  });

  // Low priority development log
  await topic.publishMessage({
    data: Buffer.from(JSON.stringify({ message: 'Request received' })),
    attributes: {
      priority: 'low',
      environment: 'development',
      service: 'api',
      level: 'info'
    }
  });

  // Will be filtered differently by subscriptions
}

// Multiple subscriptions with different filters
async function setupFilteredSubscriptions() {
  const topic = pubsub.topic('events');

  // Only production errors and warnings
  const [prodIssues] = await topic.createSubscription('prod-issues', {
    filter: 'attributes.environment = "production" AND (attributes.level = "error" OR attributes.level = "warning")'
  });

  // Only high priority messages
  const [highPriority] = await topic.createSubscription('high-priority', {
    filter: 'attributes.priority = "high"'
  });

  // All non-production messages
  const [nonProd] = await topic.createSubscription('non-prod', {
    filter: 'attributes.environment != "production"'
  });
}
```

### Filter Immutability

**Important**: Filters cannot be modified after subscription creation. To change a filter, you must create a new subscription:

```typescript
async function updateSubscriptionFilter() {
  const topicName = 'my-topic';
  const oldSubName = 'my-subscription';
  const newSubName = 'my-subscription-v2';

  // Create new subscription with updated filter
  const [newSub] = await pubsub.topic(topicName).createSubscription(newSubName, {
    filter: 'attributes.version = "v2"'
  });

  // Migrate message processing to new subscription
  // Then delete old subscription
  await pubsub.subscription(oldSubName).delete();

  console.log('Filter updated via new subscription');
}
```

### Performance Considerations

1. **Filter Evaluation**: Filtering happens server-side before message delivery, reducing network traffic and client processing:

```typescript
// Without filtering: All messages delivered to subscriber
subscription.on('message', (message) => {
  if (message.attributes.priority === 'high') {
    // Only 10% of messages are high priority
    // But 100% were delivered and processed
    processMessage(message);
  }
  message.ack();
});

// With filtering: Only relevant messages delivered
// 90% reduction in network traffic and processing
const filteredSub = await topic.createSubscription('high-priority', {
  filter: 'attributes.priority = "high"'
});

filteredSub.on('message', (message) => {
  // All messages here are high priority
  processMessage(message);
  message.ack();
});
```

2. **Filter Complexity**: Simple filters are more efficient than complex ones:

```typescript
// Efficient: Single attribute check
const efficientFilter = 'attributes.priority = "high"';

// Less efficient: Multiple conditions with OR
const complexFilter = 'attributes.priority = "high" OR attributes.priority = "critical" OR attributes.priority = "urgent"';

// Better: Use a single categorical attribute
// Publisher sends: attributes.priorityLevel = "high-or-above"
const betterFilter = 'attributes.priorityLevel = "high-or-above"';
```

3. **Attribute Indexing**: Design attributes for efficient filtering:

```typescript
// Good: Categorical attributes for filtering
const goodAttributes = {
  environment: 'production',  // Limited set of values
  severity: 'error',          // Limited set of values
  service: 'api'              // Limited set of values
};

// Avoid: High-cardinality attributes for filtering
const avoidAttributes = {
  timestamp: '2026-01-14T12:00:00Z',  // Unique per message
  requestId: 'uuid-here',              // Unique per message
  userId: 'user-12345'                 // Many unique values
};
```

### Best Practices

1. **Design Attributes for Filtering**: Plan message attributes with filtering in mind:

```typescript
interface MessageAttributes {
  // Good for filtering: categorical data
  environment: 'development' | 'staging' | 'production';
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  service: string;
  version: string;

  // Not ideal for filtering: unique identifiers
  requestId?: string;
  timestamp?: string;
}
```

2. **Test Filters Before Production**: Validate filter expressions:

```typescript
async function testMessageFilter() {
  const testTopic = pubsub.topic('test-topic');
  const [testSub] = await testTopic.createSubscription('test-filter-sub', {
    filter: 'attributes.priority = "high"'
  });

  // Publish test messages
  await testTopic.publishMessage({
    data: Buffer.from('test'),
    attributes: { priority: 'high' }
  });

  await testTopic.publishMessage({
    data: Buffer.from('test'),
    attributes: { priority: 'low' }
  });

  // Verify only high priority message is received
  let receivedCount = 0;
  testSub.on('message', (message) => {
    receivedCount++;
    console.log('Received:', message.attributes);
    message.ack();
  });

  // Wait and verify
  setTimeout(async () => {
    console.log(`Filter test: received ${receivedCount} messages (expected: 1)`);
    await testSub.delete();
    await testTopic.delete();
  }, 5000);
}
```

3. **Document Filter Expectations**: Clearly document what each subscription filters:

```typescript
/**
 * Subscription: production-critical-alerts
 *
 * Filter: attributes.environment = "production" AND
 *         (attributes.severity = "critical" OR attributes.severity = "error")
 *
 * Purpose: Receives only production errors and critical alerts
 * Team: Platform Engineering
 * Alert threshold: > 10 messages/minute
 */
const [criticalAlerts] = await topic.createSubscription('production-critical-alerts', {
  filter: 'attributes.environment = "production" AND (attributes.severity = "critical" OR attributes.severity = "error")'
});
```

---

## 4. Exactly-Once Delivery

Exactly-once delivery ensures that each message is delivered and processed successfully exactly once, even in the presence of failures or retries. This eliminates duplicate processing without requiring idempotency in application code.

### Configuration

Enable exactly-once delivery at the subscription level:

```typescript
async function createExactlyOnceSubscription() {
  const [subscription] = await pubsub
    .topic('my-topic')
    .createSubscription('my-exactly-once-subscription', {
      enableExactlyOnceDelivery: true,
      // Recommended: Increase ack deadline for processing time
      ackDeadlineSeconds: 60
    });

  console.log('Exactly-once delivery enabled');
  return subscription;
}
```

### Regional Limitations

Exactly-once delivery is **only available in certain regions**. Check region support:

```typescript
const supportedRegions = [
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-west1',
  'europe-west4',
  'asia-east1',
  'asia-northeast1',
  'australia-southeast1'
  // Check GCP documentation for current list
];

async function createRegionalExactlyOnceSubscription(region: string) {
  if (!supportedRegions.includes(region)) {
    throw new Error(`Exactly-once delivery not supported in ${region}`);
  }

  // Topic and subscription must be in supported region
  const [subscription] = await pubsub
    .topic('my-topic')
    .createSubscription('my-subscription', {
      enableExactlyOnceDelivery: true
    });

  return subscription;
}
```

### Message Processing with Exactly-Once

With exactly-once delivery, message acknowledgment becomes a transaction:

```typescript
async function processExactlyOnceMessages() {
  const subscription = pubsub.subscription('my-exactly-once-subscription');

  subscription.on('message', async (message) => {
    try {
      // Process the message
      await processMessage(message.data);

      // Ack succeeds only if:
      // 1. Message hasn't been acked by another subscriber
      // 2. Message hasn't expired
      // 3. Subscription is healthy
      message.ack();

      console.log(`Message ${message.id} processed exactly once`);
    } catch (error) {
      console.error('Processing failed:', error);

      // Nack allows message to be redelivered
      // But still maintains exactly-once guarantee
      message.nack();
    }
  });
}
```

### Acknowledgment Failures

With exactly-once delivery, acknowledgments can fail:

```typescript
subscription.on('message', async (message) => {
  try {
    await processMessage(message.data);

    // Attempt to acknowledge
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();
  }
});

// Handle ack errors
subscription.on('error', (error) => {
  if (error.code === 'FAILED_PRECONDITION') {
    // Message was already acked by another subscriber
    console.log('Message already acknowledged');
  } else if (error.code === 'ABORTED') {
    // Transient error, message will be redelivered
    console.log('Ack aborted, message will retry');
  } else {
    console.error('Subscription error:', error);
  }
});
```

### Performance Impact

Exactly-once delivery has performance trade-offs:

```typescript
// Benchmark example
class DeliveryBenchmark {
  private startTime: number = 0;
  private messageCount: number = 0;

  async benchmarkDeliveryMode(enableExactlyOnce: boolean) {
    const topicName = 'benchmark-topic';
    const subName = enableExactlyOnce ? 'exactly-once-sub' : 'at-least-once-sub';

    const [subscription] = await pubsub.topic(topicName).createSubscription(subName, {
      enableExactlyOnceDelivery: enableExactlyOnce
    });

    this.startTime = Date.now();
    this.messageCount = 0;

    subscription.on('message', (message) => {
      this.messageCount++;
      message.ack();

      if (this.messageCount === 1000) {
        const duration = Date.now() - this.startTime;
        const throughput = (this.messageCount / duration) * 1000;

        console.log(`${enableExactlyOnce ? 'Exactly-once' : 'At-least-once'} delivery:`);
        console.log(`  Processed ${this.messageCount} messages in ${duration}ms`);
        console.log(`  Throughput: ${throughput.toFixed(2)} msg/sec`);
      }
    });
  }
}

// Expected results:
// At-least-once: ~1000-5000 msg/sec
// Exactly-once: ~500-2000 msg/sec (higher latency, lower throughput)
```

### Monitoring Exactly-Once Delivery

Monitor subscription metrics for exactly-once delivery:

```typescript
async function monitorExactlyOnceMetrics() {
  const subscription = pubsub.subscription('my-exactly-once-subscription');

  // Track ack success/failure rates
  let ackSuccesses = 0;
  let ackFailures = 0;

  subscription.on('message', (message) => {
    processMessage(message.data)
      .then(() => {
        message.ack();
        ackSuccesses++;
      })
      .catch((error) => {
        message.nack();
        ackFailures++;
      });
  });

  subscription.on('error', (error) => {
    ackFailures++;
    console.error('Exactly-once error:', error.message);
  });

  // Periodic metrics reporting
  setInterval(() => {
    const total = ackSuccesses + ackFailures;
    const successRate = total > 0 ? (ackSuccesses / total) * 100 : 0;

    console.log('Exactly-once metrics:');
    console.log(`  Ack successes: ${ackSuccesses}`);
    console.log(`  Ack failures: ${ackFailures}`);
    console.log(`  Success rate: ${successRate.toFixed(2)}%`);

    // Alert if success rate drops below threshold
    if (successRate < 95 && total > 100) {
      console.error('ALERT: Exactly-once ack success rate below 95%');
    }
  }, 60000); // Every minute
}
```

### Best Practices

1. **Use When Idempotency is Difficult**: Exactly-once delivery is most valuable when implementing idempotent processing is complex:

```typescript
// Without exactly-once: Complex idempotency required
const processedIds = new Map<string, boolean>();

async function processWithIdempotency(message: Message) {
  if (processedIds.has(message.id)) {
    message.ack();
    return;
  }

  await database.transaction(async (tx) => {
    const existing = await tx.query(
      'SELECT id FROM processed_messages WHERE message_id = $1',
      [message.id]
    );

    if (existing.rows.length > 0) {
      message.ack();
      return;
    }

    await processMessage(message.data);
    await tx.query(
      'INSERT INTO processed_messages (message_id) VALUES ($1)',
      [message.id]
    );
  });

  processedIds.set(message.id, true);
  message.ack();
}

// With exactly-once: Simpler processing
async function processWithExactlyOnce(message: Message) {
  await processMessage(message.data);
  message.ack(); // Guaranteed to process only once
}
```

2. **Combine with Appropriate Ack Deadline**: Give processing enough time:

```typescript
const [subscription] = await pubsub.topic('my-topic').createSubscription('my-sub', {
  enableExactlyOnceDelivery: true,
  ackDeadlineSeconds: 300, // 5 minutes for complex processing
});
```

3. **Handle Ack Errors Gracefully**: Plan for ack failures:

```typescript
async function robustExactlyOnceHandler(message: Message) {
  let processed = false;

  try {
    await processMessage(message.data);
    processed = true;
    message.ack();
  } catch (error) {
    if (processed) {
      // Processing succeeded but ack failed
      // Log for investigation but don't reprocess
      console.error('Ack failed after successful processing:', error);

      // Message will be redelivered but exactly-once
      // guarantees it won't be processed again
    } else {
      // Processing failed
      console.error('Processing failed:', error);
      message.nack();
    }
  }
}
```

4. **Consider Costs**: Exactly-once delivery has higher costs than at-least-once. Use selectively:

```typescript
// Use exactly-once for critical operations
const [paymentSub] = await pubsub.topic('payments').createSubscription('payment-processor', {
  enableExactlyOnceDelivery: true // Critical: no duplicate charges
});

// Use at-least-once for idempotent operations
const [logSub] = await pubsub.topic('logs').createSubscription('log-aggregator', {
  enableExactlyOnceDelivery: false // Logs can dedupe at query time
});
```

---

## 5. Message Ordering

Message ordering guarantees that messages published with the same ordering key are delivered to subscribers in the order they were published.

### Enabling Message Ordering

Configure ordering at both topic and subscription level:

```typescript
async function setupOrderedMessaging() {
  // Enable message ordering on topic
  const [topic] = await pubsub.createTopic('ordered-topic', {
    messageStoragePolicy: {
      allowedPersistenceRegions: ['us-central1']
    }
  });

  // Create subscription with ordering enabled
  const [subscription] = await topic.createSubscription('ordered-subscription', {
    enableMessageOrdering: true
  });

  console.log('Ordered messaging configured');
  return { topic, subscription };
}
```

### Publishing with Ordering Keys

Use ordering keys to group related messages:

```typescript
async function publishOrderedMessages() {
  const topic = pubsub.topic('ordered-topic');

  // Messages for user 'user-123' will be delivered in order
  for (let i = 1; i <= 5; i++) {
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify({
        userId: 'user-123',
        action: 'login',
        sequence: i
      })),
      orderingKey: 'user-123' // All messages with this key stay ordered
    });
  }

  // Messages for different users can be delivered in parallel
  await topic.publishMessage({
    data: Buffer.from(JSON.stringify({
      userId: 'user-456',
      action: 'login',
      sequence: 1
    })),
    orderingKey: 'user-456' // Independent ordering
  });

  console.log('Ordered messages published');
}
```

### Subscribing to Ordered Messages

Process ordered messages sequentially per ordering key:

```typescript
async function subscribeToOrderedMessages() {
  const subscription = pubsub.subscription('ordered-subscription');

  // Track last processed sequence per ordering key
  const lastSequence = new Map<string, number>();

  subscription.on('message', (message) => {
    const data = JSON.parse(message.data.toString());
    const orderingKey = message.orderingKey;

    console.log(`Received message with ordering key: ${orderingKey}`);
    console.log(`  Sequence: ${data.sequence}`);

    // Verify ordering
    const expectedSequence = (lastSequence.get(orderingKey) || 0) + 1;
    if (data.sequence === expectedSequence) {
      console.log('  ✓ In order');
      lastSequence.set(orderingKey, data.sequence);
      message.ack();
    } else {
      console.error(`  ✗ Out of order! Expected ${expectedSequence}, got ${data.sequence}`);
      // With ordering enabled, this should never happen
      message.nack();
    }
  });
}
```

### Throughput Limits

Ordering keys limit parallelism. Each ordering key is processed sequentially:

```typescript
// Single ordering key: Sequential processing
async function demonstrateSingleKeyLimit() {
  const topic = pubsub.topic('ordered-topic');

  const startTime = Date.now();

  // Publish 100 messages with same ordering key
  for (let i = 0; i < 100; i++) {
    await topic.publishMessage({
      data: Buffer.from(`Message ${i}`),
      orderingKey: 'single-key' // All messages sequential
    });
  }

  console.log(`Published 100 messages in ${Date.now() - startTime}ms`);
  // Expected: Slower due to sequential processing
}

// Multiple ordering keys: Parallel processing
async function demonstrateMultipleKeyThroughput() {
  const topic = pubsub.topic('ordered-topic');

  const startTime = Date.now();

  // Publish 100 messages across 10 ordering keys
  const promises = [];
  for (let i = 0; i < 100; i++) {
    const orderingKey = `key-${i % 10}`; // 10 parallel streams
    promises.push(
      topic.publishMessage({
        data: Buffer.from(`Message ${i}`),
        orderingKey
      })
    );
  }

  await Promise.all(promises);
  console.log(`Published 100 messages in ${Date.now() - startTime}ms`);
  // Expected: Faster due to parallel processing
}
```

### Cascading Redelivery

When a message fails, all subsequent messages with the same ordering key are blocked:

```typescript
async function demonstrateCascadingRedelivery() {
  const subscription = pubsub.subscription('ordered-subscription');

  let messageCount = 0;

  subscription.on('message', async (message) => {
    messageCount++;
    const data = JSON.parse(message.data.toString());

    console.log(`Processing message ${messageCount}: ${data.sequence}`);

    // Simulate failure on message 3
    if (data.sequence === 3) {
      console.log('Simulating processing failure...');
      message.nack();

      // All subsequent messages with same ordering key
      // will be blocked until this succeeds
      return;
    }

    // Process successfully
    await processMessage(message.data);
    message.ack();
  });

  // Output:
  // Processing message 1: 1 ✓
  // Processing message 2: 2 ✓
  // Processing message 3: 3 ✗ (nacked)
  // Processing message 4: 3 (redelivered, blocked others)
  // ... messages 4, 5, 6 wait until 3 succeeds
}
```

### Handling Ordering Errors

Implement error handling for ordered message processing:

```typescript
class OrderedMessageProcessor {
  private readonly maxRetries = 3;
  private readonly retryCount = new Map<string, number>();

  async processMessage(message: Message) {
    const orderingKey = message.orderingKey;
    const currentRetries = this.retryCount.get(message.id) || 0;

    try {
      await this.doProcessing(message.data);

      // Success: Clear retry count and ack
      this.retryCount.delete(message.id);
      message.ack();

    } catch (error) {
      console.error(`Processing failed for ordering key ${orderingKey}:`, error);

      if (currentRetries < this.maxRetries) {
        // Retry: Nack to trigger redelivery
        this.retryCount.set(message.id, currentRetries + 1);
        message.nack();

        console.log(`Will retry (attempt ${currentRetries + 1}/${this.maxRetries})`);
      } else {
        // Max retries exceeded: Ack to unblock ordering key
        console.error(`Max retries exceeded for message ${message.id}`);
        console.error('Acking to unblock ordering key - message may be lost!');

        // Log to dead letter or error tracking
        await this.logFailedMessage(message, error);

        message.ack(); // Unblock subsequent messages
        this.retryCount.delete(message.id);
      }
    }
  }

  private async doProcessing(data: Buffer) {
    // Actual message processing logic
  }

  private async logFailedMessage(message: Message, error: Error) {
    // Send to monitoring/alerting system
    console.error('Failed message details:', {
      id: message.id,
      orderingKey: message.orderingKey,
      data: message.data.toString(),
      error: error.message
    });
  }
}
```

### Compatibility with Other Features

Message ordering works with (and without) other features:

```typescript
// Ordering + Dead Letter Topics
const [orderedWithDLQ] = await topic.createSubscription('ordered-dlq-sub', {
  enableMessageOrdering: true,
  deadLetterPolicy: {
    deadLetterTopic: pubsub.topic('dead-letter-topic').name,
    maxDeliveryAttempts: 5
  }
});

// Ordering + Filtering
const [orderedFiltered] = await topic.createSubscription('ordered-filtered-sub', {
  enableMessageOrdering: true,
  filter: 'attributes.priority = "high"'
  // Note: Filtering happens before ordering is applied
});

// Ordering + Exactly-Once Delivery
const [orderedExactlyOnce] = await topic.createSubscription('ordered-exactly-once-sub', {
  enableMessageOrdering: true,
  enableExactlyOnceDelivery: true
  // Best of both: ordered AND no duplicates
});

// Ordering is NOT compatible with:
// - Parallel message processing (by design)
// - Multiple concurrent subscribers (each subscriber sees ordered delivery)
```

### Best Practices

1. **Choose Appropriate Ordering Keys**: Use high-cardinality keys for better parallelism:

```typescript
// Good: High cardinality (many unique keys)
const goodOrderingKey = `user-${userId}`; // Thousands of users
const goodOrderingKey2 = `device-${deviceId}`; // Millions of devices

// Bad: Low cardinality (few unique keys)
const badOrderingKey = 'all-messages'; // Everything sequential
const badOrderingKey2 = region; // Only a few regions

// Optimal: Balance between ordering requirements and throughput
interface OrderingStrategy {
  // Per-user ordering for user operations
  userOperations: () => `user-${string}`;

  // Per-tenant ordering for multi-tenant systems
  tenantOperations: () => `tenant-${string}`;

  // Per-session ordering for short-lived workflows
  sessionOperations: () => `session-${string}`;
}
```

2. **Monitor Ordering Key Distribution**:

```typescript
class OrderingKeyMetrics {
  private keyMessageCount = new Map<string, number>();

  recordMessage(orderingKey: string) {
    const count = this.keyMessageCount.get(orderingKey) || 0;
    this.keyMessageCount.set(orderingKey, count + 1);
  }

  getMetrics() {
    const counts = Array.from(this.keyMessageCount.values());
    const totalKeys = this.keyMessageCount.size;
    const totalMessages = counts.reduce((sum, count) => sum + count, 0);
    const avgMessagesPerKey = totalMessages / totalKeys;

    // Identify hot keys
    const hotKeys = Array.from(this.keyMessageCount.entries())
      .filter(([, count]) => count > avgMessagesPerKey * 2)
      .sort((a, b) => b[1] - a[1]);

    return {
      totalKeys,
      totalMessages,
      avgMessagesPerKey,
      hotKeys: hotKeys.slice(0, 10), // Top 10 hot keys
      distribution: {
        min: Math.min(...counts),
        max: Math.max(...counts),
        median: this.median(counts)
      }
    };
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}
```

3. **Handle Blocking Gracefully**: Plan for message failures:

```typescript
async function setupOrderedSubscriptionWithMonitoring() {
  const subscription = pubsub.subscription('ordered-subscription');

  // Track blocked ordering keys
  const blockedKeys = new Map<string, { since: Date; messageId: string }>();

  subscription.on('message', async (message) => {
    const orderingKey = message.orderingKey;

    try {
      await processMessage(message.data);
      message.ack();

      // Unblock if this key was blocked
      if (blockedKeys.has(orderingKey)) {
        const blockDuration = Date.now() - blockedKeys.get(orderingKey)!.since.getTime();
        console.log(`Ordering key ${orderingKey} unblocked after ${blockDuration}ms`);
        blockedKeys.delete(orderingKey);
      }

    } catch (error) {
      console.error(`Processing failed for ordering key ${orderingKey}:`, error);

      // Track blocking
      if (!blockedKeys.has(orderingKey)) {
        blockedKeys.set(orderingKey, {
          since: new Date(),
          messageId: message.id
        });
        console.warn(`Ordering key ${orderingKey} now blocked`);
      }

      message.nack();
    }
  });

  // Monitor for long-blocked keys
  setInterval(() => {
    const now = Date.now();
    for (const [key, info] of blockedKeys.entries()) {
      const blockedDuration = now - info.since.getTime();
      if (blockedDuration > 60000) { // 1 minute
        console.error(`ALERT: Ordering key ${key} blocked for ${blockedDuration}ms`);
      }
    }
  }, 30000); // Check every 30 seconds
}
```

---

## 6. Flow Control

Flow control manages the rate of message delivery to prevent overwhelming subscribers and publishers, ensuring stable system operation under varying loads.

### Publisher Flow Control

Control publish rate to avoid overwhelming Pub/Sub or downstream systems:

```typescript
import { PubSub } from '@google-cloud/pubsub';

async function setupPublisherFlowControl() {
  const pubsub = new PubSub();
  const topic = pubsub.topic('my-topic', {
    batching: {
      maxMessages: 100,        // Batch up to 100 messages
      maxMilliseconds: 100,    // Or wait 100ms
      maxBytes: 1024 * 1024    // Or reach 1MB
    },
    flowControlOptions: {
      maxOutstandingMessages: 1000,  // Max 1000 unconfirmed messages
      maxOutstandingBytes: 10 * 1024 * 1024  // Or 10MB of data
    }
  });

  return topic;
}

// Publishing with flow control
async function publishWithFlowControl() {
  const topic = await setupPublisherFlowControl();

  const messages = Array.from({ length: 10000 }, (_, i) => ({
    data: Buffer.from(JSON.stringify({ id: i, timestamp: Date.now() }))
  }));

  // Flow control automatically manages publish rate
  const publishPromises = messages.map(message =>
    topic.publishMessage(message)
  );

  try {
    const messageIds = await Promise.all(publishPromises);
    console.log(`Published ${messageIds.length} messages with flow control`);
  } catch (error) {
    if (error.code === 'FLOW_CONTROL_LIMIT_EXCEEDED') {
      console.error('Flow control limit exceeded');
      // Implement backoff or queuing strategy
    }
  }
}
```

### Subscriber Flow Control

Control message delivery rate to subscribers:

```typescript
async function setupSubscriberFlowControl() {
  const subscription = pubsub.subscription('my-subscription', {
    flowControl: {
      maxMessages: 100,          // Deliver max 100 messages at once
      maxBytes: 10 * 1024 * 1024, // Or 10MB of message data
      allowExcessMessages: false  // Block when limit reached
    }
  });

  return subscription;
}

// Advanced flow control configuration
async function setupAdvancedFlowControl() {
  const subscription = pubsub.subscription('my-subscription', {
    flowControl: {
      // Maximum outstanding messages
      maxMessages: 1000,

      // Maximum outstanding bytes
      maxBytes: 100 * 1024 * 1024, // 100MB

      // Whether to allow exceeding limits temporarily
      allowExcessMessages: false
    },
    // Ack deadline affects flow control
    ackDeadlineSeconds: 60
  });

  return subscription;
}
```

### Memory Management

Flow control helps prevent memory exhaustion:

```typescript
class MemoryAwareSubscriber {
  private readonly maxMemoryUsage: number;
  private currentMemoryUsage: number = 0;

  constructor(maxMemoryMB: number) {
    this.maxMemoryUsage = maxMemoryMB * 1024 * 1024;
  }

  async setupSubscription() {
    // Calculate flow control based on average message size
    const avgMessageSize = 1024; // 1KB average
    const maxMessages = Math.floor(this.maxMemoryUsage / avgMessageSize);

    const subscription = pubsub.subscription('my-subscription', {
      flowControl: {
        maxMessages,
        maxBytes: this.maxMemoryUsage,
        allowExcessMessages: false
      }
    });

    subscription.on('message', (message) => {
      this.currentMemoryUsage += message.length;

      this.processMessage(message)
        .then(() => {
          message.ack();
          this.currentMemoryUsage -= message.length;
        })
        .catch((error) => {
          console.error('Processing failed:', error);
          message.nack();
          this.currentMemoryUsage -= message.length;
        });
    });

    // Monitor memory usage
    setInterval(() => {
      const usagePercent = (this.currentMemoryUsage / this.maxMemoryUsage) * 100;
      console.log(`Memory usage: ${usagePercent.toFixed(2)}%`);

      if (usagePercent > 80) {
        console.warn('High memory usage - flow control engaged');
      }
    }, 10000);
  }

  private async processMessage(message: Message): Promise<void> {
    // Process message
  }
}
```

### Limit Exceeded Behavior

Configure behavior when flow control limits are exceeded:

```typescript
// Block mode: Wait for capacity
async function setupBlockingFlowControl() {
  const subscription = pubsub.subscription('my-subscription', {
    flowControl: {
      maxMessages: 100,
      allowExcessMessages: false // Block new messages when limit reached
    }
  });

  subscription.on('message', async (message) => {
    // Process slowly to demonstrate blocking
    await new Promise(resolve => setTimeout(resolve, 1000));
    message.ack();
  });

  // When 100 messages are outstanding, no new messages delivered
  // until some are acked
}

// Allow excess mode: Temporarily exceed limits
async function setupAllowExcessFlowControl() {
  const subscription = pubsub.subscription('my-subscription', {
    flowControl: {
      maxMessages: 100,
      allowExcessMessages: true // Allow temporary limit exceedance
    }
  });

  // Useful for handling bursts, but monitor memory usage
}

// Manual flow control
class ManualFlowControl {
  private outstandingMessages = 0;
  private readonly maxOutstanding = 100;
  private isPaused = false;

  setupSubscription() {
    const subscription = pubsub.subscription('my-subscription');

    subscription.on('message', async (message) => {
      this.outstandingMessages++;

      // Pause if limit reached
      if (this.outstandingMessages >= this.maxOutstanding && !this.isPaused) {
        console.log('Flow control: pausing subscription');
        subscription.close();
        this.isPaused = true;
      }

      try {
        await this.processMessage(message);
        message.ack();
      } catch (error) {
        message.nack();
      } finally {
        this.outstandingMessages--;

        // Resume if below threshold
        if (this.outstandingMessages < this.maxOutstanding * 0.5 && this.isPaused) {
          console.log('Flow control: resuming subscription');
          // Recreate subscription to resume
          this.setupSubscription();
          this.isPaused = false;
        }
      }
    });
  }

  private async processMessage(message: Message): Promise<void> {
    // Process message
  }
}
```

### Dynamic Flow Control

Adjust flow control based on system metrics:

```typescript
class DynamicFlowControl {
  private currentMaxMessages: number;
  private readonly minMaxMessages = 10;
  private readonly maxMaxMessages = 1000;

  constructor() {
    this.currentMaxMessages = 100;
  }

  async setupAdaptiveSubscription() {
    let subscription = this.createSubscription();

    // Monitor system metrics
    setInterval(async () => {
      const metrics = await this.getSystemMetrics();
      const newMaxMessages = this.calculateOptimalMaxMessages(metrics);

      if (newMaxMessages !== this.currentMaxMessages) {
        console.log(`Adjusting flow control: ${this.currentMaxMessages} -> ${newMaxMessages}`);

        // Recreate subscription with new flow control
        await subscription.close();
        this.currentMaxMessages = newMaxMessages;
        subscription = this.createSubscription();
      }
    }, 60000); // Adjust every minute
  }

  private createSubscription() {
    return pubsub.subscription('my-subscription', {
      flowControl: {
        maxMessages: this.currentMaxMessages,
        allowExcessMessages: false
      }
    });
  }

  private async getSystemMetrics() {
    // Get actual system metrics (CPU, memory, etc.)
    return {
      cpuUsage: 0.5,        // 50%
      memoryUsage: 0.6,     // 60%
      processingLatency: 100 // ms
    };
  }

  private calculateOptimalMaxMessages(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    processingLatency: number;
  }): number {
    // Decrease if system is stressed
    if (metrics.cpuUsage > 0.8 || metrics.memoryUsage > 0.8) {
      return Math.max(
        this.minMaxMessages,
        Math.floor(this.currentMaxMessages * 0.8)
      );
    }

    // Increase if system has capacity
    if (metrics.cpuUsage < 0.5 && metrics.memoryUsage < 0.5) {
      return Math.min(
        this.maxMaxMessages,
        Math.floor(this.currentMaxMessages * 1.2)
      );
    }

    return this.currentMaxMessages;
  }
}
```

### Best Practices

1. **Start Conservative**: Begin with lower limits and increase based on monitoring:

```typescript
const conservativeFlowControl = {
  flowControl: {
    maxMessages: 10,      // Start small
    maxBytes: 1024 * 1024 // 1MB
  }
};

// Gradually increase after monitoring
const productionFlowControl = {
  flowControl: {
    maxMessages: 100,
    maxBytes: 10 * 1024 * 1024
  }
};
```

2. **Consider Message Size Variance**: Account for variable message sizes:

```typescript
class VariableSizeFlowControl {
  setupSubscription(avgMessageSize: number, maxMessageSize: number) {
    // Conservative estimate based on max size
    const maxMessages = Math.floor((50 * 1024 * 1024) / maxMessageSize);

    const subscription = pubsub.subscription('my-subscription', {
      flowControl: {
        maxMessages,
        maxBytes: 50 * 1024 * 1024, // 50MB buffer
        allowExcessMessages: false
      }
    });

    console.log(`Flow control: max ${maxMessages} messages (assuming ${maxMessageSize} bytes each)`);

    return subscription;
  }
}
```

3. **Monitor Flow Control Metrics**:

```typescript
class FlowControlMonitor {
  private messagesReceived = 0;
  private messagesBlocked = 0;

  setupMonitoredSubscription() {
    const subscription = pubsub.subscription('my-subscription', {
      flowControl: {
        maxMessages: 100,
        allowExcessMessages: false
      }
    });

    subscription.on('message', (message) => {
      this.messagesReceived++;
      message.ack();
    });

    subscription.on('error', (error) => {
      if (error.code === 'FLOW_CONTROL_LIMIT_EXCEEDED') {
        this.messagesBlocked++;
      }
    });

    setInterval(() => {
      const blockRate = this.messagesBlocked / (this.messagesReceived + this.messagesBlocked);
      console.log('Flow control metrics:');
      console.log(`  Messages received: ${this.messagesReceived}`);
      console.log(`  Messages blocked: ${this.messagesBlocked}`);
      console.log(`  Block rate: ${(blockRate * 100).toFixed(2)}%`);

      if (blockRate > 0.1) {
        console.warn('High block rate - consider increasing flow control limits');
      }
    }, 60000);
  }
}
```

4. **Coordinate with Ack Deadline**: Ensure flow control and ack deadline work together:

```typescript
function calculateFlowControlSettings(
  processingTimeMs: number,
  concurrency: number
) {
  // Ack deadline should be > processing time
  const ackDeadlineSeconds = Math.ceil(processingTimeMs / 1000) * 2;

  // Max messages should account for concurrency
  const maxMessages = concurrency * 2;

  return {
    ackDeadlineSeconds,
    flowControl: {
      maxMessages,
      allowExcessMessages: false
    }
  };
}

// Example usage
const settings = calculateFlowControlSettings(
  5000,  // 5 second processing time
  10     // 10 concurrent workers
);

const subscription = pubsub.subscription('my-subscription', settings);
```

---

## 7. Snapshots and Seek

Snapshots capture the acknowledgment state of a subscription at a point in time, enabling replay of messages from that point. The seek operation allows subscribers to reprocess messages from snapshots or specific timestamps.

### Creating Snapshots

Create a snapshot of a subscription's current state:

```typescript
async function createSubscriptionSnapshot() {
  const subscription = pubsub.subscription('my-subscription');
  const snapshotName = 'my-snapshot-' + Date.now();

  const [snapshot] = await subscription.createSnapshot(snapshotName);

  console.log(`Snapshot created: ${snapshot.name}`);
  console.log(`Snapshot ID: ${snapshot.id}`);

  // Snapshot captures:
  // - All unacknowledged messages
  // - Ack state at time of creation

  return snapshot;
}

// Create snapshot with explicit name
async function createNamedSnapshot(snapshotName: string) {
  const subscription = pubsub.subscription('my-subscription');

  try {
    const [snapshot] = await subscription.createSnapshot(snapshotName);
    console.log(`Created snapshot: ${snapshot.name}`);
    return snapshot;
  } catch (error) {
    if (error.code === 'ALREADY_EXISTS') {
      console.log(`Snapshot ${snapshotName} already exists`);
      return pubsub.snapshot(snapshotName);
    }
    throw error;
  }
}
```

### Seeking to Snapshots

Seek a subscription to a snapshot to replay messages:

```typescript
async function seekToSnapshot() {
  const subscription = pubsub.subscription('my-subscription');
  const snapshot = pubsub.snapshot('my-snapshot');

  // Seek to snapshot
  await subscription.seek(snapshot);

  console.log('Subscription seeked to snapshot');
  console.log('All messages from snapshot point will be redelivered');

  // Messages are now redelivered from the snapshot point
}

// Seek with error handling
async function robustSeekToSnapshot(snapshotName: string) {
  const subscription = pubsub.subscription('my-subscription');
  const snapshot = pubsub.snapshot(snapshotName);

  try {
    await subscription.seek(snapshot);
    console.log(`Successfully seeked to snapshot: ${snapshotName}`);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      console.error(`Snapshot ${snapshotName} not found`);
    } else if (error.code === 'FAILED_PRECONDITION') {
      console.error('Cannot seek: subscription has outstanding messages');
      console.error('Close subscription and try again');
    } else {
      console.error('Seek failed:', error);
    }
    throw error;
  }
}
```

### Seeking to Timestamps

Seek to a specific point in time to replay messages:

```typescript
async function seekToTimestamp() {
  const subscription = pubsub.subscription('my-subscription');

  // Seek to 1 hour ago
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await subscription.seek(oneHourAgo);

  console.log(`Seeked to ${oneHourAgo.toISOString()}`);
  console.log('Messages published after this time will be redelivered');
}

// Seek to specific timestamp
async function seekToSpecificTime(isoTimestamp: string) {
  const subscription = pubsub.subscription('my-subscription');
  const timestamp = new Date(isoTimestamp);

  console.log(`Seeking to ${timestamp.toISOString()}`);
  await subscription.seek(timestamp);

  console.log('Seek complete - messages will be redelivered');
}

// Seek to beginning (replay all retained messages)
async function seekToBeginning() {
  const subscription = pubsub.subscription('my-subscription');

  // Seek to epoch to get all retained messages
  const epoch = new Date(0);
  await subscription.seek(epoch);

  console.log('Seeked to beginning - all retained messages will be redelivered');
}
```

### Use Cases

Common scenarios for snapshots and seek:

```typescript
// 1. Disaster Recovery
async function disasterRecoverySnapshot() {
  const subscription = pubsub.subscription('critical-subscription');

  // Create snapshot before risky operation
  const [snapshot] = await subscription.createSnapshot('pre-deployment-snapshot');

  console.log('Pre-deployment snapshot created');

  // If deployment fails, seek back to snapshot
  async function rollback() {
    await subscription.seek(snapshot);
    console.log('Rolled back to pre-deployment state');
  }

  return { snapshot, rollback };
}

// 2. Reprocessing After Bug Fix
async function reprocessAfterBugFix() {
  const subscription = pubsub.subscription('my-subscription');

  // Bug was deployed at this time
  const bugDeployTime = new Date('2026-01-14T10:00:00Z');

  // Bug was fixed now
  console.log('Bug fixed - reprocessing messages since bug deployment');

  // Seek to when bug was deployed
  await subscription.seek(bugDeployTime);

  // All messages since bug deployment will be reprocessed with fix
}

// 3. Testing and Development
async function createTestSnapshot() {
  const subscription = pubsub.subscription('dev-subscription');

  // Create snapshot of current state
  const [snapshot] = await subscription.createSnapshot('test-baseline');

  // Run tests
  async function runTests() {
    // Process messages, test functionality
  }

  // Reset to baseline for next test
  async function resetToBaseline() {
    await subscription.seek(snapshot);
    console.log('Reset to test baseline');
  }

  return { runTests, resetToBaseline };
}

// 4. Audit and Compliance
async function auditLogReplay() {
  const subscription = pubsub.subscription('audit-log-subscription');

  // Create daily snapshots for compliance
  const snapshotName = `audit-snapshot-${new Date().toISOString().split('T')[0]}`;
  await subscription.createSnapshot(snapshotName);

  console.log(`Daily audit snapshot created: ${snapshotName}`);

  // Later: Replay specific day's events for audit
  async function replayAuditDay(date: string) {
    const snapshot = pubsub.snapshot(`audit-snapshot-${date}`);
    await subscription.seek(snapshot);
    console.log(`Replaying audit events for ${date}`);
  }

  return { replayAuditDay };
}

// 5. A/B Testing with Rollback
async function abTestWithRollback() {
  const subscription = pubsub.subscription('analytics-subscription');

  // Create snapshot before A/B test
  const [baselineSnapshot] = await subscription.createSnapshot('ab-test-baseline');

  // Run A/B test variant
  async function runVariant() {
    console.log('Running A/B test variant...');
    // Process messages with new logic
  }

  // If variant performs poorly, rollback
  async function rollbackVariant() {
    await subscription.seek(baselineSnapshot);
    console.log('Rolled back A/B test - reprocessing with original logic');
  }

  return { runVariant, rollbackVariant };
}
```

### Snapshot Management

Manage snapshot lifecycle:

```typescript
class SnapshotManager {
  private readonly subscription: Subscription;
  private readonly maxSnapshots: number;

  constructor(subscriptionName: string, maxSnapshots: number = 10) {
    this.subscription = pubsub.subscription(subscriptionName);
    this.maxSnapshots = maxSnapshots;
  }

  async createSnapshot(name?: string): Promise<Snapshot> {
    const snapshotName = name || `snapshot-${Date.now()}`;
    const [snapshot] = await this.subscription.createSnapshot(snapshotName);

    console.log(`Created snapshot: ${snapshot.name}`);

    // Cleanup old snapshots
    await this.cleanupOldSnapshots();

    return snapshot;
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const [snapshots] = await pubsub.getSnapshots();

    // Filter to snapshots for this subscription
    const subscriptionPath = this.subscription.name;
    return snapshots.filter(snapshot =>
      snapshot.subscription === subscriptionPath
    );
  }

  async cleanupOldSnapshots(): Promise<void> {
    const snapshots = await this.listSnapshots();

    if (snapshots.length <= this.maxSnapshots) {
      return;
    }

    // Sort by creation time (oldest first)
    snapshots.sort((a, b) => {
      const aTime = a.metadata?.createTime?.seconds || 0;
      const bTime = b.metadata?.createTime?.seconds || 0;
      return aTime - bTime;
    });

    // Delete oldest snapshots
    const toDelete = snapshots.slice(0, snapshots.length - this.maxSnapshots);
    for (const snapshot of toDelete) {
      await snapshot.delete();
      console.log(`Deleted old snapshot: ${snapshot.name}`);
    }
  }

  async deleteSnapshot(snapshotName: string): Promise<void> {
    const snapshot = pubsub.snapshot(snapshotName);
    await snapshot.delete();
    console.log(`Deleted snapshot: ${snapshotName}`);
  }

  async seekToLatestSnapshot(): Promise<void> {
    const snapshots = await this.listSnapshots();

    if (snapshots.length === 0) {
      throw new Error('No snapshots available');
    }

    // Sort by creation time (newest first)
    snapshots.sort((a, b) => {
      const aTime = a.metadata?.createTime?.seconds || 0;
      const bTime = b.metadata?.createTime?.seconds || 0;
      return bTime - aTime;
    });

    const latestSnapshot = snapshots[0];
    await this.subscription.seek(latestSnapshot);

    console.log(`Seeked to latest snapshot: ${latestSnapshot.name}`);
  }
}

// Usage
const snapshotManager = new SnapshotManager('my-subscription', 5);

// Create periodic snapshots
setInterval(async () => {
  await snapshotManager.createSnapshot();
}, 60 * 60 * 1000); // Every hour
```

### Limitations

Important limitations of snapshots and seek:

```typescript
// 1. Message Retention
// Can only seek to messages within retention period
async function demonstrateRetentionLimit() {
  const subscription = pubsub.subscription('my-subscription');

  // Topic has 7-day retention
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  try {
    await subscription.seek(eightDaysAgo);
  } catch (error) {
    console.error('Cannot seek beyond retention period');
    // Messages older than retention period are no longer available
  }
}

// 2. Snapshot Expiration
// Snapshots expire after 7 days
async function demonstrateSnapshotExpiration() {
  const subscription = pubsub.subscription('my-subscription');

  // Create snapshot
  const [snapshot] = await subscription.createSnapshot('old-snapshot');

  // 8 days later...
  // Snapshot has expired
  try {
    await subscription.seek(snapshot);
  } catch (error) {
    console.error('Snapshot expired after 7 days');
  }
}

// 3. Subscription State
// Cannot seek while messages are outstanding
async function demonstrateSeekPreconditions() {
  const subscription = pubsub.subscription('my-subscription');

  // If subscription has active message processing
  try {
    await subscription.seek(new Date());
  } catch (error) {
    if (error.code === 'FAILED_PRECONDITION') {
      console.error('Cannot seek: subscription has outstanding messages');
      console.error('Close subscription first');

      // Must close subscription before seeking
      await subscription.close();
      await subscription.seek(new Date());
    }
  }
}

// 4. Message Ordering Compatibility
// Seeking resets ordering guarantees
async function demonstrateOrderingReset() {
  const subscription = pubsub.subscription('ordered-subscription', {
    enableMessageOrdering: true
  });

  console.log('Seeking will reset message ordering state');
  console.log('Messages may be redelivered in different order after seek');

  await subscription.seek(new Date());

  // Ordering resumes from seek point, but previous ordering is lost
}

// 5. Performance Impact
// Seeking can cause temporary delays
async function demonstrateSeekPerformance() {
  const subscription = pubsub.subscription('my-subscription');

  console.log('Seeking to snapshot...');
  const startTime = Date.now();

  await subscription.seek(pubsub.snapshot('my-snapshot'));

  const seekTime = Date.now() - startTime;
  console.log(`Seek completed in ${seekTime}ms`);
  console.log('Expect temporary delay in message delivery while seek processes');
}
```

### Best Practices

1. **Regular Snapshot Schedule**: Create snapshots at regular intervals for disaster recovery:

```typescript
class SnapshotScheduler {
  private readonly subscription: Subscription;
  private readonly intervalMs: number;
  private intervalId?: NodeJS.Timeout;

  constructor(subscriptionName: string, intervalHours: number) {
    this.subscription = pubsub.subscription(subscriptionName);
    this.intervalMs = intervalHours * 60 * 60 * 1000;
  }

  start(): void {
    console.log(`Starting snapshot scheduler (every ${this.intervalMs / 3600000} hours)`);

    this.intervalId = setInterval(async () => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapshotName = `auto-snapshot-${timestamp}`;

        await this.subscription.createSnapshot(snapshotName);
        console.log(`Auto-created snapshot: ${snapshotName}`);
      } catch (error) {
        console.error('Failed to create scheduled snapshot:', error);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('Stopped snapshot scheduler');
    }
  }
}

// Create hourly snapshots
const scheduler = new SnapshotScheduler('critical-subscription', 1);
scheduler.start();
```

2. **Snapshot Before Deployments**: Create safety snapshots before risky changes:

```typescript
async function deployWithSafetySnapshot() {
  const subscription = pubsub.subscription('production-subscription');

  // Create pre-deployment snapshot
  const deploymentId = process.env.DEPLOYMENT_ID || Date.now();
  const snapshotName = `pre-deploy-${deploymentId}`;

  console.log('Creating pre-deployment snapshot...');
  const [snapshot] = await subscription.createSnapshot(snapshotName);

  console.log(`Safety snapshot created: ${snapshot.name}`);
  console.log('Proceeding with deployment...');

  // Deploy application
  try {
    await deployApplication();
    console.log('Deployment successful');
  } catch (error) {
    console.error('Deployment failed - rolling back');
    await subscription.seek(snapshot);
    console.log('Rolled back to pre-deployment state');
    throw error;
  }
}
```

3. **Document Snapshot Purpose**: Clearly name and document snapshots:

```typescript
interface SnapshotMetadata {
  name: string;
  purpose: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
}

class DocumentedSnapshot {
  private metadata: Map<string, SnapshotMetadata> = new Map();

  async createDocumentedSnapshot(
    subscriptionName: string,
    purpose: string
  ): Promise<Snapshot> {
    const subscription = pubsub.subscription(subscriptionName);
    const timestamp = Date.now();
    const snapshotName = `${purpose}-${timestamp}`;

    const [snapshot] = await subscription.createSnapshot(snapshotName);

    // Store metadata
    this.metadata.set(snapshotName, {
      name: snapshotName,
      purpose,
      createdBy: process.env.USER || 'system',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    console.log(`Created documented snapshot: ${snapshotName}`);
    console.log(`Purpose: ${purpose}`);

    return snapshot;
  }

  getSnapshotMetadata(snapshotName: string): SnapshotMetadata | undefined {
    return this.metadata.get(snapshotName);
  }

  listDocumentedSnapshots(): SnapshotMetadata[] {
    return Array.from(this.metadata.values());
  }
}
```

4. **Test Seek Operations**: Validate seek behavior before production use:

```typescript
async function testSeekOperation() {
  const testTopic = pubsub.topic('test-topic');
  const [testSub] = await testTopic.createSubscription('test-seek-sub');

  // Publish test messages
  const messageIds: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const messageId = await testTopic.publishMessage({
      data: Buffer.from(`Message ${i}`)
    });
    messageIds.push(messageId);
  }

  // Process some messages
  let processedCount = 0;
  testSub.on('message', (message) => {
    processedCount++;
    message.ack();

    if (processedCount === 5) {
      testSub.removeAllListeners('message');
    }
  });

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`Processed ${processedCount} messages`);

  // Create snapshot
  const [snapshot] = await testSub.createSnapshot('test-snapshot');

  // Process remaining messages
  testSub.on('message', (message) => {
    processedCount++;
    message.ack();
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`Total processed: ${processedCount}`);

  // Seek back to snapshot
  await testSub.close();
  await testSub.seek(snapshot);

  // Verify messages are redelivered
  processedCount = 0;
  testSub.on('message', (message) => {
    processedCount++;
    message.ack();
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`Reprocessed after seek: ${processedCount}`);

  // Cleanup
  await testSub.delete();
  await testTopic.delete();
}
```

---

## Summary

This document covered seven advanced Pub/Sub features:

1. **Dead Letter Topics**: Handle undeliverable messages with automatic forwarding after max delivery attempts
2. **Retry Policies**: Control message redelivery with exponential backoff to avoid overwhelming failing subscribers
3. **Message Filtering**: Reduce network traffic and processing by filtering messages server-side based on attributes
4. **Exactly-Once Delivery**: Eliminate duplicate processing with transactional acknowledgments (region-limited)
5. **Message Ordering**: Guarantee ordered delivery for messages with the same ordering key
6. **Flow Control**: Manage message delivery rate to prevent memory exhaustion and system overload
7. **Snapshots and Seek**: Replay messages from specific points in time for disaster recovery and reprocessing

Each feature addresses specific reliability, performance, or operational requirements. Choose features based on your application's needs, considering trade-offs in complexity, cost, and performance.

### Feature Compatibility Matrix

| Feature | Compatible With | Incompatible With | Notes |
|---------|----------------|-------------------|-------|
| Dead Letter Topics | All features | - | Works with all other features |
| Retry Policies | All features | - | Works with all other features |
| Message Filtering | All features | - | Applied before other processing |
| Exactly-Once Delivery | Ordering, Filtering, DLQ | - | Region-limited, higher latency |
| Message Ordering | All features | - | Reduces parallelism per key |
| Flow Control | All features | - | Essential for all deployments |
| Snapshots/Seek | Most features | - | Resets ordering state on seek |

### When to Use Each Feature

- **Dead Letter Topics**: Always recommended for production subscriptions
- **Retry Policies**: Always recommended; tune based on error patterns
- **Message Filtering**: When <50% of published messages are relevant to subscriber
- **Exactly-Once Delivery**: When idempotent processing is difficult or costly
- **Message Ordering**: When message sequence matters (user actions, state transitions)
- **Flow Control**: Always configure to prevent memory issues
- **Snapshots/Seek**: For disaster recovery, reprocessing, and testing scenarios
