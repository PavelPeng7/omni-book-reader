# Selection behavior and inverse colors

Status: Complete; Android native validation remains tracked under TD-2026-001
Date: 2026-09-26

## Scope

Make selection navigation protection a fixed reader behavior, reliably dismiss a selection on an outside click or tap, and offer inverse selected-text colors in both settings surfaces.

## Acceptance criteria

- Selection gestures stay on the current paginated page on desktop and Android, regardless of saved legacy settings.
- A click or tap outside the active selection dismisses it without turning the page; the next ordinary input can navigate.
- The optional inverse selection style swaps the reading theme's foreground and background colors for selected text, in light, dark, and sepia themes.
- Quick and full verification pass; native Android behavior remains subject to device validation.

## Steps

1. Remove the persisted navigation toggle and unconditionalize the selection arbitration.
2. Add inverse selection setting and publication CSS.
3. Update behavior tests and durable documentation, then run verification.

## Progress

- Inspected reader event coordination, settings surfaces, publication CSS, and existing tests.
- Removed the navigation toggle and legacy setting; selection protection is always active. Added outside click and tap dismissal for native selections, while preserving later ordinary page turns.
- Added inverse selection colors in both settings surfaces and checked generated CSS for light, dark, and sepia themes.
- `npm run verify:quick` and `npm run verify:full` passed: 92 tests passed in the isolated release source, 1 existing fixture test skipped; production build and release asset validation passed.
- Native Android handle and selection behavior still require device validation under TD-2026-001.
