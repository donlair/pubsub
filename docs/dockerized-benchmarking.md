### Method: Docker Resource Limits

You can run your existing benchmarks inside a Docker container and use Docker's flags to throttle CPU and memory to match an `e2-micro` (2 vCPUs, roughly 1GB RAM).

#### 1. Create a `Dockerfile.bench`

Add this to your root directory to containerize your benchmark suite.

```dockerfile
# Use the official Bun image
FROM oven/bun:1

WORKDIR /app

# Copy package manifests first to cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Default command (can be overridden)
CMD ["bun", "bench/scenarios/throughput.ts"]

```

#### 2. Build the Image

```bash
docker build -t pubsub-bench -f Dockerfile.bench .

```

#### 3. Run with "Micro VM" Limits

An `e2-micro` has 2 vCPUs (shared core) and 1GB of RAM. It usually sustains only a fraction of a full CPU core (e.g., 12.5% to 50%).

You can simulate this using the `--cpus` and `--memory` flags:

```bash
# Simulate e2-micro (approx 0.25 vCPU sustained, 1GB RAM)
docker run --rm \
  --cpus="0.25" \
  --memory="1g" \
  pubsub-bench \
  bun bench/scenarios/throughput.ts

```

### Why this works (and where it fails)

1. **Throughput/Latency:** Your `throughput.ts` script uses `Bun.nanoseconds()` to measure time. When Docker throttles the CPU cycles available to the container, your code literally runs slower. The resulting `messages/sec` will accurately reflect the performance on constrained hardware.
2. **Memory Pressure:** If your `soak.ts` (once implemented) or `firehose.ts` attempts to use more than 1GB of RAM, the OOM (Out of Memory) killer will terminate the process, accurately simulating a crash on a small VM.
3. **Reporter Accuracy:** Your `bench/utils/reporter.ts` uses `os.cpus()` and `os.totalmem()`.
* **Caveat:** Inside Docker, `os.cpus()` often still reports the *host's* CPU model (e.g., "Apple M1"), even if throttled.
* **Caveat:** `os.totalmem()` usually reports the container's memory limit (1GB), which will be accurate.



### Comparison Table: Local vs. Simulated

| Feature | Your Mac (Current) | Simulated (Docker) | Real Cloud VM |
| --- | --- | --- | --- |
| **CPU Architecture** | ARM64 (M1/M2/M3) | ARM64 (Throttled) | x86_64 (Intel/AMD) |
| **Core Count** | 8+ Cores | 0.25 vCPU | 2 vCPUs (Shared) |
| **Disk I/O** | NVMe SSD (Very Fast) | Virtualized FS | Networked PD (Slower) |
| **Network** | Loopback (Infinite) | Bridge Network | VPC Limits |

**Crucial Note on Architecture:**
If you are on an Apple Silicon Mac, Docker will run the container as **ARM64**. Google Cloud `e2-micro` instances are **x86_64**.

* **Performance difference:** Bun optimizes differently for ARM vs x64.
* **Fix:** You can try passing `--platform linux/amd64` to Docker, but emulation via Rosetta/QEMU is *extremely* slow and will give you artificially bad results (much worse than a real VM).

### Recommendation

For the most accurate "budget" benchmark without deploying to the cloud:

1. **Use Docker with `--cpus="0.5"**`: This is a safe "middle ground" estimation for small shared-core VMs.
2. **Ignore the `bun/mitata` microbenchmarks**: Microbenchmarks (`ack-nack.bench.ts`) are often too sensitive to Docker overhead. Focus on the scenario benchmarks (`throughput.ts`, `firehose.ts`).