Execute ONE task from an implementation plan using disciplined TDD and code review workflows.

## Workflow

### Phase 1: Task Selection

1. Read the implementation plan file (default: `IMPLEMENTATION_PLAN.md`, or path specified by user)
2. Identify all incomplete tasks
3. Select the SINGLE most important next task based on:
   - Dependencies (blocked tasks come later)
   - Foundation work before features
   - Risk reduction (tackle unknowns early)
4. Announce the selected task clearly before proceeding

### Phase 2: Codebase Exploration

Launch up to 10 parallel Explore subagents (use `subagent_type: "Explore"`) to:

- Find files relevant to the selected task
- Identify existing patterns and conventions
- Locate test files and testing patterns
- Map dependencies and interfaces

Consolidate findings before proceeding.

### Phase 3: Test-Driven Development

**Write tests first:**

1. Create/update test file(s) for the task
2. Write failing tests that define expected behavior
3. Run tests to confirm they fail for the right reasons

**Implement functionality:**

1. Write minimal code to pass tests
2. Run tests after each significant change
3. Refactor while keeping tests green

**Verify all checks pass:**

```bash
# Run tests
bun test  # run tests that you're working on

# Type checking (if applicable)
bunx tsc --noEmit  # or equivalent

# Lint checking (if applicable)
bun run lint  # or equivalent
```

Fix any failures before proceeding.

### Phase 4: Code Review Loop

1. Launch a code review subagent (use `subagent_type: "pr-review-toolkit:code-reviewer"` or similar) to review your changes
2. Address ALL feedback from the review
3. Re-run checks to ensure fixes don't break anything
4. Request another review
5. Repeat until approved

### Phase 5: Documentation & Commit

**Update implementation plan:**

- Mark the completed task as done (e.g., `[x]` or strikethrough)
- Add any new tasks discovered during implementation
- Clean out old completed items if the file is getting large (use a subagent)

**Update CLAUDE.md if needed:**

- Add operational learnings (correct commands, gotchas)
- Keep it brief and operational only

**Commit and push:**

```bash
git add -A
git commit -m "feat: <description of what was implemented>"
git push
```

## Critical Guidelines

### One Task Only

Complete exactly ONE task per execution. Fresh context for each task prevents pollution and maintains quality.

### No Placeholders

Implement functionality completely. Stubs and TODOs waste future effort redoing the same work.

### Single Source of Truth

No migrations or adapters. If unrelated tests fail, fix them as part of this increment.

### Continuous Plan Maintenance

- Update the plan with learnings using a subagent
- Document discovered bugs even if unrelated to current work
- Future iterations depend on accurate plan state

### Documentation Discipline

- **CLAUDE.md**: Operational info only (commands, setup, gotchas)
- **Implementation plan**: Status updates, progress notes, discovered issues
- **Tests/code comments**: Capture the "why", not just the "what"

### Debugging

Add logging as needed to diagnose issues. Remove or gate behind flags before committing if excessive.

## Handling Issues

**Discovered bugs unrelated to current task:**

1. Immediately add to implementation plan as new task item
2. Continue with current task unless the bug blocks you

**Failing unrelated tests:**

1. Fix them as part of this increment
2. Document in plan if the fix reveals larger issues

**Code review rejection:**

1. Address all feedback
2. Re-run all checks
3. Request new review
4. Never skip the review loop

## Example Task Selection

Given this plan:

```markdown
## Tasks

- [ ] Set up database schema
- [ ] Implement user authentication
- [ ] Add API endpoints for users
- [ ] Build frontend dashboard
```

Select "Set up database schema" because:

- No dependencies on other tasks
- Foundation for authentication and API work
- Reduces risk by establishing data layer early
