import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "extension/manifest.json",
  "extension/popup.html",
  "extension/popup.js",
  "extension/extractor.js",
  "figma-plugin/manifest.json",
  "figma-plugin/ui.html",
  "figma-plugin/code.js",
  "schemas/design-system.schema.json",
  "schemas/normalized-design-system.schema.json",
  "tools/merge.mjs",
  "tools/normalize.mjs",
  "tools/audit.mjs",
  "tools/pipeline.mjs",
  "samples/sample-design-system.json",
  "viewer/index.html",
  "viewer/styles.css",
  "viewer/app.js"
];

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing ${file}`);
}

const chromeManifest = readJson("extension/manifest.json");
assert(chromeManifest.manifest_version === 3, "Chrome manifest must use Manifest V3");
assert(chromeManifest.permissions.includes("scripting"), "Chrome manifest needs scripting permission");

const figmaManifest = readJson("figma-plugin/manifest.json");
assert(figmaManifest.main === "code.js", "Figma manifest main should point to code.js");
assert(figmaManifest.ui === "ui.html", "Figma manifest ui should point to ui.html");

const sample = readJson("samples/sample-design-system.json");
assert(sample.version, "Sample needs a version");
assert(sample.source?.url, "Sample needs source.url");
assert(Array.isArray(sample.tokens?.colors), "Sample needs tokens.colors");
assert(Array.isArray(sample.tokens?.typography), "Sample needs tokens.typography");
assert(Array.isArray(sample.components), "Sample needs components");
assert(sample.stats?.scannedElements > 0, "Sample needs stats.scannedElements");

console.log("Prototype validation passed.");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
