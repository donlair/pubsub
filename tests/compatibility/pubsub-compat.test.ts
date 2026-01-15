import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub, Topic, Subscription, Schema, Snapshot } from '../../src';
import { Readable } from 'node:stream';
import type { SchemaType } from '../../src/types/schema';

describe('PubSub Client API Compatibility', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterEach(async () => {
    await pubsub.close();
  });

  describe('Constructor and Properties', () => {
    test('creates instance with options', () => {
      const client = new PubSub({ projectId: 'my-project' });
      expect(client).toBeInstanceOf(PubSub);
      expect(client.projectId).toBe('my-project');
    });

    test('has projectId property (readonly string)', () => {
      expect(pubsub.projectId).toBe('test-project');
      expect(typeof pubsub.projectId).toBe('string');
    });

    test('has isEmulator property (readonly boolean)', () => {
      expect(typeof pubsub.isEmulator).toBe('boolean');
    });

    test('has isIdResolved property (readonly boolean)', () => {
      expect(pubsub.isIdResolved).toBe(true);
      expect(typeof pubsub.isIdResolved).toBe('boolean');
    });

    test('has v1 property with PublisherClient and SubscriberClient', () => {
      expect(pubsub.v1).toBeDefined();
      expect(pubsub.v1.PublisherClient).toBeDefined();
      expect(pubsub.v1.SubscriberClient).toBeDefined();
    });
  });

  describe('Topic Management - Synchronous Factory', () => {
    test('topic() returns Topic instance', () => {
      const topic = pubsub.topic('my-topic');
      expect(topic).toBeInstanceOf(Topic);
      expect(topic.name).toContain('my-topic');
    });

    test('topic() returns cached instance for same name', () => {
      const topic1 = pubsub.topic('my-topic');
      const topic2 = pubsub.topic('my-topic');
      expect(topic1).toBe(topic2);
    });

    test('topic() accepts full resource name', () => {
      const topic = pubsub.topic('projects/test-project/topics/my-topic');
      expect(topic).toBeInstanceOf(Topic);
    });
  });

  describe('Topic Management - Async Operations with Tuples', () => {
    test('createTopic() returns [Topic, Metadata] tuple', async () => {
      const result = await pubsub.createTopic('new-topic');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Topic);
      expect(result[1]).toBeDefined();
    });

    test('createTopic() tuple can be destructured', async () => {
      const [topic, metadata] = await pubsub.createTopic('destructure-topic');

      expect(topic).toBeInstanceOf(Topic);
      expect(metadata).toBeDefined();
    });

    test('createTopic() throws AlreadyExistsError with code 6', async () => {
      await pubsub.createTopic('duplicate-topic');

      try {
        await pubsub.createTopic('duplicate-topic');
        expect.unreachable('Should have thrown AlreadyExistsError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(6);
      }
    });

    test('getTopic() returns [Topic, Metadata] tuple', async () => {
      await pubsub.createTopic('get-topic');
      const result = await pubsub.getTopic('get-topic');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Topic);
    });

    test('getTopic() throws NotFoundError with code 5', async () => {
      try {
        await pubsub.getTopic('non-existent-topic');
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });

    test('getTopics() returns [Topic[], unknown, unknown] tuple', async () => {
      await pubsub.createTopic('list-topic-1');
      await pubsub.createTopic('list-topic-2');

      const result = await pubsub.getTopics();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0].length).toBeGreaterThanOrEqual(2);
      expect(result[0][0]).toBeInstanceOf(Topic);
    });

    test('getTopicsStream() returns Readable stream', () => {
      const stream = pubsub.getTopicsStream();
      expect(stream).toBeInstanceOf(Readable);
    });
  });

  describe('Subscription Management - Synchronous Factory', () => {
    test('subscription() returns Subscription instance', () => {
      const subscription = pubsub.subscription('my-subscription');
      expect(subscription).toBeInstanceOf(Subscription);
      expect(subscription.name).toContain('my-subscription');
    });

    test('subscription() returns cached instance for same name', () => {
      const sub1 = pubsub.subscription('my-subscription');
      const sub2 = pubsub.subscription('my-subscription');
      expect(sub1).toBe(sub2);
    });

    test('subscription() accepts options parameter', () => {
      const subscription = pubsub.subscription('my-subscription', {
        flowControl: { maxMessages: 10 },
      });
      expect(subscription).toBeInstanceOf(Subscription);
    });
  });

  describe('Subscription Management - Async Operations with Tuples', () => {
    test('createSubscription() returns [Subscription, Metadata] tuple', async () => {
      await pubsub.createTopic('sub-topic');
      const result = await pubsub.createSubscription('sub-topic', 'new-sub');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Subscription);
      expect(result[1]).toBeDefined();
    });

    test('createSubscription() accepts Topic instance', async () => {
      const [topic] = await pubsub.createTopic('topic-instance');
      const [subscription] = await pubsub.createSubscription(topic, 'sub-from-topic');

      expect(subscription).toBeInstanceOf(Subscription);
    });

    test('createSubscription() throws NotFoundError with code 5 for missing topic', async () => {
      try {
        await pubsub.createSubscription('non-existent-topic', 'sub');
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });

    test('createSubscription() throws AlreadyExistsError with code 6', async () => {
      await pubsub.createTopic('dup-topic');
      await pubsub.createSubscription('dup-topic', 'dup-sub');

      try {
        await pubsub.createSubscription('dup-topic', 'dup-sub');
        expect.unreachable('Should have thrown AlreadyExistsError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(6);
      }
    });

    test('getSubscription() returns [Subscription, Metadata] tuple', async () => {
      await pubsub.createTopic('get-sub-topic');
      await pubsub.createSubscription('get-sub-topic', 'get-sub');

      const result = await pubsub.getSubscription('get-sub');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Subscription);
    });

    test('getSubscription() throws NotFoundError with code 5', async () => {
      try {
        await pubsub.getSubscription('non-existent-sub');
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });

    test('getSubscriptions() returns [Subscription[], unknown, unknown] tuple', async () => {
      await pubsub.createTopic('list-sub-topic');
      await pubsub.createSubscription('list-sub-topic', 'list-sub-1');
      await pubsub.createSubscription('list-sub-topic', 'list-sub-2');

      const result = await pubsub.getSubscriptions();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0].length).toBeGreaterThanOrEqual(2);
      expect(result[0][0]).toBeInstanceOf(Subscription);
    });

    test('getSubscriptions() filters by topic', async () => {
      await pubsub.createTopic('filter-topic-1');
      await pubsub.createTopic('filter-topic-2');
      await pubsub.createSubscription('filter-topic-1', 'filter-sub-1');
      await pubsub.createSubscription('filter-topic-2', 'filter-sub-2');

      const [subscriptions] = await pubsub.getSubscriptions({ topic: 'filter-topic-1' });

      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0]?.name).toContain('filter-sub-1');
    });

    test('getSubscriptionsStream() returns Readable stream', () => {
      const stream = pubsub.getSubscriptionsStream();
      expect(stream).toBeInstanceOf(Readable);
    });

    test('getSubscriptionsStream() supports topic filtering', () => {
      const stream = pubsub.getSubscriptionsStream({ topic: 'some-topic' });
      expect(stream).toBeInstanceOf(Readable);
    });
  });

  describe('Schema Management - Synchronous Factory', () => {
    test('schema() returns Schema instance', () => {
      const schema = pubsub.schema('my-schema');
      expect(schema).toBeInstanceOf(Schema);
    });

    test('schema() returns cached instance for same name', () => {
      const schema1 = pubsub.schema('my-schema');
      const schema2 = pubsub.schema('my-schema');
      expect(schema1).toBe(schema2);
    });
  });

  describe('Schema Management - Async Operations with Tuples', () => {
    test('createSchema() returns [Schema, ISchema] tuple', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });

      const result = await pubsub.createSchema('new-schema', 'JSON' as SchemaType, definition);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Schema);
      expect(result[1]).toBeDefined();
    });

    test('createSchema() throws AlreadyExistsError with code 6', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });

      await pubsub.createSchema('dup-schema', 'JSON' as SchemaType, definition);

      try {
        await pubsub.createSchema('dup-schema', 'JSON' as SchemaType, definition);
        expect.unreachable('Should have thrown AlreadyExistsError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(6);
      }
    });

    test('createSchema() throws InvalidArgumentError with code 3 for invalid definition', async () => {
      try {
        await pubsub.createSchema('bad-schema', 'JSON' as SchemaType, 'invalid-json');
        expect.unreachable('Should have thrown InvalidArgumentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(3);
      }
    });

    test('validateSchema() returns Promise<void>', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });

      const result = await pubsub.validateSchema({
        type: 'JSON' as SchemaType,
        definition,
      });

      expect(result).toBeUndefined();
    });

    test('validateSchema() throws InvalidArgumentError with code 3 for invalid schema', async () => {
      try {
        await pubsub.validateSchema({
          type: 'JSON' as SchemaType,
          definition: 'invalid',
        });
        expect.unreachable('Should have thrown InvalidArgumentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(3);
      }
    });

    test('listSchemas() returns AsyncIterable<Schema>', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });

      await pubsub.createSchema('list-schema-1', 'JSON' as SchemaType, definition);
      await pubsub.createSchema('list-schema-2', 'JSON' as SchemaType, definition);

      const schemas: Schema[] = [];
      for await (const schema of pubsub.listSchemas()) {
        schemas.push(schema);
      }

      expect(schemas.length).toBeGreaterThanOrEqual(2);
      expect(schemas[0]).toBeInstanceOf(Schema);
    });

    test('listSchemas() supports view parameter', async () => {
      const schemas: Schema[] = [];
      for await (const schema of pubsub.listSchemas('FULL')) {
        schemas.push(schema);
      }

      expect(Array.isArray(schemas)).toBe(true);
    });

    test('getSchemaClient() returns Promise<unknown>', async () => {
      const client = await pubsub.getSchemaClient();
      expect(client).toBeDefined();
    });
  });

  describe('Snapshot Management - Synchronous Factory', () => {
    test('snapshot() returns Snapshot instance', () => {
      const snapshot = pubsub.snapshot('my-snapshot');
      expect(snapshot).toBeInstanceOf(Snapshot);
    });

    test('snapshot() returns cached instance for same name', () => {
      const snapshot1 = pubsub.snapshot('my-snapshot');
      const snapshot2 = pubsub.snapshot('my-snapshot');
      expect(snapshot1).toBe(snapshot2);
    });

    test('getSnapshotsStream() returns Readable stream', () => {
      const stream = pubsub.getSnapshotsStream();
      expect(stream).toBeInstanceOf(Readable);
    });
  });

  describe('Client Management', () => {
    test('getClientConfig() returns Promise<unknown>', async () => {
      const config = await pubsub.getClientConfig();
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    test('getProjectId() returns Promise<string>', async () => {
      const projectId = await pubsub.getProjectId();
      expect(typeof projectId).toBe('string');
      expect(projectId).toBe('test-project');
    });

    test('close() returns Promise<void>', async () => {
      const result = await pubsub.close();
      expect(result).toBeUndefined();
    });

    test('close() closes all active subscriptions', async () => {
      await pubsub.createTopic('close-topic');
      const [subscription] = await pubsub.createSubscription('close-topic', 'close-sub');

      subscription.open();
      expect(subscription.isOpen).toBe(true);

      await pubsub.close();
      expect(subscription.isOpen).toBe(false);
    });
  });

  describe('Resource Name Formatting', () => {
    test('accepts short topic names', async () => {
      const [topic] = await pubsub.createTopic('short-name');
      expect(topic.name).toBe('projects/test-project/topics/short-name');
    });

    test('accepts full topic resource names', async () => {
      const [topic] = await pubsub.createTopic('projects/test-project/topics/full-name');
      expect(topic.name).toBe('projects/test-project/topics/full-name');
    });

    test('accepts short subscription names', async () => {
      await pubsub.createTopic('format-topic');
      const [subscription] = await pubsub.createSubscription('format-topic', 'short-sub');
      expect(subscription.name).toBe('projects/test-project/subscriptions/short-sub');
    });

    test('accepts full subscription resource names', async () => {
      await pubsub.createTopic('format-topic-2');
      const [subscription] = await pubsub.createSubscription(
        'format-topic-2',
        'projects/test-project/subscriptions/full-sub'
      );
      expect(subscription.name).toBe('projects/test-project/subscriptions/full-sub');
    });
  });

  describe('Type Compatibility', () => {
    test('all factory methods return correct types', () => {
      const topic: Topic = pubsub.topic('type-topic');
      const subscription: Subscription = pubsub.subscription('type-sub');
      const schema: Schema = pubsub.schema('type-schema');
      const snapshot: Snapshot = pubsub.snapshot('type-snapshot');

      expect(topic).toBeInstanceOf(Topic);
      expect(subscription).toBeInstanceOf(Subscription);
      expect(schema).toBeInstanceOf(Schema);
      expect(snapshot).toBeInstanceOf(Snapshot);
    });

    test('tuple destructuring works with TypeScript types', async () => {
      const [topic, topicMetadata] = await pubsub.createTopic('tuple-topic');
      const [subscription, subscriptionMetadata] = await pubsub.createSubscription(
        'tuple-topic',
        'tuple-sub'
      );
      const [topics, nextQuery, apiResponse] = await pubsub.getTopics();

      expect(topic).toBeInstanceOf(Topic);
      expect(topicMetadata).toBeDefined();
      expect(subscription).toBeInstanceOf(Subscription);
      expect(subscriptionMetadata).toBeDefined();
      expect(Array.isArray(topics)).toBe(true);
      expect(nextQuery).toBeDefined();
      expect(apiResponse).toBeDefined();
    });
  });
});
