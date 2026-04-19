# CLAUDE.md

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. All font choices,
colors, spacing, motion, and aesthetic direction are defined there.

- Do NOT deviate from DESIGN.md without explicit user approval.
- The system is intentionally restrained (cream paper, brass + olive, serif typography,
  minimal motion, no stats cards). The default is "trade portal," not "SaaS dashboard."
- When writing new UI, match tokens exactly (`--paper`, `--ink`, `--brass`, etc.).
  Never introduce hex values outside the palette.
- Fonts are Fraunces (display), Source Serif 4 (body), Instrument Sans (UI),
  Geist (tabular data). Never Inter, Poppins, or `system-ui` as primary.
- In `/qa` mode, flag any code that doesn't match DESIGN.md.
- If a user request contradicts DESIGN.md, ask before overriding.

## Testing

- **Run:** `bun run test` (vitest) and `bun run test:e2e` (playwright).
- **Test directory:** `test/` for unit + component, `e2e/` for playwright specs.
- **Full guide:** see `TESTING.md`.

Expectations:
- 100% test coverage is the goal. Tests are what make vibe coding safe.
- New function → write a corresponding test.
- Bug fix → write a regression test.
- Error handling → write a test that triggers the error.
- New conditional (if/else, switch) → test BOTH paths.
- Never commit code that makes existing tests fail.
