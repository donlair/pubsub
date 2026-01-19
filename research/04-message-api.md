# Google Cloud Pub/Sub Message API

## Table of Contents
1. [Overview](#overview)
2. [Message Properties](#message-properties)
3. [Message Methods](#message-methods)
4. [Publishing Message Structure](#publishing-message-structure)
5. [Message Encoding](#message-encoding)
6. [Message Size Limits](#message-size-limits)
7. [Attribute Constraints](#attribute-constraints)
8. [Code Examples](#code-examples)
9. [Best Practices](#best-practices)

## Overview

Messages are the fundamental unit of data in Pub/Sub. A message consists of binary data payload, optional attributes (key-value pairs), and system-generated metadata.

### Message Lifecycle

1. **Publisher** creates message with data and attributes
2. **Pub/Sub** assigns message ID and publish time
3. **Subscription** receives message and assigns ack ID
4. **Subscriber** processes message
5. **Subscriber** acknowledges or nacks message

## Message Properties

### Received Message Properties

When a subscriber receives a message, it includes these properties:

**id** (string)
- Unique message identifier assigned by Pub/Sub server
- Unique within the topic
- Read-only

**ackId** (string)
- Acknowledgment identifier for this delivery
- Required for ack, nack, and modifyAckDeadline operations
- Unique per delivery attempt
- Read-only

**data** (Buffer)
- Message payload as a Node.js Buffer
- Can contain any binary data
- Maximum size: 10 MB (including attributes)

**attributes** (object)
- Key-value pairs of string metadata
- All keys and values must be strings
- Optional, can be empty object

**publishTime** (PreciseDate)
- Timestamp when message was published
- Set by Pub/Sub server
- High-precision timestamp
- Read-only

**received** (number)
- Timestamp (milliseconds) when subscription received the message
- Set by client library
- Used for calculating processing time
- Read-only

**deliveryAttempt** (number)
- Counter of delivery attempts
- Increments on nack or ack deadline expiration
- Used with dead letter topics
- Only populated if subscription has deadLetterPolicy
- Read-only

**orderingKey** (string)
- Key used for message ordering
- Messages with same ordering key are delivered in order
- Optional
- Read-only in received messages

**length** (number)
- Size of the message data in bytes
- Convenience property: equivalent to `data.length`
- Read-only

### Property Example

```typescript
subscription.on('message', (message) => {
  console.log({
    id: message.id,
    ackId: message.ackId,
    data: message.data.toString(),
    attributes: message.attributes,
    publishTime: message.publishTime,
    received: message.received,
    deliveryAttempt: message.deliveryAttempt,
    orderingKey: message.orderingKey,
    length: message.length
  });
});
```

## Message Methods

### ack()

Acknowledges the message, indicating successful processing.

```typescript
ack(): void
```

- Removes message from subscription
- Fire-and-forget operation (no confirmation)
- Can be called multiple times safely
- Should be called after successful processing

**Example:**
```typescript
subscription.on('message', (message) => {
  try {
    // Process message
    processData(message.data);

    // Acknowledge successful processing
    message.ack();
  } catch (error) {
    // Don't ack on error
    console.error('Processing failed:', error);
  }
});
```

### nack()

Negative acknowledgment - rejects the message for redelivery.

```typescript
nack(): void
```

- Message will be redelivered immediately (or after retry delay)
- Increments deliveryAttempt counter
- Fire-and-forget operation
- Use when processing fails and message should be retried

**Example:**
```typescript
subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
  } catch (error) {
    console.error('Processing failed, will retry:', error);
    message.nack(); // Redeliver immediately
  }
});
```

### ackWithResponse()

Acknowledges with confirmation (for exactly-once delivery).

```typescript
async ackWithResponse(): Promise<AckResponse>
```

**Returns:** Promise resolving to acknowledgment status

**AckResponse Values:**
- `'SUCCESS'` - Acknowledgment successful
- `'INVALID'` - Invalid ack ID
- `'PERMISSION_DENIED'` - Insufficient permissions
- `'FAILED_PRECONDITION'` - Subscription state issue
- `'OTHER'` - Other transient failures

**Example:**
```typescript
import { AckResponses } from '@google-cloud/pubsub';

subscription.on('message', async (message) => {
  try {
    await processMessage(message);

    const response = await message.ackWithResponse();
    if (response === AckResponses.Success) {
      console.log('Ack confirmed');
    } else {
      console.error('Ack failed with code:', response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});
```

### nackWithResponse()

Rejects with confirmation (for exactly-once delivery).

```typescript
async nackWithResponse(): Promise<AckResponse>
```

**Returns:** Promise resolving to nack status

**Example:**
```typescript
subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    await message.ackWithResponse();
  } catch (error) {
    const response = await message.nackWithResponse();
    console.log('Nack response:', response);
  }
});
```

### modifyAckDeadline(deadline)

Extends or shortens the acknowledgment deadline.

```typescript
modifyAckDeadline(deadline: number): void
```

**Parameters:**
- `deadline` - New deadline in seconds (0-600)
- `0` means immediate redelivery (same as nack)

**Example:**
```typescript
subscription.on('message', async (message) => {
  // Extend deadline while processing
  message.modifyAckDeadline(60); // Extend by 60 seconds

  try {
    await longRunningProcess(message);
    message.ack();
  } catch (error) {
    message.nack();
  }
});
```

## Publishing Message Structure

When publishing messages, use these interfaces:

### Simple Publishing

```typescript
interface PublishParams {
  data: Buffer;
  attributes?: Attributes;
}
```

**Example:**
```typescript
await topic.publish(
  Buffer.from('Hello, World!'),
  { source: 'api', priority: 'high' }
);
```

### Full Message Options

```typescript
interface PubsubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}
```

**Example:**
```typescript
await topic.publishMessage({
  data: Buffer.from(JSON.stringify({ userId: '123' })),
  attributes: { eventType: 'user.login' },
  orderingKey: 'user-123'
});
```

### Attributes Type

```typescript
interface Attributes {
  [key: string]: string;
}
```

All attribute keys and values MUST be strings:

```typescript
// ✅ Correct
const attributes = {
  userId: '12345',
  timestamp: new Date().toISOString(),
  count: '10'  // Number as string
};

// ❌ Wrong - values must be strings
const attributes = {
  userId: 12345,        // Number
  timestamp: new Date(), // Date object
  enabled: true         // Boolean
};
```

## Message Encoding

### Text Messages

```typescript
// Publishing
const data = Buffer.from('Hello, World!', 'utf-8');
await topic.publish(data);

// Receiving
subscription.on('message', (message) => {
  const text = message.data.toString('utf-8');
  console.log('Received:', text);
});
```

### JSON Messages

```typescript
// Publishing - Use publishJSON helper
await topic.publishJSON({ userId: '123', action: 'login' });

// Or manually
const data = Buffer.from(JSON.stringify({ userId: '123' }));
await topic.publish(data);

// Receiving
subscription.on('message', (message) => {
  const json = JSON.parse(message.data.toString());
  console.log('User ID:', json.userId);
});
```

### Binary Data

```typescript
// Publishing binary data
const imageBuffer = await Bun.file('image.png').arrayBuffer();
await topic.publish(Buffer.from(imageBuffer));

// Receiving
subscription.on('message', async (message) => {
  await Bun.write('received-image.png', message.data);
  message.ack();
});
```

### Protocol Buffers

```typescript
import { MyMessage } from './generated/proto';

// Publishing protobuf
const protoMessage = MyMessage.create({ field: 'value' });
const buffer = Buffer.from(MyMessage.encode(protoMessage).finish());
await topic.publish(buffer);

// Receiving protobuf
subscription.on('message', (message) => {
  const decoded = MyMessage.decode(message.data);
  console.log('Field:', decoded.field);
  message.ack();
});
```

### Avro

```typescript
import avro from 'avsc';

const schema = avro.Type.forSchema({
  type: 'record',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'action', type: 'string' }
  ]
});

// Publishing Avro
const encoded = schema.toBuffer({ userId: '123', action: 'login' });
await topic.publish(encoded);

// Receiving Avro
subscription.on('message', (message) => {
  const decoded = schema.fromBuffer(message.data);
  console.log('User:', decoded.userId);
  message.ack();
});
```

## Message Size Limits

### Maximum Sizes

- **Total message size**: 10 MB (data + attributes + metadata)
- **Data payload**: Nearly 10 MB (minus attributes)
- **Single attribute key**: 256 bytes
- **Single attribute value**: 1024 bytes
- **Total attributes**: Typically ~100 KB recommended

### Calculating Message Size

```typescript
function getMessageSize(data: Buffer, attributes?: Record<string, string>): number {
  let size = data.length;

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      size += key.length + value.length;
    }
  }

  return size;
}

// Usage
const data = Buffer.from('My message');
const attrs = { key1: 'value1', key2: 'value2' };
const size = getMessageSize(data, attrs);

if (size > 10 * 1024 * 1024) {
  throw new Error('Message too large');
}
```

### Handling Large Payloads

If data exceeds limits, use Cloud Storage:

```typescript
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket('my-bucket');

async function publishLargeData(topic: Topic, largeData: Buffer) {
  // Upload to Cloud Storage
  const filename = `messages/${Date.now()}.bin`;
  await bucket.file(filename).save(largeData);

  // Publish reference
  await topic.publishJSON({
    type: 'large-payload',
    bucket: 'my-bucket',
    filename: filename,
    size: largeData.length
  });
}

// Subscriber fetches from Cloud Storage
subscription.on('message', async (message) => {
  const payload = JSON.parse(message.data.toString());

  if (payload.type === 'large-payload') {
    const file = bucket.file(payload.filename);
    const [data] = await file.download();
    // Process large data
  }

  message.ack();
});
```

## Attribute Constraints

### Valid Attribute Keys

- Must be non-empty strings
- Maximum 256 bytes per key
- Case-sensitive
- Can contain letters, numbers, underscores, hyphens

### Valid Attribute Values

- Must be strings
- Maximum 1024 bytes per value
- Empty strings are allowed
- All types must be converted to strings

### Reserved Attributes

Some attribute names are reserved by Google Cloud:

- `googclient_*` - Reserved for client library metadata
- `goog*` - Generally reserved
- Attributes added by Pub/Sub features (e.g., dead letter metadata)

### Validation Example

```typescript
function validateAttributes(attributes: Record<string, string>): void {
  for (const [key, value] of Object.entries(attributes)) {
    // Check key length
    if (Buffer.byteLength(key) > 256) {
      throw new Error(`Attribute key too long: ${key}`);
    }

    // Check value is string
    if (typeof value !== 'string') {
      throw new Error(`Attribute value must be string: ${key}`);
    }

    // Check value length
    if (Buffer.byteLength(value) > 1024) {
      throw new Error(`Attribute value too long: ${key}`);
    }

    // Check reserved prefixes
    if (key.startsWith('goog')) {
      throw new Error(`Reserved attribute key: ${key}`);
    }
  }
}
```

## Code Examples

### Complete Message Handler

```typescript
import { PubSub, Message, Subscription } from '@google-cloud/pubsub';

class MessageProcessor {
  private subscription: Subscription;

  constructor(private pubsub: PubSub, subscriptionName: string) {
    this.subscription = pubsub.subscription(subscriptionName);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.subscription.on('message', this.handleMessage.bind(this));
    this.subscription.on('error', this.handleError.bind(this));
  }

  private async handleMessage(message: Message) {
    console.log(`Processing message ${message.id}`);
    console.log(`Delivery attempt: ${message.deliveryAttempt || 1}`);

    try {
      // Extract data
      const data = JSON.parse(message.data.toString());

      // Process based on attributes
      if (message.attributes.priority === 'high') {
        await this.processHighPriority(data);
      } else {
        await this.processNormal(data);
      }

      // Acknowledge success
      message.ack();
      console.log(`Message ${message.id} processed successfully`);

    } catch (error) {
      console.error(`Error processing message ${message.id}:`, error);

      // Nack for retry
      message.nack();
    }
  }

  private handleError(error: Error) {
    console.error('Subscription error:', error);
  }

  private async processHighPriority(data: any) {
    // High priority processing
  }

  private async processNormal(data: any) {
    // Normal processing
  }

  start() {
    console.log('Message processor started');
  }

  async stop() {
    await this.subscription.close();
    console.log('Message processor stopped');
  }
}

// Usage
const processor = new MessageProcessor(pubsub, 'my-subscription');
processor.start();
```

### Batch Message Processing

```typescript
interface MessageBatch {
  messages: Message[];
  startTime: number;
}

class BatchMessageProcessor {
  private batch: MessageBatch = { messages: [], startTime: Date.now() };
  private batchSize = 10;
  private batchTimeout = 5000; // 5 seconds
  private timer: Timer | null = null;

  constructor(private subscription: Subscription) {
    subscription.on('message', this.addToBatch.bind(this));
  }

  private addToBatch(message: Message) {
    this.batch.messages.push(message);

    if (this.batch.messages.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.processBatch(), this.batchTimeout);
    }
  }

  private async processBatch() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const messages = this.batch.messages;
    this.batch = { messages: [], startTime: Date.now() };

    if (messages.length === 0) return;

    console.log(`Processing batch of ${messages.length} messages`);

    try {
      // Process all messages
      await Promise.all(messages.map(m => this.processMessage(m)));

      // Ack all
      messages.forEach(m => m.ack());

    } catch (error) {
      console.error('Batch processing failed:', error);
      // Nack all
      messages.forEach(m => m.nack());
    }
  }

  private async processMessage(message: Message) {
    // Process individual message
    const data = message.data.toString();
    // ... processing logic
  }
}
```

### Message with Deadline Extension

```typescript
async function processWithExtension(message: Message) {
  const PROCESSING_TIME = 120; // seconds
  const EXTENSION_INTERVAL = 30; // seconds

  // Set up periodic deadline extension
  const extender = setInterval(() => {
    message.modifyAckDeadline(60);
    console.log('Extended ack deadline');
  }, EXTENSION_INTERVAL * 1000);

  try {
    await longRunningProcess(message.data);
    clearInterval(extender);
    message.ack();
  } catch (error) {
    clearInterval(extender);
    message.nack();
  }
}
```

## Best Practices

### 1. Always Acknowledge Messages

```typescript
// ✅ Always ack or nack
subscription.on('message', async (message) => {
  try {
    await process(message);
    message.ack();
  } catch (error) {
    message.nack();
  }
});

// ❌ Never leave messages unacknowledged
subscription.on('message', async (message) => {
  await process(message);
  // Forgot to ack!
});
```

### 2. Use Attributes for Metadata

```typescript
// ✅ Put metadata in attributes
await topic.publish(Buffer.from(payload), {
  contentType: 'application/json',
  source: 'api-server',
  timestamp: new Date().toISOString()
});

// ❌ Don't embed metadata in payload
const payload = {
  _meta: { source: 'api', timestamp: Date.now() },
  data: { /* actual data */ }
};
```

### 3. Handle JSON Parsing Errors

```typescript
subscription.on('message', (message) => {
  let data;
  try {
    data = JSON.parse(message.data.toString());
  } catch (error) {
    console.error('Invalid JSON:', error);
    message.ack(); // Ack invalid messages to avoid infinite retries
    return;
  }

  // Process valid data
  processData(data);
  message.ack();
});
```

### 4. Monitor Delivery Attempts

```typescript
subscription.on('message', (message) => {
  if (message.deliveryAttempt && message.deliveryAttempt > 5) {
    console.warn(`Message ${message.id} has ${message.deliveryAttempt} attempts`);
    // Consider dead-lettering or special handling
  }

  try {
    process(message);
    message.ack();
  } catch (error) {
    message.nack();
  }
});
```

### 5. Use Ordering Keys Appropriately

```typescript
// ✅ Good: One ordering key per entity
await topic.publishMessage({
  data: Buffer.from('Update'),
  orderingKey: `user-${userId}`
});

// ❌ Bad: Single ordering key for everything
await topic.publishMessage({
  data: Buffer.from('Update'),
  orderingKey: 'global' // Bottleneck!
});
```

### 6. Validate Message Size

```typescript
async function publishSafe(topic: Topic, data: Buffer, attrs?: Record<string, string>) {
  const size = data.length + JSON.stringify(attrs || {}).length;

  if (size > 10 * 1024 * 1024) {
    throw new Error(`Message too large: ${size} bytes`);
  }

  return topic.publish(data, attrs);
}
```

### 7. Use Structured Data

```typescript
// ✅ Use structured format
interface UserEvent {
  userId: string;
  action: string;
  timestamp: number;
}

const event: UserEvent = {
  userId: '123',
  action: 'login',
  timestamp: Date.now()
};

await topic.publishJSON(event);

// Instead of unstructured strings
await topic.publish(Buffer.from('user:123:login'));
```

## Official Documentation

- [Message Structure](https://cloud.google.com/pubsub/docs/reference/rest/v1/PubsubMessage)
- [Message Class Reference](https://googleapis.dev/nodejs/pubsub/latest/Message.html)
- [Publishing Messages](https://cloud.google.com/pubsub/docs/publisher)
- [Receiving Messages](https://cloud.google.com/pubsub/docs/pull)
- [Message Attributes](https://cloud.google.com/pubsub/docs/samples/pubsub-publish-custom-attributes)
