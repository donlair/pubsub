/**
 * MessageQueue unit tests.
 * Tests all 13 acceptance criteria from specs/07-message-queue.md
 */

import { test, expect, beforeEach, describe, spyOn } from 'bun:test';
import { MessageQueue } from '../../src/internal/message-queue';
import type { InternalMessage } from '../../src/internal/types';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = MessageQueue.getInstance();

    // Clear all topics and subscriptions for clean state
    const topics = queue.getAllTopics();
    topics.forEach(t => {
      if (t.name) queue.unregisterTopic(t.name);
    });

    const subs = queue.getAllSubscriptions();
    subs.forEach(s => {
      if (s.name) queue.unregisterSubscription(s.name);
    });
  });

  // AC-001: Singleton Pattern
  test('AC-001: Returns same instance on multiple calls', () => {
    const queue1 = MessageQueue.getInstance();
    const queue2 = MessageQueue.getInstance();

    expect(queue1).toBe(queue2);
  });

  // AC-002: Register and Check Topic
  test('AC-002: Register and check topic exists', () => {
    expect(queue.topicExists('test-topic')).toBe(false);

    queue.registerTopic('test-topic');

    expect(queue.topicExists('test-topic')).toBe(true);
  });

  // AC-003: Publish and Pull Messages
  test('AC-003: Publish and pull messages', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic');

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('Hello'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 5
      }
    ];

    const messageIds = queue.publish('test-topic', messages);
    expect(messageIds).toHaveLength(1);

    const pulled = queue.pull('test-sub', 10);
    expect(pulled).toHaveLength(1);
    expect(pulled[0]!.data.toString()).toBe('Hello');
  });

  // AC-004: Multiple Subscriptions Receive Copies
  test('AC-004: Multiple subscriptions receive message copies', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('sub-1', 'test-topic');
    queue.registerSubscription('sub-2', 'test-topic');

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    queue.publish('test-topic', messages);

    const pulled1 = queue.pull('sub-1', 10);
    const pulled2 = queue.pull('sub-2', 10);

    expect(pulled1).toHaveLength(1);
    expect(pulled2).toHaveLength(1);
  });

  // AC-005: Ack Removes Message
  test('AC-005: Ack removes message from queue', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic');

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    queue.publish('test-topic', messages);

    const pulled1 = queue.pull('test-sub', 10);
    expect(pulled1).toHaveLength(1);

    // Ack the message
    queue.ack(pulled1[0]!.ackId!);

    // Should not be available again
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(0);
  });

  // AC-006: Nack Redelivers Immediately
  test('AC-006: Nack causes redelivery with backoff', async () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic', {
      retryPolicy: {
        minimumBackoff: { seconds: 0.1 },
        maximumBackoff: { seconds: 1 }
      }
    } as any);

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    queue.publish('test-topic', messages);

    const pulled1 = queue.pull('test-sub', 10);
    expect(pulled1[0]!.deliveryAttempt).toBe(1);

    // Nack the message
    queue.nack(pulled1[0]!.ackId!);

    // Should not be available immediately (backoff applied)
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(0);

    // After minimal backoff, should be available with incremented delivery attempt
    await new Promise(resolve => setTimeout(resolve, 150));
    const pulled3 = queue.pull('test-sub', 10);
    expect(pulled3).toHaveLength(1);
    expect(pulled3[0]!.deliveryAttempt).toBe(2);
  });

  // AC-007: Ack Deadline Expiry Redelivers
  test('AC-007: Ack deadline expiry causes redelivery', async () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic', {
      ackDeadlineSeconds: 1,  // 1 second for faster testing
      retryPolicy: {
        minimumBackoff: { seconds: 0.1 },
        maximumBackoff: { seconds: 1 }
      }
    } as any);

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    queue.publish('test-topic', messages);

    const pulled1 = queue.pull('test-sub', 10);
    expect(pulled1).toHaveLength(1);

    // Don't ack - wait for deadline + backoff
    await new Promise(resolve => setTimeout(resolve, 1250));

    // Should be available for redelivery after backoff
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(1);
    expect(pulled2[0]!.deliveryAttempt).toBe(2);
  });

  // AC-008: Modify Ack Deadline
  test('AC-008: Modify ack deadline extends expiry time', async () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic', {
      ackDeadlineSeconds: 1  // 1 second for faster testing
    });

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    queue.publish('test-topic', messages);

    const pulled1 = queue.pull('test-sub', 10);

    // Extend deadline by 2 seconds
    queue.modifyAckDeadline(pulled1[0]!.ackId!, 2);

    // Wait past original deadline but within extended
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should NOT be available (extended deadline not expired yet)
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(0);

    // Ack it
    queue.ack(pulled1[0]!.ackId!);
  });

  // AC-009: Message Ordering
  test('AC-009: Messages with same orderingKey delivered in order', async () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic', {
      enableMessageOrdering: true
    });

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('first'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: 'user-123',
        deliveryAttempt: 1,
        length: 5
      },
      {
        id: 'msg-2',
        data: Buffer.from('second'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: 'user-123',
        deliveryAttempt: 1,
        length: 6
      }
    ];

    queue.publish('test-topic', messages);

    // Pull first message
    const pulled1 = queue.pull('test-sub', 10);
    expect(pulled1).toHaveLength(1);
    expect(pulled1[0]!.data.toString()).toBe('first');

    // Second message should not be available until first is acked
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(0);

    // Ack first
    queue.ack(pulled1[0]!.ackId!);

    // Now second should be available
    const pulled3 = queue.pull('test-sub', 10);
    expect(pulled3).toHaveLength(1);
    expect(pulled3[0]!.data.toString()).toBe('second');
  });

  // AC-010: Publish Without Subscriptions
  test('AC-010: Publish to topic without subscriptions succeeds', () => {
    queue.registerTopic('test-topic');
    // No subscriptions

    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }
    ];

    // Should not throw
    const messageIds = queue.publish('test-topic', messages);
    expect(messageIds).toHaveLength(1);
  });

  // AC-011: Get Subscriptions for Topic
  test('AC-011: Get all subscriptions for a topic', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('sub-1', 'test-topic');
    queue.registerSubscription('sub-2', 'test-topic');

    const subs = queue.getSubscriptionsForTopic('test-topic');
    expect(subs).toHaveLength(2);
  });

  // AC-012: Unregister Topic Detaches Subscriptions
  test('AC-012: Unregister topic detaches but keeps subscriptions', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic');

    queue.unregisterTopic('test-topic');

    expect(queue.topicExists('test-topic')).toBe(false);
    expect(queue.subscriptionExists('test-sub')).toBe(true);

    // Subscription still exists but detached
    const sub = queue.getSubscription('test-sub');
    expect(sub?.topic).toBe('test-topic');
  });

  // AC-013: FIFO Message Ordering Without Ordering Key
  test('AC-013: Messages without orderingKey delivered in FIFO order', () => {
    queue.registerTopic('test-topic');
    queue.registerSubscription('test-sub', 'test-topic');

    // Publish messages in order: A, B, C (no orderingKey)
    const messages: InternalMessage[] = [
      {
        id: 'msg-1',
        data: Buffer.from('A'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 1
      },
      {
        id: 'msg-2',
        data: Buffer.from('B'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 1
      },
      {
        id: 'msg-3',
        data: Buffer.from('C'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 1
      }
    ];

    queue.publish('test-topic', messages);

    const pulled = queue.pull('test-sub', 10);

    // Must be delivered in publish order (FIFO)
    expect(pulled).toHaveLength(3);
    expect(pulled[0]!.data.toString()).toBe('A');
    expect(pulled[1]!.data.toString()).toBe('B');
    expect(pulled[2]!.data.toString()).toBe('C');
  });

  // Error Handling Tests

  describe('Error Handling', () => {
    test('publish() throws NotFoundError when topic does not exist', () => {
      const messages: InternalMessage[] = [
        {
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }
      ];

      expect(() => {
        queue.publish('non-existent-topic', messages);
      }).toThrow('Topic not found: non-existent-topic');
    });

    test('pull() throws NotFoundError when subscription does not exist', () => {
      expect(() => {
        queue.pull('non-existent-sub', 10);
      }).toThrow('Subscription not found: non-existent-sub');
    });

    test('ack() throws InvalidArgumentError when ackId is invalid', () => {
      expect(() => {
        queue.ack('invalid-ack-id');
      }).toThrow('Invalid ack ID: invalid-ack-id');
    });

    test('nack() throws InvalidArgumentError when ackId is invalid', () => {
      expect(() => {
        queue.nack('invalid-ack-id');
      }).toThrow('Invalid ack ID: invalid-ack-id');
    });

    test('modifyAckDeadline() throws InvalidArgumentError when ackId is invalid', () => {
      expect(() => {
        queue.modifyAckDeadline('invalid-ack-id', 30);
      }).toThrow('Invalid ack ID: invalid-ack-id');
    });

    test('Error objects have correct error codes', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic');

      const messages: InternalMessage[] = [
        {
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }
      ];

      try {
        queue.publish('non-existent-topic', messages);
      } catch (error: any) {
        expect(error.code).toBe(5);
      }

      try {
        queue.pull('non-existent-sub', 10);
      } catch (error: any) {
        expect(error.code).toBe(5);
      }

      try {
        queue.ack('invalid-ack-id');
      } catch (error: any) {
        expect(error.code).toBe(3);
      }
    });

    test('ack() succeeds with valid ackId', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic');

      const messages: InternalMessage[] = [
        {
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }
      ];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);

      expect(() => {
        queue.ack(pulled[0]!.ackId!);
      }).not.toThrow();
    });
  });

  // Advanced Features Tests (BR-013 through BR-022)
  describe('Advanced Features', () => {
    // BR-017: Message Size Validation
    describe('BR-017: Message Size Validation', () => {
      test('Rejects message exceeding 10MB', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const largeData = Buffer.alloc(10 * 1024 * 1024 + 1);
        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: largeData,
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Message size exceeds 10MB limit');
      });

      test('Rejects attribute key exceeding 256 bytes', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const longKey = 'a'.repeat(257);
        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test'),
            attributes: { [longKey]: 'value' },
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Attribute key exceeds 256 bytes');
      });

      test('Rejects attribute value exceeding 1024 bytes', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const longValue = 'a'.repeat(1025);
        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test'),
            attributes: { key: longValue },
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Attribute value exceeds 1024 bytes');
      });

      test('Rejects empty attribute key', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test'),
            attributes: { '': 'value' },
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Attribute keys must be non-empty');
      });

      test('Rejects attribute key with reserved prefix "goog"', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test'),
            attributes: { 'googTest': 'value' },
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Attribute keys cannot start with reserved prefix');
      });

      test('Rejects attribute key with reserved prefix "googclient_"', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test'),
            attributes: { 'googclient_test': 'value' },
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).toThrow('Attribute keys cannot start with reserved prefix');
      });

      test('Accepts message at 10MB limit', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const maxData = Buffer.alloc(10 * 1024 * 1024);
        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: maxData,
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 0
          }
        ];

        expect(() => {
          queue.publish('test-topic', messages);
        }).not.toThrow();
      });
    });

    // BR-014 & BR-013: In-Flight Metrics and Flow Control
    describe('BR-013 & BR-014: Flow Control with In-Flight Metrics', () => {
      test('Blocks pull when maxMessages flow control limit is reached', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          flowControl: {
            maxMessages: 2
          }
        } as any);

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.from('test1'),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 5
          },
          {
            id: 'msg-2',
            data: Buffer.from('test2'),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 5
          },
          {
            id: 'msg-3',
            data: Buffer.from('test3'),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 5
          }
        ];

        queue.publish('test-topic', messages);

        const pulled1 = queue.pull('test-sub', 10);
        expect(pulled1).toHaveLength(2);

        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(0);

        queue.ack(pulled1[0]!.ackId!);

        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(1);
      });

      test('Blocks pull when maxBytes flow control limit is reached', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          flowControl: {
            maxBytes: 100
          }
        } as any);

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.alloc(60),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 60
          },
          {
            id: 'msg-2',
            data: Buffer.alloc(60),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 60
          }
        ];

        queue.publish('test-topic', messages);

        const pulled1 = queue.pull('test-sub', 10);
        expect(pulled1).toHaveLength(1);

        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(0);

        queue.ack(pulled1[0]!.ackId!);

        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(1);
      });

      test('Tracks in-flight bytes correctly', async () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          flowControl: {
            maxBytes: 1000
          },
          retryPolicy: {
            minimumBackoff: { seconds: 0.1 },
            maximumBackoff: { seconds: 1 }
          }
        } as any);

        const messages: InternalMessage[] = [
          {
            id: 'msg-1',
            data: Buffer.alloc(500),
            attributes: {},
            publishTime: new Date() as any,
            orderingKey: undefined,
            deliveryAttempt: 1,
            length: 500
          }
        ];

        queue.publish('test-topic', messages);
        const pulled = queue.pull('test-sub', 10);

        queue.nack(pulled[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(1);
      });
    });

    // BR-022: Queue Size Limits
    describe('BR-022: Queue Size Limits', () => {
      test('Rejects messages when queue reaches 10,000 message limit', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const publishBatch = () => {
          const batch: InternalMessage[] = [];
          for (let i = 0; i < 1000; i++) {
            batch.push({
              id: `msg-${i}`,
              data: Buffer.from('test'),
              attributes: {},
              publishTime: new Date() as any,
              orderingKey: undefined,
              deliveryAttempt: 1,
              length: 4
            });
          }
          return batch;
        };

        for (let i = 0; i < 10; i++) {
          queue.publish('test-topic', publishBatch());
        }

        const oneMore: InternalMessage[] = [{
          id: 'msg-10001',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', oneMore);

        const pulled = queue.pull('test-sub', 10001);
        expect(pulled.length).toBeLessThanOrEqual(10000);
      });

      test('Accepts messages after queue size drops below limit', () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const publishBatch = () => {
          const batch: InternalMessage[] = [];
          for (let i = 0; i < 1000; i++) {
            batch.push({
              id: `msg-${i}`,
              data: Buffer.from('test'),
              attributes: {},
              publishTime: new Date() as any,
              orderingKey: undefined,
              deliveryAttempt: 1,
              length: 4
            });
          }
          return batch;
        };

        for (let i = 0; i < 10; i++) {
          queue.publish('test-topic', publishBatch());
        }

        const pulled = queue.pull('test-sub', 5000);
        for (const msg of pulled) {
          queue.ack(msg.ackId!);
        }

        const newMessages: InternalMessage[] = [{
          id: 'new-msg',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', newMessages);

        const pulled2 = queue.pull('test-sub', 10000);
        expect(pulled2.some(m => m.id === 'new-msg')).toBe(true);
      });
    });

    // BR-015: Retry Backoff
    describe('BR-015: Retry Backoff', () => {
      test('Applies exponential backoff on nack with retryPolicy', async () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          retryPolicy: {
            minimumBackoff: { seconds: 1 },
            maximumBackoff: { seconds: 10 }
          }
        } as any);

        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', messages);
        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(0);

        await new Promise(resolve => setTimeout(resolve, 1100));

        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(1);
        expect(pulled3[0]!.deliveryAttempt).toBe(2);
      });

      test('Applies default backoff (10s-600s) when no retryPolicy specified', async () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic');

        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', messages);
        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(0);

        await new Promise(resolve => setTimeout(resolve, 10100));

        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(1);
        expect(pulled3[0]!.deliveryAttempt).toBe(2);
      }, { timeout: 15000 });

      test('Caps backoff at maximumBackoff', async () => {
        queue.registerTopic('test-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          retryPolicy: {
            minimumBackoff: { seconds: 1 },
            maximumBackoff: { seconds: 2 }
          }
        } as any);

        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 5,
          length: 4
        }];

        queue.publish('test-topic', messages);
        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        const pulled2 = queue.pull('test-sub', 10);
        expect(pulled2).toHaveLength(0);

        await new Promise(resolve => setTimeout(resolve, 2100));

        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(1);
      });
    });

    // BR-016: Dead Letter Queue
    describe('BR-016: Dead Letter Queue', () => {
      test('Routes message to DLQ after maxDeliveryAttempts', async () => {
        queue.registerTopic('test-topic');
        queue.registerTopic('dlq-topic');
        queue.registerSubscription('dlq-sub', 'dlq-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          deadLetterPolicy: {
            deadLetterTopic: 'dlq-topic',
            maxDeliveryAttempts: 3
          },
          retryPolicy: {
            minimumBackoff: { seconds: 0.1 },
            maximumBackoff: { seconds: 1 }
          }
        } as any);

        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: { foo: 'bar' },
          publishTime: new Date() as any,
          orderingKey: 'key-1',
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', messages);

        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const pulled2 = queue.pull('test-sub', 10);
        queue.nack(pulled2[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 250));
        const pulled3 = queue.pull('test-sub', 10);
        queue.nack(pulled3[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 250));
        const pulled4 = queue.pull('test-sub', 10);
        expect(pulled4).toHaveLength(0);

        const dlqMessages = queue.pull('dlq-sub', 10);
        expect(dlqMessages).toHaveLength(1);
        expect(dlqMessages[0]!.attributes.foo).toBe('bar');
        expect(dlqMessages[0]!.orderingKey).toBe('key-1');
      });

      test('Removes message from original subscription after DLQ routing', async () => {
        queue.registerTopic('test-topic');
        queue.registerTopic('dlq-topic');
        queue.registerSubscription('dlq-sub', 'dlq-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          deadLetterPolicy: {
            deadLetterTopic: 'dlq-topic',
            maxDeliveryAttempts: 2
          },
          retryPolicy: {
            minimumBackoff: { seconds: 0.1 },
            maximumBackoff: { seconds: 1 }
          }
        } as any);

        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: {},
          publishTime: new Date() as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', messages);

        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const pulled2 = queue.pull('test-sub', 10);
        queue.nack(pulled2[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const pulled3 = queue.pull('test-sub', 10);
        expect(pulled3).toHaveLength(0);
      });

      test('Preserves original message metadata in DLQ', async () => {
        queue.registerTopic('test-topic');
        queue.registerTopic('dlq-topic');
        queue.registerSubscription('dlq-sub', 'dlq-topic');
        queue.registerSubscription('test-sub', 'test-topic', {
          deadLetterPolicy: {
            deadLetterTopic: 'dlq-topic',
            maxDeliveryAttempts: 2
          },
          retryPolicy: {
            minimumBackoff: { seconds: 0.1 },
            maximumBackoff: { seconds: 1 }
          }
        } as any);

        const originalPublishTime = new Date();
        const messages: InternalMessage[] = [{
          id: 'msg-1',
          data: Buffer.from('test'),
          attributes: { key: 'value' },
          publishTime: originalPublishTime as any,
          orderingKey: 'order-key',
          deliveryAttempt: 1,
          length: 4
        }];

        queue.publish('test-topic', messages);

        const pulled1 = queue.pull('test-sub', 10);
        queue.nack(pulled1[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const pulled2 = queue.pull('test-sub', 10);
        queue.nack(pulled2[0]!.ackId!);

        await new Promise(resolve => setTimeout(resolve, 150));
        const dlqMessages = queue.pull('dlq-sub', 10);
        expect(dlqMessages[0]!.attributes.key).toBe('value');
        expect(dlqMessages[0]!.orderingKey).toBe('order-key');
        expect(dlqMessages[0]!.publishTime).toBeDefined();
      });
    });
  });

  describe('Periodic Cleanup', () => {
    test('Cleanup timer starts when instance created', () => {
      const queue = MessageQueue.getInstance();
      expect((queue as any).cleanupTimer).toBeDefined();
    });

    test('Cleanup timer cleared on resetForTesting', () => {
      const queue = MessageQueue.getInstance();
      const timerId = (queue as any).cleanupTimer;
      expect(timerId).toBeDefined();

      MessageQueue.resetForTesting();

      const newQueue = MessageQueue.getInstance();
      const newTimerId = (newQueue as any).cleanupTimer;
      expect(newTimerId).toBeDefined();
      expect(newTimerId).not.toBe(timerId);
    });

    test('Removes expired orphaned leases during cleanup', async () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadline: 10
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;
      const lease = (queue as any).leases.get(ackId);

      expect((queue as any).leases.has(ackId)).toBe(true);

      if (lease.timer) {
        clearTimeout(lease.timer);
      }
      lease.deadline = new Date(Date.now() - 1000);

      const subQueue = (queue as any).queues.get('test-sub');
      subQueue.inFlight.delete(ackId);

      (queue as any).runCleanup();

      expect((queue as any).leases.has(ackId)).toBe(false);
    });

    test('Does not remove valid leases during cleanup', async () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadline: 600
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;

      expect((queue as any).leases.has(ackId)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      (queue as any).runCleanup();

      expect((queue as any).leases.has(ackId)).toBe(true);
    });

    test('Cleanup runs every 60 seconds', async () => {
      let cleanupCalled = false;
      const originalRunCleanup = (MessageQueue.prototype as any).runCleanup;

      (MessageQueue.prototype as any).runCleanup = function() {
        cleanupCalled = true;
        originalRunCleanup.call(this);
      };

      MessageQueue.resetForTesting();
      MessageQueue.getInstance();

      expect(cleanupCalled).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 61000));

      expect(cleanupCalled).toBe(true);

      (MessageQueue.prototype as any).runCleanup = originalRunCleanup;
    }, { timeout: 65000 });

    test('Removes expired messages during cleanup (default 7-day retention)', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10
      } as any);

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-old',
          data: Buffer.from('old'),
          attributes: {},
          publishTime: eightDaysAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 3
        },
        {
          id: 'msg-recent',
          data: Buffer.from('recent'),
          attributes: {},
          publishTime: oneDayAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 6
        }
      ];

      queue.publish('test-topic', messages);

      const subQueue = (queue as any).queues.get('test-sub');
      expect(subQueue.messages.length).toBe(2);

      (queue as any).runCleanup();

      expect(subQueue.messages.length).toBe(1);
      expect(subQueue.messages[0]!.id).toBe('msg-recent');
    });

    test('Removes expired messages with custom retention period', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10,
        messageRetentionDuration: { seconds: 3600 }
      } as any);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-old',
          data: Buffer.from('old'),
          attributes: {},
          publishTime: twoHoursAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 3
        },
        {
          id: 'msg-recent',
          data: Buffer.from('recent'),
          attributes: {},
          publishTime: thirtyMinutesAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 6
        }
      ];

      queue.publish('test-topic', messages);

      const subQueue = (queue as any).queues.get('test-sub');
      expect(subQueue.messages.length).toBe(2);

      (queue as any).runCleanup();

      expect(subQueue.messages.length).toBe(1);
      expect(subQueue.messages[0]!.id).toBe('msg-recent');
    });

    test('Removes expired messages from ordering queues', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10,
        enableMessageOrdering: true,
        messageRetentionDuration: { seconds: 3600 }
      } as any);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-old-1',
          data: Buffer.from('old1'),
          attributes: {},
          publishTime: twoHoursAgo as any,
          orderingKey: 'key-1',
          deliveryAttempt: 1,
          length: 4
        },
        {
          id: 'msg-recent-1',
          data: Buffer.from('recent1'),
          attributes: {},
          publishTime: thirtyMinutesAgo as any,
          orderingKey: 'key-1',
          deliveryAttempt: 1,
          length: 7
        },
        {
          id: 'msg-old-2',
          data: Buffer.from('old2'),
          attributes: {},
          publishTime: twoHoursAgo as any,
          orderingKey: 'key-2',
          deliveryAttempt: 1,
          length: 4
        }
      ];

      queue.publish('test-topic', messages);

      const subQueue = (queue as any).queues.get('test-sub');
      expect(subQueue.orderingQueues!.get('key-1')!.length).toBe(2);
      expect(subQueue.orderingQueues!.get('key-2')!.length).toBe(1);

      (queue as any).runCleanup();

      expect(subQueue.orderingQueues!.get('key-1')!.length).toBe(1);
      expect(subQueue.orderingQueues!.get('key-1')![0]!.id).toBe('msg-recent-1');
      expect(subQueue.orderingQueues!.has('key-2')).toBe(false);
    });

    test('Removes expired messages from backoff queue', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 1,
        messageRetentionDuration: { seconds: 3600 }
      } as any);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-old',
          data: Buffer.from('old'),
          attributes: {},
          publishTime: twoHoursAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 3
        }
      ];

      queue.publish('test-topic', messages);
      queue.pull('test-sub', 10);
      const subQueue = (queue as any).queues.get('test-sub');
      const ackId = Array.from(subQueue.inFlight.keys())[0] as string;
      queue.nack(ackId);

      expect(subQueue.backoffQueue.size).toBe(1);

      (queue as any).runCleanup();

      expect(subQueue.backoffQueue.size).toBe(0);
    });

    test('Handles retention with number format (seconds only)', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10,
        messageRetentionDuration: 3600
      } as any);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-old',
          data: Buffer.from('old'),
          attributes: {},
          publishTime: twoHoursAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 3
        }
      ];

      queue.publish('test-topic', messages);
      const subQueue = (queue as any).queues.get('test-sub');
      expect(subQueue.messages.length).toBe(1);

      (queue as any).runCleanup();

      expect(subQueue.messages.length).toBe(0);
    });

    test('Does not remove messages within retention period', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10,
        messageRetentionDuration: { seconds: 86400 }
      } as any);

      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

      const messages: InternalMessage[] = [
        {
          id: 'msg-valid',
          data: Buffer.from('valid'),
          attributes: {},
          publishTime: twelveHoursAgo as any,
          orderingKey: undefined,
          deliveryAttempt: 1,
          length: 5
        }
      ];

      queue.publish('test-topic', messages);
      const subQueue = (queue as any).queues.get('test-sub');
      expect(subQueue.messages.length).toBe(1);

      (queue as any).runCleanup();

      expect(subQueue.messages.length).toBe(1);
    });

    test('Removes ackIds older than 10 minutes during cleanup', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 600
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;

      const lease = (queue as any).leases.get(ackId);
      expect(lease).toBeDefined();

      const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
      (queue as any).ackIdCreationTimes.set(ackId, elevenMinutesAgo);

      (queue as any).runCleanup();

      expect((queue as any).leases.has(ackId)).toBe(false);
      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(false);
    });

    test('Does not remove ackIds younger than 10 minutes during cleanup', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 600
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;

      const lease = (queue as any).leases.get(ackId);
      expect(lease).toBeDefined();

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      (queue as any).ackIdCreationTimes.set(ackId, fiveMinutesAgo);

      (queue as any).runCleanup();

      expect((queue as any).leases.has(ackId)).toBe(true);
      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(true);
    });

    test('Cleans up ackIdCreationTimes on ack()', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;

      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(true);

      queue.ack(ackId);

      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(false);
    });

    test('Cleans up ackIdCreationTimes on nack()', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic', {
        ackDeadlineSeconds: 10
      } as any);

      const messages: InternalMessage[] = [{
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 4
      }];

      queue.publish('test-topic', messages);
      const pulled = queue.pull('test-sub', 10);
      const ackId = pulled[0]!.ackId!;

      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(true);

      queue.nack(ackId);

      expect((queue as any).ackIdCreationTimes.has(ackId)).toBe(false);
    });

    test('logs errors in cleanup timer without stopping cleanup', () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
      const originalStartPeriodicCleanup = (MessageQueue.prototype as any).startPeriodicCleanup;
      const originalRunCleanup = (MessageQueue.prototype as any).runCleanup;
      let capturedCallback: (() => void) | undefined;

      (MessageQueue.prototype as any).startPeriodicCleanup = function() {
        this.cleanupTimer = setInterval(() => {
          try {
            this.runCleanup();
          } catch (error) {
            console.error('Error during periodic cleanup:', error);
          }
        }, 60000);
        capturedCallback = () => {
          try {
            this.runCleanup();
          } catch (error) {
            console.error('Error during periodic cleanup:', error);
          }
        };
        this.cleanupTimer.unref();
      };

      (MessageQueue.prototype as any).runCleanup = () => {
        throw new Error('Simulated cleanup error');
      };

      MessageQueue.resetForTesting();
      MessageQueue.getInstance();

      if (capturedCallback) {
        capturedCallback();
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error during periodic cleanup:',
        expect.any(Error)
      );

      (MessageQueue.prototype as any).startPeriodicCleanup = originalStartPeriodicCleanup;
      (MessageQueue.prototype as any).runCleanup = originalRunCleanup;
    });
  });

  describe('Queue Size Warning Logging (BR-022)', () => {
    test('warns when message count limit reached', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic');

      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const queueState = (queue as any).queues.get('test-sub');
      queueState.queueSize = 10000;

      const message: InternalMessage = {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 100,
      };

      queue.publish('test-topic', [message]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Queue capacity reached for subscription test-sub'),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('10000 messages'));

      warnSpy.mockRestore();
    });

    test('warns when byte limit reached', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic');

      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const queueState = (queue as any).queues.get('test-sub');
      queueState.queueBytes = 100 * 1024 * 1024;

      const message: InternalMessage = {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 100,
      };

      queue.publish('test-topic', [message]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Queue capacity reached for subscription test-sub'),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('104857600 bytes'));

      warnSpy.mockRestore();
    });

    test('does not warn when limits not reached', () => {
      queue.registerTopic('test-topic');
      queue.registerSubscription('test-sub', 'test-topic');

      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const queueState = (queue as any).queues.get('test-sub');
      queueState.queueSize = 100;
      queueState.queueBytes = 1000;

      const message: InternalMessage = {
        id: 'msg-1',
        data: Buffer.from('test'),
        attributes: {},
        publishTime: new Date() as any,
        orderingKey: undefined,
        deliveryAttempt: 1,
        length: 100,
      };

      queue.publish('test-topic', [message]);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
