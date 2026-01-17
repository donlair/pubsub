# Benchmarking Implementation Plan

## Overview

This document captures the implementation plan for the Pub/Sub library benchmarking infrastructure, based on the spec in `specs/10-benchmarking.md`.

## Review Status

**Reviewed**: 2026-01-17
**Status**: Approved with revisions (incorporated below)

## Runtime Requirements

### Bun Version Enforcement (Spec §24-31)

All benchmark scenarios must check Bun version at startup:

```typescript
const MIN_BUN_VERSION = '1.1.31';
if (Bun.version < MIN_BUN_VERSION) {
  console.warn(`⚠️  Warning: Bun ${Bun.version} < ${MIN_BUN_VERSION}. Results may vary due to GC/runtime differences.`);
}
```

Version differences significantly affect performance characteristics. Always document exact Bun version in results.

### Warmup Phase Standards (Spec §247)

All scenarios must include a warmup phase before measurement:

| Scenario | Warmup | Rationale |
|----------|--------|-----------|
| Throughput | 1,000 messages | Standard warmup for JIT optimization |
| Firehose | 100 messages per payload size | Warm up serialization paths |
| Fan-Out | 50 messages (5,000 deliveries) | Warm up routing and subscriber paths |
| Thundering Herd | 50 concurrent publishers | Warm up connection handling |
| Saturation | 1,000 messages at 50% load | Warm up before ramping |

**Minimum requirement**: 1,000 iterations OR 5 seconds, whichever comes first.

### GC Handling (Spec §252)

Force garbage collection between test phases to ensure clean measurements:

```typescript
// Between payload size iterations in Firehose
Bun.gc(true);

// Between load levels in Saturation
Bun.gc(true);

// After warmup, before measurement
Bun.gc(true);
```

This prevents GC from previous phases affecting subsequent measurements.

### Iteration and Statistical Rigor (Spec §251)

**Current limitation**: Scenarios run once and report single results.

**Spec requirement**: "Run multiple iterations (minimum 5) and report median"

**Planned enhancement**: Add `--iterations=N` flag to scenario runner:
```bash
bun bench/scenarios/throughput.ts --iterations=5
```

Until implemented, run scenarios manually multiple times for statistical validity.

## Architecture Decision

**Chosen Approach: Pragmatic Balance**

After evaluating three approaches (Minimal, Clean Architecture, Pragmatic), we selected the Pragmatic Balance approach which:

- Creates a thin utility layer with 2 shared modules (stats, reporter)
- Keeps scenarios as standalone scripts that import utilities
- Avoids heavy frameworks while eliminating code duplication

### Trade-offs

| Aspect | Minimal | Clean Architecture | Pragmatic (Chosen) |
|--------|---------|-------------------|-------------------|
| Files | 5 scenarios only | 7+ (framework + scenarios) | 7 (utils + scenarios) |
| Duplication | ~150 lines/scenario | 0 | 0 |
| Learning curve | Lowest | Highest | Low |
| Extensibility | Manual copy | Implement interface | Add script + import utils |

**Rationale**: The spec defines 6 scenario types with identical metrics (msgs/sec, p50/p95/p99, memory). Without shared stats/reporter, we'd duplicate ~150 lines across each scenario. Clean Architecture's framework is overkill since scenarios differ significantly.

## Directory Structure

```
bench/
├── utils/
│   ├── stats.ts          # Histogram class, percentile calculations
│   ├── reporter.ts       # Environment capture + JSON/text output
│   └── compare.ts        # Regression comparison (planned)
├── scenarios/
│   ├── throughput.ts     # Baseline: 1 topic, 1 subscriber
│   ├── firehose.ts       # Ingestion: 1 topic, 0 subscribers
│   ├── fanout.ts         # Routing: 1 topic, 50 subscribers
│   ├── thundering-herd.ts # Connection storm: 1000 publishers
│   ├── saturation.ts     # Load ramping (planned)
│   └── soak.ts           # Memory stability (deferred)
├── mitata/
│   ├── serialization.bench.ts
│   ├── batching.bench.ts
│   ├── ack-nack.bench.ts
│   └── flow-control.bench.ts
├── results/              # gitignored
├── README.md
└── IMPLEMENTATION_PLAN.md
```

## Components

### 1. Statistics Utility (`bench/utils/stats.ts`)

**Responsibility**: Latency tracking and percentile calculations

**Exports**:
- `Histogram` class with `record()`, `summary()`, `reset()`
- `percentile()` function for nth percentile calculation
- `calculateThroughput()` for msgs/sec calculation
- `LatencySummary` interface

**Key Design**:
- Records values in nanoseconds, converts to milliseconds on output
- Uses simple array-based storage for short benchmarks (10K-100K samples)
- Sorting done only at summary time to minimize overhead
- **Long-running support**: For soak tests, implement reservoir sampling or periodic
  aggregation to handle millions of samples without memory exhaustion. The histogram
  should support a `maxSamples` option that enables reservoir sampling when exceeded.

### 2. Reporter Utility (`bench/utils/reporter.ts`)

**Responsibility**: Environment capture and output formatting

**Exports**:
- `captureEnvironment()` - Bun version, CPU, memory, git commit
- `captureMemory()` - RSS, heap stats via `bun:jsc`
- `printSummary()` - Console output with colors
- `saveResults()` - JSON file to `bench/results/`
- `createResult()` - Helper to build `BenchmarkResult` object

**Key Design**:
- Environment captured once per benchmark run
- Memory captured at end of benchmark (peak values)
- JSON output includes full environment for reproducibility

### 3. Scenario: Throughput (`bench/scenarios/throughput.ts`)

**Purpose**: Baseline msgs/sec for regression tracking

**Configuration**:
- 1 topic, 1 subscriber, immediate ack
- 10,000 messages, 1KB payload
- 1,000 message warmup

**Metrics**:
- End-to-end latency (publish → ack)
- Messages per second
- Memory usage

**Success Criteria**: Document baseline, track ±10% variance

### 4. Scenario: Firehose (`bench/scenarios/firehose.ts`)

**Purpose**: Maximum write throughput without consumption

**Configuration**:
- 1 topic, 0 subscribers
- Payload sizes: 1KB, 10KB, 1MB
- 1,000 messages per size
- 100 message warmup per payload size
- `Bun.gc(true)` between payload size iterations

**Metrics**:
- Publish latency only (no e2e)
- Throughput per payload size

**Success Criteria**:
- 1KB: P99 < 50ms (per spec)
- 10KB: P99 < 100ms (interpolated, not in spec)
- 1MB: P99 < 200ms (per spec)

### 5. Scenario: Fan-Out (`bench/scenarios/fanout.ts`)

**Purpose**: Routing efficiency under fan-out load

**Configuration**:
- 1 topic, 50 subscribers
- 100 msg/s publish rate
- 10 second duration
- 50 message warmup (2,500 total deliveries) before measurement
- `Bun.gc(true)` after warmup

**Metrics**:
- End-to-end latency (publish → all 50 subscribers ack)
- Total messages delivered
- Delivery rate percentage

**Success Criteria**: P99 e2e latency < 100ms

### 6. Scenario: Thundering Herd (`bench/scenarios/thundering-herd.ts`)

**Purpose**: Robustness under sudden concurrent load

**Configuration**:
- 1,000 concurrent publishers (Promise.all)
- 1 message per publisher
- 50 warmup publishers

**Metrics**:
- Success/error counts
- Completion time
- Latency distribution

**Success Criteria**: 0% error rate

### 7. Scenario: Soak Test (`bench/scenarios/soak.ts`) - DEFERRED

**Purpose**: Memory leak detection over extended runtime

**Configuration** (when implemented):
- 50% of max throughput
- 4-8 hour duration
- Periodic memory sampling

**Success Criteria**: RSS growth < 10% after warmup

**Status**: Stub created, implementation deferred per user request

### 8. Scenario: Saturation Point Detection (`bench/scenarios/saturation.ts`) - PLANNED

**Purpose**: Identify throughput ceiling for capacity planning (spec §179-189)

**Configuration**:
- Start at 50% of estimated capacity
- Incrementally increase load (50%, 75%, 90%, 100%, 110%, 125%)
- Measure latency at each level
- 30 second stabilization period per level
- 1,000 message warmup at 50% load before ramping
- `Bun.gc(true)` between each load level

**Metrics**:
- Latency vs throughput curve
- Inflection point (where latency growth becomes exponential)
- Event loop saturation indicators

**Success Criteria**: Document inflection point as capacity planning metric

**Detection Logic**:
1. Run throughput test at each load level
2. Plot latency vs throughput
3. Saturation point = where latency curve inflects from linear to exponential
4. May occur before CPU reaches 100%

**Status**: To be implemented

### 9. Microbenchmarks (`bench/mitata/*.bench.ts`)

**Purpose**: Hot-path performance validation

**Benchmarks**:
- `serialization.bench.ts` - Buffer encoding, JSON stringify
- `batching.bench.ts` - Batch assembly, trigger checks
- `ack-nack.bench.ts` - Lease operations, timer management
- `flow-control.bench.ts` - Capacity checks, counter updates

**Tool**: mitata (Bun-optimized microbenchmark library)

### 10. Regression Comparison (`bench/utils/compare.ts`) - PLANNED

**Purpose**: Compare benchmark results across commits for ±10% variance tracking

**Exports**:
- `loadResult(path)` - Load a saved benchmark result JSON
- `compareResults(baseline, current)` - Calculate deltas and flag regressions
- `formatComparison()` - Human-readable comparison output

**Usage**:
```bash
bun bench/utils/compare.ts results/throughput-baseline.json results/throughput-latest.json
```

**Output**:
- Throughput delta (% change)
- Latency deltas (p50, p95, p99)
- Memory delta
- PASS/FAIL based on ±10% threshold

**Status**: To be implemented

## Benchmark Profiles (Deferred)

The spec (§191-228) defines extensive configuration matrices. These are documented here
for future implementation but deferred from initial release:

### Message Size Mixes
| Profile | Distribution |
|---------|--------------|
| Small-only | 100% 1KB |
| Large-only | 100% 500KB |
| Mixed | 90% 1KB, 10% 500KB |
| Mixed-heavy | 50% 1KB, 50% 500KB |
| Full-spectrum | 70% 1KB, 20% 10KB, 8% 500KB, 2% 1MB |

### Concurrency Profiles
- Publishers: 1, 4, 8
- Subscribers per topic: 1, 4, 50
- Subscriber concurrency: 1, 4, 16
- In-flight limits: default settings

### Additional Coverage (Deferred)
- Ordering key tests: 8 keys, uniform distribution
- Batching sizes: 1, 10, 100 messages per batch

**Rationale for deferral**: Initial implementation focuses on single-configuration
scenarios to establish baselines. Profile matrices add combinatorial complexity
better suited for CI automation phase.

## Package Configuration

### Scripts Added to `package.json`

```json
{
  "bench:throughput": "bun bench/scenarios/throughput.ts",
  "bench:firehose": "bun bench/scenarios/firehose.ts",
  "bench:fanout": "bun bench/scenarios/fanout.ts",
  "bench:herd": "bun bench/scenarios/thundering-herd.ts",
  "bench:micro": "bun bench/mitata/*.bench.ts",
  "bench:all": "bun run bench:throughput && ..."
}
```

### Dependencies Added

```json
{
  "devDependencies": {
    "mitata": "^1.0.10"
  }
}
```

### Gitignore Additions

```
bench/results/*.json
bench/results/*.txt
*.cpuprofile
heap.json
```

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `bench/utils/stats.ts` | ✅ Complete | Histogram, percentiles |
| `bench/utils/reporter.ts` | ✅ Complete | Environment, JSON/text output |
| `bench/utils/compare.ts` | 📋 Planned | Regression comparison utility (HIGH PRIORITY) |
| `bench/utils/version.ts` | 📋 Planned | Bun version enforcement |
| `bench/scenarios/throughput.ts` | ✅ Complete | Baseline benchmark |
| `bench/scenarios/firehose.ts` | ✅ Complete | Ingestion ceiling |
| `bench/scenarios/fanout.ts` | ✅ Complete | Routing efficiency |
| `bench/scenarios/thundering-herd.ts` | ✅ Complete | Connection storm |
| `bench/scenarios/soak.ts` | ⏸️ Deferred | Stub only |
| `bench/scenarios/saturation.ts` | 📋 Planned | Load ramping, inflection detection |
| `bench/mitata/serialization.bench.ts` | ✅ Complete | Buffer/JSON benchmarks |
| `bench/mitata/batching.bench.ts` | ✅ Complete | Batch logic benchmarks |
| `bench/mitata/ack-nack.bench.ts` | ✅ Complete | Ack processing benchmarks |
| `bench/mitata/flow-control.bench.ts` | ✅ Complete | Flow control benchmarks |
| `bench/README.md` | ✅ Complete | Usage documentation |
| `package.json` updates | ✅ Complete | Scripts and mitata dep |
| `.gitignore` updates | ✅ Complete | Ignore results |
| Reservoir sampling in stats.ts | 📋 Planned | Required before soak test |
| Iteration support (`--iterations`) | 📋 Planned | Statistical rigor (median of N runs) |

## Next Steps

### Immediate (Before First Benchmark Run)
1. **Install dependencies**: `bun install` to get mitata
2. **Run verification**: `bun run verify` to ensure no type/lint errors
3. **Run throughput benchmark**: `bun run bench:throughput` to establish baseline
4. **Run all benchmarks**: `bun run bench:all` to validate full suite
5. **Document baseline results**: Update README with actual baseline values

### Short-term (Post-Baseline) - Priority Order
6. **Implement compare.ts**: Regression comparison utility for ±10% tracking
   - **Critical**: Enables spec's core regression tracking goal
   - Must complete before saturation.ts
7. **Add version check utility**: Create `bench/utils/version.ts` with Bun version enforcement
8. **Implement saturation.ts**: Load ramping scenario for capacity planning
9. **Add reservoir sampling**: Update stats.ts before implementing soak test

### Medium-term
10. **Add iteration support**: `--iterations=N` flag for statistical rigor
11. **Implement soak test**: Full 4-8 hour memory stability test
12. **CI integration**: Automated regression detection on commits

## Future Enhancements

### Planned (Priority Order)
1. Compare utility for regression tracking (enables ±10% variance detection)
2. Version check utility (Bun v1.1.31+ enforcement)
3. Saturation point detection scenario
4. Iteration support with median reporting
5. Reservoir sampling for long-running tests
6. Soak test implementation
7. CI integration for automated regression detection

### Deferred
- Benchmark profiles (message size mixes, concurrency matrices)
- Container testing with resource limits (spec §268-279)
- Comparison with Google Pub/Sub emulator
- hyperfine integration for CLI timing (spec §37)

## Tooling Notes

### Included
- **mitata**: Microbenchmarks (installed)
- **Bun.nanoseconds()**: High-precision timing
- **bun:jsc heapStats()**: JS heap analysis
- **MIMALLOC_SHOW_STATS**: Native heap stats
- **bun --cpu-prof**: CPU profiling

### Not Included (Rationale)
- **hyperfine**: CLI timing tool mentioned in spec; not needed for in-process benchmarks.
  Add if external process benchmarking becomes necessary.
