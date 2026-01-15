/**
 * Schema validation types.
 * Reference: specs/08-schema.md, research/11-typescript-types.md#schema-types
 */

import type { CallOptions } from './common';

/**
 * Schema definition types.
 */
export const SchemaTypes = {
  ProtocolBuffer: 'PROTOCOL_BUFFER',
  Avro: 'AVRO'
} as const;

export type SchemaType = (typeof SchemaTypes)[keyof typeof SchemaTypes];

/**
 * Schema view levels for retrieval.
 */
export const SchemaViews = {
  Basic: 'BASIC',
  Full: 'FULL'
} as const;

export type SchemaView = (typeof SchemaViews)[keyof typeof SchemaViews];

/**
 * Message encoding types for schema validation.
 */
export const Encodings = {
  Json: 'JSON',
  Binary: 'BINARY'
} as const;

export type SchemaEncoding = (typeof Encodings)[keyof typeof Encodings];

/**
 * Schema resource interface.
 * Reference: research/11-typescript-types.md#ischema
 */
export interface ISchema {
  /** Full resource name: projects/{project}/schemas/{schema} */
  name?: string;
  /** Schema type (AVRO or PROTOCOL_BUFFER). */
  type?: SchemaType;
  /** Schema definition string. */
  definition?: string;
  /** Revision identifier. */
  revisionId?: string;
  /** Revision creation timestamp. */
  revisionCreateTime?: { seconds?: number; nanos?: number };
}

/**
 * Schema definition for validation.
 * Reference: specs/01-pubsub-client.md
 */
export interface SchemaDefinition {
  /** Schema type (AVRO or PROTOCOL_BUFFER). */
  type: SchemaType;
  /** Schema definition string. */
  definition: string;
}

/**
 * Schema settings for a topic.
 * Reference: research/11-typescript-types.md#schemasettings
 */
export interface SchemaSettings {
  /** Schema resource name. */
  schema?: string;
  /** Expected message encoding. */
  encoding?: SchemaEncoding;
  /** First revision ID to use for validation. */
  firstRevisionId?: string;
  /** Last revision ID to use for validation. */
  lastRevisionId?: string;
}

/**
 * Schema metadata extracted from message attributes.
 */
export interface SchemaMessageMetadata {
  /** Schema name from message attributes. */
  name?: string;
  /** Schema revision from message attributes. */
  revision?: string;
  /** Message encoding. */
  encoding: SchemaEncoding | undefined;
}

/**
 * Options for creating a schema.
 */
export interface CreateSchemaOptions {
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}

/**
 * Options for validating a schema.
 */
export interface ValidateSchemaOptions {
  /** Schema object to validate. */
  schema?: ISchema;
  /** gRPC call options. */
  gaxOpts?: CallOptions;
}
