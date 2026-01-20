/**
 * MessageQueue: Internal message broker (singleton).
 * Central hub for message routing, storage, and acknowledgment tracking.
 * Reference: specs/07-message-queue.md
 */

import type { InternalMessage, MessageLease } from './types';
import type { TopicMetadata } from '../types/topic';
import type { SubscriptionMetadata } from '../types/subscription';
import { NotFoundError, InvalidArgumentError, FailedPreconditionError } from '../types/errors';

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
  private ackIdCreationTimes: Map<string, number>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  private constructor() {
    this.topics = new Map();
    this.subscriptions = new Map();
    this.queues = new Map();
    this.leases = new Map();
    this.ackIdCreationTimes = new Map();
    this.startPeriodicCleanup();
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

    for (const [subName, subMeta] of this.subscriptions.entries()) {
      if (subMeta.topic === topicName) {
        const queue = this.queues.get(subName);
        if (queue) {
          for (const lease of queue.inFlight.values()) {
            if (lease.timer) {
              clearTimeout(lease.timer);
            }
          }
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

  /**
   * Register a subscription.
   */
  registerSubscription(
    subscriptionName: string,
    topicName: string,
    options?: SubscriptionMetadata
  ): void {
    const exists = this.subscriptions.has(subscriptionName);

    this.subscriptions.set(subscriptionName, {
      name: subscriptionName,
      topic: topicName,
      ...options,
    });

    if (!exists) {
      const queue: SubscriptionQueue = {
        messages: [],
        inFlight: new Map(),
        inFlightCount: 0,
        inFlightBytes: 0,
        queueSize: 0,
        queueBytes: 0,
        backoffQueue: new Map(),
      };

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
      for (const lease of queue.inFlight.values()) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
      }
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
      this.validateMessage(msg);

      const messageLength = this.calculateMessageLength(msg);

      const messageId = msg.id || crypto.randomUUID();
      messageIds.push(messageId);

      const message: InternalMessage = {
        ...msg,
        id: messageId,
        length: messageLength,
      };

      const subscriptions = this.getSubscriptionsForTopic(topicName);
      for (const sub of subscriptions) {
        const queue = this.queues.get(sub.name!);
        if (queue) {
          if (queue.queueSize >= 10000 || queue.queueBytes >= 100 * 1024 * 1024) {
            console.warn(
              `Queue capacity reached for subscription ${sub.name}: ${queue.queueSize} messages, ${queue.queueBytes} bytes`,
            );
            continue;
          }

          const msgCopy = { ...message };

          queue.queueSize++;
          queue.queueBytes += messageLength;

          if (queue.orderingQueues && message.orderingKey) {
            let orderQueue = queue.orderingQueues.get(message.orderingKey);
            if (!orderQueue) {
              orderQueue = [];
              queue.orderingQueues.set(message.orderingKey, orderQueue);
            }
            orderQueue.push(msgCopy);
          } else {
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

    while (result.length < maxMessages && queue.messages.length > 0) {
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

    if (queue.orderingQueues) {
      for (const [orderingKey, orderQueue] of queue.orderingQueues.entries()) {
        if (result.length >= maxMessages) break;

        const nextMsg = orderQueue[0];
        if (flowControl && nextMsg) {
          if (flowControl.maxMessages && queue.inFlightCount >= flowControl.maxMessages) {
            break;
          }
          if (flowControl.maxBytes && queue.inFlightBytes + nextMsg.length > flowControl.maxBytes) {
            break;
          }
        }

        if (queue.blockedOrderingKeys?.has(orderingKey)) {
          continue;
        }

        if (orderQueue.length > 0) {
          const msg = orderQueue.shift()!;
          const delivered = this.createLeaseAndDeliver(
            msg,
            subscriptionName,
            queue,
            ackDeadlineSeconds
          );
          if (delivered) {
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
    const ackId = `${msg.id}-${msg.deliveryAttempt}-${crypto.randomUUID()}`;

    const deadline = new Date(Date.now() + ackDeadlineSeconds * 1000);

    const lease: MessageLease = {
      message: msg,
      ackId,
      subscription: subscriptionName,
      deadline,
      deadlineExtensions: 0,
    };

    const timerMs = ackDeadlineSeconds * 1000;
    lease.timer = setTimeout(() => {
      this.handleDeadlineExpiry(ackId);
    }, timerMs);

    queue.inFlight.set(ackId, lease);
    this.leases.set(ackId, lease);
    this.ackIdCreationTimes.set(ackId, Date.now());

    queue.inFlightCount++;
    queue.inFlightBytes += msg.length;

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

    this.nack(ackId);
  }

  /**
   * Acknowledge a message.
   * @throws {InvalidArgumentError} If ackId is invalid or expired
   * @throws {FailedPreconditionError} If subscription no longer exists (for exactly-once delivery)
   */
  ack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) {
      throw new InvalidArgumentError(`Invalid ack ID: ${ackId}`);
    }

    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    const queue = this.queues.get(lease.subscription);
    if (!queue) {
      throw new FailedPreconditionError(`Subscription no longer exists: ${lease.subscription}`);
    }

    queue.inFlight.delete(ackId);

    queue.inFlightCount--;
    queue.inFlightBytes -= lease.message.length;

    queue.queueSize--;
    queue.queueBytes -= lease.message.length;

    if (lease.message.orderingKey && queue.blockedOrderingKeys) {
      queue.blockedOrderingKeys.delete(lease.message.orderingKey);
    }

    this.leases.delete(ackId);
    this.ackIdCreationTimes.delete(ackId);
  }

  /**
   * Negative acknowledge (return message to queue).
   * @throws {InvalidArgumentError} If ackId is invalid or expired
   * @throws {FailedPreconditionError} If subscription no longer exists
   */
  nack(ackId: string): void {
    const lease = this.leases.get(ackId);
    if (!lease) {
      throw new InvalidArgumentError(`Invalid ack ID: ${ackId}`);
    }

    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    const queue = this.queues.get(lease.subscription);
    const subscription = this.subscriptions.get(lease.subscription);
    if (!queue || !subscription) {
      throw new FailedPreconditionError(`Subscription no longer exists: ${lease.subscription}`);
    }

    queue.inFlight.delete(ackId);

    queue.inFlightCount--;
    queue.inFlightBytes -= lease.message.length;

    const msg = {
      ...lease.message,
      deliveryAttempt: lease.message.deliveryAttempt + 1,
    };

    const deadLetterPolicy = (subscription as unknown as { deadLetterPolicy?: { deadLetterTopic: string; maxDeliveryAttempts: number } }).deadLetterPolicy;
    if (deadLetterPolicy && msg.deliveryAttempt > deadLetterPolicy.maxDeliveryAttempts) {
      this.routeToDeadLetterQueue(msg, deadLetterPolicy.deadLetterTopic, queue);

      if (msg.orderingKey && queue.blockedOrderingKeys) {
        queue.blockedOrderingKeys.delete(msg.orderingKey);
      }
    } else {
      const retryPolicy = (subscription as unknown as { retryPolicy?: { minimumBackoff?: { seconds?: number }; maximumBackoff?: { seconds?: number } } }).retryPolicy;
      const backoffMs = this.calculateBackoff(lease.message.deliveryAttempt, retryPolicy);

      if (backoffMs > 0) {
        queue.backoffQueue.set(msg.id, {
          message: msg,
          availableAt: Date.now() + backoffMs,
        });

        if (msg.orderingKey && queue.blockedOrderingKeys) {
          queue.blockedOrderingKeys.delete(msg.orderingKey);
        }
      } else {
        if (queue.orderingQueues && msg.orderingKey) {
          if (queue.blockedOrderingKeys) {
            queue.blockedOrderingKeys.delete(msg.orderingKey);
          }

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
    }

    this.leases.delete(ackId);
    this.ackIdCreationTimes.delete(ackId);
  }

  /**
   * Calculate retry backoff delay (BR-015).
   * Applies default backoff (10s-600s) when no retryPolicy provided.
   */
  private calculateBackoff(
    deliveryAttempt: number,
    retryPolicy?: { minimumBackoff?: { seconds?: number }; maximumBackoff?: { seconds?: number } }
  ): number {
    const minBackoffSeconds = retryPolicy?.minimumBackoff?.seconds ?? 10;
    const maxBackoffSeconds = retryPolicy?.maximumBackoff?.seconds ?? 600;

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
      console.warn(`Dead letter topic does not exist: ${deadLetterTopic}. Message ${msg.id} will be dropped.`);
      return;
    }

    const dlqMessage: InternalMessage = {
      id: crypto.randomUUID(),
      data: msg.data,
      attributes: msg.attributes,
      publishTime: msg.publishTime,
      orderingKey: msg.orderingKey,
      deliveryAttempt: 1,
      length: msg.length,
    };

    const subscriptions = this.getSubscriptionsForTopic(deadLetterTopic);
    for (const sub of subscriptions) {
      const queue = this.queues.get(sub.name!);
      if (queue) {
        const msgCopy = { ...dlqMessage };

        queue.queueSize++;
        queue.queueBytes += dlqMessage.length;

        queue.messages.push(msgCopy);
      }
    }

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

    const queue = this.queues.get(lease.subscription);
    if (!queue) {
      throw new FailedPreconditionError(`Subscription no longer exists: ${lease.subscription}`);
    }

    if (lease.timer) {
      clearTimeout(lease.timer);
    }

    lease.deadline = new Date(Date.now() + seconds * 1000);
    lease.deadlineExtensions++;

    lease.timer = setTimeout(() => {
      this.handleDeadlineExpiry(ackId);
    }, seconds * 1000);
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.runCleanup();
      } catch (error) {
        console.error('Error during periodic cleanup:', error);
      }
    }, 60000);
    this.cleanupTimer.unref();
  }

  private runCleanup(): void {
    const now = Date.now();
    const orphanedAckIds: string[] = [];
    const expiredAckIds: string[] = [];
    const tenMinutesMs = 10 * 60 * 1000;

    for (const [ackId, lease] of this.leases.entries()) {
      const creationTime = this.ackIdCreationTimes.get(ackId);

      if (creationTime && now - creationTime > tenMinutesMs) {
        expiredAckIds.push(ackId);
      } else if (lease.deadline.getTime() < now) {
        const queue = this.queues.get(lease.subscription);
        const isOrphaned = !queue || !queue.inFlight.has(ackId);

        if (isOrphaned) {
          orphanedAckIds.push(ackId);
        }
      }
    }

    for (const ackId of expiredAckIds) {
      const lease = this.leases.get(ackId);
      if (lease) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
        const queue = this.queues.get(lease.subscription);
        if (queue) {
          queue.inFlight.delete(ackId);
          queue.inFlightCount--;
          queue.inFlightBytes -= lease.message.length;
        }
        this.leases.delete(ackId);
        this.ackIdCreationTimes.delete(ackId);
      }
    }

    for (const ackId of orphanedAckIds) {
      const lease = this.leases.get(ackId);
      if (lease) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
        this.leases.delete(ackId);
        this.ackIdCreationTimes.delete(ackId);
      }
    }

    this.cleanupExpiredMessages(now);
  }

  private cleanupExpiredMessages(now: number): void {
    for (const [subscriptionName, subscription] of this.subscriptions.entries()) {
      const retentionDuration = subscription.messageRetentionDuration ?? { seconds: 604800 };
      const retentionMs = this.durationToMilliseconds(retentionDuration);
      const expirationTime = now - retentionMs;

      const queue = this.queues.get(subscriptionName);
      if (!queue) {
        continue;
      }

      const isExpired = (message: InternalMessage): boolean => {
        const publishTimeMs = message.publishTime.getTime();
        return publishTimeMs < expirationTime;
      };

      let totalRemoved = 0;

      const beforeMessageCount = queue.messages.length;
      queue.messages = queue.messages.filter(msg => !isExpired(msg));
      totalRemoved += beforeMessageCount - queue.messages.length;

      if (queue.orderingQueues) {
        for (const [orderingKey, messages] of queue.orderingQueues.entries()) {
          const beforeLength = messages.length;
          const filtered = messages.filter(msg => !isExpired(msg));
          totalRemoved += beforeLength - filtered.length;
          if (filtered.length === 0) {
            queue.orderingQueues.delete(orderingKey);
          } else {
            queue.orderingQueues.set(orderingKey, filtered);
          }
        }
      }

      const beforeBackoffSize = queue.backoffQueue.size;
      for (const [messageId, entry] of queue.backoffQueue.entries()) {
        if (isExpired(entry.message)) {
          queue.backoffQueue.delete(messageId);
        }
      }
      totalRemoved += beforeBackoffSize - queue.backoffQueue.size;

      if (totalRemoved > 0) {
        this.updateQueueMetrics(subscriptionName);
      }
    }
  }

  private durationToMilliseconds(duration: { seconds?: number; nanos?: number } | number): number {
    if (typeof duration === 'number') {
      return duration * 1000;
    }
    const seconds = duration.seconds ?? 0;
    const nanos = duration.nanos ?? 0;
    return seconds * 1000 + nanos / 1_000_000;
  }

  private updateQueueMetrics(subscriptionName: string): void {
    const queue = this.queues.get(subscriptionName);
    if (!queue) {
      return;
    }

    let totalSize = 0;
    let totalBytes = 0;

    for (const message of queue.messages) {
      totalSize++;
      totalBytes += message.length;
    }

    if (queue.orderingQueues) {
      for (const messages of queue.orderingQueues.values()) {
        for (const message of messages) {
          totalSize++;
          totalBytes += message.length;
        }
      }
    }

    for (const entry of queue.backoffQueue.values()) {
      totalSize++;
      totalBytes += entry.message.length;
    }

    queue.queueSize = totalSize;
    queue.queueBytes = totalBytes;
  }

  /**
   * Reset the singleton instance for testing.
   * Clears all topics, subscriptions, messages, and leases.
   */
  static resetForTesting(): void {
    if (MessageQueue.instance) {
      for (const lease of MessageQueue.instance.leases.values()) {
        if (lease.timer) {
          clearTimeout(lease.timer);
        }
      }

      if (MessageQueue.instance.cleanupTimer) {
        clearInterval(MessageQueue.instance.cleanupTimer);
      }

      MessageQueue.instance.topics.clear();
      MessageQueue.instance.subscriptions.clear();
      MessageQueue.instance.leases.clear();
      MessageQueue.instance.ackIdCreationTimes.clear();
      MessageQueue.instance = null;
    }
  }
}
