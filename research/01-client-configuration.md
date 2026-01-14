# Google Cloud Pub/Sub Client Configuration

## Table of Contents
1. [PubSub Constructor](#pubsub-constructor)
2. [Client Configuration Options](#client-configuration-options)
3. [Authentication Methods](#authentication-methods)
4. [Emulator Configuration](#emulator-configuration)
5. [gRPC Configuration](#grpc-configuration)
6. [Connection Pooling and Lifecycle](#connection-pooling-and-lifecycle)
7. [Client Methods](#client-methods)
8. [Best Practices](#best-practices)

## PubSub Constructor

The `PubSub` class is the main entry point for interacting with Google Cloud Pub/Sub.

```typescript
import { PubSub } from '@google-cloud/pubsub';

// Basic initialization
const pubsub = new PubSub();

// With options
const pubsub = new PubSub({
  projectId: 'my-project-id',
  keyFilename: '/path/to/service-account-key.json'
});
```

## Client Configuration Options

### ClientConfig Interface

```typescript
interface ClientConfig {
  projectId?: string;
  keyFilename?: string;
  credentials?: {
    client_email?: string;
    private_key?: string;
  };
  email?: string;
  token?: string;
  apiEndpoint?: string;
  port?: number;
  servicePath?: string;
  sslCreds?: any;
  clientConfig?: any;
  fallback?: boolean | 'rest' | 'proto';
  grpc?: any;
  gaxOpts?: GaxOptions;
}
```

### Configuration Properties

**projectId** (string)
- The Google Cloud project ID
- Auto-detected from environment if not provided (ADC, gcloud config, metadata service)
- Environment variable: `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`

**keyFilename** (string)
- Path to service account JSON key file
- Mutually exclusive with `credentials`

**credentials** (object)
- Service account credentials object with `client_email` and `private_key`
- Use when loading credentials from memory rather than file

**apiEndpoint** (string)
- Custom API endpoint URL
- Default: `pubsub.googleapis.com`
- Used for regional endpoints or emulator

**port** (number)
- Custom port number
- Used with emulator or custom endpoints

**grpc** (object)
- Custom gRPC implementation
- Advanced use cases only

**gaxOpts** (GaxOptions)
- Google API Extensions options
- Includes retry, timeout, and other advanced configurations

## Authentication Methods

### 1. Service Account Key File

Most explicit method - provide path to service account JSON key:

```typescript
const pubsub = new PubSub({
  projectId: 'my-project',
  keyFilename: './service-account-key.json'
});
```

**Best for:**
- Local development
- CI/CD pipelines
- Non-GCP environments

**Security considerations:**
- Never commit keys to version control
- Store in secure secret management system
- Rotate keys regularly

### 2. Service Account Credentials Object

Load credentials from environment or secret manager:

```typescript
const pubsub = new PubSub({
  projectId: process.env.PROJECT_ID,
  credentials: {
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});
```

**Best for:**
- Cloud environments with secret managers
- Container deployments
- Serverless functions

### 3. Application Default Credentials (ADC)

Auto-discovery of credentials from environment:

```typescript
// No credentials specified - uses ADC
const pubsub = new PubSub({
  projectId: 'my-project'
});
```

**Credential search order:**
1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to JSON key
2. gcloud CLI configured credentials (`gcloud auth application-default login`)
3. GCE/GKE metadata service (for workloads running on Google Cloud)

**Best for:**
- Production workloads on Google Cloud
- Developers using gcloud CLI
- Following Google Cloud best practices

### 4. Workload Identity (GKE)

For Kubernetes pods on GKE:

```typescript
// No credentials needed - uses Workload Identity
const pubsub = new PubSub({
  projectId: 'my-project'
});
```

**Setup:**
```bash
# Create service account
gcloud iam service-accounts create pubsub-sa

# Bind to Kubernetes service account
gcloud iam service-accounts add-iam-policy-binding \
  pubsub-sa@my-project.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:my-project.svc.id.goog[namespace/ksa-name]"

# Annotate Kubernetes service account
kubectl annotate serviceaccount ksa-name \
  iam.gke.io/gcp-service-account=pubsub-sa@my-project.iam.gserviceaccount.com
```

**Best for:**
- GKE production workloads
- Maximum security (no key files)
- Automatic credential rotation

### 5. API Keys (NOT RECOMMENDED)

API keys do NOT work with Pub/Sub operations requiring authentication. Pub/Sub requires OAuth 2.0 credentials.

```typescript
// ❌ This will NOT work for authenticated operations
const pubsub = new PubSub({
  apiKey: 'AIza...' // Don't use this
});
```

## Emulator Configuration

### Setting Up the Emulator

```bash
# Install (requires Java)
gcloud components install pubsub-emulator

# Start the emulator
gcloud beta emulators pubsub start --project=test-project

# Get environment variables
gcloud beta emulators pubsub env-init
```

### Connecting to the Emulator

**Option 1: Environment Variable**

```bash
export PUBSUB_EMULATOR_HOST=localhost:8085
```

```typescript
// Automatically connects to emulator when env var is set
const pubsub = new PubSub({
  projectId: 'test-project'
});
```

**Option 2: Explicit Configuration**

```typescript
const pubsub = new PubSub({
  projectId: 'test-project',
  apiEndpoint: 'localhost:8085'
});
```

**Option 3: Programmatic for Testing**

```typescript
// test-setup.ts
if (process.env.NODE_ENV === 'test') {
  process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
}

import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({ projectId: 'test-project' });
```

### Detecting Emulator Connection

```typescript
const pubsub = new PubSub();

if (pubsub.isEmulator) {
  console.log('Connected to Pub/Sub emulator');
} else {
  console.log('Connected to production Pub/Sub');
}
```

## gRPC Configuration

### Custom gRPC Options

```typescript
const pubsub = new PubSub({
  projectId: 'my-project',
  gaxOpts: {
    grpc: {
      'grpc.keepalive_time_ms': 120000,
      'grpc.keepalive_timeout_ms': 20000,
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.http2.min_time_between_pings_ms': 10000,
      'grpc.http2.min_ping_interval_without_data_ms': 5000
    }
  }
});
```

### Retry Configuration

```typescript
const pubsub = new PubSub({
  projectId: 'my-project',
  gaxOpts: {
    retry: {
      retryCodes: [10, 14], // ABORTED, UNAVAILABLE
      backoffSettings: {
        initialRetryDelayMillis: 100,
        retryDelayMultiplier: 1.3,
        maxRetryDelayMillis: 60000,
        initialRpcTimeoutMillis: 60000,
        rpcTimeoutMultiplier: 1,
        maxRpcTimeoutMillis: 600000,
        totalTimeoutMillis: 600000
      }
    }
  }
});
```

### Timeout Configuration

```typescript
const pubsub = new PubSub({
  projectId: 'my-project',
  gaxOpts: {
    timeout: 30000 // 30 seconds
  }
});
```

## Connection Pooling and Lifecycle

### Connection Pooling

The PubSub client maintains persistent gRPC connections:

- **Default**: Up to 100 open streams per PubSub instance
- **Recommended**: Less than 20 subscriptions per PubSub instance
- **Best practice**: Reuse PubSub instances across your application

```typescript
// ✅ GOOD: Create once, reuse everywhere
export const pubsub = new PubSub();

// ❌ BAD: Creating new instances everywhere
function publishMessage() {
  const pubsub = new PubSub(); // Don't do this
  // ...
}
```

### Client Lifecycle

**Initialization:**
```typescript
const pubsub = new PubSub({
  projectId: 'my-project'
});

// Check if project ID is resolved
console.log(pubsub.isIdResolved); // boolean
```

**Accessing Internal Clients:**
```typescript
// Get low-level gRPC clients (advanced usage)
const publisherClient = pubsub.v1.PublisherClient;
const subscriberClient = pubsub.v1.SubscriberClient;
const schemaClient = await pubsub.getSchemaClient();
```

**Cleanup:**
```typescript
// Close all subscriptions and connections
await pubsub.close();
```

## Client Methods

### Topic Management

```typescript
// Get topic reference (doesn't make API call)
const topic = pubsub.topic('my-topic');

// Create topic
const [topic] = await pubsub.createTopic('my-topic');

// List topics
const [topics] = await pubsub.getTopics();

// Stream topics (for large lists)
pubsub.getTopicsStream()
  .on('data', topic => console.log(topic.name))
  .on('end', () => console.log('Done'));
```

### Subscription Management

```typescript
// Get subscription reference
const subscription = pubsub.subscription('my-subscription');

// Create subscription
const [subscription] = await pubsub.createSubscription(
  'my-topic',
  'my-subscription'
);

// List subscriptions
const [subscriptions] = await pubsub.getSubscriptions();

// Stream subscriptions
pubsub.getSubscriptionsStream()
  .on('data', sub => console.log(sub.name))
  .on('end', () => console.log('Done'));
```

### Schema Management

```typescript
// Create schema
const [schema] = await pubsub.createSchema(
  'my-schema',
  'AVRO',
  avroDefinition
);

// Get schema reference
const schema = pubsub.schema('my-schema');

// List schemas
for await (const schema of pubsub.listSchemas()) {
  console.log(schema.name);
}

// Validate schema
await pubsub.validateSchema({
  type: 'AVRO',
  definition: avroDefinition
});
```

### Snapshot Management

```typescript
// Get snapshot reference
const snapshot = pubsub.snapshot('my-snapshot');

// Stream snapshots
pubsub.getSnapshotsStream()
  .on('data', snap => console.log(snap.name))
  .on('end', () => console.log('Done'));
```

### Configuration Retrieval

```typescript
// Get client configuration
const config = await pubsub.getClientConfig();
console.log(config);

// Get project ID
const projectId = await pubsub.getProjectId();
```

## Best Practices

### 1. Use Application Default Credentials

```typescript
// ✅ Recommended for production
const pubsub = new PubSub({
  projectId: 'my-project'
  // No credentials - uses ADC
});
```

### 2. Reuse Client Instances

```typescript
// ✅ Create once, use everywhere
// pubsub-client.ts
export const pubsub = new PubSub();

// other-file.ts
import { pubsub } from './pubsub-client';
```

### 3. Use Environment Variables

```typescript
// ✅ Configuration from environment
const pubsub = new PubSub({
  projectId: process.env.GCLOUD_PROJECT
});
```

### 4. Proper Error Handling

```typescript
async function initializePubSub() {
  try {
    const pubsub = new PubSub();

    // Verify connection by listing topics
    await pubsub.getTopics({ pageSize: 1 });

    return pubsub;
  } catch (error) {
    console.error('Failed to initialize Pub/Sub:', error);
    throw error;
  }
}
```

### 5. Graceful Shutdown

```typescript
// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('Closing Pub/Sub connections...');
  await pubsub.close();
  process.exit(0);
});
```

### 6. Use Emulator for Development

```typescript
// development.ts
const pubsub = new PubSub({
  projectId: process.env.NODE_ENV === 'production'
    ? 'prod-project'
    : 'dev-project',
  ...(process.env.NODE_ENV === 'development' && {
    apiEndpoint: 'localhost:8085'
  })
});
```

### 7. Regional Endpoints

For lower latency, use regional endpoints:

```typescript
const pubsub = new PubSub({
  projectId: 'my-project',
  apiEndpoint: 'us-central1-pubsub.googleapis.com'
});
```

### 8. Monitor Connection Health

```typescript
class PubSubManager {
  private pubsub: PubSub;

  constructor() {
    this.pubsub = new PubSub();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pubsub.getTopics({ pageSize: 1 });
      return true;
    } catch (error) {
      console.error('Pub/Sub health check failed:', error);
      return false;
    }
  }
}
```

## Complete Configuration Example

```typescript
import { PubSub } from '@google-cloud/pubsub';

interface PubSubConfig {
  projectId: string;
  environment: 'development' | 'staging' | 'production';
  emulatorHost?: string;
  keyFilename?: string;
}

export function createPubSubClient(config: PubSubConfig): PubSub {
  const baseConfig: any = {
    projectId: config.projectId
  };

  // Environment-specific configuration
  switch (config.environment) {
    case 'development':
      if (config.emulatorHost) {
        baseConfig.apiEndpoint = config.emulatorHost;
      }
      break;

    case 'staging':
      baseConfig.keyFilename = config.keyFilename || './staging-sa-key.json';
      break;

    case 'production':
      // Use ADC in production (Workload Identity, etc.)
      baseConfig.gaxOpts = {
        retry: {
          retryCodes: [10, 14],
          backoffSettings: {
            initialRetryDelayMillis: 100,
            retryDelayMultiplier: 1.3,
            maxRetryDelayMillis: 60000
          }
        },
        timeout: 60000
      };
      break;
  }

  const pubsub = new PubSub(baseConfig);

  console.log(`Pub/Sub client initialized for ${config.environment}`);
  console.log(`Emulator mode: ${pubsub.isEmulator}`);

  return pubsub;
}

// Usage
const pubsub = createPubSubClient({
  projectId: process.env.GCLOUD_PROJECT!,
  environment: (process.env.NODE_ENV as any) || 'development',
  emulatorHost: process.env.PUBSUB_EMULATOR_HOST
});

export default pubsub;
```

## Official Documentation

- [Client Libraries Overview](https://cloud.google.com/pubsub/docs/reference/libraries)
- [Node.js Client API Reference](https://googleapis.dev/nodejs/pubsub/latest/)
- [Authentication Overview](https://cloud.google.com/docs/authentication)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Pub/Sub Emulator](https://cloud.google.com/pubsub/docs/emulator)
- [Regional Endpoints](https://cloud.google.com/pubsub/docs/reference/service_apis_overview#regions)
