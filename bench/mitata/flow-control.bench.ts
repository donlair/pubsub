/**
 * Microbenchmark: Flow Control Decisions
 *
 * Tests hot-path performance of flow control checks.
 */

import { bench, run, group } from 'mitata';

interface FlowControlState {
  messageCount: number;
  bytesCount: number;
  maxMessages: number;
  maxBytes: number;
}

const state: FlowControlState = {
  messageCount: 50,
  bytesCount: 500 * 1024,
  maxMessages: 1000,
  maxBytes: 100 * 1024 * 1024,
};

function canAccept(messageBytes: number): boolean {
  return (
    state.messageCount < state.maxMessages &&
    state.bytesCount + messageBytes <= state.maxBytes
  );
}

function canAcceptWithExcess(messageBytes: number, allowExcess: boolean): boolean {
  if (allowExcess && state.messageCount === 0) {
    return true;
  }
  return (
    state.messageCount < state.maxMessages &&
    state.bytesCount + messageBytes <= state.maxBytes
  );
}

group('Flow control checks', () => {
  bench('canAccept (under limit)', () => {
    canAccept(1024);
  });

  bench('canAccept (near limit)', () => {
    const nearLimitState = { ...state, messageCount: 999, bytesCount: 99 * 1024 * 1024 };
    return (
      nearLimitState.messageCount < nearLimitState.maxMessages &&
      nearLimitState.bytesCount + 1024 <= nearLimitState.maxBytes
    );
  });

  bench('canAcceptWithExcess', () => {
    canAcceptWithExcess(1024, true);
  });
});

group('Counter updates', () => {
  let count = 0;
  let bytes = 0;

  bench('increment counters', () => {
    count++;
    bytes += 1024;
  });

  bench('decrement counters', () => {
    count--;
    bytes -= 1024;
  });
});

group('Promise-based blocking (simulated)', () => {
  const pendingAcquires: Array<{ resolve: () => void; bytes: number }> = [];

  bench('add to pending queue', () => {
    pendingAcquires.push({
      resolve: () => {},
      bytes: 1024,
    });
    pendingAcquires.pop();
  });

  bench('shift from pending queue', () => {
    pendingAcquires.push({ resolve: () => {}, bytes: 1024 });
    pendingAcquires.shift();
  });
});

group('Comparison operations', () => {
  const a = 50;
  const b = 100;
  const c = 1024;
  const d = 1024 * 1024;

  bench('integer comparison', () => {
    return a < b;
  });

  bench('combined comparison (AND)', () => {
    return a < b && c < d;
  });

  bench('addition + comparison', () => {
    return a + 10 <= b;
  });
});

await run({ percentiles: true });
