/**
 * MessageQueue: Internal message broker (singleton).
 * Central hub for message routing, storage, and acknowledgment tracking.
 * Reference: specs/07-message-queue.md
 */

import { randomUUID } from 'crypto';
import type { InternalMessage, MessageLease } from './types';
import type { TopicMetadata } from '../types/topic';
import type { SubscriptionMetadata } from '../types/subscription';

interface SubscriptionQueue {
  messages: InternalMessage[];
  inFlight: Map<string, MessageLease>;
  orderingQueues?: Map<string, InternalMessage[]>;
  blockedOrderingKeys?: Set<string>;
}

/**
 * MessageQueue singleton manages all topics, subscriptions, and message routing.
 */
export class MessageQueue {
  private static instance: MessageQueue;

  private topics: Map<string, TopicMetadata>;
  private subscriptions: Map<string, SubscriptionMetadata>;
  private queues: Map<string, SubscriptionQueue>;
  private leases: Map<string, MessageLease>;

  private constructor() {
    this.topics = new Map();
    this.subscriptions = new Map();
    this.queues = new Map();
    this.leases = new Map();
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  // Topic Management

  /**
   * Register a topic.
   */
  registerTopic(topicName: string, metadata?: TopicMetadata): void {
    if (!this.topics.has(topicName)) {
      this.topics.set(topicName, {
        name: topicName,
        ...metadata,
      });
    }
  }

  /**
   * Unregister a topic and detach subscriptions.
   */
  unregisterTopic(topicName: string): void {
    this.topics.delete(topicName);

    // Clear messages from subscriptions for this topic
    for (const [subName, subMeta] of this.subscriptions.entries()) {
      if (subMeta.topic === topicName) {
        const queue = this.queues.get(subName);
        if (queue) {
          // Cancel all in-flight timers
          for (const lease of queue.inFlight.values()) {
            if (lease.timer) {
              clearTimeout(lease.timer);
            }
          }
          // Clear messages and in-flight
          queue.messages = [];
          queue.inFlight.clear();
          if (queue.orderingQueues) {
            queue.orderingQueues.clear();
          }
          if (queue.blockedOrderingKeys) {
            queue.blockedOrderingKeys.clear();
          }
        }
      }
    }
  }

  /**
   * Check if topic exists.
   */
  topicExists(topicName: string): boolean {
    return this.topics.has(topicName);
  }

  /**
   * Get topic metadata.
   */
  getTopic(topicName: string): TopicMetadata | undefined {
    return this.topics.get(topicName);
  }

  /**
   * Get all topics.
   */
  getAllTopics(): TopicMetadata[] {
    return Array.from(this.topics.values());
  }

  // Subscription Management

  /**
   * Register a subscription.
   */
  registerSubscription(
    subscriptionName: string,
    topicName: string,
    options?: SubscriptionMetadata
  ): void {
    if (!this.subscriptions.has(subscriptionName)) {
      this.subscriptions.set(subscriptionName, {
        name: subscriptionName,
        topic: topicName,
        ...options,
      });

      // Initialize queue for subscription
      const queue: SubscriptionQueue = {
        messages: [],
        inFlight: new Map(),
      };

      // Initialize ordering support if enabled
      if (options?.enableMessageOrdering) {
        queue.orderingQueues = new Map();
        queue.blockedOrderingKeys = new Set();
      }

      this.queues.set(subscriptionName, queue);
    }
  }

  /**
   * Unregister a subscription.
   */
  unregisterSubscription(subscriptionName: string): void {
    const queue = this.queues.get(subscriptionName);
    if (queue) {
      // Cancel all in-flight timers
      for (const lease of queue.inFlight.values()) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
      }
    }

    this.subscriptions.delete(subscriptionName);
    this.queues.delete(subscriptionName);
  }

  /**
   * Check if subscription exists.
   */
  subscriptionExists(subscriptionName: string): boolean {
    return this.subscriptions.has(subscriptionName);
  }

  /**
   * Get subscription metadata.
   */
  getSubscription(subscriptionName: string): SubscriptionMetadata | undefined {
    return this.subscriptions.get(subscriptionName);
  }

  /**
   * Get all subscriptions for a topic.
   */
  getSubscriptionsForTopic(topicName: string): SubscriptionMetadata[] {
    const result: SubscriptionMetadata[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.topic === topicName) {
        result.push(sub);
      }
    }
    return result;
  }

  /**
   * Get all subscriptions.
   */
  getAllSubscriptions(): SubscriptionMetadata[] {
    return Array.from(this.subscriptions.values());
  }

  // Message Operations

  /**
   * Publish messages to a topic.
   */
  publish(topicName: string, messages: InternalMessage[]): string[] {
    const messageIds: string[] = [];

    for (const msg of messages) {
      // Generate unique message ID
      const messageId = msg.id || randomUUID();
      messageIds.push(messageId);

      // Create message with ID
      const message: InternalMessage = {
        ...msg,
        id: messageId,
      };

      // Copy message to each subscription
      const subscriptions = this.getSubscriptionsForTopic(topicName);
      for (const sub of subscriptions) {
        const queue = this.queues.get(sub.name!);
        if (queue) {
          // Copy message for this subscription
          const msgCopy = { ...message };

          // Add to appropriate queue
          if (queue.orderingQueues && message.orderingKey) {
            // Add to ordering queue
            let orderQueue = queue.orderingQueues.get(message.orderingKey);
            if (!orderQueue) {
              orderQueue = [];
              queue.orderingQueues.set(message.orderingKey, orderQueue);
            }
            orderQueue.push(msgCopy);
          } else {
            // Add to main queue
            queue.messages.push(msgCopy);
          }
        }
      }
    }

    return messageIds;
  }

  /**
   * Pull messages from a subscription.
   */
  pull(subscriptionName: string, maxMessages: number): InternalMessage[] {
    const queue = this.queues.get(subscriptionName);
    if (!queue) {
      return [];
    }

    const subscription = this.subscriptions.get(subscriptionName);
    if (!subscription) {
      return [];
    }

    const result: InternalMessage[] = [];
    const ackDeadlineSeconds = subscription.ackDeadlineSeconds || 60;

    // Pull from main queue first
    while (result.length < maxMessages && queue.messages.length > 0) {
      const msg = queue.messages.shift()!;
      const delivered = this.createLeaseAndDeliver(
        msg,
        subscriptionName,
        queue,
        ackDeadlineSeconds
      );
      if (delivered) {
        result.push(delivered);
      }
    }

    // Pull from ordering queues if enabled
    if (queue.orderingQueues) {
      for (const [orderingKey, orderQueue] of queue.orderingQueues.entries()) {
        if (result.length >= maxMessages) break;

        // Skip if this ordering key is blocked
        if (queue.blockedOrderingKeys?.has(orderingKey)) {
          continue;
        }

        // Only deliver one message per ordering key at a time
        if (orderQueue.length > 0) {
          const msg = orderQueue.shift()!;
          const delivered = this.createLeaseAndDeliver(
            msg,
            subscriptionName,
            queue,
            ackDeadlineSeconds
          );
          if (delivered) {
            // Block this ordering key until message is acked
            queue.blockedOrderingKeys?.add(orderingKey);
            result.push(delivered);
          }
        }
      }
    }

    return result;
  }

  /**
   * Create lease and prepare message for delivery.
   */
  private createLeaseAndDeliver(
    msg: InternalMessage,
    subscriptionName: string,
    queue: SubscriptionQueue,
    ackDeadlineSeconds: number
  ): InternalMessage | null {
    // Generate unique ackId
    const ackId = `${msg.id}-${msg.deliveryAttempt}-${randomUUID()}`;

    // Create deadline
    const deadline = new Date(Date.now() + ackDeadlineSeconds * 1000);

    // Create lease
    const lease: MessageLease = {
      message: msg,
      ackId,
      subscription: subscriptionName,
      deadline,
      deadlineExtensions: 0,
    };

    // Start deadline timer
    lease.timer = setTimeout(() => {
      this.handleDeadlineExpiry(ackId);
    }, ackDeadlineSeconds * 1000);

    // Store lease
    queue.inFlight.set(ackId, lease);
    this.leases.set(ackId, lease);

    // Return message with ackId
    return {
      ...msg,
      ackId,
    };
  }

  /**
   * Handle ack deadline expiry.
   */
  private handleDeadlineExpiry(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) return;

    // Nack the message (returns to queue)
    this.nack(ackId);
  }

  /**
   * Acknowledge a message.
   */
  ack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) return;

    // Cancel timer
    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    // Remove from in-flight
    const queue = this.queues.get(lease.subscription);
    if (queue) {
      queue.inFlight.delete(ackId);

      // Unblock ordering key if this was an ordered message
      if (lease.message.orderingKey && queue.blockedOrderingKeys) {
        queue.blockedOrderingKeys.delete(lease.message.orderingKey);
      }
    }

    // Remove lease
    this.leases.delete(ackId);
  }

  /**
   * Negative acknowledge (return message to queue).
   */
  nack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) return;

    // Cancel timer
    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    // Remove from in-flight
    const queue = this.queues.get(lease.subscription);
    if (queue) {
      queue.inFlight.delete(ackId);

      // Increment delivery attempt
      const msg = {
        ...lease.message,
        deliveryAttempt: lease.message.deliveryAttempt + 1,
      };

      // Return to appropriate queue
      if (queue.orderingQueues && msg.orderingKey) {
        // Unblock ordering key
        if (queue.blockedOrderingKeys) {
          queue.blockedOrderingKeys.delete(msg.orderingKey);
        }

        // Add back to front of ordering queue
        let orderQueue = queue.orderingQueues.get(msg.orderingKey);
        if (!orderQueue) {
          orderQueue = [];
          queue.orderingQueues.set(msg.orderingKey, orderQueue);
        }
        orderQueue.unshift(msg);
      } else {
        // Add back to front of main queue
        queue.messages.unshift(msg);
      }
    }

    // Remove lease
    this.leases.delete(ackId);
  }

  /**
   * Modify ack deadline for a message.
   */
  modifyAckDeadline(ackId: string, seconds: number): void {
    const lease = this.leases.get(ackId);
    if (!lease) return;

    // Cancel existing timer
    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    // Update deadline
    lease.deadline = new Date(Date.now() + seconds * 1000);
    lease.deadlineExtensions++;

    // Start new timer
    lease.timer = setTimeout(() => {
      this.handleDeadlineExpiry(ackId);
    }, seconds * 1000);
  }
}
