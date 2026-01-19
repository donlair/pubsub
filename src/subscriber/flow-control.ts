/**
 * SubscriberFlowControl - Manages subscriber flow control limits.
 * Reference: specs/06-subscriber.md
 *
 * Controls in-flight messages/bytes to prevent overwhelming the subscriber.
 * Allows checking if capacity is available before pulling new messages.
 */

import type { SubscriberFlowControlOptions } from '../types/subscriber';
import { DEFAULT_SUBSCRIBER_FLOW_CONTROL } from '../types/subscriber';

export class SubscriberFlowControl {
	private readonly maxMessages: number;
	private readonly maxBytes: number;
	private readonly allowExcessMessages: boolean;
	private inFlightMessages = 0;
	private inFlightBytes = 0;
	private inBatchPull = false;

	constructor(options?: SubscriberFlowControlOptions) {
		this.maxMessages =
			options?.maxMessages ?? DEFAULT_SUBSCRIBER_FLOW_CONTROL.maxMessages;
		this.maxBytes =
			options?.maxBytes ?? DEFAULT_SUBSCRIBER_FLOW_CONTROL.maxBytes;
		this.allowExcessMessages =
			options?.allowExcessMessages ??
			DEFAULT_SUBSCRIBER_FLOW_CONTROL.allowExcessMessages;
	}

	/**
	 * Check if we can accept a message of given size.
	 * When allowExcessMessages is true, allows batches to complete even if maxMessages
	 * is exceeded, but still enforces maxBytes to prevent memory exhaustion.
	 */
	canAccept(messageBytes: number): boolean {
		if (this.allowExcessMessages && this.inBatchPull) {
			if (this.inFlightBytes + messageBytes > this.maxBytes) {
				return false;
			}
			return true;
		}

		return (
			this.inFlightMessages < this.maxMessages &&
			this.inFlightBytes + messageBytes <= this.maxBytes
		);
	}

	/**
	 * Mark the start of a batch pull operation.
	 */
	startBatchPull(): void {
		this.inBatchPull = true;
	}

	/**
	 * Mark the end of a batch pull operation.
	 */
	endBatchPull(): void {
		this.inBatchPull = false;
	}

	/**
	 * Add a message to in-flight tracking.
	 */
	addMessage(bytes: number): void {
		this.inFlightMessages++;
		this.inFlightBytes += bytes;
	}

	/**
	 * Remove a message from in-flight tracking (after ack/nack).
	 */
	removeMessage(bytes: number): void {
		this.inFlightMessages--;
		this.inFlightBytes -= bytes;
	}

	/**
	 * Get current in-flight message count.
	 */
	getInFlightMessages(): number {
		return this.inFlightMessages;
	}

	/**
	 * Get current in-flight bytes.
	 */
	getInFlightBytes(): number {
		return this.inFlightBytes;
	}
}
