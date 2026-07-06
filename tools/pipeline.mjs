import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node tools/pipeline.mjs <raw-json-or-dir...> [--out exports/name] [--palette strict|expanded]");
  process.exit(1);
}

const outFlagIndex = args.indexOf("--out");
const outputBase = outFlagIndex >= 0 ? path.resolve(args[outFlagIndex + 1] || "") : "";
const paletteFlagIndex = args.findIndex((arg) => String(arg || "") === "--palette" || String(arg || "").indexOf("--palette=") === 0);
const paletteMode = readPaletteMode(args);
const inputArgs = readInputArgs(args, outFlagIndex, paletteFlagIndex);

if (outFlagIndex >= 0 && !outputBase) {
  console.error("Missing output base after --out");
  process.exit(1);
}

if (paletteFlagIndex >= 0 && args[paletteFlagIndex] === "--palette" && !args[paletteFlagIndex + 1]) {
  console.error("Missing palette mode after --palette");
  process.exit(1);
}

if (!inputArgs.length) {
  console.error("Missing input raw JSON file or directory.");
  process.exit(1);
}

const node = process.execPath;
const root = process.cwd();
const rawOutput = outputBase ? withJsonExt(`${outputBase}.merged`) : defaultMergedPath(inputArgs[0]);
const normalizedOutput = rawOutput.replace(/\.json$/i, ".normalized.json");
const reportOutput = rawOutput.replace(/\.json$/i, ".audit.json");

run(node, [path.join(root, "tools", "merge.mjs")].concat(inputArgs).concat(["--out", rawOutput]));
run(node, [path.join(root, "tools", "normalize.mjs"), rawOutput, normalizedOutput, "--palette", paletteMode]);
run(node, [path.join(root, "tools", "audit.mjs"), normalizedOutput, reportOutput]);

console.log("Pipeline complete.");
console.log(`Merged raw: ${path.relative(root, rawOutput)}`);
console.log(`Normalized: ${path.relative(root, normalizedOutput)}`);
console.log(`Audit report: ${path.relative(root, reportOutput)}`);
console.log(`Palette mode: ${paletteMode}`);

function readInputArgs(values, outIndex, paletteIndex) {
  const ignored = new Set();
  if (outIndex >= 0) {
    ignored.add(outIndex);
    ignored.add(outIndex + 1);
  }
  if (paletteIndex >= 0) {
    ignored.add(paletteIndex);
    if (values[paletteIndex] === "--palette") ignored.add(paletteIndex + 1);
  }
  return values.filter((_, index) => !ignored.has(index));
}

function readPaletteMode(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || "");
    if (value === "--palette" && values[index + 1]) return normalizePaletteMode(values[index + 1]);
    if (value.indexOf("--palette=") === 0) return normalizePaletteMode(value.slice("--palette=".length));
  }
  return "strict";
}

function normalizePaletteMode(value) {
  return String(value || "").toLowerCase() === "expanded" ? "expanded" : "strict";
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function defaultMergedPath(firstInput) {
  const absolute = path.resolve(firstInput);
  const baseDir = fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
    ? absolute
    : path.dirname(absolute);
  return path.join(baseDir, "design-system.pipeline.merged.json");
}

function withJsonExt(value) {
  return /\.json$/i.test(value) ? value : `${value}.json`;
}
