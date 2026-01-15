# Error Handling Patterns

Comprehensive guide to error handling implementation details, examples, and patterns for the PubSub library.

## Error Class Hierarchy

### Base Error Class

```typescript
export class PubSubError extends Error {
  constructor(message: string, public readonly code: number, public readonly details?: any) {
    super(message);
    this.name = 'PubSubError';
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### Specific Error Classes

```typescript
export class NotFoundError extends PubSubError {
  constructor(resource: string, resourceType = 'Resource') {
    super(`${resourceType} not found: ${resource}`, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends PubSubError {
  constructor(resource: string, resourceType = 'Resource') {
    super(`${resourceType} already exists: ${resource}`, ErrorCode.ALREADY_EXISTS);
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
  constructor(message: string, details?: any) {
    super(message, ErrorCode.RESOURCE_EXHAUSTED, details);
    this.name = 'ResourceExhaustedError';
  }
}

export class UnimplementedError extends PubSubError {
  constructor(feature: string, suggestion?: string) {
    const message = suggestion
      ? `${feature} not implemented. ${suggestion}`
      : `${feature} not implemented`;
    super(message, ErrorCode.UNIMPLEMENTED);
    this.name = 'UnimplementedError';
  }
}

export class InternalError extends PubSubError {
  constructor(message: string, cause?: Error) {
    super(message, ErrorCode.INTERNAL, cause);
    this.name = 'InternalError';
  }
}
```

## When to Throw Errors

### Input Validation

```typescript
// Validate Buffer type
if (!Buffer.isBuffer(message.data)) {
  throw new InvalidArgumentError(
    'Message data must be a Buffer',
    { received: typeof message.data }
  );
}

// Validate required fields
if (!name || name.trim() === '') {
  throw new InvalidArgumentError('Topic name cannot be empty');
}

// Validate attributes
if (message.attributes) {
  for (const [key, value] of Object.entries(message.attributes)) {
    if (typeof value !== 'string') {
      throw new InvalidArgumentError(
        `Attribute value must be string, got ${typeof value}`,
        { key, value }
      );
    }
  }
}

// Validate ordering key
if (message.orderingKey && typeof message.orderingKey !== 'string') {
  throw new InvalidArgumentError('orderingKey must be a string');
}
```

### Resource Not Found

```typescript
// Topic not found
if (!this.queue.topicExists(fullName)) {
  throw new NotFoundError(fullName, 'Topic');
}

// Subscription not found
if (!this.queue.subscriptionExists(fullName)) {
  throw new NotFoundError(fullName, 'Subscription');
}

// Schema not found
const schema = await this.getSchema(schemaName);
if (!schema) {
  throw new NotFoundError(schemaName, 'Schema');
}
```

### Resource Already Exists

```typescript
// Topic already exists
if (this.queue.topicExists(fullName)) {
  throw new AlreadyExistsError(fullName, 'Topic');
}

// Subscription already exists
if (this.queue.subscriptionExists(fullName)) {
  throw new AlreadyExistsError(fullName, 'Subscription');
}
```

### Feature Not Implemented

```typescript
// Schema type not supported
if (type === SchemaType.AVRO) {
  throw new UnimplementedError(
    'AVRO schemas',
    'Use SchemaType.JSON for validation.'
  );
}

// Encoding not supported
if (encoding === Encoding.BINARY) {
  throw new UnimplementedError(
    'BINARY encoding',
    'Use Encoding.JSON instead.'
  );
}

// Feature flag disabled
if (options.enableExactlyOnceDelivery) {
  throw new UnimplementedError(
    'Exactly-once delivery',
    'This feature is not yet available.'
  );
}
```

### Flow Control Limits

```typescript
// Message count exceeded
if (this.inFlightMessages >= maxMessages) {
  throw new ResourceExhaustedError(
    `Flow control: max messages (${maxMessages}) exceeded`,
    { inFlight: this.inFlightMessages, max: maxMessages }
  );
}

// Byte limit exceeded
if (this.inFlightBytes >= maxBytes) {
  throw new ResourceExhaustedError(
    `Flow control: max bytes (${maxBytes}) exceeded`,
    { inFlight: this.inFlightBytes, max: maxBytes }
  );
}

// Batch size exceeded
if (batchSize > MAX_BATCH_SIZE) {
  throw new ResourceExhaustedError(
    `Batch size (${batchSize}) exceeds maximum (${MAX_BATCH_SIZE})`
  );
}
```

## Error Message Patterns

### Be Specific

```typescript
// ❌ WRONG - Vague
throw new NotFoundError('not found');

// ✅ CORRECT - Specific
throw new NotFoundError('projects/my-project/topics/my-topic', 'Topic');
```

### Include Context

```typescript
// ❌ WRONG - No context
throw new InvalidArgumentError('Invalid data');

// ✅ CORRECT - Context in details
throw new InvalidArgumentError(
  'Message data must be a Buffer',
  { received: typeof message.data, value: message.data }
);
```

### Provide Guidance

```typescript
// ❌ WRONG - No help
throw new UnimplementedError('AVRO schemas');

// ✅ CORRECT - Helpful suggestion
throw new UnimplementedError(
  'AVRO schemas',
  'Use SchemaType.JSON for validation.'
);
```

## Async Error Handling

### Promises - Throw Errors

```typescript
// ✅ CORRECT - Throw in async functions
async publishMessage(message: PubSubMessage): Promise<string> {
  // Validate
  if (!Buffer.isBuffer(message.data)) {
    throw new InvalidArgumentError('Message data must be a Buffer');
  }

  // Check existence
  if (!await this.exists()) {
    throw new NotFoundError(this.name, 'Topic');
  }

  // Publish
  return await this.publisher.publish(message);
}

// Error becomes rejected promise
try {
  const messageId = await topic.publishMessage(message);
} catch (error) {
  console.error('Publish failed:', error);
}
```

### EventEmitters - Emit Errors

```typescript
// ✅ CORRECT - Emit errors, never throw
class Subscription extends EventEmitter {
  private async pullMessages(): Promise<void> {
    try {
      const messages = await this.queue.pull(this.name, this.maxMessages);
      for (const message of messages) {
        this.emit('message', message);
      }
    } catch (error) {
      // Emit error event instead of throwing
      this.emit('error', error instanceof Error ? error : new InternalError('Unknown error'));
    }
  }

  private async startMessageLoop(): Promise<void> {
    while (this.isOpen) {
      try {
        await this.pullMessages();
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Always emit, never throw
        this.emit('error', error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Backoff
      }
    }
  }
}

// ✅ REQUIRED - Always provide error listener
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

// ⚠️ WARNING - Missing error listener crashes process
subscription.on('message', (msg) => msg.ack());
// If error occurs and no listener → unhandled error → crash
```

## Retryable Errors

### Identifying Retryable Errors

```typescript
// Transient errors that can be retried
const RETRYABLE_CODES = [
  ErrorCode.UNAVAILABLE,        // Service temporarily unavailable
  ErrorCode.DEADLINE_EXCEEDED,  // Request timeout
  ErrorCode.RESOURCE_EXHAUSTED, // Rate limit or quota
  ErrorCode.ABORTED,            // Concurrency conflict
  ErrorCode.INTERNAL            // Internal error
];

export function isRetryable(error: PubSubError): boolean {
  return RETRYABLE_CODES.includes(error.code);
}
```

### Retry Logic Implementation

```typescript
async function publishWithRetry(
  topic: Topic,
  message: PubSubMessage,
  maxRetries = 3
): Promise<string> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await topic.publishMessage(message);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof PubSubError && isRetryable(error)) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  throw lastError!;
}
```

### Wrapping Internal Errors

```typescript
// ✅ CORRECT - Wrap with context
try {
  await this.queue.publish(topicName, message);
} catch (error) {
  throw new InternalError(
    'Failed to publish to message queue',
    error instanceof Error ? error : undefined
  );
}

// ✅ CORRECT - Preserve original error
try {
  const result = await externalService.call();
} catch (error) {
  throw new InternalError(
    `External service failed: ${(error as Error).message}`,
    error instanceof Error ? error : undefined
  );
}
```

## Testing Errors

### Testing Error Throwing

```typescript
test('throws InvalidArgumentError when data is not Buffer', async () => {
  const topic = pubsub.topic('test-topic');
  await topic.create();

  await expect(
    topic.publishMessage({ data: 'invalid' as any })
  ).rejects.toThrow(InvalidArgumentError);
});

test('throws NotFoundError when topic does not exist', async () => {
  const topic = pubsub.topic('non-existent');

  await expect(
    topic.publishMessage({ data: Buffer.from('test') })
  ).rejects.toThrow(NotFoundError);
});

test('throws AlreadyExistsError when creating duplicate topic', async () => {
  await pubsub.createTopic('test-topic');

  await expect(
    pubsub.createTopic('test-topic')
  ).rejects.toThrow(AlreadyExistsError);
});
```

### Testing Error Codes

```typescript
test('error has correct gRPC code', async () => {
  const topic = pubsub.topic('non-existent');

  try {
    await topic.publishMessage({ data: Buffer.from('test') });
    fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(PubSubError);
    expect((error as PubSubError).code).toBe(ErrorCode.NOT_FOUND);
  }
});

test('InvalidArgumentError has code 3', async () => {
  const topic = pubsub.topic('test');
  await topic.create();

  try {
    await topic.publishMessage({ data: 'invalid' as any });
    fail('Should have thrown');
  } catch (error) {
    expect((error as PubSubError).code).toBe(ErrorCode.INVALID_ARGUMENT);
  }
});
```

### Testing Error Details

```typescript
test('error includes helpful details', async () => {
  const topic = pubsub.topic('test');
  await topic.create();

  try {
    await topic.publishMessage({ data: 'not-a-buffer' as any });
    fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidArgumentError);
    expect((error as InvalidArgumentError).details).toEqual({
      received: 'string'
    });
  }
});
```

### Testing EventEmitter Errors

```typescript
test('subscription emits error on failure', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let errorEmitted: Error | null = null;
  subscription.on('error', (error) => {
    errorEmitted = error;
  });

  subscription.open();

  // Simulate error condition
  await topic.delete();

  await new Promise(resolve => setTimeout(resolve, 100));

  expect(errorEmitted).not.toBeNull();
  expect(errorEmitted).toBeInstanceOf(PubSubError);
});
```

### Testing Retryable Errors

```typescript
test('isRetryable returns true for transient errors', () => {
  const unavailableError = new PubSubError('Service unavailable', ErrorCode.UNAVAILABLE);
  expect(isRetryable(unavailableError)).toBe(true);

  const notFoundError = new NotFoundError('topic-1', 'Topic');
  expect(isRetryable(notFoundError)).toBe(false);
});

test('publishWithRetry retries on transient errors', async () => {
  let attempts = 0;
  const mockPublish = jest.fn(async () => {
    attempts++;
    if (attempts < 3) {
      throw new PubSubError('Unavailable', ErrorCode.UNAVAILABLE);
    }
    return 'msg-123';
  });

  const result = await publishWithRetry(mockPublish);

  expect(result).toBe('msg-123');
  expect(attempts).toBe(3);
});
```

## JSDoc Error Documentation

### Basic Error Documentation

```typescript
/**
 * Publishes a message to the topic.
 *
 * @param message - The message to publish
 * @returns Promise resolving to message ID
 * @throws {NotFoundError} Topic does not exist
 * @throws {InvalidArgumentError} Invalid message data or attributes
 */
async publishMessage(message: PubSubMessage): Promise<string>
```

### Comprehensive Documentation

```typescript
/**
 * Creates a subscription to this topic.
 *
 * @param name - Subscription name
 * @param options - Subscription configuration
 * @returns Promise resolving to [Subscription, response metadata] tuple
 * @throws {AlreadyExistsError} Subscription already exists
 * @throws {NotFoundError} Topic does not exist
 * @throws {InvalidArgumentError} Invalid subscription name or options
 * @throws {UnimplementedError} Feature not yet supported (e.g., dead letter topic)
 *
 * @example
 * ```typescript
 * const [subscription] = await topic.createSubscription('my-sub', {
 *   ackDeadlineSeconds: 60
 * });
 * ```
 */
async createSubscription(
  name: string,
  options?: SubscriptionOptions
): Promise<[Subscription, any]>
```

### EventEmitter Error Events

```typescript
/**
 * Streaming pull subscription.
 *
 * @fires Subscription#message - When a message is received
 * @fires Subscription#error - When an error occurs (listener required)
 * @fires Subscription#close - When subscription is closed
 *
 * @example
 * ```typescript
 * subscription.on('message', (message) => {
 *   console.log(message.data.toString());
 *   message.ack();
 * });
 *
 * subscription.on('error', (error) => {
 *   console.error('Error:', error);
 * });
 * ```
 */
export class Subscription extends EventEmitter
```

## Complete Error Examples

### Publishing with Full Error Handling

```typescript
async function publishSafely(
  topic: Topic,
  data: string
): Promise<string | null> {
  try {
    // Validate input
    const buffer = Buffer.from(data);
    if (buffer.length === 0) {
      throw new InvalidArgumentError('Message data cannot be empty');
    }

    // Publish
    const messageId = await topic.publishMessage({ data: buffer });
    console.log(`Published: ${messageId}`);
    return messageId;

  } catch (error) {
    if (error instanceof NotFoundError) {
      console.error('Topic not found, creating it...');
      await topic.create();
      return publishSafely(topic, data); // Retry
    }

    if (error instanceof InvalidArgumentError) {
      console.error('Invalid message:', error.message);
      return null; // Don't retry
    }

    if (error instanceof PubSubError && isRetryable(error)) {
      console.warn('Retryable error, trying again...', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return publishSafely(topic, data); // Retry
    }

    // Unknown error
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

### Subscription with Error Handling

```typescript
function setupSubscription(subscription: Subscription): void {
  // Required: error listener
  subscription.on('error', (error) => {
    if (error instanceof PubSubError) {
      console.error(`PubSub error [${error.code}]:`, error.message);

      if (isRetryable(error)) {
        console.log('Will retry automatically...');
      } else {
        console.error('Fatal error, closing subscription');
        subscription.close();
      }
    } else {
      console.error('Unexpected error:', error);
    }
  });

  // Message handler with error handling
  subscription.on('message', async (message) => {
    try {
      await processMessage(message);
      message.ack();
    } catch (error) {
      console.error('Message processing failed:', error);
      message.nack();
    }
  });

  // Cleanup
  subscription.on('close', () => {
    console.log('Subscription closed');
  });

  subscription.open();
}
```
