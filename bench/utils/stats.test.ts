import { test, expect, describe } from 'bun:test';
import { Histogram, percentile, calculateThroughput } from './stats';

describe('percentile', () => {
  test('returns 0 for empty array', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  test('returns single value for single-element array', () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([42], 0.99)).toBe(42);
  });

  test('calculates correct median (P50) for odd-length array', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0.5)).toBe(3);
  });

  test('calculates correct median (P50) for even-length array', () => {
    const values = [1, 2, 3, 4];
    expect(percentile(values, 0.5)).toBe(2.5);
  });

  test('calculates distinct P95 and P99 for small datasets', () => {
    const values = [1, 2, 3, 4, 5];
    const p95 = percentile(values, 0.95);
    const p99 = percentile(values, 0.99);

    expect(p95).toBe(4.8);
    expect(p99).toBe(4.96);
    expect(p95).not.toBe(p99);
  });

  test('returns minimum for P0', () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0)).toBe(10);
  });

  test('returns maximum for P100', () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 1.0)).toBe(50);
  });

  test('handles larger dataset with linear interpolation', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(percentile(values, 0.5)).toBe(50.5);
    expect(percentile(values, 0.95)).toBe(95.05);
    expect(percentile(values, 0.99)).toBe(99.01);
  });

  test('handles non-integer percentiles correctly', () => {
    const values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    expect(percentile(values, 0.25)).toBe(25);
    expect(percentile(values, 0.75)).toBe(75);
  });

  test('uses linear interpolation (R-7 method)', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p90 = percentile(values, 0.9);

    const expectedIndex = (10 - 1) * 0.9;
    const lower = Math.floor(expectedIndex);
    const upper = Math.ceil(expectedIndex);
    const weight = expectedIndex - lower;
    const expected = values[lower]! * (1 - weight) + values[upper]! * weight;

    expect(p90).toBe(expected);
    expect(p90).toBe(9.1);
  });
});

describe('Histogram', () => {
  test('initializes empty', () => {
    const hist = new Histogram();
    expect(hist.getCount()).toBe(0);
  });

  test('records values in nanoseconds and converts to milliseconds', () => {
    const hist = new Histogram();
    hist.record(1_000_000);
    hist.record(2_000_000);

    const summary = hist.summary();
    expect(summary.count).toBe(2);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(2);
  });

  test('records values directly in milliseconds', () => {
    const hist = new Histogram();
    hist.recordMs(1.5);
    hist.recordMs(2.5);

    const summary = hist.summary();
    expect(summary.count).toBe(2);
    expect(summary.min).toBe(1.5);
    expect(summary.max).toBe(2.5);
  });

  test('calculates correct summary statistics', () => {
    const hist = new Histogram();
    for (let i = 1; i <= 100; i++) {
      hist.recordMs(i);
    }

    const summary = hist.summary();
    expect(summary.count).toBe(100);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(100);
    expect(summary.mean).toBe(50.5);
    expect(summary.p50).toBe(50.5);
  });

  test('returns zeros for empty histogram summary', () => {
    const hist = new Histogram();
    const summary = hist.summary();

    expect(summary.count).toBe(0);
    expect(summary.p50).toBe(0);
    expect(summary.p95).toBe(0);
    expect(summary.p99).toBe(0);
    expect(summary.min).toBe(0);
    expect(summary.max).toBe(0);
    expect(summary.mean).toBe(0);
  });

  test('resets histogram', () => {
    const hist = new Histogram();
    hist.recordMs(1);
    hist.recordMs(2);

    expect(hist.getCount()).toBe(2);

    hist.reset();
    expect(hist.getCount()).toBe(0);

    const summary = hist.summary();
    expect(summary.count).toBe(0);
  });

  test('handles realistic benchmark latency values', () => {
    const hist = new Histogram();

    const latencies = [0.5, 0.8, 1.2, 0.9, 1.5, 2.1, 0.7, 1.0, 0.6, 3.5];
    for (const lat of latencies) {
      hist.recordMs(lat);
    }

    const summary = hist.summary();
    expect(summary.count).toBe(10);
    expect(summary.min).toBe(0.5);
    expect(summary.max).toBe(3.5);
    expect(summary.p50).toBeGreaterThan(0.8);
    expect(summary.p50).toBeLessThan(1.2);
    expect(summary.p95).toBeGreaterThan(2.0);
    expect(summary.p99).toBeGreaterThan(3.0);
  });

  test('maintains precision with nanosecond input', () => {
    const hist = new Histogram();

    hist.record(500_000);
    hist.record(1_000_000);
    hist.record(1_500_000);

    const summary = hist.summary();
    expect(summary.min).toBe(0.5);
    expect(summary.p50).toBe(1.0);
    expect(summary.max).toBe(1.5);
  });
});

describe('calculateThroughput', () => {
  test('calculates messages per second correctly', () => {
    expect(calculateThroughput(1000, 1000)).toBe(1000);
    expect(calculateThroughput(5000, 1000)).toBe(5000);
    expect(calculateThroughput(100, 100)).toBe(1000);
  });

  test('handles fractional durations', () => {
    expect(calculateThroughput(1000, 500)).toBe(2000);
    expect(calculateThroughput(100, 250)).toBe(400);
  });

  test('returns 0 for zero duration', () => {
    expect(calculateThroughput(1000, 0)).toBe(0);
  });

  test('returns 0 for negative duration', () => {
    expect(calculateThroughput(1000, -100)).toBe(0);
  });

  test('calculates realistic benchmark throughput', () => {
    const messageCount = 10_000;
    const durationMs = 221.08;
    const throughput = calculateThroughput(messageCount, durationMs);

    expect(throughput).toBeGreaterThan(45_000);
    expect(throughput).toBeLessThan(46_000);
  });
});
