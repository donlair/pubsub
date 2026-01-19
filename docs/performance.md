# Performance Guide

This library is optimized for **local development and testing**, not high-throughput production workloads.

## Measured Performance

Performance tested on a 2020 M1 MacBook Pro using containerized benchmarks that simulate constrained environments.

| Environment | Simulates | Throughput | P99 Latency |
|-------------|-----------|------------|-------------|
| **Native** | Dev machine | 8,000 msg/s | 1,200ms |
| **Micro** | t3.micro / e2-micro | 4,000 msg/s | 2,300ms |

*Test: 10,000 messages, 1KB payload. Run `bun run bench:constrained:<profile>` to measure other profiles.*

## Capacity Planning

The library includes containerized benchmarks that simulate different resource constraints:

```bash
bun run bench:constrained:micro   # 0.25 CPU, 1GB RAM (t3.micro/e2-micro)
bun run bench:constrained:small   # 0.5 CPU, 2GB RAM (t3.small/e2-small)
bun run bench:constrained:medium  # 1.0 CPU, 4GB RAM (t3.medium/e2-medium)
```

**Resource Profiles:**

| Profile | CPU | Memory | Simulates | Typical Throughput |
|---------|-----|--------|-----------|-------------------|
| `micro` | 0.25 | 1GB | t3.micro, e2-micro | 2,000-4,000 msg/s |
| `small` | 0.5 | 2GB | t3.small, e2-small | 4,000-8,000 msg/s |
| `medium` | 1.0 | 4GB | t3.medium, e2-medium | 8,000-15,000 msg/s |

**Rule of thumb**: Choose an instance with 2-3x headroom over your target throughput.

## Performance Characteristics

### What Affects Performance

1. **Message size** - Larger messages reduce throughput
2. **Processing time** - Slower message handlers reduce effective throughput
3. **Flow control limits** - Lower limits reduce memory usage but may reduce throughput
4. **Batching settings** - Larger batches improve throughput but increase latency
5. **Streaming pull settings** - Aggressive settings increase throughput and CPU usage

### Tuning for Throughput

**Publisher batching:**
```typescript
topic.setPublishOptions({
  batching: {
    maxMessages: 1000,      // Larger batches
    maxMilliseconds: 50,    // Longer wait
    maxBytes: 10 * 1024 * 1024  // 10MB
  }
});
```

**Subscriber flow control:**
```typescript
const subscription = pubsub.subscription('processor', {
  flowControl: {
    maxMessages: 5000,              // More in-flight messages
    maxBytes: 500 * 1024 * 1024     // 500MB
  },
  streamingOptions: {
    pullInterval: 1,      // Pull more frequently
    maxPullSize: 1000     // Pull more messages per interval
  }
});
```

**Trade-offs:**
- Higher throughput = More memory usage
- Larger batches = Higher latency per message
- More in-flight messages = More memory, more concurrent processing

## Best For

- **Local development** - Fast iteration without cloud dependencies
- **Testing & CI/CD** - Deterministic, fast, isolated tests
- **Prototyping** - Validate event-driven architectures
- **Low-volume production** - < 5,000 msg/s sustained

## Not For

- **High-throughput production** - > 10,000 msg/s sustained
- **Durable storage** - Messages are in-memory only
- **Multi-datacenter replication** - Single-process only
- **Long-term message retention** - No persistence across restarts

## Migration Path

When you need production scale:

1. **Benchmark your workload** locally first
2. **Measure actual throughput** needs
3. **If > 5K msg/s sustained**, plan migration to Google Cloud Pub/Sub
4. **Change the import** - all your code stays the same!

```typescript
// Before (local)
import { PubSub } from 'pubsub';

// After (cloud scale)
import { PubSub } from '@google-cloud/pubsub';
```

## Running Benchmarks

The library includes several benchmark scenarios:

```bash
# Quick benchmarks (run locally)
bun run bench                      # Default scenario
bun run bench:scenarios            # All scenarios

# Constrained benchmarks (run in containers)
bun run bench:constrained:micro    # Simulate micro instance
bun run bench:constrained:small    # Simulate small instance
bun run bench:constrained:medium   # Simulate medium instance
```

See `bench/README.md` for complete benchmarking documentation.
