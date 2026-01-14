# TypeScript Types Documentation - Google Cloud Pub/Sub

## Overview

This document provides comprehensive documentation for all exported TypeScript interfaces and types in the `@google-cloud/pubsub` library.

---

## Table of Contents

1. [Client Configuration Types](#client-configuration-types)
2. [Publisher Types](#publisher-types)
3. [Subscriber Types](#subscriber-types)
4. [Topic Types](#topic-types)
5. [Subscription Types](#subscription-types)
6. [Schema Types](#schema-types)
7. [Message Types](#message-types)
8. [Flow Control Types](#flow-control-types)
9. [Utility Types](#utility-types)
10. [IAM Types](#iam-types)
11. [Callback and Response Types](#callback-and-response-types)
12. [Enum Types](#enum-types)

---

## Client Configuration Types

### ClientConfig

Main configuration interface for the PubSub client.

```typescript
interface ClientConfig extends gax.GrpcClientOptions {
  apiEndpoint?: string;
  emulatorMode?: boolean;
  servicePath?: string;
  port?: string | number;
  sslCreds?: gax.grpc.ChannelCredentials;
  enableOpenTelemetryTracing?: boolean;
}
```

**Properties:**

- `apiEndpoint?: string` - The API endpoint to use. If not set, uses `PUBSUB_EMULATOR_HOST` environment variable or defaults to production API.
- `emulatorMode?: boolean` - Configures emulator mode behavior:
  - `false`: Disable emulator mode always
  - `true`: Enable emulator mode always
  - `undefined`: Use heuristics to decide
- `servicePath?: string` - Custom service path for API requests
- `port?: string | number` - Port number for the service
- `sslCreds?: gax.grpc.ChannelCredentials` - Custom SSL credentials
- `enableOpenTelemetryTracing?: boolean` - Enables OpenTelemetry tracing (defaults to false)

**Inherited from gax.GrpcClientOptions:**
- `projectId?: string` - Google Cloud project ID
- `keyFilename?: string` - Path to service account key file
- `credentials?: object` - Credentials object with `client_email` and `private_key`
- `autoRetry?: boolean` - Automatically retry requests on rate limits and intermittent errors (default: true)

**Usage Example:**

```typescript
import { PubSub, ClientConfig } from '@google-cloud/pubsub';

const config: ClientConfig = {
  projectId: 'my-project',
  keyFilename: '/path/to/keyfile.json',
  enableOpenTelemetryTracing: true
};

const pubsub = new PubSub(config);
```

---

## Publisher Types

### PublishOptions

Configuration options for publishing messages.

```typescript
interface PublishOptions {
  batching?: BatchPublishOptions;
  flowControlOptions?: PublisherFlowControlOptions;
  gaxOpts?: CallOptions;
  messageOrdering?: boolean;
}
```

**Properties:**

- `batching?: BatchPublishOptions` - Message batching configuration
- `flowControlOptions?: PublisherFlowControlOptions` - Publisher-side flow control settings
- `gaxOpts?: CallOptions` - Request configuration options
- `messageOrdering?: boolean` - Enable message ordering (messages with same ordering key are delivered in order)

**Usage Example:**

```typescript
const publishOptions: PublishOptions = {
  batching: {
    maxMessages: 100,
    maxMilliseconds: 10
  },
  messageOrdering: true
};

const topic = pubsub.topic('my-topic', publishOptions);
```

### BatchPublishOptions

Options for batching messages before publishing.

```typescript
interface BatchPublishOptions {
  maxBytes?: number;
  maxMessages?: number;
  maxMilliseconds?: number;
}
```

**Properties:**

- `maxBytes?: number` - Maximum bytes to buffer before sending (default: 1MB)
- `maxMessages?: number` - Maximum messages to buffer before sending (default: 100)
- `maxMilliseconds?: number` - Maximum duration to wait before sending (default: 10ms)

**Usage Example:**

```typescript
const batchOptions: BatchPublishOptions = {
  maxBytes: 1024 * 1024, // 1 MB
  maxMessages: 100,
  maxMilliseconds: 10
};
```

### Attributes

Message attributes type - key-value pairs where both are strings.

```typescript
type Attributes = Record<string, string>;
```

**Usage Example:**

```typescript
const attributes: Attributes = {
  origin: 'web',
  priority: 'high',
  userId: '12345'
};
```

### PubsubMessage

The basic message structure for publishing.

```typescript
interface PubsubMessage extends google.pubsub.v1.IPubsubMessage {
  data?: Buffer | Uint8Array;
  attributes?: Attributes;
  messageId?: string;
  publishTime?: google.protobuf.ITimestamp;
  orderingKey?: string;
}
```

**Properties:**

- `data?: Buffer | Uint8Array` - The message payload
- `attributes?: Attributes` - Key-value pairs for message metadata
- `messageId?: string` - Server-assigned message ID
- `publishTime?: google.protobuf.ITimestamp` - When the server received the message
- `orderingKey?: string` - Ordering key for message ordering

**Usage Example:**

```typescript
const message: PubsubMessage = {
  data: Buffer.from('Hello, world!'),
  attributes: {
    source: 'api',
    version: '1.0'
  },
  orderingKey: 'user-123'
};
```

### MessageOptions

Extended message options including JSON convenience property.

```typescript
type MessageOptions = PubsubMessage & {
  json?: any;
};
```

**Properties:**

- `json?: any` - Convenience property to publish JSON data (automatically converted to Buffer)
- All properties from `PubsubMessage`

**Usage Example:**

```typescript
// Using JSON
const message: MessageOptions = {
  json: { userId: 123, action: 'login' },
  attributes: { type: 'event' }
};

// Using Buffer
const message2: MessageOptions = {
  data: Buffer.from('raw data'),
  attributes: { type: 'binary' }
};
```

### PublishCallback

Callback function for publish operations.

```typescript
type PublishCallback = (err: ServiceError | null, messageId?: string | null) => void;
```

**Usage Example:**

```typescript
const callback: PublishCallback = (err, messageId) => {
  if (err) {
    console.error('Publish failed:', err);
    return;
  }
  console.log('Published message:', messageId);
};

topic.publishMessage(message, callback);
```

---

## Subscriber Types

### SubscriberOptions

Configuration options for message subscribers.

```typescript
interface SubscriberOptions {
  minAckDeadline?: Duration;
  maxAckDeadline?: Duration;
  maxExtensionTime?: Duration;
  batching?: BatchOptions;
  flowControl?: SubscriberFlowControlOptions;
  useLegacyFlowControl?: boolean;
  streamingOptions?: MessageStreamOptions;
  closeOptions?: SubscriberCloseOptions;
}
```

**Properties:**

- `minAckDeadline?: Duration` - Minimum time for ackDeadline (in seconds or Duration object)
- `maxAckDeadline?: Duration` - Maximum time for ackDeadline (in seconds or Duration object)
- `maxExtensionTime?: Duration` - Maximum time for message extension
- `batching?: BatchOptions` - Batching options for acks and modacks
- `flowControl?: SubscriberFlowControlOptions` - Flow control options
- `useLegacyFlowControl?: boolean` - Use client-side only flow control (default: false)
- `streamingOptions?: MessageStreamOptions` - Streaming connection options
- `closeOptions?: SubscriberCloseOptions` - Behavior for closing the subscriber

**Usage Example:**

```typescript
const subscriberOptions: SubscriberOptions = {
  flowControl: {
    maxMessages: 100,
    maxBytes: 1024 * 1024 * 10 // 10 MB
  },
  minAckDeadline: 10,
  maxAckDeadline: 600
};

const subscription = pubsub.subscription('my-sub', subscriberOptions);
```

### SubscriberCloseOptions

Options for closing a subscriber.

```typescript
interface SubscriberCloseOptions {
  behavior?: SubscriberCloseBehavior;
  timeout?: Duration;
}
```

**Properties:**

- `behavior?: SubscriberCloseBehavior` - The close behavior (see `SubscriberCloseBehaviors` enum)
- `timeout?: Duration` - Maximum time to wait for pending operations

**Usage Example:**

```typescript
const closeOptions: SubscriberCloseOptions = {
  behavior: 'WAIT', // Wait for processing
  timeout: 30 // 30 seconds
};

await subscription.close();
```

### BatchOptions

Options for batching acknowledgments and modifyAckDeadline calls.

```typescript
interface BatchOptions {
  maxMessages?: number;        // Default: 3000
  maxMilliseconds?: number;    // Default: 100 ms
}
```

**Properties:**

- `maxMessages?: number` - Maximum number of acknowledgments to batch before sending (default: 3000)
- `maxMilliseconds?: number` - Maximum time in milliseconds to wait before sending batch (default: 100 ms)

**Behavior:**

Acknowledgments are batched and sent when either:
- `maxMessages` acknowledgments have been accumulated, OR
- `maxMilliseconds` have elapsed since the first acknowledgment in the batch

This reduces the number of API calls and improves efficiency.

**Usage Example:**

```typescript
const subscription = pubsub.subscription('my-sub', {
  batching: {
    maxMessages: 1000,
    maxMilliseconds: 50
  }
});

// Acknowledgments will be batched up to 1000 messages
// or sent after 50ms, whichever comes first
subscription.on('message', (message) => {
  message.ack(); // Batched automatically
});
```

### MessageStreamOptions

Options for gRPC streaming connections in pull subscriptions.

```typescript
interface MessageStreamOptions {
  maxStreams?: number;         // Default: 5
  timeout?: number;            // Default: 300000 ms (5 minutes)
}
```

**Properties:**

- `maxStreams?: number` - Number of concurrent streaming pull connections (default: 5)
- `timeout?: number` - Milliseconds before stream timeout (default: 300000 ms / 5 minutes)

**Behavior:**

- More streams = higher throughput but more resources
- Timeout controls how long a streaming connection stays open

**Usage Example:**

```typescript
const subscription = pubsub.subscription('my-sub', {
  streamingOptions: {
    maxStreams: 10,        // 10 concurrent streams
    timeout: 600000        // 10 minute timeout
  }
});

// Higher throughput for high-volume subscriptions
subscription.on('message', (message) => {
  processMessage(message);
  message.ack();
});
```

### Message

Represents a received message.

```typescript
class Message {
  ackId: string;
  attributes: { [key: string]: string };
  data: Buffer;
  deliveryAttempt: number;
  id: string;
  orderingKey?: string;
  publishTime: PreciseDate;
  received: number;
  length: number;

  ack(): void;
  ackWithResponse(): Promise<AckResponse>;
  nack(): void;
  nackWithResponse(): Promise<AckResponse>;
  modAck(deadline: number): void;
  modAckWithResponse(deadline: number): Promise<AckResponse>;
}
```

**Properties:**

- `ackId: string` - ID used to acknowledge message receipt
- `attributes: { [key: string]: string }` - Message attributes
- `data: Buffer` - Message payload
- `deliveryAttempt: number` - Number of delivery attempts
- `id: string` - Message ID
- `orderingKey?: string` - Ordering key if message ordering is enabled
- `publishTime: PreciseDate` - When Pub/Sub received the message
- `received: number` - Timestamp when client received the message
- `length: number` - Length of message data in bytes

**Methods:**

- `ack()` - Acknowledge the message
- `ackWithResponse()` - Acknowledge with response (for exactly-once delivery)
- `nack()` - Negative acknowledge (requeue for redelivery)
- `nackWithResponse()` - Negative acknowledge with response
- `modAck(deadline)` - Modify the ack deadline
- `modAckWithResponse(deadline)` - Modify ack deadline with response

**Usage Example:**

```typescript
subscription.on('message', (message: Message) => {
  console.log('Received:', message.data.toString());
  console.log('ID:', message.id);
  console.log('Attributes:', message.attributes);
  console.log('Delivery attempt:', message.deliveryAttempt);

  // Process message
  try {
    processMessage(message.data);
    message.ack();
  } catch (error) {
    message.nack();
  }
});
```

### AckError

Error thrown for failed ack/nack operations with exactly-once delivery.

```typescript
class AckError extends Error {
  errorCode: AckResponse;
  constructor(errorCode: AckResponse, message?: string);
}
```

**Properties:**

- `errorCode: AckResponse` - The specific error code (see `AckResponses` enum)

**Usage Example:**

```typescript
try {
  const response = await message.ackWithResponse();
  if (response !== 'SUCCESS') {
    console.warn('Ack response:', response);
  }
} catch (error) {
  if (error instanceof AckError) {
    console.error('Ack failed:', error.errorCode);
  }
}
```

---

## Topic Types

### TopicMetadata

Metadata for a topic.

```typescript
type TopicMetadata = google.pubsub.v1.ITopic;
```

**Properties (from google.pubsub.v1.ITopic):**

- `name?: string` - Topic name
- `labels?: { [key: string]: string }` - Topic labels
- `messageStoragePolicy?: google.pubsub.v1.IMessageStoragePolicy` - Message storage policy
- `kmsKeyName?: string` - Cloud KMS key for encryption
- `schemaSettings?: SchemaSettings` - Schema settings
- `satisfiesPzs?: boolean` - Reserved for future use
- `messageRetentionDuration?: google.protobuf.IDuration` - Message retention

**Usage Example:**

```typescript
const metadata: TopicMetadata = {
  labels: {
    env: 'production',
    team: 'platform'
  },
  messageRetentionDuration: {
    seconds: 86400 // 1 day
  }
};

await topic.setMetadata(metadata);
```

### CreateTopicOptions

Options for creating a topic (extends CallOptions).

```typescript
type CreateTopicOptions = CallOptions & TopicMetadata;
```

**Usage Example:**

```typescript
const options: CreateTopicOptions = {
  labels: { env: 'dev' },
  timeout: 30000 // 30 seconds
};

const [topic] = await pubsub.createTopic('my-topic', options);
```

### GetTopicOptions

Options for getting a topic.

```typescript
type GetTopicOptions = CallOptions & {
  autoCreate?: boolean;
};
```

**Properties:**

- `autoCreate?: boolean` - Automatically create topic if it doesn't exist (default: false)

**Usage Example:**

```typescript
const options: GetTopicOptions = {
  autoCreate: true
};

const [topic] = await pubsub.topic('my-topic').get(options);
```

---

## Subscription Types

### SubscriptionMetadata

Metadata for a subscription.

```typescript
type SubscriptionMetadata = {
  messageRetentionDuration?: google.protobuf.IDuration | number;
  pushEndpoint?: string;
  oidcToken?: OidcToken;
} & Omit<google.pubsub.v1.ISubscription, 'messageRetentionDuration'>;
```

**Key Properties:**

- `name?: string` - Subscription name
- `topic?: string` - Associated topic
- `pushConfig?: PushConfig` - Push delivery configuration
- `ackDeadlineSeconds?: number` - Ack deadline in seconds (10-600)
- `retainAckedMessages?: boolean` - Retain acknowledged messages
- `messageRetentionDuration?: google.protobuf.IDuration | number` - Message retention duration
- `labels?: { [key: string]: string }` - Subscription labels
- `enableMessageOrdering?: boolean` - Enable message ordering
- `expirationPolicy?: google.pubsub.v1.IExpirationPolicy` - Subscription expiration policy
- `filter?: string` - Message filter expression
- `deadLetterPolicy?: DeadLetterPolicy` - Dead letter policy
- `retryPolicy?: RetryPolicy` - Retry policy
- `detached?: boolean` - Whether subscription is detached
- `enableExactlyOnceDelivery?: boolean` - Enable exactly-once delivery

**Usage Example:**

```typescript
const metadata: SubscriptionMetadata = {
  ackDeadlineSeconds: 60,
  messageRetentionDuration: 86400, // 1 day in seconds
  retainAckedMessages: true,
  labels: {
    env: 'production'
  },
  enableExactlyOnceDelivery: true
};

await subscription.setMetadata(metadata);
```

### CreateSubscriptionOptions

Options for creating a subscription.

```typescript
type CreateSubscriptionOptions = SubscriptionMetadata & {
  gaxOpts?: CallOptions;
  flowControl?: SubscriberFlowControlOptions;
};
```

**Usage Example:**

```typescript
const options: CreateSubscriptionOptions = {
  ackDeadlineSeconds: 30,
  flowControl: {
    maxMessages: 100
  },
  deadLetterPolicy: {
    deadLetterTopic: 'projects/my-project/topics/dead-letter',
    maxDeliveryAttempts: 5
  }
};

const [subscription] = await topic.createSubscription('my-sub', options);
```

### SubscriptionOptions

Options for a Subscription object.

```typescript
type SubscriptionOptions = SubscriberOptions & {
  topic?: Topic;
};
```

**Usage Example:**

```typescript
const options: SubscriptionOptions = {
  topic: pubsub.topic('my-topic'),
  flowControl: {
    maxMessages: 50
  }
};

const subscription = pubsub.subscription('my-sub', options);
```

### PushConfig

Configuration for push delivery.

```typescript
type PushConfig = google.pubsub.v1.IPushConfig;
```

**Properties:**

- `pushEndpoint?: string` - URL for push endpoint
- `attributes?: { [key: string]: string }` - Endpoint configuration attributes
- `oidcToken?: OidcToken` - OIDC token for authentication

**Usage Example:**

```typescript
const pushConfig: PushConfig = {
  pushEndpoint: 'https://example.com/push',
  attributes: {
    'x-goog-version': 'v1'
  },
  oidcToken: {
    serviceAccountEmail: 'my-sa@project.iam.gserviceaccount.com',
    audience: 'https://example.com'
  }
};
```

### OidcToken

OIDC token configuration for push endpoints.

```typescript
type OidcToken = google.pubsub.v1.PushConfig.IOidcToken;
```

**Properties:**

- `serviceAccountEmail?: string` - Service account email
- `audience?: string` - Audience claim for the OIDC token

### DeadLetterPolicy

Policy for dead letter queue.

```typescript
interface DeadLetterPolicy {
  deadLetterTopic?: string;
  maxDeliveryAttempts?: number;
}
```

**Properties:**

- `deadLetterTopic?: string` - Topic to forward dead letters to
- `maxDeliveryAttempts?: number` - Maximum delivery attempts before dead lettering

**Usage Example:**

```typescript
const deadLetterPolicy: DeadLetterPolicy = {
  deadLetterTopic: 'projects/my-project/topics/dead-letter-queue',
  maxDeliveryAttempts: 5
};
```

### RetryPolicy

Policy for retrying message delivery.

```typescript
interface RetryPolicy {
  minimumBackoff?: google.protobuf.IDuration;
  maximumBackoff?: google.protobuf.IDuration;
}
```

**Properties:**

- `minimumBackoff?: google.protobuf.IDuration` - Minimum delay between retries
- `maximumBackoff?: google.protobuf.IDuration` - Maximum delay between retries

**Usage Example:**

```typescript
const retryPolicy: RetryPolicy = {
  minimumBackoff: { seconds: 10 },
  maximumBackoff: { seconds: 600 }
};
```

---

## Schema Types

### SchemaType

Type of schema definition.

```typescript
type SchemaType = keyof typeof google.pubsub.v1.Schema.Type;
```

**Possible Values:**
- `'PROTOCOL_BUFFER'` - Protocol Buffer schema
- `'AVRO'` - Apache Avro schema

**Usage Example:**

```typescript
import { SchemaTypes } from '@google-cloud/pubsub';

const type: SchemaType = 'AVRO';
// Or use the enum:
const type2 = SchemaTypes.Avro;
```

### SchemaView

View level for retrieving schema information.

```typescript
type SchemaView = keyof typeof google.pubsub.v1.SchemaView;
```

**Possible Values:**
- `'BASIC'` - Include name and type only
- `'FULL'` - Include all schema information

**Usage Example:**

```typescript
import { SchemaViews } from '@google-cloud/pubsub';

const view: SchemaView = 'FULL';
// Or use the enum:
const view2 = SchemaViews.Full;
```

### SchemaEncoding

Encoding type for schema messages.

```typescript
type SchemaEncoding = keyof typeof google.pubsub.v1.Encoding;
```

**Possible Values:**
- `'JSON'` - JSON encoding
- `'BINARY'` - Binary encoding

**Usage Example:**

```typescript
import { Encodings } from '@google-cloud/pubsub';

const encoding: SchemaEncoding = 'JSON';
// Or use the enum:
const encoding2 = Encodings.Json;
```

### ISchema

Schema interface from protobuf.

```typescript
type ISchema = google.pubsub.v1.ISchema;
```

**Properties:**

- `name?: string` - Schema name
- `type?: SchemaType` - Schema type (Avro or Protocol Buffer)
- `definition?: string` - Schema definition
- `revisionId?: string` - Revision ID
- `revisionCreateTime?: google.protobuf.ITimestamp` - When revision was created

**Usage Example:**

```typescript
const schema: ISchema = {
  name: 'projects/my-project/schemas/my-schema',
  type: 'AVRO',
  definition: JSON.stringify({
    type: 'record',
    name: 'User',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'email', type: 'string' }
    ]
  })
};
```

### SchemaMessageMetadata

Metadata extracted from a message's schema attributes.

```typescript
interface SchemaMessageMetadata {
  name?: string;
  revision?: string;
  encoding: SchemaEncoding | undefined;
}
```

**Properties:**

- `name?: string` - Schema name
- `revision?: string` - Schema revision ID
- `encoding: SchemaEncoding | undefined` - Message encoding

**Usage Example:**

```typescript
subscription.on('message', (message: Message) => {
  const metadata = Schema.metadataFromMessage(message.attributes);
  console.log('Schema:', metadata.name);
  console.log('Revision:', metadata.revision);
  console.log('Encoding:', metadata.encoding);
});
```

### SchemaSettings

Settings for schema validation.

```typescript
interface SchemaSettings {
  schema?: string;
  encoding?: SchemaEncoding;
}
```

**Properties:**

- `schema?: string` - Schema resource name
- `encoding?: SchemaEncoding` - Expected encoding

**Usage Example:**

```typescript
const topicMetadata: TopicMetadata = {
  schemaSettings: {
    schema: 'projects/my-project/schemas/my-schema',
    encoding: 'JSON'
  }
};
```

---

## Message Types

### Duration

Represents a duration/time period.

```typescript
type Duration = number | google.protobuf.IDuration;
```

Can be specified as:
- `number` - Duration in seconds
- `google.protobuf.IDuration` - Object with `seconds` and `nanos` properties

**Usage Example:**

```typescript
// As number (seconds)
const duration1: Duration = 60;

// As Duration object
const duration2: Duration = {
  seconds: 60,
  nanos: 500000000 // 0.5 seconds
};
```

---

## Flow Control Types

### PublisherFlowControlOptions

Options for controlling publisher message flow.

```typescript
interface PublisherFlowControlOptions {
  maxOutstandingMessages?: number;  // Default: 100
  maxOutstandingBytes?: number;     // Default: 1 MB (1024 * 1024)
}
```

**Properties:**

- `maxOutstandingMessages?: number` - Maximum outstanding messages before flow control (default: 100)
- `maxOutstandingBytes?: number` - Maximum outstanding bytes before flow control (default: 1 MB)

**Usage Example:**

```typescript
const publisherFlow: PublisherFlowControlOptions = {
  maxOutstandingMessages: 1000,
  maxOutstandingBytes: 10 * 1024 * 1024 // 10 MB
};
```

### SubscriberFlowControlOptions

Options for controlling subscriber message flow.

```typescript
interface SubscriberFlowControlOptions {
  maxMessages?: number;             // Default: 1000
  maxBytes?: number;                // Default: 100 MB (100 * 1024 * 1024)
  allowExcessMessages?: boolean;    // Default: false
}
```

**Properties:**

- `maxMessages?: number` - Maximum unacknowledged messages (default: 1000)
- `maxBytes?: number` - Maximum bytes of unacknowledged messages (default: 100 MB)
- `allowExcessMessages?: boolean` - Allow messages beyond limit if already in flight (default: false)

**Usage Example:**

```typescript
const subscriberFlow: SubscriberFlowControlOptions = {
  maxMessages: 100,
  maxBytes: 1024 * 1024, // 1 MB
  allowExcessMessages: false
};
```

---

## Utility Types

### Duration

Class for representing time durations in various units.

```typescript
class Duration {
  seconds?: number;
  nanos?: number;

  static from(durationLike: DurationLike | Duration): Duration;
  total(unit: 'seconds' | 'milliseconds' | 'minutes' | 'hours'): number;
  add(other: DurationLike | Duration): Duration;
  subtract(other: DurationLike | Duration): Duration;
}

interface DurationLike {
  seconds?: number;
  minutes?: number;
  hours?: number;
  days?: number;
}
```

**Properties:**

- `seconds?: number` - Number of seconds in the duration
- `nanos?: number` - Nanoseconds component (0-999,999,999)

**Static Methods:**

- `from(durationLike: DurationLike | Duration): Duration` - Creates Duration from various time units

**Instance Methods:**

- `total(unit: string): number` - Get total duration in specified unit ('seconds', 'milliseconds', 'minutes', 'hours')
- `add(other: DurationLike | Duration): Duration` - Add another duration to this one
- `subtract(other: DurationLike | Duration): Duration` - Subtract another duration from this one

**Usage Examples:**

```typescript
// Create from seconds
const d1 = Duration.from({ seconds: 30 });

// Create from minutes
const d2 = Duration.from({ minutes: 5 });

// Create from mixed units
const d3 = Duration.from({ hours: 1, minutes: 30, seconds: 45 });

// Get total in different units
console.log(d3.total('seconds'));      // 5445
console.log(d3.total('minutes'));      // 90.75
console.log(d3.total('hours'));        // 1.5125

// Add durations
const d4 = d1.add({ seconds: 10 });    // 40 seconds
const d5 = d2.add({ minutes: 2 });     // 7 minutes

// Subtract durations
const d6 = d3.subtract({ minutes: 30 }); // 1 hour, 0 minutes, 45 seconds

// Use with subscriber options
const subscription = pubsub.subscription('my-sub', {
  minAckDeadline: Duration.from({ seconds: 10 }),
  maxAckDeadline: Duration.from({ minutes: 10 }),
  maxExtensionTime: Duration.from({ hours: 1 })
});
```

---

## IAM Types

### Policy

IAM policy for access control.

```typescript
type Policy = {
  etag?: string | Buffer;
} & Omit<IamProtos.google.iam.v1.IPolicy, 'etag'>;
```

**Properties:**

- `etag?: string | Buffer` - Policy version/etag
- `bindings?: Array<{ role: string; members: string[]; condition?: Expr }>` - Role bindings
- `version?: number` - Policy version

**Usage Example:**

```typescript
const policy: Policy = {
  bindings: [
    {
      role: 'roles/pubsub.publisher',
      members: [
        'user:alice@example.com',
        'serviceAccount:my-sa@project.iam.gserviceaccount.com'
      ]
    },
    {
      role: 'roles/pubsub.subscriber',
      members: ['group:developers@example.com']
    }
  ]
};

await topic.iam.setPolicy(policy);
```

### Binding

Represents a single role binding with members and optional condition.

```typescript
interface Binding {
  role: string;
  members: string[];
  condition?: Expr;
}
```

**Properties:**

- `role: string` - The role identifier (e.g., 'roles/pubsub.publisher')
- `members: string[]` - Array of identity strings (e.g., 'user:email@example.com', 'serviceAccount:name@project.iam.gserviceaccount.com', 'group:group@example.com', 'domain:example.com')
- `condition?: Expr` - Optional conditional expression for fine-grained access control

**Common Member Formats:**
- `user:email@example.com` - Specific user account
- `serviceAccount:name@project.iam.gserviceaccount.com` - Service account
- `group:group@example.com` - Google Group
- `domain:example.com` - All users in a domain
- `allUsers` - Anyone on the internet
- `allAuthenticatedUsers` - Any authenticated user

**Usage Example:**

```typescript
const binding: Binding = {
  role: 'roles/pubsub.publisher',
  members: [
    'user:alice@example.com',
    'serviceAccount:publisher@project.iam.gserviceaccount.com'
  ]
};

// With conditional access
const conditionalBinding: Binding = {
  role: 'roles/pubsub.subscriber',
  members: ['group:developers@example.com'],
  condition: {
    expression: 'request.time < timestamp("2024-12-31T23:59:59Z")',
    title: 'Expires at end of 2024',
    description: 'Access expires on December 31, 2024'
  }
};
```

### Expr

Conditional expression for fine-grained IAM access control.

```typescript
interface Expr {
  expression: string;
  title?: string;
  description?: string;
  location?: string;
}
```

**Properties:**

- `expression: string` - CEL (Common Expression Language) expression that evaluates to a boolean
- `title?: string` - Short human-readable title for the condition
- `description?: string` - Longer description of the condition's purpose
- `location?: string` - Optional source location information

**Common Expression Patterns:**

```typescript
// Time-based conditions
{
  expression: 'request.time < timestamp("2024-12-31T23:59:59Z")',
  title: 'Expires end of 2024'
}

// Resource-based conditions
{
  expression: 'resource.name.startsWith("projects/my-project/topics/prod-")',
  title: 'Only production topics'
}

// Attribute-based conditions
{
  expression: 'request.auth.claims.email_verified == true',
  title: 'Verified emails only'
}

// Combined conditions
{
  expression: 'request.time > timestamp("2024-01-01T00:00:00Z") && request.time < timestamp("2024-12-31T23:59:59Z")',
  title: 'Valid during 2024',
  description: 'Access only available during calendar year 2024'
}
```

**Full Policy Example with Conditions:**

```typescript
const policy: Policy = {
  version: 3, // Version 3 required for conditions
  bindings: [
    {
      role: 'roles/pubsub.publisher',
      members: ['serviceAccount:app@project.iam.gserviceaccount.com'],
      condition: {
        expression: 'resource.name.startsWith("projects/my-project/topics/prod-")',
        title: 'Production topics only',
        description: 'Service account can only publish to production topics'
      }
    },
    {
      role: 'roles/pubsub.subscriber',
      members: ['group:contractors@example.com'],
      condition: {
        expression: 'request.time < timestamp("2024-12-31T23:59:59Z")',
        title: 'Contractor access expires 2024',
        description: 'Temporary access for contractors until end of year'
      }
    }
  ]
};

await topic.iam.setPolicy(policy);
```

### IamPermissionsMap

Map of permission names to boolean values.

```typescript
interface IamPermissionsMap {
  [key: string]: boolean;
}
```

**Usage Example:**

```typescript
const [permissions] = await topic.iam.testPermissions([
  'pubsub.topics.publish',
  'pubsub.topics.delete'
]);

// permissions: IamPermissionsMap
console.log(permissions);
// {
//   'pubsub.topics.publish': true,
//   'pubsub.topics.delete': false
// }
```

---

## Callback and Response Types

### Response Types

Common response type patterns:

```typescript
// Single resource responses
type CreateTopicResponse = [Topic, TopicMetadata];
type CreateSubscriptionResponse = [Subscription, google.pubsub.v1.ISubscription];
type CreateSchemaResponse = [Schema, google.pubsub.v1.ISchema];
type CreateSnapshotResponse = [Snapshot, google.pubsub.v1.ISnapshot];

// List/paged responses
type GetTopicsResponse = [Topic[], {} | null, google.pubsub.v1.IListTopicsResponse];
type GetSubscriptionsResponse = [Subscription[], {} | null, google.pubsub.v1.IListSubscriptionsResponse];
type GetSnapshotsResponse = [Snapshot[], {} | null, google.pubsub.v1.IListSnapshotsResponse];

// Metadata responses
type GetTopicMetadataResponse = [TopicMetadata];
type GetSubscriptionMetadataResponse = [google.pubsub.v1.ISubscription];

// Empty responses
type EmptyResponse = [google.protobuf.IEmpty];
type ExistsResponse = [boolean];
type DetachedResponse = [boolean];
```

### Callback Types

Common callback function patterns:

```typescript
// Resource callbacks
type CreateTopicCallback = (
  err: ServiceError | null,
  topic?: Topic | null,
  response?: TopicMetadata | null
) => void;

type CreateSubscriptionCallback = (
  err: ServiceError | null,
  subscription?: Subscription | null,
  response?: google.pubsub.v1.ISubscription | null
) => void;

// List callbacks
type GetTopicsCallback = (
  err: ServiceError | null,
  topics?: Topic[] | null,
  nextQuery?: {} | null,
  response?: google.pubsub.v1.IListTopicsResponse | null
) => void;

// Simple callbacks
type EmptyCallback = (err?: Error) => void;
type ExistsCallback = (err: ServiceError | null, exists?: boolean | null) => void;
type PublishCallback = (err: ServiceError | null, messageId?: string | null) => void;

// IAM callbacks
type GetPolicyCallback = (
  err: ServiceError | null,
  policy?: Policy | null
) => void;

type SetPolicyCallback = (
  err: ServiceError | null,
  policy?: Policy | null
) => void;

type TestIamPermissionsCallback = (
  err: ServiceError | null,
  permissions?: IamPermissionsMap | null,
  response?: google.iam.v1.ITestIamPermissionsResponse | null
) => void;

// Subscription callbacks
type DetachSubscriptionCallback = (
  err: ServiceError | null,
  response?: google.pubsub.v1.IDetachSubscriptionResponse | null
) => void;

// Schema callbacks
type GetSchemaCallback = (
  err: ServiceError | null,
  schema?: Schema | null,
  response?: google.pubsub.v1.ISchema | null
) => void;

// Snapshot callbacks
type CreateSnapshotCallback = (
  err: ServiceError | null,
  snapshot?: Snapshot | null,
  response?: google.pubsub.v1.ISnapshot | null
) => void;

type SeekCallback = (
  err: ServiceError | null,
  response?: google.pubsub.v1.ISeekResponse | null
) => void;
```

### Generic Callback Types

```typescript
// Normal callback (single result)
interface NormalCallback<TResponse> {
  (err: gax.grpc.ServiceError | null, res?: TResponse | null): void;
}

// Paged callback (list results)
interface PagedCallback<Item, Response> {
  (
    err: gax.grpc.ServiceError | null,
    results?: Item[] | null,
    nextQuery?: {} | null,
    response?: Response | null
  ): void;
}

// Resource callback
interface ResourceCallback<Resource, Response> {
  (
    err: gax.grpc.ServiceError | null,
    resource?: Resource | null,
    response?: Response | null
  ): void;
}
```

**Usage Examples:**

```typescript
// Using callbacks
pubsub.createTopic('my-topic', (err, topic, response) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('Created topic:', topic.name);
});

// Using promises
const [topic] = await pubsub.createTopic('my-topic');

// Using async/await with callbacks (via promisify)
import { promisify } from 'util';
const createTopicAsync = promisify(pubsub.createTopic.bind(pubsub));
const [topic] = await createTopicAsync('my-topic');
```

---

## Enum Types

### SchemaTypes

```typescript
const SchemaTypes = {
  ProtocolBuffer: 'PROTOCOL_BUFFER',
  Avro: 'AVRO'
} as const;
```

**Usage:**

```typescript
import { SchemaTypes } from '@google-cloud/pubsub';

await pubsub.createSchema('my-schema', SchemaTypes.Avro, definition);
```

### SchemaViews

```typescript
const SchemaViews = {
  Basic: 'BASIC',
  Full: 'FULL'
} as const;
```

**Usage:**

```typescript
import { SchemaViews } from '@google-cloud/pubsub';

const schema = await pubsub.schema('my-schema').get(SchemaViews.Full);
```

### Encodings

```typescript
const Encodings = {
  Json: 'JSON',
  Binary: 'BINARY'
} as const;
```

**Usage:**

```typescript
import { Encodings } from '@google-cloud/pubsub';

const topicMetadata = {
  schemaSettings: {
    schema: 'projects/my-project/schemas/my-schema',
    encoding: Encodings.Json
  }
};
```

### AckResponses

```typescript
const AckResponses = {
  PermissionDenied: 'PERMISSION_DENIED',
  FailedPrecondition: 'FAILED_PRECONDITION',
  Success: 'SUCCESS',
  Invalid: 'INVALID',
  Other: 'OTHER'
} as const;

type AckResponse = ValueOf<typeof AckResponses>;
```

**Usage:**

```typescript
import { AckResponses } from '@google-cloud/pubsub';

subscription.on('message', async (message) => {
  const response = await message.ackWithResponse();
  if (response === AckResponses.Success) {
    console.log('Acked successfully');
  }
});
```

### SubscriberCloseBehaviors

```typescript
const SubscriberCloseBehaviors = {
  NackImmediately: 'NACK',
  WaitForProcessing: 'WAIT'
} as const;

type SubscriberCloseBehavior = ValueOf<typeof SubscriberCloseBehaviors>;
```

**Usage:**

```typescript
import { SubscriberCloseBehaviors } from '@google-cloud/pubsub';

const closeOptions = {
  behavior: SubscriberCloseBehaviors.WaitForProcessing,
  timeout: 30
};

await subscription.close();
```

### SubscriptionCloseBehaviors

```typescript
const SubscriptionCloseBehaviors = {
  NackImmediately: 'NACK',
  WaitForProcessing: 'WAIT'
} as const;
```

---

## Complete Usage Example

Here's a comprehensive example using many of the types documented above:

```typescript
import {
  PubSub,
  ClientConfig,
  PublishOptions,
  SubscriberOptions,
  Message,
  TopicMetadata,
  CreateSubscriptionOptions,
  SchemaTypes,
  Encodings,
  MessageOptions,
  AckResponses
} from '@google-cloud/pubsub';

// Client configuration
const config: ClientConfig = {
  projectId: 'my-project',
  keyFilename: './keyfile.json',
  enableOpenTelemetryTracing: true
};

const pubsub = new PubSub(config);

// Create schema
async function createSchema() {
  const definition = JSON.stringify({
    type: 'record',
    name: 'User',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' }
    ]
  });

  await pubsub.createSchema('user-schema', SchemaTypes.Avro, definition);
}

// Create topic with schema
async function createTopic() {
  const metadata: TopicMetadata = {
    labels: { env: 'production' },
    schemaSettings: {
      schema: 'projects/my-project/schemas/user-schema',
      encoding: Encodings.Json
    }
  };

  const [topic] = await pubsub.createTopic('users', metadata);
  return topic;
}

// Publish messages
async function publishMessages(topic) {
  const publishOptions: PublishOptions = {
    batching: {
      maxMessages: 100,
      maxMilliseconds: 10
    },
    messageOrdering: true
  };

  topic.setPublishOptions(publishOptions);

  const message: MessageOptions = {
    json: { id: '123', name: 'Alice' },
    attributes: { source: 'api' },
    orderingKey: 'user-123'
  };

  const messageId = await topic.publishMessage(message);
  console.log('Published:', messageId);
}

// Create subscription
async function createSubscription(topic) {
  const options: CreateSubscriptionOptions = {
    ackDeadlineSeconds: 60,
    enableExactlyOnceDelivery: true,
    flowControl: {
      maxMessages: 100,
      maxBytes: 10 * 1024 * 1024
    },
    deadLetterPolicy: {
      deadLetterTopic: 'projects/my-project/topics/dead-letter',
      maxDeliveryAttempts: 5
    }
  };

  const [subscription] = await topic.createSubscription('user-sub', options);
  return subscription;
}

// Subscribe to messages
function subscribeToMessages(subscription) {
  const subscriberOptions: SubscriberOptions = {
    flowControl: {
      maxMessages: 50
    },
    minAckDeadline: 10,
    maxAckDeadline: 600
  };

  subscription.setOptions(subscriberOptions);

  subscription.on('message', async (message: Message) => {
    console.log('Received:', message.data.toString());
    console.log('Attributes:', message.attributes);
    console.log('Delivery attempt:', message.deliveryAttempt);

    try {
      // Process message
      await processMessage(message);

      // Acknowledge with response for exactly-once
      const response = await message.ackWithResponse();
      if (response !== AckResponses.Success) {
        console.warn('Ack response:', response);
      }
    } catch (error) {
      console.error('Processing failed:', error);
      await message.nackWithResponse();
    }
  });

  subscription.on('error', error => {
    console.error('Subscription error:', error);
  });
}

// Run complete example
async function main() {
  await createSchema();
  const topic = await createTopic();
  await publishMessages(topic);
  const subscription = await createSubscription(topic);
  subscribeToMessages(subscription);
}

main().catch(console.error);
```

---

## Additional Notes

### Working with Protobuf Types

Many types extend or use protobuf generated types from `google.pubsub.v1`. These provide the underlying structure for API requests and responses.

### Duration Values

Duration can be specified as:
- A number (seconds): `60`
- A Duration object: `{ seconds: 60, nanos: 0 }`

### Callbacks vs Promises

All async methods support both callback and promise-based interfaces:

```typescript
// Callback style
topic.create((err, topic, response) => { /* ... */ });

// Promise style
const [topic, response] = await topic.create();
```

### Event Emitters

`Subscription` extends `EventEmitter` and supports these events:
- `'message'` - New message received
- `'error'` - Error occurred
- `'close'` - Subscription closed
- `'debug'` - Debug message

```typescript
subscription.on('message', (message: Message) => { /* ... */ });
subscription.on('error', (error: StatusError) => { /* ... */ });
subscription.on('close', () => { /* ... */ });
```

---

## References

- [Google Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [API Reference](https://googleapis.dev/nodejs/pubsub/latest/)
- [GitHub Repository](https://github.com/googleapis/nodejs-pubsub)
