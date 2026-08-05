# Project UI Design Skill: Botanical / Organic Serif

Apply this skill whenever adding, removing, redesigning, or materially changing any user-facing interface, including settings, reader controls, panels, dialogs, empty states, and responsive layouts. The outcome must feel like one coherent Botanical / Organic Serif product, not a collection of generic controls.

## 1. Inspect before designing

Before changing UI code:

1. Identify the affected view, its responsive behaviour, existing CSS custom properties, class naming, and nearby UI patterns.
2. Preserve Obsidian integration and existing user theme variables where they are intentionally used. Add project-level tokens instead of scattering literal values or introducing a competing component system.
3. Keep the change focused. Reuse or extend existing components and selectors before creating one-off styling.
4. For a large visual change, state a short implementation plan before coding. Clarify only when the requested intent or scope is genuinely ambiguous.

## 2. Theme direction

Create a calm, crafted, editorial experience: botanical garden warmth, ceramic tactility, and refined typography. Prefer quiet sophistication over high-contrast, sharp, or generic "tech" UI.

- Use warm off-white surfaces, deep forest text, muted sage accents, soft clay secondary surfaces, subtle stone borders, and terracotta only for intentional interactive emphasis.
- Prefer CSS tokens. The baseline palette is: `#F9F8F4` background, `#2D3A31` foreground, `#8C9A84` sage, `#DCCFC2` clay, `#E6E2DA` border, and `#C27B66` terracotta. Adapt these through the plugin's variables so contrast and host-theme compatibility remain sound.
- Use elegant serif display typography only for headings, feature moments, and optional italic emphasis. Keep reading content and dense controls in an accessible, highly legible sans-serif; never force a decorative font into book text.
- Prefer soft, organic geometry: 24px (`rounded-3xl`) cards, pill controls, and arch/blob imagery where imagery exists. Avoid sharp corners unless they convey an existing reader affordance.
- Give layouts room to breathe: spacious section rhythm, clear groups, and generous but purposeful gaps. Use asymmetry or staggered cards only where it improves hierarchy; do not disrupt scanning in data-dense reader UI.

## 3. Components and interaction

- Buttons: pill-shaped; primary uses forest with light text; secondary is transparent with a sage border. Use compact uppercase/wide-tracked labels only when the available width and localization permit it. Maintain at least 44px touch targets.
- Cards and popovers: use white or pale clay surfaces, delicate borders, 24px corners, and diffused forest-tinted shadows. Hover lifts are subtle (`translateY(-1px/-2px)`) and never move surrounding layout.
- Inputs: use understated filled-pill or underlined treatments. On focus, use a visible 2px sage focus ring with offset; never remove focus indication.
- Icons: retain the project's icon approach; prefer thin, forest/sage strokes and soft circular containers over heavy boxed icons.
- Motion: use graceful ease-out transitions: ~300ms for color/button feedback, ~500ms for cards, and 700ms+ only for decorative imagery. Respect `prefers-reduced-motion`; avoid continuous or distracting reader animations.
- Decorative paper grain may be added once at the app-level as a non-interactive, low-opacity (`~0.015`) overlay. Do not add duplicate overlays per view, obscure text, intercept pointers, or compromise performance.

## 4. Responsive and accessible completion checks

- Start mobile-first. Collapse multi-column groups cleanly, remove desktop-only stagger offsets on small screens, and prevent horizontal overflow.
- Keep reader text comfortable: preserve user font and reading settings, adequate line height, contrast, selection behaviour, and zoom/reflow compatibility.
- Use semantic controls, keyboard access, visible focus states, labels for icon-only buttons, and appropriate ARIA attributes when native semantics are insufficient.
- Test the affected view at narrow and wide widths, with keyboard navigation, and with `prefers-reduced-motion` enabled. Run relevant existing tests or build checks after UI changes.

## 5. Maintainability rules

- Centralize recurring colors, spacing, radii, shadows, and timings as CSS custom properties or existing shared utilities.
- Match the repository's TypeScript, DOM, and CSS conventions. Do not add React, Tailwind, external fonts, or a UI library merely to achieve this visual style.
- Keep changes responsive, accessible, and performant. Use images and texture assets sparingly; avoid excessive filters, layers, and animation work in the reader.
