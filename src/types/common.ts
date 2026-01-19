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
 *
 * **In-Memory Implementation Note:** These settings are accepted for API compatibility
 * with @google-cloud/pubsub but have no runtime effect in this local implementation.
 * This is an in-memory message broker with no gRPC calls or network operations.
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
 *
 * **In-Memory Implementation Note:** These settings are accepted for API compatibility
 * with @google-cloud/pubsub but have no runtime effect in this local implementation.
 * This is an in-memory message broker with no gRPC calls or network operations.
 */
export interface RetryOptions {
  /** Retryable error codes. */
  retryCodes?: number[];
  /** Backoff settings. */
  backoffSettings?: BackoffSettings;
}

/**
 * gRPC call options.
 *
 * **In-Memory Implementation Note:** Most of these settings (timeout, retry) are accepted
 * for API compatibility with @google-cloud/pubsub but have no runtime effect in this local
 * implementation. This is an in-memory message broker with no gRPC calls or network operations.
 * Pagination options (autoPaginate, pageToken, maxResults) may be used for list operations.
 *
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

/**
 * Pagination options for list operations.
 *
 * **In-Memory Implementation Note:** The gaxOpts property is accepted for API compatibility
 * but most gRPC-related options within it have no runtime effect. Pagination options
 * (autoPaginate, maxResults, pageToken, pageSize) may be used for list operations.
 *
 * Reference: specs/01-pubsub-client.md
 */
export interface PageOptions {
  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
  gaxOpts?: CallOptions;
  /** Enable auto-pagination. */
  autoPaginate?: boolean;
  /** Maximum results per page. */
  maxResults?: number;
  /** Page token for next page. */
  pageToken?: string;
  /** Page size. */
  pageSize?: number;
}
