# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence. Without them, vibe coding is just yolo coding.

## Stack

- **Unit + component tests:** vitest + @testing-library/react (environment: jsdom)
- **E2E tests:** Playwright (Chromium)
- **Assertion style:** Vitest globals (`describe`, `it`, `expect`) + `@testing-library/jest-dom` matchers

## Running tests

```bash
# Unit + component (vitest)
bun run test          # run once, CI-style
bun run test:watch    # watch mode while developing

# End-to-end (playwright)
bun run dev           # in one terminal
bun run test:e2e      # in another
```

## Test layers

- **Unit** — pure functions in `src/lib/`. Fast. No DOM. Colocated under `test/` mirroring source paths.
- **Component** — React components under `test/components/`. Uses jsdom + @testing-library/react. Test user-visible behavior, not implementation.
- **Integration** — API route handlers and data-layer fallbacks under `test/integration/`. Mock Supabase + fs.
- **E2E** — full page flows in `e2e/*.spec.ts`. Runs against a local dev server (`bun run dev`) by default; CI builds + starts the app.

## Conventions

- File naming: `*.test.ts` or `*.test.tsx` for vitest, `*.spec.ts` for playwright.
- Import `@/...` to reach `src/...` (configured in `vitest.config.ts`).
- Regression tests for bugs fixed by `/qa` land in `test/regression/` or next to the file they cover, named `<name>.regression-<n>.test.ts`, with an attribution comment linking to the QA report.
- Never import real secrets or `.env.local` values. Use explicit fixtures.
- Never commit code that makes existing tests fail.

## When to write tests

- New function → one test per branch (happy path + edge).
- Bug fix → regression test that fails on the old code and passes on the fixed code.
- New conditional (if/else, switch) → tests for both paths.
- Error handling → a test that triggers the error.
