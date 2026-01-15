/**
 * Publisher - Message batching and flow control for Topic.
 * Reference: specs/05-publisher.md
 *
 * Handles batching with multiple triggers (count, time, size),
 * message ordering per key, and flow control limits.
 */

import type { PubsubMessage, Attributes } from '../types/message';
import type { PublishOptions } from '../types/publisher';
import { DEFAULT_BATCH_OPTIONS } from '../types/publisher';
import { PublisherFlowControl } from './flow-control';
import { MessageQueue } from '../internal/message-queue';
import type { InternalMessage } from '../internal/types';
import { PreciseDate } from '../utils/precise-date';
import { InvalidArgumentError } from '../types/errors';

interface Batch {
	messages: PubsubMessage[];
	totalBytes: number;
	promises: Array<{
		resolve: (messageId: string) => void;
		reject: (error: Error) => void;
	}>;
	timer?: ReturnType<typeof setTimeout>;
}

export class Publisher {
	private readonly topicName: string;
	private flowControl: PublisherFlowControl;
	private batching: Required<typeof DEFAULT_BATCH_OPTIONS>;
	private messageOrdering: boolean;
	private defaultBatch?: Batch;
	private orderingBatches: Map<string, Batch> = new Map();
	private pausedOrderingKeys: Set<string> = new Set();
	private readonly queue: MessageQueue;

	constructor(topicName: string, options?: PublishOptions) {
		this.topicName = topicName;
		this.queue = MessageQueue.getInstance();
		this.flowControl = new PublisherFlowControl(options?.flowControlOptions);
		this.batching = {
			maxMessages: options?.batching?.maxMessages ?? DEFAULT_BATCH_OPTIONS.maxMessages,
			maxMilliseconds: options?.batching?.maxMilliseconds ?? DEFAULT_BATCH_OPTIONS.maxMilliseconds,
			maxBytes: options?.batching?.maxBytes ?? DEFAULT_BATCH_OPTIONS.maxBytes,
		};
		this.messageOrdering = options?.messageOrdering ?? false;
	}

	/**
	 * Publish data with optional attributes and ordering key.
	 */
	async publish(
		data: Buffer,
		attributes?: Attributes,
		orderingKey?: string
	): Promise<string> {
		return this.publishMessage({ data, attributes, orderingKey });
	}

	/**
	 * Publish a complete message object.
	 */
	async publishMessage(message: PubsubMessage): Promise<string> {
		// Validate message
		if (message.data && !Buffer.isBuffer(message.data)) {
			throw new InvalidArgumentError('Message data must be a Buffer');
		}

		// Validate ordering key format
		if (message.orderingKey !== undefined) {
			if (message.orderingKey === '') {
				throw new InvalidArgumentError('Ordering key cannot be empty');
			}
			if (Buffer.byteLength(message.orderingKey, 'utf8') > 1024) {
				throw new InvalidArgumentError('Ordering key exceeds maximum length of 1024 bytes');
			}
		}

		// Check if ordering key is paused
		if (
			message.orderingKey &&
			this.pausedOrderingKeys.has(message.orderingKey)
		) {
			throw new InvalidArgumentError(
				`Ordering key ${message.orderingKey} is paused`
			);
		}

		// Calculate message size
		const dataSize = message.data?.length ?? 0;
		const attrSize = message.attributes
			? Object.entries(message.attributes).reduce(
					(sum, [k, v]) => sum + k.length + v.length,
					0
			  )
			: 0;
		const messageSize = dataSize + attrSize;

		// Acquire flow control capacity
		await this.flowControl.acquire(messageSize);

		// Add to appropriate batch
		return new Promise<string>((resolve, reject) => {
			const batch = this.getBatch(message.orderingKey);
			batch.messages.push(message);
			batch.totalBytes += messageSize;
			batch.promises.push({ resolve, reject });

			// Check if batch should be published
			if (this.shouldPublishBatch(batch)) {
				this.publishBatch(batch, message.orderingKey).catch((error) => {
					// Handle publish error - pause ordering key if present
					if (message.orderingKey) {
						this.pausedOrderingKeys.add(message.orderingKey);
					}
					reject(error);
				});
			} else if (!batch.timer) {
				// Start timer for time-based trigger
				batch.timer = setTimeout(() => {
					this.publishBatch(batch, message.orderingKey).catch(() => {
						// Timer-triggered publish errors are handled per message
					});
				}, this.batching.maxMilliseconds);
			}
		});
	}

	/**
	 * Flush all pending batches immediately.
	 */
	async flush(): Promise<void> {
		const publishPromises: Promise<void>[] = [];

		// Flush default batch
		if (this.defaultBatch && this.defaultBatch.messages.length > 0) {
			publishPromises.push(
				this.publishBatch(this.defaultBatch, undefined).catch(() => {
					// Errors handled per message
				})
			);
			this.defaultBatch = undefined;
		}

		// Flush ordering batches
		for (const [orderingKey, batch] of this.orderingBatches.entries()) {
			if (batch.messages.length > 0) {
				publishPromises.push(
					this.publishBatch(batch, orderingKey).catch(() => {
						// Errors handled per message
					})
				);
			}
		}
		this.orderingBatches.clear();

		await Promise.all(publishPromises);
	}

	/**
	 * Set publish options dynamically.
	 */
	setPublishOptions(options: PublishOptions): void {
		if (options.batching) {
			this.batching = {
				maxMessages: options.batching.maxMessages ?? this.batching.maxMessages,
				maxMilliseconds: options.batching.maxMilliseconds ?? this.batching.maxMilliseconds,
				maxBytes: options.batching.maxBytes ?? this.batching.maxBytes,
			};
		}
		if (options.messageOrdering !== undefined) {
			this.messageOrdering = options.messageOrdering;
		}
		if (options.flowControlOptions) {
			this.flowControl = new PublisherFlowControl(options.flowControlOptions);
		}
	}

	/**
	 * Resume publishing for a paused ordering key.
	 */
	resumePublishing(orderingKey: string): void {
		this.pausedOrderingKeys.delete(orderingKey);
		// Clear any queued messages for this key
		this.orderingBatches.delete(orderingKey);
	}

	/**
	 * Get the appropriate batch for this message.
	 */
	private getBatch(orderingKey?: string): Batch {
		if (this.messageOrdering && orderingKey) {
			let batch = this.orderingBatches.get(orderingKey);
			if (!batch) {
				batch = this.createBatch();
				this.orderingBatches.set(orderingKey, batch);
			}
			return batch;
		}

		if (!this.defaultBatch) {
			this.defaultBatch = this.createBatch();
		}
		return this.defaultBatch;
	}

	/**
	 * Create a new empty batch.
	 */
	private createBatch(): Batch {
		return {
			messages: [],
			totalBytes: 0,
			promises: [],
		};
	}

	/**
	 * Check if batch should be published based on thresholds.
	 */
	private shouldPublishBatch(batch: Batch): boolean {
		return (
			batch.messages.length >= this.batching.maxMessages ||
			batch.totalBytes >= this.batching.maxBytes
		);
	}

	/**
	 * Publish a batch to MessageQueue.
	 */
	private async publishBatch(
		batch: Batch,
		orderingKey?: string
	): Promise<void> {
		// Clear timer if exists
		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = undefined;
		}

		// Nothing to publish
		if (batch.messages.length === 0) {
			return;
		}

		// Convert to internal messages
		const internalMessages: InternalMessage[] = batch.messages.map((msg) => {
			const data = msg.data
				? Buffer.isBuffer(msg.data)
					? msg.data
					: Buffer.from(msg.data)
				: Buffer.alloc(0);

			return {
				id: '', // MessageQueue will assign IDs
				data,
				attributes: msg.attributes ?? {},
				publishTime: new PreciseDate(),
				orderingKey: msg.orderingKey,
				deliveryAttempt: 0,
				length:
					data.length +
					(msg.attributes
						? Object.entries(msg.attributes).reduce(
								(sum, [k, v]) => sum + k.length + v.length,
								0
						  )
						: 0),
			};
		});

		try {
			// Publish to MessageQueue
			const messageIds = this.queue.publish(this.topicName, internalMessages);

			// Resolve all promises with their message IDs
			for (let i = 0; i < batch.promises.length; i++) {
				batch.promises[i]?.resolve(messageIds[i] ?? '');
			}

			// Release flow control for all messages in batch
			for (const msg of internalMessages) {
				this.flowControl.release(msg.length);
			}

			// Clear the batch
			batch.messages = [];
			batch.totalBytes = 0;
			batch.promises = [];

			// Remove from ordering batches if applicable
			if (orderingKey) {
				this.orderingBatches.delete(orderingKey);
			} else {
				this.defaultBatch = undefined;
			}
		} catch (error) {
			// Reject all promises
			const err = error instanceof Error ? error : new Error(String(error));
			for (const promise of batch.promises) {
				promise.reject(err);
			}

			// Release flow control
			for (const msg of internalMessages) {
				this.flowControl.release(msg.length);
			}

			// Pause ordering key on error
			if (orderingKey) {
				this.pausedOrderingKeys.add(orderingKey);
			}

			throw error;
		}
	}
}
