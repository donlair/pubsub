# Implementation Plan: PR #2 Review Findings + Spec Gap Analysis

## Summary

This plan addresses findings from:
1. **PR #2 code review** (FINDINGS.md) - 4 critical issues, 12 important issues
2. **Spec gap analysis** (comparing specs/* against src/*) - verified against official Google Cloud documentation

Issues are prioritized by severity with critical fixes first.

**Branch:** `implement-spec-gaps`
**Sources:** `FINDINGS.md`, `specs/*`, [Google Cloud Node.js Client](https://github.com/googleapis/nodejs-pubsub)

---

## Phase 1: Critical Fixes

### 1.1 Add Error Handling to Periodic Cleanup Timer

- [x] Add try-catch to `startPeriodicCleanup()` timer callback
  - Location: `src/internal/message-queue.ts:739-747`
  - Gap: `runCleanup()` errors propagate silently, potentially stopping cleanup permanently
  - Fix: Wrapped in try-catch with `console.error` logging
  - Spec: Error handling rules in `.claude/rules/error-handling.md`
  - Test: Added test in `tests/unit/message-queue.test.ts:1548-1590`
  - Completed: 2026-01-19

### 1.2 Add Error Logging to Message Stream Stop

- [x] Log errors in stream timeout stop handler
  - Location: `src/subscriber/message-stream.ts:143`
  - Gap: `this.stop().catch(() => {})` completely swallows errors
  - Fix: Changed to `console.error('Failed to stop stream after timeout:', error)` matching pattern from message-queue.ts:744
  - Test: Added test in `tests/unit/subscriber.test.ts:1005-1035` verifying error logging on stop failure
  - Spec: Error handling rules
  - Completed: 2026-01-19

### 1.3 Fix Cleanup NACK Error Handling

- [x] Check specific error types during cleanup nack operations
  - Location: `src/subscriber/message-stream.ts:215-234`
  - Gap: ALL errors caught and ignored, not just expired-lease errors
  - Fix: Only ignore `InvalidArgumentError`, log unexpected errors using `console.error`
  - Implementation:
    - Added selective error catching: ignore `InvalidArgumentError` (expired leases), log others
    - Applies to both in-flight messages (via `message.nack()`) and pending messages (via `messageQueue.nack()`)
    - Added 3 comprehensive tests verifying the behavior
  - Test: `tests/unit/subscriber.test.ts:1123-1249` (3 test cases)
  - Spec: Error handling rules
  - Completed: 2026-01-19

### 1.4 Remove Inline Comments Violating CLAUDE.md Rules

- [x] Remove inline comments from `src/subscriber/ack-manager.ts`
  - Gap: 8 instances of `// Errors handled per promise` comments
  - Fix: Removed all inline comments (redundant explanations of error handling pattern)
  - Completed: 2026-01-19

- [x] Remove inline comments from `src/subscriber/message-stream.ts`
  - Gap: API compatibility note inline comment
  - Fix: Removed redundant comment (info already in types file JSDoc)
  - Completed: 2026-01-19

- [x] Remove inline comments from `src/internal/message-queue.ts`
  - Gap: ~50 inline comments throughout the file
  - Fix: Removed all inline comments (section headers, "what" comments, BR-XXX labels)
  - Note: Removed comments explaining "what" rather than "why"; JSDoc and self-documenting code remain
  - Completed: 2026-01-19

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

## Phase 5: Spec Gap - Critical Functionality

*Items identified by comparing specs/* against implementation, verified against official Google Cloud documentation.*

### 5.1 Implement Automatic Ack Deadline Extension in MessageStream

- [ ] Add timer-based ack deadline monitoring and automatic extension
  - Location: `src/subscriber/message-stream.ts`, `src/subscriber/lease-manager.ts`
  - Gap: LeaseManager tracks deadlines but MessageStream never monitors them for expiry or extends them automatically. Google's client libraries use the 99th percentile of ack delay to determine extension length.
  - Fix: Add mechanism to:
    1. Monitor approaching deadlines
    2. Call `modifyAckDeadline` to extend before expiry
    3. Respect `maxExtensionTime` limit (default 3600s)
  - Spec: `specs/03-subscription.md:BR-005`, `specs/06-subscriber.md:BR-005`
  - Reference: [Google Lease Management](https://cloud.google.com/pubsub/docs/lease-management)
  - Impact: Without this, messages held by flow control may be redelivered prematurely

---

## Phase 6: Spec Gap - Missing Functionality

### 6.1 Implement Dead Letter Policy Handling in MessageStream

- [ ] Add DLQ routing logic when maxDeliveryAttempts exceeded at subscriber level
  - Location: `src/subscriber/message-stream.ts`
  - Gap: `DeadLetterPolicy` type exists but MessageStream has no logic to track delivery attempts and route to DLQ
  - Fix: Track delivery attempts per message, route to dead letter topic when threshold exceeded
  - Spec: `specs/03-subscription.md:BR-010`
  - Reference: [Google Dead Letter Topics](https://cloud.google.com/pubsub/docs/dead-letter-topics)
  - Note: MessageQueue already handles DLQ at queue level; this adds subscriber-level awareness

### 6.2 Add Exponential Backoff Retry Logic in MessageStream

- [ ] Implement exponential backoff for recoverable errors with retry
  - Location: `src/subscriber/message-stream.ts` - error handling in `pullMessages()`
  - Gap: No distinction between fatal and recoverable errors. All errors emit and continue on next interval.
  - Fix: Implement backoff for recoverable errors (UNAVAILABLE, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED)
  - Spec: `specs/06-subscriber.md:BR-009`
  - Impact: Improves resilience during transient failures

### 6.3 Add Attribute Type Validation in MessageQueue

- [ ] Validate that attribute values are strings, not just convert them
  - Location: `src/internal/message-queue.ts:315`
  - Gap: Line 315 uses `String(value)` to convert but does not validate original type is string
  - Fix: Check `typeof value === 'string'`, throw `InvalidArgumentError` if not
  - Spec: `specs/07-message-queue.md:BR-017` (attribute values must be strings)
  - Impact: Silent type coercion instead of proper validation error

---

## Phase 7: Spec Gap - Test Coverage

### 7.1 Add Test for Automatic Ack Deadline Redelivery (AC-003)

- [ ] Create test verifying automatic redelivery when ack deadline expires
  - Location: New test in `tests/integration/ack-deadline.test.ts`
  - Gap: No test for `specs/03-subscription.md:AC-003`
  - Test: Publish message, receive it, do NOT ack, wait for ackDeadlineSeconds, verify message redelivered with incremented `deliveryAttempt`
  - Spec: `specs/03-subscription.md:AC-003`

### 7.2 Add Test for Pause/Resume Flow (AC-006)

- [ ] Create test verifying pause() stops delivery and resume() restarts it
  - Location: New test in `tests/unit/subscriber.test.ts`
  - Gap: No dedicated test for `specs/06-subscriber.md:AC-006`
  - Test: Open subscription, receive message, pause(), publish more, verify no delivery, resume(), verify delivery resumes
  - Spec: `specs/06-subscriber.md:AC-006`

### 7.3 Add Test for Stop Waits for In-Flight (AC-007)

- [ ] Create test verifying stop() waits for in-flight messages before closing
  - Location: New test in `tests/unit/subscriber.test.ts`
  - Gap: No dedicated test for `specs/06-subscriber.md:AC-007`
  - Test: Start subscription, receive message, call close() mid-processing, verify close() resolves only after processing completes
  - Spec: `specs/06-subscriber.md:AC-007`

### 7.4 Add Test for Error Event on Failure (AC-008)

- [ ] Create test verifying error event emission on failures
  - Location: New test in `tests/unit/subscriber.test.ts`
  - Gap: No dedicated test for `specs/06-subscriber.md:AC-008`
  - Test: Open subscription, delete topic, verify error event is emitted
  - Spec: `specs/06-subscriber.md:AC-008`

### 7.5 Add Test for Concurrent Message Delivery (AC-009)

- [ ] Create test verifying multiple concurrent message delivery
  - Location: New test in `tests/unit/subscriber.test.ts`
  - Gap: No dedicated test for `specs/06-subscriber.md:AC-009`
  - Test: Configure maxMessages=10, publish 10 messages, verify all 10 received concurrently before any acks
  - Spec: `specs/06-subscriber.md:AC-009`

### 7.6 Add Tests for Ordering Edge Cases (AC-006, AC-009, AC-010)

- [ ] Add dedicated tests for ordering acceptance criteria
  - Location: New tests in `tests/integration/ordering.test.ts`
  - Gap: Missing dedicated tests for:
    - AC-006: Messages without ordering key not blocked by ordered messages
    - AC-009: Ordering keys accepted without explicit `messageOrdering` enable
    - AC-010: Multiple messages with different keys batched separately
  - Spec: `specs/09-ordering.md:AC-006, AC-009, AC-010`

---

## Phase 8: Spec Gap - Type Safety

### 8.1 Fix Topic.pubsub Property Type

- [ ] Change `pubsub` property type from `unknown` to `PubSub`
  - Location: `src/topic.ts:29`
  - Gap: Property typed as `unknown` instead of `PubSub`, requiring type assertions
  - Fix: Import PubSub type and use proper typing
  - Impact: Improves IDE autocomplete and type safety

### 8.2 Add Type Guards for Subscription Options

- [ ] Add proper type guards when accessing subscription options
  - Location: `src/internal/message-queue.ts:360-368`
  - Gap: Type assertions used (`as unknown as`) instead of proper type narrowing
  - Fix: Add type guards or improve SubscriptionMetadata type to include optional properties
  - Impact: Better type safety, no runtime impact

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
| P0 | 5.1 | **Automatic ack deadline extension** (spec gap) | High |
| P1 | 2.1-2.4 | Important error handling fixes | Low |
| P1 | 6.1-6.3 | Missing functionality (spec gaps) | Medium |
| P2 | 3.1-3.4 | Test coverage gaps (PR review) | Medium |
| P2 | 7.1-7.6 | Test coverage gaps (spec gaps) | Medium |
| P3 | 4.1-4.4 | Type design and documentation | Low |
| P3 | 8.1-8.2 | Type safety improvements | Low |

---

## Spec Gap Analysis Notes

The following were **verified against official Google Cloud documentation** and found to be **correctly implemented**:

| Setting | Our Value | Google Default | Status |
|---------|-----------|----------------|--------|
| Subscriber maxOutstandingMessages | 1000 | 1000 | ✅ Correct |
| Subscriber maxOutstandingBytes | 100 MB | 100 MB | ✅ Correct |
| Publisher maxOutstandingMessages | 100 | 100 | ✅ Correct |
| Publisher maxOutstandingBytes | 1 MB | 1 MB | ✅ Correct |
| ackDeadlineSeconds | 10s | 10s | ✅ Correct |
| messageRetentionDuration | 7 days | 7 days | ✅ Correct |
| maxAckDeadline | 600s | 600s | ✅ Correct |
| maxExtensionTime | 3600s | 3600s | ✅ Correct |

**Note on batching defaults**: Our implementation uses `maxMessages=100, maxBytes=1MB` while Google's Node.js client uses `maxMessages=1000, maxBytes=9MB`. This results in smaller batches (more frequent publishes) but is acceptable for a local development library. Documented as intentional difference.

---

## Notes

- **Do not batch comment removal**: Remove inline comments file-by-file to ensure each change compiles
- **Test after each phase**: Run `bun run verify` after completing each phase
- **Commit granularity**: One commit per sub-item (e.g., 1.1, 1.2, etc.) for clear audit trail
