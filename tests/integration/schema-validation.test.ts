import { describe, test, expect, beforeEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';
import { SchemaTypes, Encodings } from '../../src/types/schema';

describe('Integration: Schema Validation', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'schema-integration-test' });
	});

	test('AC-004: Topic with schema rejects invalid messages', async () => {
		const schemaId = 'order-schema-reject';
		const topicName = 'orders-reject';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				orderId: { type: 'number' },
				amount: { type: 'number' },
				currency: { type: 'string' }
			},
			required: ['orderId', 'amount', 'currency']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		await expect(
			topic.publishJSON({
				orderId: 'invalid',
				amount: 99.99,
				currency: 'USD'
			})
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({
				orderId: 12345,
				amount: 'invalid',
				currency: 'USD'
			})
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({
				orderId: 12345,
				amount: 99.99
			})
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});

	test('AC-004: Valid messages pass through with schema validation', async () => {
		const schemaId = 'user-schema-valid';
		const topicName = 'users-valid';
		const subName = 'users-sub-valid';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				userId: { type: 'number' },
				username: { type: 'string' },
				email: { type: 'string' }
			},
			required: ['userId', 'username']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const [subscription] = await pubsub.createSubscription(topicName, subName);

		const messageReceived = new Promise<Message>((resolve) => {
			subscription.on('message', (message: Message) => {
				resolve(message);
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.open();

		const validMessage = {
			userId: 123,
			username: 'testuser',
			email: 'test@example.com'
		};

		const messageId = await topic.publishJSON(validMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');

		const message = await messageReceived;
		const receivedData = JSON.parse(message.data.toString());

		expect(receivedData.userId).toBe(123);
		expect(receivedData.username).toBe('testuser');
		expect(receivedData.email).toBe('test@example.com');

		message.ack();

		await subscription.close();
		await pubsub.close();
	});

	test('Schema validation with multiple messages', async () => {
		const schemaId = 'event-schema-multi';
		const topicName = 'events-multi';
		const subName = 'events-sub-multi';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				eventType: { type: 'string', enum: ['click', 'view', 'purchase'] },
				timestamp: { type: 'number' },
				userId: { type: 'number' }
			},
			required: ['eventType', 'timestamp', 'userId']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const [subscription] = await pubsub.createSubscription(topicName, subName);

		const messages: Message[] = [];
		const messagePromise = new Promise<void>((resolve) => {
			let count = 0;
			subscription.on('message', (message: Message) => {
				messages.push(message);
				message.ack();
				count++;
				if (count === 3) {
					resolve();
				}
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.open();

		await topic.publishJSON({
			eventType: 'click',
			timestamp: Date.now(),
			userId: 1
		});

		await topic.publishJSON({
			eventType: 'view',
			timestamp: Date.now(),
			userId: 2
		});

		await topic.publishJSON({
			eventType: 'purchase',
			timestamp: Date.now(),
			userId: 3
		});

		await expect(
			topic.publishJSON({
				eventType: 'invalid-event',
				timestamp: Date.now(),
				userId: 4
			})
		).rejects.toThrow('validation failed');

		await messagePromise;

		expect(messages).toHaveLength(3);

		const receivedData = messages.map(m => JSON.parse(m.data.toString()));
		expect(receivedData[0]?.eventType).toBe('click');
		expect(receivedData[1]?.eventType).toBe('view');
		expect(receivedData[2]?.eventType).toBe('purchase');

		await subscription.close();
		await pubsub.close();
	});

	test('Schema lifecycle: get, delete, recreate', async () => {
		const schemaId = 'lifecycle-schema';
		const schema = pubsub.schema(schemaId);

		const [exists1] = await schema.exists();
		expect(exists1).toBe(false);

		const definition1 = JSON.stringify({
			type: 'object',
			properties: {
				version: { type: 'number' }
			},
			required: ['version']
		});

		await schema.create(SchemaTypes.Json, definition1);

		const [exists2] = await schema.exists();
		expect(exists2).toBe(true);

		const [retrieved, metadata] = await schema.get('FULL');
		expect(retrieved.type).toBe(SchemaTypes.Json);
		expect(metadata.definition).toBe(definition1);

		await schema.delete();

		const [exists3] = await schema.exists();
		expect(exists3).toBe(false);

		const definition2 = JSON.stringify({
			type: 'object',
			properties: {
				version: { type: 'string' }
			},
			required: ['version']
		});

		await schema.create(SchemaTypes.Json, definition2);

		const [exists4] = await schema.exists();
		expect(exists4).toBe(true);

		const [_retrieved2, metadata2] = await schema.get('FULL');
		expect(metadata2.definition).toBe(definition2);

		await pubsub.close();
	});

	test('Schema validation with complex nested objects', async () => {
		const schemaId = 'complex-schema';
		const topicName = 'complex-topic';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				orderId: { type: 'number' },
				customer: {
					type: 'object',
					properties: {
						customerId: { type: 'number' },
						name: { type: 'string' },
						address: {
							type: 'object',
							properties: {
								street: { type: 'string' },
								city: { type: 'string' },
								zipCode: { type: 'string' }
							},
							required: ['street', 'city', 'zipCode']
						}
					},
					required: ['customerId', 'name', 'address']
				},
				items: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							productId: { type: 'string' },
							quantity: { type: 'number' },
							price: { type: 'number' }
						},
						required: ['productId', 'quantity', 'price']
					}
				}
			},
			required: ['orderId', 'customer', 'items']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const validOrder = {
			orderId: 12345,
			customer: {
				customerId: 789,
				name: 'John Doe',
				address: {
					street: '123 Main St',
					city: 'Springfield',
					zipCode: '12345'
				}
			},
			items: [
				{ productId: 'PROD-001', quantity: 2, price: 29.99 },
				{ productId: 'PROD-002', quantity: 1, price: 49.99 }
			]
		};

		const messageId = await topic.publishJSON(validOrder);
		expect(messageId).toBeDefined();

		await expect(
			topic.publishJSON({
				orderId: 12345,
				customer: {
					customerId: 789,
					name: 'John Doe',
					address: {
						street: '123 Main St',
						city: 'Springfield'
					}
				},
				items: []
			})
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({
				orderId: 12345,
				customer: {
					customerId: 789,
					name: 'John Doe',
					address: {
						street: '123 Main St',
						city: 'Springfield',
						zipCode: '12345'
					}
				},
				items: [
					{ productId: 'PROD-001', quantity: 2 }
				]
			})
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});

	test('Schema validation with array constraints', async () => {
		const schemaId = 'array-schema';
		const topicName = 'array-topic';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				tags: {
					type: 'array',
					items: { type: 'string' },
					minItems: 1,
					maxItems: 5
				}
			},
			required: ['tags']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const messageId = await topic.publishJSON({ tags: ['tag1', 'tag2', 'tag3'] });
		expect(messageId).toBeDefined();

		await expect(
			topic.publishJSON({ tags: [] })
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'] })
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});

	test('Schema validation with multiple subscribers', async () => {
		const schemaId = 'multi-sub-schema';
		const topicName = 'multi-sub-topic';
		const sub1Name = 'multi-sub-1';
		const sub2Name = 'multi-sub-2';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				messageId: { type: 'number' },
				content: { type: 'string' }
			},
			required: ['messageId', 'content']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const [sub1] = await pubsub.createSubscription(topicName, sub1Name);
		const [sub2] = await pubsub.createSubscription(topicName, sub2Name);

		const messages1: Message[] = [];
		const messages2: Message[] = [];

		const sub1Promise = new Promise<void>((resolve) => {
			sub1.on('message', (message: Message) => {
				messages1.push(message);
				message.ack();
				if (messages1.length === 2) {
					resolve();
				}
			});
			sub1.on('error', (error: Error) => {
				throw error;
			});
		});

		const sub2Promise = new Promise<void>((resolve) => {
			sub2.on('message', (message: Message) => {
				messages2.push(message);
				message.ack();
				if (messages2.length === 2) {
					resolve();
				}
			});
			sub2.on('error', (error: Error) => {
				throw error;
			});
		});

		sub1.open();
		sub2.open();

		await topic.publishJSON({ messageId: 1, content: 'First message' });
		await topic.publishJSON({ messageId: 2, content: 'Second message' });

		await expect(
			topic.publishJSON({ messageId: 3 })
		).rejects.toThrow('validation failed');

		await Promise.all([sub1Promise, sub2Promise]);

		expect(messages1).toHaveLength(2);
		expect(messages2).toHaveLength(2);

		const data1 = messages1.map(m => JSON.parse(m.data.toString()));
		const data2 = messages2.map(m => JSON.parse(m.data.toString()));

		expect(data1[0]?.messageId).toBe(1);
		expect(data1[1]?.messageId).toBe(2);
		expect(data2[0]?.messageId).toBe(1);
		expect(data2[1]?.messageId).toBe(2);

		await sub1.close();
		await sub2.close();
		await pubsub.close();
	});

	test('Schema validation without explicit encoding parameter', async () => {
		const schemaId = 'no-encoding-schema';
		const topicName = 'no-encoding-topic';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				value: { type: 'string' }
			},
			required: ['value']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		const messageId = await topic.publishJSON({ value: 'test' });
		expect(messageId).toBeDefined();

		await expect(
			topic.publishJSON({ value: 123 })
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});

	test('List schemas after creating multiple', async () => {
		const schema1 = pubsub.schema('list-schema-1');
		const schema2 = pubsub.schema('list-schema-2');
		const schema3 = pubsub.schema('list-schema-3');

		await schema1.create(SchemaTypes.Json, '{"type": "object"}');
		await schema2.create(SchemaTypes.Json, '{"type": "object"}');
		await schema3.create(SchemaTypes.Json, '{"type": "object"}');

		const schemas = [];
		for await (const s of pubsub.listSchemas('FULL')) {
			schemas.push(s);
		}

		expect(schemas.length).toBeGreaterThanOrEqual(3);

		const schemaIds = schemas.map(s => s.id);
		expect(schemaIds.some(id => id.includes('list-schema-1'))).toBe(true);
		expect(schemaIds.some(id => id.includes('list-schema-2'))).toBe(true);
		expect(schemaIds.some(id => id.includes('list-schema-3'))).toBe(true);

		await pubsub.close();
	});

	test('Schema validation with string constraints', async () => {
		const schemaId = 'string-schema';
		const topicName = 'string-topic';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				username: {
					type: 'string',
					minLength: 3,
					maxLength: 20,
					pattern: '^[a-zA-Z0-9_]+$'
				}
			},
			required: ['username']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		await topic.publishJSON({ username: 'valid_user123' });

		await expect(
			topic.publishJSON({ username: 'ab' })
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({ username: 'this_is_a_very_long_username' })
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({ username: 'invalid-user!' })
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});

	test('Schema validation with numeric constraints', async () => {
		const schemaId = 'numeric-schema';
		const topicName = 'numeric-topic';

		const schema = pubsub.schema(schemaId);
		const definition = JSON.stringify({
			type: 'object',
			properties: {
				age: {
					type: 'number',
					minimum: 0,
					maximum: 150
				},
				score: {
					type: 'number',
					multipleOf: 0.5
				}
			},
			required: ['age', 'score']
		});

		await schema.create(SchemaTypes.Json, definition);

		const topic = pubsub.topic(topicName);
		await topic.create({
			schemaSettings: {
				schema: schemaId,
				encoding: Encodings.Json
			}
		});

		await topic.publishJSON({ age: 25, score: 87.5 });

		await expect(
			topic.publishJSON({ age: -5, score: 100 })
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({ age: 200, score: 100 })
		).rejects.toThrow('validation failed');

		await expect(
			topic.publishJSON({ age: 25, score: 87.3 })
		).rejects.toThrow('validation failed');

		await pubsub.close();
	});
});
