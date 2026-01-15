# Rule: Testing with Bun

## Purpose

Define testing conventions using Bun's built-in test runner. All tests must be written following Test-Driven Development (TDD) - write tests BEFORE implementation.

See `docs/testing-patterns.md` for detailed test patterns and examples.

## TDD Workflow

Write test first, run (should fail), implement minimal solution, refactor, repeat. Never write implementation before tests.

## Test File Naming and Location

- **Unit tests**: `tests/unit/<component>.test.ts` - Single component, mocked dependencies, <100ms
- **Integration tests**: `tests/integration/<feature>.test.ts` - Multiple components, minimal mocks
- **Compatibility tests**: `tests/compatibility/<api>-compat.test.ts` - Google API compatibility verification

## Test Organization

Use Arrange-Act-Assert pattern: Set up preconditions, execute code, verify results.

## Test Coverage Goals

- **90%+ line coverage** for all source code
- **100% coverage** for public API methods
- **All edge cases** tested
- **All error conditions** tested

## Running Tests

```bash
bun test                              # Run all tests
bun test tests/unit/topic.test.ts    # Run specific file
bun test --watch                      # Watch mode
```

## Best Practices

1. **Write tests first** (TDD) - Always write test before implementation
2. **One assertion per test** - Keep tests focused
3. **Clear test names** - Describe what is being tested
4. **Arrange-Act-Assert** - Structure tests clearly
5. **Independent tests** - Each test should work in isolation
6. **Fast tests** - Keep unit tests under 100ms
7. **Always await** - Never forget await on async operations
8. **Clean up** - Use afterEach to clean up resources
9. **Test errors** - Test error conditions, not just happy path
10. **Descriptive failures** - Assertions should give clear failure messages

## Checklist

Before committing:
- [ ] All tests pass (`bun test`)
- [ ] Tests written BEFORE implementation (TDD)
- [ ] All acceptance criteria from specs are tested
- [ ] Error conditions are tested
- [ ] Edge cases are covered
- [ ] Integration tests verify end-to-end behavior
- [ ] Tests are independent and can run in any order
- [ ] Test names clearly describe what is being tested
