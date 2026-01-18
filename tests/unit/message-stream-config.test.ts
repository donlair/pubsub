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

  test('should respect custom pull interval', async () => {
    const subscription = topic.subscription(`test-sub-custom-interval-${testCounter}`, {
      streamingOptions: {
        pullInterval: 5,
      },
    });
    await subscription.create();
    await subscription.open();

    const messageStream = (subscription as any).messageStream;
    expect(messageStream.pullIntervalMs).toBe(5);

    await subscription.close();
  });

  test('should respect custom max pull size', async () => {
    const subscription = topic.subscription(`test-sub-custom-size-${testCounter}`, {
      streamingOptions: {
        maxPullSize: 500,
      },
    });
    await subscription.create();
    await subscription.open();

    const messageStream = (subscription as any).messageStream;
    expect(messageStream.maxPullSize).toBe(500);

    await subscription.close();
  });

  test('calculateMaxPull should respect custom maxPullSize', async () => {
    const subscription = topic.subscription(`test-calc-max-pull-${testCounter}`, {
      flowControl: { maxMessages: 10000 },
      streamingOptions: { maxPullSize: 250 },
    });
    await subscription.create();
    subscription.open();

    const messageStream = (subscription as any).messageStream;
    const maxPull = messageStream.calculateMaxPull();

    expect(maxPull).toBe(250);

    await subscription.close();
  });

  test('higher throughput with aggressive settings', async () => {
    const subscription = topic.subscription(`test-throughput-${testCounter}`, {
      streamingOptions: {
        pullInterval: 1,
        maxPullSize: 1000
      }
    });
    await subscription.create();

    const received: string[] = [];
    subscription.on('message', (msg) => {
      received.push(msg.data.toString());
      msg.ack();
    });

    subscription.on('error', (err) => {
      throw err;
    });

    subscription.open();

    const promises = [];
    for (let i = 0; i < 10000; i++) {
      promises.push(topic.publishMessage({
        data: Buffer.from(`msg-${i}`)
      }));
    }
    await Promise.all(promises);

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(received.length).toBe(10000);
    await subscription.close();
  });
});
