/**
 * MessageStream - Streaming pull implementation.
 * Reference: specs/06-subscriber.md
 *
 * Continuously pulls messages from MessageQueue and emits them to the subscription.
 * Handles flow control, message ordering, and graceful shutdown.
 */

import type { EventEmitter } from 'node:events';
import type { SubscriberOptions } from '../types/subscriber';
import type { SubscriptionMetadata } from '../types/subscription';
import type { InternalMessage } from '../internal/types';
import type { Duration } from '../types/common';
import { MessageQueue } from '../internal/message-queue';
import { Message } from '../message';
import { SubscriberFlowControl } from './flow-control';
import { LeaseManager } from './lease-manager';
import { NotFoundError } from '../types/errors';

/**
 * Convert Duration to seconds.
 */
function durationToSeconds(duration: Duration): number {
	if (typeof duration === 'number') {
		return duration;
	}
	const days = duration.days ?? 0;
	const hours = duration.hours ?? 0;
	const minutes = duration.minutes ?? 0;
	const seconds = duration.seconds ?? 0;
	const nanos = duration.nanos ?? 0;
	return days * 86400 + hours * 3600 + minutes * 60 + seconds + nanos / 1e9;
}

interface ISubscription extends EventEmitter {
	name: string;
	isOpen: boolean;
	metadata?: SubscriptionMetadata;
}

export class MessageStream {
	private subscription: ISubscription;
	private options: SubscriberOptions;
	private flowControl: SubscriberFlowControl;
	private leaseManager: LeaseManager;
	private messageQueue: MessageQueue;
	private isRunning = false;
	private isPaused = false;
	private pullIntervals: Array<ReturnType<typeof setInterval>> = [];
	private timeoutTimer?: ReturnType<typeof setTimeout>;
	private inFlightMessages = new Map<string, Message>();
	private orderingQueues = new Map<string, Message[]>();
	private processingOrderingKeys = new Set<string>();
	private pendingMessages: InternalMessage[] = [];

	private readonly pullIntervalMs: number;
	private readonly maxPullSize: number;
	private readonly maxStreams: number;
	private readonly timeoutMs: number;

	constructor(subscription: ISubscription, options: SubscriberOptions) {
		this.subscription = subscription;
		this.options = options;
		this.flowControl = new SubscriberFlowControl(options.flowControl);
		this.leaseManager = new LeaseManager({
			minAckDeadline: options.minAckDeadline,
			maxAckDeadline: options.maxAckDeadline,
			maxExtensionTime: options.maxExtensionTime,
			ackDeadlineSeconds: subscription.metadata?.ackDeadlineSeconds ?? 10,
		});
		this.messageQueue = MessageQueue.getInstance();

		this.pullIntervalMs = options.streamingOptions?.pullInterval ?? 10;
		this.maxPullSize = options.streamingOptions?.maxPullSize ?? 100;
		this.maxStreams = options.streamingOptions?.maxStreams ?? 5;
		this.timeoutMs = options.streamingOptions?.timeout ?? 300000;

		// Note: options.useLegacyFlowControl is accepted for API compatibility but has no
		// behavioral effect in this in-memory implementation. In Google Cloud Pub/Sub, this
		// option controls server-side vs client-side flow control enforcement. Since this
		// implementation has no server-side component, all flow control is client-side only.
	}

	/**
	 * Starts the streaming pull operation for this subscription.
	 *
	 * Begins continuously pulling messages from the MessageQueue at the configured interval
	 * and emitting them to the subscription via 'message' events. Messages are subject
	 * to flow control limits and ordering guarantees. If the subscription does not exist
	 * in the MessageQueue, emits a NotFoundError via the 'error' event.
	 *
	 * This method is idempotent - calling start() multiple times has no effect if
	 * already running.
	 *
	 * @throws {NotFoundError} Code 5 - Emitted via 'error' event if subscription not found in MessageQueue
	 *
	 * @example
	 * ```typescript
	 * const subscription = pubsub.subscription('my-subscription');
	 *
	 * // Start receiving messages
	 * subscription.on('message', (message) => {
	 *   console.log('Received:', message.data.toString());
	 *   message.ack();
	 * });
	 *
	 * subscription.on('error', (error) => {
	 *   console.error('Subscription error:', error);
	 * });
	 *
	 * // This starts the internal MessageStream
	 * // (typically called automatically by subscription.open())
	 * ```
	 */
	start(): void {
		if (this.isRunning) {
			return;
		}

		if (!this.messageQueue.subscriptionExists(this.subscription.name)) {
			setImmediate(() => {
				this.subscription.emit(
					'error',
					new NotFoundError(`Subscription not found: ${this.subscription.name}`),
				);
			});
			return;
		}

		this.isRunning = true;
		this.isPaused = false;

		for (let i = 0; i < this.maxStreams; i++) {
			const interval = setInterval(() => this.pullMessages(), this.pullIntervalMs);
			this.pullIntervals.push(interval);
		}

		if (this.timeoutMs > 0) {
			this.timeoutTimer = setTimeout(() => {
				setImmediate(() => {
					this.subscription.emit('error', new Error(`Stream timeout after ${this.timeoutMs}ms`));
				});
				this.stop().catch((error) => {
					console.error('Failed to stop stream after timeout:', error);
				});
			}, this.timeoutMs);
		}
	}

	/**
	 * Stops the streaming pull operation and performs cleanup.
	 *
	 * Halts message pulling and handles in-flight messages according to the configured
	 * close behavior (WAIT or NACK). When using WAIT behavior (default), waits up to 30
	 * seconds for all in-flight messages to be ack'd or nack'd before cleaning up. When
	 * using NACK behavior, immediately nacks all in-flight and pending messages.
	 *
	 * After cleanup completes, emits a 'close' event to signal the subscription has
	 * fully shut down. This method is idempotent - calling stop() when not running
	 * has no effect.
	 *
	 * @returns Promise that resolves when cleanup is complete and 'close' event is emitted
	 *
	 * @example
	 * ```typescript
	 * const subscription = pubsub.subscription('my-subscription', {
	 *   closeOptions: { behavior: 'WAIT' } // Wait for in-flight messages (default)
	 * });
	 *
	 * subscription.on('message', (message) => {
	 *   // Process message
	 *   message.ack();
	 * });
	 *
	 * subscription.on('close', () => {
	 *   console.log('Subscription closed');
	 * });
	 *
	 * // Later: stop receiving messages
	 * await subscription.close(); // Internally calls messageStream.stop()
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // NACK behavior: immediately nack all in-flight messages
	 * const subscription = pubsub.subscription('my-subscription', {
	 *   closeOptions: { behavior: 'NACK' }
	 * });
	 *
	 * // ... use subscription ...
	 *
	 * await subscription.close(); // Nacks all in-flight messages immediately
	 * ```
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		for (const interval of this.pullIntervals) {
			clearInterval(interval);
		}
		this.pullIntervals = [];

		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = undefined;
		}

		const closeBehavior =
			this.options.closeOptions?.behavior ?? 'WAIT';

		if (closeBehavior === 'NACK') {
			for (const message of this.inFlightMessages.values()) {
				try {
					message.nack();
				} catch {
					// Ignore errors for already-expired leases during cleanup
				}
			}
			for (const pendingMsg of this.pendingMessages) {
				if (pendingMsg.ackId) {
					try {
						this.messageQueue.nack(pendingMsg.ackId);
					} catch {
						// Ignore errors for already-expired leases during cleanup
					}
				}
			}
		} else {
			await this.waitForInFlight();
		}

		this.leaseManager.clear();
		this.inFlightMessages.clear();
		this.orderingQueues.clear();
		this.processingOrderingKeys.clear();
		this.pendingMessages = [];

		setImmediate(() => {
			this.subscription.emit('close');
		});
	}

	/**
	 * Pauses the message flow without stopping the stream.
	 *
	 * Temporarily halts pulling new messages from the MessageQueue while keeping
	 * the stream running. In-flight messages continue to be processed and can still
	 * be ack'd or nack'd. Flow control counters are maintained. This is useful for
	 * temporarily throttling message delivery during high load or maintenance.
	 *
	 * Call resume() to restart message flow. Unlike stop(), pause() does not emit
	 * any events and does not clean up resources.
	 *
	 * @example
	 * ```typescript
	 * const subscription = pubsub.subscription('my-subscription');
	 *
	 * subscription.on('message', async (message) => {
	 *   // Pause during slow processing
	 *   subscription.pause();
	 *
	 *   await processMessage(message);
	 *   message.ack();
	 *
	 *   // Resume when ready
	 *   subscription.resume();
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Pause during system maintenance
	 * subscription.pause();
	 * await performMaintenance();
	 * subscription.resume();
	 * ```
	 */
	pause(): void {
		this.isPaused = true;
	}

	/**
	 * Resumes message flow after a pause().
	 *
	 * Restarts pulling messages from the MessageQueue that was halted by pause().
	 * Message delivery resumes immediately on the next pull interval. This
	 * method has no effect if the stream is not currently paused.
	 *
	 * @example
	 * ```typescript
	 * const subscription = pubsub.subscription('my-subscription');
	 *
	 * subscription.on('message', async (message) => {
	 *   subscription.pause(); // Stop receiving more messages
	 *
	 *   await processMessage(message);
	 *   message.ack();
	 *
	 *   subscription.resume(); // Continue receiving messages
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Throttle message processing during high load
	 * let processing = 0;
	 * const MAX_CONCURRENT = 10;
	 *
	 * subscription.on('message', async (message) => {
	 *   if (processing >= MAX_CONCURRENT) {
	 *     subscription.pause();
	 *   }
	 *
	 *   processing++;
	 *   await processMessage(message);
	 *   message.ack();
	 *   processing--;
	 *
	 *   if (processing < MAX_CONCURRENT) {
	 *     subscription.resume();
	 *   }
	 * });
	 * ```
	 */
	resume(): void {
		this.isPaused = false;
	}

	/**
	 * Updates subscriber options dynamically while the stream is running.
	 *
	 * Merges the provided options with existing configuration and recreates the
	 * flow control and lease manager with the new settings. This allows adjusting
	 * flow control limits (maxMessages, maxBytes), ack deadline parameters
	 * (minAckDeadline, maxAckDeadline, maxExtensionTime), and other subscriber
	 * options without restarting the stream.
	 *
	 * Changes take effect immediately for new messages and lease management, but
	 * do not affect messages already in-flight.
	 *
	 * @param options - Partial subscriber options to update (merged with existing options)
	 *
	 * @example
	 * ```typescript
	 * const subscription = pubsub.subscription('my-subscription');
	 *
	 * // Start with default flow control
	 * subscription.open();
	 *
	 * // Later: increase flow control limits during high throughput period
	 * subscription.setOptions({
	 *   flowControl: {
	 *     maxMessages: 2000,  // Up from default 1000
	 *     maxBytes: 200 * 1024 * 1024  // Up from default 100MB
	 *   }
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Adjust ack deadline parameters for slower processing
	 * subscription.setOptions({
	 *   minAckDeadline: 30,  // 30 seconds minimum
	 *   maxAckDeadline: 300, // 5 minutes maximum
	 *   maxExtensionTime: 3600 // 1 hour max total extension
	 * });
	 * ```
	 */
	setOptions(options: SubscriberOptions): void {
		this.options = { ...this.options, ...options };
		this.flowControl = new SubscriberFlowControl(options.flowControl);
		this.leaseManager = new LeaseManager({
			minAckDeadline: options.minAckDeadline ?? this.options.minAckDeadline,
			maxAckDeadline: options.maxAckDeadline ?? this.options.maxAckDeadline,
			maxExtensionTime: options.maxExtensionTime ?? this.options.maxExtensionTime,
			ackDeadlineSeconds: this.subscription.metadata?.ackDeadlineSeconds ?? 10,
		});
	}

	/**
	 * Pull messages from queue and emit to subscription.
	 */
	private pullMessages(): void {
		if (!this.isRunning || this.isPaused) {
			return;
		}

		try {
			this.processPendingMessages();

			const maxToPull = this.calculateMaxPull();
			if (maxToPull <= 0) {
				return;
			}

			this.flowControl.startBatchPull();

			const messages = this.messageQueue.pull(
				this.subscription.name,
				maxToPull,
			);

			for (const internalMsg of messages) {
				this.processSingleMessage(internalMsg);
			}

			this.flowControl.endBatchPull();
		} catch (error) {
			this.flowControl.endBatchPull();
			setImmediate(() => {
				this.subscription.emit('error', error);
			});
		}
	}

	/**
	 * Process pending messages that were held due to flow control.
	 */
	private processPendingMessages(): void {
		while (this.pendingMessages.length > 0) {
			const internalMsg = this.pendingMessages[0];
			if (!internalMsg) break;

			if (!this.flowControl.canAccept(internalMsg.length)) {
				break;
			}

			this.pendingMessages.shift();
			this.processAcceptedMessage(internalMsg);
		}
	}

	/**
	 * Process a single message from the queue.
	 */
	private processSingleMessage(internalMsg: InternalMessage): void {
		if (!this.flowControl.canAccept(internalMsg.length)) {
			this.pendingMessages.push(internalMsg);
			return;
		}

		this.processAcceptedMessage(internalMsg);
	}

	/**
	 * Process a message that passed flow control.
	 */
	private processAcceptedMessage(internalMsg: InternalMessage): void {
		const message = this.createMessage(internalMsg);

		if (
			this.subscription.metadata?.enableMessageOrdering &&
			message.orderingKey
		) {
			this.handleOrderedMessage(message);
		} else {
			this.deliverMessage(message);
		}
	}

	/**
	 * Calculate max messages to pull based on flow control.
	 */
	private calculateMaxPull(): number {
		const flowControlOptions = this.options.flowControl ?? {};
		const allowExcessMessages = flowControlOptions.allowExcessMessages ?? false;

		if (allowExcessMessages) {
			return this.maxPullSize;
		}

		const inFlightCount = this.flowControl.getInFlightMessages();
		const maxMessages =
			flowControlOptions.maxMessages ?? 1000;

		const remaining = Math.max(0, maxMessages - inFlightCount);

		return Math.min(remaining, this.maxPullSize);
	}

	/**
	 * Create a Message from an InternalMessage.
	 */
	private createMessage(internalMsg: InternalMessage): Message {
		return new Message(
			internalMsg.id,
			internalMsg.ackId!,
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			this.subscription,
			internalMsg.orderingKey,
			internalMsg.deliveryAttempt,
		);
	}

	/**
	 * Handle ordered message delivery.
	 */
	private handleOrderedMessage(message: Message): void {
		const key = message.orderingKey!;

		if (!this.orderingQueues.has(key)) {
			this.orderingQueues.set(key, []);
		}

		this.orderingQueues.get(key)!.push(message);

		if (!this.processingOrderingKeys.has(key)) {
			this.processNextOrderedMessage(key);
		} else if (message.deliveryAttempt && message.deliveryAttempt > 1) {
			this.processingOrderingKeys.delete(key);
			this.processNextOrderedMessage(key);
		}
	}

	/**
	 * Process next message for an ordering key.
	 */
	private processNextOrderedMessage(key: string): void {
		const queue = this.orderingQueues.get(key);
		if (!queue || queue.length === 0) {
			this.processingOrderingKeys.delete(key);
			return;
		}

		const message = queue.shift()!;
		this.processingOrderingKeys.add(key);

		const originalAck = message.ack.bind(message);
		const originalNack = message.nack.bind(message);

		message.ack = () => {
			originalAck();
			this.handleMessageComplete(message);
			this.processNextOrderedMessage(key);
		};

		message.nack = () => {
			originalNack();
			this.handleMessageComplete(message);
			this.processNextOrderedMessage(key);
		};

		this.deliverMessage(message);
	}

	/**
	 * Deliver a message to the subscription.
	 */
	private deliverMessage(message: Message): void {
		this.flowControl.addMessage(message.length);
		this.inFlightMessages.set(message.ackId, message);
		this.leaseManager.addLease(message);

		const originalAck = message.ack.bind(message);
		const originalNack = message.nack.bind(message);

		message.ack = () => {
			originalAck();
			this.handleMessageComplete(message);
		};

		message.nack = () => {
			originalNack();
			this.handleMessageComplete(message);
		};

		setImmediate(() => {
			this.subscription.emit('message', message);
		});
	}

	/**
	 * Handle message completion (ack/nack).
	 */
	private handleMessageComplete(message: Message): void {
		this.leaseManager.removeLease(message.ackId);
		this.flowControl.removeMessage(message.length);
		this.inFlightMessages.delete(message.ackId);

		setImmediate(() => this.processPendingMessages());
	}

	/**
	 * Wait for all in-flight messages to complete.
	 */
	private async waitForInFlight(): Promise<void> {
		const configuredTimeout = this.options.closeOptions?.timeout;
		const timeoutSeconds = configuredTimeout
			? durationToSeconds(configuredTimeout)
			: durationToSeconds(this.options.maxExtensionTime ?? 3600);
		const timeout = timeoutSeconds * 1000;
		const start = Date.now();

		while (this.inFlightMessages.size > 0) {
			if (Date.now() - start > timeout) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}
}
