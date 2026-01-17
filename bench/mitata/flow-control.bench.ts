/**
 * Microbenchmark: Flow Control Decisions
 *
 * Tests hot-path performance of actual flow control classes.
 */

import { bench, run, group } from 'mitata';
import { SubscriberFlowControl } from '../../src/subscriber/flow-control';
import { PublisherFlowControl } from '../../src/publisher/flow-control';

group('SubscriberFlowControl', () => {
  const underLimitControl = new SubscriberFlowControl({
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024,
    allowExcessMessages: false,
  });

  const nearMessageLimitControl = new SubscriberFlowControl({
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024,
    allowExcessMessages: false,
  });
  for (let i = 0; i < 999; i++) {
    nearMessageLimitControl.addMessage(1024);
  }

  const nearByteLimitControl = new SubscriberFlowControl({
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024,
    allowExcessMessages: false,
  });
  nearByteLimitControl.addMessage(99 * 1024 * 1024);

  const excessControl = new SubscriberFlowControl({
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024,
    allowExcessMessages: true,
  });

  const mutationControl = new SubscriberFlowControl({
    maxMessages: 1000,
    maxBytes: 100 * 1024 * 1024,
    allowExcessMessages: false,
  });

  bench('canAccept (under limit)', () => {
    return underLimitControl.canAccept(1024);
  });

  bench('canAccept (near message limit)', () => {
    return nearMessageLimitControl.canAccept(1024);
  });

  bench('canAccept (near byte limit)', () => {
    return nearByteLimitControl.canAccept(1024);
  });

  bench('canAccept (with allowExcessMessages, empty queue)', () => {
    return excessControl.canAccept(200 * 1024 * 1024);
  });

  bench('addMessage + removeMessage cycle', () => {
    mutationControl.addMessage(1024);
    mutationControl.removeMessage(1024);
  });

  bench('getInFlightMessages', () => {
    return underLimitControl.getInFlightMessages();
  });

  bench('getInFlightBytes', () => {
    return underLimitControl.getInFlightBytes();
  });
});

group('PublisherFlowControl', () => {
  const publisherControl = new PublisherFlowControl({
    maxOutstandingMessages: 1000,
    maxOutstandingBytes: 100 * 1024 * 1024,
  });

  bench('acquire + release cycle (immediate)', async () => {
    await publisherControl.acquire(1024);
    publisherControl.release(1024);
  });

  bench('release', () => {
    return publisherControl.release(1024);
  });
});

group('PublisherFlowControl - blocking behavior', () => {
  const blockingControl = new PublisherFlowControl({
    maxOutstandingMessages: 10,
    maxOutstandingBytes: 10 * 1024,
  });

  bench('acquire when at limit (pending queue)', async () => {
    const acquires = Array.from({ length: 10 }, () =>
      blockingControl.acquire(1024)
    );
    await Promise.all(acquires);

    const pendingPromise = blockingControl.acquire(1024);
    blockingControl.release(1024);
    await pendingPromise;

    for (let i = 0; i < 9; i++) {
      blockingControl.release(1024);
    }
  });
});

// @ts-expect-error - percentiles option exists at runtime but not in types
await run({ percentiles: true });
