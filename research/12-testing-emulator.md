# Testing and Emulator Documentation

## Overview

This guide covers testing strategies for Google Cloud Pub/Sub applications, including emulator setup, testing patterns, mocking strategies, and best practices for unit and integration testing.

## Table of Contents

1. [Emulator Setup](#emulator-setup)
2. [Environment Configuration](#environment-configuration)
3. [Connecting Clients to Emulator](#connecting-clients-to-emulator)
4. [Testing Patterns](#testing-patterns)
5. [Mocking Strategies](#mocking-strategies)
6. [Testing Tools](#testing-tools)
7. [Test Assertions and Patterns](#test-assertions-and-patterns)
8. [Best Practices](#best-practices)

---

## Emulator Setup

### Installation with gcloud

The Pub/Sub emulator is part of the Google Cloud SDK and can be installed via the `gcloud` CLI.

#### Prerequisites

```bash
# Install Google Cloud SDK (if not already installed)
# For macOS
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# For other platforms, visit: https://cloud.google.com/sdk/docs/install
```

#### Install Pub/Sub Emulator Component

```bash
# Install the emulator component
gcloud components install pubsub-emulator

# Update components (if already installed)
gcloud components update

# Verify installation
gcloud components list | grep pubsub-emulator
```

#### Install Beta Commands (Optional)

```bash
# Some emulator features require beta commands
gcloud components install beta
```

### Starting the Emulator

#### Basic Startup

```bash
# Start emulator on default port (8085)
gcloud beta emulators pubsub start

# Start on custom port
gcloud beta emulators pubsub start --port=8086

# Start with custom host binding
gcloud beta emulators pubsub start --host-port=localhost:8085
```

#### Get Environment Variables

```bash
# Export environment variables for current shell
$(gcloud beta emulators pubsub env-init)

# View environment variables without exporting
gcloud beta emulators pubsub env-init

# Output example:
# export PUBSUB_EMULATOR_HOST=localhost:8085
```

#### Background Process Management

```bash
# Start emulator in background
gcloud beta emulators pubsub start --port=8085 > emulator.log 2>&1 &

# Save PID for later shutdown
echo $! > emulator.pid

# Stop emulator later
kill $(cat emulator.pid)
```

#### Docker-based Emulator

```bash
# Pull official emulator image
docker pull gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators

# Run emulator in Docker
docker run -d \
  --name pubsub-emulator \
  -p 8085:8085 \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators \
  gcloud beta emulators pubsub start \
  --host-port=0.0.0.0:8085

# Stop Docker emulator
docker stop pubsub-emulator
docker rm pubsub-emulator
```

#### Using Testcontainers (for integration tests)

```typescript
import { GenericContainer, Wait } from 'testcontainers';

async function startPubSubEmulator() {
  const container = await new GenericContainer(
    'gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators'
  )
    .withExposedPorts(8085)
    .withCommand([
      'gcloud',
      'beta',
      'emulators',
      'pubsub',
      'start',
      '--host-port=0.0.0.0:8085',
    ])
    .withWaitStrategy(Wait.forLogMessage(/Server started/))
    .start();

  const emulatorHost = `${container.getHost()}:${container.getMappedPort(8085)}`;
  process.env.PUBSUB_EMULATOR_HOST = emulatorHost;

  return container;
}
```

---

## Environment Configuration

### PUBSUB_EMULATOR_HOST Environment Variable

The `PUBSUB_EMULATOR_HOST` environment variable tells Pub/Sub client libraries to connect to the local emulator instead of the production service.

#### Setting the Variable

```bash
# Linux/macOS
export PUBSUB_EMULATOR_HOST=localhost:8085

# Windows Command Prompt
set PUBSUB_EMULATOR_HOST=localhost:8085

# Windows PowerShell
$env:PUBSUB_EMULATOR_HOST="localhost:8085"
```

#### Verification

```bash
# Check if variable is set
echo $PUBSUB_EMULATOR_HOST

# Test connection (should return empty list if emulator is running)
curl http://localhost:8085/v1/projects/test-project/topics
```

#### In Test Scripts

```typescript
// Set before importing Pub/Sub client
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

// Import after setting environment
import { PubSub } from '@google-cloud/pubsub';
```

#### Using .env Files

```bash
# .env.test
PUBSUB_EMULATOR_HOST=localhost:8085
PUBSUB_PROJECT_ID=test-project
```

```typescript
// In test setup (Bun automatically loads .env files)
// For other runtimes, use dotenv
import { config } from 'dotenv';
config({ path: '.env.test' });
```

---

## Connecting Clients to Emulator

### Node.js Client Library

#### Basic Connection

```typescript
import { PubSub } from '@google-cloud/pubsub';

// Set emulator host before creating client
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

// Create client (credentials not needed for emulator)
const pubsub = new PubSub({
  projectId: 'test-project',
});

// Client will automatically connect to emulator
```

#### Explicit Configuration

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: 'test-project',
  apiEndpoint: 'localhost:8085',
  // Disable SSL for emulator
  sslCreds: undefined,
});
```

#### Connection Helper

```typescript
export function createEmulatorClient(projectId = 'test-project'): PubSub {
  const emulatorHost = process.env.PUBSUB_EMULATOR_HOST || 'localhost:8085';

  return new PubSub({
    projectId,
    apiEndpoint: emulatorHost,
  });
}

// Usage
const pubsub = createEmulatorClient();
```

### Python Client Library

```python
import os
from google.cloud import pubsub_v1

# Set emulator host
os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8085'

# Create clients
publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()

# Use clients normally
project_id = 'test-project'
topic_path = publisher.topic_path(project_id, 'test-topic')
```

### Go Client Library

```go
package main

import (
    "context"
    "os"

    "cloud.google.com/go/pubsub"
)

func main() {
    // Set emulator host
    os.Setenv("PUBSUB_EMULATOR_HOST", "localhost:8085")

    ctx := context.Background()

    // Create client (credentials not needed)
    client, err := pubsub.NewClient(ctx, "test-project")
    if err != nil {
        panic(err)
    }
    defer client.Close()

    // Use client normally
}
```

### Java Client Library

```java
import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.TransportChannelProvider;
import com.google.cloud.pubsub.v1.*;
import io.grpc.ManagedChannelBuilder;

public class EmulatorClient {
    public static Publisher createPublisher(String projectId, String topicId) {
        String emulatorHost = System.getenv("PUBSUB_EMULATOR_HOST");
        if (emulatorHost == null) {
            emulatorHost = "localhost:8085";
        }

        TransportChannelProvider channelProvider =
            GrpcTransportChannel.newBuilder()
                .setManagedChannel(
                    ManagedChannelBuilder
                        .forTarget(emulatorHost)
                        .usePlaintext()
                        .build())
                .build();

        TopicName topicName = TopicName.of(projectId, topicId);

        return Publisher.newBuilder(topicName)
            .setChannelProvider(channelProvider)
            .setCredentialsProvider(NoCredentialsProvider.create())
            .build();
    }
}
```

---

## Testing Patterns

### Unit Testing Publishers

#### Basic Publisher Test

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PubSub, Topic } from '@google-cloud/pubsub';

describe('Publisher Tests', () => {
  let pubsub: PubSub;
  let topic: Topic;

  beforeAll(async () => {
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    pubsub = new PubSub({ projectId: 'test-project' });

    // Create topic
    [topic] = await pubsub.createTopic('test-topic');
  });

  afterAll(async () => {
    await topic.delete();
    await pubsub.close();
  });

  test('should publish message successfully', async () => {
    const data = { message: 'Hello, World!' };
    const dataBuffer = Buffer.from(JSON.stringify(data));

    const messageId = await topic.publishMessage({ data: dataBuffer });

    expect(messageId).toBeDefined();
    expect(typeof messageId).toBe('string');
  });

  test('should publish message with attributes', async () => {
    const data = Buffer.from('test data');
    const attributes = {
      origin: 'test',
      priority: 'high',
    };

    const messageId = await topic.publishMessage({
      data,
      attributes
    });

    expect(messageId).toBeDefined();
  });

  test('should publish batch of messages', async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      data: Buffer.from(`Message ${i}`),
      attributes: { index: i.toString() },
    }));

    const messageIds = await Promise.all(
      messages.map(msg => topic.publishMessage(msg))
    );

    expect(messageIds).toHaveLength(10);
    messageIds.forEach(id => expect(id).toBeDefined());
  });
});
```

#### Testing Publisher Error Handling

```typescript
import { describe, test, expect } from 'bun:test';
import { PubSub } from '@google-cloud/pubsub';

describe('Publisher Error Handling', () => {
  test('should handle non-existent topic', async () => {
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    const pubsub = new PubSub({ projectId: 'test-project' });
    const topic = pubsub.topic('non-existent-topic');

    await expect(
      topic.publishMessage({ data: Buffer.from('test') })
    ).rejects.toThrow();
  });

  test('should handle oversized messages', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });
    const [topic] = await pubsub.createTopic('test-topic');

    // Pub/Sub max message size is 10 MB
    const largeData = Buffer.alloc(11 * 1024 * 1024);

    await expect(
      topic.publishMessage({ data: largeData })
    ).rejects.toThrow();

    await topic.delete();
  });

  test('should retry on transient failures', async () => {
    const pubsub = new PubSub({
      projectId: 'test-project',
      // Configure retry settings
      publishOptions: {
        gaxOpts: {
          retry: {
            retryCodes: [10, 14], // ABORTED, UNAVAILABLE
            backoffSettings: {
              initialRetryDelayMillis: 100,
              retryDelayMultiplier: 1.3,
              maxRetryDelayMillis: 60000,
              initialRpcTimeoutMillis: 5000,
              rpcTimeoutMultiplier: 1.0,
              maxRpcTimeoutMillis: 600000,
              totalTimeoutMillis: 600000,
            },
          },
        },
      },
    });

    // Test implementation...
  });
});
```

### Unit Testing Subscribers

#### Basic Subscriber Test

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PubSub, Topic, Subscription } from '@google-cloud/pubsub';

describe('Subscriber Tests', () => {
  let pubsub: PubSub;
  let topic: Topic;
  let subscription: Subscription;

  beforeAll(async () => {
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    pubsub = new PubSub({ projectId: 'test-project' });

    [topic] = await pubsub.createTopic('test-topic');
    [subscription] = await topic.createSubscription('test-subscription');
  });

  afterAll(async () => {
    await subscription.delete();
    await topic.delete();
    await pubsub.close();
  });

  test('should receive published message', async () => {
    const testData = { value: 'test-message' };
    const messagePromise = new Promise((resolve) => {
      const messageHandler = (message: any) => {
        resolve(message);
        message.ack();
        subscription.removeListener('message', messageHandler);
      };
      subscription.on('message', messageHandler);
    });

    // Publish message
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify(testData))
    });

    // Wait for message
    const message: any = await messagePromise;

    expect(message.data.toString()).toBe(JSON.stringify(testData));
  });

  test('should receive message attributes', async () => {
    const attributes = { type: 'test', priority: 'high' };

    const messagePromise = new Promise((resolve) => {
      const messageHandler = (message: any) => {
        resolve(message);
        message.ack();
        subscription.removeListener('message', messageHandler);
      };
      subscription.on('message', messageHandler);
    });

    await topic.publishMessage({
      data: Buffer.from('test'),
      attributes
    });

    const message: any = await messagePromise;

    expect(message.attributes).toMatchObject(attributes);
  });

  test('should handle message acknowledgment', async () => {
    const messagePromise = new Promise<void>((resolve) => {
      const messageHandler = (message: any) => {
        message.ack();
        resolve();
        subscription.removeListener('message', messageHandler);
      };
      subscription.on('message', messageHandler);
    });

    await topic.publishMessage({ data: Buffer.from('test') });
    await messagePromise;

    // Verify no redelivery after ack
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Message should not be redelivered
  });

  test('should handle message nack and redelivery', async () => {
    let deliveryCount = 0;
    const messagePromise = new Promise<void>((resolve) => {
      const messageHandler = (message: any) => {
        deliveryCount++;

        if (deliveryCount === 1) {
          message.nack(); // Reject first delivery
        } else {
          message.ack(); // Accept second delivery
          resolve();
          subscription.removeListener('message', messageHandler);
        }
      };
      subscription.on('message', messageHandler);
    });

    await topic.publishMessage({ data: Buffer.from('test') });
    await messagePromise;

    expect(deliveryCount).toBe(2);
  });
});
```

#### Testing Subscriber with Timeout

```typescript
import { describe, test, expect } from 'bun:test';

describe('Subscriber Timeout Tests', () => {
  test('should timeout if no message received', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });
    const [topic] = await pubsub.createTopic('test-topic');
    const [subscription] = await topic.createSubscription('test-sub');

    const waitForMessage = (timeout: number) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          subscription.removeAllListeners('message');
          reject(new Error('Timeout waiting for message'));
        }, timeout);

        subscription.on('message', (message) => {
          clearTimeout(timer);
          message.ack();
          resolve(message);
        });
      });
    };

    await expect(waitForMessage(1000)).rejects.toThrow('Timeout');

    await subscription.delete();
    await topic.delete();
  });
});
```

### Integration Testing

#### End-to-End Flow Test

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PubSub } from '@google-cloud/pubsub';

describe('E2E Integration Tests', () => {
  let pubsub: PubSub;

  beforeAll(() => {
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    pubsub = new PubSub({ projectId: 'test-project' });
  });

  afterAll(async () => {
    await pubsub.close();
  });

  test('complete publish-subscribe workflow', async () => {
    // Setup
    const [topic] = await pubsub.createTopic('integration-topic');
    const [subscription] = await topic.createSubscription('integration-sub');

    // Prepare message tracking
    const receivedMessages: any[] = [];
    const expectedCount = 5;

    // Setup subscriber
    const receivePromise = new Promise<void>((resolve) => {
      subscription.on('message', (message) => {
        receivedMessages.push({
          data: message.data.toString(),
          attributes: message.attributes,
        });
        message.ack();

        if (receivedMessages.length === expectedCount) {
          resolve();
        }
      });
    });

    // Publish messages
    const publishPromises = Array.from({ length: expectedCount }, (_, i) =>
      topic.publishMessage({
        data: Buffer.from(`Message ${i}`),
        attributes: { index: i.toString() },
      })
    );

    await Promise.all(publishPromises);

    // Wait for all messages to be received
    await receivePromise;

    // Assertions
    expect(receivedMessages).toHaveLength(expectedCount);
    receivedMessages.forEach((msg, i) => {
      expect(msg.data).toContain('Message');
      expect(msg.attributes.index).toBeDefined();
    });

    // Cleanup
    await subscription.delete();
    await topic.delete();
  });

  test('message ordering with ordering key', async () => {
    const [topic] = await pubsub.createTopic('ordered-topic', {
      messageStoragePolicy: { allowedPersistenceRegions: ['us-central1'] },
    });

    const [subscription] = await topic.createSubscription('ordered-sub', {
      enableMessageOrdering: true,
    });

    const receivedMessages: string[] = [];
    const orderingKey = 'user-123';
    const messageCount = 10;

    const receivePromise = new Promise<void>((resolve) => {
      subscription.on('message', (message) => {
        receivedMessages.push(message.data.toString());
        message.ack();

        if (receivedMessages.length === messageCount) {
          resolve();
        }
      });
    });

    // Publish ordered messages
    for (let i = 0; i < messageCount; i++) {
      await topic.publishMessage({
        data: Buffer.from(`${i}`),
        orderingKey,
      });
    }

    await receivePromise;

    // Verify ordering
    expect(receivedMessages).toEqual(
      Array.from({ length: messageCount }, (_, i) => `${i}`)
    );

    await subscription.delete();
    await topic.delete();
  });
});
```

#### Testing Dead Letter Topics

```typescript
import { describe, test, expect } from 'bun:test';
import { PubSub } from '@google-cloud/pubsub';

describe('Dead Letter Topic Tests', () => {
  test('should move messages to dead letter topic after max retries', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });

    // Create main and dead letter topics
    const [mainTopic] = await pubsub.createTopic('main-topic');
    const [deadLetterTopic] = await pubsub.createTopic('dead-letter-topic');

    // Create subscription with dead letter policy
    const [subscription] = await mainTopic.createSubscription('main-sub', {
      deadLetterPolicy: {
        deadLetterTopic: deadLetterTopic.name,
        maxDeliveryAttempts: 5,
      },
      ackDeadlineSeconds: 10,
    });

    // Create dead letter subscription
    const [dlSubscription] = await deadLetterTopic.createSubscription('dl-sub');

    // Track delivery attempts
    let deliveryCount = 0;

    // Setup main subscription to always nack
    subscription.on('message', (message) => {
      deliveryCount++;
      message.nack(); // Always reject
    });

    // Setup dead letter subscription
    const dlPromise = new Promise((resolve) => {
      dlSubscription.on('message', (message) => {
        resolve(message);
        message.ack();
      });
    });

    // Publish message
    await mainTopic.publishMessage({ data: Buffer.from('test') });

    // Wait for message to appear in dead letter topic
    const dlMessage: any = await dlPromise;

    expect(dlMessage).toBeDefined();
    expect(deliveryCount).toBe(5);

    // Cleanup
    await subscription.delete();
    await dlSubscription.delete();
    await mainTopic.delete();
    await deadLetterTopic.delete();
  });
});
```

---

## Mocking Strategies

### Mock Pub/Sub Client

#### Simple Mock Implementation

```typescript
import { describe, test, expect, mock } from 'bun:test';

interface MockMessage {
  data: Buffer;
  attributes?: Record<string, string>;
  orderingKey?: string;
}

class MockTopic {
  private messages: MockMessage[] = [];
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  async publishMessage(message: MockMessage): Promise<string> {
    this.messages.push(message);
    return `mock-message-id-${Date.now()}`;
  }

  getMessages(): MockMessage[] {
    return this.messages;
  }

  clearMessages(): void {
    this.messages = [];
  }
}

class MockSubscription {
  private handlers: Map<string, Function[]> = new Map();
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  on(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

class MockPubSub {
  private topics: Map<string, MockTopic> = new Map();
  private subscriptions: Map<string, MockSubscription> = new Map();

  topic(name: string): MockTopic {
    if (!this.topics.has(name)) {
      this.topics.set(name, new MockTopic(name));
    }
    return this.topics.get(name)!;
  }

  subscription(name: string): MockSubscription {
    if (!this.subscriptions.has(name)) {
      this.subscriptions.set(name, new MockSubscription(name));
    }
    return this.subscriptions.get(name)!;
  }

  async createTopic(name: string): Promise<[MockTopic]> {
    const topic = new MockTopic(name);
    this.topics.set(name, topic);
    return [topic];
  }

  async close(): Promise<void> {
    // No-op for mock
  }
}

// Usage in tests
describe('Publisher with Mock', () => {
  test('should publish message using mock', async () => {
    const pubsub = new MockPubSub();
    const topic = pubsub.topic('test-topic');

    const messageId = await topic.publishMessage({
      data: Buffer.from('test'),
    });

    expect(messageId).toContain('mock-message-id');
    expect(topic.getMessages()).toHaveLength(1);
  });
});
```

#### Using Test Fixtures

```typescript
// fixtures/pubsub-fixtures.ts
export const createTestMessage = (overrides: Partial<any> = {}) => ({
  data: Buffer.from('test data'),
  attributes: { source: 'test' },
  orderingKey: undefined,
  publishTime: new Date(),
  ack: mock(() => {}),
  nack: mock(() => {}),
  ...overrides,
});

export const createTestTopic = (name: string) => ({
  name: `projects/test-project/topics/${name}`,
  publishMessage: mock(async () => `message-id-${Date.now()}`),
  delete: mock(async () => {}),
});

export const createTestSubscription = (name: string) => ({
  name: `projects/test-project/subscriptions/${name}`,
  on: mock(() => {}),
  removeListener: mock(() => {}),
  close: mock(async () => {}),
  delete: mock(async () => {}),
});

// Usage
import { describe, test, expect } from 'bun:test';
import { createTestMessage, createTestTopic } from './fixtures/pubsub-fixtures';

describe('Using Test Fixtures', () => {
  test('should use test message fixture', () => {
    const message = createTestMessage({
      data: Buffer.from('custom data'),
    });

    expect(message.data.toString()).toBe('custom data');
    expect(message.ack).toBeDefined();
  });

  test('should use test topic fixture', async () => {
    const topic = createTestTopic('test-topic');
    const messageId = await topic.publishMessage({
      data: Buffer.from('test'),
    });

    expect(messageId).toContain('message-id');
    expect(topic.publishMessage).toHaveBeenCalled();
  });
});
```

### Spy and Stub Patterns

```typescript
import { describe, test, expect, mock, spyOn } from 'bun:test';
import { PubSub } from '@google-cloud/pubsub';

describe('Spy and Stub Patterns', () => {
  test('should spy on publish calls', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });
    const topic = pubsub.topic('test-topic');

    // Spy on publishMessage
    const publishSpy = spyOn(topic, 'publishMessage');

    await topic.publishMessage({ data: Buffer.from('test') });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith({
      data: expect.any(Buffer),
    });
  });

  test('should stub publish to return specific message ID', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });
    const topic = pubsub.topic('test-topic');

    // Stub publishMessage
    spyOn(topic, 'publishMessage').mockResolvedValue('custom-message-id');

    const messageId = await topic.publishMessage({
      data: Buffer.from('test')
    });

    expect(messageId).toBe('custom-message-id');
  });

  test('should stub publish to simulate error', async () => {
    const pubsub = new PubSub({ projectId: 'test-project' });
    const topic = pubsub.topic('test-topic');

    // Stub to throw error
    spyOn(topic, 'publishMessage').mockRejectedValue(
      new Error('Publish failed')
    );

    await expect(
      topic.publishMessage({ data: Buffer.from('test') })
    ).rejects.toThrow('Publish failed');
  });
});
```

---

## Testing Tools

### Official Google Cloud Pub/Sub Emulator

The official emulator provides full Pub/Sub functionality for local testing.

**Pros:**
- Official Google implementation
- Full feature support
- Accurate behavior matching production
- No code changes required

**Cons:**
- Requires gcloud SDK installation
- Additional process to manage
- Slower than pure mocks

**Best for:**
- Integration tests
- End-to-end tests
- Testing actual Pub/Sub behavior

### Mock Libraries

#### jest-mock-pubsub

```bash
bun add -d jest-mock-pubsub
```

```typescript
import { MockPubSub } from 'jest-mock-pubsub';

describe('Using jest-mock-pubsub', () => {
  test('should use mock library', async () => {
    const pubsub = new MockPubSub();
    const topic = pubsub.topic('test-topic');

    await topic.publish(Buffer.from('test'));

    expect(topic.publishedMessages).toHaveLength(1);
  });
});
```

#### @google-cloud/pubsub with Mocking

```typescript
// Mock module
import { PubSub } from '@google-cloud/pubsub';
import { mock } from 'bun:test';

mock.module('@google-cloud/pubsub', () => ({
  PubSub: mock(() => ({
    topic: mock(() => ({
      publishMessage: mock(async () => 'mock-id'),
    })),
  })),
}));
```

### Test Helpers and Utilities

#### Test Setup Helper

```typescript
// test-helpers/pubsub-test-helper.ts
import { PubSub, Topic, Subscription } from '@google-cloud/pubsub';

export class PubSubTestHelper {
  private pubsub: PubSub;
  private createdTopics: Set<string> = new Set();
  private createdSubscriptions: Set<string> = new Set();

  constructor(projectId = 'test-project') {
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    this.pubsub = new PubSub({ projectId });
  }

  async createTopic(name: string): Promise<Topic> {
    const [topic] = await this.pubsub.createTopic(name);
    this.createdTopics.add(name);
    return topic;
  }

  async createSubscription(
    topicName: string,
    subscriptionName: string
  ): Promise<Subscription> {
    const topic = this.pubsub.topic(topicName);
    const [subscription] = await topic.createSubscription(subscriptionName);
    this.createdSubscriptions.add(subscriptionName);
    return subscription;
  }

  async waitForMessage(
    subscription: Subscription,
    timeout = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.removeAllListeners('message');
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      subscription.on('message', (message) => {
        clearTimeout(timer);
        subscription.removeAllListeners('message');
        resolve(message);
      });
    });
  }

  async cleanup(): Promise<void> {
    // Delete subscriptions
    await Promise.all(
      Array.from(this.createdSubscriptions).map(async (name) => {
        try {
          await this.pubsub.subscription(name).delete();
        } catch (error) {
          // Ignore errors during cleanup
        }
      })
    );

    // Delete topics
    await Promise.all(
      Array.from(this.createdTopics).map(async (name) => {
        try {
          await this.pubsub.topic(name).delete();
        } catch (error) {
          // Ignore errors during cleanup
        }
      })
    );

    await this.pubsub.close();
  }
}

// Usage
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSubTestHelper } from './test-helpers/pubsub-test-helper';

describe('Using Test Helper', () => {
  let helper: PubSubTestHelper;

  beforeEach(() => {
    helper = new PubSubTestHelper();
  });

  afterEach(async () => {
    await helper.cleanup();
  });

  test('should simplify test setup', async () => {
    const topic = await helper.createTopic('test-topic');
    const subscription = await helper.createSubscription(
      'test-topic',
      'test-sub'
    );

    await topic.publishMessage({ data: Buffer.from('test') });

    const message = await helper.waitForMessage(subscription);
    message.ack();

    expect(message.data.toString()).toBe('test');
  });
});
```

#### Message Assertion Helper

```typescript
// test-helpers/message-assertions.ts
export const expectMessage = (message: any) => ({
  toHaveData: (expectedData: string | Buffer) => {
    const actual = message.data.toString();
    const expected =
      typeof expectedData === 'string'
        ? expectedData
        : expectedData.toString();

    if (actual !== expected) {
      throw new Error(
        `Expected message data to be "${expected}", got "${actual}"`
      );
    }
  },

  toHaveAttribute: (key: string, value?: string) => {
    if (!message.attributes) {
      throw new Error('Message has no attributes');
    }

    if (!(key in message.attributes)) {
      throw new Error(`Message missing attribute "${key}"`);
    }

    if (value !== undefined && message.attributes[key] !== value) {
      throw new Error(
        `Expected attribute "${key}" to be "${value}", got "${message.attributes[key]}"`
      );
    }
  },

  toHaveAttributes: (expectedAttributes: Record<string, string>) => {
    if (!message.attributes) {
      throw new Error('Message has no attributes');
    }

    for (const [key, value] of Object.entries(expectedAttributes)) {
      if (message.attributes[key] !== value) {
        throw new Error(
          `Expected attribute "${key}" to be "${value}", got "${message.attributes[key]}"`
        );
      }
    }
  },
});

// Usage
import { describe, test } from 'bun:test';
import { expectMessage } from './test-helpers/message-assertions';

describe('Message Assertions', () => {
  test('should assert message properties', async () => {
    // ... setup and receive message ...

    expectMessage(message).toHaveData('expected data');
    expectMessage(message).toHaveAttribute('type', 'test');
    expectMessage(message).toHaveAttributes({
      type: 'test',
      priority: 'high',
    });
  });
});
```

---

## Test Assertions and Patterns

### Common Assertions

#### Message Content Assertions

```typescript
import { describe, test, expect } from 'bun:test';

describe('Message Content Assertions', () => {
  test('should assert message data', () => {
    const message = {
      data: Buffer.from('test data'),
      attributes: {},
    };

    expect(message.data.toString()).toBe('test data');
    expect(message.data).toBeInstanceOf(Buffer);
  });

  test('should assert JSON message data', () => {
    const data = { key: 'value', number: 42 };
    const message = {
      data: Buffer.from(JSON.stringify(data)),
      attributes: {},
    };

    const parsed = JSON.parse(message.data.toString());

    expect(parsed).toMatchObject(data);
    expect(parsed.key).toBe('value');
    expect(parsed.number).toBe(42);
  });

  test('should assert message attributes', () => {
    const message = {
      data: Buffer.from('test'),
      attributes: {
        type: 'event',
        priority: 'high',
        timestamp: '2025-01-14T12:00:00Z',
      },
    };

    expect(message.attributes.type).toBe('event');
    expect(message.attributes.priority).toBe('high');
    expect(message.attributes).toHaveProperty('timestamp');
  });
});
```

#### Timing and Performance Assertions

```typescript
import { describe, test, expect } from 'bun:test';

describe('Timing Assertions', () => {
  test('should publish within time limit', async () => {
    const topic = pubsub.topic('test-topic');
    const start = Date.now();

    await topic.publishMessage({ data: Buffer.from('test') });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should publish within 100ms
  });

  test('should receive message within timeout', async () => {
    const subscription = pubsub.subscription('test-sub');
    const start = Date.now();

    const message = await waitForMessage(subscription, 5000);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
    expect(message).toBeDefined();
  });

  test('should handle throughput requirements', async () => {
    const topic = pubsub.topic('test-topic');
    const messageCount = 1000;
    const start = Date.now();

    await Promise.all(
      Array.from({ length: messageCount }, (_, i) =>
        topic.publishMessage({ data: Buffer.from(`Message ${i}`) })
      )
    );

    const duration = Date.now() - start;
    const messagesPerSecond = (messageCount / duration) * 1000;

    expect(messagesPerSecond).toBeGreaterThan(100); // At least 100 msg/s
  });
});
```

#### Error State Assertions

```typescript
import { describe, test, expect } from 'bun:test';

describe('Error State Assertions', () => {
  test('should handle publish errors gracefully', async () => {
    const topic = pubsub.topic('non-existent');

    await expect(
      topic.publishMessage({ data: Buffer.from('test') })
    ).rejects.toThrow();
  });

  test('should emit error events', async () => {
    const subscription = pubsub.subscription('test-sub');

    const errorPromise = new Promise((resolve) => {
      subscription.on('error', (error) => {
        resolve(error);
      });
    });

    // Trigger error condition...

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
  });

  test('should handle malformed messages', () => {
    const malformedMessage = {
      data: Buffer.from('not valid json'),
      attributes: {},
    };

    expect(() => JSON.parse(malformedMessage.data.toString())).toThrow();
  });
});
```

### Testing Patterns

#### Arrange-Act-Assert Pattern

```typescript
import { describe, test, expect } from 'bun:test';

describe('AAA Pattern', () => {
  test('should follow arrange-act-assert pattern', async () => {
    // Arrange
    const pubsub = new PubSub({ projectId: 'test-project' });
    const [topic] = await pubsub.createTopic('test-topic');
    const [subscription] = await topic.createSubscription('test-sub');
    const testData = { message: 'Hello, World!' };

    // Act
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify(testData)),
    });

    const message = await waitForMessage(subscription);
    const receivedData = JSON.parse(message.data.toString());

    // Assert
    expect(receivedData).toMatchObject(testData);
    expect(message.attributes).toBeDefined();

    // Cleanup
    await subscription.delete();
    await topic.delete();
  });
});
```

#### Given-When-Then Pattern

```typescript
import { describe, test, expect } from 'bun:test';

describe('GWT Pattern', () => {
  test('Given a topic and subscription, When message is published, Then subscriber receives it', async () => {
    // Given
    const pubsub = new PubSub({ projectId: 'test-project' });
    const [topic] = await pubsub.createTopic('test-topic');
    const [subscription] = await topic.createSubscription('test-sub');

    // When
    const publishedData = 'test message';
    await topic.publishMessage({ data: Buffer.from(publishedData) });

    // Then
    const message = await waitForMessage(subscription);
    expect(message.data.toString()).toBe(publishedData);

    // Cleanup
    await subscription.delete();
    await topic.delete();
  });
});
```

---

## Best Practices

### Test Organization

#### Separate Unit and Integration Tests

```
tests/
├── unit/
│   ├── publisher.test.ts
│   ├── subscriber.test.ts
│   └── message-handler.test.ts
├── integration/
│   ├── pubsub-flow.test.ts
│   └── dead-letter.test.ts
└── helpers/
    ├── test-helper.ts
    └── fixtures.ts
```

#### Use Descriptive Test Names

```typescript
// Good
test('should retry message delivery after nack', async () => { });
test('should move message to DLQ after max retries', async () => { });

// Bad
test('test1', async () => { });
test('subscriber test', async () => { });
```

### Test Data Management

#### Use Consistent Test Data

```typescript
// test-data/messages.ts
export const TEST_MESSAGES = {
  simple: {
    data: Buffer.from('simple test message'),
    attributes: {},
  },
  withAttributes: {
    data: Buffer.from('test with attributes'),
    attributes: {
      type: 'test',
      priority: 'high',
    },
  },
  jsonPayload: {
    data: Buffer.from(
      JSON.stringify({
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
      })
    ),
    attributes: { contentType: 'application/json' },
  },
};

// Usage
test('should handle JSON payload', async () => {
  await topic.publishMessage(TEST_MESSAGES.jsonPayload);
  // ...
});
```

### Resource Cleanup

#### Always Clean Up Resources

```typescript
import { describe, test, beforeAll, afterAll } from 'bun:test';

describe('Proper Cleanup', () => {
  let pubsub: PubSub;
  let topic: Topic;
  let subscription: Subscription;

  beforeAll(async () => {
    pubsub = new PubSub({ projectId: 'test-project' });
    [topic] = await pubsub.createTopic('test-topic');
    [subscription] = await topic.createSubscription('test-sub');
  });

  afterAll(async () => {
    // Clean up in reverse order
    if (subscription) await subscription.delete().catch(() => {});
    if (topic) await topic.delete().catch(() => {});
    if (pubsub) await pubsub.close().catch(() => {});
  });

  test('should use resources', async () => {
    // Test implementation
  });
});
```

#### Use Test Helpers for Cleanup

```typescript
class TestResourceManager {
  private resources: Array<() => Promise<void>> = [];

  async register(cleanup: () => Promise<void>): Promise<void> {
    this.resources.push(cleanup);
  }

  async cleanupAll(): Promise<void> {
    // Clean up in reverse order (LIFO)
    for (const cleanup of this.resources.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
    this.resources = [];
  }
}

// Usage
describe('With Resource Manager', () => {
  const manager = new TestResourceManager();

  afterAll(async () => {
    await manager.cleanupAll();
  });

  test('should manage resources', async () => {
    const [topic] = await pubsub.createTopic('test-topic');
    await manager.register(() => topic.delete());

    const [subscription] = await topic.createSubscription('test-sub');
    await manager.register(() => subscription.delete());

    // Test implementation
  });
});
```

### Emulator Management

#### Start Emulator Before Tests

```typescript
// test-setup.ts
import { spawn, ChildProcess } from 'child_process';

let emulatorProcess: ChildProcess | null = null;

export async function startEmulator(): Promise<void> {
  return new Promise((resolve, reject) => {
    emulatorProcess = spawn('gcloud', [
      'beta',
      'emulators',
      'pubsub',
      'start',
      '--port=8085',
    ]);

    emulatorProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('Server started')) {
        process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
        resolve();
      }
    });

    emulatorProcess.stderr?.on('data', (data) => {
      console.error('Emulator error:', data.toString());
    });

    setTimeout(() => reject(new Error('Emulator startup timeout')), 30000);
  });
}

export async function stopEmulator(): Promise<void> {
  if (emulatorProcess) {
    emulatorProcess.kill();
    emulatorProcess = null;
  }
}

// In test file
import { beforeAll, afterAll } from 'bun:test';
import { startEmulator, stopEmulator } from './test-setup';

beforeAll(async () => {
  await startEmulator();
});

afterAll(async () => {
  await stopEmulator();
});
```

### Test Isolation

#### Ensure Test Isolation

```typescript
import { describe, test, beforeEach } from 'bun:test';

describe('Isolated Tests', () => {
  let uniqueTopicName: string;
  let uniqueSubName: string;

  beforeEach(() => {
    // Generate unique names for each test
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    uniqueTopicName = `test-topic-${timestamp}-${random}`;
    uniqueSubName = `test-sub-${timestamp}-${random}`;
  });

  test('should use isolated resources - test 1', async () => {
    const [topic] = await pubsub.createTopic(uniqueTopicName);
    // Test won't conflict with other tests
  });

  test('should use isolated resources - test 2', async () => {
    const [topic] = await pubsub.createTopic(uniqueTopicName);
    // Uses different topic name than test 1
  });
});
```

### Performance Testing

#### Measure Throughput

```typescript
import { describe, test, expect } from 'bun:test';

describe('Performance Tests', () => {
  test('should measure publish throughput', async () => {
    const topic = pubsub.topic('perf-topic');
    const messageCount = 1000;
    const batchSize = 100;

    const start = Date.now();

    for (let i = 0; i < messageCount; i += batchSize) {
      const batch = Array.from({ length: batchSize }, (_, j) =>
        topic.publishMessage({
          data: Buffer.from(`Message ${i + j}`),
        })
      );
      await Promise.all(batch);
    }

    const duration = (Date.now() - start) / 1000;
    const throughput = messageCount / duration;

    console.log(`Published ${messageCount} messages in ${duration}s`);
    console.log(`Throughput: ${throughput.toFixed(2)} msg/s`);

    expect(throughput).toBeGreaterThan(100);
  });

  test('should measure end-to-end latency', async () => {
    const [topic] = await pubsub.createTopic('latency-topic');
    const [subscription] = await topic.createSubscription('latency-sub');

    const latencies: number[] = [];
    const messageCount = 100;

    for (let i = 0; i < messageCount; i++) {
      const sendTime = Date.now();

      const messagePromise = new Promise<number>((resolve) => {
        const handler = (message: any) => {
          const receiveTime = Date.now();
          const latency = receiveTime - sendTime;
          message.ack();
          latencies.push(latency);
          resolve(latency);
          subscription.removeListener('message', handler);
        };
        subscription.on('message', handler);
      });

      await topic.publishMessage({
        data: Buffer.from(`Message ${i}`),
      });

      await messagePromise;
    }

    const avgLatency =
      latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Max latency: ${maxLatency}ms`);

    expect(avgLatency).toBeLessThan(100);
  });
});
```

---

## Additional Resources

### Documentation
- [Official Pub/Sub Emulator Docs](https://cloud.google.com/pubsub/docs/emulator)
- [Pub/Sub Client Libraries](https://cloud.google.com/pubsub/docs/reference/libraries)
- [Testing Best Practices](https://cloud.google.com/pubsub/docs/testing)

### Example Projects
- [Node.js Pub/Sub Samples](https://github.com/googleapis/nodejs-pubsub)
- [Pub/Sub Testing Examples](https://github.com/GoogleCloudPlatform/nodejs-docs-samples/tree/main/pubsub)

### Tools
- [gcloud CLI Reference](https://cloud.google.com/sdk/gcloud/reference/beta/emulators/pubsub)
- [Testcontainers](https://www.testcontainers.org/)
- [Docker Hub - Google Cloud SDK](https://hub.docker.com/r/google/cloud-sdk)

---

## Summary

This guide covered:

1. **Emulator Setup**: Installing and starting the Pub/Sub emulator using gcloud, Docker, or Testcontainers
2. **Environment Configuration**: Setting `PUBSUB_EMULATOR_HOST` to connect clients to the emulator
3. **Client Connection**: Connecting various client libraries (Node.js, Python, Go, Java) to the emulator
4. **Testing Patterns**: Unit testing publishers and subscribers, integration testing, and E2E workflows
5. **Mocking Strategies**: Creating mock implementations, using fixtures, and applying spy/stub patterns
6. **Testing Tools**: Official emulator, mock libraries, and custom test helpers
7. **Assertions**: Common assertion patterns for message content, timing, and error states
8. **Best Practices**: Test organization, resource cleanup, test isolation, and performance testing

With these tools and techniques, you can effectively test Pub/Sub applications locally without connecting to production services, ensuring reliability and correctness before deployment.
