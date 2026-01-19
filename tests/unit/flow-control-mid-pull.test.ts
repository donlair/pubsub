/**
 * Tests for allowExcessMessages mid-pull batch completion behavior.
 * Reference: specs/06-subscriber.md BR-004
 *
 * These tests verify that when allowExcessMessages is true, a batch that is
 * currently being pulled is allowed to complete even if it exceeds limits.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';

describe('allowExcessMessages Mid-Pull Batch Completion', () => {
	let pubsub: PubSub;

	beforeEach(async () => {
		pubsub = new PubSub({ projectId: 'test-project' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	test('BR-004: allows batch completion when limit hit mid-pull', async () => {
		const topicName = 'test-topic-mid-pull';
		const subName = 'test-sub-mid-pull';

		const [topic] = await pubsub.createTopic(topicName);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			flowControl: {
				maxMessages: 5,
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

		for (let i = 0; i < 10; i++) {
			await topic.publishMessage({
				data: Buffer.from(`Message ${i}`),
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(receivedMessages.length).toBeGreaterThan(5);
		expect(receivedMessages.length).toBeLessThanOrEqual(10);

		for (const message of receivedMessages) {
			message.ack();
		}

		await subscription.close();
	});

	test('BR-004: allows full batch when allowExcessMessages=true', async () => {
		const topicName = 'test-topic-full-batch';
		const subName = 'test-sub-full-batch';

		const [topic] = await pubsub.createTopic(topicName);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			flowControl: {
				maxMessages: 3,
				allowExcessMessages: true,
			},
		});

		const receivedMessages: Message[] = [];
		let deliveryComplete = false;

		subscription.on('message', (message: Message) => {
			receivedMessages.push(message);
			if (receivedMessages.length === 10) {
				deliveryComplete = true;
			}
		});

		subscription.on('error', (error: Error) => {
			throw error;
		});

		subscription.open();

		for (let i = 0; i < 10; i++) {
			await topic.publishMessage({
				data: Buffer.from(`Message ${i}`),
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(receivedMessages.length).toBeGreaterThanOrEqual(3);
		expect(deliveryComplete).toBe(true);

		for (const message of receivedMessages) {
			message.ack();
		}

		await subscription.close();
	});

	test('BR-004: without allowExcessMessages, strictly enforces limit', async () => {
		const topicName = 'test-topic-strict-limit';
		const subName = 'test-sub-strict-limit';

		const [topic] = await pubsub.createTopic(topicName);

		const [subscription] = await pubsub.createSubscription(topicName, subName, {
			flowControl: {
				maxMessages: 3,
				allowExcessMessages: false,
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

		for (let i = 0; i < 10; i++) {
			await topic.publishMessage({
				data: Buffer.from(`Message ${i}`),
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(receivedMessages.length).toBeLessThanOrEqual(3);

		for (const message of receivedMessages) {
			message.ack();
		}

		await subscription.close();
	});
});
