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
		},
		closeOptions: {
			behavior: 'NACK'
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
		ackDeadlineSeconds: 1,
		closeOptions: {
			behavior: 'NACK'
		}
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
		enableMessageOrdering: true,
		closeOptions: {
			behavior: 'NACK'
		}
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

test('pull(): Pulls messages synchronously', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await topic.publishMessage({ data: Buffer.from('Message 2') });
	await topic.publishMessage({ data: Buffer.from('Message 3') });

	const [messages, metadata] = await subscription.pull({ maxMessages: 10 });

	expect(messages).toHaveLength(3);
	expect(messages[0]!.data.toString()).toBe('Message 1');
	expect(messages[1]!.data.toString()).toBe('Message 2');
	expect(messages[2]!.data.toString()).toBe('Message 3');
	expect(metadata).toBeDefined();

	for (const m of messages) {
		m.ack();
	}
});

test('pull(): Respects maxMessages limit', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	for (let i = 0; i < 10; i++) {
		await topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
	}

	const [messages] = await subscription.pull({ maxMessages: 3 });

	expect(messages).toHaveLength(3);
	for (const m of messages) {
		m.ack();
	}
});

test('pull(): Uses default maxMessages when not specified', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	for (let i = 0; i < 5; i++) {
		await topic.publishMessage({ data: Buffer.from(`Message ${i}`) });
	}

	const [messages] = await subscription.pull();

	expect(messages).toHaveLength(5);
	for (const m of messages) {
		m.ack();
	}
});

test('pull(): Returns empty array when no messages available', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	const [messages] = await subscription.pull({ maxMessages: 10 });

	expect(messages).toHaveLength(0);
});

test('pull(): Throws NotFoundError for non-existent subscription', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('non-existent-sub');

	await expect(subscription.pull()).rejects.toThrow('Subscription not found');
});

test('pull(): Messages can be acked individually', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await topic.publishMessage({ data: Buffer.from('Message 2') });

	const [messages1] = await subscription.pull({ maxMessages: 10 });
	expect(messages1).toHaveLength(2);

	messages1[0]!.ack();

	const [messages2] = await subscription.pull({ maxMessages: 10 });
	expect(messages2).toHaveLength(0);
});

test('pull(): Messages can be nacked and redelivered', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Test message') });

	const [messages1] = await subscription.pull({ maxMessages: 1 });
	expect(messages1).toHaveLength(1);
	expect(messages1[0]!.deliveryAttempt).toBe(1);

	messages1[0]!.nack();

	const [messages2] = await subscription.pull({ maxMessages: 1 });
	expect(messages2).toHaveLength(1);
	expect(messages2[0]!.deliveryAttempt).toBe(2);
	expect(messages2[0]!.data.toString()).toBe('Test message');

	messages2[0]!.ack();
});

test('pause(): Pauses message flow', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	const messages: Message[] = [];
	subscription.on('message', (message) => {
		messages.push(message);
		message.ack();
	});
	subscription.on('error', () => {});

	subscription.open();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await new Promise(resolve => setTimeout(resolve, 50));
	expect(messages).toHaveLength(1);

	subscription.pause();

	await topic.publishMessage({ data: Buffer.from('Message 2') });
	await new Promise(resolve => setTimeout(resolve, 50));
	expect(messages).toHaveLength(1);

	await subscription.close();
});

test('resume(): Resumes message flow after pause', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	const messages: Message[] = [];
	subscription.on('message', (message) => {
		messages.push(message);
		message.ack();
	});
	subscription.on('error', () => {});

	subscription.open();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await new Promise(resolve => setTimeout(resolve, 50));
	expect(messages).toHaveLength(1);

	subscription.pause();

	await topic.publishMessage({ data: Buffer.from('Message 2') });
	await new Promise(resolve => setTimeout(resolve, 50));
	expect(messages).toHaveLength(1);

	subscription.resume();

	await new Promise(resolve => setTimeout(resolve, 50));
	expect(messages).toHaveLength(2);

	await subscription.close();
});

test('acknowledge(): Batch acknowledges multiple messages', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await topic.publishMessage({ data: Buffer.from('Message 2') });
	await topic.publishMessage({ data: Buffer.from('Message 3') });

	const [messages1] = await subscription.pull({ maxMessages: 3 });
	expect(messages1).toHaveLength(3);

	const ackIds = messages1.map(msg => msg.ackId);
	await subscription.acknowledge({ ackIds });

	const [messages2] = await subscription.pull({ maxMessages: 10 });
	expect(messages2).toHaveLength(0);
});

test('acknowledge(): Works with empty array', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await subscription.acknowledge({ ackIds: [] });
});

test('acknowledge(): Partial acknowledgment works', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await topic.publishMessage({ data: Buffer.from('Message 2') });
	await topic.publishMessage({ data: Buffer.from('Message 3') });

	const [messages1] = await subscription.pull({ maxMessages: 3 });
	expect(messages1).toHaveLength(3);

	await subscription.acknowledge({ ackIds: [messages1[0]!.ackId, messages1[2]!.ackId] });

	const [messages2] = await subscription.pull({ maxMessages: 10 });
	expect(messages2).toHaveLength(0);
});

test('modifyAckDeadline(): Batch modifies ack deadlines', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Message 1') });
	await topic.publishMessage({ data: Buffer.from('Message 2') });

	const [messages1] = await subscription.pull({ maxMessages: 2 });
	expect(messages1).toHaveLength(2);

	const ackIds = messages1.map(msg => msg.ackId);
	await subscription.modifyAckDeadline({ ackIds, ackDeadlineSeconds: 60 });

	const [messages2] = await subscription.pull({ maxMessages: 10 });
	expect(messages2).toHaveLength(0);
});

test('modifyAckDeadline(): Setting deadline to 0 causes immediate redelivery', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await topic.publishMessage({ data: Buffer.from('Test message') });

	const [messages1] = await subscription.pull({ maxMessages: 1 });
	expect(messages1).toHaveLength(1);
	expect(messages1[0]!.deliveryAttempt).toBe(1);

	await subscription.modifyAckDeadline({
		ackIds: [messages1[0]!.ackId],
		ackDeadlineSeconds: 0
	});

	await new Promise(resolve => setTimeout(resolve, 10));

	const [messages2] = await subscription.pull({ maxMessages: 1 });
	expect(messages2).toHaveLength(1);
	expect(messages2[0]!.deliveryAttempt).toBe(2);
});

test('modifyAckDeadline(): Works with empty array', async () => {
	const topic = new Topic(pubsub, 'projects/test-project/topics/test-topic');
	await topic.create();

	const subscription = topic.subscription('test-sub');
	await subscription.create();

	await subscription.modifyAckDeadline({ ackIds: [], ackDeadlineSeconds: 60 });
});
