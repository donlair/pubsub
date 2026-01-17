# Benchmarking & Performance Testing

## Overview

This document defines how we measure performance for the Pub/Sub implementation beyond
functional tests. It focuses on repeatable benchmarks, stress/load tests, and resource
profiling aligned with Bun's recommended tooling.

## Goals

- Quantify throughput (messages/sec) and end-to-end latency (p50/p95/p99).
- Track CPU and memory usage under sustained load.
- Detect regressions and potential memory leaks.
- Provide repeatable, comparable runs across machines and commits.
- Establish baseline SLOs for production readiness assessment.
- Identify saturation points where performance degrades non-linearly.

## Scope

Benchmarks are not part of the functional test suites (`tests/`). They live in a
dedicated `bench/` area and are run explicitly. All benchmarks run in-process
against the library directly.

## Bun Version Requirements

**Minimum:** Bun v1.1.31+ (stable node:http2 server support, improved GC behavior)

Document the exact Bun version in all benchmark results for reproducibility. Version
differences can significantly affect performance characteristics due to JSC/runtime
improvements between releases.

## Tooling (Bun Guidance)

- Microbenchmarks: `mitata` for tight-loop perf and hot-path validation.
- Script/CLI timing: `hyperfine` for consistent command comparisons.
- Time measurement: `performance.now()` or `Bun.nanoseconds()`.
- JS heap usage: `bun:jsc` `heapStats()` + heap snapshots for leak investigation.
- Native heap usage: `MIMALLOC_SHOW_STATS=1` to report on exit.
- CPU profiling: `bun --cpu-prof` (inspect `.cpuprofile` in DevTools/VS Code).

## Repository Layout

```
bench/
  mitata/
    *.bench.ts
  scenarios/
    firehose.ts
    fanout.ts
    soak.ts
    thundering-herd.ts
    throughput.ts
  results/          # gitignored
  README.md
```

## Benchmark Types

### 1) Microbenchmarks (Hot Paths)

Use `mitata` to benchmark:
- serialization/deserialization
- message batching logic
- ack/nack processing
- flow-control decisions

Focus on single-operation timing and allocation profiles.

### 2) Firehose (Ingestion Ceiling)

**Objective:** Determine maximum write throughput with no consumption overhead.

- **Configuration:** 1 topic, 0 subscribers
- **Traffic Pattern:** Constant arrival rate, increasing until saturation
- **Payload Sizes:** 1KB, 10KB, 1MB
- **Success Metric:** P99 publish latency < 50ms
- **Failure Indicator:** Latency grows exponentially (event loop saturation)

This isolates publishing performance from routing and delivery overhead.

### 3) Fan-Out (Routing Efficiency)

**Objective:** Stress test internal EventEmitter and message copying mechanisms.

- **Configuration:** 1 topic, 50 subscribers
- **Traffic Pattern:** Moderate publish rate (100 msg/s)
- **Total Operations:** 100 in × 50 out = 5,000 ops/sec
- **Success Metric:** P99 end-to-end latency < 100ms
- **Failure Indicator:** O(N²) scaling with subscriber count

This tests whether routing degrades gracefully as subscriber count increases.

### 4) Soak Test (Memory Stability)

**Objective:** Detect memory leaks in the application or JSC runtime.

- **Configuration:** Sustained load at 50% of max throughput
- **Duration:** 4-8 hours
- **Logic:** Publishers send, subscribers ack immediately
- **Success Metric:** RSS growth < 10% after initial warmup plateau
- **Failure Indicator:** Linear memory growth over time

Common leak sources: closures retaining socket/buffer references, EventEmitter
listener accumulation, unbounded internal queues.

### 5) Thundering Herd (Connection Storm)

**Objective:** Test robustness under sudden concurrent load.

- **Configuration:** 1,000 publishers connecting simultaneously
- **Traffic Pattern:** Each publishes 1 message, then disconnects
- **Success Metric:** Zero connection errors, all messages delivered
- **Failure Indicator:** EMFILE errors, timeouts, resource exhaustion

This validates connection handling and cleanup under burst conditions.

### 6) Throughput (Baseline Performance)

**Objective:** Establish baseline messages/sec for regression tracking.

- **Configuration:** 1 topic, 1 subscriber, immediate ack
- **Traffic Pattern:** Maximum sustainable rate without backpressure
- **Success Metric:** Document baseline, track ±10% variance across commits
- **Failure Indicator:** >10% regression from established baseline

This provides the primary regression detection metric for CI integration.

### 7) Scenario Benchmarks (System-Level)

General-purpose scenarios combining publishing and subscribing:
- messages/sec = total messages / elapsed time
- latency = per-message timestamps (p50/p95/p99)
- CPU profiling with `bun --cpu-prof`
- heap usage before/after with `heapStats()`

## Bun Runtime Considerations

### Memory Mode Testing

Run scenarios with and without `--smol` flag to compare tradeoffs:

```bash
bun bench/scenarios/throughput.ts
bun --smol bench/scenarios/throughput.ts
```

**Hypothesis:** `--smol` may increase GC frequency, raising P99 latency while
preventing OOM in memory-constrained environments.

### GC Pattern Detection

Monitor for "sawtooth" patterns in latency graphs:
- Gradual latency increase followed by sharp drop = major GC pause
- If pauses exceed 100ms, document as a throughput ceiling
- Use `Bun.gc(true)` between test phases to force collection

### JavaScriptCore Characteristics

Bun uses JSC (not V8), which optimizes for:
- Fast startup times
- Lower memory footprint
- Different JIT optimization profile

High object churn (millions of short-lived messages) may behave differently than
in Node.js. Document any observed differences.

### Performance Diagnostics

When investigating bottlenecks, observe CPU/latency correlation:

| Observation | Likely Cause |
|-------------|--------------|
| High CPU + Low Throughput | Inefficient serialization or heavy per-message logic |
| Low CPU + High Latency | Blocking I/O or await chains starving the event loop |
| Periodic latency spikes | GC pauses (check for sawtooth pattern) |
| Gradual throughput decline | Memory pressure or resource accumulation |

### Saturation Point Detection

Identify the throughput ceiling by incrementally increasing load until latency
begins exponential (not linear) growth. This indicates event loop saturation,
which may occur before CPU reaches 100%.

**How to detect:**
1. Run throughput test at 50%, 75%, 90%, 100%, 110% of estimated capacity
2. Plot latency vs throughput
3. Saturation point = where latency curve inflects from linear to exponential

Document the saturation point as a key metric for capacity planning.

## Benchmark Profiles

### Message Size Mix

| Size | Bytes | Use Case |
|------|-------|----------|
| Small | 1KB | Telemetry events, metrics |
| Medium | 10KB | User profiles, API responses |
| Large | 500KB | Documents, structured data |
| XLarge | 1MB | Blobs, images, large payloads |

Suggested mixes:
- Small-only: 100% 1KB
- Large-only: 100% 500KB
- Mixed: 90% 1KB, 10% 500KB
- Mixed-heavy: 50% 1KB, 50% 500KB
- Full-spectrum: 70% 1KB, 20% 10KB, 8% 500KB, 2% 1MB

### Concurrency Defaults

- Publishers: 1, 4, 8
- Subscribers per topic: 1, 4, 50 (for fan-out)
- Subscriber concurrency: 1, 4, 16 (per subscription)
- In-flight limits: default settings unless testing flow control

### Ordering Key Coverage

- No ordering: baseline throughput
- Ordering enabled: 8 keys, uniform distribution

### Batching Coverage

Batch sizes:
- Single-message (1)
- Small batch (10)
- Medium batch (100)

Batching is defined as grouping multiple messages into a single publish call.

## Success Criteria

| Scenario | Metric | Target | Notes |
|----------|--------|--------|-------|
| Firehose (1KB) | P99 publish latency | < 50ms | Pure ingestion |
| Firehose (1MB) | P99 publish latency | < 200ms | Large payload |
| Fan-Out (50 subs) | P99 e2e latency | < 100ms | Routing overhead |
| Soak (4hr) | RSS growth | < 10% | After warmup plateau |
| Thundering Herd | Error rate | 0% | Connection handling |
| Throughput | Messages/sec | Baseline | Document, track regressions |
| Saturation | Inflection point | Document | Capacity planning metric |

These targets establish baseline SLOs. Actual values will be determined by
initial benchmark runs and documented in results.

## Measurement Guidance

- Warm up before measuring to reduce JIT variance (minimum 1000 iterations or 5s).
- Pin concurrency and payload sizes per scenario.
- Record environment details (CPU, RAM, Bun version, OS).
- Run multiple iterations (minimum 5) and report median.
- Use `Bun.nanoseconds()` for sub-millisecond precision.
- Force GC between test phases with `Bun.gc(true)`.

## Reporting

Benchmark output should include:
- Scenario name and configuration
- Messages/sec (throughput)
- Latency percentiles (p50, p95, p99)
- Peak RSS and heap stats
- Bun version and runtime flags
- CPU model and core count
- Date and commit hash
- Saturation point (if measured)

Output format: JSON (machine-readable) + text summary (human-readable).

## Container Testing (Optional)

For Cloud Run migration planning, run benchmarks with resource limits:

```bash
docker build -t pubsub-bench .
docker run --cpus="1.0" --memory="512m" pubsub-bench bun bench/scenarios/throughput.ts
docker run --cpus="2.0" --memory="1g" pubsub-bench bun bench/scenarios/throughput.ts
```

This establishes sizing guidance for deployment and validates behavior under
cgroup constraints. Document throughput ceiling per resource configuration.

## Commands (Examples)

```bash
# Run with CPU profiling
bun --cpu-prof bench/scenarios/throughput.ts

# Run with native heap stats
MIMALLOC_SHOW_STATS=1 bun bench/scenarios/throughput.ts

# Run with reduced memory mode
bun --smol bench/scenarios/soak.ts

# Run microbenchmarks
bun bench/mitata/serialization.bench.ts
```

```ts
// Heap stats inspection
import { heapStats } from 'bun:jsc';
console.log(heapStats());
```

```ts
// Heap snapshot for leak investigation
import { generateHeapSnapshot } from 'bun';

const snapshot = generateHeapSnapshot();
await Bun.write('heap.json', JSON.stringify(snapshot, null, 2));
// Open in Safari DevTools > Timeline > JavaScript Allocations > Import
```

```ts
// High-precision timing
const start = Bun.nanoseconds();
// ... operation ...
const elapsed = Bun.nanoseconds() - start;
console.log(`Elapsed: ${elapsed / 1_000_000}ms`);
```

## Future Considerations

These are out of scope for v1 but documented for future reference:

- **Network latency simulation:** Tools like `toxiproxy` can inject artificial
  latency to expose race conditions hidden by zero-RTT local testing.
- **External HTTP load testing:** When exposing a network server, use Bun-recommended
  tools (`bombardier`, `oha`) rather than Node.js-based tools (e.g., `autocannon`)
  which may not be fast enough to stress Bun.serve() and will skew results.
- **gRPC load testing:** k6 with xk6-pubsub or ghz for gRPC-specific protocol testing
  when/if the library exposes a gRPC server endpoint.
- **Distributed benchmarks:** Multi-machine testing for horizontal scaling.
- **Parity comparisons:** Benchmarking against actual Google Pub/Sub emulator.

## Next Steps

1. Create `bench/` directory structure
2. Implement `bench/scenarios/throughput.ts` (baseline regression metric)
3. Implement `bench/scenarios/firehose.ts` (ingestion ceiling)
4. Implement `bench/scenarios/fanout.ts` (routing efficiency)
5. Implement `bench/scenarios/soak.ts` (memory stability)
6. Implement `bench/scenarios/thundering-herd.ts` (connection handling)
7. Add `bench/mitata/` microbenchmarks for hot paths
8. Create `bench/README.md` with environment and run instructions
9. Run initial benchmarks to establish baseline SLOs
10. Document results and update success criteria with actual values
