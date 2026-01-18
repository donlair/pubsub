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

  /**
   * Pull interval in milliseconds.
   * Controls how frequently messages are pulled from the queue.
   * Lower values = higher throughput, higher CPU usage.
   * Higher values = lower CPU usage, higher latency.
   * @default 10
   */
  pullInterval?: number;

  /**
   * Max messages per pull.
   * Controls batch size for each pull operation.
   * Higher values = higher throughput, larger latency spikes.
   * Lower values = smoother latency, lower throughput.
   * @default 100
   */
  maxPullSize?: number;
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
 *
 * Verified against @google-cloud/pubsub source (2026-01-15):
 * https://github.com/googleapis/nodejs-pubsub/blob/main/src/subscriber.ts
 */
export interface SubscriberCloseOptions {
  /**
   * Close behavior (NACK or WAIT).
   * - NACK: Immediately nack all pending messages (most closely matches old behavior)
   * - WAIT: Continue normal processing until close to timeout, then nack
   * @default 'WAIT'
   */
  behavior?: SubscriberCloseBehavior;

  /**
   * Max time to wait for pending operations.
   * If not specified, defaults to maxExtensionTime (3600 seconds / 1 hour).
   * @default maxExtensionTime (3600 seconds)
   */
  timeout?: Duration;
}

/**
 * Complete subscriber configuration.
 * Reference: research/11-typescript-types.md#subscriberoptions
 */
export interface SubscriberOptions {
  /**
   * Acknowledgment deadline in seconds.
   * Time a message has before being redelivered if not acknowledged.
   * Range: 10-600 seconds (10 seconds to 10 minutes).
   * This is distinct from minAckDeadline/maxAckDeadline which set bounds for automatic extension.
   * @default 10
   */
  ackDeadline?: number;

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
  timeout: 300000,     // 5 minutes
  pullInterval: 10,    // 10ms
  maxPullSize: 100     // 100 messages
};

/**
 * Default subscriber close options.
 * Note: timeout uses maxExtensionTime by default (3600 seconds),
 * so we don't define it here - it's computed at runtime.
 */
export const DEFAULT_SUBSCRIBER_CLOSE_BEHAVIOR: SubscriberCloseBehavior = 'WAIT';
