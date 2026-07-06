import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node tools/merge.mjs <input-dir-or-json...> [--out merged.json]");
  process.exit(1);
}

const outFlagIndex = args.indexOf("--out");
const outputPath = outFlagIndex >= 0 ? path.resolve(args[outFlagIndex + 1] || "") : "";
const inputArgs = outFlagIndex >= 0 ? args.slice(0, outFlagIndex) : args;

if (outFlagIndex >= 0 && !outputPath) {
  console.error("Missing output path after --out");
  process.exit(1);
}

const inputFiles = collectInputFiles(inputArgs);
if (!inputFiles.length) {
  console.error("No raw design-system JSON files found.");
  process.exit(1);
}

const pages = inputFiles.map((file, index) => readPage(file, index));
const merged = mergePages(pages);
const finalOutputPath = outputPath || defaultOutputPath(inputArgs[0], pages);

fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
fs.writeFileSync(finalOutputPath, JSON.stringify(merged, null, 2), "utf8");
console.log(`Merged ${pages.length} pages into ${path.relative(process.cwd(), finalOutputPath)}`);

function collectInputFiles(values) {
  const files = [];
  for (const value of values) {
    const absolute = path.resolve(value);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute)) {
        const file = path.join(absolute, entry);
        if (isRawJsonFile(file)) files.push(file);
      }
    } else if (isRawJsonFile(absolute)) {
      files.push(absolute);
    }
  }
  return Array.from(new Set(files)).sort();
}

function isRawJsonFile(file) {
  if (!/\.json$/i.test(file)) return false;
  if (/\.normalized\.json$/i.test(file)) return false;
  if (/merged/i.test(path.basename(file))) return false;
  return fs.statSync(file).isFile();
}

function readPage(file, index) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const source = data.source || {};
  return {
    pageId: `page-${index + 1}`,
    file,
    data,
    source: {
      id: `page-${index + 1}`,
      url: source.url || "",
      hostname: source.hostname || "",
      title: source.title || path.basename(file),
      capturedAt: source.capturedAt || "",
      viewport: source.viewport || {},
      captureStateLabel: source.captureStateLabel || ""
    }
  };
}

function mergePages(pages) {
  const firstSource = pages[0].source || {};
  const hostname = commonHostname(pages);
  return {
    version: "0.1.0-merged",
    source: {
      url: `merged://${hostname || "multiple-pages"}`,
      hostname: hostname || "multiple-pages",
      title: `Merged Reverse Design System Draft (${pages.length} pages)`,
      capturedAt: new Date().toISOString(),
      viewport: firstSource.viewport || {}
    },
    sources: pages.map((page) => page.source),
    tokens: {
      colors: mergeTokens(pages, "colors", tokenKeyValue),
      typography: mergeTokens(pages, "typography", typeKey),
      radii: mergeTokens(pages, "radii", tokenKeyValue),
      shadows: mergeTokens(pages, "shadows", tokenKeyValue),
      spacing: mergeTokens(pages, "spacing", tokenKeyValue)
    },
    components: mergeComponents(pages),
    containers: mergeContainers(pages),
    assets: mergeAssets(pages),
    pageSnapshots: mergePageSnapshots(pages),
    stats: mergeStats(pages)
  };
}

function commonHostname(pages) {
  const hostnames = unique(pages.map((page) => page.source.hostname).filter(Boolean));
  return hostnames.length === 1 ? hostnames[0] : "";
}

function mergeTokens(pages, group, getKey) {
  const map = new Map();
  for (const page of pages) {
    const tokens = page.data.tokens && page.data.tokens[group] ? page.data.tokens[group] : [];
    for (const token of tokens) {
      const key = getKey(token);
      if (!key) continue;
      const existing = map.get(key) || cloneToken(token);
      existing.count = (existing.count || 0) + (token.count || 0);
      existing.sources = addSourceTrace(existing.sources, page);
      existing.aliases = unique((existing.aliases || []).concat([token.name].filter(Boolean)));
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function cloneToken(token) {
  const clone = {};
  for (const key of Object.keys(token || {})) clone[key] = token[key];
  clone.count = 0;
  return clone;
}

function tokenKeyValue(token) {
  return token && token.value !== undefined ? String(token.value) : "";
}

function typeKey(token) {
  if (!token) return "";
  return [
    token.fontFamily || "",
    token.fontSize || "",
    token.fontWeight || "",
    token.lineHeight || "",
    token.letterSpacing || 0
  ].join("|");
}

function mergeComponents(pages) {
  const map = new Map();
  for (const page of pages) {
    const components = page.data.components || [];
    for (const component of components) {
      const key = component.signature || `${component.category || "other"}|${component.name || ""}`;
      const existing = map.get(key) || baseComponent(component, page, map.size + 1);
      existing.count = (existing.count || 0) + (component.count || 0);
      existing.states = unique((existing.states || []).concat(component.states || []));
      existing.sourceComponentIds = unique((existing.sourceComponentIds || []).concat(pageScopedId(page, component.id)));
      existing.assetRefs = uniqueAssetRefs((existing.assetRefs || []).concat(component.assetRefs || []));
      existing.sources = addSourceTrace(existing.sources, page);
      existing.examples = mergeExamples(existing.examples || [], component.examples || [], page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function baseComponent(component, page, index) {
  const clone = {};
  for (const key of Object.keys(component || {})) {
    if (key !== "examples" && key !== "states") clone[key] = component[key];
  }
  clone.id = `merged-component-${index}`;
  clone.name = component.name || `Component ${index}`;
  clone.category = component.category || "other";
  clone.signature = component.signature || "";
  clone.count = 0;
  clone.states = [];
  clone.examples = [];
  clone.sourceComponentIds = [];
  clone.sources = addSourceTrace([], page);
  return clone;
}

function mergeExamples(existing, examples, page) {
  const result = existing.slice();
  for (const example of examples) {
    if (result.length >= 12) break;
    const clone = {};
    for (const key of Object.keys(example || {})) clone[key] = example[key];
    clone.sourcePageId = page.source.id;
    clone.sourceUrl = page.source.url;
    clone.sourceTitle = page.source.title;
    clone.captureStateLabel = clone.captureStateLabel || page.source.captureStateLabel || "";
    result.push(clone);
  }
  return result;
}

function mergeAssets(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const asset of page.data.assets || []) {
      const key = `${asset.type || "unknown"}|${asset.signature || asset.src || asset.originalHref || ""}`;
      const existing = map.get(key) || cloneAsset(asset);
      existing.count = (existing.count || 0) + (asset.count || 0);
      existing.sources = addSourceTrace(existing.sources, page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function uniqueAssetRefs(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs || []) {
    const key = ref.signature || `${ref.type || ""}|${ref.src || ""}|${ref.spriteId || ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function mergePageSnapshots(pages) {
  const snapshots = [];
  for (const page of pages) {
    const direct = page.data.pageSnapshot ? [page.data.pageSnapshot] : [];
    const existing = Array.isArray(page.data.pageSnapshots) ? page.data.pageSnapshots.map((item) => item.snapshot || item) : [];
    for (const snapshot of direct.concat(existing)) {
      if (!snapshot || !snapshot.nodes) continue;
      snapshots.push({
        sourcePageId: page.source.id,
        sourceUrl: page.source.url,
        sourceTitle: page.source.title,
        captureStateLabel: page.source.captureStateLabel || snapshot.captureStateLabel || "",
        snapshot
      });
    }
  }
  return snapshots;
}

function mergeContainers(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const container of page.data.containers || []) {
      const key = containerKey(container);
      const existing = map.get(key) || baseContainer(container, page, map.size + 1);
      existing.count = (existing.count || 0) + (container.count || 0);
      existing.sources = addSourceTrace(existing.sources, page);
      existing.examples = mergeContainerExamples(existing.examples || [], container.examples || [], page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function containerKey(container) {
  return [
    container.type || "container",
    container.tag || "",
    container.role || "",
    container.className || "",
    container.name || ""
  ].join("|");
}

function baseContainer(container, page, index) {
  const clone = {};
  for (const key of Object.keys(container || {})) {
    if (key !== "examples") clone[key] = container[key];
  }
  clone.id = `merged-container-${index}`;
  clone.count = 0;
  clone.examples = [];
  clone.sources = addSourceTrace([], page);
  return clone;
}

function mergeContainerExamples(existing, examples, page) {
  const result = existing.slice();
  for (const example of examples) {
    if (result.length >= 12) break;
    const clone = {};
    for (const key of Object.keys(example || {})) clone[key] = example[key];
    clone.sourcePageId = page.source.id;
    clone.sourceUrl = page.source.url;
    clone.sourceTitle = page.source.title;
    clone.captureStateLabel = clone.captureStateLabel || page.source.captureStateLabel || "";
    result.push(clone);
  }
  return result;
}

function cloneAsset(asset) {
  const clone = {};
  for (const key of Object.keys(asset || {})) clone[key] = asset[key];
  clone.count = 0;
  return clone;
}

function mergeStats(pages) {
  const stats = {
    pages: pages.length,
    scannedElements: 0,
    components: 0,
    assets: 0
  };
  for (const page of pages) {
    const pageStats = page.data.stats || {};
    stats.scannedElements += pageStats.scannedElements || 0;
    stats.components += pageStats.components || (page.data.components || []).length;
    stats.assets += pageStats.assets || (page.data.assets || []).length;
  }
  return stats;
}

function addSourceTrace(existing, page) {
  const sources = existing ? existing.slice() : [];
  const item = {
    id: page.source.id,
    url: page.source.url,
    title: page.source.title,
    captureStateLabel: page.source.captureStateLabel || ""
  };
  const key = `${item.id}|${item.url}`;
  for (const source of sources) {
    if (`${source.id}|${source.url}` === key) return sources;
  }
  sources.push(item);
  return sources;
}

function pageScopedId(page, id) {
  return `${page.source.id}:${id || "unknown"}`;
}

function defaultOutputPath(firstInput, pages) {
  const absolute = path.resolve(firstInput);
  const baseDir = fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
    ? absolute
    : path.dirname(pages[0].file);
  return path.join(baseDir, "design-system.merged.json");
}

function unique(items) {
  return Array.from(new Set(items));
}
