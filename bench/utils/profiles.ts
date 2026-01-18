/**
 * Resource profiles for containerized benchmark execution.
 * Maps cloud instance sizes to CPU/memory constraints.
 */

export interface ResourceProfile {
  name: string;
  cpu: number;
  memory: string;
  memoryMB: number;
  simulates: string;
}

export const PROFILES: Record<string, ResourceProfile> = {
  micro: {
    name: 'micro',
    cpu: 0.25,
    memory: '1GB',
    memoryMB: 1024,
    simulates: 'GCP e2-micro, AWS t3.micro',
  },
  small: {
    name: 'small',
    cpu: 0.5,
    memory: '2GB',
    memoryMB: 2048,
    simulates: 'GCP e2-small, AWS t3.small',
  },
  medium: {
    name: 'medium',
    cpu: 1.0,
    memory: '4GB',
    memoryMB: 4096,
    simulates: 'GCP e2-medium, AWS t3.medium',
  },
  native: {
    name: 'native',
    cpu: 0,
    memory: 'unlimited',
    memoryMB: 0,
    simulates: 'Host machine (baseline)',
  },
};

export const SCENARIO_BENCHMARKS = [
  'throughput',
  'firehose',
  'fanout',
  'thundering-herd',
  'saturation',
] as const;

export type ScenarioBenchmark = (typeof SCENARIO_BENCHMARKS)[number];

export function getProfile(name: string): ResourceProfile {
  const profile = PROFILES[name];
  if (!profile) {
    const available = Object.keys(PROFILES).join(', ');
    throw new Error(`Unknown profile: ${name}. Available: ${available}`);
  }
  return profile;
}

export function listProfiles(): ResourceProfile[] {
  return Object.values(PROFILES);
}
