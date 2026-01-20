/**
 * Schema tests - Acceptance criteria from specs/08-schema.md
 * Reference: specs/08-schema.md
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import { SchemaTypes, Encodings } from '../../src/types';

describe('Schema', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'test-project' });
	});

	describe('AC-001: Create AVRO Schema', () => {
		test('creates AVRO schema and verifies existence', async () => {
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
				SchemaTypes.Avro,
				avroDefinition
			);

			expect(createdSchema.type).toBe(SchemaTypes.Avro);
			const [exists] = await createdSchema.exists();
			expect(exists).toBe(true);
		});
	});

	describe('AC-002: AVRO Validation Throws Unimplemented', () => {
		test('AVRO schema validation throws UnimplementedError', async () => {
			const schema = pubsub.schema('user-schema');

			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [
					{ name: 'userId', type: 'int' },
					{ name: 'action', type: 'string' }
				]
			});

			await schema.create(SchemaTypes.Avro, avroDefinition);

			const messageData = JSON.stringify({
				userId: 123,
				action: 'login'
			});

			await expect(
				schema.validateMessage(messageData, Encodings.Json)
			).rejects.toThrow('AVRO schemas');
		});
	});

	describe('AC-003: Protocol Buffer Validation Throws Unimplemented', () => {
		test('Protocol Buffer schema validation throws UnimplementedError', async () => {
			const schema = pubsub.schema('proto-schema');

			const protoDefinition = `
  message User {
    int32 userId = 1;
    string action = 2;
  }
`;

			await schema.create(SchemaTypes.ProtocolBuffer, protoDefinition);

			const messageData = Buffer.from([0x08, 0x7b, 0x12, 0x05, 0x6c, 0x6f, 0x67, 0x69, 0x6e]);

			await expect(
				schema.validateMessage(messageData, Encodings.Binary)
			).rejects.toThrow('Protocol Buffer schemas');
		});
	});

	describe('AC-004: Topic with Schema Validation', () => {
		test('validates messages against JSON schema on publish', async () => {
			const schema = pubsub.schema('order-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					orderId: { type: 'number' },
					amount: { type: 'number' }
				},
				required: ['orderId', 'amount']
			});

			await schema.create(SchemaTypes.Json, definition);

			const topic = pubsub.topic('orders');
			await topic.create({
				schemaSettings: {
					schema: 'order-schema',
					encoding: Encodings.Json
				}
			});

			const messageId1 = await topic.publishJSON({
				orderId: 12345,
				amount: 99.99
			});
			expect(messageId1).toBeDefined();

			await expect(
				topic.publishJSON({
					orderId: 'invalid',
					amount: 99.99
				})
			).rejects.toThrow();
		});
	});

	describe('AC-005: Schema Exists Check', () => {
		test('checks if schema exists', async () => {
			const schema = pubsub.schema('test-schema');

			const [existsBefore] = await schema.exists();
			expect(existsBefore).toBe(false);

			await schema.create(SchemaTypes.Json, '{"type": "object"}');

			const [existsAfter] = await schema.exists();
			expect(existsAfter).toBe(true);
		});
	});

	describe('AC-006: Delete Schema', () => {
		test('deletes schema and verifies removal', async () => {
			const schema = pubsub.schema('test-schema');

			await schema.create(SchemaTypes.Json, '{"type": "object"}');
			const [existsBefore] = await schema.exists();
			expect(existsBefore).toBe(true);

			await schema.delete();
			const [existsAfter] = await schema.exists();
			expect(existsAfter).toBe(false);
		});

		test('throws NotFoundError when deleting non-existent schema', async () => {
			const schema = pubsub.schema('non-existent');

			await expect(schema.delete()).rejects.toThrow('Schema not found');
		});
	});

	describe('AC-007: Get Schema Details', () => {
		test('retrieves schema with FULL view including definition', async () => {
			const schema = pubsub.schema('test-schema');

			const definition = '{"type": "object", "properties": {"name": {"type": "string"}}}';
			await schema.create(SchemaTypes.Json, definition);

			const [retrieved, metadata] = await schema.get('FULL');

			expect(retrieved.type).toBe(SchemaTypes.Json);
			expect(retrieved.definition).toBe(definition);
			expect(metadata.definition).toBe(definition);
		});

		test('retrieves schema with BASIC view without definition', async () => {
			const schema = pubsub.schema('test-schema');

			const definition = '{"type": "object", "properties": {"name": {"type": "string"}}}';
			await schema.create(SchemaTypes.Json, definition);

			const [retrieved, metadata] = await schema.get('BASIC');

			expect(retrieved.type).toBe(SchemaTypes.Json);
			expect(metadata.definition).toBeUndefined();
		});

		test('throws NotFoundError when getting non-existent schema', async () => {
			const schema = pubsub.schema('non-existent');

			await expect(schema.get()).rejects.toThrow('Schema not found');
		});
	});

	describe('AC-008: Invalid JSON Schema Definition', () => {
		test('rejects invalid JSON schema definition', async () => {
			const schema = pubsub.schema('invalid-schema');

			const invalidDefinition = '{"type": "invalid-type"}';

			await expect(
				schema.create(SchemaTypes.Json, invalidDefinition)
			).rejects.toThrow('Invalid JSON Schema definition');
		});

		test('rejects malformed JSON in schema definition', async () => {
			const schema = pubsub.schema('malformed-schema');

			const malformedDefinition = '{invalid json';

			await expect(
				schema.create(SchemaTypes.Json, malformedDefinition)
			).rejects.toThrow();
		});
	});

	describe('AC-009: List Schemas', () => {
		test('lists all schemas with FULL view', async () => {
			const schema1 = pubsub.schema('schema-1');
			const schema2 = pubsub.schema('schema-2');

			await schema1.create(SchemaTypes.Json, '{"type": "object"}');
			await schema2.create(SchemaTypes.Json, '{"type": "object"}');

			const schemas = [];
			for await (const s of pubsub.listSchemas('FULL')) {
				schemas.push(s);
			}

			expect(schemas.length).toBeGreaterThanOrEqual(2);
			expect(schemas.some(s => s.id.includes('schema-1'))).toBe(true);
			expect(schemas.some(s => s.id.includes('schema-2'))).toBe(true);
		});
	});

	describe('AC-010: Validate Schema Definition', () => {
		test('rejects invalid schema definition during validation', async () => {
			const invalidDefinition = '{"type": "unknown"}';

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: invalidDefinition
				})
			).rejects.toThrow();
		});

		test('accepts valid schema definition', async () => {
			const validDefinition = JSON.stringify({ type: 'object' });

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: validDefinition
				})
			).resolves.toBeUndefined();
		});
	});

	describe('AC-011: Get Schema Name', () => {
		test('returns fully-qualified schema name', async () => {
			const schema = pubsub.schema('test-schema');
			await schema.create(SchemaTypes.Json, '{"type": "object"}');

			const name = await schema.getName();

			expect(name).toMatch(/^projects\/.*\/schemas\/test-schema$/);
		});
	});

	describe('JSON Schema Validation', () => {
		test('validates message with JSON encoding', async () => {
			const schema = pubsub.schema('validation-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					userId: { type: 'number' },
					email: { type: 'string', format: 'email' }
				},
				required: ['userId', 'email']
			});

			await schema.create(SchemaTypes.Json, definition);

			const validMessage = JSON.stringify({
				userId: 123,
				email: 'test@example.com'
			});

			await expect(
				schema.validateMessage(validMessage, Encodings.Json)
			).resolves.toBeUndefined();
		});

		test('rejects invalid message against JSON schema', async () => {
			const schema = pubsub.schema('validation-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					userId: { type: 'number' }
				},
				required: ['userId']
			});

			await schema.create(SchemaTypes.Json, definition);

			const invalidMessage = JSON.stringify({
				userId: 'not-a-number'
			});

			await expect(
				schema.validateMessage(invalidMessage, Encodings.Json)
			).rejects.toThrow('Message validation failed');
		});

		test('validates message with Buffer data', async () => {
			const schema = pubsub.schema('buffer-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					message: { type: 'string' }
				},
				required: ['message']
			});

			await schema.create(SchemaTypes.Json, definition);

			const messageData = Buffer.from(JSON.stringify({ message: 'test' }));

			await expect(
				schema.validateMessage(messageData, Encodings.Json)
			).resolves.toBeUndefined();
		});

		test('caches compiled validators for performance', async () => {
			const schema = pubsub.schema('cache-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					value: { type: 'number' }
				}
			});

			await schema.create(SchemaTypes.Json, definition);

			const message = JSON.stringify({ value: 42 });

			await expect(schema.validateMessage(message, Encodings.Json)).resolves.toBeUndefined();
			await expect(schema.validateMessage(message, Encodings.Json)).resolves.toBeUndefined();
		});
	});

	describe('Edge Cases', () => {
		test('handles complex nested JSON schema', async () => {
			const schema = pubsub.schema('complex-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					user: {
						type: 'object',
						properties: {
							id: { type: 'number' },
							profile: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									age: { type: 'number' }
								},
								required: ['name']
							}
						},
						required: ['id', 'profile']
					}
				},
				required: ['user']
			});

			await schema.create(SchemaTypes.Json, definition);

			const validMessage = JSON.stringify({
				user: {
					id: 123,
					profile: {
						name: 'John',
						age: 30
					}
				}
			});

			await expect(
				schema.validateMessage(validMessage, Encodings.Json)
			).resolves.toBeUndefined();
		});

		test('validates schema with arrays', async () => {
			const schema = pubsub.schema('array-schema');

			const definition = JSON.stringify({
				type: 'object',
				properties: {
					items: {
						type: 'array',
						items: { type: 'string' }
					}
				},
				required: ['items']
			});

			await schema.create(SchemaTypes.Json, definition);

			const message = JSON.stringify({
				items: ['a', 'b', 'c']
			});

			await expect(
				schema.validateMessage(message, Encodings.Json)
			).resolves.toBeUndefined();
		});
	});

	describe('Edge Cases: listSchemas()', () => {
		test('returns empty array when no schemas exist', async () => {
			const freshPubsub = new PubSub({ projectId: 'empty-project' });

			const schemas = [];
			for await (const schema of freshPubsub.listSchemas()) {
				schemas.push(schema);
			}

			expect(schemas.length).toBe(0);
		});

		test('handles undefined view parameter (defaults to BASIC)', async () => {
			const definition = JSON.stringify({ type: 'object' });
			await pubsub.createSchema('test-schema-default-view', SchemaTypes.Json, definition);

			const schemas = [];
			for await (const schema of pubsub.listSchemas()) {
				schemas.push(schema);
			}

			expect(schemas.length).toBeGreaterThanOrEqual(1);
			const targetSchema = schemas.find(s => s.id.includes('test-schema-default-view'));
			expect(targetSchema).toBeDefined();
			expect(targetSchema?.type).toBeDefined();
			expect(targetSchema?.definition).toBeUndefined();
		});

		test('BASIC view excludes definition', async () => {
			const definition = JSON.stringify({ type: 'object' });
			await pubsub.createSchema('basic-view-schema', SchemaTypes.Json, definition);

			const schemas = [];
			for await (const schema of pubsub.listSchemas('BASIC')) {
				schemas.push(schema);
			}

			const targetSchema = schemas.find(s => s.id.includes('basic-view-schema'));
			expect(targetSchema).toBeDefined();
			expect(targetSchema?.type).toBeDefined();
			expect(targetSchema?.definition).toBeUndefined();
		});

		test('FULL view includes definition', async () => {
			const definition = JSON.stringify({ type: 'object', properties: { id: { type: 'number' } } });
			await pubsub.createSchema('full-view-schema', SchemaTypes.Json, definition);

			const schemas = [];
			for await (const schema of pubsub.listSchemas('FULL')) {
				schemas.push(schema);
			}

			const targetSchema = schemas.find(s => s.id.includes('full-view-schema'));
			expect(targetSchema).toBeDefined();
			expect(targetSchema?.type).toBeDefined();
			expect(targetSchema?.definition).toBeDefined();
			expect(targetSchema?.definition).toContain('"type":"object"');
		});

		test('lists multiple schemas correctly', async () => {
			const definition1 = JSON.stringify({ type: 'object', properties: { a: { type: 'string' } } });
			const definition2 = JSON.stringify({ type: 'object', properties: { b: { type: 'number' } } });
			const definition3 = JSON.stringify({ type: 'object', properties: { c: { type: 'boolean' } } });

			await pubsub.createSchema('multi-schema-1', SchemaTypes.Json, definition1);
			await pubsub.createSchema('multi-schema-2', SchemaTypes.Json, definition2);
			await pubsub.createSchema('multi-schema-3', SchemaTypes.Json, definition3);

			const schemas = [];
			for await (const schema of pubsub.listSchemas('FULL')) {
				schemas.push(schema);
			}

			expect(schemas.length).toBeGreaterThanOrEqual(3);

			const schema1 = schemas.find(s => s.id.includes('multi-schema-1'));
			const schema2 = schemas.find(s => s.id.includes('multi-schema-2'));
			const schema3 = schemas.find(s => s.id.includes('multi-schema-3'));

			expect(schema1).toBeDefined();
			expect(schema2).toBeDefined();
			expect(schema3).toBeDefined();
		});

		test('handles schemas with different types', async () => {
			const jsonDef = JSON.stringify({ type: 'object' });
			const avroDef = JSON.stringify({ type: 'record', name: 'Test', fields: [] });

			await pubsub.createSchema('json-type-schema', SchemaTypes.Json, jsonDef);
			await pubsub.createSchema('avro-type-schema', SchemaTypes.Avro, avroDef);

			const schemas = [];
			for await (const schema of pubsub.listSchemas('FULL')) {
				schemas.push(schema);
			}

			const jsonSchema = schemas.find(s => s.id.includes('json-type-schema'));
			const avroSchema = schemas.find(s => s.id.includes('avro-type-schema'));

			expect(jsonSchema?.type).toBe(SchemaTypes.Json);
			expect(avroSchema?.type).toBe(SchemaTypes.Avro);
		});
	});

	describe('Edge Cases: validateSchema()', () => {
		test('rejects empty definition string', async () => {
			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: ''
				})
			).rejects.toThrow();
		});

		test('rejects definition with syntax errors', async () => {
			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: '{"type":"object",,}'
				})
			).rejects.toThrow();
		});

		test('accepts complex valid JSON schema', async () => {
			const complexDefinition = JSON.stringify({
				type: 'object',
				properties: {
					id: { type: 'number' },
					name: { type: 'string', minLength: 1 },
					email: { type: 'string', format: 'email' },
					age: { type: 'number', minimum: 0, maximum: 150 },
					tags: { type: 'array', items: { type: 'string' } },
					metadata: {
						type: 'object',
						properties: {
							created: { type: 'string', format: 'date-time' },
							updated: { type: 'string', format: 'date-time' }
						}
					}
				},
				required: ['id', 'name']
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: complexDefinition
				})
			).resolves.toBeUndefined();
		});

		test('validates AVRO schema as JSON', async () => {
			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [{ name: 'id', type: 'int' }]
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Avro,
					definition: avroDefinition
				})
			).resolves.toBeUndefined();
		});

		test('rejects invalid AVRO schema (malformed JSON)', async () => {
			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Avro,
					definition: '{ invalid json'
				})
			).rejects.toThrow('Invalid AVRO schema definition');
		});

		test('accepts Protocol Buffer schema without validation', async () => {
			const protobufDefinition = 'syntax = "proto3"; message User { int32 id = 1; }';

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.ProtocolBuffer,
					definition: protobufDefinition
				})
			).resolves.toBeUndefined();
		});

		test('validates schema with array constraints', async () => {
			const arrayDefinition = JSON.stringify({
				type: 'object',
				properties: {
					items: {
						type: 'array',
						items: { type: 'string' },
						minItems: 1,
						maxItems: 10
					}
				}
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: arrayDefinition
				})
			).resolves.toBeUndefined();
		});

		test('validates schema with enum values', async () => {
			const enumDefinition = JSON.stringify({
				type: 'object',
				properties: {
					status: {
						type: 'string',
						enum: ['pending', 'active', 'completed']
					}
				}
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: enumDefinition
				})
			).resolves.toBeUndefined();
		});

		test('validates schema with pattern constraints', async () => {
			const patternDefinition = JSON.stringify({
				type: 'object',
				properties: {
					email: {
						type: 'string',
						pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
					}
				}
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: patternDefinition
				})
			).resolves.toBeUndefined();
		});

		test('rejects JSON schema with invalid type property value', async () => {
			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: JSON.stringify({ type: 'invalid_type' })
				})
			).rejects.toThrow();
		});

		test('handles very large schema definitions', async () => {
			const properties: Record<string, unknown> = {};
			for (let i = 0; i < 100; i++) {
				properties[`field${i}`] = { type: 'string' };
			}

			const largeDefinition = JSON.stringify({
				type: 'object',
				properties
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Json,
					definition: largeDefinition
				})
			).resolves.toBeUndefined();
		});
	});
});
