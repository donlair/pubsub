# Google Cloud Pub/Sub Schema API

## Overview

Schemas define the format and structure that messages must follow. Pub/Sub supports **Avro** and **Protocol Buffer** schemas for message validation.

## Schema Types

- **PROTOCOL_BUFFER** - Protocol Buffer format
- **AVRO** - Apache Avro format

## Encoding Types

- **JSON** - JSON encoding
- **BINARY** - Binary encoding

## Schema Class Methods

### create(type, definition, options?)
Creates a new schema.

```typescript
const avroSchema = JSON.stringify({
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'email', type: 'string' }
  ]
});

const [schema] = await pubsub.schema('user-schema').create(
  'AVRO',
  avroSchema
);
```

### delete(options?)
Deletes the schema.

```typescript
await schema.delete();
```

### exists(options?)
Checks if schema exists.

```typescript
const [exists] = await schema.exists();
```

### get(view?, options?)
Retrieves schema information.

```typescript
const [metadata] = await schema.get('FULL');
```

### getName()
Gets fully qualified schema name.

```typescript
const name = await schema.getName();
// "projects/my-project/schemas/my-schema"
```

### validateMessage(message, encoding, options?)
Validates a message against the schema.

```typescript
await schema.validateMessage(
  JSON.stringify({ userId: '123', email: 'user@example.com' }),
  'JSON'
);
```

## PubSub Schema Methods

### createSchema(schemaId, type, definition, options?)
Creates a schema.

```typescript
const [schema] = await pubsub.createSchema(
  'user-schema',
  'AVRO',
  avroDefinition
);
```

### schema(name)
Gets schema reference.

```typescript
const schema = pubsub.schema('user-schema');
```

### listSchemas(view?, options?)
Lists all schemas.

```typescript
for await (const schema of pubsub.listSchemas('FULL')) {
  console.log(schema.name);
}
```

### validateSchema(schema, options?)
Validates schema definition.

```typescript
await pubsub.validateSchema({
  type: 'AVRO',
  definition: avroDefinition
});
```

### getSchemaClient()
Gets low-level schema service client.

```typescript
const client = await pubsub.getSchemaClient();
```

## Using Schemas with Topics

### Creating Topic with Schema

```typescript
const [topic] = await pubsub.createTopic('events', {
  schemaSettings: {
    schema: 'projects/my-project/schemas/user-schema',
    encoding: 'JSON'
  }
});
```

### Publishing with Schema Validation

```typescript
// Valid message - passes validation
await topic.publishJSON({
  userId: '123',
  email: 'user@example.com'
});

// Invalid message - fails validation
try {
  await topic.publishJSON({
    userId: 123, // Wrong type
    invalidField: 'value' // Extra field
  });
} catch (error) {
  console.error('Schema validation failed:', error);
}
```

## Avro Schema Example

```typescript
const avroSchema = {
  type: 'record',
  name: 'UserEvent',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'timestamp', type: 'long' },
    {
      name: 'metadata',
      type: {
        type: 'map',
        values: 'string'
      }
    }
  ]
};

const [schema] = await pubsub.createSchema(
  'user-event-schema',
  'AVRO',
  JSON.stringify(avroSchema)
);
```

## Protocol Buffer Schema Example

```typescript
const protoSchema = `
syntax = "proto3";

message UserEvent {
  string user_id = 1;
  string action = 2;
  int64 timestamp = 3;
  map<string, string> metadata = 4;
}
`;

const [schema] = await pubsub.createSchema(
  'user-event-schema',
  'PROTOCOL_BUFFER',
  protoSchema
);
```

## Schema Validation

```typescript
import avro from 'avsc';

// Parse Avro schema
const type = avro.Type.forSchema(JSON.parse(avroDefinition));

// Validate before publishing
function validateAndPublish(topic: Topic, data: any) {
  if (!type.isValid(data)) {
    throw new Error('Data does not match schema');
  }

  return topic.publishJSON(data);
}
```

## Schema Evolution

Schema evolution allows you to modify schemas over time while maintaining compatibility with existing producers and consumers.

### Backward Compatibility

Backward compatible changes allow new consumers to read old messages.

```typescript
// Version 1 - Original schema
const schemaV1 = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'email', type: 'string' }
  ]
};

// Version 2 - Add optional field (backward compatible)
const schemaV2 = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'phone', type: ['null', 'string'], default: null }  // Optional with default
  ]
};

// Create new version
await pubsub.createSchema('user-schema-v2', 'AVRO', JSON.stringify(schemaV2));
```

### Forward Compatibility

Forward compatible changes allow old consumers to read new messages.

```typescript
// Adding a field with default value maintains forward compatibility
const schemaV3 = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'phone', type: ['null', 'string'], default: null },
    { name: 'createdAt', type: 'long', default: 0 }  // Timestamp with default
  ]
};
```

### Full Compatibility

Maintaining both backward and forward compatibility:

```typescript
// Safe changes for full compatibility:
// - Add optional fields with defaults
// - Add union types that include null
// - Add enum values (at end)
// - Widen numeric types (int to long)

const fullyCompatibleSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'email', type: 'string' },
    // Optional fields with defaults
    { name: 'phone', type: ['null', 'string'], default: null },
    { name: 'createdAt', type: ['null', 'long'], default: null },
    // Union types for flexibility
    { name: 'metadata', type: ['null', { type: 'map', values: 'string' }], default: null }
  ]
};
```

### Breaking Changes

These changes break compatibility and require careful migration:

```typescript
// ❌ Breaking changes - avoid these:
// - Remove fields
// - Rename fields
// - Change field types (string to int)
// - Add required fields without defaults
// - Reorder fields in record

// Example: Breaking change
const breakingSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'emailAddress', type: 'string' },  // Renamed: 'email' → 'emailAddress'
    { name: 'age', type: 'int' }  // New required field (breaking!)
  ]
};

// Migration strategy for breaking changes:
async function migrateToBreakingSchema() {
  // 1. Create new topic with new schema
  const [newTopic] = await pubsub.createTopic('users-v2', {
    schemaSettings: {
      schema: 'projects/my-project/schemas/user-schema-v2',
      encoding: 'JSON'
    }
  });

  // 2. Dual-write to both topics during transition
  // 3. Migrate consumers to new topic
  // 4. Decommission old topic
}
```

## Schema Validation Errors

Handling schema validation failures gracefully.

### Common Validation Errors

```typescript
async function publishWithValidation(topic: Topic, data: any) {
  try {
    await topic.publishJSON(data);
    console.log('Message published successfully');
  } catch (error) {
    if (error.code === 3) {  // INVALID_ARGUMENT
      console.error('Schema validation failed:');

      // Common validation errors:
      if (error.message.includes('missing required field')) {
        console.error('- Missing required field');
        console.error('  Check that all required fields are present');
      } else if (error.message.includes('type mismatch')) {
        console.error('- Type mismatch');
        console.error('  Ensure field types match schema definition');
      } else if (error.message.includes('unknown field')) {
        console.error('- Unknown field detected');
        console.error('  Remove fields not defined in schema');
      } else {
        console.error('- Validation error:', error.message);
      }

      // Log the problematic data
      console.error('Data that failed validation:', JSON.stringify(data, null, 2));
    } else {
      throw error;  // Re-throw non-validation errors
    }
  }
}
```

### Pre-validation Strategy

Validate messages client-side before publishing:

```typescript
import avro from 'avsc';

class SchemaValidator {
  private schemas: Map<string, avro.Type> = new Map();

  async loadSchema(schemaName: string) {
    const schema = pubsub.schema(schemaName);
    const [metadata] = await schema.get('FULL');
    const avroType = avro.Type.forSchema(JSON.parse(metadata.definition));
    this.schemas.set(schemaName, avroType);
    return avroType;
  }

  validate(schemaName: string, data: any): { valid: boolean; errors?: string[] } {
    const type = this.schemas.get(schemaName);
    if (!type) {
      throw new Error(`Schema ${schemaName} not loaded`);
    }

    const valid = type.isValid(data);
    if (!valid) {
      // Get detailed validation errors
      const errors: string[] = [];
      type.isValid(data, {
        errorHook: (path, value, type) => {
          errors.push(`Invalid value at ${path.join('.')}: expected ${type}, got ${typeof value}`);
        }
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }
}

// Usage
const validator = new SchemaValidator();
await validator.loadSchema('user-schema');

const result = validator.validate('user-schema', {
  userId: '123',
  email: 'user@example.com'
});

if (result.valid) {
  await topic.publishJSON(data);
} else {
  console.error('Validation errors:', result.errors);
}
```

## Schema Versioning and Revision Management

Managing multiple schema versions in production.

### Naming Strategy

```typescript
// Recommended naming conventions:
// - Include entity name
// - Include version number
// - Use semantic versioning

const schemas = {
  // Major versions for breaking changes
  userV1: 'projects/my-project/schemas/user-v1',
  userV2: 'projects/my-project/schemas/user-v2',

  // Entity-based namingorderV1: 'projects/my-project/schemas/order-v1',
  productV1: 'projects/my-project/schemas/product-v1'
};
```

### Revision Management

```typescript
async function manageSchemaRevisions() {
  // Create initial schema
  const schemaV1Definition = JSON.stringify({
    type: 'record',
    name: 'Event',
    namespace: 'com.example',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'timestamp', type: 'long' }
    ]
  });

  await pubsub.createSchema('event-v1', 'AVRO', schemaV1Definition);

  // List all schema revisions
  const schemas = pubsub.listSchemas('FULL');
  for await (const schema of schemas) {
    if (schema.name.includes('event')) {
      console.log(`Schema: ${schema.name}`);
      console.log(`Type: ${schema.type}`);
      console.log(`Definition: ${schema.definition}`);
    }
  }

  // Get specific schema revision
  const schema = pubsub.schema('event-v1');
  const [metadata] = await schema.get('FULL');
  console.log('Current schema:', metadata.definition);
}
```

### Topic Schema Migrations

```typescript
async function migrateTopicSchema(
  topicName: string,
  oldSchema: string,
  newSchema: string
) {
  const topic = pubsub.topic(topicName);

  // Get current settings
  const [metadata] = await topic.getMetadata();

  // Update to new schema
  await topic.setMetadata({
    schemaSettings: {
      schema: newSchema,
      encoding: metadata.schemaSettings.encoding
    }
  });

  console.log(`Migrated ${topicName} from ${oldSchema} to ${newSchema}`);
}
```

## Performance Considerations

Schema validation impacts message publishing performance.

### Validation Overhead

```typescript
// Benchmark schema validation overhead
async function benchmarkValidation() {
  const topic = pubsub.topic('my-topic');
  const schemaToplic = pubsub.topic('schema-topic');

  const testData = { userId: '123', email: 'test@example.com' };
  const iterations = 1000;

  // Without schema validation
  const startNoSchema = Date.now();
  for (let i = 0; i < iterations; i++) {
    await topic.publishJSON(testData);
  }
  const noSchemaTime = Date.now() - startNoSchema;

  // With schema validation
  const startWithSchema = Date.now();
  for (let i = 0; i < iterations; i++) {
    await schemaToplic.publishJSON(testData);
  }
  const withSchemaTime = Date.now() - startWithSchema;

  console.log(`Without schema: ${noSchemaTime}ms`);
  console.log(`With schema: ${withSchemaTime}ms`);
  console.log(`Overhead: ${((withSchemaTime / noSchemaTime - 1) * 100).toFixed(2)}%`);
}
```

### Optimization Strategies

```typescript
// 1. Client-side validation to fail fast
const validator = new SchemaValidator();
await validator.loadSchema('user-schema');

function publishOptimized(data: any) {
  // Validate locally first (fast)
  const result = validator.validate('user-schema', data);
  if (!result.valid) {
    throw new Error(`Validation failed: ${result.errors.join(', ')}`);
  }

  // Only send valid messages to server
  return topic.publishJSON(data);
}

// 2. Batch validation for better throughput
async function batchPublishWithValidation(messages: any[]) {
  // Validate all messages first
  const validMessages = messages.filter(msg => {
    const result = validator.validate('user-schema', msg);
    if (!result.valid) {
      console.warn(`Skipping invalid message:`, result.errors);
      return false;
    }
    return true;
  });

  // Publish only valid messages
  const promises = validMessages.map(msg => topic.publishJSON(msg));
  return Promise.all(promises);
}

// 3. Use binary encoding for better performance
const [binaryTopic] = await pubsub.createTopic('binary-topic', {
  schemaSettings: {
    schema: 'projects/my-project/schemas/user-schema',
    encoding: 'BINARY'  // ~2-3x faster than JSON
  }
});
```

### Caching Strategies

```typescript
// Cache schema definitions to avoid repeated fetches
class SchemaCacheManager {
  private cache = new Map<string, { schema: avro.Type; timestamp: number }>();
  private ttl = 3600000; // 1 hour

  async getSchema(schemaName: string): Promise<avro.Type> {
    const cached = this.cache.get(schemaName);

    // Return cached if still valid
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.schema;
    }

    // Fetch and cache
    const schema = pubsub.schema(schemaName);
    const [metadata] = await schema.get('FULL');
    const avroType = avro.Type.forSchema(JSON.parse(metadata.definition));

    this.cache.set(schemaName, {
      schema: avroType,
      timestamp: Date.now()
    });

    return avroType;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

## Best Practices

1. **Use schemas for critical data** - Enforce data quality
2. **Version your schemas** - Include version in schema name
3. **Test schema changes** - Validate backward/forward compatibility
4. **Document schemas** - Add descriptions in schema definitions
5. **Use appropriate encoding** - JSON for readability, BINARY for performance

## Official Documentation

- [Schema Overview](https://cloud.google.com/pubsub/docs/schemas)
- [Schema API Reference](https://googleapis.dev/nodejs/pubsub/latest/Schema.html)
- [Avro Schemas](https://avro.apache.org/docs/current/spec.html)
- [Protocol Buffers](https://developers.google.com/protocol-buffers)
