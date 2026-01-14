# IAM and Security in Google Cloud Pub/Sub

This document provides comprehensive guidance on Identity and Access Management (IAM) and security features in Google Cloud Pub/Sub.

## Table of Contents

1. [IAM Methods Overview](#iam-methods-overview)
2. [Pub/Sub IAM Roles](#pubsub-iam-roles)
3. [Authentication Methods](#authentication-methods)
4. [Security Features](#security-features)
5. [Permission Requirements](#permission-requirements)
6. [IAM Best Practices](#iam-best-practices)
7. [Code Examples](#code-examples)

---

## IAM Methods Overview

Google Cloud Pub/Sub provides IAM methods on both Topic and Subscription resources to manage access control.

### Core IAM Methods

#### `getIamPolicy()`

Retrieves the IAM policy for a resource (topic or subscription).

**Returns:** An IAM Policy object containing bindings of roles to members.

**Use Case:** Auditing current permissions, checking who has access before making changes.

#### `setIamPolicy(policy)`

Sets the IAM policy for a resource, replacing any existing policy.

**Parameters:**
- `policy`: IAM Policy object with role bindings

**Returns:** The updated IAM Policy

**Use Case:** Granting or revoking access, implementing least-privilege access controls.

**Warning:** This is a read-modify-write operation. Always retrieve the current policy, modify it, then set it to avoid overwriting concurrent changes.

#### `testIamPermissions(permissions)`

Tests whether the caller has the specified permissions on the resource.

**Parameters:**
- `permissions`: Array of permission strings to test

**Returns:** Array of permissions that the caller has

**Use Case:** Validating that service accounts have required permissions, debugging access issues.

---

## Pub/Sub IAM Roles

Google Cloud Pub/Sub uses predefined IAM roles that provide granular access control.

### Predefined Roles

#### 1. **Pub/Sub Publisher** (`roles/pubsub.publisher`)

**Permissions:**
- `pubsub.topics.publish`

**Description:** Can publish messages to topics. This is the minimum role needed for applications that only send messages.

**Typical Use Case:** Backend services, data ingestion pipelines that publish events.

#### 2. **Pub/Sub Subscriber** (`roles/pubsub.subscriber`)

**Permissions:**
- `pubsub.subscriptions.consume`
- `pubsub.subscriptions.get`

**Description:** Can consume messages from subscriptions, acknowledge messages, and modify ack deadlines.

**Typical Use Case:** Worker services, event processors that consume messages.

#### 3. **Pub/Sub Viewer** (`roles/pubsub.viewer`)

**Permissions:**
- `pubsub.topics.get`
- `pubsub.topics.list`
- `pubsub.subscriptions.get`
- `pubsub.subscriptions.list`
- `pubsub.snapshots.get`
- `pubsub.snapshots.list`

**Description:** Read-only access to Pub/Sub resources. Cannot publish or consume messages.

**Typical Use Case:** Monitoring tools, dashboards, auditing systems.

#### 4. **Pub/Sub Editor** (`roles/pubsub.editor`)

**Permissions:** Includes all Viewer permissions plus:
- `pubsub.topics.create`
- `pubsub.topics.delete`
- `pubsub.topics.update`
- `pubsub.topics.publish`
- `pubsub.subscriptions.create`
- `pubsub.subscriptions.delete`
- `pubsub.subscriptions.update`
- `pubsub.subscriptions.consume`

**Description:** Full read/write access to Pub/Sub resources except IAM policies.

**Typical Use Case:** Development environments, CI/CD pipelines.

#### 5. **Pub/Sub Admin** (`roles/pubsub.admin`)

**Permissions:** Includes all Editor permissions plus:
- `pubsub.topics.getIamPolicy`
- `pubsub.topics.setIamPolicy`
- `pubsub.subscriptions.getIamPolicy`
- `pubsub.subscriptions.setIamPolicy`

**Description:** Full control over Pub/Sub resources including IAM policy management.

**Typical Use Case:** Infrastructure administrators, security teams.

### Custom Roles

You can create custom roles with specific permission combinations:

```typescript
// Example custom role for a service that only publishes to specific topics
// and reads subscription metadata (but doesn't consume messages)
const customPermissions = [
  'pubsub.topics.publish',
  'pubsub.subscriptions.get',
  'pubsub.subscriptions.list'
];
```

---

## Authentication Methods

### 1. Service Account Keys

**Description:** JSON key files that contain credentials for service accounts.

**Security Level:** Medium (keys can be compromised if leaked)

**Use Case:** Local development, external systems that need to authenticate to GCP.

**Setup:**

```bash
# Create a service account
gcloud iam service-accounts create pubsub-publisher \
  --display-name="Pub/Sub Publisher Service Account"

# Generate key file
gcloud iam service-accounts keys create ~/pubsub-key.json \
  --iam-account=pubsub-publisher@PROJECT_ID.iam.gserviceaccount.com

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:pubsub-publisher@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

**Usage in Code:**

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: 'your-project-id',
  keyFilename: '/path/to/pubsub-key.json'
});
```

**Best Practices:**
- Never commit keys to version control
- Use environment variables for key paths
- Rotate keys regularly (every 90 days recommended)
- Use key management services (e.g., Google Secret Manager)

---

### 2. Application Default Credentials (ADC)

**Description:** Automatic credential discovery mechanism that checks multiple sources in order.

**Security Level:** High (no key files to manage)

**Use Case:** Production workloads on GCP, Cloud Functions, Cloud Run, GKE.

**Credential Search Order:**
1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable
2. User credentials from `gcloud auth application-default login`
3. Attached service account (GCE, Cloud Run, GKE, Cloud Functions)
4. Default service account

**Setup:**

```bash
# For local development
gcloud auth application-default login

# For production (automatic when deploying to GCP services)
# No setup needed - uses attached service account
```

**Usage in Code:**

```typescript
import { PubSub } from '@google-cloud/pubsub';

// ADC is used automatically when no credentials are specified
const pubsub = new PubSub({
  projectId: 'your-project-id'
});
```

**Best Practices:**
- Preferred method for production workloads
- Attach service accounts with minimum required permissions
- Use different service accounts for different workloads

---

### 3. API Keys

**Description:** Simple string-based authentication tokens.

**Security Level:** Low (limited to public APIs)

**Use Case:** Public or anonymous API access (not recommended for Pub/Sub).

**Limitations:** API keys do NOT work with Pub/Sub because it requires authenticated service accounts.

**Note:** While Pub/Sub API supports API keys in theory, they only work for public methods. Publishing and subscribing require OAuth 2.0 authentication.

---

### 4. Workload Identity (GKE)

**Description:** Allows Kubernetes service accounts to impersonate Google service accounts.

**Security Level:** Very High (no key files, automatic credential rotation)

**Use Case:** Applications running in Google Kubernetes Engine (GKE).

**Setup:**

```bash
# Enable Workload Identity on cluster
gcloud container clusters update CLUSTER_NAME \
  --workload-pool=PROJECT_ID.svc.id.goog

# Create Kubernetes service account
kubectl create serviceaccount pubsub-sa

# Create Google service account
gcloud iam service-accounts create pubsub-workload \
  --display-name="Pub/Sub Workload Identity"

# Grant permissions to Google service account
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:pubsub-workload@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Bind Kubernetes SA to Google SA
gcloud iam service-accounts add-iam-policy-binding \
  pubsub-workload@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT_ID.svc.id.goog[NAMESPACE/pubsub-sa]"

# Annotate Kubernetes service account
kubectl annotate serviceaccount pubsub-sa \
  iam.gke.io/gcp-service-account=pubsub-workload@PROJECT_ID.iam.gserviceaccount.com
```

**Usage in Deployment:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pubsub-publisher
spec:
  serviceAccountName: pubsub-sa
  containers:
  - name: app
    image: gcr.io/PROJECT_ID/pubsub-app:latest
    env:
    - name: GOOGLE_CLOUD_PROJECT
      value: "PROJECT_ID"
```

**Best Practices:**
- Always use Workload Identity for GKE workloads
- Avoid mounting service account key files as secrets
- Use separate Kubernetes service accounts for different workloads

---

### 5. Emulator Mode

**Description:** Local Pub/Sub emulator for development and testing.

**Security Level:** None (local only, no authentication)

**Use Case:** Local development, integration tests, CI/CD pipelines.

**Setup:**

```bash
# Install emulator
gcloud components install pubsub-emulator

# Start emulator
gcloud beta emulators pubsub start --project=test-project

# In another terminal, get environment variables
gcloud beta emulators pubsub env-init
```

**Usage in Code:**

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: 'test-project',
  apiEndpoint: 'localhost:8085' // Default emulator endpoint
});

// Or use environment variable
// export PUBSUB_EMULATOR_HOST=localhost:8085
const pubsub = new PubSub({ projectId: 'test-project' });
```

**Best Practices:**
- Use emulator for all local development
- Include emulator in CI/CD test pipelines
- Never use emulator credentials in production
- Set `PUBSUB_EMULATOR_HOST` environment variable for automatic detection

---

## Security Features

### 1. Encryption at Rest

**Description:** All message data is automatically encrypted at rest using Google-managed encryption keys.

**Default Behavior:** Enabled automatically, no configuration required.

**Key Management Options:**

#### Google-Managed Encryption Keys (Default)

- Automatic encryption with Google-managed keys
- No configuration or key management needed
- Keys automatically rotated

#### Customer-Managed Encryption Keys (CMEK)

- Use your own encryption keys stored in Cloud Key Management Service (Cloud KMS)
- Full control over key rotation and access
- Required for regulatory compliance in some industries

**CMEK Setup:**

```bash
# Create a KMS keyring and key
gcloud kms keyrings create pubsub-keyring \
  --location=us-central1

gcloud kms keys create pubsub-key \
  --location=us-central1 \
  --keyring=pubsub-keyring \
  --purpose=encryption

# Grant Pub/Sub service account access to the key
gcloud kms keys add-iam-policy-binding pubsub-key \
  --location=us-central1 \
  --keyring=pubsub-keyring \
  --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
```

**Usage in Code:**

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();

// Create topic with CMEK
const [topic] = await pubsub.createTopic('my-topic', {
  kmsKeyName: 'projects/PROJECT_ID/locations/us-central1/keyRings/pubsub-keyring/cryptoKeys/pubsub-key'
});
```

---

### 2. Encryption in Transit

**Description:** All data in transit is encrypted using TLS 1.2 or higher.

**Default Behavior:** Enabled automatically for all connections.

**Features:**
- Client to Pub/Sub: TLS 1.2+
- Between Google datacenters: Google's internal encryption (BoringCrypto)
- No configuration required

**Validation:**

```typescript
// The client library automatically uses HTTPS
// All API calls are encrypted in transit by default
const pubsub = new PubSub();
```

---

### 3. VPC Service Controls

**Description:** Create security perimeters around Pub/Sub resources to prevent data exfiltration.

**Use Case:** High-security environments, regulated industries, prevent accidental data exposure.

**Capabilities:**
- Restrict Pub/Sub access to resources within VPC perimeter
- Prevent data from being copied to external projects
- Block unauthorized API access from outside perimeter

**Setup:**

```bash
# Create service perimeter (requires Access Context Manager)
gcloud access-context-manager perimeters create pubsub_perimeter \
  --title="Pub/Sub Security Perimeter" \
  --resources=projects/PROJECT_NUMBER \
  --restricted-services=pubsub.googleapis.com \
  --policy=POLICY_ID
```

**Features:**
- Ingress/Egress rules for controlled data flow
- Bridge perimeters for cross-project communication
- Dry-run mode for testing before enforcement

**Best Practices:**
- Use VPC-SC for production environments with sensitive data
- Test perimeters in dry-run mode first
- Document all ingress/egress rules
- Monitor VPC-SC violations in Cloud Logging

---

### 4. Audit Logging

**Description:** Track all administrative actions and data access in Cloud Pub/Sub.

**Log Types:**

#### Admin Activity Logs
- Enabled by default
- Track create, update, delete operations
- No additional cost
- Cannot be disabled

#### Data Access Logs
- Disabled by default (must be enabled)
- Track publish, pull, acknowledge operations
- Incurs additional logging costs
- Useful for compliance and forensics

**Enable Data Access Logging:**

```bash
# Get current IAM policy
gcloud projects get-iam-policy PROJECT_ID > policy.yaml

# Edit policy.yaml to add audit config:
# auditConfigs:
# - auditLogConfigs:
#   - logType: DATA_READ
#   - logType: DATA_WRITE
#   service: pubsub.googleapis.com

# Set updated policy
gcloud projects set-iam-policy PROJECT_ID policy.yaml
```

**Query Logs:**

```bash
# View admin activity logs
gcloud logging read "resource.type=pubsub_topic AND protoPayload.methodName=~'google.pubsub.*'" --limit 50

# View data access logs (if enabled)
gcloud logging read "resource.type=pubsub_subscription AND protoPayload.methodName='google.pubsub.v1.Subscriber.Pull'" --limit 50
```

---

### 5. Message Authentication

**Description:** Verify message authenticity and integrity.

**Methods:**

#### Message Attributes with Signatures

```typescript
import { createHmac } from 'crypto';

// Publisher: Sign messages
const secret = process.env.MESSAGE_SECRET;
const messageData = JSON.stringify({ userId: 123, action: 'login' });
const signature = createHmac('sha256', secret)
  .update(messageData)
  .digest('hex');

await topic.publishMessage({
  data: Buffer.from(messageData),
  attributes: {
    signature,
    timestamp: Date.now().toString()
  }
});

// Subscriber: Verify messages
subscription.on('message', (message) => {
  const receivedSignature = message.attributes.signature;
  const computedSignature = createHmac('sha256', secret)
    .update(message.data.toString())
    .digest('hex');

  if (receivedSignature !== computedSignature) {
    console.error('Message signature verification failed');
    message.nack();
    return;
  }

  // Process verified message
  processMessage(message);
  message.ack();
});
```

#### OAuth Token Verification (for authenticated publishers)

```typescript
// Verify that publisher is authenticated
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

async function verifyToken(token: string) {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: 'YOUR_CLIENT_ID'
  });

  return ticket.getPayload();
}
```

---

### 6. Private Google Access

**Description:** Allow VMs without external IP addresses to access Pub/Sub.

**Use Case:** Enhanced security by keeping traffic within Google's network.

**Setup:**

```bash
# Enable Private Google Access on subnet
gcloud compute networks subnets update SUBNET_NAME \
  --region=REGION \
  --enable-private-ip-google-access
```

**Benefits:**
- No external IP addresses required
- Traffic never leaves Google's network
- Reduced attack surface
- Lower data egress costs

---

## Permission Requirements

### Common Operations and Required Permissions

#### Publishing Messages

**Operation:** `topic.publish(message)`

**Required Permissions:**
- `pubsub.topics.publish`

**Minimum Role:** `roles/pubsub.publisher`

**Example:**

```typescript
const pubsub = new PubSub();
const topic = pubsub.topic('my-topic');

try {
  await topic.publishMessage({ data: Buffer.from('Hello') });
  console.log('Message published');
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.topics.publish');
  }
}
```

---

#### Consuming Messages

**Operation:** `subscription.pull()` or message listener

**Required Permissions:**
- `pubsub.subscriptions.consume`
- `pubsub.subscriptions.get`

**Minimum Role:** `roles/pubsub.subscriber`

**Example:**

```typescript
const subscription = pubsub.subscription('my-subscription');

subscription.on('message', (message) => {
  console.log('Received:', message.data.toString());
  message.ack();
});

subscription.on('error', (error) => {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.subscriptions.consume');
  }
});
```

---

#### Creating Topics

**Operation:** `pubsub.createTopic(name)`

**Required Permissions:**
- `pubsub.topics.create`

**Minimum Role:** `roles/pubsub.editor`

**Example:**

```typescript
try {
  const [topic] = await pubsub.createTopic('new-topic');
  console.log('Topic created:', topic.name);
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.topics.create');
  }
}
```

---

#### Creating Subscriptions

**Operation:** `topic.createSubscription(name)`

**Required Permissions:**
- `pubsub.subscriptions.create`

**Minimum Role:** `roles/pubsub.editor`

**Example:**

```typescript
try {
  const [subscription] = await topic.createSubscription('new-subscription');
  console.log('Subscription created:', subscription.name);
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.subscriptions.create');
  }
}
```

---

#### Managing IAM Policies

**Operation:** `topic.iam.getPolicy()`, `topic.iam.setPolicy()`

**Required Permissions:**
- `pubsub.topics.getIamPolicy`
- `pubsub.topics.setIamPolicy`

**Minimum Role:** `roles/pubsub.admin`

**Example:**

```typescript
try {
  const [policy] = await topic.iam.getPolicy();
  console.log('Current policy:', policy);
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.topics.getIamPolicy');
  }
}
```

---

#### Deleting Resources

**Operation:** `topic.delete()`, `subscription.delete()`

**Required Permissions:**
- `pubsub.topics.delete` (for topics)
- `pubsub.subscriptions.delete` (for subscriptions)

**Minimum Role:** `roles/pubsub.editor`

**Example:**

```typescript
try {
  await topic.delete();
  console.log('Topic deleted');
} catch (error) {
  if (error.code === 7) {
    console.error('Permission denied: Missing pubsub.topics.delete');
  }
}
```

---

### Permission Debugging

Use `testIamPermissions()` to verify permissions before operations:

```typescript
async function checkPermissions(topic: Topic) {
  const permissions = [
    'pubsub.topics.publish',
    'pubsub.topics.update',
    'pubsub.topics.delete'
  ];

  const [allowed] = await topic.iam.testPermissions(permissions);

  console.log('Allowed permissions:', allowed);

  return {
    canPublish: allowed.includes('pubsub.topics.publish'),
    canUpdate: allowed.includes('pubsub.topics.update'),
    canDelete: allowed.includes('pubsub.topics.delete')
  };
}
```

---

## IAM Best Practices

### 1. Principle of Least Privilege

Grant only the minimum permissions required for each workload.

**Bad Example:**

```typescript
// DON'T: Grant admin role when only publishing is needed
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:app@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.admin"
```

**Good Example:**

```typescript
// DO: Grant specific role for the operation
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:app@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

---

### 2. Use Resource-Level IAM

Grant permissions on specific topics/subscriptions instead of project-wide.

**Example:**

```bash
# Grant publish permission on specific topic only
gcloud pubsub topics add-iam-policy-binding my-topic \
  --member="serviceAccount:publisher@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Grant subscribe permission on specific subscription only
gcloud pubsub subscriptions add-iam-policy-binding my-subscription \
  --member="serviceAccount:subscriber@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"
```

**Code Example:**

```typescript
// Programmatically set resource-level IAM
const topic = pubsub.topic('my-topic');
const [policy] = await topic.iam.getPolicy();

policy.bindings.push({
  role: 'roles/pubsub.publisher',
  members: ['serviceAccount:publisher@PROJECT_ID.iam.gserviceaccount.com']
});

await topic.iam.setPolicy(policy);
```

---

### 3. Separate Service Accounts

Use different service accounts for different operations and environments.

**Example Architecture:**

```typescript
// Production publisher (write-only)
const publisherAccount = 'publisher-prod@PROJECT_ID.iam.gserviceaccount.com';
// Role: roles/pubsub.publisher on production topics

// Production subscriber (read-only)
const subscriberAccount = 'subscriber-prod@PROJECT_ID.iam.gserviceaccount.com';
// Role: roles/pubsub.subscriber on production subscriptions

// Development account (full access)
const devAccount = 'developer@PROJECT_ID.iam.gserviceaccount.com';
// Role: roles/pubsub.editor on dev topics/subscriptions

// Admin account (IAM management)
const adminAccount = 'admin@PROJECT_ID.iam.gserviceaccount.com';
// Role: roles/pubsub.admin
```

---

### 4. Regular Permission Audits

Periodically review and remove unnecessary permissions.

**Audit Script:**

```typescript
import { PubSub } from '@google-cloud/pubsub';

async function auditTopicPermissions() {
  const pubsub = new PubSub();
  const [topics] = await pubsub.getTopics();

  for (const topic of topics) {
    console.log(`\n=== ${topic.name} ===`);
    const [policy] = await topic.iam.getPolicy();

    for (const binding of policy.bindings) {
      console.log(`Role: ${binding.role}`);
      console.log(`Members: ${binding.members.join(', ')}`);
    }
  }
}

async function findUnusedServiceAccounts() {
  // Use Cloud Asset Inventory or custom logging to track
  // service account usage over time

  const unusedAccounts = [];
  // Logic to identify accounts with no activity in 90+ days

  return unusedAccounts;
}
```

---

### 5. Use Conditional IAM (Advanced)

Grant permissions based on conditions like time, IP address, or resource attributes.

**Example:**

```typescript
// Grant publish permission only during business hours
const policy = {
  bindings: [{
    role: 'roles/pubsub.publisher',
    members: ['serviceAccount:publisher@PROJECT_ID.iam.gserviceaccount.com'],
    condition: {
      title: 'Business hours only',
      description: 'Only allow publishing during 9am-5pm UTC',
      expression: 'request.time.getHours("UTC") >= 9 && request.time.getHours("UTC") < 17'
    }
  }]
};

await topic.iam.setPolicy(policy);
```

---

### 6. Enable Audit Logging

Always enable admin activity logs (enabled by default) and consider data access logs for sensitive topics.

**Monitoring Example:**

```typescript
// Query audit logs programmatically
import { Logging } from '@google-cloud/logging';

const logging = new Logging();

async function getRecentIAMChanges() {
  const filter = `
    resource.type="pubsub_topic"
    AND protoPayload.methodName="google.iam.v1.IAMPolicy.SetIamPolicy"
    AND timestamp >= "${new Date(Date.now() - 86400000).toISOString()}"
  `;

  const [entries] = await logging.getEntries({ filter });

  for (const entry of entries) {
    console.log(`IAM change detected:`);
    console.log(`  Resource: ${entry.resource.labels.topic_id}`);
    console.log(`  User: ${entry.protoPayload.authenticationInfo.principalEmail}`);
    console.log(`  Time: ${entry.timestamp}`);
  }
}
```

---

### 7. Rotate Credentials Regularly

If using service account keys, rotate them every 90 days.

**Rotation Strategy:**

```bash
#!/bin/bash
# Automated key rotation script

SERVICE_ACCOUNT="app@PROJECT_ID.iam.gserviceaccount.com"
KEY_FILE="/secure/path/new-key.json"

# Create new key
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SERVICE_ACCOUNT"

# Deploy new key to application
kubectl create secret generic pubsub-key \
  --from-file=key.json="$KEY_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# Wait for rollout
kubectl rollout restart deployment/pubsub-app
kubectl rollout status deployment/pubsub-app

# Delete old keys (keep only latest 2)
gcloud iam service-accounts keys list \
  --iam-account="$SERVICE_ACCOUNT" \
  --format="value(name)" \
  --filter="validAfterTime<-P90D" | \
  while read key; do
    gcloud iam service-accounts keys delete "$key" \
      --iam-account="$SERVICE_ACCOUNT" \
      --quiet
  done
```

---

### 8. Use Organization Policies

Enforce security policies across your entire organization.

**Example Policies:**

```bash
# Require CMEK for all new topics
gcloud resource-manager org-policies set-policy \
  organizations/ORG_ID \
  --policy-file=cmek-required.yaml

# Disable service account key creation (force Workload Identity)
gcloud resource-manager org-policies set-policy \
  organizations/ORG_ID \
  --policy-file=disable-sa-keys.yaml
```

---

## Code Examples

### Complete IAM Management Example

```typescript
import { PubSub } from '@google-cloud/pubsub';

class PubSubIAMManager {
  private pubsub: PubSub;

  constructor(projectId: string) {
    this.pubsub = new PubSub({ projectId });
  }

  /**
   * Grant publisher role to a service account
   */
  async grantPublishPermission(
    topicName: string,
    serviceAccount: string
  ): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const [policy] = await topic.iam.getPolicy();

    // Add new binding
    policy.bindings.push({
      role: 'roles/pubsub.publisher',
      members: [`serviceAccount:${serviceAccount}`]
    });

    await topic.iam.setPolicy(policy);
    console.log(`Granted publisher role to ${serviceAccount} on ${topicName}`);
  }

  /**
   * Revoke all permissions for a service account
   */
  async revokeAllPermissions(
    topicName: string,
    serviceAccount: string
  ): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const [policy] = await topic.iam.getPolicy();

    // Remove member from all bindings
    const member = `serviceAccount:${serviceAccount}`;
    policy.bindings = policy.bindings
      .map(binding => ({
        ...binding,
        members: binding.members.filter(m => m !== member)
      }))
      .filter(binding => binding.members.length > 0);

    await topic.iam.setPolicy(policy);
    console.log(`Revoked all permissions for ${serviceAccount} on ${topicName}`);
  }

  /**
   * List all members with access to a topic
   */
  async listTopicAccess(topicName: string): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const [policy] = await topic.iam.getPolicy();

    console.log(`\nIAM Policy for ${topicName}:`);

    for (const binding of policy.bindings) {
      console.log(`\n  Role: ${binding.role}`);
      for (const member of binding.members) {
        console.log(`    - ${member}`);
      }
    }
  }

  /**
   * Test if caller has specific permissions
   */
  async testPermissions(
    topicName: string,
    permissions: string[]
  ): Promise<string[]> {
    const topic = this.pubsub.topic(topicName);
    const [allowed] = await topic.iam.testPermissions(permissions);

    console.log('\nPermission Test Results:');
    for (const permission of permissions) {
      const hasPermission = allowed.includes(permission);
      console.log(`  ${permission}: ${hasPermission ? '✓' : '✗'}`);
    }

    return allowed;
  }

  /**
   * Grant conditional access (time-based)
   */
  async grantConditionalAccess(
    topicName: string,
    serviceAccount: string,
    startHour: number,
    endHour: number
  ): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const [policy] = await topic.iam.getPolicy();

    policy.bindings.push({
      role: 'roles/pubsub.publisher',
      members: [`serviceAccount:${serviceAccount}`],
      condition: {
        title: `Access between ${startHour}:00 and ${endHour}:00 UTC`,
        description: 'Time-based access control',
        expression: `request.time.getHours("UTC") >= ${startHour} && request.time.getHours("UTC") < ${endHour}`
      }
    });

    await topic.iam.setPolicy(policy);
    console.log(`Granted conditional access to ${serviceAccount}`);
  }

  /**
   * Audit all topics and their IAM policies
   */
  async auditAllTopics(): Promise<void> {
    const [topics] = await this.pubsub.getTopics();

    console.log('\n=== Pub/Sub IAM Audit ===\n');

    for (const topic of topics) {
      console.log(`Topic: ${topic.name}`);

      try {
        const [policy] = await topic.iam.getPolicy();

        for (const binding of policy.bindings) {
          console.log(`  ${binding.role}:`);
          for (const member of binding.members) {
            console.log(`    - ${member}`);
          }
        }
      } catch (error) {
        console.log('  ERROR: Unable to get IAM policy (permission denied)');
      }

      console.log('');
    }
  }

  /**
   * Set up least-privilege publisher pattern
   */
  async setupPublisherAccount(
    topicName: string,
    serviceAccount: string
  ): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const [policy] = await topic.iam.getPolicy();

    // Grant only publish permission
    policy.bindings.push({
      role: 'roles/pubsub.publisher',
      members: [`serviceAccount:${serviceAccount}`]
    });

    await topic.iam.setPolicy(policy);

    // Verify permissions
    const [allowed] = await topic.iam.testPermissions([
      'pubsub.topics.publish',
      'pubsub.topics.delete',
      'pubsub.topics.update'
    ]);

    console.log(`\nSetup complete for ${serviceAccount}:`);
    console.log(`  Can publish: ${allowed.includes('pubsub.topics.publish')}`);
    console.log(`  Can delete: ${allowed.includes('pubsub.topics.delete')}`);
    console.log(`  Can update: ${allowed.includes('pubsub.topics.update')}`);
  }

  /**
   * Set up least-privilege subscriber pattern
   */
  async setupSubscriberAccount(
    subscriptionName: string,
    serviceAccount: string
  ): Promise<void> {
    const subscription = this.pubsub.subscription(subscriptionName);
    const [policy] = await subscription.iam.getPolicy();

    // Grant only subscriber permission
    policy.bindings.push({
      role: 'roles/pubsub.subscriber',
      members: [`serviceAccount:${serviceAccount}`]
    });

    await subscription.iam.setPolicy(policy);
    console.log(`Granted subscriber role to ${serviceAccount}`);
  }
}

// Usage examples
async function main() {
  const manager = new PubSubIAMManager('your-project-id');

  // Example 1: Grant publish permission
  await manager.grantPublishPermission(
    'orders-topic',
    'order-service@project-id.iam.gserviceaccount.com'
  );

  // Example 2: Test permissions
  await manager.testPermissions('orders-topic', [
    'pubsub.topics.publish',
    'pubsub.topics.update',
    'pubsub.topics.delete',
    'pubsub.topics.getIamPolicy'
  ]);

  // Example 3: Grant time-based access (9am-5pm UTC)
  await manager.grantConditionalAccess(
    'daytime-topic',
    'daytime-service@project-id.iam.gserviceaccount.com',
    9,
    17
  );

  // Example 4: Audit all topics
  await manager.auditAllTopics();

  // Example 5: Setup secure publisher
  await manager.setupPublisherAccount(
    'events-topic',
    'event-publisher@project-id.iam.gserviceaccount.com'
  );

  // Example 6: Setup secure subscriber
  await manager.setupSubscriberAccount(
    'events-subscription',
    'event-processor@project-id.iam.gserviceaccount.com'
  );
}
```

---

### Authentication Pattern Examples

#### Pattern 1: Multi-Environment Authentication

```typescript
import { PubSub } from '@google-cloud/pubsub';

class PubSubClient {
  private pubsub: PubSub;

  constructor() {
    const env = process.env.NODE_ENV || 'development';

    if (env === 'production') {
      // Production: Use ADC (attached service account)
      this.pubsub = new PubSub({
        projectId: process.env.GCP_PROJECT_ID
      });
    } else if (env === 'staging') {
      // Staging: Use service account key from Secret Manager
      this.pubsub = new PubSub({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    } else if (env === 'test') {
      // Test: Use emulator
      this.pubsub = new PubSub({
        projectId: 'test-project',
        apiEndpoint: 'localhost:8085'
      });
    } else {
      // Development: Use user credentials from gcloud
      this.pubsub = new PubSub({
        projectId: process.env.GCP_PROJECT_ID
      });
    }
  }

  async publish(topicName: string, data: any): Promise<string> {
    const topic = this.pubsub.topic(topicName);
    const messageId = await topic.publishMessage({
      data: Buffer.from(JSON.stringify(data))
    });
    return messageId;
  }
}

// Usage
const client = new PubSubClient();
await client.publish('my-topic', { event: 'user_signup' });
```

---

#### Pattern 2: Secure Key Management

```typescript
import { PubSub } from '@google-cloud/pubsub';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

async function getPubSubClientWithSecret(): Promise<PubSub> {
  const secretClient = new SecretManagerServiceClient();

  // Retrieve service account key from Secret Manager
  const [version] = await secretClient.accessSecretVersion({
    name: 'projects/PROJECT_ID/secrets/pubsub-key/versions/latest'
  });

  const keyData = version.payload.data.toString();
  const credentials = JSON.parse(keyData);

  return new PubSub({
    projectId: credentials.project_id,
    credentials
  });
}

// Usage
const pubsub = await getPubSubClientWithSecret();
```

---

#### Pattern 3: Token-Based Authentication (for testing)

```typescript
import { PubSub } from '@google-cloud/pubsub';
import { GoogleAuth } from 'google-auth-library';

async function getPubSubWithCustomAuth(): Promise<PubSub> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/pubsub']
  });

  const client = await auth.getClient();

  return new PubSub({
    projectId: 'your-project-id',
    auth: client
  });
}
```

---

### Security Validation Example

```typescript
import { PubSub } from '@google-cloud/pubsub';
import { createHmac } from 'crypto';

/**
 * Secure message publisher with signing
 */
class SecurePublisher {
  private pubsub: PubSub;
  private secret: string;

  constructor(projectId: string, secret: string) {
    this.pubsub = new PubSub({ projectId });
    this.secret = secret;
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
  }

  async publishSecure(topicName: string, data: any): Promise<string> {
    const topic = this.pubsub.topic(topicName);
    const messageData = JSON.stringify(data);
    const signature = this.sign(messageData);
    const timestamp = Date.now().toString();

    const messageId = await topic.publishMessage({
      data: Buffer.from(messageData),
      attributes: {
        signature,
        timestamp,
        version: '1.0'
      }
    });

    return messageId;
  }
}

/**
 * Secure message subscriber with verification
 */
class SecureSubscriber {
  private pubsub: PubSub;
  private secret: string;

  constructor(projectId: string, secret: string) {
    this.pubsub = new PubSub({ projectId });
    this.secret = secret;
  }

  private verify(data: string, signature: string): boolean {
    const computedSignature = createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return signature === computedSignature;
  }

  subscribe(
    subscriptionName: string,
    handler: (data: any) => Promise<void>
  ): void {
    const subscription = this.pubsub.subscription(subscriptionName);

    subscription.on('message', async (message) => {
      try {
        // Verify signature
        const signature = message.attributes.signature;
        const timestamp = message.attributes.timestamp;
        const messageData = message.data.toString();

        if (!signature) {
          console.error('Missing signature - message rejected');
          message.nack();
          return;
        }

        if (!this.verify(messageData, signature)) {
          console.error('Invalid signature - message rejected');
          message.nack();
          return;
        }

        // Check message age (reject messages older than 5 minutes)
        const age = Date.now() - parseInt(timestamp);
        if (age > 300000) {
          console.warn('Message too old - rejected');
          message.nack();
          return;
        }

        // Process verified message
        const data = JSON.parse(messageData);
        await handler(data);
        message.ack();

      } catch (error) {
        console.error('Error processing message:', error);
        message.nack();
      }
    });

    subscription.on('error', (error) => {
      console.error('Subscription error:', error);
    });
  }
}

// Usage
const publisher = new SecurePublisher('project-id', process.env.MESSAGE_SECRET);
await publisher.publishSecure('secure-topic', {
  userId: 123,
  action: 'login'
});

const subscriber = new SecureSubscriber('project-id', process.env.MESSAGE_SECRET);
subscriber.subscribe('secure-subscription', async (data) => {
  console.log('Verified message:', data);
});
```

---

## Summary

### Key Takeaways

1. **Use Application Default Credentials (ADC)** for production workloads
2. **Apply principle of least privilege** - grant minimum required permissions
3. **Use resource-level IAM** instead of project-level when possible
4. **Enable audit logging** for compliance and security monitoring
5. **Rotate service account keys** every 90 days if you must use them
6. **Prefer Workload Identity** for GKE workloads
7. **Use VPC Service Controls** for high-security environments
8. **Enable CMEK** for regulatory compliance requirements
9. **Sign and verify messages** for critical applications
10. **Regular IAM audits** to remove unnecessary permissions

### Quick Reference

| Operation | Minimum Permission | Role |
|-----------|-------------------|------|
| Publish messages | `pubsub.topics.publish` | `roles/pubsub.publisher` |
| Consume messages | `pubsub.subscriptions.consume` | `roles/pubsub.subscriber` |
| Create topics | `pubsub.topics.create` | `roles/pubsub.editor` |
| Create subscriptions | `pubsub.subscriptions.create` | `roles/pubsub.editor` |
| View resources | `pubsub.topics.get` | `roles/pubsub.viewer` |
| Manage IAM | `pubsub.topics.setIamPolicy` | `roles/pubsub.admin` |

### Additional Resources

- [Official IAM Documentation](https://cloud.google.com/pubsub/docs/access-control)
- [Security Best Practices](https://cloud.google.com/pubsub/docs/security-best-practices)
- [VPC Service Controls Guide](https://cloud.google.com/vpc-service-controls/docs/overview)
- [Workload Identity Setup](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Audit Logging Guide](https://cloud.google.com/pubsub/docs/audit-logging)
