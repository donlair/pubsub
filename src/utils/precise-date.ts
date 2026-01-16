/**
 * PreciseDate - High-precision timestamp with nanosecond support.
 * Reference: specs/04-message.md
 *
 * Extends Date to provide nanosecond precision for message timestamps.
 * Compatible with @google-cloud/pubsub PreciseDate implementation.
 */

import type { ITimestamp } from '../types/common';

export class PreciseDate extends Date {
	private readonly _nanoseconds: number;

	constructor(value?: string | number | Date, nanos = 0) {
		if (typeof value === 'number') {
			super(value);
			this._nanoseconds = nanos;
		} else if (value instanceof Date) {
			super(value);
			this._nanoseconds = nanos;
		} else if (typeof value === 'string') {
			super(value);
			this._nanoseconds = nanos;
		} else {
			super();
			this._nanoseconds = 0;
		}
	}

	/**
	 * Get nanoseconds portion of timestamp (0-999999999).
	 */
	getNanoseconds(): number {
		return this._nanoseconds;
	}

	/**
	 * Get microseconds portion of timestamp (milliseconds * 1000 + nanos / 1000).
	 */
	getMicroseconds(): number {
		const milliseconds = this.getTime();
		const microsFromMillis = milliseconds * 1000;
		const microsFromNanos = Math.floor(this._nanoseconds / 1000);
		return microsFromMillis + microsFromNanos;
	}

	/**
	 * Get full timestamp as string with nanosecond precision.
	 * Format: ISO 8601 with nanosecond extension.
	 */
	getFullTimeString(): string {
		const isoString = this.toISOString();
		const baseString = isoString.slice(0, -1); // Remove 'Z'
		const nanoString = this._nanoseconds.toString().padStart(9, '0');
		return `${baseString}${nanoString}Z`;
	}

	/**
	 * Create PreciseDate from protobuf ITimestamp.
	 */
	static fromTimestamp(timestamp: ITimestamp): PreciseDate {
		const seconds =
			typeof timestamp.seconds === 'string'
				? Number.parseInt(timestamp.seconds, 10)
				: typeof timestamp.seconds === 'number'
					? timestamp.seconds
					: null;

		const nanos =
			typeof timestamp.nanos === 'number' ? timestamp.nanos : 0;

		// If seconds is null/undefined, create current date
		if (seconds === null) {
			return new PreciseDate(Date.now(), nanos);
		}

		return new PreciseDate(seconds * 1000, nanos);
	}
}
