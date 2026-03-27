# Testing Audit Harness

## Scope
- `npm run test:unit`: domain logic and fixture-level unit coverage.
- `npm run test:e2e`: desktop and mobile browser smoke tests against `next dev`.
- `npm run test:perf`: baseline timing checks for import, export preview, search, typing, and drag interactions.
- `npm run test:smoke:live`: static export smoke plus optional real endpoint checks.
- `npm run test:ci`: PR gate for lint, typecheck, build, unit, and browser smoke coverage.

## Fixture Sets
- `small`: fast local smoke and restore/trash coverage.
- `medium`: template load, merge import, and persistence checks.
- `large`: import/export preview performance baseline.
- `stress`: search, edit, and drag timing under heavier state.

Fixtures live in [audit-fixtures.ts](/Users/marvin/.gemini/antigravity/scratch/fusion-widget-manager/test/fixtures/audit-fixtures.ts).

## Reports and Artifacts
- Playwright traces, screenshots, and videos: `test-results/`.
- HTML Playwright report: `playwright-report/`.
- Performance baseline outputs: `test/reports/generated/perf-baseline.json` and `test/reports/generated/perf-baseline.md`.

## Notes
- `npm run typecheck` now generates Next route/layout types first with `next typegen`, which fixes the prior `.next/types` dependency problem.
- Live endpoint tests are opt-in. Set `ENABLE_NETWORK_LIVE_SMOKE=1` to run them, and optionally set `LIVE_MANIFEST_URL` for a real AIOMetadata manifest.
- CI installs Playwright Chromium only. Safari and iOS remain part of the manual release checklist.
