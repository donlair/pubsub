# Rule: Event-Driven Architecture

## Purpose

Define patterns for event-driven architecture using Node.js EventEmitter. The Subscription class uses events for message delivery, matching Google Pub/Sub's streaming pull API.

## EventEmitter Basics

### Extending EventEmitter

```typescript
import { EventEmitter } from 'events';

// ✅ CORRECT - Subscription extends EventEmitter
export class Subscription extends EventEmitter {
  constructor(pubsub: PubSub, name: string, options?: SubscriptionOptions) {
    super();
    this.pubsub = pubsub;
    this.name = name;
    this.options = options || {};
  }

  // Event emitters
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

## Event Types

### Message Event

The primary event for receiving messages:

```typescript
// ✅ CORRECT - Type-safe message event
class Subscription extends EventEmitter {
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;

  // Generic overload for other events
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

// Usage
subscription.on('message', (message) => {
  console.log(`Received: ${message.data.toString()}`);
  message.ack();
});
```

### Error Event

Emit errors instead of throwing in async operations:

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
      // Don't throw - emit error event
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Usage
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
  // Handle error - subscription continues running
});
```

### Close Event

Emit when subscription is closed:

```typescript
// ✅ CORRECT - Close event
class Subscription extends EventEmitter {
  async close(): Promise<void> {
    this.isOpen = false;

    // Stop message stream
    await this.messageStream.stop();

    // Emit close event
    this.emit('close');
  }
}

// Usage
subscription.on('close', () => {
  console.log('Subscription closed');
});
```

## Event Emission Patterns

### Emit in Next Tick

Emit events asynchronously to prevent blocking:

```typescript
// ✅ GOOD - Use setImmediate for async emission
class Subscription extends EventEmitter {
  private emitMessage(message: Message): void {
    setImmediate(() => {
      this.emit('message', message);
    });
  }
}

// ❌ BAD - Synchronous emission blocks
class Subscription extends EventEmitter {
  private emitMessage(message: Message): void {
    this.emit('message', message); // Blocks if listener is slow
  }
}
```

### Error Event is Special

Always emit errors, never throw in event emitter context:

```typescript
// ✅ CORRECT - Emit errors
class Subscription extends EventEmitter {
  private async processMessage(message: InternalMessage): Promise<void> {
    try {
      // Processing logic
    } catch (error) {
      // Emit error, don't throw
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ✅ CORRECT - Provide error listener
subscription.on('error', (error) => {
  console.error('Error:', error);
});

// ⚠️ WARNING - No error listener causes crash
// If error is emitted and no listener, Node.js throws
```

### Once vs On

Use `once` for single-time events:

```typescript
// ✅ GOOD - Use once for single events
subscription.once('close', () => {
  console.log('Subscription closed (only logged once)');
});

// ✅ GOOD - Use on for repeated events
subscription.on('message', (message) => {
  console.log('Message received');
  message.ack();
});
```

## Event Listener Management

### Remove Listeners

Properly clean up listeners:

```typescript
// ✅ CORRECT - Remove specific listener
const messageHandler = (message: Message) => {
  console.log(message.data.toString());
  message.ack();
};

subscription.on('message', messageHandler);

// Later, remove it
subscription.off('message', messageHandler);

// ✅ CORRECT - Remove all listeners
subscription.removeAllListeners('message');

// ✅ CORRECT - Remove all listeners for all events
subscription.removeAllListeners();
```

### Prevent Memory Leaks

```typescript
// ✅ GOOD - Set max listeners if needed
class Subscription extends EventEmitter {
  constructor(pubsub: PubSub, name: string) {
    super();
    this.setMaxListeners(100); // Increase if needed
  }
}

// ⚠️ WARNING - Many listeners can indicate leak
subscription.on('message', handler1);
subscription.on('message', handler2);
subscription.on('message', handler3);
// ... 10+ listeners may indicate a leak
```

## Streaming Pull Implementation

### Continuous Message Loop

```typescript
// ✅ CORRECT - Continuous pull with event emission
class MessageStream {
  private subscription: Subscription;
  private isActive = false;
  private pullInterval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.pullLoop();
  }

  private async pullLoop(): Promise<void> {
    while (this.isActive) {
      try {
        // Pull messages from queue
        const messages = await this.queue.pull(
          this.subscription.name,
          this.flowControl.maxMessages
        );

        // Emit each message
        for (const msg of messages) {
          const message = this.createMessage(msg);
          setImmediate(() => {
            this.subscription.emit('message', message);
          });
        }

        // Small delay before next pull
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        // Emit error but continue loop
        this.subscription.emit('error', error);
        // Backoff on error
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async stop(): Promise<void> {
    this.isActive = false;
    // Wait for current pull to complete
  }
}
```

### Flow Control with Events

```typescript
// ✅ CORRECT - Pause/resume based on flow control
class MessageStream {
  private isPaused = false;

  private async pullLoop(): Promise<void> {
    while (this.isActive) {
      // Check flow control
      if (this.shouldPause()) {
        this.isPaused = true;
        // Wait for capacity
        await this.waitForCapacity();
        this.isPaused = false;
      }

      // Pull and emit messages
      await this.pullMessages();
    }
  }

  private shouldPause(): boolean {
    return (
      this.inFlightMessages >= this.flowControl.maxMessages ||
      this.inFlightBytes >= this.flowControl.maxBytes
    );
  }

  private async waitForCapacity(): Promise<void> {
    return new Promise(resolve => {
      const checkCapacity = () => {
        if (!this.shouldPause()) {
          resolve();
        } else {
          setTimeout(checkCapacity, 100);
        }
      };
      checkCapacity();
    });
  }
}
```

## Event Ordering

### Sequential Event Processing

For ordered messages, ensure sequential processing:

```typescript
// ✅ CORRECT - Sequential processing per ordering key
class MessageStream {
  private orderingKeyLocks = new Map<string, Promise<void>>();

  private async emitMessage(message: Message): Promise<void> {
    const key = message.orderingKey;

    if (key && this.options.messageOrdering) {
      // Wait for previous message with same key
      const previousPromise = this.orderingKeyLocks.get(key) || Promise.resolve();

      // Create promise for this message
      const currentPromise = previousPromise.then(async () => {
        return new Promise<void>(resolve => {
          // Emit message
          this.subscription.emit('message', message);

          // Wait for ack
          const cleanup = () => {
            resolve();
          };

          message.once('ack', cleanup);
          message.once('nack', cleanup);
        });
      });

      // Store promise
      this.orderingKeyLocks.set(key, currentPromise);

      await currentPromise;

      // Clean up old locks
      if (this.orderingKeyLocks.get(key) === currentPromise) {
        this.orderingKeyLocks.delete(key);
      }
    } else {
      // No ordering - emit immediately
      setImmediate(() => {
        this.subscription.emit('message', message);
      });
    }
  }
}
```

## Error Handling in Listeners

### Listener Errors

```typescript
// ⚠️ WARNING - Errors in listeners don't propagate
subscription.on('message', (message) => {
  throw new Error('Oops'); // This doesn't propagate!
});

// ✅ GOOD - Catch errors in listeners
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

### Global Error Handler

```typescript
// ✅ GOOD - Always have error handler
subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});

// ⚠️ WARNING - Missing error handler crashes process
// If no error listener and error is emitted, Node.js throws:
// EventEmitter: error event without handler
```

## Testing Event Emitters

### Test Event Emission

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

  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(receivedMessage).not.toBeNull();
  expect(receivedMessage!.data.toString()).toBe('test');
});
```

### Test Error Events

```typescript
test('should emit error event on failure', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let errorReceived: Error | null = null;

  subscription.on('error', (error) => {
    errorReceived = error;
  });

  subscription.open();

  // Simulate error condition
  await topic.delete();

  await new Promise(resolve => setTimeout(resolve, 100));

  expect(errorReceived).not.toBeNull();
});
```

### Test Multiple Listeners

```typescript
test('multiple listeners all receive events', async () => {
  const subscription = pubsub.subscription('test-sub');
  await subscription.create();

  let count1 = 0;
  let count2 = 0;

  subscription.on('message', (message) => {
    count1++;
    message.ack();
  });

  subscription.on('message', (message) => {
    count2++;
  });

  subscription.open();

  await topic.publishMessage({ data: Buffer.from('test') });

  await new Promise(resolve => setTimeout(resolve, 50));

  expect(count1).toBe(1);
  expect(count2).toBe(1);
});
```

## Performance Considerations

### High-Frequency Events

```typescript
// ✅ GOOD - Batch emits for high frequency
class MessageStream {
  private messageBatch: Message[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  private emitMessage(message: Message): void {
    this.messageBatch.push(message);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        const batch = this.messageBatch;
        this.messageBatch = [];
        this.batchTimer = null;

        // Emit all at once
        setImmediate(() => {
          for (const msg of batch) {
            this.subscription.emit('message', msg);
          }
        });
      }, 0);
    }
  }
}
```

### Listener Count

```typescript
// ✅ GOOD - Monitor listener count
class Subscription extends EventEmitter {
  on(event: string, listener: (...args: any[]) => void): this {
    const result = super.on(event, listener);

    // Warn if too many listeners
    if (this.listenerCount(event) > 10) {
      console.warn(`Warning: ${this.listenerCount(event)} listeners for '${event}' event`);
    }

    return result;
  }
}
```

## Best Practices

1. **Emit async** - Use setImmediate for event emission
2. **Error handling** - Always emit errors, never throw
3. **Error listeners** - Always provide error event listener
4. **Clean up** - Remove listeners when done
5. **Memory leaks** - Monitor listener count
6. **Sequential processing** - Use locks for ordered messages
7. **Listener errors** - Catch errors in async listeners
8. **Test events** - Write tests for all events
9. **Type safety** - Use method overloads for type-safe events
10. **Flow control** - Pause emission when limits reached

## Event Lifecycle

### Typical Flow

```typescript
// 1. Create subscription
const subscription = pubsub.subscription('my-sub');
await subscription.create();

// 2. Add listeners
subscription.on('message', (message) => {
  console.log(message.data.toString());
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Error:', error);
});

subscription.on('close', () => {
  console.log('Closed');
});

// 3. Start listening
subscription.open();

// 4. Messages flow as events
// 'message' event emitted for each message

// 5. Close when done
await subscription.close();
// 'close' event emitted

// 6. Clean up listeners
subscription.removeAllListeners();
```

## Common Patterns

### Request-Reply

```typescript
// ✅ GOOD - Request-reply pattern
async function requestReply(request: any, timeout: number = 5000): Promise<any> {
  const correlationId = generateId();
  const responsePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.off('message', handler);
      reject(new Error('Timeout'));
    }, timeout);

    const handler = (message: Message) => {
      if (message.attributes.correlationId === correlationId) {
        clearTimeout(timer);
        subscription.off('message', handler);
        resolve(JSON.parse(message.data.toString()));
        message.ack();
      }
    };

    subscription.on('message', handler);
  });

  // Publish request
  await requestTopic.publishJSON(request, {
    correlationId,
    replyTo: 'response-topic'
  });

  return await responsePromise;
}
```

### Graceful Shutdown

```typescript
// ✅ GOOD - Graceful shutdown
class Application {
  private subscriptions: Subscription[] = [];

  async shutdown(): Promise<void> {
    console.log('Shutting down gracefully...');

    // Close all subscriptions
    await Promise.all(
      this.subscriptions.map(sub => sub.close())
    );

    console.log('All subscriptions closed');
  }
}

// Handle signals
process.on('SIGTERM', async () => {
  await app.shutdown();
  process.exit(0);
});
```

## Checklist

Before committing event-driven code:
- [ ] EventEmitter properly extended
- [ ] Type-safe event method overloads
- [ ] Errors emitted, not thrown
- [ ] Error event listener provided
- [ ] Events emitted asynchronously (setImmediate)
- [ ] Listeners properly removed on cleanup
- [ ] Memory leak monitoring in place
- [ ] Sequential processing for ordered messages
- [ ] Tests for all event types
- [ ] Flow control respects limits
