param(
  [string]$Version = "0.1.0",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $root "dist"
$releaseName = "reverse-ui-kit-$Version"
$releaseDir = Join-Path $distRoot $releaseName

if ((Test-Path $releaseDir) -and -not $Force) {
  throw "Release folder already exists: $releaseDir. Re-run with -Force to replace it."
}

if (Test-Path $releaseDir) {
  $resolvedDist = Resolve-Path $distRoot
  $resolvedRelease = Resolve-Path $releaseDir
  if (-not $resolvedRelease.Path.StartsWith($resolvedDist.Path)) {
    throw "Refusing to remove a path outside dist: $resolvedRelease"
  }
  Remove-Item -LiteralPath $releaseDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$chromeDir = Join-Path $releaseDir "chrome-extension"
$figmaDir = Join-Path $releaseDir "figma-plugin"
$toolkitDir = Join-Path $releaseDir "toolkit"

Copy-Item -LiteralPath (Join-Path $root "extension") -Destination $chromeDir -Recurse
Copy-Item -LiteralPath (Join-Path $root "figma-plugin") -Destination $figmaDir -Recurse

New-Item -ItemType Directory -Force -Path $toolkitDir | Out-Null
foreach ($item in @("docs", "samples", "schemas", "tools", "viewer")) {
  Copy-Item -LiteralPath (Join-Path $root $item) -Destination (Join-Path $toolkitDir $item) -Recurse
}
Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination (Join-Path $toolkitDir "README.md")
Copy-Item -LiteralPath (Join-Path $root "docs\DISTRIBUTION.md") -Destination (Join-Path $releaseDir "INSTALL-FIRST.md")

$notes = @"
# Reverse UI Kit $Version

This release contains:

- chrome-extension.zip: unpack and load through chrome://extensions.
- figma-plugin.zip: unpack and import figma-plugin/manifest.json in Figma desktop.
- reverse-ui-kit-toolkit.zip: docs, schemas, tools, samples, and viewer for local CLI workflows.

The Figma plugin imports normalized JSON. Use Export normalized JSON in the Chrome extension for the shortest path.
Output modes include Designer Kit, Component Library Draft, screenshot-assisted Page Replica Draft, and Audit Draft. Page Replica Draft requires using Capture page replica before exporting normalized JSON.
"@

Set-Content -LiteralPath (Join-Path $releaseDir "RELEASE_NOTES.md") -Value $notes -Encoding UTF8

Compress-Archive -Path (Join-Path $chromeDir "*") -DestinationPath (Join-Path $releaseDir "chrome-extension.zip") -Force
Compress-Archive -Path (Join-Path $figmaDir "*") -DestinationPath (Join-Path $releaseDir "figma-plugin.zip") -Force
Compress-Archive -Path (Join-Path $toolkitDir "*") -DestinationPath (Join-Path $releaseDir "reverse-ui-kit-toolkit.zip") -Force
Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath (Join-Path $distRoot "$releaseName.zip") -Force

Write-Host "Release packaged:"
Write-Host $releaseDir
Write-Host (Join-Path $distRoot "$releaseName.zip")
