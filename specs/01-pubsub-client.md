# Specification: PubSub Client

## Purpose

The PubSub client is the main entry point for interacting with the Pub/Sub system. It provides factory methods for creating and accessing topics and subscriptions, and manages project-level configuration.

## API Surface

### Constructor

```typescript
class PubSub {
  constructor(options?: PubSubOptions)
}

interface PubSubOptions {
  projectId?: string;
  apiEndpoint?: string;
  keyFilename?: string;
  credentials?: object;
  email?: string;
  token?: string;
  port?: number;
  servicePath?: string;
  sslCreds?: any;
  clientConfig?: any;
  fallback?: boolean | 'rest' | 'proto';
  grpc?: any;
  gaxOpts?: GaxOptions;
}

interface PageOptions {
  gaxOpts?: CallOptions;
  autoPaginate?: boolean;
  maxResults?: number;
  pageToken?: string;
}

interface GetTopicsOptions extends PageOptions {}

interface GetSubscriptionsOptions extends PageOptions {
  topic?: string | Topic;
}

interface CreateTopicOptions {
  labels?: { [key: string]: string };
  messageStoragePolicy?: { allowedPersistenceRegions?: string[] };
  kmsKeyName?: string;
  schemaSettings?: SchemaSettings;
  messageRetentionDuration?: Duration;
  gaxOpts?: CallOptions;
}

interface CreateSubscriptionOptions {
  flowControl?: FlowControlOptions;
  ackDeadline?: number;
  pushConfig?: PushConfig;
  deadLetterPolicy?: DeadLetterPolicy;
  retryPolicy?: RetryPolicy;
  filter?: string;
  enableMessageOrdering?: boolean;
  enableExactlyOnceDelivery?: boolean;
  detached?: boolean;
  labels?: { [key: string]: string };
  expirationPolicy?: ExpirationPolicy;
  gaxOpts?: CallOptions;
}

interface CreateSchemaOptions {
  gaxOpts?: CallOptions;
}

interface SchemaSettings {
  schema?: string;
  encoding?: Encoding;
}

enum SchemaType {
  AVRO = 'AVRO',
  PROTOCOL_BUFFER = 'PROTOCOL_BUFFER'
}

enum Encoding {
  JSON = 'JSON',
  BINARY = 'BINARY'
}

// Supporting types
interface Duration {
  seconds?: number;
  nanos?: number;
}

interface FlowControlOptions {
  maxMessages?: number;
  maxBytes?: number;
  allowExcessMessages?: boolean;
}

interface PushConfig {
  pushEndpoint?: string;
  attributes?: { [key: string]: string };
}

interface DeadLetterPolicy {
  deadLetterTopic?: string;
  maxDeliveryAttempts?: number;
}

interface RetryPolicy {
  minimumBackoff?: Duration;
  maximumBackoff?: Duration;
}

interface ExpirationPolicy {
  ttl?: Duration;
}

interface CallOptions {
  timeout?: number;
  retry?: RetryOptions;
}

interface RetryOptions {
  retryCodes?: number[];
  backoffSettings?: BackoffSettings;
}

interface BackoffSettings {
  initialRetryDelayMillis?: number;
  retryDelayMultiplier?: number;
  maxRetryDelayMillis?: number;
}

interface GaxOptions {
  timeout?: number;
  retry?: RetryOptions;
}
```

### Methods

#### Topic Management

```typescript
topic(name: string): Topic
createTopic(name: string, options?: CreateTopicOptions): Promise<[Topic, any]>
getTopic(name: string): Promise<[Topic, any]>
getTopics(options?: GetTopicsOptions): Promise<[Topic[], any, any]>
getTopicsStream(options?: PageOptions): NodeJS.ReadableStream
```

#### Subscription Management

```typescript
subscription(name: string, options?: SubscriptionOptions): Subscription
createSubscription(topic: string | Topic, name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, any]>
getSubscription(name: string): Promise<[Subscription, any]>
getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], any, any]>
getSubscriptionsStream(options?: GetSubscriptionsOptions): NodeJS.ReadableStream
```

#### Schema Management

```typescript
createSchema(schemaId: string, type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, any]>
schema(id: string): Schema
listSchemas(view?: 'BASIC' | 'FULL', options?: PageOptions): AsyncIterable<Schema>
validateSchema(schema: { type: SchemaType; definition: string }, options?: any): Promise<void>
getSchemaClient(): Promise<SchemaServiceClient>
```

#### Snapshot Management

```typescript
snapshot(name: string): Snapshot
getSnapshotsStream(options?: PageOptions): NodeJS.ReadableStream
```

#### Client Methods

```typescript
getClientConfig(): Promise<any>
getProjectId(): Promise<string>
close(): Promise<void>
```

### Properties

```typescript
projectId: string;
isEmulator: boolean;
isIdResolved: boolean;
v1: {
  PublisherClient: any;
  SubscriberClient: any;
};
```

## Behavior Requirements

### BR-001: Constructor Initialization
**Given** a user creates a new PubSub instance
**When** options are provided
**Then** the instance should store projectId, apiEndpoint, and credentials
**And** default projectId to 'local-project' if not provided

### BR-002: Topic Factory Method
**Given** a PubSub instance exists
**When** `topic(name)` is called
**Then** return a Topic instance for that name
**And** subsequent calls with the same name return the same instance
**And** the topic should not be created in the backend yet

### BR-003: Create Topic
**Given** a PubSub instance exists
**When** `createTopic(name)` is called
**Then** create the topic in the message queue
**And** return a tuple `[Topic, metadata]`
**And** throw NotFoundError if topic already exists with `{code: 6}` (ALREADY_EXISTS)

### BR-004: Get Topics
**Given** multiple topics exist
**When** `getTopics()` is called
**Then** return array of all Topic instances
**And** return as tuple `[Topic[], nextQuery, apiResponse]`

### BR-005: Subscription Factory Method
**Given** a PubSub instance exists
**When** `subscription(name)` is called
**Then** return a Subscription instance for that name
**And** subsequent calls with same name return the same instance
**And** the subscription should not be created in backend yet

### BR-006: Create Subscription
**Given** a topic exists
**When** `createSubscription(topic, name, options)` is called
**Then** create the subscription attached to the topic
**And** return tuple `[Subscription, metadata]`
**And** throw NotFoundError if topic doesn't exist
**And** throw AlreadyExistsError if subscription name already exists

### BR-007: Get Subscriptions
**Given** multiple subscriptions exist
**When** `getSubscriptions()` is called
**Then** return array of all Subscription instances
**And** filter by topic if `options.topic` is provided

### BR-008: Get Topics Stream
**Given** a PubSub instance exists
**When** `getTopicsStream(options)` is called
**Then** return a Node.js ReadableStream that emits Topic instances
**And** stream automatically handles pagination
**And** stream ends when all topics are retrieved

### BR-009: Get Subscriptions Stream
**Given** a PubSub instance exists
**When** `getSubscriptionsStream(options)` is called
**Then** return a Node.js ReadableStream that emits Subscription instances
**And** filter by topic if `options.topic` is provided
**And** stream automatically handles pagination

### BR-010: Create Schema
**Given** a PubSub instance exists
**When** `createSchema(schemaId, type, definition, options)` is called
**Then** validate the schema definition based on type
**And** store schema for future message validation
**And** return tuple `[Schema, metadata]`
**And** throw AlreadyExistsError if schema already exists

### BR-011: Schema Factory Method
**Given** a PubSub instance exists
**When** `schema(id)` is called
**Then** return a Schema instance for that ID
**And** subsequent calls with same ID return same instance
**And** schema should not be created in backend yet

### BR-012: List Schemas
**Given** schemas exist
**When** `listSchemas(view, options)` is called
**Then** return AsyncIterable<Schema>
**And** respect view parameter ('BASIC' or 'FULL')
**And** 'BASIC' returns name and type only
**And** 'FULL' returns complete schema including definition

### BR-013: Validate Schema
**Given** a schema definition
**When** `validateSchema({ type, definition }, options)` is called
**Then** validate syntax and structure
**And** throw InvalidArgumentError if invalid
**And** return Promise<void> on success

### BR-014: Snapshot Factory Method
**Given** a PubSub instance exists
**When** `snapshot(name)` is called
**Then** return a Snapshot instance for that name
**And** subsequent calls return same instance

### BR-015: Get Snapshots Stream
**Given** snapshots exist
**When** `getSnapshotsStream(options)` is called
**Then** return ReadableStream of Snapshot instances
**And** stream automatically handles pagination

### BR-016: Get Client Config
**Given** a PubSub instance exists
**When** `getClientConfig()` is called
**Then** return configuration used by internal gRPC clients
**And** include service path, port, and other gRPC options

### BR-017: Get Project ID
**Given** a PubSub instance exists
**When** `getProjectId()` is called
**Then** return the resolved project ID
**And** resolve from options, credentials, or environment

### BR-018: Close Client
**Given** a PubSub instance exists with active connections
**When** `close()` is called
**Then** close all active subscriptions
**And** close internal gRPC clients
**And** cleanup resources
**And** return Promise<void> when complete

## Acceptance Criteria

### AC-001: Basic Instantiation
```typescript
const pubsub = new PubSub({ projectId: 'test-project' });
expect(pubsub.projectId).toBe('test-project');
```

### AC-002: Default Project ID
```typescript
const pubsub = new PubSub();
expect(pubsub.projectId).toBe('local-project');
```

### AC-003: Topic Factory Returns Same Instance
```typescript
const pubsub = new PubSub();
const topic1 = pubsub.topic('my-topic');
const topic2 = pubsub.topic('my-topic');
expect(topic1).toBe(topic2);
```

### AC-004: Create and Get Topic
```typescript
const pubsub = new PubSub();
const [topic, metadata] = await pubsub.createTopic('my-topic');
expect(topic.name).toBe('projects/local-project/topics/my-topic');

const [topics] = await pubsub.getTopics();
expect(topics).toHaveLength(1);
expect(topics[0].name).toBe('projects/local-project/topics/my-topic');
```

### AC-005: Create Topic Twice Throws Error
```typescript
const pubsub = new PubSub();
await pubsub.createTopic('my-topic');
await expect(pubsub.createTopic('my-topic')).rejects.toThrow();
```

### AC-006: Create Subscription
```typescript
const pubsub = new PubSub();
await pubsub.createTopic('my-topic');
const [sub] = await pubsub.createSubscription('my-topic', 'my-sub');
expect(sub.name).toBe('projects/local-project/subscriptions/my-sub');
```

### AC-007: Subscription Factory Returns Same Instance
```typescript
const pubsub = new PubSub();
const sub1 = pubsub.subscription('my-sub');
const sub2 = pubsub.subscription('my-sub');
expect(sub1).toBe(sub2);
```

### AC-008: Get Topics Stream

```typescript
const pubsub = new PubSub();
await pubsub.createTopic('topic-1');
await pubsub.createTopic('topic-2');
await pubsub.createTopic('topic-3');

const topics: Topic[] = [];

const stream = pubsub.getTopicsStream();
stream.on('data', (topic: Topic) => {
  topics.push(topic);
});

await new Promise((resolve, reject) => {
  stream.on('end', resolve);
  stream.on('error', reject);
});

expect(topics.length).toBeGreaterThan(0);
```

### AC-009: Get Subscriptions Stream

```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');
await topic.create();
await pubsub.createSubscription('my-topic', 'sub-1');
await pubsub.createSubscription('my-topic', 'sub-2');

const subscriptions: Subscription[] = [];

const stream = pubsub.getSubscriptionsStream();
stream.on('data', (sub: Subscription) => {
  subscriptions.push(sub);
});

await new Promise((resolve) => stream.on('end', resolve));

expect(subscriptions.length).toBeGreaterThan(0);
```

### AC-010: Create and Validate Schema

```typescript
const pubsub = new PubSub();

const avroDefinition = JSON.stringify({
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' }
  ]
});

// Validate before creating
await pubsub.validateSchema({
  type: SchemaType.AVRO,
  definition: avroDefinition
});

// Create schema
const [schema] = await pubsub.createSchema(
  'user-schema',
  SchemaType.AVRO,
  avroDefinition
);

expect(schema.id).toContain('user-schema');
```

### AC-011: List Schemas

```typescript
const pubsub = new PubSub();
await pubsub.createSchema('schema-1', SchemaType.AVRO, avroDefinition);
await pubsub.createSchema('schema-2', SchemaType.AVRO, avroDefinition2);

const schemas: Schema[] = [];

for await (const schema of pubsub.listSchemas('FULL')) {
  schemas.push(schema);
}

expect(schemas.length).toBeGreaterThan(0);
```

### AC-012: Get Project ID

```typescript
const pubsub = new PubSub({ projectId: 'my-project' });

const projectId = await pubsub.getProjectId();

expect(projectId).toBe('my-project');
```

### AC-013: Close Client

```typescript
const pubsub = new PubSub();
const subscription = pubsub.subscription('my-sub');
await subscription.create();
subscription.open();

// Close all resources
await pubsub.close();

// Subscriptions should be closed
expect(subscription.isOpen).toBe(false);
```

## Dependencies

- Topic class
- Subscription class
- Schema class
- MessageQueue (internal singleton)

## Error Handling

### Already Exists Error
```typescript
{
  code: 6, // ALREADY_EXISTS
  message: 'Topic already exists: projects/PROJECT/topics/TOPIC_NAME'
}
```

### Not Found Error
```typescript
{
  code: 5, // NOT_FOUND
  message: 'Topic not found: projects/PROJECT/topics/TOPIC_NAME'
}
```

## Implementation Notes

- Use Map to cache topic and subscription instances
- Format resource names as: `projects/{projectId}/topics/{topicName}`
- Format subscription names as: `projects/{projectId}/subscriptions/{subscriptionName}`
- The PubSub client does NOT create resources automatically - only factory methods do

## Examples

### Basic Usage
```typescript
import { PubSub } from './pubsub';

const pubsub = new PubSub({ projectId: 'my-project' });

// Get topic reference (doesn't create)
const topic = pubsub.topic('my-topic');

// Create topic
const [createdTopic] = await pubsub.createTopic('orders');

// Create subscription
const [subscription] = await pubsub.createSubscription(
  'orders',
  'order-processor'
);
```

### List Resources
```typescript
const pubsub = new PubSub();

// List all topics
const [topics] = await pubsub.getTopics();
console.log(`Found ${topics.length} topics`);

// List all subscriptions
const [subscriptions] = await pubsub.getSubscriptions();
console.log(`Found ${subscriptions.length} subscriptions`);
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
