# Rule: TypeScript

## Config

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Strict Rules

### Never Use `any`

```typescript
// BAD
function process(data: any) { return data.value; }

// GOOD - Use unknown + narrowing
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: string }).value;
  }
  throw new Error('Invalid data');
}
```

### Explicit Return Types for Public APIs

```typescript
// BAD - Inferred
export class Topic {
  publish(data: Buffer) { return this.publisher.publish(data); }
}

// GOOD - Explicit
export class Topic {
  publish(data: Buffer): Promise<string> { return this.publisher.publish(data); }
}
```

### Null/Undefined Handling

```typescript
// Use optional chaining and nullish coalescing
function getName(user: User): string {
  return user.name?.toUpperCase() ?? 'UNKNOWN';
}
```

### Property Initialization

```typescript
// Initialize all properties or use definite assignment
export class Topic {
  name: string;
  publisher!: Publisher; // Definite assignment if initialized elsewhere

  constructor(name: string) {
    this.name = name;
    this.initPublisher();
  }
}
```

## Type Patterns

### Type Guards

```typescript
function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isPubSubMessage(value: unknown): value is PubSubMessage {
  return typeof value === 'object' && value !== null &&
    'data' in value && Buffer.isBuffer((value as PubSubMessage).data);
}
```

### Discriminated Unions

```typescript
interface SuccessResult { success: true; data: string; }
interface ErrorResult { success: false; error: Error; }
type Result = SuccessResult | ErrorResult;

function process(result: Result): void {
  if (result.success) {
    console.log(result.data); // TypeScript knows data exists
  } else {
    console.error(result.error);
  }
}
```

### Branded Types

```typescript
type MessageId = string & { __brand: 'MessageId' };
type AckId = string & { __brand: 'AckId' };

function createMessageId(id: string): MessageId { return id as MessageId; }
function ack(ackId: AckId): void { /* ... */ }

const msgId = createMessageId('123');
// ack(msgId); // Error: MessageId not assignable to AckId
```

### Readonly Types

```typescript
interface Message {
  readonly id: string;
  readonly data: Buffer;
  readonly attributes: Readonly<Record<string, string>>;
}
```

### Const Assertions

```typescript
const errors = { NOT_FOUND: 'Not found', INVALID: 'Invalid' } as const;
```

### Error Types

```typescript
class PubSubError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
    this.name = 'PubSubError';
  }
}

class NotFoundError extends PubSubError {
  constructor(resource: string) {
    super(`${resource} not found`, 5);
    this.name = 'NotFoundError';
  }
}
```

## API Compatibility

Types must match `@google-cloud/pubsub` exactly for drop-in compatibility.

### Match Signatures Exactly

```typescript
// CORRECT
class Topic { publishMessage(message: PubSubMessage): Promise<string>; }

// WRONG - Different return type
class Topic { publishMessage(message: PubSubMessage): Promise<number>; }
```

### Tuple Returns (Google Pattern)

```typescript
// Admin operations return [result, metadata]
class PubSub {
  createTopic(name: string): Promise<[Topic, any]>;
  getTopics(): Promise<[Topic[], any, any]>;
}
```

### EventEmitter Overloads

```typescript
class Subscription extends EventEmitter {
  on(event: 'message', listener: (message: Message) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}
```

### Export All Public Types

```typescript
// src/index.ts
export { PubSub, Topic, Subscription, Message, Schema } from './...';
export type {
  PubSubOptions, PublishOptions, SubscriptionOptions,
  PubSubMessage, Attributes, BatchingOptions
} from './types';
```

### Document Defaults

```typescript
interface BatchingOptions {
  maxMessages?: number;      // Default: 100
  maxMilliseconds?: number;  // Default: 10
  maxBytes?: number;         // Default: 1024 * 1024 (1MB)
}
```

## Verification

```bash
bun run tsc --noEmit  # Must compile with zero errors
```

## Quick Reference

| Pattern | Use When |
|---------|----------|
| `unknown` | Accepting arbitrary data (never `any`) |
| Type guards | Runtime type checking |
| Branded types | Preventing ID confusion |
| `readonly` | Immutable properties |
| `as const` | Literal object types |
| Tuple returns | Admin operations `[result, metadata]` |
| Method overloads | Type-safe event handlers |
