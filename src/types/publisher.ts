/**
 * Publisher configuration types.
 * Reference: specs/05-publisher.md, research/06-publisher-config.md
 */

import type { CallOptions } from './common';
import type { Attributes, PubsubMessage } from './message';

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

  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
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

/**
 * Flow-controlled publisher interface returned by Topic.flowControlled().
 * Reference: specs/02-topic.md
 */
export interface FlowControlledPublisher {
  /** Publish data with optional attributes. */
  publish(data: Buffer, attributes?: Attributes): Promise<string>;
  /** Publish a complete message object. */
  publishMessage(message: PubsubMessage): Promise<string>;
}
