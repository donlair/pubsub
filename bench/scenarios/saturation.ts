/**
 * Saturation Point Detection - Capacity Ceiling Identification
 *
 * Configuration: Load ramping from 50% to 125% of estimated capacity
 * Purpose: Identify throughput ceiling for capacity planning
 * Success: Document inflection point where latency growth becomes exponential
 */

import { PubSub } from '../../src/pubsub';
import type { Message } from '../../src/message';
import type { Topic } from '../../src/topic';
import type { Subscription } from '../../src/subscription';
import { Histogram, calculateThroughput } from '../utils/stats';
import { createResult, printSummary, saveResults } from '../utils/reporter';
import { checkBunVersion } from '../utils/version';

const CONFIG = {
  baselineRate: 10_000,
  loadLevels: [0.5, 0.75, 0.9, 1.0, 1.1, 1.25],
  messagesPerLevel: 10_000,
  warmupMessages: 1000,
  payloadSize: 1024,
};

interface LoadLevelResult {
  loadPercentage: number;
  targetRate: number;
  actualRate: number;
  messagesProcessed: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  durationMs: number;
}

async function runLoadLevel(
  topic: Topic,
  subscription: Subscription,
  targetMessagesPerSec: number
): Promise<LoadLevelResult> {
  const histogram = new Histogram();
  const payload = Buffer.alloc(CONFIG.payloadSize, 'x');
  let receivedCount = 0;
  const totalMessages = CONFIG.messagesPerLevel;
  let handler: ((message: Message) => void) | null = null;

  const allReceived = new Promise<void>((resolve) => {
    handler = (message: Message) => {
      const publishTimeNs = Number.parseInt(
        message.attributes.publishTimeNs ?? '0',
        10
      );
      const latencyNs = Bun.nanoseconds() - publishTimeNs;
      histogram.record(latencyNs);
      message.ack();
      receivedCount++;

      if (receivedCount >= totalMessages) {
        resolve();
      }
    };

    subscription.on('message', handler);
  });

  const startTime = Bun.nanoseconds();
  const targetIntervalNs = (1_000_000_000 / targetMessagesPerSec);

  for (let i = 0; i < totalMessages; i++) {
    const publishTimeNs = Bun.nanoseconds();
    await topic.publishMessage({
      data: payload,
      attributes: { publishTimeNs: publishTimeNs.toString() },
    });

    if (i < totalMessages - 1) {
      const nextPublishTime = startTime + (i + 1) * targetIntervalNs;
      const waitTimeNs = nextPublishTime - Bun.nanoseconds();

      if (waitTimeNs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTimeNs / 1_000_000));
      }
    }
  }

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Timeout: Only received ${receivedCount}/${totalMessages} messages after 60s`
        )
      );
    }, 60_000);
  });

  try {
    await Promise.race([allReceived, timeout]);
  } finally {
    clearTimeout(timeoutId!);
    if (handler) {
      subscription.removeListener('message', handler);
    }
  }

  const actualDurationMs = (Bun.nanoseconds() - startTime) / 1_000_000;
  const latencySummary = histogram.summary();
  const actualRate = calculateThroughput(receivedCount, actualDurationMs);

  return {
    loadPercentage: (targetMessagesPerSec / CONFIG.baselineRate) * 100,
    targetRate: targetMessagesPerSec,
    actualRate,
    messagesProcessed: receivedCount,
    latency: {
      p50: latencySummary.p50,
      p95: latencySummary.p95,
      p99: latencySummary.p99,
      mean: latencySummary.mean,
    },
    durationMs: actualDurationMs,
  };
}

async function runSaturation() {
  checkBunVersion();

  const pubsub = new PubSub({ projectId: 'bench-saturation' });
  const loadResults: LoadLevelResult[] = [];
  const errors: string[] = [];

  try {
    console.log('\nSaturation Point Detection');
    console.log('='.repeat(60));

    console.log(
      `\nBaseline rate: ${CONFIG.baselineRate.toLocaleString()} msgs/sec`
    );
    console.log(
      `Messages per level: ${CONFIG.messagesPerLevel.toLocaleString()}`
    );
    console.log(
      `Load levels: ${CONFIG.loadLevels.map((l) => `${(l * 100).toFixed(0)}%`).join(', ')}\n`
    );

    const [topic] = await pubsub.createTopic('saturation-topic');
    const [subscription] = await pubsub.createSubscription(
      'saturation-topic',
      'saturation-sub'
    );

    subscription.on('error', (error: Error) => {
      errors.push(error.message);
    });

    subscription.open();

    console.log(`Warming up with ${CONFIG.warmupMessages} messages...`);
    const warmupPayload = Buffer.alloc(CONFIG.payloadSize, 'x');
    let warmupReceived = 0;

    const warmupComplete = new Promise<void>((resolve) => {
      const warmupHandler = (message: Message) => {
        message.ack();
        warmupReceived++;
        if (warmupReceived === CONFIG.warmupMessages) {
          subscription.removeListener('message', warmupHandler);
          resolve();
        }
      };
      subscription.on('message', warmupHandler);
    });

    for (let i = 0; i < CONFIG.warmupMessages; i++) {
      await topic.publishMessage({ data: warmupPayload });
    }

    await warmupComplete;
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log('Warmup complete. Starting load ramping...\n');

    Bun.gc(true);

    for (const loadLevel of CONFIG.loadLevels) {
      const targetRate = Math.round(CONFIG.baselineRate * loadLevel);

      console.log(
        `Running at ${(loadLevel * 100).toFixed(0)}% load (${targetRate.toLocaleString()} msgs/sec)...`
      );

      const result = await runLoadLevel(
        topic,
        subscription,
        targetRate
      );

      loadResults.push(result);

      console.log(
        `  Actual rate: ${result.actualRate.toLocaleString(undefined, { maximumFractionDigits: 2 })} msgs/sec`
      );
      console.log(`  P50: ${result.latency.p50.toFixed(3)}ms`);
      console.log(`  P95: ${result.latency.p95.toFixed(3)}ms`);
      console.log(`  P99: ${result.latency.p99.toFixed(3)}ms\n`);

      Bun.gc(true);
    }

    await subscription.close();
    await topic.delete();

    const inflectionPoint = detectInflectionPoint(loadResults);

    console.log('Saturation Analysis');
    console.log('='.repeat(60));
    if (inflectionPoint) {
      console.log(
        `\nInflection point detected at ${inflectionPoint.loadPercentage.toFixed(0)}% load`
      );
      console.log(
        `  Throughput: ${inflectionPoint.targetRate.toLocaleString()} msgs/sec`
      );
      console.log(`  P99 latency: ${inflectionPoint.latency.p99.toFixed(3)}ms`);
    } else {
      console.log('\nNo clear inflection point detected in tested range.');
      console.log(
        'System may support higher load than tested maximum.'
      );
    }

    let totalMessages = 0;
    let totalDuration = 0;

    for (const result of loadResults) {
      totalMessages += result.messagesProcessed;
      totalDuration += result.durationMs;
    }

    const overallThroughput = calculateThroughput(totalMessages, totalDuration);

    const benchmarkResult = createResult(
      'saturation',
      {
        baselineRate: CONFIG.baselineRate,
        loadLevels: CONFIG.loadLevels,
        messagesPerLevel: CONFIG.messagesPerLevel,
        payloadSize: CONFIG.payloadSize,
        inflectionPoint: inflectionPoint
          ? {
              loadPercentage: inflectionPoint.loadPercentage,
              targetRate: inflectionPoint.targetRate,
              p99Latency: inflectionPoint.latency.p99,
            }
          : null,
        loadResults: loadResults.map((r) => ({
          loadPercentage: r.loadPercentage,
          targetRate: r.targetRate,
          actualRate: r.actualRate,
          p50: r.latency.p50,
          p95: r.latency.p95,
          p99: r.latency.p99,
        })),
      },
      {
        messagesPerSec: overallThroughput,
        latency: {
          count: totalMessages,
          p50: loadResults[loadResults.length - 1]?.latency.p50 ?? 0,
          p95: loadResults[loadResults.length - 1]?.latency.p95 ?? 0,
          p99: loadResults[loadResults.length - 1]?.latency.p99 ?? 0,
          min: Math.min(...loadResults.map((r) => r.latency.p50)),
          max: Math.max(...loadResults.map((r) => r.latency.p99)),
          mean: loadResults[loadResults.length - 1]?.latency.mean ?? 0,
        },
        durationMs: totalDuration,
      },
      errors.length === 0,
      errors
    );

    printSummary(benchmarkResult);
    await saveResults(benchmarkResult);
  } finally {
    await pubsub.close();
  }
}

function detectInflectionPoint(
  results: LoadLevelResult[]
): LoadLevelResult | null {
  if (results.length < 3) return null;

  for (let i = 1; i < results.length - 1; i++) {
    const prev = results[i - 1]!;
    const curr = results[i]!;
    const next = results[i + 1]!;

    const prevGrowth = curr.latency.p99 - prev.latency.p99;
    const nextGrowth = next.latency.p99 - curr.latency.p99;

    if (nextGrowth > prevGrowth * 2) {
      return curr;
    }
  }

  return null;
}

if (import.meta.main) {
  runSaturation().catch(console.error);
}

export { runSaturation };
