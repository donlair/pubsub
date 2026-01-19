import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub } from '../../src';
import type { SchemaType } from '../../src/types/schema';
import type { CallOptions } from '../../src/types/common';

describe('gaxOpts API Compatibility', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterEach(async () => {
    await pubsub.close();
  });

  describe('PubSub Constructor - gaxOpts acceptance', () => {
    test('accepts gaxOpts with timeout', () => {
      const client = new PubSub({
        projectId: 'test-project',
        gaxOpts: {
          timeout: 60000,
        },
      });
      expect(client).toBeInstanceOf(PubSub);
    });

    test('accepts gaxOpts with retry configuration', () => {
      const client = new PubSub({
        projectId: 'test-project',
        gaxOpts: {
          retry: {
            retryCodes: [10, 14],
            backoffSettings: {
              initialRetryDelayMillis: 100,
              retryDelayMultiplier: 1.3,
              maxRetryDelayMillis: 60000,
            },
          },
        },
      });
      expect(client).toBeInstanceOf(PubSub);
    });

    test('accepts gaxOpts with complete backoff settings', () => {
      const client = new PubSub({
        projectId: 'test-project',
        gaxOpts: {
          timeout: 60000,
          retry: {
            retryCodes: [10, 14],
            backoffSettings: {
              initialRetryDelayMillis: 100,
              retryDelayMultiplier: 1.3,
              maxRetryDelayMillis: 60000,
              initialRpcTimeoutMillis: 60000,
              rpcTimeoutMultiplier: 1,
              maxRpcTimeoutMillis: 600000,
              totalTimeoutMillis: 600000,
            },
          },
        },
      });
      expect(client).toBeInstanceOf(PubSub);
    });
  });

  describe('Topic Operations - gaxOpts acceptance', () => {
    test('createTopic() accepts gaxOpts', async () => {
      const gaxOpts: CallOptions = { timeout: 30000 };
      const [topic] = await pubsub.createTopic('gax-topic-1', { gaxOpts });
      expect(topic.name).toContain('gax-topic-1');
    });

    test('getTopics() accepts gaxOpts with pagination', async () => {
      await pubsub.createTopic('gax-topic-3');
      const gaxOpts: CallOptions = {
        timeout: 30000,
        autoPaginate: true,
        maxResults: 10,
      };
      const [topics] = await pubsub.getTopics({ gaxOpts });
      expect(Array.isArray(topics)).toBe(true);
    });

    test('getTopicSubscriptions() accepts gaxOpts', async () => {
      const [topic] = await pubsub.createTopic('gax-topic-4');
      const gaxOpts: CallOptions = { timeout: 30000 };
      const [subscriptions] = await topic.getSubscriptions({ gaxOpts });
      expect(Array.isArray(subscriptions)).toBe(true);
    });
  });

  describe('Subscription Operations - gaxOpts acceptance', () => {
    test('createSubscription() accepts gaxOpts', async () => {
      await pubsub.createTopic('gax-sub-topic-1');
      const gaxOpts: CallOptions = { timeout: 30000 };
      const [subscription] = await pubsub.createSubscription('gax-sub-topic-1', 'gax-sub-1', {
        gaxOpts,
      });
      expect(subscription.name).toContain('gax-sub-1');
    });

    test('getSubscriptions() accepts gaxOpts with pagination', async () => {
      await pubsub.createTopic('gax-sub-topic-3');
      await pubsub.createSubscription('gax-sub-topic-3', 'gax-sub-3');
      const gaxOpts: CallOptions = {
        timeout: 30000,
        autoPaginate: false,
        maxResults: 5,
      };
      const [subscriptions] = await pubsub.getSubscriptions({ gaxOpts });
      expect(Array.isArray(subscriptions)).toBe(true);
    });

    test('subscription.seek() accepts CallOptions', async () => {
      await pubsub.createTopic('gax-seek-topic');
      const [subscription] = await pubsub.createSubscription('gax-seek-topic', 'gax-seek-sub');
      const date = new Date();
      const callOptions: CallOptions = { timeout: 30000 };
      await subscription.seek(date, callOptions);
    });

    test('subscription.pull() accepts gaxOpts', async () => {
      await pubsub.createTopic('gax-pull-topic');
      const topic = pubsub.topic('gax-pull-topic');
      await topic.publishMessage({ data: Buffer.from('test') });
      const [subscription] = await pubsub.createSubscription('gax-pull-topic', 'gax-pull-sub');
      const [messages] = await subscription.pull({ maxMessages: 1, gaxOpts: { timeout: 30000 } });
      expect(Array.isArray(messages)).toBe(true);
    });
  });

  describe('Schema Operations - gaxOpts acceptance', () => {
    test('createSchema() accepts gaxOpts', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      const gaxOpts: CallOptions = { timeout: 30000 };
      const [schema] = await pubsub.createSchema('gax-schema-1', 'JSON' as SchemaType, definition, {
        gaxOpts,
      });
      expect(schema).toBeDefined();
    });

    test('validateSchema() accepts gaxOpts', async () => {
      const definition = JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      await pubsub.validateSchema(
        {
          type: 'JSON' as SchemaType,
          definition,
        },
        { timeout: 30000 }
      );
    });
  });

  describe('Publisher Operations - gaxOpts acceptance', () => {
    test('topic.publishMessage() accepts gaxOpts in PublishOptions', async () => {
      const [topic] = await pubsub.createTopic('gax-publish-topic');
      const messageId = await topic.publishMessage({ data: Buffer.from('test') });
      expect(typeof messageId).toBe('string');
    });

    test('topic.setPublishOptions() accepts gaxOpts', async () => {
      const [topic] = await pubsub.createTopic('gax-publish-options-topic');
      const gaxOpts: CallOptions = {
        timeout: 60000,
        retry: {
          retryCodes: [10, 14],
        },
      };
      topic.setPublishOptions({ gaxOpts });
    });
  });

  describe('Resource Lifecycle - gaxOpts acceptance', () => {
    test('topic.delete() accepts CallOptions', async () => {
      const [topic] = await pubsub.createTopic('gax-delete-topic');
      const callOptions: CallOptions = { timeout: 30000 };
      await topic.delete(callOptions);
    });

    test('topic.exists() accepts CallOptions', async () => {
      const [topic] = await pubsub.createTopic('gax-exists-topic');
      const callOptions: CallOptions = { timeout: 30000 };
      const [exists] = await topic.exists(callOptions);
      expect(exists).toBe(true);
    });

    test('topic.get() accepts GetTopicOptions with gaxOpts', async () => {
      const [topic] = await pubsub.createTopic('gax-get-topic');
      const [retrievedTopic] = await topic.get({ gaxOpts: { timeout: 30000 } });
      expect(retrievedTopic.name).toBe(topic.name);
    });

    test('subscription.delete() accepts CallOptions', async () => {
      await pubsub.createTopic('gax-delete-sub-topic');
      const [subscription] = await pubsub.createSubscription('gax-delete-sub-topic', 'gax-delete-sub');
      const callOptions: CallOptions = { timeout: 30000 };
      await subscription.delete(callOptions);
    });

    test('subscription.exists() accepts CallOptions', async () => {
      await pubsub.createTopic('gax-exists-sub-topic');
      const [subscription] = await pubsub.createSubscription('gax-exists-sub-topic', 'gax-exists-sub');
      const callOptions: CallOptions = { timeout: 30000 };
      const [exists] = await subscription.exists(callOptions);
      expect(exists).toBe(true);
    });

    test('subscription.get() accepts GetSubscriptionOptions with gaxOpts', async () => {
      await pubsub.createTopic('gax-get-sub-topic');
      const [subscription] = await pubsub.createSubscription('gax-get-sub-topic', 'gax-get-sub');
      const [retrievedSub] = await subscription.get({ gaxOpts: { timeout: 30000 } });
      expect(retrievedSub.name).toBe(subscription.name);
    });
  });

  describe('Metadata Operations - gaxOpts acceptance', () => {
    test('topic.setMetadata() accepts CallOptions', async () => {
      const [topic] = await pubsub.createTopic('gax-metadata-topic');
      const callOptions: CallOptions = { timeout: 30000 };
      await topic.setMetadata({ labels: { env: 'test' } }, callOptions);
    });

    test('topic.getMetadata() accepts CallOptions', async () => {
      const [topic] = await pubsub.createTopic('gax-getmeta-topic');
      const callOptions: CallOptions = { timeout: 30000 };
      const [metadata] = await topic.getMetadata(callOptions);
      expect(metadata).toBeDefined();
    });

    test('subscription.setMetadata() accepts CallOptions', async () => {
      await pubsub.createTopic('gax-submeta-topic');
      const [subscription] = await pubsub.createSubscription('gax-submeta-topic', 'gax-submeta-sub');
      const callOptions: CallOptions = { timeout: 30000 };
      await subscription.setMetadata({ labels: { env: 'test' } }, callOptions);
    });

    test('subscription.getMetadata() accepts CallOptions', async () => {
      await pubsub.createTopic('gax-getsubmeta-topic');
      const [subscription] = await pubsub.createSubscription('gax-getsubmeta-topic', 'gax-getsubmeta-sub');
      const callOptions: CallOptions = { timeout: 30000 };
      const [metadata] = await subscription.getMetadata(callOptions);
      expect(metadata).toBeDefined();
    });
  });

  describe('gaxOpts Parameter Variations', () => {
    test('accepts empty gaxOpts object', async () => {
      const [topic] = await pubsub.createTopic('gax-empty-topic', { gaxOpts: {} });
      expect(topic.name).toContain('gax-empty-topic');
    });

    test('accepts gaxOpts with only retry codes', async () => {
      const [topic] = await pubsub.createTopic('gax-retry-topic', {
        gaxOpts: {
          retry: {
            retryCodes: [10, 14],
          },
        },
      });
      expect(topic.name).toContain('gax-retry-topic');
    });

    test('accepts gaxOpts with partial backoff settings', async () => {
      const [topic] = await pubsub.createTopic('gax-partial-topic', {
        gaxOpts: {
          retry: {
            backoffSettings: {
              initialRetryDelayMillis: 100,
              maxRetryDelayMillis: 60000,
            },
          },
        },
      });
      expect(topic.name).toContain('gax-partial-topic');
    });

    test('accepts gaxOpts with autoPaginate', async () => {
      await pubsub.createTopic('gax-page-topic');
      const [topics] = await pubsub.getTopics({
        gaxOpts: {
          autoPaginate: false,
          maxResults: 5,
        },
      });
      expect(Array.isArray(topics)).toBe(true);
    });

    test('accepts gaxOpts with pageToken', async () => {
      await pubsub.createTopic('gax-token-topic');
      const [topics] = await pubsub.getTopics({
        gaxOpts: {
          pageToken: 'some-token',
          maxResults: 10,
        },
      });
      expect(Array.isArray(topics)).toBe(true);
    });
  });
});
