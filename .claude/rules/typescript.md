# Rule: TypeScript

## Purpose

Enforce strict TypeScript practices and ensure 100% type compatibility with `@google-cloud/pubsub`.

## Config

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Strict Rules

- **Never use `any`** - Use `unknown` with type narrowing instead
- **Explicit return types** - All public API methods must declare return types
- **Null/undefined handling** - Use optional chaining (`?.`) and nullish coalescing (`??`)
- **Property initialization** - Initialize all properties or use definite assignment (`!`)

## API Compatibility

Types must match `@google-cloud/pubsub` exactly for drop-in compatibility:

- **Match signatures exactly** - Same method names, parameters, return types
- **Tuple returns** - Admin operations return `[result, metadata]` tuples
- **EventEmitter overloads** - Type-safe event method overloads
- **Export all public types** - Export classes and type definitions
- **Document defaults** - Inline comments for default values in interfaces

## Verification

```bash
bun run tsc --noEmit  # Must compile with zero errors
```

## Reference

See `docs/typescript-patterns.md` for detailed type patterns and examples:
- Type guards, discriminated unions, branded types
- Readonly types, const assertions, error types
- API compatibility code examples
- Quick reference with usage examples
