# Containerized Benchmarking

## Status: Complete

Docker-based resource-constrained benchmarking for simulating cloud instance sizes (micro, small, medium). Enables capacity planning and deployment validation across different cloud VM tiers.

See [Docker container benchmarking](../docs/dockerized-benchmarking.md) for detailed documentation.

## Resource Profiles

| Profile | CPU | Memory | Simulates |
|---------|-----|--------|-----------|
| `micro` | 0.25 | 1GB | GCP e2-micro, AWS t3.micro |
| `small` | 0.5 | 2GB | GCP e2-small, AWS t3.small |
| `medium` | 1.0 | 4GB | GCP e2-medium, AWS t3.medium |
| `native` | unlimited | unlimited | Host machine (baseline) |

## Usage

```bash
bun run bench:constrained:micro    # Run all scenarios on micro profile
bun run bench:constrained:small    # Run all scenarios on small profile
bun run bench:constrained:medium   # Run all scenarios on medium profile
bun run bench:docker:build         # Rebuild Docker image
```

## Verification Results

All phases (1-7) completed successfully:

- Native baseline: 8,014 msgs/sec
- Micro profile: 3,957-4,625 msgs/sec (~2x reduction, expected)
- All scenarios pass on micro profile except firehose-1KB (P99 target too aggressive for constrained env)

## Design Notes

- **Architecture**: Runs native (ARM64 on Apple Silicon). Cross-arch emulation via `--platform linux/amd64` invalidates benchmarks due to extreme slowdown.
- **Microbenchmarks excluded**: mitata tight-loop benchmarks are too sensitive to Docker scheduling overhead.
- **Result naming**: `<scenario>-<profile>-<timestamp>.json` for containerized runs.
- **Backward compatible**: Existing `bun bench:throughput` continues to work unchanged.
- **Environment capture**: `os.cpus()` returns host CPU inside Docker (caveat documented), `os.totalmem()` returns container limit (accurate).

## Implementation Summary

**New Files:**
- `bench/utils/profiles.ts` - Resource profile definitions
- `bench/Dockerfile.bench` - Minimal Bun benchmark image
- `bench/run-constrained.sh` - Docker orchestration script

**Modified Files:**
- `bench/utils/reporter.ts` - Profile metadata capture
- `bench/scenarios/*.ts` - Profile environment variable support (5 scenarios)
- `package.json` - Containerized benchmark npm scripts
- `bench/README.md` - Usage documentation
