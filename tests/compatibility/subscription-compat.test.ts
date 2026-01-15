import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import { Topic } from '../../src/topic';
import { Subscription } from '../../src/subscription';
import { Message } from '../../src/message';
import type { SubscriptionMetadata, SubscriptionOptions } from '../../src/types';

describe('Subscription API Compatibility', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'test-project' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	describe('Constructor and Properties', () => {
		test('has readonly name property (string)', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-1');
			const subscription = pubsub.subscription('sub-prop-sub-1');
			await topic.createSubscription('sub-prop-sub-1');

			expect(subscription.name).toBeDefined();
			expect(typeof subscription.name).toBe('string');
			expect(subscription.name).toContain('sub-prop-sub-1');
		});

		test('has readonly pubsub property', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-2');
			const subscription = pubsub.subscription('sub-prop-sub-2');
			await topic.createSubscription('sub-prop-sub-2');

			expect(subscription.pubsub).toBeDefined();
		});

		test('has topic property', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-3');
			const [subscription] = await topic.createSubscription('sub-prop-sub-3');

			expect(subscription.topic).toBeDefined();
		});

		test('has metadata property after get/create', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-4');
			const [subscription] = await topic.createSubscription('sub-prop-sub-4');
			await subscription.get();

			expect(subscription.metadata).toBeDefined();
			expect(typeof subscription.metadata).toBe('object');
		});

		test('has isOpen property (boolean)', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-5');
			const subscription = pubsub.subscription('sub-prop-sub-5');
			await topic.createSubscription('sub-prop-sub-5');

			expect(typeof subscription.isOpen).toBe('boolean');
			expect(subscription.isOpen).toBe(false);
		});

		test('has detached property (boolean)', async () => {
			const [topic] = await pubsub.createTopic('sub-prop-topic-6');
			const subscription = pubsub.subscription('sub-prop-sub-6');
			await topic.createSubscription('sub-prop-sub-6');

			expect(typeof subscription.detached).toBe('boolean');
		});
	});

	describe('Lifecycle Methods with Tuples', () => {
		test('create() returns [Subscription, SubscriptionMetadata] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-1');
			const newSub = pubsub.subscription('sub-create-tuple-sub');
			const result = await topic.createSubscription('sub-create-tuple-sub');

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			expect(result[0]).toBeInstanceOf(Subscription);
			expect(result[1]).toBeDefined();
		});

		test('create() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-2');
			const [sub, metadata] = await topic.createSubscription('sub-destructure-sub');

			expect(sub).toBeInstanceOf(Subscription);
			expect(metadata).toBeDefined();
			expect(metadata.name).toContain('sub-destructure-sub');
		});

		test('create() throws AlreadyExistsError with code 6 for duplicate', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-3');
			await topic.createSubscription('sub-duplicate-sub');

			try {
				await topic.createSubscription('sub-duplicate-sub');
				expect.unreachable('Should have thrown AlreadyExistsError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(6);
			}
		});

		test('get() returns [Subscription, SubscriptionMetadata] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-4');
			const [subscription] = await topic.createSubscription('sub-get-tuple-sub');

			const result = await subscription.get();

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			expect(result[0]).toBeInstanceOf(Subscription);
			expect(result[1]).toBeDefined();
		});

		test('get() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-5');
			const [subscription] = await topic.createSubscription('sub-get-destructure-sub');

			const [sub, metadata] = await subscription.get();

			expect(sub).toBeInstanceOf(Subscription);
			expect(metadata).toBeDefined();
			expect(metadata.name).toContain('sub-get-destructure-sub');
		});

		test('get() throws NotFoundError with code 5 for non-existent', async () => {
			const nonExistentSub = pubsub.subscription('sub-non-existent-get-sub');

			try {
				await nonExistentSub.get();
				expect.unreachable('Should have thrown NotFoundError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(5);
			}
		});

		test('exists() returns [boolean] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-6');
			const [subscription] = await topic.createSubscription('sub-exists-tuple-sub');

			const result = await subscription.exists();

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
			expect(typeof result[0]).toBe('boolean');
			expect(result[0]).toBe(true);
		});

		test('exists() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-7');
			const [subscription] = await topic.createSubscription('sub-exists-destructure-sub');

			const [exists] = await subscription.exists();

			expect(typeof exists).toBe('boolean');
			expect(exists).toBe(true);
		});

		test('exists() returns false for non-existent subscription', async () => {
			const nonExistentSub = pubsub.subscription('sub-non-existent-exists-sub');
			const [exists] = await nonExistentSub.exists();

			expect(exists).toBe(false);
		});

		test('delete() returns [unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-8');
			const [deleteSub] = await topic.createSubscription('sub-delete-sub');

			const result = await deleteSub.delete();

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
		});

		test('delete() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-9');
			const [deleteSub] = await topic.createSubscription('sub-delete-destructure-sub');

			const [response] = await deleteSub.delete();

			expect(response).toBeDefined();
		});

		test('delete() throws NotFoundError with code 5 for non-existent', async () => {
			const nonExistentSub = pubsub.subscription('sub-non-existent-delete-sub');

			try {
				await nonExistentSub.delete();
				expect.unreachable('Should have thrown NotFoundError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(5);
			}
		});

		test('getMetadata() returns [SubscriptionMetadata, unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-10');
			const [subscription] = await topic.createSubscription('sub-get-metadata-sub');

			const result = await subscription.getMetadata();

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			expect(result[0]).toBeDefined();
			expect(typeof result[0]).toBe('object');
		});

		test('getMetadata() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-11');
			const [subscription] = await topic.createSubscription('sub-get-metadata-destructure-sub');

			const [metadata, response] = await subscription.getMetadata();

			expect(metadata).toBeDefined();
			expect(metadata.name).toContain('sub-get-metadata-destructure-sub');
			expect(response).toBeDefined();
		});

		test('setMetadata() returns [SubscriptionMetadata, unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-12');
			const [subscription] = await topic.createSubscription('sub-set-metadata-sub');

			const result = await subscription.setMetadata({
				ackDeadlineSeconds: 20,
			});

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			expect(result[0]).toBeDefined();
			expect(typeof result[0]).toBe('object');
		});

		test('setMetadata() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-lifecycle-topic-13');
			const [subscription] = await topic.createSubscription('sub-set-metadata-destructure-sub');

			const [metadata, response] = await subscription.setMetadata({
				ackDeadlineSeconds: 30,
			});

			expect(metadata).toBeDefined();
			expect(metadata.ackDeadlineSeconds).toBe(30);
			expect(response).toBeDefined();
		});
	});

	describe('Event Type Safety', () => {
		test('message event listener accepts Message parameter', async (done) => {
			const [topic] = await pubsub.createTopic('sub-event-topic-1');
			const subscription = pubsub.subscription('sub-event-sub-1');
			await topic.createSubscription('sub-event-sub-1');

			subscription.on('message', (message: Message) => {
				expect(message).toBeInstanceOf(Message);
				expect(message.data).toBeInstanceOf(Buffer);
				expect(typeof message.id).toBe('string');
				expect(typeof message.ackId).toBe('string');
				subscription.close().then(() => done());
			});

			subscription.open();
			topic.publishMessage({ data: Buffer.from('test') });
		});

		test('error event listener accepts Error parameter', async (done) => {
			const [topic] = await pubsub.createTopic('sub-event-topic-2');
			const subscription = pubsub.subscription('sub-event-sub-2');
			await topic.createSubscription('sub-event-sub-2');

			subscription.on('error', (error: Error) => {
				expect(error).toBeInstanceOf(Error);
				subscription.close().then(() => done());
			});

			subscription.on('message', () => {
				throw new Error('Test error');
			});

			subscription.open();
			topic.publishMessage({ data: Buffer.from('test') });
		});

		test('close event listener has no parameters', async (done) => {
			const [topic] = await pubsub.createTopic('sub-event-topic-3');
			const subscription = pubsub.subscription('sub-event-sub-3');
			await topic.createSubscription('sub-event-sub-3');

			subscription.on('close', () => {
				expect(subscription.isOpen).toBe(false);
				done();
			});

			subscription.open();
			subscription.close();
		});

		test('once() method works for message event', async (done) => {
			const [topic] = await pubsub.createTopic('sub-event-topic-4');
			const subscription = pubsub.subscription('sub-event-sub-4');
			await topic.createSubscription('sub-event-sub-4');

			let messageCount = 0;

			subscription.once('message', (message: Message) => {
				messageCount++;
				expect(message).toBeInstanceOf(Message);

				setTimeout(() => {
					expect(messageCount).toBe(1);
					subscription.close().then(() => done());
				}, 50);
			});

			subscription.open();
			topic.publishMessage({ data: Buffer.from('test1') });
			topic.publishMessage({ data: Buffer.from('test2') });
		});
	});

	describe('Message Streaming and Flow Control', () => {
		test('open() starts message delivery', async (done) => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-1');
			const subscription = pubsub.subscription('sub-stream-sub-1');
			await topic.createSubscription('sub-stream-sub-1');

			subscription.on('message', (message: Message) => {
				expect(message).toBeInstanceOf(Message);
				subscription.close().then(() => done());
			});

			expect(subscription.isOpen).toBe(false);
			subscription.open();
			expect(subscription.isOpen).toBe(true);

			topic.publishMessage({ data: Buffer.from('test') });
		});

		test('close() stops message delivery and returns Promise<void>', async () => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-2');
			const subscription = pubsub.subscription('sub-stream-sub-2');
			await topic.createSubscription('sub-stream-sub-2');

			subscription.open();
			expect(subscription.isOpen).toBe(true);

			const result = await subscription.close();

			expect(result).toBeUndefined();
			expect(subscription.isOpen).toBe(false);
		});

		test('pause() pauses message delivery', async (done) => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-3');
			const subscription = pubsub.subscription('sub-stream-sub-3');
			await topic.createSubscription('sub-stream-sub-3');

			let messageCount = 0;

			subscription.on('message', () => {
				messageCount++;
				subscription.pause();

				setTimeout(() => {
					expect(messageCount).toBe(1);
					subscription.close().then(() => done());
				}, 50);
			});

			subscription.open();
			topic.publishMessage({ data: Buffer.from('test1') });
			topic.publishMessage({ data: Buffer.from('test2') });
		});

		test('resume() resumes message delivery after pause', async (done) => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-4');
			const subscription = pubsub.subscription('sub-stream-sub-4');
			await topic.createSubscription('sub-stream-sub-4');

			let messageCount = 0;

			subscription.on('message', (message: Message) => {
				messageCount++;
				message.ack();

				if (messageCount === 1) {
					subscription.pause();

					setTimeout(() => {
						subscription.resume();
					}, 20);
				} else if (messageCount === 2) {
					subscription.close().then(() => done());
				}
			});

			subscription.open();
			topic.publishMessage({ data: Buffer.from('test1') });
			topic.publishMessage({ data: Buffer.from('test2') });
		});

		test('pull() returns [Message[], unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-5');
			const subscription = pubsub.subscription('sub-stream-sub-5');
			await topic.createSubscription('sub-stream-sub-5');

			await topic.publishMessage({ data: Buffer.from('test1') });
			await topic.publishMessage({ data: Buffer.from('test2') });

			const result = await subscription.pull({ maxMessages: 2 });

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			expect(Array.isArray(result[0])).toBe(true);
			expect(result[0].length).toBeGreaterThan(0);
			expect(result[0][0]).toBeInstanceOf(Message);
		});

		test('pull() tuple can be destructured', async () => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-6');
			const subscription = pubsub.subscription('sub-stream-sub-6');
			await topic.createSubscription('sub-stream-sub-6');

			await topic.publishMessage({ data: Buffer.from('test') });

			const [messages, response] = await subscription.pull({ maxMessages: 1 });

			expect(Array.isArray(messages)).toBe(true);
			expect(messages.length).toBeGreaterThan(0);
			expect(messages[0]).toBeInstanceOf(Message);
			expect(response).toBeDefined();
		});

		test('pull() respects maxMessages option', async () => {
			const [topic] = await pubsub.createTopic('sub-stream-topic-7');
			const subscription = pubsub.subscription('sub-stream-sub-7');
			await topic.createSubscription('sub-stream-sub-7');

			await topic.publishMessage({ data: Buffer.from('test1') });
			await topic.publishMessage({ data: Buffer.from('test2') });
			await topic.publishMessage({ data: Buffer.from('test3') });

			const [messages] = await subscription.pull({ maxMessages: 2 });

			expect(messages.length).toBeLessThanOrEqual(2);
		});
	});

	describe('Configuration', () => {
		test('setOptions() accepts SubscriptionOptions', async () => {
			const [topic] = await pubsub.createTopic('sub-config-topic-1');
			const [subscription] = await topic.createSubscription('sub-config-sub-1');

			const options: SubscriptionOptions = {
				flowControl: {
					maxMessages: 500,
					maxBytes: 50 * 1024 * 1024,
				},
				ackDeadline: 20,
			};

			const result = subscription.setOptions(options);

			expect(result).toBeUndefined();
		});

		test('flowControl defaults are set correctly', () => {
			const newSub = pubsub.subscription('flow-control-sub', {
				flowControl: {
					maxMessages: 1000,
					maxBytes: 100 * 1024 * 1024,
				},
			});

			expect(newSub).toBeDefined();
		});
	});

	describe('Message Acknowledgment', () => {
		test('acknowledge() accepts ackIds array and returns Promise<void>', async () => {
			const [topic] = await pubsub.createTopic('sub-ack-topic-1');
			const subscription = pubsub.subscription('sub-ack-sub-1');
			await topic.createSubscription('sub-ack-sub-1');

			await topic.publishMessage({ data: Buffer.from('test1') });
			await topic.publishMessage({ data: Buffer.from('test2') });

			const [messages] = await subscription.pull({ maxMessages: 2 });
			const ackIds = messages.map((m) => m.ackId);

			const result = await subscription.acknowledge({ ackIds });

			expect(result).toBeUndefined();
		});

		test('modifyAckDeadline() accepts ackIds and ackDeadlineSeconds, returns Promise<void>', async () => {
			const [topic] = await pubsub.createTopic('sub-ack-topic-2');
			const subscription = pubsub.subscription('sub-ack-sub-2');
			await topic.createSubscription('sub-ack-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });

			const [messages] = await subscription.pull({ maxMessages: 1 });
			const ackIds = messages.map((m) => m.ackId);

			const result = await subscription.modifyAckDeadline({
				ackIds,
				ackDeadlineSeconds: 30,
			});

			expect(result).toBeUndefined();
		});
	});

	describe('Resource Name Formatting', () => {
		test('accepts short subscription names', async () => {
			const [topic] = await pubsub.createTopic('sub-format-topic-1');
			const [sub] = await topic.createSubscription('sub-short-name');
			expect(sub.name).toBe('projects/test-project/subscriptions/sub-short-name');
		});

		test('accepts full subscription resource names', async () => {
			const [topic] = await pubsub.createTopic('sub-format-topic-2');
			const fullName = 'projects/test-project/subscriptions/sub-full-name';
			const [sub] = await topic.createSubscription(fullName);
			expect(sub.name).toBe(fullName);
		});

		test('normalizes subscription names to full format', () => {
			const sub = pubsub.subscription('sub-normalize-name');
			expect(sub.name).toBe('projects/test-project/subscriptions/sub-normalize-name');
		});
	});

	describe('Type Compatibility', () => {
		test('subscription() factory returns Subscription type', () => {
			const sub: Subscription = pubsub.subscription('sub-type-test-sub');
			expect(sub).toBeInstanceOf(Subscription);
		});

		test('tuple destructuring works with TypeScript types', async () => {
			const [topic] = await pubsub.createTopic('sub-type-topic-1');
			const [sub, metadata]: [Subscription, SubscriptionMetadata] =
				await topic.createSubscription('sub-tuple-type-sub');

			expect(sub).toBeInstanceOf(Subscription);
			expect(metadata).toBeDefined();
			expect(typeof metadata).toBe('object');
		});

		test('get() tuple destructuring works with types', async () => {
			const [topic] = await pubsub.createTopic('sub-type-topic-2');
			const subscription = pubsub.subscription('sub-get-type-sub');
			await topic.createSubscription('sub-get-type-sub');

			const [sub, metadata]: [Subscription, SubscriptionMetadata] =
				await subscription.get();

			expect(sub).toBeInstanceOf(Subscription);
			expect(metadata).toBeDefined();
		});

		test('pull() tuple destructuring works with types', async () => {
			const [topic] = await pubsub.createTopic('sub-type-topic-3');
			const subscription = pubsub.subscription('sub-pull-type-sub');
			await topic.createSubscription('sub-pull-type-sub');

			await topic.publishMessage({ data: Buffer.from('test') });

			const [messages, response]: [Message[], unknown] = await subscription.pull({
				maxMessages: 1,
			});

			expect(Array.isArray(messages)).toBe(true);
			expect(response).toBeDefined();
		});
	});

	describe('Snapshot and Push Config Methods', () => {
		test('snapshot() returns Snapshot instance', async () => {
			const [topic] = await pubsub.createTopic('sub-snapshot-topic-1');
			const subscription = pubsub.subscription('sub-snapshot-sub-1');
			await topic.createSubscription('sub-snapshot-sub-1');

			const snapshot = subscription.snapshot('test-snapshot');
			expect(snapshot).toBeDefined();
		});

		test('createSnapshot() returns [Snapshot, SnapshotMetadata] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-snapshot-topic-2');
			const subscription = pubsub.subscription('sub-snapshot-sub-2');
			await topic.createSubscription('sub-snapshot-sub-2');

			const result = await subscription.createSnapshot('snapshot-tuple');

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
		});

		test('seek() returns [unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-snapshot-topic-3');
			const subscription = pubsub.subscription('sub-snapshot-sub-3');
			await topic.createSubscription('sub-snapshot-sub-3');

			const result = await subscription.seek('test-snapshot');

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
		});

		test('modifyPushConfig() returns [unknown] tuple', async () => {
			const [topic] = await pubsub.createTopic('sub-snapshot-topic-4');
			const subscription = pubsub.subscription('sub-snapshot-sub-4');
			await topic.createSubscription('sub-snapshot-sub-4');

			const result = await subscription.modifyPushConfig({
				pushEndpoint: 'https://example.com/push',
			});

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
		});
	});

	describe('Error Handling', () => {
		test('getMetadata() throws NotFoundError with code 5 for non-existent', async () => {
			const nonExistentSub = pubsub.subscription('sub-non-existent-metadata-sub');

			try {
				await nonExistentSub.getMetadata();
				expect.unreachable('Should have thrown NotFoundError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(5);
			}
		});

		test('setMetadata() throws NotFoundError with code 5 for non-existent', async () => {
			const nonExistentSub = pubsub.subscription('sub-non-existent-setmeta-sub');

			try {
				await nonExistentSub.setMetadata({ ackDeadlineSeconds: 20 });
				expect.unreachable('Should have thrown NotFoundError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(5);
			}
		});
	});
});
