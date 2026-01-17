import { describe, expect, test } from 'bun:test';
import { compareResults, formatComparison, loadResult } from './compare';
import type { BenchmarkResult } from './reporter';

const createMockResult = (overrides: Partial<BenchmarkResult> = {}): BenchmarkResult => ({
	scenario: 'throughput',
	config: { messageCount: 10000, payloadSize: 1024 },
	environment: {
		bunVersion: '1.3.6',
		cpuModel: 'Apple M1',
		cpuCores: 8,
		totalMemoryMB: 16384,
		platform: 'darwin',
		arch: 'arm64',
		timestamp: '2026-01-17T12:00:00.000Z',
		commitHash: 'abc1234',
	},
	metrics: {
		messagesPerSec: 1000,
		durationMs: 10000,
		latency: {
			count: 10000,
			p50: 1.0,
			p95: 2.0,
			p99: 3.0,
			min: 0.5,
			max: 5.0,
			mean: 1.5,
		},
		memory: {
			peakRssMB: 100,
			heapUsedMB: 50,
			heapSizeMB: 75,
		},
	},
	success: true,
	...overrides,
});

describe('loadResult', () => {
	test('loads valid benchmark result', async () => {
		const result = await loadResult('bench/results/throughput-2026-01-17T22-18-48-308Z.json');

		expect(result.scenario).toBe('throughput');
		expect(result.metrics).toBeDefined();
		expect(result.environment).toBeDefined();
		expect(result.success).toBeDefined();
	});

	test('throws error for non-existent file', async () => {
		await expect(loadResult('bench/results/non-existent.json')).rejects.toThrow(
			'Failed to load benchmark result',
		);
	});

	test('throws error for invalid JSON format', async () => {
		const invalidPath = '/tmp/claude/invalid-benchmark.json';
		await Bun.write(invalidPath, '{"invalid": true}');

		await expect(loadResult(invalidPath)).rejects.toThrow('Invalid benchmark result format');
	});
});

describe('compareResults', () => {
	test('detects no regression when results are identical', () => {
		const baseline = createMockResult();
		const current = createMockResult();

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(false);
		expect(comparison.regressions).toHaveLength(0);
	});

	test('detects throughput regression when decreased by >10%', () => {
		const baseline = createMockResult({ metrics: { ...createMockResult().metrics, messagesPerSec: 1000 } });
		const current = createMockResult({ metrics: { ...createMockResult().metrics, messagesPerSec: 850 } });

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('Throughput decreased by 15.0%');
		expect(comparison.deltas.throughput.regression).toBe(true);
	});

	test('does not detect throughput regression when decreased by <10%', () => {
		const baseline = createMockResult({ metrics: { ...createMockResult().metrics, messagesPerSec: 1000 } });
		const current = createMockResult({ metrics: { ...createMockResult().metrics, messagesPerSec: 950 } });

		const comparison = compareResults(baseline, current);

		expect(comparison.deltas.throughput.regression).toBe(false);
	});

	test('detects P50 latency regression when increased by >10%', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, latency: { ...baselineMetrics.latency, p50: 1.0 } },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, latency: { ...currentMetrics.latency, p50: 1.2 } },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('P50 latency increased by 20.0%');
		expect(comparison.deltas.latency.p50.regression).toBe(true);
	});

	test('detects P95 latency regression when increased by >10%', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, latency: { ...baselineMetrics.latency, p95: 2.0 } },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, latency: { ...currentMetrics.latency, p95: 2.3 } },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('P95 latency increased by 15.0%');
		expect(comparison.deltas.latency.p95.regression).toBe(true);
	});

	test('detects P99 latency regression when increased by >10%', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, latency: { ...baselineMetrics.latency, p99: 3.0 } },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, latency: { ...currentMetrics.latency, p99: 3.5 } },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('P99 latency increased by 16.7%');
		expect(comparison.deltas.latency.p99.regression).toBe(true);
	});

	test('detects peak RSS memory regression when increased by >10%', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, memory: { ...baselineMetrics.memory, peakRssMB: 100 } },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, memory: { ...currentMetrics.memory, peakRssMB: 120 } },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('Peak RSS memory increased by 20.0%');
		expect(comparison.deltas.memory.peakRss.regression).toBe(true);
	});

	test('detects heap used memory regression when increased by >10%', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, memory: { ...baselineMetrics.memory, heapUsedMB: 50 } },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, memory: { ...currentMetrics.memory, heapUsedMB: 60 } },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions).toContain('Heap used memory increased by 20.0%');
		expect(comparison.deltas.memory.heapUsed.regression).toBe(true);
	});

	test('detects multiple regressions', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: {
				messagesPerSec: 1000,
				durationMs: baselineMetrics.durationMs,
				latency: { ...baselineMetrics.latency, p50: 1.0, p95: 2.0, p99: 3.0 },
				memory: baselineMetrics.memory,
			},
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: {
				messagesPerSec: 800,
				durationMs: currentMetrics.durationMs,
				latency: { ...currentMetrics.latency, p50: 1.3, p95: 2.5, p99: 3.8 },
				memory: currentMetrics.memory,
			},
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(true);
		expect(comparison.regressions.length).toBeGreaterThan(1);
		expect(comparison.regressions).toContain('Throughput decreased by 20.0%');
		expect(comparison.regressions).toContain('P50 latency increased by 30.0%');
		expect(comparison.regressions).toContain('P95 latency increased by 25.0%');
		expect(comparison.regressions).toContain('P99 latency increased by 26.7%');
	});

	test('handles improvements correctly (not regressions)', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: {
				messagesPerSec: 1000,
				durationMs: baselineMetrics.durationMs,
				latency: { ...baselineMetrics.latency, p50: 2.0, p95: 4.0, p99: 6.0 },
				memory: { ...baselineMetrics.memory, peakRssMB: 100, heapUsedMB: 60 },
			},
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: {
				messagesPerSec: 1200,
				durationMs: currentMetrics.durationMs,
				latency: { ...currentMetrics.latency, p50: 1.5, p95: 3.0, p99: 4.5 },
				memory: { ...currentMetrics.memory, peakRssMB: 80, heapUsedMB: 50 },
			},
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.regression).toBe(false);
		expect(comparison.regressions).toHaveLength(0);
		expect(comparison.deltas.throughput.percentChange).toBeGreaterThan(0);
		expect(comparison.deltas.latency.p50.percentChange).toBeLessThan(0);
		expect(comparison.deltas.memory.peakRss.percentChange).toBeLessThan(0);
	});

	test('handles zero baseline values gracefully', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, messagesPerSec: 0 },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, messagesPerSec: 100 },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.deltas.throughput.percentChange).toBe(0);
	});

	test('throws error for mismatched scenarios', () => {
		const baseline = createMockResult({ scenario: 'throughput' });
		const current = createMockResult({ scenario: 'firehose' });

		expect(() => compareResults(baseline, current)).toThrow(
			'Scenario mismatch: baseline is "throughput" but current is "firehose"',
		);
	});

	test('calculates correct percent changes', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, messagesPerSec: 1000 },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, messagesPerSec: 1100 },
		});

		const comparison = compareResults(baseline, current);

		expect(comparison.deltas.throughput.percentChange).toBeCloseTo(0.1, 2);
		expect(comparison.deltas.throughput.delta).toBe(100);
	});
});

describe('formatComparison', () => {
	test('formats comparison with no regressions', () => {
		const baseline = createMockResult();
		const current = createMockResult();
		const comparison = compareResults(baseline, current);

		const formatted = formatComparison(comparison);

		expect(formatted).toContain('Benchmark Comparison: throughput');
		expect(formatted).toContain('✓ PASS');
		expect(formatted).not.toContain('Regressions:');
	});

	test('formats comparison with regressions', () => {
		const baselineMetrics = createMockResult().metrics;
		const baseline = createMockResult({
			metrics: { ...baselineMetrics, messagesPerSec: 1000 },
		});
		const currentMetrics = createMockResult().metrics;
		const current = createMockResult({
			metrics: { ...currentMetrics, messagesPerSec: 800 },
		});
		const comparison = compareResults(baseline, current);

		const formatted = formatComparison(comparison);

		expect(formatted).toContain('Benchmark Comparison: throughput');
		expect(formatted).toContain('✗ REGRESSION');
		expect(formatted).toContain('Regressions:');
		expect(formatted).toContain('Throughput decreased by');
	});

	test('includes environment information', () => {
		const baseline = createMockResult();
		const current = createMockResult();
		const comparison = compareResults(baseline, current);

		const formatted = formatComparison(comparison);

		expect(formatted).toContain('Environment:');
		expect(formatted).toContain('Baseline Bun: 1.3.6');
		expect(formatted).toContain('Current Bun:  1.3.6');
	});

	test('includes commit hashes when available', () => {
		const baseline = createMockResult({ environment: { ...createMockResult().environment, commitHash: 'abc1234' } });
		const current = createMockResult({ environment: { ...createMockResult().environment, commitHash: 'def5678' } });
		const comparison = compareResults(baseline, current);

		const formatted = formatComparison(comparison);

		expect(formatted).toContain('Baseline commit: abc1234');
		expect(formatted).toContain('Current commit:  def5678');
	});

	test('includes all metric categories', () => {
		const baseline = createMockResult();
		const current = createMockResult();
		const comparison = compareResults(baseline, current);

		const formatted = formatComparison(comparison);

		expect(formatted).toContain('Throughput:');
		expect(formatted).toContain('Latency (ms):');
		expect(formatted).toContain('Memory (MB):');
		expect(formatted).toContain('Duration:');
	});
});
