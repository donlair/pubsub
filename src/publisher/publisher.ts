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
import { InvalidArgumentError, InternalError, ErrorCode, PubSubError } from '../types/errors';

interface Batch {
	messages: PubsubMessage[];
	totalBytes: number;
	promises: Array<{
		resolve: (messageId: string) => void;
		reject: (error: Error) => void;
	}>;
	timer?: ReturnType<typeof setTimeout>;
}

function shouldPauseOrderingKey(error: unknown): boolean {
	if (!(error instanceof PubSubError)) {
		return true;
	}

	const nonRetryableCodes = [
		ErrorCode.INVALID_ARGUMENT,
		ErrorCode.NOT_FOUND,
		ErrorCode.ALREADY_EXISTS,
		ErrorCode.PERMISSION_DENIED,
		ErrorCode.FAILED_PRECONDITION,
	];

	return nonRetryableCodes.includes(error.code);
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
	 * Publishes a message with the given data to the topic.
	 *
	 * This is a convenience method that wraps the data, attributes, and ordering key
	 * into a PubsubMessage and calls publishMessage(). Messages are batched according
	 * to the publisher's batching configuration and published when batch limits are reached.
	 *
	 * @param data - The message payload as a Buffer
	 * @param attributes - Optional key-value pairs for message metadata
	 * @param orderingKey - Optional key for ordered message delivery (requires messageOrdering: true)
	 * @returns Promise resolving to the published message ID
	 *
	 * @throws {InvalidArgumentError} Code 3 - If data is not a Buffer
	 * @throws {InvalidArgumentError} Code 3 - If ordering key is empty or exceeds 1024 bytes
	 * @throws {InvalidArgumentError} Code 3 - If attribute key is empty, exceeds 256 bytes, or uses reserved prefix (goog*, googclient_*)
	 * @throws {InvalidArgumentError} Code 3 - If attribute value exceeds 1024 bytes
	 * @throws {InvalidArgumentError} Code 3 - If message size exceeds 10MB
	 * @throws {InvalidArgumentError} Code 3 - If ordering key is paused due to previous error
	 * @throws {ResourceExhaustedError} Code 8 - If flow control limits exceeded (blocks until capacity available)
	 *
	 * @example
	 * ```typescript
	 * const publisher = new Publisher('projects/my-project/topics/my-topic');
	 *
	 * // Simple publish
	 * const messageId = await publisher.publish(Buffer.from('Hello World'));
	 *
	 * // With attributes
	 * const messageId2 = await publisher.publish(
	 *   Buffer.from('Hello'),
	 *   { userId: '123', event: 'login' }
	 * );
	 *
	 * // With ordering key
	 * const messageId3 = await publisher.publish(
	 *   Buffer.from('Order step 1'),
	 *   { orderId: '456' },
	 *   'order-456'
	 * );
	 * ```
	 */
	async publish(
		data: Buffer,
		attributes?: Attributes,
		orderingKey?: string
	): Promise<string> {
		return this.publishMessage({ data, attributes, orderingKey });
	}

	/**
	 * Publishes a complete PubsubMessage object to the topic.
	 *
	 * This method provides full control over the message structure and performs
	 * comprehensive validation on all message fields. Messages are batched and
	 * published according to batching configuration (maxMessages, maxBytes, maxMilliseconds).
	 * When message ordering is enabled, messages with the same orderingKey are delivered
	 * sequentially, while different keys are processed concurrently.
	 *
	 * @param message - The complete message object to publish
	 * @returns Promise resolving to the published message ID
	 *
	 * @throws {InvalidArgumentError} Code 3 - If message.data is not a Buffer
	 * @throws {InvalidArgumentError} Code 3 - If orderingKey is empty string
	 * @throws {InvalidArgumentError} Code 3 - If orderingKey exceeds 1024 bytes
	 * @throws {InvalidArgumentError} Code 3 - If attribute key is empty string
	 * @throws {InvalidArgumentError} Code 3 - If attribute key exceeds 256 bytes
	 * @throws {InvalidArgumentError} Code 3 - If attribute key uses reserved prefix (goog*, googclient_*)
	 * @throws {InvalidArgumentError} Code 3 - If attribute value exceeds 1024 bytes
	 * @throws {InvalidArgumentError} Code 3 - If total message size exceeds 10MB
	 * @throws {InvalidArgumentError} Code 3 - If orderingKey is paused due to previous publish error
	 * @throws {ResourceExhaustedError} Code 8 - If flow control limits exceeded (blocks until capacity available)
	 *
	 * @example
	 * ```typescript
	 * const publisher = new Publisher('projects/my-project/topics/my-topic', {
	 *   batching: {
	 *     maxMessages: 100,
	 *     maxBytes: 1024 * 1024,
	 *     maxMilliseconds: 10
	 *   },
	 *   messageOrdering: true
	 * });
	 *
	 * // Publish complete message
	 * const messageId = await publisher.publishMessage({
	 *   data: Buffer.from('Order created'),
	 *   attributes: { orderId: '123', status: 'pending' },
	 *   orderingKey: 'order-123'
	 * });
	 *
	 * // Messages with same orderingKey are delivered in order
	 * await publisher.publishMessage({
	 *   data: Buffer.from('Order updated'),
	 *   orderingKey: 'order-123'
	 * });
	 * ```
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

		// Validate attributes
		if (message.attributes) {
			for (const [key, value] of Object.entries(message.attributes)) {
				// Validate key is not empty
				if (key === '') {
					throw new InvalidArgumentError('Attribute keys cannot be empty');
				}

				// Validate key length (max 256 bytes)
				const keyBytes = Buffer.byteLength(key, 'utf8');
				if (keyBytes > 256) {
					throw new InvalidArgumentError(
						`Attribute key exceeds maximum length of 256 bytes (got ${keyBytes} bytes)`
					);
				}

				// Validate reserved prefixes
				if (key.startsWith('goog') || key.startsWith('googclient_')) {
					throw new InvalidArgumentError(
						`Attribute key "${key}" uses reserved prefix (goog* or googclient_*)`
					);
				}

				// Validate value length (max 1024 bytes)
				const valueBytes = Buffer.byteLength(value, 'utf8');
				if (valueBytes > 1024) {
					throw new InvalidArgumentError(
						`Attribute value for key "${key}" exceeds maximum length of 1024 bytes (got ${valueBytes} bytes)`
					);
				}
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
					(sum, [k, v]) => sum + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
					0
			  )
			: 0;
		const messageSize = dataSize + attrSize;

		// Validate message size (BR-011)
		const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
		if (messageSize > MAX_MESSAGE_SIZE) {
			throw new InvalidArgumentError(
				'Message size exceeds maximum of 10MB'
			);
		}

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
					if (message.orderingKey && shouldPauseOrderingKey(error)) {
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
	 * Immediately publishes all pending batched messages.
	 *
	 * This method forces immediate publication of all messages currently waiting
	 * in batches, bypassing the normal batching triggers (maxMessages, maxBytes,
	 * maxMilliseconds). Useful for ensuring all messages are sent before shutdown
	 * or at critical synchronization points.
	 *
	 * The method waits for all batches to complete publishing before resolving.
	 * Individual message promises will still resolve/reject based on publish success.
	 *
	 * @returns Promise that resolves when all batches have been published
	 *
	 * @example
	 * ```typescript
	 * const publisher = new Publisher('projects/my-project/topics/my-topic', {
	 *   batching: { maxMessages: 100, maxMilliseconds: 1000 }
	 * });
	 *
	 * // Publish several messages (batched)
	 * await publisher.publish(Buffer.from('Message 1'));
	 * await publisher.publish(Buffer.from('Message 2'));
	 * await publisher.publish(Buffer.from('Message 3'));
	 *
	 * // Force immediate publish of all pending messages
	 * await publisher.flush();
	 *
	 * // Common pattern: flush before shutdown
	 * process.on('SIGTERM', async () => {
	 *   await publisher.flush();
	 *   process.exit(0);
	 * });
	 * ```
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
	 * Updates the publisher's configuration at runtime.
	 *
	 * This method allows dynamic reconfiguration of batching settings, message ordering,
	 * and flow control options without creating a new Publisher instance. Changes take
	 * effect immediately for new messages; in-flight batches use their original configuration.
	 *
	 * Note: Changing messageOrdering or flowControlOptions replaces the entire configuration,
	 * while batching options are merged with existing values.
	 *
	 * @param options - Partial publish options to update
	 *
	 * @example
	 * ```typescript
	 * const publisher = new Publisher('projects/my-project/topics/my-topic');
	 *
	 * // Increase batch size for high-throughput scenario
	 * publisher.setPublishOptions({
	 *   batching: {
	 *     maxMessages: 500,
	 *     maxBytes: 5 * 1024 * 1024
	 *   }
	 * });
	 *
	 * // Enable message ordering
	 * publisher.setPublishOptions({
	 *   messageOrdering: true
	 * });
	 *
	 * // Adjust flow control limits
	 * publisher.setPublishOptions({
	 *   flowControlOptions: {
	 *     maxOutstandingMessages: 5000,
	 *     maxOutstandingBytes: 50 * 1024 * 1024
	 *   }
	 * });
	 * ```
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
	 * Resumes publishing for a previously paused ordering key.
	 *
	 * When a publish error occurs for a message with an orderingKey, that key is
	 * automatically paused to maintain ordering guarantees. This method clears the
	 * pause state and allows new messages with this orderingKey to be published again.
	 *
	 * Note: Any messages queued before the pause are discarded. Only new messages
	 * published after calling resumePublishing() will be sent.
	 *
	 * @param orderingKey - The ordering key to resume
	 *
	 * @example
	 * ```typescript
	 * const publisher = new Publisher('projects/my-project/topics/my-topic', {
	 *   messageOrdering: true
	 * });
	 *
	 * try {
	 *   await publisher.publishMessage({
	 *     data: Buffer.from('Message 1'),
	 *     orderingKey: 'order-123'
	 *   });
	 * } catch (error) {
	 *   // Ordering key 'order-123' is now paused
	 *   console.error('Publish failed, key paused:', error);
	 *
	 *   // Resume after handling the error
	 *   publisher.resumePublishing('order-123');
	 *
	 *   // Can now publish new messages with this key
	 *   await publisher.publishMessage({
	 *     data: Buffer.from('Message 2'),
	 *     orderingKey: 'order-123'
	 *   });
	 * }
	 * ```
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
				deliveryAttempt: 1,
				length:
					data.length +
					(msg.attributes
						? Object.entries(msg.attributes).reduce(
								(sum, [k, v]) => sum + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
								0
						  )
						: 0),
			};
		});

		try {
			// Check if topic exists before publishing (avoids errors during cleanup)
			if (!this.queue.topicExists(this.topicName)) {
				// Topic was deleted, silently discard batch
				for (const promise of batch.promises) {
					promise.resolve('');
				}
				for (const msg of internalMessages) {
					this.flowControl.release(msg.length);
				}
				batch.messages = [];
				batch.totalBytes = 0;
				batch.promises = [];
				if (orderingKey) {
					this.orderingBatches.delete(orderingKey);
				} else {
					this.defaultBatch = undefined;
				}
				return;
			}

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
			const err = error instanceof Error ? error : new InternalError(`Batch publish failed: ${String(error)}`, error as Error);
			for (const promise of batch.promises) {
				promise.reject(err);
			}

			// Release flow control
			for (const msg of internalMessages) {
				this.flowControl.release(msg.length);
			}

			if (orderingKey && shouldPauseOrderingKey(err)) {
				this.pausedOrderingKeys.add(orderingKey);
			}

			throw error;
		}
	}
}
