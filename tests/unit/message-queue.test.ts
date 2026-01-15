/**
 * MessageQueue unit tests.
 * Tests all 13 acceptance criteria from specs/07-message-queue.md
 */

import { test, expect, beforeEach, describe } from 'bun:test';
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
  test('AC-006: Nack causes immediate redelivery', () => {
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
    expect(pulled1[0]!.deliveryAttempt).toBe(1);

    // Nack the message
    queue.nack(pulled1[0]!.ackId!);

    // Should be available immediately with incremented delivery attempt
    const pulled2 = queue.pull('test-sub', 10);
    expect(pulled2).toHaveLength(1);
    expect(pulled2[0]!.deliveryAttempt).toBe(2);
  });

  // AC-007: Ack Deadline Expiry Redelivers
  test('AC-007: Ack deadline expiry causes redelivery', async () => {
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
    expect(pulled1).toHaveLength(1);

    // Don't ack - wait for deadline
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be available for redelivery
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
});
