import type { BenchmarkResult } from './reporter';

export interface ComparisonResult {
	scenario: string;
	baseline: BenchmarkResult;
	current: BenchmarkResult;
	deltas: {
		throughput: DeltaMetric;
		latency: {
			p50: DeltaMetric;
			p95: DeltaMetric;
			p99: DeltaMetric;
			mean: DeltaMetric;
		};
		memory: {
			peakRss: DeltaMetric;
			heapUsed: DeltaMetric;
		};
		duration: DeltaMetric;
	};
	regression: boolean;
	regressions: string[];
}

export interface DeltaMetric {
	baseline: number;
	current: number;
	delta: number;
	percentChange: number;
	regression: boolean;
}

const REGRESSION_THRESHOLD = 0.1;

/**
 * Loads a benchmark result from a JSON file.
 * @param path - Absolute or relative path to the benchmark result JSON file
 * @returns The parsed benchmark result
 * @throws {Error} If the file cannot be read or has invalid format
 */
export async function loadResult(path: string): Promise<BenchmarkResult> {
	try {
		const file = Bun.file(path);
		const result = (await file.json()) as BenchmarkResult;

		if (!result.scenario || !result.metrics) {
			throw new Error(`Invalid benchmark result format in ${path}`);
		}

		return result;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to load benchmark result from ${path}: ${error.message}`);
		}
		throw error;
	}
}

function calculateDelta(baseline: number, current: number, higherIsBetter: boolean): DeltaMetric {
	const delta = current - baseline;
	const percentChange = baseline === 0 ? 0 : delta / baseline;

	const regression = higherIsBetter
		? percentChange < -REGRESSION_THRESHOLD
		: percentChange > REGRESSION_THRESHOLD;

	return {
		baseline,
		current,
		delta,
		percentChange,
		regression,
	};
}

/**
 * Compares baseline and current benchmark results to detect performance regressions.
 * Uses a 10% threshold for regression detection.
 * @param baseline - The baseline benchmark result
 * @param current - The current benchmark result to compare
 * @returns Comparison result with deltas and regression flags
 * @throws {Error} If scenarios don't match between baseline and current
 */
export function compareResults(baseline: BenchmarkResult, current: BenchmarkResult): ComparisonResult {
	if (baseline.scenario !== current.scenario) {
		throw new Error(
			`Scenario mismatch: baseline is "${baseline.scenario}" but current is "${current.scenario}"`,
		);
	}

	const deltas = {
		throughput: calculateDelta(
			baseline.metrics.messagesPerSec,
			current.metrics.messagesPerSec,
			true,
		),
		latency: {
			p50: calculateDelta(baseline.metrics.latency.p50, current.metrics.latency.p50, false),
			p95: calculateDelta(baseline.metrics.latency.p95, current.metrics.latency.p95, false),
			p99: calculateDelta(baseline.metrics.latency.p99, current.metrics.latency.p99, false),
			mean: calculateDelta(baseline.metrics.latency.mean, current.metrics.latency.mean, false),
		},
		memory: {
			peakRss: calculateDelta(
				baseline.metrics.memory.peakRssMB,
				current.metrics.memory.peakRssMB,
				false,
			),
			heapUsed: calculateDelta(
				baseline.metrics.memory.heapUsedMB,
				current.metrics.memory.heapUsedMB,
				false,
			),
		},
		duration: calculateDelta(baseline.metrics.durationMs, current.metrics.durationMs, false),
	};

	const regressions: string[] = [];

	if (deltas.throughput.regression) {
		regressions.push(
			`Throughput decreased by ${formatPercent(Math.abs(deltas.throughput.percentChange))}`,
		);
	}

	if (deltas.latency.p50.regression) {
		regressions.push(`P50 latency increased by ${formatPercent(deltas.latency.p50.percentChange)}`);
	}

	if (deltas.latency.p95.regression) {
		regressions.push(`P95 latency increased by ${formatPercent(deltas.latency.p95.percentChange)}`);
	}

	if (deltas.latency.p99.regression) {
		regressions.push(`P99 latency increased by ${formatPercent(deltas.latency.p99.percentChange)}`);
	}

	if (deltas.memory.peakRss.regression) {
		regressions.push(
			`Peak RSS memory increased by ${formatPercent(deltas.memory.peakRss.percentChange)}`,
		);
	}

	if (deltas.memory.heapUsed.regression) {
		regressions.push(
			`Heap used memory increased by ${formatPercent(deltas.memory.heapUsed.percentChange)}`,
		);
	}

	return {
		scenario: baseline.scenario,
		baseline,
		current,
		deltas,
		regression: regressions.length > 0,
		regressions,
	};
}

function formatNumber(value: number, decimals = 2): string {
	return value.toFixed(decimals);
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function formatChange(delta: DeltaMetric): string {
	const sign = delta.delta >= 0 ? '+' : '';
	const color = delta.regression ? '\x1b[31m' : delta.delta < 0 ? '\x1b[32m' : '\x1b[0m';
	const reset = '\x1b[0m';
	return `${color}${sign}${formatPercent(delta.percentChange)}${reset}`;
}

/**
 * Formats a comparison result as human-readable text with color coding.
 * @param comparison - The comparison result to format
 * @returns Formatted multi-line string with colors
 */
export function formatComparison(comparison: ComparisonResult): string {
	const lines: string[] = [];

	lines.push('============================================================');
	lines.push(`Benchmark Comparison: ${comparison.scenario}`);
	lines.push('============================================================');
	lines.push('');

	const status = comparison.regression ? '✗ REGRESSION' : '✓ PASS';
	const statusColor = comparison.regression ? '\x1b[31m' : '\x1b[32m';
	lines.push(`Status: ${statusColor}${status}\x1b[0m`);
	lines.push('');

	if (comparison.regression) {
		lines.push('Regressions:');
		for (const regression of comparison.regressions) {
			lines.push(`  • ${regression}`);
		}
		lines.push('');
	}

	lines.push('Environment:');
	lines.push(`  Baseline: ${comparison.baseline.environment.timestamp}`);
	lines.push(`  Current:  ${comparison.current.environment.timestamp}`);
	lines.push(`  Baseline Bun: ${comparison.baseline.environment.bunVersion}`);
	lines.push(`  Current Bun:  ${comparison.current.environment.bunVersion}`);
	if (comparison.baseline.environment.commitHash && comparison.current.environment.commitHash) {
		lines.push(`  Baseline commit: ${comparison.baseline.environment.commitHash}`);
		lines.push(`  Current commit:  ${comparison.current.environment.commitHash}`);
	}
	lines.push('');

	const d = comparison.deltas;

	lines.push('Throughput:');
	lines.push(
		`  Messages/sec: ${formatNumber(d.throughput.baseline)} → ${formatNumber(d.throughput.current)} (${formatChange(d.throughput)})`,
	);
	lines.push('');

	lines.push('Latency (ms):');
	lines.push(
		`  P50:  ${formatNumber(d.latency.p50.baseline)} → ${formatNumber(d.latency.p50.current)} (${formatChange(d.latency.p50)})`,
	);
	lines.push(
		`  P95:  ${formatNumber(d.latency.p95.baseline)} → ${formatNumber(d.latency.p95.current)} (${formatChange(d.latency.p95)})`,
	);
	lines.push(
		`  P99:  ${formatNumber(d.latency.p99.baseline)} → ${formatNumber(d.latency.p99.current)} (${formatChange(d.latency.p99)})`,
	);
	lines.push(
		`  Mean: ${formatNumber(d.latency.mean.baseline)} → ${formatNumber(d.latency.mean.current)} (${formatChange(d.latency.mean)})`,
	);
	lines.push('');

	lines.push('Memory (MB):');
	lines.push(
		`  Peak RSS:  ${formatNumber(d.memory.peakRss.baseline)} → ${formatNumber(d.memory.peakRss.current)} (${formatChange(d.memory.peakRss)})`,
	);
	lines.push(
		`  Heap Used: ${formatNumber(d.memory.heapUsed.baseline)} → ${formatNumber(d.memory.heapUsed.current)} (${formatChange(d.memory.heapUsed)})`,
	);
	lines.push('');

	lines.push('Duration:');
	lines.push(
		`  Total: ${formatNumber(d.duration.baseline)}ms → ${formatNumber(d.duration.current)}ms (${formatChange(d.duration)})`,
	);
	lines.push('');

	lines.push('============================================================');

	return lines.join('\n');
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length !== 2) {
		console.error('Usage: bun bench/utils/compare.ts <baseline.json> <current.json>');
		console.error('');
		console.error('Example:');
		console.error(
			'  bun bench/utils/compare.ts bench/results/throughput-baseline.json bench/results/throughput-latest.json',
		);
		process.exit(1);
	}

	const baselinePath = args[0];
	const currentPath = args[1];

	if (!baselinePath || !currentPath) {
		console.error('Error: Both baseline and current result paths are required');
		process.exit(1);
	}

	try {
		const baseline = await loadResult(baselinePath);
		const current = await loadResult(currentPath);
		const comparison = compareResults(baseline, current);

		console.log(formatComparison(comparison));

		process.exit(comparison.regression ? 1 : 0);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);
		} else {
			console.error('Unknown error occurred');
		}
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
