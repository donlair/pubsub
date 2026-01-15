/**
 * Internal types for message queue implementation.
 * These types are not exposed in the public API.
 */

import type { Attributes } from '../types/message';
import type { PreciseDate } from '../types/common';

/**
 * Internal message structure used within MessageQueue.
 * Extended with additional fields for tracking.
 */
export interface InternalMessage {
  /** Unique message ID. */
  id: string;

  /** Message payload. */
  data: Buffer;

  /** Message attributes. */
  attributes: Attributes;

  /** Server publish timestamp. */
  publishTime: PreciseDate;

  /** Ordering key for ordered delivery. */
  orderingKey?: string;

  /** Delivery attempt counter (1-based). */
  deliveryAttempt: number;

  /** Message size in bytes (data + attributes). */
  length: number;

  /** Acknowledgment ID (unique per delivery attempt). */
  ackId?: string;
}

/**
 * Tracks in-flight messages with ack deadline.
 */
export interface MessageLease {
  /** The message being tracked. */
  message: InternalMessage;

  /** Acknowledgment ID for this lease. */
  ackId: string;

  /** Subscription this message belongs to. */
  subscription: string;

  /** Ack deadline timestamp. */
  deadline: Date;

  /** Number of times deadline has been extended. */
  deadlineExtensions: number;

  /** Timer handle for deadline expiry. */
  timer?: ReturnType<typeof setTimeout>;
}
