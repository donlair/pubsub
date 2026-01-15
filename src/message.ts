/**
 * Message - Received Pub/Sub message with ack/nack functionality.
 * Reference: specs/04-message.md
 *
 * Represents a message received from a subscription. Provides methods to
 * acknowledge (ack) or negatively acknowledge (nack) the message.
 */

import type { Attributes, AckResponse, MessageProperties } from './types/message';
import type { PreciseDate } from './types/common';
import { AckResponses } from './types/message';
import { MessageQueue } from './internal/message-queue';

/**
 * Minimal Subscription interface for Message class.
 * Full implementation in Phase 7.
 */
interface ISubscription {
	name: string;
}

/**
 * Message class represents a received Pub/Sub message.
 */
export class Message implements MessageProperties {
	readonly id: string;
	readonly ackId: string;
	readonly data: Buffer;
	readonly attributes: Readonly<Attributes>;
	readonly publishTime: PreciseDate;
	readonly received: number;
	readonly orderingKey?: string;
	readonly deliveryAttempt?: number;
	readonly length: number;

	private _acked = false;

	constructor(
		id: string,
		ackId: string,
		data: Buffer,
		attributes: Attributes,
		publishTime: PreciseDate,
		_subscription: ISubscription,
		orderingKey?: string,
		deliveryAttempt?: number,
	) {
		this.id = id;
		this.ackId = ackId;
		this.data = data;
		this.attributes = Object.freeze({ ...attributes });
		this.publishTime = publishTime;
		this.received = Date.now();
		this.orderingKey = orderingKey;
		this.deliveryAttempt = deliveryAttempt;
		this.length = data.length;
	}

	/**
	 * Acknowledge the message - removes it from subscription.
	 * Idempotent - multiple calls have no effect after first ack/nack.
	 */
	ack(): void {
		if (this._acked) return;
		this._acked = true;

		const queue = MessageQueue.getInstance();
		queue.ack(this.ackId);
	}

	/**
	 * Negative acknowledge - redelivers message immediately.
	 * First operation (ack or nack) wins.
	 */
	nack(): void {
		if (this._acked) return;
		this._acked = true;

		const queue = MessageQueue.getInstance();
		queue.nack(this.ackId);
	}

	/**
	 * Modify ack deadline for this message.
	 * @param seconds - New deadline in seconds (0-600). 0 = immediate redelivery.
	 */
	modifyAckDeadline(seconds: number): void {
		if (seconds < 0 || seconds > 600) {
			throw new Error('Ack deadline must be between 0 and 600 seconds');
		}

		const queue = MessageQueue.getInstance();

		// 0 seconds means immediate redelivery (same as nack)
		if (seconds === 0) {
			this.nack();
			return;
		}

		queue.modifyAckDeadline(this.ackId, seconds);
	}

	/**
	 * Alias for modifyAckDeadline.
	 */
	modAck(deadline: number): void {
		this.modifyAckDeadline(deadline);
	}

	/**
	 * Acknowledge with exactly-once delivery confirmation.
	 * Returns SUCCESS if ack successful, or error code if failed.
	 */
	async ackWithResponse(): Promise<AckResponse> {
		if (this._acked) {
			return AckResponses.Invalid;
		}

		this.ack();
		return AckResponses.Success;
	}

	/**
	 * Negative acknowledge with exactly-once delivery confirmation.
	 */
	async nackWithResponse(): Promise<AckResponse> {
		if (this._acked) {
			return AckResponses.Invalid;
		}

		this.nack();
		return AckResponses.Success;
	}

	/**
	 * Modify ack deadline with exactly-once delivery confirmation.
	 */
	async modAckWithResponse(deadline: number): Promise<AckResponse> {
		try {
			this.modifyAckDeadline(deadline);
			return AckResponses.Success;
		} catch {
			return AckResponses.Invalid;
		}
	}
}
