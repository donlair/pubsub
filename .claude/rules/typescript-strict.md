# Rule: Strict TypeScript

## Purpose

Enforce strict TypeScript mode for maximum type safety and catch potential errors at compile time. This ensures robust, maintainable code that matches the quality of the official `@google-cloud/pubsub` library.

## TypeScript Configuration

### tsconfig.json Settings

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Strict Rules

### ❌ Never Use `any`

```typescript
// ❌ BAD
function process(data: any) {
  return data.value;
}

// ✅ GOOD
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: unknown }).value;
  }
  throw new Error('Invalid data');
}

// ✅ BETTER - Use proper types
interface Data {
  value: string;
}

function process(data: Data): string {
  return data.value;
}
```

### ✅ Explicit Types for Public APIs

```typescript
// ❌ BAD - Inferred return type
export class Topic {
  publish(data: Buffer) {
    return this.publisher.publish(data);
  }
}

// ✅ GOOD - Explicit return type
export class Topic {
  publish(data: Buffer): Promise<string> {
    return this.publisher.publish(data);
  }
}
```

### ✅ Proper null/undefined Handling

```typescript
// ❌ BAD
function getName(user: User) {
  return user.name.toUpperCase(); // Might crash if name is null
}

// ✅ GOOD
function getName(user: User): string {
  if (user.name === null || user.name === undefined) {
    return 'UNKNOWN';
  }
  return user.name.toUpperCase();
}

// ✅ BETTER - Use optional chaining and nullish coalescing
function getName(user: User): string {
  return user.name?.toUpperCase() ?? 'UNKNOWN';
}
```

### ✅ Strict Property Initialization

```typescript
// ❌ BAD
export class Topic {
  name: string;
  publisher: Publisher; // Error: not initialized

  constructor(name: string) {
    this.name = name;
  }
}

// ✅ GOOD
export class Topic {
  name: string;
  publisher: Publisher;

  constructor(name: string, publisher: Publisher) {
    this.name = name;
    this.publisher = publisher;
  }
}

// ✅ ALSO GOOD - Definite assignment assertion if initialized elsewhere
export class Topic {
  name: string;
  publisher!: Publisher; // Definite assignment assertion

  constructor(name: string) {
    this.name = name;
    this.initPublisher();
  }

  private initPublisher(): void {
    this.publisher = new Publisher(this);
  }
}
```

### ✅ No Implicit Returns

```typescript
// ❌ BAD
function getStatus(code: number): string {
  if (code === 200) {
    return 'OK';
  }
  // Missing return for other cases
}

// ✅ GOOD
function getStatus(code: number): string {
  if (code === 200) {
    return 'OK';
  }
  return 'ERROR';
}

// ✅ BETTER - Exhaustive switch
function getStatus(code: number): string {
  switch (code) {
    case 200:
      return 'OK';
    case 404:
      return 'NOT_FOUND';
    default:
      return 'ERROR';
  }
}
```

### ✅ Type Narrowing

```typescript
// ❌ BAD
function process(value: string | number) {
  return value.toFixed(2); // Error: might be string
}

// ✅ GOOD
function process(value: string | number): string {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  return value;
}

// ✅ GOOD - Type guard
function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function process(value: string | number): string {
  if (isNumber(value)) {
    return value.toFixed(2);
  }
  return value;
}
```

### ✅ Const Assertions

```typescript
// ❌ BAD - Mutable type
const errors = {
  NOT_FOUND: 'Not found',
  INVALID: 'Invalid'
};

// ✅ GOOD - Immutable with const assertion
const errors = {
  NOT_FOUND: 'Not found',
  INVALID: 'Invalid'
} as const;

// ✅ BETTER - Enum for related constants
enum ErrorCode {
  NOT_FOUND = 5,
  INVALID_ARGUMENT = 3
}
```

## Type Safety Patterns

### Discriminated Unions

```typescript
// ✅ GOOD
interface SuccessResult {
  success: true;
  data: string;
}

interface ErrorResult {
  success: false;
  error: Error;
}

type Result = SuccessResult | ErrorResult;

function process(result: Result): void {
  if (result.success) {
    console.log(result.data); // TypeScript knows data exists
  } else {
    console.error(result.error); // TypeScript knows error exists
  }
}
```

### Branded Types

```typescript
// ✅ GOOD - Prevent mixing of IDs
type MessageId = string & { __brand: 'MessageId' };
type AckId = string & { __brand: 'AckId' };

function createMessageId(id: string): MessageId {
  return id as MessageId;
}

function ack(ackId: AckId): void {
  // Implementation
}

const msgId = createMessageId('123');
// ack(msgId); // Error: MessageId not assignable to AckId
```

### Readonly Types

```typescript
// ✅ GOOD - Immutable properties
interface Message {
  readonly id: string;
  readonly data: Buffer;
  readonly attributes: Readonly<Record<string, string>>;
  readonly publishTime: Date;
}

// ✅ GOOD - Readonly arrays
interface Topic {
  getSubscriptions(): Promise<readonly Subscription[]>;
}
```

## Generic Type Constraints

```typescript
// ❌ BAD - Too generic
function first<T>(arr: T[]) {
  return arr[0];
}

// ✅ GOOD - Proper constraints
function first<T>(arr: readonly T[]): T | undefined {
  return arr[0];
}

// ✅ GOOD - Constrained generic
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## Error Handling Types

```typescript
// ✅ GOOD - Proper error types
class PubSubError extends Error {
  constructor(
    message: string,
    public readonly code: number
  ) {
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

// ✅ GOOD - Type-safe error handling
function handleError(error: unknown): never {
  if (error instanceof PubSubError) {
    throw error;
  }
  if (error instanceof Error) {
    throw new PubSubError(error.message, 13); // INTERNAL
  }
  throw new PubSubError('Unknown error', 13);
}
```

## Async/Promise Types

```typescript
// ❌ BAD - Implicit any in promise
async function publish(data: Buffer) {
  return await this.queue.publish(data);
}

// ✅ GOOD - Explicit promise type
async function publish(data: Buffer): Promise<string> {
  return await this.queue.publish(data);
}

// ✅ GOOD - Promise.all with proper types
async function publishMany(
  messages: readonly Buffer[]
): Promise<readonly string[]> {
  const promises = messages.map(data => this.publish(data));
  return await Promise.all(promises);
}
```

## Function Types

```typescript
// ✅ GOOD - Explicit function types
type MessageHandler = (message: Message) => void;
type ErrorHandler = (error: Error) => void;

interface Subscription {
  on(event: 'message', handler: MessageHandler): this;
  on(event: 'error', handler: ErrorHandler): this;
}

// ✅ GOOD - Callback with proper types
type Callback<T> = (error: Error | null, result?: T) => void;

function getMessages(
  count: number,
  callback: Callback<Message[]>
): void {
  // Implementation
}
```

## Utility Types

```typescript
// ✅ GOOD - Use built-in utility types
type PartialOptions = Partial<PubSubOptions>;
type RequiredOptions = Required<PubSubOptions>;
type ReadonlyMessage = Readonly<Message>;
type MessageKeys = keyof Message;
type MessageValues = Message[keyof Message];

// ✅ GOOD - Custom utility types
type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

type TopicWithName = WithRequired<Topic, 'name'>;
```

## Declaration Files

If extending external libraries:

```typescript
// types/extensions.d.ts

// ✅ GOOD - Augment module
declare module '@google-cloud/pubsub' {
  interface PubSub {
    customMethod(): void;
  }
}
```

## Best Practices

1. **Enable all strict flags** in tsconfig.json
2. **Never use `any`** - use `unknown` and narrow with type guards
3. **Explicit return types** for all public methods
4. **Readonly by default** for properties that shouldn't change
5. **Null/undefined checks** before accessing properties
6. **Type guards** for runtime type checking
7. **Discriminated unions** for complex type relationships
8. **Const assertions** for literal types
9. **Generic constraints** to prevent misuse
10. **Branded types** to prevent ID confusion

## Compilation

Code must compile with zero errors and zero warnings:

```bash
bun run tsc --noEmit
```

All code must pass strict TypeScript checks before committing.
