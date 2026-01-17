/**
 * Throughput Benchmark - Baseline Performance
 *
 * Configuration: 1 topic, 1 subscriber, immediate ack
 * Purpose: Establish baseline msgs/sec for regression tracking
 * Success: Document baseline, track +/-10% variance across commits
 */

import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';
import { Histogram, calculateThroughput } from '../utils/stats';
import { createResult, printSummary, saveResults } from '../utils/reporter';

const CONFIG = {
  messageCount: 10_000,
  payloadSize: 1024,
  warmupMessages: 1000,
};

async function runThroughput() {
  const MIN_BUN_VERSION = '1.1.31';
  if (Bun.version < MIN_BUN_VERSION) {
    console.warn(
      `⚠️  Warning: Bun ${Bun.version} < ${MIN_BUN_VERSION}. Results may vary due to GC/runtime differences.`
    );
  }

  const pubsub = new PubSub({ projectId: 'bench-throughput' });
  const histogram = new Histogram();
  const errors: string[] = [];

  try {
    const [topic] = await pubsub.createTopic('throughput-topic');
    const [subscription] = await pubsub.createSubscription(
      'throughput-topic',
      'throughput-sub'
    );

    const payload = Buffer.alloc(CONFIG.payloadSize, 'x');
    let receivedCount = 0;

    const allReceived = new Promise<void>((resolve) => {
      subscription.on('message', (message: Message) => {
        const publishTimeNs = Number.parseInt(
          message.attributes.publishTimeNs ?? '0',
          10
        );
        const latencyNs = Bun.nanoseconds() - publishTimeNs;
        histogram.record(latencyNs);

        message.ack();
        receivedCount++;

        if (receivedCount === CONFIG.messageCount) {
          resolve();
        }
      });

      subscription.on('error', (error: Error) => {
        errors.push(error.message);
      });
    });

    subscription.open();

    console.log(`Warming up with ${CONFIG.warmupMessages} messages...`);
    for (let i = 0; i < CONFIG.warmupMessages; i++) {
      await topic.publishMessage({ data: payload });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    histogram.reset();
    receivedCount = 0;

    Bun.gc(true);

    console.log(`Publishing ${CONFIG.messageCount} messages...`);
    const startTime = Bun.nanoseconds();

    for (let i = 0; i < CONFIG.messageCount; i++) {
      const publishTimeNs = Bun.nanoseconds();
      await topic.publishMessage({
        data: payload,
        attributes: { publishTimeNs: publishTimeNs.toString() },
      });
    }

    await allReceived;
    const endTime = Bun.nanoseconds();
    const durationMs = (endTime - startTime) / 1_000_000;

    await subscription.close();

    const latency = histogram.summary();
    const messagesPerSec = calculateThroughput(CONFIG.messageCount, durationMs);

    const result = createResult(
      'throughput',
      {
        messageCount: CONFIG.messageCount,
        payloadSize: CONFIG.payloadSize,
        warmupMessages: CONFIG.warmupMessages,
      },
      {
        messagesPerSec,
        latency,
        durationMs,
      },
      errors.length === 0 && receivedCount === CONFIG.messageCount,
      errors
    );

    printSummary(result);
    await saveResults(result);
  } finally {
    await pubsub.close();
  }
}

if (import.meta.main) {
  runThroughput().catch(console.error);
}

export { runThroughput };
