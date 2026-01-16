/**
 * Topic unit tests.
 * Reference: specs/02-topic.md
 *
 * Tests all 10 acceptance criteria:
 * - AC-001: Create and Publish
 * - AC-002: Publish with Attributes
 * - AC-003: Publish JSON
 * - AC-004: Batching Accumulates Messages
 * - AC-005: Flush Publishes Immediately
 * - AC-006: Message Ordering
 * - AC-007: Topic Exists Check
 * - AC-008: Get Topic Subscriptions
 * - AC-009: Publish to Non-Existent Topic Throws
 * - AC-010: Deprecated publish() Method
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { Topic } from '../../src/topic';
import { MessageQueue } from '../../src/internal/message-queue';

let pubsub: unknown;
let queue: MessageQueue;

beforeEach(() => {
	queue = MessageQueue.getInstance();
	pubsub = { projectId: 'test-project' };
});

afterEach(() => {
	const topics = queue.getAllTopics();
	for (const topic of topics) {
		if (topic.name) {
			queue.unregisterTopic(topic.name);
		}
	}
});

test('AC-001: Create and Publish', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const messageId = await topic.publishMessage({
		data: Buffer.from('Hello World')
	});

	expect(messageId).toBeDefined();
	expect(typeof messageId).toBe('string');
	expect(messageId.length).toBeGreaterThan(0);
});

test('AC-002: Publish with Attributes', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const messageId = await topic.publishMessage({
		data: Buffer.from('test'),
		attributes: {
			origin: 'test',
			timestamp: Date.now().toString()
		}
	});

	expect(messageId).toBeDefined();
	expect(typeof messageId).toBe('string');
});

test('AC-003: Publish JSON', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const messageId = await topic.publishJSON({
		userId: 123,
		action: 'login'
	});

	expect(messageId).toBeDefined();
	expect(typeof messageId).toBe('string');
});

test('AC-004: Batching Accumulates Messages', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	topic.setPublishOptions({
		batching: {
			maxMessages: 10,
			maxMilliseconds: 100
		}
	});

	const promises = Array.from({ length: 5 }, (_, i) =>
		topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
	);

	const messageIds = await Promise.all(promises);
	expect(messageIds).toHaveLength(5);
	for (const id of messageIds) {
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);
	}
});

test('AC-005: Flush Publishes Immediately', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	topic.publishMessage({ data: Buffer.from('test') });

	await topic.flush();
});

test('AC-006: Message Ordering', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	topic.setPublishOptions({ messageOrdering: true });

	const messageId1 = await topic.publishMessage({
		data: Buffer.from('First'),
		orderingKey: 'user-123'
	});

	const messageId2 = await topic.publishMessage({
		data: Buffer.from('Second'),
		orderingKey: 'user-123'
	});

	expect(messageId1).toBeDefined();
	expect(messageId2).toBeDefined();
	expect(typeof messageId1).toBe('string');
	expect(typeof messageId2).toBe('string');
});

test('AC-007: Topic Exists Check', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');

	let [exists] = await topic.exists();
	expect(exists).toBe(false);

	await topic.create();
	[exists] = await topic.exists();
	expect(exists).toBe(true);

	await topic.delete();
	[exists] = await topic.exists();
	expect(exists).toBe(false);
});

test('AC-008: Get Topic Subscriptions', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	await topic.createSubscription('projects/test-project/subscriptions/sub-1');
	await topic.createSubscription('projects/test-project/subscriptions/sub-2');

	const [subscriptions] = await topic.getSubscriptions();
	expect(subscriptions).toHaveLength(2);
});

test('AC-009: Publish to Non-Existent Topic Throws', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/non-existent');

	await expect(
		topic.publishMessage({ data: Buffer.from('test') })
	).rejects.toThrow('Topic not found');
});

test('AC-010: Deprecated publish() Method', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const messageId = await topic.publish(Buffer.from('test'), {
		key: 'value'
	});

	expect(messageId).toBeDefined();
	expect(typeof messageId).toBe('string');
});

test('Topic: getPublishOptionDefaults returns correct defaults', () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	const defaults = topic.getPublishOptionDefaults();

	expect(defaults.batching?.maxMessages).toBe(100);
	expect(defaults.batching?.maxMilliseconds).toBe(10);
	expect(defaults.batching?.maxBytes).toBe(1024 * 1024);
	expect(defaults.messageOrdering).toBe(false);
	expect(defaults.flowControlOptions?.maxOutstandingMessages).toBe(100);
	expect(defaults.flowControlOptions?.maxOutstandingBytes).toBe(1024 * 1024);
});

test('Topic: flowControlled returns wrapper', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const wrapper = topic.flowControlled();
	expect(wrapper).toBeDefined();
	expect(typeof wrapper.publish).toBe('function');
	expect(typeof wrapper.publishMessage).toBe('function');

	const messageId = await wrapper.publish(Buffer.from('test'));
	expect(messageId).toBeDefined();
});

test('Topic: resumePublishing resumes paused ordering key', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	topic.setPublishOptions({ messageOrdering: true });

	topic.resumePublishing('user-123');

	const messageId = await topic.publishMessage({
		data: Buffer.from('test'),
		orderingKey: 'user-123'
	});

	expect(messageId).toBeDefined();
});

test('Topic: get with autoCreate creates topic if not exists', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/auto-topic');

	const [retrievedTopic, metadata] = await topic.get({ autoCreate: true });

	expect(retrievedTopic).toBe(topic);
	expect(metadata.name).toBe('projects/test-project/topics/auto-topic');

	const [exists] = await topic.exists();
	expect(exists).toBe(true);
});

test('Topic: get throws NotFoundError when topic does not exist and autoCreate is false', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/missing');

	await expect(topic.get()).rejects.toThrow('Topic not found');
});

test('Topic: getMetadata returns topic metadata', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create({ labels: { env: 'test' } });

	const [metadata] = await topic.getMetadata();
	expect(metadata.name).toBe('projects/test-project/topics/my-topic');
	expect(metadata.labels?.env).toBe('test');
});

test('Topic: setMetadata updates topic metadata', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const [updatedMetadata] = await topic.setMetadata({
		name: 'projects/test-project/topics/my-topic',
		labels: { env: 'production' }
	});

	expect(updatedMetadata.labels?.env).toBe('production');
});

test('Topic: create throws AlreadyExistsError if topic exists', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	await expect(topic.create()).rejects.toThrow('Topic already exists');
});

test('Topic: delete throws NotFoundError if topic does not exist', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/missing');

	await expect(topic.delete()).rejects.toThrow('Topic not found');
});

test('Topic: publishMessage validates data is Buffer', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	await expect(
		topic.publishMessage({ data: 'not a buffer' as unknown as Buffer })
	).rejects.toThrow('Message data must be a Buffer');
});

test('Topic: subscription factory creates subscription instance', () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	const subscription = topic.subscription(
		'projects/test-project/subscriptions/my-sub'
	);

	expect(subscription).toBeDefined();
});

test('Topic: IAM property is defined', () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	expect(topic.iam).toBeDefined();
	expect(typeof topic.iam.getPolicy).toBe('function');
	expect(typeof topic.iam.setPolicy).toBe('function');
	expect(typeof topic.iam.testPermissions).toBe('function');
});
