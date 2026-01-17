/**
 * Microbenchmark: Publisher Batching Logic
 *
 * Tests hot-path performance of actual Publisher batching, validation,
 * and message routing. Benchmarks real code paths to detect regressions.
 */

import { bench, run, group } from 'mitata';
import { Publisher } from '../../src/publisher/publisher';
import { PubSub } from '../../src/pubsub';

const TOPIC_NAME = 'projects/bench-project/topics/bench-topic';
const PAYLOAD_1KB = Buffer.alloc(1024, 'x');
const PAYLOAD_10KB = Buffer.alloc(10 * 1024, 'x');

let pubsub: PubSub;

async function setup() {
	pubsub = new PubSub({ projectId: 'bench-project' });
	await pubsub.createTopic('bench-topic');
}

await setup();

group('Message validation (actual Publisher)', () => {
	const publisher = new Publisher(TOPIC_NAME);

	bench('validate simple message', async () => {
		await publisher.publishMessage({
			data: PAYLOAD_1KB,
		});
	});

	bench('validate message with attributes', async () => {
		await publisher.publishMessage({
			data: PAYLOAD_1KB,
			attributes: {
				userId: '12345',
				eventType: 'test.event',
				timestamp: Date.now().toString(),
			},
		});
	});

	bench('validate message with ordering key', async () => {
		await publisher.publishMessage({
			data: PAYLOAD_1KB,
			attributes: { orderId: '12345' },
			orderingKey: 'order-12345',
		});
	});

	bench('validate large message (10KB)', async () => {
		await publisher.publishMessage({
			data: PAYLOAD_10KB,
		});
	});
});

group('Batch triggers - count-based (actual Publisher)', () => {
	bench('trigger batch at maxMessages=10', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 10,
				maxMilliseconds: 10000,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const promises = Array.from({ length: 10 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});

	bench('trigger batch at maxMessages=100', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 100,
				maxMilliseconds: 10000,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const promises = Array.from({ length: 100 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});
});

group('Batch triggers - size-based (actual Publisher)', () => {
	bench('trigger batch at 10KB total', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 10000,
				maxBytes: 10 * 1024,
			},
		});

		const promises = Array.from({ length: 10 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});

	bench('trigger batch at 100KB total', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 10000,
				maxBytes: 100 * 1024,
			},
		});

		const promises = Array.from({ length: 100 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});
});

group('Batch triggers - time-based (actual Publisher)', () => {
	bench('trigger batch after 10ms', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 10,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const promises = Array.from({ length: 5 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});

	bench('trigger batch after 50ms', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 50,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const promises = Array.from({ length: 5 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});

	bench('trigger batch after 100ms', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 100,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		const promises = Array.from({ length: 5 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);
		await Promise.all(promises);
	});
});

group('Ordering key routing (actual Publisher)', () => {
	const publisherWithOrdering = new Publisher(TOPIC_NAME, {
		messageOrdering: true,
		batching: {
			maxMessages: 10,
			maxMilliseconds: 100,
			maxBytes: 10 * 1024 * 1024,
		},
	});

	bench('publish with single ordering key', async () => {
		await publisherWithOrdering.publishMessage({
			data: PAYLOAD_1KB,
			orderingKey: 'order-key-1',
		});
	});

	bench('publish with 4 different ordering keys', async () => {
		const promises = [
			publisherWithOrdering.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-key-1',
			}),
			publisherWithOrdering.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-key-2',
			}),
			publisherWithOrdering.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-key-3',
			}),
			publisherWithOrdering.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-key-4',
			}),
		];
		await Promise.all(promises);
	});

	bench('publish with 10 different ordering keys', async () => {
		const promises = Array.from({ length: 10 }, (_, i) =>
			publisherWithOrdering.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: `order-key-${i}`,
			})
		);
		await Promise.all(promises);
	});
});

group('Flush performance (actual Publisher)', () => {
	bench('flush with 10 pending messages', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 10000,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		Array.from({ length: 10 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);

		await publisher.flush();
	});

	bench('flush with 100 pending messages', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 1000,
				maxMilliseconds: 10000,
				maxBytes: 10 * 1024 * 1024,
			},
		});

		Array.from({ length: 100 }, () =>
			publisher.publishMessage({ data: PAYLOAD_1KB })
		);

		await publisher.flush();
	});
});

group('Mixed batch assembly (actual Publisher)', () => {
	bench('10 messages, mixed sizes, no ordering', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			batching: {
				maxMessages: 100,
				maxMilliseconds: 1000,
				maxBytes: 1024 * 1024,
			},
		});

		const promises = [
			publisher.publishMessage({ data: PAYLOAD_1KB }),
			publisher.publishMessage({ data: PAYLOAD_10KB }),
			publisher.publishMessage({ data: PAYLOAD_1KB }),
			publisher.publishMessage({ data: Buffer.alloc(512, 'x') }),
			publisher.publishMessage({ data: PAYLOAD_1KB }),
			publisher.publishMessage({ data: PAYLOAD_10KB }),
			publisher.publishMessage({ data: PAYLOAD_1KB }),
			publisher.publishMessage({ data: Buffer.alloc(2048, 'x') }),
			publisher.publishMessage({ data: PAYLOAD_1KB }),
			publisher.publishMessage({ data: PAYLOAD_10KB }),
		];
		await Promise.all(promises);
	});

	bench('10 messages, mixed sizes, with ordering keys', async () => {
		const publisher = new Publisher(TOPIC_NAME, {
			messageOrdering: true,
			batching: {
				maxMessages: 100,
				maxMilliseconds: 1000,
				maxBytes: 1024 * 1024,
			},
		});

		const promises = [
			publisher.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-1',
			}),
			publisher.publishMessage({
				data: PAYLOAD_10KB,
				orderingKey: 'order-2',
			}),
			publisher.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-1',
			}),
			publisher.publishMessage({
				data: Buffer.alloc(512, 'x'),
				orderingKey: 'order-3',
			}),
			publisher.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-2',
			}),
			publisher.publishMessage({
				data: PAYLOAD_10KB,
				orderingKey: 'order-1',
			}),
			publisher.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-3',
			}),
			publisher.publishMessage({
				data: Buffer.alloc(2048, 'x'),
				orderingKey: 'order-2',
			}),
			publisher.publishMessage({
				data: PAYLOAD_1KB,
				orderingKey: 'order-1',
			}),
			publisher.publishMessage({
				data: PAYLOAD_10KB,
				orderingKey: 'order-3',
			}),
		];
		await Promise.all(promises);
	});
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
