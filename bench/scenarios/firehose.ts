/**
 * Firehose Benchmark - Ingestion Ceiling
 *
 * Configuration: 1 topic, 0 subscribers
 * Purpose: Determine maximum write throughput with no consumption overhead
 * Payload Sizes: 1KB, 10KB, 1MB
 * Success: P99 publish latency < 50ms (1KB), < 200ms (1MB)
 */

import { PubSub } from '../../src/pubsub';
import { Histogram, calculateThroughput } from '../utils/stats';
import {
  createResult,
  printSummary,
  saveResults,
  type BenchmarkResult,
} from '../utils/reporter';
import { checkBunVersion } from '../utils/version';

const PAYLOAD_SIZES = [
  { name: '1KB', bytes: 1024, targetP99: 50 },
  { name: '10KB', bytes: 10 * 1024, targetP99: 100 },
  { name: '1MB', bytes: 1024 * 1024, targetP99: 200 },
];

const CONFIG = {
  messagesPerSize: 1000,
  warmupMessages: 100,
};

async function runFirehose(): Promise<BenchmarkResult[]> {
  checkBunVersion();

  const results: BenchmarkResult[] = [];

  for (const payloadConfig of PAYLOAD_SIZES) {
    console.log(`\n--- Testing ${payloadConfig.name} payload ---`);

    const pubsub = new PubSub({ projectId: 'bench-firehose' });
    const histogram = new Histogram();
    const errors: string[] = [];

    try {
      const topicName = `firehose-${payloadConfig.name.toLowerCase()}`;
      const [topic] = await pubsub.createTopic(topicName);
      const payload = Buffer.alloc(payloadConfig.bytes, 'x');

      console.log(`Warming up with ${CONFIG.warmupMessages} messages...`);
      for (let i = 0; i < CONFIG.warmupMessages; i++) {
        await topic.publishMessage({ data: payload });
      }

      Bun.gc(true);

      console.log(`Publishing ${CONFIG.messagesPerSize} messages...`);
      const startTime = Bun.nanoseconds();

      const publishPromises: Promise<number>[] = [];
      for (let i = 0; i < CONFIG.messagesPerSize; i++) {
        const opStart = Bun.nanoseconds();
        publishPromises.push(
          topic.publishMessage({ data: payload }).then(() => {
            const opEnd = Bun.nanoseconds();
            return opEnd - opStart;
          })
        );
      }

      const publishTimes = await Promise.all(publishPromises);
      for (const time of publishTimes) {
        histogram.record(time);
      }

      const endTime = Bun.nanoseconds();
      const durationMs = (endTime - startTime) / 1_000_000;

      const latency = histogram.summary();
      const messagesPerSec = calculateThroughput(
        CONFIG.messagesPerSize,
        durationMs
      );
      const success = latency.p99 < payloadConfig.targetP99;

      const result = createResult(
        `firehose-${payloadConfig.name}`,
        {
          payloadSize: payloadConfig.name,
          payloadBytes: payloadConfig.bytes,
          messageCount: CONFIG.messagesPerSize,
          targetP99: payloadConfig.targetP99,
        },
        {
          messagesPerSec,
          latency,
          durationMs,
        },
        success && errors.length === 0,
        success
          ? errors
          : [...errors, `P99 (${latency.p99.toFixed(2)}ms) exceeded target (${payloadConfig.targetP99}ms)`]
      );

      printSummary(result);
      await saveResults(result);
      results.push(result);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      console.error(`Error testing ${payloadConfig.name}:`, error);
    } finally {
      await pubsub.close();
    }

    Bun.gc(true);
  }

  return results;
}

if (import.meta.main) {
  runFirehose().catch(console.error);
}

export { runFirehose };
