import { describe, test, expect, beforeEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';

describe('Integration: Ack Deadline', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'ack-deadline-test' });
	});

	test(
		'AC-001: Deadline extension prevents redelivery',
		async () => {
			const topicName = 'test-topic-ack-002';
			const subName = 'test-sub-ack-002';
			const ackDeadline = 10;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: ackDeadline,
				}
			);

			const receivedMessages: Message[] = [];

			const messageReceived = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					receivedMessages.push(message);

					if (receivedMessages.length === 1) {
						message.modifyAckDeadline(15);

						setTimeout(() => {
							message.ack();
							resolve();
						}, 12000);
					}
				});
				subscription.on('error', (error: Error) => {
					throw error;
				});
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Extension test'),
			});

			await messageReceived;

			expect(receivedMessages).toHaveLength(1);

			await subscription.close();
			await pubsub.close();
		},
		{ timeout: 25000 }
	);

	test(
		'AC-002: modifyAckDeadline extends deadline correctly',
		async () => {
			const topicName = 'test-topic-ack-003';
			const subName = 'test-sub-ack-003';
			const ackDeadline = 10;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: ackDeadline,
				}
			);

			let firstMessage: Message | null = null;
			let deliveryCount = 0;

			const messageProcessed = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					deliveryCount++;

					if (deliveryCount === 1) {
						firstMessage = message;

						message.modifyAckDeadline(20);

						setTimeout(() => {
							message.ack();
							resolve();
						}, 15000);
					} else {
						throw new Error('Message should not be redelivered');
					}
				});
				subscription.on('error', (error: Error) => {
					throw error;
				});
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Modify deadline test'),
			});

			await messageProcessed;

			expect(deliveryCount).toBe(1);
			expect(firstMessage).not.toBeNull();

			await subscription.close();
			await pubsub.close();
		},
		{ timeout: 30000 }
	);

	test('AC-003: Ack deadline validation (0-600 seconds)', async () => {
		const topicName = 'test-topic-ack-004';
		const subName = 'test-sub-ack-004';

		const [topic] = await pubsub.createTopic(topicName);
		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			ackDeadlineSeconds: 10,
		});

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
			data: Buffer.from('Validation test'),
		});

		const message = await messageReceived;

		expect(() => message.modifyAckDeadline(-1)).toThrow();
		expect(() => message.modifyAckDeadline(601)).toThrow();
		expect(() => message.modifyAckDeadline(10)).not.toThrow();
		expect(() => message.modifyAckDeadline(600)).not.toThrow();

		message.ack();

		await subscription.close();
		await pubsub.close();
	});

});
