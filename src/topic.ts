/**
 * Topic - Publishing interface with batching and flow control.
 * Reference: specs/02-topic.md
 */

import type { Attributes, PubsubMessage } from './types/message';
import type {
	TopicMetadata,
	CreateTopicOptions,
	GetTopicOptions,
	GetTopicSubscriptionsOptions
} from './types/topic';
import type {
	CreateSubscriptionOptions,
	SubscriptionMetadata,
	SubscriptionOptions
} from './types/subscription';
import type { PublishOptions, FlowControlledPublisher } from './types/publisher';
import type { CallOptions } from './types/common';
import { Publisher } from './publisher/publisher';
import { MessageQueue } from './internal/message-queue';
import { NotFoundError, AlreadyExistsError, InvalidArgumentError } from './types/errors';
import { IAM } from './iam';
import type { Subscription } from './subscription';
import { extractProjectId, formatSubscriptionName } from './internal/naming';

export class Topic {
	readonly name: string;
	readonly pubsub: unknown;
	readonly iam: IAM;
	private _publisher?: Publisher;
	private readonly queue: MessageQueue;

	constructor(pubsub: unknown, name: string) {
		this.pubsub = pubsub;
		this.name = name;
		this.iam = new IAM(pubsub, name);
		this.queue = MessageQueue.getInstance();
	}

	get publisher(): Publisher {
		if (!this._publisher) {
			this._publisher = new Publisher(this.name);
		}
		return this._publisher;
	}

	async publish(data: Buffer, attributes?: Attributes): Promise<string> {
		return this.publishMessage({ data, attributes });
	}

	async publishMessage(message: PubsubMessage): Promise<string> {
		if (!Buffer.isBuffer(message.data) && message.data !== undefined) {
			throw new InvalidArgumentError('Message data must be a Buffer');
		}

		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const metadata = this.queue.getTopic(this.name);
		if (metadata?.schemaSettings?.schema && message.data) {
			const pubsub = this.pubsub as { schema: (id: string) => { validateMessage: (msg: string | Buffer, encoding: string) => Promise<void> } };
			const schema = pubsub.schema(metadata.schemaSettings.schema);
			await schema.validateMessage(
				message.data,
				metadata.schemaSettings.encoding || 'JSON'
			);
		}

		return this.publisher.publishMessage(message);
	}

	async publishJSON(json: object, attributes?: Attributes): Promise<string> {
		const data = Buffer.from(JSON.stringify(json));
		return this.publishMessage({ data, attributes });
	}

	setPublishOptions(options: PublishOptions): void {
		this.publisher.setPublishOptions(options);
	}

	getPublishOptionDefaults(): PublishOptions {
		return {
			batching: {
				maxMessages: 100,
				maxMilliseconds: 10,
				maxBytes: 1024 * 1024
			},
			messageOrdering: false,
			flowControlOptions: {
				maxOutstandingMessages: 100,
				maxOutstandingBytes: 1024 * 1024
			}
		};
	}

	async flush(): Promise<void> {
		await this.publisher.flush();
	}

	flowControlled(): FlowControlledPublisher {
		return {
			publish: (data: Buffer, attributes?: Attributes) =>
				this.publish(data, attributes),
			publishMessage: (message: PubsubMessage) =>
				this.publishMessage(message)
		};
	}

	resumePublishing(orderingKey: string): void {
		this.publisher.resumePublishing(orderingKey);
	}

	async create(options?: CreateTopicOptions): Promise<[Topic, TopicMetadata]> {
		if (this.queue.topicExists(this.name)) {
			throw new AlreadyExistsError(`Topic already exists: ${this.name}`);
		}

		const metadata: TopicMetadata = {
			name: this.name,
			labels: options?.labels,
			messageStoragePolicy: options?.messageStoragePolicy,
			kmsKeyName: options?.kmsKeyName,
			schemaSettings: options?.schemaSettings,
			satisfiesPzs: options?.satisfiesPzs,
			messageRetentionDuration: options?.messageRetentionDuration
		};

		this.queue.registerTopic(this.name, metadata);
		return [this, metadata];
	}

	async delete(_options?: CallOptions): Promise<[unknown]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		this.queue.unregisterTopic(this.name);
		return [{}];
	}

	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [this.queue.topicExists(this.name)];
	}

	async get(options?: GetTopicOptions): Promise<[Topic, TopicMetadata]> {
		if (!this.queue.topicExists(this.name)) {
			if (options?.autoCreate) {
				return this.create();
			}
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const metadata = this.queue.getTopic(this.name) ?? { name: this.name };
		return [this, metadata];
	}

	async getMetadata(_options?: CallOptions): Promise<[TopicMetadata]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const metadata = this.queue.getTopic(this.name) ?? { name: this.name };
		return [metadata];
	}

	async setMetadata(
		metadata: TopicMetadata,
		_options?: CallOptions
	): Promise<[TopicMetadata]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		this.queue.registerTopic(this.name, metadata);
		return [metadata];
	}

	async createSubscription(
		name: string,
		options?: CreateSubscriptionOptions
	): Promise<[Subscription, SubscriptionMetadata]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const projectId = extractProjectId(this.name);
		if (!projectId) {
			throw new InvalidArgumentError('Topic name must be in full resource format');
		}

		const fullName = formatSubscriptionName(name, projectId);

		const { Subscription } = await import('./subscription');
		const subscription = new Subscription(this.pubsub, fullName, {
			...options,
			topic: this as unknown as undefined
		});

		return subscription.create(options);
	}

	subscription(
		name: string,
		options?: SubscriptionOptions
	): Subscription {
		const projectId = extractProjectId(this.name);
		if (!projectId) {
			throw new InvalidArgumentError('Topic name must be in full resource format');
		}

		const fullName = formatSubscriptionName(name, projectId);

		const { Subscription } = require('./subscription');
		return new Subscription(this.pubsub, fullName, {
			...options,
			topic: this as unknown as undefined
		});
	}

	async getSubscriptions(
		_options?: GetTopicSubscriptionsOptions
	): Promise<[Subscription[], unknown, unknown]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const projectId = extractProjectId(this.name);
		if (!projectId) {
			throw new InvalidArgumentError('Topic name must be in full resource format');
		}

		const { Subscription } = await import('./subscription');
		const subscriptionMetadatas = this.queue.getSubscriptionsForTopic(this.name);
		const subscriptions = subscriptionMetadatas.map(
			(meta) => new Subscription(this.pubsub, meta.name ?? '', {
				topic: this as unknown as undefined
			})
		);

		return [subscriptions, null, null];
	}
}
