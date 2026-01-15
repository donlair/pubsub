# Event-Driven Architecture Patterns

Detailed implementation patterns for event-driven architecture using Node.js EventEmitter in the Pub/Sub library.

## EventEmitter Basics

### Basic Implementation

```typescript
import { EventEmitter } from 'events';

export class Subscription extends EventEmitter {
  constructor(pubsub: PubSub, name: string, options?: SubscriptionOptions) {
    super();
    this.pubsub = pubsub;
    this.name = name;
    this.options = options || {};
  }

  private emitMessage(message: Message): void {
    this.emit('message', message);
  }

  private emitError(error: Error): void {
    this.emit('error', error);
  }

  private emitClose(): void {
    this.emit('close');
  }
}
```

### Type-Safe Event Overloads

```typescript
class Subscription extends EventEmitter {
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
```

## Usage Patterns

### Complete Usage Example

```typescript
// Message event - primary message delivery
subscription.on('message', (message) => {
  console.log(`Received: ${message.data.toString()}`);
  message.ack();
});

// Error event - required to prevent crashes
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

// Close event - cleanup notification
subscription.on('close', () => {
  console.log('Subscription closed');
});
```

### Emit Errors Pattern

```typescript
// ✅ CORRECT - Emit errors
class Subscription extends EventEmitter {
  private async pullMessages(): Promise<void> {
    try {
      const messages = await this.messageStream.pull();
      for (const message of messages) {
        this.emitMessage(message);
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ⚠️ WARNING - Missing error listener crashes process
```

### Emit Asynchronously Pattern

```typescript
// ✅ GOOD - Use setImmediate to prevent blocking
private emitMessage(message: Message): void {
  setImmediate(() => {
    this.emit('message', message);
  });
}

// ❌ BAD - Synchronous emission blocks
private emitMessage(message: Message): void {
  this.emit('message', message); // Blocks if listener is slow
}
```

### Error Listener Requirement

```typescript
// ✅ REQUIRED
subscription.on('error', (error) => {
  console.error('Error:', error);
});

// If no error listener and error emitted → Node.js throws and crashes
```

## Streaming Pull Implementation

### Continuous Message Loop

```typescript
class MessageStream {
  private subscription: Subscription;
  private isActive = false;

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.pullLoop();
  }

  private async pullLoop(): Promise<void> {
    while (this.isActive) {
      try {
        const messages = await this.queue.pull(
          this.subscription.name,
          this.flowControl.maxMessages
        );

        for (const msg of messages) {
          const message = this.createMessage(msg);
          setImmediate(() => {
            this.subscription.emit('message', message);
          });
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        this.subscription.emit('error', error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Backoff
      }
    }
  }

  async stop(): Promise<void> {
    this.isActive = false;
  }
}
```

## Flow Control Implementation

### Flow Control Loop

```typescript
private async pullLoop(): Promise<void> {
  while (this.isActive) {
    // Pause when limits exceeded
    if (this.inFlightMessages >= this.flowControl.maxMessages ||
        this.inFlightBytes >= this.flowControl.maxBytes) {
      await this.waitForCapacity();
    }
    await this.pullMessages();
  }
}

private async waitForCapacity(): Promise<void> {
  return new Promise(resolve => {
    const check = () => {
      if (this.inFlightMessages < this.flowControl.maxMessages &&
          this.inFlightBytes < this.flowControl.maxBytes) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
```

## Message Ordering Implementation

### Ordered Message Processing

For ordered messages (same `orderingKey`), ensure sequential processing:

```typescript
class MessageStream {
  private orderingKeyLocks = new Map<string, Promise<void>>();

  private async emitMessage(message: Message): Promise<void> {
    const key = message.orderingKey;

    if (key && this.options.messageOrdering) {
      // Wait for previous message with same key
      const previousPromise = this.orderingKeyLocks.get(key) || Promise.resolve();

      const currentPromise = previousPromise.then(() => {
        return new Promise<void>(resolve => {
          this.subscription.emit('message', message);

          const cleanup = () => resolve();
          message.once('ack', cleanup);
          message.once('nack', cleanup);
        });
      });

      this.orderingKeyLocks.set(key, currentPromise);
      await currentPromise;

      if (this.orderingKeyLocks.get(key) === currentPromise) {
        this.orderingKeyLocks.delete(key);
      }
    } else {
      setImmediate(() => {
        this.subscription.emit('message', message);
      });
    }
  }
}
```

## Listener Management

### Remove Listeners

```typescript
// Specific listener
const handler = (message: Message) => { /* ... */ };
subscription.on('message', handler);
subscription.off('message', handler);

// All listeners for event
subscription.removeAllListeners('message');

// All listeners for all events
subscription.removeAllListeners();
```

### Prevent Memory Leaks

```typescript
class Subscription extends EventEmitter {
  constructor(pubsub: PubSub, name: string) {
    super();
    this.setMaxListeners(100); // Increase if needed
  }
}

// ⚠️ WARNING - 10+ listeners may indicate leak
```

### Once vs On

```typescript
subscription.once('close', () => {
  console.log('Logged once');
});

subscription.on('message', (message) => {
  console.log('Logged for each message');
  message.ack();
});
```

## Error Handling in Listeners

### Listener Error Patterns

```typescript
// ⚠️ WARNING - Errors in listeners don't propagate
subscription.on('message', (message) => {
  throw new Error('Oops'); // Doesn't propagate!
});

// ✅ GOOD - Catch errors
subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack();
  }
});

// ✅ BETTER - Use error event
subscription.on('message', async (message) => {
  try {
    await processMessage(message);
    message.ack();
  } catch (error) {
    subscription.emit('error', error);
    message.nack();
  }
});
```

## Testing Examples

### Test Message Event

```typescript
test('should emit message event', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let receivedMessage: Message | null = null;

  subscription.on('message', (message) => {
    receivedMessage = message;
  });

  subscription.open();
  await topic.publishMessage({ data: Buffer.from('test') });
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(receivedMessage).not.toBeNull();
  expect(receivedMessage!.data.toString()).toBe('test');
});
```

### Test Error Event

```typescript
test('should emit error event on failure', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let errorReceived: Error | null = null;
  subscription.on('error', (error) => {
    errorReceived = error;
  });

  subscription.open();
  await topic.delete(); // Simulate error

  await new Promise(resolve => setTimeout(resolve, 100));
  expect(errorReceived).not.toBeNull();
});
```

## Implementation Checklist

Before committing event-driven code:
- [ ] EventEmitter properly extended
- [ ] Type-safe event method overloads
- [ ] Errors emitted, not thrown
- [ ] Error event listener provided
- [ ] Events emitted asynchronously (setImmediate)
- [ ] Listeners properly removed on cleanup
- [ ] Sequential processing for ordered messages
- [ ] Tests for all event types
- [ ] Flow control respects limits
