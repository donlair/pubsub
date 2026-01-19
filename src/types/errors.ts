/**
 * Error types matching gRPC status codes.
 * Reference: .claude/rules/error-handling.md
 */

/**
 * gRPC status codes used by Google Cloud APIs.
 * https://grpc.io/docs/guides/status-codes/
 */
export enum ErrorCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16
}

/**
 * Base error class for all Pub/Sub errors.
 */
export class PubSubError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PubSubError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Resource not found error. Code: 5
 */
export class NotFoundError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(`${resourceType} not found: ${resource}`, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Resource already exists error. Code: 6
 */
export class AlreadyExistsError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(`${resourceType} already exists: ${resource}`, ErrorCode.ALREADY_EXISTS);
    this.name = 'AlreadyExistsError';
  }
}

/**
 * Invalid argument error. Code: 3
 */
export class InvalidArgumentError extends PubSubError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.INVALID_ARGUMENT, details);
    this.name = 'InvalidArgumentError';
  }
}

/**
 * Resource exhausted error (flow control). Code: 8
 */
export class ResourceExhaustedError extends PubSubError {
  constructor(message: string) {
    super(message, ErrorCode.RESOURCE_EXHAUSTED);
    this.name = 'ResourceExhaustedError';
  }
}

/**
 * Feature not implemented error. Code: 12
 */
export class UnimplementedError extends PubSubError {
  constructor(feature: string, suggestion?: string) {
    const message = suggestion
      ? `${feature} is not implemented. ${suggestion}`
      : `${feature} is not implemented.`;
    super(message, ErrorCode.UNIMPLEMENTED);
    this.name = 'UnimplementedError';
  }
}

/**
 * Failed precondition error. Code: 9
 */
export class FailedPreconditionError extends PubSubError {
  constructor(message: string) {
    super(message, ErrorCode.FAILED_PRECONDITION);
    this.name = 'FailedPreconditionError';
  }
}

/**
 * Internal error. Code: 13
 */
export class InternalError extends PubSubError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.INTERNAL, { cause });
    this.name = 'InternalError';
  }
}
