import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Subscription } from '../../src/subscription';
import type { Topic } from '../../src/topic';

describe('Integration: Message Ordering', () => {
	let pubsub: PubSub;
	let topic: Topic;
	let subscriptions: Subscription[] = [];

	beforeEach(async () => {
		pubsub = new PubSub({ projectId: 'test-ordering' });
	});

	afterEach(async () => {
		for (const sub of subscriptions) {
			if (sub.isOpen) {
				await sub.close();
			}
			try {
				await sub.delete();
			} catch {
				// Ignore if already deleted
			}
		}
		subscriptions = [];

		if (topic) {
			try {
				await topic.delete();
			} catch {
				// Ignore if already deleted
			}
		}
	});

	describe('AC-003: Sequential Processing per Key', () => {
		test('should process messages with same ordering key sequentially (maxConcurrent=1)', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();

			topic.setPublishOptions({ messageOrdering: true });

			const subscription = topic.subscription('ordered-sub');
			await subscription.create();
			subscription.setOptions({ enableMessageOrdering: true });
			subscriptions.push(subscription);

			let concurrentCount = 0;
			let maxConcurrent = 0;

			subscription.on('message', async (message) => {
				concurrentCount++;
				maxConcurrent = Math.max(maxConcurrent, concurrentCount);

				await new Promise((resolve) => setTimeout(resolve, 50));

				concurrentCount--;
				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			for (let i = 0; i < 5; i++) {
				await topic.publishMessage({
					data: Buffer.from(`msg-${i}`),
					orderingKey: 'user-123',
				});
			}

			await new Promise((resolve) => setTimeout(resolve, 400));

			expect(maxConcurrent).toBe(1);
		});
	});

	describe('AC-004: Different Keys Concurrent', () => {
		test('should process messages with different ordering keys concurrently', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();

			topic.setPublishOptions({ messageOrdering: true });

			const subscription = topic.subscription('ordered-sub');
			await subscription.create();
			subscription.setOptions({ enableMessageOrdering: true });
			subscriptions.push(subscription);

			let concurrentCount = 0;
			let maxConcurrent = 0;

			subscription.on('message', async (message) => {
				concurrentCount++;
				maxConcurrent = Math.max(maxConcurrent, concurrentCount);

				await new Promise((resolve) => setTimeout(resolve, 50));

				concurrentCount--;
				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('user1-msg1'),
				orderingKey: 'user-1',
			});

			await topic.publishMessage({
				data: Buffer.from('user2-msg1'),
				orderingKey: 'user-2',
			});

			await topic.publishMessage({
				data: Buffer.from('user3-msg1'),
				orderingKey: 'user-3',
			});

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(maxConcurrent).toBeGreaterThan(1);
		});
	});

	describe('AC-005: Ordering Preserved on Redelivery', () => {
		test('should preserve ordering when message is redelivered after timeout', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();

			const subscription = topic.subscription('ordered-sub');
			await subscription.create({
				enableMessageOrdering: true,
				ackDeadlineSeconds: 1,
			});
			subscriptions.push(subscription);

			const receivedMessages: string[] = [];

			subscription.on('message', (message) => {
				const msgData = message.data.toString();
				receivedMessages.push(msgData);

				if (msgData === 'first' && message.deliveryAttempt === 0) {
					return;
				}

				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			await topic.publishMessage({
				data: Buffer.from('first'),
				orderingKey: 'user-123',
			});

			await topic.publishMessage({
				data: Buffer.from('second'),
				orderingKey: 'user-123',
			});

			subscription.open();

			await new Promise((resolve) => setTimeout(resolve, 1500));


			const firstIndices = receivedMessages
				.map((msg, idx) => (msg === 'first' ? idx : -1))
				.filter((idx) => idx !== -1);

			const secondIndices = receivedMessages
				.map((msg, idx) => (msg === 'second' ? idx : -1))
				.filter((idx) => idx !== -1);


			expect(firstIndices.length).toBeGreaterThan(1);
			expect(Math.max(...firstIndices)).toBeLessThan(Math.min(...secondIndices));
		});
	});

	describe('AC-007: Multiple Subscriptions Ordered Independently', () => {
		test('should maintain ordering independently for multiple subscriptions', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();

			const sub1 = topic.subscription('sub-1');
			const sub2 = topic.subscription('sub-2');
			await sub1.create({ enableMessageOrdering: true });
			await sub2.create({ enableMessageOrdering: true });
			subscriptions.push(sub1, sub2);

			const received1: string[] = [];
			const received2: string[] = [];

			sub1.on('message', (msg) => {
				received1.push(msg.data.toString());
				msg.ack();
			});
			sub2.on('message', (msg) => {
				received2.push(msg.data.toString());
				msg.ack();
			});

			sub1.on('error', (error) => {
				console.error('Sub1 error:', error);
			});
			sub2.on('error', (error) => {
				console.error('Sub2 error:', error);
			});

			sub1.open();
			sub2.open();

			await topic.publishMessage({
				data: Buffer.from('first'),
				orderingKey: 'user-123',
			});

			await topic.publishMessage({
				data: Buffer.from('second'),
				orderingKey: 'user-123',
			});

			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(received1).toEqual(['first', 'second']);
			expect(received2).toEqual(['first', 'second']);
		});
	});
});
