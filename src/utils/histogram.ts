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
	private maxSamples: number | undefined;
	private totalSeen = 0;

	constructor(options?: { maxSamples?: number }) {
		this.maxSamples = options?.maxSamples;
	}

	record(valueNs: number): void {
		this.recordMs(valueNs / 1_000_000);
	}

	recordMs(valueMs: number): void {
		this.totalSeen++;

		if (this.maxSamples === undefined) {
			this.samples.push(valueMs);
			return;
		}

		if (this.samples.length < this.maxSamples) {
			this.samples.push(valueMs);
		} else {
			const randomIndex = Math.floor(Math.random() * this.totalSeen);
			if (randomIndex < this.maxSamples) {
				this.samples[randomIndex] = valueMs;
			}
		}
	}

	getCount(): number {
		return this.totalSeen;
	}

	summary(): LatencySummary {
		if (this.samples.length === 0) {
			return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
		}

		const sorted = [...this.samples].sort((a, b) => a - b);
		const len = sorted.length;

		return {
			count: this.totalSeen,
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
		this.totalSeen = 0;
	}
}

function percentile(sortedValues: number[], p: number): number {
	if (sortedValues.length === 0) return 0;

	const index = (sortedValues.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;

	return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}
