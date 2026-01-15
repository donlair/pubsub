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
import { MessageQueue } from '../internal/message-queue';
import { Message } from '../message';
import { SubscriberFlowControl } from './flow-control';
import { LeaseManager } from './lease-manager';
import { NotFoundError } from '../types/errors';

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
	private pullInterval?: ReturnType<typeof setInterval>;
	private inFlightMessages = new Map<string, Message>();
	private orderingQueues = new Map<string, Message[]>();
	private processingOrderingKeys = new Set<string>();
	private pendingMessages: InternalMessage[] = [];

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
	}

	/**
	 * Start streaming pull.
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
		this.pullInterval = setInterval(() => this.pullMessages(), 10);
	}

	/**
	 * Stop streaming pull and cleanup.
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.pullInterval) {
			clearInterval(this.pullInterval);
			this.pullInterval = undefined;
		}

		const closeBehavior =
			this.options.closeOptions?.behavior ?? 'WAIT';

		if (closeBehavior === 'NACK') {
			for (const message of this.inFlightMessages.values()) {
				message.nack();
			}
			for (const pendingMsg of this.pendingMessages) {
				if (pendingMsg.ackId) {
					this.messageQueue.nack(pendingMsg.ackId);
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
	 * Pause message flow.
	 */
	pause(): void {
		this.isPaused = true;
	}

	/**
	 * Resume message flow.
	 */
	resume(): void {
		this.isPaused = false;
	}

	/**
	 * Update subscriber options.
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

			const messages = this.messageQueue.pull(
				this.subscription.name,
				maxToPull,
			);

			for (const internalMsg of messages) {
				this.processSingleMessage(internalMsg);
			}
		} catch (error) {
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
		const inFlightCount = this.flowControl.getInFlightMessages();
		const flowControlOptions = this.options.flowControl ?? {};
		const maxMessages =
			flowControlOptions.maxMessages ?? 1000;

		const remaining = Math.max(0, maxMessages - inFlightCount);

		return Math.min(remaining, 100);
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
		const timeout = 30000;
		const start = Date.now();

		while (this.inFlightMessages.size > 0) {
			if (Date.now() - start > timeout) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}
}
