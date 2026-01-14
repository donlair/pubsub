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
get(): Promise<[Schema, any]>
```

#### Validation Methods

```typescript
validateMessage(message: PubSubMessage): Promise<boolean>
```

### Type Definitions

```typescript
enum SchemaType {
  AVRO = 'AVRO',
  PROTOCOL_BUFFER = 'PROTOCOL_BUFFER',
  JSON = 'JSON'  // Our extension for simple validation
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

### BR-003: Message Validation - JSON
**Given** a schema with type JSON is created
**When** `validateMessage(message)` is called
**Then** parse message.data as JSON
**And** validate against JSON Schema definition
**And** return true if valid, throw error if invalid

### BR-004: Message Validation - AVRO (Stub)
**Given** a schema with type AVRO is created
**When** `validateMessage(message)` is called
**Then** throw NotImplementedError with helpful message
**And** suggest JSON schema as alternative

### BR-005: Message Validation - Protocol Buffer (Stub)
**Given** a schema with type PROTOCOL_BUFFER is created
**When** `validateMessage(message)` is called
**Then** throw NotImplementedError with helpful message
**And** suggest JSON schema as alternative

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

### AC-001: Create JSON Schema
```typescript
const pubsub = new PubSub();
const schema = pubsub.schema('user-schema');

const definition = JSON.stringify({
  type: 'object',
  properties: {
    userId: { type: 'number' },
    action: { type: 'string' }
  },
  required: ['userId', 'action']
});

const [createdSchema] = await schema.create(
  SchemaType.JSON,
  definition
);

expect(createdSchema.type).toBe(SchemaType.JSON);
expect(await createdSchema.exists()).toBe(true);
```

### AC-002: Validate Valid Message
```typescript
const schema = pubsub.schema('user-schema');

const definition = JSON.stringify({
  type: 'object',
  properties: {
    userId: { type: 'number' },
    action: { type: 'string' }
  },
  required: ['userId', 'action']
});

await schema.create(SchemaType.JSON, definition);

const validMessage = {
  data: Buffer.from(JSON.stringify({
    userId: 123,
    action: 'login'
  })),
  attributes: {}
};

const isValid = await schema.validateMessage(validMessage);
expect(isValid).toBe(true);
```

### AC-003: Reject Invalid Message
```typescript
const schema = pubsub.schema('user-schema');

const definition = JSON.stringify({
  type: 'object',
  properties: {
    userId: { type: 'number' },
    action: { type: 'string' }
  },
  required: ['userId', 'action']
});

await schema.create(SchemaType.JSON, definition);

const invalidMessage = {
  data: Buffer.from(JSON.stringify({
    userId: 'not-a-number',  // Should be number
    action: 'login'
  })),
  attributes: {}
};

await expect(
  schema.validateMessage(invalidMessage)
).rejects.toThrow();
```

### AC-004: Topic with Schema Validation
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
await topic.create({ schema: 'order-schema' });

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

## Dependencies

- PubSub client (parent)
- JSON Schema validator (e.g., `ajv` library)

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
await topic.create({ schema: 'event-schema' });

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
await topic.create({ schema: 'user-profile-schema' });

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
