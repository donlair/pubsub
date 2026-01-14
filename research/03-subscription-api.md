# Subscription API Documentation

## Overview

The Subscription API provides a complete interface for managing Google Cloud Pub/Sub subscriptions, including creating, configuring, and consuming messages. Subscriptions are the primary mechanism for receiving messages published to topics.

## Table of Contents

1. [PubSub Client Subscription Methods](#pubsub-client-subscription-methods)
2. [Subscription Class Methods](#subscription-class-methods)
3. [Subscription Events](#subscription-events)
4. [Configuration Options](#configuration-options)
5. [Code Examples](#code-examples)

---

## PubSub Client Subscription Methods

### `pubsub.subscription(name: string): Subscription`

Returns a reference to an existing subscription.

```typescript
const subscription = pubsub.subscription('my-subscription');
```

**Parameters:**
- `name` (string): The name of the subscription

**Returns:** `Subscription` object

---

### `pubsub.createSubscription(topic: string | Topic, name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, CreateSubscriptionResponse]>`

Creates a new subscription to a topic.

```typescript
const [subscription, response] = await pubsub.createSubscription(
  'my-topic',
  'my-subscription',
  {
    ackDeadlineSeconds: 60,
    messageRetentionDuration: { seconds: 604800 }, // 7 days
    enableMessageOrdering: true
  }
);
```

**Parameters:**
- `topic` (string | Topic): The topic to subscribe to
- `name` (string): Name for the subscription
- `options` (CreateSubscriptionOptions): Optional configuration

**Returns:** Promise resolving to `[Subscription, CreateSubscriptionResponse]`

---

### `pubsub.getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], GetSubscriptionsResponse]>`

Lists all subscriptions in the project.

```typescript
const [subscriptions] = await pubsub.getSubscriptions();

// With filtering
const [subscriptions] = await pubsub.getSubscriptions({
  topic: 'my-topic',
  pageSize: 50
});
```

**Parameters:**
- `options` (GetSubscriptionsOptions): Optional query parameters
  - `topic` (string | Topic): Filter by topic
  - `pageSize` (number): Maximum results per page
  - `pageToken` (string): Token for pagination
  - `autoPaginate` (boolean): Auto-fetch all pages

**Returns:** Promise resolving to `[Subscription[], GetSubscriptionsResponse]`

---

### `pubsub.getSubscriptionsStream(options?: GetSubscriptionsOptions): ReadableStream<Subscription>`

Returns a stream of subscriptions for memory-efficient iteration.

```typescript
const stream = pubsub.getSubscriptionsStream({ topic: 'my-topic' });

for await (const subscription of stream) {
  console.log(`Subscription: ${subscription.name}`);
}
```

**Parameters:**
- `options` (GetSubscriptionsOptions): Optional query parameters

**Returns:** `ReadableStream<Subscription>`

---

## Subscription Class Methods

### Management Methods

#### `subscription.create(options?: CreateSubscriptionOptions): Promise<[Subscription, CreateSubscriptionResponse]>`

Creates the subscription if it doesn't exist.

```typescript
const [subscription, response] = await subscription.create({
  ackDeadlineSeconds: 30,
  retryPolicy: {
    minimumBackoff: { seconds: 10 },
    maximumBackoff: { seconds: 600 }
  }
});
```

**Parameters:**
- `options` (CreateSubscriptionOptions): Configuration options

**Returns:** Promise resolving to `[Subscription, CreateSubscriptionResponse]`

---

#### `subscription.delete(gaxOptions?: CallOptions): Promise<EmptyResponse>`

Deletes the subscription.

```typescript
await subscription.delete();
```

**Parameters:**
- `gaxOptions` (CallOptions): Optional gax configuration

**Returns:** Promise resolving when deletion completes

---

#### `subscription.exists(options?: CallOptions): Promise<[boolean]>`

Checks if the subscription exists.

```typescript
const [exists] = await subscription.exists();
if (exists) {
  console.log('Subscription exists');
}
```

**Returns:** Promise resolving to `[boolean]`

---

#### `subscription.get(options?: GetSubscriptionOptions): Promise<[Subscription, GetSubscriptionResponse]>`

Gets the subscription, optionally creating it if it doesn't exist.

```typescript
const [subscription] = await subscription.get({ autoCreate: true });
```

**Parameters:**
- `options` (GetSubscriptionOptions)
  - `autoCreate` (boolean): Create if doesn't exist

**Returns:** Promise resolving to `[Subscription, GetSubscriptionResponse]`

---

### Metadata Methods

#### `subscription.getMetadata(options?: CallOptions): Promise<[SubscriptionMetadata, GetSubscriptionResponse]>`

Retrieves the subscription's metadata and configuration.

```typescript
const [metadata] = await subscription.getMetadata();
console.log(`Ack deadline: ${metadata.ackDeadlineSeconds}s`);
console.log(`Message retention: ${metadata.messageRetentionDuration}`);
```

**Returns:** Promise resolving to `[SubscriptionMetadata, GetSubscriptionResponse]`

---

#### `subscription.setMetadata(metadata: SubscriptionMetadata, options?: CallOptions): Promise<[SubscriptionMetadata, UpdateSubscriptionResponse]>`

Updates the subscription's configuration.

```typescript
await subscription.setMetadata({
  ackDeadlineSeconds: 60,
  messageRetentionDuration: { seconds: 86400 }, // 1 day
  labels: {
    environment: 'production',
    team: 'backend'
  }
});
```

**Parameters:**
- `metadata` (SubscriptionMetadata): Properties to update
- `options` (CallOptions): Optional gax configuration

**Returns:** Promise resolving to `[SubscriptionMetadata, UpdateSubscriptionResponse]`

---

### Push Configuration

#### `subscription.modifyPushConfig(config: PushConfig, options?: CallOptions): Promise<EmptyResponse>`

Updates the push delivery configuration.

```typescript
// Configure push endpoint
await subscription.modifyPushConfig({
  pushEndpoint: 'https://myapp.com/push-handler',
  attributes: {
    'x-goog-version': 'v1'
  },
  oidcToken: {
    serviceAccountEmail: 'my-sa@project.iam.gserviceaccount.com',
    audience: 'https://myapp.com'
  }
});

// Convert to pull
await subscription.modifyPushConfig({ pushEndpoint: '' });
```

**Parameters:**
- `config` (PushConfig): Push configuration
  - `pushEndpoint` (string): HTTPS endpoint URL (empty for pull)
  - `attributes` (object): Custom headers
  - `oidcToken` (object): Authentication token config
  - `pubsubWrapper` (object): Wrapper format config

**Returns:** Promise resolving when update completes

---

### Options Configuration

#### `subscription.setOptions(options: SubscriptionOptions): void`

Sets runtime options for message handling.

```typescript
subscription.setOptions({
  flowControl: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024, // 10MB
    allowExcessMessages: false
  },
  batching: {
    maxMessages: 100,
    maxMilliseconds: 1000
  },
  ackDeadline: 30,
  streamingOptions: {
    maxStreams: 5,
    timeout: 60000
  }
});
```

**Parameters:**
- `options` (SubscriptionOptions): Runtime configuration (see [Configuration Options](#configuration-options))

---

### Snapshot Methods

#### `subscription.snapshot(name: string): Snapshot`

Returns a reference to a snapshot.

```typescript
const snapshot = subscription.snapshot('my-snapshot');
```

**Parameters:**
- `name` (string): Snapshot name

**Returns:** `Snapshot` object

---

#### `subscription.createSnapshot(name: string, options?: CreateSnapshotOptions): Promise<[Snapshot, CreateSnapshotResponse]>`

Creates a snapshot of the subscription at its current state.

```typescript
const [snapshot] = await subscription.createSnapshot('backup-snapshot', {
  labels: {
    purpose: 'backup',
    date: new Date().toISOString()
  }
});
```

**Parameters:**
- `name` (string): Snapshot name
- `options` (CreateSnapshotOptions): Optional configuration
  - `labels` (object): Custom labels

**Returns:** Promise resolving to `[Snapshot, CreateSnapshotResponse]`

---

#### `subscription.seek(snapshot: string | Snapshot | Date, options?: CallOptions): Promise<SeekResponse>`

Seeks the subscription to a snapshot or timestamp.

```typescript
// Seek to snapshot
await subscription.seek('my-snapshot');

// Seek to timestamp
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
await subscription.seek(yesterday);

// Seek to Snapshot object
const snapshot = subscription.snapshot('my-snapshot');
await subscription.seek(snapshot);
```

**Parameters:**
- `snapshot` (string | Snapshot | Date): Target to seek to
- `options` (CallOptions): Optional gax configuration

**Returns:** Promise resolving when seek completes

---

### Message Consumption

#### `subscription.open(): void`

Opens the subscription to start receiving messages.

```typescript
subscription.on('message', messageHandler);
subscription.on('error', errorHandler);
subscription.open();
```

**Note:** Messages won't be delivered until `open()` is called.

---

#### `subscription.close(callback?: CloseCallback): Promise<void>`

Closes the subscription and stops receiving messages.

```typescript
// With promise
await subscription.close();

// With callback
subscription.close((err) => {
  if (err) {
    console.error('Error closing subscription:', err);
  } else {
    console.log('Subscription closed successfully');
  }
});
```

**Parameters:**
- `callback` (CloseCallback): Optional callback for completion

**Returns:** Promise resolving when closed

---

#### `subscription.detached: boolean`

Property indicating if the subscription is detached from its topic.

```typescript
if (subscription.detached) {
  console.log('Subscription is detached from its topic');
}
```

---

## Subscription Events

Subscriptions extend EventEmitter and emit the following events:

### `message` Event

Emitted when a message is received.

```typescript
subscription.on('message', (message: Message) => {
  console.log('Received message:', message.id);
  console.log('Data:', message.data.toString());
  console.log('Attributes:', message.attributes);
  console.log('Publish time:', message.publishTime);

  // Process message
  processMessage(message.data);

  // Acknowledge message
  message.ack();
});
```

**Message Object Properties:**
- `id` (string): Unique message ID
- `data` (Buffer): Message payload
- `attributes` (object): Key-value attributes
- `publishTime` (Date): When message was published
- `received` (number): Timestamp when received
- `deliveryAttempt` (number): Delivery attempt count
- `orderingKey` (string): Ordering key if enabled
- `ack()`: Acknowledge message
- `nack()`: Negative acknowledge (requeue)
- `modifyAckDeadline(seconds)`: Extend processing time

---

### `error` Event

Emitted when an error occurs.

```typescript
subscription.on('error', (error: Error) => {
  console.error('Subscription error:', error.message);
  console.error('Error code:', error.code);
  console.error('Stack:', error.stack);

  // Handle specific errors
  if (error.code === 4) { // DEADLINE_EXCEEDED
    console.log('Processing too slow, consider scaling');
  }

  // Implement error recovery
  handleSubscriptionError(error);
});
```

**Common Error Codes:**
- `4`: DEADLINE_EXCEEDED - Processing took too long
- `8`: RESOURCE_EXHAUSTED - Flow control limits reached
- `14`: UNAVAILABLE - Temporary service issue
- `16`: UNAUTHENTICATED - Authentication failed

---

### `close` Event

Emitted when the subscription is closed.

```typescript
subscription.on('close', () => {
  console.log('Subscription closed');
  // Cleanup resources
  cleanupResources();
});
```

---

### `debug` Event

Emitted for debugging information (when debug mode is enabled).

```typescript
subscription.on('debug', (msg: string) => {
  console.log('[DEBUG]', msg);
});
```

---

## Configuration Options

### CreateSubscriptionOptions

Options for creating a subscription:

#### `ackDeadlineSeconds` (number)

Maximum time in seconds to acknowledge a message before it's redelivered.

```typescript
{
  ackDeadlineSeconds: 60 // 10-600 seconds, default 10
}
```

**Range:** 10-600 seconds
**Default:** 10 seconds

---

#### `messageRetentionDuration` (Duration)

How long to retain unacknowledged messages.

```typescript
{
  messageRetentionDuration: {
    seconds: 604800, // 7 days
    nanos: 0
  }
}
```

**Range:** 10 minutes to 7 days
**Default:** 7 days

---

#### `retryPolicy` (RetryPolicy)

Configures dead letter queue and retry behavior.

```typescript
{
  retryPolicy: {
    minimumBackoff: { seconds: 10 },
    maximumBackoff: { seconds: 600 }
  }
}
```

**Properties:**
- `minimumBackoff` (Duration): Minimum delay between retries (default: 10s)
- `maximumBackoff` (Duration): Maximum delay between retries (default: 600s)

**Backoff Formula:** `min(minimumBackoff * 2^(deliveryAttempt - 1), maximumBackoff)`

---

#### `deadLetterPolicy` (DeadLetterPolicy)

Configures dead letter topic for undeliverable messages.

```typescript
{
  deadLetterPolicy: {
    deadLetterTopic: 'projects/my-project/topics/dead-letter',
    maxDeliveryAttempts: 5
  }
}
```

**Properties:**
- `deadLetterTopic` (string): Full topic path for failed messages
- `maxDeliveryAttempts` (number): Max attempts before moving to dead letter (5-100)

**Note:** Service account must have `pubsub.publisher` permission on dead letter topic.

---

#### `filter` (string)

Attribute-based message filtering expression.

```typescript
{
  filter: 'attributes.environment = "production" AND attributes.priority > "5"'
}
```

**Supported Operators:**
- `=`, `!=`: Equality
- `>`, `<`, `>=`, `<=`: Comparison (numeric strings)
- `AND`, `OR`, `NOT`: Logical
- `hasPrefix()`: String prefix matching

**Examples:**
```typescript
// Simple equality
filter: 'attributes.type = "order"'

// Multiple conditions
filter: 'attributes.region = "us-west" AND attributes.tier = "premium"'

// Prefix matching
filter: 'hasPrefix(attributes.userId, "enterprise-")'

// Numeric comparison
filter: 'attributes.priority > "7" AND attributes.amount <= "1000"'
```

---

#### `enableMessageOrdering` (boolean)

Ensures messages with the same `orderingKey` are delivered in order.

```typescript
{
  enableMessageOrdering: true
}
```

**Default:** false

**Important:**
- When enabled, you must acknowledge or nack messages in order
- Out-of-order ack/nack calls will cause subscription errors
- Increases latency for ordered message streams

**Publishing with ordering:**
```typescript
await topic.publishMessage({
  data: Buffer.from('message 1'),
  orderingKey: 'user-123'
});
```

---

#### `enableExactlyOnceDelivery` (boolean)

Enables exactly-once delivery semantics.

```typescript
{
  enableExactlyOnceDelivery: true
}
```

**Default:** false

**Guarantees:**
- Messages are delivered exactly once per subscription
- Duplicate messages are automatically deduplicated
- Failed acks can be safely retried without duplicate processing

**Requirements:**
- Available only in specific regions
- Higher latency and cost
- Must handle ack confirmation errors properly

---

#### `pushConfig` (PushConfig)

Configures push delivery to HTTPS endpoint.

```typescript
{
  pushConfig: {
    pushEndpoint: 'https://myapp.com/push-handler',
    attributes: {
      'x-goog-version': 'v1',
      'x-custom-header': 'value'
    },
    oidcToken: {
      serviceAccountEmail: 'push-sa@project.iam.gserviceaccount.com',
      audience: 'https://myapp.com'
    },
    pubsubWrapper: {
      // Optional: Wraps message in Cloud Events format
    }
  }
}
```

**PushConfig Properties:**
- `pushEndpoint` (string): HTTPS URL (must be HTTPS, max 2048 chars)
- `attributes` (object): Custom HTTP headers
- `oidcToken` (object): OpenID Connect authentication
  - `serviceAccountEmail` (string): Service account for token
  - `audience` (string): Intended audience
- `pubsubWrapper` (object): Message format wrapper

**Push Message Format:**
```json
{
  "message": {
    "data": "base64-encoded-data",
    "attributes": { "key": "value" },
    "messageId": "1234567890",
    "publishTime": "2023-01-01T00:00:00Z"
  },
  "subscription": "projects/project-id/subscriptions/sub-name"
}
```

---

#### `expirationPolicy` (ExpirationPolicy)

Configures subscription auto-deletion.

```typescript
{
  expirationPolicy: {
    ttl: {
      seconds: 2592000 // 30 days
    }
  }
}
```

**Properties:**
- `ttl` (Duration): Time-to-live before deletion (min: 1 day)

**Behavior:**
- Subscription is deleted after TTL expires with no activity
- Activity includes: receiving messages, seeking, creating snapshots
- Use `{ ttl: {} }` to never expire (empty duration object)

---

### SubscriptionOptions (Runtime)

Runtime options for message handling via `setOptions()`:

#### `flowControl` (FlowControlOptions)

Limits message flow to prevent overload.

```typescript
{
  flowControl: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024, // 10MB
    allowExcessMessages: false,
    maxExtension: 60 * 60 // 1 hour
  }
}
```

**Properties:**
- `maxMessages` (number): Max outstanding messages
- `maxBytes` (number): Max outstanding bytes
- `allowExcessMessages` (boolean): Allow exceeding limits
- `maxExtension` (number): Max time to extend ack deadline

---

#### `batching` (BatchOptions)

Configures message batching for acknowledgments.

```typescript
{
  batching: {
    maxMessages: 100,
    maxMilliseconds: 1000
  }
}
```

**Properties:**
- `maxMessages` (number): Batch size for acks/nacks
- `maxMilliseconds` (number): Max time to wait before sending batch

---

#### `ackDeadline` (number)

Override the subscription's ack deadline at runtime.

```typescript
{
  ackDeadline: 60 // seconds
}
```

---

#### `streamingOptions` (StreamingOptions)

Configures connection streaming behavior.

```typescript
{
  streamingOptions: {
    maxStreams: 5,
    timeout: 60000 // milliseconds
  }
}
```

**Properties:**
- `maxStreams` (number): Max concurrent streams
- `timeout` (number): Stream timeout in milliseconds

---

## Code Examples

### Basic Pull Subscription

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({ projectId: 'my-project' });
const subscription = pubsub.subscription('my-subscription');

// Handle messages
subscription.on('message', (message) => {
  console.log(`Received: ${message.data.toString()}`);

  try {
    // Process message
    const data = JSON.parse(message.data.toString());
    processData(data);

    // Acknowledge successful processing
    message.ack();
  } catch (error) {
    console.error('Processing error:', error);
    // Negative acknowledge to retry
    message.nack();
  }
});

// Handle errors
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

// Start listening
subscription.open();
```

---

### Creating Subscription with Full Configuration

```typescript
const [subscription] = await pubsub.createSubscription(
  'my-topic',
  'my-subscription',
  {
    // Basic settings
    ackDeadlineSeconds: 60,
    messageRetentionDuration: { seconds: 604800 },

    // Retry and dead letter
    retryPolicy: {
      minimumBackoff: { seconds: 10 },
      maximumBackoff: { seconds: 600 }
    },
    deadLetterPolicy: {
      deadLetterTopic: 'projects/my-project/topics/dead-letter',
      maxDeliveryAttempts: 5
    },

    // Filtering
    filter: 'attributes.environment = "production"',

    // Ordering
    enableMessageOrdering: true,

    // Expiration
    expirationPolicy: {
      ttl: { seconds: 2592000 } // 30 days
    },

    // Labels
    labels: {
      environment: 'production',
      team: 'backend',
      cost_center: 'engineering'
    }
  }
);

console.log(`Created subscription: ${subscription.name}`);
```

---

### Flow Control and Performance Tuning

```typescript
const subscription = pubsub.subscription('high-volume-subscription');

subscription.setOptions({
  flowControl: {
    maxMessages: 5000,
    maxBytes: 50 * 1024 * 1024, // 50MB
    allowExcessMessages: false
  },
  batching: {
    maxMessages: 100,
    maxMilliseconds: 500
  },
  streamingOptions: {
    maxStreams: 10,
    timeout: 60000
  }
});

subscription.on('message', async (message) => {
  // Long-running processing
  const processingTime = estimateProcessingTime(message);

  if (processingTime > 30000) {
    // Extend deadline for long operations
    message.modifyAckDeadline(60);
  }

  await processMessage(message);
  message.ack();
});
```

---

### Ordered Message Processing

```typescript
const subscription = pubsub.subscription('ordered-subscription');

// Must acknowledge messages in order
const pendingMessages = new Map();

subscription.on('message', async (message) => {
  const orderingKey = message.orderingKey;

  if (!orderingKey) {
    // Non-ordered message, process immediately
    await processMessage(message);
    message.ack();
    return;
  }

  // Store ordered messages
  if (!pendingMessages.has(orderingKey)) {
    pendingMessages.set(orderingKey, []);
  }
  pendingMessages.get(orderingKey).push(message);

  // Process in order
  const messages = pendingMessages.get(orderingKey);
  for (const msg of messages) {
    await processMessage(msg);
    msg.ack(); // Must ack in order
  }

  pendingMessages.delete(orderingKey);
});
```

---

### Push Subscription Setup

```typescript
// Create push subscription
const [subscription] = await pubsub.createSubscription(
  'my-topic',
  'push-subscription',
  {
    pushConfig: {
      pushEndpoint: 'https://myapp.com/api/pubsub/push',
      attributes: {
        'x-goog-version': 'v1'
      },
      oidcToken: {
        serviceAccountEmail: 'push-sa@my-project.iam.gserviceaccount.com',
        audience: 'https://myapp.com'
      }
    }
  }
);

// Push endpoint handler (Express example)
app.post('/api/pubsub/push', express.json(), async (req, res) => {
  const message = req.body.message;

  try {
    // Decode and process
    const data = Buffer.from(message.data, 'base64').toString();
    await processMessage(JSON.parse(data));

    // Acknowledge with 200 OK
    res.status(200).send('OK');
  } catch (error) {
    // Return error to trigger retry
    console.error('Push processing error:', error);
    res.status(500).send('Error');
  }
});
```

---

### Snapshot and Seek Operations

```typescript
const subscription = pubsub.subscription('my-subscription');

// Create snapshot for backup
const [snapshot] = await subscription.createSnapshot('daily-backup', {
  labels: {
    type: 'backup',
    date: new Date().toISOString()
  }
});

console.log(`Created snapshot: ${snapshot.name}`);

// Seek to snapshot to replay messages
await subscription.seek(snapshot);

// Seek to timestamp
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
await subscription.seek(oneDayAgo);

// Seek by snapshot name
await subscription.seek('daily-backup');
```

---

### Error Handling and Recovery

```typescript
const subscription = pubsub.subscription('reliable-subscription');

let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
    reconnectAttempts = 0; // Reset on success
  } catch (error) {
    console.error('Message processing error:', error);

    if (error.retryable) {
      // Temporary error, nack to retry
      message.nack();
    } else {
      // Permanent error, ack to avoid infinite loop
      console.error('Permanent error, discarding message:', message.id);
      message.ack();

      // Optionally send to dead letter manually
      await sendToDeadLetter(message, error);
    }
  }
});

subscription.on('error', async (error) => {
  console.error('Subscription error:', error);

  if (error.code === 14) { // UNAVAILABLE
    reconnectAttempts++;

    if (reconnectAttempts < maxReconnectAttempts) {
      console.log(`Reconnecting... (attempt ${reconnectAttempts})`);

      await subscription.close();
      await new Promise(resolve => setTimeout(resolve, 1000 * reconnectAttempts));
      subscription.open();
    } else {
      console.error('Max reconnect attempts reached');
      process.exit(1);
    }
  }
});

subscription.on('close', () => {
  console.log('Subscription closed');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await subscription.close();
  process.exit(0);
});
```

---

### Filtered Subscriptions

```typescript
// Create subscription with attribute filter
const [subscription] = await pubsub.createSubscription(
  'events-topic',
  'high-priority-events',
  {
    filter: 'attributes.priority = "high" AND attributes.region = "us-west"'
  }
);

// Only high-priority US West events will be received
subscription.on('message', (message) => {
  console.log('High priority event:', message.attributes);
  console.log('Priority:', message.attributes.priority);
  console.log('Region:', message.attributes.region);
  message.ack();
});
```

---

### Managing Multiple Subscriptions

```typescript
// List all subscriptions
const [subscriptions] = await pubsub.getSubscriptions();

for (const subscription of subscriptions) {
  const [metadata] = await subscription.getMetadata();
  console.log(`Subscription: ${subscription.name}`);
  console.log(`  Topic: ${metadata.topic}`);
  console.log(`  Ack deadline: ${metadata.ackDeadlineSeconds}s`);
  console.log(`  Message ordering: ${metadata.enableMessageOrdering}`);
  console.log(`  Push config: ${metadata.pushConfig?.pushEndpoint || 'pull'}`);
}

// Stream subscriptions for large projects
const stream = pubsub.getSubscriptionsStream();
for await (const subscription of stream) {
  console.log(`Processing subscription: ${subscription.name}`);
}

// Get subscriptions for specific topic
const [topicSubscriptions] = await pubsub.getSubscriptions({
  topic: 'my-topic'
});
```

---

### Exactly-Once Delivery

```typescript
const [subscription] = await pubsub.createSubscription(
  'my-topic',
  'exactly-once-sub',
  {
    enableExactlyOnceDelivery: true,
    ackDeadlineSeconds: 60
  }
);

subscription.on('message', async (message) => {
  try {
    // Process message idempotently
    await processMessageIdempotently(message);

    // Ack with confirmation
    message.ack();

    // If ack fails, it's safe to retry without duplicate processing
  } catch (error) {
    if (error.code === 'ALREADY_EXISTS') {
      // Message was already processed, safe to ack
      message.ack();
    } else {
      console.error('Processing error:', error);
      message.nack();
    }
  }
});
```

---

### Updating Subscription Configuration

```typescript
const subscription = pubsub.subscription('my-subscription');

// Get current metadata
const [currentMetadata] = await subscription.getMetadata();
console.log('Current ack deadline:', currentMetadata.ackDeadlineSeconds);

// Update configuration
await subscription.setMetadata({
  ackDeadlineSeconds: 120,
  messageRetentionDuration: { seconds: 86400 },
  labels: {
    ...currentMetadata.labels,
    updated: new Date().toISOString()
  }
});

// Update push config
await subscription.modifyPushConfig({
  pushEndpoint: 'https://new-endpoint.com/push',
  oidcToken: {
    serviceAccountEmail: 'new-sa@project.iam.gserviceaccount.com',
    audience: 'https://new-endpoint.com'
  }
});

// Convert push to pull
await subscription.modifyPushConfig({ pushEndpoint: '' });
```

---

### Complete Production Example

```typescript
import { PubSub } from '@google-cloud/pubsub';

class SubscriptionManager {
  private pubsub: PubSub;
  private subscription: any;
  private isShuttingDown = false;

  constructor(projectId: string, subscriptionName: string) {
    this.pubsub = new PubSub({ projectId });
    this.subscription = this.pubsub.subscription(subscriptionName);
    this.configure();
  }

  private configure() {
    // Set runtime options
    this.subscription.setOptions({
      flowControl: {
        maxMessages: 2000,
        maxBytes: 20 * 1024 * 1024,
        allowExcessMessages: false
      },
      batching: {
        maxMessages: 100,
        maxMilliseconds: 1000
      },
      streamingOptions: {
        maxStreams: 5,
        timeout: 60000
      }
    });
  }

  async start() {
    // Set up event handlers
    this.subscription.on('message', this.handleMessage.bind(this));
    this.subscription.on('error', this.handleError.bind(this));
    this.subscription.on('close', this.handleClose.bind(this));
    this.subscription.on('debug', this.handleDebug.bind(this));

    // Verify subscription exists
    const [exists] = await this.subscription.exists();
    if (!exists) {
      throw new Error('Subscription does not exist');
    }

    // Get configuration
    const [metadata] = await this.subscription.getMetadata();
    console.log('Subscription configuration:');
    console.log(`  Topic: ${metadata.topic}`);
    console.log(`  Ack deadline: ${metadata.ackDeadlineSeconds}s`);
    console.log(`  Message ordering: ${metadata.enableMessageOrdering}`);
    console.log(`  Exactly-once: ${metadata.enableExactlyOnceDelivery}`);

    // Start listening
    this.subscription.open();
    console.log('Subscription started');
  }

  private async handleMessage(message: any) {
    if (this.isShuttingDown) {
      message.nack();
      return;
    }

    const startTime = Date.now();
    console.log(`Processing message ${message.id}`);
    console.log(`  Delivery attempt: ${message.deliveryAttempt || 1}`);
    console.log(`  Ordering key: ${message.orderingKey || 'none'}`);

    try {
      // Parse message
      const data = JSON.parse(message.data.toString());

      // Extend deadline for long operations
      const estimatedTime = this.estimateProcessingTime(data);
      if (estimatedTime > 30000) {
        message.modifyAckDeadline(60);
      }

      // Process
      await this.processMessage(data, message.attributes);

      // Acknowledge
      message.ack();

      const duration = Date.now() - startTime;
      console.log(`Message ${message.id} processed in ${duration}ms`);
    } catch (error: any) {
      console.error(`Error processing message ${message.id}:`, error);

      if (this.isRetryableError(error)) {
        message.nack();
      } else {
        // Permanent error, ack to avoid infinite retry
        message.ack();
        await this.handlePermanentError(message, error);
      }
    }
  }

  private handleError(error: Error) {
    console.error('Subscription error:', error);

    if (!this.isShuttingDown) {
      // Implement reconnection logic
      this.handleReconnection(error);
    }
  }

  private handleClose() {
    console.log('Subscription closed');
  }

  private handleDebug(msg: string) {
    console.log(`[DEBUG] ${msg}`);
  }

  private async handleReconnection(error: Error) {
    // Implement exponential backoff
    console.log('Attempting reconnection...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    this.subscription.open();
  }

  private isRetryableError(error: Error): boolean {
    const retryableCodes = [14, 4, 8]; // UNAVAILABLE, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED
    return retryableCodes.includes((error as any).code);
  }

  private estimateProcessingTime(data: any): number {
    // Implement estimation logic
    return 10000; // 10 seconds
  }

  private async processMessage(data: any, attributes: any) {
    // Implement your message processing logic
    console.log('Processing data:', data);
  }

  private async handlePermanentError(message: any, error: Error) {
    // Log to monitoring system
    console.error('Permanent error for message:', {
      messageId: message.id,
      error: error.message,
      data: message.data.toString()
    });
  }

  async stop() {
    this.isShuttingDown = true;
    console.log('Stopping subscription...');
    await this.subscription.close();
    console.log('Subscription stopped');
  }
}

// Usage
const manager = new SubscriptionManager('my-project', 'my-subscription');

// Start
await manager.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await manager.stop();
  process.exit(0);
});
```

---

## Best Practices

### 1. Ack Deadline Management

- Set `ackDeadlineSeconds` based on actual processing time
- Use `message.modifyAckDeadline()` for long operations
- Monitor `deliveryAttempt` to detect slow processing

### 2. Flow Control

- Configure `maxMessages` and `maxBytes` based on memory capacity
- Set `allowExcessMessages: false` to prevent overload
- Adjust `maxStreams` for throughput optimization

### 3. Error Handling

- Always implement `error` event handler
- Distinguish between retryable and permanent errors
- Use dead letter policies for automatic failure handling
- Implement graceful shutdown with proper cleanup

### 4. Performance Optimization

- Enable batching for high-volume scenarios
- Tune `flowControl` settings based on workload
- Use multiple subscriptions for parallel processing
- Consider `streamingOptions.maxStreams` for throughput

### 5. Reliability

- Use `enableExactlyOnceDelivery` for critical workloads
- Implement idempotent message processing
- Use snapshots for backup and replay scenarios
- Monitor `deliveryAttempt` for problematic messages

### 6. Message Ordering

- Only enable when necessary (adds latency)
- Always ack/nack messages in order when enabled
- Use `orderingKey` consistently in publishers and subscribers

### 7. Filtering

- Apply filters to reduce unnecessary message delivery
- Use filters for multi-tenant architectures
- Combine filtering with topic structure for efficiency

### 8. Monitoring

- Track processing latency and throughput
- Monitor ack/nack ratios
- Alert on error rates and delivery attempts
- Use `debug` events for troubleshooting

---

## Related Documentation

- [Topic API Documentation](02-topic-api.md)
- [Message API Documentation](04-message-api.md)
- [PubSub Client Documentation](01-client-configuration.md)

---

## Additional Resources

- [Google Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Node.js Client Library Reference](https://googleapis.dev/nodejs/pubsub/latest/)
- [Subscription Quotas and Limits](https://cloud.google.com/pubsub/quotas)
- [Best Practices Guide](https://cloud.google.com/pubsub/docs/best-practices)
