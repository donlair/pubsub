---
name: implementation-planner
description: Create or update implementation plans by analyzing specs and source code with parallel subagents. Use when asked to "create a plan", "make an implementation plan", "update the plan", "analyze specs vs code", "find gaps in implementation", or when working with IMPLEMENTATION_PLAN.md files. Coordinates parallel exploration of specs/* and src/* directories to identify incomplete features, TODOs, placeholders, and missing implementations.
---

# Implementation Planner

Generate or update an IMPLEMENTATION_PLAN.md by systematically comparing specifications against source code using parallel subagents.

## Workflow

### Phase 0: Gather Context (Parallel)

Launch these exploration tasks in parallel:

**0a. Study Specifications** - Launch up to 10 Sonnet subagents to explore `specs/*`:

```
Task tool with subagent_type=Explore:
"Explore specs/* to understand application specifications. Document:
- Feature requirements
- API contracts
- Acceptance criteria
- Integration points"
```

**0b. Read Existing Plan** - If IMPLEMENTATION_PLAN.md exists, read it to understand current state and priorities.

**0c. Study Source Code** - Launch up to 10 Sonnet subagents to explore `src/*`:

```
Task tool with subagent_type=Explore:
"Explore src/* to understand what has been built. Document:
- Implemented features
- Code structure and patterns
- Integration points"
```

### Phase 1: Gap Analysis (Parallel)

Launch up to 20 Sonnet subagents to compare specs against source code:

```
Task tool with subagent_type=Explore:
"Compare [specific spec] against src/* implementation. Search for:
- TODOs and FIXME comments
- Minimal/placeholder implementations
- Skipped or flaky tests
- Missing error handling
- Incomplete API coverage
- Inconsistent patterns

Report: what exists, what's missing, what's incomplete."
```

### Phase 2: Analyze and Prioritize

Use an Opus subagent to synthesize findings:

```
Task tool with subagent_type=Plan, model=opus:
"Analyze these gap analysis findings and create a prioritized implementation plan:

[Insert findings from Phase 1]

Create IMPLEMENTATION_PLAN.md with:
1. Summary of current state
2. Prioritized bullet list of items to implement
3. For each item: what's missing, where it should go, dependencies

Prioritize by: blocking issues > core features > enhancements > nice-to-haves"
```

### Phase 3: Write/Update Plan

Write or update IMPLEMENTATION_PLAN.md with the prioritized bullet list.

## Critical Rules

1. **Plan only** - Do NOT implement anything. This skill creates plans, not code.

2. **Confirm before assuming** - Never assume functionality is missing. Always search the codebase first to confirm something doesn't exist.

3. **Create missing specs** - If a needed element has no specification, create one at `specs/FILENAME.md` before adding it to the plan.

4. **Search patterns** - When looking for incomplete work, search for:
   - `TODO`, `FIXME`, `HACK`, `XXX`
   - `throw new Error("Not implemented")`
   - `// placeholder`, `// stub`, `// minimal`
   - `.skip(`, `.todo(`, `test.skip`
   - Empty function bodies
   - Functions returning hardcoded values 5. **Plan format** - IMPLEMENTATION_PLAN.md should be a bullet list sorted by priority:

   ```markdown
   # Implementation Plan

   ## Summary

   Brief current state overview.

   ## Priority Items

   ### High Priority

   - [ ] Item description
     - Location: `src/path/file.ts`
     - Gap: What's missing
     - Spec: `specs/relevant-spec.md`

   ### Medium Priority

   - [ ] ...

   ### Low Priority

   - [ ] ...

   ## Completed

   - [x] Completed item
   ```

## Subagent Prompts

### Spec Exploration Prompt

```
Explore specs/* and document:
1. All feature requirements with acceptance criteria
2. API contracts and expected behaviors
3. Integration requirements
4. Performance requirements
5. Error handling requirements

Be thorough - this informs what needs to be built.
```

### Source Exploration Prompt

```
Explore src/* and document:
1. Project structure and organization
2. Implemented features and their completeness
3. Patterns and conventions used
4. Test coverage areas
5. Any TODOs, FIXMEs, or incomplete implementations

Note file paths for everything found.
```

### Gap Analysis Prompt

```
Compare [SPEC_NAME] specification against source code:

Spec requirements:
[INSERT SPEC SUMMARY]

Search src/* for implementations. For each requirement:
1. Is it implemented? (yes/no/partial)
2. Where? (file paths)
3. What's missing or incomplete?
4. Are there TODOs or placeholders?

Do not assume - search and confirm.
```
