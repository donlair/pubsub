/**
 * PublisherFlowControl - Manages publisher flow control limits.
 * Reference: specs/05-publisher.md
 *
 * Blocks publishing when outstanding messages or bytes exceed limits.
 * Releases capacity as messages are published.
 */

import type { PublisherFlowControlOptions } from '../types/publisher';
import { DEFAULT_PUBLISHER_FLOW_CONTROL } from '../types/publisher';

export class PublisherFlowControl {
	private readonly maxOutstandingMessages: number;
	private readonly maxOutstandingBytes: number;
	private outstandingMessages = 0;
	private outstandingBytes = 0;
	private pendingAcquires: Array<{
		bytes: number;
		resolve: () => void;
	}> = [];

	constructor(options?: PublisherFlowControlOptions) {
		this.maxOutstandingMessages =
			options?.maxOutstandingMessages ??
			DEFAULT_PUBLISHER_FLOW_CONTROL.maxOutstandingMessages;
		this.maxOutstandingBytes =
			options?.maxOutstandingBytes ??
			DEFAULT_PUBLISHER_FLOW_CONTROL.maxOutstandingBytes;
	}

	/**
	 * Acquire capacity for publishing.
	 * Blocks if limits exceeded until capacity becomes available.
	 */
	async acquire(bytes: number): Promise<void> {
		if (
			this.outstandingMessages < this.maxOutstandingMessages &&
			this.outstandingBytes + bytes <= this.maxOutstandingBytes
		) {
			this.outstandingMessages++;
			this.outstandingBytes += bytes;
			return;
		}

		return new Promise<void>((resolve) => {
			this.pendingAcquires.push({ bytes, resolve });
		});
	}

	/**
	 * Release capacity after publishing completes.
	 */
	release(bytes: number): void {
		this.outstandingMessages--;
		this.outstandingBytes -= bytes;

		this.processPendingAcquires();
	}

	/**
	 * Process pending acquire requests that can now be satisfied.
	 */
	private processPendingAcquires(): void {
		while (this.pendingAcquires.length > 0) {
			const next = this.pendingAcquires[0];
			if (!next) break;

			if (
				this.outstandingMessages >= this.maxOutstandingMessages ||
				this.outstandingBytes + next.bytes > this.maxOutstandingBytes
			) {
				break;
			}

			this.pendingAcquires.shift();
			this.outstandingMessages++;
			this.outstandingBytes += next.bytes;
			next.resolve();
		}
	}
}
