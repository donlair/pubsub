/**
 * LeaseManager - Manages ack deadline tracking and automatic extensions.
 * Reference: specs/06-subscriber.md
 *
 * Tracks message leases and automatically extends deadlines as needed
 * until messages are acked or maxExtensionTime is reached.
 */

import type { Message } from '../message';
import { MessageQueue } from '../internal/message-queue';
import type { Duration } from '../types/common';

interface Lease {
	message: Message;
	startTime: number;
	deadline: number;
	timer?: ReturnType<typeof setTimeout>;
}

/**
 * Convert Duration to seconds.
 */
function durationToSeconds(duration: Duration): number {
	if (typeof duration === 'number') {
		return duration;
	}
	const seconds = duration.seconds ?? 0;
	const nanos = duration.nanos ?? 0;
	return seconds + nanos / 1e9;
}

export class LeaseManager {
	private readonly minAckDeadline: number;
	private readonly maxAckDeadline: number;
	private readonly maxExtensionTime: number;
	private leases: Map<string, Lease>;
	private messageQueue: MessageQueue;

	constructor(options: {
		minAckDeadline?: Duration;
		maxAckDeadline?: Duration;
		maxExtensionTime?: Duration;
	}) {
		this.minAckDeadline = durationToSeconds(options.minAckDeadline ?? 10);
		this.maxAckDeadline = durationToSeconds(options.maxAckDeadline ?? 600);
		this.maxExtensionTime = durationToSeconds(options.maxExtensionTime ?? 3600);
		this.leases = new Map();
		this.messageQueue = MessageQueue.getInstance();
	}

	/**
	 * Add a lease for a message.
	 */
	addLease(message: Message): void {
		const now = Date.now();
		const deadline = this.minAckDeadline * 1000;

		const lease: Lease = {
			message,
			startTime: now,
			deadline: now + deadline,
		};

		const timer = setTimeout(() => {
			this.handleLeaseExpiry(message.ackId);
		}, deadline);

		lease.timer = timer;
		this.leases.set(message.ackId, lease);
	}

	/**
	 * Remove a lease (after ack/nack).
	 */
	removeLease(ackId: string): void {
		const lease = this.leases.get(ackId);
		if (lease?.timer) {
			clearTimeout(lease.timer);
		}
		this.leases.delete(ackId);
	}

	/**
	 * Extend a lease deadline.
	 */
	extendDeadline(ackId: string, seconds: number): void {
		const lease = this.leases.get(ackId);
		if (!lease) {
			return;
		}

		if (lease.timer) {
			clearTimeout(lease.timer);
		}

		const now = Date.now();
		const elapsed = (now - lease.startTime) / 1000;

		if (elapsed >= this.maxExtensionTime) {
			this.removeLease(ackId);
			return;
		}

		const extensionSeconds = Math.min(
			seconds,
			this.maxAckDeadline,
			this.maxExtensionTime - elapsed,
		);

		lease.deadline = now + extensionSeconds * 1000;

		const timer = setTimeout(() => {
			this.handleLeaseExpiry(ackId);
		}, extensionSeconds * 1000);

		lease.timer = timer;
	}

	/**
	 * Handle lease expiry - nack the message for redelivery.
	 */
	private handleLeaseExpiry(ackId: string): void {
		const lease = this.leases.get(ackId);
		if (!lease) {
			return;
		}

		this.removeLease(ackId);
		this.messageQueue.nack(ackId);
	}

	/**
	 * Clear all leases (on stop).
	 */
	clear(): void {
		for (const lease of this.leases.values()) {
			if (lease.timer) {
				clearTimeout(lease.timer);
			}
		}
		this.leases.clear();
	}
}
