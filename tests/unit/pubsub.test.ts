/**
 * PubSub Client Tests
 * Testing all 13 acceptance criteria from specs/01-pubsub-client.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import { Topic } from '../../src/topic';
import { Subscription } from '../../src/subscription';
import { Schema } from '../../src/schema';
import { MessageQueue } from '../../src/internal/message-queue';
import { SchemaTypes } from '../../src/types';

describe('PubSub Client', () => {
	let queue: MessageQueue;

	beforeEach(() => {
		queue = MessageQueue.getInstance();
	});

	afterEach(() => {
		const subscriptions = queue.getAllSubscriptions();
		for (const sub of subscriptions) {
			if (sub.name) {
				queue.unregisterSubscription(sub.name);
			}
		}

		const topics = queue.getAllTopics();
		for (const topic of topics) {
			if (topic.name) {
				queue.unregisterTopic(topic.name);
			}
		}
	});

	describe('AC-001: Basic Instantiation', () => {
		test('should create PubSub instance with custom project ID', () => {
			const pubsub = new PubSub({ projectId: 'test-project' });
			expect(pubsub.projectId).toBe('test-project');
		});
	});

	describe('AC-002: Default Project ID', () => {
		test('should default to local-project when no projectId provided', () => {
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('local-project');
		});

		test('should detect projectId from PUBSUB_PROJECT_ID environment variable', () => {
			process.env.PUBSUB_PROJECT_ID = 'env-project-1';
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('env-project-1');
			delete process.env.PUBSUB_PROJECT_ID;
		});

		test('should detect projectId from GOOGLE_CLOUD_PROJECT environment variable', () => {
			process.env.GOOGLE_CLOUD_PROJECT = 'env-project-2';
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('env-project-2');
			delete process.env.GOOGLE_CLOUD_PROJECT;
		});

		test('should detect projectId from GCLOUD_PROJECT environment variable', () => {
			process.env.GCLOUD_PROJECT = 'env-project-3';
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('env-project-3');
			delete process.env.GCLOUD_PROJECT;
		});

		test('should prioritize PUBSUB_PROJECT_ID over GOOGLE_CLOUD_PROJECT', () => {
			process.env.PUBSUB_PROJECT_ID = 'pubsub-project';
			process.env.GOOGLE_CLOUD_PROJECT = 'google-project';
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('pubsub-project');
			delete process.env.PUBSUB_PROJECT_ID;
			delete process.env.GOOGLE_CLOUD_PROJECT;
		});

		test('should prioritize GOOGLE_CLOUD_PROJECT over GCLOUD_PROJECT', () => {
			process.env.GOOGLE_CLOUD_PROJECT = 'google-project';
			process.env.GCLOUD_PROJECT = 'gcloud-project';
			const pubsub = new PubSub();
			expect(pubsub.projectId).toBe('google-project');
			delete process.env.GOOGLE_CLOUD_PROJECT;
			delete process.env.GCLOUD_PROJECT;
		});

		test('should prioritize explicit projectId option over environment variables', () => {
			process.env.PUBSUB_PROJECT_ID = 'env-project';
			const pubsub = new PubSub({ projectId: 'explicit-project' });
			expect(pubsub.projectId).toBe('explicit-project');
			delete process.env.PUBSUB_PROJECT_ID;
		});
	});

	describe('AC-003: Topic Factory Returns Same Instance', () => {
		test('should return same Topic instance for same name', () => {
			const pubsub = new PubSub();
			const topic1 = pubsub.topic('my-topic');
			const topic2 = pubsub.topic('my-topic');
			expect(topic1).toBe(topic2);
		});

		test('should return different instances for different names', () => {
			const pubsub = new PubSub();
			const topic1 = pubsub.topic('topic-1');
			const topic2 = pubsub.topic('topic-2');
			expect(topic1).not.toBe(topic2);
		});
	});

	describe('AC-004: Create and Get Topic', () => {
		test('should create topic and return tuple', async () => {
			const pubsub = new PubSub();
			const [topic, metadata] = await pubsub.createTopic('my-topic');

			expect(topic).toBeInstanceOf(Topic);
			expect(topic.name).toBe('projects/local-project/topics/my-topic');
			expect(metadata).toBeDefined();
			expect(metadata?.name).toBe('projects/local-project/topics/my-topic');
		});

		test('should get all topics', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('topic-1');
			await pubsub.createTopic('topic-2');

			const [topics] = await pubsub.getTopics();
			expect(topics).toHaveLength(2);
			expect(topics[0]).toBeInstanceOf(Topic);
			expect(topics[0]!.name).toBe('projects/local-project/topics/topic-1');
			expect(topics[1]!.name).toBe('projects/local-project/topics/topic-2');
		});

		test('should format topic name correctly', async () => {
			const pubsub = new PubSub({ projectId: 'test-project' });
			const [topic] = await pubsub.createTopic('my-topic');
			expect(topic.name).toBe('projects/test-project/topics/my-topic');
		});
	});

	describe('AC-005: Create Topic Twice Throws Error', () => {
		test('should throw AlreadyExistsError when creating duplicate topic', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');

			await expect(pubsub.createTopic('my-topic')).rejects.toThrow('Topic already exists');
		});
	});

	describe('AC-006: Create Subscription', () => {
		test('should create subscription with topic name', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');
			const [sub, metadata] = await pubsub.createSubscription('my-topic', 'my-sub');

			expect(sub).toBeInstanceOf(Subscription);
			expect(sub.name).toBe('projects/local-project/subscriptions/my-sub');
			expect(metadata).toBeDefined();
		});

		test('should create subscription with Topic object', async () => {
			const pubsub = new PubSub();
			const [topic] = await pubsub.createTopic('my-topic');
			const [sub] = await pubsub.createSubscription(topic, 'my-sub');

			expect(sub).toBeInstanceOf(Subscription);
			expect(sub.name).toBe('projects/local-project/subscriptions/my-sub');
		});

		test('should throw NotFoundError when topic does not exist', async () => {
			const pubsub = new PubSub();
			await expect(
				pubsub.createSubscription('non-existent-topic', 'my-sub')
			).rejects.toThrow('Topic not found');
		});

		test('should throw AlreadyExistsError when subscription already exists', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');
			await pubsub.createSubscription('my-topic', 'my-sub');

			await expect(
				pubsub.createSubscription('my-topic', 'my-sub')
			).rejects.toThrow('Subscription already exists');
		});
	});

	describe('AC-007: Subscription Factory Returns Same Instance', () => {
		test('should return same Subscription instance for same name', () => {
			const pubsub = new PubSub();
			const sub1 = pubsub.subscription('my-sub');
			const sub2 = pubsub.subscription('my-sub');
			expect(sub1).toBe(sub2);
		});

		test('should return different instances for different names', () => {
			const pubsub = new PubSub();
			const sub1 = pubsub.subscription('sub-1');
			const sub2 = pubsub.subscription('sub-2');
			expect(sub1).not.toBe(sub2);
		});

		test('should return same instance when called with different options', () => {
			const pubsub = new PubSub();
			const sub1 = pubsub.subscription('my-sub', {
				flowControl: { maxMessages: 100 }
			});
			const sub2 = pubsub.subscription('my-sub', {
				flowControl: { maxMessages: 500 }
			});
			expect(sub1).toBe(sub2);
		});

		test('should accept options parameter', () => {
			const pubsub = new PubSub();
			const sub = pubsub.subscription('my-sub', {
				flowControl: { maxMessages: 100 }
			});
			expect(sub.name).toBe('projects/local-project/subscriptions/my-sub');
		});
	});

	describe('AC-008: Get Topics Stream', () => {
		test('should stream all topics', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('topic-1');
			await pubsub.createTopic('topic-2');
			await pubsub.createTopic('topic-3');

			const topics: Topic[] = [];
			const stream = pubsub.getTopicsStream();

			stream.on('data', (topic: Topic) => {
				topics.push(topic);
			});

			await new Promise((resolve, reject) => {
				stream.on('end', resolve);
				stream.on('error', reject);
			});

			expect(topics.length).toBe(3);
			expect(topics[0]).toBeInstanceOf(Topic);
		});

		test('should handle empty topics list', async () => {
			const pubsub = new PubSub();
			const topics: Topic[] = [];
			const stream = pubsub.getTopicsStream();

			stream.on('data', (topic: Topic) => {
				topics.push(topic);
			});

			await new Promise((resolve) => {
				stream.on('end', resolve);
			});

			expect(topics.length).toBe(0);
		});
	});

	describe('AC-009: Get Subscriptions Stream', () => {
		test('should stream all subscriptions', async () => {
			const pubsub = new PubSub();
			const topic = pubsub.topic('my-topic');
			await topic.create();
			await pubsub.createSubscription('my-topic', 'sub-1');
			await pubsub.createSubscription('my-topic', 'sub-2');

			const subscriptions: Subscription[] = [];
			const stream = pubsub.getSubscriptionsStream();

			stream.on('data', (sub: Subscription) => {
				subscriptions.push(sub);
			});

			await new Promise((resolve, reject) => {
				stream.on('end', resolve);
				stream.on('error', reject);
			});

			expect(subscriptions.length).toBe(2);
			expect(subscriptions[0]).toBeInstanceOf(Subscription);
		});

		test('should filter subscriptions by topic', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('topic-1');
			await pubsub.createTopic('topic-2');
			await pubsub.createSubscription('topic-1', 'sub-1');
			await pubsub.createSubscription('topic-2', 'sub-2');

			const subscriptions: Subscription[] = [];
			const stream = pubsub.getSubscriptionsStream({ topic: 'topic-1' });

			stream.on('data', (sub: Subscription) => {
				subscriptions.push(sub);
			});

			await new Promise((resolve) => {
				stream.on('end', resolve);
			});

			expect(subscriptions.length).toBe(1);
			expect(subscriptions[0]!.name).toBe('projects/local-project/subscriptions/sub-1');
		});
	});

	describe('AC-010: Create and Validate Schema', () => {
		test('should validate AVRO schema', async () => {
			const pubsub = new PubSub();

			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [
					{ name: 'id', type: 'string' },
					{ name: 'name', type: 'string' }
				]
			});

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Avro,
					definition: avroDefinition
				})
			).resolves.toBeUndefined();
		});

		test('should create schema', async () => {
			const pubsub = new PubSub();

			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [
					{ name: 'id', type: 'string' },
					{ name: 'name', type: 'string' }
				]
			});

			const [schema, metadata] = await pubsub.createSchema(
				'user-schema',
				SchemaTypes.Avro,
				avroDefinition
			);

			expect(schema).toBeInstanceOf(Schema);
			expect(schema.id).toContain('user-schema');
			expect(metadata.type).toBe(SchemaTypes.Avro);
			expect(metadata.definition).toBe(avroDefinition);
		});

		test('should throw error for invalid AVRO schema', async () => {
			const pubsub = new PubSub();

			await expect(
				pubsub.validateSchema({
					type: SchemaTypes.Avro,
					definition: 'invalid json'
				})
			).rejects.toThrow('Invalid AVRO schema definition');
		});

		test('should throw error when creating duplicate schema', async () => {
			const pubsub = new PubSub();

			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [{ name: 'id', type: 'string' }]
			});

			await pubsub.createSchema('user-schema', SchemaTypes.Avro, avroDefinition);

			await expect(
				pubsub.createSchema('user-schema', SchemaTypes.Avro, avroDefinition)
			).rejects.toThrow('Schema already exists');
		});
	});

	describe('AC-011: List Schemas', () => {
		test('should list all schemas', async () => {
			const pubsub = new PubSub();

			const avroDefinition1 = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [{ name: 'id', type: 'string' }]
			});

			const avroDefinition2 = JSON.stringify({
				type: 'record',
				name: 'Order',
				fields: [{ name: 'orderId', type: 'string' }]
			});

			await pubsub.createSchema('schema-1', SchemaTypes.Avro, avroDefinition1);
			await pubsub.createSchema('schema-2', SchemaTypes.Avro, avroDefinition2);

			const schemas: Schema[] = [];
			for await (const schema of pubsub.listSchemas('FULL')) {
				schemas.push(schema);
			}

			expect(schemas.length).toBe(2);
			expect(schemas[0]).toBeInstanceOf(Schema);
			expect(schemas[0]!.definition).toBeDefined();
		});

		test('should list schemas with BASIC view', async () => {
			const pubsub = new PubSub();

			const avroDefinition = JSON.stringify({
				type: 'record',
				name: 'User',
				fields: [{ name: 'id', type: 'string' }]
			});

			await pubsub.createSchema('schema-1', SchemaTypes.Avro, avroDefinition);

			const schemas: Schema[] = [];
			for await (const schema of pubsub.listSchemas('BASIC')) {
				schemas.push(schema);
			}

			expect(schemas.length).toBe(1);
			expect(schemas[0]!.type).toBeDefined();
			expect(schemas[0]!.definition).toBeUndefined();
		});
	});

	describe('AC-012: Get Project ID', () => {
		test('should return project ID', async () => {
			const pubsub = new PubSub({ projectId: 'my-project' });
			const projectId = await pubsub.getProjectId();
			expect(projectId).toBe('my-project');
		});

		test('should return default project ID', async () => {
			const pubsub = new PubSub();
			const projectId = await pubsub.getProjectId();
			expect(projectId).toBe('local-project');
		});
	});

	describe('AC-013: Close Client', () => {
		test('should close all open subscriptions', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');
			const [subscription] = await pubsub.createSubscription('my-topic', 'my-sub');
			subscription.open();

			expect(subscription.isOpen).toBe(true);

			await pubsub.close();

			expect(subscription.isOpen).toBe(false);
		});

		test('should clear all caches', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('test-topic-clear');
			const topic1 = pubsub.topic('test-topic-clear');

			await pubsub.close();

			const topic2 = pubsub.topic('test-topic-clear');
			expect(topic1).not.toBe(topic2);
		});
	});

	describe('Additional Behavior Tests', () => {
		test('should detect emulator mode from environment', () => {
			process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
			const pubsub = new PubSub();
			expect(pubsub.isEmulator).toBe(true);
			delete process.env.PUBSUB_EMULATOR_HOST;
		});

		test('should override emulator mode with explicit option', () => {
			process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
			const pubsub = new PubSub({ emulatorMode: false });
			expect(pubsub.isEmulator).toBe(false);
			delete process.env.PUBSUB_EMULATOR_HOST;
		});

		test('should get client config', async () => {
			const pubsub = new PubSub({ projectId: 'test-project' });
			const config = await pubsub.getClientConfig() as { projectId: string; servicePath: string };
			expect(config.projectId).toBe('test-project');
			expect(config.servicePath).toBeDefined();
		});

		test('should get schema client', async () => {
			const pubsub = new PubSub();
			const client = await pubsub.getSchemaClient();
			expect(client).toBeDefined();
		});

		test('should get snapshots stream', () => {
			const pubsub = new PubSub();
			const stream = pubsub.getSnapshotsStream();
			expect(stream).toBeDefined();
		});

		test('should create snapshot reference', () => {
			const pubsub = new PubSub();
			const snapshot = pubsub.snapshot('my-snapshot');
			expect(snapshot).toBeDefined();
			expect(snapshot.name).toContain('my-snapshot');
		});

		test('should get subscription by name', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');
			await pubsub.createSubscription('my-topic', 'my-sub');

			const [subscription, metadata] = await pubsub.getSubscription('my-sub');
			expect(subscription).toBeInstanceOf(Subscription);
			expect(metadata).toBeDefined();
		});

		test('should throw error when getting non-existent subscription', async () => {
			const pubsub = new PubSub();
			await expect(
				pubsub.getSubscription('non-existent')
			).rejects.toThrow('Subscription not found');
		});

		test('should get topic by name', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('my-topic');

			const [topic, metadata] = await pubsub.getTopic('my-topic');
			expect(topic).toBeInstanceOf(Topic);
			expect(metadata).toBeDefined();
		});

		test('should throw error when getting non-existent topic', async () => {
			const pubsub = new PubSub();
			await expect(
				pubsub.getTopic('non-existent')
			).rejects.toThrow('Topic not found');
		});

		test('should filter subscriptions by topic string', async () => {
			const pubsub = new PubSub();
			await pubsub.createTopic('topic-1');
			await pubsub.createTopic('topic-2');
			await pubsub.createSubscription('topic-1', 'sub-1');
			await pubsub.createSubscription('topic-2', 'sub-2');

			const [subs] = await pubsub.getSubscriptions({ topic: 'topic-1' });
			expect(subs.length).toBe(1);
			expect(subs[0]!.name).toContain('sub-1');
		});

		test('should filter subscriptions by Topic object', async () => {
			const pubsub = new PubSub();
			const [topic1] = await pubsub.createTopic('topic-1');
			await pubsub.createTopic('topic-2');
			await pubsub.createSubscription(topic1, 'sub-1');
			await pubsub.createSubscription('topic-2', 'sub-2');

			const [subs] = await pubsub.getSubscriptions({ topic: topic1 });
			expect(subs.length).toBe(1);
			expect(subs[0]!.name).toContain('sub-1');
		});
	});
});
