# Installation

UI Trace is a local prototype. It has three installable or runnable parts:

- Chrome extension for capture.
- Node tools for merge, normalize, audit, and pipeline output.
- Figma development plugin for importing normalized JSON.

No captured page data is sent to a hosted service by this project.

## Requirements

- Chrome or another Chromium browser that supports unpacked extensions.
- Figma desktop for local development plugin import.
- Node.js 20 or newer.

All commands below assume the project root:

```powershell
cd path\to\ui-trace
```

## Install The Chrome Extension

1. Open Chrome.
2. Go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `extension` folder from this repository.

After code changes in `extension/`, return to `chrome://extensions/` and click Reload for the extension.

## Install The Figma Plugin

1. Open Figma desktop.
2. Create or open a design file.
3. Go to Plugins > Development > Import plugin from manifest.
4. Select `figma-plugin/manifest.json` from this repository.

Run the plugin from Plugins > Development.

## Keep Extractors In Sync

The browser extractor is shared from `src/extractor.js`. When it changes, sync it into the Chrome extension:

```powershell
Copy-Item -LiteralPath .\src\extractor.js -Destination .\extension\extractor.js
```

## Validate The Local Build

Run syntax checks:

```powershell
node --check .\src\extractor.js
node --check .\extension\extractor.js
node --check .\extension\normalizer.js
node --check .\extension\popup.js
node --check .\tools\merge.mjs
node --check .\tools\normalize.mjs
node --check .\tools\audit.mjs
node --check .\tools\pipeline.mjs
node --check .\figma-plugin\code.js
```

Run prototype validation:

```powershell
node .\tools\validate.mjs
```

Expected output:

```text
Prototype validation passed.
```

## Shareable Packages

To create zip packages for other users:

```powershell
& ".\tools\package-release.ps1" -Version "0.1.0"
```

See `docs/DISTRIBUTION.md` for install steps and platform limits.
