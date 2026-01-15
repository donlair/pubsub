# Rule: Event-Driven Architecture

## Purpose

Define patterns for event-driven architecture using Node.js EventEmitter. The Subscription class uses events for message delivery, matching Google Pub/Sub's streaming pull API.

## Critical Rules

1. **Emit Errors, Never Throw** - EventEmitter methods must emit errors via `error` event, never throw. Missing error listeners crash the process.

2. **Emit Asynchronously** - Use `setImmediate` to prevent blocking when emitting events.

3. **Always Provide Error Listener** - Always attach an error listener to prevent crashes.

## Event Types

Subscription provides type-safe event methods:
- `on('message', listener)` - Receives messages for processing
- `on('error', listener)` - Required error handler (crashes if missing)
- `on('close', listener)` - Notification when subscription closes

## Reference

See `docs/event-driven-patterns.md` for:
- Type-safe event overload implementation
- Complete usage examples with code
- Streaming pull implementation patterns
- Flow control with EventEmitters
- Message ordering implementation
- Listener management and cleanup
- Error handling in listeners
- Testing event-driven code
- Implementation checklist
