# Chapter-boundary Selection Page-turn Fix

Status: Completed
Date: 2026-08-28

## Problem

Holding a text-selection handle at a page edge on the final or first page of a chapter called Foliate navigation before the reader discovered that the target page belonged to another spine section. The reader then restored the original CFI, causing an incorrect page turn or visible jump.

## Acceptance criteria

- Selection edge turns continue to work between pages in the same chapter.
- At a chapter boundary, the current selection remains active and navigation is not called.
- Physical left/right behavior remains correct for LTR and RTL publications.
- Normal taps, swipes, keyboard navigation, and non-selection page turns are unchanged.

## Implementation

1. Detect a paginator boundary from its current page, total pages, requested physical direction, and book direction.
2. Stop before calling `goLeft` or `goRight` when the next selection page would cross sections.
3. Keep the existing post-navigation section check as a fallback for runtimes without reliable paginator state.
4. Cover LTR, RTL, valid interior pages, boundary pages, and unavailable paginator state with pure-function tests.

## Validation

- `npm run verify:full`: passed
- Automated result: 21 test files and 64 tests passed; 1 fixture test skipped by its existing condition; production build and release asset validation passed
- Manual Obsidian mobile/desktop selection-handle check: recommended because the automated environment cannot drive native selection handles
