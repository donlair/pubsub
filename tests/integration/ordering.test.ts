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

			const subscription = topic.subscription('ordered-sub', {
				closeOptions: { behavior: 'NACK' }
			});
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

			const subscription = topic.subscription('ordered-sub', {
				closeOptions: { behavior: 'NACK' }
			});
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

			const subscription = topic.subscription('ordered-sub', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create({
				enableMessageOrdering: true,
				ackDeadlineSeconds: 1,
			});
			subscriptions.push(subscription);

			const receivedMessages: string[] = [];

			subscription.on('message', (message) => {
				const msgData = message.data.toString();
				receivedMessages.push(msgData);

				if (msgData === 'first' && message.deliveryAttempt === 1) {
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

			const sub1 = topic.subscription('sub-1', {
				closeOptions: { behavior: 'NACK' }
			});
			const sub2 = topic.subscription('sub-2', {
				closeOptions: { behavior: 'NACK' }
			});
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

	describe('AC-006: No Ordering Key Not Blocked', () => {
		test('should deliver messages without ordering key even when ordered messages are blocked', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();

			const subscription = topic.subscription('ordered-sub', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create({ enableMessageOrdering: true });
			subscriptions.push(subscription);

			const receivedMessages: Array<{ data: string; orderingKey?: string }> = [];

			subscription.on('message', (message) => {
				const data = message.data.toString();
				receivedMessages.push({ data, orderingKey: message.orderingKey });

				if (data === 'unordered') {
					message.ack();
				}
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('ordered-blocked'),
				orderingKey: 'user-123',
			});

			await topic.publishMessage({
				data: Buffer.from('unordered'),
			});

			await new Promise((resolve) => setTimeout(resolve, 200));

			const unorderedMsg = receivedMessages.find(msg => msg.data === 'unordered');
			expect(unorderedMsg).toBeDefined();
			expect(unorderedMsg?.orderingKey).toBeUndefined();
		});
	});

	describe('AC-009: Ordering Key Accepted Without Explicit Enable', () => {
		test('should accept ordering key as metadata without explicit messageOrdering enable', async () => {
			topic = pubsub.topic('standard-topic');
			await topic.create();

			const subscription = topic.subscription('standard-sub', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create();
			subscriptions.push(subscription);

			const receivedMessage = new Promise<{ data: string; orderingKey?: string }>((resolve) => {
				subscription.on('message', (message) => {
					resolve({
						data: message.data.toString(),
						orderingKey: message.orderingKey
					});
					message.ack();
				});
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			const messageId = await topic.publishMessage({
				data: Buffer.from('test-message'),
				orderingKey: 'user-123',
			});

			expect(typeof messageId).toBe('string');
			expect(messageId.length).toBeGreaterThan(0);

			const received = await receivedMessage;
			expect(received.data).toBe('test-message');
			expect(received.orderingKey).toBe('user-123');
		});
	});

	describe('AC-010: Batching with Ordering Keys', () => {
		test('should batch messages with multiple ordering keys without losing messages', async () => {
			topic = pubsub.topic('batched-topic');
			await topic.create();

			topic.setPublishOptions({
				batching: {
					maxMessages: 10,
					maxMilliseconds: 50,
				},
			});

			const promises: Promise<string>[] = [];

			for (let i = 0; i < 20; i++) {
				promises.push(
					topic.publishMessage({
						data: Buffer.from(`message-${i}`),
						orderingKey: `user-${i % 5}`,
					})
				);
			}

			const messageIds = await Promise.all(promises);

			expect(messageIds).toHaveLength(20);
			expect(messageIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
		});
	});

	describe('AC-011: Ordering Key Paused on Error', () => {
		test('should reject publishing to a paused ordering key', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();
			topic.setPublishOptions({ messageOrdering: true });

			(topic.publisher as any).pausedOrderingKeys.add('user-123');

			await expect(
				topic.publishMessage({
					data: Buffer.from('test'),
					orderingKey: 'user-123',
				})
			).rejects.toThrow('Ordering key user-123 is paused');

			const messageId = await topic.publishMessage({
				data: Buffer.from('test'),
				orderingKey: 'user-456',
			});
			expect(messageId).toBeDefined();
		});
	});

	describe('AC-012: Resume Publishing After Error', () => {
		test('should resume publishing after calling resumePublishing()', async () => {
			topic = pubsub.topic('ordered-events');
			await topic.create();
			topic.setPublishOptions({ messageOrdering: true });

			(topic.publisher as any).pausedOrderingKeys.add('user-123');

			topic.resumePublishing('user-123');

			const messageId = await topic.publishMessage({
				data: Buffer.from('test'),
				orderingKey: 'user-123',
			});
			expect(messageId).toBeDefined();
		});
	});

	describe('publishJSON with orderingKey', () => {
		test('should publish JSON messages with orderingKey option', async () => {
			topic = pubsub.topic('user-events');
			await topic.create();

			topic.setPublishOptions({ messageOrdering: true });

			const subscription = topic.subscription('event-processor', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create();
			subscription.setOptions({ enableMessageOrdering: true });
			subscriptions.push(subscription);

			const receivedEvents: Array<{ type: string; userId: string }> = [];

			subscription.on('message', (message) => {
				const event = JSON.parse(message.data.toString());
				receivedEvents.push({ type: event.type, userId: message.orderingKey || '' });
				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			const userId = 'user-123';

			await topic.publishJSON({ type: 'login', timestamp: Date.now() }, {
				orderingKey: userId
			});

			await topic.publishJSON({ type: 'page_view', page: '/home', timestamp: Date.now() }, {
				orderingKey: userId
			});

			await topic.publishJSON({ type: 'logout', timestamp: Date.now() }, {
				orderingKey: userId
			});

			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(receivedEvents).toHaveLength(3);
			expect(receivedEvents[0]).toEqual({ type: 'login', userId: 'user-123' });
			expect(receivedEvents[1]).toEqual({ type: 'page_view', userId: 'user-123' });
			expect(receivedEvents[2]).toEqual({ type: 'logout', userId: 'user-123' });
		});

		test('should support publishJSON with both attributes and orderingKey', async () => {
			topic = pubsub.topic('user-events-attrs');
			await topic.create();

			topic.setPublishOptions({ messageOrdering: true });

			const subscription = topic.subscription('event-processor-attrs', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create();
			subscription.setOptions({ enableMessageOrdering: true });
			subscriptions.push(subscription);

			const receivedMessages: Array<{ data: any; attrs: Record<string, string>; orderingKey: string }> = [];

			subscription.on('message', (message) => {
				const data = JSON.parse(message.data.toString());
				receivedMessages.push({
					data,
					attrs: message.attributes,
					orderingKey: message.orderingKey || ''
				});
				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			await topic.publishJSON(
				{ type: 'purchase', amount: 99.99 },
				{
					attributes: { source: 'web', version: '1.0' },
					orderingKey: 'user-456'
				}
			);

			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(receivedMessages).toHaveLength(1);
			expect(receivedMessages[0]!.data).toEqual({ type: 'purchase', amount: 99.99 });
			expect(receivedMessages[0]!.attrs).toEqual({ source: 'web', version: '1.0' });
			expect(receivedMessages[0]!.orderingKey).toBe('user-456');
		});

		test('should maintain backward compatibility with attributes-only signature', async () => {
			topic = pubsub.topic('backward-compat-topic');
			await topic.create();

			const subscription = topic.subscription('backward-compat-sub', {
				closeOptions: { behavior: 'NACK' }
			});
			await subscription.create();
			subscriptions.push(subscription);

			const receivedMessages: Array<{ data: any; attrs: Record<string, string> }> = [];

			subscription.on('message', (message) => {
				const data = JSON.parse(message.data.toString());
				receivedMessages.push({
					data,
					attrs: message.attributes
				});
				message.ack();
			});

			subscription.on('error', (error) => {
				console.error('Subscription error:', error);
			});

			subscription.open();

			await topic.publishJSON(
				{ userId: 123, action: 'login' },
				{ origin: 'test', timestamp: Date.now().toString() }
			);

			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(receivedMessages).toHaveLength(1);
			expect(receivedMessages[0]!.data).toEqual({ userId: 123, action: 'login' });
			expect(receivedMessages[0]!.attrs.origin).toBe('test');
		});
	});
});
