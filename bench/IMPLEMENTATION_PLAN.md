# Benchmarking Implementation Plan

## Overview

This document captures the implementation plan for the Pub/Sub library benchmarking infrastructure, based on the spec in `specs/10-benchmarking.md`.

## Review Status

**Last Reviewed**: 2026-01-17 (P0 issues #1, #2, #3 resolved)
**Status**: Multiple issues discovered - see "Known Issues" section
**Previous Status**: Approved with revisions (incorporated below)

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
| Fan-Out | 50 messages (2,500 deliveries) | Warm up routing and subscriber paths |
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
- API accepts nanoseconds via `record(valueNs)`, converts to milliseconds internally
- Also provides `recordMs(valueMs)` for direct millisecond input
- Uses simple array-based storage for short benchmarks (10K-100K samples)
- Sorting done only at summary time to minimize overhead
- **Long-running support** (not yet implemented): For soak tests, implement reservoir sampling or periodic
  aggregation to handle millions of samples without memory exhaustion. The histogram
  should support a `maxSamples` option that enables reservoir sampling when exceeded.
- **Known Issue**: Percentile calculation uses non-standard algorithm - see Known Issues section

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
- **Known Issues**: Missing error handling and directory creation in `saveResults()` - see Known Issues section

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
- `serialization.bench.ts` - Buffer encoding, JSON stringify ✅ (tests actual code paths)
- `batching.bench.ts` - Batch assembly, trigger checks ⚠️ (tests mock code, needs rewrite)
- `ack-nack.bench.ts` - Lease operations, timer management ⚠️ (tests mock code, needs rewrite)
- `flow-control.bench.ts` - Capacity checks, counter updates ⚠️ (tests mock code, needs rewrite)

**Tool**: mitata (Bun-optimized microbenchmark library)

**Known Issue**: 3 of 4 microbenchmarks test synthetic/mock implementations instead of actual library code paths. They cannot detect performance regressions in production code. See Known Issues section for details.

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

**Last Review**: 2026-01-17 (parallel agent investigation)

| Component | Status | Notes |
|-----------|--------|-------|
| `bench/utils/stats.ts` | ✅ Complete | Percentile calculation fixed with linear interpolation; comprehensive test suite added |
| `bench/utils/stats.test.ts` | ✅ Complete | Comprehensive test suite with 23 tests |
| `bench/utils/reporter.ts` | ✅ Complete | Error handling and directory creation implemented |
| `bench/utils/compare.ts` | 📋 Planned | Regression comparison utility |
| `bench/utils/version.ts` | 📋 Planned | Bun version enforcement |
| `bench/scenarios/throughput.ts` | ✅ Complete | Bun version check implemented |
| `bench/scenarios/firehose.ts` | ✅ Complete | Bun version check implemented |
| `bench/scenarios/fanout.ts` | ✅ Complete | Bun version check and E2E latency measurement implemented |
| `bench/scenarios/thundering-herd.ts` | ✅ Complete | Bun version check implemented |
| `bench/scenarios/soak.ts` | ⏸️ Deferred | Stub only (correct) |
| `bench/scenarios/saturation.ts` | 📋 Planned | Load ramping, inflection detection |
| `bench/mitata/serialization.bench.ts` | ✅ Complete | Buffer/JSON benchmarks - tests actual code paths |
| `bench/mitata/batching.bench.ts` | ✅ Complete | Tests actual Publisher code - can detect regressions |
| `bench/mitata/ack-nack.bench.ts` | ✅ Complete | Tests actual Message/MessageQueue code - can detect regressions |
| `bench/mitata/flow-control.bench.ts` | ⚠️ Needs Rewrite | Tests mock code, not actual FlowControl classes |
| `bench/README.md` | ✅ Complete | Usage documentation |
| `package.json` updates | ✅ Complete | Scripts and mitata dep |
| `.gitignore` updates | ✅ Complete | Ignore results |
| Reservoir sampling in stats.ts | 📋 Planned | Required before soak test |
| Iteration support (`--iterations`) | 📋 Planned | Statistical rigor (median of N runs) |

## Known Issues (Discovered 2026-01-17)

### Critical Issues (P0) - Correctness Problems

#### 1. Incorrect Percentile Calculation in `stats.ts`
**Status**: ✅ RESOLVED (2026-01-17)

**Location**: `percentile()` function
**Problem**: Uses `Math.ceil(n * p) - 1` which doesn't match any standard percentile algorithm. For small sample sizes, P95 and P99 return identical values (the maximum), making SLO validation unreliable.
**Impact**: All benchmark latency percentiles are incorrect.
**Resolution**: Replaced with standard linear interpolation (R-7 method) and added comprehensive test suite with 23 tests covering edge cases, percentile calculations, and unit conversions. All tests passing.

#### 2. Missing Error Handling in `reporter.ts`
**Status**: ✅ RESOLVED (2026-01-17)

**Location**: `saveResults()` function
**Problem**: `Bun.write()` is not wrapped in try-catch. If write fails (permissions, disk space), the benchmark crashes without recovery.
**Resolution**: Added comprehensive try-catch error handling with meaningful error messages for directory creation and file writing failures.

#### 3. Missing Directory Creation in `reporter.ts`
**Status**: ✅ RESOLVED (2026-01-17)

**Location**: `saveResults()` function
**Problem**: Assumes `bench/results/` directory exists. First run fails if directory is missing.
**Resolution**: Added directory existence check and creation with proper error handling before writing results.

### High Priority Issues (P1) - Spec Violations

#### 4. Missing Bun Version Check in All Scenarios
**Status**: ✅ RESOLVED (2026-01-17)

**Affected Files**: `throughput.ts`, `firehose.ts`, `fanout.ts`, `thundering-herd.ts`
**Problem**: Plan §14-26 requires all scenarios check Bun version at startup and warn if < 1.1.31. None of the 4 implemented scenarios include this check.
**Resolution**: All four scenarios now have MIN_BUN_VERSION check implemented with warning message matching spec requirements.

#### 5. Incorrect E2E Latency Measurement in `fanout.ts`
**Location**: Message handler (line ~48)
**Problem**: Records latency per-subscriber (50 samples per message) instead of measuring time until ALL 50 subscribers acknowledge. Current implementation cannot validate the "P99 e2e < 100ms" success criterion correctly.
**Expected**: Track ack count per message ID, record latency when count reaches 50.
**Impact**: P99 metric measures individual delivery latency, not broadcast completion time.

### High Priority Issues (P2) - Benchmarks Testing Wrong Code

#### 6. `batching.bench.ts` Tests Mock Code
**Status**: ✅ RESOLVED (2026-01-17)

**Problem**: Created synthetic `shouldPublishBatch()` and batch assembly functions instead of importing/testing actual `Publisher` class methods. Also missing time-based trigger (`maxMilliseconds`) coverage.
**Resolution**: Rewritten to test actual Publisher class. Now covers all batch triggers including maxMilliseconds time-based trigger. Can now detect performance regressions in actual Publisher batching logic.

#### 7. `ack-nack.bench.ts` Tests Mock Code
**Status**: ✅ RESOLVED (2026-01-17)

**Problem**: Tests simulated Map/Set operations instead of actual `Message.ack()`, `Message.nack()`, `MessageQueue.ack()`, `MessageQueue.nack()` methods. Missing `modifyAckDeadline()` benchmarks entirely.
**Resolution**: Rewritten to test actual Message and MessageQueue classes. Now covers all message acknowledgment operations including modifyAckDeadline(). Can now detect performance regressions in actual acknowledgment code.

#### 8. `flow-control.bench.ts` Tests Mock Code
**Problem**: Tests standalone synthetic functions instead of actual `SubscriberFlowControl` and `PublisherFlowControl` classes. Also has dead code elimination issues (results discarded without `return`).
**Impact**: Cannot detect performance regressions in actual flow control logic.
**Fix**: Import actual classes, benchmark real `canAccept()`, `acquire()`, `release()` methods.

### Medium Priority Issues (P3) - Robustness

#### 9. No Timeout Protection in `throughput.ts`
**Problem**: If message flow stops, the `allReceived` Promise never resolves and benchmark hangs indefinitely.
**Fix**: Add timeout with `Promise.race()`.

#### 10. Unit Storage Inconsistency in `stats.ts`
**Problem**: Plan says "Records values in nanoseconds" but code stores milliseconds internally (converts on input, not output).
**Note**: This is functional but inconsistent with documentation.

## Prioritized Task List

### ✅ Completed Tasks

1. **✅ COMPLETE - Fix percentile calculation in `stats.ts`** (2026-01-17) - Replaced with standard linear interpolation algorithm (R-7 method). Added comprehensive test suite with 23 tests. All metrics now correct.

2. **✅ COMPLETE - Add error handling to `reporter.ts` saveResults()`** (2026-01-17) - Wrapped `Bun.write()` in try-catch with meaningful error messages.

3. **✅ COMPLETE - Add directory creation to `reporter.ts` saveResults()`** (2026-01-17) - Added directory existence check and creation before writing.

4. **✅ COMPLETE - Add Bun version check to `throughput.ts`** (2026-01-17) - Added MIN_BUN_VERSION check with warning per Plan §14-26.

5. **✅ COMPLETE - Add Bun version check to `fanout.ts`** (2026-01-17) - Added MIN_BUN_VERSION check with warning matching other scenarios.

6. **✅ COMPLETE - Fix E2E latency measurement in `fanout.ts`** (2026-01-17) - Fixed to track per-message acknowledgments across all 50 subscribers. Only records latency when all subscribers have acknowledged (not per-subscriber). Replaced fixed 2s timeout with Promise-based completion tracking. Added 30s timeout for safety. Reset pendingAcks and completedMessages after warmup.

7. **✅ COMPLETE - Add Bun version check to `firehose.ts`** (2026-01-17) - Added MIN_BUN_VERSION check with warning per Plan §14-26, matching pattern from fanout.ts.

8. **✅ COMPLETE - Add Bun version check to `thundering-herd.ts`** (2026-01-17) - Added MIN_BUN_VERSION check with warning per Plan §14-26, matching pattern from other scenarios.

9. **✅ COMPLETE - Rewrite `batching.bench.ts`** (2026-01-17) - Rewritten to test actual Publisher class instead of mock code. Now covers all batch triggers including maxMilliseconds time-based trigger.

10. **✅ COMPLETE - Rewrite `ack-nack.bench.ts`** (2026-01-17) - Rewritten to test actual Message and MessageQueue classes instead of mock code. Now covers all message acknowledgment operations including modifyAckDeadline(). Can detect performance regressions in actual acknowledgment code.

### 🔴 P0 - CRITICAL (Fix Immediately)

(None - all P0 issues resolved)

### 🟠 P1 - HIGH (Spec Violations)

(None - all P1 issues resolved)

### 🟡 P2 - HIGH (Benchmark Validity)

11. **Rewrite `flow-control.bench.ts`** - Import actual `SubscriberFlowControl` and `PublisherFlowControl` classes, benchmark real methods. Fix dead code elimination issues.

### 🟢 P3 - MEDIUM (Robustness/Completeness)

12. **Add timeout protection to `throughput.ts`** - Use `Promise.race()` with 60s timeout.

13. **Implement reservoir sampling in `stats.ts`** - Add `maxSamples` constructor option. Required before soak test.

14. **Implement `compare.ts` utility** - Regression comparison for ±10% tracking. Load JSONs, calculate deltas, PASS/FAIL.

15. **Create `version.ts` utility** - Extract Bun version check to shared module.

16. **Implement `saturation.ts` scenario** - Load ramping (50%-125%) for capacity ceiling detection.

### ⚪ P4 - LOW (Documentation/Quality)

17. **Extract magic numbers in `reporter.ts`** - Define `const MB = 1_048_576`.

18. **Add JSDoc documentation to `stats.ts`** - Document units, algorithms, edge cases.

19. **Add JSDoc documentation to `reporter.ts`** - Document all public functions.

20. **Document warmup settling time in `throughput.ts`** - Explain 500ms magic number.

21. **Add input validation to `stats.ts`** - Check for NaN, Infinity, negative values.

### ⏸️ DEFERRED (Blocked/Future)

22. **Implement `soak.ts` scenario** - 4-8 hour memory stability. *Blocked by: #13 reservoir sampling*.

23. **Benchmark profiles** - Message size mixes, concurrency matrices. *Better for CI phase*.

24. **CI integration** - Automated regression detection. *Requires: #14 compare.ts*.

25. **Iteration support** - `--iterations=N` flag for statistical rigor.

26. **Container testing** - Resource limits per spec §268-279.

## Future Enhancements (Unchanged)

### Deferred Items
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
