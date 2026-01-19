/**
 * PubSub - Main client for interacting with Pub/Sub system.
 * Reference: specs/01-pubsub-client.md
 */

import { Readable } from 'node:stream';
import type {
	PubSubOptions,
	CreateTopicOptions,
	GetTopicsOptions,
	CreateSubscriptionOptions,
	GetSubscriptionsOptions,
	SubscriptionOptions,
	PageOptions,
	CallOptions,
	SchemaType,
	ISchema,
	CreateSchemaOptions,
	SchemaDefinition,
	SchemaView,
	TopicMetadata,
	SubscriptionMetadata
} from './types';
import { DEFAULT_PUBSUB_OPTIONS } from './types/pubsub';
import { Topic } from './topic';
import { Subscription } from './subscription';
import { Schema } from './schema';
import { Snapshot } from './snapshot';
import { MessageQueue } from './internal/message-queue';
import { AlreadyExistsError, NotFoundError, InvalidArgumentError } from './types/errors';

export class PubSub {
	readonly projectId: string;
	readonly isEmulator: boolean;
	readonly isIdResolved: boolean = true;
	readonly v1: {
		PublisherClient: unknown;
		SubscriberClient: unknown;
	};

	private readonly options: PubSubOptions;
	private readonly topicCache: Map<string, Topic> = new Map();
	private readonly subscriptionCache: Map<string, Subscription> = new Map();
	private readonly schemaCache: Map<string, Schema> = new Map();
	private readonly snapshotCache: Map<string, Snapshot> = new Map();
	private readonly queue: MessageQueue;
	private readonly schemas: Map<string, { type: SchemaType; definition: string }> = new Map();

	constructor(options?: PubSubOptions) {
		this.options = { ...DEFAULT_PUBSUB_OPTIONS, ...options };
		this.projectId = options?.projectId
			?? process.env.PUBSUB_PROJECT_ID
			?? process.env.GOOGLE_CLOUD_PROJECT
			?? process.env.GCLOUD_PROJECT
			?? 'local-project';
		this.isEmulator = this.detectEmulatorMode();
		this.v1 = {
			PublisherClient: {},
			SubscriberClient: {}
		};
		this.queue = MessageQueue.getInstance();
	}

	private detectEmulatorMode(): boolean {
		if (this.options.emulatorMode !== undefined) {
			return this.options.emulatorMode;
		}
		return !!process.env.PUBSUB_EMULATOR_HOST;
	}

	private formatTopicName(name: string): string {
		if (name.startsWith('projects/')) {
			return name;
		}
		return `projects/${this.projectId}/topics/${name}`;
	}

	private formatSubscriptionName(name: string): string {
		if (name.startsWith('projects/')) {
			return name;
		}
		return `projects/${this.projectId}/subscriptions/${name}`;
	}

	private formatSchemaName(id: string): string {
		if (id.startsWith('projects/')) {
			return id;
		}
		return `projects/${this.projectId}/schemas/${id}`;
	}

	/**
	 * Gets a reference to a topic. Does not create the topic if it doesn't exist.
	 * Use createTopic() to actually create a topic in the system.
	 *
	 * @param name - The topic name or full resource path
	 * @returns A Topic instance for interacting with the topic
	 *
	 * @example
	 * ```typescript
	 * const pubsub = new PubSub();
	 * const topic = pubsub.topic('my-topic');
	 * await topic.publishMessage({ data: Buffer.from('Hello') });
	 * ```
	 */
	topic(name: string): Topic {
		const fullName = this.formatTopicName(name);
		if (!this.topicCache.has(fullName)) {
			this.topicCache.set(fullName, new Topic(this, fullName));
		}
		return this.topicCache.get(fullName)!;
	}

	/**
	 * Creates a new topic in the Pub/Sub system. Topics must be created before
	 * publishing messages to them.
	 *
	 * @param name - The topic name or full resource path
	 * @param options - Optional topic configuration (labels, schema settings, etc.)
	 * @returns A tuple of [Topic instance, topic metadata]
	 * @throws {AlreadyExistsError} Code 6 - Topic already exists
	 *
	 * @example
	 * ```typescript
	 * const pubsub = new PubSub();
	 * const [topic, metadata] = await pubsub.createTopic('my-topic', {
	 *   labels: { env: 'production' }
	 * });
	 * console.log('Created topic:', topic.name);
	 * ```
	 */
	async createTopic(name: string, options?: CreateTopicOptions): Promise<[Topic, TopicMetadata | undefined]> {
		const fullName = this.formatTopicName(name);

		if (this.queue.topicExists(fullName)) {
			throw new AlreadyExistsError(`Topic already exists: ${fullName}`);
		}

		this.queue.registerTopic(fullName, {
			name: fullName,
			labels: options?.labels,
			messageStoragePolicy: options?.messageStoragePolicy,
			kmsKeyName: options?.kmsKeyName,
			schemaSettings: options?.schemaSettings,
			messageRetentionDuration: options?.messageRetentionDuration
		});

		const topic = this.topic(name);
		const metadata = this.queue.getTopic(fullName);

		return [topic, metadata];
	}

	/**
	 * Retrieves an existing topic and its metadata. Use this to verify a topic exists
	 * and get its configuration details.
	 *
	 * @param name - The topic name or full resource path
	 * @returns A tuple of [Topic instance, topic metadata]
	 * @throws {NotFoundError} Code 5 - Topic not found
	 */
	async getTopic(name: string): Promise<[Topic, TopicMetadata | undefined]> {
		const fullName = this.formatTopicName(name);

		if (!this.queue.topicExists(fullName)) {
			throw new NotFoundError(`Topic not found: ${fullName}`);
		}

		const topic = this.topic(name);
		const metadata = this.queue.getTopic(fullName);

		return [topic, metadata];
	}

	/**
	 * Lists all topics in the project. Returns all topics with pagination metadata.
	 *
	 * @param _options - Optional pagination and filter options
	 * @returns A tuple of [array of Topics, next page token, response metadata]
	 */
	async getTopics(_options?: GetTopicsOptions): Promise<[Topic[], unknown, unknown]> {
		const allTopics = this.queue.getAllTopics();
		const topics = allTopics.map((meta) => this.topic(meta.name || ''));

		return [topics, null, {}];
	}

	/**
	 * Lists all topics as a readable stream. Useful for processing large numbers
	 * of topics without loading them all into memory.
	 *
	 * @param _options - Optional pagination options
	 * @returns A readable stream of Topic instances
	 */
	getTopicsStream(_options?: PageOptions): Readable {
		const allTopics = this.queue.getAllTopics();
		const topics = allTopics.map((meta) => this.topic(meta.name || ''));

		return Readable.from(topics);
	}

	/**
	 * Gets a reference to a subscription. Does not create the subscription if it doesn't exist.
	 * Use createSubscription() to actually create a subscription in the system.
	 *
	 * @param name - The subscription name or full resource path
	 * @param options - Optional subscription options (flow control, ack deadline, etc.)
	 * @returns A Subscription instance for receiving messages
	 *
	 * @example
	 * ```typescript
	 * const pubsub = new PubSub();
	 * const subscription = pubsub.subscription('my-subscription');
	 * subscription.on('message', (message) => {
	 *   console.log('Received:', message.data.toString());
	 *   message.ack();
	 * });
	 * subscription.on('error', (error) => console.error(error));
	 * ```
	 */
	subscription(name: string, options?: SubscriptionOptions): Subscription {
		const fullName = this.formatSubscriptionName(name);
		if (!this.subscriptionCache.has(fullName)) {
			this.subscriptionCache.set(fullName, new Subscription(this, fullName, options));
		} else if (options) {
			this.subscriptionCache.get(fullName)!.setOptions(options);
		}
		return this.subscriptionCache.get(fullName)!;
	}

	/**
	 * Creates a new subscription to a topic. Subscriptions receive messages published
	 * to the topic and must be created before messages can be received.
	 *
	 * @param topic - The topic name, full resource path, or Topic instance to subscribe to
	 * @param name - The subscription name or full resource path
	 * @param options - Optional subscription configuration (ack deadline, flow control, filters, etc.)
	 * @returns A tuple of [Subscription instance, subscription metadata]
	 * @throws {NotFoundError} Code 5 - Topic not found
	 * @throws {AlreadyExistsError} Code 6 - Subscription already exists
	 *
	 * @example
	 * ```typescript
	 * const pubsub = new PubSub();
	 * await pubsub.createTopic('my-topic');
	 * const [subscription, metadata] = await pubsub.createSubscription(
	 *   'my-topic',
	 *   'my-subscription',
	 *   { ackDeadlineSeconds: 30 }
	 * );
	 * ```
	 */
	async createSubscription(
		topic: string | Topic,
		name: string,
		options?: CreateSubscriptionOptions
	): Promise<[Subscription, SubscriptionMetadata | undefined]> {
		const topicName = typeof topic === 'string' ? this.formatTopicName(topic) : topic.name;
		const fullName = this.formatSubscriptionName(name);

		if (!this.queue.topicExists(topicName)) {
			throw new NotFoundError(`Topic not found: ${topicName}`);
		}

		if (this.queue.subscriptionExists(fullName)) {
			throw new AlreadyExistsError(`Subscription already exists: ${fullName}`);
		}

		this.queue.registerSubscription(fullName, topicName, {
			ackDeadlineSeconds: options?.ackDeadlineSeconds || 10,
			enableMessageOrdering: options?.enableMessageOrdering || false,
			pushConfig: options?.pushConfig,
			deadLetterPolicy: options?.deadLetterPolicy,
			retryPolicy: options?.retryPolicy,
			filter: options?.filter,
			enableExactlyOnceDelivery: options?.enableExactlyOnceDelivery || false,
			detached: options?.detached || false,
			labels: options?.labels,
			expirationPolicy: options?.expirationPolicy
		});

		const subscription = this.subscription(name, options);
		subscription.topic = typeof topic === 'string' ? this.topic(topic) : topic;
		subscription.metadata = this.queue.getSubscription(fullName);

		return [subscription, subscription.metadata];
	}

	/**
	 * Retrieves an existing subscription and its metadata. Use this to verify a subscription
	 * exists and get its configuration details.
	 *
	 * @param name - The subscription name or full resource path
	 * @returns A tuple of [Subscription instance, subscription metadata]
	 * @throws {NotFoundError} Code 5 - Subscription not found
	 */
	async getSubscription(name: string): Promise<[Subscription, SubscriptionMetadata | undefined]> {
		const fullName = this.formatSubscriptionName(name);

		if (!this.queue.subscriptionExists(fullName)) {
			throw new NotFoundError(`Subscription not found: ${fullName}`);
		}

		const subscription = this.subscription(name);
		subscription.metadata = this.queue.getSubscription(fullName);

		return [subscription, subscription.metadata];
	}

	/**
	 * Lists all subscriptions in the project, optionally filtered by topic.
	 * Returns all subscriptions with pagination metadata.
	 *
	 * @param options - Optional filter by topic and pagination options
	 * @returns A tuple of [array of Subscriptions, next page token, response metadata]
	 */
	async getSubscriptions(options?: GetSubscriptionsOptions): Promise<[Subscription[], unknown, unknown]> {
		let allSubscriptions = this.queue.getAllSubscriptions();

		if (options?.topic) {
			const topicName = typeof options.topic === 'string'
				? this.formatTopicName(options.topic)
				: (options.topic as Topic).name;
			allSubscriptions = this.queue.getSubscriptionsForTopic(topicName);
		}

		const subscriptions = allSubscriptions.map((meta) => {
			const sub = this.subscription(meta.name || '');
			sub.metadata = meta;
			return sub;
		});

		return [subscriptions, null, {}];
	}

	/**
	 * Lists all subscriptions as a readable stream, optionally filtered by topic.
	 * Useful for processing large numbers of subscriptions without loading them all into memory.
	 *
	 * @param options - Optional filter by topic and pagination options
	 * @returns A readable stream of Subscription instances
	 */
	getSubscriptionsStream(options?: GetSubscriptionsOptions): Readable {
		let allSubscriptions = this.queue.getAllSubscriptions();

		if (options?.topic) {
			const topicName = typeof options.topic === 'string'
				? this.formatTopicName(options.topic)
				: (options.topic as Topic).name;
			allSubscriptions = this.queue.getSubscriptionsForTopic(topicName);
		}

		const subscriptions = allSubscriptions.map((meta) => {
			const sub = this.subscription(meta.name || '');
			sub.metadata = meta;
			return sub;
		});

		return Readable.from(subscriptions);
	}

	/**
	 * Gets a reference to a schema. Does not create the schema if it doesn't exist.
	 * Use createSchema() to actually create a schema in the system.
	 *
	 * @param id - The schema ID or full resource path
	 * @returns A Schema instance for working with the schema
	 */
	schema(id: string): Schema {
		const fullName = this.formatSchemaName(id);
		if (!this.schemaCache.has(fullName)) {
			this.schemaCache.set(fullName, new Schema(this, fullName));
		}
		return this.schemaCache.get(fullName)!;
	}

	/**
	 * Creates a new schema for message validation. Schemas define the structure of
	 * messages that can be published to topics.
	 *
	 * @param schemaId - The schema ID or full resource path
	 * @param type - The schema type (AVRO, PROTOCOL_BUFFER, or JSON)
	 * @param definition - The schema definition string
	 * @param _options - Optional schema creation options
	 * @returns A tuple of [Schema instance, schema metadata]
	 * @throws {AlreadyExistsError} Code 6 - Schema already exists
	 * @throws {InvalidArgumentError} Code 3 - Invalid schema type or definition
	 */
	async createSchema(
		schemaId: string,
		type: SchemaType,
		definition: string,
		_options?: CreateSchemaOptions
	): Promise<[Schema, ISchema]> {
		const fullName = this.formatSchemaName(schemaId);

		if (this.schemas.has(fullName)) {
			throw new AlreadyExistsError(`Schema already exists: ${fullName}`);
		}

		await this.validateSchema({ type, definition });

		this.schemas.set(fullName, { type, definition });

		const schema = this.schema(schemaId);
		schema.type = type;
		schema.definition = definition;

		const metadata: ISchema = {
			name: fullName,
			type,
			definition
		};

		return [schema, metadata];
	}

	/**
	 * Lists all schemas in the project as an async iterable. Use view parameter to
	 * control whether full schema definitions are included.
	 *
	 * @param view - View mode: 'FULL' includes definitions, 'BASIC' excludes them
	 * @param _options - Optional pagination options
	 * @returns An async iterable of Schema instances
	 */
	async *listSchemas(view?: SchemaView, _options?: PageOptions): AsyncIterable<Schema> {
		for (const [fullName, schemaData] of this.schemas.entries()) {
			const schema = this.schema(fullName);
			schema.type = schemaData.type;
			schema.definition = view === 'FULL' ? schemaData.definition : undefined;
			yield schema;
		}
	}

	/**
	 * Validates a schema definition without creating it. Verifies the schema syntax
	 * and structure are correct for the specified type.
	 *
	 * @param schema - Schema definition with type and definition string
	 * @param _options - Optional call options
	 * @returns A promise that resolves if valid, rejects if invalid
	 * @throws {InvalidArgumentError} Code 3 - Missing type, missing definition, or invalid schema syntax
	 */
	async validateSchema(schema: SchemaDefinition, _options?: CallOptions): Promise<void> {
		if (!schema.type) {
			throw new InvalidArgumentError('Schema type is required');
		}

		if (!schema.definition) {
			throw new InvalidArgumentError('Schema definition is required');
		}

		if (schema.type === 'AVRO') {
			try {
				JSON.parse(schema.definition);
			} catch (_error) {
				throw new InvalidArgumentError('Invalid AVRO schema definition: must be valid JSON');
			}
		} else if (schema.type === 'JSON') {
			try {
				const schemaObj = JSON.parse(schema.definition);
				const Ajv = require('ajv');
				const ajv = new Ajv({ allErrors: true, strict: false });
				ajv.compile(schemaObj);
			} catch (error) {
				throw new InvalidArgumentError(`Invalid JSON Schema definition: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}
	}

	/**
	 * Gets the underlying schema client. Provided for Google Cloud Pub/Sub API compatibility.
	 *
	 * @returns A promise resolving to the schema client object
	 */
	async getSchemaClient(): Promise<unknown> {
		return {};
	}

	/**
	 * Gets a reference to a snapshot. Snapshots capture the state of a subscription
	 * at a point in time for replay purposes.
	 *
	 * @param name - The snapshot name
	 * @returns A Snapshot instance for working with the snapshot
	 */
	snapshot(name: string): Snapshot {
		const fullName = `projects/${this.projectId}/snapshots/${name}`;
		if (!this.snapshotCache.has(fullName)) {
			this.snapshotCache.set(fullName, new Snapshot(this, fullName));
		}
		return this.snapshotCache.get(fullName)!;
	}

	/**
	 * Lists all snapshots as a readable stream. Currently returns an empty stream
	 * as snapshot functionality is not fully implemented.
	 *
	 * @param _options - Optional pagination options
	 * @returns A readable stream of Snapshot instances
	 */
	getSnapshotsStream(_options?: PageOptions): Readable {
		return Readable.from([]);
	}

	/**
	 * Gets the client configuration including service path, port, and credentials.
	 * Useful for debugging connection settings.
	 *
	 * @returns A promise resolving to the client configuration object
	 */
	async getClientConfig(): Promise<unknown> {
		return {
			servicePath: this.options.servicePath || 'pubsub.googleapis.com',
			port: this.options.port || 443,
			sslCreds: this.options.sslCreds,
			projectId: this.projectId,
			clientConfig: this.options.clientConfig
		};
	}

	/**
	 * Gets the current project ID being used by this client.
	 *
	 * @returns A promise resolving to the project ID string
	 */
	async getProjectId(): Promise<string> {
		return this.projectId;
	}

	/**
	 * Closes the PubSub client and all active subscriptions. Cleans up all resources
	 * and clears caches. Call this when you're done using the client.
	 *
	 * @returns A promise that resolves when all resources are closed
	 */
	async close(): Promise<void> {
		for (const subscription of this.subscriptionCache.values()) {
			if (subscription.isOpen) {
				await subscription.close();
			}
		}

		this.topicCache.clear();
		this.subscriptionCache.clear();
		this.schemaCache.clear();
		this.snapshotCache.clear();

		MessageQueue.resetForTesting();
	}
}
