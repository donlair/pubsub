/**
 * LeaseManager - Manages ack deadline tracking and automatic extensions.
 * Reference: specs/06-subscriber.md
 *
 * Tracks message leases and automatically extends deadlines as needed
 * until messages are acked or maxExtensionTime is reached.
 */

import type { Message } from '../message';
import type { Duration } from '../types/common';

interface Lease {
	message: Message;
	startTime: number;
	deadline: number;
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
	private readonly ackDeadlineSeconds: number;
	private leases: Map<string, Lease>;

	constructor(options: {
		minAckDeadline?: Duration;
		maxAckDeadline?: Duration;
		maxExtensionTime?: Duration;
		ackDeadlineSeconds?: number;
	}) {
		this.minAckDeadline = durationToSeconds(options.minAckDeadline ?? 10);
		this.maxAckDeadline = durationToSeconds(options.maxAckDeadline ?? 600);
		this.maxExtensionTime = durationToSeconds(options.maxExtensionTime ?? 3600);
		this.ackDeadlineSeconds = options.ackDeadlineSeconds ?? 10;
		this.leases = new Map();
	}

	/**
	 * Add a lease for a message.
	 * Uses subscription's ackDeadlineSeconds for initial deadline.
	 */
	addLease(message: Message): void {
		const now = Date.now();

		const lease: Lease = {
			message,
			startTime: now,
			deadline: now + this.ackDeadlineSeconds * 1000,
		};

		this.leases.set(message.ackId, lease);
	}

	/**
	 * Remove a lease (after ack/nack).
	 */
	removeLease(ackId: string): void {
		this.leases.delete(ackId);
	}

	/**
	 * Manually extend a lease deadline (called by user code via message.modifyAckDeadline).
	 */
	extendDeadline(ackId: string, seconds: number): void {
		const lease = this.leases.get(ackId);
		if (!lease) {
			return;
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
	}

	/**
	 * Clear all leases (on stop).
	 */
	clear(): void {
		this.leases.clear();
	}
}
