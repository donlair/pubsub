/**
 * Subscription unit tests.
 * Reference: specs/03-subscription.md
 *
 * Tests all 9 acceptance criteria:
 * - AC-001: Create and Receive Messages
 * - AC-002: Flow Control Max Messages
 * - AC-003: Ack Deadline Redelivery
 * - AC-004: Message Ordering
 * - AC-005: Error Event Emission
 * - AC-006: Close Stops Message Flow
 * - AC-007: Set Options After Creation
 * - AC-008: Subscription Exists Check
 * - AC-009: Multiple Subscriptions Same Topic
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { Topic } from '../../src/topic';
import { MessageQueue } from '../../src/internal/message-queue';
import type { Message } from '../../src/message';

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
	const subscriptions = queue.getAllSubscriptions();
	for (const sub of subscriptions) {
		if (sub.name) {
			queue.unregisterSubscription(sub.name);
		}
	}
});

test('AC-001: Create and Receive Messages', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub');
	await subscription.create();

	const messages: Message[] = [];
	subscription.on('message', (message) => {
		messages.push(message);
		message.ack();
	});

	subscription.on('error', (error) => {
		console.error('Test error:', error);
	});

	subscription.open();

	await topic.publishMessage({ data: Buffer.from('Hello') });

	await new Promise(resolve => setTimeout(resolve, 50));

	expect(messages).toHaveLength(1);
	expect(messages[0]?.data.toString()).toBe('Hello');

	await subscription.close();
});

test('AC-002: Flow Control Max Messages', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub', {
		flowControl: {
			maxMessages: 2
		}
	});
	await subscription.create();

	const receivedMessages: Message[] = [];
	subscription.on('message', (message) => {
		receivedMessages.push(message);
	});

	subscription.on('error', () => {});

	subscription.open();

	for (let i = 0; i < 5; i++) {
		await topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
	}

	await new Promise(resolve => setTimeout(resolve, 50));

	expect(receivedMessages.length).toBeLessThanOrEqual(2);

	for (const m of receivedMessages) {
		m.ack();
	}

	await new Promise(resolve => setTimeout(resolve, 50));

	expect(receivedMessages.length).toBeGreaterThan(2);

	await subscription.close();
});

test('AC-003: Ack Deadline Redelivery', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub', {
		ackDeadlineSeconds: 1
	});
	await subscription.create();

	let deliveryCount = 0;
	subscription.on('message', (_message) => {
		deliveryCount++;
	});

	subscription.on('error', () => {});

	subscription.open();

	await topic.publishMessage({ data: Buffer.from('test') });

	await new Promise(resolve => setTimeout(resolve, 100));
	expect(deliveryCount).toBe(1);

	await new Promise(resolve => setTimeout(resolve, 1100));

	expect(deliveryCount).toBeGreaterThan(1);

	await subscription.close();
});

test('AC-004: Message Ordering', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	topic.setPublishOptions({
		messageOrdering: true
	});

	const subscription = topic.subscription('my-sub', {
		enableMessageOrdering: true
	});
	await subscription.create();

	const receivedData: string[] = [];
	subscription.on('message', async (message) => {
		receivedData.push(message.data.toString());
		message.ack();
	});

	subscription.on('error', () => {});

	subscription.open();

	await topic.publishMessage({
		data: Buffer.from('First'),
		orderingKey: 'user-123'
	});

	await topic.publishMessage({
		data: Buffer.from('Second'),
		orderingKey: 'user-123'
	});

	await topic.publishMessage({
		data: Buffer.from('Third'),
		orderingKey: 'user-123'
	});

	await new Promise(resolve => setTimeout(resolve, 100));

	expect(receivedData).toEqual(['First', 'Second', 'Third']);

	await subscription.close();
});

test('AC-005: Error Event Emission', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub');

	const errors: Error[] = [];
	subscription.on('error', (error) => {
		errors.push(error);
	});

	subscription.open();

	await new Promise(resolve => setTimeout(resolve, 50));

	expect(errors.length).toBeGreaterThan(0);

	await subscription.close();
});

test('AC-006: Close Stops Message Flow', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub');
	await subscription.create();

	let messageCount = 0;
	subscription.on('message', (message) => {
		messageCount++;
		message.ack();
	});

	subscription.on('error', () => {});

	subscription.open();

	await topic.publishMessage({ data: Buffer.from('test') });
	await new Promise(resolve => setTimeout(resolve, 50));

	const countBeforeClose = messageCount;

	await subscription.close();

	await topic.publishMessage({ data: Buffer.from('test2') });
	await new Promise(resolve => setTimeout(resolve, 50));

	expect(messageCount).toBe(countBeforeClose);
});

test('AC-007: Set Options After Creation', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub');
	await subscription.create();

	subscription.setOptions({
		flowControl: {
			maxMessages: 500
		},
		ackDeadlineSeconds: 30
	});

	subscription.on('error', () => {});

	subscription.open();

	expect(subscription.isOpen).toBe(true);

	await subscription.close();
});

test('AC-008: Subscription Exists Check', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const subscription = topic.subscription('my-sub');

	const [existsBefore] = await subscription.exists();
	expect(existsBefore).toBe(false);

	await subscription.create();

	const [existsAfter] = await subscription.exists();
	expect(existsAfter).toBe(true);

	await subscription.delete();

	const [existsAfterDelete] = await subscription.exists();
	expect(existsAfterDelete).toBe(false);
});

test('AC-009: Multiple Subscriptions Same Topic', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/my-topic');
	await topic.create();

	const sub1 = topic.subscription('sub-1');
	const sub2 = topic.subscription('sub-2');
	await sub1.create();
	await sub2.create();

	const messages1: Message[] = [];
	const messages2: Message[] = [];

	sub1.on('message', (m) => { messages1.push(m); m.ack(); });
	sub2.on('message', (m) => { messages2.push(m); m.ack(); });

	sub1.on('error', () => {});
	sub2.on('error', () => {});

	sub1.open();
	sub2.open();

	await topic.publishMessage({ data: Buffer.from('test') });
	await new Promise(resolve => setTimeout(resolve, 50));

	expect(messages1).toHaveLength(1);
	expect(messages2).toHaveLength(1);

	await sub1.close();
	await sub2.close();
});
