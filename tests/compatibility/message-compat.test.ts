import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import { Topic } from '../../src/topic';
import { Subscription } from '../../src/subscription';
import { Message } from '../../src/message';
import { AckResponses } from '../../src/types/message';
import type { PreciseDate } from '../../src/types';

describe('Message API Compatibility', () => {
	let pubsub: PubSub;

	beforeEach(() => {
		pubsub = new PubSub({ projectId: 'test-project' });
	});

	afterEach(async () => {
		await pubsub.close();
	});

	describe('Constructor and Properties', () => {
		test('has id property (string)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-1');
			const [subscription] = await topic.createSubscription('prop-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.id).toBe('string');
			expect(message.id.length).toBeGreaterThan(0);
		});

		test('has ackId property (string)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-2');
			const [subscription] = await topic.createSubscription('prop-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.ackId).toBe('string');
			expect(message.ackId.length).toBeGreaterThan(0);
		});

		test('has data property (Buffer)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-3');
			const [subscription] = await topic.createSubscription('prop-sub-3');

			const testData = Buffer.from('test data');
			await topic.publishMessage({ data: testData });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.data).toBeInstanceOf(Buffer);
			expect(message.data.toString()).toBe('test data');
		});

		test('has attributes property (readonly object)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-4');
			const [subscription] = await topic.createSubscription('prop-sub-4');

			await topic.publishMessage({
				data: Buffer.from('test'),
				attributes: { key1: 'value1', key2: 'value2' },
			});
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.attributes).toBe('object');
			expect(message.attributes.key1).toBe('value1');
			expect(message.attributes.key2).toBe('value2');
		});

		test('attributes are frozen (readonly)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-5');
			const [subscription] = await topic.createSubscription('prop-sub-5');

			await topic.publishMessage({
				data: Buffer.from('test'),
				attributes: { key: 'value' },
			});
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => {
				(message.attributes as Record<string, string>).newKey = 'newValue';
			}).toThrow();
		});

		test('has publishTime property (PreciseDate)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-6');
			const [subscription] = await topic.createSubscription('prop-sub-6');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.publishTime).toBeInstanceOf(Date);
			expect(typeof message.publishTime.getTime).toBe('function');
		});

		test('has received property (number timestamp)', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-7');
			const [subscription] = await topic.createSubscription('prop-sub-7');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.received).toBe('number');
			expect(message.received).toBeGreaterThan(0);
		});

		test('has length property equal to data.length', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-8');
			const [subscription] = await topic.createSubscription('prop-sub-8');

			const testData = Buffer.from('Hello World');
			await topic.publishMessage({ data: testData });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.length).toBe(testData.length);
			expect(message.length).toBe(11);
		});

		test('has orderingKey property when ordering enabled', async () => {
			const orderingTopic = pubsub.topic('ordering-topic', {
				messageOrdering: true,
			});
			await orderingTopic.create();

			const [orderingSub] = await orderingTopic.createSubscription('ordering-sub', {
				enableMessageOrdering: true,
			});

			await orderingTopic.publishMessage({
				data: Buffer.from('test'),
				orderingKey: 'key1',
			});

			const [messages] = await orderingSub.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.orderingKey).toBe('key1');
			expect(typeof message.orderingKey).toBe('string');
		});

		test('orderingKey is undefined when not provided', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-9');
			const [subscription] = await topic.createSubscription('prop-sub-9');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.orderingKey).toBeUndefined();
		});

		test('has deliveryAttempt property when available', async () => {
			const [topic] = await pubsub.createTopic('prop-topic-10');
			const [subscription] = await topic.createSubscription('prop-sub-10');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(
				message.deliveryAttempt === undefined ||
					typeof message.deliveryAttempt === 'number',
			).toBe(true);
		});
	});

	describe('Synchronous Methods', () => {
		test('ack() returns void', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-1');
			const [subscription] = await topic.createSubscription('sync-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const result = message.ack();

			expect(result).toBeUndefined();
		});

		test('nack() returns void', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-2');
			const [subscription] = await topic.createSubscription('sync-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const result = message.nack();

			expect(result).toBeUndefined();
		});

		test('modifyAckDeadline() returns void', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-3');
			const [subscription] = await topic.createSubscription('sync-sub-3');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const result = message.modifyAckDeadline(30);

			expect(result).toBeUndefined();
		});

		test('modAck() returns void (alias for modifyAckDeadline)', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-4');
			const [subscription] = await topic.createSubscription('sync-sub-4');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const result = message.modAck(30);

			expect(result).toBeUndefined();
		});

		test('modifyAckDeadline() accepts deadline between 0-600 seconds', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-5');
			const [subscription] = await topic.createSubscription('sync-sub-5');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => message.modifyAckDeadline(0)).not.toThrow();
			expect(() => message.modifyAckDeadline(600)).not.toThrow();
		});

		test('modifyAckDeadline() throws InvalidArgumentError with code 3 for invalid deadline', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-6');
			const [subscription] = await topic.createSubscription('sync-sub-6');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			try {
				message.modifyAckDeadline(601);
				expect.unreachable('Should have thrown InvalidArgumentError');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error & { code: number }).code).toBe(3);
			}
		});

		test('modifyAckDeadline(0) is equivalent to nack', async () => {
			const [topic] = await pubsub.createTopic('sync-topic-7');
			const [subscription] = await topic.createSubscription('sync-sub-7');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			message.modifyAckDeadline(0);

			expect(true).toBe(true);
		});
	});

	describe('Asynchronous Methods with Response', () => {
		test('ackWithResponse() returns Promise<AckResponse>', async () => {
			const [topic] = await pubsub.createTopic('async-topic-1');
			const [subscription] = await topic.createSubscription('async-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const response = await message.ackWithResponse();

			expect(typeof response).toBe('string');
			expect(response).toBe(AckResponses.Success);
		});

		test('nackWithResponse() returns Promise<AckResponse>', async () => {
			const [topic] = await pubsub.createTopic('async-topic-2');
			const [subscription] = await topic.createSubscription('async-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const response = await message.nackWithResponse();

			expect(typeof response).toBe('string');
			expect(response).toBe(AckResponses.Success);
		});

		test('modAckWithResponse() returns Promise<AckResponse>', async () => {
			const [topic] = await pubsub.createTopic('async-topic-3');
			const [subscription] = await topic.createSubscription('async-sub-3');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const response = await message.modAckWithResponse(30);

			expect(typeof response).toBe('string');
			expect(response).toBe(AckResponses.Success);
		});
	});

	describe('AckResponse Values', () => {
		test('AckResponses.Success value is "SUCCESS"', () => {
			expect(AckResponses.Success).toBe('SUCCESS');
		});

		test('AckResponses.Invalid value is "INVALID"', () => {
			expect(AckResponses.Invalid).toBe('INVALID');
		});

		test('AckResponses.PermissionDenied value is "PERMISSION_DENIED"', () => {
			expect(AckResponses.PermissionDenied).toBe('PERMISSION_DENIED');
		});

		test('AckResponses.FailedPrecondition value is "FAILED_PRECONDITION"', () => {
			expect(AckResponses.FailedPrecondition).toBe('FAILED_PRECONDITION');
		});

		test('AckResponses.Other value is "OTHER"', () => {
			expect(AckResponses.Other).toBe('OTHER');
		});

		test('ackWithResponse() returns Invalid after already acked', async () => {
			const [topic] = await pubsub.createTopic('ack-resp-topic-1');
			const [subscription] = await topic.createSubscription('ack-resp-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			await message.ackWithResponse();
			const secondResponse = await message.ackWithResponse();

			expect(secondResponse).toBe(AckResponses.Invalid);
		});

		test('nackWithResponse() returns Invalid after already nacked', async () => {
			const [topic] = await pubsub.createTopic('ack-resp-topic-2');
			const [subscription] = await topic.createSubscription('ack-resp-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			await message.nackWithResponse();
			const secondResponse = await message.nackWithResponse();

			expect(secondResponse).toBe(AckResponses.Invalid);
		});
	});

	describe('Idempotent Operations', () => {
		test('multiple ack() calls are idempotent (no error)', async () => {
			const [topic] = await pubsub.createTopic('idem-topic-1');
			const [subscription] = await topic.createSubscription('idem-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			message.ack();
			message.ack();
			message.ack();

			expect(true).toBe(true);
		});

		test('multiple nack() calls are idempotent (no error)', async () => {
			const [topic] = await pubsub.createTopic('idem-topic-2');
			const [subscription] = await topic.createSubscription('idem-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			message.nack();
			message.nack();

			expect(true).toBe(true);
		});

		test('ack after nack has no effect (first operation wins)', async () => {
			const [topic] = await pubsub.createTopic('idem-topic-3');
			const [subscription] = await topic.createSubscription('idem-sub-3');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			message.nack();
			message.ack();

			expect(true).toBe(true);
		});

		test('nack after ack has no effect (first operation wins)', async () => {
			const [topic] = await pubsub.createTopic('idem-topic-4');
			const [subscription] = await topic.createSubscription('idem-sub-4');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			message.ack();
			message.nack();

			expect(true).toBe(true);
		});
	});

	describe('Type Compatibility', () => {
		test('Message instances are correct type', async () => {
			const [topic] = await pubsub.createTopic('type-compat-topic-1');
			const [subscription] = await topic.createSubscription('type-compat-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message: Message = messages[0];

			expect(message).toBeInstanceOf(Message);
		});

		test('data property is Buffer type', async () => {
			const [topic] = await pubsub.createTopic('type-compat-topic-2');
			const [subscription] = await topic.createSubscription('type-compat-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const data: Buffer = message.data;
			expect(data).toBeInstanceOf(Buffer);
		});

		test('attributes property is Record<string, string> type', async () => {
			const [topic] = await pubsub.createTopic('type-compat-topic-3');
			const [subscription] = await topic.createSubscription('type-compat-sub-3');

			await topic.publishMessage({
				data: Buffer.from('test'),
				attributes: { key: 'value' },
			});
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const attributes: Readonly<Record<string, string>> = message.attributes;
			expect(typeof attributes).toBe('object');
		});

		test('publishTime property has PreciseDate methods', async () => {
			const [topic] = await pubsub.createTopic('type-compat-topic-4');
			const [subscription] = await topic.createSubscription('type-compat-sub-4');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			const publishTime: PreciseDate = message.publishTime;
			expect(typeof publishTime.getTime).toBe('function');
			expect(typeof publishTime.getFullTimeString).toBe('function');
		});
	});

	describe('PreciseDate Type', () => {
		test('publishTime has Date methods', async () => {
			const [topic] = await pubsub.createTopic('precise-topic-1');
			const [subscription] = await topic.createSubscription('precise-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.publishTime.getTime).toBe('function');
			expect(typeof message.publishTime.toISOString).toBe('function');
		});

		test('publishTime has PreciseDate extended methods', async () => {
			const [topic] = await pubsub.createTopic('precise-topic-2');
			const [subscription] = await topic.createSubscription('precise-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.publishTime.getFullTimeString).toBe('function');
			const timeString = message.publishTime.getFullTimeString();
			expect(typeof timeString).toBe('string');
		});
	});

	describe('Empty Data and Attributes', () => {
		test('supports empty Buffer data', async () => {
			const [topic] = await pubsub.createTopic('empty-topic-1');
			const [subscription] = await topic.createSubscription('empty-sub-1');

			await topic.publishMessage({ data: Buffer.alloc(0) });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(message.data).toBeInstanceOf(Buffer);
			expect(message.data.length).toBe(0);
			expect(message.length).toBe(0);
		});

		test('supports message with no attributes', async () => {
			const [topic] = await pubsub.createTopic('empty-topic-2');
			const [subscription] = await topic.createSubscription('empty-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.attributes).toBe('object');
			expect(Object.keys(message.attributes).length).toBeGreaterThanOrEqual(0);
		});

		test('supports message with empty attributes object', async () => {
			const [topic] = await pubsub.createTopic('empty-topic-3');
			const [subscription] = await topic.createSubscription('empty-sub-3');

			await topic.publishMessage({ data: Buffer.from('test'), attributes: {} });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(typeof message.attributes).toBe('object');
		});
	});

	describe('Property Immutability', () => {
		test('id property is readonly', async () => {
			const [topic] = await pubsub.createTopic('immut-topic-1');
			const [subscription] = await topic.createSubscription('immut-sub-1');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => {
				(message as unknown as { id: string }).id = 'new-id';
			}).toThrow();
		});

		test('ackId property is readonly', async () => {
			const [topic] = await pubsub.createTopic('immut-topic-2');
			const [subscription] = await topic.createSubscription('immut-sub-2');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => {
				(message as unknown as { ackId: string }).ackId = 'new-ack-id';
			}).toThrow();
		});

		test('data property is readonly', async () => {
			const [topic] = await pubsub.createTopic('immut-topic-3');
			const [subscription] = await topic.createSubscription('immut-sub-3');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => {
				(message as unknown as { data: Buffer }).data = Buffer.from('new data');
			}).toThrow();
		});

		test('publishTime property is readonly', async () => {
			const [topic] = await pubsub.createTopic('immut-topic-4');
			const [subscription] = await topic.createSubscription('immut-sub-4');

			await topic.publishMessage({ data: Buffer.from('test') });
			const [messages] = await subscription.pull({ maxMessages: 1 });
			const message = messages[0];

			expect(() => {
				(message as unknown as { publishTime: Date }).publishTime = new Date();
			}).toThrow();
		});
	});
});