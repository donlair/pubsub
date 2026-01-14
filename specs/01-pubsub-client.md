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
}
```

### Methods

#### Topic Management

```typescript
topic(name: string): Topic
createTopic(name: string, options?: CreateTopicOptions): Promise<[Topic, any]>
getTopic(name: string): Promise<[Topic, any]>
getTopics(options?: GetTopicsOptions): Promise<[Topic[], any, any]>
```

#### Subscription Management

```typescript
subscription(name: string, options?: SubscriptionOptions): Subscription
createSubscription(topic: string | Topic, name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, any]>
getSubscription(name: string): Promise<[Subscription, any]>
getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], any, any]>
```

#### Schema Management

```typescript
createSchema(schemaId: string, type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, any]>
schema(id: string): Schema
```

### Properties

```typescript
projectId: string;
isEmulator: boolean;
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
