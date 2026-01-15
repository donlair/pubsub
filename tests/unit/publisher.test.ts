/**
 * Publisher unit tests.
 * Reference: specs/05-publisher.md
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Publisher } from '../../src/publisher/publisher';
import { MessageQueue } from '../../src/internal/message-queue';

describe('Publisher', () => {
	let queue: MessageQueue;

	beforeEach(() => {
		queue = MessageQueue.getInstance();
		// Clean up
		const topics = queue.getAllTopics();
		for (const topic of topics) {
			const topicName = topic.name;
			if (topicName) {
				queue.unregisterTopic(topicName);
			}
		}
	});

	// AC-001: Default Batching Behavior
	test('AC-001: Default batching behavior', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Default: maxMessages=100, maxMilliseconds=10, maxBytes=1MB
		const promises = Array.from({ length: 50 }, (_, i) =>
			publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
		);

		const messageIds = await Promise.all(promises);

		expect(messageIds).toHaveLength(50);
		expect(messageIds.every((id) => typeof id === 'string')).toBe(true);
	});

	// AC-002: Time-Based Batch Trigger
	test('AC-002: Time-based batch trigger', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 20,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const startTime = Date.now();

		// Publish just 5 messages
		const promises = Array.from({ length: 5 }, (_, i) =>
			publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
		);

		const messageIds = await Promise.all(promises);
		const duration = Date.now() - startTime;

		// Should take ~20ms due to time-based batching
		expect(duration).toBeGreaterThanOrEqual(15);
		expect(duration).toBeLessThan(50);
		expect(messageIds).toHaveLength(5);
	});

	// AC-003: Count-Based Batch Trigger
	test('AC-003: Count-based batch trigger', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 10,
				maxMilliseconds: 1000,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const startTime = Date.now();

		// Publish exactly 10 messages
		const promises = Array.from({ length: 10 }, (_, i) =>
			publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
		);

		const messageIds = await Promise.all(promises);
		const duration = Date.now() - startTime;

		// Should publish immediately (count threshold)
		expect(duration).toBeLessThan(50);
		expect(messageIds).toHaveLength(10);
	});

	// AC-004: Size-Based Batch Trigger
	test('AC-004: Size-based batch trigger', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 1000,
				maxBytes: 1024, // 1KB
			},
		});

		// Each message is 512 bytes
		const largeData = Buffer.alloc(512);

		const promises = [
			publisher.publishMessage({ data: largeData }), // 512 bytes
			publisher.publishMessage({ data: largeData }), // 1024 bytes total - triggers
			publisher.publishMessage({ data: largeData }), // New batch
		];

		const messageIds = await Promise.all(promises);
		expect(messageIds).toHaveLength(3);
	});

	// AC-005: Flush Publishes Immediately
	test('AC-005: Flush publishes immediately', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 5000, // Long delay
			},
		});

		// Publish without awaiting
		publisher.publishMessage({ data: Buffer.from('test1') });
		publisher.publishMessage({ data: Buffer.from('test2') });

		// Flush should complete immediately
		const flushStart = Date.now();
		await publisher.flush();
		const flushDuration = Date.now() - flushStart;

		expect(flushDuration).toBeLessThan(100); // Much less than 5000ms
	});

	// AC-006: Message Ordering Separate Batches
	test('AC-006: Message ordering separate batches', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			messageOrdering: true,
			batching: {
				maxMessages: 100,
				maxMilliseconds: 50,
			},
		});

		// Publish messages with different ordering keys
		const messageIds = await Promise.all([
			publisher.publishMessage({
				data: Buffer.from('user-1-msg-1'),
				orderingKey: 'user-1',
			}),
			publisher.publishMessage({
				data: Buffer.from('user-2-msg-1'),
				orderingKey: 'user-2',
			}),
			publisher.publishMessage({
				data: Buffer.from('user-1-msg-2'),
				orderingKey: 'user-1',
			}),
		]);

		expect(messageIds).toHaveLength(3);
		expect(messageIds.every((id) => typeof id === 'string')).toBe(true);
	});

	// AC-007: Ordering Key Error Pause and Resume
	test('AC-007: Ordering key error pause and resume', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			messageOrdering: true,
		});

		// Simulate paused ordering key by using internal API
		// In real scenario, this would happen after a publish error
		// @ts-expect-error - accessing private property for testing
		publisher.pausedOrderingKeys.add('user-1');

		// Publishes for paused key should reject
		await expect(
			publisher.publishMessage({
				data: Buffer.from('msg-1'),
				orderingKey: 'user-1',
			})
		).rejects.toThrow('Ordering key user-1 is paused');

		// Other keys unaffected
		await expect(
			publisher.publishMessage({
				data: Buffer.from('msg-2'),
				orderingKey: 'user-2',
			})
		).resolves.toBeDefined();

		// Resume publishing
		publisher.resumePublishing('user-1');

		// Now user-1 key works again
		await expect(
			publisher.publishMessage({
				data: Buffer.from('msg-3'),
				orderingKey: 'user-1',
			})
		).resolves.toBeDefined();
	});

	// AC-008: Flow Control Max Messages
	test('AC-008: Flow control max messages', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			flowControlOptions: {
				maxOutstandingMessages: 5,
			},
			batching: {
				maxMessages: 2,
				maxMilliseconds: 50, // Use timer-based batching
			},
		});

		// Publish 10 messages - should batch and throttle
		const promises = Array.from({ length: 10 }, (_, i) =>
			publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
		);

		// All promises should eventually resolve
		const messageIds = await Promise.all(promises);
		expect(messageIds).toHaveLength(10);
		expect(messageIds.every((id) => typeof id === 'string')).toBe(true);
	});

	// AC-009: Disable Batching
	test('AC-009: Disable batching', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 1,
				maxMilliseconds: 0,
				maxBytes: 1,
			},
		});

		// Each message publishes immediately
		const messageIds = await Promise.all([
			publisher.publishMessage({ data: Buffer.from('test1') }),
			publisher.publishMessage({ data: Buffer.from('test2') }),
		]);

		expect(messageIds).toHaveLength(2);
	});

	// AC-010: Unique Message IDs
	test('AC-010: Unique message IDs', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		const messageIds = await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
			)
		);

		// All message IDs should be unique
		const uniqueIds = new Set(messageIds);
		expect(uniqueIds.size).toBe(100);
	});

	// AC-011: Empty Message Batch
	test('AC-011: Empty message batch', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Flush with no messages should not throw
		await expect(publisher.flush()).resolves.toBeUndefined();
	});

	// Additional tests for edge cases
	test('Validates message data is Buffer', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		await expect(
			publisher.publishMessage({ data: 'not a buffer' as unknown as Buffer })
		).rejects.toThrow('Message data must be a Buffer');
	});

	test('setPublishOptions updates batching settings', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			batching: {
				maxMessages: 100,
				maxMilliseconds: 10,
			},
		});

		publisher.setPublishOptions({
			batching: {
				maxMessages: 5,
				maxMilliseconds: 5,
			},
		});

		// Should trigger after 5 messages now
		const promises = Array.from({ length: 5 }, (_, i) =>
			publisher.publishMessage({ data: Buffer.from(`Message ${i}`) })
		);

		const startTime = Date.now();
		await Promise.all(promises);
		const duration = Date.now() - startTime;

		expect(duration).toBeLessThan(20); // Triggers immediately
	});

	// AC-008 from specs/09-ordering.md: Ordering Key Validation
	test('Rejects empty ordering key', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				orderingKey: '',
			})
		).rejects.toThrow('Ordering key cannot be empty');
	});

	test('Rejects ordering key exceeding 1024 bytes', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a key that's exactly 1025 bytes
		const longKey = 'x'.repeat(1025);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				orderingKey: longKey,
			})
		).rejects.toThrow('Ordering key exceeds maximum length of 1024 bytes');
	});

	test('Accepts valid ordering key at max size', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a key that's exactly 1024 bytes
		const maxKey = 'x'.repeat(1024);

		const messageId = await publisher.publishMessage({
			data: Buffer.from('test'),
			orderingKey: maxKey,
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});
});
