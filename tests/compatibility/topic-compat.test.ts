import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub, Topic, Subscription, Publisher } from '../../src';
import { IAM } from '../../src/iam';
import type { PubsubMessage, Attributes } from '../../src/types/message';
import type { TopicMetadata, CreateTopicOptions } from '../../src/types/topic';
import type { PublishOptions, FlowControlledPublisher } from '../../src/types/publisher';

describe('Topic API Compatibility', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterEach(async () => {
    await pubsub.close();
  });

  describe('Constructor and Properties', () => {
    test('has readonly name property (string)', async () => {
      const topic = pubsub.topic('name-prop-topic');
      await topic.create();

      expect(topic.name).toBeDefined();
      expect(typeof topic.name).toBe('string');
      expect(topic.name).toContain('name-prop-topic');
    });

    test('has readonly pubsub property', async () => {
      const topic = pubsub.topic('pubsub-prop-topic');
      await topic.create();

      expect(topic.pubsub).toBeDefined();
      expect(topic.pubsub).toBe(pubsub);
    });

    test('has readonly iam property (IAM instance)', async () => {
      const topic = pubsub.topic('iam-prop-topic');
      await topic.create();

      expect(topic.iam).toBeDefined();
      expect(topic.iam).toBeInstanceOf(IAM);
    });

    test('has publisher property (Publisher instance)', async () => {
      const topic = pubsub.topic('publisher-prop-topic');
      await topic.create();

      expect(topic.publisher).toBeDefined();
      expect(topic.publisher).toBeInstanceOf(Publisher);
    });

    test('publisher is lazily instantiated', () => {
      const newTopic = pubsub.topic('lazy-topic');
      const publisher1 = newTopic.publisher;
      const publisher2 = newTopic.publisher;
      expect(publisher1).toBe(publisher2);
    });
  });

  describe('Publishing Methods - Basic', () => {
    test('publish() returns Promise<string> (message ID)', async () => {
      const topic = pubsub.topic('publish-basic-topic');
      await topic.create();

      const messageId = await topic.publish(Buffer.from('test data'));

      expect(typeof messageId).toBe('string');
      expect(messageId.length).toBeGreaterThan(0);
    });

    test('publish() with attributes', async () => {
      const topic = pubsub.topic('publish-attr-topic');
      await topic.create();

      const attributes: Attributes = { key: 'value', timestamp: Date.now().toString() };
      const messageId = await topic.publish(Buffer.from('test'), attributes);

      expect(typeof messageId).toBe('string');
    });

    test('publishMessage() returns Promise<string>', async () => {
      const topic = pubsub.topic('publish-msg-topic');
      await topic.create();

      const message: PubsubMessage = {
        data: Buffer.from('test data'),
        attributes: { source: 'test' }
      };

      const messageId = await topic.publishMessage(message);

      expect(typeof messageId).toBe('string');
      expect(messageId.length).toBeGreaterThan(0);
    });

    test('publishMessage() with ordering key', async () => {
      const topic = pubsub.topic('publish-order-topic');
      await topic.create();

      const message: PubsubMessage = {
        data: Buffer.from('ordered message'),
        orderingKey: 'user-123'
      };

      const messageId = await topic.publishMessage(message);

      expect(typeof messageId).toBe('string');
    });

    test('publishJSON() returns Promise<string>', async () => {
      const topic = pubsub.topic('publish-json-topic');
      await topic.create();

      const json = { userId: 123, action: 'login', timestamp: Date.now() };
      const messageId = await topic.publishJSON(json);

      expect(typeof messageId).toBe('string');
    });

    test('publishJSON() with attributes', async () => {
      const topic = pubsub.topic('publish-json-attr-topic');
      await topic.create();

      const json = { data: 'value' };
      const attributes: Attributes = { type: 'json-message' };
      const messageId = await topic.publishJSON(json, attributes);

      expect(typeof messageId).toBe('string');
    });

    test('publishMessage() throws InvalidArgumentError with code 3 for non-Buffer data', async () => {
      const topic = pubsub.topic('invalid-buffer-topic');
      await topic.create();

      try {
        await topic.publishMessage({ data: 'not a buffer' as unknown as Buffer });
        expect.unreachable('Should have thrown InvalidArgumentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(3);
        expect((error as Error).message).toContain('Buffer');
      }
    });

    test('publishMessage() throws NotFoundError with code 5 for non-existent topic', async () => {
      const nonExistentTopic = pubsub.topic('non-existent-publish-topic');

      try {
        await nonExistentTopic.publishMessage({ data: Buffer.from('test') });
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
        expect((error as Error).message).toContain('not found');
      }
    });
  });

  describe('Publishing Options', () => {
    test('setPublishOptions() accepts PublishOptions', async () => {
      const topic = pubsub.topic('set-publish-options-topic');
      await topic.create();

      const options: PublishOptions = {
        batching: {
          maxMessages: 50,
          maxMilliseconds: 100,
          maxBytes: 512 * 1024
        },
        messageOrdering: true
      };

      topic.setPublishOptions(options);

      expect(true).toBe(true);
    });

    test('getPublishOptionDefaults() returns PublishOptions with defaults', async () => {
      const topic = pubsub.topic('get-publish-defaults-topic');
      await topic.create();

      const defaults = topic.getPublishOptionDefaults();

      expect(defaults).toBeDefined();
      expect(defaults.batching?.maxMessages).toBe(100);
      expect(defaults.batching?.maxMilliseconds).toBe(10);
      expect(defaults.batching?.maxBytes).toBe(1024 * 1024);
      expect(defaults.messageOrdering).toBe(false);
      expect(defaults.flowControlOptions?.maxOutstandingMessages).toBe(100);
      expect(defaults.flowControlOptions?.maxOutstandingBytes).toBe(1024 * 1024);
    });

    test('setPublishOptions() with batching configuration', async () => {
      const topic = pubsub.topic('batching-config-topic');
      await topic.create();

      topic.setPublishOptions({
        batching: {
          maxMessages: 200,
          maxMilliseconds: 50
        }
      });

      expect(true).toBe(true);
    });

    test('setPublishOptions() with message ordering', async () => {
      const topic = pubsub.topic('message-ordering-topic');
      await topic.create();

      topic.setPublishOptions({
        messageOrdering: true
      });

      expect(true).toBe(true);
    });

    test('setPublishOptions() with flow control options', async () => {
      const topic = pubsub.topic('flow-control-options-topic');
      await topic.create();

      topic.setPublishOptions({
        flowControlOptions: {
          maxOutstandingMessages: 500,
          maxOutstandingBytes: 5 * 1024 * 1024
        }
      });

      expect(true).toBe(true);
    });
  });

  describe('Publisher Control Methods', () => {
    test('flush() returns Promise<void>', async () => {
      const topic = pubsub.topic('flush-topic');
      await topic.create();

      topic.publishMessage({ data: Buffer.from('test') });

      const result = await topic.flush();

      expect(result).toBeUndefined();
    });

    test('flowControlled() returns FlowControlledPublisher', async () => {
      const topic = pubsub.topic('flow-controlled-topic');
      await topic.create();

      const flowControlled = topic.flowControlled();

      expect(flowControlled).toBeDefined();
      expect(typeof flowControlled.publish).toBe('function');
      expect(typeof flowControlled.publishMessage).toBe('function');
    });

    test('flowControlled() publish() works', async () => {
      const topic = pubsub.topic('flow-controlled-publish-topic');
      await topic.create();

      const flowControlled = topic.flowControlled();
      const messageId = await flowControlled.publish(Buffer.from('test'));

      expect(typeof messageId).toBe('string');
    });

    test('flowControlled() publishMessage() works', async () => {
      const topic = pubsub.topic('flow-controlled-publish-msg-topic');
      await topic.create();

      const flowControlled = topic.flowControlled();
      const messageId = await flowControlled.publishMessage({
        data: Buffer.from('test')
      });

      expect(typeof messageId).toBe('string');
    });

    test('resumePublishing() accepts ordering key string', async () => {
      const topic = pubsub.topic('resume-publishing-topic');
      await topic.create();

      topic.setPublishOptions({ messageOrdering: true });
      topic.resumePublishing('user-123');

      expect(true).toBe(true);
    });
  });

  describe('Lifecycle Methods with Tuples', () => {
    test('create() returns [Topic, TopicMetadata] tuple', async () => {
      const newTopic = pubsub.topic('create-test-topic');
      const result = await newTopic.create();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Topic);
      expect(result[0]).toBe(newTopic);
      expect(result[1]).toBeDefined();
    });

    test('create() tuple can be destructured', async () => {
      const newTopic = pubsub.topic('create-destructure-topic-compat');
      const [topicInstance, metadata] = await newTopic.create();

      expect(topicInstance).toBeInstanceOf(Topic);
      expect(metadata).toBeDefined();
      expect(metadata.name).toContain('create-destructure-topic-compat');
    });

    test('create() with options', async () => {
      const newTopic = pubsub.topic('create-options-topic-compat');
      const options: CreateTopicOptions = {
        labels: { env: 'test', team: 'engineering' },
        messageRetentionDuration: { seconds: 86400 }
      };

      const [topicInstance, metadata] = await newTopic.create(options);

      expect(topicInstance).toBeInstanceOf(Topic);
      expect(metadata.labels).toEqual(options.labels);
    });

    test('create() throws AlreadyExistsError with code 6 for duplicate', async () => {
      const newTopic = pubsub.topic('duplicate-topic-compat');
      await newTopic.create();

      try {
        await newTopic.create();
        expect.unreachable('Should have thrown AlreadyExistsError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(6);
        expect((error as Error).message).toContain('already exists');
      }
    });

    test('delete() returns [unknown] tuple', async () => {
      const topic = pubsub.topic('delete-tuple-topic');
      await topic.create();

      const result = await topic.delete();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    test('delete() throws NotFoundError with code 5 for non-existent topic', async () => {
      const nonExistentTopic = pubsub.topic('delete-non-existent');

      try {
        await nonExistentTopic.delete();
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
        expect((error as Error).message).toContain('not found');
      }
    });

    test('exists() returns [boolean] tuple', async () => {
      const topic = pubsub.topic('exists-tuple-topic');
      await topic.create();

      const result = await topic.exists();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(typeof result[0]).toBe('boolean');
      expect(result[0]).toBe(true);
    });

    test('exists() returns false for non-existent topic', async () => {
      const nonExistentTopic = pubsub.topic('non-existent-exists');
      const [exists] = await nonExistentTopic.exists();

      expect(exists).toBe(false);
    });

    test('get() returns [Topic, TopicMetadata] tuple', async () => {
      const topic = pubsub.topic('get-tuple-topic');
      await topic.create();

      const result = await topic.get();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Topic);
      expect(result[1]).toBeDefined();
    });

    test('get() with autoCreate option', async () => {
      const newTopic = pubsub.topic('auto-create-topic');
      const [topicInstance, metadata] = await newTopic.get({ autoCreate: true });

      expect(topicInstance).toBeInstanceOf(Topic);
      expect(metadata).toBeDefined();
    });

    test('get() throws NotFoundError with code 5 without autoCreate', async () => {
      const nonExistentTopic = pubsub.topic('get-non-existent');

      try {
        await nonExistentTopic.get();
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
        expect((error as Error).message).toContain('not found');
      }
    });

    test('getMetadata() returns [TopicMetadata] tuple', async () => {
      const topic = pubsub.topic('get-metadata-tuple-topic');
      await topic.create();

      const result = await topic.getMetadata();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0].name).toContain('get-metadata-tuple-topic');
    });

    test('getMetadata() throws NotFoundError with code 5', async () => {
      const nonExistentTopic = pubsub.topic('metadata-non-existent');

      try {
        await nonExistentTopic.getMetadata();
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });

    test('setMetadata() returns [TopicMetadata] tuple', async () => {
      const topic = pubsub.topic('set-metadata-tuple-topic');
      await topic.create();

      const newMetadata: TopicMetadata = {
        name: topic.name,
        labels: { updated: 'true', version: '2' }
      };

      const result = await topic.setMetadata(newMetadata);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0].labels).toEqual(newMetadata.labels);
    });

    test('setMetadata() throws NotFoundError with code 5', async () => {
      const nonExistentTopic = pubsub.topic('setmeta-non-existent');

      try {
        await nonExistentTopic.setMetadata({ name: nonExistentTopic.name });
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });
  });

  describe('Subscription Methods', () => {
    test('subscription() returns Subscription instance', async () => {
      const topic = pubsub.topic('subscription-instance-topic');
      await topic.create();

      const subscription = topic.subscription('test-sub');

      expect(subscription).toBeInstanceOf(Subscription);
      expect(subscription.name).toContain('test-sub');
    });

    test('subscription() with options', async () => {
      const topic = pubsub.topic('subscription-options-topic');
      await topic.create();

      const subscription = topic.subscription('test-sub-options', {
        flowControl: { maxMessages: 50 }
      });

      expect(subscription).toBeInstanceOf(Subscription);
    });

    test('createSubscription() returns [Subscription, SubscriptionMetadata] tuple', async () => {
      const topic = pubsub.topic('create-sub-tuple-topic');
      await topic.create();

      const result = await topic.createSubscription('new-sub');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Subscription);
      expect(result[1]).toBeDefined();
    });

    test('createSubscription() tuple can be destructured', async () => {
      const topic = pubsub.topic('create-sub-destructure-topic');
      await topic.create();

      const [subscription, metadata] = await topic.createSubscription('destructure-sub');

      expect(subscription).toBeInstanceOf(Subscription);
      expect(metadata).toBeDefined();
      expect(metadata.name).toContain('destructure-sub');
    });

    test('createSubscription() with options', async () => {
      const topic = pubsub.topic('create-sub-options-topic');
      await topic.create();

      const [subscription, metadata] = await topic.createSubscription('options-sub', {
        ackDeadlineSeconds: 30,
        flowControl: { maxMessages: 100 }
      });

      expect(subscription).toBeInstanceOf(Subscription);
      expect(metadata.ackDeadlineSeconds).toBe(30);
    });

    test('createSubscription() throws NotFoundError with code 5 for non-existent topic', async () => {
      const nonExistentTopic = pubsub.topic('sub-non-existent-topic');

      try {
        await nonExistentTopic.createSubscription('sub');
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
        expect((error as Error).message).toContain('not found');
      }
    });

    test('getSubscriptions() returns [Subscription[], unknown, unknown] tuple', async () => {
      const topic = pubsub.topic('get-subs-list-topic');
      await topic.create();

      await topic.createSubscription('list-sub-1');
      await topic.createSubscription('list-sub-2');

      const result = await topic.getSubscriptions();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0].length).toBeGreaterThanOrEqual(2);
      expect(result[0][0]).toBeInstanceOf(Subscription);
    });

    test('getSubscriptions() tuple can be destructured', async () => {
      const topic = pubsub.topic('get-subs-destructure-topic');
      await topic.create();

      await topic.createSubscription('destructure-list-sub-1');
      await topic.createSubscription('destructure-list-sub-2');

      const [subscriptions, nextQuery, apiResponse] = await topic.getSubscriptions();

      expect(Array.isArray(subscriptions)).toBe(true);
      expect(subscriptions.length).toBeGreaterThanOrEqual(2);
      expect(nextQuery).toBeDefined();
      expect(apiResponse).toBeDefined();
    });

    test('getSubscriptions() throws NotFoundError with code 5 for non-existent topic', async () => {
      const nonExistentTopic = pubsub.topic('getsubs-non-existent');

      try {
        await nonExistentTopic.getSubscriptions();
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { code: number }).code).toBe(5);
      }
    });
  });

  describe('Resource Name Formatting', () => {
    test('accepts short topic name', async () => {
      const shortTopic = pubsub.topic('short-name-compat');
      await shortTopic.create();

      expect(shortTopic.name).toContain('short-name-compat');
      expect(shortTopic.name).toContain('projects/test-project/topics/');
    });

    test('accepts full resource name', async () => {
      const fullName = 'projects/test-project/topics/full-resource-name';
      const fullTopic = pubsub.topic(fullName);
      await fullTopic.create();

      expect(fullTopic.name).toBe(fullName);
    });
  });

  describe('Type Compatibility', () => {
    test('all methods return correct TypeScript types', async () => {
      const topic = pubsub.topic('type-compat-methods-topic');
      await topic.create();

      const messageId: string = await topic.publish(Buffer.from('test'));
      const [exists]: [boolean] = await topic.exists();
      const [topicInstance, metadata]: [Topic, TopicMetadata] = await topic.get();
      const subscription: Subscription = topic.subscription('type-sub');
      const flowControlled: FlowControlledPublisher = topic.flowControlled();
      const defaults: PublishOptions = topic.getPublishOptionDefaults();

      expect(typeof messageId).toBe('string');
      expect(typeof exists).toBe('boolean');
      expect(topicInstance).toBeInstanceOf(Topic);
      expect(metadata).toBeDefined();
      expect(subscription).toBeInstanceOf(Subscription);
      expect(flowControlled).toBeDefined();
      expect(defaults).toBeDefined();
    });

    test('tuple destructuring works correctly', async () => {
      const topic = pubsub.topic('type-compat-destructure-topic');
      await topic.create();

      const [exists1] = await topic.exists();
      const [topicInstance, metadata] = await topic.get();
      const [deletedResponse] = await topic.delete();
      const [topicRecreate, recreateMetadata] = await topic.create();

      expect(typeof exists1).toBe('boolean');
      expect(topicInstance).toBeInstanceOf(Topic);
      expect(metadata).toBeDefined();
      expect(deletedResponse).toBeDefined();
      expect(topicRecreate).toBeInstanceOf(Topic);
      expect(recreateMetadata).toBeDefined();
    });
  });

  describe('Batching and Flow Control Integration', () => {
    test('publishes multiple messages with batching', async () => {
      const topic = pubsub.topic('batching-multiple-msgs-topic');
      await topic.create();

      topic.setPublishOptions({
        batching: {
          maxMessages: 10,
          maxMilliseconds: 100
        }
      });

      const messageIds = await Promise.all([
        topic.publish(Buffer.from('msg1')),
        topic.publish(Buffer.from('msg2')),
        topic.publish(Buffer.from('msg3'))
      ]);

      expect(messageIds).toHaveLength(3);
      expect(messageIds.every(id => typeof id === 'string')).toBe(true);
    });

    test('flush works with pending messages', async () => {
      const topic = pubsub.topic('batching-flush-pending-topic');
      await topic.create();

      topic.setPublishOptions({
        batching: {
          maxMessages: 100,
          maxMilliseconds: 50
        }
      });

      const messageIds = await Promise.all([
        topic.publish(Buffer.from('msg1')),
        topic.publish(Buffer.from('msg2')),
        topic.flush().then(() => null)
      ]);

      expect(messageIds.filter(id => id !== null)).toHaveLength(2);
      expect(messageIds.filter(id => id !== null).every(id => typeof id === 'string')).toBe(true);
    });
  });

  describe('Ordering Key Support', () => {
    test('publishes messages with ordering keys', async () => {
      const topic = pubsub.topic('ordering-key-publish-topic');
      await topic.create();

      topic.setPublishOptions({ messageOrdering: true });

      const messageId1 = await topic.publishMessage({
        data: Buffer.from('first'),
        orderingKey: 'user-123'
      });

      const messageId2 = await topic.publishMessage({
        data: Buffer.from('second'),
        orderingKey: 'user-123'
      });

      expect(typeof messageId1).toBe('string');
      expect(typeof messageId2).toBe('string');
    });

    test('resumes publishing for ordering key', async () => {
      const topic = pubsub.topic('ordering-key-resume-topic');
      await topic.create();

      topic.setPublishOptions({ messageOrdering: true });
      topic.resumePublishing('user-123');

      expect(true).toBe(true);
    });
  });
});
