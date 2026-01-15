/**
 * Subscription - EventEmitter interface for receiving messages.
 * Reference: specs/03-subscription.md
 */

import { EventEmitter } from 'node:events';
import { Message } from './message';
import type {
	SubscriptionOptions,
	SubscriptionMetadata,
	CreateSubscriptionOptions,
	GetSubscriptionOptions,
	PullOptions,
	PushConfig,
	CreateSnapshotOptions,
	SnapshotMetadata
} from './types/subscription';
import type { CallOptions } from './types/common';
import type { SubscriberOptions } from './types/subscriber';
import { MessageStream } from './subscriber/message-stream';
import { MessageQueue } from './internal/message-queue';
import { NotFoundError, AlreadyExistsError } from './types/errors';

interface Snapshot {
	name: string;
}

export class Subscription extends EventEmitter {
	readonly name: string;
	readonly pubsub: unknown;
	topic?: unknown;
	metadata?: SubscriptionMetadata;
	isOpen = false;
	detached = false;

	private messageStream?: MessageStream;
	private options: SubscriberOptions;
	private readonly queue: MessageQueue;

	constructor(pubsub: unknown, name: string, options?: SubscriptionOptions) {
		super();
		this.pubsub = pubsub;
		this.name = name;
		this.topic = options?.topic;
		this.queue = MessageQueue.getInstance();

		this.options = {
			flowControl: {
				maxMessages: options?.flowControl?.maxMessages ?? 1000,
				maxBytes: options?.flowControl?.maxBytes ?? 100 * 1024 * 1024,
				allowExcessMessages: options?.flowControl?.allowExcessMessages ?? false
			},
			minAckDeadline: options?.minAckDeadline ?? 10,
			maxAckDeadline: options?.maxAckDeadline ?? 600,
			maxExtensionTime: options?.maxExtensionTime ?? 3600,
			closeOptions: options?.closeOptions
		};

		this.metadata = {
			ackDeadlineSeconds: options?.ackDeadlineSeconds ?? 10,
			enableMessageOrdering: options?.enableMessageOrdering ?? false
		};
	}

	override on(event: 'message', listener: (message: Message) => void): this;
	override on(event: 'error', listener: (error: Error) => void): this;
	override on(event: 'close', listener: () => void): this;
	override on(event: 'debug', listener: (msg: string) => void): this;
	// biome-ignore lint/suspicious/noExplicitAny: Must match EventEmitter signature
	override on(event: string | symbol, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}

	override once(event: 'message', listener: (message: Message) => void): this;
	override once(event: 'error', listener: (error: Error) => void): this;
	override once(event: 'close', listener: () => void): this;
	override once(event: 'debug', listener: (msg: string) => void): this;
	// biome-ignore lint/suspicious/noExplicitAny: Must match EventEmitter signature
	override once(event: string | symbol, listener: (...args: any[]) => void): this {
		return super.once(event, listener);
	}

	override emit(event: 'message', message: Message): boolean;
	override emit(event: 'error', error: Error): boolean;
	override emit(event: 'close'): boolean;
	override emit(event: 'debug', msg: string): boolean;
	// biome-ignore lint/suspicious/noExplicitAny: Must match EventEmitter signature
	override emit(event: string | symbol, ...args: any[]): boolean {
		return super.emit(event, ...args);
	}

	async create(options?: CreateSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]> {
		if (this.queue.subscriptionExists(this.name)) {
			throw new AlreadyExistsError(`Subscription already exists: ${this.name}`);
		}

		const topicName = typeof this.topic === 'object' && this.topic && 'name' in this.topic
			? (this.topic as { name: string }).name
			: (this.topic as string);

		if (!topicName) {
			throw new NotFoundError('Topic is required for subscription creation');
		}

		if (!this.queue.topicExists(topicName)) {
			throw new NotFoundError(`Topic not found: ${topicName}`);
		}

		this.metadata = {
			name: this.name,
			topic: topicName,
			ackDeadlineSeconds: options?.ackDeadlineSeconds ?? (this.metadata?.ackDeadlineSeconds ?? 10),
			enableMessageOrdering: options?.enableMessageOrdering ?? (this.metadata?.enableMessageOrdering ?? false),
			pushConfig: options?.pushConfig,
			deadLetterPolicy: options?.deadLetterPolicy,
			retryPolicy: options?.retryPolicy,
			filter: options?.filter,
			labels: options?.labels,
			messageRetentionDuration: options?.messageRetentionDuration,
			retainAckedMessages: options?.retainAckedMessages,
			expirationPolicy: options?.expirationPolicy,
			enableExactlyOnceDelivery: options?.enableExactlyOnceDelivery
		};

		this.queue.registerSubscription(this.name, topicName, {
			ackDeadlineSeconds: this.metadata.ackDeadlineSeconds,
			enableMessageOrdering: this.metadata.enableMessageOrdering
		});

		return [this, this.metadata];
	}

	async delete(_gaxOptions?: CallOptions): Promise<[unknown]> {
		if (this.isOpen) {
			await this.close();
		}

		if (!this.queue.subscriptionExists(this.name)) {
			throw new NotFoundError(`Subscription not found: ${this.name}`);
		}

		this.queue.unregisterSubscription(this.name);

		return [{}];
	}

	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [this.queue.subscriptionExists(this.name)];
	}

	async get(options?: GetSubscriptionOptions): Promise<[Subscription, SubscriptionMetadata]> {
		if (!this.queue.subscriptionExists(this.name)) {
			if (options?.autoCreate) {
				return this.create();
			}
			throw new NotFoundError(`Subscription not found: ${this.name}`);
		}

		const subMeta = this.queue.getSubscription(this.name);
		if (subMeta) {
			this.metadata = {
				...this.metadata,
				name: subMeta.name,
				topic: subMeta.topic,
				ackDeadlineSeconds: subMeta.ackDeadlineSeconds,
				enableMessageOrdering: subMeta.enableMessageOrdering
			};
		}

		return [this, this.metadata ?? {}];
	}

	async getMetadata(_options?: CallOptions): Promise<[SubscriptionMetadata, unknown]> {
		if (!this.queue.subscriptionExists(this.name)) {
			throw new NotFoundError(`Subscription not found: ${this.name}`);
		}

		const subMeta = this.queue.getSubscription(this.name);
		if (subMeta) {
			this.metadata = {
				...this.metadata,
				name: subMeta.name,
				topic: subMeta.topic,
				ackDeadlineSeconds: subMeta.ackDeadlineSeconds,
				enableMessageOrdering: subMeta.enableMessageOrdering
			};
		}

		return [this.metadata ?? {}, {}];
	}

	async setMetadata(metadata: SubscriptionMetadata, _options?: CallOptions): Promise<[SubscriptionMetadata, unknown]> {
		if (!this.queue.subscriptionExists(this.name)) {
			throw new NotFoundError(`Subscription not found: ${this.name}`);
		}

		this.metadata = { ...this.metadata, ...metadata };

		return [this.metadata, {}];
	}

	open(): void {
		if (this.isOpen) {
			return;
		}

		this.isOpen = true;

		if (!this.messageStream) {
			this.messageStream = new MessageStream(this, this.options);
		}

		this.messageStream.start();
	}

	async close(): Promise<void> {
		if (!this.isOpen) {
			return;
		}

		this.isOpen = false;

		if (this.messageStream) {
			await this.messageStream.stop();
		}
	}

	setOptions(options: SubscriptionOptions): void {
		this.options = {
			...this.options,
			flowControl: {
				...this.options.flowControl,
				...options.flowControl
			},
			minAckDeadline: options.minAckDeadline ?? this.options.minAckDeadline,
			maxAckDeadline: options.maxAckDeadline ?? this.options.maxAckDeadline,
			maxExtensionTime: options.maxExtensionTime ?? this.options.maxExtensionTime,
			closeOptions: options.closeOptions ?? this.options.closeOptions
		};

		if (options.ackDeadlineSeconds !== undefined) {
			this.metadata = {
				...this.metadata,
				ackDeadlineSeconds: options.ackDeadlineSeconds
			};
		}

		if (options.enableMessageOrdering !== undefined) {
			this.metadata = {
				...this.metadata,
				enableMessageOrdering: options.enableMessageOrdering
			};
		}

		if (this.messageStream) {
			this.messageStream.setOptions(this.options);
		}
	}

	async seek(_snapshot: string | Snapshot | Date, _options?: CallOptions): Promise<[unknown]> {
		return [{}];
	}

	async createSnapshot(_name: string, _options?: CreateSnapshotOptions): Promise<[Snapshot, SnapshotMetadata]> {
		const snapshot: Snapshot = { name: _name };
		const metadata: SnapshotMetadata = { name: _name };
		return [snapshot, metadata];
	}

	async modifyPushConfig(_config: PushConfig, _options?: CallOptions): Promise<[unknown]> {
		return [{}];
	}

	snapshot(name: string): Snapshot {
		return { name };
	}

	async pull(options?: PullOptions): Promise<[Message[], unknown]> {
		const [exists] = await this.exists();
		if (!exists) {
			throw new NotFoundError(`Subscription not found: ${this.name}`);
		}

		const maxMessages = options?.maxMessages ?? 100;
		const internalMessages = this.queue.pull(this.name, maxMessages);

		const messages = internalMessages.map((internalMsg) =>
			this.createMessage(internalMsg)
		);

		return [messages, {}];
	}

	private createMessage(internalMsg: {
		id: string;
		ackId?: string;
		data: Buffer;
		attributes: Record<string, string>;
		publishTime: import('./types/common').PreciseDate;
		orderingKey?: string;
		deliveryAttempt: number;
	}): Message {
		return new Message(
			internalMsg.id,
			internalMsg.ackId!,
			internalMsg.data,
			internalMsg.attributes,
			internalMsg.publishTime,
			this,
			internalMsg.orderingKey,
			internalMsg.deliveryAttempt
		);
	}
}
