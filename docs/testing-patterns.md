# Testing Patterns

Detailed examples and patterns for testing with Bun's test runner.

## TDD Workflow Examples

### ❌ NEVER Do This

```typescript
// Writing implementation first
class Topic {
  publishMessage(message: PubSubMessage): Promise<string> {
    // Implementation
  }
}

// Then writing tests
test('publishMessage works', () => { /* Test */ });
```

### ✅ ALWAYS Do This

```typescript
// 1. Write test FIRST based on spec
test('publishMessage returns message ID', async () => {
  const topic = pubsub.topic('test-topic');
  await topic.create();

  const messageId = await topic.publishMessage({
    data: Buffer.from('test')
  });

  expect(messageId).toBeDefined();
  expect(typeof messageId).toBe('string');
});

// 2. Run test (it should FAIL)
// 3. Write minimal implementation to make it pass
// 4. Refactor if needed
// 5. Repeat
```

## Full Test Template

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../src';

describe('ComponentName', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterEach(() => {
    // Cleanup
  });

  describe('methodName', () => {
    test('should do X when Y', async () => {
      // Arrange
      const topic = pubsub.topic('test-topic');
      await topic.create();

      // Act
      const result = await topic.publishMessage({
        data: Buffer.from('test')
      });

      // Assert
      expect(result).toBeDefined();
    });

    test('should throw when invalid input', async () => {
      const topic = pubsub.topic('test-topic');

      await expect(
        topic.publishMessage({ data: 'not a buffer' as any })
      ).rejects.toThrow('Message data must be a Buffer');
    });
  });
});
```

## Arrange-Act-Assert Pattern

```typescript
test('should publish message and return ID', async () => {
  // Arrange - Set up test data and preconditions
  const topic = pubsub.topic('test-topic');
  await topic.create();
  const message = {
    data: Buffer.from('Hello World'),
    attributes: { key: 'value' }
  };

  // Act - Execute the code being tested
  const messageId = await topic.publishMessage(message);

  // Assert - Verify the results
  expect(messageId).toBeDefined();
  expect(typeof messageId).toBe('string');
  expect(messageId.length).toBeGreaterThan(0);
});
```

## Key Assertions Reference

```typescript
// Equality
expect(value).toBe(expected);           // Strict (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).not.toBe(expected);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeUndefined();
expect(value).toBeNull();

// Numbers
expect(value).toBeGreaterThan(5);
expect(value).toBeLessThan(10);
expect(value).toBeCloseTo(3.14, 2);

// Strings & Arrays
expect(string).toContain('substring');
expect(string).toMatch(/regex/);
expect(array).toHaveLength(5);

// Objects
expect(object).toHaveProperty('key');
expect(object).toHaveProperty('key', 'value');
expect(object).toMatchObject({ key: 'value' });

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');
expect(() => fn()).toThrow(ErrorClass);

// Async
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

## Async Tests Examples

```typescript
// ✅ CORRECT - Always use async/await
test('async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});

// ❌ WRONG - Forgetting await
test('async operation', async () => {
  someAsyncFunction(); // Missing await - test passes incorrectly
  expect(true).toBe(true);
});

// ✅ CORRECT - Testing promise rejection
test('promise rejection', async () => {
  await expect(
    topic.publishMessage({ data: 'invalid' as any })
  ).rejects.toThrow();
});
```

## Test Patterns

### Testing Error Conditions

```typescript
test('should throw NotFoundError when topic does not exist', async () => {
  const topic = pubsub.topic('non-existent');

  await expect(
    topic.publishMessage({ data: Buffer.from('test') })
  ).rejects.toThrow('Topic not found');
});

test('should throw with specific error code', async () => {
  try {
    await topic.publishMessage({ data: Buffer.from('test') });
    fail('Should have thrown');
  } catch (error: any) {
    expect(error.code).toBe(5); // NOT_FOUND
    expect(error.message).toContain('Topic not found');
  }
});
```

### Testing Event Emitters

```typescript
test('should emit message event', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let receivedMessage: Message | null = null;

  subscription.on('message', (message) => {
    receivedMessage = message;
    message.ack();
  });

  subscription.open();
  await topic.publishMessage({ data: Buffer.from('test') });

  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(receivedMessage).not.toBeNull();
  expect(receivedMessage!.data.toString()).toBe('test');
});
```

### Testing Timing and Batching

```typescript
test('should batch messages based on time', async () => {
  const topic = pubsub.topic('test-topic');
  await topic.create();

  topic.setPublishOptions({
    batching: { maxMessages: 1000, maxMilliseconds: 50 }
  });

  const startTime = Date.now();
  await topic.publishMessage({ data: Buffer.from('test') });
  const duration = Date.now() - startTime;

  expect(duration).toBeGreaterThanOrEqual(45);
  expect(duration).toBeLessThan(100);
});
```

### Testing Concurrent Operations

```typescript
test('should handle concurrent publishes', async () => {
  const topic = pubsub.topic('test-topic');
  await topic.create();

  const promises = Array.from({ length: 100 }, (_, i) =>
    topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
  );

  const messageIds = await Promise.all(promises);

  expect(messageIds).toHaveLength(100);
  expect(new Set(messageIds).size).toBe(100); // All unique
});
```

## Unit vs Integration Tests

### Unit Tests

Test single component in isolation with mocked dependencies. Fast execution (<100ms). Located in `tests/unit/`.

```typescript
test('message.ack() marks message as acknowledged', () => {
  const message = new Message('id', 'ackId', Buffer.from('test'), {}, new Date(), mockSubscription);
  message.ack();
  expect(message.acknowledged).toBe(true);
});
```

### Integration Tests

Test multiple components together with no (or minimal) mocks. Slower execution. Located in `tests/integration/`.

```typescript
test('message published to topic is received by subscription', async () => {
  const pubsub = new PubSub();
  const topic = pubsub.topic('test-topic');
  await topic.create();

  const subscription = topic.subscription('test-sub');
  await subscription.create();

  const receivedMessages: Message[] = [];
  subscription.on('message', (message) => {
    receivedMessages.push(message);
    message.ack();
  });

  subscription.open();
  await topic.publishMessage({ data: Buffer.from('Hello') });
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(receivedMessages).toHaveLength(1);
  expect(receivedMessages[0].data.toString()).toBe('Hello');
});
```

## Compatibility Tests

Test API compatibility with Google Pub/Sub. Located in `tests/compatibility/`.

```typescript
test('PubSub constructor matches Google API', () => {
  const pubsub = new PubSub({
    projectId: 'test-project',
    keyFilename: '/path/to/key.json'
  });

  expect(pubsub.projectId).toBe('test-project');
});

test('Topic.publishMessage signature matches Google API', async () => {
  const topic = pubsub.topic('test');
  await topic.create();

  const messageId = await topic.publishMessage({
    data: Buffer.from('test'),
    attributes: { key: 'value' },
    orderingKey: 'key-1'
  });

  expect(typeof messageId).toBe('string');
});
```
