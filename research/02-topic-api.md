# Google Cloud Pub/Sub Topic API

## Table of Contents
1. [Overview](#overview)
2. [Topic Class](#topic-class)
3. [PubSub Topic Methods](#pubsub-topic-methods)
4. [Topic Configuration](#topic-configuration)
5. [Publishing Methods](#publishing-methods)
6. [Topic Management Methods](#topic-management-methods)
7. [Publisher Configuration](#publisher-configuration)
8. [Code Examples](#code-examples)
9. [Best Practices](#best-practices)

## Overview

A **Topic** is a named resource to which messages are sent by publishers. Topics are central to the Pub/Sub messaging model, acting as a message bus between publishers and subscribers.

### Key Concepts

- Topics can have zero or more subscriptions attached
- Multiple publishers can publish to the same topic
- Messages are retained for subscriptions even if no subscribers are active
- Topics can have schemas attached for message validation
- Topics support message ordering via ordering keys

## Topic Class

### Constructor

```typescript
// Usually obtained from PubSub client
const topic = pubsub.topic('my-topic');

// With publish options
const topic = pubsub.topic('my-topic', {
  batching: {
    maxMessages: 1000,
    maxBytes: 1024 * 1024,
    maxMilliseconds: 100
  }
});
```

### Properties

**name** (string)
- The fully qualified topic name
- Format: `projects/{project}/topics/{topic}`
- May contain placeholder for projectId

**pubsub** (PubSub)
- Reference to parent PubSub client instance

**iam** (IAM)
- IAM policy manager for this topic
- Methods: getPolicy(), setPolicy(), testPermissions()

**publisher** (Publisher)
- Internal publisher instance (rarely accessed directly)

### Topic Class Methods

## Topic Management Methods

### create(options?)

Creates the topic.

```typescript
async create(options?: CreateTopicOptions): Promise<[Topic, google.pubsub.v1.ITopic]>
```

**Parameters:**
- `options.gaxOpts` - Call options
- `options.messageStoragePolicy` - Storage policy configuration
- `options.schemaSettings` - Schema validation configuration (see [Schema API](05-schema-api.md) for details)
- `options.labels` - Key-value labels
- `options.messageRetentionDuration` - Message retention (24h - 31 days)

**Returns:** Promise resolving to `[Topic, apiResponse]`

**Example:**
```typescript
const [topic, apiResponse] = await pubsub.topic('my-topic').create({
  labels: { environment: 'production' },
  messageRetentionDuration: { seconds: 86400 * 7 } // 7 days
});
```

### delete(options?)

Deletes the topic. Does not delete subscriptions to the topic.

```typescript
async delete(options?: CallOptions): Promise<[google.protobuf.IEmpty]>
```

**Example:**
```typescript
await topic.delete();
console.log('Topic deleted');
```

### exists(options?)

Checks if the topic exists.

```typescript
async exists(options?: CallOptions): Promise<[boolean]>
```

**Example:**
```typescript
const [exists] = await topic.exists();
if (exists) {
  console.log('Topic exists');
}
```

### get(options?)

Gets the topic metadata. Creates the topic if `autoCreate` option is true and topic doesn't exist.

```typescript
async get(options?: GetTopicOptions): Promise<[Topic, google.pubsub.v1.ITopic]>
```

**Parameters:**
- `options.autoCreate` - Create topic if it doesn't exist
- `options.gaxOpts` - Call options

**Example:**
```typescript
// Get existing topic or create if doesn't exist
const [topic] = await pubsub.topic('my-topic').get({ autoCreate: true });
```

### getMetadata(options?)

Retrieves the topic's metadata from the API.

```typescript
async getMetadata(options?: CallOptions): Promise<[google.pubsub.v1.ITopic]>
```

**Example:**
```typescript
const [metadata] = await topic.getMetadata();
console.log('Schema settings:', metadata.schemaSettings);
console.log('Retention:', metadata.messageRetentionDuration);
```

### setMetadata(metadata, options?)

Updates the topic's metadata.

```typescript
async setMetadata(
  metadata: google.pubsub.v1.ITopic,
  options?: CallOptions
): Promise<[google.pubsub.v1.ITopic]>
```

**Updatable Fields:**
- `labels`
- `messageStoragePolicy`
- `messageRetentionDuration`

**Example:**
```typescript
const [updatedMetadata] = await topic.setMetadata({
  labels: { updated: 'true', version: 'v2' },
  messageRetentionDuration: { seconds: 86400 * 14 } // 14 days
});
```

### getSubscriptions(options?)

Lists subscriptions attached to this topic.

```typescript
async getSubscriptions(options?: PageOptions): Promise<[Subscription[]]>
```

**Parameters:**
- `options.pageSize` - Maximum results per page
- `options.pageToken` - Page token for pagination
- `options.gaxOpts` - Call options

**Example:**
```typescript
const [subscriptions] = await topic.getSubscriptions();
for (const subscription of subscriptions) {
  console.log(subscription.name);
}
```

### subscription(name, options?)

Gets a reference to a subscription attached to this topic.

```typescript
subscription(name: string, options?: SubscriptionOptions): Subscription
```

**Example:**
```typescript
const subscription = topic.subscription('my-subscription');

// With options
const subscription = topic.subscription('my-subscription', {
  flowControl: {
    maxMessages: 1000
  }
});
```

## Publishing Methods

### publish(data, attributes?)

Publishes a message to the topic.

```typescript
async publish(data: Buffer, attributes?: Attributes): Promise<string>
```

**Parameters:**
- `data` - Message payload as Buffer
- `attributes` - Optional key-value attributes (all values must be strings)

**Returns:** Promise resolving to message ID (string)

**Example:**
```typescript
const messageId = await topic.publish(
  Buffer.from('Hello, World!'),
  {
    origin: 'api-server',
    priority: 'high'
  }
);
console.log(`Published message ${messageId}`);
```

### publishJSON(json, attributes?)

Convenience method for publishing JSON objects.

```typescript
async publishJSON(json: object, attributes?: Attributes): Promise<string>
```

**Parameters:**
- `json` - Object to serialize to JSON
- `attributes` - Optional key-value attributes

**Returns:** Promise resolving to message ID

**Example:**
```typescript
const messageId = await topic.publishJSON({
  userId: '12345',
  action: 'login',
  timestamp: new Date().toISOString()
}, {
  eventType: 'user-action'
});
```

### publishMessage(message)

Publishes a message with full options including ordering key.

```typescript
async publishMessage(message: PubsubMessage): Promise<string>
```

**PubsubMessage Interface:**
```typescript
interface PubsubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}
```

**Example:**
```typescript
const messageId = await topic.publishMessage({
  data: Buffer.from('Order #12345 processed'),
  attributes: { orderId: '12345' },
  orderingKey: 'user-abc123' // Ensures ordering for this key
});
```

### flush()

Immediately publishes all queued messages.

```typescript
async flush(): Promise<void>
```

**Example:**
```typescript
// Publish multiple messages
await topic.publish(Buffer.from('Message 1'));
await topic.publish(Buffer.from('Message 2'));

// Force immediate delivery of all queued messages
await topic.flush();
```

## Publisher Configuration Methods

### setPublishOptions(options)

Updates publisher settings for this topic.

```typescript
setPublishOptions(options: PublishOptions): void
```

**Example:**
```typescript
topic.setPublishOptions({
  batching: {
    maxMessages: 500,
    maxBytes: 512 * 1024,
    maxMilliseconds: 50
  },
  messageOrdering: true
});
```

### getPublishOptionDefaults()

Gets the current publisher configuration.

```typescript
getPublishOptionDefaults(): PublishOptions
```

**Example:**
```typescript
const currentSettings = topic.getPublishOptionDefaults();
console.log('Batch size:', currentSettings.batching?.maxMessages);
```

### flowControlled()

Creates a flow-controlled publisher that manages memory usage.

```typescript
flowControlled(): FlowControlledPublisher
```

**Example:**
```typescript
const publisher = topic.flowControlled();

// Publish with flow control
const messageId = await publisher.publish(Buffer.from('Data'));
```

### resumePublishing(orderingKey)

Resumes publishing for an ordering key after an error.

```typescript
resumePublishing(orderingKey: string): void
```

**Example:**
```typescript
try {
  await topic.publishMessage({
    data: Buffer.from('Message'),
    orderingKey: 'user-123'
  });
} catch (error) {
  // After fixing the issue, resume
  topic.resumePublishing('user-123');
}
```

## PubSub Topic Methods

Methods on the PubSub client for topic management.

### topic(name, options?)

Gets a topic reference without making an API call.

```typescript
topic(name: string, options?: PublishOptions): Topic
```

**Example:**
```typescript
const topic = pubsub.topic('my-topic');
```

### createTopic(name, options?)

Creates a new topic.

```typescript
async createTopic(
  name: string,
  options?: CreateTopicOptions
): Promise<[Topic, google.pubsub.v1.ITopic]>
```

**Example:**
```typescript
const [topic] = await pubsub.createTopic('my-topic', {
  labels: { team: 'backend' },
  schemaSettings: {
    schema: 'projects/my-project/schemas/my-schema',
    encoding: 'JSON'
  }
});

// For more details on schemas, see: 05-schema-api.md
```

### getTopics(options?)

Lists all topics in the project.

```typescript
async getTopics(options?: PageOptions): Promise<[Topic[]]>
```

**Example:**
```typescript
const [topics] = await pubsub.getTopics();
for (const topic of topics) {
  console.log(topic.name);
}

// With pagination
const [topics, , response] = await pubsub.getTopics({ pageSize: 50 });
```

### getTopicsStream(options?)

Returns a readable stream of topics (better for large lists).

```typescript
getTopicsStream(options?: PageOptions): NodeJS.ReadableStream
```

**Example:**
```typescript
pubsub.getTopicsStream()
  .on('data', (topic: Topic) => {
    console.log(topic.name);
  })
  .on('error', console.error)
  .on('end', () => console.log('All topics listed'));
```

## Topic Configuration

### Message Storage Policy

Controls where message data is stored.

```typescript
interface MessageStoragePolicy {
  allowedPersistenceRegions?: string[];
}
```

**Example:**
```typescript
await pubsub.createTopic('my-topic', {
  messageStoragePolicy: {
    allowedPersistenceRegions: ['us-central1', 'us-east1']
  }
});
```

### Schema Settings

Configures schema validation for messages.

```typescript
interface SchemaSettings {
  schema: string;           // Schema resource name
  encoding: 'JSON' | 'BINARY';
  firstRevisionId?: string;
  lastRevisionId?: string;
}
```

**Example:**
```typescript
await pubsub.createTopic('my-topic', {
  schemaSettings: {
    schema: 'projects/my-project/schemas/user-event',
    encoding: 'JSON'
  }
});
```

### Labels

Key-value metadata for organizing topics.

```typescript
await pubsub.createTopic('my-topic', {
  labels: {
    environment: 'production',
    team: 'platform',
    service: 'user-management'
  }
});
```

### Message Retention Duration

How long to retain messages (24 hours to 31 days).

```typescript
await pubsub.createTopic('my-topic', {
  messageRetentionDuration: {
    seconds: 86400 * 7 // 7 days
  }
});
```

## Code Examples

### Basic Publishing

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');

async function publishMessage(data: string) {
  try {
    const messageId = await topic.publish(Buffer.from(data));
    console.log(`Message ${messageId} published`);
  } catch (error) {
    console.error('Error publishing message:', error);
  }
}

await publishMessage('Hello, Pub/Sub!');
```

### Batch Publishing

```typescript
const topic = pubsub.topic('my-topic', {
  batching: {
    maxMessages: 100,
    maxBytes: 1024 * 1024, // 1 MB
    maxMilliseconds: 10
  }
});

// These will be automatically batched
const messageIds = await Promise.all([
  topic.publish(Buffer.from('Message 1')),
  topic.publish(Buffer.from('Message 2')),
  topic.publish(Buffer.from('Message 3'))
]);

console.log('Published messages:', messageIds);
```

### Ordered Publishing

```typescript
const topic = pubsub.topic('my-topic', {
  messageOrdering: true
});

async function publishOrderedMessages(userId: string) {
  for (let i = 0; i < 10; i++) {
    await topic.publishMessage({
      data: Buffer.from(`Event ${i} for user`),
      attributes: { sequence: String(i) },
      orderingKey: userId // Messages with same key are ordered
    });
  }
}

await publishOrderedMessages('user-123');
```

### Publishing with Schema Validation

```typescript
// First, create a topic with schema
const [topic] = await pubsub.createTopic('user-events', {
  schemaSettings: {
    schema: 'projects/my-project/schemas/user-event-schema',
    encoding: 'JSON'
  }
});

// Publish messages that conform to schema
const userData = {
  userId: '12345',
  action: 'login',
  timestamp: Date.now()
};

const messageId = await topic.publishJSON(userData, {
  source: 'auth-service'
});
```

### Topic with Retry Configuration

```typescript
const topic = pubsub.topic('my-topic', {
  gaxOpts: {
    retry: {
      retryCodes: [10, 14], // ABORTED, UNAVAILABLE
      backoffSettings: {
        initialRetryDelayMillis: 100,
        retryDelayMultiplier: 1.3,
        maxRetryDelayMillis: 60000
      }
    }
  }
});
```

### Managing Topic Lifecycle

```typescript
async function ensureTopicExists(topicName: string) {
  const topic = pubsub.topic(topicName);
  const [exists] = await topic.exists();

  if (!exists) {
    console.log(`Creating topic ${topicName}...`);
    await topic.create({
      labels: { 'auto-created': 'true' }
    });
  }

  return topic;
}

const topic = await ensureTopicExists('my-topic');
```

### Complete Publisher Class

```typescript
import { PubSub, Topic, PublishOptions } from '@google-cloud/pubsub';

export class TopicPublisher {
  private topic: Topic;

  constructor(
    private pubsub: PubSub,
    topicName: string,
    options?: PublishOptions
  ) {
    this.topic = pubsub.topic(topicName, options);
  }

  async publish(data: any, attributes?: Record<string, string>): Promise<string> {
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(JSON.stringify(data));

    return this.topic.publish(buffer, attributes);
  }

  async publishBatch(messages: Array<{ data: any; attributes?: Record<string, string> }>) {
    const publishPromises = messages.map(({ data, attributes }) =>
      this.publish(data, attributes)
    );
    return Promise.all(publishPromises);
  }

  async ensureExists(): Promise<void> {
    const [exists] = await this.topic.exists();
    if (!exists) {
      await this.topic.create();
    }
  }

  async getMetadata() {
    const [metadata] = await this.topic.getMetadata();
    return metadata;
  }

  async delete(): Promise<void> {
    await this.topic.delete();
  }
}

// Usage
const publisher = new TopicPublisher(pubsub, 'events', {
  batching: {
    maxMessages: 100,
    maxMilliseconds: 10
  }
});

await publisher.ensureExists();
await publisher.publish({ event: 'user.login', userId: '123' });
```

## Best Practices

### 1. Reuse Topic Instances

```typescript
// ✅ Create once, reuse
const topic = pubsub.topic('my-topic');

// ❌ Don't create repeatedly
function publishMessage(data: string) {
  const topic = pubsub.topic('my-topic'); // Inefficient
  // ...
}
```

### 2. Use Batching for High Throughput

```typescript
// ✅ Enable batching for better performance
const topic = pubsub.topic('my-topic', {
  batching: {
    maxMessages: 1000,
    maxBytes: 10 * 1024 * 1024, // 10 MB
    maxMilliseconds: 100
  }
});
```

### 3. Handle Publishing Errors

```typescript
async function publishWithRetry(topic: Topic, data: Buffer, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await topic.publish(data);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 4. Use publishJSON for Objects

```typescript
// ✅ Convenient for JSON data
await topic.publishJSON({ userId: '123', action: 'login' });

// Instead of
await topic.publish(Buffer.from(JSON.stringify({ userId: '123' })));
```

### 5. Set Appropriate Retention

```typescript
// For audit logs (max retention)
await pubsub.createTopic('audit-logs', {
  messageRetentionDuration: { seconds: 86400 * 31 } // 31 days
});

// For ephemeral events (min retention)
await pubsub.createTopic('temp-events', {
  messageRetentionDuration: { seconds: 86400 } // 24 hours
});
```

### 6. Use Ordering Keys Carefully

```typescript
// ✅ Good: Ordering key per entity
await topic.publishMessage({
  data: Buffer.from('User update'),
  orderingKey: `user-${userId}` // One key per user
});

// ❌ Bad: Single ordering key for everything
await topic.publishMessage({
  data: Buffer.from('User update'),
  orderingKey: 'global' // Creates bottleneck
});
```

### 7. Monitor Topic Health

```typescript
async function getTopicStats(topic: Topic) {
  const [metadata] = await topic.getMetadata();
  const [subscriptions] = await topic.getSubscriptions();

  return {
    name: metadata.name,
    subscriptionCount: subscriptions.length,
    schemaEnabled: !!metadata.schemaSettings,
    retentionDays: metadata.messageRetentionDuration
      ? Number(metadata.messageRetentionDuration.seconds) / 86400
      : null
  };
}
```

### 8. Clean Up Unused Topics

```typescript
async function deleteUnusedTopics(pubsub: PubSub) {
  const [topics] = await pubsub.getTopics();

  for (const topic of topics) {
    const [subscriptions] = await topic.getSubscriptions();
    if (subscriptions.length === 0) {
      console.log(`Deleting unused topic: ${topic.name}`);
      await topic.delete();
    }
  }
}
```

## Official Documentation

- [Publishing Messages](https://cloud.google.com/pubsub/docs/publisher)
- [Topic Class Reference](https://googleapis.dev/nodejs/pubsub/latest/Topic.html)
- [PubSub Class Reference](https://googleapis.dev/nodejs/pubsub/latest/PubSub.html)
- [Best Practices for Publishers](https://cloud.google.com/pubsub/docs/publish-best-practices)
- [Message Ordering](https://cloud.google.com/pubsub/docs/ordering)
- [Schema Validation](https://cloud.google.com/pubsub/docs/schemas)
- [Batch Messaging](https://cloud.google.com/pubsub/docs/batch-messaging)
