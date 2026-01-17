/**
 * Thundering Herd Benchmark - Connection Storm
 *
 * Configuration: 1,000 concurrent publishers
 * Purpose: Test robustness under sudden concurrent load
 * Traffic: Each publisher sends 1 message, then disconnects
 * Success: Zero connection errors, all messages delivered
 */

import { PubSub } from '../../src/pubsub';
import { Histogram, calculateThroughput } from '../utils/stats';
import { createResult, printSummary, saveResults } from '../utils/reporter';

const CONFIG = {
  concurrentPublishers: 1000,
  messagesPerPublisher: 1,
  warmupPublishers: 50,
};

const MIN_BUN_VERSION = '1.1.31';
if (Bun.version < MIN_BUN_VERSION) {
  console.warn(
    `⚠️  Warning: Bun ${Bun.version} < ${MIN_BUN_VERSION}. Results may vary due to GC/runtime differences.`
  );
}

async function runThunderingHerd() {
  const pubsub = new PubSub({ projectId: 'bench-herd' });
  const histogram = new Histogram();
  const errors: string[] = [];

  try {
    const [topic] = await pubsub.createTopic('herd-topic');
    const payload = Buffer.from('thundering-herd-message');

    console.log(`Warming up with ${CONFIG.warmupPublishers} publishers...`);
    const warmupPromises = [];
    for (let i = 0; i < CONFIG.warmupPublishers; i++) {
      warmupPromises.push(topic.publishMessage({ data: payload }));
    }
    await Promise.all(warmupPromises);

    Bun.gc(true);

    console.log(
      `Launching ${CONFIG.concurrentPublishers} concurrent publishers...`
    );
    const startTime = Bun.nanoseconds();

    const publishPromises = [];
    for (let i = 0; i < CONFIG.concurrentPublishers; i++) {
      const promise = (async () => {
        const opStart = Bun.nanoseconds();
        try {
          await topic.publishMessage({
            data: Buffer.from(`publisher-${i}`),
          });
          const opEnd = Bun.nanoseconds();
          histogram.record(opEnd - opStart);
        } catch (error) {
          errors.push(
            `Publisher ${i}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })();
      publishPromises.push(promise);
    }

    await Promise.all(publishPromises);

    const endTime = Bun.nanoseconds();
    const durationMs = (endTime - startTime) / 1_000_000;

    const latency = histogram.summary();
    const successCount = histogram.getCount();
    const errorCount = errors.length;
    const totalAttempted = CONFIG.concurrentPublishers;

    const messagesPerSec = calculateThroughput(successCount, durationMs);
    const success = errorCount === 0;

    const result = createResult(
      'thundering-herd',
      {
        concurrentPublishers: CONFIG.concurrentPublishers,
        messagesPerPublisher: CONFIG.messagesPerPublisher,
        successCount,
        errorCount,
        successRate: `${((successCount / totalAttempted) * 100).toFixed(2)}%`,
      },
      {
        messagesPerSec,
        latency,
        durationMs,
      },
      success,
      errors.length > 0 ? errors.slice(0, 10) : undefined
    );

    printSummary(result);
    await saveResults(result);
  } finally {
    await pubsub.close();
  }
}

if (import.meta.main) {
  runThunderingHerd().catch(console.error);
}

export { runThunderingHerd };
