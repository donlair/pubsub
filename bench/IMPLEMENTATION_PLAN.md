# Containerized Benchmarking Implementation Plan

## Overview

Add Docker-based resource-constrained benchmarking to simulate cloud instance sizes (micro, small, medium) for capacity planning and deployment validation. Consult [Docker container benchmarking](../docs/dockerized-benchmarking.md) for an overview.

## Resource Profiles

| Profile | CPU | Memory | Simulates |
|---------|-----|--------|-----------|
| `micro` | 0.25 | 1GB | GCP e2-micro, AWS t3.micro |
| `small` | 0.5 | 2GB | GCP e2-small, AWS t3.small |
| `medium` | 1.0 | 4GB | GCP e2-medium, AWS t3.medium |
| `native` | unlimited | unlimited | Host machine (baseline) |

## Tasks

### Phase 1: Profile Definitions ✓

- [x] Create `bench/utils/profiles.ts` with `ResourceProfile` interface
- [x] Define `PROFILES` map with micro, small, medium, native configurations
- [x] Export `getProfile()` and `listProfiles()` helper functions
- [x] Define `SCENARIO_BENCHMARKS` constant (excludes mitata microbenchmarks)

### Phase 2: Reporter Modifications ✓

- [x] Add `DockerProfile` interface to `bench/utils/reporter.ts`
- [x] Add optional `dockerProfile` field to `Environment` interface
- [x] Create `captureEnvironmentWithProfile(profileName?: string)` function
- [x] Modify `createResult()` to accept optional `profileName` parameter
- [x] Modify `saveResults()` to include profile in filename when present

### Phase 3: Docker Infrastructure ✓

- [x] Create `bench/Dockerfile.bench` with minimal Bun image
- [x] Create `bench/run-constrained.sh` orchestration script
- [x] Make shell script executable with `chmod +x`
- [x] Test Docker image builds successfully

### Phase 4: Scenario Updates ✓

- [x] Update `bench/scenarios/throughput.ts` to read `BENCH_PROFILE` env var
- [x] Update `bench/scenarios/firehose.ts` to read `BENCH_PROFILE` env var
- [x] Update `bench/scenarios/fanout.ts` to read `BENCH_PROFILE` env var
- [x] Update `bench/scenarios/thundering-herd.ts` to read `BENCH_PROFILE` env var
- [x] Update `bench/scenarios/saturation.ts` to read `BENCH_PROFILE` env var

### Phase 5: Package Scripts ✓

- [x] Add `bench:constrained` script to package.json
- [x] Add `bench:constrained:micro` script
- [x] Add `bench:constrained:small` script
- [x] Add `bench:constrained:medium` script
- [x] Add `bench:docker:build` script

### Phase 6: Documentation ✓

- [x] Update `bench/README.md` with containerized benchmarks section
- [x] Document available profiles and usage
- [x] Document result file naming convention
- [x] Add architecture note (ARM64 vs x86_64)

### Phase 7: Verification

- [ ] Build Docker image successfully
- [ ] Run `throughput` benchmark with micro profile
- [ ] Verify result file contains `dockerProfile` metadata
- [ ] Compare native vs micro throughput (expect 2-4x reduction)
- [ ] Run all scenarios with micro profile

## File Changes Summary

| File | Action |
|------|--------|
| `bench/utils/profiles.ts` | Create ✓ |
| `bench/utils/reporter.ts` | Modify ✓ |
| `bench/Dockerfile.bench` | Create ✓ |
| `bench/run-constrained.sh` | Create ✓ |
| `bench/scenarios/throughput.ts` | Modify ✓ |
| `bench/scenarios/firehose.ts` | Modify ✓ |
| `bench/scenarios/fanout.ts` | Modify ✓ |
| `bench/scenarios/thundering-herd.ts` | Modify ✓ |
| `bench/scenarios/saturation.ts` | Modify ✓ |
| `package.json` | Modify ✓ |
| `bench/README.md` | Modify ✓ |

## Design Notes

- **Architecture**: Runs native (ARM64 on Apple Silicon). Cross-arch emulation via `--platform linux/amd64` invalidates benchmarks due to extreme slowdown.
- **Microbenchmarks excluded**: mitata tight-loop benchmarks are too sensitive to Docker scheduling overhead.
- **Result naming**: `<scenario>-<profile>-<timestamp>.json` for containerized runs.
- **Backward compatible**: Existing `bun bench:throughput` continues to work unchanged.
- **Environment capture**: `os.cpus()` returns host CPU inside Docker (caveat documented), `os.totalmem()` returns container limit (accurate).
