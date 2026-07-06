(function () {
  "use strict";

  const MAX_ELEMENTS = 2500;
  const MAX_COMPONENTS = 180;
  const MAX_ASSETS = 1200;
  const MAX_EXAMPLES_PER_COMPONENT = 5;
  const MAX_SNAPSHOT_VIEWPORT_NODES = 800;
  const MAX_SNAPSHOT_FULL_PAGE_NODES = 1800;
  const MAX_SNAPSHOT_FULL_PAGE_HEIGHT = 12000;

  const COLOR_PROPS = [
    "color",
    "backgroundColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "fill",
    "stroke"
  ];

  const SPACING_PROPS = [
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "columnGap",
    "rowGap",
    "gap"
  ];

  async function extractDesignSystem(options = {}) {
    const root = options.root || document.body;
    const captureStateLabel = normalizeCaptureStateLabel(options.captureStateLabel);
    const elements = Array.from(root.querySelectorAll("*"))
      .filter(isVisibleElement)
      .slice(0, options.maxElements || MAX_ELEMENTS);

    const colorMap = new Map();
    const typeMap = new Map();
    const radiusMap = new Map();
    const shadowMap = new Map();
    const spacingMap = new Map();
    const assetMap = new Map();
    const componentMap = new Map();
    const containerMap = new Map();

    for (const element of elements) {
      const style = getComputedStyle(element);
      collectColors(style, colorMap);
      collectTypography(element, style, typeMap);
      collectRadii(style, radiusMap);
      collectShadows(style, shadowMap);
      collectSpacing(style, spacingMap);
      collectAsset(element, style, assetMap);
      collectComponent(element, style, componentMap, captureStateLabel, assetMap);
      collectContainerCandidate(element, style, containerMap, captureStateLabel);
    }
    collectStylesheetPseudoColors(colorMap);

    const payload = {
      version: "0.1.0",
      source: {
        url: location.href,
        hostname: location.hostname,
        title: document.title,
        capturedAt: new Date().toISOString(),
        captureStateLabel,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      tokens: {
        colors: nameColors(toSortedTokens(colorMap, 120)),
        typography: nameTypography(toSortedTokens(typeMap, 60)),
        radii: nameNumberTokens(toSortedTokens(radiusMap, 40), "radius"),
        shadows: nameStringTokens(toSortedTokens(shadowMap, 40), "shadow"),
        spacing: nameNumberTokens(toSortedTokens(spacingMap, 80), "space")
      },
      components: toComponents(componentMap),
      containers: toContainers(containerMap),
      assets: toAssets(assetMap),
      stats: {
        scannedElements: elements.length,
        componentGroups: componentMap.size,
        containerCandidates: containerMap.size,
        assetCount: assetMap.size,
        stylesheetPseudoColorCount: stylesheetPseudoColorCount(colorMap)
      }
    };

    if (options.pageSnapshotScope) {
      payload.pageSnapshot = collectPageSnapshot(root, options.pageSnapshotScope);
    }

    await resolveExternalSvgAssets(payload.assets);
    if (payload.pageSnapshot) await resolveSnapshotSvgAssets(payload.pageSnapshot);
    return payload;
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    if (isVisuallyHiddenElement(element, style, rect)) return false;
    return true;
  }

  function collectPageSnapshot(root, scopeValue) {
    const scope = String(scopeValue || "viewport").toLowerCase() === "full-page" ? "full-page" : "viewport";
    const maxNodes = scope === "full-page" ? MAX_SNAPSHOT_FULL_PAGE_NODES : MAX_SNAPSHOT_VIEWPORT_NODES;
    const documentSize = {
      width: Math.max(document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth || 0 : 0, window.innerWidth),
      height: Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0, window.innerHeight)
    };
    const warnings = [];
    const frameHeight = scope === "full-page" ? Math.min(documentSize.height, MAX_SNAPSHOT_FULL_PAGE_HEIGHT) : window.innerHeight;
    if (scope === "full-page" && documentSize.height > MAX_SNAPSHOT_FULL_PAGE_HEIGHT) {
      warnings.push(`Full page height capped at ${MAX_SNAPSHOT_FULL_PAGE_HEIGHT}px from ${documentSize.height}px.`);
    }

    const candidates = Array.from((root || document.body).querySelectorAll("*"))
      .filter((element) => isSnapshotCandidate(element, scope, frameHeight));
    if (candidates.length > maxNodes) {
      warnings.push(`Snapshot nodes limited to ${maxNodes} from ${candidates.length} candidates.`);
    }

    const selected = candidates.slice(0, maxNodes);
    const idMap = new Map();
    selected.forEach((element, index) => idMap.set(element, `snap-${index + 1}`));

    const nodes = selected.map((element) => snapshotNode(element, idMap, scope));
    return {
      version: "0.1.0",
      scope,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      documentSize,
      frame: {
        width: scope === "full-page" ? Math.min(documentSize.width, Math.max(window.innerWidth, document.documentElement.clientWidth || 0)) : window.innerWidth,
        height: frameHeight
      },
      scroll: {
        x: Math.round(window.scrollX || window.pageXOffset || 0),
        y: Math.round(window.scrollY || window.pageYOffset || 0)
      },
      nodes,
      warnings
    };
  }

  function isSnapshotCandidate(element, scope, frameHeight) {
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "meta", "link", "noscript", "template"].includes(tag)) return false;
    if (tag === "html" || tag === "body") return false;
    if (!isVisibleElement(element)) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(element);
    if (isVisuallyHiddenElement(element, style, rect)) return false;
    if (scope === "viewport" && !intersectsViewport(rect)) return false;
    if (scope === "full-page") {
      const top = rect.top + (window.scrollY || window.pageYOffset || 0);
      if (top > frameHeight || top + rect.height < 0) return false;
    }
    return isMeaningfulSnapshotElement(element, style, rect);
  }

  function isVisuallyHiddenElement(element, style, rect) {
    const className = String(element.className || "").toLowerCase();
    if (/(^|\s)(sr-only|visually-hidden|screen-reader|screenreader|a11y-hidden)(\s|$)/.test(className)) return true;
    const clip = String(style.clip || "");
    const clipPath = String(style.clipPath || style.webkitClipPath || "");
    const tiny = rect.width <= 2 && rect.height <= 2;
    if (tiny && (style.overflow === "hidden" || style.position === "absolute" || style.position === "fixed")) return true;
    if (/rect\(0(px)?[, ]+0(px)?[, ]+0(px)?[, ]+0(px)?\)/i.test(clip)) return true;
    if (/inset\(50%/.test(clipPath)) return true;
    if (Number(style.width.replace("px", "")) <= 1 && Number(style.height.replace("px", "")) <= 1 && style.overflow === "hidden") return true;
    return false;
  }

  function intersectsViewport(rect) {
    return rect.right >= 0 && rect.bottom >= 0 && rect.left <= window.innerWidth && rect.top <= window.innerHeight;
  }

  function isMeaningfulSnapshotElement(element, style, rect) {
    if (directText(element)) return true;
    if (inferCategory(element) || inferContainerType(element)) return true;
    const tag = element.tagName.toLowerCase();
    if (["img", "svg", "canvas", "video", "input", "textarea", "select", "button"].includes(tag)) return true;
    const bg = normalizeColor(style.backgroundColor);
    const borderWidth = px(style.borderTopWidth) + px(style.borderRightWidth) + px(style.borderBottomWidth) + px(style.borderLeftWidth);
    const hasShadow = style.boxShadow && style.boxShadow !== "none";
    const largeEnough = rect.width >= 16 && rect.height >= 16;
    const thinLine = (rect.width <= 3 && rect.height >= 8) || (rect.height <= 3 && rect.width >= 8);
    return (largeEnough || thinLine) && (Boolean(bg) || borderWidth > 0 || hasShadow);
  }

  function snapshotNode(element, idMap, scope) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const bounds = snapshotBounds(rect, scope);
    const textInfo = snapshotTextInfo(element);
    const category = inferCategory(element) || "";
    return {
      id: idMap.get(element),
      parentId: nearestSnapshotParentId(element, idMap),
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      text: textInfo.value.slice(0, 240),
      textSource: textInfo.source,
      alt: element.getAttribute("alt") || "",
      title: element.getAttribute("title") || "",
      className: element.className ? String(element.className).slice(0, 160) : "",
      bounds,
      styles: snapshotStyles(element, style),
      asset: snapshotAsset(element, style),
      iconAsset: snapshotIconAsset(element, style),
      pseudoElements: snapshotPseudoElements(element),
      componentHint: {
        category,
        signature: category ? snapshotSignature(element, category, bounds) : ""
      }
    };
  }

  function snapshotBounds(rect, scope) {
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    return {
      x: Math.round(scope === "full-page" ? rect.left + scrollX : rect.left),
      y: Math.round(scope === "full-page" ? rect.top + scrollY : rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function nearestSnapshotParentId(element, idMap) {
    let current = element.parentElement;
    while (current) {
      if (idMap.has(current)) return idMap.get(current);
      current = current.parentElement;
    }
    return "";
  }

  function snapshotText(element) {
    return snapshotTextInfo(element).value;
  }

  function snapshotTextInfo(element) {
    const direct = directText(element);
    if (direct) return { value: direct, source: "direct-text" };
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.value) return { value: element.value, source: "input-value" };
      if (element.placeholder) return { value: element.placeholder, source: "placeholder" };
    }
    const placeholder = element.getAttribute("placeholder") || "";
    if (placeholder) return { value: placeholder, source: "placeholder" };
    const aria = element.getAttribute("aria-label") || "";
    if (aria) return { value: aria, source: "aria-label" };
    const title = element.getAttribute("title") || "";
    if (title) return { value: title, source: "title" };
    return { value: "", source: "" };
  }

  function snapshotStyles(element, style) {
    return {
      display: style.display,
      position: style.position,
      backgroundColor: normalizeColor(style.backgroundColor),
      effectiveBackgroundColor: effectiveBackgroundColor(element, style),
      color: normalizeColor(style.color),
      fontFamily: cleanupFontFamily(style.fontFamily),
      fontSize: px(style.fontSize),
      fontWeight: style.fontWeight,
      lineHeight: px(style.lineHeight),
      letterSpacing: px(style.letterSpacing),
      textAlign: style.textAlign,
      whiteSpace: style.whiteSpace,
      fontStyle: style.fontStyle,
      textTransform: style.textTransform,
      borderRadius: style.borderRadius,
      borderColor: normalizeColor(style.borderTopColor),
      borderWidth: style.borderTopWidth,
      borders: {
        top: borderSide(style.borderTopWidth, style.borderTopColor, style.borderTopStyle),
        right: borderSide(style.borderRightWidth, style.borderRightColor, style.borderRightStyle),
        bottom: borderSide(style.borderBottomWidth, style.borderBottomColor, style.borderBottomStyle),
        left: borderSide(style.borderLeftWidth, style.borderLeftColor, style.borderLeftStyle)
      },
      boxShadow: style.boxShadow === "none" ? "" : style.boxShadow,
      opacity: Number(style.opacity || 1),
      zIndex: style.zIndex,
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollbar: snapshotScrollbar(element)
    };
  }

  function snapshotAsset(element, style) {
    if (element instanceof HTMLImageElement && element.currentSrc) {
      return { type: "image", src: element.currentSrc, alt: element.alt || "" };
    }
    if (element instanceof SVGElement && element.tagName.toLowerCase() === "svg") {
      const resolved = resolveSvgElement(element);
      return {
        type: "svg",
        src: colorizeSvgForSnapshot(resolved.src || "", style.color),
        alt: element.getAttribute("aria-label") || "",
        originalHref: resolved.originalHref || "",
        spriteId: resolved.spriteId || "",
        resolution: resolved.resolution || ""
      };
    }
    const maskUrl = firstCssUrl(style.webkitMaskImage || style.maskImage);
    if (maskUrl) return cssImageSnapshotAsset("mask-image", maskUrl, element.getAttribute("aria-label") || "", "mask-image", style.color);
    const cssUrl = firstCssUrl(style.backgroundImage);
    if (cssUrl) return cssImageSnapshotAsset("image", cssUrl, "", "background-image", style.color);
    return { type: "", src: "", alt: "" };
  }

  function snapshotIconAsset(element, style) {
    if (element instanceof SVGElement && element.tagName.toLowerCase() === "svg") return null;
    const svg = firstMeaningfulSvgDescendant(element);
    if (svg) {
      const resolved = resolveSvgElement(svg);
      return {
        type: "svg",
        src: colorizeSvgForSnapshot(resolved.src || "", getComputedStyle(svg).color || style.color),
        alt: svg.getAttribute("aria-label") || element.getAttribute("aria-label") || "",
        originalHref: resolved.originalHref || "",
        spriteId: resolved.spriteId || "",
        resolution: resolved.resolution || "descendant-svg"
      };
    }

    const maskUrl = firstCssUrl(style.webkitMaskImage || style.maskImage);
    if (maskUrl) return cssImageSnapshotAsset("mask-image", maskUrl, element.getAttribute("aria-label") || "", "icon:mask-image", style.color);
    const backgroundUrl = firstCssUrl(style.backgroundImage);
    if (backgroundUrl && looksLikeIconBox(element)) {
      return cssImageSnapshotAsset("image", backgroundUrl, element.getAttribute("aria-label") || "", "icon:background-image", style.color);
    }
    return null;
  }

  function firstMeaningfulSvgDescendant(element) {
    if (!element || !element.querySelector) return null;
    const svgs = Array.from(element.querySelectorAll("svg"));
    for (const svg of svgs.slice(0, 4)) {
      const rect = svg.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (rect.width > 96 || rect.height > 96) continue;
      const style = getComputedStyle(svg);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.05) continue;
      return svg;
    }
    return null;
  }

  function looksLikeIconBox(element) {
    const rect = element.getBoundingClientRect();
    const className = String(element.className || "").toLowerCase();
    const role = String(element.getAttribute("role") || "").toLowerCase();
    const tag = element.tagName.toLowerCase();
    const compact = rect.width <= 72 && rect.height <= 72;
    return compact || tag === "button" || role === "button" || /icon|avatar|logo|glyph|symbol/.test(className);
  }

  function cssImageSnapshotAsset(type, rawUrl, alt, cssProperty, color) {
    const src = absoluteUrl(rawUrl);
    const inlineSvg = inlineSvgFromCssUrl(rawUrl, color);
    return {
      type,
      src,
      inlineSvg,
      alt,
      cssProperty,
      color: normalizeColor(color)
    };
  }

  function inlineSvgFromCssUrl(rawUrl, color) {
    const value = String(rawUrl || "");
    if (!/^data:image\/svg\+xml/i.test(value)) return "";
    const commaIndex = value.indexOf(",");
    if (commaIndex < 0) return "";
    try {
      const meta = value.slice(0, commaIndex);
      const body = value.slice(commaIndex + 1);
      const decoded = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
      return colorizeSvgForSnapshot(decoded, color);
    } catch (error) {
      return "";
    }
  }

  function colorizeSvgForSnapshot(svg, color) {
    return colorizeSvgForAsset(svg, color);
  }

  function colorizeSvgForAsset(svg, color) {
    const source = String(svg || "");
    if (!source || source.indexOf("<svg") < 0) return source;
    const normalizedColor = normalizeColor(color) || "#111111";
    let result = source.replace(/currentColor/g, normalizedColor);
    if (result.indexOf("xmlns=") < 0) {
      result = result.replace("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"");
    }
    if (!/\scolor=/.test(result.slice(0, Math.min(result.length, 240)))) {
      result = result.replace("<svg", `<svg color="${escapeAttr(normalizedColor)}"`);
    }
    return result;
  }

  function snapshotPseudoElements(element) {
    return ["::before", "::after"]
      .map((name) => snapshotPseudoElement(element, name))
      .filter(Boolean);
  }

  function snapshotPseudoElement(element, pseudo) {
    let style;
    try {
      style = getComputedStyle(element, pseudo);
    } catch (error) {
      return null;
    }
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.05) return null;
    const content = cleanPseudoContent(style.content);
    const maskUrl = firstCssUrl(style.webkitMaskImage || style.maskImage);
    const backgroundUrl = firstCssUrl(style.backgroundImage);
    const hasPaint = normalizeColor(style.backgroundColor) || normalizeColor(style.color) || maskUrl || backgroundUrl || content;
    if (!hasPaint) return null;
    return {
      pseudo,
      content: content.slice(0, 80),
      styles: {
        color: normalizeColor(style.color),
        backgroundColor: normalizeColor(style.backgroundColor),
        width: px(style.width),
        height: px(style.height),
        marginLeft: px(style.marginLeft),
        marginRight: px(style.marginRight),
        opacity: Number(style.opacity || 1)
      },
      asset: maskUrl
        ? cssImageSnapshotAsset("mask-image", maskUrl, "", "pseudo:mask-image", style.color)
        : backgroundUrl
          ? cssImageSnapshotAsset("image", backgroundUrl, "", "pseudo:background-image", style.color)
          : { type: "", src: "", alt: "" }
    };
  }

  function cleanPseudoContent(value) {
    const raw = String(value || "");
    if (!raw || raw === "none" || raw === "normal") return "";
    return raw.replace(/^['"]|['"]$/g, "").replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch (error) {
        return "";
      }
    }).trim();
  }

  function borderSide(width, color, style) {
    return {
      width: px(width),
      color: normalizeColor(color),
      style: style || ""
    };
  }

  function snapshotScrollbar(element) {
    const vertical = element.scrollHeight > element.clientHeight + 2;
    const horizontal = element.scrollWidth > element.clientWidth + 2;
    if (!vertical && !horizontal) return null;
    return {
      vertical,
      horizontal,
      scrollHeight: element.scrollHeight || 0,
      scrollWidth: element.scrollWidth || 0,
      clientHeight: element.clientHeight || 0,
      clientWidth: element.clientWidth || 0,
      scrollTop: element.scrollTop || 0,
      scrollLeft: element.scrollLeft || 0
    };
  }

  function snapshotSignature(element, category, bounds) {
    return [
      category,
      element.tagName.toLowerCase(),
      element.getAttribute("role") || "",
      stableClasses(element),
      Math.round((bounds.width || 0) / 4) * 4,
      Math.round((bounds.height || 0) / 4) * 4
    ].join("|");
  }

  function collectColors(style, map) {
    for (const prop of COLOR_PROPS) {
      const value = normalizeColor(style[prop]);
      if (!value) continue;
      addUsage(map, value, prop);
    }
  }

  function collectStylesheetPseudoColors(map) {
    const states = [
      { state: "hover", pattern: ":hover" },
      { state: "focus", pattern: ":focus" },
      { state: "active", pattern: ":active" },
      { state: "disabled", pattern: ":disabled" },
      { state: "selected", pattern: "[aria-selected=\"true\"]" }
    ];
    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        continue;
      }
      collectPseudoColorsFromRules(rules, states, map);
    }
  }

  function collectPseudoColorsFromRules(rules, states, map) {
    for (const rule of Array.from(rules || [])) {
      if (rule.cssRules) {
        collectPseudoColorsFromRules(rule.cssRules, states, map);
        continue;
      }
      if (!rule.selectorText || !rule.style) continue;
      const selector = String(rule.selectorText).toLowerCase();
      for (const item of states) {
        if (selector.indexOf(item.pattern) < 0) continue;
        for (const prop of COLOR_PROPS) {
          const cssName = cssPropertyName(prop);
          const value = normalizeColor(rule.style.getPropertyValue(cssName));
          if (!value) continue;
          addUsage(map, value, `stylesheet:pseudo:${item.state}:${prop}`);
        }
      }
    }
  }

  function cssPropertyName(prop) {
    return prop.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
  }

  function stylesheetPseudoColorCount(map) {
    let count = 0;
    for (const token of map.values()) {
      const usage = token.usage || new Set();
      for (const item of usage) {
        if (String(item).indexOf("stylesheet:pseudo:") === 0) count += 1;
      }
    }
    return count;
  }

  function collectTypography(element, style, map) {
    if (!hasText(element)) return;
    const fontSize = px(style.fontSize);
    const lineHeight = px(style.lineHeight) || Math.round(fontSize * 1.2);
    const letterSpacing = px(style.letterSpacing) || 0;
    const fontFamily = cleanupFontFamily(style.fontFamily);
    const key = [
      fontFamily,
      fontSize,
      style.fontWeight,
      lineHeight,
      letterSpacing
    ].join("|");
    addCount(map, key, {
      fontFamily,
      fontSize,
      fontWeight: style.fontWeight,
      lineHeight,
      letterSpacing
    });
  }

  function collectRadii(style, map) {
    const values = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius
    ].map(px).filter((value) => value > 0);
    for (const value of values) addCount(map, String(value), value);
  }

  function collectShadows(style, map) {
    if (style.boxShadow && style.boxShadow !== "none") {
      addCount(map, style.boxShadow, style.boxShadow);
    }
  }

  function collectSpacing(style, map) {
    for (const prop of SPACING_PROPS) {
      const value = px(style[prop]);
      if (value > 0 && value <= 240) addCount(map, String(value), value);
    }
  }

  function collectCssImageAsset(style, map) {
    const candidates = [
      { prop: "maskImage", value: style.maskImage },
      { prop: "webkitMaskImage", value: style.webkitMaskImage },
      { prop: "backgroundImage", value: style.backgroundImage }
    ];

    for (const candidate of candidates) {
      addCssImageAsset(map, candidate.value, candidate.prop, style.color, 1);
    }
  }

  function collectAsset(element, style, map) {
    if (element instanceof HTMLImageElement && element.currentSrc) {
      addAsset(map, "image", element.currentSrc, element.alt || "", {
        resolution: "image-src"
      });
      return;
    }

    if (element instanceof SVGElement && element.tagName.toLowerCase() === "svg") {
      const label = element.getAttribute("aria-label") || element.getAttribute("role") || "";
      const resolved = resolveSvgElement(element);
      addAsset(map, "svg", resolved.src, label, resolved);
      return;
    }

    collectCssImageAsset(style, map);
  }

  function addCssImageAsset(map, value, cssProperty, color, increment) {
    const url = firstCssUrl(value);
    if (!url) return null;
    const decodedSvg = svgFromDataUrl(url);
    if (decodedSvg) {
      return addAsset(map, "svg", colorizeSvgForAsset(decodedSvg, color), cssProperty, {
        originalHref: url,
        resolution: "css-data-svg",
        cssProperty,
        color: normalizeColor(color)
      }, increment);
    }
    const absolute = absoluteUrl(url);
    if (!absolute) return null;
    const isSvg = isSvgLikeUrl(absolute);
    return addAsset(map, isSvg ? "svg" : "image", absolute, cssProperty, {
      originalHref: absolute,
      resolution: isSvg ? "css-svg-url" : "css-image-url",
      cssProperty,
      color: normalizeColor(color),
      spriteId: spriteIdFromHref(absolute)
    }, increment);
  }

  function resolveSvgElement(element) {
    const use = element.querySelector("use");
    if (!use) {
      return {
        src: element.outerHTML,
        resolution: "inline-svg"
      };
    }

    const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
    const spriteId = spriteIdFromHref(href);
    if (href.charAt(0) === "#" && spriteId) {
      const symbol = document.getElementById(spriteId);
      if (symbol) {
        return {
          src: svgFromSymbol(element, symbol),
          originalHref: href,
          spriteId,
          resolution: "resolved-inline-symbol"
        };
      }
    }

    return {
      src: element.outerHTML,
      originalHref: href,
      spriteId,
      resolution: href && href.charAt(0) !== "#" ? "external-sprite-reference" : "unresolved-inline-symbol"
    };
  }

  async function resolveExternalSvgAssets(assets) {
    const cache = new Map();
    for (const asset of assets) {
      if (asset.type !== "svg") continue;
      if (asset.resolution !== "external-sprite-reference" && asset.resolution !== "css-svg-url") continue;
      const href = asset.originalHref || asset.src || "";
      const spriteId = asset.spriteId || spriteIdFromHref(href);
      const spriteUrl = spriteFileUrl(href);
      if (!spriteId || !spriteUrl || !sameOrigin(spriteUrl)) {
        asset.resolution = asset.resolution === "css-svg-url" ? "css-svg-url-unresolved" : "external-sprite-unresolved";
        continue;
      }

      try {
        let text = cache.get(spriteUrl);
        if (!text) {
          const response = await fetch(spriteUrl, { credentials: "same-origin" });
          if (!response.ok) throw new Error("Failed to fetch sprite");
          text = await response.text();
          cache.set(spriteUrl, text);
        }
        const svg = svgFromExternalSprite(text, spriteId);
        if (svg) {
          asset.src = colorizeSvgForAsset(svg, asset.color || "");
          asset.signature = assetSignature(asset.type, asset.src, asset);
          asset.assetKind = assetKind(asset.type, asset.src, asset);
          asset.spriteId = spriteId;
          asset.originalHref = href;
          asset.resolution = "resolved-external-sprite";
        } else {
          asset.resolution = "external-sprite-symbol-missing";
        }
      } catch (error) {
        asset.resolution = "external-sprite-fetch-failed";
      }
    }
  }

  async function resolveSnapshotSvgAssets(snapshot) {
    const cache = new Map();
    const assets = [];
    for (const node of snapshot.nodes || []) {
      if (node.asset) assets.push(node.asset);
      if (node.iconAsset) assets.push(node.iconAsset);
      for (const pseudo of node.pseudoElements || []) {
        if (pseudo.asset) assets.push(pseudo.asset);
      }
    }

    for (const asset of assets) {
      if (!asset || asset.inlineSvg || !asset.src) continue;
      if (!isSvgLikeUrl(asset.src) || !sameOrigin(asset.src)) continue;
      try {
        let svg = cache.get(asset.src);
        if (!svg) {
          const response = await fetch(asset.src, { credentials: "same-origin" });
          if (!response.ok) throw new Error("Failed to fetch svg");
          svg = await response.text();
          cache.set(asset.src, svg);
        }
        if (svg && svg.indexOf("<svg") >= 0) {
          asset.inlineSvg = colorizeSvgForSnapshot(svg, asset.color || "#111111");
          asset.resolution = "resolved-snapshot-svg-url";
        }
      } catch (error) {
        asset.resolution = "snapshot-svg-fetch-failed";
      }
    }
  }

  function isSvgLikeUrl(value) {
    const input = String(value || "").split("?")[0].toLowerCase();
    return input.endsWith(".svg") || input.indexOf("image/svg+xml") >= 0;
  }

  function svgFromDataUrl(value) {
    const input = String(value || "");
    if (!/^data:image\/svg\+xml/i.test(input)) return "";
    const commaIndex = input.indexOf(",");
    if (commaIndex < 0) return "";
    try {
      const meta = input.slice(0, commaIndex);
      const body = input.slice(commaIndex + 1);
      const decoded = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
      return decoded && decoded.indexOf("<svg") >= 0 ? decoded : "";
    } catch (error) {
      return "";
    }
  }

  function svgFromSymbol(sourceSvg, symbol) {
    const viewBox = sourceSvg.getAttribute("viewBox") || symbol.getAttribute("viewBox") || "0 0 24 24";
    const width = sourceSvg.getAttribute("width") || "24";
    const height = sourceSvg.getAttribute("height") || "24";
    const attrs = svgPresentationAttributes(sourceSvg);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(viewBox)}" width="${escapeAttr(width)}" height="${escapeAttr(height)}"${attrs}>${symbol.innerHTML}</svg>`;
  }

  function svgFromExternalSprite(spriteText, spriteId) {
    const document = new DOMParser().parseFromString(spriteText, "image/svg+xml");
    const symbol = document.getElementById(spriteId);
    if (!symbol) return "";
    const viewBox = symbol.getAttribute("viewBox") || "0 0 24 24";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(viewBox)}" width="24" height="24">${symbol.innerHTML}</svg>`;
  }

  function svgPresentationAttributes(svg) {
    const names = ["fill", "stroke", "color", "class"];
    let result = "";
    for (const name of names) {
      const value = svg.getAttribute(name);
      if (value) result += ` ${name}="${escapeAttr(value)}"`;
    }
    return result;
  }

  function firstCssUrl(value) {
    const match = String(value || "").match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : "";
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch (error) {
      return "";
    }
  }

  function spriteFileUrl(value) {
    const absolute = absoluteUrl(value);
    return absolute ? absolute.split("#")[0] : "";
  }

  function sameOrigin(value) {
    try {
      return new URL(value).origin === location.origin;
    } catch (error) {
      return false;
    }
  }

  function spriteIdFromHref(value) {
    const match = String(value || "").match(/#([a-z0-9_-]+)/i);
    return match ? match[1] : "";
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeCaptureStateLabel(value) {
    const label = String(value || "default").trim().toLowerCase().replace(/\s+/g, "-");
    return label || "default";
  }

  function collectComponent(element, style, map, captureStateLabel, assetMap) {
    const category = inferCategory(element);
    if (!category) return;

    const rect = element.getBoundingClientRect();
    const text = directText(element).slice(0, 80);
    const iconCount = element.querySelectorAll("svg,img,[class*='icon'],[data-icon]").length;
    const assetRefs = componentAssetRefs(element, style, assetMap);
    const role = String(element.getAttribute("role") || "").toLowerCase();
    const classes = stableClasses(element);
    const namingHints = componentNamingHints(element, text);
    const stateInfo = inferState(element);
    const signature = [
      category,
      element.tagName.toLowerCase(),
      role,
      namingHintSignature(namingHints),
      classes,
      Math.round(rect.width / 4) * 4,
      Math.round(rect.height / 4) * 4,
      iconCount,
      hasText(element) ? "text" : "no-text",
      captureStateLabel || "default"
    ].join("|");

    const existing = map.get(signature) || {
      id: "component-" + (map.size + 1),
      name: inferName(element, category, text, namingHints),
      category,
      signature,
      count: 0,
      states: new Set(),
      assetRefs: [],
      examples: []
    };

    existing.count += 1;
    existing.states.add(stateInfo.name);
    existing.assetRefs = uniqueAssetRefs((existing.assetRefs || []).concat(assetRefs));
    if (existing.examples.length < MAX_EXAMPLES_PER_COMPONENT) {
      const bg = effectiveBackgroundColor(element, style);
      existing.examples.push({
        tag: element.tagName.toLowerCase(),
        role,
        text,
        namingHints,
        className: element.className ? String(element.className).slice(0, 160) : "",
        ancestry: elementAncestry(element),
        parent: parentTrace(element),
        nearestLandmark: nearestLandmarkTrace(element),
        bounds: rectTrace(rect),
        siblingIndex: siblingIndex(element),
        siblingCount: siblingCount(element),
        domDepth: domDepth(element),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        attributes: componentAttributes(element),
        captureStateLabel,
        state: stateInfo.name,
        stateSource: stateInfo.source,
        assetRefs,
        visibility: {
          visible: true,
          opacity: Number(style.opacity),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          clipped: isClipped(element)
        },
        styles: {
          color: normalizeColor(style.color),
          backgroundColor: normalizeColor(style.backgroundColor),
          effectiveBackgroundColor: bg,
          contrastRatio: contrastRatio(normalizeColor(style.color), bg),
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow === "none" ? "" : style.boxShadow,
          fontFamily: cleanupFontFamily(style.fontFamily),
          fontSize: px(style.fontSize),
          fontWeight: style.fontWeight,
          lineHeight: px(style.lineHeight)
        }
      });
    }
    map.set(signature, existing);
  }

  function componentAssetRefs(element, style, assetMap) {
    const refs = [];
    const seen = new Set();
    function push(ref) {
      if (!ref || !ref.signature || seen.has(ref.signature)) return;
      seen.add(ref.signature);
      refs.push(ref);
    }

    const candidates = [element].concat(Array.from(element.querySelectorAll("svg,img,[class*='icon'],[data-icon]")).slice(0, 24));
    for (const candidate of candidates) {
      if (candidate instanceof HTMLImageElement && candidate.currentSrc) {
        push(addAsset(assetMap, "image", candidate.currentSrc, candidate.alt || "", { resolution: "image-src" }, 0));
      }
      if (candidate instanceof SVGElement && candidate.tagName.toLowerCase() === "svg") {
        const resolved = resolveSvgElement(candidate);
        push(addAsset(assetMap, "svg", resolved.src, candidate.getAttribute("aria-label") || "", resolved, 0));
      }
      let candidateStyle = null;
      try {
        candidateStyle = candidate === element ? style : getComputedStyle(candidate);
      } catch (error) {
        candidateStyle = null;
      }
      if (candidateStyle) {
        push(addCssImageAsset(assetMap, candidateStyle.maskImage, "maskImage", candidateStyle.color, 0));
        push(addCssImageAsset(assetMap, candidateStyle.webkitMaskImage, "webkitMaskImage", candidateStyle.color, 0));
        if (looksLikeIconBox(candidate)) {
          push(addCssImageAsset(assetMap, candidateStyle.backgroundImage, "backgroundImage", candidateStyle.color, 0));
        }
      }
      if (refs.length >= 8) break;
    }
    return refs;
  }

  function uniqueAssetRefs(refs) {
    const seen = new Set();
    const result = [];
    for (const ref of refs || []) {
      if (!ref || !ref.signature || seen.has(ref.signature)) continue;
      seen.add(ref.signature);
      result.push(ref);
    }
    return result;
  }

  function inferCategory(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") || "";
    const type = String(element.getAttribute("type") || "").toLowerCase();
    const className = String(element.className || "").toLowerCase();
    const aria = String(element.getAttribute("aria-label") || "").toLowerCase();
    const haystack = `${tag} ${role} ${type} ${className} ${aria}`;

    const switchLike = role === "switch" || /\b(toggle|switch)\b/.test(className) || /\b(toggle|switch)\b/.test(aria);
    if (switchLike) return "switch";
    if ((tag === "input" && type === "checkbox") || role === "checkbox" || className.includes("checkbox")) return "checkbox";
    if ((tag === "input" && type === "radio") || role === "radio" || className.includes("radio")) return "radio";
    if (tag === "button" || role === "button" || type === "button" || type === "submit") return "button";
    if ((tag === "input" && !["hidden", "checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type)) || tag === "textarea" || role === "textbox" || role === "searchbox") return "text-input";
    if (tag === "select" || role === "combobox" || role === "listbox") return "select";
    if (tag === "a" && element.getAttribute("href")) return "link";
    if (role === "tab" || className.includes("tab")) return "tab";
    if (role === "option" || role === "treeitem") return "menu-item";
    if (role === "menuitem" || className.includes("menu-item")) return "menu-item";
    if (haystack.includes("breadcrumb")) return "breadcrumb";
    if (className.includes("nav") || tag === "nav") return "navigation";
    if (/\b(badge|chip|tag|pill|token)\b/.test(className) || role === "status") return "tag";
    if (tag === "label" || /\b(form-field|field|input-group|control-group|form-control)\b/.test(className)) return "form-field";
    if (className.includes("card") || className.includes("panel")) return "card";
    return null;
  }

  function collectContainerCandidate(element, style, map, captureStateLabel) {
    const type = inferContainerType(element);
    if (!type) return;

    const rect = element.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 24) return;

    const role = element.getAttribute("role") || "";
    const className = element.className ? String(element.className).slice(0, 180) : "";
    const key = [
      type,
      element.tagName.toLowerCase(),
      role,
      stableClasses(element),
      Math.round(rect.width / 16) * 16,
      Math.round(rect.height / 16) * 16
    ].join("|");

    const existing = map.get(key) || {
      id: "container-" + (map.size + 1),
      type,
      name: containerName(type, element),
      tag: element.tagName.toLowerCase(),
      role,
      className,
      count: 0,
      examples: []
    };

    existing.count += 1;
    if (existing.examples.length < 4) {
      existing.examples.push({
        tag: element.tagName.toLowerCase(),
        role,
        className,
        text: directText(element).slice(0, 80),
        bounds: rectTrace(rect),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        captureStateLabel,
        ancestry: elementAncestry(element),
        parent: parentTrace(element),
        nearestLandmark: nearestLandmarkTrace(element),
        siblingIndex: siblingIndex(element),
        siblingCount: siblingCount(element),
        domDepth: domDepth(element),
        childSummary: childSummary(element),
        styles: {
          backgroundColor: normalizeColor(style.backgroundColor),
          effectiveBackgroundColor: effectiveBackgroundColor(element, style),
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow === "none" ? "" : style.boxShadow,
          display: style.display,
          position: style.position
        }
      });
    }
    map.set(key, existing);
  }

  function inferContainerType(element) {
    const tag = element.tagName.toLowerCase();
    const role = String(element.getAttribute("role") || "").toLowerCase();
    const className = String(element.className || "").toLowerCase();
    const id = String(element.id || "").toLowerCase();
    const aria = String(element.getAttribute("aria-label") || "").toLowerCase();
    const haystack = tag + " " + role + " " + className + " " + id + " " + aria;

    if (tag === "dialog" || role === "dialog" || role === "alertdialog" || haystack.includes("modal") || haystack.includes("popover")) return "dialog-popover";
    if (tag === "aside" || haystack.includes("sidebar") || haystack.includes("side-bar") || haystack.includes("sidenav")) return "sidebar";
    if (tag === "header" || role === "banner" || haystack.includes("topbar") || haystack.includes("top-bar") || haystack.includes("navbar")) return "top-bar";
    if (tag === "form" || role === "form") {
      if (haystack.includes("composer") || haystack.includes("prompt") || haystack.includes("inputbar") || haystack.includes("chat")) return "composer-form";
      return "form-section";
    }
    if (haystack.includes("composer") || haystack.includes("prompt") || haystack.includes("inputbar")) return "composer-form";
    if (role === "menu" || role === "listbox" || haystack.includes("menu") || haystack.includes("dropdown")) return "menu-list";
    if (haystack.includes("breadcrumb")) return "breadcrumb";
    if (tag === "table" || role === "table" || role === "grid" || haystack.includes("table")) return "table";
    if (tag === "ul" || tag === "ol" || role === "list" || haystack.includes("list")) return "list-group";
    if (haystack.includes("card-grid") || haystack.includes("cards") || haystack.includes("grid")) return "card-grid";
    if (tag === "nav" || role === "navigation") return "nav-group";
    return "";
  }

  function containerName(type, element) {
    const label = element.getAttribute("aria-label") || element.getAttribute("data-testid") || element.id || "";
    if (label) return titleCase(label.replace(/[-_]+/g, " ")).slice(0, 64);
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

  function inferState(element) {
    const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
    if (disabled) return { name: "disabled", source: "observed:disabled-attribute" };
    if (element.getAttribute("aria-pressed") === "true") return { name: "active", source: "observed:aria-pressed" };
    if (element.getAttribute("aria-expanded") === "true") return { name: "open", source: "observed:aria-expanded" };
    if (element.getAttribute("aria-checked") === "true") return { name: "selected", source: "observed:aria-checked" };
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio") && element.checked) return { name: "selected", source: "observed:checked-property" };
    if (element.getAttribute("aria-selected") === "true" || element.getAttribute("aria-current")) return { name: "active", source: "observed:aria" };
    const className = String(element.className || "").toLowerCase();
    if (className.includes("active") || className.includes("selected") || className.includes("current")) return { name: "active", source: "inferred:class" };
    if (className.includes("focus")) return { name: "focus", source: "inferred:class" };
    if (className.includes("hover")) return { name: "hover", source: "inferred:class" };
    return { name: "default", source: "observed:default-dom" };
  }

  function componentAttributes(element) {
    const attrs = {
      type: element.getAttribute("type") || "",
      placeholder: element.getAttribute("placeholder") || "",
      checked: element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio") ? Boolean(element.checked) : undefined,
      ariaChecked: element.getAttribute("aria-checked") || "",
      ariaPressed: element.getAttribute("aria-pressed") || "",
      ariaExpanded: element.getAttribute("aria-expanded") || "",
      ariaCurrent: element.getAttribute("aria-current") || "",
      ariaSelected: element.getAttribute("aria-selected") || ""
    };
    Object.keys(attrs).forEach((key) => {
      if (attrs[key] === "" || attrs[key] === undefined) delete attrs[key];
    });
    return attrs;
  }

  function elementAncestry(element) {
    const result = [];
    let current = element.parentElement;
    while (current && current !== document.documentElement && result.length < 6) {
      result.push(nodeTrace(current));
      current = current.parentElement;
    }
    return result;
  }

  function parentTrace(element) {
    return element.parentElement ? nodeTrace(element.parentElement) : null;
  }

  function nearestLandmarkTrace(element) {
    let current = element;
    while (current && current !== document.documentElement) {
      const trace = nodeTrace(current);
      if (isLandmarkTrace(trace)) return trace;
      current = current.parentElement;
    }
    return null;
  }

  function nodeTrace(element) {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      className: element.className ? String(element.className).slice(0, 160) : "",
      id: element.id || "",
      bounds: rectTrace(rect)
    };
  }

  function isLandmarkTrace(trace) {
    const tag = trace.tag;
    const role = String(trace.role || "").toLowerCase();
    const className = String(trace.className || "").toLowerCase();
    if (["header", "nav", "main", "aside", "form", "dialog", "section"].includes(tag)) return true;
    if (["banner", "navigation", "main", "complementary", "form", "dialog", "alertdialog", "menu", "listbox", "table", "grid", "list"].includes(role)) return true;
    return className.includes("sidebar") || className.includes("composer") || className.includes("popover") || className.includes("modal") || className.includes("breadcrumb") || className.includes("card") || className.includes("form");
  }

  function rectTrace(rect) {
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function siblingIndex(element) {
    if (!element.parentElement) return 0;
    return Array.from(element.parentElement.children).indexOf(element);
  }

  function siblingCount(element) {
    return element.parentElement ? element.parentElement.children.length : 0;
  }

  function domDepth(element) {
    let depth = 0;
    let current = element;
    while (current && current !== document.documentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function childSummary(element) {
    const summary = {};
    const children = Array.from(element.children).slice(0, 80);
    for (const child of children) {
      const type = inferCategory(child) || inferContainerType(child) || child.tagName.toLowerCase();
      summary[type] = (summary[type] || 0) + 1;
    }
    return summary;
  }

  function effectiveBackgroundColor(element, style) {
    let current = element;
    let currentStyle = style;
    while (current) {
      const color = normalizeColor(currentStyle.backgroundColor);
      if (color) return color;
      current = current.parentElement;
      if (current) currentStyle = getComputedStyle(current);
    }
    return "#ffffff";
  }

  function isClipped(element) {
    const parent = element.parentElement;
    if (!parent) return false;
    const style = getComputedStyle(parent);
    if (!["hidden", "clip", "scroll", "auto"].includes(style.overflow) && !["hidden", "clip", "scroll", "auto"].includes(style.overflowX) && !["hidden", "clip", "scroll", "auto"].includes(style.overflowY)) return false;
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return rect.left < parentRect.left || rect.top < parentRect.top || rect.right > parentRect.right || rect.bottom > parentRect.bottom;
  }

  function contrastRatio(fg, bg) {
    const fgRgb = rgbFromHex(fg);
    const bgRgb = rgbFromHex(bg);
    if (!fgRgb || !bgRgb) return 0;
    const l1 = relativeLuminance(fgRgb);
    const l2 = relativeLuminance(bgRgb);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
  }

  function rgbFromHex(value) {
    if (!value || value[0] !== "#") return null;
    const hex = value.slice(1, 7);
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255
    };
  }

  function relativeLuminance(rgb) {
    const values = [rgb.r, rgb.g, rgb.b].map((value) => {
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  }

  function inferName(element, category, text, hints) {
    const dataHints = hints && hints.data ? hints.data : [];
    const iconHints = hints && hints.icons ? hints.icons : [];
    const label = (hints && (hints.ariaLabel || hints.title || hints.text || hints.nearbyLabel)) ||
      dataHints[0] ||
      iconHints[0] ||
      element.id ||
      category;
    return titleCase(label.replace(/\s+/g, " ").trim()).slice(0, 64);
  }

  function componentNamingHints(element, text) {
    return {
      ariaLabel: cleanHint(element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || ""),
      title: cleanHint(element.getAttribute("title") || ""),
      text: cleanHint(text || ""),
      data: dataAttributeHints(element),
      nearbyLabel: nearbyLabelText(element),
      icons: iconHints(element),
      role: element.getAttribute("role") || "",
      landmark: landmarkNamingHint(element)
    };
  }

  function namingHintSignature(hints) {
    if (!hints) return "";
    return [
      hints.ariaLabel || "",
      hints.title || "",
      hints.text || "",
      (hints.data || []).slice(0, 2).join("."),
      hints.nearbyLabel || "",
      (hints.icons || []).slice(0, 2).join("."),
      hints.role || "",
      hints.landmark || ""
    ].join("~").slice(0, 180);
  }

  function cleanHint(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function dataAttributeHints(element) {
    const result = [];
    for (const attr of Array.from(element.attributes || [])) {
      const name = attr.name || "";
      if (name === "data-testid" || name === "data-test" || name === "data-qa" || name === "data-cy" || name === "data-icon" || name === "data-state" || name === "data-value" || name === "data-name") {
        const value = cleanHint(attr.value || "");
        if (value) result.push(value);
      }
    }
    return uniqueStrings(result).slice(0, 6);
  }

  function nearbyLabelText(element) {
    const ariaLabelledBy = element.getAttribute("aria-labelledby") || "";
    if (ariaLabelledBy) {
      const parts = ariaLabelledBy.split(/\s+/);
      const labels = [];
      for (const id of parts) {
        const labelElement = document.getElementById(id);
        if (labelElement) labels.push(cleanHint(labelElement.textContent || ""));
      }
      const joined = cleanHint(labels.join(" "));
      if (joined) return joined;
    }

    const id = element.getAttribute("id");
    if (id) {
      const explicit = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (explicit) {
        const explicitText = cleanHint(explicit.textContent || "");
        if (explicitText) return explicitText;
      }
    }

    let previous = element.previousElementSibling;
    let steps = 0;
    while (previous && steps < 3) {
      if (previous.tagName && previous.tagName.toLowerCase() === "label") {
        const value = cleanHint(previous.textContent || "");
        if (value) return value;
      }
      previous = previous.previousElementSibling;
      steps += 1;
    }
    return "";
  }

  function iconHints(element) {
    const result = [];
    const icons = element.querySelectorAll("svg,use,img,[data-icon],[class*='icon']");
    for (const icon of Array.from(icons).slice(0, 6)) {
      const dataIcon = icon.getAttribute && icon.getAttribute("data-icon");
      const aria = icon.getAttribute && icon.getAttribute("aria-label");
      const alt = icon.getAttribute && icon.getAttribute("alt");
      const href = icon.getAttribute && (icon.getAttribute("href") || icon.getAttribute("xlink:href"));
      const spriteId = spriteIdFromHref(href || "");
      const value = cleanHint(dataIcon || aria || alt || spriteId || "");
      if (value) result.push(value);
    }
    return uniqueStrings(result).slice(0, 6);
  }

  function landmarkNamingHint(element) {
    const landmark = nearestLandmarkTrace(element);
    if (!landmark) return "";
    return cleanHint([landmark.tag, landmark.role, landmark.className].filter(Boolean).join(" "));
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  function uniqueStrings(items) {
    return Array.from(new Set((items || []).filter(Boolean)));
  }

  function stableClasses(element) {
    return String(element.className || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((item) => !/^[a-z0-9_-]*[0-9]{3,}[a-z0-9_-]*$/i.test(item))
      .slice(0, 8)
      .join(".");
  }

  function hasText(element) {
    return directText(element).length > 0;
  }

  function directText(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addUsage(map, key, usage) {
    const entry = map.get(key) || { value: key, count: 0, usage: new Set() };
    entry.count += 1;
    entry.usage.add(usage);
    map.set(key, entry);
  }

  function addCount(map, key, value) {
    const entry = map.get(key) || { value, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }

  function addAsset(map, type, src, alt, meta, increment = 1) {
    const signature = (meta && meta.signature) || assetSignature(type, src, meta);
    const key = type + "|" + signature;
    const entry = map.get(key) || Object.assign({
      type,
      src,
      alt,
      count: 0,
      signature,
      assetKind: assetKind(type, src, meta)
    }, meta || {});
    if (!entry.src && src) entry.src = src;
    if (!entry.alt && alt) entry.alt = alt;
    entry.signature = entry.signature || signature;
    entry.assetKind = entry.assetKind || assetKind(type, entry.src, entry);
    entry.count += Math.max(0, Number(increment) || 0);
    map.set(key, entry);
    return assetRef(entry);
  }

  function assetRef(asset) {
    return {
      signature: asset.signature || assetSignature(asset.type, asset.src, asset),
      type: asset.type || "unknown",
      spriteId: asset.spriteId || "",
      resolution: asset.resolution || "",
      cssProperty: asset.cssProperty || "",
      alt: asset.alt || ""
    };
  }

  function assetSignature(type, src, meta) {
    const value = String(src || "");
    if (String(type || "") === "svg" || value.indexOf("<svg") >= 0) {
      return "svg:" + hashString(normalizeSvgForSignature(value));
    }
    if (/^data:/i.test(value)) return `${type || "asset"}:${hashString(value)}`;
    const href = String((meta && (meta.originalHref || meta.href)) || value || "");
    return `${type || "asset"}:${hashString(href.replace(/[?&](t|cache|timestamp)=[^&#]*/gi, ""))}`;
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

  function assetKind(type, src, meta) {
    const resolution = String((meta && meta.resolution) || "").toLowerCase();
    const source = String(src || "");
    if (type === "svg") {
      if (hasMultipleSvgColors(source)) return "multicolor-svg";
      if (resolution.includes("inline") || resolution.includes("data-svg") || /__lottie_element|lottie/i.test(source)) return "inline-svg";
      return "monochrome-svg";
    }
    return type === "image" ? "image" : "asset";
  }

  function hasMultipleSvgColors(svg) {
    const colors = new Set();
    const source = String(svg || "");
    source.replace(/\b(?:fill|stroke|stop-color|color)=["']([^"']+)["']/gi, (match, value) => {
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized || /^(none|currentcolor|inherit|transparent)$/i.test(normalized)) return "";
      colors.add(normalized);
      return "";
    });
    return colors.size > 1;
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

  function toSortedTokens(map, limit) {
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  function nameColors(tokens) {
    return tokens.map((token, index) => ({
      name: "color/" + guessColorName(token.value, index, token.usage || []),
      value: token.value,
      count: token.count,
      usage: Array.from(token.usage || [])
    }));
  }

  function nameTypography(tokens) {
    return tokens.map((token, index) => ({
      name: "type/" + (index + 1),
      ...token.value,
      count: token.count
    }));
  }

  function nameNumberTokens(tokens, prefix) {
    return tokens.map((token) => ({
      name: prefix + "/" + token.value,
      value: token.value,
      count: token.count
    }));
  }

  function nameStringTokens(tokens, prefix) {
    return tokens.map((token, index) => ({
      name: prefix + "/" + (index + 1),
      value: token.value,
      count: token.count
    }));
  }

  function toComponents(map) {
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_COMPONENTS)
      .map((component) => ({
        ...component,
        states: Array.from(component.states).sort()
      }));
  }

  function toContainers(map) {
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);
  }

  function toAssets(map) {
    return Array.from(map.values())
      .sort((a, b) => assetSortScore(a) - assetSortScore(b) || b.count - a.count)
      .slice(0, MAX_ASSETS);
  }

  function assetSortScore(asset) {
    const kind = asset.assetKind || assetKind(asset.type, asset.src, asset);
    if (kind === "multicolor-svg") return 10;
    if (kind === "inline-svg") return 20;
    if (kind === "monochrome-svg") return 30;
    if (kind === "image") return 80;
    return 90;
  }

  function normalizeColor(value) {
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return "";
    const rgba = value.match(/rgba?\(([^)]+)\)/);
    if (!rgba) return value;
    const parts = rgba[1].split(",").map((part) => part.trim());
    const r = clampColor(parts[0]);
    const g = clampColor(parts[1]);
    const b = clampColor(parts[2]);
    const a = parts[3] === undefined ? 1 : Number(parts[3]);
    if (a === 0) return "";
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    if (a >= 1) return hex;
    return hex + Math.round(a * 255).toString(16).padStart(2, "0");
  }

  function clampColor(value) {
    return Math.max(0, Math.min(255, Number.parseInt(value, 10) || 0));
  }

  function guessColorName(value, index, usage) {
    const hex = value.replace("#", "").slice(0, 6);
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const role = guessColorRole(hsl, usage);
    const scale = Math.round((100 - hsl.l) / 5) * 50;
    return `${role}/${Math.max(0, Math.min(1000, scale))}-${hex}`;
  }

  function guessColorRole(hsl, usage) {
    if (hsl.s < 8) {
      if (hsl.l > 96) return "white";
      if (hsl.l < 6) return "black";
      return "gray";
    }

    if (usage && usage.has && usage.has("color") && hsl.l < 35) return "fg";
    if (usage && usage.has && usage.has("backgroundColor") && hsl.l > 92) return "bg";

    if (hsl.h < 18 || hsl.h >= 345) return "red";
    if (hsl.h < 45) return "orange";
    if (hsl.h < 70) return "yellow";
    if (hsl.h < 165) return "green";
    if (hsl.h < 205) return "cyan";
    if (hsl.h < 255) return "blue";
    if (hsl.h < 295) return "purple";
    if (hsl.h < 345) return "pink";
    return "accent";
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
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
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function px(value) {
    if (!value || value === "normal" || value === "auto") return 0;
    const match = String(value).match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function cleanupFontFamily(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
  }

  function titleCase(value) {
    return value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  window.ReverseDesignSystemExtractor = {
    extractDesignSystem
  };
})();
