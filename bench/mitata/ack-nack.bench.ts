/**
 * Microbenchmark: Ack/Nack Processing
 *
 * Tests hot-path performance of actual message acknowledgment operations.
 * Uses real Message and MessageQueue classes to detect regressions.
 */

import { bench, run, group } from 'mitata';
import { Message } from '../../src/message';
import { MessageQueue } from '../../src/internal/message-queue';
import { PreciseDate } from '../../src/index';
import type { InternalMessage } from '../../src/internal/types';

const TOPIC_NAME = 'projects/bench/topics/ack-bench';
const SUB_NAME = 'projects/bench/subscriptions/ack-bench';

function setupQueue(): MessageQueue {
	MessageQueue.resetForTesting();
	const queue = MessageQueue.getInstance();

	queue.registerTopic(TOPIC_NAME);
	queue.registerSubscription(SUB_NAME, TOPIC_NAME, {
		ackDeadlineSeconds: 60,
		enableMessageOrdering: false,
	});

	return queue;
}

function createInternalMessages(count: number): InternalMessage[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `msg-${i}`,
		data: Buffer.from(`Message ${i}`),
		attributes: { index: String(i) },
		publishTime: new PreciseDate(),
		deliveryAttempt: 1,
		length: 9 + String(i).length,
	}));
}

group('Message.ack()', () => {
	bench('ack single message', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.ack();
	});

	bench('ack 10 messages', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		const msgs = pulled.map(
			(p) =>
				new Message(
					p.id,
					p.ackId!,
					p.data,
					p.attributes,
					p.publishTime,
					{ name: SUB_NAME },
				),
		);
		for (const msg of msgs) {
			msg.ack();
		}
	});

	bench('ack 100 messages', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(100);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 100);
		const msgs = pulled.map(
			(p) =>
				new Message(
					p.id,
					p.ackId!,
					p.data,
					p.attributes,
					p.publishTime,
					{ name: SUB_NAME },
				),
		);
		for (const msg of msgs) {
			msg.ack();
		}
	});
});

group('Message.nack()', () => {
	bench('nack single message', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.nack();
	});

	bench('nack 10 messages', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		const msgs = pulled.map(
			(p) =>
				new Message(
					p.id,
					p.ackId!,
					p.data,
					p.attributes,
					p.publishTime,
					{ name: SUB_NAME },
				),
		);
		for (const msg of msgs) {
			msg.nack();
		}
	});

	bench('nack 100 messages', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(100);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 100);
		const msgs = pulled.map(
			(p) =>
				new Message(
					p.id,
					p.ackId!,
					p.data,
					p.attributes,
					p.publishTime,
					{ name: SUB_NAME },
				),
		);
		for (const msg of msgs) {
			msg.nack();
		}
	});
});

group('Message.modifyAckDeadline()', () => {
	bench('extend deadline single message', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.modifyAckDeadline(120);
		msg.ack();
	});

	bench('extend deadline 10 messages', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		const msgs = pulled.map(
			(p) =>
				new Message(
					p.id,
					p.ackId!,
					p.data,
					p.attributes,
					p.publishTime,
					{ name: SUB_NAME },
				),
		);
		for (const msg of msgs) {
			msg.modifyAckDeadline(120);
		}
		for (const msg of msgs) {
			msg.ack();
		}
	});

	bench('shorten deadline (0 = immediate nack)', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.modifyAckDeadline(0);
	});
});

group('MessageQueue.ack()', () => {
	bench('direct queue ack single', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		queue.ack(pulled[0]!.ackId!);
	});

	bench('direct queue ack 10', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		for (const p of pulled) {
			queue.ack(p.ackId!);
		}
	});

	bench('direct queue ack 100', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(100);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 100);
		for (const p of pulled) {
			queue.ack(p.ackId!);
		}
	});
});

group('MessageQueue.nack()', () => {
	bench('direct queue nack single', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		queue.nack(pulled[0]!.ackId!);
	});

	bench('direct queue nack 10', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		for (const p of pulled) {
			queue.nack(p.ackId!);
		}
	});

	bench('direct queue nack 100', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(100);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 100);
		for (const p of pulled) {
			queue.nack(p.ackId!);
		}
	});
});

group('MessageQueue.modifyAckDeadline()', () => {
	bench('direct queue modifyAckDeadline single', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		queue.modifyAckDeadline(pulled[0]!.ackId!, 120);
		queue.ack(pulled[0]!.ackId!);
	});

	bench('direct queue modifyAckDeadline 10', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(10);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 10);
		for (const p of pulled) {
			queue.modifyAckDeadline(p.ackId!, 120);
		}
		for (const p of pulled) {
			queue.ack(p.ackId!);
		}
	});
});

group('Idempotency', () => {
	bench('double ack (idempotent)', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.ack();
		msg.ack();
	});

	bench('ack then nack (nack is no-op)', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.ack();
		msg.nack();
	});

	bench('nack then ack (ack is no-op)', () => {
		const queue = setupQueue();
		const messages = createInternalMessages(1);
		queue.publish(TOPIC_NAME, messages);
		const pulled = queue.pull(SUB_NAME, 1);
		const msg = new Message(
			pulled[0]!.id,
			pulled[0]!.ackId!,
			pulled[0]!.data,
			pulled[0]!.attributes,
			pulled[0]!.publishTime,
			{ name: SUB_NAME },
		);
		msg.nack();
		msg.ack();
	});
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
