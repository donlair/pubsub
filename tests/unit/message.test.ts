/**
 * Message class unit tests.
 * Reference: specs/04-message.md
 * Tests all 15 acceptance criteria.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Message } from '../../src/message';
import { PreciseDate } from '../../src/utils/precise-date';
import { AckResponses } from '../../src/types/message';
import { MessageQueue } from '../../src/internal/message-queue';

describe('Message', () => {
	let messageQueue: MessageQueue;

	beforeEach(() => {
		// Get singleton instance and reset state
		messageQueue = MessageQueue.getInstance();

		// Register a test topic and subscription
		messageQueue.registerTopic('projects/test/topics/test-topic');
		messageQueue.registerSubscription(
			'projects/test/subscriptions/test-sub',
			'projects/test/topics/test-topic',
		);
	});

	// AC-001: Basic Message Properties
	test('AC-001: should have all basic properties accessible', () => {
		const data = Buffer.from('Hello World');
		const attributes = { key: 'value' };
		const publishTime = new PreciseDate();
		const subscription = { name: 'test-sub' };

		const message = new Message(
			'msg-123',
			'ack-456',
			data,
			attributes,
			publishTime,
			subscription,
		);

		expect(message.id).toBe('msg-123');
		expect(message.ackId).toBe('ack-456');
		expect(message.data).toBeInstanceOf(Buffer);
		expect(message.data.toString()).toBe('Hello World');
		expect(message.attributes).toEqual({ key: 'value' });
		expect(message.publishTime).toBeInstanceOf(Date);
		expect(message.received).toBeGreaterThan(0);
	});

	// AC-002: Ack Removes Message
	test('AC-002: ack should remove message from queue', () => {
		// Publish a message
		const publishResult = messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		expect(publishResult).toHaveLength(1);

		// Pull the message
		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(messages).toHaveLength(1);

		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		// Create Message instance
		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Ack the message
		message.ack();

		// Try to pull again - should be empty
		const messagesAfterAck = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(messagesAfterAck).toHaveLength(0);
	});

	// AC-003: Nack Causes Immediate Redelivery
	test('AC-003: nack should cause immediate redelivery', () => {
		// Publish a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		// Pull the message
		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(messages).toHaveLength(1);

		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		// Create Message instance
		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Nack the message
		message.nack();

		// Pull again - should be redelivered
		const redeliveredMessages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(redeliveredMessages).toHaveLength(1);

		// Delivery attempt should be incremented
		const redelivered = redeliveredMessages[0];
		expect(redelivered?.deliveryAttempt).toBe(2);
	});

	// AC-004: Modify Ack Deadline
	test('AC-004: modifyAckDeadline should extend deadline', async () => {
		// Publish a message with short ack deadline
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		// Pull the message (this starts the ack deadline timer)
		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Extend deadline to 5 seconds
		message.modifyAckDeadline(5);

		// Message should still be in-flight, not redelivered
		const shouldBeEmpty = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(shouldBeEmpty).toHaveLength(0);

		// Ack the message
		message.ack();
	});

	// AC-005: Message Length Property
	test('AC-005: length should equal data.length', () => {
		const data = Buffer.from('Hello World');
		const message = new Message(
			'msg-1',
			'ack-1',
			data,
			{},
			new PreciseDate(),
			{ name: 'test-sub' },
		);

		expect(message.length).toBe(data.length);
		expect(message.length).toBe(11);
	});

	// AC-006: Empty Data Message
	test('AC-006: should handle empty data', () => {
		const data = Buffer.alloc(0);
		const message = new Message(
			'msg-1',
			'ack-1',
			data,
			{},
			new PreciseDate(),
			{ name: 'test-sub' },
		);

		expect(message.data).toBeInstanceOf(Buffer);
		expect(message.data.length).toBe(0);
		expect(message.length).toBe(0);

		// Should be able to ack/nack normally
		message.ack();
	});

	// AC-007: Ordering Key Present
	test('AC-007: orderingKey should be accessible when present', () => {
		const message = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			{ name: 'test-sub' },
			'user-123',
		);

		expect(message.orderingKey).toBe('user-123');
	});

	test('AC-007: orderingKey should be undefined when not present', () => {
		const message = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			{ name: 'test-sub' },
		);

		expect(message.orderingKey).toBeUndefined();
	});

	// AC-008: Multiple Acks Are Idempotent
	test('AC-008: multiple acks should be idempotent', () => {
		// Publish a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Multiple acks should not throw
		message.ack();
		message.ack();
		message.ack();

		// Message should not be redelivered
		const shouldBeEmpty = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(shouldBeEmpty).toHaveLength(0);
	});

	// AC-009: Ack After Nack Has No Effect
	test('AC-009: ack after nack should have no effect', () => {
		// Publish a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Nack first
		message.nack();

		// Then ack (should have no effect)
		message.ack();

		// Message should be redelivered
		const redelivered = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(redelivered).toHaveLength(1);
	});

	// AC-010: Delivery Attempt Counter
	test('AC-010: deliveryAttempt should be present', () => {
		const message = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			{ name: 'test-sub' },
			undefined,
			3,
		);

		expect(message.deliveryAttempt).toBe(3);
	});

	// AC-011: Ack With Response Returns Success
	test('AC-011: ackWithResponse should return SUCCESS', async () => {
		// Publish and pull a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		const response = await message.ackWithResponse();
		expect(response).toBe(AckResponses.Success);
	});

	// AC-012: Nack With Response Returns Success
	test('AC-012: nackWithResponse should return SUCCESS', async () => {
		// Publish and pull a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		const response = await message.nackWithResponse();
		expect(response).toBe(AckResponses.Success);

		// Message should be redelivered
		const redelivered = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		expect(redelivered).toHaveLength(1);
	});

	// AC-013: Ack With Response Handles Invalid Ack ID
	test('AC-013: ackWithResponse should return INVALID on double ack', async () => {
		// Publish and pull a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// First ack - should succeed
		const firstResponse = await message.ackWithResponse();
		expect(firstResponse).toBe(AckResponses.Success);

		// Second ack - should return INVALID
		const secondResponse = await message.ackWithResponse();
		expect(secondResponse).toBe(AckResponses.Invalid);
	});

	// AC-014: Response Methods Work Without Exactly-Once
	test('AC-014: response methods work without exactly-once delivery', async () => {
		// Publish and pull a message
		messageQueue.publish('projects/test/topics/test-topic', [
			{
				id: 'msg-1',
				data: Buffer.from('test'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		const messages = messageQueue.pull(
			'projects/test/subscriptions/test-sub',
			1,
		);
		const internalMsg = messages[0];
		if (!internalMsg) throw new Error('No message');

		const message = new Message(
			internalMsg.id,
			internalMsg.ackId || 'ack-1',
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			{ name: 'test-sub' },
		);

		// Should work and return SUCCESS
		const response = await message.ackWithResponse();
		expect(response).toBe(AckResponses.Success);
	});

	// AC-015: Attribute Validation
	describe('AC-015: Attribute validation', () => {
		test('should freeze attributes to prevent modification', () => {
			const attributes = { key: 'value' };
			const message = new Message(
				'msg-1',
				'ack-1',
				Buffer.from('test'),
				attributes,
				new PreciseDate(),
				{ name: 'test-sub' },
			);

			// Attributes should be frozen
			expect(() => {
				// @ts-expect-error - testing runtime immutability
				message.attributes.key = 'modified';
			}).toThrow();

			// Original attributes should be unchanged
			expect(message.attributes.key).toBe('value');
		});

		test('should validate ack deadline range', () => {
			const message = new Message(
				'msg-1',
				'ack-1',
				Buffer.from('test'),
				{},
				new PreciseDate(),
				{ name: 'test-sub' },
			);

			// Should accept valid range (0-600)
			expect(() => message.modifyAckDeadline(0)).not.toThrow();
			expect(() => message.modifyAckDeadline(300)).not.toThrow();
			expect(() => message.modifyAckDeadline(600)).not.toThrow();

			// Should reject invalid range
			expect(() => message.modifyAckDeadline(-1)).toThrow(
				'Ack deadline must be between 0 and 600 seconds',
			);
			expect(() => message.modifyAckDeadline(601)).toThrow(
				'Ack deadline must be between 0 and 600 seconds',
			);
		});

		test('modAck should be alias for modifyAckDeadline', () => {
			const message = new Message(
				'msg-1',
				'ack-1',
				Buffer.from('test'),
				{},
				new PreciseDate(),
				{ name: 'test-sub' },
			);

			// modAck should work the same as modifyAckDeadline
			expect(() => message.modAck(300)).not.toThrow();
			expect(() => message.modAck(-1)).toThrow(
				'Ack deadline must be between 0 and 600 seconds',
			);
		});

		test('modifyAckDeadline(0) should act as nack', () => {
			// Publish a message
			messageQueue.publish(
				'projects/test/topics/test-topic',
				[
					{
						id: 'msg-1',
						data: Buffer.from('test'),
						attributes: {},
						publishTime: new PreciseDate(),
						orderingKey: undefined,
						deliveryAttempt: 1,
						length: 4,
					},
				],
			);

			const messages = messageQueue.pull(
				'projects/test/subscriptions/test-sub',
				1,
			);
			const internalMsg = messages[0];
			if (!internalMsg) throw new Error('No message');

			const message = new Message(
				internalMsg.id,
				internalMsg.ackId || 'ack-1',
				internalMsg.data,
				internalMsg.attributes,
				internalMsg.publishTime,
				{ name: 'test-sub' },
			);

			// modifyAckDeadline(0) should cause redelivery like nack
			message.modifyAckDeadline(0);

			// Message should be redelivered
			const redelivered = messageQueue.pull(
				'projects/test/subscriptions/test-sub',
				1,
			);
			expect(redelivered).toHaveLength(1);
		});
	});
});
