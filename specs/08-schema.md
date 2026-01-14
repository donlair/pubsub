# Specification: Schema

## Purpose

The Schema class provides message validation capabilities for topics. Schemas ensure that messages published to a topic conform to a predefined structure. This implementation provides a basic schema validation framework with support for JSON Schema validation as the primary method.

## API Surface

### Constructor

```typescript
class Schema {
  constructor(pubsub: PubSub, id: string)
}
```

### Properties

```typescript
id: string;                      // Schema ID
name: string;                    // Fully-qualified schema name
type?: SchemaType;               // AVRO or PROTOCOL_BUFFER
definition?: string;             // Schema definition
metadata?: SchemaMetadata;
```

### Methods

#### Lifecycle Methods

```typescript
create(type: SchemaType, definition: string, options?: CreateSchemaOptions): Promise<[Schema, any]>
delete(): Promise<[any]>
exists(): Promise<[boolean]>
get(view?: 'BASIC' | 'FULL', options?: any): Promise<[Schema, any]>
```

#### Validation Methods

```typescript
validateMessage(message: string | Buffer, encoding: Encoding, options?: any): Promise<void>
getName(): Promise<string>  // Returns fully-qualified schema name
```

### Type Definitions

```typescript
enum SchemaType {
  AVRO = 'AVRO',
  PROTOCOL_BUFFER = 'PROTOCOL_BUFFER'
}

enum Encoding {
  BINARY = 'BINARY',
  JSON = 'JSON'
}

interface CreateSchemaOptions {
  definition?: string;
}

interface SchemaMetadata {
  name: string;
  type: SchemaType;
  definition: string;
  created: Date;
}

interface PubSubMessage {
  data: Buffer;
  attributes?: Attributes;
  orderingKey?: string;
}
```

## Local Development Extension: JSON Schema Validation

**⚠️ IMPORTANT**: JSON Schema validation is a **custom extension** for local development convenience and is **NOT part of Google Cloud Pub/Sub API**.

### What This Means

- **Google's API** only supports `SchemaType.AVRO` and `SchemaType.PROTOCOL_BUFFER`
- **This implementation** extends the `SchemaType` enum to include `JSON` for local development
- **Migration Impact**: Code using `SchemaType.JSON` will **NOT work** with real Google Cloud Pub/Sub

### Usage

For local development and testing, this implementation allows:

```typescript
// LOCAL ONLY - NOT COMPATIBLE WITH GOOGLE PUB/SUB
enum SchemaType {
  AVRO = 'AVRO',
  PROTOCOL_BUFFER = 'PROTOCOL_BUFFER',
  JSON = 'JSON'  // Custom extension for local development only
}

// Create JSON schema (local development only)
await schema.create(SchemaType.JSON, jsonSchemaDefinition);
```

### Migration Path

When moving to production Google Cloud Pub/Sub:

1. **Remove JSON validation** code or
2. **Implement client-side validation** using `ajv` or similar library
3. **Use AVRO or Protocol Buffer** schemas for server-side validation

### Why Provide This Extension?

JSON Schema validation is provided for:
- **Rapid local development** without AVRO/Protobuf complexity
- **Testing** message structures before implementing full schemas
- **Compatibility** with JSON-based workflows during development

**Production applications should use Google's officially supported AVRO or Protocol Buffer schemas.**

## Behavior Requirements

### BR-001: Schema Creation
**Given** a schema ID and type are provided
**When** `create(type, definition)` is called
**Then** validate the schema definition is valid
**And** store schema in registry
**And** return Schema instance with metadata

### BR-002: Schema Exists Check
**Given** a schema may or may not exist
**When** `exists()` is called
**Then** return true if schema is registered
**And** return false otherwise

### BR-003: Message Validation Interface
**Given** a schema is created
**When** `validateMessage(message, encoding)` is called
**Then** parse the message (string or Buffer) based on encoding
**And** validate against schema definition
**And** return Promise<void> on success
**And** throw InvalidArgumentError if validation fails

### BR-004: Message Validation - AVRO (Stub)
**Given** a schema with type AVRO is created
**When** `validateMessage(message, encoding)` is called
**Then** throw UnimplementedError with message "AVRO schemas"
**And** suggest alternative validation methods

### BR-005: Message Validation - Protocol Buffer (Stub)
**Given** a schema with type PROTOCOL_BUFFER is created
**When** `validateMessage(message, encoding)` is called
**Then** throw UnimplementedError with message "Protocol Buffer schemas"
**And** suggest alternative validation methods

### BR-006: Topic with Schema
**Given** a topic has a schema attached
**When** messages are published to the topic
**Then** validate each message against schema
**And** reject invalid messages with validation error
**And** only publish valid messages

### BR-007: Schema Deletion
**Given** a schema exists
**When** `delete()` is called
**Then** remove schema from registry
**And** detach from any topics using it
**And** subsequent validation attempts throw NotFoundError

### BR-008: Invalid Schema Definition
**Given** an invalid schema definition is provided
**When** `create()` is called
**Then** throw InvalidArgumentError with details
**And** do not create the schema

## Acceptance Criteria

**⚠️ Note on JSON Schema Tests**: Several acceptance criteria below use `SchemaType.JSON` for convenience. This is a **local development extension only** and will not work with real Google Cloud Pub/Sub. For production, use `SchemaType.AVRO` or `SchemaType.PROTOCOL_BUFFER`.

### AC-001: Create AVRO Schema
```typescript
const pubsub = new PubSub();
const schema = pubsub.schema('user-schema');

const avroDefinition = JSON.stringify({
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'int' },
    { name: 'action', type: 'string' }
  ]
});

const [createdSchema] = await schema.create(
  SchemaType.AVRO,
  avroDefinition
);

expect(createdSchema.type).toBe(SchemaType.AVRO);
expect(await createdSchema.exists()).toBe(true);
```

### AC-002: AVRO Validation Throws Unimplemented
```typescript
const schema = pubsub.schema('user-schema');

const avroDefinition = JSON.stringify({
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'int' },
    { name: 'action', type: 'string' }
  ]
});

await schema.create(SchemaType.AVRO, avroDefinition);

const messageData = JSON.stringify({
  userId: 123,
  action: 'login'
});

await expect(
  schema.validateMessage(messageData, Encoding.JSON)
).rejects.toThrow('AVRO schemas');
```

### AC-003: Protocol Buffer Validation Throws Unimplemented
```typescript
const schema = pubsub.schema('proto-schema');

const protoDefinition = `
  message User {
    int32 userId = 1;
    string action = 2;
  }
`;

await schema.create(SchemaType.PROTOCOL_BUFFER, protoDefinition);

const messageData = Buffer.from([/* binary data */]);

await expect(
  schema.validateMessage(messageData, Encoding.BINARY)
).rejects.toThrow('Protocol Buffer schemas');
```

### AC-004: Topic with Schema Validation
**Note**: This test uses `SchemaType.JSON` which is a custom extension for local development only.

```typescript
const schema = pubsub.schema('order-schema');

const definition = JSON.stringify({
  type: 'object',
  properties: {
    orderId: { type: 'number' },
    amount: { type: 'number' }
  },
  required: ['orderId', 'amount']
});

await schema.create(SchemaType.JSON, definition);

const topic = pubsub.topic('orders');
await topic.create({
  schemaSettings: {
    schema: 'order-schema',
    encoding: Encoding.JSON
  }
});

// Valid message - should succeed
const messageId1 = await topic.publishJSON({
  orderId: 12345,
  amount: 99.99
});
expect(messageId1).toBeDefined();

// Invalid message - should throw
await expect(
  topic.publishJSON({
    orderId: 'invalid',  // Should be number
    amount: 99.99
  })
).rejects.toThrow();
```

### AC-005: Schema Exists Check
```typescript
const schema = pubsub.schema('test-schema');

expect(await schema.exists()).toBe(false);

await schema.create(SchemaType.JSON, '{"type": "object"}');

expect(await schema.exists()).toBe(true);
```

### AC-006: Delete Schema
```typescript
const schema = pubsub.schema('test-schema');

await schema.create(SchemaType.JSON, '{"type": "object"}');
expect(await schema.exists()).toBe(true);

await schema.delete();
expect(await schema.exists()).toBe(false);
```

### AC-007: Get Schema Details
```typescript
const schema = pubsub.schema('test-schema');

const definition = '{"type": "object", "properties": {"name": {"type": "string"}}}';
await schema.create(SchemaType.JSON, definition);

const [retrieved] = await schema.get();

expect(retrieved.type).toBe(SchemaType.JSON);
expect(retrieved.definition).toBe(definition);
```

### AC-008: AVRO Not Implemented
```typescript
const schema = pubsub.schema('avro-schema');

await expect(
  schema.create(SchemaType.AVRO, 'avro-definition')
).rejects.toThrow('AVRO schemas not yet implemented');
```

### AC-009: Protocol Buffer Not Implemented
```typescript
const schema = pubsub.schema('proto-schema');

await expect(
  schema.create(SchemaType.PROTOCOL_BUFFER, 'proto-definition')
).rejects.toThrow('Protocol Buffer schemas not yet implemented');
```

### AC-010: Invalid JSON Schema Definition
```typescript
const schema = pubsub.schema('invalid-schema');

const invalidDefinition = '{"type": "invalid-type"}';

await expect(
  schema.create(SchemaType.JSON, invalidDefinition)
).rejects.toThrow();
```

### AC-011: List Schemas
```typescript
const schema1 = pubsub.schema('schema-1');
const schema2 = pubsub.schema('schema-2');

await schema1.create(SchemaType.JSON, '{"type": "object"}');
await schema2.create(SchemaType.JSON, '{"type": "object"}');

// List all schemas
const schemas: Schema[] = [];
for await (const s of pubsub.listSchemas('FULL')) {
  schemas.push(s);
}

expect(schemas.length).toBeGreaterThanOrEqual(2);
expect(schemas.some(s => s.id === 'schema-1')).toBe(true);
```

### AC-012: Validate Schema Definition
```typescript
const invalidDefinition = '{"type": "unknown"}';

await expect(
  pubsub.validateSchema({
    type: SchemaType.JSON,
    definition: invalidDefinition
  })
).rejects.toThrow();

const validDefinition = JSON.stringify({ type: 'object' });

// Should not throw
await pubsub.validateSchema({
  type: SchemaType.JSON,
  definition: validDefinition
});
```

### AC-013: Get Schema Name
```typescript
const schema = pubsub.schema('test-schema');
await schema.create(SchemaType.JSON, '{"type": "object"}');

const name = await schema.getName();

expect(name).toMatch(/^projects\/.*\/schemas\/test-schema$/);
```

## Dependencies

- PubSub client (parent)
- JSON Schema validator (e.g., `ajv` library)

## PubSub Client Schema Methods

The PubSub client provides these schema-related methods:

```typescript
class PubSub {
  listSchemas(view?: 'BASIC' | 'FULL', options?: PageOptions): AsyncIterable<Schema>
  validateSchema(schema: { type: SchemaType; definition: string }, options?: any): Promise<void>
  getSchemaClient(): Promise<SchemaServiceClient>
}
```

### listSchemas()
Returns an async iterable of all schemas in the project.
- `view='BASIC'`: Returns minimal metadata
- `view='FULL'`: Returns complete schema definitions

### validateSchema()
Validates a schema definition before creation. Throws if invalid.

### getSchemaClient()
Returns low-level schema service client for advanced operations.

## Error Handling

### Not Implemented Error
```typescript
{
  code: 12,  // UNIMPLEMENTED
  message: 'AVRO schemas not yet implemented. Use SchemaType.JSON for validation.'
}
```

### Invalid Argument Error
```typescript
{
  code: 3,
  message: 'Invalid JSON Schema definition: ...'
}
```

### Validation Failed Error
```typescript
{
  code: 3,
  message: 'Message validation failed: userId must be a number'
}
```

## Performance Considerations

- Compile JSON schemas once and cache validators
- Validation adds latency to publish operations
- Consider async validation for better throughput
- Schema validation is optional - only validate when schema attached

## Implementation Notes

- Use `ajv` library for JSON Schema validation
- AVRO and Protocol Buffer support can be added later
- Cache compiled validators per schema for performance
- Validation happens before message is accepted by MessageQueue
- Invalid messages are rejected before entering the system

## Examples

### Basic JSON Schema Validation
```typescript
import { PubSub, SchemaType } from './pubsub';

const pubsub = new PubSub();

// Create schema
const schema = pubsub.schema('event-schema');
await schema.create(SchemaType.JSON, JSON.stringify({
  type: 'object',
  properties: {
    eventType: { type: 'string', enum: ['click', 'view', 'purchase'] },
    userId: { type: 'number' },
    timestamp: { type: 'number' }
  },
  required: ['eventType', 'userId', 'timestamp']
}));

// Create topic with schema
const topic = pubsub.topic('events');
await topic.create({
  schemaSettings: {
    schema: 'event-schema',
    encoding: Encoding.JSON
  }
});

// Valid messages pass
await topic.publishJSON({
  eventType: 'click',
  userId: 123,
  timestamp: Date.now()
});

// Invalid messages rejected
try {
  await topic.publishJSON({
    eventType: 'invalid-type',  // Not in enum
    userId: 123,
    timestamp: Date.now()
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

### Manual Message Validation
```typescript
const schema = pubsub.schema('order-schema');

await schema.create(SchemaType.JSON, JSON.stringify({
  type: 'object',
  properties: {
    orderId: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number' }
        },
        required: ['productId', 'quantity']
      }
    }
  },
  required: ['orderId', 'items']
}));

const message = {
  data: Buffer.from(JSON.stringify({
    orderId: 12345,
    items: [
      { productId: 'PROD-001', quantity: 2 },
      { productId: 'PROD-002', quantity: 1 }
    ]
  }))
};

// Validate manually
const isValid = await schema.validateMessage(message);
if (isValid) {
  console.log('Message is valid');
}
```

### Complex JSON Schema
```typescript
const schema = pubsub.schema('user-profile-schema');

await schema.create(SchemaType.JSON, JSON.stringify({
  type: 'object',
  properties: {
    userId: { type: 'number' },
    email: { type: 'string', format: 'email' },
    age: { type: 'number', minimum: 0, maximum: 150 },
    preferences: {
      type: 'object',
      properties: {
        newsletter: { type: 'boolean' },
        notifications: { type: 'boolean' }
      }
    }
  },
  required: ['userId', 'email'],
  additionalProperties: false
}));

const topic = pubsub.topic('user-updates');
await topic.create({
  schemaSettings: {
    schema: 'user-profile-schema',
    encoding: Encoding.JSON
  }
});

// Schema ensures data quality
await topic.publishJSON({
  userId: 123,
  email: 'user@example.com',
  age: 30,
  preferences: {
    newsletter: true,
    notifications: false
  }
});
```

## Future Enhancements

### Phase 2: AVRO Support
- Add `avsc` library for AVRO validation
- Support binary and JSON encoding
- Schema evolution and compatibility

### Phase 3: Protocol Buffer Support
- Add `protobufjs` library
- Support `.proto` file definitions
- Binary encoding/decoding

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | 1.0 | Initial specification with JSON Schema support |
