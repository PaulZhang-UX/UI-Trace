# Limitations

UI Trace creates an auditable design-system draft from rendered webpages. It does not reconstruct the source app, guarantee complete coverage, or produce a final component library.

## Capture Coverage

The extractor sees the currently rendered DOM and accessible CSS. It can miss:

- Hidden routes and screens that were never opened.
- Unmounted components.
- Lazy modals, drawers, menus, and popovers that were not visible during capture.
- Virtualized list items outside the rendered viewport.
- Login-only or permission-gated UI.
- Cross-origin iframes.
- Cross-origin stylesheets that the browser blocks from script access.
- Canvas, WebGL, video, and other non-DOM-rendered visuals.

Use multiple page and state captures to improve coverage.

## Interaction States

Capture visible interactive states performs a conservative click pass on safe-looking visible controls. It avoids forms, links, disabled controls, and labels that look destructive or state-changing.

It can collect interaction evidence from:

- Safe visible controls such as menu buttons, popup triggers, tabs, accordions, and details disclosures.
- Explicit capture labels such as `menu-open`, `modal-open`, `selected`, and `focused`.
- Readable stylesheet rules for `:hover`, `:focus`, `:active`, `:disabled`, and `[aria-selected="true"]`.
- DOM attributes and classes already present in the captured state.

Pseudo-state colors from stylesheets are tagged as `stylesheet:pseudo:*`. They are evidence from CSS rules, not proof that the state was visually triggered during capture.

The safe auto-capture pass is intentionally incomplete. It does not submit forms, follow links, edit content, purchase, publish, delete, save, log out, or crawl hidden routes. Some custom controls may be skipped, and some opened states may need manual capture.

## Token Semantics

Raw values are observable facts. Semantic names are suggestions.

- Color semantic groups are inferred from usage, hue, lightness, state traces, and naming hints.
- Typography tokens are deduped by normalized font family, size, line height, weight, and letter spacing.
- Spacing, radius, opacity, border width, shadow, and effect tokens are sampled from rendered styles.
- Generated palette steps in expanded mode are scaffold tokens and are marked with `origin: generated`.

Do not treat inferred token names or generated colors as final design-system decisions.

## Component Models

Component candidates are clustered heuristically. Signals include:

- Element tag and role.
- Text, aria labels, titles, icon hints, and nearby labels.
- Class signatures and data attributes.
- Dimensions, landmarks, and container context.
- Capture state labels.
- Repeated visual and structural patterns.

The output can over-group unrelated UI or split one real component into multiple draft candidates. Names, variants, slots, and confidence scores need design review.

## Containers And Layouts

Container and composite drafts are grouped samples, not exact page reconstruction.

They help designers inspect repeated structures such as sidebars, menus, cards, panels, headers, and content groups. They should not be used as pixel-perfect screen rebuilds.

## Page Screenshot Reference

Page Screenshot Reference is a visual reference mode. It places observed browser screenshots into Figma and does not attempt editable page reconstruction.

It can still miss or simplify:

- Very long full-page captures beyond the safe height cap.
- Sticky headers, fixed sidebars, lazy loading, or scroll-triggered UI repeated across full-page screenshot slices.
- Large JSON exports because screenshot references are embedded as data URLs.

Viewport screenshots use viewport-relative coordinates. Full-page screenshots use document-relative coordinates where available and clip at a safe maximum height. Screenshot reference layers are locked in Figma.

## Assets

Asset capture is best effort.

- Inline SVG can usually be rendered.
- Same-origin sprite references may resolve.
- Remote images may fail because of authentication, anti-hotlinking, CORS, expiring URLs, or Figma loading restrictions.
- Blocked images fall back to traceable placeholders.

Keep the source URL and asset trace when replacing placeholders manually.

## Figma Import

The Figma importer creates pages, frames, swatches, samples, variables, text styles, and effect styles where possible.

Results can vary based on:

- Available fonts in Figma desktop.
- Figma Plugin API limits.
- Remote asset availability.
- Large JSON size.
- Missing or older fields in raw exports.

Chinese and bilingual output uses CJK font fallbacks when available, but exact rendering can differ between machines.

## Automation Boundary

The current workflow is semi-automatic:

```text
capture in Chrome
-> export raw session or normalized JSON
-> optionally run Node normalization or pipeline
-> import normalized JSON in Figma
```

Fully automated browser crawling is future work. The extension's visible interactive-state capture is a conservative assistant, not a full crawler.

## Practical Review Rule

Use the draft to answer:

- What values and patterns were observed?
- Where did each value or candidate come from?
- Which design-system decisions need a human review?

Do not use it as the sole source of truth for:

- Complete product coverage.
- Final component naming.
- Final semantic token architecture.
- Accessibility conformance.
- Production-ready Figma libraries.
