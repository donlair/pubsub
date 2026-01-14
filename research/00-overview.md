# Google Cloud Pub/Sub API Overview

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Main Concepts](#main-concepts)
3. [Client Library Structure](#client-library-structure)
4. [API Patterns](#api-patterns)
5. [Core Classes](#core-classes)
6. [Publishing Patterns](#publishing-patterns)
7. [Subscribing Patterns](#subscribing-patterns)
8. [Official Documentation Links](#official-documentation-links)

## Architecture Overview

Google Cloud Pub/Sub is an asynchronous, scalable messaging service that decouples services producing messages from services processing those messages. The system is designed to be horizontally scalable, where an increase in the number of topics, subscriptions, or messages can be handled by increasing the number of instances of running servers.

### Key Architectural Features

- **Global Distribution**: Pub/Sub servers run in all Google Cloud regions around the world, offering fast, global data access while giving users control over where messages are stored
- **Horizontal Scalability**: Automatically scales to handle increased load
- **Guaranteed Delivery**: Messages are written to storage and Pub/Sub guarantees delivery to all attached subscriptions
- **At-Least-Once Delivery**: Messages are delivered at least once to each subscription
- **Global Endpoint**: `https://pubsub.googleapis.com`

### Message Flow

1. A publisher sends a message
2. The message is written to storage
3. Pub/Sub sends an acknowledgment to the publisher that it has received the message
4. Pub/Sub guarantees delivery to all attached subscriptions
5. Simultaneously with writing to storage, Pub/Sub delivers messages to subscribers

## Main Concepts

### Topics

A **topic** is a named entity that represents a feed of messages. Topics serve as the central point where publishers send messages.

- Topics can have multiple subscriptions attached
- Multiple publishers can publish to the same topic
- Topics can optionally have schemas attached for message validation

### Subscriptions

A **subscription** is a named entity that represents an interest in receiving messages on a particular topic.

- A topic can have multiple subscriptions, but a given subscription belongs to a single topic
- If multiple subscriptions are attached to one topic, each receives a copy of each message
- If multiple subscribers pull messages from the same subscription, only one subscriber receives each message
- Subscriptions persist independently of subscribers

### Messages

A **message** consists of:
- **Data**: The message payload (bytes)
- **Attributes**: A map of key-value pairs containing metadata
- **Message ID**: A unique identifier assigned by the server
- **Publish Time**: The time at which the message was published
- **Ordering Key** (optional): For ordered delivery within the same key

### Publishers

A **publisher** (also called a producer) creates messages and sends (publishes) them to a specified topic.

### Subscribers

A **subscriber** (also called a consumer) receives messages on a specified subscription.

### Schemas

A **schema** defines the structure and validation rules for messages. Pub/Sub supports two schema types:
- **Protocol Buffers (Protobuf)**: Binary schema definition
- **Apache Avro**: JSON-based schema definition

By attaching a schema to a topic, the service ensures that only messages conforming to that schema are accepted. Messages that don't match the schema are rejected.

## Client Library Structure

The `@google-cloud/pubsub` npm package provides a stable Node.js client library that follows Semantic Versioning.

### Installation

```bash
bun add @google-cloud/pubsub
```

### Main Components

#### 1. PubSub Client

The main entry point for interacting with Pub/Sub:

```typescript
import { PubSub } from '@google-cloud/pubsub';
const pubsub = new PubSub({
  projectId: 'your-project-id',
  // Optional: credentials, keyFilename, etc.
});
```

#### 2. Topic Objects

Topic objects allow interaction with Cloud Pub/Sub topics:

```typescript
const topic = pubsub.topic('my-topic');
```

#### 3. Subscription Objects

Subscription objects manage message consumption:

```typescript
const subscription = topic.subscription('my-subscription');
```

**Note**: By default, each PubSub instance can handle 100 open streams. With default options, this translates to less than 20 subscriptions per PubSub instance. To create more subscriptions, either:
- Create multiple PubSub instances
- Lower the `options.streamingOptions.maxStreams` value

#### 4. Core Services

The library provides access to three main services:

1. **Publisher Service**: For manipulating topics and sending messages
2. **Subscriber Service**: For manipulating subscriptions and consuming messages via Pull or StreamingPull
3. **Schema Service**: For schema-related operations

### Node.js Compatibility

The client libraries follow the Node.js release schedule and are compatible with all current active and maintenance versions of Node.js.

## API Patterns

### Admin APIs vs Data APIs

#### Admin APIs
Admin APIs are used for managing resources:
- Creating, updating, and deleting topics
- Creating, updating, and deleting subscriptions
- Managing schemas
- Managing IAM policies
- Listing resources

#### Data APIs
Data APIs are used for message operations:
- Publishing messages to topics
- Pulling messages from subscriptions
- Acknowledging messages
- Modifying acknowledgment deadlines

### Synchronous vs Asynchronous Patterns

#### Asynchronous (Recommended)

The high-level client library uses asynchronous patterns with promises and callbacks:

```typescript
// Publishing returns a promise
const messageId = await topic.publishMessage({data: Buffer.from('Hello')});

// Subscribing uses event listeners
subscription.on('message', (message) => {
  // Process message
  message.ack();
});
```

#### Synchronous (Advanced Use Cases)

For advanced users, direct REST/HTTP and gRPC interfaces are available, though Google recommends using the client libraries.

### Regional Endpoints

You can set locational endpoint overrides for any Pub/Sub operation:

- Use environment variable: `CLOUDSDK_API_ENDPOINT_OVERRIDES_PUBSUB`
- Configure endpoints per operation for data locality requirements

## Core Classes

### 1. PubSub Class

The main client class for interacting with Pub/Sub.

**Key Methods**:
- `topic(name)`: Get a reference to a topic
- `createTopic(name)`: Create a new topic
- `getTopics()`: List all topics in the project
- `subscription(name)`: Get a reference to a subscription
- `createSubscription(topic, name, options)`: Create a new subscription
- `getSubscriptions()`: List all subscriptions in the project
- `createSchema(schemaId, type, definition)`: Create a schema

**Configuration Options**:
- `projectId`: Google Cloud project ID
- `keyFilename`: Path to service account key file
- `credentials`: Service account credentials object
- `apiEndpoint`: Custom API endpoint (for emulators)

### 2. Topic Class

Represents a Pub/Sub topic.

**Key Methods**:
- `publish(data, attributes)`: Publish a message (deprecated)
- `publishMessage(message)`: Publish a message object
- `publishJSON(json)`: Publish JSON data
- `create()`: Create the topic
- `delete()`: Delete the topic
- `exists()`: Check if topic exists
- `get()`: Get topic metadata
- `getSubscriptions()`: List subscriptions for the topic
- `setPublishOptions(options)`: Configure batching and flow control

**Properties**:
- `name`: The topic name
- `publisher`: The associated publisher object

### 3. Subscription Class

Represents a Pub/Sub subscription.

**Key Methods**:
- `on('message', handler)`: Listen for messages (streaming pull)
- `on('error', handler)`: Listen for errors
- `get()`: Get subscription metadata
- `create()`: Create the subscription
- `delete()`: Delete the subscription
- `exists()`: Check if subscription exists
- `setOptions(options)`: Configure flow control and batching
- `close()`: Close the subscription and stop receiving messages
- `seek(snapshot)`: Seek to a snapshot

**Flow Control Options**:
- `maxMessages`: Maximum number of messages to receive concurrently
- `maxBytes`: Maximum bytes to receive concurrently
- `flowControl`: Configure flow control settings

### 4. Message Class

Represents a received message from a subscription.

**Properties**:
- `id`: Unique message identifier
- `data`: Message data as Buffer
- `attributes`: Key-value pairs of message attributes
- `publishTime`: Timestamp when message was published
- `orderingKey`: Key for ordered delivery (if used)
- `ackId`: Acknowledgment ID

**Key Methods**:
- `ack()`: Acknowledge the message (removes it from subscription)
- `nack()`: Negative acknowledgment (redelivers the message)
- `modifyAckDeadline(seconds)`: Extend the acknowledgment deadline

### 5. Schema Class

Represents a Pub/Sub schema for message validation.

**Key Methods**:
- `create()`: Create the schema
- `delete()`: Delete the schema
- `get()`: Get schema metadata
- `validateMessage(message)`: Validate a message against the schema

**Schema Types**:
- `PROTOCOL_BUFFER`: Protocol Buffers schema
- `AVRO`: Apache Avro schema

**Encoding Types**:
- `BINARY`: Binary encoding
- `JSON`: JSON encoding

## Publishing Patterns

### 1. Asynchronous Publishing (Recommended)

The high-level client library's publish call returns a promise:

```typescript
const topic = pubsub.topic('my-topic');

try {
  const messageId = await topic.publishMessage({
    data: Buffer.from('Hello, World!'),
    attributes: {
      origin: 'nodejs',
      timestamp: Date.now().toString()
    }
  });
  console.log(`Message ${messageId} published.`);
} catch (error) {
  console.error('Error publishing message:', error);
}
```

**Best Practice**: Handle the result asynchronously to avoid blocking individual publish requests.

### 2. Batch Publishing (Default)

Batch messaging combines multiple messages into one batch which gets published in a single request. **Batching is enabled by default** in client libraries.

**Default Batching Settings**:
- `byteCountThreshold`: 1,000,000 bytes (1 MB)
- `elementCountThreshold`: 100 messages
- `delayThreshold`: 10 milliseconds

**Custom Batching Configuration**:

```typescript
const topic = pubsub.topic('my-topic');

topic.setPublishOptions({
  batching: {
    maxMessages: 50,          // Publish when 50 messages accumulated
    maxMilliseconds: 100,     // Publish after 100ms
    maxBytes: 1024 * 1024     // Publish when 1MB accumulated
  }
});
```

**Benefits**:
- Improved efficiency
- Higher throughput
- Reduced API calls
- Lower costs

### 3. Ordered Publishing

To receive messages in order, publish messages with **ordering keys**:

```typescript
const topic = pubsub.topic('my-topic');

// Enable message ordering
topic.setPublishOptions({
  messageOrdering: true
});

// Publish messages with ordering key
await topic.publishMessage({
  data: Buffer.from('First message'),
  orderingKey: 'user-123'
});

await topic.publishMessage({
  data: Buffer.from('Second message'),
  orderingKey: 'user-123'
});
```

**Important Considerations**:
- Throughput on each ordering key is limited to 1 MBps
- Messages with the same ordering key are delivered in order
- Failing to acknowledge any message means all messages in the batch are redelivered
- Ordering keys are optional; messages without keys are delivered as soon as possible

### 4. JSON Publishing

For convenience, publish JSON objects directly:

```typescript
const topic = pubsub.topic('my-topic');

await topic.publishJSON({
  userId: 123,
  action: 'login',
  timestamp: Date.now()
});
```

### 5. Publishing with Schema Validation

Attach a schema to a topic to ensure message validity:

```typescript
const topic = pubsub.topic('my-topic');

// Topic must have a schema attached
await topic.publishMessage({
  data: Buffer.from(JSON.stringify({
    name: 'John Doe',
    age: 30
  }))
});
```

Messages that don't conform to the schema are rejected and not published.

## Subscribing Patterns

### 1. Pull Subscriptions (Streaming)

**Recommended**: Use the high-level client library with StreamingPull API for maximum throughput and lowest latency.

The StreamingPull API uses a persistent bidirectional connection to receive multiple messages as they become available.

```typescript
const subscription = pubsub.subscription('my-subscription');

// Listen for messages
subscription.on('message', (message) => {
  console.log(`Received message: ${message.id}`);
  console.log(`Data: ${message.data.toString()}`);
  console.log(`Attributes:`, message.attributes);

  // Acknowledge the message
  message.ack();
});

// Listen for errors
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

// Optional: Configure flow control
subscription.setOptions({
  flowControl: {
    maxMessages: 1000,      // Process max 1000 messages concurrently
    maxBytes: 100 * 1024 * 1024  // Process max 100MB concurrently
  },
  ackDeadline: 60           // 60 second ack deadline
});
```

**Flow Control Options**:
- `maxMessages`: Maximum number of unacknowledged messages
- `maxBytes`: Maximum bytes of unacknowledged messages
- `allowExcessMessages`: Allow exceeding limits temporarily

### 2. Pull Subscriptions (Synchronous)

For explicit control over message pulling:

```typescript
const subscription = pubsub.subscription('my-subscription');

// Pull messages synchronously
const [messages] = await subscription.pull({
  maxMessages: 10
});

// Process messages
for (const message of messages) {
  console.log(`Message: ${message.data.toString()}`);

  // Acknowledge when done processing
  await subscription.ack(message.ackId);
}
```

**Use Cases**:
- Batch processing jobs
- Manual polling scenarios
- Testing and development

### 3. Push Subscriptions

The Pub/Sub server initiates requests to your application to deliver messages.

**Configuration**:

```typescript
await pubsub.createSubscription('my-topic', 'my-push-subscription', {
  pushConfig: {
    pushEndpoint: 'https://your-app.com/push-handler',
    attributes: {
      'x-goog-version': 'v1'
    }
  }
});
```

**Supported Environments**:
- Cloud Functions
- Cloud Run
- App Engine
- Google Kubernetes Engine
- Compute Engine
- Custom webhooks

**Message Format**: Push subscriptions send HTTP POST requests with message data in the request body.

### 4. Subscription with Message Ordering

To receive ordered messages, enable ordering on the subscription:

```typescript
const subscription = pubsub.subscription('my-subscription');

subscription.setOptions({
  messageOrdering: true
});

subscription.on('message', (message) => {
  console.log(`Ordering key: ${message.orderingKey}`);
  console.log(`Message: ${message.data.toString()}`);

  // Messages with the same ordering key arrive in order
  message.ack();
});
```

**Important**: With ordered delivery, failing to acknowledge any message means all subsequent messages with the same ordering key are redelivered.

### 5. Subscription with Dead Letter Topics

Configure dead letter topics for messages that can't be processed:

```typescript
await pubsub.createSubscription('my-topic', 'my-subscription', {
  deadLetterPolicy: {
    deadLetterTopic: 'projects/my-project/topics/dead-letter-topic',
    maxDeliveryAttempts: 5
  }
});
```

### 6. Export Subscriptions

Export subscriptions write messages directly to Google Cloud resources:

- **BigQuery**: For analytics and data warehousing
- **Cloud Storage**: For archival and batch processing

```typescript
await pubsub.createSubscription('my-topic', 'my-export-subscription', {
  bigQueryConfig: {
    table: 'projects/my-project/datasets/my-dataset/tables/my-table',
    writeMetadata: true
  }
});
```

## Official Documentation Links

### Core Documentation
- [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview) - Overview and introduction
- [Architectural overview of Pub/Sub](https://docs.cloud.google.com/pubsub/architecture) - System architecture and design
- [Overview of the Pub/Sub service](https://cloud.google.com/pubsub/docs/pubsub-basics) - Service fundamentals
- [Pub/Sub documentation](https://docs.cloud.google.com/pubsub/docs) - Complete documentation index

### Topics & Publishing
- [Publish messages to topics](https://docs.cloud.google.com/pubsub/docs/publisher) - Publishing guide
- [Batch messaging](https://cloud.google.com/pubsub/docs/batch-messaging) - Batching strategies
- [Order messages](https://cloud.google.com/pubsub/docs/ordering) - Ordered delivery
- [Best practices to publish to a Pub/Sub topic](https://cloud.google.com/pubsub/docs/publish-best-practices) - Publishing best practices
- [Publish with batching settings](https://cloud.google.com/pubsub/docs/samples/pubsub-publisher-batch-settings) - Batching configuration
- [Publish with ordering keys](https://cloud.google.com/pubsub/docs/samples/pubsub-publish-with-ordering-keys) - Ordered publishing example

### Subscriptions & Consuming
- [Subscription overview](https://docs.cloud.google.com/pubsub/docs/subscription-overview) - Subscription concepts
- [Choose a subscription type](https://cloud.google.com/pubsub/docs/subscriber) - Subscription types guide
- [Pull subscriptions](https://docs.cloud.google.com/pubsub/docs/pull) - Pull subscription guide
- [Push subscriptions](https://cloud.google.com/pubsub/docs/push) - Push subscription guide
- [Best practices to subscribe to a Pub/Sub topic](https://cloud.google.com/pubsub/docs/subscribe-best-practices) - Subscription best practices
- [Subscription properties](https://docs.cloud.google.com/pubsub/docs/subscription-properties) - Configuration options

### Schemas
- [Schema overview](https://cloud.google.com/pubsub/docs/schemas) - Schema fundamentals
- [Parse messages from a topic with a schema](https://cloud.google.com/pubsub/docs/schemas-valid) - Schema validation
- [Validate a message for a schema](https://docs.cloud.google.com/pubsub/docs/validate-schema-message) - Message validation

### API References
- [Pub/Sub APIs overview](https://cloud.google.com/pubsub/docs/reference/service_apis_overview) - API overview
- [All APIs and references](https://cloud.google.com/pubsub/docs/apis) - Complete API listing
- [Cloud Pub/Sub API (REST)](https://cloud.google.com/pubsub/docs/reference/rest/) - REST API reference
- [Node.js client library](https://cloud.google.com/nodejs/docs/reference/pubsub/latest) - Node.js API reference
- [Node.js documentation](https://googleapis.dev/nodejs/pubsub/latest/) - Client library docs
- [@google-cloud/pubsub on npm](https://www.npmjs.com/package/@google-cloud/pubsub) - npm package page
- [GitHub - nodejs-pubsub](https://github.com/googleapis/nodejs-pubsub) - Source code repository

### Advanced Topics
- [Pub/Sub quotas and limits](https://docs.cloud.google.com/pubsub/quotas) - Resource limits
- [Pub/Sub client libraries](https://docs.cloud.google.com/pubsub/docs/reference/libraries) - All client libraries

### Community Resources
- [Google Cloud Pub/Sub Ordered Delivery](https://medium.com/google-cloud/google-cloud-pub-sub-ordered-delivery-1e4181f60bc8) - Ordered delivery guide
- [Google Cloud Pub/Sub Schema Validation with Avro and Protobuf](https://medium.com/@dorangao/google-cloud-pub-sub-schema-validation-with-avro-and-protobuf-ee0d746b8921) - Schema validation tutorial
- [Exploring Google Cloud Pub/Sub message schemas](https://pavankumarkattamuri.medium.com/exploring-google-cloud-pub-sub-message-schemas-c58a9c197239) - Schema exploration guide

---

**Document Version**: 1.0
**Last Updated**: January 14, 2026
**Based on**: Google Cloud Pub/Sub documentation (January 2026)
