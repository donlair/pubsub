# Implementation Plan: PR #2 Review Findings

## Summary

This plan addresses findings from the PR #2 code review documented in FINDINGS.md. The review identified **4 critical issues**, **12 important issues**, and several suggestions across 34 files (+3936/-401 lines). Issues are prioritized by severity with critical fixes first.

**Branch:** `implement-spec-gaps`
**Source:** `FINDINGS.md`

---

## Phase 1: Critical Fixes

### 1.1 Add Error Handling to Periodic Cleanup Timer

- [ ] Add try-catch to `startPeriodicCleanup()` timer callback
  - Location: `src/internal/message-queue.ts:739-744`
  - Gap: `runCleanup()` errors propagate silently, potentially stopping cleanup permanently
  - Fix: Wrap in try-catch with `console.error` logging
  - Spec: Error handling rules in `.claude/rules/error-handling.md`

### 1.2 Add Error Logging to Message Stream Stop

- [ ] Log errors in stream timeout stop handler
  - Location: `src/subscriber/message-stream.ts:143`
  - Gap: `this.stop().catch(() => {})` completely swallows errors
  - Fix: Add `console.error` logging before swallowing
  - Spec: Error handling rules

### 1.3 Fix Cleanup NACK Error Handling

- [ ] Check specific error types during cleanup nack operations
  - Location: `src/subscriber/message-stream.ts:215-228`
  - Gap: ALL errors caught and ignored, not just expired-lease errors
  - Fix: Only ignore `InvalidArgumentError`, log unexpected errors
  - Spec: Error handling rules

### 1.4 Remove Inline Comments Violating CLAUDE.md Rules

- [ ] Remove inline comments from `src/subscriber/ack-manager.ts`
  - Gap: 8 instances of `// Errors handled per promise` comments
  - Fix: Remove all inline comments, move necessary info to JSDoc

- [ ] Remove inline comments from `src/subscriber/message-stream.ts`
  - Gap: 3 inline comments (API compatibility note, cleanup comments)
  - Fix: Move API compatibility note to JSDoc on affected property

- [ ] Remove inline comments from `src/internal/message-queue.ts`
  - Gap: ~50 inline comments throughout the file
  - Fix: Remove all inline comments; spec reference comments (BR-XXX) can be moved to JSDoc if needed
  - Note: This is the largest file with most violations

---

## Phase 2: Important Error Handling Fixes

### 2.1 Reject with NotFoundError When Topic Deleted Mid-Publish

- [ ] Change topic-deleted handling from silent resolve to rejection
  - Location: `src/publisher/publisher.ts:514-532`
  - Gap: Promises resolve with empty string `''` when topic is deleted
  - Fix: Reject all promises with `NotFoundError`
  - Spec: Error handling rules - "Use specific error types"

### 2.2 Add Warning Log for FailedPreconditionError in ack/nack

- [ ] Add `console.warn` before silent return in `ack()` method
  - Location: `src/message.ts:118-127`
  - Gap: `FailedPreconditionError` silently swallowed, user thinks ack succeeded
  - Fix: Add warning log before return

- [ ] Add `console.warn` before silent return in `nack()` method
  - Location: `src/message.ts:133-146`
  - Gap: Same issue as ack()
  - Fix: Add warning log before return

### 2.3 Fix modAckWithResponse Error Classification

- [ ] Match error handling pattern from `ackWithResponse`
  - Location: `src/message.ts:230-237`
  - Gap: All errors mapped to `AckResponses.Invalid` regardless of type
  - Fix: Distinguish `InvalidArgumentError` → Invalid, `FailedPreconditionError` → FailedPrecondition, others → Other
  - Spec: `specs/04-message.md` AC-011 through AC-013

### 2.4 Add Warning for DLQ Routing Failures

- [ ] Log warning when dead letter topic doesn't exist
  - Location: `src/internal/message-queue.ts:674-681`
  - Gap: Message silently dropped if DLQ topic missing
  - Fix: Add `console.warn` with message ID and topic name

---

## Phase 3: Test Coverage

### 3.1 Add AckManager Batch Error Propagation Test

- [ ] Create test for batch failure mid-iteration
  - Location: New test in `tests/unit/ack-manager.test.ts`
  - Gap: No test for when one ack in batch fails
  - Test: Mock `queue.ack` to fail on specific ackId, verify all promises rejected
  - Spec: FINDINGS.md Issue #11

### 3.2 Add Subscription-Deleted-Mid-Flight Test

- [ ] Create test for ack after subscription deletion
  - Location: New test in `tests/unit/subscription.test.ts` or integration test
  - Gap: No test for: pull message → delete subscription → ack
  - Test: Should throw `FailedPreconditionError` with code 9
  - Spec: FINDINGS.md Issue #12

### 3.3 Add MessageStream stop() NACK Behavior Test

- [ ] Create test for NACK behavior on stop with pending messages
  - Location: New test in `tests/unit/subscriber.test.ts`
  - Gap: No test verifying pending messages (held by flow control) are nacked
  - Test: Start stream with flow control, publish messages, stop with NACK, verify all messages back in queue
  - Spec: FINDINGS.md Issue #13

### 3.4 Add Timer-Triggered Batch Error Handling Test

- [ ] Create test for timer-triggered publish failure
  - Location: New test in `tests/unit/publisher.test.ts`
  - Gap: No test for when timer-triggered batch fails
  - Test: Create publisher with maxMilliseconds timer, mock queue.publish to fail, verify promises rejected
  - Spec: FINDINGS.md Issue #14

---

## Phase 4: Type Design and Documentation

### 4.1 Refactor Batch Type to Single Array

- [ ] Replace parallel arrays with single array of objects
  - Location: `src/subscriber/ack-manager.ts:5-9`
  - Gap: Parallel `ackIds[]` and `promises[]` arrays are fragile pattern
  - Fix: Create `PendingAck { ackId, resolve, reject }` and use `pending: PendingAck[]`
  - Note: This is a refactor - ensure tests pass after change

### 4.2 Remove Unused _subscriptionName Parameter

- [ ] Remove or use the `_subscriptionName` parameter
  - Location: `src/subscriber/ack-manager.ts:18`
  - Gap: Parameter accepted but never used
  - Fix: Either remove parameter or add logging/tracing that uses it
  - Note: May require updating all call sites if removed

### 4.3 Fix Pagination Documentation Accuracy

- [ ] Update PageOptions documentation to reflect actual behavior
  - Location: `src/types/common.ts:104, 126`
  - Gap: Docs say pagination "may be used" but it's NOT currently implemented
  - Fix: Update to: "Pagination options are accepted for API compatibility but are NOT currently implemented. All list operations return complete datasets."

### 4.4 Add AckManager Class JSDoc

- [ ] Add comprehensive JSDoc to AckManager class
  - Location: `src/subscriber/ack-manager.ts:11`
  - Gap: Class has no JSDoc explaining its purpose
  - Fix: Add JSDoc describing batching behavior, error semantics, and usage

---

## Verification

After completing all phases, run:

```bash
bun run verify  # Runs typecheck + lint + tests
```

All checks must pass before merging.

---

## Priority Order

| Priority | Phase | Items | Effort |
|----------|-------|-------|--------|
| P0 | 1.1-1.4 | Critical fixes (error handling + inline comments) | Medium |
| P1 | 2.1-2.4 | Important error handling fixes | Low |
| P2 | 3.1-3.4 | Test coverage gaps | Medium |
| P3 | 4.1-4.4 | Type design and documentation | Low |

---

## Notes

- **Do not batch comment removal**: Remove inline comments file-by-file to ensure each change compiles
- **Test after each phase**: Run `bun run verify` after completing each phase
- **Commit granularity**: One commit per sub-item (e.g., 1.1, 1.2, etc.) for clear audit trail
