# Rule: Error Handling

## Purpose

Define consistent error handling patterns that match Google Cloud Pub/Sub error behavior. Errors must use gRPC status codes and provide clear, actionable messages.

## Error Code System

Use Google Cloud gRPC status codes:

```typescript
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
```

## Error Class Hierarchy

```typescript
// Base error class
export class PubSubError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'PubSubError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
export class NotFoundError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(
      `${resourceType} not found: ${resource}`,
      ErrorCode.NOT_FOUND
    );
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends PubSubError {
  constructor(resource: string, resourceType: string = 'Resource') {
    super(
      `${resourceType} already exists: ${resource}`,
      ErrorCode.ALREADY_EXISTS
    );
    this.name = 'AlreadyExistsError';
  }
}

export class InvalidArgumentError extends PubSubError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.INVALID_ARGUMENT, details);
    this.name = 'InvalidArgumentError';
  }
}

export class ResourceExhaustedError extends PubSubError {
  constructor(message: string) {
    super(message, ErrorCode.RESOURCE_EXHAUSTED);
    this.name = 'ResourceExhaustedError';
  }
}

export class UnimplementedError extends PubSubError {
  constructor(feature: string, suggestion?: string) {
    const message = suggestion
      ? `${feature} not yet implemented. ${suggestion}`
      : `${feature} not yet implemented.`;
    super(message, ErrorCode.UNIMPLEMENTED);
    this.name = 'UnimplementedError';
  }
}

export class InternalError extends PubSubError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.INTERNAL, { cause });
    this.name = 'InternalError';
  }
}
```

## When to Throw Errors

### Input Validation

```typescript
// ✅ CORRECT - Validate inputs early
class Topic {
  publishMessage(message: PubSubMessage): Promise<string> {
    // Validate data is Buffer
    if (!Buffer.isBuffer(message.data)) {
      throw new InvalidArgumentError(
        'Message data must be a Buffer',
        { received: typeof message.data }
      );
    }

    // Validate size
    if (message.data.length > 10 * 1024 * 1024) {
      throw new InvalidArgumentError(
        'Message size exceeds maximum of 10MB',
        { size: message.data.length }
      );
    }

    // Validate attributes
    if (message.attributes) {
      for (const [key, value] of Object.entries(message.attributes)) {
        if (typeof value !== 'string') {
          throw new InvalidArgumentError(
            `Attribute '${key}' must be a string`,
            { key, value: typeof value }
          );
        }
      }
    }

    // Implementation
  }
}
```

### Resource Not Found

```typescript
// ✅ CORRECT - Clear resource identification
class PubSub {
  async getTopic(name: string): Promise<[Topic, any]> {
    const fullName = this.formatTopicName(name);

    if (!this.queue.topicExists(fullName)) {
      throw new NotFoundError(fullName, 'Topic');
    }

    const topic = this.topic(name);
    const metadata = this.queue.getTopic(fullName);
    return [topic, metadata];
  }
}
```

### Resource Already Exists

```typescript
// ✅ CORRECT - Prevent duplicates
class PubSub {
  async createTopic(name: string): Promise<[Topic, any]> {
    const fullName = this.formatTopicName(name);

    if (this.queue.topicExists(fullName)) {
      throw new AlreadyExistsError(fullName, 'Topic');
    }

    // Create topic
    this.queue.registerTopic(fullName);
    const topic = this.topic(name);
    return [topic, { name: fullName }];
  }
}
```

### Not Implemented Features

```typescript
// ✅ CORRECT - Clear about limitations
class Schema {
  async create(type: SchemaType, definition: string): Promise<[Schema, any]> {
    if (type === SchemaType.AVRO) {
      throw new UnimplementedError(
        'AVRO schemas',
        'Use SchemaType.JSON for validation.'
      );
    }

    if (type === SchemaType.PROTOCOL_BUFFER) {
      throw new UnimplementedError(
        'Protocol Buffer schemas',
        'Use SchemaType.JSON for validation.'
      );
    }

    // JSON implementation
  }
}
```

### Resource Exhausted

```typescript
// ✅ CORRECT - Flow control limits
class MessageStream {
  private checkFlowControl(): void {
    if (this.inFlightMessages >= this.options.flowControl.maxMessages) {
      throw new ResourceExhaustedError(
        `Flow control: max messages (${this.options.flowControl.maxMessages}) exceeded`
      );
    }

    if (this.inFlightBytes >= this.options.flowControl.maxBytes) {
      throw new ResourceExhaustedError(
        `Flow control: max bytes (${this.options.flowControl.maxBytes}) exceeded`
      );
    }
  }
}
```

## Error Message Format

### Clear and Specific

```typescript
// ✅ GOOD - Specific message
throw new NotFoundError(
  'projects/my-project/topics/my-topic',
  'Topic'
);
// Error: Topic not found: projects/my-project/topics/my-topic

// ❌ BAD - Vague message
throw new Error('Not found');
```

### Include Context

```typescript
// ✅ GOOD - Includes context
throw new InvalidArgumentError(
  'Ordering key cannot be empty when message ordering is enabled',
  { orderingKey: message.orderingKey }
);

// ❌ BAD - No context
throw new Error('Invalid ordering key');
```

### Actionable Guidance

```typescript
// ✅ GOOD - Tells user what to do
throw new UnimplementedError(
  'AVRO schemas',
  'Use SchemaType.JSON for validation, or install avro validation library.'
);

// ❌ BAD - No guidance
throw new Error('Not implemented');
```

## Async Error Handling

### Rejected Promises

```typescript
// ✅ CORRECT - Async throws become rejections
class Topic {
  async publishMessage(message: PubSubMessage): Promise<string> {
    if (!await this.exists()) {
      throw new NotFoundError(this.name, 'Topic');
    }

    return await this.publisher.publish(message);
  }
}

// Usage
try {
  const messageId = await topic.publishMessage(message);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Topic does not exist');
  }
}
```

### Event Emitter Errors

```typescript
// ✅ CORRECT - Emit errors, don't throw
class Subscription extends EventEmitter {
  private handleError(error: Error): void {
    // Don't throw - emit error event
    this.emit('error', error);
  }

  private async pullMessages(): Promise<void> {
    try {
      const messages = await this.queue.pull(this.name, this.maxMessages);
      // Process messages
    } catch (error) {
      // Emit error instead of throwing
      this.handleError(
        error instanceof Error
          ? error
          : new InternalError('Unknown error during message pull')
      );
    }
  }
}

// Usage
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});
```

## Error Recovery

### Retryable vs Non-Retryable

```typescript
// ✅ GOOD - Identify retryable errors
function isRetryableError(error: PubSubError): boolean {
  return [
    ErrorCode.UNAVAILABLE,
    ErrorCode.DEADLINE_EXCEEDED,
    ErrorCode.RESOURCE_EXHAUSTED,
    ErrorCode.ABORTED,
    ErrorCode.INTERNAL
  ].includes(error.code);
}

// Use in retry logic
async function publishWithRetry(
  topic: Topic,
  message: PubSubMessage,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await topic.publishMessage(message);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof PubSubError && isRetryableError(error)) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
        continue;
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  throw lastError!;
}
```

## Error Context Preservation

### Wrap Internal Errors

```typescript
// ✅ CORRECT - Preserve cause
class MessageQueue {
  publish(topicName: string, messages: InternalMessage[]): string[] {
    try {
      // Internal logic
      return messageIds;
    } catch (error) {
      throw new InternalError(
        'Failed to publish messages to queue',
        error instanceof Error ? error : undefined
      );
    }
  }
}
```

## Testing Error Conditions

### Test All Error Cases

```typescript
test('publishMessage throws when data is not Buffer', async () => {
  const topic = pubsub.topic('test-topic');
  await topic.create();

  await expect(
    topic.publishMessage({ data: 'not a buffer' as any })
  ).rejects.toThrow(InvalidArgumentError);
});

test('getTopic throws NotFoundError for non-existent topic', async () => {
  await expect(
    pubsub.getTopic('non-existent')
  ).rejects.toThrow(NotFoundError);
});

test('error includes correct error code', async () => {
  try {
    await pubsub.getTopic('non-existent');
    fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as PubSubError).code).toBe(ErrorCode.NOT_FOUND);
  }
});
```

## Error Documentation

Document errors in JSDoc:

```typescript
/**
 * Publishes a message to the topic.
 *
 * @param message - The message to publish
 * @returns Promise resolving to message ID
 *
 * @throws {NotFoundError} Topic does not exist
 * @throws {InvalidArgumentError} Invalid message data or attributes
 * @throws {ResourceExhaustedError} Flow control limits exceeded
 *
 * @example
 * ```typescript
 * try {
 *   const messageId = await topic.publishMessage({
 *     data: Buffer.from('Hello')
 *   });
 * } catch (error) {
 *   if (error instanceof NotFoundError) {
 *     console.error('Topic not found');
 *   }
 * }
 * ```
 */
async publishMessage(message: PubSubMessage): Promise<string> {
  // Implementation
}
```

## Common Error Scenarios

### Topic Operations

```typescript
// Topic not found
throw new NotFoundError(topicName, 'Topic');

// Topic already exists
throw new AlreadyExistsError(topicName, 'Topic');

// Invalid topic name format
throw new InvalidArgumentError('Topic name must be non-empty');
```

### Subscription Operations

```typescript
// Subscription not found
throw new NotFoundError(subscriptionName, 'Subscription');

// Subscription already exists
throw new AlreadyExistsError(subscriptionName, 'Subscription');

// Topic required for subscription
throw new InvalidArgumentError('Topic is required to create subscription');
```

### Publishing

```typescript
// Invalid message data
throw new InvalidArgumentError('Message data must be a Buffer');

// Message too large
throw new InvalidArgumentError('Message exceeds maximum size of 10MB');

// Invalid attributes
throw new InvalidArgumentError('All attribute values must be strings');

// Ordering key without ordering enabled
throw new InvalidArgumentError(
  'Message ordering must be enabled to use ordering keys'
);

// Empty ordering key
throw new InvalidArgumentError('Ordering key cannot be empty');
```

### Acknowledgment

```typescript
// Invalid ack ID
throw new InvalidArgumentError('Invalid ack ID');

// Ack deadline out of range
throw new InvalidArgumentError('Ack deadline must be between 0 and 600 seconds');
```

## Best Practices

1. **Use specific error types** - Not generic Error
2. **Include error codes** - Always use gRPC status codes
3. **Clear messages** - Explain what went wrong
4. **Add context** - Include relevant details in error
5. **Actionable guidance** - Tell user how to fix it
6. **Preserve cause** - Wrap internal errors with cause
7. **Test all errors** - Write tests for error conditions
8. **Document errors** - List possible errors in JSDoc
9. **Emit vs throw** - Use emit for EventEmitter errors
10. **Retry logic** - Identify retryable errors

## Error Handling Checklist

Before committing:
- [ ] All errors use PubSubError or subclasses
- [ ] All errors have correct gRPC status codes
- [ ] Error messages are clear and specific
- [ ] Errors include relevant context/details
- [ ] Async errors properly rejected (not thrown synchronously)
- [ ] EventEmitter errors emitted (not thrown)
- [ ] All error cases have tests
- [ ] Errors documented in JSDoc
- [ ] Internal errors wrapped with context
- [ ] Retryable errors identified
