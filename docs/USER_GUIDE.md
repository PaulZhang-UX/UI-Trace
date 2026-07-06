# User Guide

UI Trace captures a rendered webpage and turns it into a traceable Figma UI kit draft.

The workflow is:

```text
Chrome extension
-> raw or merged session JSON
-> normalize
-> Figma plugin import
-> Reverse UI Kit Draft, Component Library Draft, Audit Draft, or Page Screenshot Reference
```

The result is a designer-usable audit draft. It is not a production-ready component library.

## Capture A Single Page

1. Install or reload the Chrome extension from `extension/`.
2. Open the target page.
3. Open the extension popup.
4. Click Extract once.
5. Save the downloaded `design-system-<hostname>.json` file.

Use this for a quick inspection pass. For a design-system draft, multi-state capture is usually better.

## Capture Multiple States

Use the session controls in the popup:

1. Open the target page or state.
2. Enter an optional state label such as `default`, `menu-open`, `modal-open`, `sidebar-open`, `focused`, or `selected`.
3. Click Capture page.
4. Navigate or interact with the page to expose another visible state.
5. Repeat capture for menus, sidebars, dialogs, selected tabs, settings pages, and similar UI states.
6. Open Advanced and use Auto-capture visible states to let the extension attempt safe visible interactions such as menus, popups, tabs, accordions, and details disclosures. It captures the current page first, then captures each safe state it can open.
7. Click Export raw session to download merged raw JSON, or Export normalized JSON to download the Figma-ready normalized JSON directly.
8. Click Clear session before starting a different target.

The exported merged session preserves source traces, page titles, URLs, capture labels, component examples, container examples, and token sources.

## Capture A Page Screenshot Reference

Use this when you want Figma to keep observed browser screenshots as visual references. This mode does not attempt editable page reconstruction.

1. Open the target page in the browser.
2. Open Advanced in the extension popup.
3. Choose Screenshot scope:
   - Viewport captures the current visible browser area as one screenshot reference.
   - Full page scrolls the document, captures screenshot slices, and caps very long pages for safety.
4. Click Capture page screenshot.
5. Click Export normalized JSON.

The screenshot capture is explicit. Normal Capture page does not include `pageSnapshots` or screenshot references, so it will not feed Page Screenshot Reference mode.

## Normalize JSON

The Chrome extension can export normalized JSON directly from the captured session. Use the Node command when you want repeatable CLI output, expanded palette mode, or audit files.

Strict mode keeps observed colors only:

```powershell
node .\tools\normalize.mjs ".\exports\design-system-chatgpt.com.merged.json" ".\exports\design-system-chatgpt.com.merged.normalized.json"
```

Expanded palette mode adds generated primitive palette steps:

```powershell
node .\tools\normalize.mjs ".\exports\design-system-chatgpt.com.merged.json" ".\exports\design-system-chatgpt.com.merged.expanded.normalized.json" --palette expanded
```

Use strict mode when audit accuracy matters most. Use expanded mode when a designer wants a fuller primitive palette scaffold, while still seeing which colors were generated.

## Run The One-Command Pipeline

For a folder of raw captures:

```powershell
node .\tools\pipeline.mjs ".\exports\chatgpt-pages" --out ".\exports\chatgpt-pages"
```

This writes:

```text
exports/chatgpt-pages.merged.json
exports/chatgpt-pages.merged.normalized.json
exports/chatgpt-pages.merged.audit.json
```

Expanded palette pipeline:

```powershell
node .\tools\pipeline.mjs ".\exports\chatgpt-pages" --out ".\exports\chatgpt-pages.expanded" --palette expanded
```

## Import Into Figma

1. Install the Figma plugin from `figma-plugin/manifest.json`.
2. Run the plugin in a Figma design file.
3. Choose language: English, Chinese, or bilingual.
4. Choose an output mode:
   - Designer Kit for the existing paginated UI kit draft.
   - Component Library Draft for high-confidence core candidates promoted into real Figma components.
   - Page Screenshot Reference for observed browser screenshots from explicit screenshot captures.
   - Audit Draft for review and trace sections.
5. Click Choose file under Normalized JSON and choose the exported `.normalized.json` file. Pasting JSON is still available as a fallback under Paste JSON manually.
6. Import.

The Figma plugin expects normalized JSON. Raw extraction JSON should be normalized first through Export normalized JSON in the extension or `tools/normalize.mjs`.

Designer Kit creates localized pages:

```text
RDS 01 Overview / 概览
RDS 02 Foundations / 基础规范
RDS 03 Components / 组件
RDS 04 Containers / 容器与组合
RDS 05 Assets Trace / 资源追踪
```

Component Library Draft creates a separate `RDS Component Library Draft - <host>` page. It only promotes high-confidence core categories such as buttons, inputs, selects, tabs, menu items, and links. Other candidates stay in `Review candidates not promoted`.

Page Screenshot Reference creates a separate `RDS Page Screenshot Reference - <host>` page. It requires normalized JSON that contains `pageSnapshots`; if screenshot references are present, Figma creates visible locked screenshot reference layers. If the JSON does not contain `pageSnapshots`, capture with Capture page screenshot and export normalized JSON again.

## Read The Output

Color sections are split by intent:

- Raw Colors: direct observed values.
- Observed Primitives: primitive families and scales from captured CSS.
- Generated Palette: optional expanded palette colors that were not captured.
- Semantic Colors: inferred semantic groups such as background, text, border, link, status, and content.
- Interactive Colors: observed interaction states from capture labels or readable stylesheet pseudo rules.

Trace terms:

- `observed`: captured from rendered DOM, computed CSS, source examples, or readable stylesheets.
- `inferred`: named or grouped by heuristics from roles, labels, class names, dimensions, context, and state labels.
- `generated`: created by normalization as a scaffold, not observed on the page.

Treat inferred and generated output as review material. Promote only after design review.

## Recommended Review Pass

1. Confirm the page list and capture labels in Overview.
2. Check color models for generated versus observed tokens.
3. Review typography samples and deduped source values.
4. Inspect component sheets for naming, state coverage, variants, and examples.
5. Inspect Containers for page and layout patterns.
6. If using Page Screenshot Reference, inspect the screenshot frames and check full-page clipping warnings or large JSON size.
7. Review Assets Trace for unresolved icons, placeholder images, or blocked remote assets.
8. Run `tools/audit.mjs` or the one-command pipeline and keep the audit JSON with the imported Figma draft.
