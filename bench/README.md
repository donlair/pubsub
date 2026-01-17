# Benchmarking & Performance Testing

This directory contains benchmarks for measuring Pub/Sub library performance.

## Requirements

- **Bun**: v1.1.31+ (stable `node:http2` support, improved GC behavior)
- **mitata**: Installed as devDependency for microbenchmarks

**Version Note**: Bun version significantly affects performance. All benchmarks log a warning if running on older versions. Always document the exact Bun version in results for reproducibility.

## Quick Start

```bash
# Run baseline throughput benchmark
bun bench/scenarios/throughput.ts

# Run all scenario benchmarks
bun run bench:all

# Run microbenchmarks
bun run bench:micro
```

## Directory Structure

```
bench/
├── utils/
│   ├── stats.ts          # Histogram, percentile calculations
│   ├── reporter.ts       # JSON/text output, environment capture
│   └── compare.ts        # Regression comparison (planned)
├── scenarios/
│   ├── throughput.ts     # Baseline: 1 topic, 1 subscriber
│   ├── firehose.ts       # Ingestion: 1 topic, 0 subscribers
│   ├── fanout.ts         # Routing: 1 topic, 50 subscribers
│   ├── thundering-herd.ts # Connection storm: 1000 concurrent publishers
│   ├── saturation.ts     # Capacity ceiling detection (planned)
│   └── soak.ts           # Memory stability: 4-8 hours (deferred)
├── mitata/
│   ├── serialization.bench.ts  # Buffer/JSON hot paths
│   ├── batching.bench.ts       # Publisher batching logic
│   ├── ack-nack.bench.ts       # Message acknowledgment
│   └── flow-control.bench.ts   # Flow control decisions
├── results/              # gitignored, timestamped outputs
└── README.md
```

## Benchmark Scenarios

### Throughput (Baseline)

**Purpose**: Establish baseline msgs/sec for regression tracking.

**Configuration**: 1 topic, 1 subscriber, immediate ack, 10K messages

**Success criteria**: Track ±10% variance across commits

```bash
bun bench/scenarios/throughput.ts
```

### Firehose (Ingestion Ceiling)

**Purpose**: Determine maximum write throughput without consumption overhead.

**Configuration**: 1 topic, 0 subscribers, payload sizes 1KB/10KB/1MB

**Success criteria**: P99 publish latency < 50ms (1KB), < 200ms (1MB)

```bash
bun bench/scenarios/firehose.ts
```

### Fan-Out (Routing Efficiency)

**Purpose**: Stress test message routing to multiple subscribers.

**Configuration**: 1 topic, 50 subscribers, 100 msg/s for 10 seconds

**Success criteria**: P99 end-to-end latency < 100ms

```bash
bun bench/scenarios/fanout.ts
```

### Thundering Herd (Connection Storm)

**Purpose**: Test robustness under sudden concurrent load.

**Configuration**: 1000 concurrent publishers, 1 message each

**Success criteria**: Zero errors, all messages delivered

```bash
bun bench/scenarios/thundering-herd.ts
```

### Soak Test (Memory Stability) - Deferred

**Purpose**: Detect memory leaks over extended runtime.

**Configuration**: 50% max throughput for 4-8 hours

**Success criteria**: RSS growth < 10% after warmup plateau

```bash
bun bench/scenarios/soak.ts  # Not yet implemented
```

### Saturation Point (Capacity Ceiling) - Planned

**Purpose**: Identify throughput ceiling for capacity planning.

**Configuration**: Load ramping at 50%, 75%, 90%, 100%, 110%, 125% of estimated capacity

**Success criteria**: Document inflection point where latency growth becomes exponential

```bash
bun bench/scenarios/saturation.ts  # Not yet implemented
```

## Regression Comparison - Planned

Compare benchmark results across commits to detect performance regressions:

```bash
bun bench/utils/compare.ts results/throughput-baseline.json results/throughput-latest.json
```

**Output**: Throughput/latency deltas with PASS/FAIL based on ±10% threshold.

## Benchmark Standards

### Warmup Phase

All scenarios include a warmup phase before measurement to allow JIT optimization:

| Scenario | Warmup |
|----------|--------|
| Throughput | 1,000 messages |
| Firehose | 100 messages per payload size |
| Fan-Out | 50 messages (2,500 deliveries) |
| Thundering Herd | 50 concurrent publishers |

**Minimum**: 1,000 iterations OR 5 seconds, whichever comes first.

### GC Handling

Garbage collection is forced between test phases to ensure clean measurements:
- Between payload size iterations in Firehose
- After warmup, before measurement in all scenarios
- Between load levels in Saturation (when implemented)

### Statistical Rigor

**Current limitation**: Scenarios run once per invocation.

For statistically valid results, run scenarios multiple times manually:

```bash
for i in {1..5}; do bun bench/scenarios/throughput.ts; done
```

Report median values when comparing across commits.

## Microbenchmarks

Microbenchmarks use [mitata](https://github.com/evanwashere/mitata) for tight-loop performance validation:

```bash
# Run all microbenchmarks
bun bench/mitata/serialization.bench.ts
bun bench/mitata/batching.bench.ts
bun bench/mitata/ack-nack.bench.ts
bun bench/mitata/flow-control.bench.ts
```

## Output Format

### Console Output

```
============================================================
Scenario: throughput
============================================================

Status: ✓ PASS

Configuration:
  messageCount: 10000
  payloadSize: 1024

Throughput:
  Messages/sec: 45,231.45
  Duration: 221.08ms
  Total messages: 10,000

Latency (ms):
  P50:  0.042
  P95:  0.089
  P99:  0.145
  Min:  0.021
  Max:  1.234
  Mean: 0.051

Memory:
  Peak RSS: 125.32 MB
  Heap Used: 45.12 MB
  Heap Size: 67.89 MB

============================================================
```

### JSON Output

Results are saved to `bench/results/<scenario>-<timestamp>.json`:

```json
{
  "scenario": "throughput",
  "config": {
    "messageCount": 10000,
    "payloadSize": 1024
  },
  "environment": {
    "bunVersion": "1.1.38",
    "cpuModel": "Apple M1 Pro",
    "cpuCores": 10,
    "totalMemoryMB": 32768,
    "platform": "darwin",
    "arch": "arm64",
    "timestamp": "2026-01-17T15:30:45.123Z",
    "commitHash": "92355c7"
  },
  "metrics": {
    "messagesPerSec": 45231.45,
    "latency": {
      "count": 10000,
      "p50": 0.042,
      "p95": 0.089,
      "p99": 0.145,
      "min": 0.021,
      "max": 1.234,
      "mean": 0.051
    },
    "memory": {
      "peakRssMB": 125.32,
      "heapUsedMB": 45.12,
      "heapSizeMB": 67.89
    },
    "durationMs": 221.08
  },
  "success": true
}
```

## Advanced Usage

### CPU Profiling

```bash
bun --cpu-prof bench/scenarios/throughput.ts
# Opens .cpuprofile in DevTools/VS Code
```

### Memory Analysis

```bash
# Show native heap stats on exit
MIMALLOC_SHOW_STATS=1 bun bench/scenarios/throughput.ts
```

### Reduced Memory Mode

```bash
# Run with smaller heap (may increase GC frequency)
bun --smol bench/scenarios/throughput.ts
```

### Heap Snapshot

In scenario code:

```typescript
import { generateHeapSnapshot } from 'bun';

const snapshot = generateHeapSnapshot();
await Bun.write('heap.json', JSON.stringify(snapshot, null, 2));
// Open in Safari DevTools > Timeline > JavaScript Allocations > Import
```

## Success Criteria

| Scenario | Metric | Target |
|----------|--------|--------|
| Firehose (1KB) | P99 publish latency | < 50ms |
| Firehose (1MB) | P99 publish latency | < 200ms |
| Fan-Out (50 subs) | P99 e2e latency | < 100ms |
| Soak (4hr) | RSS growth | < 10% |
| Thundering Herd | Error rate | 0% |
| Throughput | Messages/sec | Document baseline |
| Saturation | Inflection point | Document for capacity planning |

## Troubleshooting

### High Latency Variance

1. Close other applications
2. Disable CPU throttling
3. Run multiple iterations and compare
4. Check for GC pauses (sawtooth pattern)

### Memory Growth

1. Force GC with `Bun.gc(true)` between tests
2. Check for EventEmitter listener accumulation
3. Look for closure references to buffers
4. Review backoff queue unbounded growth

### Inconsistent Results

1. Ensure Bun version matches requirements
2. Document exact environment in results
3. Run warmup phase before measuring
4. Use `Bun.nanoseconds()` for precision timing

## Known Limitations

| Limitation | Workaround | Status |
|------------|------------|--------|
| Single-run execution | Run manually 5+ times, report median | Planned: `--iterations` flag |
| No regression comparison | Compare JSON files manually | Planned: `compare.ts` utility |
| Saturation detection | Use throughput at different loads | Planned: `saturation.ts` scenario |
| Soak test | N/A | Deferred |

## Contributing

When adding new benchmarks:

1. Follow existing scenario patterns
2. Include warmup phase (1000+ iterations or 5s)
3. Force GC between phases with `Bun.gc(true)`
4. Use shared `utils/stats.ts` and `utils/reporter.ts`
5. Add Bun version check at startup
6. Document success criteria in README
7. Add npm script to `package.json`
