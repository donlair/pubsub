# Rule: Error Handling

## Purpose

Define consistent error handling patterns matching Google Cloud Pub/Sub. Use gRPC status codes and provide clear, actionable messages.

## Error Code System (Contract)

```typescript
export enum ErrorCode {
  OK = 0, CANCELLED = 1, UNKNOWN = 2, INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4, NOT_FOUND = 5, ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7, RESOURCE_EXHAUSTED = 8, FAILED_PRECONDITION = 9,
  ABORTED = 10, OUT_OF_RANGE = 11, UNIMPLEMENTED = 12, INTERNAL = 13,
  UNAVAILABLE = 14, DATA_LOSS = 15, UNAUTHENTICATED = 16
}
```

## Key Principles

- **Use specific error types** - NotFoundError, InvalidArgumentError, etc. (never generic Error)
- **Include gRPC codes** - Every error must have a code from ErrorCode enum
- **Be specific in messages** - `Topic not found: projects/x/topics/y` not `Not found`
- **Include context** - Pass `details` object with relevant data
- **Provide guidance** - Suggest solutions when possible (especially UnimplementedError)
- **Promises throw** - Throw errors in async functions, they become rejected promises
- **EventEmitters emit** - Emit `error` event, never throw
- **Require error listeners** - Always provide error listener on EventEmitters
- **Wrap internal errors** - Use InternalError to provide context
- **Test all errors** - Test error conditions and verify codes
- **Document errors** - Use JSDoc @throws for all error conditions

## Common Error Scenarios

| Error Type | Code | When to Use |
|------------|------|-------------|
| `NotFoundError` | 5 | Resource doesn't exist (topic, subscription) |
| `AlreadyExistsError` | 6 | Resource already exists on create |
| `InvalidArgumentError` | 3 | Bad input (non-Buffer data, invalid attributes, empty name) |
| `ResourceExhaustedError` | 8 | Flow control limits exceeded |
| `UnimplementedError` | 12 | Feature not yet supported |
| `InternalError` | 13 | Unexpected internal failures |

**Retryable codes**: UNAVAILABLE(14), DEADLINE_EXCEEDED(4), RESOURCE_EXHAUSTED(8), ABORTED(10), INTERNAL(13)

## Do/Don't

**Do:**
- Use specific error types with gRPC codes
- Provide clear, specific messages with context
- Emit errors in EventEmitters (never throw)
- Wrap internal errors with InternalError
- Test all error conditions
- Document errors in JSDoc

**Don't:**
- Use generic `Error` class
- Throw errors in EventEmitter methods
- Write vague messages like "Not found"
- Forget to provide error listener on EventEmitters

## Implementation Details

See `docs/error-handling-patterns.md` for:
- Error class hierarchy implementation
- When to throw errors (examples for validation, resources, flow control)
- Async error handling (Promises vs EventEmitters)
- Retryable errors logic and implementation
- Testing errors examples
- JSDoc documentation examples
- Error message pattern examples
- Complete error handling examples
