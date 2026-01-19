import { MessageQueue } from '../internal/message-queue';
import type { BatchOptions } from '../types/subscriber';
import { DEFAULT_SUBSCRIBER_BATCH_OPTIONS } from '../types/subscriber';

interface Batch {
	ackIds: string[];
	promises: Array<{ resolve: () => void; reject: (error: Error) => void }>;
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
			this.ackBatch.ackIds.push(ackId);
			this.ackBatch.promises.push({ resolve, reject });

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
			this.nackBatch.ackIds.push(ackId);
			this.nackBatch.promises.push({ resolve, reject });

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

		if (this.ackBatch.ackIds.length > 0) {
			promises.push(this.flushAckBatch().catch(() => {}));
		}

		if (this.nackBatch.ackIds.length > 0) {
			promises.push(this.flushNackBatch().catch(() => {}));
		}

		await Promise.all(promises);
	}

	async close(): Promise<void> {
		await this.flush();
	}

	private shouldFlushBatch(batch: Batch): boolean {
		return batch.ackIds.length >= this.batching.maxMessages;
	}

	private async flushAckBatch(): Promise<void> {
		const batch = this.ackBatch;

		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = undefined;
		}

		if (batch.ackIds.length === 0) {
			return;
		}

		const ackIds = [...batch.ackIds];
		const promises = [...batch.promises];

		batch.ackIds = [];
		batch.promises = [];

		try {
			for (const ackId of ackIds) {
				this.queue.ack(ackId);
			}

			for (const promise of promises) {
				promise.resolve();
			}
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error(`Ack batch failed: ${String(error)}`);

			for (const promise of promises) {
				promise.reject(err);
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

		if (batch.ackIds.length === 0) {
			return;
		}

		const ackIds = [...batch.ackIds];
		const promises = [...batch.promises];

		batch.ackIds = [];
		batch.promises = [];

		try {
			for (const ackId of ackIds) {
				this.queue.nack(ackId);
			}

			for (const promise of promises) {
				promise.resolve();
			}
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error(`Nack batch failed: ${String(error)}`);

			for (const promise of promises) {
				promise.reject(err);
			}

			throw error;
		}
	}

	private createBatch(): Batch {
		return {
			ackIds: [],
			promises: [],
			timer: undefined,
		};
	}
}
