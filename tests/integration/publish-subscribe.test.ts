import { describe, test, expect, beforeEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';

describe('Integration: Publish-Subscribe Flow', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'integration-test' });
	});

	test('AC-001: Complete publish-subscribe flow with ack', async () => {
		const topicName = 'test-topic-1';
		const subName = 'test-sub-1';
		const messageData = Buffer.from('Hello, World!');

		const [topic] = await pubsub.createTopic(topicName);
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

		const messageId = await topic.publishMessage({
			data: messageData,
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');

		const message = await messageReceived;

		expect(message.data.toString()).toBe('Hello, World!');
		expect(message.id).toBeDefined();
		expect(message.ackId).toBeDefined();

		message.ack();

		await subscription.close();
		await pubsub.close();
	});

	test('AC-002: Multiple subscriptions receive message copies', async () => {
		const topicName = 'test-topic-multi';
		const sub1Name = 'test-sub-multi-1';
		const sub2Name = 'test-sub-multi-2';
		const messageData = Buffer.from('Multi-sub test');

		const [topic] = await pubsub.createTopic(topicName);
		const [sub1] = await pubsub.createSubscription(topicName, sub1Name);
		const [sub2] = await pubsub.createSubscription(topicName, sub2Name);

		const messages1: Message[] = [];
		const messages2: Message[] = [];

		const sub1Promise = new Promise<void>((resolve) => {
			sub1.on('message', (message: Message) => {
				messages1.push(message);
				message.ack();
				resolve();
			});
			sub1.on('error', (error: Error) => {
				throw error;
			});
		});

		const sub2Promise = new Promise<void>((resolve) => {
			sub2.on('message', (message: Message) => {
				messages2.push(message);
				message.ack();
				resolve();
			});
			sub2.on('error', (error: Error) => {
				throw error;
			});
		});

		sub1.open();
		sub2.open();

		await topic.publishMessage({ data: messageData });

		await Promise.all([sub1Promise, sub2Promise]);

		expect(messages1).toHaveLength(1);
		expect(messages2).toHaveLength(1);
		expect(messages1[0]?.data.toString()).toBe('Multi-sub test');
		expect(messages2[0]?.data.toString()).toBe('Multi-sub test');

		expect(messages1[0]?.id).toBe(messages2[0]?.id);

		await sub1.close();
		await sub2.close();
		await pubsub.close();
	});

	test('AC-003: Publish message with attributes', async () => {
		const topicName = 'test-topic-attrs';
		const subName = 'test-sub-attrs';
		const messageData = Buffer.from('Message with attributes');
		const attributes = {
			foo: 'bar',
			timestamp: Date.now().toString(),
			'content-type': 'application/json',
		};

		const [topic] = await pubsub.createTopic(topicName);
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

		await topic.publishMessage({
			data: messageData,
			attributes,
		});

		const message = await messageReceived;

		expect(message.data.toString()).toBe('Message with attributes');
		expect(message.attributes).toEqual(attributes);
		expect(message.attributes.foo).toBe('bar');
		expect(message.attributes['content-type']).toBe('application/json');

		message.ack();

		await subscription.close();
		await pubsub.close();
	});

	test('AC-004: Multiple messages delivered in order', async () => {
		const topicName = 'test-topic-order';
		const subName = 'test-sub-order';

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName);

		const receivedMessages: Message[] = [];
		const messageCount = 5;

		const allMessagesReceived = new Promise<void>((resolve) => {
			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();

				if (receivedMessages.length === messageCount) {
					resolve();
				}
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.open();

		const publishedIds: string[] = [];
		for (let i = 0; i < messageCount; i++) {
			const id = await topic.publishMessage({
				data: Buffer.from(`Message ${i}`),
			});
			publishedIds.push(id);
		}

		await allMessagesReceived;

		expect(receivedMessages).toHaveLength(messageCount);

		for (let i = 0; i < messageCount; i++) {
			expect(receivedMessages[i]?.data.toString()).toBe(`Message ${i}`);
		}

		await subscription.close();
		await pubsub.close();
	});

	test('AC-005: Message nack causes redelivery', async () => {
		const topicName = 'test-topic-nack';
		const subName = 'test-sub-nack';
		const messageData = Buffer.from('Nack test');

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
		});

		let deliveryCount = 0;
		const receivedMessages: Message[] = [];

		const redeliveryReceived = new Promise<void>((resolve) => {
			subscription.on('message', (message: Message) => {
				deliveryCount++;
				receivedMessages.push(message);

				if (deliveryCount === 1) {
					message.nack();
				} else if (deliveryCount === 2) {
					message.ack();
					resolve();
				}
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.open();

		await topic.publishMessage({ data: messageData });

		await redeliveryReceived;

		expect(deliveryCount).toBe(2);
		expect(receivedMessages).toHaveLength(2);
		expect(receivedMessages[0]?.id).toBe(receivedMessages[1]?.id);
		expect(receivedMessages[0]?.data.toString()).toBe('Nack test');
		expect(receivedMessages[1]?.data.toString()).toBe('Nack test');

		await subscription.close();
		await pubsub.close();
	});

	test('AC-006: Flow control limits in-flight messages', async () => {
		const topicName = 'test-topic-flow';
		const subName = 'test-sub-flow';
		const maxMessages = 3;

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			flowControl: {
				maxMessages,
			},
		});

		const receivedMessages: Message[] = [];
		let maxInFlight = 0;

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			maxInFlight = Math.max(maxInFlight, receivedMessages.length);
		});

		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();

		const messageCount = 10;
		for (let i = 0; i < messageCount; i++) {
			await topic.publishMessage({
				data: Buffer.from(`Message ${i}`),
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(maxInFlight).toBeLessThanOrEqual(maxMessages);

		for (const message of receivedMessages) {
			message.ack();
		}

		await subscription.close();
		await pubsub.close();
	});

	test('AC-007: Empty message body is valid', async () => {
		const topicName = 'test-topic-empty';
		const subName = 'test-sub-empty';

		const [topic] = await pubsub.createTopic(topicName);
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

		await topic.publishMessage({
			data: Buffer.from(''),
			attributes: { note: 'empty body' },
		});

		const message = await messageReceived;

		expect(message.data.toString()).toBe('');
		expect(message.length).toBe(0);
		expect(message.attributes.note).toBe('empty body');

		message.ack();

		await subscription.close();
		await pubsub.close();
	});

	test('AC-006: Pause and resume (specs/06-subscriber.md)', async () => {
		const topicName = 'test-topic-pause';
		const subName = 'test-sub-pause';

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName);

		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.ack();
		});

		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();

		await topic.publishMessage({ data: Buffer.from('msg1') });

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(1);

		subscription.pause();

		await topic.publishMessage({ data: Buffer.from('msg2') });

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(1);

		subscription.resume();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(2);

		await subscription.close();
		await pubsub.close();
	});

	test('AC-009: Topic delete detaches subscriptions', async () => {
		const topicName = 'test-topic-delete';
		const subName = 'test-sub-delete';

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName);

		const [exists1] = await topic.exists();
		expect(exists1).toBe(true);

		await topic.delete();

		const [exists2] = await topic.exists();
		expect(exists2).toBe(false);

		const [subExists] = await subscription.exists();
		expect(subExists).toBe(true);

		await pubsub.close();
	});

	test('AC-010: Large message payload', async () => {
		const topicName = 'test-topic-large';
		const subName = 'test-sub-large';

		const largeData = Buffer.alloc(1024 * 100);
		for (let i = 0; i < largeData.length; i++) {
			largeData[i] = i % 256;
		}

		const [topic] = await pubsub.createTopic(topicName);
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

		await topic.publishMessage({ data: largeData });

		const message = await messageReceived;

		expect(message.data.length).toBe(largeData.length);
		expect(message.length).toBe(largeData.length);
		expect(Buffer.compare(message.data, largeData)).toBe(0);

		message.ack();

		await subscription.close();
		await pubsub.close();
	});
});
