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
	 */
	canAccept(messageBytes: number): boolean {
		if (this.allowExcessMessages && this.inFlightMessages === 0) {
			return true;
		}

		return (
			this.inFlightMessages < this.maxMessages &&
			this.inFlightBytes + messageBytes <= this.maxBytes
		);
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
