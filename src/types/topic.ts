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
  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
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

  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
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

  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
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

  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
  gaxOpts?: CallOptions;

  /** Enable auto-pagination. */
  autoPaginate?: boolean;
}
