# AVRO Schema Validation Implementation Research

## Decision: Not Implementing

**Status**: Will not implement AVRO validation in this library.

**Recommended Approach**: Use JSON Schema for Pub/Sub schema validation + Zod for client-side type-safe validation.

**Rationale**: This library is designed for local development speed, not production parity. Adding AVRO validation increases complexity and dependencies without significant benefit for the local development use case.

---

## Overview

This document analyzes what implementing AVRO schema validation would require for the local Pub/Sub library. Currently, AVRO schemas can be created and stored, but `validateMessage()` throws `UnimplementedError`. This research covers the implementation approach, library options, code changes, and trade-offs.

## Current State

### What Works

- AVRO schemas can be created via `schema.create('AVRO', definition)`
- Schema definitions are stored in the in-memory registry
- Schema lifecycle methods work (exists, get, delete, getName)
- Topics can be configured with AVRO schema settings

### What Doesn't Work

```typescript
// This throws UnimplementedError
await schema.validateMessage(messageData, 'JSON');
// Error: "AVRO schemas are not yet implemented. Use SchemaType.JSON for local development."
```

**Location**: `src/schema.ts` lines 133-135

## Library Options

### Option 1: avsc (Recommended)

The standard AVRO implementation for JavaScript/TypeScript.

```bash
bun add avsc
```

| Aspect | Details |
|--------|---------|
| **Package** | `avsc` |
| **Size** | ~150KB |
| **Maintenance** | Active, well-maintained |
| **TypeScript** | Has `@types/avsc` |
| **Features** | Full AVRO spec, schema resolution, binary encoding |

**API Surface**:
```typescript
import avsc from 'avsc';

// Parse schema
const type = avsc.Type.forSchema({
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'long' },
    { name: 'email', type: 'string' }
  ]
});

// Validate
const isValid = type.isValid({ userId: 123, email: 'test@example.com' });

// Binary encoding/decoding
const buffer = type.toBuffer({ userId: 123, email: 'test@example.com' });
const decoded = type.fromBuffer(buffer);

// Detailed error collection
const errors: string[] = [];
type.isValid(data, {
  errorHook: (path, value, type) => {
    errors.push(`${path.join('.')}: expected ${type.typeName}`);
  }
});
```

### Option 2: @avro/avsc

A fork with additional features, but less commonly used.

### Option 3: avro-js

Apache's official library, but heavier and less idiomatic for Node.js.

**Recommendation**: Use `avsc` - it's the de facto standard, lightweight, and has excellent TypeScript support.

## Implementation Plan

### 1. Add Dependency

```bash
bun add avsc
bun add -d @types/avsc
```

### 2. Update src/schema.ts

#### Import avsc

```typescript
import Ajv, { type ValidateFunction } from 'ajv';
import avsc from 'avsc';
```

#### Add AVRO Validator Cache

```typescript
export class Schema {
  private static ajv = new Ajv({ allErrors: true, strict: false });
  private static validatorCache = new Map<string, ValidateFunction>();
  private static avroValidatorCache = new Map<string, avsc.Type>();  // NEW

  // ...
}
```

#### Enhance create() for AVRO Validation

Currently, AVRO schema creation only validates JSON structure. We should also validate it's a valid AVRO schema:

```typescript
async create(
  type: SchemaType,
  definition: string,
  _options?: CreateSchemaOptions
): Promise<[Schema, ISchema]> {
  if (type === 'AVRO') {
    try {
      const schemaObj = JSON.parse(definition);
      // Validate it's a valid AVRO schema (will throw if invalid)
      avsc.Type.forSchema(schemaObj);
    } catch (error) {
      throw new InvalidArgumentError(
        `Invalid AVRO schema definition: ${error instanceof Error ? error.message : 'Parse error'}`
      );
    }
  }

  // ... rest of existing logic
}
```

#### Replace UnimplementedError with Validation Logic

```typescript
async validateMessage(
  message: string | Buffer,
  encoding: SchemaEncoding,
  _options?: ValidateSchemaOptions
): Promise<void> {
  // Load schema data (existing logic)
  const schemaData = this.pubsub.schemas.get(this.name);
  if (!schemaData) {
    throw new NotFoundError(`Schema not found: ${this.name}`);
  }
  this.type = schemaData.type;
  this.definition = schemaData.definition;

  // AVRO validation (NEW - replaces UnimplementedError)
  if (this.type === 'AVRO') {
    if (!this.definition) {
      throw new InvalidArgumentError('Schema definition not found');
    }

    const cacheKey = this.name;
    let avroType = Schema.avroValidatorCache.get(cacheKey);

    // Compile and cache AVRO schema
    if (!avroType) {
      try {
        const schemaObj = JSON.parse(this.definition);
        avroType = avsc.Type.forSchema(schemaObj);
        Schema.avroValidatorCache.set(cacheKey, avroType);
      } catch (error) {
        throw new InvalidArgumentError(
          `Failed to compile AVRO schema: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Parse message based on encoding
    let data: unknown;
    try {
      if (encoding === 'BINARY') {
        const buffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
        data = avroType.fromBuffer(buffer);
      } else {
        const jsonString = Buffer.isBuffer(message) ? message.toString('utf8') : message;
        data = JSON.parse(jsonString);
      }
    } catch (error) {
      throw new InvalidArgumentError(
        `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Validate with detailed error collection
    const errors: string[] = [];
    const valid = avroType.isValid(data, {
      errorHook: (path, _value, type) => {
        const fieldPath = path.length > 0 ? path.join('.') : 'root';
        errors.push(`${fieldPath} expected ${type.typeName}`);
      }
    });

    if (!valid) {
      throw new InvalidArgumentError(
        `Message validation failed: ${errors.join(', ') || 'Invalid AVRO record'}`
      );
    }
    return;
  }

  // Protocol Buffer (remains unimplemented)
  if (this.type === 'PROTOCOL_BUFFER') {
    throw new UnimplementedError(
      'Protocol Buffer schemas are not yet implemented. Use SchemaType.JSON or SchemaType.AVRO.'
    );
  }

  // JSON validation (existing logic unchanged)
  if (this.type === 'JSON') {
    // ... existing AJV validation
  }
}
```

### 3. Update PubSub.validateSchema()

The `validateSchema()` method in `src/pubsub.ts` should also validate AVRO schemas:

```typescript
async validateSchema(
  schema: SchemaDefinition,
  _options?: CallOptions
): Promise<void> {
  const { type, definition } = schema;

  if (type === 'AVRO') {
    try {
      const schemaObj = JSON.parse(definition);
      avsc.Type.forSchema(schemaObj);
    } catch (error) {
      throw new InvalidArgumentError(
        `Invalid AVRO schema: ${error instanceof Error ? error.message : 'Parse error'}`
      );
    }
    return;
  }

  // ... existing JSON validation
}
```

## AVRO Type Mapping

### Primitive Types

| AVRO Type | JavaScript Type | Notes |
|-----------|-----------------|-------|
| `null` | `null` | |
| `boolean` | `boolean` | |
| `int` | `number` | 32-bit signed |
| `long` | `number` | 64-bit signed (precision loss possible) |
| `float` | `number` | 32-bit IEEE 754 |
| `double` | `number` | 64-bit IEEE 754 |
| `bytes` | `Buffer` | |
| `string` | `string` | UTF-8 |

### Complex Types

| AVRO Type | JavaScript Type | Example |
|-----------|-----------------|---------|
| `record` | `object` | `{ name: 'User', fields: [...] }` |
| `enum` | `string` | `{ type: 'enum', symbols: ['A', 'B'] }` |
| `array` | `array` | `{ type: 'array', items: 'string' }` |
| `map` | `object` | `{ type: 'map', values: 'int' }` |
| `union` | varies | `['null', 'string']` |
| `fixed` | `Buffer` | `{ type: 'fixed', size: 16 }` |

### Union Types (Optional Fields)

```typescript
// Optional string field
{ name: 'phone', type: ['null', 'string'], default: null }

// Validates: { phone: null } or { phone: '555-1234' }
// Rejects: { phone: 123 } or missing phone without default
```

## Binary Encoding Support

AVRO's binary encoding is more efficient than JSON. The implementation should support both:

### JSON Encoding (Human-Readable)

```typescript
const message = JSON.stringify({ userId: 123, email: 'test@example.com' });
await schema.validateMessage(message, 'JSON');
```

### Binary Encoding (Efficient)

```typescript
const avroType = avsc.Type.forSchema(schemaDefinition);
const binaryMessage = avroType.toBuffer({ userId: 123, email: 'test@example.com' });
await schema.validateMessage(binaryMessage, 'BINARY');
```

Binary encoding with `avsc`:
- **Encoding**: `avroType.toBuffer(data)` → `Buffer`
- **Decoding**: `avroType.fromBuffer(buffer)` → `object`
- **Performance**: ~2-3x faster than JSON for large messages

## Test Updates

### Existing Tests to Update

The following tests in `tests/unit/schema.test.ts` currently expect `UnimplementedError`:

```typescript
// BEFORE: Expects error
test('AVRO validation throws unimplemented', async () => {
  await expect(schema.validateMessage(data, 'JSON'))
    .rejects.toThrow('AVRO schemas are not yet implemented');
});

// AFTER: Expects validation to work
test('AVRO validates valid message', async () => {
  await expect(schema.validateMessage(data, 'JSON')).resolves.toBeUndefined();
});
```

### New Tests to Add

```typescript
describe('AVRO schema validation', () => {
  const avroDefinition = JSON.stringify({
    type: 'record',
    name: 'User',
    fields: [
      { name: 'userId', type: 'long' },
      { name: 'email', type: 'string' },
      { name: 'age', type: ['null', 'int'], default: null }
    ]
  });

  test('validates valid JSON-encoded message', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    await expect(
      schema.validateMessage(
        JSON.stringify({ userId: 123, email: 'test@example.com', age: 30 }),
        'JSON'
      )
    ).resolves.toBeUndefined();
  });

  test('validates message with null optional field', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    await expect(
      schema.validateMessage(
        JSON.stringify({ userId: 123, email: 'test@example.com', age: null }),
        'JSON'
      )
    ).resolves.toBeUndefined();
  });

  test('rejects message with wrong type', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    await expect(
      schema.validateMessage(
        JSON.stringify({ userId: 'not-a-number', email: 'test@example.com' }),
        'JSON'
      )
    ).rejects.toThrow('Message validation failed');
  });

  test('rejects message with missing required field', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    await expect(
      schema.validateMessage(
        JSON.stringify({ userId: 123 }),  // missing email
        'JSON'
      )
    ).rejects.toThrow('Message validation failed');
  });

  test('validates binary-encoded message', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    const avroType = avsc.Type.forSchema(JSON.parse(avroDefinition));
    const binaryMessage = avroType.toBuffer({
      userId: 123,
      email: 'test@example.com',
      age: null
    });

    await expect(
      schema.validateMessage(binaryMessage, 'BINARY')
    ).resolves.toBeUndefined();
  });

  test('rejects invalid AVRO schema definition', async () => {
    const schema = pubsub.schema('invalid-schema');

    await expect(
      schema.create('AVRO', JSON.stringify({ type: 'invalid-type' }))
    ).rejects.toThrow('Invalid AVRO schema definition');
  });

  test('provides detailed validation errors', async () => {
    const schema = pubsub.schema('user-schema');
    await schema.create('AVRO', avroDefinition);

    try {
      await schema.validateMessage(
        JSON.stringify({ userId: 'wrong', email: 123 }),
        'JSON'
      );
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).toContain('userId');
      expect(error.message).toContain('email');
    }
  });
});

describe('Topic with AVRO schema', () => {
  test('validates messages at publish time', async () => {
    const schema = pubsub.schema('order-schema');
    await schema.create('AVRO', JSON.stringify({
      type: 'record',
      name: 'Order',
      fields: [
        { name: 'orderId', type: 'long' },
        { name: 'amount', type: 'double' }
      ]
    }));

    const [topic] = await pubsub.createTopic('orders', {
      schemaSettings: {
        schema: 'order-schema',
        encoding: 'JSON'
      }
    });

    // Valid message
    await expect(
      topic.publishJSON({ orderId: 123, amount: 99.99 })
    ).resolves.toBeDefined();

    // Invalid message
    await expect(
      topic.publishJSON({ orderId: 'invalid', amount: 99.99 })
    ).rejects.toThrow();
  });
});
```

## Integration with Topic Publishing

The existing topic integration (`src/topic.ts` lines 108-114) already calls `schema.validateMessage()`. Once AVRO validation is implemented, it will work automatically:

```typescript
// In topic.publishMessage() - NO CHANGES NEEDED
const metadata = this.queue.getTopic(this.name);
if (metadata?.schemaSettings?.schema && message.data) {
  const schema = pubsub.schema(metadata.schemaSettings.schema);
  await schema.validateMessage(
    message.data,
    metadata.schemaSettings.encoding || 'JSON'
  );
}
```

## Error Handling

### Error Types

| Scenario | Error Type | Code | Message Pattern |
|----------|------------|------|-----------------|
| Schema not found | `NotFoundError` | 5 | `Schema not found: {name}` |
| Invalid schema definition | `InvalidArgumentError` | 3 | `Invalid AVRO schema definition: {details}` |
| Failed to compile schema | `InvalidArgumentError` | 3 | `Failed to compile AVRO schema: {details}` |
| Failed to parse message | `InvalidArgumentError` | 3 | `Failed to parse message: {details}` |
| Validation failed | `InvalidArgumentError` | 3 | `Message validation failed: {field errors}` |

### Error Detail Format

```typescript
// Single field error
"Message validation failed: userId expected long"

// Multiple field errors
"Message validation failed: userId expected long, email expected string"

// Nested field error
"Message validation failed: address.zipCode expected string"
```

## Performance Considerations

### Caching Strategy

Compiled AVRO types should be cached to avoid recompilation:

```typescript
private static avroValidatorCache = new Map<string, avsc.Type>();

// Cache key: fully-qualified schema name
const cacheKey = this.name;  // e.g., "projects/my-project/schemas/user-schema"
```

### Benchmark Expectations

| Operation | Expected Latency |
|-----------|------------------|
| Schema compilation (first use) | 1-5ms |
| Validation (cached schema) | 0.01-0.1ms |
| Binary decode + validate | 0.02-0.2ms |
| JSON parse + validate | 0.05-0.5ms |

### Memory Impact

- Each cached AVRO type: ~1-10KB depending on schema complexity
- With 100 schemas cached: ~100KB-1MB additional memory
- Acceptable for local development use case

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `avsc` and `@types/avsc` dependencies |
| `src/schema.ts` | Add AVRO validation logic (~60 lines) |
| `src/pubsub.ts` | Update `validateSchema()` for AVRO (~10 lines) |
| `tests/unit/schema.test.ts` | Update existing tests, add new tests (~100 lines) |
| `tests/integration/schema-validation.test.ts` | Add AVRO integration tests (~50 lines) |

## Migration Impact

### For Users Currently Using JSON Schemas

No impact - JSON Schema validation continues to work unchanged.

### For Users Wanting AVRO

After implementation:
```typescript
// This will work (currently throws UnimplementedError)
const schema = pubsub.schema('user-schema');
await schema.create('AVRO', avroDefinition);
await schema.validateMessage(messageData, 'JSON');  // Now validates!
```

### Migration to Google Cloud Pub/Sub

With AVRO support implemented:
1. **Same schema definitions** work locally and in production
2. **No schema conversion** needed during migration
3. **Binary encoding** can be tested locally before production

## Trade-offs

### Pros

1. **Better migration path** - AVRO schemas work identically in local and production
2. **Binary encoding support** - Can test efficient encoding locally
3. **Schema evolution testing** - Can validate backward/forward compatibility locally
4. **Parity with Google Cloud** - One of two officially supported schema types

### Cons

1. **Additional dependency** - Adds `avsc` (~150KB)
2. **Maintenance burden** - More code to maintain and test
3. **Complexity** - AVRO has more complex type system than JSON Schema
4. **Not the primary use case** - Most local development can use JSON Schema

## Recommendation

**Do not implement AVRO validation.** While technically feasible, the complexity and dependency overhead don't justify the benefit for a local development library.

### Recommended Approach: JSON Schema + Zod

For local development, use this pattern:

```typescript
import { z } from 'zod';
import { PubSub } from '@local/pubsub';

// 1. Define your schema with Zod (client-side, type-safe)
const OrderSchema = z.object({
  orderId: z.number(),
  amount: z.number(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive()
  }))
});

type Order = z.infer<Order>; // TypeScript type for free

// 2. Optionally use JSON Schema in Pub/Sub for double validation
const pubsub = new PubSub();
const schema = pubsub.schema('order-schema');
await schema.create('JSON', JSON.stringify({
  type: 'object',
  properties: {
    orderId: { type: 'number' },
    amount: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 }
        },
        required: ['productId', 'quantity']
      }
    }
  },
  required: ['orderId', 'amount', 'items']
}));

// 3. Validate with Zod before publishing (fast, type-safe)
async function publishOrder(data: unknown) {
  const order = OrderSchema.parse(data); // Throws if invalid
  await topic.publishJSON(order);
}
```

### Why This Approach

| Aspect | Zod + JSON Schema | AVRO Implementation |
|--------|-------------------|---------------------|
| **Type safety** | Full TypeScript inference | Requires separate type definitions |
| **Error messages** | Excellent, customizable | Generic AVRO errors |
| **Bundle size** | Zod ~12KB | avsc ~150KB |
| **Learning curve** | Familiar JS/TS patterns | AVRO-specific syntax |
| **Runtime validation** | Yes | Yes |
| **Production migration** | Convert to AVRO when needed | Direct compatibility |

### Why Zod Over Raw JSON Schema

| Feature | Zod | JSON Schema (AJV) |
|---------|-----|-------------------|
| TypeScript types | Inferred automatically | Must define separately |
| Composability | `z.extend()`, `z.merge()`, `z.pick()` | Manual schema composition |
| Transforms | Built-in `.transform()` | Not supported |
| Error formatting | `.format()`, custom messages | Raw error objects |
| Async validation | `.refine()` with async | Limited support |
| Size | ~12KB | AJV ~80KB |

```typescript
// Zod gives you TypeScript types for free
const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  createdAt: z.string().transform(s => new Date(s)) // Transform on parse
});

type User = z.infer<typeof UserSchema>;
// { id: number; email: string; createdAt: Date }
```

### Migration to Production

When moving to Google Cloud Pub/Sub with AVRO:

1. **Convert Zod schema to AVRO** (one-time effort)
2. **Keep Zod for client-side validation** (fast fail, better errors)
3. **Use AVRO for Pub/Sub schema** (server-side enforcement)

```typescript
// Production pattern
import { PubSub } from '@google-cloud/pubsub';

const OrderSchema = z.object({ /* same as before */ });

const avroSchema = {
  type: 'record',
  name: 'Order',
  fields: [
    { name: 'orderId', type: 'long' },
    { name: 'amount', type: 'double' },
    { name: 'items', type: { type: 'array', items: { /* ... */ } } }
  ]
};

async function publishOrder(data: unknown) {
  const order = OrderSchema.parse(data); // Client-side validation (fast)
  await topic.publishJSON(order);        // Server validates against AVRO
}
```

## References

- [Zod Documentation](https://zod.dev/) - Recommended for client-side validation
- [avsc npm package](https://www.npmjs.com/package/avsc) - AVRO implementation (if needed in future)
- [Apache Avro Specification](https://avro.apache.org/docs/current/spec.html)
- [Google Cloud Pub/Sub Schema Documentation](https://cloud.google.com/pubsub/docs/schemas)
- [Existing Schema Implementation](../src/schema.ts)
- [Schema Specification](../specs/08-schema.md)
