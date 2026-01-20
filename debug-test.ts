import { PubSub } from './src/pubsub';
import type { Message } from './src/message';

const pubsub = new PubSub({ projectId: 'test-project-id' });

async function test() {
  const topicName = 'test-topic-ack-003';
  const subName = 'test-sub-ack-003';

  const [topic] = await pubsub.createTopic(topicName);
  const [subscription] = await pubsub.createSubscription(topicName, subName, {
    ackDeadlineSeconds: 1,
  });

  let deliveryCount = 0;
  const receivedMessages: Message[] = [];

  subscription.on('message', (message: Message) => {
    deliveryCount++;
    console.log(`Message delivered: attempt=${deliveryCount}, ackId=${message.ackId}, deliveryAttempt=${message.deliveryAttempt}`);
    receivedMessages.push(message);

    if (deliveryCount > 1) {
      message.ack();
      console.log('Message acked');
    }
  });

  subscription.on('error', (error: Error) => {
    console.error('Subscription error:', error);
  });

  subscription.open();
  console.log('Subscription opened');

  await topic.publishMessage({ data: Buffer.from('test') });
  console.log('Message published');

  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`After 100ms: deliveryCount=${deliveryCount}`);

  await new Promise((resolve) => setTimeout(resolve, 1100));
  console.log(`After 1100ms more: deliveryCount=${deliveryCount}`);

  await subscription.close();
  await pubsub.close();
}

test().catch(console.error);
