/**
 * Statistics utilities for benchmark latency tracking.
 * Uses high-precision timing with Bun.nanoseconds().
 */

export interface LatencySummary {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

export class Histogram {
  private samples: number[] = [];

  record(valueNs: number): void {
    this.samples.push(valueNs / 1_000_000);
  }

  recordMs(valueMs: number): void {
    this.samples.push(valueMs);
  }

  getCount(): number {
    return this.samples.length;
  }

  summary(): LatencySummary {
    if (this.samples.length === 0) {
      return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      count: len,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      min: sorted[0]!,
      max: sorted[len - 1]!,
      mean: sorted.reduce((a, b) => a + b, 0) / len,
    };
  }

  reset(): void {
    this.samples = [];
  }
}

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil(sortedValues.length * p) - 1;
  return sortedValues[Math.max(0, index)]!;
}

export function calculateThroughput(messageCount: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return (messageCount / durationMs) * 1000;
}
