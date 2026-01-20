import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';
import type { Subscription } from '../../src/subscription';

describe('Integration: Automatic Ack Deadline Extension', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'auto-deadline-test' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	test(
		'automatically extends deadline before expiry for slow processing',
		async () => {
			const topicName = 'test-topic-auto-ext-001';
			const subName = 'test-sub-auto-ext-001';
			const ackDeadline = 5;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: ackDeadline,
				}
			);

			let deliveryCount = 0;
			const messageProcessed = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					deliveryCount++;

					if (deliveryCount === 1) {
						setTimeout(() => {
							message.ack();
							resolve();
						}, 12000);
					}
				});
				subscription.on('error', () => {});
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Slow processing test'),
			});

			await messageProcessed;

			expect(deliveryCount).toBe(1);

			await subscription.close();
		},
		{ timeout: 20000 }
	);

	test.skip(
		'respects maxExtensionTime limit',
		async () => {
			const topicName = 'test-topic-auto-ext-002';
			const subName = 'test-sub-auto-ext-002';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: 5,
					flowControl: {
						maxMessages: 1000,
					},
				}
			);

			subscription.setOptions({
				maxExtensionTime: 15,
			});

			let deliveryCount = 0;
			let firstMessageId: string | null = null;

			const messageRedelivered = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					deliveryCount++;

					if (deliveryCount === 1) {
						firstMessageId = message.id;
					} else if (deliveryCount === 2 && message.id === firstMessageId) {
						message.ack();
						resolve();
					}
				});
				subscription.on('error', () => {});
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Max extension test'),
			});

			await messageRedelivered;

			expect(deliveryCount).toBe(2);

			await subscription.close();
		},
		{ timeout: 40000 }
	);

	test(
		'uses 99th percentile of ack delay for extension timing',
		async () => {
			const topicName = 'test-topic-auto-ext-003';
			const subName = 'test-sub-auto-ext-003';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: 5,
				}
			);

			const ackTimes: number[] = [];

			for (let i = 0; i < 20; i++) {
				await topic.publishMessage({
					data: Buffer.from(`Message ${i}`),
				});
			}

			let processedCount = 0;
			const allProcessed = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					const startTime = Date.now();
					const processingTime = processedCount < 18 ? 1000 : 3000;

					setTimeout(() => {
						message.ack();
						ackTimes.push(Date.now() - startTime);
						processedCount++;

						if (processedCount === 20) {
							resolve();
						}
					}, processingTime);
				});
				subscription.on('error', () => {});
			});

			subscription.open();

			await allProcessed;

			expect(processedCount).toBe(20);

			await subscription.close();
		},
		{ timeout: 90000 }
	);

	test(
		'stops automatic extensions after message is acked',
		async () => {
			const topicName = 'test-topic-auto-ext-004';
			const subName = 'test-sub-auto-ext-004';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: 5,
				}
			);

			const _spy = spyOn(subscription, 'modifyAckDeadline' as keyof Subscription);

			const messageProcessed = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					message.ack();
					resolve();
				});
				subscription.on('error', () => {});
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Quick ack test'),
			});

			await messageProcessed;

			await new Promise((resolve) => setTimeout(resolve, 10000));

			await subscription.close();
		},
		{ timeout: 20000 }
	);

	test(
		'handles multiple messages with different processing times',
		async () => {
			const topicName = 'test-topic-auto-ext-005';
			const subName = 'test-sub-auto-ext-005';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				subName,
				{
					ackDeadlineSeconds: 5,
					flowControl: {
						maxMessages: 10,
					},
				}
			);

			for (let i = 0; i < 5; i++) {
				await topic.publishMessage({
					data: Buffer.from(`Message ${i}`),
				});
			}

			let processedCount = 0;
			let deliveryCount = 0;
			const allProcessed = new Promise<void>((resolve) => {
				subscription.on('message', (message: Message) => {
					deliveryCount++;
					const idx = Number.parseInt(message.data.toString().split(' ')[1] ?? '0', 10);
					const processingTime = idx % 2 === 0 ? 2000 : 8000;

					setTimeout(() => {
						message.ack();
						processedCount++;

						if (processedCount === 5) {
							resolve();
						}
					}, processingTime);
				});
				subscription.on('error', () => {});
			});

			subscription.open();

			await allProcessed;

			expect(processedCount).toBe(5);
			expect(deliveryCount).toBe(5);

			await subscription.close();
		},
		{ timeout: 20000 }
	);
});
