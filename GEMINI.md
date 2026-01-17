# Gemini Context: Node-Compatible Google Pub/Sub Library

## Project Overview
This project is a high-fidelity, Node-compatible implementation of the Google Cloud Pub/Sub API (`@google-cloud/pubsub`). It is designed to allow projects to start as fully self-contained monoliths (using this library locally) and seamlessly migrate to actual Google Cloud Pub/Sub when scaling, without code changes.

**Key Goals:**
- **100% API Compatibility:** Matches `@google-cloud/pubsub` v5.2.0+.
- **Local First:** In-memory, event-driven message broker (no external dependencies like Emulator needed for dev).
- **TypeScript Native:** Built with strict TypeScript.

## Current Status (as of Jan 15, 2026)
- **Core Functionality:** 100% Complete (Phases 1-10).
- **Test Coverage:** 100% (486/486 tests passing).
- **Remaining Work:** Mostly low-priority documentation and edge-case integration tests (see `IMPLEMENTATION_PLAN.md`).

## Architecture
The system mimics the Google Cloud Pub/Sub architecture but runs entirely in-memory.

### Core Components (`src/`)
- **`PubSub` (`src/pubsub.ts`):** The main entry point and factory for topics/subscriptions.
- **`Topic` (`src/topic.ts`):** Handles message publishing. Uses `Publisher` internally for batching/flow control.
- **`Subscription` (`src/subscription.ts`):** Handles message consumption. Uses `Subscriber` internally for streaming/flow control.
- **`Message` (`src/message.ts`):** Represents a Pub/Sub message with `ack()` and `nack()` methods.

### Internal Machinery (`src/internal/`, `src/publisher/`, `src/subscriber/`)
- **`MessageQueue` (`src/internal/message-queue.ts`):** A singleton, in-memory message broker that routes messages from Publishers to Subscriptions.
- **`Publisher` (`src/publisher/publisher.ts`):** Handles batching, flow control, and ordering keys for topics.
- **`MessageStream` (`src/subscriber/message-stream.ts`):** Manages the streaming of messages to subscribers, handling flow control and concurrency.

## Tech Stack & Tools
- **Runtime:** [Bun](https://bun.sh) (v1.1+)
- **Language:** TypeScript (Strict mode)
- **Linter/Formatter:** [Biome](https://biomejs.dev)
- **Testing:** `bun test`

## Development Workflow

### Key Commands
| Command | Description |
| --- | --- |
| `bun run verify` | **Primary Command.** Runs typecheck, lint, and all tests. Run this before committing. |
| `bun test` | Runs the test suite. |
| `bun run typecheck` | Runs TypeScript compiler checks (`tsc --noEmit`). |
| `bun run lint:fix` | Auto-fixes linting and formatting issues with Biome. |

### Coding Conventions
- **TDD:** Write tests *before* implementation.
- **Comments:**
    - **No inline comments** unless explaining complex "why".
    - **JSDoc** required for all public APIs (classes, methods, interfaces).
- **Error Handling:**
    - Never use generic `Error`. Use `InternalError` (or specific types in `src/types/errors.ts`) with gRPC status codes.
- **Bun APIs:** Prefer `Bun.file`, `Bun.write`, etc., over Node `fs` APIs where possible, though Node compatibility is also maintained for the library's consumers.

## File Structure Highlights
- `specs/`: Detailed architectural specifications (start here to understand behavior).
- `research/`: Detailed analysis of the official Google Cloud Pub/Sub behavior.
- `tests/`:
    - `unit/`: Isolated tests for components.
    - `integration/`: Tests interaction between components (e.g., Topic -> Queue -> Subscription).
    - `compatibility/`: Tests ensuring behavior matches Google's official SDK.
