import { test, expect, describe, beforeEach, spyOn } from 'bun:test';
import { MessageQueue } from '../../src/internal/message-queue';
import { AckManager } from '../../src/subscriber/ack-manager';
import { PreciseDate } from '../../src/utils/precise-date';
import { InvalidArgumentError } from '../../src/types/errors';

describe('AckManager', () => {
	let queue: MessageQueue;
	let ackManager: AckManager;
	const subscriptionName = 'projects/test/subscriptions/test-sub';
	const topicName = 'projects/test/topics/test-topic';

	beforeEach(() => {
		queue = MessageQueue.getInstance();
		const topics = queue.getAllTopics();
		for (const topic of topics) {
			const topicName = topic.name;
			if (topicName) {
				queue.unregisterTopic(topicName);
			}
		}

		queue.registerTopic(topicName);
		queue.registerSubscription(subscriptionName, topicName, {
			ackDeadlineSeconds: 10,
			retryPolicy: {
				minimumBackoff: { seconds: 0.1 },
				maximumBackoff: { seconds: 1 },
			},
		});
	});

	describe('AC-001: Ack batching with count trigger', () => {
		test('should batch acks up to maxMessages', async () => {
			ackManager = new AckManager({
				maxMessages: 3,
				maxMilliseconds: 1000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const promises = ackIds.map((ackId) => ackManager.ack(ackId));

			await Promise.all(promises);

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});

		test('should trigger batch when maxMessages reached', async () => {
			ackManager = new AckManager({
				maxMessages: 5,
				maxMilliseconds: 1000,
			});

			const messages = publishAndPullMessages(10);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const startTime = Date.now();
			const batch1Promises = ackIds.slice(0, 5).map((ackId) => ackManager.ack(ackId));
			await Promise.all(batch1Promises);
			const batch1Duration = Date.now() - startTime;

			expect(batch1Duration).toBeLessThan(100);

			const batch2Start = Date.now();
			const batch2Promises = ackIds.slice(5, 10).map((ackId) => ackManager.ack(ackId));
			await Promise.all(batch2Promises);
			const batch2Duration = Date.now() - batch2Start;

			expect(batch2Duration).toBeLessThan(100);

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});
	});

	describe('AC-002: Ack batching with time trigger', () => {
		test('should flush batch after maxMilliseconds', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 50,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const startTime = Date.now();
			const promises = ackIds.map((ackId) => ackManager.ack(ackId));

			await Promise.all(promises);
			const duration = Date.now() - startTime;

			expect(duration).toBeGreaterThanOrEqual(40);
			expect(duration).toBeLessThan(100);

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});
	});

	describe('AC-003: Nack batching with count trigger', () => {
		test('should batch nacks up to maxMessages', async () => {
			ackManager = new AckManager({
				maxMessages: 3,
				maxMilliseconds: 1000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const promises = ackIds.map((ackId) => ackManager.nack(ackId));
			await Promise.all(promises);

			await new Promise((resolve) => setTimeout(resolve, 150));

			const redelivered = queue.pull(subscriptionName, 10);
			expect(redelivered).toHaveLength(3);
			expect(redelivered[0]?.deliveryAttempt).toBe(2);
		});
	});

	describe('AC-004: Nack batching with time trigger', () => {
		test('should flush nack batch after maxMilliseconds', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 50,
			});

			const messages = publishAndPullMessages(2);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const startTime = Date.now();
			const promises = ackIds.map((ackId) => ackManager.nack(ackId));
			await Promise.all(promises);
			const duration = Date.now() - startTime;

			expect(duration).toBeGreaterThanOrEqual(40);
			expect(duration).toBeLessThan(100);
		});
	});

	describe('AC-005: Manual flush', () => {
		test('should flush all pending acks immediately', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 5000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			for (const ackId of ackIds) {
				ackManager.ack(ackId);
			}

			const flushStart = Date.now();
			await ackManager.flush();
			const flushDuration = Date.now() - flushStart;

			expect(flushDuration).toBeLessThan(100);

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});

		test('should flush all pending nacks immediately', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 5000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			for (const ackId of ackIds) {
				ackManager.nack(ackId);
			}

			await ackManager.flush();

			await new Promise((resolve) => setTimeout(resolve, 150));

			const redelivered = queue.pull(subscriptionName, 10);
			expect(redelivered).toHaveLength(3);
		});
	});

	describe('AC-006: Mixed ack and nack', () => {
		test('should handle mixed ack and nack operations', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 50,
			});

			const messages = publishAndPullMessages(6);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const promises = [
				ackManager.ack(ackIds[0] ?? ''),
				ackManager.nack(ackIds[1] ?? ''),
				ackManager.ack(ackIds[2] ?? ''),
				ackManager.nack(ackIds[3] ?? ''),
				ackManager.ack(ackIds[4] ?? ''),
				ackManager.nack(ackIds[5] ?? ''),
			];

			await Promise.all(promises);

			await new Promise((resolve) => setTimeout(resolve, 150));

			const redelivered = queue.pull(subscriptionName, 10);
			expect(redelivered).toHaveLength(3);
		});
	});

	describe('AC-007: Default options', () => {
		test('should use default batch options when not provided', async () => {
			ackManager = new AckManager();

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			const promises = ackIds.map((ackId) => ackManager.ack(ackId));
			await Promise.all(promises);

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});
	});

	describe('AC-008: Close cleanup', () => {
		test('should flush pending operations on close', async () => {
			ackManager = new AckManager({
				maxMessages: 1000,
				maxMilliseconds: 5000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			for (const ackId of ackIds) {
				ackManager.ack(ackId);
			}

			await ackManager.close();

			const remaining = queue.pull(subscriptionName, 10);
			expect(remaining).toHaveLength(0);
		});
	});

	describe('AC-009: Batch error propagation', () => {
		test('should reject all promises when one ack fails mid-batch', async () => {
			ackManager = new AckManager({
				maxMessages: 3,
				maxMilliseconds: 1000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			let callCount = 0;
			const mockError = new InvalidArgumentError('Invalid ack ID: expired');
			const ackSpy = spyOn(queue, 'ack').mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					throw mockError;
				}
			});

			const promises = ackIds.map((ackId) => ackManager.ack(ackId));

			await expect(Promise.all(promises)).rejects.toThrow('Invalid ack ID: expired');

			for (const promise of promises) {
				await expect(promise).rejects.toThrow('Invalid ack ID: expired');
			}

			expect(ackSpy).toHaveBeenCalledTimes(2);
		});

		test('should reject all promises when one nack fails mid-batch', async () => {
			ackManager = new AckManager({
				maxMessages: 3,
				maxMilliseconds: 1000,
			});

			const messages = publishAndPullMessages(3);
			const ackIds = messages.map((m) => m.ackId ?? '');

			let callCount = 0;
			const mockError = new InvalidArgumentError('Invalid ack ID: expired');
			const nackSpy = spyOn(queue, 'nack').mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					throw mockError;
				}
			});

			const promises = ackIds.map((ackId) => ackManager.nack(ackId));

			await expect(Promise.all(promises)).rejects.toThrow('Invalid ack ID: expired');

			for (const promise of promises) {
				await expect(promise).rejects.toThrow('Invalid ack ID: expired');
			}

			expect(nackSpy).toHaveBeenCalledTimes(2);
		});
	});

	function publishAndPullMessages(count: number) {
		const internalMessages = Array.from({ length: count }, (_, i) => ({
			id: `msg-${i}`,
			data: Buffer.from(`test ${i}`),
			attributes: {},
			publishTime: new PreciseDate(),
			orderingKey: undefined,
			deliveryAttempt: 1,
			length: 6,
		}));

		queue.publish(topicName, internalMessages);
		return queue.pull(subscriptionName, count);
	}
});
