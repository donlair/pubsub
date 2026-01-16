/**
 * MessageQueue: Internal message broker (singleton).
 * Central hub for message routing, storage, and acknowledgment tracking.
 * Reference: specs/07-message-queue.md
 */

import type { InternalMessage, MessageLease } from './types';
import type { TopicMetadata } from '../types/topic';
import type { SubscriptionMetadata } from '../types/subscription';
import { NotFoundError, InvalidArgumentError } from '../types/errors';

interface SubscriptionQueue {
  messages: InternalMessage[];
  inFlight: Map<string, MessageLease>;
  orderingQueues?: Map<string, InternalMessage[]>;
  blockedOrderingKeys?: Set<string>;
  inFlightCount: number;
  inFlightBytes: number;
  queueSize: number;
  queueBytes: number;
  backoffQueue: Map<string, { message: InternalMessage; availableAt: number }>;
}

/**
 * MessageQueue singleton manages all topics, subscriptions, and message routing.
 */
export class MessageQueue {
  private static instance: MessageQueue | null;

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
          queue.backoffQueue.clear();
          queue.inFlightCount = 0;
          queue.inFlightBytes = 0;
          queue.queueSize = 0;
          queue.queueBytes = 0;
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
        inFlightCount: 0,
        inFlightBytes: 0,
        queueSize: 0,
        queueBytes: 0,
        backoffQueue: new Map(),
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
      // Clear backoff queue
      queue.backoffQueue.clear();
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
   * @throws {NotFoundError} If topic does not exist
   * @throws {InvalidArgumentError} If message validation fails (BR-017)
   */
  publish(topicName: string, messages: InternalMessage[]): string[] {
    if (!this.topics.has(topicName)) {
      throw new NotFoundError(topicName, 'Topic');
    }

    const messageIds: string[] = [];

    for (const msg of messages) {
      // BR-017: Message size validation
      this.validateMessage(msg);

      // Calculate message length
      const messageLength = this.calculateMessageLength(msg);

      // Generate unique message ID
      const messageId = msg.id || crypto.randomUUID();
      messageIds.push(messageId);

      // Create message with ID and length
      const message: InternalMessage = {
        ...msg,
        id: messageId,
        length: messageLength,
      };

      // Copy message to each subscription
      const subscriptions = this.getSubscriptionsForTopic(topicName);
      for (const sub of subscriptions) {
        const queue = this.queues.get(sub.name!);
        if (queue) {
          // BR-022: Check queue size limits (10,000 messages or 100MB)
          if (queue.queueSize >= 10000 || queue.queueBytes >= 100 * 1024 * 1024) {
            continue;
          }

          // Copy message for this subscription
          const msgCopy = { ...message };

          // Update queue metrics
          queue.queueSize++;
          queue.queueBytes += messageLength;

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
   * Validate message size and attributes (BR-017).
   */
  private validateMessage(msg: InternalMessage): void {
    const messageLength = this.calculateMessageLength(msg);
    const maxMessageSize = 10 * 1024 * 1024;

    if (messageLength > maxMessageSize) {
      throw new InvalidArgumentError('Message size exceeds 10MB limit');
    }

    for (const [key, value] of Object.entries(msg.attributes)) {
      if (!key || key.length === 0) {
        throw new InvalidArgumentError('Attribute keys must be non-empty');
      }

      const keyBytes = Buffer.byteLength(key, 'utf8');
      if (keyBytes > 256) {
        throw new InvalidArgumentError('Attribute key exceeds 256 bytes');
      }

      const valueBytes = Buffer.byteLength(String(value), 'utf8');
      if (valueBytes > 1024) {
        throw new InvalidArgumentError('Attribute value exceeds 1024 bytes');
      }

      if (key.startsWith('goog') || key.startsWith('googclient_')) {
        throw new InvalidArgumentError('Attribute keys cannot start with reserved prefix');
      }
    }
  }

  /**
   * Calculate total message size including data and attributes.
   */
  private calculateMessageLength(msg: InternalMessage): number {
    let total = msg.data.length;

    for (const [key, value] of Object.entries(msg.attributes)) {
      total += Buffer.byteLength(key, 'utf8');
      total += Buffer.byteLength(String(value), 'utf8');
    }

    return total;
  }

  /**
   * Pull messages from a subscription.
   * @throws {NotFoundError} If subscription does not exist
   */
  pull(subscriptionName: string, maxMessages: number): InternalMessage[] {
    if (!this.subscriptions.has(subscriptionName)) {
      throw new NotFoundError(subscriptionName, 'Subscription');
    }

    const queue = this.queues.get(subscriptionName);
    if (!queue) {
      return [];
    }

    const subscription = this.subscriptions.get(subscriptionName);
    if (!subscription) {
      return [];
    }

    // BR-013: Flow control enforcement
    const flowControl = (subscription as unknown as { flowControl?: { maxMessages?: number; maxBytes?: number } }).flowControl;
    if (flowControl) {
      if (flowControl.maxMessages && queue.inFlightCount >= flowControl.maxMessages) {
        return [];
      }
      if (flowControl.maxBytes && queue.inFlightBytes >= flowControl.maxBytes) {
        return [];
      }
    }

    const result: InternalMessage[] = [];
    const ackDeadlineSeconds = subscription.ackDeadlineSeconds || 10;

    // BR-015: Process backoff queue first
    const now = Date.now();
    const readyMessages: InternalMessage[] = [];
    for (const [msgId, backoffEntry] of queue.backoffQueue.entries()) {
      if (backoffEntry.availableAt <= now) {
        readyMessages.push(backoffEntry.message);
        queue.backoffQueue.delete(msgId);
      }
    }

    for (const msg of readyMessages) {
      if (msg.orderingKey && queue.orderingQueues) {
        let orderQueue = queue.orderingQueues.get(msg.orderingKey);
        if (!orderQueue) {
          orderQueue = [];
          queue.orderingQueues.set(msg.orderingKey, orderQueue);
        }
        orderQueue.unshift(msg);
      } else {
        queue.messages.unshift(msg);
      }
    }

    // Pull from main queue first
    while (result.length < maxMessages && queue.messages.length > 0) {
      // BR-013: Check flow control before pulling
      const nextMsg = queue.messages[0];
      if (flowControl) {
        if (flowControl.maxMessages && queue.inFlightCount >= flowControl.maxMessages) {
          break;
        }
        if (flowControl.maxBytes && queue.inFlightBytes + nextMsg!.length > flowControl.maxBytes) {
          break;
        }
      }

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

        // BR-013: Check flow control
        const nextMsg = orderQueue[0];
        if (flowControl && nextMsg) {
          if (flowControl.maxMessages && queue.inFlightCount >= flowControl.maxMessages) {
            break;
          }
          if (flowControl.maxBytes && queue.inFlightBytes + nextMsg.length > flowControl.maxBytes) {
            break;
          }
        }

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
    const ackId = `${msg.id}-${msg.deliveryAttempt}-${crypto.randomUUID()}`;

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
    const timerMs = ackDeadlineSeconds * 1000;
    lease.timer = setTimeout(() => {
      this.handleDeadlineExpiry(ackId);
    }, timerMs);

    // Store lease
    queue.inFlight.set(ackId, lease);
    this.leases.set(ackId, lease);

    // BR-014: Update in-flight metrics
    queue.inFlightCount++;
    queue.inFlightBytes += msg.length;

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
    if (!lease) {
      return;
    }

    // Nack the message (returns to queue)
    this.nack(ackId);
  }

  /**
   * Acknowledge a message.
   * @throws {InvalidArgumentError} If ackId is invalid or expired
   */
  ack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) {
      throw new InvalidArgumentError(`Invalid ack ID: ${ackId}`);
    }

    // Cancel timer
    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    // Remove from in-flight
    const queue = this.queues.get(lease.subscription);
    if (queue) {
      queue.inFlight.delete(ackId);

      // BR-014: Update in-flight metrics
      queue.inFlightCount--;
      queue.inFlightBytes -= lease.message.length;

      // BR-022: Update queue metrics
      queue.queueSize--;
      queue.queueBytes -= lease.message.length;

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
   * @throws {InvalidArgumentError} If ackId is invalid or expired
   */
  nack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) {
      throw new InvalidArgumentError(`Invalid ack ID: ${ackId}`);
    }

    // Cancel timer
    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    // Remove from in-flight
    const queue = this.queues.get(lease.subscription);
    const subscription = this.subscriptions.get(lease.subscription);
    if (queue && subscription) {
      queue.inFlight.delete(ackId);

      // BR-014: Update in-flight metrics
      queue.inFlightCount--;
      queue.inFlightBytes -= lease.message.length;

      // Increment delivery attempt
      const msg = {
        ...lease.message,
        deliveryAttempt: lease.message.deliveryAttempt + 1,
      };

      // BR-016: Check for dead letter queue routing
      const deadLetterPolicy = (subscription as unknown as { deadLetterPolicy?: { deadLetterTopic: string; maxDeliveryAttempts: number } }).deadLetterPolicy;
      if (deadLetterPolicy && msg.deliveryAttempt > deadLetterPolicy.maxDeliveryAttempts) {
        // Route to dead letter queue
        this.routeToDeadLetterQueue(msg, deadLetterPolicy.deadLetterTopic, queue);

        // Unblock ordering key if needed
        if (msg.orderingKey && queue.blockedOrderingKeys) {
          queue.blockedOrderingKeys.delete(msg.orderingKey);
        }
      } else {
        // BR-015: Apply retry backoff (use original deliveryAttempt before increment)
        const retryPolicy = (subscription as unknown as { retryPolicy?: { minimumBackoff?: { seconds?: number }; maximumBackoff?: { seconds?: number } } }).retryPolicy;
        const backoffMs = this.calculateBackoff(lease.message.deliveryAttempt, retryPolicy);

        if (backoffMs > 0) {
          // Add to backoff queue
          queue.backoffQueue.set(msg.id, {
            message: msg,
            availableAt: Date.now() + backoffMs,
          });

          // Unblock ordering key if needed
          if (msg.orderingKey && queue.blockedOrderingKeys) {
            queue.blockedOrderingKeys.delete(msg.orderingKey);
          }
        } else {
          // Return to appropriate queue immediately
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
      }
    }

    // Remove lease
    this.leases.delete(ackId);
  }

  /**
   * Calculate retry backoff delay (BR-015).
   */
  private calculateBackoff(
    deliveryAttempt: number,
    retryPolicy?: { minimumBackoff?: { seconds?: number }; maximumBackoff?: { seconds?: number } }
  ): number {
    if (!retryPolicy) {
      return 0;
    }

    const minBackoffSeconds = retryPolicy.minimumBackoff?.seconds || 10;
    const maxBackoffSeconds = retryPolicy.maximumBackoff?.seconds || 600;

    const backoffSeconds = Math.min(
      minBackoffSeconds * 2 ** (deliveryAttempt - 1),
      maxBackoffSeconds
    );

    return backoffSeconds * 1000;
  }

  /**
   * Route message to dead letter queue (BR-016).
   */
  private routeToDeadLetterQueue(
    msg: InternalMessage,
    deadLetterTopic: string,
    originalQueue: SubscriptionQueue
  ): void {
    if (!this.topics.has(deadLetterTopic)) {
      return;
    }

    // Create copy of message preserving original metadata
    const dlqMessage: InternalMessage = {
      id: crypto.randomUUID(),
      data: msg.data,
      attributes: msg.attributes,
      publishTime: msg.publishTime,
      orderingKey: msg.orderingKey,
      deliveryAttempt: 1,
      length: msg.length,
    };

    // Publish to DLQ
    const subscriptions = this.getSubscriptionsForTopic(deadLetterTopic);
    for (const sub of subscriptions) {
      const queue = this.queues.get(sub.name!);
      if (queue) {
        const msgCopy = { ...dlqMessage };

        // Update queue metrics
        queue.queueSize++;
        queue.queueBytes += dlqMessage.length;

        queue.messages.push(msgCopy);
      }
    }

    // BR-022: Update original queue metrics
    originalQueue.queueSize--;
    originalQueue.queueBytes -= msg.length;
  }

  /**
   * Modify ack deadline for a message.
   * @throws {InvalidArgumentError} If ackId is invalid or expired
   */
  modifyAckDeadline(ackId: string, seconds: number): void {
    const lease = this.leases.get(ackId);
    if (!lease) {
      throw new InvalidArgumentError(`Invalid ack ID: ${ackId}`);
    }

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

  /**
   * Reset the singleton instance for testing.
   * Clears all topics, subscriptions, messages, and leases.
   */
  static resetForTesting(): void {
    if (MessageQueue.instance) {
      // Clear all timers
      for (const lease of MessageQueue.instance.leases.values()) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
      }

      // Clear all data
      MessageQueue.instance.topics.clear();
      MessageQueue.instance.subscriptions.clear();
      MessageQueue.instance.leases.clear();
      MessageQueue.instance = null;
    }
  }
}
