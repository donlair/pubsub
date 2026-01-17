import { PubSub } from '../src';
import type { Message } from '../src';

const pubsub = new PubSub();

const topicName = 'orders';
const subscriptionName = 'orders-worker';

const [topic] = await pubsub.createTopic(topicName);
const [subscription] = await pubsub.createSubscription(topicName, subscriptionName);

subscription.on('message', (message: Message) => {
  console.log('Received:', message.data.toString());
  console.log('Attributes:', message.attributes);
  message.ack();
});

subscription.on('error', (error: Error) => {
  console.error('Subscription error:', error);
});

await topic.publishMessage({
  data: Buffer.from('Hello from local Pub/Sub'),
  attributes: { origin: 'examples/basic-app.ts' },
});

setTimeout(async () => {
  await pubsub.close();
}, 250);
