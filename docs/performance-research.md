# **Comprehensive Performance Engineering and Benchmarking Strategy for a Bun.js-Based Google Pub/Sub Implementation**

## **1\. Executive Summary and Strategic Alignment**

The architectural decision to implement a Google Pub/Sub-compatible server using the Bun.js runtime within a monolithic repository represents a forward-thinking approach to distributed systems development. This strategy optimizes for development velocity by collapsing the infrastructure feedback loop, allowing developers to interact with a high-fidelity local message broker that shares the same language constructs (JavaScript/TypeScript) as the application code. However, the transition from a functional prototype—validated via unit and integration tests—to a production-ready component capable of seamless cloud migration requires a rigorous, data-driven performance engineering framework.

This report provides an exhaustive analysis of the methodologies, tooling ecosystems, and theoretical frameworks necessary to subject the donlair/pubsub implementation to production-grade stress, load, and throughput benchmarking. The objective is not merely to verify that the server "works" under load, but to mathematically characterize its behavior, identify the saturation points of the Bun.js runtime's HTTP/2 stack, and establish a baseline Service Level Objective (SLO) that predicts performance when the architecture eventually scales to Google Cloud Platform (GCP).

The analysis synthesizes findings from academic research on Message-Oriented Middleware (MOM) benchmarking 1, architectural documentation of Google Cloud Pub/Sub 2, and deep technical scrutiny of the Bun runtime's evolving gRPC capabilities.3 It posits that while Bun offers significant theoretical performance advantages over Node.js due to the JavaScriptCore engine and fast startup times 4, its relative immaturity in handling long-lived gRPC streams necessitates a specialized, multi-tiered benchmarking strategy leveraging **k6** (via Go extensions) and **ghz**.

## ---

**2\. Theoretical Framework of Messaging System Performance**

To accurately benchmark a Pub/Sub system, one must first deconstruct the theoretical dimensions that define its performance. Unlike synchronous Request-Response architectures (e.g., REST), messaging systems operate on asynchronous, decoupled principles where "performance" is a composite of ingestion rate, propagation delay, and consumption capacity.

### **2.1 The Dimensions of Messaging Performance**

According to Google’s architectural documentation and independent research on MOM performance evaluation, a messaging service must be judged across three competing axes: scalability, availability, and latency.1 For a monolithic Bun implementation, these dimensions translate into specific testable hypotheses.

- **Ingestion Throughput (Publish Rate):** This metric measures the server's capacity to accept write requests. In a Bun.js context, this is heavily dependent on the efficiency of the node:http2 server implementation and the deserialization speed of Protocol Buffers (Protobuf). The benchmark must identify the maximum messages per second (MPS) the server can acknowledge before the internal event loop lag grows exponentially.
- **Propagation Latency (End-to-End):** This is the time elapsed between the successful publication of a message and its delivery to a subscriber ($T\_{delivery} \- T\_{publish}$). This metric is the most critical proxy for the efficiency of the internal routing logic—the JavaScript code responsible for matching topics to subscriptions and dispatching events.
- **Fan-out Efficiency:** Pub/Sub systems often need to replicate a single message to multiple subscribers. Benchmarking must quantify the degradation in throughput as the number of subscribers ($N\_{sub}$) increases. A naive implementation might exhibit $O(N)$ or $O(N^2)$ complexity, whereas an optimized system should approach linear degradation relative to network I/O.
- **Resource Efficiency:** Because the goal is a monolithic repo that might run on constrained developer machines or containerized Cloud Run instances 5, the relationship between throughput and resource consumption (CPU/RAM) is paramount.

### **2.2 Queuing Theory and Backpressure**

A critical aspect of benchmarking a monolithic Pub/Sub server is understanding **Little's Law** ($L \= \\lambda W$), where $L$ is the number of items in the system, $\\lambda$ is the arrival rate, and $W$ is the wait time. In the context of the donlair/pubsub repo, the "system" is not just the network socket, but the internal JavaScript processing queue within the Bun runtime.

Benchmarking must identify the **saturation point**: the arrival rate $\\lambda$ at which the wait time $W$ begins to grow asymptotically. This phenomenon typically occurs not when the CPU reaches 100%, but when the single-threaded JavaScript event loop becomes blocked by synchronous tasks (e.g., heavy serialization or garbage collection), preventing the processing of I/O callbacks. For a gRPC-based server, this is further complicated by **HTTP/2 flow control windows**.6 If the Bun server does not properly manage window updates, publishers will block, interpreting the delay as network congestion rather than server processing capability.

### **2.3 The "Monolithic" Latency Fallacy**

One unique challenge in benchmarking a local, monolithic implementation is the absence of network latency. In a real Google Cloud environment, a Publish call involves a round-trip time (RTT) of 20-50ms.8 In a local Bun implementation, this RTT is effectively zero (microseconds).  
This creates a risk: The benchmarks might fail to expose concurrency bugs because messages are processed "too fast." A stress test might inadvertently synchronize the publisher and subscriber loops, masking race conditions that would only appear with network jitter. Therefore, the benchmarking strategy must include mechanisms to inject artificial latency (e.g., using toxiproxy or internal sleep delays) to simulate the asynchronous reality of a cloud deployment.

## ---

**3\. The Bun Runtime Environment: Implications for High-Performance Servers**

The choice of Bun as the runtime introduces specific variables into the performance equation. While Bun claims significant speed advantages over Node.js (up to 4x HTTP throughput) 4, its implementation of the gRPC and HTTP/2 stack is newer and historically less stable than the battle-tested Node.js/V8 ecosystem.

### **3.1 JavaScriptCore (JSC) vs. V8 Engine Dynamics**

Bun uses JavaScriptCore (JSC), the engine powering WebKit/Safari, whereas Node.js uses Google's V8.4 This distinction is profound for server-side benchmarking.

- **Optimization Profile:** JSC is traditionally optimized for faster startup times and lower memory footprint, prioritizing the responsiveness required by browser interfaces. V8, conversely, is highly tuned for sustained server-side throughput and aggressive Just-In-Time (JIT) optimization of hot code paths.
- **Garbage Collection (GC):** In a high-throughput Pub/Sub server, millions of short-lived objects (messages) are created and discarded every second. This puts immense pressure on the Garbage Collector. Benchmarks must explicitly monitor for "stop-the-world" GC pauses. While Bun's memory allocator (mimalloc) is fast, JSC's GC behavior under massive object churn might differ from V8, potentially causing latency spikes that look like network issues.4

### **3.2 The node:http2 and gRPC Stability Factor**

Historically, Bun lacked a native gRPC server implementation. It was only in Bun v1.1.31 (October 2024\) that full support for the node:http2 server was released, enabling grpc-js to function correctly on the server side.3  
Prior to this release, developers encountered severe protocol violations, such as the server emitting repeated empty HTTP/2 DATA frames, causing proxies like Envoy to abort connections with PROTOCOL_ERROR.10  
Critical Insight for Benchmarking: The benchmarking strategy effectively serves as a regression test for the Bun runtime itself. The test suite must be designed to detect protocol-level anomalies—such as hanging streams or invalid frame sequences—that are specific to Bun's nascent HTTP/2 implementation. This requires tools that can report detailed transport-level errors, not just HTTP 500 status codes.

### **3.3 Concurrency and Vertical Scaling**

Bun, like Node.js, operates on a single-threaded event loop model. CPU-bound tasks, such as serializing large payloads into Protobuf binary format, will block the loop. Unlike Google’s production Pub/Sub service, which scales horizontally across thousands of servers 2, this monolithic implementation scales vertically.  
Benchmark Implication: The tests must quantify the throughput limit of a single Bun process. This data is essential for capacity planning. If the benchmark reveals that a single instance can handle 5,000 messages per second, and the projected load is 50,000, the "seamless conversion to cloud-based infra" becomes a requirement much sooner than anticipated. Alternatively, the benchmark might validate the use of Bun's cluster module to utilize multiple cores, though this adds complexity to the state management of the Pub/Sub broker.

## ---

**4\. Benchmarking Methodologies and Tool Selection**

To stress test a gRPC-based Pub/Sub server effectively, we require tools that can generate high concurrency, support Protobuf serialization natively, and offer detailed latency histograms. The research identifies three primary candidates: **k6**, **ghz**, and **JMeter**.

### **4.1 Comparative Analysis of Load Testing Tools**

The following table synthesizes the capabilities of these tools specifically for testing a Bun.js Pub/Sub server.

| Feature                | k6 (with xk6-pubsub)                                       | ghz                                                                           | JMeter                                | Google Load Test Framework                    |
| :--------------------- | :--------------------------------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------ | :-------------------------------------------- |
| **Primary Use Case**   | Scenario-based Load Testing                                | Raw Protocol Stress Testing                                                   | Legacy/Enterprise Testing             | Cloud-to-Cloud Comparatives                   |
| **Protocol Support**   | HTTP/WS Native. gRPC via core. Pub/Sub via Go extension.11 | Pure gRPC (Unary & Streaming).12                                              | HTTP/gRPC via plugins.                | Java-based Pub/Sub & Kafka clients.13         |
| **Scripting Language** | JavaScript (ES6). Highly flexible logic.                   | Configuration/CLI only.                                                       | XML / GUI. Rigid.                     | Java (Requires compilation).                  |
| **Performance**        | High (Go-based engine). Simulates thousands of VUs.        | Extremely High (Specialized for gRPC).                                        | Moderate (JVM overhead).              | High (Distributed).                           |
| **Pub/Sub Specifics**  | Can act as a _publisher_ and _subscriber_ simultaneously.  | Excellent for RPC calls, but lacks client-library logic (e.g., flow control). | Complex to setup for async messaging. | Native support, but complex to run locally.14 |
| **Recommendation**     | **Primary Tool**                                           | **Diagnostic Tool**                                                           | Not Recommended                       | Reference Only                                |

### **4.2 The Case for k6 with Extensions**

k6 is the industry standard for modern load testing due to its developer-friendly JS scripting and high-performance Go engine.15 However, standard k6 cannot natively speak the Google Pub/Sub protocol (which wraps gRPC calls with specific authentication, batching, and routing logic).  
To benchmark the Bun server effectively, we must use the xk6-pubsub extension.11 This extension wraps the official Google Cloud Go client for Pub/Sub.  
Why this is crucial: By using the official Go client logic inside the load generator, the test accurately mimics the behavior of production microservices. It respects client-side flow control, batching settings, and gRPC channel management. A raw gRPC test might flood the server in a way no real client ever would, producing useless data.

### **4.3 The Case for ghz**

ghz is a specialized, high-performance gRPC benchmarking tool.12 It interacts directly with the .proto service definition.  
Strategic Use: We recommend ghz as a diagnostic tool. If the k6 benchmarks show high latency, it is difficult to determine if the bottleneck is the Pub/Sub application logic (topic routing) or the Bun runtime's TCP/HTTP2 stack. ghz strips away the Pub/Sub client logic and hammers the raw gRPC endpoints (Publish, Pull). If ghz shows high performance while k6 shows low performance, the issue lies in the application logic. If both are slow, the issue is likely the Bun runtime or the hardware.

### **4.4 Google's Load Test Framework**

Google maintains an open-source load-test-framework specifically for comparing Pub/Sub with Kafka.13 It uses a complex controller-worker architecture designed for distributed deployment on GKE. While authoritative, it is "overkill" for testing a local monolithic repo and is difficult to configure against a local emulator endpoint without significant modification to the Java codebase. k6 offers a much tighter feedback loop.

## ---

**5\. Designing the Test Suite: Scenarios and Workloads**

A generic "load test" is insufficient for a complex system like a message broker. We must define specific workload models that target different potential failure modes of the Bun implementation. These workloads are inspired by the **SPECjms2007** standard, adapted for the Pub/Sub model.1

### **5.1 Workload 1: The "Firehose" (Ingestion Throughput)**

**Objective:** Determine the absolute maximum write throughput the server can handle before backpressure kicks in.

- **Configuration:** 1 Topic, 0 Subscribers.
- **Traffic Pattern:** Constant Arrival Rate (using k6 constant-arrival-rate executor).
- **Message Characteristics:**
  - _Small:_ 1KB (Standard telemetry).
  - _Medium:_ 10KB (User profiles).
  - _Large:_ 1MB (Blobs/Images).
- **Success Metric:** $L\_{pub}$ (Publish Latency) remains \< 50ms at $P99$.
- **Failure Mode:** If latency spikes, the server is failing to deserialize messages fast enough.

### **5.2 Workload 2: The "Fan-Out" (Routing & Copy Overhead)**

**Objective:** Stress test the internal event emitter and memory copying mechanisms.

- **Configuration:** 1 Topic, 50 Subscribers.
- **Traffic Pattern:** Moderate publish rate (e.g., 100 msg/s), but high consumption.
- **Total System Throughput:** $100 \\text{ in} \\times 50 \\text{ out} \= 5,000 \\text{ operations/sec}$.
- **Success Metric:** $L\_{e2e}$ (End-to-End Latency) remains \< 100ms.
- **Bun Specifics:** This tests if Bun's internal EventEmitter implementation becomes a bottleneck ($O(N)$ or worse) when iterating through subscriber lists.

### **5.3 Workload 3: The "Soak Test" (Memory Stability)**

**Objective:** Detect memory leaks in the JavaScriptCore engine or the application code.

- **Configuration:** Sustained load (50% of max throughput) for a long duration (4–8 hours).
- **Logic:** Publishers send messages; Subscribers acknowledge them immediately.
- **Success Metric:** RAM usage (RSS) must plateau. If it grows linearly, the server has a leak—common in event-driven Node/Bun apps where closures retain references to sockets or message buffers.

### **5.4 Workload 4: The "Thundering Herd" (Connection Storms)**

**Objective:** Test the robustness of the Bun HTTP/2 handshake and TLS negotiation (if enabled).

- **Traffic Pattern:** 1,000 Virtual Users (VUs) connecting simultaneously, publishing one message, and disconnecting.
- **Context:** 8 highlights that gRPC connection establishment is expensive.
- **Failure Mode:** EMFILE (Too many open files) errors, or ETIMEDOUT. This verifies that the server cleans up file descriptors and manages the accept() queue correctly.

## ---

**6\. Implementation Guide: Benchmarking the Bun Server**

This section provides a practical, step-by-step guide to implementing the recommended benchmarking strategy using **k6** and the **xk6-pubsub** extension.

### **6.1 Infrastructure Isolation**

To ensure the benchmark measures the _server_ and not the _load generator_, the SUT (System Under Test) and the Load Generator must effectively be isolated.

- **Ideal:** Two separate physical machines or VMs connected via high-speed LAN.
- **Acceptable (Local):** Use Docker with CPU pinning. Assign specific CPU cores to the Bun server and different cores to the k6 container to prevent context-switching contention.

### **6.2 Building the Custom k6 Binary**

Since standard k6 does not support Pub/Sub, you must compile a custom binary using xk6.

Bash

\# 1\. Install the xk6 builder (requires Go)  
go install go.k6.io/xk6/cmd/xk6@latest

\# 2\. Build k6 with the pubsub extension  
\# We use the 'olvod/xk6-pubsub' extension as a base  
xk6 build \--with github.com/olvod/xk6-pubsub@latest

\# 3\. Verify installation  
./k6 version

### **6.3 Developing the Benchmark Script**

The following k6 script implements the "Firehose" workload. It uses the constant-arrival-rate executor to fix the throughput, allowing us to measure the resulting latency.

JavaScript

// benchmark.js  
import pubsub from 'k6/x/pubsub';  
import { check } from 'k6';  
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Initialize Publisher Client  
// Points to the local Bun emulator via PUBSUB_EMULATOR_HOST logic  
const client \= pubsub.Publisher({  
 projectID: "benchmark-project",  
 // Credentials are mocked for emulator  
 credentials: '{"type": "service_account", "project_id": "benchmark-project"}',  
 publishTimeout: 10,  
 debug: false  
});

// Test Configuration  
export const options \= {  
 scenarios: {  
 firehose: {  
 executor: 'constant-arrival-rate',  
 rate: 1000, // Target: 1000 messages/sec  
 timeUnit: '1s',  
 duration: '5m',  
 preAllocatedVUs: 50,  
 maxVUs: 100,  
 },  
 },  
 thresholds: {  
 // SLO: 99% of publishes must succeed  
 'checks': \['rate\>0.99'\],  
 // SLO: 95% of publishes must complete within 50ms  
 'pubsub_publish_duration': \['p(95)\<50'\],  
 }  
};

const topicName \= "projects/benchmark-project/topics/load-test";  
const payloadSize \= 1024; // 1KB  
const payload \= randomString(payloadSize);

export default function () {  
 // The client uses the Google Go library internally, managing gRPC connections  
 const err \= client.publish(topicName, payload);

check(err, {  
 'published successfully': (e) \=\> e \=== null,  
 });  
}

### **6.4 Execution and Monitoring**

Run the Bun server in one terminal, ensuring PUBSUB_EMULATOR_HOST is set if required by your implementation logic (or simple port binding).

Bash

\# Terminal 1: Run Bun Server  
\# Use \--smol if testing memory constrained environments  
bun run \--smol server.ts

\# Terminal 2: Run Benchmark  
export PUBSUB_EMULATOR_HOST=localhost:8085  
./k6 run benchmark.js

While the test runs, use an external monitoring tool (like top, htop, or Bun's built-in profiler if available) to watch the server process.

- **High CPU \+ Low Throughput:** Indicates inefficient serialization or heavy logic per message.
- **Low CPU \+ High Latency:** Indicates blocking I/O or await chains that are starving the event loop.

### **6.5 Diagnostic Stress Testing with ghz**

If k6 reveals performance issues, use ghz to verify if the gRPC transport layer is the culprit.

Bash

\# Run against the raw gRPC port  
ghz \\  
 \--proto./protos/pubsub.proto \\  
 \--call google.pubsub.v1.Publisher.Publish \\  
 \--insecure \\  
 \--concurrency 50 \\  
 \--total 20000 \\  
 \--data-file payload.json \\  
 localhost:8085

This isolates the Bun node:http2 implementation. If ghz reports transport error or stream closed, the issue is likely a bug in Bun's http2 implementation (e.g., the empty frame issue mentioned in 10).

## ---

**7\. Advanced Considerations for Bun.js**

### **7.1 The "Empty Frame" and HTTP/2 Stability**

Research indicates that early versions of Bun's gRPC server had critical stability issues, specifically emitting empty HTTP/2 frames that caused clients to disconnect.10 This was largely addressed in Bun v1.1.31.3  
Action Item: The benchmarking report serves as a validation gate for the Bun version. You must ensure your package.json locks the Bun version to \>= 1.1.31. If you observe PROTOCOL_ERROR in your k6 results, this is the smoking gun.

### **7.2 Memory Optimization (--smol)**

Bun provides a \--smol flag designed to reduce memory usage for constrained environments.18  
Hypothesis: Enabling \--smol might increase GC frequency, thereby increasing tail latency ($P99$) while preventing Out-Of-Memory (OOM) crashes during soak tests.  
Test: Run the Soak Test twice—once with \--smol and once without. Compare the RSS memory graph against the Latency P99 graph. This will inform the recommendation for the production runtime configuration.

### **7.3 Garbage Collection Tuning**

In a Pub/Sub system, the object allocation rate is massive. V8 (Node.js) has a highly tunable GC (generational layout). JSC (Bun) is less tunable by the user.  
Observation Strategy: Look for "Sawtooth" patterns in your latency graphs. A slow rise in latency followed by a sharp drop usually indicates memory accumulation followed by a major GC pause. If these pauses exceed your SLO (e.g., \>100ms), the monolithic implementation might struggle with high throughput regardless of code quality.

## ---

**8\. Transitioning to Cloud Infrastructure**

The ultimate goal is to "seamlessly convert to cloud-based infra." The benchmark strategy must therefore support this transition.

### **8.1 Docker Container Benchmarking**

Benchmarks should not just run on "bare metal" (the developer's laptop). They must run against the Dockerized version of the Bun server.  
Why: Cloud Run and Kubernetes impose cgroups limits (CPU quotas). Bun might behave differently when restricted to 1 vCPU.  
Technique: Run the k6 tests against a Docker container limited to 1 CPU and 512MB RAM.

Bash

docker run \--cpus="1.0" \--memory="512m" \-p 8085:8085 my-bun-pubsub

This data provides the "sizing guide" needed for the future Cloud Run deployment YAML.

### **8.2 Network Latency Simulation**

To prevent the "local speed" bias, introduce toxiproxy between k6 and the Bun server.

Bash

\# Add 30ms latency (typical intra-region cloud latency)  
toxiproxy-cli create pubsub_proxy \-l localhost:8474 \-u localhost:8085  
toxiproxy-cli toxic add pubsub_proxy \-t latency \-a latency=30

Running the benchmark through this proxy will reveal race conditions in the client/server acknowledgment logic that only appear when messages are delayed.

## ---

**9\. Conclusion and Roadmap**

The creation of a Bun.js-based Pub/Sub server is a viable architectural choice that can significantly accelerate development velocity. However, its reliability is contingent upon rigorous validation of the underlying runtime's gRPC capabilities. By adopting a tiered benchmarking strategy—using **k6** for realistic workload emulation and **ghz** for protocol stress testing—you can mathematically demonstrate the system's readiness.

### **9.1 Summary of Recommendations**

1. **Tooling:** Standardize on **k6** with the xk6-pubsub extension for all CI/CD performance tests.
2. **Runtime:** Mandate **Bun v1.1.31+** to mitigate known HTTP/2 server bugs.
3. **Workloads:** Implement "Firehose" (throughput), "Fan-out" (routing), and "Soak" (stability) scenarios as automated regression tests.
4. **Configuration:** Benchmark the Docker container with explicit CPU/RAM limits to generate accurate capacity planning data for the eventual Cloud Run migration.

This framework transforms performance from an afterthought into a quantified feature of your monolithic repository, ensuring that the inevitable scaling to the cloud is driven by data, not emergencies.

### **References**

- 1  
  Benchmarking Publish/Subscribe Systems (SPECjms).
- 2  
  Google Cloud Pub/Sub Architecture & Performance Metrics.
- 4  
  Bun vs Node.js Performance Comparison.
- 10  
  Bun gRPC HTTP/2 Empty Frame Issue.
- 18  
  Bun Memory Optimization (--smol).
- 3  
  Bun v1.1.31 Release Notes (gRPC Server Support).
- 11  
  xk6-pubsub Extension for k6.
- 12  
  ghz gRPC Benchmarking Tool.

#### **Works cited**

1. (PDF) Benchmarking Publish/Subscribe-Based Messaging Systems \- ResearchGate, accessed January 16, 2026, [https://www.researchgate.net/publication/220787976_Benchmarking_PublishSubscribe-Based_Messaging_Systems](https://www.researchgate.net/publication/220787976_Benchmarking_PublishSubscribe-Based_Messaging_Systems)
2. Architectural overview of Pub/Sub \- Google Cloud Documentation, accessed January 16, 2026, [https://docs.cloud.google.com/pubsub/architecture](https://docs.cloud.google.com/pubsub/architecture)
3. Bun v1.1.31 | Bun Blog, accessed January 16, 2026, [https://bun.com/blog/bun-v1.1.31](https://bun.com/blog/bun-v1.1.31)
4. Bun vs Node.js 2025: Performance, Speed & Developer Guide \- Strapi, accessed January 16, 2026, [https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide)
5. Load testing best practices | Cloud Run \- Google Cloud Documentation, accessed January 16, 2026, [https://docs.cloud.google.com/run/docs/about-load-testing](https://docs.cloud.google.com/run/docs/about-load-testing)
6. gRPC on HTTP/2 Engineering a Robust, High-performance Protocol, accessed January 16, 2026, [https://grpc.io/blog/grpc-on-http2/](https://grpc.io/blog/grpc-on-http2/)
7. Why gRPC Uses HTTP2 \- Arpit Bhayani, accessed January 16, 2026, [https://arpitbhayani.me/blogs/grpc-http2/](https://arpitbhayani.me/blogs/grpc-http2/)
8. telecom-mas-agent vs Google Pub/Sub: A Performance Deep Dive \- DZone, accessed January 16, 2026, [https://dzone.com/articles/telecom-mas-agent-vs-google-pubsub-performance-analysis](https://dzone.com/articles/telecom-mas-agent-vs-google-pubsub-performance-analysis)
9. Bun: Redefining JavaScript Runtimes with Speed and Efficiency \- Peerlist, accessed January 16, 2026, [https://peerlist.io/jagss/articles/bun-122-a-deep-dive-into-how-it-works-and-why-its-better-tha](https://peerlist.io/jagss/articles/bun-122-a-deep-dive-into-how-it-works-and-why-its-better-tha)
10. @grpc/grpc-js server on Bun emits repeated empty HTTP/2 DATA frames and no trailers; Envoy aborts with PROTOCOL_ERROR · Issue \#21759 · oven-sh/bun \- GitHub, accessed January 16, 2026, [https://github.com/oven-sh/bun/issues/21759](https://github.com/oven-sh/bun/issues/21759)
11. olvod/xk6-pubsub: A k6 extension for Google PubSub. \- GitHub, accessed January 16, 2026, [https://github.com/olvod/xk6-pubsub](https://github.com/olvod/xk6-pubsub)
12. Usage · ghz, accessed January 16, 2026, [https://ghz.sh/docs/usage](https://ghz.sh/docs/usage)
13. GoogleCloudPlatform/pubsub: This repository contains open-source projects managed by the owners of Google Cloud Pub/Sub. \- GitHub, accessed January 16, 2026, [https://github.com/GoogleCloudPlatform/pubsub](https://github.com/GoogleCloudPlatform/pubsub)
14. github.com, accessed January 16, 2026, [https://github.com/GoogleCloudPlatform/pubsub/tree/master/load-test-framework](https://github.com/GoogleCloudPlatform/pubsub/tree/master/load-test-framework)
15. Load Testing Tools for Node.js developers | by V. Checha \- Medium, accessed January 16, 2026, [https://v-checha.medium.com/load-testing-tools-for-node-js-developers-98291ed75a4b](https://v-checha.medium.com/load-testing-tools-for-node-js-developers-98291ed75a4b)
16. Grafana k6: Load testing for engineering teams, accessed January 16, 2026, [https://k6.io/](https://k6.io/)
17. Package cloud.google.com/go/pubsub/loadtest (v1.50.1) | Go client libraries | Google Cloud Documentation, accessed January 16, 2026, [https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/pubsub/latest/loadtest](https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/pubsub/latest/loadtest)
18. MCP Bun Server \- LobeHub, accessed January 16, 2026, [https://lobehub.com/mcp/carlosedp-mcp-bun](https://lobehub.com/mcp/carlosedp-mcp-bun)
19. MCP Bun Server \- LobeHub, accessed January 16, 2026, [https://lobehub.com/it/mcp/carlosedp-mcp-bun](https://lobehub.com/it/mcp/carlosedp-mcp-bun)
