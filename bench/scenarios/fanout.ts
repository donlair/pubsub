/**
 * Fan-Out Benchmark - Routing Efficiency
 *
 * Configuration: 1 topic, 50 subscribers
 * Purpose: Stress test internal EventEmitter and message copying mechanisms
 * Traffic: 100 msg/s publish rate = 5,000 ops/sec total
 * Success: P99 end-to-end latency < 100ms
 */

import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';
import type { Subscription } from '../../src/subscription';
import { Histogram, calculateThroughput } from '../utils/stats';
import { createResult, printSummary, saveResults } from '../utils/reporter';

const CONFIG = {
  subscriberCount: 50,
  publishRatePerSec: 100,
  durationSeconds: 10,
  warmupMessages: 50,
};

async function runFanout() {
  const pubsub = new PubSub({ projectId: 'bench-fanout' });
  const histogram = new Histogram();
  const errors: string[] = [];
  const subscriptions: Subscription[] = [];
  const receiveCounts = new Map<string, number>();

  try {
    const [topic] = await pubsub.createTopic('fanout-topic');

    console.log(`Creating ${CONFIG.subscriberCount} subscriptions...`);
    for (let i = 0; i < CONFIG.subscriberCount; i++) {
      const subName = `fanout-sub-${i}`;
      const [subscription] = await pubsub.createSubscription(
        'fanout-topic',
        subName
      );
      subscriptions.push(subscription);
      receiveCounts.set(subName, 0);

      subscription.on('message', (message: Message) => {
        const publishTimeNs = Number.parseInt(
          message.attributes.publishTimeNs ?? '0',
          10
        );
        const latencyNs = Bun.nanoseconds() - publishTimeNs;
        histogram.record(latencyNs);

        message.ack();
        receiveCounts.set(subName, (receiveCounts.get(subName) ?? 0) + 1);
      });

      subscription.on('error', (error: Error) => {
        errors.push(`${subName}: ${error.message}`);
      });

      subscription.open();
    }

    const payload = Buffer.alloc(1024, 'x');
    const intervalMs = 1000 / CONFIG.publishRatePerSec;

    console.log(`Warming up with ${CONFIG.warmupMessages} messages...`);
    for (let i = 0; i < CONFIG.warmupMessages; i++) {
      await topic.publishMessage({ data: payload });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    histogram.reset();
    for (const subName of receiveCounts.keys()) {
      receiveCounts.set(subName, 0);
    }

    Bun.gc(true);

    console.log(
      `Publishing at ${CONFIG.publishRatePerSec} msg/s for ${CONFIG.durationSeconds}s...`
    );
    const startTime = Bun.nanoseconds();
    const endTime = Date.now() + CONFIG.durationSeconds * 1000;
    let publishedCount = 0;

    while (Date.now() < endTime) {
      const publishTimeNs = Bun.nanoseconds();
      await topic.publishMessage({
        data: payload,
        attributes: { publishTimeNs: publishTimeNs.toString() },
      });
      publishedCount++;

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    console.log('Waiting for message delivery...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const measureEndTime = Bun.nanoseconds();
    const durationMs = (measureEndTime - startTime) / 1_000_000;

    for (const subscription of subscriptions) {
      await subscription.close();
    }

    const totalReceived = Array.from(receiveCounts.values()).reduce(
      (a, b) => a + b,
      0
    );
    const expectedTotal = publishedCount * CONFIG.subscriberCount;

    const latency = histogram.summary();
    const messagesPerSec = calculateThroughput(totalReceived, durationMs);
    const success = latency.p99 < 100;

    const result = createResult(
      'fanout',
      {
        subscriberCount: CONFIG.subscriberCount,
        publishRatePerSec: CONFIG.publishRatePerSec,
        durationSeconds: CONFIG.durationSeconds,
        totalPublished: publishedCount,
        totalReceived,
        expectedTotal,
        deliveryRate: `${((totalReceived / expectedTotal) * 100).toFixed(2)}%`,
      },
      {
        messagesPerSec,
        latency,
        durationMs,
      },
      success && errors.length === 0,
      success
        ? errors
        : [...errors, `P99 (${latency.p99.toFixed(2)}ms) exceeded target (100ms)`]
    );

    printSummary(result);
    await saveResults(result);
  } finally {
    await pubsub.close();
  }
}

if (import.meta.main) {
  runFanout().catch(console.error);
}

export { runFanout };
