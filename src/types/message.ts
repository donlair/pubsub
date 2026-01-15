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
