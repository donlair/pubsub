---
description: Node-compatible Google Pub/Sub library implementation using Bun, TDD, and Ralph Wiggum methodology
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

# Project: Node-Compatible Google Pub/Sub Library

This project implements a drop-in compatible Pub/Sub library that matches Google Cloud Pub/Sub API for seamless migration from local development to cloud scale.

## Project Status

**Phase**: Specifications Complete → Ready for Implementation
- ✅ Architecture designed (event-driven, in-memory message queue)
- ✅ Specifications written (10 specs with acceptance criteria)
- ✅ Technical rules defined (8 rule files)
- ⏳ Implementation (next phase)

## Core Principles

**1. Test-Driven Development (TDD)**
- ❌ NEVER write implementation code before tests
- ✅ ALWAYS write tests first that define the expected behavior
- ✅ Tests must pass using the real `@google-cloud/pubsub` API as reference
- ✅ Implementation written to make tests pass

**2. API Compatibility**
- ✅ Must match `@google-cloud/pubsub` v5.2.0+ API exactly
- ✅ All type signatures must be compatible
- ✅ All method behaviors must match official SDK
- ✅ Reference `research/` documentation for verified API details

## Architecture Overview

**Design**: Event-driven, in-memory message broker with API-compatible facade

**Key Components**:
- **PubSub Client**: Main entry point, factory for topics/subscriptions
- **Topic**: Publishing interface with batching via Publisher
- **Subscription**: EventEmitter for streaming message delivery
- **Message**: Received message with ack/nack functionality
- **Publisher**: Batching and flow control for publishing
- **MessageQueue**: Internal singleton broker for message routing
- **MessageStream**: Streaming pull implementation with flow control

**Trade-offs**:
- ✅ Zero latency, instant setup, no cloud dependencies
- ✅ Perfect API compatibility for seamless migration
- ✅ Simple mental model for developers
- ❌ No persistence (acceptable for dev/test use case)
- ❌ Single-process only (acceptable for local development)

## Specifications

**Location**: `specs/` folder

All functional requirements are documented as specifications with acceptance criteria:

- `specs/SPECS.md` - Overview and index
- `specs/01-pubsub-client.md` - PubSub client (factory methods, admin APIs)
- `specs/02-topic.md` - Topic (17 methods, publishing, lifecycle)
- `specs/03-subscription.md` - Subscription (14 methods, event streaming)
- `specs/04-message.md` - Message (properties, ack/nack, deadlines)
- `specs/05-publisher.md` - Publisher (batching, flow control)
- `specs/06-subscriber.md` - Subscriber (streaming pull, flow control)
- `specs/07-message-queue.md` - MessageQueue (internal broker)
- `specs/08-schema.md` - Schema (JSON validation, AVRO/Protobuf stubs)
- `specs/09-ordering.md` - Message ordering (ordered delivery guarantees)

Each spec includes:
- **Purpose**: What problem it solves
- **API Surface**: All public methods, properties, types
- **Behavior Requirements**: Detailed behavioral requirements
- **Acceptance Criteria**: Testable code examples (use these for TDD)
- **Dependencies**: What it depends on
- **Examples**: Real-world usage patterns

## Technical Rules

**Location**: `.claude/rules/` folder

All technical implementation guidelines (the "how" to build):

- `00-auto-commit.md` - Automatic git commits with Conventional Commits
- `01-file-organization.md` - Directory structure and file naming
- `typescript-strict.md` - Strict TypeScript rules and patterns
- `typescript-types.md` - API-compatible type definitions
- `testing-bun.md` - TDD workflow with Bun test
- `api-compatibility.md` - Google Pub/Sub API matching requirements
- `error-handling.md` - Error codes (gRPC status codes) and error classes
- `event-driven.md` - EventEmitter patterns for Subscription





Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

## TypeScript Requirements

- ✅ Strict TypeScript mode enabled
- ✅ All types must match official `@google-cloud/pubsub` types
- ✅ No `any` types (use `unknown` if truly needed)
- ✅ Full type safety and inference
- ✅ Export all public interfaces

## Testing Requirements

- ✅ Use `bun test` for all testing
- ✅ Test file naming: `*.test.ts` or `*.spec.ts`
- ✅ Tests should validate API compatibility with Google Pub/Sub
- ✅ Include integration tests where appropriate
- ✅ Mock external dependencies, never real Google Cloud
- ✅ **TDD**: Write tests BEFORE implementation (non-negotiable)

## Research Documentation

**IMPORTANT:** Before implementing any feature, consult `research/` folder:
- All API behaviors documented and verified (98/100 quality)
- All default values cross-checked against official SDK
- All method signatures validated
- 250+ working code examples

Key research files:
- `research/11-typescript-types.md` - All TypeScript interfaces
- `research/02-topic-api.md` - Topic class (17 methods)
- `research/03-subscription-api.md` - Subscription class (14 methods)
- `research/04-message-api.md` - Message class (9 properties, 5 methods)
- `research/06-publisher-config.md` - Publisher batching/flow control
- `research/07-subscriber-config.md` - Subscriber configuration

## Bun Usage

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

**Verify quality?**
```bash
bun run tsc --noEmit  # TypeScript compiles
bun test              # All tests pass
git log --oneline     # Tests written before implementation
```
