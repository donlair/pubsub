# Specification: Message

## Purpose

The Message class represents a received Pub/Sub message. It provides access to message data, metadata, and methods for acknowledging (ack) or negatively acknowledging (nack) the message to control redelivery.

## API Surface

### Constructor

```typescript
class Message {
  constructor(
    id: string,
    ackId: string,
    data: Buffer,
    attributes: Attributes,
    publishTime: PreciseDate,
    subscription: Subscription,
    orderingKey?: string
  )
}
```

### Properties

```typescript
readonly id: string;                      // Unique message ID
readonly ackId: string;                   // Acknowledgment ID (unique per delivery)
readonly data: Buffer;                    // Message payload as Buffer
readonly attributes: Attributes;          // Key-value pairs
readonly publishTime: PreciseDate;        // When message was published (high-precision timestamp)
readonly received: number;                // Timestamp when subscription received message
readonly orderingKey?: string;            // Optional ordering key
readonly deliveryAttempt?: number;        // Number of delivery attempts (only with deadLetterPolicy)
readonly length: number;                  // Size of data in bytes (readonly, equivalent to data.length)
```

### Methods

```typescript
ack(): void                      // Acknowledge - removes from subscription
nack(): void                     // Negative ack - redelivers immediately
modifyAckDeadline(seconds: number): void  // Extend/modify ack deadline (0-600 seconds, 0=immediate redelivery)
ackWithResponse(): Promise<AckResponse>   // Acknowledge with exactly-once delivery confirmation
nackWithResponse(): Promise<AckResponse>  // Negative ack with exactly-once delivery confirmation
```

### Type Definitions

```typescript
interface Attributes {
  [key: string]: string;
}

enum AckResponse {
  SUCCESS = 0,              // gRPC OK - Acknowledgment successful
  INVALID = 3,              // gRPC INVALID_ARGUMENT - Invalid ack ID
  PERMISSION_DENIED = 7,    // gRPC PERMISSION_DENIED - Insufficient permissions
  FAILED_PRECONDITION = 9,  // gRPC FAILED_PRECONDITION - Subscription state issue
  OTHER = 13                // gRPC INTERNAL - Other transient errors
}
```

## Behavior Requirements

### BR-001: Message Instantiation
**Given** a message is created
**When** accessed by subscriber
**Then** all properties (id, data, attributes, publishTime) are accessible
**And** data is a Buffer instance
**And** publishTime is a Date instance

### BR-002: Acknowledge (ack)
**Given** a message is received
**When** `ack()` is called
**Then** the message is removed from the subscription
**And** the message will not be redelivered
**And** flow control count is decremented
**And** calling ack() again has no effect (idempotent)

### BR-003: Negative Acknowledge (nack)
**Given** a message is received
**When** `nack()` is called
**Then** the message is immediately redelivered
**And** deliveryAttempt counter is incremented
**And** flow control count is decremented
**And** calling nack() after ack() has no effect

### BR-004: Modify Ack Deadline
**Given** a message is received
**When** `modifyAckDeadline(seconds)` is called with 0-600 seconds
**Then** the ack deadline is set to the specified seconds
**And** the message will not timeout for that duration
**And** this can be called multiple times to keep extending
**And** passing 0 causes immediate redelivery (equivalent to nack)

### BR-005: Ack Deadline Expiry
**Given** a message is received
**When** neither ack() nor nack() is called within ackDeadline
**Then** the message is automatically redelivered
**And** deliveryAttempt is incremented

### BR-006: Message Length
**Given** a message with data Buffer
**When** accessing `message.length`
**Then** return the byte size of the data Buffer
**And** this is a readonly property

### BR-007: Empty Data
**Given** a message is published with empty data
**When** received by subscriber
**Then** data is an empty Buffer (length = 0)
**And** message can still be acked/nacked normally

### BR-008: Attributes Access
**Given** a message has attributes
**When** accessed via `message.attributes`
**Then** all attributes are accessible as key-value pairs
**And** modifying attributes object does not affect original message

### BR-009: Ordering Key Presence
**Given** message was published with orderingKey
**When** accessed by subscriber
**Then** `message.orderingKey` contains the ordering key
**And** if no ordering key, property is undefined

### BR-010: Exactly-Once Delivery Ack
**Given** enableExactlyOnceDelivery is enabled on subscription
**When** `ackWithResponse()` is called
**Then** return Promise<AckResponse>
**And** SUCCESS indicates message will not be redelivered
**And** other codes indicate ack failed and message may be redelivered

### BR-011: Message Size Limit
**Given** a message is published
**When** data size exceeds 10MB
**Then** throw InvalidArgumentError
**And** message is not accepted for publishing

## Acceptance Criteria

### AC-001: Basic Message Properties
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

let receivedMessage: Message;
subscription.on('message', (message) => {
  receivedMessage = message;
});

subscription.open();

await topic.publishMessage({
  data: Buffer.from('Hello World'),
  attributes: { key: 'value' }
});

await new Promise(resolve => setTimeout(resolve, 50));

expect(receivedMessage.id).toBeDefined();
expect(receivedMessage.data).toBeInstanceOf(Buffer);
expect(receivedMessage.data.toString()).toBe('Hello World');
expect(receivedMessage.attributes).toEqual({ key: 'value' });
expect(receivedMessage.publishTime).toBeInstanceOf(Date);
```

### AC-002: Ack Removes Message
```typescript
const subscription = pubsub.subscription('my-sub', {
  ackDeadline: 1
});
await subscription.create();

let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;
  if (deliveryCount === 1) {
    message.ack();
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait for initial delivery
await new Promise(resolve => setTimeout(resolve, 50));
expect(deliveryCount).toBe(1);

// Wait past ack deadline
await new Promise(resolve => setTimeout(resolve, 1200));

// Should NOT be redelivered because we acked
expect(deliveryCount).toBe(1);
```

### AC-003: Nack Causes Immediate Redelivery
```typescript
const subscription = pubsub.subscription('my-sub');
await subscription.create();

let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;
  if (deliveryCount === 1) {
    message.nack();
  } else {
    message.ack();
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait for redelivery
await new Promise(resolve => setTimeout(resolve, 100));

expect(deliveryCount).toBeGreaterThan(1);
```

### AC-004: Modify Ack Deadline
```typescript
const subscription = pubsub.subscription('my-sub', {
  ackDeadline: 1  // 1 second
});
await subscription.create();

let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;

  if (deliveryCount === 1) {
    // Extend deadline
    message.modifyAckDeadline(5);

    // Wait 2 seconds (past original deadline)
    setTimeout(() => {
      message.ack();
    }, 2000);
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

// Wait past original deadline but within extended deadline
await new Promise(resolve => setTimeout(resolve, 1500));

// Should NOT be redelivered because we extended deadline
expect(deliveryCount).toBe(1);

// Wait for ack
await new Promise(resolve => setTimeout(resolve, 1000));
```

### AC-005: Message Length Property
```typescript
subscription.on('message', (message) => {
  expect(message.length).toBe(message.data.length);
  expect(message.length).toBe(11); // "Hello World" = 11 bytes
  message.ack();
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('Hello World') });

await new Promise(resolve => setTimeout(resolve, 50));
```

### AC-006: Empty Data Message
```typescript
subscription.on('message', (message) => {
  expect(message.data).toBeInstanceOf(Buffer);
  expect(message.data.length).toBe(0);
  expect(message.length).toBe(0);
  message.ack();
});

subscription.open();

await topic.publishMessage({ data: Buffer.alloc(0) });

await new Promise(resolve => setTimeout(resolve, 50));
```

### AC-007: Ordering Key Present
```typescript
subscription.on('message', (message) => {
  expect(message.orderingKey).toBe('user-123');
  message.ack();
});

subscription.open();

await topic.publishMessage({
  data: Buffer.from('test'),
  orderingKey: 'user-123'
});

await new Promise(resolve => setTimeout(resolve, 50));
```

### AC-008: Multiple Acks Are Idempotent
```typescript
subscription.on('message', (message) => {
  message.ack();
  message.ack();  // Second ack should be no-op
  message.ack();  // Third ack should be no-op
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 50));

// No errors should occur
```

### AC-009: Ack After Nack Has No Effect
```typescript
let deliveryCount = 0;
subscription.on('message', (message) => {
  deliveryCount++;
  message.nack();
  message.ack();  // Should have no effect
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 100));

// Message should be redelivered despite ack after nack
expect(deliveryCount).toBeGreaterThan(1);
```

### AC-010: Delivery Attempt Counter
```typescript
let lastDeliveryAttempt = 0;
subscription.on('message', (message) => {
  lastDeliveryAttempt = message.deliveryAttempt || 1;

  if (lastDeliveryAttempt < 3) {
    message.nack();
  } else {
    message.ack();
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 200));

expect(lastDeliveryAttempt).toBe(3);
```

### AC-011: Ack With Response Returns Success

```typescript
const subscription = pubsub.subscription('my-sub', {
  enableExactlyOnceDelivery: true
});
await subscription.create();

let ackResponse: AckResponse | null = null;

subscription.on('message', async (message) => {
  ackResponse = await message.ackWithResponse();
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 100));

expect(ackResponse).toBe(AckResponse.SUCCESS); // 0
```

### AC-012: Nack With Response Returns Success

```typescript
const subscription = pubsub.subscription('my-sub', {
  enableExactlyOnceDelivery: true
});
await subscription.create();

let nackResponse: AckResponse | null = null;
let deliveryCount = 0;

subscription.on('message', async (message) => {
  deliveryCount++;
  if (deliveryCount === 1) {
    nackResponse = await message.nackWithResponse();
  } else {
    await message.ackWithResponse();
  }
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 100));

expect(nackResponse).toBe(AckResponse.SUCCESS); // 0
expect(deliveryCount).toBeGreaterThan(1); // Message redelivered
```

### AC-013: Ack With Response Handles Invalid Ack ID

```typescript
const subscription = pubsub.subscription('my-sub', {
  enableExactlyOnceDelivery: true
});
await subscription.create();

subscription.on('message', async (message) => {
  // Ack once (valid)
  const firstResponse = await message.ackWithResponse();
  expect(firstResponse).toBe(AckResponse.SUCCESS); // 0

  // Ack again (invalid - already acked)
  const secondResponse = await message.ackWithResponse();
  expect(secondResponse).toBe(AckResponse.INVALID); // 3
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 100));
```

### AC-014: Response Methods Work Without Exactly-Once

```typescript
// Subscription without exactly-once delivery
const subscription = pubsub.subscription('my-sub');
await subscription.create();

subscription.on('message', async (message) => {
  // Should still work, always returns SUCCESS
  const response = await message.ackWithResponse();
  expect(response).toBe(AckResponse.SUCCESS); // 0
});

subscription.open();

await topic.publishMessage({ data: Buffer.from('test') });

await new Promise(resolve => setTimeout(resolve, 50));
```

## Dependencies

- Subscription (parent)
- AckManager (internal, manages ack state)

## Error Handling

### Invalid Ack Deadline
```typescript
{
  code: 3,
  message: 'Ack deadline must be between 0 and 600 seconds'
}
```

### Message Too Large
```typescript
{
  code: 3,
  message: 'Message size exceeds maximum of 10MB'
}
```

## Implementation Notes

- Message instances should be immutable (data, attributes cannot be modified)
- Ack/nack operations are async internally but sync API
- Multiple acks on same message are safe (idempotent)
- Ack after nack is ignored (first operation wins)
- deliveryAttempt starts at 1 for first delivery

## Examples

### Basic Ack/Nack
```typescript
subscription.on('message', async (message) => {
  try {
    // Process message
    await processMessage(message.data);

    // Success - acknowledge
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);

    // Failure - requeue for retry
    message.nack();
  }
});
```

### Long-Running Processing
```typescript
subscription.on('message', async (message) => {
  // Extend deadline before long operation
  message.modifyAckDeadline(300);  // 5 minutes

  try {
    await longRunningOperation(message.data);
    message.ack();
  } catch (error) {
    message.nack();
  }
});
```

### Conditional Retry with Delivery Attempt
```typescript
subscription.on('message', async (message) => {
  const maxRetries = 5;

  try {
    await processMessage(message.data);
    message.ack();
  } catch (error) {
    const attempt = message.deliveryAttempt || 1;

    if (attempt < maxRetries) {
      console.log(`Retry attempt ${attempt}/${maxRetries}`);
      message.nack();
    } else {
      console.error(`Max retries exceeded, giving up`);
      // Log to dead letter queue or monitoring
      await logFailedMessage(message);
      message.ack();  // Ack to prevent infinite loop
    }
  }
});
```

### Accessing Message Metadata
```typescript
subscription.on('message', (message) => {
  console.log(`Message ID: ${message.id}`);
  console.log(`Published: ${message.publishTime.toISOString()}`);
  console.log(`Size: ${message.length} bytes`);
  console.log(`Ordering Key: ${message.orderingKey || 'none'}`);
  console.log(`Delivery Attempt: ${message.deliveryAttempt || 1}`);

  console.log('Attributes:');
  for (const [key, value] of Object.entries(message.attributes)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log(`Data: ${message.data.toString()}`);

  message.ack();
});
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification |
