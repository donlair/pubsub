/**
 * Microbenchmark: Ack/Nack Processing
 *
 * Tests hot-path performance of message acknowledgment operations.
 */

import { bench, run, group } from 'mitata';

interface MessageLease {
  ackId: string;
  message: { id: string; length: number; orderingKey?: string };
  subscription: string;
  deadline: Date;
  timer?: ReturnType<typeof setTimeout>;
}

const leases = new Map<string, MessageLease>();

function createLease(ackId: string): MessageLease {
  return {
    ackId,
    message: { id: `msg-${ackId}`, length: 1024 },
    subscription: 'test-sub',
    deadline: new Date(Date.now() + 60000),
  };
}

for (let i = 0; i < 1000; i++) {
  const ackId = `ack-${i}`;
  leases.set(ackId, createLease(ackId));
}

group('Lease lookup', () => {
  bench('Map.get existing', () => {
    leases.get('ack-500');
  });

  bench('Map.get non-existing', () => {
    leases.get('ack-9999');
  });

  bench('Map.has check', () => {
    leases.has('ack-500');
  });
});

group('Lease creation', () => {
  let counter = 2000;

  bench('create lease object', () => {
    createLease(`ack-${counter++}`);
  });

  bench('generate ackId', () => {
    `msg-id-${counter++}-${crypto.randomUUID()}`;
  });

  bench('crypto.randomUUID', () => {
    crypto.randomUUID();
  });
});

group('Ack processing (simulated)', () => {
  const testLease = createLease('test-ack');
  let _inFlightCount = 100;
  let _inFlightBytes = 100 * 1024;

  bench('decrement counters', () => {
    _inFlightCount--;
    _inFlightBytes -= testLease.message.length;
    _inFlightCount++;
    _inFlightBytes += testLease.message.length;
  });

  bench('full ack simulation', () => {
    const lease = leases.get('ack-500');
    if (lease) {
      _inFlightCount--;
      _inFlightBytes -= lease.message.length;
      _inFlightCount++;
      _inFlightBytes += lease.message.length;
    }
  });
});

group('Ordering key unblocking', () => {
  const blockedKeys = new Set<string>();
  for (let i = 0; i < 100; i++) {
    blockedKeys.add(`key-${i}`);
  }

  bench('Set.delete existing', () => {
    blockedKeys.delete('key-50');
    blockedKeys.add('key-50');
  });

  bench('Set.delete non-existing', () => {
    blockedKeys.delete('key-999');
  });

  bench('Set.has check', () => {
    blockedKeys.has('key-50');
  });
});

group('Timer operations', () => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  bench('setTimeout creation', () => {
    timer = setTimeout(() => {}, 60000);
    clearTimeout(timer);
  });

  bench('clearTimeout', () => {
    timer = setTimeout(() => {}, 60000);
    clearTimeout(timer);
  });
});

group('Date operations', () => {
  bench('new Date()', () => {
    new Date();
  });

  bench('Date.now()', () => {
    Date.now();
  });

  bench('new Date(Date.now() + offset)', () => {
    new Date(Date.now() + 60000);
  });
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
