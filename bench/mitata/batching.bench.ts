/**
 * Microbenchmark: Publisher Batching Logic
 *
 * Tests hot-path performance of batch assembly and trigger conditions.
 */

import { bench, run, group } from 'mitata';

interface BatchMessage {
  data: Buffer;
  attributes: Record<string, string>;
  orderingKey?: string;
}

interface Batch {
  messages: BatchMessage[];
  totalBytes: number;
}

const PAYLOAD_1KB = Buffer.alloc(1024, 'x');
const DEFAULT_BATCH_CONFIG = {
  maxMessages: 100,
  maxBytes: 1024 * 1024,
  maxMilliseconds: 10,
};

function createBatch(): Batch {
  return { messages: [], totalBytes: 0 };
}

function shouldPublishBatch(batch: Batch, config: typeof DEFAULT_BATCH_CONFIG): boolean {
  return (
    batch.messages.length >= config.maxMessages ||
    batch.totalBytes >= config.maxBytes
  );
}

function calculateMessageSize(msg: BatchMessage): number {
  let size = msg.data.length;
  for (const [key, value] of Object.entries(msg.attributes)) {
    size += Buffer.byteLength(key, 'utf8');
    size += Buffer.byteLength(value, 'utf8');
  }
  return size;
}

group('Batch creation', () => {
  bench('create empty batch', () => {
    createBatch();
  });

  bench('create batch with object literal', () => {
    return { messages: [], totalBytes: 0 };
  });
});

group('Batch trigger checks', () => {
  const emptyBatch = createBatch();
  const fullBatch: Batch = {
    messages: Array.from({ length: 100 }, () => ({
      data: PAYLOAD_1KB,
      attributes: {},
    })),
    totalBytes: 100 * 1024,
  };
  const halfBatch: Batch = {
    messages: Array.from({ length: 50 }, () => ({
      data: PAYLOAD_1KB,
      attributes: {},
    })),
    totalBytes: 50 * 1024,
  };

  bench('check empty batch', () => {
    shouldPublishBatch(emptyBatch, DEFAULT_BATCH_CONFIG);
  });

  bench('check half-full batch', () => {
    shouldPublishBatch(halfBatch, DEFAULT_BATCH_CONFIG);
  });

  bench('check full batch', () => {
    shouldPublishBatch(fullBatch, DEFAULT_BATCH_CONFIG);
  });
});

group('Message size calculation', () => {
  const msgNoAttrs: BatchMessage = {
    data: PAYLOAD_1KB,
    attributes: {},
  };

  const msgWithAttrs: BatchMessage = {
    data: PAYLOAD_1KB,
    attributes: {
      userId: '12345',
      eventType: 'test.event',
      timestamp: Date.now().toString(),
    },
  };

  bench('no attributes', () => {
    calculateMessageSize(msgNoAttrs);
  });

  bench('with attributes', () => {
    calculateMessageSize(msgWithAttrs);
  });
});

group('Batch assembly (simulated)', () => {
  bench('add 1 message to batch', () => {
    const batch = createBatch();
    const msg: BatchMessage = { data: PAYLOAD_1KB, attributes: {} };
    batch.messages.push(msg);
    batch.totalBytes += msg.data.length;
  });

  bench('add 10 messages to batch', () => {
    const batch = createBatch();
    for (let i = 0; i < 10; i++) {
      const msg: BatchMessage = { data: PAYLOAD_1KB, attributes: {} };
      batch.messages.push(msg);
      batch.totalBytes += msg.data.length;
    }
  });

  bench('add 100 messages to batch', () => {
    const batch = createBatch();
    for (let i = 0; i < 100; i++) {
      const msg: BatchMessage = { data: PAYLOAD_1KB, attributes: {} };
      batch.messages.push(msg);
      batch.totalBytes += msg.data.length;
    }
  });
});

group('Ordering key routing', () => {
  const orderingBatches = new Map<string, Batch>();

  bench('get/create ordering batch', () => {
    const key = 'order-key-1';
    let batch = orderingBatches.get(key);
    if (!batch) {
      batch = createBatch();
      orderingBatches.set(key, batch);
    }
    return batch;
  });

  bench('Map.has check', () => {
    orderingBatches.has('order-key-1');
  });
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
