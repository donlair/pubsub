/**
 * Schema - Schema validation and management (stub implementation).
 * Reference: specs/08-schema.md
 */

import type { SchemaType, SchemaView, SchemaEncoding, ISchema, CreateSchemaOptions, ValidateSchemaOptions } from './types/schema';
import type { CallOptions } from './types/common';
import { UnimplementedError } from './types/errors';

export class Schema {
	readonly id: string;
	readonly name: string;
	readonly pubsub: unknown;
	type?: SchemaType;
	definition?: string;

	constructor(pubsub: unknown, id: string) {
		this.pubsub = pubsub;
		this.id = id;
		this.name = id;
	}

	async create(type: SchemaType, definition: string, _options?: CreateSchemaOptions): Promise<[Schema, ISchema]> {
		this.type = type;
		this.definition = definition;

		const metadata: ISchema = {
			name: this.name,
			type: this.type,
			definition: this.definition
		};

		return [this, metadata];
	}

	async delete(_options?: CallOptions): Promise<[unknown]> {
		return [{}];
	}

	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [false];
	}

	async get(view?: SchemaView, _options?: CallOptions): Promise<[Schema, ISchema]> {
		const metadata: ISchema = {
			name: this.name,
			type: this.type,
			definition: view === 'FULL' ? this.definition : undefined
		};

		return [this, metadata];
	}

	async validateMessage(_message: string | Buffer, _encoding: SchemaEncoding, _options?: ValidateSchemaOptions): Promise<void> {
		throw new UnimplementedError('Schema validation is not implemented in local development mode');
	}

	async getName(): Promise<string> {
		return this.name;
	}
}
