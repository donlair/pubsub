# Implementation Plan

**Last Updated**: 2026-01-15 (Schema validation complete)
**Analysis Type**: Comprehensive code review with parallel agent analysis

## Executive Summary

This implementation plan reflects a comprehensive analysis of the codebase conducted using multiple parallel agents to compare actual implementation against specifications. The analysis reveals:

✅ **Core Functionality**: 100% complete (Phases 1-8)
- All 81 core acceptance criteria passing
- 181 unit tests passing, 0 failures
- Production-ready for basic pub/sub operations

⚠️ **Advanced Features**: Partially complete (Phase 10)
- Message ordering: 67% complete (8/12 AC), validation and error handling complete
- Schema validation: 100% complete (11/11 AC), JSON schema support

⚠️ **Testing Gaps**: Partial integration tests, no compatibility tests (Phase 9)
- Publish-subscribe integration tests complete (10 scenarios)
- Missing: ordering, flow control, schema validation integration tests
- Zero compatibility tests to verify API matches Google's

**Critical Gaps Identified**:
1. **Ordering key validation** - ✅ COMPLETE (AC-008) - Empty and oversized keys rejected
2. **Schema JSON type** - ✅ COMPLETE (AC-004, AC-008, AC-010) - JSON schema validation with ajv
3. **Schema registry integration** - ✅ COMPLETE (AC-005, AC-006, AC-007, AC-011) - Schema lifecycle operations working

**Priority Work Items**: 13 total (0 P0, 0 P1, 8 P2, 5 P3)

See "PRIORITIZED REMAINING WORK" section below for detailed implementation plan.

---

## Current Status Overview

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| 1 | Type definitions | 100% complete | All types implemented |
| 2 | Internal infrastructure | 100% complete | All 13 AC passing |
| 3 | Message class | 100% complete | All 15 AC passing |
| 4 | Publisher components | 100% complete | All 11 AC passing |
| 5 | Subscriber components | 100% complete | All 10 AC passing |
| 6 | Topic class | 100% complete | All 10 AC passing |
| 7 | Subscription class | 100% complete | All 9 AC passing |
| 8 | PubSub client | 100% complete | All 13 AC passing |
| 9 | Integration tests | 25% complete | Publish-subscribe flow complete |
| 10a | Message ordering | 67% complete | 8/12 AC done, validation and error handling |
| 10b | Schema validation | 100% complete | All 11 AC passing |

**Overall Progress**: 94/104 acceptance criteria passing (90% complete)

---

## Priority 1: Phase 2 - Internal Infrastructure ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- MessageQueue singleton with topic/subscription management
- Message publish/pull/ack/nack operations
- Ack deadline tracking with automatic redelivery
- Message ordering support per orderingKey
- All internal types and data structures

**Tests:** All 13 acceptance criteria from `specs/07-message-queue.md` passing

**Git tag:** v0.0.0

### Core Component: MessageQueue Singleton

**Specification:** `specs/07-message-queue.md`

**Acceptance Criteria:** AC-001 to AC-013 (13 criteria) ✅

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

## Priority 2: Phase 3 - Message Class ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- Message class with ack/nack functionality
- PreciseDate utility for high-precision timestamps
- Immutable message properties
- Ack state tracking to prevent double-ack
- Ack deadline validation (0-600 seconds)
- Response methods (ackWithResponse, nackWithResponse, modAckWithResponse)

**Tests:** All 15 acceptance criteria from `specs/04-message.md` passing

### Core Component: Message

**Specification:** `specs/04-message.md`

**Acceptance Criteria:** AC-001 to AC-015 (15 criteria) ✅

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

## Priority 3: Phase 4 - Publisher Components ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- Publisher class with batching and flow control
- PublisherFlowControl class for concurrent publish limits
- Time-based, count-based, and size-based batch triggering
- Message ordering with separate batches per orderingKey
- Ordering key pause/resume on publish errors
- Flush functionality for immediate batch publishing

**Tests:** All 11 acceptance criteria from `specs/05-publisher.md` passing

### Core Components: Publisher, BatchPublisher, FlowControl

**Specification:** `specs/05-publisher.md`

**Acceptance Criteria:** AC-001 to AC-011 (11 criteria) ✅

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

## Priority 4: Phase 5 - Subscriber Components ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- MessageStream class with continuous streaming pull
- LeaseManager for automatic ack deadline extension
- SubscriberFlowControl for message and byte limits
- Message ordering support per orderingKey
- Pause/resume functionality
- Graceful stop with in-flight message handling

**Tests:** All 10 acceptance criteria from `specs/06-subscriber.md` passing

### Core Components: MessageStream, LeaseManager, FlowControl

**Specification:** `specs/06-subscriber.md`

**Acceptance Criteria:** AC-001 to AC-010 (10 criteria) ✅

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

## Priority 5: Phase 6 - Topic Class ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- Topic class with publishing interface
- IAM stub class for API compatibility
- Resource name formatting (projects/{projectId}/topics/{topicName})
- Publishing methods (publish, publishMessage, publishJSON)
- Publisher integration with batching and flow control
- Lifecycle methods (create, delete, exists, get, getMetadata)
- Subscription management (createSubscription, subscription, getSubscriptions)
- Message ordering support with resumePublishing

**Tests:** All 10 acceptance criteria from `specs/02-topic.md` passing

### Core Component: Topic

**Specification:** `specs/02-topic.md`

**Acceptance Criteria:** AC-001 to AC-010 (10 criteria) ✅

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

## Priority 6: Phase 7 - Subscription Class ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- Subscription class with EventEmitter interface
- Type-safe event overloads for message, error, close, debug events
- Lifecycle methods (create, delete, exists, get, getMetadata, setMetadata)
- Message reception via open/close methods
- Flow control and options management
- Integration with Topic class for subscription management
- Message streaming with pause/resume functionality

**Tests:** All 9 acceptance criteria from `specs/03-subscription.md` passing

### Core Component: Subscription (extends EventEmitter)

**Specification:** `specs/03-subscription.md`

**Acceptance Criteria:** AC-001 to AC-009 (9 criteria) ✅

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

## Priority 7: Phase 8 - PubSub Client ✅

**Status:** 100% Complete

**Completed:** 2026-01-15

**What was completed:**
- PubSub client class as main entry point
- Topic factory method with instance caching
- Subscription factory method with instance caching
- Topic lifecycle methods (create, get, list)
- Subscription lifecycle methods (create, get, list)
- Schema management stub methods
- Project ID resolution with default to 'local-project'
- Emulator detection from PUBSUB_EMULATOR_HOST
- Resource name formatting for topics, subscriptions, schemas
- Tuple returns for admin operations matching Google API
- Stream methods for topics and subscriptions

**Tests:** All 13 acceptance criteria from `specs/01-pubsub-client.md` passing

**Git tag:** v0.0.10

### Core Component: PubSub

**Specification:** `specs/01-pubsub-client.md`

**Acceptance Criteria:** AC-001 to AC-013 (13 criteria) ✅

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

---

## PRIORITIZED REMAINING WORK

This section contains the prioritized list of remaining implementation items based on comprehensive code analysis.

### P0: Critical Gaps (Blocking for Production Use)

#### 1. Ordering Key Validation ✅
**Status**: COMPLETE
**Acceptance Criteria**: AC-008 from specs/09-ordering.md
**Files Modified**:
- `src/publisher/publisher.ts` - Added validation in `publishMessage()`

**Completed Requirements**:
- ✅ Reject empty ordering keys with InvalidArgumentError
- ✅ Reject ordering keys > 1024 bytes with InvalidArgumentError
- ✅ Error messages: "Ordering key cannot be empty" and "Ordering key exceeds maximum length"

**Implementation**:
```typescript
if (message.orderingKey !== undefined) {
  if (message.orderingKey === '') {
    throw new InvalidArgumentError('Ordering key cannot be empty');
  }
  if (Buffer.byteLength(message.orderingKey, 'utf8') > 1024) {
    throw new InvalidArgumentError('Ordering key exceeds maximum length of 1024 bytes');
  }
}
```

**Tests Added**:
- ✅ Empty string throws InvalidArgumentError
- ✅ String > 1024 bytes throws InvalidArgumentError
- ✅ Valid ordering key (1024 bytes) accepted

---

#### 2. Schema JSON Type and Validation ✅
**Status**: COMPLETE
**Completed**: 2026-01-15
**Acceptance Criteria**: AC-001 through AC-011 from specs/08-schema.md (11/11 complete)

**What was completed**:
1. Installed ajv library for JSON Schema validation
2. Added SchemaType.JSON to SchemaTypes enum in src/types/schema.ts
3. Implemented full Schema class in src/schema.ts with:
   - validateMessage() method with ajv for JSON schemas
   - AVRO and Protocol Buffer validation throwing UnimplementedError with specific messages
   - Cached compiled validators for performance
   - Fixed exists() to check PubSub schemas registry
   - Fixed delete() to remove from PubSub registry and throw NotFoundError if not found
   - Fixed get() to retrieve from PubSub registry and throw NotFoundError if not found
   - Fixed getName() to return full resource name format
4. Updated topic.ts publishMessage() to validate against schema if schemaSettings exist
5. Updated pubsub.ts validateSchema() to support JSON schema validation
6. Created comprehensive tests in tests/unit/schema.test.ts covering all 11 acceptance criteria

**Tests**: All 171 tests passing (0 failures)

**Files Modified**:
- `src/types/schema.ts` - Added JSON to SchemaTypes enum
- `src/schema.ts` - Complete implementation with validation
- `src/topic.ts` - Added schema validation on publish
- `src/pubsub.ts` - Enhanced validateSchema() method
- `package.json` - Added ajv dependency
- `tests/unit/schema.test.ts` - Comprehensive test coverage

**Acceptance Criteria Completed**:
- ✅ AC-001: Create AVRO schema (stub with proper response)
- ✅ AC-002: AVRO validation throws UnimplementedError
- ✅ AC-003: Protocol Buffer validation throws UnimplementedError
- ✅ AC-004: Topic with schema validation
- ✅ AC-005: Schema exists check
- ✅ AC-006: Delete schema
- ✅ AC-007: Get schema details
- ✅ AC-008: Invalid JSON schema definition
- ✅ AC-009: List schemas
- ✅ AC-010: Validate schema definition
- ✅ AC-011: Get schema name

---

### P2: Testing & Documentation (Required for Quality)

#### 4. Integration Tests: Publish-Subscribe Flow ✅
**Status**: COMPLETE
**Completed**: 2026-01-15
**Files**: `tests/integration/publish-subscribe.test.ts`

**Test Scenarios Implemented** (10 scenarios):
1. Create topic → create subscription → publish → receive → ack
2. Multiple subscriptions receive message copies
3. Messages with attributes
4. Multiple messages delivered in order
5. Ack removes message from queue
6. Nack causes immediate redelivery
7. Messages persist until acknowledged
8. Subscription filtering (messageRetentionDuration)
9. Message ordering end-to-end with ordering keys
10. Error handling for non-existent resources

**Tests**: 181 total tests passing (up from 171)

---

#### 5. Integration Tests: Message Ordering
**Status**: MISSING
**Files**: Create `tests/integration/ordering.test.ts`

**Test Scenarios** (from specs/09-ordering.md):
- AC-002: Same key delivered in order
- AC-003: Sequential processing per key (maxConcurrent=1)
- AC-004: Different keys concurrent (maxConcurrent>1)
- AC-005: Ordering preserved on redelivery
- AC-007: Multiple subscriptions ordered independently

---

#### 6. Integration Tests: Flow Control
**Status**: MISSING
**Files**: Create `tests/integration/flow-control.test.ts`

**Test Scenarios**:
- Publisher blocks when max outstanding reached
- Subscriber limits in-flight messages
- Flow control releases on ack/nack

---

#### 7. Integration Tests: Schema Validation
**Status**: MISSING
**Files**: Create `tests/integration/schema-validation.test.ts`

**Test Scenarios**:
- Topic with schema rejects invalid messages
- Valid messages pass through
- Schema updates

---

#### 8-11. Compatibility Tests
**Status**: MISSING
**Files**: Create `tests/compatibility/{pubsub,topic,subscription,message}-compat.test.ts`

**Purpose**: Verify API signatures match @google-cloud/pubsub exactly

---

### P3: Nice to Have (Optional Enhancements)

#### 12. Schema Revision Support
**Status**: MISSING
**Requirements**: Track revisionId and revisionCreateTime

#### 13. Snapshot Full Implementation
**Status**: STUB (intentional for local dev)
**Note**: Cloud-only feature, low priority for local development

#### 14. Dead Letter Queue Integration Tests
**Status**: MISSING
**Note**: DLQ config exists but needs E2E testing

#### 15. Schema Validation Cache
**Status**: COMPLETE (implemented with P0 #2)
**Note**: Compiled ajv validators are cached for performance

---

## Priority 8: Phase 9 - Integration Tests

**Current Status**: Partially Complete (25% complete)

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

#### 9.1 Publish-Subscribe Flow ✅
**Status**: COMPLETE (10 test scenarios)
**File**: `tests/integration/publish-subscribe.test.ts`

**Implemented**:
- Create topic, create subscription, publish message, receive message, ack
- Multiple subscriptions receive copies
- Message with attributes
- Multiple messages delivered in order
- Ack/nack behavior
- Message persistence
- Ordering keys end-to-end
- Error handling

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

## Priority 9: Phase 10 - Advanced Features

### 10.1 Message Ordering

**Specification:** `specs/09-ordering.md`

**Status**: 67% Complete (8/12 AC implemented)

**Acceptance Criteria:** AC-001 to AC-012 (12 criteria)

**Implemented** ✅:
- AC-001: Topic with resumePublishing()
- AC-002: Same key delivered in order
- AC-006: No ordering key not blocked
- AC-008: Ordering key validation (empty and oversized rejected)
- AC-009: Ordering key accepted without explicit enable
- AC-010: Batching with ordering keys (separate batches per key)
- AC-011: Ordering key paused on error (error message format fixed 2026-01-15)
- AC-012: resumePublishing() clears paused state

**Missing** ⚠️:
- AC-003: Sequential processing test (maxConcurrent=1)
- AC-004: Different keys concurrent test
- AC-005: Ordering preserved on redelivery test
- AC-007: Multiple subscriptions ordered independently test

**Key Components Already Implemented:**
- Publisher: Separate batches per ordering key ✅
- MessageQueue: Separate queues per ordering key, sequential delivery ✅
- MessageStream: Deliver in order per key, wait for ack ✅
- Topic: resumePublishing() for error recovery ✅

**Files Exist**:
- `/Users/donlair/Projects/libraries/pubsub/src/publisher/publisher.ts`
- `/Users/donlair/Projects/libraries/pubsub/src/internal/message-queue.ts`
- `/Users/donlair/Projects/libraries/pubsub/src/subscriber/message-stream.ts`
- `/Users/donlair/Projects/libraries/pubsub/src/topic.ts`

### 10.2 Schema Validation ✅

**Specification:** `specs/08-schema.md`

**Status**: 100% Complete (11/11 AC implemented)

**Completed:** 2026-01-15

**What was completed:**
1. Installed ajv library for JSON Schema validation
2. Added SchemaType.JSON to SchemaTypes enum
3. Implemented full Schema class with:
   - validateMessage() method with ajv for JSON schemas
   - AVRO and Protocol Buffer validation throwing UnimplementedError with specific messages
   - Cached compiled validators for performance
   - Fixed exists() to check PubSub schemas registry
   - Fixed delete() to remove from PubSub registry and throw NotFoundError if not found
   - Fixed get() to retrieve from PubSub registry and throw NotFoundError if not found
   - Fixed getName() to return full resource name format
4. Updated topic.ts publishMessage() to validate against schema if schemaSettings exist
5. Updated pubsub.ts validateSchema() to support JSON schema validation
6. Created comprehensive tests in tests/unit/schema.test.ts covering all 11 acceptance criteria

**Tests:** All 171 tests passing (0 failures)

**Acceptance Criteria:** AC-001 to AC-011 (11 criteria) ✅

**File Modified**: `/Users/donlair/Projects/libraries/pubsub/src/schema.ts`

**Implementation Details:**
- SchemaType.JSON added for local development extension
- ajv library installed for JSON Schema validation
- AVRO and Protocol Buffer throw UnimplementedError with descriptive messages
- Schema registry fully integrated with PubSub client
- Compiled validators cached for performance
- Topic publishMessage() validates against schema if configured

### 10.3 Snapshot Support

**Status**: INTENTIONALLY STUBBED (for local dev)

**File Exists**: `/Users/donlair/Projects/libraries/pubsub/src/snapshot.ts`

**Note**: Snapshots are a cloud-only feature for point-in-time recovery. All methods throw UnimplementedError by design. Low priority for local development.

### 10.4 IAM Support

**Status**: INTENTIONALLY STUBBED (for local dev)

**File Exists**: `/Users/donlair/Projects/libraries/pubsub/src/iam.ts`

**Note**: IAM is for Google Cloud authentication/authorization. All methods throw UnimplementedError by design. Not needed for local development.

---

## Acceptance Criteria Tracking

### Summary by Specification

| Spec | Component | Total AC | Phase | Status |
|------|-----------|----------|-------|--------|
| 01 | PubSub Client | 13 | 8 | ✅ Complete |
| 02 | Topic | 10 | 6 | ✅ Complete |
| 03 | Subscription | 9 | 7 | ✅ Complete |
| 04 | Message | 15 | 3 | ✅ Complete |
| 05 | Publisher | 11 | 4 | ✅ Complete |
| 06 | Subscriber | 10 | 5 | ✅ Complete |
| 07 | MessageQueue | 13 | 2 | ✅ Complete |
| 08 | Schema | 11 | 10 | ✅ Complete |
| 09 | Ordering | 12 | 10 | Pending |
| **Total** | | **104** | | **90% Complete (94/104)** |

### Detailed AC Status

#### Spec 01: PubSub Client (13 AC) ✅
- [x] AC-001: Basic Instantiation
- [x] AC-002: Default Project ID
- [x] AC-003: Topic Factory Returns Same Instance
- [x] AC-004: Create and Get Topic
- [x] AC-005: Create Topic Twice Throws Error
- [x] AC-006: Create Subscription
- [x] AC-007: Subscription Factory Returns Same Instance
- [x] AC-008: Get Topics Stream
- [x] AC-009: Get Subscriptions Stream
- [x] AC-010: Create and Validate Schema
- [x] AC-011: List Schemas
- [x] AC-012: Get Project ID
- [x] AC-013: Close Client

#### Spec 02: Topic (10 AC) ✅
- [x] AC-001: Create and Publish
- [x] AC-002: Publish with Attributes
- [x] AC-003: Publish JSON
- [x] AC-004: Batching Accumulates Messages
- [x] AC-005: Flush Publishes Immediately
- [x] AC-006: Message Ordering
- [x] AC-007: Topic Exists Check
- [x] AC-008: Get Topic Subscriptions
- [x] AC-009: Publish to Non-Existent Topic Throws
- [x] AC-010: Deprecated publish() Method

#### Spec 03: Subscription (9 AC) ✅
- [x] AC-001: Create and Receive Messages
- [x] AC-002: Flow Control Max Messages
- [x] AC-003: Ack Deadline Redelivery
- [x] AC-004: Message Ordering
- [x] AC-005: Error Event Emission
- [x] AC-006: Close Stops Message Flow
- [x] AC-007: Set Options After Creation
- [x] AC-008: Subscription Exists Check
- [x] AC-009: Multiple Subscriptions Same Topic

#### Spec 04: Message (15 AC) ✅
- [x] AC-001: Basic Message Properties
- [x] AC-002: Ack Removes Message
- [x] AC-003: Nack Causes Immediate Redelivery
- [x] AC-004: Modify Ack Deadline
- [x] AC-005: Message Length Property
- [x] AC-006: Empty Data Message
- [x] AC-007: Ordering Key Present
- [x] AC-008: Multiple Acks Are Idempotent
- [x] AC-009: Ack After Nack Has No Effect
- [x] AC-010: Delivery Attempt Counter
- [x] AC-011: Ack With Response Returns Success
- [x] AC-012: Nack With Response Returns Success
- [x] AC-013: Ack With Response Handles Invalid Ack ID
- [x] AC-014: Response Methods Work Without Exactly-Once
- [x] AC-015: Attribute Validation

#### Spec 05: Publisher (11 AC) ✅
- [x] AC-001: Default Batching Behavior
- [x] AC-002: Time-Based Batch Trigger
- [x] AC-003: Count-Based Batch Trigger
- [x] AC-004: Size-Based Batch Trigger
- [x] AC-005: Flush Publishes Immediately
- [x] AC-006: Message Ordering Separate Batches
- [x] AC-007: Ordering Key Error Pause and Resume
- [x] AC-008: Flow Control Max Messages
- [x] AC-009: Disable Batching
- [x] AC-010: Unique Message IDs
- [x] AC-011: Empty Message Batch

#### Spec 06: Subscriber (10 AC) ✅
- [x] AC-001: Basic Streaming Pull
- [x] AC-002: Flow Control Max Messages
- [x] AC-003: Flow Control Max Bytes
- [x] AC-004: Ack Deadline Redelivery
- [x] AC-005: Message Ordering Sequential Delivery
- [x] AC-006: Pause and Resume
- [x] AC-007: Stop Waits for In-Flight
- [x] AC-008: Error Event on Failure
- [x] AC-009: Multiple Concurrent Messages
- [x] AC-010: Allow Excess Messages

#### Spec 07: MessageQueue (13 AC) ✅
- [x] AC-001: Singleton Pattern
- [x] AC-002: Register and Check Topic
- [x] AC-003: Publish and Pull Messages
- [x] AC-004: Multiple Subscriptions Receive Copies
- [x] AC-005: Ack Removes Message
- [x] AC-006: Nack Redelivers Immediately
- [x] AC-007: Ack Deadline Expiry Redelivers
- [x] AC-008: Modify Ack Deadline
- [x] AC-009: Message Ordering
- [x] AC-010: Publish Without Subscriptions
- [x] AC-011: Get Subscriptions for Topic
- [x] AC-012: Unregister Topic Detaches Subscriptions
- [x] AC-013: FIFO Message Ordering Without Ordering Key

#### Spec 08: Schema (11 AC) ✅
- [x] AC-001: Create AVRO Schema
- [x] AC-002: AVRO Validation Throws Unimplemented
- [x] AC-003: Protocol Buffer Validation Throws Unimplemented
- [x] AC-004: Topic with Schema Validation
- [x] AC-005: Schema Exists Check
- [x] AC-006: Delete Schema
- [x] AC-007: Get Schema Details
- [x] AC-008: Invalid JSON Schema Definition
- [x] AC-009: List Schemas
- [x] AC-010: Validate Schema Definition
- [x] AC-011: Get Schema Name

**Schema Status**: 11/11 AC complete (100% complete)

#### Spec 09: Ordering (12 AC)
- [x] AC-001: Create Topic and Publish with Ordering Key
- [x] AC-002: Messages with Same Key Delivered in Order
- [ ] AC-003: Sequential Processing per Key (implementation exists, test missing)
- [ ] AC-004: Different Keys Concurrent (implementation exists, test missing)
- [ ] AC-005: Ordering Preserved on Redelivery (implementation exists, test missing)
- [x] AC-006: No Ordering Key Not Blocked
- [ ] AC-007: Multiple Subscriptions Ordered Independently (implementation exists, test missing)
- [x] AC-008: Ordering Key Validation
- [x] AC-009: Ordering Key Accepted Without Explicit Enable
- [x] AC-010: Batching with Ordering Keys
- [x] AC-011: Ordering Key Paused on Error (error message format fixed 2026-01-15)
- [x] AC-012: Resume Publishing After Error

**Ordering Status**: 8/12 AC complete (67% complete)

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
| 2026-01-15 | 1.1 | Claude | Phase 2 (MessageQueue) complete - all 13 AC passing |
| 2026-01-15 | 1.0 | Claude | Initial implementation plan |
