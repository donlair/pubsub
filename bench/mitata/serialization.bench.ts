/**
 * Microbenchmark: Message Serialization
 *
 * Tests hot-path performance of message data serialization.
 */

import { bench, run, group } from 'mitata';

const PAYLOAD_1KB = Buffer.alloc(1024, 'x');
const PAYLOAD_10KB = Buffer.alloc(10 * 1024, 'x');
const PAYLOAD_100KB = Buffer.alloc(100 * 1024, 'x');

const ATTRIBUTES = {
  userId: '12345',
  eventType: 'test.event',
  timestamp: Date.now().toString(),
  source: 'benchmark',
};

group('Buffer.from (string encoding)', () => {
  bench('1KB string to Buffer', () => {
    Buffer.from('x'.repeat(1024));
  });

  bench('10KB string to Buffer', () => {
    Buffer.from('x'.repeat(10 * 1024));
  });
});

group('Buffer.alloc (pre-allocation)', () => {
  bench('1KB alloc', () => {
    Buffer.alloc(1024, 'x');
  });

  bench('10KB alloc', () => {
    Buffer.alloc(10 * 1024, 'x');
  });
});

group('JSON.stringify (attributes)', () => {
  bench('attributes only', () => {
    JSON.stringify(ATTRIBUTES);
  });

  bench('message with 1KB data', () => {
    JSON.stringify({
      data: PAYLOAD_1KB.toString('base64'),
      attributes: ATTRIBUTES,
    });
  });

  bench('message with 10KB data', () => {
    JSON.stringify({
      data: PAYLOAD_10KB.toString('base64'),
      attributes: ATTRIBUTES,
    });
  });
});

group('Buffer.toString (encoding)', () => {
  bench('1KB to base64', () => {
    PAYLOAD_1KB.toString('base64');
  });

  bench('10KB to base64', () => {
    PAYLOAD_10KB.toString('base64');
  });

  bench('100KB to base64', () => {
    PAYLOAD_100KB.toString('base64');
  });
});

group('Buffer.byteLength (validation)', () => {
  const testKey = 'some-attribute-key';
  const testValue = 'some-attribute-value-with-more-content';

  bench('key length check', () => {
    Buffer.byteLength(testKey, 'utf8');
  });

  bench('value length check', () => {
    Buffer.byteLength(testValue, 'utf8');
  });

  bench('full attribute validation', () => {
    for (const [key, value] of Object.entries(ATTRIBUTES)) {
      Buffer.byteLength(key, 'utf8');
      Buffer.byteLength(value, 'utf8');
    }
  });
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
