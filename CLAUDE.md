---
description: Node-compatible Google Pub/Sub library implementation using Bun, TDD, and Ralph Wiggum methodology
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

# Project: Node-Compatible Google Pub/Sub Library

This project implements a drop-in compatible Pub/Sub library that matches Google Cloud Pub/Sub API for seamless migration from local development to cloud scale.

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

## Verification

**IMPORTANT: Run `bun run verify` after making changes to ensure correctness.**

```bash
bun run verify        # Runs typecheck + lint + tests (use this!)
```

Individual checks if needed:
```bash
bun run typecheck     # TypeScript type checking
bun run lint          # Biome linting
bun run lint:fix      # Auto-fix lint issues
bun test              # Run tests
```

## Code style
#### Rule: Comments
- **No inline comments** - NO inline comments. NO comments inside functions unless absolutely necessary for clarity.
- **JSDoc for public APIs** - When it adds value, not for obvious methods
- **Explain why, not what** - Comment reasoning, not mechanics
