# Selection Never Turns Pages

Status: Complete
Date: 2026-09-25

## Scope

Prevent every page turn caused by text selection or selection-handle dragging on desktop and mobile. Keep ordinary navigation after selection is cleared.

## Steps

1. Remove plugin mouse selection-edge page turns.
2. Suppress Foliate selectionchange pagination while desktop selection is active, retaining the mobile guard.
3. Update product and system documentation and event-level regression tests.
4. Run quick and full verification; record remaining native-device validation limits.

## Validation

- 2026-09-25: `npm run verify:quick` passed (76 tests passed, 1 existing skipped).
- 2026-09-25: `npm run verify:full` passed, including production build and release asset validation.
- Event-level tests cover desktop mouse/pen and Foliate selectionchange arbitration, plus existing Android touch and ordinary swipe paths.
- Native Obsidian desktop/mobile handle behavior still requires device validation under TD-2026-001.
