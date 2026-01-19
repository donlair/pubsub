/**
 * Tests for Subscriber components (MessageStream, FlowControl, LeaseManager).
 * Reference: specs/06-subscriber.md
 *
 * These are unit tests for the subscriber components in isolation.
 * Full integration tests with Topic/Subscription will come in Phase 9.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { EventEmitter } from 'node:events';
import { MessageQueue } from '../../src/internal/message-queue';
import { MessageStream } from '../../src/subscriber/message-stream';
import { SubscriberFlowControl } from '../../src/subscriber/flow-control';
import { LeaseManager } from '../../src/subscriber/lease-manager';
import { Message } from '../../src/message';
import { PreciseDate } from '../../src/utils/precise-date';
import { InvalidArgumentError } from '../../src/types/errors';

describe('SubscriberFlowControl', () => {
	test('AC-002: respects maxMessages limit', () => {
		const fc = new SubscriberFlowControl({ maxMessages: 2 });

		expect(fc.canAccept(100)).toBe(true);
		fc.addMessage(100);

		expect(fc.canAccept(100)).toBe(true);
		fc.addMessage(100);

		expect(fc.canAccept(100)).toBe(false);

		fc.removeMessage(100);
		expect(fc.canAccept(100)).toBe(true);
	});

	test('AC-003: respects maxBytes limit', () => {
		const fc = new SubscriberFlowControl({ maxBytes: 1024 });

		expect(fc.canAccept(512)).toBe(true);
		fc.addMessage(512);

		expect(fc.canAccept(512)).toBe(true);
		fc.addMessage(512);

		expect(fc.canAccept(512)).toBe(false);

		fc.removeMessage(512);
		expect(fc.canAccept(512)).toBe(true);
	});

	test('AC-010: allowExcessMessages permits batch completion', () => {
		const fc = new SubscriberFlowControl({
			maxMessages: 2,
			allowExcessMessages: true,
		});

		fc.startBatchPull();

		expect(fc.canAccept(100)).toBe(true);
		fc.addMessage(100);

		expect(fc.canAccept(100)).toBe(true);
		fc.addMessage(100);

		expect(fc.canAccept(100)).toBe(true);
		fc.addMessage(100);

		fc.endBatchPull();

		expect(fc.canAccept(100)).toBe(false);
	});

	test('tracks in-flight messages and bytes', () => {
		const fc = new SubscriberFlowControl();

		fc.addMessage(100);
		fc.addMessage(200);

		expect(fc.getInFlightMessages()).toBe(2);
		expect(fc.getInFlightBytes()).toBe(300);

		fc.removeMessage(100);
		expect(fc.getInFlightMessages()).toBe(1);
		expect(fc.getInFlightBytes()).toBe(200);
	});
});

describe('LeaseManager', () => {
	let leaseManager: LeaseManager;

	beforeEach(() => {
		leaseManager = new LeaseManager({
			minAckDeadline: 1,
			maxAckDeadline: 600,
			maxExtensionTime: 3600,
		});
	});

	afterEach(() => {
		leaseManager.clear();
	});

	test('AC-004: tracks message leases', () => {
		const subscription = { name: 'test-sub' };
		const message = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			subscription,
		);

		leaseManager.addLease(message);

		leaseManager.removeLease(message.ackId);
	});

	test('extends lease deadline', () => {
		const subscription = { name: 'test-sub' };
		const message = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			subscription,
		);

		leaseManager.addLease(message);
		leaseManager.extendDeadline(message.ackId, 30);
		leaseManager.removeLease(message.ackId);
	});

	test('clears all leases', () => {
		const subscription = { name: 'test-sub' };
		const message1 = new Message(
			'msg-1',
			'ack-1',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			subscription,
		);
		const message2 = new Message(
			'msg-2',
			'ack-2',
			Buffer.from('test'),
			{},
			new PreciseDate(),
			subscription,
		);

		leaseManager.addLease(message1);
		leaseManager.addLease(message2);

		leaseManager.clear();
	});
});

describe('MessageStream', () => {
	let messageQueue: MessageQueue;
	let subscription: EventEmitter & {
		name: string;
		isOpen: boolean;
		metadata?: { enableMessageOrdering?: boolean };
	};
	let testCounter = 0;

	beforeEach(() => {
		testCounter++;
		messageQueue = MessageQueue.getInstance();
		subscription = Object.assign(new EventEmitter(), {
			name: `test-sub-${testCounter}`,
			isOpen: false,
		});

		messageQueue.registerTopic(`test-topic-${testCounter}`);
		messageQueue.registerSubscription(
			`test-sub-${testCounter}`,
			`test-topic-${testCounter}`,
		);
	});

	afterEach(async () => {
		messageQueue.unregisterTopic(`test-topic-${testCounter}`);
		messageQueue.unregisterSubscription(`test-sub-${testCounter}`);
	});

	test('AC-001: Basic streaming pull', async () => {
		const stream = new MessageStream(subscription, {});
		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
			{
				id: 'msg-1',
				data: Buffer.from('msg1'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
			{
				id: 'msg-2',
				data: Buffer.from('msg2'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(2);

		await stream.stop();
	});

	test('AC-002: Flow control maxMessages', async () => {
		const stream = new MessageStream(subscription, {
			flowControl: { maxMessages: 2 },
			closeOptions: { behavior: 'NACK' },
		});
		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
		});

		stream.start();

		for (let i = 0; i < 5; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 4,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(2);

		receivedMessages[0]!.ack();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(3);

		await stream.stop();
	});

	test('AC-003: Flow control maxBytes', async () => {
		const stream = new MessageStream(subscription, {
			flowControl: { maxBytes: 1024 },
			closeOptions: { behavior: 'NACK' },
		});
		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
		});

		stream.start();

		const data = Buffer.alloc(512);
		messageQueue.publish(`test-topic-${testCounter}`, [
			{
				id: 'msg-1',
				data,
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 512,
			},
			{
				id: 'msg-2',
				data,
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 512,
			},
			{
				id: 'msg-3',
				data,
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 512,
			},
		]);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(2);

		receivedMessages[0]!.ack();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(3);

		await stream.stop();
	});

	test('AC-005: Message ordering sequential delivery', async () => {
		subscription.metadata = { enableMessageOrdering: true };
		const stream = new MessageStream(subscription, {});
		const receivedOrder: string[] = [];
		const processingTimes: number[] = [];

		subscription.on('message', async (message: Message) => {
			const startTime = Date.now();
			receivedOrder.push(message.data.toString());

			await new Promise((resolve) => setTimeout(resolve, 30));

			processingTimes.push(Date.now() - startTime);
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
			{
				id: 'msg-1',
				data: Buffer.from('first'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: 'user-123',
				deliveryAttempt: 1,
				length: 5,
			},
			{
				id: 'msg-2',
				data: Buffer.from('second'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: 'user-123',
				deliveryAttempt: 1,
				length: 6,
			},
			{
				id: 'msg-3',
				data: Buffer.from('third'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: 'user-123',
				deliveryAttempt: 1,
				length: 5,
			},
		]);

		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(receivedOrder).toEqual(['first', 'second', 'third']);
		expect(processingTimes.every((t) => t >= 30)).toBe(true);

		await stream.stop();
	});

	test('AC-006: Pause and resume', async () => {
		const stream = new MessageStream(subscription, {});
		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
			{
				id: 'msg-1',
				data: Buffer.from('msg1'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(receivedMessages.length).toBe(1);

		stream.pause();

		messageQueue.publish(`test-topic-${testCounter}`, [
			{
				id: 'msg-2',
				data: Buffer.from('msg2'),
				attributes: {},
				publishTime: new PreciseDate(),
				orderingKey: undefined,
				deliveryAttempt: 1,
				length: 4,
			},
		]);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(receivedMessages.length).toBe(1);

		stream.resume();

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(receivedMessages.length).toBe(2);

		await stream.stop();
	});

	test('AC-007: Stop waits for in-flight', async () => {
		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'WAIT' },
		});
		let processingComplete = false;

		subscription.on('message', async (message: Message) => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			processingComplete = true;
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
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

		await new Promise((resolve) => setTimeout(resolve, 10));

		const stopPromise = stream.stop();
		await stopPromise;

		expect(processingComplete).toBe(true);
	});

	test('AC-008: Error event on subscription not found', async () => {
		const badSubscription = Object.assign(new EventEmitter(), {
			name: 'non-existent-sub',
			isOpen: false,
		});

		const stream = new MessageStream(badSubscription, {});
		const errors: Error[] = [];

		badSubscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(errors.length).toBeGreaterThan(0);

		await stream.stop();
	});

	test('AC-009: Multiple concurrent messages', async () => {
		const stream = new MessageStream(subscription, {
			flowControl: { maxMessages: 10 },
		});
		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			setTimeout(() => message.ack(), 50);
		});

		stream.start();

		for (let i = 0; i < 10; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 4,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(10);

		await stream.stop();
	});

	test('setOptions updates configuration', async () => {
		const stream = new MessageStream(subscription, {
			flowControl: { maxMessages: 10 },
		});

		stream.setOptions({
			flowControl: { maxMessages: 5 },
		});

		await stream.stop();
	});

	test('Stop respects closeOptions timeout (number format)', async () => {
		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'WAIT', timeout: 1 },
		});

		subscription.on('message', async (message: Message) => {
			await new Promise((resolve) => setTimeout(resolve, 3000));
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
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

		await new Promise((resolve) => setTimeout(resolve, 10));

		const start = Date.now();
		await stream.stop();
		const elapsed = (Date.now() - start) / 1000;

		expect(elapsed).toBeLessThan(2);
		expect(elapsed).toBeGreaterThan(0.8);
	}, { timeout: 5000 });

	test('Stop respects closeOptions timeout (Duration object format)', async () => {
		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'WAIT', timeout: { seconds: 2 } },
		});

		subscription.on('message', async (message: Message) => {
			await new Promise((resolve) => setTimeout(resolve, 5000));
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
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

		await new Promise((resolve) => setTimeout(resolve, 10));

		const start = Date.now();
		await stream.stop();
		const elapsed = (Date.now() - start) / 1000;

		expect(elapsed).toBeLessThan(3);
		expect(elapsed).toBeGreaterThan(1.8);
	}, { timeout: 6000 });

	test('Stop defaults to maxExtensionTime when timeout not specified', async () => {
		const stream = new MessageStream(subscription, {
			maxExtensionTime: 2,
			closeOptions: { behavior: 'WAIT' },
		});

		subscription.on('message', async (message: Message) => {
			await new Promise((resolve) => setTimeout(resolve, 5000));
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
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

		await new Promise((resolve) => setTimeout(resolve, 10));

		const start = Date.now();
		await stream.stop();
		const elapsed = (Date.now() - start) / 1000;

		expect(elapsed).toBeLessThan(3);
		expect(elapsed).toBeGreaterThan(1.8);
	}, { timeout: 6000 });

	test('Stop respects closeOptions timeout with Duration object (minutes field)', async () => {
		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'WAIT', timeout: { minutes: 1 } },
		});

		subscription.on('message', async (message: Message) => {
			await new Promise((resolve) => setTimeout(resolve, 3000));
			message.ack();
		});

		stream.start();

		messageQueue.publish(`test-topic-${testCounter}`, [
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

		await new Promise((resolve) => setTimeout(resolve, 10));

		const start = Date.now();
		await stream.stop();
		const elapsed = (Date.now() - start) / 1000;

		expect(elapsed).toBeLessThan(62);
		expect(elapsed).toBeGreaterThan(0);
	}, { timeout: 65000 });

	test('Stop completes immediately if no in-flight messages', async () => {
		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'WAIT', timeout: 60 },
		});

		stream.start();

		const start = Date.now();
		await stream.stop();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(100);
	});

	test('BR-010: Uses default maxStreams of 5', async () => {
		const stream = new MessageStream(subscription, {});
		const receivedMessages: Message[] = [];
		const pullTimestamps: number[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			pullTimestamps.push(Date.now());
			message.ack();
		});

		stream.start();

		for (let i = 0; i < 20; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(receivedMessages.length).toBe(20);

		await stream.stop();
	});

	test('BR-010: Creates multiple concurrent pull streams', async () => {
		const stream = new MessageStream(subscription, {
			streamingOptions: { maxStreams: 3, pullInterval: 20 },
		});

		let maxConcurrent = 0;
		let currentConcurrent = 0;

		subscription.on('message', async (message: Message) => {
			currentConcurrent++;
			maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

			await new Promise((resolve) => setTimeout(resolve, 30));

			currentConcurrent--;
			message.ack();
		});

		stream.start();

		for (let i = 0; i < 30; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(maxConcurrent).toBeGreaterThan(1);

		await stream.stop();
	}, { timeout: 2000 });

	test('BR-010: Higher maxStreams increases throughput', async () => {
		const singleStreamMessages: Message[] = [];
		const multiStreamMessages: Message[] = [];

		const singleStream = new MessageStream(subscription, {
			streamingOptions: { maxStreams: 1, pullInterval: 100, maxPullSize: 10 },
		});

		subscription.on('message', (message: Message) => {
			singleStreamMessages.push(message);
			message.ack();
		});

		singleStream.start();

		for (let i = 0; i < 200; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-single-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 150));
		const singleThroughput = singleStreamMessages.length;

		await singleStream.stop();

		testCounter++;
		messageQueue.registerTopic(`test-topic-${testCounter}`);
		messageQueue.registerSubscription(
			`test-sub-${testCounter}`,
			`test-topic-${testCounter}`,
		);

		const multiStreamSubscription = Object.assign(new EventEmitter(), {
			name: `test-sub-${testCounter}`,
			isOpen: false,
		});

		const multiStream = new MessageStream(multiStreamSubscription, {
			streamingOptions: { maxStreams: 5, pullInterval: 100, maxPullSize: 10 },
		});

		multiStreamSubscription.on('message', (message: Message) => {
			multiStreamMessages.push(message);
			message.ack();
		});

		multiStream.start();

		for (let i = 0; i < 200; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-multi-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 150));
		const multiThroughput = multiStreamMessages.length;

		await multiStream.stop();

		messageQueue.unregisterTopic(`test-topic-${testCounter}`);
		messageQueue.unregisterSubscription(`test-sub-${testCounter}`);

		expect(multiThroughput).toBeGreaterThan(singleThroughput);
	}, { timeout: 3000 });

	test('BR-010: All streams respect shared flow control', async () => {
		const stream = new MessageStream(subscription, {
			flowControl: { maxMessages: 5 },
			streamingOptions: { maxStreams: 3 },
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
		});

		stream.start();

		for (let i = 0; i < 20; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(receivedMessages.length).toBe(5);

		receivedMessages[0]?.ack();
		receivedMessages[1]?.ack();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(7);

		await stream.stop();
	});

	test('BR-010: Stops all streams on stop()', async () => {
		const stream = new MessageStream(subscription, {
			streamingOptions: { maxStreams: 5 },
		});

		const receivedMessages: Message[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.ack();
		});

		stream.start();

		for (let i = 0; i < 10; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 50));

		const countBeforeStop = receivedMessages.length;

		await stream.stop();

		for (let i = 0; i < 10; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-after-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBe(countBeforeStop);
	});

	test('Uses default timeout of 5 minutes when not specified', async () => {
		const stream = new MessageStream(subscription, {});

		expect(stream['timeoutMs']).toBe(300000);

		await stream.stop();
	});

	test('Enforces custom timeout', async () => {
		const stream = new MessageStream(subscription, {
			streamingOptions: { timeout: 100 },
		});

		const errors: Error[] = [];
		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		await new Promise((resolve) => setTimeout(resolve, 120));

		expect(errors.length).toBe(1);
		expect(errors[0]?.message).toContain('timeout');
		expect(stream['isRunning']).toBe(false);
	}, { timeout: 1000 });

	test('Clears timeout when stream stops before timeout', async () => {
		const stream = new MessageStream(subscription, {
			streamingOptions: { timeout: 200 },
		});

		const errors: Error[] = [];
		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		await new Promise((resolve) => setTimeout(resolve, 50));

		await stream.stop();

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(errors.length).toBe(0);
	}, { timeout: 1000 });

	test('Does not timeout if explicitly set to 0', async () => {
		const stream = new MessageStream(subscription, {
			streamingOptions: { timeout: 0 },
		});

		const errors: Error[] = [];
		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(errors.length).toBe(0);
		expect(stream['isRunning']).toBe(true);

		await stream.stop();
	}, { timeout: 1000 });

	test('Logs error when stop() fails during timeout', async () => {
		const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

		const stream = new MessageStream(subscription, {
			streamingOptions: { timeout: 100 },
		});

		const errors: Error[] = [];
		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		const originalStop = stream.stop.bind(stream);
		stream.stop = async () => {
			await originalStop();
			throw new Error('Stop failed intentionally');
		};

		stream.start();

		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(errors.length).toBe(1);
		expect(errors[0]?.message).toContain('timeout');

		expect(consoleSpy).toHaveBeenCalledWith(
			'Failed to stop stream after timeout:',
			expect.objectContaining({ message: 'Stop failed intentionally' })
		);

		consoleSpy.mockRestore();
	}, { timeout: 1000 });

	test('useLegacyFlowControl=true is accepted (API compatibility)', async () => {
		const stream = new MessageStream(subscription, {
			useLegacyFlowControl: true,
			flowControl: { maxMessages: 3 },
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];
		const errors: Error[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
		});

		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		for (let i = 0; i < 10; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(errors.length).toBe(0);
		expect(receivedMessages.length).toBe(3);

		await stream.stop();
	});

	test('useLegacyFlowControl=false works (default behavior)', async () => {
		const stream = new MessageStream(subscription, {
			useLegacyFlowControl: false,
			flowControl: { maxMessages: 3 },
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];
		const errors: Error[] = [];

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
		});

		subscription.on('error', (error: Error) => {
			errors.push(error);
		});

		stream.start();

		for (let i = 0; i < 10; i++) {
			messageQueue.publish(`test-topic-${testCounter}`, [
				{
					id: `msg-${i}`,
					data: Buffer.from(`msg${i}`),
					attributes: {},
					publishTime: new PreciseDate(),
					orderingKey: undefined,
					deliveryAttempt: 1,
					length: 5,
				},
			]);
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(errors.length).toBe(0);
		expect(receivedMessages.length).toBe(3);

		await stream.stop();
	});

	test('stop() with NACK ignores InvalidArgumentError during cleanup', async () => {
		const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];
		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.nack = () => {
				throw new InvalidArgumentError('Invalid ack ID: expired-lease');
			};
		});

		stream.start();

		const msg = {
			id: 'msg-1',
			data: Buffer.from('test'),
			attributes: {},
			publishTime: new PreciseDate(),
			orderingKey: undefined,
			deliveryAttempt: 1,
			length: 4,
		};

		messageQueue.publish(`test-topic-${testCounter}`, [msg]);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBeGreaterThan(0);

		await stream.stop();

		expect(consoleSpy).not.toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	test('stop() with NACK logs non-InvalidArgumentError errors during cleanup', async () => {
		const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];
		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.nack = () => {
				throw new Error('Network error during NACK');
			};
		});

		stream.start();

		const msg = {
			id: 'msg-1',
			data: Buffer.from('test'),
			attributes: {},
			publishTime: new PreciseDate(),
			orderingKey: undefined,
			deliveryAttempt: 1,
			length: 4,
		};

		messageQueue.publish(`test-topic-${testCounter}`, [msg]);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBeGreaterThan(0);

		await stream.stop();

		expect(consoleSpy).toHaveBeenCalledWith(
			'Unexpected error during cleanup NACK:',
			expect.objectContaining({ message: 'Network error during NACK' })
		);

		consoleSpy.mockRestore();
	});

	test('stop() with NACK logs InternalError during cleanup', async () => {
		const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

		const stream = new MessageStream(subscription, {
			closeOptions: { behavior: 'NACK' },
		});

		const receivedMessages: Message[] = [];
		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			message.nack = () => {
				throw new Error('Unexpected internal error');
			};
		});

		stream.start();

		const msg = {
			id: 'msg-1',
			data: Buffer.from('test'),
			attributes: {},
			publishTime: new PreciseDate(),
			orderingKey: undefined,
			deliveryAttempt: 1,
			length: 4,
		};

		messageQueue.publish(`test-topic-${testCounter}`, [msg]);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(receivedMessages.length).toBeGreaterThan(0);

		await stream.stop();

		expect(consoleSpy).toHaveBeenCalledWith(
			'Unexpected error during cleanup NACK:',
			expect.objectContaining({ message: 'Unexpected internal error' })
		);

		consoleSpy.mockRestore();
	});

});
