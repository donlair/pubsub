import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';

describe('Integration: Flow Control', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'flow-control-test' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	describe('Publisher Flow Control', () => {
		test('AC-001: Publisher processes messages with flow control limits', async () => {
			const topicName = 'test-topic-publisher-flow';
			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				'test-sub-publisher-flow'
			);

			topic.setPublishOptions({
				flowControlOptions: {
					maxOutstandingMessages: 5,
					maxOutstandingBytes: 10 * 1024 * 1024,
				},
				batching: {
					maxMessages: 2,
					maxMilliseconds: 50,
					maxBytes: 1024 * 1024,
				},
			});

			const receivedMessages: Message[] = [];
			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const publishPromises = [];
			for (let i = 0; i < 12; i++) {
				publishPromises.push(
					topic.publishMessage({
						data: Buffer.from(`Message ${i}`),
					})
				);
			}

			const messageIds = await Promise.all(publishPromises);

			expect(messageIds).toHaveLength(12);
			expect(messageIds.every((id) => typeof id === 'string')).toBe(true);

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(receivedMessages.length).toBe(12);

			await subscription.close();
			await pubsub.close();
		});

		test('AC-002: Publisher handles large messages with byte limits', async () => {
			const topicName = 'test-topic-publisher-bytes';
			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				'test-sub-publisher-bytes'
			);

			const largeData = Buffer.alloc(1024);
			topic.setPublishOptions({
				flowControlOptions: {
					maxOutstandingMessages: 100,
					maxOutstandingBytes: 5 * 1024 * 1024,
				},
				batching: {
					maxMessages: 1,
					maxMilliseconds: 50,
					maxBytes: 2048,
				},
			});

			const receivedMessages: Message[] = [];
			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const publishPromises = [];
			for (let i = 0; i < 5; i++) {
				publishPromises.push(
					topic.publishMessage({
						data: largeData,
					})
				);
			}

			const messageIds = await Promise.all(publishPromises);

			expect(messageIds).toHaveLength(5);

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(receivedMessages.length).toBe(5);
			for (const msg of receivedMessages) {
				expect(msg.length).toBe(1024);
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-003: Publisher flow control releases after batch publishes', async () => {
			const topicName = 'test-topic-publisher-release';
			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(
				topicName,
				'test-sub-release'
			);

			topic.setPublishOptions({
				flowControlOptions: {
					maxOutstandingMessages: 3,
				},
				batching: {
					maxMessages: 1,
					maxMilliseconds: 10,
				},
			});

			const receivedMessages: Message[] = [];
			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();
			});
			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const messageCount = 10;
			const publishPromises = [];

			for (let i = 0; i < messageCount; i++) {
				publishPromises.push(
					topic.publishMessage({
						data: Buffer.from(`Message ${i}`),
					})
				);
			}

			await Promise.all(publishPromises);

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(receivedMessages.length).toBe(messageCount);

			await subscription.close();
			await pubsub.close();
		});
	});

	describe('Subscriber Flow Control', () => {
		test('AC-004: Subscriber limits in-flight messages', async () => {
			const topicName = 'test-topic-sub-flow';
			const subName = 'test-sub-flow';
			const maxMessages = 3;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages,
					maxBytes: 100 * 1024 * 1024,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
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

			expect(receivedMessages.length).toBeLessThanOrEqual(maxMessages);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-005: Subscriber limits in-flight bytes', async () => {
			const topicName = 'test-topic-sub-bytes';
			const subName = 'test-sub-bytes';
			const maxBytes = 2048;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages: 100,
					maxBytes,
				},
			});

			const receivedMessages: Message[] = [];
			const largeData = Buffer.alloc(1024);

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			for (let i = 0; i < 5; i++) {
				await topic.publishMessage({
					data: largeData,
				});
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			const totalBytes = receivedMessages.reduce(
				(sum, msg) => sum + msg.length,
				0
			);

			expect(totalBytes).toBeLessThanOrEqual(maxBytes);
			expect(receivedMessages.length).toBeLessThanOrEqual(2);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-006: Subscriber releases capacity on ack', async () => {
			const topicName = 'test-topic-sub-ack-release';
			const subName = 'test-sub-ack-release';
			const maxMessages = 2;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const messageCount = 6;
			for (let i = 0; i < messageCount; i++) {
				await topic.publishMessage({
					data: Buffer.from(`Message ${i}`),
				});
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(receivedMessages.length).toBe(maxMessages);

			receivedMessages[0]?.ack();

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(receivedMessages.length).toBe(maxMessages + 1);

			receivedMessages[1]?.ack();

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(receivedMessages.length).toBe(maxMessages + 2);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-007: Subscriber releases capacity on nack', async () => {
			const topicName = 'test-topic-sub-nack-release';
			const subName = 'test-sub-nack-release';
			const maxMessages = 2;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages,
				},
			});

			const receivedMessages: Message[] = [];
			let nackCount = 0;

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);

				if (receivedMessages.length === 1 && nackCount === 0) {
					nackCount++;
					message.nack();
				}
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const messageCount = 5;
			for (let i = 0; i < messageCount; i++) {
				await topic.publishMessage({
					data: Buffer.from(`Message ${i}`),
				});
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedMessages.length).toBeGreaterThan(maxMessages);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-008: allowExcessMessages permits batch completion', async () => {
			const topicName = 'test-topic-sub-excess';
			const subName = 'test-sub-excess';
			const maxMessages = 3;

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages,
					allowExcessMessages: true,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
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

			expect(receivedMessages.length).toBeGreaterThanOrEqual(maxMessages);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});
	});

	describe('Combined Publisher and Subscriber Flow Control', () => {
		test('AC-009: End-to-end flow control coordination', async () => {
			const topicName = 'test-topic-e2e-flow';
			const subName = 'test-sub-e2e-flow';

			const [topic] = await pubsub.createTopic(topicName);

			topic.setPublishOptions({
				flowControlOptions: {
					maxOutstandingMessages: 5,
				},
				batching: {
					maxMessages: 2,
					maxMilliseconds: 50,
				},
			});

			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages: 3,
				},
			});

			const receivedMessages: Message[] = [];
			let processedCount = 0;

			subscription.on('message', async (message: Message) => {
				receivedMessages.push(message);

				await new Promise((resolve) => setTimeout(resolve, 20));

				message.ack();
				processedCount++;
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const messageCount = 15;
			const publishPromises = [];

			for (let i = 0; i < messageCount; i++) {
				publishPromises.push(
					topic.publishMessage({
						data: Buffer.from(`Message ${i}`),
					})
				);
			}

			await Promise.all(publishPromises);

			await new Promise((resolve) => setTimeout(resolve, 500));

			expect(processedCount).toBe(messageCount);

			await subscription.close();
			await pubsub.close();
		});

		test('AC-010: Flow control with message ordering', async () => {
			const topicName = 'test-topic-flow-ordering';
			const subName = 'test-sub-flow-ordering';

			const [topic] = await pubsub.createTopic(topicName);

			topic.setPublishOptions({
				messageOrdering: true,
				flowControlOptions: {
					maxOutstandingMessages: 4,
				},
				batching: {
					maxMessages: 2,
					maxMilliseconds: 50,
				},
			});

			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				enableMessageOrdering: true,
				flowControl: {
					maxMessages: 2,
				},
			});

			const receivedByKey: Record<string, string[]> = {};

			subscription.on('message', (message: Message) => {
				const key = message.orderingKey || 'default';
				if (!receivedByKey[key]) {
					receivedByKey[key] = [];
				}
				receivedByKey[key]?.push(message.data.toString());
				message.ack();
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const keys = ['key-1', 'key-2'];
			const messagesPerKey = 5;

			for (let i = 0; i < messagesPerKey; i++) {
				for (const key of keys) {
					await topic.publishMessage({
						data: Buffer.from(`${key}-msg-${i}`),
						orderingKey: key,
					});
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(receivedByKey['key-1']).toBeDefined();
			expect(receivedByKey['key-2']).toBeDefined();

			for (const key of keys) {
				const messages = receivedByKey[key];
				expect(messages).toHaveLength(messagesPerKey);

				for (let i = 0; i < messagesPerKey; i++) {
					expect(messages?.[i]).toBe(`${key}-msg-${i}`);
				}
			}

			await subscription.close();
			await pubsub.close();
		});

		test('AC-011: High throughput with flow control', async () => {
			const topicName = 'test-topic-high-throughput';
			const subName = 'test-sub-high-throughput';

			const [topic] = await pubsub.createTopic(topicName);

			topic.setPublishOptions({
				flowControlOptions: {
					maxOutstandingMessages: 50,
					maxOutstandingBytes: 5 * 1024 * 1024,
				},
				batching: {
					maxMessages: 20,
					maxMilliseconds: 20,
				},
			});

			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages: 30,
					maxBytes: 10 * 1024 * 1024,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const messageCount = 100;
			const publishPromises = [];

			for (let i = 0; i < messageCount; i++) {
				publishPromises.push(
					topic.publishMessage({
						data: Buffer.from(`Message ${i}`),
					})
				);
			}

			await Promise.all(publishPromises);

			await new Promise((resolve) => setTimeout(resolve, 500));

			expect(receivedMessages.length).toBe(messageCount);

			await subscription.close();
			await pubsub.close();
		});
	});

	describe('Flow Control Edge Cases', () => {
		test('AC-012: Zero maxMessages allows no messages', async () => {
			const topicName = 'test-topic-zero-flow';
			const subName = 'test-sub-zero-flow';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages: 0,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
				message.ack();
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			await topic.publishMessage({
				data: Buffer.from('Message 1'),
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedMessages.length).toBe(0);

			await subscription.close();
			await pubsub.close();
		});

		test('AC-013: Flow control with varying message sizes', async () => {
			const topicName = 'test-topic-varying-sizes';
			const subName = 'test-sub-varying-sizes';

			const [topic] = await pubsub.createTopic(topicName);
			const [subscription] = await pubsub.createSubscription(topicName, subName, {
				flowControl: {
					maxMessages: 100,
					maxBytes: 5000,
				},
			});

			const receivedMessages: Message[] = [];

			subscription.on('message', (message: Message) => {
				receivedMessages.push(message);
			});

			subscription.on('error', (error: Error) => {
				throw error;
			});

			subscription.open();

			const sizes = [100, 500, 1000, 2000, 3000];
			for (const size of sizes) {
				await topic.publishMessage({
					data: Buffer.alloc(size),
				});
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			const totalBytes = receivedMessages.reduce(
				(sum, msg) => sum + msg.length,
				0
			);

			expect(totalBytes).toBeLessThanOrEqual(5000);

			for (const message of receivedMessages) {
				message.ack();
			}

			await subscription.close();
			await pubsub.close();
		});
	});
});
