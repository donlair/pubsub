import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { rm, readdir } from 'node:fs/promises';
import {
  captureEnvironment,
  captureEnvironmentWithProfile,
  captureMemory,
  createResult,
  saveResults,
  type DockerProfile,
  type Environment,
  type BenchmarkResult,
} from './reporter';
import { getProfile } from './profiles';

describe('DockerProfile interface', () => {
  test('has required properties', () => {
    const profile: DockerProfile = {
      name: 'micro',
      cpu: 0.25,
      memory: '1GB',
    };
    expect(profile.name).toBe('micro');
    expect(profile.cpu).toBe(0.25);
    expect(profile.memory).toBe('1GB');
  });
});

describe('Environment interface with dockerProfile', () => {
  test('dockerProfile field is optional', () => {
    const env: Environment = {
      bunVersion: '1.0.0',
      cpuModel: 'Test CPU',
      cpuCores: 4,
      totalMemoryMB: 8192,
      platform: 'linux',
      arch: 'arm64',
      timestamp: new Date().toISOString(),
    };
    expect(env.dockerProfile).toBeUndefined();
  });

  test('dockerProfile can be set', () => {
    const env: Environment = {
      bunVersion: '1.0.0',
      cpuModel: 'Test CPU',
      cpuCores: 4,
      totalMemoryMB: 8192,
      platform: 'linux',
      arch: 'arm64',
      timestamp: new Date().toISOString(),
      dockerProfile: {
        name: 'small',
        cpu: 0.5,
        memory: '2GB',
      },
    };
    expect(env.dockerProfile?.name).toBe('small');
    expect(env.dockerProfile?.cpu).toBe(0.5);
    expect(env.dockerProfile?.memory).toBe('2GB');
  });
});

describe('captureEnvironment', () => {
  test('returns environment without dockerProfile by default', () => {
    const env = captureEnvironment();

    expect(env.bunVersion).toBe(Bun.version);
    expect(typeof env.cpuModel).toBe('string');
    expect(typeof env.cpuCores).toBe('number');
    expect(env.cpuCores).toBeGreaterThan(0);
    expect(typeof env.totalMemoryMB).toBe('number');
    expect(typeof env.platform).toBe('string');
    expect(typeof env.arch).toBe('string');
    expect(typeof env.timestamp).toBe('string');
    expect(env.dockerProfile).toBeUndefined();
  });
});

describe('captureEnvironmentWithProfile', () => {
  test('returns environment without dockerProfile when no profile specified', () => {
    const env = captureEnvironmentWithProfile();

    expect(env.bunVersion).toBe(Bun.version);
    expect(env.dockerProfile).toBeUndefined();
  });

  test('returns environment without dockerProfile when profile is undefined', () => {
    const env = captureEnvironmentWithProfile(undefined);

    expect(env.dockerProfile).toBeUndefined();
  });

  test('includes dockerProfile when valid profile name provided', () => {
    const env = captureEnvironmentWithProfile('micro');

    expect(env.dockerProfile).toBeDefined();
    expect(env.dockerProfile?.name).toBe('micro');
    expect(env.dockerProfile?.cpu).toBe(0.25);
    expect(env.dockerProfile?.memory).toBe('1GB');
  });

  test('includes dockerProfile for small profile', () => {
    const env = captureEnvironmentWithProfile('small');

    expect(env.dockerProfile?.name).toBe('small');
    expect(env.dockerProfile?.cpu).toBe(0.5);
    expect(env.dockerProfile?.memory).toBe('2GB');
  });

  test('includes dockerProfile for medium profile', () => {
    const env = captureEnvironmentWithProfile('medium');

    expect(env.dockerProfile?.name).toBe('medium');
    expect(env.dockerProfile?.cpu).toBe(1.0);
    expect(env.dockerProfile?.memory).toBe('4GB');
  });

  test('includes dockerProfile for native profile', () => {
    const env = captureEnvironmentWithProfile('native');

    expect(env.dockerProfile?.name).toBe('native');
    expect(env.dockerProfile?.cpu).toBe(0);
    expect(env.dockerProfile?.memory).toBe('unlimited');
  });

  test('throws for unknown profile name', () => {
    expect(() => captureEnvironmentWithProfile('unknown')).toThrow('Unknown profile: unknown');
  });

  test('dockerProfile has correct structure', () => {
    const env = captureEnvironmentWithProfile('micro');

    expect(Object.keys(env.dockerProfile!)).toEqual(['name', 'cpu', 'memory']);
  });
});

describe('captureMemory', () => {
  test('returns memory stats', () => {
    const mem = captureMemory();

    expect(typeof mem.peakRssMB).toBe('number');
    expect(typeof mem.heapUsedMB).toBe('number');
    expect(typeof mem.heapSizeMB).toBe('number');
    expect(mem.peakRssMB).toBeGreaterThan(0);
  });
});

describe('createResult', () => {
  const mockMetrics = {
    messagesPerSec: 10000,
    latency: {
      p50: 0.5,
      p95: 1.0,
      p99: 2.0,
      min: 0.1,
      max: 5.0,
      mean: 0.6,
      count: 1000,
    },
    durationMs: 1000,
  };

  test('creates result without profile by default', () => {
    const result = createResult('throughput', { messageCount: 1000 }, mockMetrics, true);

    expect(result.scenario).toBe('throughput');
    expect(result.config).toEqual({ messageCount: 1000 });
    expect(result.success).toBe(true);
    expect(result.environment.dockerProfile).toBeUndefined();
  });

  test('creates result with profile when profileName provided', () => {
    const result = createResult('throughput', { messageCount: 1000 }, mockMetrics, true, undefined, 'micro');

    expect(result.environment.dockerProfile).toBeDefined();
    expect(result.environment.dockerProfile?.name).toBe('micro');
    expect(result.environment.dockerProfile?.cpu).toBe(0.25);
  });

  test('creates result with errors', () => {
    const errors = ['Error 1', 'Error 2'];
    const result = createResult('throughput', { messageCount: 1000 }, mockMetrics, false, errors);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(errors);
  });

  test('omits errors when empty array provided', () => {
    const result = createResult('throughput', { messageCount: 1000 }, mockMetrics, true, []);

    expect(result.errors).toBeUndefined();
  });

  test('includes memory stats', () => {
    const result = createResult('throughput', { messageCount: 1000 }, mockMetrics, true);

    expect(result.metrics.memory).toBeDefined();
    expect(typeof result.metrics.memory.peakRssMB).toBe('number');
  });

  test('profile parameter works with all profiles', () => {
    for (const profileName of ['micro', 'small', 'medium', 'native']) {
      const result = createResult('throughput', {}, mockMetrics, true, undefined, profileName);
      expect(result.environment.dockerProfile?.name).toBe(profileName);
    }
  });
});

describe('saveResults', () => {
  const resultsDir = `${import.meta.dir}/../results`;
  let originalFiles: string[] = [];

  beforeEach(async () => {
    try {
      originalFiles = await readdir(resultsDir);
    } catch {
      originalFiles = [];
    }
  });

  afterEach(async () => {
    try {
      const currentFiles = await readdir(resultsDir);
      const newFiles = currentFiles.filter((f) => !originalFiles.includes(f));
      for (const file of newFiles) {
        await rm(`${resultsDir}/${file}`);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  const createMockResult = (overrides: Partial<BenchmarkResult> = {}): BenchmarkResult => ({
    scenario: 'throughput',
    config: { messageCount: 1000 },
    environment: {
      bunVersion: '1.0.0',
      cpuModel: 'Test CPU',
      cpuCores: 4,
      totalMemoryMB: 8192,
      platform: 'linux',
      arch: 'arm64',
      timestamp: new Date().toISOString(),
    },
    metrics: {
      messagesPerSec: 10000,
      latency: { p50: 0.5, p95: 1.0, p99: 2.0, min: 0.1, max: 5.0, mean: 0.6, count: 1000 },
      memory: { peakRssMB: 100, heapUsedMB: 50, heapSizeMB: 80 },
      durationMs: 1000,
    },
    success: true,
    ...overrides,
  });

  test('saves result to file without profile in filename by default', async () => {
    const result = createMockResult();
    const path = await saveResults(result);

    expect(path).toMatch(/throughput-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    expect(path).toMatch(/\.json$/);
    expect(path).not.toContain('-micro-');
    expect(path).not.toContain('-small-');
    expect(path).not.toContain('-medium-');
    expect(path).not.toContain('-native-');
  });

  test('includes profile name in filename when dockerProfile present', async () => {
    const result = createMockResult({
      environment: {
        ...createMockResult().environment,
        dockerProfile: { name: 'micro', cpu: 0.25, memory: '1GB' },
      },
    });
    const path = await saveResults(result);

    expect(path).toMatch(/throughput-micro-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    expect(path).toMatch(/\.json$/);
  });

  test('includes different profile names in filename', async () => {
    const profiles = ['small', 'medium', 'native'] as const;

    for (const profileName of profiles) {
      const profile = getProfile(profileName);
      const result = createMockResult({
        environment: {
          ...createMockResult().environment,
          dockerProfile: { name: profile.name, cpu: profile.cpu, memory: profile.memory },
        },
      });
      const path = await saveResults(result);

      expect(path).toContain(`-${profileName}-`);
    }
  });

  test('file contains valid JSON with dockerProfile', async () => {
    const result = createMockResult({
      environment: {
        ...createMockResult().environment,
        dockerProfile: { name: 'micro', cpu: 0.25, memory: '1GB' },
      },
    });
    const path = await saveResults(result);

    const content = await Bun.file(path).text();
    const parsed = JSON.parse(content);

    expect(parsed.environment.dockerProfile).toEqual({
      name: 'micro',
      cpu: 0.25,
      memory: '1GB',
    });
  });

  test('returns correct path', async () => {
    const result = createMockResult();
    const path = await saveResults(result);

    expect(path).toContain('/results/');
    expect(path).toContain('throughput');
    expect(path).toEndWith('.json');
  });
});
