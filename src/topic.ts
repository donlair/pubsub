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
import type { PubSub } from './pubsub';
import { extractProjectId, formatSubscriptionName } from './internal/naming';

export class Topic {
	readonly name: string;
	readonly pubsub: PubSub;
	readonly iam: IAM;
	private _publisher?: Publisher;
	private readonly queue: MessageQueue;

	constructor(pubsub: PubSub, name: string) {
		this.pubsub = pubsub;
		this.name = name;
		this.iam = new IAM(pubsub, name);
		this.queue = MessageQueue.getInstance();
	}

	/**
	 * Gets the Publisher instance for this topic. The publisher handles batching
	 * and flow control for efficient message publishing.
	 *
	 * @returns The Publisher instance for this topic
	 */
	get publisher(): Publisher {
		if (!this._publisher) {
			this._publisher = new Publisher(this.name);
		}
		return this._publisher;
	}

	/**
	 * Publishes a message to this topic. This is a convenience method that wraps
	 * publishMessage() for simple Buffer + attributes publishing.
	 *
	 * @param data - The message payload as a Buffer
	 * @param attributes - Optional key-value pairs for message metadata
	 * @returns The message ID assigned by the system
	 * @throws {InvalidArgumentError} Code 3 - Data must be a Buffer
	 * @throws {NotFoundError} Code 5 - Topic not found
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const messageId = await topic.publish(
	 *   Buffer.from('Hello World'),
	 *   { priority: 'high' }
	 * );
	 * ```
	 */
	async publish(data: Buffer, attributes?: Attributes): Promise<string> {
		return this.publishMessage({ data, attributes });
	}

	/**
	 * Publishes a message to this topic with full control over message properties.
	 * Supports data, attributes, orderingKey, and other message options. If the topic
	 * has schema validation enabled, validates the message against the schema.
	 *
	 * @param message - The message to publish (data, attributes, orderingKey, etc.)
	 * @returns The message ID assigned by the system
	 * @throws {InvalidArgumentError} Code 3 - Message data must be a Buffer or undefined
	 * @throws {NotFoundError} Code 5 - Topic not found
	 * @throws {InvalidArgumentError} Code 3 - Schema validation failed
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const messageId = await topic.publishMessage({
	 *   data: Buffer.from('{"user": "alice"}'),
	 *   attributes: { type: 'user-event' },
	 *   orderingKey: 'user-123'
	 * });
	 * ```
	 */
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

	/**
	 * Publishes a JSON object to this topic. The object is automatically serialized
	 * to JSON and converted to a Buffer. Supports both simple attributes and full
	 * options including orderingKey.
	 *
	 * @param json - The JavaScript object to publish (will be JSON.stringify'd)
	 * @param attributesOrOptions - Either attributes object or options with attributes and orderingKey
	 * @returns The message ID assigned by the system
	 * @throws {InvalidArgumentError} Code 3 - Message data must be a Buffer
	 * @throws {NotFoundError} Code 5 - Topic not found
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * // Simple usage with attributes
	 * await topic.publishJSON({ user: 'alice' }, { type: 'user' });
	 * // With ordering key
	 * await topic.publishJSON({ user: 'bob' }, {
	 *   attributes: { type: 'user' },
	 *   orderingKey: 'user-updates'
	 * });
	 * ```
	 */
	async publishJSON(
		json: object,
		attributesOrOptions?: Attributes | { attributes?: Attributes; orderingKey?: string }
	): Promise<string> {
		const data = Buffer.from(JSON.stringify(json));

		if (
			attributesOrOptions &&
			typeof attributesOrOptions === 'object' &&
			('orderingKey' in attributesOrOptions || 'attributes' in attributesOrOptions)
		) {
			const options = attributesOrOptions as { attributes?: Attributes; orderingKey?: string };
			return this.publishMessage({
				data,
				attributes: options.attributes,
				orderingKey: options.orderingKey
			});
		}

		return this.publishMessage({ data, attributes: attributesOrOptions as Attributes });
	}

	/**
	 * Configures publisher options for this topic including batching settings,
	 * message ordering, and flow control. These options affect how messages are
	 * batched and sent to the topic.
	 *
	 * @param options - Publisher configuration options
	 *
	 * @example
	 * ```typescript
	 * topic.setPublishOptions({
	 *   batching: {
	 *     maxMessages: 50,
	 *     maxMilliseconds: 100,
	 *     maxBytes: 512 * 1024
	 *   },
	 *   messageOrdering: true
	 * });
	 * ```
	 */
	setPublishOptions(options: PublishOptions): void {
		this.publisher.setPublishOptions(options);
	}

	/**
	 * Returns the default publish options used by this topic. These are the
	 * values used when no custom options are provided via setPublishOptions().
	 *
	 * @returns Default publish options (batching, ordering, flow control)
	 *
	 * @example
	 * ```typescript
	 * const defaults = topic.getPublishOptionDefaults();
	 * console.log(defaults.batching.maxMessages); // 100
	 * ```
	 */
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

	/**
	 * Immediately flushes all pending batched messages to the topic. Useful when
	 * you need to ensure all messages are sent before shutting down or when you
	 * want to bypass batching delays.
	 *
	 * @returns Promise that resolves when all pending messages are flushed
	 *
	 * @example
	 * ```typescript
	 * await topic.publish(Buffer.from('msg1'));
	 * await topic.publish(Buffer.from('msg2'));
	 * await topic.flush(); // Ensure both messages are sent immediately
	 * ```
	 */
	async flush(): Promise<void> {
		await this.publisher.flush();
	}

	/**
	 * Returns a flow-controlled publisher interface. This provides the same publish
	 * and publishMessage methods but with flow control applied to prevent overwhelming
	 * the system with too many outstanding messages.
	 *
	 * @returns Flow-controlled publisher interface
	 *
	 * @example
	 * ```typescript
	 * const publisher = topic.flowControlled();
	 * await publisher.publish(Buffer.from('data'));
	 * ```
	 */
	flowControlled(): FlowControlledPublisher {
		return {
			publish: (data: Buffer, attributes?: Attributes) =>
				this.publish(data, attributes),
			publishMessage: (message: PubsubMessage) =>
				this.publishMessage(message)
		};
	}

	/**
	 * Resumes publishing for a specific ordering key after a publish error.
	 * When message ordering is enabled and a publish fails, that ordering key
	 * is paused. This method resumes publishing for that key.
	 *
	 * @param orderingKey - The ordering key to resume publishing for
	 *
	 * @example
	 * ```typescript
	 * topic.setPublishOptions({ messageOrdering: true });
	 * try {
	 *   await topic.publishMessage({
	 *     data: Buffer.from('msg'),
	 *     orderingKey: 'key1'
	 *   });
	 * } catch (err) {
	 *   // Publishing paused for 'key1'
	 *   topic.resumePublishing('key1'); // Resume publishing
	 * }
	 * ```
	 */
	resumePublishing(orderingKey: string): void {
		this.publisher.resumePublishing(orderingKey);
	}

	/**
	 * Creates this topic in the Pub/Sub system. The topic must be created before
	 * messages can be published to it or subscriptions can be attached.
	 *
	 * @param options - Optional topic configuration (labels, schema settings, retention, etc.)
	 * @returns A tuple of [Topic instance, topic metadata]
	 * @throws {AlreadyExistsError} Code 6 - Topic already exists
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [createdTopic, metadata] = await topic.create({
	 *   labels: { env: 'production' },
	 *   schemaSettings: {
	 *     schema: 'projects/my-project/schemas/my-schema',
	 *     encoding: 'JSON'
	 *   }
	 * });
	 * ```
	 */
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

	/**
	 * Deletes this topic from the Pub/Sub system. All subscriptions to this topic
	 * will stop receiving messages. This operation cannot be undone.
	 *
	 * @param _options - Optional call options (unused in this implementation)
	 * @returns A tuple containing an empty object
	 * @throws {NotFoundError} Code 5 - Topic not found
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * await topic.delete();
	 * ```
	 */
	async delete(_options?: CallOptions): Promise<[unknown]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		this.queue.unregisterTopic(this.name);
		return [{}];
	}

	/**
	 * Checks if this topic exists in the Pub/Sub system.
	 *
	 * @param _options - Optional call options (unused in this implementation)
	 * @returns A tuple containing a boolean indicating if the topic exists
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [exists] = await topic.exists();
	 * if (exists) {
	 *   console.log('Topic exists!');
	 * }
	 * ```
	 */
	async exists(_options?: CallOptions): Promise<[boolean]> {
		return [this.queue.topicExists(this.name)];
	}

	/**
	 * Gets this topic and its metadata. If the topic doesn't exist and autoCreate
	 * is true, creates it automatically. Otherwise throws NotFoundError.
	 *
	 * @param options - Optional get options (autoCreate)
	 * @returns A tuple of [Topic instance, topic metadata]
	 * @throws {NotFoundError} Code 5 - Topic not found and autoCreate is false
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * // Get or create
	 * const [topic, metadata] = await topic.get({ autoCreate: true });
	 * console.log('Topic name:', metadata.name);
	 * ```
	 */
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

	/**
	 * Retrieves the metadata for this topic including labels, schema settings,
	 * retention policy, and other configuration.
	 *
	 * @param _options - Optional call options (unused in this implementation)
	 * @returns A tuple containing the topic metadata
	 * @throws {NotFoundError} Code 5 - Topic not found
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [metadata] = await topic.getMetadata();
	 * console.log('Labels:', metadata.labels);
	 * ```
	 */
	async getMetadata(_options?: CallOptions): Promise<[TopicMetadata]> {
		if (!this.queue.topicExists(this.name)) {
			throw new NotFoundError(`Topic not found: ${this.name}`);
		}

		const metadata = this.queue.getTopic(this.name) ?? { name: this.name };
		return [metadata];
	}

	/**
	 * Updates the metadata for this topic. This can be used to update labels,
	 * schema settings, and other topic configuration.
	 *
	 * @param metadata - The new metadata to set for this topic
	 * @param _options - Optional call options (unused in this implementation)
	 * @returns A tuple containing the updated topic metadata
	 * @throws {NotFoundError} Code 5 - Topic not found
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [updated] = await topic.setMetadata({
	 *   name: topic.name,
	 *   labels: { env: 'staging', version: 'v2' }
	 * });
	 * ```
	 */
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

	/**
	 * Creates a new subscription to this topic. Subscriptions receive messages
	 * published to the topic and deliver them to consumers.
	 *
	 * @param name - The subscription name (can be short name or full resource path)
	 * @param options - Optional subscription configuration (ack deadline, flow control, etc.)
	 * @returns A tuple of [Subscription instance, subscription metadata]
	 * @throws {NotFoundError} Code 5 - Topic not found
	 * @throws {InvalidArgumentError} Code 3 - Topic name must be in full resource format
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [subscription, metadata] = await topic.createSubscription('my-sub', {
	 *   ackDeadlineSeconds: 30,
	 *   flowControl: {
	 *     maxMessages: 100
	 *   }
	 * });
	 * ```
	 */
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

	/**
	 * Gets a reference to a subscription on this topic. Does not create the
	 * subscription if it doesn't exist. Use createSubscription() to actually
	 * create a subscription.
	 *
	 * @param name - The subscription name (can be short name or full resource path)
	 * @param options - Optional subscription options
	 * @returns A Subscription instance for interacting with the subscription
	 * @throws {InvalidArgumentError} Code 3 - Topic name must be in full resource format
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const subscription = topic.subscription('my-sub');
	 * subscription.on('message', (message) => {
	 *   console.log('Received:', message.data.toString());
	 *   message.ack();
	 * });
	 * ```
	 */
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

	/**
	 * Lists all subscriptions attached to this topic. Returns an array of
	 * Subscription instances that can be used to interact with the subscriptions.
	 *
	 * @param _options - Optional listing options (unused in this implementation)
	 * @returns A tuple of [array of Subscription instances, nextQuery, apiResponse]
	 * @throws {NotFoundError} Code 5 - Topic not found
	 * @throws {InvalidArgumentError} Code 3 - Topic name must be in full resource format
	 *
	 * @example
	 * ```typescript
	 * const topic = pubsub.topic('my-topic');
	 * const [subscriptions] = await topic.getSubscriptions();
	 * console.log(`Topic has ${subscriptions.length} subscriptions`);
	 * for (const sub of subscriptions) {
	 *   console.log('Subscription:', sub.name);
	 * }
	 * ```
	 */
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
