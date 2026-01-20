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

const EXTENSION_THRESHOLD_SECONDS = 2;

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
	 * Get all leases that are approaching their deadline and need extension.
	 * Extends when less than 2 seconds remain to ensure timely extension.
	 */
	getLeasesNeedingExtension(): Lease[] {
		const now = Date.now();
		const leasesNeedingExtension: Lease[] = [];

		for (const lease of this.leases.values()) {
			const elapsed = (now - lease.startTime) / 1000;
			const remainingExtensionTime = this.maxExtensionTime - elapsed;

			if (remainingExtensionTime <= 0) {
				continue;
			}

			const timeUntilDeadline = (lease.deadline - now) / 1000;

			if (timeUntilDeadline <= EXTENSION_THRESHOLD_SECONDS && timeUntilDeadline > 0) {
				leasesNeedingExtension.push(lease);
			}
		}

		return leasesNeedingExtension;
	}

	/**
	 * Get the ack processing time for a completed lease.
	 */
	getAckTime(ackId: string): number | null {
		const lease = this.leases.get(ackId);
		if (!lease) {
			return null;
		}
		return Date.now() - lease.startTime;
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
