/**
 * Subscription types and metadata.
 * Reference: specs/03-subscription.md, research/03-subscription-api.md
 */

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
  textConfig?: Record<string, never>;

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

  /** Ack deadline in seconds (10-600). */
  ackDeadlineSeconds?: number;

  /** Enable message ordering for this subscription. */
  enableMessageOrdering?: boolean;
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
  /** Filter by topic. */
  topic?: string | unknown;

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

/**
 * Options for pull() method to fetch messages.
 * Reference: specs/03-subscription.md
 */
export interface PullOptions {
  /** Maximum messages to pull. */
  maxMessages?: number;
  /** Return immediately if no messages (deprecated, always false). */
  returnImmediately?: boolean;
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}
