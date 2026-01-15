/**
 * Schema - Schema validation and management.
 * Reference: specs/08-schema.md
 */

import Ajv, { type ValidateFunction } from 'ajv';
import type { SchemaType, SchemaView, SchemaEncoding, ISchema, CreateSchemaOptions, ValidateSchemaOptions } from './types/schema';
import type { CallOptions } from './types/common';
import { UnimplementedError, InvalidArgumentError, NotFoundError } from './types/errors';

export class Schema {
	readonly id: string;
	readonly name: string;
	readonly pubsub: {
		schemas: Map<string, { type: SchemaType; definition: string }>;
		projectId: string;
	};
	type?: SchemaType;
	definition?: string;

	private static ajv = new Ajv({ allErrors: true, strict: false });
	private static validatorCache = new Map<string, ValidateFunction>();

	constructor(pubsub: unknown, id: string) {
		this.pubsub = pubsub as { schemas: Map<string, { type: SchemaType; definition: string }>; projectId: string };
		this.id = id;
		this.name = id.startsWith('projects/') ? id : `projects/${this.pubsub.projectId}/schemas/${id.replace(/^projects\/[^/]+\/schemas\//, '')}`;
	}

	async create(type: SchemaType, definition: string, _options?: CreateSchemaOptions): Promise<[Schema, ISchema]> {
		if (type === 'JSON') {
			try {
				const schema = JSON.parse(definition);
				Schema.ajv.compile(schema);
			} catch (error) {
				throw new InvalidArgumentError(`Invalid JSON Schema definition: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		} else if (type === 'AVRO') {
			try {
				JSON.parse(definition);
			} catch {
				throw new InvalidArgumentError('Invalid AVRO schema definition: must be valid JSON');
			}
		}

		this.type = type;
		this.definition = definition;

		this.pubsub.schemas.set(this.name, { type, definition });

		const metadata: ISchema = {
			name: this.name,
			type: this.type,
			definition: this.definition
		};

		return [this, metadata];
	}

	async delete(_options?: CallOptions): Promise<[unknown]> {
		if (!this.pubsub.schemas.has(this.name)) {
			throw new NotFoundError(`Schema not found: ${this.name}`);
		}

		this.pubsub.schemas.delete(this.name);
		return [{}];
	}

	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [this.pubsub.schemas.has(this.name)];
	}

	async get(view?: SchemaView, _options?: CallOptions): Promise<[Schema, ISchema]> {
		const schemaData = this.pubsub.schemas.get(this.name);

		if (!schemaData) {
			throw new NotFoundError(`Schema not found: ${this.name}`);
		}

		this.type = schemaData.type;
		this.definition = schemaData.definition;

		const metadata: ISchema = {
			name: this.name,
			type: this.type,
			definition: view === 'FULL' ? this.definition : undefined
		};

		return [this, metadata];
	}

	async validateMessage(message: string | Buffer, encoding: SchemaEncoding, _options?: ValidateSchemaOptions): Promise<void> {
		if (!this.type) {
			const schemaData = this.pubsub.schemas.get(this.name);
			if (!schemaData) {
				throw new NotFoundError(`Schema not found: ${this.name}`);
			}
			this.type = schemaData.type;
			this.definition = schemaData.definition;
		}

		if (this.type === 'AVRO') {
			throw new UnimplementedError('AVRO schemas are not yet implemented. Use SchemaType.JSON for local development.');
		}

		if (this.type === 'PROTOCOL_BUFFER') {
			throw new UnimplementedError('Protocol Buffer schemas are not yet implemented. Use SchemaType.JSON for local development.');
		}

		if (this.type === 'JSON') {
			if (!this.definition) {
				throw new InvalidArgumentError('Schema definition not found');
			}

			const cacheKey = this.name;
			let validator = Schema.validatorCache.get(cacheKey);

			if (!validator) {
				try {
					const schemaObj = JSON.parse(this.definition);
					validator = Schema.ajv.compile(schemaObj);
					Schema.validatorCache.set(cacheKey, validator);
				} catch (error) {
					throw new InvalidArgumentError(`Failed to compile schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}

			let data: unknown;
			try {
				if (encoding === 'JSON') {
					const jsonString = Buffer.isBuffer(message) ? message.toString('utf8') : message;
					data = JSON.parse(jsonString);
				} else {
					data = message;
				}
			} catch (error) {
				throw new InvalidArgumentError(`Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}

			const valid = validator(data);
			if (!valid) {
				const errors = validator.errors?.map(e => `${e.instancePath} ${e.message}`).join(', ') || 'Validation failed';
				throw new InvalidArgumentError(`Message validation failed: ${errors}`);
			}
		}
	}

	async getName(): Promise<string> {
		return this.name;
	}
}
