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
