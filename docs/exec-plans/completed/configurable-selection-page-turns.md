# Configurable Selection Page Turns

Status: Complete
Date: 2026-09-25

## Scope

Add a persisted reader setting that controls whether an active text selection prevents page turns. Keep protection enabled by default so existing readers retain the current behavior. Expose the setting in the plugin settings page and reader settings dialog.

## Steps

1. Add the setting to the reader schema, defaults, and normalization.
2. Bind both settings interfaces to the same setting.
3. Apply the option to plugin navigation, touch selection gestures, and Foliate selectionchange handling.
4. Cover enabled and disabled behavior in regression tests, update product and design documentation, and run quick/full verification.

## Validation

- 2026-09-25: `npm run verify:quick` passed after schema, settings UI, and event policy changes (78 tests passed, 1 existing skipped).
- 2026-09-25: `npm run verify:full` passed after the disabled-touch propagation regression was added (79 tests passed, 1 existing skipped); production build and release validation passed.
- Native Obsidian selection-handle behavior still needs device validation under TD-2026-001.
