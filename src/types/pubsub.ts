/**
 * PubSub client configuration types.
 * Reference: specs/01-pubsub-client.md, research/01-client-configuration.md
 */

import type { CallOptions } from './common';

/**
 * gRPC channel credentials (stub type).
 */
export interface ChannelCredentials {
  _isChannelCredentials: boolean;
}

/**
 * Client configuration extending gRPC options.
 * Reference: research/11-typescript-types.md#clientconfig
 */
export interface ClientConfig {
  /** Google Cloud project ID. */
  projectId?: string;

  /** Path to service account key file. */
  keyFilename?: string;

  /** Service account credentials object. */
  credentials?: {
    client_email?: string;
    private_key?: string;
    type?: string;
  };

  /**
   * Custom API endpoint.
   * Uses PUBSUB_EMULATOR_HOST env var if not set.
   */
  apiEndpoint?: string;

  /** Custom service path. */
  servicePath?: string;

  /** Service port. */
  port?: string | number;

  /** SSL channel credentials. */
  sslCreds?: ChannelCredentials;

  /**
   * Auto-retry on rate limits and transient errors.
   * @default true
   */
  autoRetry?: boolean;

  /** gRPC library override. */
  grpc?: unknown;

  /**
   * Fallback mode.
   * - false: gRPC only
   * - 'rest': REST only
   * - 'proto': HTTP/1.1 with protobuf
   */
  fallback?: boolean | 'rest' | 'proto';

  /**
   * Arbitrary gRPC client configuration.
   * Pass-through for gRPC-specific options.
   */
  clientConfig?: unknown;
}

/**
 * PubSub client options.
 * Reference: specs/01-pubsub-client.md
 */
export interface PubSubOptions extends ClientConfig {
  /**
   * Emulator mode behavior.
   * - false: Always production
   * - true: Always emulator
   * - undefined: Auto-detect from environment
   */
  emulatorMode?: boolean;

  /**
   * Enable OpenTelemetry tracing.
   * @default false
   */
  enableOpenTelemetryTracing?: boolean;

  /**
   * gRPC call options.
   *
   * Note: Accepted for API compatibility but has no runtime effect in this in-memory implementation.
   */
  gaxOpts?: CallOptions;
}

/**
 * Default PubSub client options.
 */
export const DEFAULT_PUBSUB_OPTIONS: Partial<PubSubOptions> = {
  projectId: 'local-project',
  autoRetry: true,
  enableOpenTelemetryTracing: false
};
