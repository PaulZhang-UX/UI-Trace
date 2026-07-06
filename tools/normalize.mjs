import fs from "node:fs";
import path from "node:path";

const ASSET_PIPELINE_VERSION = "0.2.0";
const DEFAULT_ASSET_CATALOG_LIMIT = 1200;
const IMAGE_ASSET_LIMIT = 240;
const OTHER_ASSET_LIMIT = 160;

const args = process.argv.slice(2);
const inputPath = args[0];
if (!inputPath) {
  console.error("Usage: node tools/normalize.mjs <raw-design-system.json> [output.json] [--palette strict|expanded] [--asset-limit all|number]");
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
const raw = JSON.parse(fs.readFileSync(absoluteInput, "utf8"));
const paletteMode = readPaletteMode(args);
const assetLimit = readAssetLimit(args);
const outputArg = args.slice(1).find((arg) => String(arg || "").indexOf("--") !== 0);
const outputPath = outputArg
  ? path.resolve(outputArg)
  : absoluteInput.replace(/\.json$/i, ".normalized.json");

const normalized = normalize(raw, { paletteMode, assetLimit });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2), "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);

function normalize(rawData, options = {}) {
  const tokens = rawData.tokens || {};
  const sources = normalizeSources(rawData);
  const assetCatalogResult = normalizeAssets(rawData.assets || [], rawData.components || [], options);
  const assetCatalog = assetCatalogResult.assets;
  const assetCatalogStats = assetCatalogResult.stats;
  const semanticTokens = {
    colors: normalizeColors(tokens.colors || []),
    typography: normalizeTypography(tokens.typography || []),
    spacing: normalizeNumbers(tokens.spacing || [], "space"),
    radii: normalizeNumbers(tokens.radii || [], "radius"),
    shadows: normalizeShadows(tokens.shadows || [])
  };
  const colorModels = normalizeColorModels(semanticTokens.colors, options.paletteMode || "strict");
  const componentModel = normalizeComponents(rawData.components || [], assetCatalog, semanticTokens);
  const containerModel = normalizeContainers(rawData.containers || [], rawData.components || []);
  const pageSnapshots = normalizePageSnapshots(rawData);
  const warnings = normalizeWarnings(rawData.components || [], rawData.assets || []);
  return {
    normalizedVersion: "0.1.0",
    source: rawData.source || {},
    sources,
    semanticTokens,
    primitiveColorModel: colorModels.primitiveColorModel,
    semanticColorModel: colorModels.semanticColorModel,
    interactiveColorModel: colorModels.interactiveColorModel,
    assetCatalog,
    componentModel,
    containerModel,
    pageSnapshots,
    designSystemSpec: designSystemSpec(semanticTokens, componentModel, assetCatalog, warnings, sources, assetCatalogStats),
    warnings,
    trace: {
      rawVersion: rawData.version || "",
      assetPipelineVersion: ASSET_PIPELINE_VERSION,
      rawStats: rawData.stats || {},
      sourcePages: sources,
      assetCatalogStats
    }
  };
}

function readPaletteMode(args) {
  for (let index = 0; index < args.length; index += 1) {
    const value = String(args[index] || "");
    if (value === "--palette" && args[index + 1]) return normalizePaletteMode(args[index + 1]);
    if (value.indexOf("--palette=") === 0) return normalizePaletteMode(value.slice("--palette=".length));
  }
  return "strict";
}

function readAssetLimit(args) {
  for (let index = 0; index < args.length; index += 1) {
    const value = String(args[index] || "");
    if (value === "--asset-limit" && args[index + 1]) return normalizeAssetLimit(args[index + 1]);
    if (value.indexOf("--asset-limit=") === 0) return normalizeAssetLimit(value.slice("--asset-limit=".length));
  }
  return DEFAULT_ASSET_CATALOG_LIMIT;
}

function normalizeAssetLimit(value) {
  if (String(value || "").toLowerCase() === "all") return Infinity;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ASSET_CATALOG_LIMIT;
}

function normalizePaletteMode(value) {
  return String(value || "").toLowerCase() === "expanded" ? "expanded" : "strict";
}

function normalizeSources(rawData) {
  if (Array.isArray(rawData.sources) && rawData.sources.length) return rawData.sources;
  const source = rawData.source || {};
  if (!source.url && !source.hostname && !source.title) return [];
  return [{
    id: "page-1",
    url: source.url || "",
    hostname: source.hostname || "",
    title: source.title || "",
    capturedAt: source.capturedAt || "",
    viewport: source.viewport || {},
    captureStateLabel: source.captureStateLabel || ""
  }];
}

function normalizePageSnapshots(rawData) {
  const snapshots = [];
  const source = rawData.source || {};
  if (rawData.pageSnapshot) {
    snapshots.push({
      sourcePageId: "page-1",
      sourceUrl: source.url || "",
      sourceTitle: source.title || "",
      captureStateLabel: source.captureStateLabel || "",
      snapshot: limitSnapshot(rawData.pageSnapshot)
    });
  }
  for (const item of rawData.pageSnapshots || []) {
    const snapshot = item.snapshot || item;
    if (!snapshot || !Array.isArray(snapshot.nodes)) continue;
    snapshots.push({
      sourcePageId: item.sourcePageId || "page-1",
      sourceUrl: item.sourceUrl || "",
      sourceTitle: item.sourceTitle || "",
      captureStateLabel: item.captureStateLabel || snapshot.captureStateLabel || "",
      snapshot: limitSnapshot(snapshot)
    });
  }
  return snapshots;
}

function limitSnapshot(snapshot) {
  const scope = snapshot.scope === "full-page" ? "full-page" : "viewport";
  const maxNodes = scope === "full-page" ? 1800 : 800;
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes.slice(0, maxNodes) : [];
  const warnings = (snapshot.warnings || []).slice();
  const visualReferences = limitVisualReferences(snapshot.visualReferences, scope, warnings);
  if (Array.isArray(snapshot.nodes) && snapshot.nodes.length > nodes.length) {
    warnings.push(`Normalized snapshot nodes limited to ${nodes.length} from ${snapshot.nodes.length}.`);
  }
  return {
    version: snapshot.version || "0.1.0",
    scope,
    viewport: snapshot.viewport || {},
    documentSize: snapshot.documentSize || {},
    frame: snapshot.frame || {},
    scroll: snapshot.scroll || {},
    nodes,
    visualReferences,
    warnings
  };
}

function limitVisualReferences(visualReferences, scope, warnings) {
  if (!Array.isArray(visualReferences)) return [];
  const maxRefs = scope === "full-page" ? 16 : 1;
  const refs = visualReferences.slice(0, maxRefs).map((item) => ({
    kind: item.kind || "screenshot",
    format: item.format || "",
    dataUrl: item.dataUrl || "",
    bounds: item.bounds || {},
    scroll: item.scroll || {},
    devicePixelRatio: item.devicePixelRatio || 1
  }));
  if (visualReferences.length > refs.length) {
    warnings.push(`Normalized screenshot references limited to ${refs.length} from ${visualReferences.length}.`);
  }
  return refs;
}

function normalizeAssets(assets, components = [], options = {}) {
  const linked = componentAssetLinks(components);
  const assetLimit = normalizeAssetLimit(options.assetLimit || DEFAULT_ASSET_CATALOG_LIMIT);
  const candidates = assets
    .slice()
    .map((asset, originalIndex) => normalizeAssetCandidate(asset, originalIndex, linked));
  const merged = mergeAssetCandidates(candidates, linked);
  const kept = retainAssetCandidates(merged, assetLimit);
  const normalizedAssets = kept.map((asset, index) => assetCatalogItem(asset, index, linked));
  return {
    assets: normalizedAssets,
    stats: summarizeAssetCatalog(candidates, merged, normalizedAssets, assetLimit)
  };
}

function assetCatalogItem(asset, index, linked) {
  const signature = asset.signature || assetSignature(asset);
  return {
    id: `asset-${index + 1}`,
    name: assetName(asset, index),
    type: asset.type || "unknown",
    src: asset.src || "",
    alt: asset.alt || "",
    count: asset.count || 0,
    spriteId: asset.spriteId || spriteId(asset.src || asset.originalHref || ""),
    originalHref: asset.originalHref || "",
    resolution: asset.resolution || "",
    cssProperty: asset.cssProperty || "",
    signature,
    assetKind: asset.assetKind || assetKind(asset),
    renderPriority: asset.renderPriority,
    sourcePageIds: sourcePageIds(asset),
    captureStateLabels: captureStateLabels(asset),
    linkedComponentIds: uniqueStrings([...(asset.linkedComponentIds || []), ...Array.from(linked.get(signature) || [])]),
    sources: asset.sources || []
  };
}

function normalizeAssetCandidate(asset, originalIndex, linked) {
  const normalized = normalizeAssetSource(asset || {});
  normalized.signature = normalized.signature || assetSignature(normalized);
  normalized.assetKind = normalized.assetKind || assetKind(normalized);
  normalized.renderPriority = assetRenderPriority(normalized, linked);
  normalized.linkedComponentIds = Array.from(linked.get(normalized.signature) || []);
  normalized.originalIndex = originalIndex;
  return normalized;
}

function normalizeAssetSource(asset) {
  const clone = { ...asset };
  const decodedSvg = svgFromDataUrl(clone.src || clone.originalHref || "");
  if (decodedSvg) {
    clone.type = "svg";
    clone.src = decodedSvg;
    clone.originalHref = clone.originalHref || asset.src || "";
    clone.resolution = clone.resolution === "css-image-url" ? "css-data-svg" : (clone.resolution || "data-svg");
  }
  return clone;
}

function compareAssetCandidates(a, b) {
  return (a.renderPriority || 99) - (b.renderPriority || 99)
    || (b.count || 0) - (a.count || 0)
    || (a.originalIndex || 0) - (b.originalIndex || 0);
}

function mergeAssetCandidates(candidates, linked) {
  const map = new Map();
  for (const candidate of candidates || []) {
    const signature = candidate.signature || assetSignature(candidate);
    if (!signature) continue;
    const existing = map.get(signature);
    if (!existing) {
      const clone = { ...candidate };
      clone.signature = signature;
      clone.count = Number(candidate.count) || 0;
      clone.sources = uniqueSources(candidate.sources || []);
      clone.sourcePageIds = sourcePageIds(candidate);
      clone.captureStateLabels = captureStateLabels(candidate);
      clone.linkedComponentIds = uniqueStrings([...(candidate.linkedComponentIds || []), ...Array.from(linked.get(signature) || [])]);
      map.set(signature, clone);
      continue;
    }
    existing.count = (existing.count || 0) + (Number(candidate.count) || 0);
    existing.sources = uniqueSources((existing.sources || []).concat(candidate.sources || []));
    existing.sourcePageIds = uniqueStrings((existing.sourcePageIds || []).concat(sourcePageIds(candidate)));
    existing.captureStateLabels = uniqueStrings((existing.captureStateLabels || []).concat(captureStateLabels(candidate)));
    existing.linkedComponentIds = uniqueStrings((existing.linkedComponentIds || []).concat(candidate.linkedComponentIds || [], Array.from(linked.get(signature) || [])));
    existing.originalIndex = Math.min(existing.originalIndex || 0, candidate.originalIndex || 0);
    if (assetKindRank(candidate.assetKind) < assetKindRank(existing.assetKind)) {
      existing.type = candidate.type || existing.type;
      existing.src = candidate.src || existing.src;
      existing.originalHref = candidate.originalHref || existing.originalHref;
      existing.resolution = candidate.resolution || existing.resolution;
      existing.assetKind = candidate.assetKind || existing.assetKind;
    }
    if (!existing.alt && candidate.alt) existing.alt = candidate.alt;
    if (!existing.spriteId && candidate.spriteId) existing.spriteId = candidate.spriteId;
    if (!existing.cssProperty && candidate.cssProperty) existing.cssProperty = candidate.cssProperty;
    if (!existing.name && candidate.name) existing.name = candidate.name;
    existing.renderPriority = assetRenderPriority(existing, linked);
  }
  return Array.from(map.values()).sort(compareAssetCandidates);
}

function retainAssetCandidates(candidates, assetLimit) {
  const sorted = candidates.slice().sort(compareAssetCandidates);
  if (assetLimit === Infinity) return sorted;

  const core = [];
  const images = [];
  const other = [];
  for (const asset of sorted) {
    if (isCoreAsset(asset)) core.push(asset);
    else if (asset.type === "image") images.push(asset);
    else other.push(asset);
  }

  if (core.length >= assetLimit) return core.slice(0, assetLimit);
  const remaining = assetLimit - core.length;
  const imageLimit = Math.min(IMAGE_ASSET_LIMIT, remaining);
  const keptImages = images.slice(0, imageLimit);
  const otherLimit = Math.min(OTHER_ASSET_LIMIT, Math.max(0, remaining - keptImages.length));
  return core.concat(keptImages, other.slice(0, otherLimit)).sort(compareAssetCandidates);
}

function isCoreAsset(asset) {
  if ((asset.linkedComponentIds || []).length) return true;
  if (asset.type === "svg") return true;
  const kind = asset.assetKind || assetKind(asset);
  return kind === "unresolved-icon" || kind === "image-icon";
}

function componentAssetLinks(components) {
  const map = new Map();
  for (const component of components || []) {
    const ids = component.sourceComponentIds && component.sourceComponentIds.length ? component.sourceComponentIds : [component.id || component.name || "component"];
    for (const ref of componentAssetRefs(component)) {
      const signature = ref.signature || assetSignature(ref);
      if (!signature) continue;
      if (!map.has(signature)) map.set(signature, new Set());
      for (const id of ids) if (id) map.get(signature).add(String(id));
    }
  }
  return map;
}

function componentAssetRefs(component) {
  const refs = [];
  refs.push(...(component.assetRefs || []));
  for (const example of component.examples || []) refs.push(...(example.assetRefs || []));
  return refs;
}

function assetRenderPriority(asset, linked) {
  if (linked.has(asset.signature || assetSignature(asset))) return 0;
  const kind = asset.assetKind || assetKind(asset);
  if (kind === "multicolor-svg") return 10;
  if (kind === "inline-svg" || kind === "data-svg") return 20;
  if (kind === "monochrome-svg") return 30;
  if (kind === "image-icon") return 45;
  if (kind === "unresolved-icon") return 55;
  if (kind === "image") return 80;
  return 90;
}

function assetKind(asset) {
  const type = asset.type || "unknown";
  const src = String(asset.src || "");
  const resolution = String(asset.resolution || "").toLowerCase();
  if (type === "svg" || src.indexOf("<svg") >= 0) {
    if (hasMultipleSvgColors(src)) return "multicolor-svg";
    if (resolution.includes("inline") || resolution.includes("data-svg") || /__lottie_element|lottie/i.test(src + " " + asset.name)) return "inline-svg";
    return "monochrome-svg";
  }
  if (type === "mask-image" || resolution.includes("mask") || resolution.includes("icon:")) return "unresolved-icon";
  if (type === "image" && /icon|logo|avatar|app|image-src|css-image/i.test([resolution, asset.name, asset.alt, asset.cssProperty].join(" "))) return "image-icon";
  return type === "image" ? "image" : "asset";
}

function assetSignature(asset) {
  const type = asset.type || "unknown";
  const src = String(asset.src || asset.originalHref || "");
  if (type === "svg" || src.indexOf("<svg") >= 0) return "svg:" + hashString(normalizeSvgForSignature(src));
  if (/^data:/i.test(src)) return `${type}:${hashString(src)}`;
  return `${type}:${hashString(src.replace(/[?&](t|cache|timestamp)=[^&#]*/gi, ""))}`;
}

function normalizeSvgForSignature(svg) {
  return String(svg || "")
    .replace(/#__lottie_element_\d+/g, "#__lottie_element")
    .replace(/__lottie_element_\d+/g, "__lottie_element")
    .replace(/url\(#(?:__lottie_element|clip|mask)[^)]+\)/gi, "url(#asset-ref)")
    .replace(/\b(?:href|xlink:href)=["']#(?:__lottie_element|clip|mask)[^"']*["']/gi, "href=\"#asset-ref\"")
    .replace(/\bid="[^"]*?(__lottie_element|clip|mask)[^"]*"/gi, "")
    .replace(/\b(class|style|data-[a-z0-9_-]+)="[^"]*"/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMultipleSvgColors(svg) {
  const colors = new Set();
  String(svg || "").replace(/\b(?:fill|stroke|stop-color|color)=["']([^"']+)["']/gi, (match, value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || /^(none|currentcolor|inherit|transparent)$/i.test(normalized)) return "";
    colors.add(normalized);
    return "";
  });
  return colors.size > 1;
}

function svgFromDataUrl(value) {
  const input = String(value || "");
  if (!/^data:image\/svg\+xml/i.test(input)) return "";
  const commaIndex = input.indexOf(",");
  if (commaIndex < 0) return "";
  try {
    const meta = input.slice(0, commaIndex);
    const body = input.slice(commaIndex + 1);
    const decoded = /;base64/i.test(meta)
      ? Buffer.from(body, "base64").toString("utf8")
      : decodeURIComponent(body);
    return decoded && decoded.indexOf("<svg") >= 0 ? decoded : "";
  } catch (error) {
    return "";
  }
}

function sourcePageIds(asset) {
  return Array.from(new Set((asset.sources || []).map((source) => source.id).filter(Boolean)));
}

function captureStateLabels(asset) {
  return Array.from(new Set((asset.sources || []).map((source) => source.captureStateLabel).filter(Boolean)));
}

function uniqueSources(sources) {
  const map = new Map();
  for (const source of sources || []) {
    const key = [source.id || "", source.url || "", source.captureStateLabel || ""].join("|");
    if (!key || map.has(key)) continue;
    map.set(key, source);
  }
  return Array.from(map.values());
}

function uniqueStrings(items) {
  return Array.from(new Set((items || []).filter(Boolean).map((item) => String(item))));
}

function assetKindRank(kind) {
  const ranks = {
    "multicolor-svg": 1,
    "inline-svg": 2,
    "monochrome-svg": 3,
    "image-icon": 4,
    "unresolved-icon": 5,
    image: 8,
    asset: 9
  };
  return ranks[kind] || 99;
}

function hashString(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function summarizeAssetCatalog(rawCandidates, mergedAssets, keptAssets, assetLimit) {
  const stats = {
    pipelineVersion: ASSET_PIPELINE_VERSION,
    total: rawCandidates.length,
    unique: mergedAssets.length,
    kept: keptAssets.length,
    omitted: Math.max(0, mergedAssets.length - keptAssets.length),
    limit: assetLimit === Infinity ? "all" : assetLimit,
    componentLinked: 0,
    multicolorSvg: 0,
    inlineSvg: 0,
    monochromeSvg: 0,
    imageIcons: 0,
    images: 0,
    unresolvedIconClues: 0,
    duplicatesMerged: Math.max(0, rawCandidates.length - mergedAssets.length)
  };
  for (const asset of keptAssets || []) {
    if ((asset.linkedComponentIds || []).length) stats.componentLinked += 1;
    if (asset.assetKind === "multicolor-svg") stats.multicolorSvg += 1;
    else if (asset.assetKind === "inline-svg") stats.inlineSvg += 1;
    else if (asset.assetKind === "monochrome-svg") stats.monochromeSvg += 1;
    else if (asset.assetKind === "image-icon") stats.imageIcons += 1;
    else if (asset.assetKind === "unresolved-icon") stats.unresolvedIconClues += 1;
    else if (asset.type === "image") stats.images += 1;
  }
  return stats;
}

function normalizeColors(colors) {
  const sorted = colors
    .slice()
    .filter((color) => analyzeColor(color.value).valid)
    .sort((a, b) => (b.count || 0) - (a.count || 0));
  const seen = new Map();

  return sorted.slice(0, 120).map((color, index) => {
    const analysis = analyzeColor(color.value);
    const usage = color.usage || [];
    const baseRole = semanticColorRole(analysis, usage, index);
    const role = uniqueRole(baseRole, seen);
    const primitive = primitiveColorInfo(color, analysis);
    const observedState = observedStateFromToken(color);
    const semantic = semanticColorInfo(color, analysis, usage, observedState);
    const interactive = interactiveColorInfo(color, analysis, usage, observedState);
    return {
      name: `color/${role}`,
      value: color.value,
      aliases: tokenAliases(color),
      role,
      primitiveFamily: primitive.family,
      primitiveScale: primitive.scale,
      semanticGroup: semantic.group,
      semanticContext: semantic.context,
      semanticState: semantic.state,
      semanticStateSource: semantic.stateSource,
      interactiveGroup: interactive.group,
      interactiveState: interactive.state,
      interactiveStateSource: interactive.stateSource,
      interactiveStateObserved: interactive.stateObserved,
      origin: "observed",
      count: color.count || 0,
      sourceValue: color.value,
      sources: color.sources || [],
      rationale: colorRationale(analysis, usage, semantic, interactive)
    };
  });
}

function normalizeColorModels(colors, paletteMode) {
  const primitiveMap = new Map();
  const semanticMap = new Map();
  const interactiveMap = new Map();

  for (const color of colors || []) {
    const family = color.primitiveFamily || "other";
    if (!primitiveMap.has(family)) primitiveMap.set(family, { family, colors: [] });
    primitiveMap.get(family).colors.push(colorModelToken(color, { scale: color.primitiveScale || "", origin: "observed" }));

    const semanticGroup = color.semanticGroup || "Misc";
    if (!semanticMap.has(semanticGroup)) semanticMap.set(semanticGroup, { group: semanticGroup, tokens: [] });
    semanticMap.get(semanticGroup).tokens.push(colorModelToken(color, {
      context: color.semanticContext || "general",
      state: color.semanticState || "default",
      stateSource: color.semanticStateSource || "observed:computed-css"
    }));

    const interactiveGroup = color.interactiveGroup || "";
    if (interactiveGroup && color.interactiveStateObserved) {
      if (!interactiveMap.has(interactiveGroup)) interactiveMap.set(interactiveGroup, { group: interactiveGroup, states: [] });
      interactiveMap.get(interactiveGroup).states.push(colorModelToken(color, {
        state: color.interactiveState || "default",
        stateSource: color.interactiveStateSource || "observed:computed-css",
        origin: "observed"
      }));
    }
  }

  if (paletteMode === "expanded") {
    addGeneratedPrimitivePalette(primitiveMap);
  }

  const primitiveColorModel = Array.from(primitiveMap.values()).sort((a, b) => primitiveFamilyWeight(a.family) - primitiveFamilyWeight(b.family) || a.family.localeCompare(b.family));
  for (const group of primitiveColorModel) {
    group.colors.sort((a, b) => colorScaleSortValue(a.scale) - colorScaleSortValue(b.scale) || (b.count || 0) - (a.count || 0));
  }

  const semanticColorModel = Array.from(semanticMap.values()).sort((a, b) => semanticGroupWeight(a.group) - semanticGroupWeight(b.group) || a.group.localeCompare(b.group));
  for (const group of semanticColorModel) {
    group.tokens.sort((a, b) => semanticContextWeight(a.context) - semanticContextWeight(b.context) || stateWeight(a.state) - stateWeight(b.state) || (b.count || 0) - (a.count || 0));
  }

  const interactiveColorModel = Array.from(interactiveMap.values()).sort((a, b) => interactiveGroupWeight(a.group) - interactiveGroupWeight(b.group) || a.group.localeCompare(b.group));
  for (const group of interactiveColorModel) {
    group.states.sort((a, b) => stateWeight(a.state) - stateWeight(b.state) || (b.count || 0) - (a.count || 0));
  }

  return { primitiveColorModel, semanticColorModel, interactiveColorModel };
}

function colorModelToken(color, extra) {
  const token = {
    name: color.name,
    role: color.role || "",
    value: color.value,
    sourceValue: color.sourceValue || color.value,
    aliases: color.aliases || [],
    count: color.count || 0,
    sources: color.sources || [],
    rationale: color.rationale || "",
    origin: color.origin || "observed"
  };
  for (const key of Object.keys(extra || {})) {
    token[key] = extra[key];
  }
  return token;
}

function addGeneratedPrimitivePalette(primitiveMap) {
  const scales = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const families = Array.from(primitiveMap.keys()).filter((family) => family !== "overlay" && family !== "transparent" && family !== "black" && family !== "white");
  for (const family of families) {
    const group = primitiveMap.get(family);
    const observedScales = new Set((group.colors || []).map((color) => String(color.scale || "")));
    const seed = seedColorForFamily(group.colors || []);
    if (!seed) continue;
    for (const scale of scales) {
      if (observedScales.has(String(scale))) continue;
      group.colors.push(generatedPrimitiveToken(family, scale, seed));
    }
  }

  if (primitiveMap.has("gray")) {
    const group = primitiveMap.get("gray");
    const observedScales = new Set((group.colors || []).map((color) => String(color.scale || "")));
    for (const scale of scales) {
      if (!observedScales.has(String(scale))) group.colors.push(generatedPrimitiveToken("gray", scale, { hue: 0, saturation: 0 }));
    }
  }
}

function seedColorForFamily(colors) {
  for (const item of colors || []) {
    const analysis = analyzeColor(item.value || "");
    if (analysis.valid && analysis.alpha === 1) return analysis;
  }
  return null;
}

function generatedPrimitiveToken(family, scale, seed) {
  const lightness = generatedScaleLightness(scale);
  const saturation = family === "gray" ? 0 : Math.max(18, Math.min(86, seed.saturation || 45));
  const hue = family === "gray" ? 0 : seed.hue;
  const value = hslToHex(hue, saturation, lightness);
  return {
    name: `color/${family}/${scale}-generated`,
    role: `${family}/${scale}`,
    value,
    sourceValue: value,
    aliases: [],
    count: 0,
    sources: [],
    rationale: `Generated ${family} ${scale} palette step from observed ${family} seed colors. This color was not observed in computed CSS.`,
    origin: "generated",
    scale: String(scale)
  };
}

function generatedScaleLightness(scale) {
  const map = {
    50: 98,
    100: 95,
    200: 90,
    300: 82,
    400: 70,
    500: 56,
    600: 45,
    700: 35,
    800: 25,
    900: 15,
    950: 8
  };
  return map[scale] || 50;
}

function normalizeTypography(types) {
  const groups = new Map();
  for (const type of types || []) {
    const normalized = normalizeTypeToken(type);
    const signature = [
      normalized.fontFamily,
      normalized.fontSize,
      normalized.lineHeight,
      normalized.fontWeight,
      normalized.letterSpacing
    ].join("|");
    if (!groups.has(signature)) {
      groups.set(signature, {
        fontFamily: normalized.fontFamily,
        fontSize: normalized.fontSize,
        fontWeight: normalized.fontWeight,
        lineHeight: normalized.lineHeight,
        letterSpacing: normalized.letterSpacing,
        count: 0,
        aliases: [],
        sources: [],
        sourceValues: []
      });
    }
    const group = groups.get(signature);
    group.count += type.count || 0;
    group.aliases = unique(group.aliases.concat(tokenAliases(type)));
    group.sources = mergeSources(group.sources, type.sources || []);
    group.sourceValues = unique(group.sourceValues.concat(typeSourceValue(type)));
  }

  const sorted = Array.from(groups.values()).sort((a, b) => {
    const sizeDelta = (b.fontSize || 0) - (a.fontSize || 0);
    if (sizeDelta !== 0) return sizeDelta;
    const weightDelta = (Number(b.fontWeight) || 0) - (Number(a.fontWeight) || 0);
    if (weightDelta !== 0) return weightDelta;
    return (b.count || 0) - (a.count || 0);
  });

  return sorted.slice(0, 32).map((type, index) => {
    const scale = typeScaleName(type.fontSize, Number(type.fontWeight) || 400, index);
    return {
      name: `type/${scale}`,
      fontFamily: type.fontFamily,
      fontSize: type.fontSize,
      fontWeight: String(type.fontWeight),
      lineHeight: type.lineHeight,
      letterSpacing: type.letterSpacing,
      count: type.count || 0,
      aliases: type.aliases,
      sourceValue: type.sourceValues[0] || "",
      sourceValues: type.sourceValues,
      sources: type.sources || [],
      rationale: `Merged from observed typography styles with matching font family, size, line height, weight, and letter spacing.`
    };
  });
}

function normalizeTypeToken(type) {
  const size = roundedTypeNumber(type.fontSize || 14);
  return {
    fontFamily: normalizeFontFamily(type.fontFamily || "Inter, sans-serif"),
    fontSize: size,
    fontWeight: normalizeFontWeight(type.fontWeight),
    lineHeight: roundedTypeNumber(type.lineHeight || Math.round(size * 1.3)),
    letterSpacing: normalizeLetterSpacing(type.letterSpacing)
  };
}

function roundedTypeNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeFontWeight(value) {
  const weight = Number(value) || 400;
  if (weight <= 350) return "300";
  if (weight <= 450) return "400";
  if (weight <= 550) return "500";
  if (weight <= 650) return "600";
  return "700";
}

function normalizeLetterSpacing(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) < 0.01) return 0;
  return Math.round(numeric * 100) / 100;
}

function normalizeFontFamily(value) {
  const first = String(value || "Inter, sans-serif").split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  const lower = first.toLowerCase();
  if (lower.indexOf("inter") >= 0 || lower.indexOf("system") >= 0 || lower.indexOf("ui-sans") >= 0) return "Inter";
  if (lower.indexOf("arial") >= 0 || lower.indexOf("helvetica") >= 0) return "Arial";
  if (lower.indexOf("serif") >= 0) return "serif";
  if (lower.indexOf("mono") >= 0 || lower.indexOf("consolas") >= 0) return "monospace";
  return first || "Inter";
}

function mergeSources(existing, incoming) {
  const map = new Map();
  for (const source of existing.concat(incoming || [])) {
    const key = [source.id || "", source.url || "", source.captureStateLabel || ""].join("|");
    if (!map.has(key)) map.set(key, source);
  }
  return Array.from(map.values());
}

function normalizeNumbers(numbers, prefix) {
  return numbers
    .slice()
    .sort((a, b) => (a.value || 0) - (b.value || 0))
    .slice(0, 64)
    .map((token) => ({
      name: `${prefix}/${numberName(prefix, token.value)}`,
      value: token.value,
      count: token.count || 0,
      aliases: tokenAliases(token),
      sourceValue: `${token.value}${prefix === "space" || prefix === "radius" ? "px" : ""}`,
      sources: token.sources || [],
      rationale: `Normalized from raw ${prefix} value ${token.value}.`
    }));
}

function normalizeShadows(shadows) {
  return shadows
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 32)
    .map((shadow, index) => ({
      name: `shadow/${index === 0 ? "elevated" : `elevated-${index + 1}`}`,
      value: shadow.value,
      count: shadow.count || 0,
      aliases: tokenAliases(shadow),
      sourceValue: shadow.value,
      sources: shadow.sources || [],
      rationale: "Semantic name is inferred from observed box-shadow usage frequency."
    }));
}

function normalizeComponents(components, assetCatalog, semanticTokens) {
  const groups = new Map();
  const assetLookup = assetLookupMap(assetCatalog);

  for (const component of components) {
    const key = componentKey(component);
    const naming = componentNaming(component);
    const group = groups.get(key) || {
      name: naming.displayName,
      displayName: naming.displayName,
      semanticName: naming.semanticName,
      namingRationale: naming.rationale,
      category: component.category || "other",
      variants: { state: new Set(), size: new Set(), tone: new Set() },
      stateSources: new Map(),
      sourceComponentIds: [],
      sources: new Map(),
      slots: new Set(),
      examples: [],
      assets: [],
      assetRefs: [],
      warnings: new Set(),
      rationale: "Grouped by category, role, label/text hints, class signature, dimensions, container context, state label, size, tone, and slots."
    };
    if (naming.score > (group.namingScore || 0)) {
      group.name = naming.displayName;
      group.displayName = naming.displayName;
      group.semanticName = naming.semanticName;
      group.namingRationale = naming.rationale;
      group.namingScore = naming.score;
    }

    const sourceIds = component.sourceComponentIds && component.sourceComponentIds.length ? component.sourceComponentIds : [component.id];
    for (const sourceId of sourceIds) group.sourceComponentIds.push(sourceId);
    for (const source of component.sources || []) {
      group.sources.set(`${source.id || ""}|${source.url || ""}`, source);
    }
    for (const state of component.states || ["default"]) group.variants.state.add(normalizeStateName(state));
    group.variants.size.add(inferSize(component));
    group.variants.tone.add(inferTone(component));
    for (const slot of inferSlots(component)) group.slots.add(slot);
    mergeComponentAssets(group, component.assetRefs || [], assetLookup);
    for (const example of component.examples || []) {
      const exampleState = normalizeStateName(example.state || "");
      const captureState = stateFromCaptureLabel(example.captureStateLabel || "");
      if (exampleState) group.variants.state.add(exampleState);
      if (captureState) group.variants.state.add(captureState);
      if (exampleState && example.stateSource) group.stateSources.set(exampleState, example.stateSource);
      if (captureState) group.stateSources.set(captureState, `observed:capture-label:${example.captureStateLabel}`);
      mergeComponentAssets(group, example.assetRefs || [], assetLookup);
      for (const warning of exampleWarnings(example)) group.warnings.add(warning);
      if (group.examples.length < 8) group.examples.push(example);
    }
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const variants = {
      state: Array.from(group.variants.state).sort(compareStates),
      size: Array.from(group.variants.size).sort(),
      tone: Array.from(group.variants.tone).sort()
    };
    const warnings = Array.from(group.warnings).sort();
    const confidence = componentConfidence(group);
    const reviewStatus = componentReviewStatus(confidence, warnings);
    const slots = Array.from(group.slots).sort();
    return {
      name: group.name,
      displayName: group.displayName || group.name,
      semanticName: group.semanticName || group.name,
      namingRationale: group.namingRationale || "",
      category: group.category,
      variants,
      stateSources: Object.fromEntries(group.stateSources),
      sourceComponentIds: group.sourceComponentIds,
      sources: Array.from(group.sources.values()),
      slots,
      assetRefs: group.assetRefs,
      assets: group.assets,
      examples: group.examples,
      confidence,
      needsReview: true,
      reviewStatus,
      reviewChecklist: reviewChecklist(group, variants, warnings),
      componentTokens: componentTokens(group, semanticTokens),
      spec: componentSpec(group, variants, slots, reviewStatus),
      warnings,
      rationale: group.rationale
    };
  });
}

function assetLookupMap(assets) {
  const map = new Map();
  for (const asset of assets || []) {
    const keys = [asset.signature, asset.src, asset.originalHref, asset.spriteId].filter(Boolean);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, asset);
    }
  }
  return map;
}

function mergeComponentAssets(group, refs, assetLookup) {
  for (const ref of refs || []) {
    const key = ref.signature || ref.src || ref.originalHref || ref.spriteId || "";
    if (!key) continue;
    const asset = assetLookup.get(key);
    const normalizedRef = {
      signature: ref.signature || (asset && asset.signature) || "",
      type: ref.type || (asset && asset.type) || "",
      spriteId: ref.spriteId || (asset && asset.spriteId) || "",
      resolution: ref.resolution || (asset && asset.resolution) || "",
      cssProperty: ref.cssProperty || (asset && asset.cssProperty) || "",
      alt: ref.alt || (asset && asset.alt) || ""
    };
    if (normalizedRef.signature && !group.assetRefs.some((item) => item.signature === normalizedRef.signature)) {
      group.assetRefs.push(normalizedRef);
    }
    if (asset && !group.assets.some((item) => item.signature === asset.signature || item.id === asset.id)) {
      group.assets.push(asset);
    }
  }
}

function normalizeContainers(containers, components) {
  const groups = new Map();
  for (const container of containers || []) {
    const key = `${container.type || "container"}|${container.name || ""}|${container.tag || ""}|${container.role || ""}`;
    const group = groups.get(key) || {
      name: semanticContainerName(container),
      type: container.type || "container",
      sourceContainerIds: [],
      sources: new Map(),
      examples: [],
      childSummary: {},
      count: 0,
      confidence: 0.45,
      rationale: "Grouped from extracted container candidates and lightweight DOM ancestry traces."
    };
    group.count += container.count || 0;
    if (container.id) group.sourceContainerIds.push(container.id);
    for (const source of container.sources || []) {
      group.sources.set(`${source.id || ""}|${source.url || ""}`, source);
    }
    for (const example of container.examples || []) {
      if (group.examples.length < 8) group.examples.push(example);
      mergeChildSummary(group.childSummary, example.childSummary || {});
    }
    group.confidence = Math.max(group.confidence, containerConfidence(container));
    groups.set(key, group);
  }

  const inferred = inferContainersFromComponentAncestry(components || []);
  for (const container of inferred) {
    const key = `${container.type}|${container.name}`;
    if (!groups.has(key)) groups.set(key, container);
  }

  return Array.from(groups.values())
    .sort((a, b) => containerTypeWeight(a.type) - containerTypeWeight(b.type) || (b.count || 0) - (a.count || 0))
    .slice(0, 24)
    .map((group) => ({
      name: group.name,
      type: group.type,
      sourceContainerIds: unique(group.sourceContainerIds || []),
      sources: Array.from(group.sources ? group.sources.values() : []),
      examples: group.examples || [],
      childSummary: group.childSummary || {},
      count: group.count || 0,
      confidence: Math.round((group.confidence || 0.45) * 100) / 100,
      needsReview: true,
      rationale: group.rationale || "Inferred from lightweight DOM hierarchy traces."
    }));
}

function semanticContainerName(container) {
  const type = container.type || "container";
  if (container.name && container.name !== titleCase(type)) return container.name;
  if (type === "sidebar") return "Sidebar";
  if (type === "top-bar") return "Header / Top Bar";
  if (type === "composer-form") return "Composer / Form Container";
  if (type === "form-section") return "Form Section";
  if (type === "menu-list") return "Menu Group";
  if (type === "nav-group") return "Navigation Group";
  if (type === "breadcrumb") return "Breadcrumb";
  if (type === "list-group") return "List Group";
  if (type === "card-grid") return "Card Grid";
  if (type === "table") return "Table";
  if (type === "dialog-popover") return "Dialog / Popover";
  return titleCase(type);
}

function mergeChildSummary(target, source) {
  for (const key of Object.keys(source || {})) {
    target[key] = (target[key] || 0) + (source[key] || 0);
  }
}

function containerConfidence(container) {
  let score = 0.45;
  if ((container.count || 0) > 1) score += 0.1;
  if ((container.examples || []).length > 1) score += 0.1;
  const first = container.examples && container.examples[0] ? container.examples[0] : {};
  if (first.nearestLandmark) score += 0.1;
  if (first.childSummary && Object.keys(first.childSummary).length) score += 0.1;
  return Math.max(0.2, Math.min(0.9, score));
}

function inferContainersFromComponentAncestry(components) {
  const map = new Map();
  for (const component of components || []) {
    for (const example of component.examples || []) {
      const landmark = example.nearestLandmark;
      if (!landmark) continue;
      const type = containerTypeFromTrace(landmark);
      if (!type) continue;
      const key = `${type}|${landmark.tag}|${landmark.role}|${landmark.className || ""}`;
      const group = map.get(key) || {
        name: semanticContainerName({ type }),
        type,
        sourceContainerIds: [],
        sources: new Map(),
        examples: [],
        childSummary: {},
        count: 0,
        confidence: 0.45,
        rationale: "Inferred from component nearest-landmark ancestry because no direct container candidate was extracted."
      };
      group.count += 1;
      group.childSummary[component.category || "component"] = (group.childSummary[component.category || "component"] || 0) + 1;
      if (group.examples.length < 8) {
        group.examples.push({
          tag: landmark.tag,
          role: landmark.role,
          className: landmark.className,
          bounds: landmark.bounds,
          childSummary: group.childSummary,
          sourcePageId: example.sourcePageId || "",
          sourceUrl: example.sourceUrl || "",
          sourceTitle: example.sourceTitle || ""
        });
      }
      map.set(key, group);
    }
  }
  return Array.from(map.values());
}

function containerTypeFromTrace(trace) {
  const tag = trace.tag || "";
  const role = String(trace.role || "").toLowerCase();
  const className = String(trace.className || "").toLowerCase();
  if (tag === "aside" || className.includes("sidebar")) return "sidebar";
  if (tag === "header" || role === "banner") return "top-bar";
  if (tag === "form" || role === "form" || className.includes("composer")) return "composer-form";
  if (role === "form" || className.includes("form")) return "form-section";
  if (className.includes("breadcrumb")) return "breadcrumb";
  if (role === "list" || className.includes("list")) return "list-group";
  if (role === "table" || role === "grid" || className.includes("table")) return "table";
  if (className.includes("card-grid") || className.includes("cards")) return "card-grid";
  if (tag === "nav" || role === "navigation") return "nav-group";
  if (role === "menu" || role === "listbox" || className.includes("menu")) return "menu-list";
  if (tag === "dialog" || role === "dialog" || className.includes("popover") || className.includes("modal")) return "dialog-popover";
  return "";
}

function containerTypeWeight(type) {
  const order = ["top-bar", "nav-group", "breadcrumb", "sidebar", "form-section", "composer-form", "menu-list", "list-group", "card-grid", "table", "dialog-popover"];
  const index = order.indexOf(type);
  return index >= 0 ? index : 99;
}

function normalizeWarnings(components, assets) {
  const warnings = [];
  for (const component of components) {
    for (const example of component.examples || []) {
      for (const warning of exampleWarnings(example)) {
        warnings.push({
          type: warning,
          sourceComponentId: example.sourcePageId ? `${example.sourcePageId}:${component.id}` : component.id,
          componentName: component.name,
          sourcePageId: example.sourcePageId || "",
          sourceUrl: example.sourceUrl || "",
          message: warningMessage(warning)
        });
      }
    }
  }
  for (const asset of assets) {
    const resolution = asset.resolution || "";
    if (asset.type === "svg" && (String(asset.src || "").includes("<use") || resolution.includes("unresolved") || resolution.includes("failed") || resolution === "external-sprite-reference")) {
      warnings.push({
        type: "external-sprite-reference",
        sourceComponentId: "",
        componentName: "",
        message: "SVG uses an external sprite reference; the importer can show a traceable placeholder but cannot expand the real path yet."
      });
    }
  }
  return warnings.slice(0, 120);
}

function tokenAliases(token) {
  return unique((token.aliases || []).concat([token.name].filter(Boolean))).slice(0, 12);
}

function typeSourceValue(type) {
  return `${type.fontFamily || "unknown"} ${type.fontWeight || "400"} ${type.fontSize || 0}px/${type.lineHeight || 0}px`;
}

function exampleWarnings(example) {
  const warnings = [];
  const visibility = example.visibility || {};
  const styles = example.styles || {};
  if (visibility.width === 0 || visibility.height === 0) warnings.push("zero-size-node");
  if (visibility.clipped) warnings.push("clipped-content");
  if (styles.contrastRatio && styles.contrastRatio < 3) warnings.push("low-contrast");
  if (!styles.effectiveBackgroundColor && styles.backgroundColor === "") warnings.push("source-background-may-be-missing");
  if (example.stateSource && String(example.stateSource).startsWith("inferred:")) warnings.push("inferred-state");
  return warnings;
}

function normalizeStateName(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "focused") return "focus";
  if (state === "selected") return "selected";
  return state;
}

function stateFromCaptureLabel(value) {
  const label = String(value || "").trim().toLowerCase();
  if (!label || label === "default") return "";
  if (label === "focused" || label === "focus") return "focus";
  if (label === "selected") return "selected";
  if (label.includes("-open") || label === "open") return "open";
  if (label.includes("active")) return "active";
  if (label.includes("hover")) return "hover";
  return "";
}

function compareStates(a, b) {
  const order = ["default", "open", "hover", "active", "focus", "selected", "disabled"];
  const left = order.indexOf(String(a || ""));
  const right = order.indexOf(String(b || ""));
  const leftValue = left >= 0 ? left : 99;
  const rightValue = right >= 0 ? right : 99;
  return leftValue - rightValue || String(a || "").localeCompare(String(b || ""));
}

function warningMessage(type) {
  if (type === "zero-size-node") return "Node has zero width or height and may not be visible.";
  if (type === "clipped-content") return "Node may be clipped by a parent container.";
  if (type === "low-contrast") return "Foreground/background contrast is low; preview may be hard to see.";
  if (type === "source-background-may-be-missing") return "Source background may be missing; preview context may be incomplete.";
  if (type === "inferred-state") return "State was inferred from class/ARIA/data attributes, not actively captured.";
  return type;
}

function designSystemSpec(tokens, components, assets, warnings, sources, assetCatalogStats = {}) {
  return {
    status: "draft-needs-review",
    intent: "Reverse Design System Draft for audit and review, not a production-ready component library.",
    sourcePages: sources.length || 1,
    foundations: {
      colors: foundationStatus(tokens.colors),
      typography: foundationStatus(tokens.typography),
      spacing: foundationStatus(tokens.spacing),
      radii: foundationStatus(tokens.radii),
      shadows: foundationStatus(tokens.shadows),
      motion: missingFoundation("Motion tokens are not extracted yet."),
      breakpoints: missingFoundation("Responsive breakpoints are not extracted yet."),
      grid: missingFoundation("Grid and layout rules are not inferred yet."),
      density: missingFoundation("Density modes are not inferred yet.")
    },
    inventory: {
      componentCandidates: components.length,
      assets: assets.length,
      warnings: warnings.length,
      unresolvedIcons: assets.filter((asset) => asset.type === "svg" && !canRenderSvg(asset)).length,
      assetCatalog: assetCatalogStats
    },
    governance: {
      defaultReviewStatus: "needs-review",
      allowedStatuses: ["candidate", "needs-review", "accepted", "rejected", "deprecated"],
      nextStep: "Review component candidates, confirm token semantics, and promote accepted items into a formal specification."
    }
  };
}

function foundationStatus(items) {
  return {
    status: items && items.length ? "inferred-needs-review" : "missing",
    count: items ? items.length : 0
  };
}

function missingFoundation(note) {
  return {
    status: "missing",
    count: 0,
    note
  };
}

function canRenderSvg(asset) {
  const src = String(asset.src || "").trim();
  return src.indexOf("<svg") === 0 && src.indexOf("<use") === -1;
}

function componentReviewStatus(confidence, warnings) {
  if (warnings.length >= 3 || confidence < 0.45) return "needs-review";
  if (confidence >= 0.75 && warnings.length === 0) return "candidate";
  return "needs-review";
}

function reviewChecklist(group, variants, warnings) {
  return [
    checklistItem("Confirm component anatomy and slots", group.slots.size > 0 ? "partial" : "needs-review"),
    checklistItem("Confirm variant names and grouping", variants.state.length + variants.size.length + variants.tone.length > 3 ? "partial" : "needs-review"),
    checklistItem("Confirm semantic token mapping", "needs-review"),
    checklistItem("Confirm accessibility behavior", warnings.includes("low-contrast") ? "needs-review" : "not-checked"),
    checklistItem("Confirm interaction states are actively captured", hasInferredState(group) ? "needs-review" : "partial")
  ];
}

function checklistItem(label, status) {
  return { label, status };
}

function hasInferredState(group) {
  for (const source of group.stateSources.values()) {
    if (String(source).startsWith("inferred:")) return true;
  }
  return false;
}

function componentTokens(group, semanticTokens) {
  const example = group.examples[0] || {};
  const styles = example.styles || {};
  return {
    background: nearestColorToken(styles.backgroundColor || styles.effectiveBackgroundColor || "", semanticTokens.colors || []),
    foreground: nearestColorToken(styles.color || "", semanticTokens.colors || []),
    radius: nearestNumberToken(parseFloat(styles.borderRadius) || 0, semanticTokens.radii || []),
    shadow: nearestStringToken(styles.boxShadow || "", semanticTokens.shadows || []),
    height: example.height || 0,
    width: example.width || 0,
    source: "inferred-from-first-example"
  };
}

function componentSpec(group, variants, slots, reviewStatus) {
  return {
    status: reviewStatus,
    anatomy: slots,
    variants,
    states: variants.state,
    accessibility: {
      status: "not-validated",
      notes: ["Roles, keyboard behavior, focus management, and ARIA labels require manual review."]
    },
    usage: {
      status: "not-authored",
      notes: ["Usage guidance must be written after candidate review."]
    }
  };
}

function nearestColorToken(value, colors) {
  if (!value) return null;
  for (const color of colors) {
    if (String(color.value).toLowerCase() === String(value).toLowerCase()) return tokenRef(color);
  }
  return { token: "", sourceValue: value, match: "unmatched-raw-value" };
}

function nearestNumberToken(value, tokens) {
  if (!value) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const token of tokens) {
    const delta = Math.abs((token.value || 0) - value);
    if (delta < bestDelta) {
      best = token;
      bestDelta = delta;
    }
  }
  return best ? { ...tokenRef(best), match: bestDelta === 0 ? "exact" : "nearest", delta: bestDelta } : null;
}

function nearestStringToken(value, tokens) {
  if (!value) return null;
  for (const token of tokens) {
    if (token.value === value) return tokenRef(token);
  }
  return { token: "", sourceValue: value, match: "unmatched-raw-value" };
}

function tokenRef(token) {
  return {
    token: token.name,
    sourceValue: token.sourceValue || token.value || "",
    match: "exact"
  };
}

function componentConfidence(group) {
  let score = 0.5;
  if (group.sourceComponentIds.length >= 3) score += 0.15;
  if (group.slots.size > 0) score += 0.1;
  if (group.variants.state.size > 1) score += 0.1;
  if (group.warnings.size > 0) score -= 0.15;
  return Math.max(0.1, Math.min(0.95, Math.round(score * 100) / 100));
}

function componentKey(component) {
  const example = firstExample(component);
  const hints = example.namingHints || {};
  return [
    component.category || "other",
    example.role || hints.role || "",
    normalizedNamePart(primaryNamingHint(component)),
    compactClassSignature(example.className || ""),
    roundedDimension(example.width || 0, 8),
    roundedDimension(example.height || 0, 4),
    containerContextKey(example),
    example.captureStateLabel || "",
    inferSize(component),
    inferTone(component),
    inferSlots(component).join("-")
  ].join("|");
}

function semanticComponentName(component) {
  const category = component.category || "Component";
  if (category === "button") return "Button";
  if (category === "text-input") return "Text Input";
  if (category === "menu-item") return "Menu Item";
  if (category === "navigation") return "Navigation";
  if (category === "link") return "Link";
  if (category === "card") return "Card";
  if (category === "select") return "Select";
  if (category === "tab") return "Tab";
  if (category === "checkbox") return "Checkbox";
  if (category === "radio") return "Radio";
  if (category === "switch") return "Switch";
  if (category === "tag") return "Tag / Badge";
  if (category === "breadcrumb") return "Breadcrumb";
  if (category === "form-field") return "Form Field";
  return titleCase(category);
}

function componentNaming(component) {
  const example = firstExample(component);
  const categoryName = semanticComponentName(component);
  const primary = primaryNamingHint(component);
  const context = semanticContextName(example);
  const suffix = semanticSuffix(component);
  let semanticName = categoryName;
  let rationale = "Fallback semantic name inferred from component category.";
  let score = 1;

  if (primary) {
    semanticName = titleCase(cleanName(primary));
    rationale = `Name inferred from ${primaryNamingSource(component)}.`;
    score = 8;
  } else if (context) {
    semanticName = `${context} ${suffix}`;
    rationale = "Name inferred from landmark/container context and component category.";
    score = 5;
  } else if (component.name && component.name !== categoryName) {
    semanticName = titleCase(cleanName(component.name));
    rationale = "Name carried from raw extractor best-effort naming.";
    score = 4;
  }

  semanticName = semanticNameWithSuffix(semanticName, suffix, component);
  return {
    displayName: semanticName,
    semanticName,
    rationale,
    score
  };
}

function primaryNamingHint(component) {
  const examples = component.examples || [];
  for (const source of ["ariaLabel", "title", "text", "nearbyLabel"]) {
    for (const example of examples) {
      const hints = example.namingHints || {};
      const value = cleanName(hints[source] || "");
      if (isUsefulName(value)) return value;
    }
  }
  for (const source of ["data", "icons"]) {
    for (const example of examples) {
      const hints = example.namingHints || {};
      const values = hints[source] || [];
      for (const value of values) {
        const cleaned = cleanName(value);
        if (isUsefulName(cleaned)) return cleaned;
      }
    }
  }
  return "";
}

function primaryNamingSource(component) {
  const examples = component.examples || [];
  for (const source of ["ariaLabel", "title", "text", "nearbyLabel"]) {
    for (const example of examples) {
      const hints = example.namingHints || {};
      if (isUsefulName(cleanName(hints[source] || ""))) return `namingHints.${source}`;
    }
  }
  for (const source of ["data", "icons"]) {
    for (const example of examples) {
      const hints = example.namingHints || {};
      const values = hints[source] || [];
      for (const value of values) {
        if (isUsefulName(cleanName(value))) return `namingHints.${source}`;
      }
    }
  }
  return "category";
}

function semanticNameWithSuffix(name, suffix, component) {
  const cleaned = titleCase(cleanName(name || ""));
  if (!cleaned) return suffix;
  const lower = cleaned.toLowerCase();
  const suffixLower = suffix.toLowerCase();
  if (lower === suffixLower || lower.endsWith(` ${suffixLower}`)) return cleaned;
  if (component.category === "button" && lower.includes("button")) return cleaned;
  if (component.category === "link" && lower.includes("link")) return cleaned;
  if (component.category === "menu-item" && lower.includes("item")) return cleaned;
  if (component.category === "tab" && lower.includes("tab")) return cleaned;
  if (component.category === "checkbox" && lower.includes("checkbox")) return cleaned;
  if (component.category === "radio" && lower.includes("radio")) return cleaned;
  if (component.category === "switch" && lower.includes("switch")) return cleaned;
  if (component.category === "tag" && (lower.includes("tag") || lower.includes("badge"))) return cleaned;
  return `${cleaned} ${suffix}`;
}

function semanticSuffix(component) {
  const category = component.category || "";
  const example = firstExample(component);
  const role = String(example.role || "").toLowerCase();
  const className = String(example.className || "").toLowerCase();
  const hints = example.namingHints || {};
  const hintText = [
    hints.ariaLabel || "",
    hints.title || "",
    hints.text || "",
    hints.nearbyLabel || "",
    (hints.data || []).join(" "),
    (hints.icons || []).join(" ")
  ].join(" ").toLowerCase();
  if (category === "button") {
    if (role === "combobox" ||
      className.includes("dropdown") ||
      className.includes("select") ||
      className.includes("trigger") ||
      hintText.includes("dropdown") ||
      hintText.includes("select") ||
      hintText.includes("switcher") ||
      hintText.includes("chevron") ||
      hintText.includes("caret")) return "Dropdown Button";
    if (inferSlots(component).includes("icon")) return "Button";
    return "Button";
  }
  if (category === "text-input") return "Input";
  if (category === "menu-item") return "Menu Item";
  if (category === "navigation") return "Navigation";
  if (category === "link") return "Link";
  if (category === "card") return "Card";
  if (category === "select") return "Select";
  if (category === "tab") return "Tab";
  if (category === "checkbox") return "Checkbox";
  if (category === "radio") return "Radio";
  if (category === "switch") return "Switch";
  if (category === "tag") return "Tag";
  if (category === "breadcrumb") return "Breadcrumb";
  if (category === "form-field") return "Form Field";
  return semanticComponentName(component);
}

function semanticContextName(example) {
  const landmark = example.nearestLandmark || {};
  const className = String(landmark.className || example.className || "").toLowerCase();
  const role = String(landmark.role || "").toLowerCase();
  const tag = String(landmark.tag || "").toLowerCase();
  if (className.includes("sidebar") || tag === "aside" || role === "complementary") return "Sidebar";
  if (className.includes("account") || className.includes("profile") || className.includes("avatar")) return "Account Profile";
  if (className.includes("model")) return "Model Switcher";
  if (className.includes("menu") || role === "menu") return "Menu";
  if (className.includes("composer") || tag === "form") return "Composer";
  if (tag === "nav" || role === "navigation") return "Navigation";
  return "";
}

function containerContextKey(example) {
  const landmark = example.nearestLandmark || {};
  return [
    landmark.tag || "",
    landmark.role || "",
    compactClassSignature(landmark.className || "")
  ].join(".");
}

function compactClassSignature(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^[a-z0-9_-]*[0-9]{3,}[a-z0-9_-]*$/i.test(part))
    .slice(0, 4)
    .join(".");
}

function roundedDimension(value, unit) {
  return Math.round((Number(value) || 0) / unit) * unit;
}

function normalizedNamePart(value) {
  return cleanName(value).toLowerCase().slice(0, 80);
}

function cleanName(value) {
  return String(value || "")
    .replace(/[_./|:]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function isUsefulName(value) {
  const cleaned = cleanName(value);
  if (!cleaned || cleaned.length < 2) return false;
  if (/^(button|icon|menu|item|link|input|select|tab|checkbox|radio|switch|tag|badge|field|true|false|open|closed)$/i.test(cleaned)) return false;
  return true;
}

function inferSize(component) {
  const example = firstExample(component);
  const width = example.width || 0;
  const height = example.height || 0;
  if (width <= 44 && height <= 44) return "icon";
  if (height <= 32) return "sm";
  if (height <= 44) return "md";
  if (height <= 64) return "lg";
  return "container";
}

function inferTone(component) {
  const example = firstExample(component);
  const styles = example.styles || {};
  const bg = analyzeColor(styles.backgroundColor || "");
  const fg = analyzeColor(styles.color || "");
  if (!styles.backgroundColor || bg.alpha === 0) return "ghost";
  if (bg.lightness < 20 && fg.lightness > 70) return "inverse";
  if (bg.saturation > 35) return "primary";
  if (bg.lightness > 88) return "secondary";
  return "neutral";
}

function inferSlots(component) {
  const example = firstExample(component);
  const slots = [];
  if (["checkbox", "radio", "switch"].includes(component.category || "")) slots.push("indicator");
  if (example.text) slots.push("label");
  if (component.signature && /\|\d+\|text$/.test(component.signature) === false) slots.push("icon");
  if (String(example.className || "").toLowerCase().includes("icon")) slots.push("icon");
  return slots.length ? unique(slots) : ["container"];
}

function firstExample(component) {
  return component.examples && component.examples[0] ? component.examples[0] : {};
}

function semanticColorRole(analysis, usage, index) {
  const suffix = index > 0 ? `-${index + 1}` : "";
  if (analysis.alpha > 0 && analysis.alpha < 0.2) {
    const overlayBase = analysis.saturation < 8 ? "black" : hueName(analysis.hue);
    return `overlay/${overlayBase}-${Math.round(analysis.alpha * 100)}`;
  }
  if (analysis.alpha === 0) return `transparent${suffix}`;
  if (analysis.saturation < 8) {
    if (analysis.lightness > 96) return `white${suffix}`;
    if (analysis.lightness < 6) return `black${suffix}`;
    if (usage.includes("color") && analysis.lightness < 50) return `fg/default${suffix}`;
    if (usage.includes("backgroundColor") && analysis.lightness > 80) return `bg/subtle${suffix}`;
    return `gray/${nearestScale(analysis.lightness)}`;
  }
  if (usage.includes("backgroundColor") && analysis.lightness < 25) return `bg/elevated${suffix}`;
  if (usage.includes("color") && analysis.lightness < 45) return `fg/accent${suffix}`;
  return `${hueName(analysis.hue)}/${nearestScale(analysis.lightness)}`;
}

function primitiveColorInfo(color, analysis) {
  if (analysis.alpha === 0) return { family: "transparent", scale: "a0" };
  if (analysis.alpha > 0 && analysis.alpha < 1) {
    const family = analysis.saturation < 8 ? "overlay" : hueName(analysis.hue);
    return { family, scale: `a${Math.round(analysis.alpha * 100)}` };
  }
  if (analysis.saturation < 8) {
    if (analysis.lightness > 96) return { family: "white", scale: "1000" };
    if (analysis.lightness < 6) return { family: "black", scale: "1000" };
    return { family: "gray", scale: String(nearestScale(analysis.lightness)) };
  }
  return { family: hueName(analysis.hue), scale: String(nearestScale(analysis.lightness)) };
}

function semanticColorInfo(color, analysis, usage, observedState) {
  const text = colorSearchText(color);
  const state = inferTokenState(text);
  const stateInfo = observedState || { state: "default", source: "observed:computed-css" };
  const finalState = stateInfo.state !== "default" ? stateInfo.state : state;
  const stateSource = stateInfo.state !== "default" ? stateInfo.source : state === "default" ? "observed:computed-css" : `inferred:name:${state}`;
  const context = inferColorContext(text);
  if (hasUsage(usage, "border")) return { group: "Border", context, state: finalState, stateSource };
  if (usage.includes("stroke") || usage.includes("fill")) return { group: "Icon", context, state: finalState, stateSource };
  if (usage.includes("color") && !usage.includes("backgroundColor")) {
    if (text.indexOf("link") >= 0 || (analysis.saturation >= 25 && analysis.lightness < 55)) return { group: "Link", context, state: finalState, stateSource };
    return { group: "Text / Foreground", context, state: finalState, stateSource };
  }
  if (usage.includes("backgroundColor") && !usage.includes("color")) {
    if (isStatusColor(text, analysis)) return { group: "Status", context, state: finalState, stateSource };
    return { group: "Background", context, state: finalState, stateSource };
  }
  if (usage.includes("backgroundColor") && usage.includes("color")) {
    if (analysis.lightness > 85) return { group: "Background", context, state: finalState, stateSource };
    if (analysis.lightness < 35) return { group: "Text / Foreground", context, state: finalState, stateSource };
    return { group: "Misc", context, state: finalState, stateSource };
  }
  if (isStatusColor(text, analysis)) return { group: "Status", context, state: finalState, stateSource };
  if (context === "content" || context === "message") return { group: "Content", context, state: finalState, stateSource };
  return { group: "Misc", context, state: finalState, stateSource };
}

function interactiveColorInfo(color, analysis, usage, observedState) {
  const text = colorSearchText(color);
  const inferredState = inferTokenState(text);
  const observed = observedState || { state: "default", source: "observed:computed-css" };
  const stateObserved = String(observed.source || "").indexOf("inferred:") !== 0;
  const state = observed.state || "default";
  const stateSource = observed.state === "default" ? "observed:computed-css" : observed.source;
  if (hasUsage(usage, "border") || usage.includes("color") || usage.includes("backgroundColor") || usage.includes("fill") || usage.includes("stroke")) {
    return {
      group: inferInteractiveGroup(text, analysis),
      state,
      stateSource,
      stateObserved,
      inferredState,
      inferredStateSource: inferredState === state ? stateSource : `inferred:name:${inferredState}`
    };
  }
  return { group: "", state, stateSource, stateObserved: false };
}

function colorRationale(analysis, usage, semantic, interactive) {
  const semanticPart = semantic ? ` Semantic group inferred as ${semantic.group} (${semantic.context}/${semantic.state}).` : "";
  const interactivePart = interactive && interactive.group ? ` Interactive group inferred as ${interactive.group}/${interactive.state}.` : "";
  return `Observed in ${usage.join(", ") || "unknown usage"} with hue ${analysis.hue}, saturation ${analysis.saturation}, lightness ${analysis.lightness}.${semanticPart}${interactivePart}`;
}

function analyzeColor(value) {
  const hex = normalizeHex(value);
  if (!hex) return { valid: false, hue: 0, saturation: 0, lightness: 0, alpha: 0 };
  const rgb = {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { valid: true, hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha };
}

function normalizeHex(value) {
  if (!value || typeof value !== "string") return "";
  let hex = value.trim().replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((part) => part + part).join("");
  return /^[0-9a-f]{6,8}$/i.test(hex) ? hex.toLowerCase() : "";
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
  const hue = ((Number(h) || 0) % 360) / 360;
  const saturation = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
  const lightness = Math.max(0, Math.min(100, Number(l) || 0)) / 100;
  let r;
  let g;
  let b;
  if (saturation === 0) {
    r = lightness;
    g = lightness;
    b = lightness;
  } else {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    r = hueToRgb(p, q, hue + 1 / 3);
    g = hueToRgb(p, q, hue);
    b = hueToRgb(p, q, hue - 1 / 3);
  }
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function toHexChannel(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
}

function hueName(hue) {
  if (hue < 18 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 205) return "cyan";
  if (hue < 255) return "blue";
  if (hue < 295) return "purple";
  return "pink";
}

function nearestScale(lightness) {
  return Math.max(0, Math.min(1000, Math.round((100 - lightness) / 5) * 50));
}

function colorSearchText(color) {
  return [color.name || "", (color.aliases || []).join(" "), color.role || ""].join(" ").toLowerCase();
}

function hasUsage(usage, keyword) {
  return (usage || []).some((item) => String(item || "").toLowerCase().includes(keyword));
}

function inferTokenState(text) {
  const value = String(text || "").toLowerCase();
  if (value.indexOf("disabled") >= 0 || value.indexOf("inactive") >= 0) return "inactive";
  if (value.indexOf("selected") >= 0 || value.indexOf("current") >= 0 || value.indexOf("checked") >= 0) return "selected";
  if (value.indexOf("press") >= 0 || value.indexOf("active") >= 0) return "press";
  if (value.indexOf("hover") >= 0) return "hover";
  if (value.indexOf("focus") >= 0) return "focus";
  if (value.indexOf("open") >= 0) return "open";
  return "default";
}

function observedStateFromToken(token) {
  const fromUsage = stateFromTokenUsage(token.usage || []);
  if (fromUsage.state !== "default") return fromUsage;
  return observedStateFromSources(token.sources || []);
}

function observedStateFromSources(sources) {
  for (const source of sources || []) {
    const state = stateFromCaptureLabel(source.captureStateLabel || "");
    if (state && state !== "default") {
      return { state, source: `observed:capture-label:${source.captureStateLabel}` };
    }
  }
  return { state: "default", source: "observed:computed-css" };
}

function stateFromTokenUsage(usage) {
  for (const item of usage || []) {
    const match = String(item || "").match(/^stylesheet:pseudo:([^:]+):/);
    if (match && match[1]) return { state: normalizeStateName(match[1]), source: `stylesheet:pseudo:${match[1]}` };
  }
  return { state: "default", source: "observed:computed-css" };
}

function inferColorContext(text) {
  const value = String(text || "").toLowerCase();
  if (value.indexOf("sidebar") >= 0 || value.indexOf("nav") >= 0 || value.indexOf("menu") >= 0) return "sidebar";
  if (value.indexOf("composer") >= 0 || value.indexOf("input") >= 0 || value.indexOf("prompt") >= 0) return "composer";
  if (value.indexOf("message") >= 0 || value.indexOf("conversation") >= 0 || value.indexOf("chat") >= 0) return "message";
  if (value.indexOf("tag") >= 0 || value.indexOf("badge") >= 0 || value.indexOf("pill") >= 0) return "tag";
  if (value.indexOf("modal") >= 0 || value.indexOf("popover") >= 0 || value.indexOf("dialog") >= 0) return "overlay";
  if (value.indexOf("content") >= 0 || value.indexOf("article") >= 0 || value.indexOf("body") >= 0) return "content";
  return "general";
}

function isStatusColor(text, analysis) {
  const value = String(text || "").toLowerCase();
  if (value.indexOf("error") >= 0 || value.indexOf("danger") >= 0 || value.indexOf("warning") >= 0 || value.indexOf("success") >= 0 || value.indexOf("status") >= 0) return true;
  return analysis.saturation >= 35 && (analysis.hue < 45 || analysis.hue >= 345 || (analysis.hue >= 45 && analysis.hue < 70) || (analysis.hue >= 70 && analysis.hue < 165));
}

function inferInteractiveGroup(text, analysis) {
  const value = String(text || "").toLowerCase();
  if (analysis.saturation < 8) {
    if (analysis.lightness < 25) return "primary";
    if (analysis.lightness < 75) return "secondary";
    return "tertiary";
  }
  if (value.indexOf("danger") >= 0 || value.indexOf("error") >= 0 || analysis.hue < 18 || analysis.hue >= 345) return analysis.lightness > 70 ? "danger-secondary" : "danger-primary";
  if (value.indexOf("accent") >= 0) return analysis.lightness > 75 ? "accent-muted" : "accent";
  if (analysis.saturation >= 25 && analysis.lightness < 70) return "accent";
  if (analysis.lightness < 25) return "primary";
  if (analysis.lightness < 75) return "secondary";
  return "tertiary";
}

function primitiveFamilyWeight(family) {
  const order = ["gray", "black", "white", "blue", "green", "orange", "pink", "purple", "red", "yellow", "overlay", "transparent", "other"];
  const index = order.indexOf(family);
  return index >= 0 ? index : 99;
}

function colorScaleSortValue(scale) {
  const value = String(scale || "");
  const alpha = value.charAt(0) === "a";
  const numeric = parseInt(alpha ? value.slice(1) : value, 10);
  if (!Number.isNaN(numeric)) return (alpha ? 2000 : 0) + numeric;
  return 9999;
}

function semanticGroupWeight(group) {
  const order = ["Background", "Text / Foreground", "Icon", "Border", "Link", "Content", "Status", "Misc"];
  const index = order.indexOf(group);
  return index >= 0 ? index : 99;
}

function semanticContextWeight(context) {
  const order = ["general", "sidebar", "composer", "message", "content", "tag", "overlay"];
  const index = order.indexOf(context);
  return index >= 0 ? index : 99;
}

function interactiveGroupWeight(group) {
  const order = ["accent", "accent-muted", "danger-primary", "danger-secondary", "primary", "secondary", "tertiary"];
  const index = order.indexOf(group);
  return index >= 0 ? index : 99;
}

function stateWeight(state) {
  const order = ["default", "hover", "inactive", "press", "selected", "open", "focus"];
  const index = order.indexOf(state);
  return index >= 0 ? index : 99;
}

function typeScaleName(size, weight, index) {
  const emphasis = weight >= 650 ? "bold" : weight >= 550 ? "medium" : "regular";
  if (size >= 32) return `display-${emphasis}`;
  if (size >= 24) return `title-${emphasis}`;
  if (size >= 18) return `heading-${emphasis}`;
  if (size >= 15) return `body-${emphasis}`;
  if (size >= 12) return `body-small-${emphasis}`;
  return `caption-${emphasis}-${index + 1}`;
}

function numberName(prefix, value) {
  if (prefix === "radius") {
    if (value >= 999) return "full";
    if (value <= 2) return "xs";
    if (value <= 6) return "sm";
    if (value <= 10) return "md";
    if (value <= 18) return "lg";
    return String(value);
  }
  return String(value);
}

function unique(items) {
  return Array.from(new Set(items));
}

function uniqueRole(role, seen) {
  const count = seen.get(role) || 0;
  seen.set(role, count + 1);
  return count === 0 ? role : `${role}-${count + 1}`;
}

function titleCase(value) {
  return String(value).replace(/(^|-|\s)\S/g, (letter) => letter.toUpperCase()).replace(/-/g, " ");
}

function assetName(asset, index) {
  if (asset.alt) return titleCase(asset.alt).slice(0, 48);
  const id = spriteId(asset.src || "");
  if (id) return `Icon ${id}`;
  if (asset.type === "image") return `Image ${index + 1}`;
  return `Asset ${index + 1}`;
}

function spriteId(src) {
  const match = String(src).match(/#([a-z0-9_-]+)/i);
  return match ? match[1] : "";
}
