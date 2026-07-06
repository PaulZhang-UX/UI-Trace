# Distribution

This project is distributed as versioned zip packages.

Chrome and Figma both require users to install local development plugins through their own trusted flows. The packages make sharing easier, but they do not bypass those security steps.

## Package Contents

The release build creates:

- `chrome-extension.zip` - Chrome extension source package.
- `figma-plugin.zip` - Figma development plugin source package.
- `reverse-ui-kit-toolkit.zip` - docs, samples, schemas, tools, and viewer.
- `reverse-ui-kit-<version>.zip` - complete release bundle containing all of the above.

## Build A Release

From the project root:

```powershell
& ".\tools\package-release.ps1" -Version "0.1.0"
```

To replace an existing release folder:

```powershell
& ".\tools\package-release.ps1" -Version "0.1.0" -Force
```

## Install Chrome Extension From Zip

1. Unzip `chrome-extension.zip`.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the unzipped `chrome-extension` folder.

Chrome can only load the unpacked folder directly unless the extension is published through the Chrome Web Store or distributed through managed enterprise policy.

## Install Figma Plugin From Zip

1. Unzip `figma-plugin.zip`.
2. Open Figma desktop.
3. Go to Plugins > Development > Import plugin from manifest.
4. Select `figma-plugin/manifest.json` from the unzipped folder.

Figma development plugins are installed from a manifest file. There is no separate native installer for local plugin distribution.

## Recommended End-User Flow

1. Install the Chrome extension.
2. Capture pages and states.
3. Optional: use Capture page screenshot when a Page Screenshot Reference is needed.
4. Export normalized JSON.
5. Install the Figma plugin.
6. In the Figma plugin, choose the `.normalized.json` file, select the desired output mode, and import.
