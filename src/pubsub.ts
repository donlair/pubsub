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
		this.projectId = this.options.projectId || 'local-project';
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

	topic(name: string): Topic {
		const fullName = this.formatTopicName(name);
		if (!this.topicCache.has(fullName)) {
			this.topicCache.set(fullName, new Topic(this, fullName));
		}
		return this.topicCache.get(fullName)!;
	}

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

	async getTopic(name: string): Promise<[Topic, TopicMetadata | undefined]> {
		const fullName = this.formatTopicName(name);

		if (!this.queue.topicExists(fullName)) {
			throw new NotFoundError(`Topic not found: ${fullName}`);
		}

		const topic = this.topic(name);
		const metadata = this.queue.getTopic(fullName);

		return [topic, metadata];
	}

	async getTopics(_options?: GetTopicsOptions): Promise<[Topic[], unknown, unknown]> {
		const allTopics = this.queue.getAllTopics();
		const topics = allTopics.map((meta) => this.topic(meta.name || ''));

		return [topics, null, {}];
	}

	getTopicsStream(_options?: PageOptions): Readable {
		const allTopics = this.queue.getAllTopics();
		const topics = allTopics.map((meta) => this.topic(meta.name || ''));

		return Readable.from(topics);
	}

	subscription(name: string, options?: SubscriptionOptions): Subscription {
		const fullName = this.formatSubscriptionName(name);
		if (!this.subscriptionCache.has(fullName)) {
			this.subscriptionCache.set(fullName, new Subscription(this, fullName, options));
		} else if (options) {
			this.subscriptionCache.get(fullName)!.setOptions(options);
		}
		return this.subscriptionCache.get(fullName)!;
	}

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

	async getSubscription(name: string): Promise<[Subscription, SubscriptionMetadata | undefined]> {
		const fullName = this.formatSubscriptionName(name);

		if (!this.queue.subscriptionExists(fullName)) {
			throw new NotFoundError(`Subscription not found: ${fullName}`);
		}

		const subscription = this.subscription(name);
		subscription.metadata = this.queue.getSubscription(fullName);

		return [subscription, subscription.metadata];
	}

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

	schema(id: string): Schema {
		const fullName = this.formatSchemaName(id);
		if (!this.schemaCache.has(fullName)) {
			this.schemaCache.set(fullName, new Schema(this, fullName));
		}
		return this.schemaCache.get(fullName)!;
	}

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

	async *listSchemas(view?: SchemaView, _options?: PageOptions): AsyncIterable<Schema> {
		for (const [fullName, schemaData] of this.schemas.entries()) {
			const schema = this.schema(fullName);
			schema.type = schemaData.type;
			schema.definition = view === 'FULL' ? schemaData.definition : undefined;
			yield schema;
		}
	}

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

	async getSchemaClient(): Promise<unknown> {
		return {};
	}

	snapshot(name: string): Snapshot {
		const fullName = `projects/${this.projectId}/snapshots/${name}`;
		if (!this.snapshotCache.has(fullName)) {
			this.snapshotCache.set(fullName, new Snapshot(this, fullName));
		}
		return this.snapshotCache.get(fullName)!;
	}

	getSnapshotsStream(_options?: PageOptions): Readable {
		return Readable.from([]);
	}

	async getClientConfig(): Promise<unknown> {
		return {
			servicePath: this.options.servicePath || 'pubsub.googleapis.com',
			port: this.options.port || 443,
			sslCreds: this.options.sslCreds,
			projectId: this.projectId
		};
	}

	async getProjectId(): Promise<string> {
		return this.projectId;
	}

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
	}
}
