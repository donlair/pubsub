#!/bin/bash
# Orchestration script for resource-constrained Docker benchmarks
# Usage: ./bench/run-constrained.sh [profile] [scenario]
#   profile: micro, small, medium, native (default: micro)
#   scenario: throughput, firehose, fanout, thundering-herd, saturation, all (default: all)
#
# Note: 'soak' scenario excluded from 'all' - it runs for extended periods.
# Run soak explicitly: ./bench/run-constrained.sh micro soak

set -e

PROFILE="${1:-micro}"
SCENARIO="${2:-all}"
IMAGE_NAME="pubsub-bench"

# Profile resource mappings (aligned with bench/utils/profiles.ts)
declare -A CPU_LIMITS=(
  ["micro"]="0.25"
  ["small"]="0.5"
  ["medium"]="1.0"
  ["native"]=""
)

declare -A MEMORY_LIMITS=(
  ["micro"]="1g"
  ["small"]="2g"
  ["medium"]="4g"
  ["native"]=""
)

# Validate profile
if [[ "$PROFILE" != "native" && -z "${CPU_LIMITS[$PROFILE]}" ]]; then
  echo "Error: Unknown profile '$PROFILE'. Available: micro, small, medium, native"
  exit 1
fi

CPU="${CPU_LIMITS[$PROFILE]}"
MEMORY="${MEMORY_LIMITS[$PROFILE]}"

# Scenario list (excludes soak - too long for batch runs)
SCENARIOS=("throughput" "firehose" "fanout" "thundering-herd" "saturation")

echo "=== Containerized Benchmark Runner ==="
if [[ "$PROFILE" == "native" ]]; then
  echo "Profile: $PROFILE (no resource constraints)"
else
  echo "Profile: $PROFILE (CPU: $CPU, Memory: $MEMORY)"
fi
echo ""

# Ensure results directory exists
mkdir -p "$(pwd)/bench/results"

# Build Docker image
echo "Building Docker image..."
if ! docker build -t "$IMAGE_NAME" -f bench/Dockerfile.bench . ; then
  echo "Error: Docker build failed"
  exit 1
fi

run_benchmark() {
  local scenario="$1"
  echo ""
  echo "--- Running: $scenario ($PROFILE profile) ---"

  if [[ "$PROFILE" == "native" ]]; then
    # No resource constraints for native profile
    docker run --rm \
      -e BENCH_PROFILE="$PROFILE" \
      -v "$(pwd)/bench/results:/app/bench/results" \
      "$IMAGE_NAME" \
      bun "bench/scenarios/${scenario}.ts"
  else
    # Apply CPU and memory constraints with swap limit
    docker run --rm \
      --cpus="$CPU" \
      --memory="$MEMORY" \
      --memory-swap="$MEMORY" \
      -e BENCH_PROFILE="$PROFILE" \
      -v "$(pwd)/bench/results:/app/bench/results" \
      "$IMAGE_NAME" \
      bun "bench/scenarios/${scenario}.ts"
  fi
}

if [[ "$SCENARIO" == "all" ]]; then
  for s in "${SCENARIOS[@]}"; do
    run_benchmark "$s"
  done
else
  # Validate scenario (also allow soak for explicit runs)
  ALL_SCENARIOS=("${SCENARIOS[@]}" "soak")
  valid=false
  for s in "${ALL_SCENARIOS[@]}"; do
    if [[ "$s" == "$SCENARIO" ]]; then
      valid=true
      break
    fi
  done

  if [[ "$valid" == "false" ]]; then
    echo "Error: Unknown scenario '$SCENARIO'. Available: ${SCENARIOS[*]}, soak, all"
    exit 1
  fi

  run_benchmark "$SCENARIO"
fi

echo ""
echo "=== Benchmark Complete ==="
echo "Results saved to bench/results/"
