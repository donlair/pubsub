import { test, expect, describe } from 'bun:test';
import {
  PROFILES,
  SCENARIO_BENCHMARKS,
  getProfile,
  listProfiles,
  type ResourceProfile,
  type ScenarioBenchmark,
} from './profiles';

describe('PROFILES constant', () => {
  test('contains micro, small, medium, native profiles', () => {
    expect(Object.keys(PROFILES)).toEqual(['micro', 'small', 'medium', 'native']);
  });

  test('micro profile has correct constraints', () => {
    expect(PROFILES.micro).toEqual({
      name: 'micro',
      cpu: 0.25,
      memory: '1GB',
      memoryMB: 1024,
      simulates: 'GCP e2-micro, AWS t3.micro',
    });
  });

  test('small profile has correct constraints', () => {
    expect(PROFILES.small).toEqual({
      name: 'small',
      cpu: 0.5,
      memory: '2GB',
      memoryMB: 2048,
      simulates: 'GCP e2-small, AWS t3.small',
    });
  });

  test('medium profile has correct constraints', () => {
    expect(PROFILES.medium).toEqual({
      name: 'medium',
      cpu: 1.0,
      memory: '4GB',
      memoryMB: 4096,
      simulates: 'GCP e2-medium, AWS t3.medium',
    });
  });

  test('native profile represents unlimited resources', () => {
    expect(PROFILES.native).toEqual({
      name: 'native',
      cpu: 0,
      memory: 'unlimited',
      memoryMB: 0,
      simulates: 'Host machine (baseline)',
    });
  });

  test('all profiles have required properties', () => {
    for (const [key, profile] of Object.entries(PROFILES)) {
      expect(profile.name).toBe(key);
      expect(typeof profile.cpu).toBe('number');
      expect(typeof profile.memory).toBe('string');
      expect(typeof profile.memoryMB).toBe('number');
      expect(typeof profile.simulates).toBe('string');
    }
  });
});

describe('getProfile', () => {
  test('returns profile for valid name', () => {
    const profile = getProfile('micro');
    expect(profile.name).toBe('micro');
    expect(profile.cpu).toBe(0.25);
  });

  test('returns each profile by name', () => {
    expect(getProfile('micro').name).toBe('micro');
    expect(getProfile('small').name).toBe('small');
    expect(getProfile('medium').name).toBe('medium');
    expect(getProfile('native').name).toBe('native');
  });

  test('throws for unknown profile', () => {
    expect(() => getProfile('unknown')).toThrow('Unknown profile: unknown');
  });

  test('error message includes available profiles', () => {
    expect(() => getProfile('invalid')).toThrow('Available: micro, small, medium, native');
  });
});

describe('listProfiles', () => {
  test('returns all profiles as array', () => {
    const profiles = listProfiles();
    expect(profiles).toHaveLength(4);
  });

  test('returns profiles in order', () => {
    const profiles = listProfiles();
    expect(profiles[0]?.name).toBe('micro');
    expect(profiles[1]?.name).toBe('small');
    expect(profiles[2]?.name).toBe('medium');
    expect(profiles[3]?.name).toBe('native');
  });

  test('returns ResourceProfile objects', () => {
    const profiles = listProfiles();
    for (const profile of profiles) {
      expect(profile).toHaveProperty('name');
      expect(profile).toHaveProperty('cpu');
      expect(profile).toHaveProperty('memory');
      expect(profile).toHaveProperty('memoryMB');
      expect(profile).toHaveProperty('simulates');
    }
  });
});

describe('SCENARIO_BENCHMARKS', () => {
  test('contains expected scenarios', () => {
    expect(SCENARIO_BENCHMARKS).toContain('throughput');
    expect(SCENARIO_BENCHMARKS).toContain('firehose');
    expect(SCENARIO_BENCHMARKS).toContain('fanout');
    expect(SCENARIO_BENCHMARKS).toContain('thundering-herd');
    expect(SCENARIO_BENCHMARKS).toContain('saturation');
  });

  test('has exactly 5 scenarios', () => {
    expect(SCENARIO_BENCHMARKS).toHaveLength(5);
  });

  test('does not contain deferred scenarios', () => {
    expect(SCENARIO_BENCHMARKS).not.toContain('soak');
    expect(SCENARIO_BENCHMARKS).not.toContain('chaos');
  });

  test('is readonly array', () => {
    const scenarios: readonly string[] = SCENARIO_BENCHMARKS;
    expect(Array.isArray(scenarios)).toBe(true);
  });
});

describe('type exports', () => {
  test('ResourceProfile type is usable', () => {
    const profile: ResourceProfile = {
      name: 'test',
      cpu: 1,
      memory: '1GB',
      memoryMB: 1024,
      simulates: 'Test profile',
    };
    expect(profile.name).toBe('test');
  });

  test('ScenarioBenchmark type is usable', () => {
    const scenario: ScenarioBenchmark = 'throughput';
    expect(scenario).toBe('throughput');
  });
});
