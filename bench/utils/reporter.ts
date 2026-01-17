/**
 * Benchmark reporting utilities.
 * Captures environment info and formats output as JSON + text.
 */

import { cpus, totalmem, platform, arch } from 'node:os';
import { heapStats } from 'bun:jsc';
import type { LatencySummary } from './stats';

export interface Environment {
  bunVersion: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  platform: string;
  arch: string;
  timestamp: string;
  commitHash?: string;
}

export interface MemoryStats {
  peakRssMB: number;
  heapUsedMB: number;
  heapSizeMB: number;
}

export interface BenchmarkMetrics {
  messagesPerSec: number;
  latency: LatencySummary;
  memory: MemoryStats;
  durationMs: number;
}

export interface BenchmarkResult {
  scenario: string;
  config: Record<string, unknown>;
  environment: Environment;
  metrics: BenchmarkMetrics;
  success: boolean;
  errors?: string[];
}

export function captureEnvironment(): Environment {
  const cpuInfo = cpus();
  let commitHash: string | undefined;

  try {
    const result = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']);
    if (result.exitCode === 0) {
      commitHash = result.stdout.toString().trim();
    }
  } catch {
    // Git not available
  }

  return {
    bunVersion: Bun.version,
    cpuModel: cpuInfo[0]?.model ?? 'Unknown',
    cpuCores: cpuInfo.length,
    totalMemoryMB: Math.round(totalmem() / 1_048_576),
    platform: platform(),
    arch: arch(),
    timestamp: new Date().toISOString(),
    commitHash,
  };
}

export function captureMemory(): MemoryStats {
  const heap = heapStats();
  const mem = process.memoryUsage();

  return {
    peakRssMB: Math.round(mem.rss / 1_048_576 * 100) / 100,
    heapUsedMB: Math.round(mem.heapUsed / 1_048_576 * 100) / 100,
    heapSizeMB: Math.round((heap.heapSize || mem.heapTotal) / 1_048_576 * 100) / 100,
  };
}

export function printSummary(result: BenchmarkResult): void {
  const { scenario, config, metrics, success, errors } = result;

  console.log('\n' + '='.repeat(60));
  console.log(`Scenario: ${scenario}`);
  console.log('='.repeat(60));

  console.log(`\nStatus: ${success ? '\x1b[32m\u2713 PASS\x1b[0m' : '\x1b[31m\u2717 FAIL\x1b[0m'}`);

  console.log('\nConfiguration:');
  for (const [key, value] of Object.entries(config)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log('\nThroughput:');
  console.log(`  Messages/sec: ${metrics.messagesPerSec.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  console.log(`  Duration: ${metrics.durationMs.toFixed(2)}ms`);
  console.log(`  Total messages: ${metrics.latency.count.toLocaleString()}`);

  console.log('\nLatency (ms):');
  console.log(`  P50:  ${metrics.latency.p50.toFixed(3)}`);
  console.log(`  P95:  ${metrics.latency.p95.toFixed(3)}`);
  console.log(`  P99:  ${metrics.latency.p99.toFixed(3)}`);
  console.log(`  Min:  ${metrics.latency.min.toFixed(3)}`);
  console.log(`  Max:  ${metrics.latency.max.toFixed(3)}`);
  console.log(`  Mean: ${metrics.latency.mean.toFixed(3)}`);

  console.log('\nMemory:');
  console.log(`  Peak RSS: ${metrics.memory.peakRssMB} MB`);
  console.log(`  Heap Used: ${metrics.memory.heapUsedMB} MB`);
  console.log(`  Heap Size: ${metrics.memory.heapSizeMB} MB`);

  if (errors && errors.length > 0) {
    console.log('\n\x1b[31mErrors:\x1b[0m');
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

export async function saveResults(result: BenchmarkResult): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${result.scenario}-${timestamp}.json`;
  const path = `${import.meta.dir}/../results/${filename}`;

  await Bun.write(path, JSON.stringify(result, null, 2));
  console.log(`Results saved to: bench/results/${filename}`);

  return path;
}

export function createResult(
  scenario: string,
  config: Record<string, unknown>,
  metrics: Omit<BenchmarkMetrics, 'memory'>,
  success: boolean,
  errors?: string[]
): BenchmarkResult {
  return {
    scenario,
    config,
    environment: captureEnvironment(),
    metrics: {
      ...metrics,
      memory: captureMemory(),
    },
    success,
    errors: errors && errors.length > 0 ? errors : undefined,
  };
}
