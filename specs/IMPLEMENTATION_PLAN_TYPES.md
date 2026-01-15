# Type Definitions Implementation Plan (Phase 1)

## Overview

This document provides the complete implementation specification for TypeScript type definitions. These types form the foundation for all subsequent implementation phases and must match `@google-cloud/pubsub` v5.2.0+ exactly for drop-in API compatibility.

**Phase**: 1 of 10
**Depends on**: None
**Required by**: All subsequent phases
**Reference**: `research/11-typescript-types.md`

---

## File Structure

```
src/
├── index.ts                    # Main library exports
└── types/
    ├── index.ts                # Type barrel export
    ├── common.ts               # Duration, utility types
    ├── errors.ts               # Error codes and classes
    ├── message.ts              # Message and attributes
    ├── schema.ts               # Schema validation types
    ├── publisher.ts            # Publisher configuration
    ├── subscriber.ts           # Subscriber configuration
    ├── topic.ts                # Topic metadata/options
    ├── subscription.ts         # Subscription metadata/options
    ├── pubsub.ts               # Client configuration
    ├── iam.ts                  # IAM policy types
    └── callbacks.ts            # Response and callback types
```

---

## Implementation Order

### Layer 1: Foundation Types (No Dependencies)

#### 1.1 `src/types/common.ts` ✅ COMPLETED

```typescript
/**
 * Common utility types used throughout the library.
 * Reference: research/11-typescript-types.md#utility-types
 */

/**
 * Represents a duration that can be specified in various units.
 * Compatible with google.protobuf.IDuration.
 */
export interface DurationLike {
  seconds?: number;
  nanos?: number;
  minutes?: number;
  hours?: number;
  days?: number;
}

/**
 * Duration type accepting number (seconds) or Duration object.
 */
export type Duration = number | DurationLike;

/**
 * Protobuf timestamp interface for compatibility.
 */
export interface ITimestamp {
  seconds?: number | Long | string | null;
  nanos?: number | null;
}

/**
 * High-precision date extending Date with nanosecond precision.
 *
 * NOTE: Phase 1 - Type definition only
 * Phase 3 - Runtime implementation in src/message.ts or src/utils/precise-date.ts
 *
 * Implementation must match @google-cloud/pubsub PreciseDate behavior exactly.
 * This interface provides type safety for message publishTime properties.
 */
export interface PreciseDate extends Date {
  getNanoseconds(): number;
  getMicroseconds(): number;
  getFullTimeString(): string;
}

/**
 * Generic service error from gRPC.
 */
export interface ServiceError extends Error {
  code: number;
  details?: string;
  metadata?: Record<string, string>;
}

/**
 * Long integer type for protobuf compatibility.
 */
export type Long = string | number;

/**
 * Backoff settings for retries.
 */
export interface BackoffSettings {
  /** Initial retry delay in ms. */
  initialRetryDelayMillis?: number;
  /** Retry delay multiplier. */
  retryDelayMultiplier?: number;
  /** Maximum retry delay in ms. */
  maxRetryDelayMillis?: number;
  /** Initial RPC timeout in ms. */
  initialRpcTimeoutMillis?: number;
  /** RPC timeout multiplier. */
  rpcTimeoutMultiplier?: number;
  /** Maximum RPC timeout in ms. */
  maxRpcTimeoutMillis?: number;
  /** Total timeout in ms. */
  totalTimeoutMillis?: number;
}

/**
 * Retry configuration.
 */
export interface RetryOptions {
  /** Retryable error codes. */
  retryCodes?: number[];
  /** Backoff settings. */
  backoffSettings?: BackoffSettings;
}

/**
 * gRPC call options.
 * Reference: research/11-typescript-types.md
 */
export interface CallOptions {
  /** Request timeout in ms. */
  timeout?: number;
  /** Retry configuration. */
  retry?: RetryOptions;
  /** Enable auto-pagination. */
  autoPaginate?: boolean;
  /** Page token. */
  pageToken?: string;
  /** Maximum results. */
  maxResults?: number;
}
```

#### 1.2 `src/types/errors.ts` ✅ COMPLETED

```typescript
/**
 * Error types matching gRPC status codes.
 * Reference: .claude/rules/error-handling.md
 */

/**
 * gRPC status codes used by Google Cloud APIs.
 * https://grpc.io/docs/guides/status-codes/
 */
export enum ErrorCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16
}

/**
 * Base error class for all Pub/Sub errors.
 */
export class PubSubError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PubSubError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Resource not found error. Code: 5
 */
export class NotFoundError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(`${resourceType} not found: ${resource}`, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Resource already exists error. Code: 6
 */
export class AlreadyExistsError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(`${resourceType} already exists: ${resource}`, ErrorCode.ALREADY_EXISTS);
    this.name = 'AlreadyExistsError';
  }
}

/**
 * Invalid argument error. Code: 3
 */
export class InvalidArgumentError extends PubSubError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.INVALID_ARGUMENT, details);
    this.name = 'InvalidArgumentError';
  }
}

/**
 * Resource exhausted error (flow control). Code: 8
 */
export class ResourceExhaustedError extends PubSubError {
  constructor(message: string) {
    super(message, ErrorCode.RESOURCE_EXHAUSTED);
    this.name = 'ResourceExhaustedError';
  }
}

/**
 * Feature not implemented error. Code: 12
 */
export class UnimplementedError extends PubSubError {
  constructor(feature: string, suggestion?: string) {
    const message = suggestion
      ? `${feature} is not implemented. ${suggestion}`
      : `${feature} is not implemented.`;
    super(message, ErrorCode.UNIMPLEMENTED);
    this.name = 'UnimplementedError';
  }
}

/**
 * Internal error. Code: 13
 */
export class InternalError extends PubSubError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.INTERNAL, { cause });
    this.name = 'InternalError';
  }
}
```

---

### Layer 2: Core Data Types

#### 2.1 `src/types/message.ts` ✅ COMPLETED

```typescript
/**
 * Message types for publishing and receiving.
 * Reference: specs/04-message.md, research/11-typescript-types.md#message-types
 */

import type { PreciseDate, ITimestamp } from './common';

/**
 * Message attributes - key-value string pairs.
 * Keys: max 256 bytes, cannot start with 'goog'
 * Values: max 1024 bytes
 */
export type Attributes = Record<string, string>;

/**
 * Message structure for publishing.
 * Reference: research/11-typescript-types.md#pubsubmessage
 */
export interface PubsubMessage {
  /** Message payload as Buffer or Uint8Array. Max 10MB. */
  data?: Buffer | Uint8Array;
  /** Key-value metadata pairs. */
  attributes?: Attributes;
  /** Server-assigned unique message ID. */
  messageId?: string;
  /** Server-assigned publish timestamp. */
  publishTime?: ITimestamp;
  /** Key for ordered message delivery. */
  orderingKey?: string;
}

/**
 * Extended message options with JSON convenience.
 * Reference: research/11-typescript-types.md#messageoptions
 */
export type MessageOptions = PubsubMessage & {
  /** Convenience property to publish JSON (auto-converted to Buffer). */
  json?: unknown;
};

/**
 * Readonly properties of a received Message.
 * Reference: specs/04-message.md
 */
export interface MessageProperties {
  /** Unique message identifier assigned by server. */
  readonly id: string;
  /** Acknowledgment ID (unique per delivery attempt). */
  readonly ackId: string;
  /** Message payload. */
  readonly data: Buffer;
  /** Message attributes. */
  readonly attributes: Readonly<Attributes>;
  /** Server publish timestamp. */
  readonly publishTime: PreciseDate;
  /** Client receive timestamp (ms since epoch). */
  readonly received: number;
  /** Ordering key if message ordering enabled. */
  readonly orderingKey?: string;
  /** Delivery attempt count (1-based, requires deadLetterPolicy). */
  readonly deliveryAttempt?: number;
  /** Message data length in bytes. */
  readonly length: number;
}

/**
 * Response codes for ack/nack operations.
 * Reference: research/11-typescript-types.md#ackresponses
 */
export const AckResponses = {
  Success: 'SUCCESS',
  PermissionDenied: 'PERMISSION_DENIED',
  FailedPrecondition: 'FAILED_PRECONDITION',
  Invalid: 'INVALID',
  Other: 'OTHER'
} as const;

export type AckResponse = (typeof AckResponses)[keyof typeof AckResponses];

/**
 * Error thrown for failed ack/nack with exactly-once delivery.
 * Reference: research/11-typescript-types.md#ackerror
 */
export class AckError extends Error {
  constructor(
    public readonly errorCode: AckResponse,
    message?: string
  ) {
    super(message || `Acknowledgment failed: ${errorCode}`);
    this.name = 'AckError';
  }
}
```

#### 2.2 `src/types/schema.ts` ✅ COMPLETED

```typescript
/**
 * Schema validation types.
 * Reference: specs/08-schema.md, research/11-typescript-types.md#schema-types
 */

import type { CallOptions } from './common';

/**
 * Schema definition types.
 */
export const SchemaTypes = {
  ProtocolBuffer: 'PROTOCOL_BUFFER',
  Avro: 'AVRO'
} as const;

export type SchemaType = (typeof SchemaTypes)[keyof typeof SchemaTypes];

/**
 * Schema view levels for retrieval.
 */
export const SchemaViews = {
  Basic: 'BASIC',
  Full: 'FULL'
} as const;

export type SchemaView = (typeof SchemaViews)[keyof typeof SchemaViews];

/**
 * Message encoding types for schema validation.
 */
export const Encodings = {
  Json: 'JSON',
  Binary: 'BINARY'
} as const;

export type SchemaEncoding = (typeof Encodings)[keyof typeof Encodings];

/**
 * Schema resource interface.
 * Reference: research/11-typescript-types.md#ischema
 */
export interface ISchema {
  /** Full resource name: projects/{project}/schemas/{schema} */
  name?: string;
  /** Schema type (AVRO or PROTOCOL_BUFFER). */
  type?: SchemaType;
  /** Schema definition string. */
  definition?: string;
  /** Revision identifier. */
  revisionId?: string;
  /** Revision creation timestamp. */
  revisionCreateTime?: { seconds?: number; nanos?: number };
}

/**
 * Schema settings for a topic.
 * Reference: research/11-typescript-types.md#schemasettings
 */
export interface SchemaSettings {
  /** Schema resource name. */
  schema?: string;
  /** Expected message encoding. */
  encoding?: SchemaEncoding;
  /** First revision ID to use for validation. */
  firstRevisionId?: string;
  /** Last revision ID to use for validation. */
  lastRevisionId?: string;
}

/**
 * Schema metadata extracted from message attributes.
 */
export interface SchemaMessageMetadata {
  /** Schema name from message attributes. */
  name?: string;
  /** Schema revision from message attributes. */
  revision?: string;
  /** Message encoding. */
  encoding: SchemaEncoding | undefined;
}

/**
 * Options for creating a schema.
 */
export interface CreateSchemaOptions {
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Options for validating a schema.
 */
export interface ValidateSchemaOptions {
  /** Schema object to validate. */
  schema?: ISchema;
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}
```

---

### Layer 3: Configuration Types

#### 3.1 `src/types/publisher.ts` ✅ COMPLETED

```typescript
/**
 * Publisher configuration types.
 * Reference: specs/05-publisher.md, research/06-publisher-config.md
 */

import type { CallOptions } from './common';

/**
 * Batch publishing configuration.
 * Reference: research/11-typescript-types.md#batchpublishoptions
 *
 * Batching triggers when ANY threshold is reached.
 */
export interface BatchPublishOptions {
  /**
   * Max messages before batch publish.
   * @default 100
   */
  maxMessages?: number;

  /**
   * Max milliseconds to wait before batch publish.
   * @default 10
   */
  maxMilliseconds?: number;

  /**
   * Max bytes before batch publish.
   * @default 1048576 (1 MB)
   */
  maxBytes?: number;
}

/**
 * Publisher flow control configuration.
 * Reference: research/11-typescript-types.md#publisherflowcontroloptions
 */
export interface PublisherFlowControlOptions {
  /**
   * Max outstanding messages before blocking.
   * @default 100
   */
  maxOutstandingMessages?: number;

  /**
   * Max outstanding bytes before blocking.
   * @default 1048576 (1 MB)
   */
  maxOutstandingBytes?: number;
}

/**
 * Complete publish options for Topic.
 * Reference: research/11-typescript-types.md#publishoptions
 */
export interface PublishOptions {
  /** Batching configuration. */
  batching?: BatchPublishOptions;

  /**
   * Enable message ordering by key.
   * @default false
   */
  messageOrdering?: boolean;

  /** Publisher flow control settings. */
  flowControlOptions?: PublisherFlowControlOptions;

  /** gRPC call options. */
  gaxOpts?: CallOptions;

  /**
   * Enable OpenTelemetry tracing.
   * @default false
   */
  enableOpenTelemetryTracing?: boolean;
}

/**
 * Callback for publish operations.
 * Reference: research/11-typescript-types.md#publishcallback
 */
export type PublishCallback = (
  err: Error | null,
  messageId?: string | null
) => void;

/**
 * Default publisher batching values.
 */
export const DEFAULT_BATCH_OPTIONS: Required<BatchPublishOptions> = {
  maxMessages: 100,
  maxMilliseconds: 10,
  maxBytes: 1024 * 1024 // 1 MB
};

/**
 * Default publisher flow control values.
 */
export const DEFAULT_PUBLISHER_FLOW_CONTROL: Required<PublisherFlowControlOptions> = {
  maxOutstandingMessages: 100,
  maxOutstandingBytes: 1024 * 1024 // 1 MB
};
```

#### 3.2 `src/types/subscriber.ts` ✅ COMPLETED

```typescript
/**
 * Subscriber configuration types.
 * Reference: specs/06-subscriber.md, research/07-subscriber-config.md
 */

import type { Duration } from './common';

/**
 * Subscriber flow control configuration.
 * Reference: research/11-typescript-types.md#subscriberflowcontroloptions
 */
export interface SubscriberFlowControlOptions {
  /**
   * Max unacknowledged messages.
   * @default 1000
   */
  maxMessages?: number;

  /**
   * Max bytes of unacknowledged messages.
   * @default 104857600 (100 MB)
   */
  maxBytes?: number;

  /**
   * Allow messages beyond limit if already in flight.
   * @default false
   */
  allowExcessMessages?: boolean;
}

/**
 * Ack/modAck batching configuration.
 * Reference: research/11-typescript-types.md#batchoptions
 */
export interface BatchOptions {
  /**
   * Max acks to batch before sending.
   * @default 3000
   */
  maxMessages?: number;

  /**
   * Max milliseconds before sending batch.
   * @default 100
   */
  maxMilliseconds?: number;
}

/**
 * Streaming pull connection options.
 * Reference: research/11-typescript-types.md#messagestreamoptions
 */
export interface MessageStreamOptions {
  /**
   * Number of concurrent streaming connections.
   * @default 5
   */
  maxStreams?: number;

  /**
   * Stream timeout in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout?: number;
}

/**
 * Subscriber close behavior options.
 */
export const SubscriberCloseBehaviors = {
  /** Immediately nack all pending messages. */
  NackImmediately: 'NACK',
  /** Wait for pending messages to be processed. */
  WaitForProcessing: 'WAIT'
} as const;

export type SubscriberCloseBehavior =
  (typeof SubscriberCloseBehaviors)[keyof typeof SubscriberCloseBehaviors];

/**
 * Options for closing a subscriber.
 * Reference: research/11-typescript-types.md#subscribercloseoptions
 */
export interface SubscriberCloseOptions {
  /**
   * Close behavior (NACK or WAIT).
   * @default 'WAIT' (NEEDS VERIFICATION against @google-cloud/pubsub v5.2.0+)
   */
  behavior?: SubscriberCloseBehavior;

  /**
   * Max time to wait for pending operations.
   * @default 30 seconds (NEEDS VERIFICATION against @google-cloud/pubsub v5.2.0+)
   */
  timeout?: Duration;
}

/**
 * Complete subscriber configuration.
 * Reference: research/11-typescript-types.md#subscriberoptions
 */
export interface SubscriberOptions {
  /**
   * Minimum ack deadline in seconds.
   * @default 10
   */
  minAckDeadline?: Duration;

  /**
   * Maximum ack deadline in seconds.
   * @default 600
   */
  maxAckDeadline?: Duration;

  /**
   * Maximum extension time in seconds.
   * @default 3600 (1 hour)
   */
  maxExtensionTime?: Duration;

  /** Ack batching configuration. */
  batching?: BatchOptions;

  /** Flow control settings. */
  flowControl?: SubscriberFlowControlOptions;

  /**
   * Use client-side only flow control.
   * @default false
   */
  useLegacyFlowControl?: boolean;

  /** Streaming connection options. */
  streamingOptions?: MessageStreamOptions;

  /** Close behavior options. */
  closeOptions?: SubscriberCloseOptions;
}

/**
 * Default subscriber flow control values.
 */
export const DEFAULT_SUBSCRIBER_FLOW_CONTROL: Required<SubscriberFlowControlOptions> = {
  maxMessages: 1000,
  maxBytes: 100 * 1024 * 1024, // 100 MB
  allowExcessMessages: false
};

/**
 * Default subscriber batching values.
 */
export const DEFAULT_SUBSCRIBER_BATCH_OPTIONS: Required<BatchOptions> = {
  maxMessages: 3000,
  maxMilliseconds: 100
};

/**
 * Default streaming options.
 */
export const DEFAULT_STREAMING_OPTIONS: Required<MessageStreamOptions> = {
  maxStreams: 5,
  timeout: 300000 // 5 minutes
};
```

---

### Layer 4: Resource Types

#### 4.1 `src/types/topic.ts`

```typescript
/**
 * Topic types and metadata.
 * Reference: specs/02-topic.md, research/02-topic-api.md
 */

import type { SchemaSettings } from './schema';
import type { CallOptions } from './common';

/**
 * Message storage policy configuration.
 */
export interface MessageStoragePolicy {
  /** Allowed persistence regions. */
  allowedPersistenceRegions?: string[];
}

/**
 * Topic metadata/configuration.
 * Compatible with google.pubsub.v1.ITopic.
 * Reference: research/11-typescript-types.md#topicmetadata
 */
export interface TopicMetadata {
  /** Full resource name: projects/{project}/topics/{topic} */
  name?: string;

  /** Key-value labels for organization. */
  labels?: Record<string, string>;

  /** Message storage policy. */
  messageStoragePolicy?: MessageStoragePolicy;

  /** Cloud KMS key for encryption. */
  kmsKeyName?: string;

  /** Schema validation settings. */
  schemaSettings?: SchemaSettings;

  /** Whether topic satisfies PZS requirements. */
  satisfiesPzs?: boolean;

  /**
   * Message retention duration.
   * Format: "{seconds}s" or Duration object.
   */
  messageRetentionDuration?: { seconds?: number; nanos?: number } | string;

  /**
   * Ingestion data source settings (BigQuery, Cloud Storage).
   */
  ingestionDataSourceSettings?: IngestionDataSourceSettings;
}

/**
 * Ingestion settings for importing data into topic.
 */
export interface IngestionDataSourceSettings {
  /** AWS Kinesis source configuration. */
  awsKinesis?: {
    state?: string;
    streamArn?: string;
    consumerArn?: string;
    awsRoleArn?: string;
    gcpServiceAccount?: string;
  };
}

/**
 * Options for creating a topic.
 * Reference: research/11-typescript-types.md#createtopicoptions
 */
export interface CreateTopicOptions extends TopicMetadata {
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Options for getting a topic.
 * Reference: research/11-typescript-types.md#gettopicoptions
 */
export interface GetTopicOptions {
  /**
   * Auto-create topic if it doesn't exist.
   * @default false
   */
  autoCreate?: boolean;

  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Options for listing topics.
 */
export interface GetTopicsOptions {
  /** Page size for pagination. */
  pageSize?: number;

  /** Page token for pagination. */
  pageToken?: string;

  /** gRPC call options. */
  gaxOpts?: CallOptions;

  /** Enable auto-pagination. */
  autoPaginate?: boolean;
}

/**
 * Options for listing topic subscriptions.
 */
export interface GetTopicSubscriptionsOptions {
  /** Page size for pagination. */
  pageSize?: number;

  /** Page token for pagination. */
  pageToken?: string;

  /** gRPC call options. */
  gaxOpts?: CallOptions;

  /** Enable auto-pagination. */
  autoPaginate?: boolean;
}
```

#### 4.2 `src/types/subscription.ts`

```typescript
/**
 * Subscription types and metadata.
 * Reference: specs/03-subscription.md, research/03-subscription-api.md
 */

import type { Duration } from './common';
import type { SubscriberOptions, SubscriberFlowControlOptions } from './subscriber';
import type { CallOptions } from './common';

/**
 * Push delivery configuration.
 * Reference: research/11-typescript-types.md#pushconfig
 */
export interface PushConfig {
  /** HTTPS endpoint URL for push delivery. */
  pushEndpoint?: string;

  /** Endpoint configuration attributes. */
  attributes?: Record<string, string>;

  /** OIDC token for authentication. */
  oidcToken?: OidcToken;

  /** Pub/Sub wrapper configuration. */
  pubsubWrapper?: PubSubWrapper;

  /** No wrapper - raw message delivery. */
  noWrapper?: NoWrapper;
}

/**
 * OIDC token configuration for push authentication.
 * Reference: research/11-typescript-types.md#oidctoken
 */
export interface OidcToken {
  /** Service account email. */
  serviceAccountEmail?: string;

  /** Audience claim for the token. */
  audience?: string;
}

/**
 * Pub/Sub wrapper for push messages.
 */
export interface PubSubWrapper {
  /** Include raw message data. */
  writeMetadata?: boolean;
}

/**
 * No wrapper configuration.
 */
export interface NoWrapper {
  /** Write message metadata to request headers. */
  writeMetadata?: boolean;
}

/**
 * Dead letter policy configuration.
 * Reference: research/11-typescript-types.md#deadletterpolicy
 */
export interface DeadLetterPolicy {
  /**
   * Topic for dead letter messages.
   * Format: projects/{project}/topics/{topic}
   */
  deadLetterTopic?: string;

  /**
   * Max delivery attempts before dead lettering.
   * Range: 5-100
   * @default 5
   */
  maxDeliveryAttempts?: number;
}

/**
 * Retry policy for failed deliveries.
 * Reference: research/11-typescript-types.md#retrypolicy
 */
export interface RetryPolicy {
  /**
   * Minimum backoff duration.
   * @default { seconds: 10 }
   */
  minimumBackoff?: { seconds?: number; nanos?: number };

  /**
   * Maximum backoff duration.
   * @default { seconds: 600 }
   */
  maximumBackoff?: { seconds?: number; nanos?: number };
}

/**
 * Subscription expiration policy.
 */
export interface ExpirationPolicy {
  /**
   * Time-to-live for subscription without activity.
   * Empty means never expire.
   */
  ttl?: { seconds?: number; nanos?: number };
}

/**
 * BigQuery export configuration.
 */
export interface BigQueryConfig {
  /** BigQuery table for export. */
  table?: string;

  /** Use topic schema for table. */
  useTopicSchema?: boolean;

  /** Write message metadata. */
  writeMetadata?: boolean;

  /** Drop unknown fields. */
  dropUnknownFields?: boolean;

  /** Export state. */
  state?: string;
}

/**
 * Cloud Storage export configuration.
 */
export interface CloudStorageConfig {
  /** Storage bucket. */
  bucket?: string;

  /** File prefix. */
  filenamePrefix?: string;

  /** File suffix. */
  filenameSuffix?: string;

  /** Text output format. */
  textConfig?: { /* empty */ };

  /** Avro output format. */
  avroConfig?: { writeMetadata?: boolean };

  /** Max duration before file rollover. */
  maxDuration?: { seconds?: number; nanos?: number };

  /** Max bytes before file rollover. */
  maxBytes?: number;

  /** Export state. */
  state?: string;
}

/**
 * Subscription metadata/configuration.
 * Compatible with google.pubsub.v1.ISubscription.
 * Reference: research/11-typescript-types.md#subscriptionmetadata
 */
export interface SubscriptionMetadata {
  /** Full resource name. */
  name?: string;

  /** Associated topic name. */
  topic?: string;

  /** Push delivery configuration. */
  pushConfig?: PushConfig;

  /** BigQuery export configuration. */
  bigQueryConfig?: BigQueryConfig;

  /** Cloud Storage export configuration. */
  cloudStorageConfig?: CloudStorageConfig;

  /**
   * Ack deadline in seconds.
   * Range: 10-600
   * @default 10
   */
  ackDeadlineSeconds?: number;

  /** Retain acknowledged messages. */
  retainAckedMessages?: boolean;

  /**
   * Message retention duration.
   * @default 604800 seconds (7 days)
   */
  messageRetentionDuration?: { seconds?: number; nanos?: number } | number;

  /** Key-value labels. */
  labels?: Record<string, string>;

  /** Enable message ordering. */
  enableMessageOrdering?: boolean;

  /** Subscription expiration policy. */
  expirationPolicy?: ExpirationPolicy;

  /** Message filter expression. */
  filter?: string;

  /** Dead letter policy. */
  deadLetterPolicy?: DeadLetterPolicy;

  /** Retry policy. */
  retryPolicy?: RetryPolicy;

  /** Subscription is detached from topic. */
  detached?: boolean;

  /** Enable exactly-once delivery. */
  enableExactlyOnceDelivery?: boolean;

  /** Topic message retention duration. */
  topicMessageRetentionDuration?: { seconds?: number; nanos?: number };
}

/**
 * Options for creating a subscription.
 * Reference: research/11-typescript-types.md#createsubscriptionoptions
 */
export interface CreateSubscriptionOptions extends SubscriptionMetadata {
  /** gRPC call options. */
  gaxOpts?: CallOptions;

  /** Flow control settings. */
  flowControl?: SubscriberFlowControlOptions;
}

/**
 * Options for a Subscription instance.
 * Reference: research/11-typescript-types.md#subscriptionoptions
 */
export interface SubscriptionOptions extends SubscriberOptions {
  /** Associated topic reference. */
  topic?: unknown; // Topic type (avoid circular dependency)
}

/**
 * Options for getting a subscription.
 */
export interface GetSubscriptionOptions {
  /** Auto-create if doesn't exist. */
  autoCreate?: boolean;

  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Options for listing subscriptions.
 */
export interface GetSubscriptionsOptions {
  /** Page size. */
  pageSize?: number;

  /** Page token. */
  pageToken?: string;

  /** gRPC call options. */
  gaxOpts?: CallOptions;

  /** Auto-pagination. */
  autoPaginate?: boolean;
}

/**
 * Options for seeking a subscription.
 */
export interface SeekOptions {
  /** Seek to snapshot name. */
  snapshot?: string;

  /** Seek to timestamp. */
  time?: Date | { seconds?: number; nanos?: number };

  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Snapshot metadata.
 */
export interface SnapshotMetadata {
  /** Snapshot name. */
  name?: string;

  /** Source subscription. */
  topic?: string;

  /** Expiration time. */
  expireTime?: { seconds?: number; nanos?: number };

  /** Labels. */
  labels?: Record<string, string>;
}

/**
 * Options for creating a snapshot.
 */
export interface CreateSnapshotOptions {
  /** Labels. */
  labels?: Record<string, string>;

  /** gRPC call options. */
  gaxOpts?: CallOptions;
}
```

---

### Layer 5: Client Types

#### 5.1 `src/types/pubsub.ts`

```typescript
/**
 * PubSub client configuration types.
 * Reference: specs/01-pubsub-client.md, research/01-client-configuration.md
 */

import type { CallOptions, RetryOptions, BackoffSettings } from './common';

/**
 * gRPC channel credentials (stub type).
 */
export interface ChannelCredentials {
  _isChannelCredentials: boolean;
}

/**
 * Client configuration extending gRPC options.
 * Reference: research/11-typescript-types.md#clientconfig
 */
export interface ClientConfig {
  /** Google Cloud project ID. */
  projectId?: string;

  /** Path to service account key file. */
  keyFilename?: string;

  /** Service account credentials object. */
  credentials?: {
    client_email?: string;
    private_key?: string;
    type?: string;
  };

  /**
   * Custom API endpoint.
   * Uses PUBSUB_EMULATOR_HOST env var if not set.
   */
  apiEndpoint?: string;

  /** Custom service path. */
  servicePath?: string;

  /** Service port. */
  port?: string | number;

  /** SSL channel credentials. */
  sslCreds?: ChannelCredentials;

  /**
   * Auto-retry on rate limits and transient errors.
   * @default true
   */
  autoRetry?: boolean;

  /** gRPC library override. */
  grpc?: unknown;

  /**
   * Fallback mode.
   * - false: gRPC only
   * - 'rest': REST only
   * - 'proto': HTTP/1.1 with protobuf
   */
  fallback?: boolean | 'rest' | 'proto';
}

/**
 * PubSub client options.
 * Reference: specs/01-pubsub-client.md
 */
export interface PubSubOptions extends ClientConfig {
  /**
   * Emulator mode behavior.
   * - false: Always production
   * - true: Always emulator
   * - undefined: Auto-detect from environment
   */
  emulatorMode?: boolean;

  /**
   * Enable OpenTelemetry tracing.
   * @default false
   */
  enableOpenTelemetryTracing?: boolean;

  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Default PubSub client options.
 */
export const DEFAULT_PUBSUB_OPTIONS: Partial<PubSubOptions> = {
  projectId: 'local-project',
  autoRetry: true,
  enableOpenTelemetryTracing: false
};
```

#### 5.2 `src/types/iam.ts`

```typescript
/**
 * IAM policy types for access control.
 * Reference: research/11-typescript-types.md#iam-types
 */

/**
 * CEL expression for conditional access.
 * Reference: research/11-typescript-types.md#expr
 */
export interface Expr {
  /** CEL expression string. */
  expression: string;

  /** Human-readable title. */
  title?: string;

  /** Description of the condition. */
  description?: string;

  /** Source location info. */
  location?: string;
}

/**
 * Role binding with members.
 * Reference: research/11-typescript-types.md#binding
 */
export interface Binding {
  /** IAM role (e.g., 'roles/pubsub.publisher'). */
  role: string;

  /**
   * Member identities.
   * Formats: user:, serviceAccount:, group:, domain:, allUsers, allAuthenticatedUsers
   */
  members: string[];

  /** Optional condition for the binding. */
  condition?: Expr;
}

/**
 * IAM policy for a resource.
 * Reference: research/11-typescript-types.md#policy
 */
export interface Policy {
  /** Policy version (3 for conditions). */
  version?: number;

  /** Role bindings. */
  bindings?: Binding[];

  /** ETag for optimistic concurrency. */
  etag?: string | Buffer;
}

/**
 * Map of permissions to boolean (has/doesn't have).
 */
export type IamPermissionsMap = Record<string, boolean>;

/**
 * Options for IAM operations.
 */
export interface GetPolicyOptions {
  /** Requested policy version. */
  requestedPolicyVersion?: number;
}

/**
 * Options for setting IAM policy.
 */
export interface SetPolicyOptions {
  /** Policy to set. */
  policy: Policy;
}

/**
 * Common Pub/Sub IAM roles.
 */
export const PubSubRoles = {
  Publisher: 'roles/pubsub.publisher',
  Subscriber: 'roles/pubsub.subscriber',
  Viewer: 'roles/pubsub.viewer',
  Editor: 'roles/pubsub.editor',
  Admin: 'roles/pubsub.admin'
} as const;

/**
 * Common Pub/Sub IAM permissions.
 */
export const PubSubPermissions = {
  // Topic permissions
  TopicsCreate: 'pubsub.topics.create',
  TopicsDelete: 'pubsub.topics.delete',
  TopicsGet: 'pubsub.topics.get',
  TopicsList: 'pubsub.topics.list',
  TopicsPublish: 'pubsub.topics.publish',
  TopicsUpdate: 'pubsub.topics.update',

  // Subscription permissions
  SubscriptionsCreate: 'pubsub.subscriptions.create',
  SubscriptionsDelete: 'pubsub.subscriptions.delete',
  SubscriptionsGet: 'pubsub.subscriptions.get',
  SubscriptionsList: 'pubsub.subscriptions.list',
  SubscriptionsConsume: 'pubsub.subscriptions.consume',
  SubscriptionsUpdate: 'pubsub.subscriptions.update'
} as const;
```

#### 5.3 `src/types/callbacks.ts`

```typescript
/**
 * Callback and response types for async operations.
 * Reference: research/11-typescript-types.md#callback-and-response-types
 */

import type { ServiceError } from './common';
import type { Policy, IamPermissionsMap } from './iam';
import type { TopicMetadata } from './topic';
import type { SubscriptionMetadata, SnapshotMetadata } from './subscription';
import type { ISchema } from './schema';
import type { PubsubMessage } from './message';

// Note: Actual Topic, Subscription, Snapshot, Schema classes are defined
// in their respective implementation files, not in types.

/**
 * Forward declarations for resource types.
 * These provide type safety for response tuples without circular dependencies.
 * Actual implementations are in src/topic.ts, src/subscription.ts, etc.
 */

/** Topic resource interface (forward declaration). */
export interface TopicInstance {
  readonly name: string;
  publishMessage(message: PubsubMessage): Promise<string>;
}

/** Subscription resource interface (forward declaration). */
export interface SubscriptionInstance {
  readonly name: string;
  on(event: 'message', listener: (message: unknown) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}

/** Schema resource interface (forward declaration). */
export interface SchemaInstance {
  readonly id: string;
}

/** Snapshot resource interface (forward declaration). */
export interface SnapshotInstance {
  readonly name: string;
}

// ============================================
// Response Types (Promise return values)
// ============================================

/**
 * Create operations return [resource, metadata].
 */
export type CreateTopicResponse = [TopicInstance, TopicMetadata];
export type CreateSubscriptionResponse = [SubscriptionInstance, SubscriptionMetadata];
export type CreateSchemaResponse = [SchemaInstance, ISchema];
export type CreateSnapshotResponse = [SnapshotInstance, SnapshotMetadata];

/**
 * Get single resource returns [resource, metadata].
 */
export type GetTopicResponse = [TopicInstance, TopicMetadata];
export type GetSubscriptionResponse = [SubscriptionInstance, SubscriptionMetadata];
export type GetSchemaResponse = [SchemaInstance, ISchema];

/**
 * List operations return [resources, nextQuery, apiResponse].
 */
export type GetTopicsResponse = [TopicInstance[], unknown, unknown];
export type GetSubscriptionsResponse = [SubscriptionInstance[], unknown, unknown];
export type GetSnapshotsResponse = [SnapshotInstance[], unknown, unknown];

/**
 * Metadata operations return [metadata].
 */
export type GetTopicMetadataResponse = [TopicMetadata];
export type GetSubscriptionMetadataResponse = [SubscriptionMetadata];

/**
 * Simple response types.
 */
export type EmptyResponse = [unknown];
export type ExistsResponse = [boolean];
export type DetachedResponse = [boolean];

/**
 * IAM responses.
 */
export type GetPolicyResponse = [Policy];
export type SetPolicyResponse = [Policy];
export type TestPermissionsResponse = [IamPermissionsMap, unknown];

// ============================================
// Callback Types
// ============================================

/**
 * Generic callback with single result.
 */
export type NormalCallback<T> = (
  err: ServiceError | null,
  result?: T | null
) => void;

/**
 * Callback for resource creation.
 */
export type ResourceCallback<Resource, Metadata> = (
  err: ServiceError | null,
  resource?: Resource | null,
  metadata?: Metadata | null
) => void;

/**
 * Callback for paginated list operations.
 */
export type PagedCallback<Item, Response> = (
  err: ServiceError | null,
  items?: Item[] | null,
  nextQuery?: unknown | null,
  response?: Response | null
) => void;

/**
 * Specific callback types.
 */
export type CreateTopicCallback = ResourceCallback<TopicInstance, TopicMetadata>;
export type CreateSubscriptionCallback = ResourceCallback<SubscriptionInstance, SubscriptionMetadata>;
export type CreateSchemaCallback = ResourceCallback<SchemaInstance, ISchema>;

export type GetTopicsCallback = PagedCallback<TopicInstance, unknown>;
export type GetSubscriptionsCallback = PagedCallback<SubscriptionInstance, unknown>;

export type EmptyCallback = (err?: Error | null) => void;
export type ExistsCallback = NormalCallback<boolean>;
export type PublishCallback = NormalCallback<string>;

export type GetPolicyCallback = NormalCallback<Policy>;
export type SetPolicyCallback = NormalCallback<Policy>;
export type TestPermissionsCallback = (
  err: ServiceError | null,
  permissions?: IamPermissionsMap | null,
  response?: unknown | null
) => void;

/**
 * Detach subscription callback.
 */
export type DetachSubscriptionCallback = (
  err: ServiceError | null,
  response?: unknown | null
) => void;

/**
 * Seek callback.
 */
export type SeekCallback = (
  err: ServiceError | null,
  response?: unknown | null
) => void;
```

---

### Layer 6: Export Index

#### 6.1 `src/types/index.ts`

```typescript
/**
 * Main type exports for the Pub/Sub library.
 * All public types are re-exported from this file.
 */

// Common types
export type {
  Duration,
  DurationLike,
  ITimestamp,
  PreciseDate,
  ServiceError,
  Long,
  BackoffSettings,
  RetryOptions,
  CallOptions
} from './common';

// Error types
export {
  ErrorCode,
  PubSubError,
  NotFoundError,
  AlreadyExistsError,
  InvalidArgumentError,
  ResourceExhaustedError,
  UnimplementedError,
  InternalError
} from './errors';

// Message types
export type {
  Attributes,
  PubsubMessage,
  MessageOptions,
  MessageProperties
} from './message';
export { AckResponses, AckError } from './message';
export type { AckResponse } from './message';

// Schema types
export type {
  SchemaType,
  SchemaView,
  SchemaEncoding,
  ISchema,
  SchemaSettings,
  SchemaMessageMetadata,
  CreateSchemaOptions,
  ValidateSchemaOptions
} from './schema';
export { SchemaTypes, SchemaViews, Encodings } from './schema';

// Publisher types
export type {
  BatchPublishOptions,
  PublisherFlowControlOptions,
  PublishOptions,
  PublishCallback
} from './publisher';
export {
  DEFAULT_BATCH_OPTIONS,
  DEFAULT_PUBLISHER_FLOW_CONTROL
} from './publisher';

// Subscriber types
export type {
  SubscriberFlowControlOptions,
  BatchOptions,
  MessageStreamOptions,
  SubscriberCloseBehavior,
  SubscriberCloseOptions,
  SubscriberOptions
} from './subscriber';
export {
  SubscriberCloseBehaviors,
  DEFAULT_SUBSCRIBER_FLOW_CONTROL,
  DEFAULT_SUBSCRIBER_BATCH_OPTIONS,
  DEFAULT_STREAMING_OPTIONS
} from './subscriber';

// Topic types
export type {
  MessageStoragePolicy,
  TopicMetadata,
  IngestionDataSourceSettings,
  CreateTopicOptions,
  GetTopicOptions,
  GetTopicsOptions,
  GetTopicSubscriptionsOptions
} from './topic';

// Subscription types
export type {
  PushConfig,
  OidcToken,
  PubSubWrapper,
  NoWrapper,
  DeadLetterPolicy,
  RetryPolicy,
  ExpirationPolicy,
  BigQueryConfig,
  CloudStorageConfig,
  SubscriptionMetadata,
  CreateSubscriptionOptions,
  SubscriptionOptions,
  GetSubscriptionOptions,
  GetSubscriptionsOptions,
  SeekOptions,
  SnapshotMetadata,
  CreateSnapshotOptions
} from './subscription';

// PubSub client types
export type {
  ChannelCredentials,
  ClientConfig,
  PubSubOptions
} from './pubsub';
export { DEFAULT_PUBSUB_OPTIONS } from './pubsub';

// IAM types
export type {
  Expr,
  Binding,
  Policy,
  IamPermissionsMap,
  GetPolicyOptions,
  SetPolicyOptions
} from './iam';
export { PubSubRoles, PubSubPermissions } from './iam';

// Callback and response types
export type {
  TopicInstance,
  SubscriptionInstance,
  SchemaInstance,
  SnapshotInstance,
  CreateTopicResponse,
  CreateSubscriptionResponse,
  CreateSchemaResponse,
  CreateSnapshotResponse,
  GetTopicResponse,
  GetSubscriptionResponse,
  GetSchemaResponse,
  GetTopicsResponse,
  GetSubscriptionsResponse,
  GetSnapshotsResponse,
  GetTopicMetadataResponse,
  GetSubscriptionMetadataResponse,
  EmptyResponse,
  ExistsResponse,
  DetachedResponse,
  GetPolicyResponse,
  SetPolicyResponse,
  TestPermissionsResponse,
  NormalCallback,
  ResourceCallback,
  PagedCallback,
  CreateTopicCallback,
  CreateSubscriptionCallback,
  CreateSchemaCallback,
  GetTopicsCallback,
  GetSubscriptionsCallback,
  EmptyCallback,
  ExistsCallback,
  GetPolicyCallback,
  SetPolicyCallback,
  TestPermissionsCallback,
  DetachSubscriptionCallback,
  SeekCallback
} from './callbacks';
```

---

## Default Values Summary

| Category | Property | Default Value |
|----------|----------|---------------|
| **Publisher Batching** | maxMessages | 100 |
| | maxMilliseconds | 10 |
| | maxBytes | 1,048,576 (1 MB) |
| **Publisher Flow Control** | maxOutstandingMessages | 100 |
| | maxOutstandingBytes | 1,048,576 (1 MB) |
| **Subscriber Flow Control** | maxMessages | 1,000 |
| | maxBytes | 104,857,600 (100 MB) |
| | allowExcessMessages | false |
| **Subscriber Batching** | maxMessages | 3,000 |
| | maxMilliseconds | 100 |
| **Streaming Options** | maxStreams | 5 |
| | timeout | 300,000 (5 min) |
| **Subscriber Deadlines** | minAckDeadline | 10 seconds |
| | maxAckDeadline | 600 seconds |
| | maxExtensionTime | 3,600 seconds (1 hr) |
| **Subscription** | ackDeadlineSeconds | 10 |
| | messageRetentionDuration | 604,800 (7 days) |
| **Dead Letter** | maxDeliveryAttempts | 5 |
| **PubSub Client** | projectId | 'local-project' |
| | autoRetry | true |
| | enableOpenTelemetryTracing | false |

**Unverified Defaults (Require Confirmation):**
- SubscriberCloseOptions.behavior: 'WAIT'
- SubscriberCloseOptions.timeout: 30 seconds

These defaults need verification against @google-cloud/pubsub v5.2.0+ before Phase 1 completion (see AC-007).

---

## Acceptance Criteria

### AC-001: Types Compile Without Errors

```bash
# Create tsconfig.json if needed, then run:
bun run tsc --noEmit

# Expected: No errors
```

### AC-002: All Types Exported from Index

```typescript
// Test file: tests/unit/types/exports.test.ts
import {
  // All types should be importable
  PubSubOptions,
  PublishOptions,
  SubscriptionOptions,
  Attributes,
  PubsubMessage,
  ErrorCode,
  AckResponses,
  SchemaTypes,
  DEFAULT_BATCH_OPTIONS
} from '../src/types';

test('all core types are exported', () => {
  expect(DEFAULT_BATCH_OPTIONS.maxMessages).toBe(100);
  expect(AckResponses.Success).toBe('SUCCESS');
  expect(SchemaTypes.Avro).toBe('AVRO');
  expect(ErrorCode.NOT_FOUND).toBe(5);
});
```

### AC-003: Error Classes Work Correctly

```typescript
// Test file: tests/unit/types/errors.test.ts
import {
  PubSubError,
  NotFoundError,
  AlreadyExistsError,
  InvalidArgumentError,
  ErrorCode
} from '../src/types';

test('NotFoundError has correct code', () => {
  const error = new NotFoundError('my-topic', 'Topic');
  expect(error.code).toBe(ErrorCode.NOT_FOUND);
  expect(error.code).toBe(5);
  expect(error.message).toContain('Topic not found');
  expect(error.message).toContain('my-topic');
  expect(error instanceof PubSubError).toBe(true);
  expect(error instanceof Error).toBe(true);
});

test('AlreadyExistsError has correct code', () => {
  const error = new AlreadyExistsError('my-topic', 'Topic');
  expect(error.code).toBe(ErrorCode.ALREADY_EXISTS);
  expect(error.code).toBe(6);
});

test('InvalidArgumentError accepts details', () => {
  const error = new InvalidArgumentError('Bad input', { field: 'data' });
  expect(error.code).toBe(ErrorCode.INVALID_ARGUMENT);
  expect(error.details).toEqual({ field: 'data' });
});
```

### AC-004: Default Values Match Google SDK

```typescript
// Test file: tests/unit/types/defaults.test.ts
import {
  DEFAULT_BATCH_OPTIONS,
  DEFAULT_PUBLISHER_FLOW_CONTROL,
  DEFAULT_SUBSCRIBER_FLOW_CONTROL,
  DEFAULT_SUBSCRIBER_BATCH_OPTIONS,
  DEFAULT_STREAMING_OPTIONS
} from '../src/types';

test('publisher batching defaults match Google SDK', () => {
  expect(DEFAULT_BATCH_OPTIONS.maxMessages).toBe(100);
  expect(DEFAULT_BATCH_OPTIONS.maxMilliseconds).toBe(10);
  expect(DEFAULT_BATCH_OPTIONS.maxBytes).toBe(1024 * 1024);
});

test('publisher flow control defaults match Google SDK', () => {
  expect(DEFAULT_PUBLISHER_FLOW_CONTROL.maxOutstandingMessages).toBe(100);
  expect(DEFAULT_PUBLISHER_FLOW_CONTROL.maxOutstandingBytes).toBe(1024 * 1024);
});

test('subscriber flow control defaults match Google SDK', () => {
  expect(DEFAULT_SUBSCRIBER_FLOW_CONTROL.maxMessages).toBe(1000);
  expect(DEFAULT_SUBSCRIBER_FLOW_CONTROL.maxBytes).toBe(100 * 1024 * 1024);
  expect(DEFAULT_SUBSCRIBER_FLOW_CONTROL.allowExcessMessages).toBe(false);
});

test('subscriber batching defaults match Google SDK', () => {
  expect(DEFAULT_SUBSCRIBER_BATCH_OPTIONS.maxMessages).toBe(3000);
  expect(DEFAULT_SUBSCRIBER_BATCH_OPTIONS.maxMilliseconds).toBe(100);
});

test('streaming options defaults match Google SDK', () => {
  expect(DEFAULT_STREAMING_OPTIONS.maxStreams).toBe(5);
  expect(DEFAULT_STREAMING_OPTIONS.timeout).toBe(300000);
});
```

### AC-005: Enum Values Match Google SDK

```typescript
// Test file: tests/unit/types/enums.test.ts
import {
  ErrorCode,
  AckResponses,
  SchemaTypes,
  SchemaViews,
  Encodings,
  SubscriberCloseBehaviors
} from '../src/types';

test('error codes match gRPC status codes', () => {
  expect(ErrorCode.OK).toBe(0);
  expect(ErrorCode.CANCELLED).toBe(1);
  expect(ErrorCode.INVALID_ARGUMENT).toBe(3);
  expect(ErrorCode.NOT_FOUND).toBe(5);
  expect(ErrorCode.ALREADY_EXISTS).toBe(6);
  expect(ErrorCode.PERMISSION_DENIED).toBe(7);
  expect(ErrorCode.INTERNAL).toBe(13);
});

test('ack responses match Google SDK', () => {
  expect(AckResponses.Success).toBe('SUCCESS');
  expect(AckResponses.PermissionDenied).toBe('PERMISSION_DENIED');
  expect(AckResponses.FailedPrecondition).toBe('FAILED_PRECONDITION');
  expect(AckResponses.Invalid).toBe('INVALID');
  expect(AckResponses.Other).toBe('OTHER');
});

test('schema types match Google SDK', () => {
  expect(SchemaTypes.Avro).toBe('AVRO');
  expect(SchemaTypes.ProtocolBuffer).toBe('PROTOCOL_BUFFER');
});

test('encodings match Google SDK', () => {
  expect(Encodings.Json).toBe('JSON');
  expect(Encodings.Binary).toBe('BINARY');
});
```

### AC-006: No `any` Types in Exports

```typescript
// Verify manually or with eslint rule
// All exported types should use `unknown` instead of `any`
```

### AC-007: Verify Unconfirmed Default Values

Before Phase 1 completion, verify these defaults against @google-cloud/pubsub v5.2.0+:

**Required Actions:**
1. Install official SDK: `npm install @google-cloud/pubsub@latest`
2. Create test script or inspect actual behavior
3. Verify SubscriberCloseOptions.behavior default
4. Verify SubscriberCloseOptions.timeout default
5. Update research/07-subscriber-config.md with findings
6. Remove "NEEDS VERIFICATION" notes from subscriber.ts

**Test Approach:**
```typescript
// tests/compatibility/defaults-verification.test.ts
import { PubSub, Subscription } from '@google-cloud/pubsub';

test.todo('Verify SubscriberCloseOptions.behavior default is WAIT');
test.todo('Verify SubscriberCloseOptions.timeout default is 30 seconds');

// Test by inspecting SDK behavior or documentation
// Update specs once verified
```

---

## Verification Commands

```bash
# 1. TypeScript compilation
bun run tsc --noEmit

# 2. Run type tests
bun test tests/unit/types/

# 3. Check for any types (requires eslint with @typescript-eslint)
# Should report 0 any types in src/types/

# 4. Verify all exports
bun run -e "import * as types from './src/types'; console.log(Object.keys(types).length, 'exports')"
```

---

## Implementation Notes

1. **Strict Mode**: All files use TypeScript strict mode
2. **No `any`**: Use `unknown` where type is truly unknown
3. **Readonly**: Message properties and const objects use `readonly`
4. **JSDoc**: All public types have JSDoc with `@default` annotations
5. **Const Assertions**: Enum-like objects use `as const`
6. **Export Strategy**:
   - Types exported with `export type` where possible
   - Values (enums, defaults, classes) exported directly
   - All re-exported from `src/types/index.ts`

---

## References

- `research/11-typescript-types.md` - Complete type documentation
- `research/06-publisher-config.md` - Publisher defaults
- `research/07-subscriber-config.md` - Subscriber defaults
- `.claude/rules/typescript-strict.md` - TypeScript rules
- `.claude/rules/typescript-types.md` - API compatibility rules
- `.claude/rules/error-handling.md` - Error handling patterns

---

**Document Version**: 1.0
**Created**: 2026-01-14
**Status**: Ready for Implementation
