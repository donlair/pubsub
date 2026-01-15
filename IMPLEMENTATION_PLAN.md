# Implementation Plan

## Current Status Overview

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| 1 | Type definitions | ~95% complete | Minor gaps to address |
| 2 | Internal infrastructure | Not started | MessageQueue singleton |
| 3 | Message class | Not started | Received message with ack/nack |
| 4 | Publisher components | Not started | Batching and flow control |
| 5 | Subscriber components | Not started | MessageStream, flow control |
| 6 | Topic class | Not started | Publishing interface |
| 7 | Subscription class | Not started | EventEmitter for messages |
| 8 | PubSub client | Not started | Main entry point |
| 9 | Integration tests | Not started | End-to-end testing |
| 10 | Advanced features | Not started | Ordering, schemas |

---

## Priority 1: Complete Phase 1 Type Definitions

### Status: ~95% Complete

The following type definition gaps need to be addressed before moving to implementation phases.

### 1.1 CRITICAL: AckResponse enum uses strings instead of gRPC codes

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/message.ts`

**Current (WRONG):**
```typescript
export const AckResponses = {
  Success: 'SUCCESS',
  PermissionDenied: 'PERMISSION_DENIED',
  FailedPrecondition: 'FAILED_PRECONDITION',
  Invalid: 'INVALID',
  Other: 'OTHER'
} as const;
```

**Required (per spec 04-message.md):**
```typescript
export const AckResponses = {
  Success: 0,              // gRPC OK
  Invalid: 3,              // gRPC INVALID_ARGUMENT
  PermissionDenied: 7,     // gRPC PERMISSION_DENIED
  FailedPrecondition: 9,   // gRPC FAILED_PRECONDITION
  Other: 13                // gRPC INTERNAL
} as const;
```

### 1.2 Missing PageOptions interface

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/common.ts` (add)

**Required (per spec 01-pubsub-client.md):**
```typescript
export interface PageOptions {
  gaxOpts?: CallOptions;
  autoPaginate?: boolean;
  maxResults?: number;
  pageToken?: string;
  pageSize?: number;
}
```

### 1.3 Missing SchemaDefinition interface

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/schema.ts` (add)

**Required (per spec 01-pubsub-client.md):**
```typescript
export interface SchemaDefinition {
  type: SchemaType;
  definition: string;
}
```

### 1.4 Missing FlowControlledPublisher type

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/publisher.ts` (add)

**Required (per spec 02-topic.md - flowControlled() method):**
```typescript
export interface FlowControlledPublisher {
  publish(data: Buffer, attributes?: Attributes): Promise<string>;
  publishMessage(message: PubSubMessage): Promise<string>;
}
```

### 1.5 Missing PullOptions type

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/subscription.ts` (add)

**Required (per spec 03-subscription.md - pull() method):**
```typescript
export interface PullOptions {
  maxMessages?: number;
  returnImmediately?: boolean;
  gaxOpts?: CallOptions;
}
```

### 1.6 SubscriberFlowControlOptions missing maxExtension property

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/subscriber.ts`

**Add to SubscriberFlowControlOptions:**
```typescript
export interface SubscriberFlowControlOptions {
  maxMessages?: number;
  maxBytes?: number;
  allowExcessMessages?: boolean;
  /** Maximum time to extend ack deadline in seconds. @default 3600 */
  maxExtension?: number;  // ADD THIS
}
```

### 1.7 Naming inconsistency: PubsubMessage vs PubSubMessage

**Decision:** Keep `PubsubMessage` as-is (matches Google's actual type naming)

### 1.8 Update type exports

**File:** `/Users/donlair/Projects/libraries/pubsub/src/types/index.ts`

Add exports for new types:
- PageOptions
- SchemaDefinition
- FlowControlledPublisher
- PullOptions

---

## Priority 2: Phase 2 - Internal Infrastructure

### Core Component: MessageQueue Singleton

**Specification:** `specs/07-message-queue.md`

**Acceptance Criteria:** AC-001 to AC-013 (13 criteria)

### Files to Create

#### 2.1 `/Users/donlair/Projects/libraries/pubsub/src/internal/message-queue.ts`

The central message broker (singleton pattern).

**Key Methods:**
```typescript
class MessageQueue {
  private static instance: MessageQueue;
  static getInstance(): MessageQueue;

  // Topic management
  registerTopic(topicName: string, metadata?: TopicMetadata): void;
  unregisterTopic(topicName: string): void;
  topicExists(topicName: string): boolean;
  getTopic(topicName: string): TopicMetadata | undefined;
  getAllTopics(): TopicMetadata[];

  // Subscription management
  registerSubscription(name: string, topic: string, options?: SubscriptionOptions): void;
  unregisterSubscription(subscriptionName: string): void;
  subscriptionExists(subscriptionName: string): boolean;
  getSubscription(subscriptionName: string): SubscriptionMetadata | undefined;
  getSubscriptionsForTopic(topicName: string): SubscriptionMetadata[];
  getAllSubscriptions(): SubscriptionMetadata[];

  // Message operations
  publish(topicName: string, messages: InternalMessage[]): string[];
  pull(subscriptionName: string, maxMessages: number): InternalMessage[];
  ack(ackId: string): void;
  nack(ackId: string): void;
  modifyAckDeadline(ackId: string, seconds: number): void;
}
```

**Implementation Details:**
- Use `Map<string, TopicMetadata>` for topic registry
- Use `Map<string, SubscriptionMetadata>` for subscription registry
- Use `Map<string, Queue<InternalMessage>>` for subscription message queues
- Use `Map<string, MessageLease>` for in-flight message tracking
- Use `setTimeout` for ack deadline timers
- Generate unique message IDs with UUID or crypto.randomUUID()
- Generate unique ackIds per delivery attempt

**Key Behaviors:**
- BR-001: Singleton instance
- BR-002/003: Topic/subscription registration
- BR-004/005/006/007: Message publish/pull/ack/nack
- BR-008/009: Ack deadline expiry and modification
- BR-010: Message ordering per orderingKey
- BR-013/014: Flow control enforcement

#### 2.2 `/Users/donlair/Projects/libraries/pubsub/src/internal/types.ts`

Internal types not exposed in public API.

```typescript
export interface InternalMessage {
  id: string;
  data: Buffer;
  attributes: Attributes;
  publishTime: PreciseDate;
  orderingKey?: string;
  deliveryAttempt: number;
  length: number;
}

export interface MessageLease {
  message: InternalMessage;
  ackId: string;
  subscription: string;
  deadline: Date;
  deadlineExtensions: number;
}
```

#### 2.3 `/Users/donlair/Projects/libraries/pubsub/src/internal/index.ts`

Internal module exports.

```typescript
export { MessageQueue } from './message-queue';
export type { InternalMessage, MessageLease } from './types';
```

### Tests to Create

#### 2.4 `/Users/donlair/Projects/libraries/pubsub/tests/unit/message-queue.test.ts`

Test all 13 acceptance criteria from spec 07-message-queue.md.

---

## Priority 3: Phase 3 - Message Class

### Core Component: Message

**Specification:** `specs/04-message.md`

**Acceptance Criteria:** AC-001 to AC-015 (15 criteria)

### Files to Create

#### 3.1 `/Users/donlair/Projects/libraries/pubsub/src/message.ts`

Received message with ack/nack functionality.

**Key Properties:**
```typescript
class Message {
  readonly id: string;
  readonly ackId: string;
  readonly data: Buffer;
  readonly attributes: Attributes;
  readonly publishTime: PreciseDate;
  readonly received: number;
  readonly orderingKey?: string;
  readonly deliveryAttempt?: number;
  readonly length: number;
}
```

**Key Methods:**
```typescript
ack(): void;
nack(): void;
modifyAckDeadline(seconds: number): void;
modAck(deadline: number): void;  // Alias for modifyAckDeadline
ackWithResponse(): Promise<AckResponse>;
nackWithResponse(): Promise<AckResponse>;
modAckWithResponse(deadline: number): Promise<AckResponse>;
```

**Implementation Details:**
- Message instances are immutable
- Track ack state to prevent double-ack
- Ack/nack calls delegate to MessageQueue
- First operation (ack or nack) wins
- Validate ack deadline range (0-600 seconds)

#### 3.2 `/Users/donlair/Projects/libraries/pubsub/src/utils/precise-date.ts`

High-precision Date with nanosecond support.

```typescript
export class PreciseDate extends Date {
  private readonly _nanoseconds: number;

  getNanoseconds(): number;
  getMicroseconds(): number;
  getFullTimeString(): string;

  static fromTimestamp(timestamp: ITimestamp): PreciseDate;
}
```

### Tests to Create

#### 3.3 `/Users/donlair/Projects/libraries/pubsub/tests/unit/message.test.ts`

Test all 15 acceptance criteria from spec 04-message.md.

---

## Priority 4: Phase 4 - Publisher Components

### Core Components: Publisher, BatchPublisher, FlowControl

**Specification:** `specs/05-publisher.md`

**Acceptance Criteria:** AC-001 to AC-011 (11 criteria)

### Files to Create

#### 4.1 `/Users/donlair/Projects/libraries/pubsub/src/publisher/publisher.ts`

Main publisher class handling batching and flow control.

**Key Methods:**
```typescript
class Publisher {
  constructor(topic: Topic, options?: PublishOptions);

  publish(data: Buffer, attributes?: Attributes, orderingKey?: string): Promise<string>;
  publishMessage(message: PubSubMessage): Promise<string>;
  flush(): Promise<void>;
  setPublishOptions(options: PublishOptions): void;
  resumePublishing(orderingKey: string): void;
}
```

**Implementation Details:**
- Maintains batches per ordering key when messageOrdering enabled
- Triggers batch publish on maxMessages, maxMilliseconds, or maxBytes
- Uses Timer for time-based batching
- Tracks paused ordering keys on errors
- Delegates to MessageQueue for actual publishing

#### 4.2 `/Users/donlair/Projects/libraries/pubsub/src/publisher/batch.ts`

Batch accumulation and management.

```typescript
interface Batch {
  messages: PubSubMessage[];
  totalBytes: number;
  promises: Array<{ resolve: (id: string) => void; reject: (err: Error) => void }>;
  timer?: Timer;
}

class BatchManager {
  addMessage(message: PubSubMessage): Promise<string>;
  flush(): Promise<void>;
  private publishBatch(batch: Batch): Promise<void>;
}
```

#### 4.3 `/Users/donlair/Projects/libraries/pubsub/src/publisher/flow-control.ts`

Publisher flow control implementation.

```typescript
class PublisherFlowControl {
  constructor(options: PublisherFlowControlOptions);

  acquire(bytes: number): Promise<void>;
  release(bytes: number): void;

  private outstandingMessages: number;
  private outstandingBytes: number;
}
```

#### 4.4 `/Users/donlair/Projects/libraries/pubsub/src/publisher/index.ts`

Publisher module exports.

### Tests to Create

#### 4.5 `/Users/donlair/Projects/libraries/pubsub/tests/unit/publisher.test.ts`

Test all 11 acceptance criteria from spec 05-publisher.md.

---

## Priority 5: Phase 5 - Subscriber Components

### Core Components: MessageStream, LeaseManager, FlowControl

**Specification:** `specs/06-subscriber.md`

**Acceptance Criteria:** AC-001 to AC-010 (10 criteria)

### Files to Create

#### 5.1 `/Users/donlair/Projects/libraries/pubsub/src/subscriber/message-stream.ts`

Streaming pull implementation.

**Key Methods:**
```typescript
class MessageStream {
  constructor(subscription: Subscription, options: SubscriberOptions);

  start(): void;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  setOptions(options: SubscriberOptions): void;
}
```

**Implementation Details:**
- Continuous polling of MessageQueue
- Respects flow control limits
- Emits messages to subscription EventEmitter
- Handles message ordering per orderingKey
- Auto-extends ack deadlines via LeaseManager

#### 5.2 `/Users/donlair/Projects/libraries/pubsub/src/subscriber/lease-manager.ts`

Ack deadline management.

```typescript
class LeaseManager {
  constructor(options: { minAckDeadline: number; maxAckDeadline: number; maxExtensionTime: number });

  addLease(message: Message): void;
  removeLease(ackId: string): void;
  extendDeadline(ackId: string, seconds: number): void;

  private leases: Map<string, Lease>;
}
```

#### 5.3 `/Users/donlair/Projects/libraries/pubsub/src/subscriber/flow-control.ts`

Subscriber flow control.

```typescript
class SubscriberFlowControl {
  constructor(options: SubscriberFlowControlOptions);

  canAccept(messageBytes: number): boolean;
  addMessage(bytes: number): void;
  removeMessage(bytes: number): void;

  private inFlightMessages: number;
  private inFlightBytes: number;
}
```

#### 5.4 `/Users/donlair/Projects/libraries/pubsub/src/subscriber/index.ts`

Subscriber module exports.

### Tests to Create

#### 5.5 `/Users/donlair/Projects/libraries/pubsub/tests/unit/subscriber.test.ts`

Test all 10 acceptance criteria from spec 06-subscriber.md.

---

## Priority 6: Phase 6 - Topic Class

### Core Component: Topic

**Specification:** `specs/02-topic.md`

**Acceptance Criteria:** AC-001 to AC-010 (10 criteria)

### Files to Create

#### 6.1 `/Users/donlair/Projects/libraries/pubsub/src/topic.ts`

Topic class for publishing and management.

**Key Properties:**
```typescript
class Topic {
  readonly name: string;
  readonly pubsub: PubSub;
  readonly iam: IAM;
  readonly publisher: Publisher;
}
```

**Key Methods:**
```typescript
// Publishing
publish(data: Buffer, attributes?: Attributes): Promise<string>;
publishMessage(message: PubSubMessage): Promise<string>;
publishJSON(json: object, attributes?: Attributes): Promise<string>;
setPublishOptions(options: PublishOptions): void;
getPublishOptionDefaults(): PublishOptions;
flush(): Promise<void>;
flowControlled(): FlowControlledPublisher;
resumePublishing(orderingKey: string): void;

// Lifecycle
create(options?: CreateTopicOptions): Promise<[Topic, TopicMetadata]>;
delete(options?: CallOptions): Promise<[unknown]>;
exists(options?: CallOptions): Promise<[boolean]>;
get(options?: GetTopicOptions): Promise<[Topic, TopicMetadata]>;
getMetadata(options?: CallOptions): Promise<[TopicMetadata]>;
setMetadata(metadata: TopicMetadata, options?: CallOptions): Promise<[TopicMetadata]>;

// Subscriptions
createSubscription(name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]>;
subscription(name: string, options?: SubscriptionOptions): Subscription;
getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], unknown, unknown]>;
```

**Implementation Details:**
- Lazily creates Publisher on first publish
- Format resource names as `projects/{projectId}/topics/{topicName}`
- Validates message data is Buffer
- Validates attributes constraints

### Tests to Create

#### 6.2 `/Users/donlair/Projects/libraries/pubsub/tests/unit/topic.test.ts`

Test all 10 acceptance criteria from spec 02-topic.md.

---

## Priority 7: Phase 7 - Subscription Class

### Core Component: Subscription (extends EventEmitter)

**Specification:** `specs/03-subscription.md`

**Acceptance Criteria:** AC-001 to AC-009 (9 criteria)

### Files to Create

#### 7.1 `/Users/donlair/Projects/libraries/pubsub/src/subscription.ts`

Subscription class for message consumption.

**Key Properties:**
```typescript
class Subscription extends EventEmitter {
  readonly name: string;
  topic?: Topic | string;
  metadata?: SubscriptionMetadata;
  isOpen: boolean;
  detached: boolean;
}
```

**Type-Safe Events:**
```typescript
on(event: 'message', listener: (message: Message) => void): this;
on(event: 'error', listener: (error: Error) => void): this;
on(event: 'close', listener: () => void): this;
on(event: 'debug', listener: (msg: string) => void): this;
```

**Key Methods:**
```typescript
// Lifecycle
create(options?: CreateSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]>;
delete(gaxOptions?: CallOptions): Promise<[unknown]>;
exists(options?: CallOptions): Promise<[boolean]>;
get(options?: GetSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]>;
getMetadata(options?: CallOptions): Promise<[SubscriptionMetadata, unknown]>;
setMetadata(metadata: SubscriptionMetadata, options?: CallOptions): Promise<[SubscriptionMetadata, unknown]>;

// Message reception
open(): void;
close(): Promise<void>;
setOptions(options: SubscriptionOptions): void;

// Advanced
seek(snapshot: string | Snapshot | Date, options?: CallOptions): Promise<[unknown]>;
createSnapshot(name: string): Promise<[Snapshot, SnapshotMetadata]>;
modifyPushConfig(config: PushConfig, options?: CallOptions): Promise<[unknown]>;
snapshot(name: string): Snapshot;
pull(options?: PullOptions): Promise<[Message[], unknown]>;
```

**Implementation Details:**
- Uses MessageStream internally for continuous pull
- Manages flow control state
- Emits errors (never throws in EventEmitter methods)
- Handles graceful shutdown on close()

### Tests to Create

#### 7.2 `/Users/donlair/Projects/libraries/pubsub/tests/unit/subscription.test.ts`

Test all 9 acceptance criteria from spec 03-subscription.md.

---

## Priority 8: Phase 8 - PubSub Client

### Core Component: PubSub

**Specification:** `specs/01-pubsub-client.md`

**Acceptance Criteria:** AC-001 to AC-013 (13 criteria)

### Files to Create

#### 8.1 `/Users/donlair/Projects/libraries/pubsub/src/pubsub.ts`

Main PubSub client class.

**Key Properties:**
```typescript
class PubSub {
  readonly projectId: string;
  readonly isEmulator: boolean;
  readonly isIdResolved: boolean;
  readonly v1: { PublisherClient: unknown; SubscriberClient: unknown };
}
```

**Key Methods:**
```typescript
// Topic management
topic(name: string): Topic;
createTopic(name: string, options?: CreateTopicOptions): Promise<[Topic, TopicMetadata]>;
getTopic(name: string): Promise<[Topic, TopicMetadata]>;
getTopics(options?: GetTopicsOptions): Promise<[Topic[], unknown, unknown]>;
getTopicsStream(options?: PageOptions): NodeJS.ReadableStream;

// Subscription management
subscription(name: string, options?: SubscriptionOptions): Subscription;
createSubscription(topic: string | Topic, name: string, options?: CreateSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]>;
getSubscription(name: string): Promise<[Subscription, SubscriptionMetadata]>;
getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], unknown, unknown]>;
getSubscriptionsStream(options?: GetSubscriptionsOptions): NodeJS.ReadableStream;

// Schema management
createSchema(schemaId: string, type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, ISchema]>;
schema(id: string): Schema;
listSchemas(view?: 'BASIC' | 'FULL', options?: PageOptions): AsyncIterable<Schema>;
validateSchema(schema: SchemaDefinition, options?: CallOptions): Promise<void>;
getSchemaClient(): Promise<unknown>;

// Snapshot management
snapshot(name: string): Snapshot;
getSnapshotsStream(options?: PageOptions): NodeJS.ReadableStream;

// Client methods
getClientConfig(): Promise<unknown>;
getProjectId(): Promise<string>;
close(): Promise<void>;
```

**Implementation Details:**
- Cache Topic and Subscription instances in Maps
- Default projectId to 'local-project'
- Detect emulator from PUBSUB_EMULATOR_HOST env var
- Format resource names correctly
- Tuple returns for admin operations

#### 8.2 `/Users/donlair/Projects/libraries/pubsub/src/index.ts`

Main entry point exporting all public APIs.

```typescript
// Classes
export { PubSub } from './pubsub';
export { Topic } from './topic';
export { Subscription } from './subscription';
export { Message } from './message';
export { Schema } from './schema';
export { Snapshot } from './snapshot';

// Types
export * from './types';

// Utilities
export { PreciseDate } from './utils/precise-date';
```

### Tests to Create

#### 8.3 `/Users/donlair/Projects/libraries/pubsub/tests/unit/pubsub.test.ts`

Test all 13 acceptance criteria from spec 01-pubsub-client.md.

---

## Priority 9: Phase 9 - Integration Tests

### Test Structure

```
tests/
  unit/                          # Single component tests
    message-queue.test.ts        # Phase 2
    message.test.ts              # Phase 3
    publisher.test.ts            # Phase 4
    subscriber.test.ts           # Phase 5
    topic.test.ts                # Phase 6
    subscription.test.ts         # Phase 7
    pubsub.test.ts               # Phase 8

  integration/                   # Multiple component tests
    publish-subscribe.test.ts    # End-to-end pub/sub flow
    flow-control.test.ts         # Publisher and subscriber flow control
    ordering.test.ts             # Message ordering across components
    dead-letter.test.ts          # Dead letter policy
    schema-validation.test.ts    # Schema validation integration

  compatibility/                 # Google API compatibility tests
    pubsub-compat.test.ts        # PubSub client compatibility
    topic-compat.test.ts         # Topic API compatibility
    subscription-compat.test.ts  # Subscription API compatibility
    message-compat.test.ts       # Message API compatibility
```

### Integration Test Scenarios

#### 9.1 Publish-Subscribe Flow
- Create topic, create subscription, publish message, receive message, ack
- Multiple subscriptions receive copies
- Message with attributes

#### 9.2 Flow Control
- Publisher flow control blocks on max outstanding
- Subscriber flow control limits in-flight messages
- Flow control releases on ack

#### 9.3 Ack Deadline
- Message redelivered after deadline
- Deadline extension prevents redelivery
- modifyAckDeadline works correctly

#### 9.4 Dead Letter Queue
- Message moved to DLQ after max attempts
- Delivery attempt counter increments

---

## Priority 10: Phase 10 - Advanced Features

### 10.1 Message Ordering

**Specification:** `specs/09-ordering.md`

**Acceptance Criteria:** AC-001 to AC-012 (12 criteria)

**Key Components to Enhance:**
- Publisher: Separate batches per ordering key
- MessageQueue: Separate queues per ordering key, sequential delivery
- MessageStream: Deliver in order per key, wait for ack
- Topic: resumePublishing() for error recovery

### 10.2 Schema Validation

**Specification:** `specs/08-schema.md`

**Acceptance Criteria:** AC-001 to AC-011 (11 criteria)

**File to Create:** `/Users/donlair/Projects/libraries/pubsub/src/schema.ts`

**Key Methods:**
```typescript
class Schema {
  readonly id: string;
  readonly name: string;
  type?: SchemaType;
  definition?: string;

  create(type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, ISchema]>;
  delete(): Promise<[unknown]>;
  exists(): Promise<[boolean]>;
  get(view?: 'BASIC' | 'FULL', options?: CallOptions): Promise<[Schema, ISchema]>;
  validateMessage(message: string | Buffer, encoding: Encoding): Promise<void>;
  getName(): Promise<string>;
}
```

**Implementation Notes:**
- Use `ajv` for JSON Schema validation
- AVRO and Protocol Buffer throw UnimplementedError
- JSON schema is local development extension only

### 10.3 Snapshot Support

**File to Create:** `/Users/donlair/Projects/libraries/pubsub/src/snapshot.ts`

```typescript
class Snapshot {
  readonly name: string;

  create(): Promise<[Snapshot, SnapshotMetadata]>;
  delete(): Promise<[unknown]>;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[SnapshotMetadata]>;
  seek(): Promise<[unknown]>;
}
```

### 10.4 IAM Support

**File to Create:** `/Users/donlair/Projects/libraries/pubsub/src/iam.ts`

```typescript
class IAM {
  constructor(pubsub: PubSub, resource: string);

  getPolicy(): Promise<[Policy, unknown]>;
  setPolicy(policy: Policy): Promise<[Policy, unknown]>;
  testPermissions(permissions: string[]): Promise<[string[], unknown]>;
}
```

---

## Acceptance Criteria Tracking

### Summary by Specification

| Spec | Component | Total AC | Phase | Status |
|------|-----------|----------|-------|--------|
| 01 | PubSub Client | 13 | 8 | Pending |
| 02 | Topic | 10 | 6 | Pending |
| 03 | Subscription | 9 | 7 | Pending |
| 04 | Message | 15 | 3 | Pending |
| 05 | Publisher | 11 | 4 | Pending |
| 06 | Subscriber | 10 | 5 | Pending |
| 07 | MessageQueue | 13 | 2 | Pending |
| 08 | Schema | 11 | 10 | Pending |
| 09 | Ordering | 12 | 10 | Pending |
| **Total** | | **104** | | **0% Complete** |

### Detailed AC Status

#### Spec 01: PubSub Client (13 AC)
- [ ] AC-001: Basic Instantiation
- [ ] AC-002: Default Project ID
- [ ] AC-003: Topic Factory Returns Same Instance
- [ ] AC-004: Create and Get Topic
- [ ] AC-005: Create Topic Twice Throws Error
- [ ] AC-006: Create Subscription
- [ ] AC-007: Subscription Factory Returns Same Instance
- [ ] AC-008: Get Topics Stream
- [ ] AC-009: Get Subscriptions Stream
- [ ] AC-010: Create and Validate Schema
- [ ] AC-011: List Schemas
- [ ] AC-012: Get Project ID
- [ ] AC-013: Close Client

#### Spec 02: Topic (10 AC)
- [ ] AC-001: Create and Publish
- [ ] AC-002: Publish with Attributes
- [ ] AC-003: Publish JSON
- [ ] AC-004: Batching Accumulates Messages
- [ ] AC-005: Flush Publishes Immediately
- [ ] AC-006: Message Ordering
- [ ] AC-007: Topic Exists Check
- [ ] AC-008: Get Topic Subscriptions
- [ ] AC-009: Publish to Non-Existent Topic Throws
- [ ] AC-010: Deprecated publish() Method

#### Spec 03: Subscription (9 AC)
- [ ] AC-001: Create and Receive Messages
- [ ] AC-002: Flow Control Max Messages
- [ ] AC-003: Ack Deadline Redelivery
- [ ] AC-004: Message Ordering
- [ ] AC-005: Error Event Emission
- [ ] AC-006: Close Stops Message Flow
- [ ] AC-007: Set Options After Creation
- [ ] AC-008: Subscription Exists Check
- [ ] AC-009: Multiple Subscriptions Same Topic

#### Spec 04: Message (15 AC)
- [ ] AC-001: Basic Message Properties
- [ ] AC-002: Ack Removes Message
- [ ] AC-003: Nack Causes Immediate Redelivery
- [ ] AC-004: Modify Ack Deadline
- [ ] AC-005: Message Length Property
- [ ] AC-006: Empty Data Message
- [ ] AC-007: Ordering Key Present
- [ ] AC-008: Multiple Acks Are Idempotent
- [ ] AC-009: Ack After Nack Has No Effect
- [ ] AC-010: Delivery Attempt Counter
- [ ] AC-011: Ack With Response Returns Success
- [ ] AC-012: Nack With Response Returns Success
- [ ] AC-013: Ack With Response Handles Invalid Ack ID
- [ ] AC-014: Response Methods Work Without Exactly-Once
- [ ] AC-015: Attribute Validation

#### Spec 05: Publisher (11 AC)
- [ ] AC-001: Default Batching Behavior
- [ ] AC-002: Time-Based Batch Trigger
- [ ] AC-003: Count-Based Batch Trigger
- [ ] AC-004: Size-Based Batch Trigger
- [ ] AC-005: Flush Publishes Immediately
- [ ] AC-006: Message Ordering Separate Batches
- [ ] AC-007: Ordering Key Error Pause and Resume
- [ ] AC-008: Flow Control Max Messages
- [ ] AC-009: Disable Batching
- [ ] AC-010: Unique Message IDs
- [ ] AC-011: Empty Message Batch

#### Spec 06: Subscriber (10 AC)
- [ ] AC-001: Basic Streaming Pull
- [ ] AC-002: Flow Control Max Messages
- [ ] AC-003: Flow Control Max Bytes
- [ ] AC-004: Ack Deadline Redelivery
- [ ] AC-005: Message Ordering Sequential Delivery
- [ ] AC-006: Pause and Resume
- [ ] AC-007: Stop Waits for In-Flight
- [ ] AC-008: Error Event on Failure
- [ ] AC-009: Multiple Concurrent Messages
- [ ] AC-010: Allow Excess Messages

#### Spec 07: MessageQueue (13 AC)
- [ ] AC-001: Singleton Pattern
- [ ] AC-002: Register and Check Topic
- [ ] AC-003: Publish and Pull Messages
- [ ] AC-004: Multiple Subscriptions Receive Copies
- [ ] AC-005: Ack Removes Message
- [ ] AC-006: Nack Redelivers Immediately
- [ ] AC-007: Ack Deadline Expiry Redelivers
- [ ] AC-008: Modify Ack Deadline
- [ ] AC-009: Message Ordering
- [ ] AC-010: Publish Without Subscriptions
- [ ] AC-011: Get Subscriptions for Topic
- [ ] AC-012: Unregister Topic Detaches Subscriptions
- [ ] AC-013: FIFO Message Ordering Without Ordering Key

#### Spec 08: Schema (11 AC)
- [ ] AC-001: Create AVRO Schema
- [ ] AC-002: AVRO Validation Throws Unimplemented
- [ ] AC-003: Protocol Buffer Validation Throws Unimplemented
- [ ] AC-004: Topic with Schema Validation
- [ ] AC-005: Schema Exists Check
- [ ] AC-006: Delete Schema
- [ ] AC-007: Get Schema Details
- [ ] AC-008: Invalid JSON Schema Definition
- [ ] AC-009: List Schemas
- [ ] AC-010: Validate Schema Definition
- [ ] AC-011: Get Schema Name

#### Spec 09: Ordering (12 AC)
- [ ] AC-001: Create Topic and Publish with Ordering Key
- [ ] AC-002: Messages with Same Key Delivered in Order
- [ ] AC-003: Sequential Processing per Key
- [ ] AC-004: Different Keys Concurrent
- [ ] AC-005: Ordering Preserved on Redelivery
- [ ] AC-006: No Ordering Key Not Blocked
- [ ] AC-007: Multiple Subscriptions Ordered Independently
- [ ] AC-008: Ordering Key Validation
- [ ] AC-009: Ordering Key Accepted Without Explicit Enable
- [ ] AC-010: Batching with Ordering Keys
- [ ] AC-011: Ordering Key Paused on Error
- [ ] AC-012: Resume Publishing After Error

---

## Implementation Order and Dependencies

```
Phase 1 (Types) ─────────────────────────────────────────────────────────┐
                                                                         │
Phase 2 (MessageQueue) ◄─────────────────────────────────────────────────┤
         │                                                               │
         ▼                                                               │
Phase 3 (Message) ◄──────────────────────────────────────────────────────┤
         │                                                               │
         ├─────────────────┬─────────────────────────────────────────────┤
         │                 │                                             │
         ▼                 ▼                                             │
Phase 4 (Publisher)   Phase 5 (Subscriber)                               │
         │                 │                                             │
         └────────┬────────┘                                             │
                  │                                                      │
                  ▼                                                      │
Phase 6 (Topic) ◄─────────────────────────────────────────────────────────┤
         │                                                               │
         ▼                                                               │
Phase 7 (Subscription) ◄─────────────────────────────────────────────────┤
         │                                                               │
         ▼                                                               │
Phase 8 (PubSub Client) ◄────────────────────────────────────────────────┘
         │
         ▼
Phase 9 (Integration Tests)
         │
         ▼
Phase 10 (Ordering, Schemas, Advanced)
```

---

## Key Technical Decisions

### Error Handling
- All errors use gRPC status codes (0-16)
- Use specific error classes: NotFoundError, AlreadyExistsError, InvalidArgumentError, etc.
- EventEmitters emit errors, never throw
- Promises throw/reject

### API Compatibility
- 100% compatibility with @google-cloud/pubsub v5.2.0+
- Tuple returns for admin operations: `[resource, metadata]`
- Three-tuple for list operations: `[items[], nextQuery, apiResponse]`
- Type-safe EventEmitter overloads

### Default Values
- Batching: maxMessages=100, maxMilliseconds=10, maxBytes=1MB
- Publisher flow control: maxOutstandingMessages=100, maxOutstandingBytes=1MB
- Subscriber flow control: maxMessages=1000, maxBytes=100MB
- Ack deadline: 10-600 seconds, default 10

### Resource Naming
- Topics: `projects/{projectId}/topics/{topicName}`
- Subscriptions: `projects/{projectId}/subscriptions/{subscriptionName}`
- Schemas: `projects/{projectId}/schemas/{schemaId}`

---

## Verification Commands

```bash
# TypeScript compilation
bun run tsc --noEmit

# Run all tests
bun test

# Run specific test file
bun test tests/unit/message-queue.test.ts

# Run compatibility tests
bun test tests/compatibility/

# Watch mode
bun test --watch
```

---

## Version History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-01-15 | 1.0 | Claude | Initial implementation plan |
