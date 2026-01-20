import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';

describe('Integration: Dead Letter Queue', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'dead-letter-test' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	test('AC-001: Message moved to DLQ after maxDeliveryAttempts', async () => {
		const topicName = 'test-topic-dlq-001';
		const subName = 'test-sub-dlq-001';
		const dlqTopicName = 'dlq-topic-001';
		const dlqSubName = 'dlq-sub-001';

		const [topic] = await pubsub.createTopic(topicName);
		const [dlqTopic] = await pubsub.createTopic(dlqTopicName);
		const [dlqSubscription] = await pubsub.createSubscription(
			dlqTopicName,
			dlqSubName
		);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
			deadLetterPolicy: {
				deadLetterTopic: dlqTopic.name,
				maxDeliveryAttempts: 3,
			},
		});

		const dlqMessages: Message[] = [];
		const dlqReceived = new Promise<void>((resolve) => {
			dlqSubscription.on('message', (message: Message) => {
				dlqMessages.push(message);
				message.ack();
				resolve();
			});
			dlqSubscription.on('error', (error: Error) => {
				throw error;
			});
		});

		let deliveryCount = 0;
		subscription.on('message', (message: Message) => {
			deliveryCount++;
			if (deliveryCount < 4) {
				message.nack();
			}
		});
		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();
		dlqSubscription.open();

		await topic.publishMessage({
			data: Buffer.from('Test DLQ message'),
			attributes: { test: 'dlq' },
		});

		await dlqReceived;

		expect(dlqMessages).toHaveLength(1);
		expect(dlqMessages[0]?.data.toString()).toBe('Test DLQ message');
		expect(dlqMessages[0]?.attributes.test).toBe('dlq');

		await subscription.close();
		await dlqSubscription.close();
		await pubsub.close();
	});

	test('AC-002: Delivery attempt counter increments correctly', async () => {
		const topicName = 'test-topic-dlq-002';
		const subName = 'test-sub-dlq-002';

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
		});

		const deliveryAttempts: number[] = [];
		let messageCount = 0;

		const receivedThree = new Promise<void>((resolve) => {
			subscription.on('message', (message: Message) => {
				messageCount++;
				deliveryAttempts.push(message.deliveryAttempt ?? 0);

				if (messageCount < 3) {
					message.nack();
				} else {
					message.ack();
					resolve();
				}
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.open();

		await topic.publishMessage({
			data: Buffer.from('Counter test'),
		});

		await receivedThree;

		expect(deliveryAttempts).toEqual([1, 2, 3]);

		await subscription.close();
		await pubsub.close();
	});

	test('AC-003: DLQ subscription receives failed messages', async () => {
		const topicName = 'test-topic-dlq-003';
		const subName = 'test-sub-dlq-003';
		const dlqTopicName = 'dlq-topic-003';
		const dlqSubName = 'dlq-sub-003';

		const [topic] = await pubsub.createTopic(topicName);
		const [dlqTopic] = await pubsub.createTopic(dlqTopicName);
		const [dlqSubscription] = await pubsub.createSubscription(
			dlqTopicName,
			dlqSubName
		);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
			deadLetterPolicy: {
				deadLetterTopic: dlqTopic.name,
				maxDeliveryAttempts: 2,
			},
		});

		const dlqMessages: Message[] = [];
		const dlqReceived = new Promise<void>((resolve) => {
			dlqSubscription.on('message', (message: Message) => {
				dlqMessages.push(message);
				message.ack();
				if (dlqMessages.length === 3) {
					resolve();
				}
			});
			dlqSubscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.on('message', (message: Message) => {
			message.nack();
		});
		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();
		dlqSubscription.open();

		await topic.publishMessage({ data: Buffer.from('Message 1') });
		await topic.publishMessage({ data: Buffer.from('Message 2') });
		await topic.publishMessage({ data: Buffer.from('Message 3') });

		await dlqReceived;

		expect(dlqMessages).toHaveLength(3);
		expect(dlqMessages[0]?.data.toString()).toBe('Message 1');
		expect(dlqMessages[1]?.data.toString()).toBe('Message 2');
		expect(dlqMessages[2]?.data.toString()).toBe('Message 3');

		await subscription.close();
		await dlqSubscription.close();
		await pubsub.close();
	});

	test('AC-004: Original subscription no longer has message after DLQ routing', async () => {
		const topicName = 'test-topic-dlq-004';
		const subName = 'test-sub-dlq-004';
		const dlqTopicName = 'dlq-topic-004';
		const dlqSubName = 'dlq-sub-004';

		const [topic] = await pubsub.createTopic(topicName);
		const [dlqTopic] = await pubsub.createTopic(dlqTopicName);
		const [dlqSubscription] = await pubsub.createSubscription(
			dlqTopicName,
			dlqSubName
		);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
			deadLetterPolicy: {
				deadLetterTopic: dlqTopic.name,
				maxDeliveryAttempts: 2,
			},
		});

		const receivedMessages: Message[] = [];
		const dlqMessages: Message[] = [];

		const dlqReceived = new Promise<void>((resolve) => {
			dlqSubscription.on('message', (message: Message) => {
				dlqMessages.push(message);
				message.ack();
				resolve();
			});
			dlqSubscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.nack();
		});
		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();
		dlqSubscription.open();

		await topic.publishMessage({
			data: Buffer.from('Routed to DLQ'),
		});

		await dlqReceived;

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(receivedMessages).toHaveLength(2);
		expect(dlqMessages).toHaveLength(1);

		await subscription.close();
		await dlqSubscription.close();
		await pubsub.close();
	});

	test('AC-005: Preserves original message metadata in DLQ', async () => {
		const topicName = 'test-topic-dlq-005';
		const subName = 'test-sub-dlq-005';
		const dlqTopicName = 'dlq-topic-005';
		const dlqSubName = 'dlq-sub-005';

		const [topic] = await pubsub.createTopic(topicName);
		const [dlqTopic] = await pubsub.createTopic(dlqTopicName);
		const [dlqSubscription] = await pubsub.createSubscription(
			dlqTopicName,
			dlqSubName
		);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
			deadLetterPolicy: {
				deadLetterTopic: dlqTopic.name,
				maxDeliveryAttempts: 2,
			},
		});

		const dlqMessages: Message[] = [];
		const dlqReceived = new Promise<void>((resolve) => {
			dlqSubscription.on('message', (message: Message) => {
				dlqMessages.push(message);
				message.ack();
				resolve();
			});
			dlqSubscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription.on('message', (message: Message) => {
			message.nack();
		});
		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();
		dlqSubscription.open();

		await topic.publishMessage({
			data: Buffer.from('Metadata test'),
			attributes: { key: 'value', type: 'test' },
			orderingKey: 'order-key-1',
		});

		await dlqReceived;

		expect(dlqMessages).toHaveLength(1);
		expect(dlqMessages[0]?.data.toString()).toBe('Metadata test');
		expect(dlqMessages[0]?.attributes.key).toBe('value');
		expect(dlqMessages[0]?.attributes.type).toBe('test');
		expect(dlqMessages[0]?.orderingKey).toBe('order-key-1');
		expect(dlqMessages[0]?.publishTime).toBeDefined();

		await subscription.close();
		await dlqSubscription.close();
		await pubsub.close();
	});

	test('AC-006: Multiple subscriptions with different DLQ policies', async () => {
		const topicName = 'test-topic-dlq-006';
		const sub1Name = 'test-sub-dlq-006-1';
		const sub2Name = 'test-sub-dlq-006-2';
		const dlq1TopicName = 'dlq-topic-006-1';
		const dlq2TopicName = 'dlq-topic-006-2';
		const dlq1SubName = 'dlq-sub-006-1';
		const dlq2SubName = 'dlq-sub-006-2';

		const [topic] = await pubsub.createTopic(topicName);
		const [dlq1Topic] = await pubsub.createTopic(dlq1TopicName);
		const [dlq2Topic] = await pubsub.createTopic(dlq2TopicName);
		const [dlq1Subscription] = await pubsub.createSubscription(
			dlq1TopicName,
			dlq1SubName
		);
		const [dlq2Subscription] = await pubsub.createSubscription(
			dlq2TopicName,
			dlq2SubName
		);

		const [subscription1] = await pubsub.createSubscription(
			topicName,
			sub1Name,
			{
				ackDeadlineSeconds: 10,
				deadLetterPolicy: {
					deadLetterTopic: dlq1Topic.name,
					maxDeliveryAttempts: 2,
				},
			}
		);

		const [subscription2] = await pubsub.createSubscription(
			topicName,
			sub2Name,
			{
				ackDeadlineSeconds: 10,
				deadLetterPolicy: {
					deadLetterTopic: dlq2Topic.name,
					maxDeliveryAttempts: 3,
				},
			}
		);

		const dlq1Messages: Message[] = [];
		const dlq2Messages: Message[] = [];

		const dlq1Received = new Promise<void>((resolve) => {
			dlq1Subscription.on('message', (message: Message) => {
				dlq1Messages.push(message);
				message.ack();
				resolve();
			});
			dlq1Subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		const dlq2Received = new Promise<void>((resolve) => {
			dlq2Subscription.on('message', (message: Message) => {
				dlq2Messages.push(message);
				message.ack();
				resolve();
			});
			dlq2Subscription.on('error', (error: Error) => {
				throw error;
			});
		});

		subscription1.on('message', (message: Message) => {
			message.nack();
		});
		subscription1.on('error', (error: Error) => {
			throw error;
		});

		subscription2.on('message', (message: Message) => {
			message.nack();
		});
		subscription2.on('error', (error: Error) => {
			throw error;
		});

		subscription1.open();
		subscription2.open();
		dlq1Subscription.open();
		dlq2Subscription.open();

		await topic.publishMessage({
			data: Buffer.from('Multi-DLQ test'),
		});

		await Promise.all([dlq1Received, dlq2Received]);

		expect(dlq1Messages).toHaveLength(1);
		expect(dlq2Messages).toHaveLength(1);

		await subscription1.close();
		await subscription2.close();
		await dlq1Subscription.close();
		await dlq2Subscription.close();
		await pubsub.close();
	});
});
