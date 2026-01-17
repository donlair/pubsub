# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source for the Pub/Sub implementation. Key entry points include `src/index.ts`, `src/pubsub.ts`, `src/topic.ts`, and `src/subscription.ts`. Supporting modules live under `src/internal/`, `src/publisher/`, `src/subscriber/`, `src/types/`, and `src/utils/`.
- `tests/`: Test suites split by intent: `tests/unit/`, `tests/integration/`, and `tests/compatibility/`.
- `docs/`, `specs/`, `research/`: Design notes, specs, and research artifacts that document API parity and acceptance criteria.

## Build, Test, and Development Commands

- `bun install`: Install dependencies.
- `bun run typecheck`: TypeScript type checking (no emit).
- `bun run lint`: Run Biome lint rules.
- `bun run format`: Apply Biome formatting.
- `bun test`: Run the full test suite with Bun.
- `bun test --watch`: Watch mode for local iteration.
- `bun run verify`: Full verification (typecheck + lint + tests).

## Coding Style & Naming Conventions

- TypeScript with `strict` settings (`tsconfig.json`).
- Formatting and linting via Biome (`biome.json`): 2-space indentation, single quotes, semicolons, and no `any` in source (tests are less strict).
- Prefer Bun-native APIs and scripts (`bun run`, `bun test`).
- Test files follow `*.test.ts` naming, typically kebab-case (e.g., `tests/integration/flow-control.test.ts`).

## Testing Guidelines

- Use `bun test` for all test runs.
- Place new tests in the matching suite: unit, integration, or compatibility.
- Favor API-compatibility coverage when behavior must mirror `@google-cloud/pubsub`.

## Commit & Pull Request Guidelines

- Commit messages often follow Conventional Commit style with optional scopes, for example:
  - `feat(topic): add orderingKey support to publishJSON method`
  - `fix(publisher): replace generic Error with InternalError`
  - `docs(plan): update IMPLEMENTATION_PLAN.md - Publisher documentation complete`
  - `test(integration): add dead-letter and ack-deadline integration tests`
- PRs should include a concise summary, tests run (`bun run verify` or a subset), and links to relevant issues/specs when applicable.
