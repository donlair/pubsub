import { MessageQueue } from '../internal/message-queue';
import type { BatchOptions } from '../types/subscriber';
import { DEFAULT_SUBSCRIBER_BATCH_OPTIONS } from '../types/subscriber';

interface PendingAck {
	ackId: string;
	resolve: () => void;
	reject: (error: Error) => void;
}

interface Batch {
	pending: PendingAck[];
	timer?: ReturnType<typeof setTimeout>;
}

export class AckManager {
	private readonly batching: Required<BatchOptions>;
	private readonly queue: MessageQueue;

	private ackBatch: Batch;
	private nackBatch: Batch;

	constructor(_subscriptionName: string, options?: BatchOptions) {
		this.batching = {
			maxMessages: options?.maxMessages ?? DEFAULT_SUBSCRIBER_BATCH_OPTIONS.maxMessages,
			maxMilliseconds: options?.maxMilliseconds ?? DEFAULT_SUBSCRIBER_BATCH_OPTIONS.maxMilliseconds,
		};
		this.queue = MessageQueue.getInstance();

		this.ackBatch = this.createBatch();
		this.nackBatch = this.createBatch();
	}

	async ack(ackId: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.ackBatch.pending.push({ ackId, resolve, reject });

			if (this.shouldFlushBatch(this.ackBatch)) {
				this.flushAckBatch().catch(() => {});
			} else if (this.batching.maxMilliseconds === 0) {
				this.flushAckBatch().catch(() => {});
			} else if (!this.ackBatch.timer) {
				this.ackBatch.timer = setTimeout(() => {
					this.flushAckBatch().catch(() => {});
				}, this.batching.maxMilliseconds);
			}
		});
	}

	async nack(ackId: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.nackBatch.pending.push({ ackId, resolve, reject });

			if (this.shouldFlushBatch(this.nackBatch)) {
				this.flushNackBatch().catch(() => {});
			} else if (this.batching.maxMilliseconds === 0) {
				this.flushNackBatch().catch(() => {});
			} else if (!this.nackBatch.timer) {
				this.nackBatch.timer = setTimeout(() => {
					this.flushNackBatch().catch(() => {});
				}, this.batching.maxMilliseconds);
			}
		});
	}

	async flush(): Promise<void> {
		const promises: Promise<void>[] = [];

		if (this.ackBatch.pending.length > 0) {
			promises.push(this.flushAckBatch().catch(() => {}));
		}

		if (this.nackBatch.pending.length > 0) {
			promises.push(this.flushNackBatch().catch(() => {}));
		}

		await Promise.all(promises);
	}

	async close(): Promise<void> {
		await this.flush();
	}

	private shouldFlushBatch(batch: Batch): boolean {
		return batch.pending.length >= this.batching.maxMessages;
	}

	private async flushAckBatch(): Promise<void> {
		const batch = this.ackBatch;

		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = undefined;
		}

		if (batch.pending.length === 0) {
			return;
		}

		const pending = [...batch.pending];

		batch.pending = [];

		try {
			for (const item of pending) {
				this.queue.ack(item.ackId);
			}

			for (const item of pending) {
				item.resolve();
			}
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error(`Ack batch failed: ${String(error)}`);

			for (const item of pending) {
				item.reject(err);
			}

			throw error;
		}
	}

	private async flushNackBatch(): Promise<void> {
		const batch = this.nackBatch;

		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = undefined;
		}

		if (batch.pending.length === 0) {
			return;
		}

		const pending = [...batch.pending];

		batch.pending = [];

		try {
			for (const item of pending) {
				this.queue.nack(item.ackId);
			}

			for (const item of pending) {
				item.resolve();
			}
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error(`Nack batch failed: ${String(error)}`);

			for (const item of pending) {
				item.reject(err);
			}

			throw error;
		}
	}

	private createBatch(): Batch {
		return {
			pending: [],
			timer: undefined,
		};
	}
}
