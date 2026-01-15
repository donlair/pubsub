/**
 * Snapshot - Point-in-time subscription state (stub implementation).
 * Reference: specs/01-pubsub-client.md
 */

import type { SnapshotMetadata, CreateSnapshotOptions } from './types/subscription';
import type { CallOptions } from './types/common';
import { UnimplementedError } from './types/errors';

export class Snapshot {
	readonly name: string;
	readonly pubsub: unknown;

	constructor(pubsub: unknown, name: string) {
		this.pubsub = pubsub;
		this.name = name;
	}

	async create(_options?: CreateSnapshotOptions): Promise<[Snapshot, SnapshotMetadata]> {
		throw new UnimplementedError('Snapshots are not implemented in local development mode');
	}

	async delete(_options?: CallOptions): Promise<[unknown]> {
		throw new UnimplementedError('Snapshots are not implemented in local development mode');
	}

	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [false];
	}

	async getMetadata(_options?: CallOptions): Promise<[SnapshotMetadata]> {
		throw new UnimplementedError('Snapshots are not implemented in local development mode');
	}

	async seek(_options?: CallOptions): Promise<[unknown]> {
		throw new UnimplementedError('Snapshots are not implemented in local development mode');
	}
}
