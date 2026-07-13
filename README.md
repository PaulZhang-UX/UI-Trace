# UI Trace

This is a local prototype for reversing a website UI into a designer-usable Figma UI kit draft.

The output is intentionally a draft. It helps designers find, copy, and refine reusable UI samples from a captured website, but it does not claim to generate a production-ready component library.

1. A Chrome extension injects a collector into the current page.
2. The collector extracts colors, typography, radii, shadows, spacing, assets, component candidates, examples, visibility, contrast, state-source traces, ancestry, landmarks, bounds, sibling/depth traces, and container candidates.
3. Multi-state captures can be exported as one merged raw session.
4. `tools/normalize.mjs` converts raw captures into semantic tokens, an asset catalog, and a canonical component model draft.
5. The Figma plugin imports the normalized JSON and creates a browsable Reverse UI Kit Draft, Component Library Draft, Audit Draft, or Page Screenshot Reference.

Raw values and source traces stay visible. Semantic token names, variants, component sets, and container/page patterns are inferred and require design review.

## 安装说明

### 安装 Chrome 插件

1. 前往 [Releases](https://github.com/PaulZhang-UX/UI-Trace/releases/latest) 下载 `chrome-extension.zip`。
2. 解压该文件到本地。
3. 打开 Chrome，进入 `chrome://extensions/`。
4. 开启右上角的「开发者模式」。
5. 点击「加载已解压的扩展程序」。
6. 选择解压后的 `chrome-extension` 文件夹。

安装完成后，打开需要采集的网页，点击浏览器工具栏中的 UI Trace 图标即可开始使用。

### 安装 Figma 插件

1. 前往 [Releases](https://github.com/PaulZhang-UX/UI-Trace/releases/latest) 下载 `figma-plugin.zip`。
2. 解压该文件到本地。
3. 打开 Figma Desktop。
4. 进入「Plugins」→「Development」→「Import plugin from manifest」。
5. 选择解压后的 `figma-plugin/manifest.json` 文件。
6. 导入后，从「Plugins」→「Development」中运行 UI Trace。

### 基本使用流程

1. 在 Chrome 中采集网页界面。
2. 点击「导出」，下载标准化 JSON 文件。
3. 在 Figma 中运行 UI Trace。
4. 点击「上传」，选择导出的 JSON 文件。
5. 点击「生成」导入设计系统内容。

## Project Structure

- `extension/` - unpacked Chrome extension for page extraction.
- `figma-plugin/` - Figma plugin source that imports normalized JSON.
- `src/extractor.js` - browser-side extraction logic shared by the extension.
- `docs/INSTALLATION.md` - local setup for Chrome, Figma, and validation.
- `docs/USER_GUIDE.md` - capture, normalize, pipeline, and Figma import workflow.
- `docs/LIMITATIONS.md` - audit boundaries and known limitations.
- `docs/DISTRIBUTION.md` - versioned zip packaging and install notes for sharing.
- `viewer/` - local preview page for inspecting extracted JSON before normalization and Figma import.
- `tools/merge.mjs` - combines multiple raw page captures into one auditable raw payload.
- `tools/normalize.mjs` - optional normalization pass that turns raw extraction into semantic tokens and component models.
- `tools/audit.mjs` - checks normalized output for unresolved icons, warnings, and trace gaps.
- `tools/pipeline.mjs` - runs merge, normalize, and audit in one command.
- `schemas/design-system.schema.json` - shape of the intermediate JSON.
- `schemas/normalized-design-system.schema.json` - shape of the normalized JSON.
- `samples/sample-design-system.json` - small example payload for testing the Figma importer.

## Try The Chrome Extractor

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` folder.
5. Open a target website.
6. Click the extension icon and choose Extract design system.
7. A `design-system-<hostname>.json` file will download.

The extension reads the current page only. It does not send data to a server.

For multi-state captures, use the session buttons in the popup. Set the capture state label before each capture. The popup includes common labels (`default`, `sidebar-open`, `menu-open`, `modal-open`, `focused`, `selected`) and also accepts a custom label.

1. Open a page state such as home, sidebar open, settings, or a menu.
2. Set the Capture state label.
3. Click Capture page.
4. Move to the next state and capture again.
5. Open Advanced and use Auto-capture visible states to let the extension attempt safe visible interactions such as menus, popups, tabs, accordions, and details disclosures.
6. For a page screenshot reference, open Advanced, choose Screenshot scope, and click Capture page screenshot. Viewport captures the visible browser area; Full page scrolls and captures screenshot slices with a safe height and slice cap.
7. Click Export raw session to download one merged raw JSON, or Export normalized JSON to download a Figma-ready normalized file.
8. Click Clear session when starting a new target.

The raw JSON records `captureStateLabel` on `source` and component/container examples. Merge preserves it in `sources` and examples, and normalize uses labels like `menu-open`, `sidebar-open`, `modal-open`, `focused`, and `selected` as supporting evidence for component state variants.

Normalization also adds component naming fields for designer review:

- `displayName`: the preferred Figma-facing component name.
- `semanticName`: the inferred semantic component name.
- `namingRationale`: why that name was chosen.

Naming uses aria labels, titles, visible text, `data-testid`/related data attributes, nearby labels, icon IDs/alt text, roles, landmarks, class signatures, dimensions, container context, and capture state labels. These are still inferred and should be reviewed before promoting the draft to a production library.

## Preview A JSON File

Open `viewer/index.html` in a browser. Paste an extracted JSON file or load it with the file picker.

## Normalize A JSON File

Run:

```powershell
node .\tools\normalize.mjs .\exports\design-system-chatgpt.com.json
```

This creates:

```text
exports/design-system-chatgpt.com.normalized.json
```

Import the normalized file in Figma when you want cleaner token names and component models.

## Merge Multiple Page Captures

Put several raw captures in one folder, then run:

```powershell
node .\tools\merge.mjs .\exports\chatgpt-pages --out .\exports\chatgpt-pages.merged.json
node .\tools\normalize.mjs .\exports\chatgpt-pages.merged.json
```

The merged payload preserves page-level sources on tokens, assets, component examples, and source component IDs. Use this for states such as home, sidebar open, settings, profile menu, model picker, and modal/menu views.

To run merge, normalize, and audit together:

```powershell
node .\tools\pipeline.mjs .\exports\chatgpt-pages --out .\exports\chatgpt-pages
```

This writes:

```text
exports/chatgpt-pages.merged.json
exports/chatgpt-pages.merged.normalized.json
exports/chatgpt-pages.merged.audit.json
```

Use expanded palette mode when a fuller generated primitive palette scaffold is useful:

```powershell
node .\tools\pipeline.mjs .\exports\chatgpt-pages --out .\exports\chatgpt-pages.expanded --palette expanded
```

## Try The Figma Importer

1. Open Figma desktop.
2. Create or open a Figma design file.
3. In Figma, use Plugins > Development > Import plugin from manifest.
4. Select `figma-plugin/manifest.json`.
5. Run the plugin.
6. Choose English, Chinese, or bilingual output language.
7. Choose an output mode:
   - Designer Kit for copy-ready component sheets.
   - Component Library Draft for high-confidence core candidates promoted into real Figma components.
   - Page Screenshot Reference for observed browser screenshots from explicit screenshot captures.
   - Audit Draft for review/specification sections.
8. Load the normalized JSON file with Choose file. Pasting normalized JSON is still available as a fallback under Paste JSON manually.

The Figma importer expects normalized JSON. The language option only changes generated documentation copy. Raw values, token names, source IDs, component traces, and other audit data are not translated.

The importer currently creates:

- Overview and Quick Start / Designer Usage when using Designer Kit mode.
- Primitives, including color primitive variables, hue/scale swatch rows, typography samples, radii, spacing previews, and shadow previews.
- Interactive Controls, including Action Controls, Component Inventory, Component State Strips, Component Sheets, and Core Component Sets.
- Navigation, including menu item, link, navigation inventory, state strips, and copy-ready sheets.
- Containers / Composite Drafts, inferred from sampled components and spatial/DOM traces.
- Assets / Icons with resolved inline SVG and same-origin sprite SVGs when possible, plus traceable placeholders for unresolved icons.
- Trace / Warnings, including raw component draft rows, inferred variants, confidence, source IDs, review warnings, clipping, missing context, low contrast, and sprite placeholders.
- Audit Draft mode with Import QA Summary, Specification Review / Promotion Workflow, component candidates, and warnings.
- Page Screenshot Reference mode with observed browser screenshots per captured page snapshot. It requires `pageSnapshots`, created by Capture page screenshot in the browser extension.

## Current Limits

- Pseudo states such as hover/focus are inferred from existing DOM/classes, not actively simulated yet.
- Complex canvas/WebGL content is not reconstructed.
- Components are clustered heuristically by tag, role, classes, size, and text/icon structure.
- Containers / Composite Drafts are experimental grouped samples, not exact page reconstruction.
- `containerModel` requires newly captured raw JSON. Older exports still import, but Containers fall back to pattern-based grouped samples.
- Component Sets are inferred draft Figma component sets and still need designer cleanup.
- Page Screenshot Reference is a visual reference mode, not editable page reconstruction. Full-page captures can create large JSON files; complex interactive, animated, canvas/WebGL, video, and very long pages may still need manual screenshot review.
- Token-to-component mappings are traceable suggestions, not final variable bindings for every property.
- Component State Strips and Action Controls are display-layer groupings and may still need manual naming and dedupe cleanup.

## Recommended Final Pass

Before treating the prototype as a saved milestone:

1. Run `node --check .\figma-plugin\code.js`.
2. Run `node .\tools\validate.mjs`.
3. Re-import `figma-plugin/manifest.json` in Figma desktop.
4. Import a normalized JSON file in Designer Kit mode.
5. Visually inspect the generated `Primitives`, `Interactive Controls`, `Navigation`, `Containers / Composite Drafts`, `Assets / Icons`, and `Trace / Warnings` sections.

## Package A Shareable Release

Run:

```powershell
& ".\tools\package-release.ps1" -Version "0.1.0"
```

This creates Chrome extension, Figma plugin, and toolkit zip packages under `dist/`. See `docs/DISTRIBUTION.md`.
