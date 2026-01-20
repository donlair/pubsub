/**
 * IAM - Identity and Access Management for Pub/Sub resources.
 * Reference: specs/02-topic.md, research/11-typescript-types.md#iam-types
 *
 * This is a stub implementation for Phase 6 (Topic).
 * Full implementation in Phase 10 (Advanced Features).
 */

import type { Policy } from './types/iam';
import type { PubSub } from './pubsub';
import { UnimplementedError } from './types/errors';

export class IAM {
	readonly pubsub: PubSub;
	readonly resourceId: string;

	constructor(pubsub: PubSub, resourceId: string) {
		this.pubsub = pubsub;
		this.resourceId = resourceId;
	}

	async getPolicy(): Promise<[Policy, unknown]> {
		throw new UnimplementedError('IAM.getPolicy() not yet implemented');
	}

	async setPolicy(_policy: Policy): Promise<[Policy, unknown]> {
		throw new UnimplementedError('IAM.setPolicy() not yet implemented');
	}

	async testPermissions(_permissions: string[]): Promise<[string[], unknown]> {
		throw new UnimplementedError('IAM.testPermissions() not yet implemented');
	}
}
