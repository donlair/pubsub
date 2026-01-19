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
  CallOptions,
  PageOptions
} from './common';

// Error types
export {
  ErrorCode,
  PubSubError,
  NotFoundError,
  AlreadyExistsError,
  InvalidArgumentError,
  ResourceExhaustedError,
  FailedPreconditionError,
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
  SchemaDefinition,
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
  PublishCallback,
  FlowControlledPublisher
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
  DEFAULT_STREAMING_OPTIONS,
  DEFAULT_SUBSCRIBER_CLOSE_BEHAVIOR
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
  CreateSnapshotOptions,
  PullOptions
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
