# Rule: Testing with Bun

## Purpose

Define testing conventions using Bun's built-in test runner. All tests must be written following Test-Driven Development (TDD) - write tests BEFORE implementation.

## Test-Driven Development (TDD) Workflow

### ❌ NEVER Do This
```typescript
// Writing implementation first
class Topic {
  publishMessage(message: PubSubMessage): Promise<string> {
    // Implementation
  }
}

// Then writing tests
test('publishMessage works', () => {
  // Test
});
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

## Test File Structure

### Naming Convention
- Unit tests: `<component>.test.ts`
- Integration tests: `<feature>.test.ts`
- Compatibility tests: `<api>-compat.test.ts`

### File Location
```
tests/
├── unit/
│   ├── pubsub.test.ts
│   ├── topic.test.ts
│   ├── subscription.test.ts
│   ├── message.test.ts
│   ├── publisher.test.ts
│   └── subscriber.test.ts
├── integration/
│   ├── publish-subscribe.test.ts
│   ├── batching.test.ts
│   ├── ordering.test.ts
│   └── flow-control.test.ts
└── compatibility/
    └── google-api-compat.test.ts
```

## Test File Template

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../src';

describe('ComponentName', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    // Setup before each test
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterEach(() => {
    // Cleanup after each test
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

## Test Organization

### Arrange-Act-Assert Pattern

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

## Bun Test API

### Assertions

```typescript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).not.toBe(expected);       // Negation

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeUndefined();
expect(value).toBeNull();

// Numbers
expect(value).toBeGreaterThan(5);
expect(value).toBeGreaterThanOrEqual(5);
expect(value).toBeLessThan(10);
expect(value).toBeLessThanOrEqual(10);
expect(value).toBeCloseTo(3.14, 2);     // Floating point

// Strings
expect(string).toContain('substring');
expect(string).toMatch(/regex/);
expect(string).toHaveLength(10);

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(5);
expect(array).toEqual(expect.arrayContaining([1, 2]));

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

### Async Tests

```typescript
// ✅ CORRECT - Always use async/await
test('async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});

// ❌ WRONG - Forgetting await
test('async operation', async () => {
  someAsyncFunction(); // Missing await - test will pass incorrectly
  expect(true).toBe(true);
});

// ✅ CORRECT - Testing promises
test('promise rejection', async () => {
  await expect(
    topic.publishMessage({ data: 'invalid' as any })
  ).rejects.toThrow();
});
```

### Timeouts and Delays

```typescript
// For tests that need delays
test('message redelivery after timeout', async () => {
  const subscription = pubsub.subscription('test-sub', {
    ackDeadline: 1 // 1 second
  });

  let deliveryCount = 0;
  subscription.on('message', (message) => {
    deliveryCount++;
    // Don't ack on first delivery
  });

  subscription.open();
  await topic.publishMessage({ data: Buffer.from('test') });

  // Wait for initial delivery
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(deliveryCount).toBe(1);

  // Wait for redelivery
  await new Promise(resolve => setTimeout(resolve, 1100));
  expect(deliveryCount).toBeGreaterThan(1);
}, 5000); // 5 second timeout for this test
```

### Mocking and Spying

```typescript
import { mock, spyOn } from 'bun:test';

test('should call internal method', () => {
  const obj = {
    method: () => 'original'
  };

  const spy = spyOn(obj, 'method');
  obj.method();

  expect(spy).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(1);
});

test('should mock function', () => {
  const mockFn = mock(() => 'mocked');

  const result = mockFn();

  expect(mockFn).toHaveBeenCalled();
  expect(result).toBe('mocked');
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
    batching: {
      maxMessages: 1000,
      maxMilliseconds: 50
    }
  });

  const startTime = Date.now();

  const promise = topic.publishMessage({ data: Buffer.from('test') });

  // Should wait for batch time
  await promise;
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
- Test single component in isolation
- Mock dependencies
- Fast execution
- Located in `tests/unit/`

```typescript
// tests/unit/message.test.ts
test('message.ack() marks message as acknowledged', () => {
  const message = new Message('id', 'ackId', Buffer.from('test'), {}, new Date(), mockSubscription);

  message.ack();

  // Verify internal state changed
  expect(message.acknowledged).toBe(true);
});
```

### Integration Tests
- Test multiple components together
- No mocks (or minimal)
- Slower execution
- Located in `tests/integration/`

```typescript
// tests/integration/publish-subscribe.test.ts
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

Test API compatibility with Google Pub/Sub:

```typescript
// tests/compatibility/google-api-compat.test.ts
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

  // Should accept PubSubMessage
  const messageId = await topic.publishMessage({
    data: Buffer.from('test'),
    attributes: { key: 'value' },
    orderingKey: 'key-1'
  });

  expect(typeof messageId).toBe('string');
});
```

## Test Coverage

Aim for high test coverage:
- **90%+ line coverage** for all source code
- **100% coverage** for public API methods
- **All edge cases** tested
- **All error conditions** tested

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/topic.test.ts

# Run tests in watch mode
bun test --watch

# Run with coverage (if available)
bun test --coverage
```

## Best Practices

1. **Write tests first** (TDD) - Always write test before implementation
2. **One assertion per test** - Keep tests focused
3. **Clear test names** - Describe what is being tested
4. **Arrange-Act-Assert** - Structure tests clearly
5. **Independent tests** - Each test should work in isolation
6. **Fast tests** - Keep unit tests under 100ms
7. **Async/await** - Always await async operations
8. **Clean up** - Use afterEach to clean up resources
9. **Test errors** - Test error conditions, not just happy path
10. **Descriptive failures** - Assertions should give clear failure messages

## Test Checklist

Before committing, ensure:
- [ ] All tests pass (`bun test`)
- [ ] Tests written BEFORE implementation (TDD)
- [ ] All acceptance criteria from specs are tested
- [ ] Error conditions are tested
- [ ] Edge cases are covered
- [ ] Integration tests verify end-to-end behavior
- [ ] Tests are independent and can run in any order
- [ ] No console.log or debug code in tests
- [ ] Test names clearly describe what is being tested
