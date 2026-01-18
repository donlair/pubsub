/**
 * MessageStream configuration unit tests.
 * Reference: docs/plans/2026-01-17-configurable-throughput.md
 *
 * Tests configurable pullInterval and maxPullSize options.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src/pubsub';
import type { Topic } from '../../src/topic';

describe('MessageStream Configuration', () => {
  let pubsub: PubSub;
  let topic: Topic;
  let testCounter = 0;

  beforeEach(async () => {
    const topicName = `test-defaults-${testCounter}`;
    pubsub = new PubSub();
    topic = pubsub.topic(topicName);
    await topic.create();
  });

  afterEach(async () => {
    if (topic) {
      await topic.delete();
    }
    testCounter++;
  });

  test('should use default pull interval of 10ms', async () => {
    const subscription = topic.subscription(`test-sub-${testCounter}`);
    await subscription.create();
    subscription.open();

    const messageStream = (subscription as any).messageStream;
    expect(messageStream.pullIntervalMs).toBe(10);

    await subscription.close();
  });

  test('should use default max pull size of 100', async () => {
    const subscription = topic.subscription(`test-sub-${testCounter}`);
    await subscription.create();
    subscription.open();

    const messageStream = (subscription as any).messageStream;
    expect(messageStream.maxPullSize).toBe(100);

    await subscription.close();
  });
});
