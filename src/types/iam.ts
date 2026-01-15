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
