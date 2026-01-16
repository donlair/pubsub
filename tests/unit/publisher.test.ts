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

	// AC-015 from specs/05-publisher.md: Attribute Validation
	test('Rejects empty attribute key', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { '': 'value' },
			})
		).rejects.toThrow('Attribute keys cannot be empty');
	});

	test('Rejects attribute key exceeding 256 bytes', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a key that's exactly 257 bytes
		const longKey = 'x'.repeat(257);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { [longKey]: 'value' },
			})
		).rejects.toThrow('Attribute key exceeds maximum length of 256 bytes (got 257 bytes)');
	});

	test('Accepts attribute key at max size (256 bytes)', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a key that's exactly 256 bytes
		const maxKey = 'x'.repeat(256);

		const messageId = await publisher.publishMessage({
			data: Buffer.from('test'),
			attributes: { [maxKey]: 'value' },
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});

	test('Rejects attribute value exceeding 1024 bytes', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a value that's exactly 1025 bytes
		const longValue = 'x'.repeat(1025);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { key: longValue },
			})
		).rejects.toThrow('Attribute value for key "key" exceeds maximum length of 1024 bytes (got 1025 bytes)');
	});

	test('Accepts attribute value at max size (1024 bytes)', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a value that's exactly 1024 bytes
		const maxValue = 'x'.repeat(1024);

		const messageId = await publisher.publishMessage({
			data: Buffer.from('test'),
			attributes: { key: maxValue },
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});

	test('Rejects attribute key with reserved prefix "goog"', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { googTest: 'value' },
			})
		).rejects.toThrow('Attribute key "googTest" uses reserved prefix (goog* or googclient_*)');
	});

	test('Rejects attribute key with reserved prefix "googclient_"', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { googclient_test: 'value' },
			})
		).rejects.toThrow('Attribute key "googclient_test" uses reserved prefix (goog* or googclient_*)');
	});

	test('Accepts valid attributes with various keys', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		const messageId = await publisher.publishMessage({
			data: Buffer.from('test'),
			attributes: {
				myKey: 'value',
				another_key: 'another_value',
				key123: 'numeric',
			},
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});

	test('Validates UTF-8 byte length for attribute keys', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// UTF-8 multi-byte characters: '你' is 3 bytes in UTF-8
		// 86 characters * 3 bytes = 258 bytes (exceeds 256 byte limit)
		const multiByteKey = '你'.repeat(86);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { [multiByteKey]: 'value' },
			})
		).rejects.toThrow('Attribute key exceeds maximum length of 256 bytes');
	});

	test('Validates UTF-8 byte length for attribute values', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// UTF-8 multi-byte characters: '你' is 3 bytes in UTF-8
		// 342 characters * 3 bytes = 1026 bytes (exceeds 1024 byte limit)
		const multiByteValue = '你'.repeat(342);

		await expect(
			publisher.publishMessage({
				data: Buffer.from('test'),
				attributes: { key: multiByteValue },
			})
		).rejects.toThrow('Attribute value for key "key" exceeds maximum length of 1024 bytes');
	});

	// BR-011 from specs/04-message.md: Message Size Limit (10MB)
	test('Rejects message exceeding 10MB', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create a message that exceeds 10MB (10 * 1024 * 1024 = 10485760 bytes)
		const largeData = Buffer.alloc(10485761); // 10MB + 1 byte

		await expect(
			publisher.publishMessage({
				data: largeData,
			})
		).rejects.toThrow('Message size exceeds maximum of 10MB');
	});

	test('Accepts message at exactly 10MB', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		// Configure publisher with flow control that allows 10MB+ messages
		const publisher = new Publisher(topicName, {
			flowControlOptions: {
				maxOutstandingMessages: 10,
				maxOutstandingBytes: 20 * 1024 * 1024, // 20MB
			},
		});

		// Create a message that's exactly 10MB (10 * 1024 * 1024 = 10485760 bytes)
		const maxData = Buffer.alloc(10485760);

		const messageId = await publisher.publishMessage({
			data: maxData,
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});

	test('Rejects message with data + attributes exceeding 10MB', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName);

		// Create data that's close to 10MB
		const largeData = Buffer.alloc(10485750); // 10MB - 10 bytes

		// Add attributes that push total size over 10MB
		await expect(
			publisher.publishMessage({
				data: largeData,
				attributes: { key: 'x'.repeat(20) }, // 20 + 3 = 23 bytes (total > 10MB)
			})
		).rejects.toThrow('Message size exceeds maximum of 10MB');
	});

	test('Accepts message with data + attributes at 10MB limit', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		// Configure publisher with flow control that allows 10MB+ messages
		const publisher = new Publisher(topicName, {
			flowControlOptions: {
				maxOutstandingMessages: 10,
				maxOutstandingBytes: 20 * 1024 * 1024, // 20MB
			},
		});

		// Create data + attributes that total exactly 10MB
		const dataSize = 10485750; // 10MB - 10 bytes
		const data = Buffer.alloc(dataSize);

		const messageId = await publisher.publishMessage({
			data,
			attributes: { abc: 'de' }, // 3 + 2 = 5 bytes each, total 10 bytes
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});

	test('Rejects message exceeding 10MB with UTF-8 multi-byte characters in attributes', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			flowControlOptions: {
				maxOutstandingMessages: 10,
				maxOutstandingBytes: 20 * 1024 * 1024,
			},
		});

		const dataSize = 10485745;
		const data = Buffer.alloc(dataSize);

		await expect(
			publisher.publishMessage({
				data,
				attributes: { key: '你好世界👋' },
			})
		).rejects.toThrow('Message size exceeds maximum of 10MB');
	});

	test('Accepts message at 10MB limit with UTF-8 multi-byte characters in attributes', async () => {
		const topicName = 'projects/test-project/topics/my-topic';
		queue.registerTopic(topicName);

		const publisher = new Publisher(topicName, {
			flowControlOptions: {
				maxOutstandingMessages: 10,
				maxOutstandingBytes: 20 * 1024 * 1024,
			},
		});

		const dataSize = 10485751;
		const data = Buffer.alloc(dataSize);

		const messageId = await publisher.publishMessage({
			data,
			attributes: { key: '你好' },
		});

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe('string');
	});
});
