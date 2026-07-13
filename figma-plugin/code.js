figma.showUI(__html__, { width: 260, height: 188 });

let outputLanguage = "bilingual";
let outputMode = "designer";
let assetCreationSummary = null;
let regularFont = { family: "Inter", style: "Regular" };
let mediumFont = { family: "Inter", style: "Medium" };
let semiBoldFont = { family: "Inter", style: "Semi Bold" };
let boldFont = { family: "Inter", style: "Bold" };
let cjkRegularFont = null;
let cjkMediumFont = null;
let cjkSemiBoldFont = null;
const GENERATED_BY = "reverse-design-system";
const UI_THEME_KEY = "reverse-design-system-ui-theme";

figma.ui.onmessage = async (message) => {
  if (message.type === "ui-ready") {
    const theme = await figma.clientStorage.getAsync(UI_THEME_KEY);
    figma.ui.postMessage({ type: "preferences", theme: theme === "dark" ? "dark" : "light" });
    return;
  }

  if (message.type === "set-theme") {
    await figma.clientStorage.setAsync(UI_THEME_KEY, message.theme === "dark" ? "dark" : "light");
    return;
  }

  if (message.type === "resize-ui") {
    const height = Math.max(188, Math.min(520, Number(message.height) || 188));
    figma.ui.resize(260, height);
    return;
  }

  if (message.type === "cancel") {
    figma.closePlugin();
    return;
  }

  if (message.type !== "import") return;

  try {
    const importStartedAt = Date.now();
    const data = JSON.parse(message.json);
    outputLanguage = message.language || "bilingual";
    outputMode = message.mode || "designer";
    await importDesignSystem(data);
    await delay(Math.max(0, 2600 - (Date.now() - importStartedAt)));
    figma.ui.postMessage({ type: "import-complete" });
    await delay(2100);
    figma.closePlugin(copy("imported"));
  } catch (error) {
    figma.ui.postMessage({ type: "import-error", message: error.message || String(error) });
    figma.notify(error.message || String(error), { error: true });
  }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importDesignSystem(data) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  } catch (error) {
    // Some environments only expose the core Inter styles used by visible text.
  }
  await configureTextFonts();

  const source = data.source || {};
  const isNormalized = Boolean(data.normalizedVersion);
  if (!isNormalized) {
    throw new Error("Import requires normalized JSON. Export normalized JSON from the Chrome extension or run tools/normalize.mjs first.");
  }
  const tokens = isNormalized ? normalizedTokens(data.semanticTokens || {}) : data.tokens || {};
  const components = isNormalized ? draftComponentsFromModel(data.componentModel || []) : data.components || [];
  const page = figma.currentPage;
  const rootName = `${outputMode === "designer" ? "Reverse UI Kit Draft" : outputMode === "library" ? "Component Library Draft" : outputMode === "replica" ? "Page Screenshot Reference" : "Reverse Design System Draft"} - ${source.hostname || "Website"}${isNormalized ? " - Normalized" : ""}`;

  if (outputMode === "library") {
    assetCreationSummary = await createDesignAssets(data, tokens);
    await importComponentLibraryDraft(data, tokens, rootName);
    return;
  }

  if (outputMode === "replica") {
    await importPageReplicaDraft(data, rootName);
    return;
  }

  if (outputMode === "designer" && isNormalized) {
    assetCreationSummary = await createDesignAssets(data, tokens);
    await importNormalizedDesignerPages(data, tokens, components, rootName);
    return;
  }

  removeExistingGeneratedNodes(page, rootName);

  const root = figma.createFrame();
  root.name = rootName;
  markGeneratedNode(root);
  root.layoutMode = "VERTICAL";
  root.itemSpacing = 32;
  root.paddingTop = 48;
  root.paddingRight = 48;
  root.paddingBottom = 48;
  root.paddingLeft = 48;
  root.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  root.resize(1400, 1000);
  setVerticalAutoHeight(root);
  page.appendChild(root);

  assetCreationSummary = await createDesignAssets(data, tokens);
  createOverviewSection(root, data, isNormalized);
  createAssetCreationSummarySection(root);
  if (outputMode === "designer") {
    const designComponents = isNormalized ? data.componentModel || [] : components;
    createDesignerQuickStartSection(root, data, components);

    const primitives = createDesignerGroupSection(root, l("Primitives", "基础项", "基础项 / Primitives"), l("Foundations extracted from computed CSS. Values remain draft and traceable.", "从计算 CSS 中提取的基础项，仍属于可追踪草稿。", "从计算 CSS 中提取的基础项 / Foundations extracted from computed CSS."));
    createColorSystemSections(primitives, data, tokens, isNormalized);
    createTypographySection(primitives, tokens.typography || []);
    createTokenSection(primitives, copy("radii"), tokens.radii || [], "px");
    createSpacingPreviewSection(primitives, tokens.spacing || [], isNormalized);
    createShadowPreviewSection(primitives, tokens.shadows || [], isNormalized);

    const interactive = createDesignerGroupSection(root, l("Interactive Controls", "交互控件", "交互控件 / Interactive Controls"), l("Buttons, inputs, selects, tabs, and core control variants inferred from captured UI.", "从采集界面中推断出的按钮、输入框、选择器、标签页和核心控件变体。", "从采集界面中推断出的交互控件 / Interactive controls inferred from captured UI."));
    const interactiveModels = isNormalized ? reusableComponentModels(designComponents, ["button", "text-input", "select", "tab"]) : designComponents;
    createActionControlsSection(interactive, interactiveModels);
    createComponentInventorySection(interactive, interactiveModels, ["button", "text-input", "select", "tab"]);
    createComponentStateStripsSection(interactive, interactiveModels, ["button", "text-input", "select", "tab"]);
    createComponentSheetsSection(interactive, interactiveModels, isNormalized, ["button", "text-input", "select", "tab"]);
    if (isNormalized) createCoreComponentSetsSection(interactive, data.componentModel || []);

    const navigation = createDesignerGroupSection(root, l("Navigation", "导航与列表项", "导航与列表项 / Navigation"), l("Links, menu items, navigation regions, and sidebar-like controls.", "链接、菜单项、导航区域和类似侧边栏的控件。", "链接、菜单项和导航区域 / Links, menu items, and navigation regions."));
    if (isNormalized) {
      createPatternOnlyComponentSummarySection(navigation, designComponents);
    } else {
      createComponentInventorySection(navigation, designComponents, ["menu-item", "link", "navigation"]);
      createComponentStateStripsSection(navigation, designComponents, ["menu-item", "link", "navigation"]);
      createComponentSheetsSection(navigation, designComponents, isNormalized, ["menu-item", "link", "navigation"]);
    }

    const containers = createDesignerGroupSection(root, l("Containers / Composite Drafts", "容器 / 组合草稿", "容器 / 组合草稿 / Containers"), l("Experimental grouped samples for containers and page-level UI patterns.", "容器与页面级 UI 模式的实验性归组样本。", "容器与页面级 UI 模式样本 / Container and page-level pattern samples."));
    createContainerModelSection(containers, data.containerModel || [], designComponents);

    const assets = createDesignerGroupSection(root, copy("assets"), l("Resolved SVGs, unresolved placeholders, and image assets found during extraction.", "采集中发现的可渲染 SVG、未解析线索和图片资源。", "采集中发现的资源 / Resolved SVGs, unresolved clues, and image assets."));
    await createAssetSection(assets, data.assetCatalog || data.assets || [], data);

    const trace = createDesignerGroupSection(root, l("Trace / Warnings", "Trace / Warnings", "Trace / Warnings"), l("Raw component traces, review risks, and known issues kept for auditability.", "Raw component traces, review risks, and known issues kept for auditability.", "Raw component traces, review risks, and known issues kept for auditability."));
    createComponentSection(trace, components, isNormalized);
    createWarningsSection(trace, collectWarnings(data, components));
  } else {
    createColorSystemSections(root, data, tokens, isNormalized);
    createTypographySection(root, tokens.typography || []);
    createTokenSection(root, copy("radii"), tokens.radii || [], "px");
    createSpacingPreviewSection(root, tokens.spacing || [], isNormalized);
    createShadowPreviewSection(root, tokens.shadows || [], isNormalized);
    await createAssetSection(root, data.assetCatalog || data.assets || [], data);
    createImportQaSection(root, data, data.assetCatalog || data.assets || [], components);
    if (isNormalized) createSpecificationReviewSection(root, data.designSystemSpec || {}, data.componentModel || []);
    if (isNormalized) createSemanticComponentSetSection(root, data.componentModel || []);
    createComponentSection(root, components, isNormalized);
    createWarningsSection(root, collectWarnings(data, components));
  }
  markGeneratedTree(root);
  removeGeneratedOrphanNodes(page, root);

  figma.viewport.scrollAndZoomIntoView([root]);
}

async function configureTextFonts() {
  const cjk = await firstAvailableFont([
    { family: "Microsoft YaHei", regular: "Regular", medium: "Regular", semibold: "Bold" },
    { family: "Noto Sans CJK SC", regular: "Regular", medium: "Medium", semibold: "Bold" },
    { family: "Noto Sans SC", regular: "Regular", medium: "Medium", semibold: "Bold" },
    { family: "PingFang SC", regular: "Regular", medium: "Medium", semibold: "Semibold" },
    { family: "Source Han Sans SC", regular: "Regular", medium: "Medium", semibold: "Bold" }
  ]);
  if (cjk) {
    cjkRegularFont = { family: cjk.family, style: cjk.regular };
    cjkMediumFont = { family: cjk.family, style: cjk.medium };
    cjkSemiBoldFont = { family: cjk.family, style: cjk.semibold };
  }
}

async function firstAvailableFont(candidates) {
  for (const candidate of candidates) {
    try {
      await figma.loadFontAsync({ family: candidate.family, style: candidate.regular });
      await figma.loadFontAsync({ family: candidate.family, style: candidate.medium });
      await figma.loadFontAsync({ family: candidate.family, style: candidate.semibold });
      return candidate;
    } catch (error) {
      // Try the next CJK font candidate.
    }
  }
  return null;
}

async function importNormalizedDesignerPages(data, tokens, components, rootName) {
  const designComponents = data.componentModel || [];
  const host = data.source && data.source.hostname ? data.source.hostname : "Website";
  const pages = [
    {
      name: `01 Overview - ${host}`,
      title: l("Overview", "概览", "概览 / Overview"),
      pageLabel: localizedPageLabel("01", "Overview", "概览"),
      intro: l("Import summary, maturity notice, governance, and review checklist for this reverse-engineered design system draft.", "导入摘要、成熟度提示、治理信息和设计系统草稿复核清单。", "导入摘要、成熟度提示、治理信息和设计系统草稿复核清单 / Import summary and review checklist."),
      build: function(root) {
        createOverviewSection(root, data, true);
        createAssetCreationSummarySection(root);
        createDesignerQuickStartSection(root, data, components);
        createSpecificationReviewSection(root, data.designSystemSpec || {}, designComponents);
      }
    },
    {
      name: `02 Foundations - ${host}`,
      title: l("Foundations", "基础规范", "基础规范 / Foundations"),
      pageLabel: localizedPageLabel("02", "Foundations", "基础规范"),
      intro: l("Observed and optionally generated foundational variables: color, typography, radius, spacing, and shadow.", "从页面中观察或生成的颜色、字体、圆角、间距与阴影基础变量。", "从页面中观察或生成的基础变量 / Observed foundational variables."),
      build: function(root) {
        createColorSystemSections(root, data, tokens, true);
        createTypographySection(root, tokens.typography || []);
        createTokenSection(root, copy("radii"), tokens.radii || [], "px");
        createSpacingPreviewSection(root, tokens.spacing || [], true);
        createShadowPreviewSection(root, tokens.shadows || [], true);
      }
    },
    {
      name: `03 Components - ${host}`,
      title: l("Components", "组件", "组件 / Components"),
      pageLabel: localizedPageLabel("03", "Components", "组件"),
      intro: l("Reusable candidates and trace-only items are separated so page-specific DOM samples do not look like finalized components.", "将可复用组件候选与仅供追踪的页面实例分开，避免把页面特定 DOM 样本误认为正式组件。", "将可复用组件候选与追踪项分开 / Reusable candidates are separated from trace-only DOM samples."),
      build: function(root) {
        const interactiveCategories = genericComponentCategories();
        const interactiveModels = reusableComponentModels(designComponents, interactiveCategories);

        createComponentQualitySummarySection(root, designComponents);
        createReusablePatternDraftsSection(root, data.containerModel || [], designComponents, data.assetCatalog || data.assets || [], data);

        const interactive = createDesignerGroupSection(root, l("Reusable Components", "通用组件", "通用组件 / Reusable Components"), l("Generic controls and small reusable building blocks with enough evidence for a reusable draft.", "具备复用证据的通用控件与小型可复用构件。", "具备复用证据的通用组件 / Generic reusable component candidates."));
        if (!interactiveModels.length) createNoReusableComponentsNote(interactive, designComponents);
        createActionControlsSection(interactive, interactiveModels);
        createComponentInventorySection(interactive, interactiveModels, interactiveCategories);
        createComponentStateStripsSection(interactive, interactiveModels, interactiveCategories);
        createComponentSheetsSection(interactive, interactiveModels, true, interactiveCategories);
        createCoreComponentSetsSection(interactive, interactiveModels);

        createPatternOnlyComponentSummarySection(root, designComponents);
        createTraceOnlyComponentSummarySection(root, designComponents);
        createSemanticComponentSetSection(root, reusableComponentModels(designComponents));
      }
    },
    {
      name: `04 Containers - ${host}`,
      title: l("Containers", "容器", "容器 / Containers"),
      pageLabel: localizedPageLabel("04", "Containers", "容器"),
      intro: l("Visual containers are separated from structural layout regions. Transparent wrappers are kept as trace rows instead of component-like cards.", "将可视容器与结构布局区域分开。透明包装层会作为追踪行保留，不再伪装成组件卡片。", "可视容器与结构布局区域分开 / Visual containers are separated from structural layout regions."),
      build: function(root) {
        createContainerModelSection(root, data.containerModel || [], designComponents);
      }
    },
    {
      name: `05 Assets Trace - ${host}`,
      title: l("Assets / Trace", "资源 / 追踪", "资源 / Trace"),
      pageLabel: localizedPageLabel("05", "Assets Trace", "资源追踪"),
      intro: l("Asset catalog, raw component traces, and warnings retained for auditability.", "保留资源目录、原始组件追踪和警告，便于审计。", "保留资源目录、原始组件追踪和警告 / Asset catalog, raw component traces, and warnings retained for auditability."),
      build: async function(root) {
        await createAssetSection(root, data.assetCatalog || data.assets || [], data);
        createComponentSection(root, components, true);
        createWarningsSection(root, collectWarnings(data, components));
      }
    }
  ];

  let firstRoot = null;
  for (const item of pages) {
    const page = await getOrCreateDesignerPage(`${item.pageLabel} - ${host}`);
    const root = createLibraryRoot(page, `${rootName} / ${item.title}`, item.intro);
    await item.build(root);
    markGeneratedTree(root);
    removeGeneratedOrphanNodes(page, root);
    if (!firstRoot) firstRoot = root;
  }

  if (firstRoot) {
    await figma.setCurrentPageAsync(firstRoot.parent);
    figma.viewport.scrollAndZoomIntoView([firstRoot]);
  }
}

async function importComponentLibraryDraft(data, tokens, rootName) {
  const host = data.source && data.source.hostname ? data.source.hostname : "Website";
  const models = data.componentModel || [];
  const promotedModels = selectPromotableLibraryModels(models);
  const promotedSets = componentLibrarySetModels(promotedModels);
  const page = await getOrCreateDesignerPage(`Component Library Draft - ${host}`);
  const root = createLibraryRoot(page, rootName, "Draft Figma components promoted from high-confidence core candidates. Existing UI Kit Draft pages are not changed by this mode.");

  createAssetCreationSummarySection(root);
  createComponentLibrarySummarySection(root, models, promotedModels, promotedSets);
  createPromotedComponentLibrarySection(root, promotedSets);
  createNotPromotedCandidatesSection(root, models, promotedModels);

  markGeneratedTree(root);
  removeGeneratedOrphanNodes(page, root);
  figma.viewport.scrollAndZoomIntoView([root]);
}

function selectPromotableLibraryModels(models) {
  return (models || []).filter((model) => promotionFailureReasons(model).length === 0);
}

function componentLibrarySetModels(models) {
  const grouped = groupBy(models || [], (model) => model.category || "other");
  const result = [];
  for (const category of componentLibraryCategories()) {
    const items = dedupeComponentsForSheet((grouped[category] || []).filter((model) => componentPresentationTier(model) === "designSystemComponent"));
    const model = coreComponentSetModelForCategory(category, sortComponentsForSheet(items));
    if (model) result.push(model);
  }
  return result;
}

function componentLibraryCategories() {
  return ["button", "text-input", "select", "tab"];
}

function componentLibraryHighRiskWarnings() {
  return ["low-contrast", "clipped", "missing-background", "missing source background", "inferred-state", "inferred state"];
}

function promotionFailureReasons(model) {
  const reasons = [];
  const category = model && model.category ? model.category : "unknown";
  if (componentLibraryCategories().indexOf(category) === -1) reasons.push(`non-core category: ${category}`);
  if (componentPresentationTier(model) !== "designSystemComponent") reasons.push("not a design-system component candidate");
  if ((model.confidence || 0) < 0.75) reasons.push(`confidence below 75%: ${Math.round((model.confidence || 0) * 100)}%`);
  if ((model.reviewStatus || "") !== "candidate") reasons.push(`review status: ${model.reviewStatus || "unknown"}`);
  const risky = highRiskWarningsForModel(model);
  if (risky.length) reasons.push(`high-risk warnings: ${risky.join(", ")}`);
  return reasons;
}

function localizedPromotionFailureReason(reason) {
  const value = String(reason || "");
  if (value.indexOf("non-core category:") === 0) {
    return l(value, `非核心类别：${categoryLabel(value.replace("non-core category:", "").trim())}`, `非核心类别 / ${value}`);
  }
  if (value.indexOf("confidence below 75%:") === 0) {
    return l(value, value.replace("confidence below 75%:", "置信度低于 75%："), `${value.replace("confidence below 75%:", "置信度低于 75%：")} / ${value}`);
  }
  if (value.indexOf("review status:") === 0) {
    const status = value.replace("review status:", "").trim();
    return l(value, `复核状态：${statusLabel(status)}`, `复核状态 / ${value}`);
  }
  if (value === "not a design-system component candidate") {
    return l(value, "不是设计系统组件候选", "不是设计系统组件候选 / not a design-system component candidate");
  }
  if (value.indexOf("high-risk warnings:") === 0) {
    const warnings = value.replace("high-risk warnings:", "").split(",").map((item) => warningTypeLabel(item.trim())).join(", ");
    return l(value, `高风险警告：${warnings}`, `高风险警告 / ${value}`);
  }
  return value;
}

function highRiskWarningsForModel(model) {
  const warnings = (model && model.warnings ? model.warnings : []).map((warning) => String(warning || "").toLowerCase());
  return componentLibraryHighRiskWarnings().filter((risk) => warnings.some((warning) => warning.indexOf(risk) >= 0));
}

function createComponentLibrarySummarySection(parent, allModels, promotedModels, promotedSets) {
  const frame = sectionFrame(l("Component Library Draft Summary", "组件库草稿摘要", "组件库草稿摘要 / Component Library Draft Summary"));
  parent.appendChild(frame);

  const intro = text(l("Only high-confidence core candidates are promoted. Everything remains a draft component library until reviewed by a designer or system owner.", "仅高置信度核心候选会被晋升。所有内容在设计师或系统负责人复核前仍是组件库草稿。", "仅高置信度核心候选会被晋升 / Only high-confidence core candidates are promoted."), 12, "Regular", "#555555");
  resizeTextBlock(intro, 1120, 34);
  frame.appendChild(intro);

  const row = figma.createFrame();
  row.name = "Library promotion summary";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  row.clipsContent = false;
  frame.appendChild(row);

  row.appendChild(summaryPill(l("candidates", "候选", "候选 / candidates"), (allModels || []).length));
  row.appendChild(summaryPill(l("promoted", "已晋升", "已晋升 / promoted"), (promotedModels || []).length));
  row.appendChild(summaryPill(l("component sets", "组件集", "组件集 / component sets"), (promotedSets || []).length));
  row.appendChild(summaryPill(fieldLabel("status"), l("draft", "草稿", "草稿 / draft")));
}

function createPromotedComponentLibrarySection(parent, setModels) {
  const frame = sectionFrame(l("Promoted Component Sets", "已晋升组件集", "已晋升组件集 / Promoted Component Sets"));
  parent.appendChild(frame);

  const intro = text(l("Generated as real Figma Components and Component Sets. Variant axes use State, Size, and Tone. Descriptions keep source traces and review status.", "生成真实 Figma Component 与 Component Set。变体轴使用 State、Size、Tone，描述中保留来源追踪与复核状态。", "生成真实 Figma 组件与组件集 / Generated as real Figma Components and Component Sets."), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 34);
  frame.appendChild(intro);

  if (!setModels.length) {
    const empty = text(l("No candidates met the strict promotion criteria.", "没有候选满足严格晋升条件。", "没有候选满足严格晋升条件 / No candidates met the strict promotion criteria."), 12, "Medium", "#9a5b00");
    resizeTextBlock(empty, 1120, 20);
    frame.appendChild(empty);
    return;
  }

  const list = figma.createFrame();
  list.name = "Promoted component set list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 20;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const model of setModels) {
    const block = componentLibrarySetBlock(model);
    if (block) list.appendChild(block);
  }
}

function componentLibrarySetBlock(model) {
  const block = figma.createFrame();
  const displayName = componentDisplayName(model);
  block.name = `${displayName} / Promoted Component Set`;
  block.layoutMode = "VERTICAL";
  block.itemSpacing = 12;
  block.paddingTop = 14;
  block.paddingRight = 14;
  block.paddingBottom = 14;
  block.paddingLeft = 14;
  block.resize(1080, 1);
  block.cornerRadius = 8;
  block.clipsContent = false;
  block.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  block.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(block);

  const title = text(`${displayName} / ${categoryLabel(model.category || "component")} ${l("Library Draft", "组件库草稿", "组件库草稿 / Library Draft")}`, 14, "Semi Bold", "#111111");
  resizeTextBlock(title, 1020, 18);
  block.appendChild(title);

  const variants = orderedComponentVariants(uniqueComponentVariants(componentVariants(model)));
  const meta = text(`${l("draft component library", "组件库草稿", "组件库草稿 / draft component library")} | ${fieldLabel("confidence")}: ${Math.round((model.confidence || 0) * 100)}% | ${fieldLabel("variants")}: ${truncate(componentSetVariantSummary(model), 120)}`, 10, "Regular", "#666666");
  resizeTextBlock(meta, 1020, 16);
  block.appendChild(meta);

  const source = text(`${fieldLabel("source")}: ${sourceIdSummary(model.sourceComponentIds || [], 5)}`, 10, "Regular", "#666666");
  resizeTextBlock(source, 1020, 16);
  block.appendChild(source);

  const holder = figma.createFrame();
  holder.name = `${displayName} component holder`;
  holder.layoutMode = "HORIZONTAL";
  holder.layoutWrap = "WRAP";
  holder.itemSpacing = 12;
  holder.counterAxisSpacing = 12;
  holder.paddingTop = 12;
  holder.paddingRight = 12;
  holder.paddingBottom = 12;
  holder.paddingLeft = 12;
  holder.resize(1020, 1);
  holder.cornerRadius = 8;
  holder.clipsContent = false;
  holder.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  setWrappedAutoHeight(holder);
  block.appendChild(holder);

  const components = variants.map((variant) => libraryComponentVariant(model, variant));
  if (components.length === 1) {
    const component = components[0];
    component.name = displayName;
    holder.appendChild(component);
    return block;
  }

  for (const component of components) holder.appendChild(component);
  try {
    const set = figma.combineAsVariants(components, holder);
    set.name = displayName;
    set.description = libraryComponentDescription(model, "component set");
    try {
      set.layoutMode = "HORIZONTAL";
      set.layoutWrap = "WRAP";
      set.itemSpacing = 12;
      set.counterAxisSpacing = 12;
      set.paddingTop = 12;
      set.paddingRight = 12;
      set.paddingBottom = 12;
      set.paddingLeft = 12;
    } catch (error) {
      // ComponentSet layout controls are best-effort across Figma runtimes.
    }
  } catch (error) {
    const note = text(l(`Could not combine variants automatically: ${error.message || String(error)}`, `无法自动合并变体：${error.message || String(error)}`, `无法自动合并变体 / Could not combine variants: ${error.message || String(error)}`), 10, "Regular", "#9a3412");
    resizeTextBlock(note, 1020, 16);
    block.appendChild(note);
  }
  return block;
}

function libraryComponentVariant(model, variant) {
  const component = semanticComponentVariant(model, variant);
  component.name = `State=${titleCase(variant.state)}, Size=${titleCase(variant.size)}, Tone=${titleCase(variant.tone)}`;
  component.description = libraryComponentDescription(model, "component");
  try {
    component.variantProperties = {
      State: titleCase(variant.state),
      Size: titleCase(variant.size),
      Tone: titleCase(variant.tone)
    };
  } catch (error) {
    // Variant properties are best-effort for older runtimes.
  }
  return component;
}

function libraryComponentDescription(model, nodeType) {
  return [
    `draft component library ${nodeType}`,
    `category: ${model.category || "unknown"}`,
    `confidence: ${Math.round((model.confidence || 0) * 100)}%`,
    `review status: ${model.reviewStatus || "candidate"}`,
    `source component ids: ${(model.sourceComponentIds || []).slice(0, 12).join(", ") || "none"}`,
    "origin: observed samples with inferred names and variants; generated tokens remain marked separately"
  ].join("\n");
}

function createNotPromotedCandidatesSection(parent, allModels, promotedModels) {
  const frame = sectionFrame(l("Review candidates not promoted", "未晋升的复核候选", "未晋升的复核候选 / Review candidates not promoted"));
  parent.appendChild(frame);

  const intro = text(l("These candidates were kept out of the component library draft because they did not meet the strict promotion criteria.", "这些候选未满足严格晋升条件，因此不会进入组件库草稿。", "这些候选未满足严格晋升条件 / These candidates did not meet strict promotion criteria."), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 34);
  frame.appendChild(intro);

  const promoted = new Set(promotedModels || []);
  const rejected = (allModels || []).filter((model) => !promoted.has(model));
  if (!rejected.length) {
    const empty = text(l("All candidates eligible for review were promoted.", "所有符合条件的候选都已晋升。", "所有符合条件的候选都已晋升 / All eligible candidates were promoted."), 12, "Medium", "#166534");
    resizeTextBlock(empty, 1120, 20);
    frame.appendChild(empty);
    return;
  }

  const list = figma.createFrame();
  list.name = "Not promoted candidate list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 8;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const model of rejected.slice(0, 40)) {
    list.appendChild(notPromotedCandidateRow(model));
  }

  if (rejected.length > 40) {
    const more = text(l(`+${rejected.length - 40} more candidates not shown`, `另有 ${rejected.length - 40} 个候选未展示`, `另有 ${rejected.length - 40} 个候选未展示 / +${rejected.length - 40} more candidates not shown`), 10, "Regular", "#666666");
    resizeTextBlock(more, 1120, 14);
    frame.appendChild(more);
  }
}

function notPromotedCandidateRow(model) {
  const row = figma.createFrame();
  row.name = `${componentDisplayName(model) || "Candidate"} / not promoted`;
  row.layoutMode = "VERTICAL";
  row.itemSpacing = 4;
  row.paddingTop = 10;
  row.paddingRight = 12;
  row.paddingBottom = 10;
  row.paddingLeft = 12;
  row.resize(1080, 1);
  row.cornerRadius = 8;
  row.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(row);

  const title = text(`${componentDisplayName(model) || "Candidate"} | ${categoryLabel(model.category || "unknown")} | ${Math.round((model.confidence || 0) * 100)}%`, 11, "Semi Bold", "#111111");
  resizeTextBlock(title, 1040, 16);
  row.appendChild(title);

  const reasons = text(`${l("reason", "原因", "原因 / reason")}: ${promotionFailureReasons(model).map(localizedPromotionFailureReason).join("; ") || l("not promoted", "未晋升", "未晋升 / not promoted")}`, 10, "Regular", "#7c2d12");
  resizeTextBlock(reasons, 1040, 28);
  row.appendChild(reasons);

  const source = text(`${fieldLabel("source")}: ${sourceIdSummary(model.sourceComponentIds || [], 5)}`, 9, "Regular", "#666666");
  resizeTextBlock(source, 1040, 14);
  row.appendChild(source);
  return row;
}

async function importPageReplicaDraft(data, rootName) {
  const snapshots = Array.isArray(data.pageSnapshots) ? data.pageSnapshots : [];
  if (!snapshots.length) {
    throw new Error("This normalized JSON does not contain pageSnapshots. Use Capture page screenshot in the browser extension, then export normalized JSON again.");
  }

  const host = data.source && data.source.hostname ? data.source.hostname : "Website";
  const page = await getOrCreateDesignerPage(`Page Screenshot Reference - ${host}`);
  const root = createLibraryRoot(page, rootName, "Observed browser screenshots captured from the extension. This mode is a visual reference only and does not attempt editable page reconstruction.");

  createPageReplicaSummarySection(root, snapshots);
  for (const item of snapshots) {
    await createPageReplicaSnapshotSection(root, item);
  }

  markGeneratedTree(root);
  removeGeneratedOrphanNodes(page, root);
  figma.viewport.scrollAndZoomIntoView([root]);
}

function createPageReplicaSummarySection(parent, snapshots) {
  const frame = sectionFrame("Page Screenshot Reference Summary");
  parent.appendChild(frame);

  const intro = text("This mode places observed browser screenshots into Figma as reference frames. It does not rebuild the page as editable layers, so misleading text or icon approximations are not generated.", 12, "Regular", "#555555");
  resizeTextBlock(intro, 1120, 42);
  frame.appendChild(intro);

  const stats = pageReplicaStats(snapshots);
  const row = figma.createFrame();
  row.name = "Screenshot reference summary";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  row.clipsContent = false;
  frame.appendChild(row);

  row.appendChild(summaryPill("snapshots", snapshots.length));
  row.appendChild(summaryPill("nodes", stats.nodeCount));
  row.appendChild(summaryPill("screenshots", stats.visualReferenceCount));
  row.appendChild(summaryPill("scope", stats.scopes.join(", ") || "unknown"));

  if (stats.warnings.length) {
    const warning = text(`warnings: ${truncate(stats.warnings.join("; "), 220)}`, 11, "Regular", "#7c2d12");
    resizeTextBlock(warning, 1120, 40);
    frame.appendChild(warning);
  }
}

function pageReplicaStats(snapshots) {
  const scopes = [];
  const warnings = [];
  let nodeCount = 0;
  let visualReferenceCount = 0;
  for (const item of snapshots || []) {
    const snapshot = item.snapshot || item;
    if (!snapshot) continue;
    nodeCount += Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0;
    visualReferenceCount += Array.isArray(snapshot.visualReferences) ? snapshot.visualReferences.length : 0;
    if (snapshot.scope && scopes.indexOf(snapshot.scope) === -1) scopes.push(snapshot.scope);
    for (const warning of snapshot.warnings || []) warnings.push(String(warning || ""));
  }
  return { scopes, warnings, nodeCount, visualReferenceCount };
}

async function createPageReplicaSnapshotSection(parent, item) {
  const snapshot = item.snapshot || item;
  if (!snapshot || !Array.isArray(snapshot.nodes)) return;

  const label = item.captureStateLabel || snapshot.captureStateLabel || snapshot.scope || "snapshot";
  const size = replicaFrameSize(snapshot);
  const frame = sectionFrame(`Screenshot / ${label}`);
  frame.resize(Math.max(1304, size.width + 48), 1);
  parent.appendChild(frame);

  const meta = text(replicaSnapshotMeta(item, snapshot, size), 11, "Regular", "#555555");
  resizeTextBlock(meta, Math.max(1120, size.width), 46);
  frame.appendChild(meta);

  const replicaFrame = figma.createFrame();
  replicaFrame.name = `Screenshot Reference / ${label}`;
  replicaFrame.resize(size.width, size.height);
  replicaFrame.layoutMode = "NONE";
  replicaFrame.clipsContent = true;
  replicaFrame.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  replicaFrame.strokes = [{ type: "SOLID", color: hexToRgb("#d9d9d9") }];
  replicaFrame.cornerRadius = 8;
  try {
    replicaFrame.description = "observed screenshot reference; not editable reconstruction";
  } catch (error) {
    // Most regular scene nodes do not expose a visible description field.
  }
  try {
    replicaFrame.setPluginData("replicaTrace", JSON.stringify({ scope: snapshot.scope || "unknown", label }));
  } catch (error) {
    // Trace metadata is best-effort.
  }
  frame.appendChild(replicaFrame);

  const hasVisualReference = createReplicaVisualReferenceLayer(replicaFrame, snapshot, size);
  if (!hasVisualReference) {
    const note = text("No screenshot reference found. Re-capture with Capture page screenshot in the browser extension, then export normalized JSON again.", 11, "Regular", "#9a3412");
    resizeTextBlock(note, Math.max(1120, size.width), 34);
    try {
      frame.insertChild(frame.children.indexOf(replicaFrame), note);
    } catch (error) {
      frame.appendChild(note);
    }
  }

}

function replicaSnapshotMeta(item, snapshot, size) {
  const warnings = (snapshot.warnings || []).map((warning) => String(warning || "")).filter(Boolean);
  const parts = [
    `scope: ${snapshot.scope || "unknown"}`,
    `nodes: ${(snapshot.nodes || []).length}`,
    `screenshots: ${Array.isArray(snapshot.visualReferences) ? snapshot.visualReferences.length : 0}`,
    `frame: ${Math.round(size.width)} x ${Math.round(size.height)}`,
    `source: ${item.sourceUrl || snapshot.url || "captured page"}`
  ];
  if (warnings.length) parts.push(`warnings: ${truncate(warnings.join("; "), 160)}`);
  parts.push("fidelity: observed browser screenshot reference; no editable reconstruction is generated");
  return parts.join(" | ");
}

function createReplicaVisualReferenceLayer(parent, snapshot, size) {
  const refs = Array.isArray(snapshot.visualReferences) ? snapshot.visualReferences : [];
  const usableRefs = refs.filter((ref) => ref && ref.kind === "screenshot" && ref.dataUrl);
  if (!usableRefs.length) return false;

  const layer = figma.createFrame();
  layer.name = "Observed screenshot reference";
  layer.resize(size.width, size.height);
  layer.layoutMode = "NONE";
  layer.clipsContent = true;
  layer.fills = [];
  parent.appendChild(layer);

  usableRefs.forEach((ref, index) => {
    const node = createReplicaScreenshotNode(ref, index, size);
    if (!node) return;
    layer.appendChild(node);
  });

  try {
    layer.locked = true;
    layer.visible = true;
  } catch (error) {
    // Locking screenshot references is best-effort.
  }
  return layer.children.length > 0;
}

function createReplicaScreenshotNode(ref, index, frameSize) {
  const bounds = replicaVisualReferenceBounds(ref, frameSize);
  const node = figma.createRectangle();
  node.name = `Screenshot reference ${index + 1}`;
  node.resize(bounds.width, bounds.height);
  node.x = bounds.x;
  node.y = bounds.y;
  node.fills = [{ type: "SOLID", color: hexToRgb("#f3f4f6") }];
  try {
    const bytes = dataUrlToBytes(ref.dataUrl);
    const image = figma.createImage(bytes);
    node.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
  } catch (error) {
    node.strokes = [{ type: "SOLID", color: hexToRgb("#f97316"), opacity: 0.7 }];
  }
  try {
    node.locked = true;
  } catch (error) {
    // Locking screenshot references is best-effort.
  }
  return node;
}

function dataUrlToBytes(dataUrl) {
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  if (comma < 0 || value.slice(0, comma).indexOf(";base64") < 0) {
    throw new Error("Screenshot reference is not a base64 data URL.");
  }
  const binary = atob(value.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function replicaVisualReferenceBounds(ref, frameSize) {
  const bounds = ref.bounds || {};
  return {
    x: clamp(Math.round(Number(bounds.x) || 0), 0, frameSize.width),
    y: clamp(Math.round(Number(bounds.y) || 0), 0, frameSize.height),
    width: clamp(Math.round(Number(bounds.width) || frameSize.width), 1, frameSize.width),
    height: clamp(Math.round(Number(bounds.height) || frameSize.height), 1, frameSize.height)
  };
}

function createReplicaOverlayFrame(size, hasVisualReference) {
  const overlay = figma.createFrame();
  overlay.name = hasVisualReference ? "Legacy overlay helper (disabled)" : "Legacy overlay helper";
  overlay.resize(size.width, size.height);
  overlay.layoutMode = "NONE";
  overlay.clipsContent = true;
  overlay.fills = [];
  if (hasVisualReference) {
    try {
      overlay.visible = false;
    } catch (error) {
      // Overlay visibility is best-effort.
    }
  }
  return overlay;
}

function replicaFrameSize(snapshot) {
  const scope = snapshot.scope || "viewport";
  const viewport = snapshot.viewport || {};
  const documentSize = snapshot.documentSize || {};
  const widthSource = scope === "full-page" ? documentSize.width || viewport.width : viewport.width || documentSize.width;
  const heightSource = scope === "full-page" ? documentSize.height || viewport.height : viewport.height || documentSize.height;
  return {
    width: clamp(Math.round(Number(widthSource) || 1440), 320, 6000),
    height: clamp(Math.round(Number(heightSource) || 900), 320, scope === "full-page" ? 12000 : 6000)
  };
}

function replicaChildCounts(nodes) {
  const counts = {};
  for (const node of nodes || []) {
    if (!node || !node.parentId) continue;
    counts[node.parentId] = (counts[node.parentId] || 0) + 1;
  }
  return counts;
}

function replicaSortIndex(node) {
  const value = String((node && node.id) || "").match(/(\d+)$/);
  return value ? Number(value[1]) : 0;
}

function replicaNodeWithinFrame(node, frameSize) {
  const bounds = node && node.bounds ? node.bounds : {};
  const x = Number(bounds.x) || 0;
  const y = Number(bounds.y) || 0;
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  return x + width >= 0 && y + height >= 0 && x <= frameSize.width && y <= frameSize.height;
}

function shouldRenderReplicaOverlayNode(sourceNode, hasChildren) {
  if (!sourceNode) return false;
  const asset = sourceNode.asset || {};
  if (asset.type && asset.src) return true;
  if (replicaVisibleText(sourceNode)) return true;
  const category = sourceNode.componentHint && sourceNode.componentHint.category;
  if (["button", "text-input", "select", "tab", "menu-item", "link"].indexOf(category) >= 0) return true;
  const tag = String(sourceNode.tag || "").toLowerCase();
  if (["button", "input", "textarea", "select", "img", "svg", "canvas", "video"].indexOf(tag) >= 0) return true;
  return hasChildren && isMajorReplicaContainer(sourceNode);
}

function isMajorReplicaContainer(sourceNode) {
  const bounds = sourceNode.bounds || {};
  const styles = sourceNode.styles || {};
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  const tag = String(sourceNode.tag || "").toLowerCase();
  const role = String(sourceNode.role || "").toLowerCase();
  if (width < 80 || height < 40) return false;
  if (!replicaHasVisibleBox(styles)) return false;
  return ["header", "nav", "main", "aside", "section", "article", "dialog"].indexOf(tag) >= 0 ||
    ["navigation", "main", "banner", "complementary", "dialog", "menu", "tabpanel"].indexOf(role) >= 0 ||
    width * height > 16000;
}

async function createReplicaSceneNode(sourceNode, hasChildren) {
  const bounds = sourceNode.bounds || {};
  const width = clamp(Math.round(Number(bounds.width) || 1), 1, 6000);
  const height = clamp(Math.round(Number(bounds.height) || 1), 1, 12000);
  const asset = sourceNode.asset || {};

  if (asset.type === "svg" && shouldRenderReplicaAssetAsStandalone(sourceNode, asset)) {
    const svgNode = createReplicaSvgNode(sourceNode, width, height);
    if (svgNode) return svgNode;
  }

  if ((asset.type === "image" || asset.type === "mask-image") && shouldRenderReplicaAssetAsStandalone(sourceNode, asset)) {
    return await createReplicaImageNode(sourceNode, width, height);
  }

  if (shouldRenderReplicaAsText(sourceNode, hasChildren)) {
    return createReplicaTextNode(sourceNode, width, height);
  }

  return await createReplicaFrameNode(sourceNode, width, height, hasChildren);
}

function createReplicaSvgNode(sourceNode, width, height) {
  const asset = sourceNode.asset || {};
  const svg = replicaSvgSourceFromAsset(asset, sourceNode.styles && sourceNode.styles.color);
  if (!svg) return null;
  try {
    const node = figma.createNodeFromSvg(svg);
    node.name = replicaNodeName(sourceNode, "SVG");
    node.resize(width, height);
    applyReplicaEffects(node, sourceNode.styles || {});
    setReplicaTrace(node, sourceNode);
    return node;
  } catch (error) {
    return null;
  }
}

async function createReplicaImageNode(sourceNode, width, height) {
  const asset = sourceNode.asset || {};
  const svgNode = createReplicaSvgLikeNode(asset, width, height, sourceNode.styles && sourceNode.styles.color, replicaNodeName(sourceNode, "SVG image"));
  if (svgNode) {
    applyReplicaEffects(svgNode, sourceNode.styles || {});
    setReplicaTrace(svgNode, sourceNode);
    return svgNode;
  }

  const node = figma.createRectangle();
  node.name = replicaNodeName(sourceNode, "Image");
  node.resize(width, height);
  node.cornerRadius = parseReplicaRadius(sourceNode.styles && sourceNode.styles.borderRadius);
  node.fills = [{ type: "SOLID", color: hexToRgb("#f3f4f6") }];
  node.strokes = [{ type: "SOLID", color: hexToRgb("#d1d5db") }];
  const src = asset && asset.src;
  if (src && typeof figma.createImageAsync === "function") {
    try {
      const image = await figma.createImageAsync(src);
      node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
      node.strokes = [];
    } catch (error) {
      node.name = replicaNodeName(sourceNode, "Image placeholder");
    }
  }
  applyReplicaEffects(node, sourceNode.styles || {});
  setReplicaTrace(node, sourceNode);
  return node;
}

function createReplicaTextNode(sourceNode, width, height) {
  const styles = sourceNode.styles || {};
  const visibleText = replicaVisibleText(sourceNode);
  const fontSize = clamp(Number(styles.fontSize) || 12, 7, 96);
  const node = text(visibleText, fontSize, replicaFontStyle(styles.fontWeight), styles.color || "#111111");
  node.name = replicaNodeName(sourceNode, "Text");
  resizeTextBlock(node, replicaTextWidth(visibleText, width, fontSize), Math.max(height, Math.round(fontSize * 1.35)));
  setReplicaLineHeight(node, styles.lineHeight);
  applyReplicaTextAlignment(node, styles);
  applyReplicaEffects(node, styles);
  setReplicaTrace(node, sourceNode);
  return node;
}

async function createReplicaFrameNode(sourceNode, width, height, hasChildren) {
  const styles = sourceNode.styles || {};
  const node = figma.createFrame();
  node.name = replicaNodeName(sourceNode, "Element");
  node.resize(width, height);
  node.layoutMode = "NONE";
  node.clipsContent = styles.overflow === "hidden";
  node.cornerRadius = parseReplicaRadius(styles.borderRadius);
  applyReplicaPaint(node, styles);
  applyReplicaEffects(node, styles);
  const opacity = Number(styles.opacity);
  node.opacity = Number.isFinite(opacity) ? clamp(opacity, 0.05, 1) : 1;
  setReplicaTrace(node, sourceNode);
  addReplicaBorderLines(node, sourceNode);
  await addReplicaPseudoElements(node, sourceNode);
  addReplicaScrollbar(node, sourceNode);

  if (shouldAddReplicaLabel(sourceNode, hasChildren, width, height)) {
    const label = createReplicaInnerLabel(sourceNode, width, height);
    node.appendChild(label);
    label.x = Math.max(4, Math.round((width - label.width) / 2));
    label.y = Math.max(2, Math.round((height - label.height) / 2));
  } else if (isLikelyIconOnlyControl(sourceNode)) {
    const iconSize = Math.min(18, Math.max(12, Math.min(width, height) - 10));
    const icon = await createReplicaIconNode(sourceNode, iconSize, styles.color || "#111111");
    node.appendChild(icon);
    icon.x = Math.round((width - icon.width) / 2);
    icon.y = Math.round((height - icon.height) / 2);
  }
  return node;
}

function createReplicaInnerLabel(sourceNode, width, height) {
  const styles = sourceNode.styles || {};
  const fontSize = clamp(Number(styles.fontSize) || 12, 7, 32);
  const label = text(truncate(replicaVisibleText(sourceNode), 120), fontSize, replicaFontStyle(styles.fontWeight), styles.color || "#111111");
  label.name = "Label";
  resizeTextBlock(label, replicaTextWidth(label.characters || "", width - 12, fontSize), Math.max(12, Math.min(height, Math.round(fontSize * 1.45) + 4)));
  setReplicaLineHeight(label, styles.lineHeight);
  applyReplicaTextAlignment(label, styles);
  return label;
}

function shouldRenderReplicaAsText(sourceNode, hasChildren) {
  if (!sourceNode || !replicaVisibleText(sourceNode) || hasChildren) return false;
  const styles = sourceNode.styles || {};
  const category = sourceNode.componentHint && sourceNode.componentHint.category;
  if (category && category !== "text" && category !== "link") return false;
  return !replicaHasVisibleBox(styles);
}

function shouldAddReplicaLabel(sourceNode, hasChildren, width, height) {
  if (!sourceNode || !replicaVisibleText(sourceNode)) return false;
  const category = sourceNode.componentHint && sourceNode.componentHint.category;
  if (["button", "text-input", "select", "tab", "menu-item", "link"].indexOf(category) >= 0) return true;
  return !hasChildren && width >= 24 && height >= 14;
}

function replicaVisibleText(sourceNode) {
  if (!sourceNode) return "";
  const source = sourceNode.textSource || "";
  if (source === "direct-text" || source === "input-value" || source === "placeholder") return sourceNode.text || "";
  if (!source && !isLikelyIconOnlyControl(sourceNode)) return sourceNode.text || "";
  return "";
}

function isLikelyIconOnlyControl(sourceNode) {
  const bounds = sourceNode.bounds || {};
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  const category = sourceNode.componentHint && sourceNode.componentHint.category;
  const tag = String(sourceNode.tag || "").toLowerCase();
  const role = String(sourceNode.role || "").toLowerCase();
  const textValue = String(sourceNode.text || "");
  const controlLike = category === "button" || category === "link" || tag === "button" || role === "button";
  const hasIconAsset = Boolean(replicaIconAsset(sourceNode));
  return controlLike && width <= 72 && height <= 72 && (textValue.length > 1 || hasIconAsset);
}

function replicaHasVisibleBox(styles) {
  return isVisibleReplicaColor(styles.backgroundColor) || parseReplicaBorderWidth(styles.borderWidth) > 0 || hasReplicaBorderSides(styles) || Boolean(styles && styles.boxShadow);
}

function hasReplicaBorderSides(styles) {
  const borders = styles && styles.borders;
  if (!borders) return false;
  return ["top", "right", "bottom", "left"].some((side) => {
    const border = borders[side] || {};
    return Number(border.width) > 0 && border.color && border.style !== "none";
  });
}

function applyReplicaPaint(node, styles) {
  if (isVisibleReplicaColor(styles.backgroundColor)) {
    node.fills = [{ type: "SOLID", color: hexToRgb(styles.backgroundColor), opacity: hexOpacity(styles.backgroundColor) }];
  } else {
    node.fills = [];
  }

  const borderWidth = parseReplicaBorderWidth(styles.borderWidth);
  if (borderWidth > 0 && isVisibleReplicaColor(styles.borderColor)) {
    node.strokes = [{ type: "SOLID", color: hexToRgb(styles.borderColor), opacity: hexOpacity(styles.borderColor) }];
    node.strokeWeight = borderWidth;
  } else {
    node.strokes = [];
  }
}

function applyReplicaEffects(node, styles) {
  if (!styles || !styles.boxShadow) return;
  const effects = parseBoxShadow(styles.boxShadow).slice(0, 3);
  if (!effects.length) return;
  try {
    node.effects = effects;
    node.clipsContent = false;
  } catch (error) {
    // Unsupported shadow values are ignored for replica nodes.
  }
}

function addReplicaBorderLines(node, sourceNode) {
  const styles = sourceNode.styles || {};
  const borders = styles.borders || null;
  if (!borders || !hasReplicaBorderSides(styles)) return;
  const sides = ["top", "right", "bottom", "left"];
  const uniform = sides.every((side) => {
    const current = borders[side] || {};
    const top = borders.top || {};
    return current.width === top.width && current.color === top.color && current.style === top.style;
  });
  if (uniform) return;
  node.strokes = [];
  for (const side of sides) {
    const border = borders[side] || {};
    if (!border.width || !border.color || border.style === "none") continue;
    const line = createReplicaBorderLine(side, node.width, node.height, border);
    if (line) node.appendChild(line);
  }
}

function createReplicaBorderLine(side, width, height, border) {
  const line = figma.createRectangle();
  line.name = `Border ${side}`;
  line.fills = [{ type: "SOLID", color: hexToRgb(border.color), opacity: hexOpacity(border.color) }];
  if (side === "top" || side === "bottom") {
    line.resize(Math.max(1, width), Math.max(1, border.width));
    line.x = 0;
    line.y = side === "top" ? 0 : Math.max(0, height - border.width);
  } else {
    line.resize(Math.max(1, border.width), Math.max(1, height));
    line.x = side === "left" ? 0 : Math.max(0, width - border.width);
    line.y = 0;
  }
  return line;
}

async function addReplicaPseudoElements(node, sourceNode) {
  const pseudos = Array.isArray(sourceNode.pseudoElements) ? sourceNode.pseudoElements : [];
  if (!pseudos.length) return;
  let offset = 6;
  for (const pseudo of pseudos.slice(0, 2)) {
    const icon = await createReplicaPseudoNode(sourceNode, pseudo);
    if (!icon) continue;
    node.appendChild(icon);
    icon.x = pseudo.pseudo === "::after" ? Math.max(2, node.width - icon.width - 6) : offset;
    icon.y = Math.max(2, Math.round((node.height - icon.height) / 2));
    offset += icon.width + 4;
  }
}

async function createReplicaPseudoNode(sourceNode, pseudo) {
  const size = clamp(Math.max(pseudo.styles && pseudo.styles.width || 0, pseudo.styles && pseudo.styles.height || 0, 14), 8, 24);
  const color = pseudo.styles && pseudo.styles.color ? pseudo.styles.color : (sourceNode.styles && sourceNode.styles.color) || "#111111";
  const asset = pseudo.asset || {};
  if (asset.src && (asset.type === "image" || asset.type === "mask-image")) {
    return await createReplicaIconNode({ asset, iconAsset: asset, styles: sourceNode.styles || {}, text: sourceNode.text || "", textSource: sourceNode.textSource || "", bounds: { width: size, height: size } }, size, color, `Pseudo ${pseudo.pseudo || "icon"}`);
  }
  if (pseudo.content) {
    return createReplicaIconFallback(Object.assign({}, sourceNode, { text: pseudo.content }), size, color);
  }
  return null;
}

function shouldRenderReplicaAssetAsStandalone(sourceNode, asset) {
  const tag = String(sourceNode.tag || "").toLowerCase();
  if (tag === "img" || tag === "svg" || tag === "canvas" || tag === "video") return true;
  if (!asset || !asset.type) return false;
  const bounds = sourceNode.bounds || {};
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  const category = sourceNode.componentHint && sourceNode.componentHint.category;
  if (category || tag === "button" || String(sourceNode.role || "").toLowerCase() === "button") return false;
  return width <= 96 && height <= 96 && !replicaVisibleText(sourceNode);
}

function replicaIconAsset(sourceNode) {
  if (!sourceNode) return null;
  const iconAsset = sourceNode.iconAsset || null;
  if (iconAsset && (iconAsset.src || iconAsset.inlineSvg)) return iconAsset;
  const asset = sourceNode.asset || null;
  if (!asset || (!asset.src && !asset.inlineSvg)) return null;
  if (asset.type === "svg" || asset.type === "mask-image") return asset;
  if (asset.type === "image" && isLikelyCompactReplicaNode(sourceNode)) return asset;
  return null;
}

function isLikelyCompactReplicaNode(sourceNode) {
  const bounds = sourceNode.bounds || {};
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  return width > 0 && height > 0 && width <= 96 && height <= 96;
}

async function createReplicaIconNode(sourceNode, size, color, forcedName) {
  const asset = replicaIconAsset(sourceNode);
  if (asset) {
    const svgNode = createReplicaSvgLikeNode(asset, size, size, color, forcedName || `Icon / ${asset.spriteId || asset.alt || asset.type}`);
    if (svgNode) return svgNode;

    if (asset.src && typeof figma.createImageAsync === "function") {
      const imageNode = figma.createRectangle();
      imageNode.name = forcedName || `Icon image / ${asset.alt || asset.cssProperty || "asset"}`;
      imageNode.resize(size, size);
      imageNode.cornerRadius = 0;
      imageNode.fills = [];
      imageNode.strokes = [];
      try {
        const image = await figma.createImageAsync(asset.src);
        imageNode.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
        return imageNode;
      } catch (error) {
        // Keep falling back to a semantic icon shape below.
      }
    }
  }

  const fallback = createReplicaIconFallback(sourceNode, size, color);
  if (forcedName) fallback.name = forcedName;
  return fallback;
}

function createReplicaSvgLikeNode(asset, width, height, color, name) {
  const svg = replicaSvgSourceFromAsset(asset, color);
  if (!svg) return null;
  try {
    const node = figma.createNodeFromSvg(svg);
    node.name = name || `SVG icon / ${asset.spriteId || asset.alt || "asset"}`;
    node.resize(width, height);
    return node;
  } catch (error) {
    return null;
  }
}

function replicaSvgSourceFromAsset(asset, color) {
  if (!asset) return "";
  const source = asset.inlineSvg || asset.src || "";
  if (!source) return "";
  if (source.indexOf("<svg") === 0) return normalizeReplicaSvg(source, color || asset.color);
  if (/^data:image\/svg\+xml/i.test(source)) return normalizeReplicaSvg(svgFromDataUrl(source), color || asset.color);
  return "";
}

function svgFromDataUrl(value) {
  const input = String(value || "");
  const commaIndex = input.indexOf(",");
  if (commaIndex < 0) return "";
  try {
    const meta = input.slice(0, commaIndex);
    const body = input.slice(commaIndex + 1);
    if (/;base64/i.test(meta) && typeof atob === "function") return atob(body);
    return decodeURIComponent(body);
  } catch (error) {
    return "";
  }
}

function normalizeReplicaSvg(svg, color) {
  let source = String(svg || "");
  if (!source || source.indexOf("<svg") < 0) return "";
  const normalizedColor = isVisibleReplicaColor(color) ? color : "#111111";
  source = source.replace(/currentColor/g, normalizedColor);
  if (source.indexOf("xmlns=") < 0) {
    source = source.replace("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"");
  }
  if (!/\scolor=/.test(source.slice(0, Math.min(source.length, 240)))) {
    source = source.replace("<svg", `<svg color="${normalizedColor}"`);
  }
  return source;
}

function addReplicaScrollbar(node, sourceNode) {
  const scrollbar = sourceNode.styles && sourceNode.styles.scrollbar;
  if (!scrollbar) return;
  if (scrollbar.vertical && node.height >= 32 && node.width >= 16) {
    const track = figma.createRectangle();
    track.name = "Scrollbar track vertical";
    track.resize(4, Math.max(16, node.height - 8));
    track.x = Math.max(0, node.width - 6);
    track.y = 4;
    track.cornerRadius = 2;
    track.fills = [{ type: "SOLID", color: hexToRgb("#f0f0f0"), opacity: 0.75 }];
    node.appendChild(track);

    const ratio = scrollbar.clientHeight && scrollbar.scrollHeight ? scrollbar.clientHeight / scrollbar.scrollHeight : 0.35;
    const thumbHeight = clamp(track.height * ratio, 18, track.height);
    const maxTop = Math.max(0, track.height - thumbHeight);
    const scrollRatio = scrollbar.scrollHeight > scrollbar.clientHeight ? (scrollbar.scrollTop || 0) / (scrollbar.scrollHeight - scrollbar.clientHeight) : 0;
    const thumb = figma.createRectangle();
    thumb.name = "Scrollbar thumb vertical";
    thumb.resize(4, thumbHeight);
    thumb.x = track.x;
    thumb.y = track.y + maxTop * clamp(scrollRatio, 0, 1);
    thumb.cornerRadius = 2;
    thumb.fills = [{ type: "SOLID", color: hexToRgb("#cfcfcf"), opacity: 0.9 }];
    node.appendChild(thumb);
  }
}

function createReplicaIconFallback(sourceNode, size, color) {
  const icon = figma.createFrame();
  icon.name = `Icon fallback / ${replicaIconKind(sourceNode)}`;
  icon.resize(size, size);
  icon.layoutMode = "NONE";
  icon.clipsContent = false;
  icon.fills = [];
  const stroke = color || "#111111";
  const kind = replicaIconKind(sourceNode);
  if (kind === "search") {
    const circle = figma.createEllipse();
    circle.name = "Search circle";
    circle.resize(size * 0.58, size * 0.58);
    circle.x = size * 0.14;
    circle.y = size * 0.12;
    circle.fills = [];
    circle.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.85 }];
    circle.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(circle);
    icon.appendChild(replicaIconBar(size * 0.54, size * 0.62, size * 0.34, Math.max(1, size / 12), stroke, 45));
  } else if (kind === "plus") {
    icon.appendChild(replicaIconBar(size * 0.18, size * 0.48, size * 0.64, Math.max(1, size / 12), stroke, 0));
    icon.appendChild(replicaIconBar(size * 0.48, size * 0.18, size * 0.64, Math.max(1, size / 12), stroke, 90));
  } else if (kind === "more") {
    for (let i = 0; i < 3; i += 1) icon.appendChild(replicaIconDot(size * (0.25 + i * 0.25), size * 0.5, Math.max(2, size * 0.12), stroke));
  } else if (kind === "folder") {
    const folder = figma.createRectangle();
    folder.name = "Folder body";
    folder.resize(size * 0.78, size * 0.55);
    folder.x = size * 0.12;
    folder.y = size * 0.32;
    folder.cornerRadius = 2;
    folder.fills = [];
    folder.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.85 }];
    folder.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(folder);
    icon.appendChild(replicaIconBar(size * 0.18, size * 0.25, size * 0.32, Math.max(1, size / 12), stroke, 0));
  } else if (kind === "mic") {
    const mic = figma.createRectangle();
    mic.name = "Mic body";
    mic.resize(size * 0.32, size * 0.55);
    mic.x = size * 0.34;
    mic.y = size * 0.12;
    mic.cornerRadius = size * 0.16;
    mic.fills = [];
    mic.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.85 }];
    mic.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(mic);
    icon.appendChild(replicaIconBar(size * 0.5, size * 0.66, size * 0.28, Math.max(1, size / 12), stroke, 90));
    icon.appendChild(replicaIconBar(size * 0.34, size * 0.84, size * 0.32, Math.max(1, size / 12), stroke, 0));
  } else if (kind === "sidebar") {
    const panel = figma.createRectangle();
    panel.name = "Sidebar outline";
    panel.resize(size * 0.78, size * 0.72);
    panel.x = size * 0.11;
    panel.y = size * 0.14;
    panel.cornerRadius = 2;
    panel.fills = [];
    panel.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.85 }];
    panel.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(panel);
    icon.appendChild(replicaIconBar(size * 0.36, size * 0.16, size * 0.68, Math.max(1, size / 12), stroke, 90));
  } else if (kind === "edit") {
    icon.appendChild(replicaIconBar(size * 0.28, size * 0.66, size * 0.58, Math.max(1.2, size / 10), stroke, -45));
    icon.appendChild(replicaIconBar(size * 0.62, size * 0.22, size * 0.18, Math.max(1.2, size / 10), stroke, -45));
  } else if (kind === "globe") {
    const globe = figma.createEllipse();
    globe.name = "Globe outline";
    globe.resize(size * 0.76, size * 0.76);
    globe.x = size * 0.12;
    globe.y = size * 0.12;
    globe.fills = [];
    globe.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.85 }];
    globe.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(globe);
    icon.appendChild(replicaIconBar(size * 0.22, size * 0.48, size * 0.56, Math.max(1, size / 14), stroke, 0));
    icon.appendChild(replicaIconBar(size * 0.49, size * 0.16, size * 0.68, Math.max(1, size / 14), stroke, 90));
  } else if (kind === "send") {
    icon.appendChild(replicaIconBar(size * 0.5, size * 0.18, size * 0.58, Math.max(1.4, size / 9), stroke, 90));
    icon.appendChild(replicaIconBar(size * 0.28, size * 0.32, size * 0.34, Math.max(1.4, size / 9), stroke, -45));
    icon.appendChild(replicaIconBar(size * 0.48, size * 0.32, size * 0.34, Math.max(1.4, size / 9), stroke, 45));
  } else if (kind === "library") {
    icon.appendChild(replicaIconBar(size * 0.2, size * 0.22, size * 0.6, Math.max(1, size / 12), stroke, 90));
    icon.appendChild(replicaIconBar(size * 0.42, size * 0.22, size * 0.6, Math.max(1, size / 12), stroke, 90));
    icon.appendChild(replicaIconBar(size * 0.64, size * 0.22, size * 0.6, Math.max(1, size / 12), stroke, 90));
    icon.appendChild(replicaIconBar(size * 0.16, size * 0.8, size * 0.72, Math.max(1, size / 12), stroke, 0));
  } else if (kind === "code") {
    icon.appendChild(replicaIconBar(size * 0.18, size * 0.5, size * 0.28, Math.max(1, size / 11), stroke, -35));
    icon.appendChild(replicaIconBar(size * 0.18, size * 0.5, size * 0.28, Math.max(1, size / 11), stroke, 35));
    icon.appendChild(replicaIconBar(size * 0.62, size * 0.5, size * 0.28, Math.max(1, size / 11), stroke, 35));
    icon.appendChild(replicaIconBar(size * 0.62, size * 0.5, size * 0.28, Math.max(1, size / 11), stroke, -35));
  } else if (kind === "chevron") {
    icon.appendChild(replicaIconBar(size * 0.32, size * 0.42, size * 0.32, Math.max(1.2, size / 10), stroke, 45));
    icon.appendChild(replicaIconBar(size * 0.52, size * 0.42, size * 0.32, Math.max(1.2, size / 10), stroke, -45));
  } else {
    const box = figma.createRectangle();
    box.name = "Generic icon";
    box.resize(size * 0.68, size * 0.68);
    box.x = size * 0.16;
    box.y = size * 0.16;
    box.cornerRadius = Math.max(2, size * 0.14);
    box.fills = [];
    box.strokes = [{ type: "SOLID", color: hexToRgb(stroke), opacity: 0.75 }];
    box.strokeWeight = Math.max(1, Math.round(size / 12));
    icon.appendChild(box);
  }
  return icon;
}

function replicaIconBar(x, y, length, thickness, color, rotation) {
  const bar = figma.createRectangle();
  bar.name = "Icon stroke";
  bar.resize(Math.max(1, length), Math.max(1, thickness));
  bar.x = x;
  bar.y = y;
  bar.cornerRadius = Math.max(0.5, thickness / 2);
  bar.rotation = rotation || 0;
  bar.fills = [{ type: "SOLID", color: hexToRgb(color), opacity: 0.85 }];
  return bar;
}

function replicaIconDot(x, y, size, color) {
  const dot = figma.createEllipse();
  dot.name = "Icon dot";
  dot.resize(size, size);
  dot.x = x - size / 2;
  dot.y = y - size / 2;
  dot.fills = [{ type: "SOLID", color: hexToRgb(color), opacity: 0.85 }];
  return dot;
}

function replicaIconKind(sourceNode) {
  const haystack = [
    sourceNode.text || "",
    sourceNode.alt || "",
    sourceNode.title || "",
    sourceNode.className || "",
    sourceNode.role || "",
    sourceNode.tag || ""
  ].join(" ").toLowerCase();
  if (/search|find|鎼滅储|鏌ユ壘/.test(haystack)) return "search";
  if (/new|add|create|plus|compose|新建|添加|新增/.test(haystack)) return "plus";
  if (/more|ellipsis|更多/.test(haystack)) return "more";
  if (/folder|project|文件夹|项目/.test(haystack)) return "folder";
  if (/mic|voice|audio|听写|语音/.test(haystack)) return "mic";
  if (/sidebar|side bar|panel|边栏|侧边/.test(haystack)) return "sidebar";
  if (/edit|pencil|write|compose|pen|编辑|书写/.test(haystack)) return "edit";
  if (/globe|web|earth|language|translate|联网|语言|翻译/.test(haystack)) return "globe";
  if (/send|submit|arrow-up|arrow up|upload|发送|提交|上传/.test(haystack)) return "send";
  if (/library|archive|books|database|库|资料/.test(haystack)) return "library";
  if (/code|terminal|command|developer|代码|终端/.test(haystack)) return "code";
  if (/chevron|caret|dropdown|expand|collapse|展开|收起/.test(haystack)) return "chevron";
  return "generic";
}

function applyReplicaTextAlignment(node, styles) {
  try {
    if (styles.textAlign === "center") node.textAlignHorizontal = "CENTER";
    if (styles.textAlign === "right" || styles.textAlign === "end") node.textAlignHorizontal = "RIGHT";
  } catch (error) {
    // Text alignment is best-effort.
  }
}

function positionReplicaNode(node, sourceNode, frameSize) {
  const bounds = sourceNode.bounds || {};
  const x = clamp(Math.round(Number(bounds.x) || 0), -2000, frameSize.width);
  const y = clamp(Math.round(Number(bounds.y) || 0), -2000, frameSize.height);
  node.x = x;
  node.y = y;
}

function replicaNodeName(sourceNode, fallback) {
  const tag = String(sourceNode.tag || fallback || "node").toLowerCase();
  const role = sourceNode.role ? ` ${sourceNode.role}` : "";
  const snippet = replicaVisibleText(sourceNode) ? ` / ${truncate(replicaVisibleText(sourceNode), 36)}` : "";
  return `Replica ${tag}${role}${snippet} / ${sourceNode.id || "node"}`;
}

function setReplicaTrace(node, sourceNode) {
  const trace = [
    "page screenshot reference trace",
    `snapshot id: ${sourceNode.id || "unknown"}`,
    `parent id: ${sourceNode.parentId || "none"}`,
    `tag: ${sourceNode.tag || "unknown"}`,
    `role: ${sourceNode.role || "none"}`,
    `visible text: ${truncate(replicaVisibleText(sourceNode), 160)}`,
    `accessible text: ${truncate(sourceNode.text || sourceNode.alt || "", 160)}`,
    `text source: ${sourceNode.textSource || "unknown"}`,
    "origin: observed DOM/CSS snapshot; editable reconstruction may be inferred"
  ].join("\n");
  try {
    node.description = trace;
  } catch (error) {
    // Most regular scene nodes do not expose a visible description field.
  }
  try {
    node.setPluginData("replicaTrace", trace);
  } catch (error) {
    // Trace metadata is best-effort.
  }
}

function setReplicaLineHeight(node, value) {
  const lineHeight = Number(value);
  if (!lineHeight || lineHeight <= 0) return;
  try {
    node.lineHeight = { unit: "PIXELS", value: lineHeight };
  } catch (error) {
    // Older runtimes may reject explicit line heights.
  }
}

function replicaFontStyle(weight) {
  const numeric = Number(String(weight || "").replace(/[^0-9.]/g, ""));
  if (numeric >= 700) return "Bold";
  if (numeric >= 600) return "Semi Bold";
  if (numeric >= 500) return "Medium";
  return "Regular";
}

function replicaTextWidth(value, boundsWidth, fontSize) {
  const estimated = estimateTextWidth(value || "", fontSize || 12) + 10;
  return clamp(Math.max(Number(boundsWidth) || 0, estimated, 8), 8, 720);
}

function parseReplicaRadius(value) {
  return clamp(parseFloat(String(value || "0")) || 0, 0, 160);
}

function parseReplicaBorderWidth(value) {
  return clamp(parseFloat(String(value || "0")) || 0, 0, 12);
}

function isVisibleReplicaColor(value) {
  if (!value || value === "transparent") return false;
  const normalized = normalizeHex(value);
  if (normalized === "000000" && String(value).indexOf("#") !== 0) return false;
  return hexOpacity(value) > 0.02;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function localizedPageLabel(number, en, zh) {
  if (outputLanguage === "en") return `${number} ${en}`;
  if (outputLanguage === "zh") return `${number} ${zh}`;
  return `${number} ${zh} ${en}`;
}

async function getOrCreateDesignerPage(name) {
  const pageName = `RDS ${name}`;
  for (const page of figma.root.children) {
    if (page.name === pageName) {
      await figma.setCurrentPageAsync(page);
      removeExistingGeneratedNodes(page, "");
      return page;
    }
  }
  const page = figma.createPage();
  page.name = pageName;
  await figma.setCurrentPageAsync(page);
  return page;
}

function createLibraryRoot(page, name, introText) {
  const root = figma.createFrame();
  root.name = name;
  markGeneratedNode(root);
  root.layoutMode = "VERTICAL";
  root.itemSpacing = 32;
  root.paddingTop = 48;
  root.paddingRight = 48;
  root.paddingBottom = 48;
  root.paddingLeft = 48;
  root.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  root.resize(1400, 1000);
  setVerticalAutoHeight(root);
  page.appendChild(root);

  const title = text(name, 28, "Semi Bold", "#111111");
  resizeTextBlock(title, 1200, 40);
  root.appendChild(title);
  const intro = text(introText || "", 13, "Regular", "#555555");
  resizeTextBlock(intro, 1200, 44);
  root.appendChild(intro);
  return root;
}

function removeExistingGeneratedNodes(page, name) {
  const children = page.children.slice();
  for (const child of children) {
    if (isGeneratedNode(child, name) || isLegacyGeneratedNode(child, name)) {
      child.remove();
    }
  }
}

function isGeneratedNode(node, name) {
  if (node.name === name) return true;
  try {
    return node.getPluginData("generatedBy") === GENERATED_BY;
  } catch (error) {
    return false;
  }
}

function isLegacyGeneratedNode(node, name) {
  if (node.name === name) return true;
  if (node.name.indexOf("Reverse UI Kit Draft - ") === 0) return true;
  if (node.name.indexOf("Reverse Design System Draft - ") === 0) return true;
  if (node.type === "COMPONENT" && node.name.indexOf("/State=") >= 0) return true;
  return isLegacyVariantSampleName(node.name);
}

function isLegacyVariantSampleName(name) {
  const parts = String(name || "").split(" / ");
  if (parts.length !== 4) return false;
  return orderValue(parts[1].trim(), "state") < 99 && orderValue(parts[2].trim(), "size") < 99 && orderValue(parts[3].trim(), "tone") < 99;
}

function markGeneratedTree(node) {
  markGeneratedNode(node);
  if (!node.children) return;
  for (const child of node.children) {
    markGeneratedTree(child);
  }
}

function markGeneratedNode(node) {
  try {
    node.setPluginData("generatedBy", GENERATED_BY);
  } catch (error) {
    // Some generated helper nodes may not support plugin data in older runtimes.
  }
}

function removeGeneratedOrphanNodes(page, root) {
  const children = page.children.slice();
  for (const child of children) {
    if (child !== root && (isGeneratedNode(child, "") || isLegacyGeneratedNode(child, ""))) {
      child.remove();
    }
  }
}

const COPY = {
  imported: { en: "Design system draft imported.", zh: "设计系统草稿已导入。", bilingual: "设计系统草稿已导入 / Design system draft imported." },
  overview: { en: "Overview", zh: "概览", bilingual: "概览 / Overview" },
  draftTitle: { en: "Reverse Design System Draft", zh: "逆向设计系统草稿", bilingual: "逆向设计系统草稿 / Reverse Design System Draft" },
  overviewNote: { en: "This file is an auditable reverse-engineering draft. Raw values come from computed CSS; semantic names and variants are inferred and require design review.", zh: "这是可审计的逆向设计系统草稿。原始值来自页面计算样式，语义命名与变体为推断结果，需要设计师复核。", bilingual: "这是可审计的逆向设计系统草稿。原始值来自页面计算样式，语义命名与变体为推断结果，需要设计师复核。 / This file is an auditable reverse-engineering draft. Raw values come from computed CSS; semantic names and variants are inferred and require design review." },
  semanticColors: { en: "Semantic Tokens / Colors", zh: "语义颜色 Token", bilingual: "语义颜色 Token / Semantic Tokens" },
  rawColors: { en: "Raw Tokens / Colors", zh: "原始颜色 Token", bilingual: "原始颜色 Token / Raw Tokens" },
  colorIntroSemantic: { en: "Semantic names are inferred from raw CSS colors. Aliases preserve source token names for traceability.", zh: "语义名称由原始 CSS 颜色推断，别名保留来源名称以便追踪。", bilingual: "语义名称由原始 CSS 颜色推断，别名保留来源名称以便追踪。 / Semantic names are inferred from raw CSS colors. Aliases preserve source token names for traceability." },
  colorIntroRaw: { en: "Raw color values are direct computed CSS observations.", zh: "原始颜色值直接来自页面计算样式。", bilingual: "原始颜色值直接来自页面计算样式。 / Raw color values are direct computed CSS observations." },
  typography: { en: "Typography", zh: "字体", bilingual: "字体 / Typography" },
  radii: { en: "Radii", zh: "圆角", bilingual: "圆角 / Radii" },
  spacingPreview: { en: "Spacing Preview", zh: "间距预览", bilingual: "间距预览 / Spacing Preview" },
  spacingIntro: { en: "Cards show the actual spacing value. Raw values remain visible.", zh: "卡片展示实际间距值，并保留原始数值。", bilingual: "卡片展示实际间距值，并保留原始数值。 / Cards show the actual spacing value. Raw values remain visible." },
  shadowPreview: { en: "Shadow Preview", zh: "阴影预览", bilingual: "阴影预览 / Shadow Preview" },
  shadowIntro: { en: "Each card keeps the semantic name, raw CSS box-shadow value, usage count, and a live surface with that shadow applied.", zh: "每张卡片保留语义名称、原始 CSS 阴影、使用次数和实时阴影预览。", bilingual: "每张卡片保留语义名称、原始 CSS 阴影、使用次数和实时阴影预览。 / Each card keeps the semantic name, raw CSS box-shadow value, usage count, and a live surface with that shadow applied." },
  assets: { en: "Assets / Icons", zh: "资源 / 图标", bilingual: "资源 / 图标 / Assets" },
  importQa: { en: "Import QA Summary", zh: "导入质量检查", bilingual: "导入质量检查 / Import QA" },
  specReview: { en: "Specification Review / Promotion Workflow", zh: "规范复核 / 晋升流程", bilingual: "规范复核 / Promotion Workflow" },
  specIntro: { en: "This section summarizes what exists in the draft and what still needs human review before promotion.", zh: "这里汇总草稿中已生成的内容，以及晋升为正式规范前仍需人工复核的部分。", bilingual: "这里汇总草稿中已生成的内容，以及晋升为正式规范前仍需人工复核的部分。 / This section summarizes what exists in the draft and what still needs human review before promotion." },
  componentDrafts: { en: "Component Drafts / Needs Review", zh: "组件草稿 / 待复核", bilingual: "组件草稿 / Component Drafts" },
  componentDraftsIntro: { en: "Draft previews are generated from sampled DOM/CSS traces. They are review candidates, not final production components.", zh: "组件预览来自采样 DOM/CSS 追踪，是待复核候选，不是最终生产组件。", bilingual: "组件预览来自采样 DOM/CSS 追踪，是待复核候选，不是最终生产组件。 / Draft previews are generated from sampled DOM/CSS traces." },
  componentCandidates: { en: "Component Candidates / Inferred Variants", zh: "组件候选 / 推断变体", bilingual: "组件候选 / Inferred Variants" },
  componentCandidatesIntro: { en: "Automatically inferred from DOM tag, role, class names, dimensions, visual styles, and repeated patterns.", zh: "根据 DOM 标签、角色、类名、尺寸、视觉样式和重复模式自动推断。", bilingual: "根据 DOM 标签、角色、类名、尺寸、视觉样式和重复模式自动推断。 / Automatically inferred from DOM tag, role, class names, dimensions, visual styles, and repeated patterns." },
  quickStart: { en: "Quick Start / Designer Usage", zh: "快速开始 / 设计师使用", bilingual: "快速开始 / Designer Usage" },
  quickStartIntro: { en: "Use this draft as a reusable UI kit. Copy component samples from the sheets, then refine names, variants, and tokens manually as needed.", zh: "将这份草稿作为可复用 UI Kit 使用。可以复制组件样张，再按需手动整理命名、变体和 Token。", bilingual: "将这份草稿作为可复用 UI Kit 使用。可以复制组件样张，再按需手动整理命名、变体和 Token。 / Use this draft as a reusable UI kit." },
  componentInventory: { en: "Component Inventory", zh: "组件清单", bilingual: "组件清单 / Component Inventory" },
  componentInventoryIntro: { en: "A scan-friendly inventory grouped by inferred component category.", zh: "按推断组件类别整理的可快速浏览清单。", bilingual: "按推断组件类别整理的可快速浏览清单。 / A scan-friendly inventory grouped by inferred component category." },
  componentSheets: { en: "Component Sheets", zh: "组件样张", bilingual: "组件样张 / Component Sheets" },
  componentSheetsIntro: { en: "Copy-ready samples grouped by component type. These are inferred visual drafts.", zh: "按组件类型分组的可复制样张，仍属于推断视觉草稿。", bilingual: "按组件类型分组的可复制样张，仍属于推断视觉草稿。 / Copy-ready samples grouped by component type." },
  coreComponentSets: { en: "Core Component Sets", zh: "核心组件集", bilingual: "核心组件集 / Core Component Sets" },
  coreComponentSetsIntro: { en: "Best-effort component sets generated from inferred variants; designer cleanup is still required.", zh: "根据推断变体生成的组件集草稿，仍需要设计师清理和确认。", bilingual: "根据推断变体生成的组件集草稿，仍需要设计师清理和确认。 / Best-effort component sets generated from inferred variants." },
  pagePatterns: { en: "Page Patterns / Experimental", zh: "页面模式 / 实验", bilingual: "页面模式 / Page Patterns" },
  pagePatternsIntro: { en: "These patterns are inferred from sampled components and spatial/DOM traces. They are review candidates, not exact page reconstruction.", zh: "这些模式由组件采样和空间/DOM 追踪推断，是待复核候选，不是精确页面还原。", bilingual: "这些模式由组件采样和空间/DOM 追踪推断，是待复核候选，不是精确页面还原。 / These patterns are inferred from sampled traces." },
  warnings: { en: "Warnings / Known Issues", zh: "警告 / 已知问题", bilingual: "警告 / Known Issues" },
  warningsIntro: { en: "Warnings guide review and do not block generation.", zh: "警告用于指导复核，不会阻止生成。", bilingual: "警告用于指导复核，不会阻止生成。 / Warnings guide review and do not block generation." },
  noWarnings: { en: "No warnings were detected. This does not mean production-ready; review is still required.", zh: "未检测到警告，但这不代表已经可用于生产，仍需要复核。", bilingual: "未检测到警告，但这不代表已经可用于生产，仍需要复核。 / No warnings were detected. Review is still required." },
  nextStep: { en: "Next step", zh: "下一步", bilingual: "下一步 / Next step" },
  surface: { en: "surface", zh: "界面层", bilingual: "界面层 / surface" },
  sampleText: { en: "The quick brown fox / Design system sample", zh: "设计系统字体样例", bilingual: "设计系统字体样例 / Design system sample" },
  clipWarning: { en: "label may be clipped by source dimensions", zh: "标签可能受来源尺寸裁切", bilingual: "标签可能受来源尺寸裁切 / label may be clipped" }
};

const LOCAL_COPY = COPY;
function copy(key) {
  const item = LOCAL_COPY[key] || COPY[key];
  if (!item) return key;
  return item[outputLanguage] || item.bilingual || item.en || key;
}

function l(en, zh, bilingual) {
  if (outputLanguage === "zh") return zh;
  if (outputLanguage === "en") return en;
  return bilingual || `${zh} / ${en}`;
}

function fieldLabel(key) {
  const labels = {
    alias: ["alias", "别名"], category: ["category", "类别"], name: ["name", "名称"], rawTag: ["raw tag", "原始标签"],
    instances: ["instances", "实例"], states: ["states", "状态"], state: ["State", "状态"], size: ["Size", "尺寸"], tone: ["Tone", "色调"],
    confidence: ["confidence", "置信度"], status: ["status", "状态"], sourceIds: ["source IDs", "来源 ID"], source: ["source", "来源"],
    component: ["component", "组件"], tokens: ["tokens", "Token"], review: ["review", "复核"], warnings: ["warnings", "警告"],
    children: ["children", "子节点"], variants: ["variants", "变体"], visualEvidence: ["visual evidence", "视觉证据"],
    layoutRole: ["layout role", "布局角色"], sourceType: ["source type", "来源类型"]
  };
  const pair = labels[key] || [key, key];
  return l(pair[0], pair[1], `${pair[1]} / ${pair[0]}`);
}

function usesLabel() {
  return l("uses", "使用", "使用 / uses");
}

function categoryLabel(value) {
  const labels = {
    button: ["Button", "按钮"],
    "text-input": ["Text Input", "文本输入"],
    select: ["Select", "选择器"],
    tab: ["Tab", "标签页"],
    "menu-item": ["Menu Item", "菜单项"],
    link: ["Link", "链接"],
    navigation: ["Navigation", "导航"],
    card: ["Card", "卡片"],
    checkbox: ["Checkbox", "复选框"],
    radio: ["Radio", "单选框"],
    switch: ["Switch", "开关"],
    tag: ["Tag / Badge", "标签 / 徽标"],
    breadcrumb: ["Breadcrumb", "面包屑"],
    "form-field": ["Form Field", "表单字段"],
    other: ["Other", "其他"]
  };
  const pair = labels[value] || [titleCase(value || "unknown"), titleCase(value || "unknown")];
  return l(pair[0], pair[1], `${pair[1]} / ${pair[0]}`);
}

function stateLabel(value) {
  const labels = {
    default: ["Default", "默认"],
    open: ["Open", "展开"],
    hover: ["Hover", "悬停"],
    active: ["Active", "按下"],
    focus: ["Focus", "聚焦"],
    selected: ["Selected", "选中"],
    disabled: ["Disabled", "禁用"]
  };
  const key = String(value || "unknown");
  const pair = labels[key] || [titleCase(key), titleCase(key)];
  return l(pair[0], pair[1], `${pair[1]} / ${pair[0]}`);
}

function localizedStateList(values) {
  return (values || []).map(stateLabel).join(", ");
}

function statusLabel(value) {
  const labels = {
    candidate: ["candidate", "候选"],
    "needs-review": ["needs review", "待复核"],
    accepted: ["accepted", "已接受"],
    rejected: ["rejected", "已拒绝"],
    deprecated: ["deprecated", "已废弃"],
    "draft-needs-review": ["draft needs review", "草稿待复核"],
    "inferred-needs-review": ["inferred needs review", "推断待复核"],
    missing: ["missing", "缺失"],
    partial: ["partial", "部分完成"],
    "not-checked": ["not checked", "未检查"]
  };
  const key = String(value || "");
  const pair = labels[key] || [key, key];
  return l(pair[0], pair[1], `${pair[1]} / ${pair[0]}`);
}

function warningTypeLabel(value) {
  const labels = {
    "zero-size-node": ["zero-size node", "零尺寸节点"],
    "clipped-content": ["clipped content", "内容被裁切"],
    "low-contrast": ["low contrast", "低对比度"],
    "source-background-may-be-missing": ["source background may be missing", "来源背景可能缺失"],
    "inferred-state": ["inferred state", "推断状态"],
    "external-sprite-reference": ["external sprite reference", "外部 sprite 引用"]
  };
  const key = String(value || "warning");
  const pair = labels[key] || [key, key];
  return l(pair[0], pair[1], `${pair[1]} / ${pair[0]}`);
}
function createOverviewSection(parent, data, isNormalized) {
  const source = data.source || {};
  const trace = data.trace || {};
  const stats = data.stats || trace.rawStats || {};
  const components = data.components || data.componentModel || [];
  const assets = data.assets || data.assetCatalog || [];
  const frame = sectionFrame(copy("overview"));
  parent.appendChild(frame);

  const title = text(copy("draftTitle"), 28, "Semi Bold", "#111111");
  frame.appendChild(title);

  const url = text(`${source.title || "Untitled page"} | ${source.url || ""}`, 13, "Regular", "#666666");
  frame.appendChild(url);

  const meta = text(
    overviewMeta(stats, components, assets, isNormalized),
    13,
    "Regular",
    "#666666"
  );
  frame.appendChild(meta);

  const note = text(copy("overviewNote"), 13, "Regular", "#333333");
  resizeTextBlock(note, 1120, 44);
  frame.appendChild(note);
}

function overviewMeta(stats, components, assets, isNormalized) {
  const en = `${stats.scannedElements || 0} elements scanned | ${components.length || 0} component candidates | ${assets.length || 0} assets | ${isNormalized ? "semantic normalization applied" : "raw extraction only"}`;
  const zh = `扫描 ${stats.scannedElements || 0} 个元素 | ${components.length || 0} 个组件候选 | ${assets.length || 0} 个资源 | ${isNormalized ? "已应用语义规范化" : "仅原始采集"}`;
  if (outputLanguage === "zh") return zh;
  if (outputLanguage === "en") return en;
  return `${zh} / ${en}`;
}

function createAssetCreationSummarySection(parent) {
  const summary = assetCreationSummary || {};
  const frame = sectionFrame(l("Variables / Styles Created", "已创建变量 / 样式", "已创建变量 / 样式 / Variables & Styles"));
  parent.appendChild(frame);
  const intro = text(l("Figma assets created from observed or explicitly generated tokens. Generated colors remain named and labeled separately in the Foundations page.", "根据 observed 或明确 generated 的 Token 创建 Figma 变量与样式。生成色板会保留独立来源标记。", "根据 observed 或明确 generated 的 Token 创建 Figma 变量与样式。生成色板会保留独立来源标记。 / Figma assets created from observed or explicitly generated tokens."), 12, "Regular", "#555555");
  resizeTextBlock(intro, 1120, 44);
  frame.appendChild(intro);

  const row = figma.createFrame();
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  setHorizontalAutoHeight(row);
  row.appendChild(assetSummaryPill(l("Color variables", "颜色变量", "颜色变量 / Color variables"), summary.colorVariables || 0));
  row.appendChild(assetSummaryPill(l("Number variables", "数值变量", "数值变量 / Number variables"), summary.numberVariables || 0));
  row.appendChild(assetSummaryPill(l("Text styles", "文本样式", "文本样式 / Text styles"), summary.textStyles || 0));
  row.appendChild(assetSummaryPill(l("Effect styles", "效果样式", "效果样式 / Effect styles"), summary.effectStyles || 0));
  frame.appendChild(row);
}

function assetSummaryPill(label, value) {
  const pill = figma.createFrame();
  pill.layoutMode = "VERTICAL";
  pill.itemSpacing = 4;
  pill.paddingTop = 12;
  pill.paddingRight = 14;
  pill.paddingBottom = 12;
  pill.paddingLeft = 14;
  pill.cornerRadius = 8;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#f8fafc") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#e2e8f0") }];
  pill.resize(180, 64);
  pill.appendChild(text(String(value), 18, "Semi Bold", "#111111"));
  const labelNode = text(label, 10, "Regular", "#555555");
  labelNode.resize(150, 18);
  pill.appendChild(labelNode);
  return pill;
}

function normalizedTokens(semanticTokens) {
  return {
    colors: semanticTokens.colors || [],
    typography: semanticTokens.typography || [],
    spacing: semanticTokens.spacing || [],
    radii: semanticTokens.radii || [],
    shadows: semanticTokens.shadows || [],
    opacity: semanticTokens.opacity || [],
    borderWidths: semanticTokens.borderWidths || semanticTokens.borderWidth || []
  };
}

function draftComponentsFromModel(models) {
  return models.map((model, index) => {
    const variants = model.variants || {};
    const states = variants.state || ["default"];
    return {
      id: `semantic-component-${index + 1}`,
      name: componentDisplayName(model),
      displayName: componentDisplayName(model),
      semanticName: model.semanticName || model.name || "",
      namingRationale: model.namingRationale || "",
      category: model.category,
      signature: model.sourceComponentIds ? model.sourceComponentIds.join("|") : "",
      count: model.sourceComponentIds ? model.sourceComponentIds.length : 1,
      states,
      assets: model.assets || [],
      examples: model.examples || []
    };
  });
}

async function createDesignAssets(data, tokens) {
  const summary = {
    colorVariables: 0,
    numberVariables: 0,
    textStyles: 0,
    effectStyles: 0
  };
  const collection = createVariableCollection("Reverse tokens");
  if (collection) {
    summary.colorVariables = createColorVariablesInCollection(collection, collectColorVariableTokens(data, tokens));
    summary.numberVariables += createNumberVariablesInCollection(collection, tokens.spacing || [], "space", "raw/spacing");
    summary.numberVariables += createNumberVariablesInCollection(collection, tokens.radii || [], "radius", "raw/radius");
    summary.numberVariables += createNumberVariablesInCollection(collection, tokens.opacity || [], "opacity", "raw/opacity");
    summary.numberVariables += createNumberVariablesInCollection(collection, tokens.borderWidths || tokens.borderWidth || [], "border-width", "raw/border-width");
  }
  summary.textStyles = createTextStyles(tokens.typography || []);
  summary.effectStyles = createEffectStyles(tokens.shadows || []);
  return summary;
}

async function createColorVariables(colors) {
  const collection = createVariableCollection("Reverse primitives");
  if (!collection) return;
  createColorVariablesInCollection(collection, colors || []);
}

function createVariableCollection(name) {
  if (!figma.variables || !figma.variables.createVariableCollection) return null;
  try {
    return figma.variables.createVariableCollection(name);
  } catch (error) {
    return null;
  }
}

function createColorVariablesInCollection(collection, colors) {
  const modeId = collection.modes && collection.modes[0] && collection.modes[0].modeId;
  if (!modeId) return 0;
  let count = 0;
  for (const color of (colors || []).slice(0, 160)) {
    try {
      const variable = figma.variables.createVariable(safeVariableName(color.name), collection, "COLOR");
      variable.setValueForMode(modeId, hexToRgba(color.value));
      count += 1;
    } catch (error) {
      // Duplicate or invalid names are non-fatal in this draft importer.
    }
  }
  return count;
}

function createNumberVariablesInCollection(collection, tokens, prefix, fallbackPrefix) {
  const modeId = collection.modes && collection.modes[0] && collection.modes[0].modeId;
  if (!modeId) return 0;
  let count = 0;
  for (const token of (tokens || []).slice(0, 120)) {
    const value = Number(token.value);
    if (isNaN(value)) continue;
    try {
      const fallbackValue = String(token.sourceValue || token.value).replace(/[^a-z0-9._-]/gi, "-");
      const name = token.name || `${fallbackPrefix}/${fallbackValue}`;
      const variable = figma.variables.createVariable(safeVariableName(name), collection, "FLOAT");
      variable.setValueForMode(modeId, value);
      count += 1;
    } catch (error) {
      // Duplicate or unsupported variable names are non-fatal.
    }
  }
  return count;
}

function collectColorVariableTokens(data, tokens) {
  const map = {};
  for (const color of (tokens.colors || [])) {
    if (color && color.value) map[color.name || color.value] = color;
  }
  for (const group of (data.primitiveColorModel || [])) {
    for (const color of (group.colors || [])) {
      if (color && color.value) map[color.name || color.value] = color;
    }
  }
  return Object.values(map);
}

function createTextStyles(types) {
  if (!figma.createTextStyle) return 0;
  let count = 0;
  for (const type of (types || []).slice(0, 64)) {
    try {
      const style = figma.createTextStyle();
      style.name = safeStyleName(type.name || `type/${count + 1}`);
      style.fontName = { family: "Inter", style: fontStyleFromWeight(type.fontWeight) };
      style.fontSize = Number(type.fontSize) || 14;
      style.lineHeight = { unit: "PIXELS", value: Number(type.lineHeight) || Math.round((Number(type.fontSize) || 14) * 1.3) };
      style.letterSpacing = { unit: "PIXELS", value: Number(type.letterSpacing) || 0 };
      count += 1;
    } catch (error) {
      // Keep importing even when a font/style cannot be created.
    }
  }
  return count;
}

function createEffectStyles(shadows) {
  if (!figma.createEffectStyle) return 0;
  let count = 0;
  for (const shadow of (shadows || []).slice(0, 32)) {
    const effects = parseBoxShadow(shadow.value || "");
    if (!effects.length) continue;
    try {
      const style = figma.createEffectStyle();
      style.name = safeStyleName(shadow.name || `shadow/${count + 1}`);
      style.effects = effects;
      count += 1;
    } catch (error) {
      // Unsupported shadow values are documented in the draft but skipped as styles.
    }
  }
  return count;
}

function fontStyleFromWeight(value) {
  const weight = Number(value) || 400;
  if (weight >= 650) return "Bold";
  if (weight >= 550) return "Semi Bold";
  if (weight >= 450) return "Medium";
  return "Regular";
}

function safeStyleName(name) {
  return String(name || "").replace(/[^a-z0-9/_ -]/gi, "-");
}

function createColorSection(parent, colors, isNormalized) {
  const frame = sectionFrame(isNormalized ? copy("semanticColors") : copy("rawColors"));
  parent.appendChild(frame);

  const intro = text(isNormalized ? copy("colorIntroSemantic") : copy("colorIntroRaw"), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 28);
  frame.appendChild(intro);

  const groups = colorPrimitiveGroups(colors.slice(0, 120));
  for (const group of groups.slice(0, 12)) {
    frame.appendChild(colorPrimitiveRow(group));
  }
}

function createColorSystemSections(parent, data, tokens, isNormalized) {
  const primitiveModel = data.primitiveColorModel || [];
  const semanticModel = data.semanticColorModel || [];
  const interactiveModel = data.interactiveColorModel || [];
  if (isNormalized && (primitiveModel.length || semanticModel.length || interactiveModel.length)) {
    createPrimitiveColorModelSection(parent, primitiveModel, tokens.colors || []);
    createSemanticColorModelSection(parent, semanticModel);
    createInteractiveColorModelSection(parent, interactiveModel);
    return;
  }
  createColorSection(parent, tokens.colors || [], isNormalized);
}

function createPrimitiveColorModelSection(parent, model, fallbackColors) {
  const frame = sectionFrame(l("Primitives", "Primitives", "Primitives"));
  parent.appendChild(frame);
  const intro = text(l("Raw colors are observed computed CSS values. Observed primitives are clustered from those values. Generated palette steps are explicitly marked and were not observed on the page.", "Raw colors are observed computed CSS values. Observed primitives are clustered from those values. Generated palette steps are explicitly marked and were not observed on the page.", "Raw colors are observed computed CSS values. Observed primitives are clustered from those values. Generated palette steps are explicitly marked and were not observed on the page."), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 44);
  frame.appendChild(intro);

  const groups = model.length ? model : colorPrimitiveGroups((fallbackColors || []).slice(0, 120));
  frame.appendChild(text(l("Raw Colors", "Raw Colors", "Raw Colors"), 14, "Semi Bold", "#111111"));
  for (const group of colorPrimitiveGroups((fallbackColors || []).slice(0, 120)).slice(0, 10)) {
    frame.appendChild(colorPrimitiveRow(group));
  }

  frame.appendChild(text(l("Observed Primitives", "Observed Primitives", "Observed Primitives"), 14, "Semi Bold", "#111111"));
  for (const group of groups.slice(0, 14)) {
    const observed = filterPrimitiveGroupByOrigin(group, "observed");
    if (observed.colors.length) frame.appendChild(colorPrimitiveModelRow(observed));
  }

  const generatedGroups = [];
  for (const group of groups.slice(0, 14)) {
    const generated = filterPrimitiveGroupByOrigin(group, "generated");
    if (generated.colors.length) generatedGroups.push(generated);
  }
  if (generatedGroups.length) {
    frame.appendChild(text(l("Generated Palette", "Generated Palette", "Generated Palette"), 14, "Semi Bold", "#111111"));
    for (const group of generatedGroups) {
      frame.appendChild(colorPrimitiveModelRow(group));
    }
  }
}

function filterPrimitiveGroupByOrigin(group, origin) {
  const filtered = { family: group.family || "other", colors: [] };
  for (const color of group.colors || []) {
    const token = color.color || color;
    if ((token.origin || "observed") === origin) filtered.colors.push(token);
  }
  return filtered;
}

function colorPrimitiveModelRow(group) {
  const mapped = { family: group.family || "other", colors: [] };
  for (const color of (group.colors || []).slice(0, 32)) {
    mapped.colors.push({ color, scale: color.scale || "" });
  }
  return colorPrimitiveRow(mapped);
}

function createSemanticColorModelSection(parent, model) {
  const frame = sectionFrame(l("Semantic Colors", "Semantic Colors", "Semantic Colors"));
  parent.appendChild(frame);
  const intro = text(l("Inferred usage colors grouped by role domain. Context, state, raw value, and source trace remain visible for review.", "Inferred usage colors grouped by role domain. Context, state, raw value, and source trace remain visible for review.", "Inferred usage colors grouped by role domain. Context, state, raw value, and source trace remain visible for review."), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 44);
  frame.appendChild(intro);

  for (const group of (model || []).slice(0, 8)) {
    frame.appendChild(semanticColorGroupRow(group));
  }
}

function semanticColorGroupRow(group) {
  const row = figma.createFrame();
  row.name = `${group.group || "Misc"} semantic colors`;
  row.layoutMode = "VERTICAL";
  row.itemSpacing = 8;
  row.fills = [];
  row.resize(1120, 1);
  setVerticalAutoHeight(row);
  row.appendChild(text(group.group || "Misc", 13, "Semi Bold", "#111111"));

  const grid = figma.createFrame();
  grid.name = "semantic color cards";
  grid.layoutMode = "HORIZONTAL";
  grid.layoutWrap = "WRAP";
  grid.itemSpacing = 10;
  grid.counterAxisSpacing = 10;
  grid.fills = [];
  grid.resize(1120, 1);
  setWrappedAutoHeight(grid);
  row.appendChild(grid);

  for (const token of (group.tokens || []).slice(0, 18)) {
    grid.appendChild(semanticColorCard(token));
  }
  return row;
}

function semanticColorCard(token) {
  const card = figma.createFrame();
  card.name = token.name || token.value || "semantic color";
  card.layoutMode = "HORIZONTAL";
  card.itemSpacing = 10;
  card.counterAxisAlignItems = "CENTER";
  card.paddingTop = 10;
  card.paddingRight = 10;
  card.paddingBottom = 10;
  card.paddingLeft = 10;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: hexToRgb("#fafafa") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#eeeeee") }];
  card.resize(350, 74);

  const swatch = figma.createRectangle();
  swatch.name = token.sourceValue || token.value || "";
  swatch.resize(48, 48);
  swatch.cornerRadius = 6;
  swatch.fills = [{ type: "SOLID", color: hexToRgb(token.value), opacity: hexOpacity(token.value) }];
  card.appendChild(swatch);

  const content = figma.createFrame();
  content.layoutMode = "VERTICAL";
  content.itemSpacing = 4;
  content.fills = [];
  content.resize(270, 54);
  content.appendChild(text(truncate(token.name || token.role || token.value, 38), 11, "Medium", "#111111"));
  content.appendChild(text(`${fieldLabel("state")}: ${stateLabel(token.state || "default")} | context: ${token.context || "general"}`, 9, "Regular", "#555555"));
  content.appendChild(text(`${token.sourceValue || token.value} | ${token.count || 0} ${usesLabel()}`, 9, "Regular", "#777777"));
  card.appendChild(content);
  return card;
}

function createInteractiveColorModelSection(parent, model) {
  const frame = sectionFrame(l("Interactive Colors", "Interactive Colors", "Interactive Colors"));
  parent.appendChild(frame);
  const intro = text(l("Only actively observed state colors render as swatches. Missing states are marked not observed and do not create token-looking color blocks.", "Only actively observed state colors render as swatches. Missing states are marked not observed and do not create token-looking color blocks.", "Only actively observed state colors render as swatches. Missing states are marked not observed and do not create token-looking color blocks."), 12, "Regular", "#666666");
  resizeTextBlock(intro, 1120, 44);
  frame.appendChild(intro);

  const states = ["default", "hover", "inactive", "press", "selected"];
  frame.appendChild(interactiveHeaderRow(states));
  for (const group of (model || []).slice(0, 10)) {
    frame.appendChild(interactiveColorRow(group, states));
  }
}

function interactiveHeaderRow(states) {
  const row = figma.createFrame();
  row.name = "interactive color states header";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 8;
  row.counterAxisAlignItems = "CENTER";
  row.fills = [];
  row.resize(1120, 24);
  const label = text("group", 10, "Semi Bold", "#555555");
  label.resize(150, 16);
  row.appendChild(label);
  for (const state of states) {
    const item = text(stateLabel(state), 10, "Semi Bold", "#555555");
    item.resize(110, 16);
    row.appendChild(item);
  }
  return row;
}

function interactiveColorRow(group, states) {
  const row = figma.createFrame();
  row.name = `${group.group || "interactive"} colors`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 8;
  row.counterAxisAlignItems = "CENTER";
  row.fills = [];
  row.resize(1120, 56);

  const label = text(group.group || "interactive", 12, "Semi Bold", "#111111");
  label.resize(150, 18);
  row.appendChild(label);

  for (const state of states) {
    row.appendChild(interactiveStateCell(findInteractiveStateToken(group.states || [], state), state));
  }
  return row;
}

function findInteractiveStateToken(tokens, state) {
  for (const token of tokens || []) {
    if ((token.state || "default") === state) return token;
  }
  return null;
}

function interactiveStateCell(token, state) {
  const cell = figma.createFrame();
  cell.name = state;
  cell.layoutMode = "VERTICAL";
  cell.itemSpacing = 4;
  cell.fills = [];
  cell.resize(110, 50);

  if (token) {
    const swatch = figma.createRectangle();
    swatch.resize(96, 24);
    swatch.cornerRadius = 6;
    swatch.fills = [{ type: "SOLID", color: hexToRgb(token.value), opacity: hexOpacity(token.value) }];
    cell.appendChild(swatch);
    const label = text(truncate(token.sourceValue || token.value, 13), 9, "Regular", "#555555");
    label.resize(104, 12);
    cell.appendChild(label);
    const source = text(truncate(token.stateSource || "observed", 18), 8, "Regular", "#777777");
    source.resize(104, 10);
    cell.appendChild(source);
  } else {
    const missing = text("not observed", 9, "Regular", "#999999");
    missing.resize(104, 24);
    cell.appendChild(missing);
  }
  return cell;
}

function colorPrimitiveGroups(colors) {
  const map = {};
  for (const color of colors || []) {
    const info = colorPrimitiveInfo(color);
    if (!map[info.family]) {
      map[info.family] = { family: info.family, colors: [] };
    }
    map[info.family].colors.push({ color, scale: info.scale });
  }
  const groups = Object.values(map);
  for (const group of groups) {
    group.colors.sort((a, b) => colorScaleWeight(a.scale) - colorScaleWeight(b.scale) || String(a.color.name || "").localeCompare(String(b.color.name || "")));
  }
  return groups.sort((a, b) => colorFamilyWeight(a.family) - colorFamilyWeight(b.family) || String(a.family).localeCompare(String(b.family)));
}

function colorPrimitiveInfo(color) {
  const name = String(color.name || color.role || color.value || "other").toLowerCase();
  const parts = name.split("/");
  const families = ["gray", "blue", "green", "orange", "red", "yellow", "purple", "pink", "black", "white", "overlay"];
  let family = "other";
  for (const item of families) {
    if (name.indexOf(item) >= 0) {
      family = item;
      break;
    }
  }
  const scaleMatch = name.match(/(?:^|[-/])([a]?\d{1,4})(?:$|[-/])/);
  const scale = scaleMatch ? scaleMatch[1] : shortName(parts[parts.length - 1] || name);
  return { family, scale };
}

function colorScaleWeight(scale) {
  const value = String(scale || "");
  const alpha = value.charAt(0) === "a";
  const numeric = parseInt(alpha ? value.slice(1) : value, 10);
  if (!isNaN(numeric)) return (alpha ? 2000 : 0) + numeric;
  return 9999;
}

function colorFamilyWeight(family) {
  const order = ["gray", "black", "white", "blue", "green", "orange", "red", "yellow", "purple", "pink", "overlay", "other"];
  const index = order.indexOf(family);
  return index >= 0 ? index : 99;
}

function colorPrimitiveRow(group) {
  const row = figma.createFrame();
  row.name = `${group.family} primitives`;
  row.layoutMode = "VERTICAL";
  row.itemSpacing = 8;
  row.fills = [];
  row.resize(1120, 1);
  setVerticalAutoHeight(row);

  row.appendChild(text(titleCase(group.family), 13, "Semi Bold", "#111111"));
  const swatches = figma.createFrame();
  swatches.name = `${group.family} swatches`;
  swatches.layoutMode = "HORIZONTAL";
  swatches.layoutWrap = "WRAP";
  swatches.itemSpacing = 8;
  swatches.counterAxisSpacing = 10;
  swatches.fills = [];
  swatches.resize(1120, 1);
  setWrappedAutoHeight(swatches);
  row.appendChild(swatches);

  for (const item of group.colors.slice(0, 24)) {
    swatches.appendChild(colorPrimitiveSwatch(item.color, item.scale));
  }
  return row;
}

function colorPrimitiveSwatch(color, scale) {
  const item = figma.createFrame();
  item.name = color.name || color.value;
  item.layoutMode = "VERTICAL";
  item.itemSpacing = 5;
  item.fills = [];
  item.resize(58, 76);
  item.clipsContent = false;

  const swatch = figma.createRectangle();
  swatch.name = color.value;
  swatch.resize(40, 40);
  swatch.cornerRadius = 6;
  swatch.fills = [{ type: "SOLID", color: hexToRgb(color.value), opacity: hexOpacity(color.value) }];
  item.appendChild(swatch);

  const label = text(truncate(scale || shortName(color.name), 8), 9, "Regular", "#333333");
  label.resize(58, 10);
  item.appendChild(label);
  const origin = text(color.origin === "generated" ? "generated" : "observed", 8, "Regular", color.origin === "generated" ? "#9a5b00" : "#666666");
  origin.resize(58, 10);
  item.appendChild(origin);
  return item;
}

function createTypographySection(parent, types) {
  const frame = sectionFrame(copy("typography"));
  parent.appendChild(frame);

  for (const token of types.slice(0, 24)) {
    const sampleFontSize = Math.min(Math.max(token.fontSize, 10), 36);
    const sampleHeight = Math.max(Number(token.lineHeight) || sampleFontSize * 1.35, sampleFontSize * 1.45, 32);
    const rowHeight = Math.max(56, Math.ceil(sampleHeight) + 18);
    const row = figma.createFrame();
    row.name = token.name;
    row.layoutMode = "HORIZONTAL";
    row.itemSpacing = 24;
    row.counterAxisAlignItems = "CENTER";
    row.fills = [];
    row.resize(1100, rowHeight);
    row.clipsContent = false;

    const label = text(`${token.name} | ${token.fontSize}/${token.lineHeight} | ${token.fontWeight}`, 12, "Regular", "#666666");
    resizeTextBlock(label, 360, 22);
    row.appendChild(label);

    const sample = text(copy("sampleText"), sampleFontSize, "Regular", "#111111");
    resizeTextBlock(sample, 680, sampleHeight);
    row.appendChild(sample);
    frame.appendChild(row);
  }
}

function createTokenSection(parent, title, tokens, suffix) {
  const frame = sectionFrame(title);
  parent.appendChild(frame);

  const row = figma.createFrame();
  row.name = `${title} samples`;
  row.layoutMode = "HORIZONTAL";
  row.layoutWrap = "WRAP";
  row.itemSpacing = 12;
  row.counterAxisSpacing = 12;
  row.fills = [];
  row.resize(1200, 1);
  setWrappedAutoHeight(row);
  frame.appendChild(row);

  for (const token of tokens.slice(0, 48)) {
    const value = Number(token.value || 0);
    const box = figma.createFrame();
    box.name = token.name;
    box.layoutMode = "VERTICAL";
    box.primaryAxisAlignItems = "CENTER";
    box.counterAxisAlignItems = "CENTER";
    box.itemSpacing = 6;
    box.paddingTop = 8;
    box.paddingRight = 8;
    box.paddingBottom = 8;
    box.paddingLeft = 8;
    box.resize(124, 112);
    box.clipsContent = false;
    box.cornerRadius = 8;
    box.fills = [{ type: "SOLID", color: hexToRgb("#f5f5f5") }];
    box.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

    const preview = figma.createFrame();
    preview.name = `${value}px radius preview`;
    preview.resize(76, 44);
    preview.cornerRadius = value;
    preview.clipsContent = false;
    preview.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
    preview.strokes = [{ type: "SOLID", color: hexToRgb("#1166cc") }];
    box.appendChild(preview);

    box.appendChild(text(`${value}${suffix}`, 12, "Medium", "#111111"));
    box.appendChild(text(`${token.count || 0} ${usesLabel()}`, 10, "Regular", "#777777"));
    row.appendChild(box);
  }
}

function createSpacingPreviewSection(parent, tokens, isNormalized) {
  const frame = sectionFrame(copy("spacingPreview"));
  parent.appendChild(frame);

  const intro = text(copy("spacingIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const row = figma.createFrame();
  row.name = "Spacing preview cards";
  row.layoutMode = "HORIZONTAL";
  row.layoutWrap = "WRAP";
  row.itemSpacing = 16;
  row.counterAxisSpacing = 16;
  row.fills = [];
  row.resize(1200, 1);
  setWrappedAutoHeight(row);
  frame.appendChild(row);

  for (const token of tokens.slice(0, 48)) {
    row.appendChild(spacingCard(token, isNormalized));
  }
}

function spacingCard(token, isNormalized) {
  const value = Number(token.value || 0);
  const card = figma.createFrame();
  card.name = token.name || `raw/spacing/${value}px`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 10;
  card.paddingTop = 12;
  card.paddingRight = 12;
  card.paddingBottom = 12;
  card.paddingLeft = 12;
  card.resize(190, 138);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  card.appendChild(text(token.name || `raw/spacing/${value}px`, 12, "Semi Bold", "#111111"));
  card.appendChild(text(`${value}px | ${token.count || 0} ${usesLabel()}`, 10, "Regular", "#666666"));

  const barTrack = figma.createFrame();
  barTrack.name = "Actual width bar";
  barTrack.resize(150, 14);
  barTrack.cornerRadius = 7;
  barTrack.fills = [{ type: "SOLID", color: hexToRgb("#eeeeef") }];
  const bar = figma.createRectangle();
  bar.name = `${value}px`;
  bar.resize(Math.max(1, Math.min(value, 140)), 14);
  bar.cornerRadius = 7;
  bar.fills = [{ type: "SOLID", color: hexToRgb("#1166cc") }];
  barTrack.appendChild(bar);
  card.appendChild(barTrack);

  const gapPreview = figma.createFrame();
  gapPreview.name = "Actual gap preview";
  gapPreview.layoutMode = "HORIZONTAL";
  gapPreview.itemSpacing = Math.max(0, Math.min(value, 96));
  gapPreview.counterAxisAlignItems = "CENTER";
  gapPreview.fills = [];
  gapPreview.resize(150, 24);
  const left = square(16, "#111111");
  const right = square(16, "#111111");
  gapPreview.appendChild(left);
  gapPreview.appendChild(right);
  card.appendChild(gapPreview);

  if (isNormalized && token.aliases && token.aliases.length) {
    card.appendChild(text(`${fieldLabel("alias")}: ${token.aliases[0]}`, 9, "Regular", "#777777"));
  }
  return card;
}

function createShadowPreviewSection(parent, shadows, isNormalized) {
  const frame = sectionFrame(copy("shadowPreview"));
  parent.appendChild(frame);

  const intro = text(copy("shadowIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const row = figma.createFrame();
  row.name = "Shadow preview cards";
  row.layoutMode = "HORIZONTAL";
  row.layoutWrap = "WRAP";
  row.itemSpacing = 16;
  row.counterAxisSpacing = 16;
  row.fills = [];
  row.resize(1200, 1);
  setWrappedAutoHeight(row);
  frame.appendChild(row);

  for (const shadow of shadows.slice(0, 32)) {
    row.appendChild(shadowCard(shadow, isNormalized));
  }
}

function shadowCard(shadow, isNormalized) {
  const card = figma.createFrame();
  card.name = shadow.name || "raw/shadow";
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 10;
  card.paddingTop = 12;
  card.paddingRight = 12;
  card.paddingBottom = 12;
  card.paddingLeft = 12;
  card.resize(300, 190);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#f3f4f6") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  card.appendChild(text(shadow.name || "raw/shadow", 12, "Semi Bold", "#111111"));
  card.appendChild(text(`${shadow.count || 0} ${usesLabel()}`, 10, "Regular", "#666666"));

  const css = text(shadow.value || shadow.sourceValue || "", 9, "Regular", "#555555");
  css.resize(260, 34);
  card.appendChild(css);

  const surface = figma.createFrame();
  surface.name = "Shadow surface preview";
  surface.layoutMode = "HORIZONTAL";
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";
  surface.resize(120, 56);
  surface.cornerRadius = 8;
  surface.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  surface.effects = parseBoxShadow(shadow.value || shadow.sourceValue || "");
  surface.appendChild(text(copy("surface"), 10, "Medium", "#333333"));
  card.appendChild(surface);

  if (isNormalized && shadow.aliases && shadow.aliases.length) {
    card.appendChild(text(`${fieldLabel("alias")}: ${shadow.aliases[0]}`, 9, "Regular", "#777777"));
  }
  return card;
}

function createShadowSection(parent, shadows) {
  const frame = sectionFrame("Shadows");
  parent.appendChild(frame);

  const row = figma.createFrame();
  row.name = "Shadow samples";
  row.layoutMode = "HORIZONTAL";
  row.layoutWrap = "WRAP";
  row.itemSpacing = 16;
  row.counterAxisSpacing = 16;
  row.fills = [];
  row.resize(1200, 1);
  setWrappedAutoHeight(row);
  frame.appendChild(row);

  for (const shadow of shadows.slice(0, 24)) {
    const box = figma.createFrame();
    box.name = shadow.name;
    box.layoutMode = "VERTICAL";
    box.itemSpacing = 8;
    box.paddingTop = 12;
    box.paddingRight = 12;
    box.paddingBottom = 12;
    box.paddingLeft = 12;
    box.resize(180, 96);
    box.clipsContent = false;
    box.cornerRadius = 8;
    box.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
    box.effects = parseBoxShadow(shadow.value);
    box.appendChild(text(shadow.name, 12, "Medium", "#111111"));
    box.appendChild(text(`${shadow.count} ${usesLabel()}`, 10, "Regular", "#777777"));
    row.appendChild(box);
  }
}

async function createAssetSection(parent, assets, data) {
  if (!assets.length) return;

  const frame = sectionFrame(copy("assets"));
  parent.appendChild(frame);

  const assetStats = summarizeAssets(assets);
  const renderStats = { imagesRendered: 0, imagesSkipped: 0 };
  const intro = text(assetStatsCopy(assetStats, data, renderStats), 12, "Regular", "#666666");
  intro.resize(1120, 50);
  frame.appendChild(intro);

  for (const group of assetCatalogGroups(assets)) {
    if (!group.assets.length) continue;
    const cards = [];
    for (const asset of group.assets) {
      const card = await assetCard(asset, renderStats);
      if (card) cards.push(card);
    }
    if (!cards.length) continue;

    const groupFrame = figma.createFrame();
    groupFrame.name = assetGroupLabel(group.key);
    groupFrame.layoutMode = "VERTICAL";
    groupFrame.itemSpacing = 10;
    groupFrame.fills = [];
    groupFrame.resize(1200, 1);
    setVerticalAutoHeight(groupFrame);
    frame.appendChild(groupFrame);

    const header = text(`${assetGroupLabel(group.key)} (${cards.length})`, 14, "Semi Bold", "#111111");
    header.resize(1120, 20);
    groupFrame.appendChild(header);

    const grid = figma.createFrame();
    grid.name = `${assetGroupLabel(group.key)} grid`;
    grid.layoutMode = "HORIZONTAL";
    grid.layoutWrap = "WRAP";
    grid.itemSpacing = 16;
    grid.counterAxisSpacing = 16;
    grid.fills = [];
    grid.resize(1200, 1);
    setWrappedAutoHeight(grid);
    groupFrame.appendChild(grid);

    for (const card of cards) grid.appendChild(card);
  }

  intro.characters = assetStatsCopy(assetStats, data, renderStats);
}

function assetStatsCopy(assetStats, data, renderStats = {}) {
  const catalog = data && data.trace && data.trace.assetCatalogStats ? data.trace.assetCatalogStats : {};
  const retainedEn = catalog.total ? ` | retained ${catalog.kept || assetStats.total}/${catalog.total}, unique ${catalog.unique || "unknown"}, omitted ${catalog.omitted || 0}` : "";
  const retainedZh = catalog.total ? ` | 保留 ${catalog.kept || assetStats.total}/${catalog.total}，去重后 ${catalog.unique || "未知"}，省略 ${catalog.omitted || 0}` : "";
  const oldWarningEn = isLegacyAssetCatalog(data, assetStats) ? " This JSON lacks the newer asset metadata; reload the Chrome extension and export normalized JSON again for full icon diagnostics." : "";
  const oldWarningZh = isLegacyAssetCatalog(data, assetStats) ? " 这份 JSON 缺少新版资产元数据；请重新加载 Chrome 扩展并再次导出规范化 JSON，以获得完整图标诊断。" : "";
  const imageEn = `image candidates: ${assetStats.images}, rendered: ${renderStats.imagesRendered || 0}, skipped: ${renderStats.imagesSkipped || 0}`;
  const imageZh = `图片候选 ${assetStats.images}，成功 ${renderStats.imagesRendered || 0}，跳过 ${renderStats.imagesSkipped || 0}`;
  const en = `Resolved SVG icons: ${assetStats.resolvedSvg} | multicolor: ${assetStats.multicolorSvg} | monochrome: ${assetStats.monochromeSvg} | component-linked: ${assetStats.componentLinked} | unresolved icon clues: ${assetStats.unresolvedIconClues} | ${imageEn}${retainedEn}. Assets are deduped by signature and grouped by review value.${oldWarningEn}`;
  const zh = `已解析 SVG 图标：${assetStats.resolvedSvg} | 彩色：${assetStats.multicolorSvg} | 单色：${assetStats.monochromeSvg} | 组件关联：${assetStats.componentLinked} | 未解析图标线索：${assetStats.unresolvedIconClues} | ${imageZh}${retainedZh}。资源已按签名去重，并按复核价值分组。${oldWarningZh}`;
  if (outputLanguage === "zh") return zh;
  if (outputLanguage === "en") return en;
  return `${zh} / ${en}`;
}

function assetCatalogGroups(assets) {
  const groups = [
    { key: "componentLinked", assets: [] },
    { key: "multicolor", assets: [] },
    { key: "monochrome", assets: [] },
    { key: "unresolved", assets: [] },
    { key: "images", assets: [] },
    { key: "other", assets: [] }
  ];
  for (const asset of assets || []) {
    if ((asset.linkedComponentIds || []).length) groups[0].assets.push(asset);
    else if (asset.type === "svg" && (asset.assetKind === "multicolor-svg" || isMulticolorSvgAsset(asset))) groups[1].assets.push(asset);
    else if (asset.type === "svg" && canRenderSvgAsset(asset)) groups[2].assets.push(asset);
    else if (isUnresolvedIconAsset(asset)) groups[3].assets.push(asset);
    else if (asset.type === "image" || asset.assetKind === "image-icon") groups[4].assets.push(asset);
    else groups[5].assets.push(asset);
  }
  return groups;
}

function assetGroupLabel(key) {
  const labels = {
    componentLinked: l("Component-linked Icons", "组件关联图标", "组件关联图标 / Component-linked Icons"),
    multicolor: l("Multicolor Icons", "彩色图标", "彩色图标 / Multicolor Icons"),
    monochrome: l("Monochrome Icons", "单色图标", "单色图标 / Monochrome Icons"),
    unresolved: l("Unresolved Icon Clues", "未解析图标线索", "未解析图标线索 / Unresolved Icon Clues"),
    images: l("Image Assets", "图片资源", "图片资源 / Image Assets"),
    other: l("Other Assets", "其他资源", "其他资源 / Other Assets")
  };
  return labels[key] || key;
}

async function assetCard(asset, renderStats) {
  const icon = await createAssetPreview(asset, 36, "#111111", renderStats);
  if (!icon) return null;

  const card = figma.createFrame();
  card.name = asset.name || asset.id || "Asset";
  card.layoutMode = "VERTICAL";
  card.primaryAxisAlignItems = "CENTER";
  card.counterAxisAlignItems = "CENTER";
  card.itemSpacing = 8;
  card.paddingTop = 12;
  card.paddingRight = 12;
  card.paddingBottom = 12;
  card.paddingLeft = 12;
  card.resize(140, 116);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  const preview = figma.createFrame();
  preview.name = "Asset preview stage";
  preview.layoutMode = "HORIZONTAL";
  preview.primaryAxisAlignItems = "CENTER";
  preview.counterAxisAlignItems = "CENTER";
  preview.resize(44, 36);
  preview.cornerRadius = 6;
  preview.clipsContent = false;
  preview.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  preview.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  preview.appendChild(icon);
  card.appendChild(preview);
  card.appendChild(text(asset.name || asset.id || "Asset", 10, "Medium", "#111111"));
  card.appendChild(text(`${asset.type || "asset"} | ${asset.count || 0}`, 9, "Regular", "#777777"));
  if (asset.resolution) {
    card.appendChild(text(truncate(asset.resolution, 22), 8, "Regular", assetResolutionColor(asset)));
  }
  return card;
}

async function createAssetPreview(asset, size, color, renderStats) {
  const dataSvg = asset && asset.type === "image" ? svgFromDataUrl(asset.src || "") : "";
  if (dataSvg) return createSvgAssetPreview(dataSvg, size, color);
  if (asset && asset.type === "image") return createImageAssetPreview(asset, size, renderStats);
  return createAssetIcon(asset, Math.min(size, 28), color);
}

function createSvgAssetPreview(svg, size, color) {
  try {
    const node = figma.createNodeFromSvg(svg);
    node.resize(Math.min(size, 28), Math.min(size, 28));
    return node;
  } catch (error) {
    return svgRenderFallback(size, color);
  }
}

async function createImageAssetPreview(asset, size, renderStats) {
  const src = asset && asset.src ? asset.src : "";
  try {
    const image = await createFigmaImageFromSource(src);
    if (image && image.hash) {
      const frame = figma.createFrame();
      frame.name = asset && asset.name ? asset.name : "Image preview";
      frame.resize(size, size);
      frame.cornerRadius = 4;
      frame.clipsContent = true;
      frame.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
      if (renderStats) renderStats.imagesRendered = (renderStats.imagesRendered || 0) + 1;
      return frame;
    }
  } catch (error) {
    // Failed images are counted in QA instead of rendered as empty cards.
  }
  if (renderStats) renderStats.imagesSkipped = (renderStats.imagesSkipped || 0) + 1;
  return null;
}

async function createFigmaImageFromSource(src) {
  const value = String(src || "");
  if (!value) return null;
  const dataBytes = imageBytesFromDataUrl(value);
  if (dataBytes) return figma.createImage(dataBytes);
  if (/^https?:\/\//i.test(value) && typeof figma.createImageAsync === "function") {
    return figma.createImageAsync(value);
  }
  return null;
}

function imageBytesFromDataUrl(value) {
  const input = String(value || "");
  if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(input)) return null;
  const comma = input.indexOf(",");
  if (comma < 0) return null;
  try {
    const binary = atob(input.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch (error) {
    return null;
  }
}

function createImportQaSection(parent, data, assets, components) {
  const frame = sectionFrame(copy("importQa"));
  parent.appendChild(frame);

  const warnings = data.warnings || [];
  const sourcePages = data.sources || (data.trace && data.trace.sourcePages) || [];
  const assetStats = summarizeAssets(assets || []);
  const catalogStats = data.trace && data.trace.assetCatalogStats ? data.trace.assetCatalogStats : {};
  const inferredStates = countWarnings(warnings, "inferred-state");
  const lowContrast = countWarnings(warnings, "low-contrast");
  const missingBackground = countWarnings(warnings, "source-background-may-be-missing");
  const clipped = countWarnings(warnings, "clipped-content");
  const legacyCatalog = isLegacyAssetCatalog(data, assetStats);

  const list = figma.createFrame();
  list.name = "QA metrics";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 8;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  list.appendChild(qaRow(l("source pages", "来源页面", "来源页面 / source pages"), sourcePages.length || 1, l("Merged captures represented in this draft.", "本草稿中包含的合并采集页面。", "本草稿中包含的合并采集页面。 / Merged captures represented in this draft.")));
  list.appendChild(qaRow(l("component candidates needing review", "待复核组件候选", "待复核组件候选 / component candidates"), components.length || 0, l("All generated components are candidates, not production-ready components.", "所有生成组件仍是候选，不是生产级组件。", "所有生成组件仍是候选，不是生产级组件。 / All generated components are candidates.")));
  list.appendChild(qaRow(l("asset pipeline version", "资产管线版本", "资产管线版本 / asset pipeline version"), catalogStats.pipelineVersion || (legacyCatalog ? "legacy" : "-"), legacyCatalog ? l("Old asset metadata detected. Re-export normalized JSON with the latest Chrome extension.", "检测到旧资产元数据。请用最新版 Chrome 扩展重新导出规范化 JSON。", "检测到旧资产元数据。请用最新版 Chrome 扩展重新导出规范化 JSON。 / Old asset metadata detected.") : l("New asset diagnostics are available.", "已包含新版资产诊断。", "已包含新版资产诊断。 / New asset diagnostics are available.")));
  list.appendChild(qaRow(l("duplicates merged", "已合并重复资源", "已合并重复资源 / duplicates merged"), catalogStats.duplicatesMerged || 0, l("Assets with the same stable signature are merged before display.", "相同稳定签名的资源会在展示前合并。", "相同稳定签名的资源会在展示前合并。 / Assets with the same stable signature are merged before display.")));
  list.appendChild(qaRow(l("resolved SVG icons", "已解析 SVG 图标", "已解析 SVG 图标 / resolved SVG icons"), assetStats.resolvedSvg, l("Rendered through Figma createNodeFromSvg when possible.", "可解析 SVG 会通过 Figma 节点方式渲染。", "可解析 SVG 会通过 Figma 节点方式渲染。 / Rendered through Figma createNodeFromSvg when possible.")));
  list.appendChild(qaRow(l("multicolor SVG icons", "彩色 SVG 图标", "彩色 SVG 图标 / multicolor SVG icons"), assetStats.multicolorSvg, l("Only SVGs with multiple explicit colors are counted here.", "这里只统计包含多个明确颜色的 SVG。", "这里只统计包含多个明确颜色的 SVG。 / Only SVGs with multiple explicit colors are counted here.")));
  list.appendChild(qaRow(l("monochrome SVG icons", "单色 SVG 图标", "单色 SVG 图标 / monochrome SVG icons"), assetStats.monochromeSvg, l("Inline monochrome icons are grouped as monochrome, not multicolor.", "单色 inline 图标会归入单色图标，而不是彩色图标。", "单色 inline 图标会归入单色图标，而不是彩色图标。 / Inline monochrome icons are grouped as monochrome.")));
  list.appendChild(qaRow(l("component-linked icons", "组件关联图标", "组件关联图标 / component-linked icons"), assetStats.componentLinked, l("Assets with direct evidence from component candidates.", "与组件候选存在直接来源证据的图标。", "与组件候选存在直接来源证据的图标。 / Assets with direct evidence from component candidates.")));
  list.appendChild(qaRow(l("unresolved icon clues", "未解析图标线索", "未解析图标线索 / unresolved icon clues"), assetStats.unresolvedIconClues + assetStats.unresolvedSvg, l("Usually icon fonts, external sprites, CSS masks, closed shadow DOM, or blocked resources.", "通常来自 icon font、外部 sprite、CSS mask、closed shadow DOM 或被拦截资源。", "通常来自 icon font、外部 sprite、CSS mask、closed shadow DOM 或被拦截资源。 / Usually icon fonts, external sprites, CSS masks, or blocked resources.")));
  list.appendChild(qaRow(l("image candidates", "图片候选", "图片候选 / image candidates"), assetStats.images, l("Only successfully rendered images appear as image cards; failed remote images are skipped.", "只有成功渲染的图片才会生成图片卡片，失败的远程图片会跳过。", "只有成功渲染的图片才会生成图片卡片，失败的远程图片会跳过。 / Only successfully rendered images appear as image cards.")));
  list.appendChild(qaRow(l("omitted assets", "省略资源", "省略资源 / omitted assets"), catalogStats.omitted || 0, l(`Catalog limit ${catalogStats.limit || assets.length || 0}; omitted after dedupe and priority retention.`, `目录上限 ${catalogStats.limit || assets.length || 0}；去重并按优先级保留后省略。`, `目录上限 ${catalogStats.limit || assets.length || 0}；去重并按优先级保留后省略。 / Catalog limit ${catalogStats.limit || assets.length || 0}; omitted after dedupe and priority retention.`)));
  list.appendChild(qaRow(l("inferred state warnings", "推断状态警告", "推断状态警告 / inferred state warnings"), inferredStates, l("Hover/focus/class states are not active interaction captures.", "hover/focus/class 状态不是主动交互采集。", "hover/focus/class 状态不是主动交互采集。 / Hover/focus/class states are not active interaction captures.")));
  list.appendChild(qaRow(l("low contrast warnings", "低对比度警告", "低对比度警告 / low contrast warnings"), lowContrast, l("Review source foreground/background context.", "需要复核来源前景/背景上下文。", "需要复核来源前景/背景上下文。 / Review source foreground/background context.")));
  list.appendChild(qaRow(l("missing background warnings", "背景缺失警告", "背景缺失警告 / missing background warnings"), missingBackground, l("Preview may not match source page context.", "预览可能与来源页面上下文不完全一致。", "预览可能与来源页面上下文不完全一致。 / Preview may not match source page context.")));
  list.appendChild(qaRow(l("clipped content warnings", "裁切内容警告", "裁切内容警告 / clipped content warnings"), clipped, l("Preview may be incomplete because source DOM was clipped.", "来源 DOM 被裁切时，预览可能不完整。", "来源 DOM 被裁切时，预览可能不完整。 / Preview may be incomplete because source DOM was clipped.")));
}

function qaRow(label, value, detail) {
  const row = figma.createFrame();
  row.name = label;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 8;
  row.paddingRight = 10;
  row.paddingBottom = 8;
  row.paddingLeft = 10;
  row.resize(1080, 36);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];

  const valueNode = text(String(value), 13, "Semi Bold", value > 0 ? "#111111" : "#777777");
  valueNode.resize(72, 18);
  row.appendChild(valueNode);
  const labelNode = text(`${label} | ${detail}`, 11, "Regular", "#555555");
  labelNode.resize(940, 18);
  row.appendChild(labelNode);
  return row;
}

function createSpecificationReviewSection(parent, spec, components) {
  const frame = sectionFrame(copy("specReview"));
  parent.appendChild(frame);

  const intro = text(copy("specIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const foundations = spec.foundations || {};
  const foundationTable = figma.createFrame();
  foundationTable.name = "Foundation coverage";
  foundationTable.layoutMode = "VERTICAL";
  foundationTable.itemSpacing = 6;
  foundationTable.fills = [];
  foundationTable.resize(1120, 1);
  setVerticalAutoHeight(foundationTable);
  frame.appendChild(foundationTable);

  const foundationNames = ["colors", "typography", "spacing", "radii", "shadows", "motion", "breakpoints", "grid", "density"];
  for (const name of foundationNames) {
    const item = foundations[name] || { status: "missing", count: 0 };
    foundationTable.appendChild(specRow(titleCase(name), item.status || "missing", `${item.count || 0} items${item.note ? ` | ${item.note}` : ""}`));
  }

  const reviewCounts = componentReviewCounts(components);
  const reviewTable = figma.createFrame();
  reviewTable.name = "Component review status";
  reviewTable.layoutMode = "VERTICAL";
  reviewTable.itemSpacing = 6;
  reviewTable.fills = [];
  reviewTable.resize(1120, 1);
  setVerticalAutoHeight(reviewTable);
  frame.appendChild(reviewTable);

  reviewTable.appendChild(specRow("candidate", String(reviewCounts.candidate), "High-confidence inferred candidates. Still not accepted components."));
  reviewTable.appendChild(specRow("needs review", String(reviewCounts.needsReview), "Requires designer/system-owner confirmation."));
  reviewTable.appendChild(specRow("accepted", String(reviewCounts.accepted), "Reserved for reviewed components."));
  reviewTable.appendChild(specRow("rejected", String(reviewCounts.rejected), "Reserved for rejected candidates."));

  const next = spec.governance && spec.governance.nextStep ? spec.governance.nextStep : "Review component candidates, confirm token semantics, and promote accepted items into a formal specification.";
  const nextText = text(`${copy("nextStep")}: ${next}`, 12, "Medium", "#333333");
  nextText.resize(1120, 34);
  frame.appendChild(nextText);
}

function specRow(label, status, detail) {
  const row = figma.createFrame();
  row.name = label;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 8;
  row.paddingRight = 10;
  row.paddingBottom = 8;
  row.paddingLeft = 10;
  row.resize(1080, 36);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];

  const labelNode = text(label, 11, "Semi Bold", "#111111");
  labelNode.resize(160, 18);
  row.appendChild(labelNode);
  const statusNode = text(status, 11, "Medium", specStatusColor(status));
  statusNode.resize(180, 18);
  row.appendChild(statusNode);
  const detailNode = text(truncate(detail, 130), 10, "Regular", "#555555");
  detailNode.resize(700, 18);
  row.appendChild(detailNode);
  return row;
}

function specStatusColor(status) {
  const value = String(status || "");
  if (value.indexOf("missing") >= 0 || value === "0") return "#9a3412";
  if (value.indexOf("needs") >= 0 || value.indexOf("inferred") >= 0) return "#9a5b00";
  return "#166534";
}

function componentReviewCounts(components) {
  const counts = { candidate: 0, needsReview: 0, accepted: 0, rejected: 0 };
  for (const component of components || []) {
    const status = component.reviewStatus || "needs-review";
    if (status === "candidate") counts.candidate += 1;
    else if (status === "accepted") counts.accepted += 1;
    else if (status === "rejected") counts.rejected += 1;
    else counts.needsReview += 1;
  }
  return counts;
}

function createDesignerQuickStartSection(parent, data, components) {
  const frame = sectionFrame(copy("quickStart"));
  parent.appendChild(frame);

  const intro = text(copy("quickStartIntro"), 12, "Regular", "#555555");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const sourcePages = data.sources || (data.trace && data.trace.sourcePages) || [];
  const row = figma.createFrame();
  row.name = "Designer kit summary";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  row.clipsContent = false;
  frame.appendChild(row);

  row.appendChild(summaryPill("sources", sourcePages.length || 1));
  row.appendChild(summaryPill("components", components.length || 0));
  row.appendChild(summaryPill("mode", outputMode));
  row.appendChild(summaryPill("status", "draft"));
}

function createDesignerGroupSection(parent, title, introText) {
  const frame = sectionFrame(title);
  parent.appendChild(frame);
  frame.paddingTop = 0;
  frame.paddingRight = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;
  frame.fills = [];
  frame.strokes = [];

  const intro = text(introText, 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);
  return frame;
}

function createComponentQualitySummarySection(parent, components) {
  const all = components || [];
  if (!all.length) return;
  const counts = componentTierCounts(all);
  const frame = sectionFrame(l("Component Candidate Triage", "组件候选分层", "组件候选分层 / Component Candidate Triage"));
  parent.appendChild(frame);

  const intro = text(l(
    "The importer now separates reusable candidates from trace-only DOM samples, so page-specific fragments do not dominate the component sheets.",
    "生成器会将可复用候选与仅供追踪的 DOM 样本分开，避免页面特定片段占据组件样张。",
    "生成器会将可复用候选与追踪项分开 / Reusable candidates are separated from trace-only DOM samples."
  ), 12, "Regular", "#555555");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const row = figma.createFrame();
  row.name = "Component triage summary";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  row.clipsContent = false;
  frame.appendChild(row);

  row.appendChild(summaryPill(l("core candidates", "核心候选", "核心候选 / core"), counts.core));
  row.appendChild(summaryPill(l("pattern candidates", "模式候选", "模式候选 / patterns"), counts.pattern));
  row.appendChild(summaryPill(l("trace-only", "仅追踪", "仅追踪 / trace-only"), counts.trace));
  row.appendChild(summaryPill(l("high-risk warnings", "高风险警告", "高风险警告 / high-risk"), counts.highRisk));
}

function createReusablePatternDraftsSection(parent, containers, components, assetCatalog, data) {
  const patterns = reusablePatternDrafts(containers || [], components || [], data || {});
  if (!patterns.length) return;
  const assetIndex = createPatternAssetIndex(assetCatalog || []);

  const genericPatterns = patterns.filter((pattern) => pattern.scope !== "site-specific");
  const siteSpecificPatterns = patterns.filter((pattern) => pattern.scope === "site-specific");
  createPatternDraftGridSection(
    parent,
    genericPatterns,
    assetIndex,
    l("RDS03 Patterns / Page Patterns", "RDS03 Patterns / 页面模式", "RDS03 Patterns / 页面模式 / Page Patterns"),
    l(
      "Page patterns are generated dynamically from observed containers such as navigation, sidebars, lists, menus, headers, forms, cards, and tables.",
      "页面模式根据已观察到的导航、侧边栏、列表、菜单、顶部栏、表单、卡片、表格等容器动态生成。",
      "页面模式根据已观察容器动态生成 / Page patterns are generated from observed containers."
    )
  );
  createPatternDraftGridSection(
    parent,
    siteSpecificPatterns,
    assetIndex,
    l("Site-specific Patterns", "站点专属模式", "站点专属模式 / Site-specific Patterns"),
    l(
      "These patterns are only shown when the source host or captured structure strongly matches this site.",
      "这些模式只在来源站点或采集结构强烈匹配时显示。",
      "仅在站点结构强匹配时显示 / Only shown for strong site-specific evidence."
    )
  );
}

function createPatternDraftGridSection(parent, patterns, assetIndex, title, introCopy) {
  if (!patterns || !patterns.length) return;
  const frame = sectionFrame(title);
  parent.appendChild(frame);
  const intro = text(introCopy, 12, "Regular", "#555555");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const grid = figma.createFrame();
  grid.name = "Reusable pattern draft grid";
  grid.layoutMode = "HORIZONTAL";
  grid.layoutWrap = "WRAP";
  grid.itemSpacing = 16;
  grid.counterAxisSpacing = 16;
  grid.fills = [];
  grid.resize(1120, 1);
  setWrappedAutoHeight(grid);
  frame.appendChild(grid);

  for (const pattern of patterns.slice(0, 9)) {
    grid.appendChild(patternDraftCard(pattern, assetIndex));
  }
}

function reusablePatternDrafts(containers, components, data) {
  const patterns = [];
  appendGenericContainerPatterns(patterns, containers || [], components || []);
  if (!isSiteSpecificChatGpt(data, components || [], containers || [])) return dedupePatternDrafts(patterns);

  const sidebarItems = components.filter((component) => component.category === "menu-item" || component.category === "link" || componentMatchesText(component, /(sidebar|__menu-item|menu item|侧边栏|菜单)/i));
  const sidebar = bestPatternContainer(containers, (container) => container.type === "sidebar" && !isLargeStructuralContainer(container) && containerBounds(container).width >= 120 && containerBounds(container).height >= 120);
  if (sidebar) patterns.push(patternDraft("sidebarItem", l("Sidebar Item", "侧边栏项", "侧边栏项 / Sidebar Item"), sidebar, sidebarItems, l("Observed repeated sidebar/menu row candidates. Full sidebar composition is kept as a trace because row-to-icon pairing is not reliable enough.", "已观察到重复出现的侧边栏或菜单行候选。完整侧边栏组合仅作追踪，不再强行拼接，因为行与图标的一一对应证据不足。", "已观察到重复侧边栏行 / Full sidebar composition remains trace-only because row-to-icon pairing is weak."), "site-specific"));

  if (!sidebar && sidebarItems.length) patterns.push(patternDraft("sidebarItem", l("Sidebar Item", "侧边栏项", "侧边栏项 / Sidebar Item"), null, sidebarItems, l("Observed repeated sidebar/menu row candidates.", "已观察到重复出现的侧边栏或菜单行候选。", "已观察到重复侧边栏行 / Observed repeated sidebar rows."), "site-specific"));

  const conversationRows = components.filter((component) => componentMatchesText(component, /(conversation|chat|thread|聊天|对话)/i));
  if (conversationRows.length) patterns.push(patternDraft("conversationRow", l("Conversation Row", "会话行", "会话行 / Conversation Row"), null, conversationRows, l("Observed conversation list row traces.", "已观察到会话列表行追踪。", "已观察到会话行 / Observed conversation row traces."), "site-specific"));

  const projectRows = components.filter((component) => componentMatchesText(component, /(project|项目)/i));
  if (projectRows.length) patterns.push(patternDraft("projectRow", l("Project Row", "项目行", "项目行 / Project Row"), null, projectRows, l("Observed project list row traces.", "已观察到项目列表行追踪。", "已观察到项目行 / Observed project row traces."), "site-specific"));

  const composer = bestPatternContainer(containers, (container) => container.type === "composer-form" && !isLargeStructuralContainer(container) && (containerChildCount(container, "text-input") || componentMatchesText(container, /(composer|ProseMirror|输入|聊天)/i) || containerBounds(container).width >= 300 && containerBounds(container).height <= 160));
  const composerComponents = components.filter((component) => component.category === "text-input" || componentMatchesText(component, /(composer|ProseMirror|prompt|voice|mic|send|attach|upload|输入|聊天|发送|上传|附件|查找资料|生成图片|撰写或编辑)/i));
  if (composer) patterns.push(patternDraft("composer", l("Composer", "输入区", "输入区 / Composer"), composer, composerComponents, l("Observed composer/input region with text input evidence.", "已观察到包含文本输入证据的输入区。", "已观察到输入区 / Observed composer/input region."), "site-specific"));

  const promptActions = components.filter((component) => {
    const example = (component.examples || [])[0] || {};
    return component.category === "button" && isGenericActionLabel(example.text || componentDisplayName(component));
  });
  if (promptActions.length) patterns.push(patternDraft("promptActions", l("Prompt Action Buttons", "提示操作按钮", "提示操作按钮 / Prompt Action Buttons"), null, promptActions, l("Observed prompt action buttons.", "已观察到提示操作按钮。", "已观察到提示操作按钮 / Observed prompt action buttons."), "site-specific"));

  const menuGroup = bestPatternContainer(containers, (container) => container.type === "menu-list" && !isLargeStructuralContainer(container));
  if (menuGroup) patterns.push(patternDraft("menuGroup", l("Menu Group", "菜单组", "菜单组 / Menu Group"), menuGroup, components.filter((component) => component.category === "menu-item"), l("Observed menu/list grouping evidence.", "已观察到菜单或列表分组证据。", "已观察到菜单组 / Observed menu grouping evidence."), "site-specific"));

  const header = bestPatternContainer(containers, (container) => container.type === "top-bar" && !isLargeStructuralContainer(container));
  const headerComponents = components.filter((component) => componentMatchesText(component, /(header|top|bar|sidebar|new chat|close|menu|home|顶部|顶栏|关闭边栏|打开边栏|新聊天|菜单|首页|更多)/i));
  if (header) patterns.push(patternDraft("header", l("Header / Top Bar", "顶部栏", "顶部栏 / Header"), header, headerComponents, l("Observed page header/top bar region.", "已观察到页面顶部栏区域。", "已观察到顶部栏 / Observed header region."), "site-specific"));

  const popover = bestPatternContainer(containers, (container) => /popover|dialog|modal/i.test(`${container.type || ""} ${container.name || ""}`));
  if (popover) patterns.push(patternDraft("popover", l("Popover / Dialog", "浮层 / 对话框", "浮层 / 对话框 / Popover"), popover, [], l("Observed popover/dialog container evidence.", "已观察到浮层或对话框容器证据。", "已观察到浮层证据 / Observed popover/dialog evidence."), "site-specific"));
  return dedupePatternDrafts(patterns);
}

function appendGenericContainerPatterns(patterns, containers, components) {
  const map = [
    ["top-bar", "headerRegion", l("Header / Top Bar", "顶部栏", "顶部栏 / Header"), l("Observed top bar or header region.", "已观察到顶部栏或页眉区域。", "已观察到顶部栏 / Observed header region.")],
    ["nav-group", "navigationRegion", l("Navigation", "导航", "导航 / Navigation"), l("Observed navigation region.", "已观察到导航区域。", "已观察到导航区域 / Observed navigation region.")],
    ["breadcrumb", "breadcrumbRegion", l("Breadcrumb", "面包屑", "面包屑 / Breadcrumb"), l("Observed breadcrumb trail evidence.", "已观察到面包屑路径证据。", "已观察到面包屑 / Observed breadcrumb evidence.")],
    ["sidebar", "sidebarRegion", l("Sidebar", "侧边栏", "侧边栏 / Sidebar"), l("Observed sidebar or secondary navigation region.", "已观察到侧边栏或二级导航区域。", "已观察到侧边栏 / Observed sidebar region.")],
    ["form-section", "formRegion", l("Form Region", "表单区域", "表单区域 / Form Region"), l("Observed form region with input/control evidence.", "已观察到包含输入或控件证据的表单区域。", "已观察到表单区域 / Observed form region.")],
    ["composer-form", "inputRegion", l("Input Region", "输入区域", "输入区域 / Input Region"), l("Observed input or composer-like form region.", "已观察到输入区或组合输入表单。", "已观察到输入区 / Observed input region.")],
    ["menu-list", "menuRegion", l("Menu Group", "菜单组", "菜单组 / Menu Group"), l("Observed menu/list grouping evidence.", "已观察到菜单或列表分组证据。", "已观察到菜单组 / Observed menu grouping evidence.")],
    ["list-group", "listRegion", l("List / Row Group", "列表 / 行组", "列表 / 行组 / List Group"), l("Observed repeated list or row grouping evidence.", "已观察到重复列表或行组证据。", "已观察到列表组 / Observed list grouping evidence.")],
    ["card-grid", "cardGridRegion", l("Card Grid", "卡片网格", "卡片网格 / Card Grid"), l("Observed card/grid grouping evidence.", "已观察到卡片或网格分组证据。", "已观察到卡片网格 / Observed card/grid evidence.")],
    ["table", "tableRegion", l("Table / Data Grid", "表格 / 数据网格", "表格 / 数据网格 / Table"), l("Observed table or data-grid evidence.", "已观察到表格或数据网格证据。", "已观察到表格 / Observed table evidence.")],
    ["dialog-popover", "overlayRegion", l("Dialog / Popover", "对话框 / 浮层", "对话框 / 浮层 / Dialog"), l("Observed dialog, modal, or popover container evidence.", "已观察到对话框、弹窗或浮层容器证据。", "已观察到浮层 / Observed overlay evidence.")]
  ];
  for (const item of map) {
    const container = bestPatternContainer(containers, (candidate) => candidate.type === item[0] && !isLargeStructuralContainer(candidate));
    if (!container) continue;
    patterns.push(patternDraft(item[1], item[2], container, patternComponentsForContainerType(item[0], components), item[3], "generic"));
  }
}

function patternComponentsForContainerType(type, components) {
  const list = components || [];
  if (type === "top-bar" || type === "nav-group" || type === "breadcrumb") return list.filter((component) => ["button", "link", "navigation", "menu-item", "breadcrumb"].indexOf(component.category || "") >= 0);
  if (type === "form-section" || type === "composer-form") return list.filter((component) => ["text-input", "select", "checkbox", "radio", "switch", "button", "form-field"].indexOf(component.category || "") >= 0);
  if (type === "menu-list" || type === "sidebar") return list.filter((component) => ["menu-item", "link", "button", "navigation"].indexOf(component.category || "") >= 0);
  if (type === "list-group") return list.filter((component) => ["link", "menu-item", "button", "checkbox", "radio"].indexOf(component.category || "") >= 0);
  if (type === "card-grid") return list.filter((component) => ["card", "button", "link", "tag"].indexOf(component.category || "") >= 0);
  return list;
}

function isSiteSpecificChatGpt(data, components, containers) {
  const host = String(data && data.source && data.source.hostname || "").toLowerCase();
  if (/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(host)) return true;
  const evidence = [];
  for (const source of data && data.sources ? data.sources : []) evidence.push(source.hostname, source.title, source.url);
  for (const component of (components || []).slice(0, 80)) {
    evidence.push(componentDisplayName(component), component.name, component.category);
    const example = component.examples && component.examples[0] ? component.examples[0] : {};
    evidence.push(example.text, example.className, example.role);
  }
  for (const container of (containers || []).slice(0, 40)) evidence.push(container.name, container.type);
  const textValue = evidence.filter(Boolean).join(" ").toLowerCase();
  const strongSignals = /(chatgpt|openai|gpt|prosemirror|new chat|search chats|有问题|尽管问|新聊天|搜索聊天|探索 gpt)/i;
  return strongSignals.test(textValue);
}

function dedupePatternDrafts(patterns) {
  const seen = {};
  const result = [];
  for (const pattern of patterns || []) {
    const key = `${pattern.scope || "generic"}|${pattern.type}|${pattern.container && pattern.container.type || ""}|${pattern.title}`;
    if (seen[key]) continue;
    seen[key] = true;
    result.push(pattern);
  }
  return result.sort((a, b) => {
    const scopeDelta = String(a.scope || "generic").localeCompare(String(b.scope || "generic"));
    if (scopeDelta !== 0) return scopeDelta;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

function patternDraft(type, title, container, components, note, scope) {
  return {
    type,
    title,
    container,
    components: components || [],
    note,
    scope: scope || "generic",
    confidence: Math.max(container ? container.confidence || 0 : 0, maxComponentConfidence(components || [])),
    sourceIds: patternSourceIds(container, components || [])
  };
}

function bestPatternContainer(containers, predicate) {
  return (containers || []).filter(predicate).sort((a, b) => {
    const scoreDelta = patternContainerScore(b) - patternContainerScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  })[0] || null;
}

function patternContainerScore(container) {
  const bounds = containerBounds(container);
  const areaScore = Math.min(2, (bounds.width * bounds.height) / 600000);
  return (container.confidence || 0) * 10 + Math.min(3, (container.count || 0) / 20) + areaScore;
}

function containerBounds(container) {
  const example = firstContainerExample(container);
  return example.bounds || { width: example.width || 0, height: example.height || 0, x: example.x || 0, y: example.y || 0 };
}

function containerChildCount(container, key) {
  return (container && container.childSummary && container.childSummary[key]) || 0;
}

function componentMatchesText(item, pattern) {
  const parts = [item.name, item.displayName, item.semanticName, item.type, item.category];
  for (const example of item.examples || []) {
    parts.push(example.text, example.className, example.role, example.tag);
  }
  return pattern.test(parts.filter(Boolean).join(" "));
}

function maxComponentConfidence(components) {
  let max = 0;
  for (const component of components || []) max = Math.max(max, component.confidence || 0);
  return max;
}

function patternSourceIds(container, components) {
  const ids = [];
  appendUniqueLimited(ids, container ? container.sourceContainerIds || [] : [], 12);
  for (const component of components || []) appendUniqueLimited(ids, component.sourceComponentIds || [], 12);
  return ids;
}

function createPatternAssetIndex(assets) {
  const index = {};
  for (const asset of assets || []) {
    if (!asset) continue;
    if (asset.signature) index[`signature:${asset.signature}`] = asset;
    if (asset.spriteId) index[`sprite:${asset.spriteId}`] = asset;
    if (asset.src) index[`src:${String(asset.src).slice(0, 180)}`] = asset;
    if (asset.name) index[`name:${asset.name}`] = asset;
  }
  return index;
}

function resolvePatternAssets(refs, assetIndex, directAssets) {
  const resolved = [];
  const seen = {};
  for (const asset of directAssets || []) appendResolvedPatternAsset(resolved, seen, asset);
  for (const ref of refs || []) {
    if (!ref) continue;
    const asset =
      (ref.signature && assetIndex[`signature:${ref.signature}`]) ||
      (ref.spriteId && assetIndex[`sprite:${ref.spriteId}`]) ||
      (ref.src && assetIndex[`src:${String(ref.src).slice(0, 180)}`]) ||
      (ref.src ? ref : null);
    appendResolvedPatternAsset(resolved, seen, asset);
  }
  return resolved;
}

function appendResolvedPatternAsset(result, seen, asset) {
  if (!asset) return;
  const key = asset.signature || asset.src || asset.name || JSON.stringify(asset).slice(0, 80);
  if (seen[key]) return;
  seen[key] = true;
  result.push(asset);
}

function patternAssetsForComponent(component, example, assetIndex) {
  return sortPatternAssets(resolvePatternAssets(
    []
      .concat(component && component.assetRefs ? component.assetRefs : [])
      .concat(example && example.assetRefs ? example.assetRefs : []),
    assetIndex || {},
    component && component.assets ? component.assets : []
  ));
}

function patternAssetsForPattern(pattern, assetIndex) {
  const assets = [];
  const seen = {};
  for (const component of pattern.components || []) {
    for (const asset of patternAssetsForComponent(component, bestComponentExample(component), assetIndex)) {
      appendResolvedPatternAsset(assets, seen, asset);
    }
  }
  for (const example of pattern.container && pattern.container.examples ? pattern.container.examples : []) {
    for (const asset of resolvePatternAssets(example.assetRefs || [], assetIndex || {}, [])) {
      appendResolvedPatternAsset(assets, seen, asset);
    }
  }
  return sortPatternAssets(assets);
}

function sortPatternAssets(assets) {
  return (assets || []).slice().sort((a, b) => patternAssetScore(b) - patternAssetScore(a));
}

function patternAssetScore(asset) {
  if (!asset) return -100;
  let score = 0;
  const src = String(asset.src || "").trim();
  if (asset.type === "svg" && src.indexOf("<svg") === 0 && canRenderSvgAsset(asset)) score += 80;
  if (String(asset.assetKind || "").indexOf("multicolor") >= 0) score += 20;
  if (String(asset.resolution || "").indexOf("resolved-external-sprite") >= 0) score += 12;
  if (String(asset.assetKind || "").indexOf("inline") >= 0) score += 8;
  if (/__lottie_element/i.test(String(asset.spriteId || "") + " " + String(asset.name || ""))) score -= 8;
  if (asset.type === "image") score -= 35;
  score += Math.min(8, Number(asset.count || 0) / 20);
  return score;
}

function bestComponentExample(component, minWidth) {
  const examples = component && component.examples ? component.examples : [];
  const preferredMinWidth = minWidth || 0;
  const direct = examples.find((example) => {
    const bounds = exampleBounds(example);
    return bounds.width >= preferredMinWidth && bounds.width > 0 && bounds.height > 0;
  });
  if (direct) return direct;
  for (const example of examples) {
    const parent = bestAncestryExample(example, preferredMinWidth);
    if (parent) {
      const mergedStyles = mergeAncestryExampleStyles(parent, example.styles || {});
      return {
        text: example.text,
        styles: mergedStyles,
        assetRefs: []
          .concat(parent.assetRefs || [])
          .concat(example.assetRefs || []),
        bounds: parent.bounds,
        className: parent.className || example.className || "",
        role: parent.role || example.role || "",
        tag: parent.tag || example.tag || ""
      };
    }
  }
  return examples[0] || {};
}

function mergeAncestryExampleStyles(parent, childStyles) {
  const base = Object.assign({}, childStyles || {}, parent && parent.styles ? parent.styles : {});
  const synthetic = syntheticStylesForClass(parent && parent.className, base);
  return Object.assign({}, base, synthetic);
}

function syntheticStylesForClass(className, baseStyles) {
  const cls = String(className || "");
  const styles = {};
  const radius = radiusFromClassName(cls);
  if (!baseStyles || !baseStyles.borderRadius) {
    if (radius !== null) styles.borderRadius = `${radius}px`;
    else if (/\b__menu-item\b|\bhoverable\b|\bnav\b/i.test(cls)) styles.borderRadius = "10px";
  }
  if (!baseStyles || !observedPaint(baseStyles.backgroundColor)) {
    const background = backgroundFromClassName(cls);
    if (background) {
      styles.backgroundColor = background;
    } else if (/\b(bg-token-surface-hover|bg-token-sidebar-surface-secondary|bg-token-main-surface-secondary|selected|active|current)\b/i.test(cls)) {
      styles.backgroundColor = "#0000000d";
    }
  }
  if (!baseStyles || !observedPaint(baseStyles.borderColor)) {
    if (/\bborder\b/.test(cls)) styles.borderColor = "#dedede";
  }
  if (!baseStyles || !baseStyles.boxShadow) {
    const shadow = shadowFromClassName(cls);
    if (shadow) styles.boxShadow = shadow;
  }
  if (!baseStyles || !observedPaint(baseStyles.color)) {
    const color = textColorFromClassName(cls);
    if (color) styles.color = color;
  }
  return styles;
}

function backgroundFromClassName(className) {
  const cls = String(className || "");
  const blackOpacity = cls.match(/\bbg-black\/(\d{1,3})\b/);
  if (blackOpacity) return `rgba(0, 0, 0, ${clamp(Number(blackOpacity[1]) / 100, 0, 1)})`;
  const whiteOpacity = cls.match(/\bbg-white\/(\d{1,3})\b/);
  if (whiteOpacity) return `rgba(255, 255, 255, ${clamp(Number(whiteOpacity[1]) / 100, 0, 1)})`;
  if (/\bbg-black\b/.test(cls)) return "#000000";
  if (/\bbg-white\b/.test(cls)) return "#ffffff";
  if (/\bbg-token-sidebar-surface-primary\b/.test(cls)) return "#f9f9f9";
  if (/\bbg-token-sidebar-surface-secondary\b/.test(cls)) return "#f3f3f3";
  if (/\bbg-token-main-surface-primary\b/.test(cls)) return "#ffffff";
  if (/\bbg-token-main-surface-secondary\b/.test(cls)) return "#f7f7f7";
  if (/\bbg-token-surface-hover\b/.test(cls)) return "#0000000d";
  return "";
}

function textColorFromClassName(className) {
  const cls = String(className || "");
  if (/\btext-white\b/.test(cls)) return "#ffffff";
  if (/\btext-black\b/.test(cls)) return "#000000";
  if (/\btext-token-text-primary\b/.test(cls)) return "#111111";
  if (/\btext-token-text-secondary\b/.test(cls)) return "#5f5f5f";
  if (/\btext-token-text-tertiary\b/.test(cls)) return "#8f8f8f";
  return "";
}

function shadowFromClassName(className) {
  const cls = String(className || "");
  if (/\bshadow-none\b/.test(cls)) return "";
  if (/\bshadow-(?:sm|xs)\b/.test(cls)) return "0px 1px 2px rgba(0, 0, 0, 0.08)";
  if (/\bshadow\b/.test(cls)) return "0px 4px 14px rgba(0, 0, 0, 0.10)";
  if (/\bbackdrop-blur\b/.test(cls)) return "0px 8px 24px rgba(0, 0, 0, 0.08)";
  return "";
}

function radiusFromClassName(className) {
  const cls = String(className || "");
  const arbitrary = cls.match(/\brounded-\[(\d+(?:\.\d+)?)px\]/);
  if (arbitrary) return Number(arbitrary[1]);
  if (/\brounded-full\b/.test(cls)) return 999;
  if (/\brounded-3xl\b/.test(cls)) return 24;
  if (/\brounded-2xl\b/.test(cls)) return 16;
  if (/\brounded-xl\b/.test(cls)) return 12;
  if (/\brounded-lg\b/.test(cls)) return 8;
  if (/\brounded-md\b/.test(cls)) return 6;
  if (/\brounded-sm\b/.test(cls)) return 2;
  if (/\brounded\b/.test(cls)) return 4;
  return null;
}

function bestAncestryExample(example, minWidth) {
  const ancestry = example && example.ancestry ? example.ancestry : [];
  for (const item of ancestry) {
    const bounds = item.bounds || {};
    if (Number(bounds.width || 0) >= (minWidth || 0) && Number(bounds.width || 0) > 0 && Number(bounds.height || 0) > 0) return item;
  }
  return null;
}

function exampleBounds(example) {
  const bounds = example && example.bounds ? example.bounds : {};
  return {
    x: Number(bounds.x || example && example.x || 0),
    y: Number(bounds.y || example && example.y || 0),
    width: Number(bounds.width || example && example.width || 0),
    height: Number(bounds.height || example && example.height || 0)
  };
}

function observedPatternLabel(component, fallback) {
  const example = bestComponentExample(component, 80);
  const raw = String((example && example.text) || componentDisplayName(component) || fallback || "").trim();
  if (!String(example && example.text || "").trim() && isWeakPatternLabel(raw)) return fallback || categoryLabel(component && component.category || "component");
  return raw
    .replace(/\s+(Button|Link|Input)$/i, "")
    .replace(/^Sidebar\s+/i, "")
    .replace(/\s+/g, " ")
    .trim() || fallback || categoryLabel(component && component.category || "component");
}

function isWeakPatternLabel(value) {
  const label = String(value || "").trim();
  if (!label) return true;
  if (/^[a-f0-9]{6,}\s+(Button|Link|Menu Item)$/i.test(label)) return true;
  if (/^(Sidebar\s+)?(Button|Menu Item|Link|Navigation)$/i.test(label)) return true;
  if (/^(Icon|Asset)\s+/i.test(label)) return true;
  if (/打开[“"].+[”"]|取消置顶|已置顶对话|项目选项|聊天板|海报prompt|prompt/i.test(label)) return true;
  return false;
}

function patternComponentsByEvidence(pattern, predicate) {
  return (pattern.components || [])
    .filter(predicate || (() => true))
    .sort((a, b) => componentPatternEvidenceScore(b) - componentPatternEvidenceScore(a) || String(componentDisplayName(a)).localeCompare(String(componentDisplayName(b))));
}

function componentPatternEvidenceScore(component) {
  const example = bestComponentExample(component, 80);
  const bounds = exampleBounds(example);
  const labelPenalty = isWeakPatternLabel(componentDisplayName(component)) ? -8 : 0;
  const navigationPenalty = component.category === "navigation" ? -35 : 0;
  const iconChildPenalty = bounds.width <= 28 && bounds.height <= 28 ? -12 : 0;
  return (component.confidence || 0) * 100 + Math.min(30, bounds.width / 10) + ((component.assets || []).length ? 20 : 0) + ((component.assetRefs || []).length ? 10 : 0) + labelPenalty + navigationPenalty + iconChildPenalty;
}

function componentForPatternRow(pattern, fallbackPredicate) {
  const candidates = patternComponentsByEvidence(pattern, fallbackPredicate || (() => true));
  return candidates[0] || null;
}

function observedPaint(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)") return null;
  if (raw.charAt(0) !== "#" && !/^rgba?\(/i.test(raw)) return null;
  const rgba = parseCssColor(raw);
  if (!rgba || rgba.a <= 0.02) return null;
  return {
    type: "SOLID",
    color: { r: rgba.r, g: rgba.g, b: rgba.b },
    opacity: rgba.a
  };
}

function observedTextColor(styles, fallback) {
  const paint = observedPaint(styles && styles.color);
  if (!paint) return fallback || "#111111";
  return rgbToHex(paint.color);
}

function rgbToHex(color) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round((Number(value) || 0) * 255))).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function applyObservedFrameStyle(node, example, options) {
  const opts = options || {};
  const rawStyles = example && example.styles ? example.styles : {};
  const styles = Object.assign({}, rawStyles, syntheticStylesForClass(example && example.className, rawStyles));
  const fill = observedPaint(styles.backgroundColor) || observedPaint(styles.effectiveBackgroundColor) || observedPaint(opts.fallbackFill);
  node.fills = fill ? [fill] : [];
  const radius = parseReplicaRadius(styles.borderRadius);
  node.cornerRadius = Number.isFinite(radius) && radius > 0 ? radius : (opts.fallbackRadius || 0);
  const stroke = observedPaint(styles.borderColor) || observedPaint(opts.fallbackStroke);
  node.strokes = stroke ? [stroke] : [];
  if (styles.boxShadow) {
    const effects = parseBoxShadow(styles.boxShadow).slice(0, 3);
    if (effects.length) node.effects = effects;
  } else if (opts.fallbackEffects) {
    node.effects = opts.fallbackEffects;
  }
  if (styles.opacity !== undefined && styles.opacity !== null) node.opacity = clamp(Number(styles.opacity), 0, 1);
}

function createObservedPatternIcon(assets, size, color) {
  const icon = createComponentPreviewIcon(assets || [], size || 16, color || "#111111");
  if (!icon) return null;
  icon.name = "Observed icon";
  icon.resize(size || 16, size || 16);
  return icon;
}

function patternDraftCard(pattern, assetIndex) {
  const cardWidth = patternCardWidth(pattern);
  const contentWidth = cardWidth - 40;
  const card = figma.createFrame();
  card.name = `${pattern.title} Pattern Draft`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 10;
  card.paddingTop = 14;
  card.paddingRight = 14;
  card.paddingBottom = 14;
  card.paddingLeft = 14;
  card.resize(cardWidth, 300);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(card);

  const title = text(pattern.title, 14, "Semi Bold", "#111111");
  title.resize(contentWidth, 18);
  card.appendChild(title);
  const meta = text(`${l("draft, inferred", "草稿，推断", "草稿，推断 / draft, inferred")} | ${fieldLabel("confidence")}: ${Math.round((pattern.confidence || 0.45) * 100)}% | ${fieldLabel("source")}: ${sourceIdSummary(pattern.sourceIds || [], 3)}`, 9, "Regular", "#666666");
  meta.resize(contentWidth, 14);
  card.appendChild(meta);
  const note = text(pattern.note, 10, "Regular", "#555555");
  resizeTextBlock(note, contentWidth, 28);
  card.appendChild(note);
  card.appendChild(patternDraftComponent(pattern, assetIndex, contentWidth));
  return card;
}

function patternCardWidth(pattern) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const width = Number(bounds.width || 0);
  if (pattern.type === "header") return 1120;
  if (pattern.type === "composer") return Math.max(620, Math.min(940, width + 96 || 820));
  if (pattern.type === "sidebar") return 660;
  return 540;
}

function patternDraftComponent(pattern, assetIndex, maxWidth) {
  const body = patternPreview(pattern, assetIndex, maxWidth);
  const component = figma.createComponent();
  component.name = `${pattern.title} / Pattern Draft`;
  component.description = [
    "pattern draft component",
    `type: ${pattern.type}`,
    `confidence: ${Math.round((pattern.confidence || 0) * 100)}%`,
    `source ids: ${(pattern.sourceIds || []).join(", ") || "unknown"}`,
    "generation strategy: fixed reusable structure plus trustworthy observed style evidence",
    "observed styles/assets are used where reliable; weak labels and unsafe icon matches are intentionally replaced with stable semantic placeholders"
  ].join("\n");
  component.layoutMode = "VERTICAL";
  component.itemSpacing = 0;
  component.paddingTop = 0;
  component.paddingRight = 0;
  component.paddingBottom = 0;
  component.paddingLeft = 0;
  component.fills = [];
  component.clipsContent = false;
  component.resize(Math.min(maxWidth || body.width || 500, body.width || maxWidth || 500), body.height || 160);
  component.appendChild(body);
  setVerticalAutoHeight(component);
  return component;
}

function patternPreview(pattern, assetIndex, maxWidth) {
  if (pattern.type === "headerRegion" || pattern.type === "navigationRegion" || pattern.type === "breadcrumbRegion" || pattern.type === "sidebarRegion" || pattern.type === "menuRegion" || pattern.type === "listRegion") return genericContainerPatternPreview(pattern, maxWidth);
  if (pattern.type === "formRegion" || pattern.type === "inputRegion") return formRegionPatternPreview(pattern, maxWidth);
  if (pattern.type === "cardGridRegion") return cardGridPatternPreview(pattern, maxWidth);
  if (pattern.type === "tableRegion") return tableRegionPatternPreview(pattern, maxWidth);
  if (pattern.type === "overlayRegion") return overlayRegionPatternPreview(pattern, maxWidth);
  if (pattern.type === "sidebar") return sidebarPatternPreview(pattern, assetIndex, maxWidth);
  if (pattern.type === "sidebarItem") return stableSidebarItemsPreview(maxWidth);
  if (pattern.type === "conversationRow") return stableConversationRowsPreview(maxWidth);
  if (pattern.type === "projectRow") return stableProjectRowsPreview(maxWidth);
  if (pattern.type === "composer") return composerPatternPreview(pattern, assetIndex, maxWidth);
  if (pattern.type === "promptActions") return promptActionsPatternPreview(pattern, assetIndex, maxWidth);
  if (pattern.type === "menuGroup") return menuGroupPatternPreview(pattern, assetIndex, maxWidth);
  if (pattern.type === "header") return headerPatternPreview(pattern, assetIndex, maxWidth);
  if (pattern.type === "popover") return popoverPatternPreview(pattern, assetIndex, maxWidth);
  return listRowSetPreview(pattern, assetIndex, [pattern.title], maxWidth);
}

function genericContainerPatternPreview(pattern, maxWidth) {
  const example = firstContainerExample(pattern.container);
  const bounds = containerBounds(pattern.container);
  const width = Math.min(maxWidth || 520, pattern.type === "headerRegion" ? 880 : 520);
  const height = pattern.type === "headerRegion" || pattern.type === "navigationRegion" ? 132 : 190;
  const surface = patternSurface(width, height);
  surface.itemSpacing = 8;
  applyObservedFrameStyle(surface, example, { fallbackFill: "#f7f7f8", fallbackRadius: 8 });
  const title = text(pattern.title, 12, "Semi Bold", observedTextColor(example.styles || {}, "#222222"));
  title.resize(width - 28, 18);
  surface.appendChild(title);
  const childItems = containerSummaryItems(pattern.container && pattern.container.childSummary || {}).slice(0, 5);
  if (childItems.length) {
    for (const item of childItems) {
      surface.appendChild(anatomyPill(`${categoryLabel(item.name)} (${item.count})`));
    }
  } else {
    const note = text(l("Container anatomy will be refined from more captured states.", "容器结构会随着更多状态采集继续细化。", "容器结构会随采集细化 / Container anatomy will refine with more captures."), 10, "Regular", "#666666");
    note.resize(width - 28, 28);
    surface.appendChild(note);
  }
  const size = text(`${Math.round(bounds.width || 0)} x ${Math.round(bounds.height || 0)}px`, 9, "Regular", "#777777");
  size.resize(width - 28, 14);
  surface.appendChild(size);
  return surface;
}

function formRegionPatternPreview(pattern, maxWidth) {
  const bounds = containerBounds(pattern.container);
  const surfaceWidth = Math.min(maxWidth || 680, 760);
  const surface = patternSurface(surfaceWidth, 170);
  surface.itemSpacing = 10;
  const input = figma.createFrame();
  input.name = "Observed form field shell";
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";
  input.itemSpacing = 8;
  input.paddingLeft = 14;
  input.paddingRight = 14;
  input.resize(clamp(bounds.width || 420, 260, surfaceWidth - 42), 42);
  applyObservedFrameStyle(input, firstContainerExample(pattern.container), { fallbackFill: "#ffffff", fallbackStroke: "#dedede", fallbackRadius: 10 });
  const label = text(l("Input value / placeholder", "输入内容 / 占位文本", "输入内容 / Input placeholder"), 12, "Regular", "#666666");
  label.resize(input.width - 28, 16);
  input.appendChild(label);
  surface.appendChild(input);

  const row = figma.createFrame();
  row.name = "Observed form evidence";
  row.layoutMode = "HORIZONTAL";
  row.layoutWrap = "WRAP";
  row.itemSpacing = 8;
  row.counterAxisSpacing = 8;
  row.fills = [];
  row.resize(surfaceWidth - 20, 1);
  setWrappedAutoHeight(row);
  const evidence = containerSummaryItems(pattern.container && pattern.container.childSummary || {}).filter((item) => ["text-input", "select", "checkbox", "radio", "switch", "button", "form-field"].indexOf(item.name) >= 0);
  if (evidence.length) {
    for (const item of evidence.slice(0, 6)) row.appendChild(evidencePill(`${categoryLabel(item.name)} (${item.count})`));
  } else {
    row.appendChild(evidencePill(l("No confirmed reusable controls", "没有确认的可复用控件", "没有确认的可复用控件 / No confirmed controls")));
  }
  surface.appendChild(row);
  return surface;
}

function evidencePill(label) {
  const pill = figma.createFrame();
  pill.name = `${label} evidence`;
  pill.layoutMode = "HORIZONTAL";
  pill.counterAxisAlignItems = "CENTER";
  pill.paddingLeft = 10;
  pill.paddingRight = 10;
  pill.resize(150, 28);
  pill.cornerRadius = 999;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  const labelNode = text(label, 10, "Regular", "#555555");
  labelNode.resize(130, 14);
  pill.appendChild(labelNode);
  return pill;
}

function simpleControlPill(label, kind) {
  const pill = figma.createFrame();
  pill.name = `${label} control example`;
  pill.layoutMode = "HORIZONTAL";
  pill.counterAxisAlignItems = "CENTER";
  pill.itemSpacing = 8;
  pill.paddingLeft = 10;
  pill.paddingRight = 12;
  pill.resize(140, 34);
  pill.cornerRadius = kind === "button" ? 999 : 8;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  if (kind === "switch") {
    const track = figma.createFrame();
    track.name = "Switch track";
    track.resize(28, 16);
    track.cornerRadius = 999;
    track.fills = [{ type: "SOLID", color: hexToRgb("#d8d8d8") }];
    pill.appendChild(track);
  } else if (kind === "checkbox") {
    const box = figma.createFrame();
    box.name = "Checkbox indicator";
    box.resize(14, 14);
    box.cornerRadius = 3;
    box.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
    box.strokes = [{ type: "SOLID", color: hexToRgb("#999999") }];
    pill.appendChild(box);
  }
  const textNode = text(label, 10, "Regular", "#333333");
  textNode.resize(86, 14);
  pill.appendChild(textNode);
  return pill;
}

function createNoReusableComponentsNote(parent, components) {
  const frame = figma.createFrame();
  frame.name = l("No reusable components promoted", "未发现可晋升通用组件", "未发现可晋升通用组件 / No reusable components promoted");
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 8;
  frame.paddingTop = 14;
  frame.paddingRight = 16;
  frame.paddingBottom = 14;
  frame.paddingLeft = 16;
  frame.resize(1120, 1);
  frame.cornerRadius = 8;
  frame.fills = [{ type: "SOLID", color: hexToRgb("#fffaf0") }];
  frame.strokes = [{ type: "SOLID", color: hexToRgb("#ead7b7") }];
  setVerticalAutoHeight(frame);
  parent.appendChild(frame);

  const title = text(l("No reusable component passed the promotion rules", "没有组件通过可复用晋升规则", "没有组件通过可复用晋升规则 / No reusable component passed promotion"), 13, "Semi Bold", "#5f3b00");
  title.resize(1060, 18);
  frame.appendChild(title);
  const counts = componentPromotionBlockerCounts(components || []);
  const note = text(l(
    "The importer kept these items as page patterns or trace-only samples because the evidence is page-specific, low-confidence, review-only, or icon-only. This avoids presenting placeholders as a real component library.",
    "这些项目被保留为页面模式或仅追踪样本，因为证据偏页面实例、置信度不足、仍需复核，或只是图标节点。这样可以避免把占位结构误当成真实组件库。",
    "这些项目被保留为页面模式或追踪样本 / Items are retained as patterns or trace-only samples to avoid false component promotion."
  ), 11, "Regular", "#6b4a16");
  resizeTextBlock(note, 1060, 36);
  frame.appendChild(note);
  const summary = text(`${l("Main blockers", "主要阻断原因", "主要阻断原因 / Main blockers")}: ${counts}`, 10, "Regular", "#7a5a24");
  summary.resize(1060, 16);
  frame.appendChild(summary);
}

function componentPromotionBlockerCounts(components) {
  const totals = { page: 0, review: 0, confidence: 0, warning: 0 };
  for (const component of components || []) {
    const category = component.category || "other";
    if (genericComponentCategories().indexOf(category) < 0) continue;
    const minConfidence = ["checkbox", "radio", "switch", "tag", "card", "form-field", "breadcrumb"].indexOf(category) >= 0 ? 0.65 : 0.72;
    if ((component.confidence || 0) < minConfidence) totals.confidence += 1;
    if ((component.reviewStatus || "") !== "candidate") totals.review += 1;
    if (isPageSpecificComponent(component)) totals.page += 1;
    if (hasHighRiskComponentWarning(component)) totals.warning += 1;
  }
  return [
    `${l("page-specific", "页面实例", "页面实例 / page-specific")} ${totals.page}`,
    `${l("needs review", "待复核", "待复核 / needs review")} ${totals.review}`,
    `${l("low confidence", "低置信度", "低置信度 / low confidence")} ${totals.confidence}`,
    `${l("warnings", "警告", "警告 / warnings")} ${totals.warning}`
  ].join(" · ");
}

function cardGridPatternPreview(pattern, maxWidth) {
  const surface = patternSurface(Math.min(maxWidth || 640, 640), 190);
  surface.layoutMode = "HORIZONTAL";
  surface.layoutWrap = "WRAP";
  surface.itemSpacing = 10;
  surface.counterAxisSpacing = 10;
  for (let index = 0; index < 4; index += 1) {
    const card = figma.createFrame();
    card.name = "Card pattern";
    card.layoutMode = "VERTICAL";
    card.itemSpacing = 8;
    card.paddingTop = 12;
    card.paddingRight = 12;
    card.paddingBottom = 12;
    card.paddingLeft = 12;
    card.resize(136, 72);
    card.cornerRadius = 8;
    card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
    card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
    card.appendChild(text(l("Card title", "卡片标题", "卡片标题 / Card title"), 11, "Semi Bold", "#222222"));
    card.appendChild(text(l("Supporting content", "辅助内容", "辅助内容 / Supporting content"), 9, "Regular", "#666666"));
    surface.appendChild(card);
  }
  return surface;
}

function tableRegionPatternPreview(pattern, maxWidth) {
  const surface = patternSurface(Math.min(maxWidth || 640, 640), 180);
  surface.itemSpacing = 0;
  for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
    const row = figma.createFrame();
    row.name = `Table row ${rowIndex + 1}`;
    row.layoutMode = "HORIZONTAL";
    row.itemSpacing = 0;
    row.resize(surface.width - 20, 32);
    row.fills = [{ type: "SOLID", color: hexToRgb(rowIndex === 0 ? "#f0f0f0" : "#ffffff") }];
    row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
    for (let cellIndex = 0; cellIndex < 3; cellIndex += 1) {
      const cell = text(rowIndex === 0 ? l("Column", "列", "列 / Column") : l("Cell", "单元格", "单元格 / Cell"), 10, rowIndex === 0 ? "Semi Bold" : "Regular", "#333333");
      cell.resize((surface.width - 20) / 3, 16);
      row.appendChild(cell);
    }
    surface.appendChild(row);
  }
  return surface;
}

function overlayRegionPatternPreview(pattern, maxWidth) {
  const surface = patternSurface(Math.min(maxWidth || 520, 520), 190);
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";
  const panel = figma.createFrame();
  panel.name = "Overlay panel";
  panel.layoutMode = "VERTICAL";
  panel.itemSpacing = 8;
  panel.paddingTop = 16;
  panel.paddingRight = 16;
  panel.paddingBottom = 16;
  panel.paddingLeft = 16;
  panel.resize(300, 112);
  panel.cornerRadius = 10;
  panel.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  panel.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  panel.effects = [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.10 }, offset: { x: 0, y: 12 }, radius: 28, spread: 0, visible: true, blendMode: "NORMAL" }];
  panel.appendChild(text(pattern.title, 12, "Semi Bold", "#111111"));
  panel.appendChild(text(l("Floating surface with actions or options.", "承载操作或选项的浮动界面层。", "承载操作或选项的浮层 / Floating surface with actions."), 10, "Regular", "#555555"));
  surface.appendChild(panel);
  return surface;
}

function stableSidebarItemsPreview(maxWidth) {
  return stableRowsPreview(Math.min(maxWidth || 500, 500), [
    { label: l("New chat", "新聊天", "新聊天 / New chat"), icon: "edit", selected: true },
    { label: l("Search chats", "搜索聊天", "搜索聊天 / Search chats"), icon: "search" },
    { label: l("Library", "文件库", "文件库 / Library"), icon: "library" },
    { label: l("Apps", "应用", "应用 / Apps"), icon: "apps" },
    { label: l("More", "更多", "更多 / More"), icon: "more" }
  ], { width: 233, height: 36 });
}

function stableConversationRowsPreview(maxWidth) {
  return stableRowsPreview(Math.min(maxWidth || 500, 500), [
    { label: l("Pinned conversation", "置顶会话", "置顶会话 / Pinned conversation"), icon: "pin" },
    { label: l("Conversation title", "会话标题", "会话标题 / Conversation title"), icon: "chat" },
    { label: l("Selected conversation", "选中会话", "选中会话 / Selected conversation"), icon: "chat", selected: true }
  ], { width: 233, height: 36 });
}

function stableProjectRowsPreview(maxWidth) {
  return stableRowsPreview(Math.min(maxWidth || 500, 500), [
    { label: l("Project name", "项目名称", "项目名称 / Project name"), icon: "folder" },
    { label: l("Project row", "项目行", "项目行 / Project row"), icon: "folder" },
    { label: l("Selected project", "选中项目", "选中项目 / Selected project"), icon: "folder", selected: true }
  ], { width: 233, height: 36 });
}

function stableRowsPreview(surfaceWidth, rows, options) {
  const opts = options || {};
  const surface = patternSurface(surfaceWidth, Math.max(164, rows.length * 44 + 20));
  surface.itemSpacing = 6;
  surface.paddingTop = 10;
  surface.paddingLeft = 10;
  surface.paddingRight = 10;
  for (const row of rows || []) {
    surface.appendChild(rowPatternPreview(row.label, true, opts.width || 233, !!row.selected, {
      iconKind: row.icon,
      allowSemanticIcon: !!opts.allowSemanticIcon,
      forceLabel: row.label,
      forceWidth: opts.width || 233,
      forceHeight: opts.height || 36,
      fallbackFill: row.selected ? "#0000000d" : "",
      maxWidth: opts.width || 233,
      example: stableRowExample(row.selected)
    }));
  }
  return surface;
}

function stableRowExample(selected) {
  return {
    bounds: { width: 233, height: 36 },
    className: selected ? "group __menu-item hoverable gap-1.5 bg-token-surface-hover rounded-lg" : "group __menu-item hoverable gap-1.5 rounded-lg",
    styles: {
      backgroundColor: selected ? "#0000000d" : "transparent",
      color: "#0d0d0d",
      borderRadius: "10px",
      fontSize: 14,
      lineHeight: 20
    }
  };
}

function patternSurface(width, height) {
  const surface = figma.createFrame();
  surface.name = "Pattern preview";
  surface.layoutMode = "VERTICAL";
  surface.itemSpacing = 8;
  surface.paddingTop = 10;
  surface.paddingRight = 10;
  surface.paddingBottom = 10;
  surface.paddingLeft = 10;
  surface.resize(width, height);
  surface.cornerRadius = 8;
  surface.clipsContent = true;
  surface.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  return surface;
}

function sidebarPatternPreview(pattern, assetIndex, maxWidth) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const surfaceWidth = Math.min(maxWidth || 620, 620);
  const surface = patternSurface(surfaceWidth, 190);
  surface.layoutMode = "HORIZONTAL";
  surface.itemSpacing = 12;

  const sidebar = figma.createFrame();
  sidebar.name = "Sidebar pattern";
  sidebar.layoutMode = "VERTICAL";
  sidebar.itemSpacing = 6;
  sidebar.paddingTop = 10;
  sidebar.paddingRight = 8;
  sidebar.paddingBottom = 10;
  sidebar.paddingLeft = 8;
  const sidebarWidth = clamp(bounds.width || 245, 210, Math.min(300, surfaceWidth - 260));
  sidebar.resize(sidebarWidth, 164);
  applyObservedFrameStyle(sidebar, firstContainerExample(pattern.container), { fallbackFill: "#f9f9f9", fallbackRadius: 0 });
  surface.appendChild(sidebar);

  const rowWidth = sidebarWidth - 16;
  const rowComponents = patternComponentsByEvidence(pattern, (component) => component.category === "menu-item" || component.category === "link").slice(0, 3);
  const fallbackRows = [l("新聊天", "新聊天", "新聊天 / New chat"), l("搜索聊天", "搜索聊天", "搜索聊天 / Search chats"), l("探索 GPT", "探索 GPT", "探索 GPT / Explore GPTs")];
  for (let index = 0; index < 2; index += 1) {
    const component = rowComponents[index];
    const example = component ? bestComponentExample(component, 120) : {};
    sidebar.appendChild(rowPatternPreview(observedPatternLabel(component, fallbackRows[index]), true, rowWidth, index === 0, {
      component,
      example,
      assets: patternAssetsForComponent(component, example, assetIndex),
      maxWidth: rowWidth
    }));
  }
  sidebar.appendChild(patternSectionLabel("GPT"));
  const third = rowComponents[2];
  const thirdExample = third ? bestComponentExample(third, 120) : {};
  sidebar.appendChild(rowPatternPreview(observedPatternLabel(third, fallbackRows[2]), true, rowWidth, false, {
    component: third,
    example: thirdExample,
    assets: patternAssetsForComponent(third, thirdExample, assetIndex),
    maxWidth: rowWidth
  }));

  const structure = figma.createFrame();
  structure.name = "Sidebar anatomy";
  structure.layoutMode = "VERTICAL";
  structure.itemSpacing = 8;
  structure.fills = [];
  structure.resize(Math.max(230, surfaceWidth - sidebarWidth - 42), 164);
  surface.appendChild(structure);
  structure.appendChild(anatomyPill(l("Header / tools", "顶部工具区", "顶部工具区 / Header tools")));
  structure.appendChild(anatomyPill(l("Primary navigation rows", "主导航行", "主导航行 / Navigation rows")));
  structure.appendChild(anatomyPill(l("Conversation / project rows", "会话 / 项目行", "会话 / 项目行 / List rows")));
  structure.appendChild(anatomyPill(l("Account footer", "账户底部区", "账户底部区 / Account footer")));
  return surface;
}

function rowPatternFromPattern(pattern, assetIndex, maxWidth, fallbackLabel) {
  const component = componentForPatternRow(pattern, (item) => item.category === "menu-item" || item.category === "link" || item.category === "navigation");
  const example = component ? bestComponentExample(component, 120) : {};
  return rowPatternPreview(observedPatternLabel(component, fallbackLabel), true, maxWidth || 472, false, {
    component,
    example,
    assets: patternAssetsForComponent(component, example, assetIndex),
    maxWidth: maxWidth || 472
  });
}

function rowPatternPreview(label, hasIcon, width, selected, options) {
  const opts = options || {};
  const example = opts.example || {};
  const bounds = exampleBounds(example);
  const textValue = String((example && example.text) || "").trim();
  const compactIconOnly = hasIcon && !textValue && Number(bounds.width || 0) > 0 && Number(bounds.width || 0) <= 72;
  const minWidth = compactIconOnly ? 32 : 120;
  const targetWidth = clamp(bounds.width || width || 220, minWidth, opts.maxWidth || width || 472);
  const targetHeight = clamp(bounds.height || 32, 28, 56);
  const styles = example.styles || {};
  const row = figma.createFrame();
  row.name = `${label} row pattern`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = observedGapFromClass(example.className, 8);
  row.counterAxisAlignItems = "CENTER";
  row.primaryAxisAlignItems = compactIconOnly ? "CENTER" : "MIN";
  row.paddingLeft = compactIconOnly ? 0 : observedPaddingStartFromClass(example.className, hasIcon ? 8 : 10);
  row.paddingRight = compactIconOnly ? 0 : observedPaddingEndFromClass(example.className, 8);
  row.resize(targetWidth, targetHeight);
  applyObservedFrameStyle(row, example, {
    fallbackFill: opts.fallbackFill !== undefined ? opts.fallbackFill : (selected ? "#0000000d" : "#ffffff"),
    fallbackStroke: "",
    fallbackRadius: 10
  });
  const assets = opts.assets || [];
  const icon = hasIcon ? (opts.iconKind && opts.allowSemanticIcon ? genericPatternIcon(opts.iconKind, 16, styles.color || "#111111") : createObservedPatternIcon(assets, 16, styles.color || "#111111")) : null;
  if (icon) row.appendChild(icon);
  if (!icon && hasIcon && !compactIconOnly) row.appendChild(patternIconSlot(16, "unresolved icon slot"));
  const hasVisualIconSlot = !!icon || (!icon && hasIcon && !compactIconOnly);
  const labelWidth = targetWidth - row.paddingLeft - row.paddingRight - (hasVisualIconSlot ? 24 + row.itemSpacing : 0);
  if (!compactIconOnly && labelWidth >= 36) {
    const labelValue = opts.forceLabel || label;
    const fontSize = opts.labelFontSize || 12;
    const labelNode = text(truncate(labelValue, Math.max(12, Math.floor(targetWidth / 9))), fontSize, "Medium", observedTextColor(styles, "#222222"));
    labelNode.resize(labelWidth, Math.max(16, fontSize + 4));
    row.appendChild(labelNode);
  }
  return row;
}

function genericPatternIcon(kind, size, color) {
  const stroke = normalizeSvgColor(color || "#111111");
  const svg = genericPatternIconSvg(kind, stroke);
  try {
    const node = figma.createNodeFromSvg(svg);
    node.name = `${kind} icon`;
    node.resize(size || 16, size || 16);
    return node;
  } catch (error) {
    return null;
  }
}

function patternIconSlot(size, name) {
  const slot = figma.createFrame();
  slot.name = name || "Icon slot / unresolved";
  const finalSize = size || 16;
  slot.resize(finalSize, finalSize);
  slot.cornerRadius = Math.max(3, Math.round(finalSize / 4));
  slot.fills = [];
  slot.strokes = [{ type: "SOLID", color: hexToRgb("#b8b8b8"), opacity: 0.75 }];
  return slot;
}

function genericPatternIconSvg(kind, stroke) {
  const common = `width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  const s = stroke || "#111111";
  if (kind === "edit") return `<svg ${common}><path d="M3.5 11.8h2.1l6.2-6.2a1.5 1.5 0 0 0-2.1-2.1L3.5 9.7v2.1Z" stroke="${s}" stroke-width="1.35" stroke-linejoin="round"/><path d="M8.8 4.4 11 6.6" stroke="${s}" stroke-width="1.35" stroke-linecap="round"/></svg>`;
  if (kind === "search") return `<svg ${common}><circle cx="7" cy="7" r="4.2" stroke="${s}" stroke-width="1.35"/><path d="m10.2 10.2 2.8 2.8" stroke="${s}" stroke-width="1.35" stroke-linecap="round"/></svg>`;
  if (kind === "library") return `<svg ${common}><path d="M3 4.2v8.2M6.3 3.4v9M9.7 3.8v8.6M12.9 4.8v7.6" stroke="${s}" stroke-width="1.35" stroke-linecap="round"/><path d="M2.4 12.5h11.2" stroke="${s}" stroke-width="1.35" stroke-linecap="round"/></svg>`;
  if (kind === "apps") return `<svg ${common}><circle cx="4.2" cy="4.2" r="1.2" stroke="${s}" stroke-width="1.25"/><circle cx="8" cy="4.2" r="1.2" stroke="${s}" stroke-width="1.25"/><circle cx="11.8" cy="4.2" r="1.2" stroke="${s}" stroke-width="1.25"/><circle cx="4.2" cy="8" r="1.2" stroke="${s}" stroke-width="1.25"/><circle cx="8" cy="8" r="1.2" stroke="${s}" stroke-width="1.25"/><circle cx="11.8" cy="8" r="1.2" stroke="${s}" stroke-width="1.25"/></svg>`;
  if (kind === "more") return `<svg ${common}><circle cx="3.8" cy="8" r="1" fill="${s}"/><circle cx="8" cy="8" r="1" fill="${s}"/><circle cx="12.2" cy="8" r="1" fill="${s}"/></svg>`;
  if (kind === "pin") return `<svg ${common}><path d="m9.4 2.8 3.8 3.8-2.4.8-2 2 1 2.8-.7.7-3-3-3.1 3.1-.7-.7 3.1-3.1-3-3 .7-.7 2.8 1 2-2 .8-2.4Z" stroke="${s}" stroke-width="1.15" stroke-linejoin="round"/></svg>`;
  if (kind === "chat") return `<svg ${common}><path d="M3.1 4.4a3 3 0 0 1 3-3h3.8a3 3 0 0 1 3 3v2.7a3 3 0 0 1-3 3H7.5l-3.2 2.2v-2.5a3 3 0 0 1-1.2-2.4v-3Z" stroke="${s}" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
  if (kind === "folder") return `<svg ${common}><path d="M2.5 5.4a1.4 1.4 0 0 1 1.4-1.4h3l1.2 1.4h4a1.4 1.4 0 0 1 1.4 1.4v4a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4V5.4Z" stroke="${s}" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
  if (kind === "image") return `<svg ${common}><rect x="2.5" y="3" width="11" height="10" rx="2" stroke="${s}" stroke-width="1.25"/><path d="m3.3 11 3.2-3 2.2 2 1.2-1.1 2.8 2.1" stroke="${s}" stroke-width="1.25" stroke-linejoin="round"/><circle cx="10.8" cy="5.7" r=".9" fill="${s}"/></svg>`;
  if (kind === "pencil") return `<svg ${common}><path d="M3.4 11.9h2l6.5-6.5a1.4 1.4 0 0 0-2-2l-6.5 6.5v2Z" stroke="${s}" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
  if (kind === "globe") return `<svg ${common}><circle cx="8" cy="8" r="5.4" stroke="${s}" stroke-width="1.25"/><path d="M2.8 8h10.4M8 2.8c1.4 1.4 2.1 3.1 2.1 5.2S9.4 11.8 8 13.2C6.6 11.8 5.9 10.1 5.9 8S6.6 4.2 8 2.8Z" stroke="${s}" stroke-width="1.25" stroke-linecap="round"/></svg>`;
  if (kind === "mic") return `<svg ${common}><path d="M8 2.7a2 2 0 0 1 2 2v3.1a2 2 0 1 1-4 0V4.7a2 2 0 0 1 2-2Z" stroke="${s}" stroke-width="1.25"/><path d="M4.5 7.6a3.5 3.5 0 0 0 7 0M8 11.2v2.1" stroke="${s}" stroke-width="1.25" stroke-linecap="round"/></svg>`;
  return `<svg ${common}><path d="M8 3v10M3 8h10" stroke="${s}" stroke-width="1.35" stroke-linecap="round"/></svg>`;
}

function patternMiniIcon() {
  const icon = figma.createNodeFromSvg('<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2.5v9M2.5 7h9" stroke="#555" stroke-width="1.4" stroke-linecap="round"/></svg>');
  icon.name = "Generic icon";
  icon.resize(14, 14);
  return icon;
}

function observedGapFromClass(className, fallback) {
  return observedSpacingUtility(className, /\bgap-(\d+(?:\.\d+)?)\b/, fallback);
}

function observedPaddingStartFromClass(className, fallback) {
  const value = observedSpacingUtility(className, /\b(?:ps|pl|px)-(\d+(?:\.\d+)?)\b/, fallback);
  return clamp(value, 0, 48);
}

function observedPaddingEndFromClass(className, fallback) {
  const value = observedSpacingUtility(className, /\b(?:pe|pr|px)-(\d+(?:\.\d+)?)\b/, fallback);
  return clamp(value, 0, 48);
}

function observedSpacingUtility(className, pattern, fallback) {
  const match = String(className || "").match(pattern);
  if (!match) return fallback;
  const scale = Number(match[1]);
  if (!Number.isFinite(scale)) return fallback;
  return scale * 4;
}

function patternSectionLabel(value) {
  const label = text(value, 11, "Semi Bold", "#555555");
  label.resize(174, 14);
  return label;
}

function anatomyPill(value) {
  const pill = figma.createFrame();
  pill.name = value;
  pill.layoutMode = "HORIZONTAL";
  pill.counterAxisAlignItems = "CENTER";
  pill.paddingLeft = 10;
  pill.paddingRight = 10;
  pill.resize(260, 28);
  pill.cornerRadius = 6;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  const label = text(value, 10, "Regular", "#444444");
  label.resize(236, 14);
  pill.appendChild(label);
  return pill;
}

function listRowSetPreview(pattern, assetIndex, labels, maxWidth) {
  const surface = patternSurface(Math.min(maxWidth || 500, 500), 164);
  surface.itemSpacing = 8;
  const components = patternComponentsByEvidence(pattern, (component) => {
    if (component.category === "navigation") return false;
    const example = bestComponentExample(component, 80);
    const bounds = exampleBounds(example);
    return (component.category === "link" || component.category === "menu-item" || component.category === "button") && bounds.width <= 260 && bounds.height <= 56;
  });
  for (let index = 0; index < labels.slice(0, 3).length; index += 1) {
    const component = components[index];
    const example = component ? bestComponentExample(component, 120) : {};
    surface.appendChild(rowPatternPreview(observedPatternLabel(component, labels[index]), true, 472, false, {
      component,
      example,
      assets: patternAssetsForComponent(component, example, assetIndex),
      maxWidth: 472
    }));
  }
  const selectedComponent = components.find((component) => {
    const example = bestComponentExample(component, 120);
    return example && example.styles && observedPaint(example.styles.backgroundColor);
  }) || components[0];
  const selectedExample = selectedComponent ? bestComponentExample(selectedComponent, 120) : {};
  const hover = rowPatternPreview(observedPatternLabel(selectedComponent, l("Hover / selected state", "悬停 / 选中状态", "悬停 / 选中状态 / Hover state")), true, 472, true, {
    component: selectedComponent,
    example: selectedExample,
    assets: patternAssetsForComponent(selectedComponent, selectedExample, assetIndex),
    maxWidth: 472
  });
  surface.appendChild(hover);
  return surface;
}

function composerPatternPreview(pattern, assetIndex, maxWidth) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const surfaceWidth = Math.min(maxWidth || 820, 860);
  const surface = patternSurface(surfaceWidth, 168);
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";

  const composer = figma.createFrame();
  composer.name = "Composer input pattern";
  composer.layoutMode = "HORIZONTAL";
  composer.itemSpacing = 10;
  composer.counterAxisAlignItems = "CENTER";
  composer.paddingLeft = 14;
  composer.paddingRight = 10;
  composer.resize(clamp(bounds.width || 768, 420, surfaceWidth - 56), clamp(bounds.height || 52, 48, 58));
  applyObservedFrameStyle(composer, firstContainerExample(pattern.container), {
    fallbackFill: "#ffffff",
    fallbackStroke: "#dedede",
    fallbackRadius: 28,
    fallbackEffects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.10 }, offset: { x: 0, y: 12 }, radius: 32, spread: 0, visible: true, blendMode: "NORMAL" }]
  });
  surface.appendChild(composer);

  const inputComponent = componentForPatternRow(pattern, (component) => component.category === "text-input");
  const inputExample = inputComponent ? bestComponentExample(inputComponent, 240) : {};
  const inputStyles = inputExample.styles || {};
  const controls = composerControlComponents(pattern);
  composer.appendChild(patternIconSlot(18, "leading action slot"));
  const placeholder = text(l("Ask anything", "有问题，尽管问", "有问题，尽管问 / Ask anything"), inputStyles.fontSize || 14, "Regular", observedTextColor(inputStyles, "#8a8a8a"));
  placeholder.resize(Math.max(160, composer.width - 238), Math.max(18, inputStyles.lineHeight || 18));
  composer.appendChild(placeholder);
  const model = text(l("Advanced", "高级", "高级 / Advanced"), 12, "Regular", "#777777");
  model.resize(44, 16);
  composer.appendChild(model);
  composer.appendChild(patternActionDot(l("Voice / submit action", "语音 / 提交操作位", "语音 / 提交操作位 / Voice action")));
  surface.appendChild(composerQuickActionsPreview(composer.width));
  return surface;
}

function composerControlComponents(pattern) {
  const components = patternComponentsByEvidence(pattern, (component) => component.category === "button");
  return {
    voice: components.find((component) => componentMatchesText(component, /(voice|mic|dictation|听写|语音)/i)),
    submit: components.find((component) => componentMatchesText(component, /(send|submit|发送|提交|提示)/i))
  };
}

function patternPlusIcon() {
  const icon = patternMiniIcon();
  icon.name = "Add action";
  return icon;
}

function patternSendDot() {
  const dot = figma.createEllipse();
  dot.name = "Submit action";
  dot.resize(28, 28);
  dot.fills = [{ type: "SOLID", color: hexToRgb("#111111") }];
  return dot;
}

function patternVoiceButton() {
  const button = figma.createFrame();
  button.name = "Voice action";
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisAlignItems = "CENTER";
  button.counterAxisAlignItems = "CENTER";
  button.resize(28, 28);
  button.cornerRadius = 999;
  button.fills = [{ type: "SOLID", color: hexToRgb("#111111") }];
  const wave = figma.createNodeFromSvg('<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.2 5.8v2.4M5.1 4.5v5M7 3.6v6.8M8.9 4.5v5M10.8 5.8v2.4" stroke="white" stroke-width="1.35" stroke-linecap="round"/></svg>');
  wave.name = "Voice glyph";
  wave.resize(14, 14);
  button.appendChild(wave);
  return button;
}

function patternActionDot(name) {
  const dot = figma.createEllipse();
  dot.name = name || "Action dot";
  dot.resize(28, 28);
  dot.fills = [{ type: "SOLID", color: hexToRgb("#111111") }];
  return dot;
}

function composerQuickActionsPreview(width) {
  const surface = figma.createFrame();
  surface.name = "Composer quick actions";
  surface.layoutMode = "HORIZONTAL";
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";
  surface.itemSpacing = 10;
  surface.fills = [];
  surface.resize(width || 500, 36);
  const actions = [
    { label: l("Generate image", "生成图片", "生成图片 / Generate image"), icon: "image" },
    { label: l("Write or edit", "撰写或编辑", "撰写或编辑 / Write or edit"), icon: "pencil" },
    { label: l("Search", "查找资料", "查找资料 / Search"), icon: "globe" }
  ];
  for (const action of actions) {
    surface.appendChild(patternActionPill(action.label, { example: { bounds: { width: 142, height: 34 }, className: "rounded-full border bg-white text-token-text-secondary" }, assets: [], iconKind: action.icon }));
  }
  return surface;
}

function promptActionsPatternPreview(pattern, assetIndex, width, height) {
  const surface = patternSurface(width || 500, height || 164);
  surface.layoutMode = "HORIZONTAL";
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";
  surface.itemSpacing = 8;
  const actions = [
    { label: l("Generate image", "生成图片", "生成图片 / Generate image"), icon: "image" },
    { label: l("Write or edit", "撰写或编辑", "撰写或编辑 / Write or edit"), icon: "pencil" },
    { label: l("Search", "查找资料", "查找资料 / Search"), icon: "globe" }
  ];
  for (const action of actions) {
    surface.appendChild(patternActionPill(action.label, {
      example: { bounds: { width: 142, height: 34 }, className: "rounded-full border bg-white text-token-text-secondary" },
      assets: [],
      iconKind: action.icon
    }));
  }
  return surface;
}

function patternActionPill(label, options) {
  const opts = options || {};
  const example = opts.example || {};
  const bounds = exampleBounds(example);
  const pill = figma.createFrame();
  pill.name = `${label} action`;
  pill.layoutMode = "HORIZONTAL";
  pill.itemSpacing = 6;
  pill.counterAxisAlignItems = "CENTER";
  pill.paddingLeft = 10;
  pill.paddingRight = 10;
  pill.resize(clamp(bounds.width || 112, 86, 180), clamp(bounds.height || 30, 28, 44));
  applyObservedFrameStyle(pill, example, { fallbackFill: "#ffffff", fallbackStroke: "#dedede", fallbackRadius: 999 });
  const icon = opts.iconKind && opts.allowSemanticIcon ? genericPatternIcon(opts.iconKind, 14, "#777777") : createObservedPatternIcon(opts.assets || [], 14, (example.styles && example.styles.color) || "#555555");
  if (icon) pill.appendChild(icon);
  if (!icon && opts.iconKind) pill.appendChild(patternIconSlot(14, "unresolved action icon slot"));
  const textNode = text(truncate(label, 14), 12, "Regular", "#555555");
  textNode.resize(pill.width - (icon || opts.iconKind ? 40 : 20), 16);
  pill.appendChild(textNode);
  return pill;
}

function menuGroupPatternPreview(pattern, assetIndex, maxWidth) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const surface = patternSurface(Math.min(maxWidth || 500, 500), 164);
  const menu = figma.createFrame();
  menu.name = "Menu group pattern";
  menu.layoutMode = "VERTICAL";
  menu.itemSpacing = 4;
  menu.paddingTop = 8;
  menu.paddingRight = 8;
  menu.paddingBottom = 8;
  menu.paddingLeft = 8;
  const menuWidth = clamp(bounds.width || 260, 220, 360);
  menu.resize(menuWidth, 136);
  applyObservedFrameStyle(menu, firstContainerExample(pattern.container), { fallbackFill: "#ffffff", fallbackStroke: "#e5e5e5", fallbackRadius: 8 });
  surface.appendChild(menu);
  const rows = [
    { label: l("Menu item", "菜单项", "菜单项 / Menu item"), icon: "folder" },
    { label: l("Menu item", "菜单项", "菜单项 / Menu item"), icon: "chat", selected: true },
    { label: l("More actions", "更多操作", "更多操作 / More actions"), icon: "more" }
  ];
  for (const row of rows) {
    menu.appendChild(rowPatternPreview(row.label, true, menuWidth - 16, !!row.selected, {
      iconKind: row.icon,
      forceLabel: row.label,
      forceWidth: menuWidth - 16,
      fallbackFill: row.selected ? "#0000000d" : "#ffffff",
      maxWidth: menuWidth - 16,
      example: stableRowExample(row.selected)
    }));
  }
  return surface;
}

function headerPatternPreview(pattern, assetIndex, maxWidth) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const surface = patternSurface(Math.min(maxWidth || 1040, 1040), 164);
  surface.primaryAxisAlignItems = "CENTER";
  const header = figma.createFrame();
  header.name = "Header pattern";
  header.layoutMode = "HORIZONTAL";
  header.itemSpacing = 12;
  header.counterAxisAlignItems = "CENTER";
  header.paddingLeft = 14;
  header.paddingRight = 14;
  header.resize(clamp(bounds.width || 900, 420, surface.width - 40), clamp(bounds.height || 52, 44, 64));
  applyObservedFrameStyle(header, firstContainerExample(pattern.container), { fallbackFill: "#ffffff", fallbackStroke: "#eeeeee", fallbackRadius: 0 });
  surface.appendChild(header);
  const title = text(l("Page title", "页面标题", "页面标题 / Page title"), 14, "Semi Bold", "#111111");
  title.resize(Math.max(160, header.width - 100), 18);
  header.appendChild(title);
  header.appendChild(patternHeaderActionDot());
  header.appendChild(patternHeaderActionDot());
  return surface;
}

function patternHeaderActionDot() {
  const action = figma.createFrame();
  action.name = l("Observed header action slot", "顶部操作位", "顶部操作位 / Header action slot");
  action.resize(16, 16);
  action.cornerRadius = 4;
  action.fills = [];
  action.strokes = [{ type: "SOLID", color: hexToRgb("#999999") }];
  return action;
}

function popoverPatternPreview(pattern, assetIndex, maxWidth) {
  const bounds = pattern && pattern.container ? containerBounds(pattern.container) : {};
  const surface = patternSurface(Math.min(maxWidth || 500, 500), 164);
  surface.primaryAxisAlignItems = "CENTER";
  surface.counterAxisAlignItems = "CENTER";
  const popover = figma.createFrame();
  popover.name = "Popover pattern";
  popover.layoutMode = "VERTICAL";
  popover.itemSpacing = 8;
  popover.paddingTop = 12;
  popover.paddingRight = 12;
  popover.paddingBottom = 12;
  popover.paddingLeft = 12;
  popover.resize(clamp(bounds.width || 260, 220, 360), clamp(bounds.height || 112, 80, 240));
  applyObservedFrameStyle(popover, firstContainerExample(pattern.container), {
    fallbackFill: "#ffffff",
    fallbackStroke: "#e5e5e5",
    fallbackRadius: 10,
    fallbackEffects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 12 }, radius: 28, spread: 0, visible: true, blendMode: "NORMAL" }]
  });
  surface.appendChild(popover);
  popover.appendChild(rowPatternPreview(l("Action", "操作", "操作 / Action"), false, popover.width - 24, false, { maxWidth: popover.width - 24 }));
  popover.appendChild(rowPatternPreview(l("Action", "操作", "操作 / Action"), false, popover.width - 24, false, { maxWidth: popover.width - 24 }));
  return surface;
}

function reusableComponentModels(components, categories) {
  return filterComponentsByCategories(components, categories)
    .filter((component) => componentPresentationTier(component) === "designSystemComponent");
}

function genericComponentCategories() {
  return ["button", "text-input", "select", "checkbox", "radio", "switch", "tab", "tag", "link", "card", "form-field", "breadcrumb"];
}

function patternOnlyComponentModels(components) {
  return (components || []).filter((component) => componentPresentationTier(component) === "patternOnly");
}

function traceOnlyComponentModels(components) {
  return (components || []).filter((component) => componentPresentationTier(component) === "traceOnly");
}

function componentTierCounts(components) {
  const counts = { core: 0, pattern: 0, trace: 0, highRisk: 0 };
  for (const component of components || []) {
    const tier = componentPresentationTier(component);
    if (tier === "designSystemComponent") counts.core += 1;
    else if (tier === "patternOnly") counts.pattern += 1;
    else counts.trace += 1;
    if (hasHighRiskComponentWarning(component)) counts.highRisk += 1;
  }
  return counts;
}

function componentPresentationTier(component) {
  if (isDesignSystemComponent(component)) return "designSystemComponent";
  if (isPatternOnlyComponent(component)) return "patternOnly";
  return "traceOnly";
}

function isDesignSystemComponent(component) {
  const category = component.category || "other";
  const core = genericComponentCategories().indexOf(category) >= 0;
  if (!core) return false;
  const minConfidence = ["checkbox", "radio", "switch", "tag", "card", "form-field", "breadcrumb"].indexOf(category) >= 0 ? 0.65 : 0.72;
  if ((component.confidence || 0) < minConfidence) return false;
  if ((component.reviewStatus || "") !== "candidate") return false;
  if (isPageSpecificComponent(component)) return false;
  if (hasHighRiskComponentWarning(component)) return false;
  if (category === "button") return isDesignSystemButtonCandidate(component);
  if (category === "link") return isGenericLinkCandidate(component);
  return true;
}

function isDesignSystemButtonCandidate(component) {
  const examples = component.examples || [];
  const first = examples[0] || {};
  const textValue = String(first.text || "").trim();
  if (isGenericActionLabel(textValue)) return true;
  if (hasRenderableComponentIcon(component) && isCompactIconButton(component)) return true;
  const name = String(componentDisplayName(component) || "").trim();
  if (/^(Button|Primary Button|Secondary Button|Icon Button)$/i.test(name)) return true;
  return false;
}

function isCompactIconButton(component) {
  const examples = component.examples || [];
  for (const example of examples.slice(0, 4)) {
    const width = Number(example.width || 0);
    const height = Number(example.height || 0);
    const textValue = String(example.text || "").trim();
    const compact = width > 0 && height > 0 && width <= 64 && height <= 64;
    if (compact && !textValue) return true;
  }
  return false;
}

function isGenericLinkCandidate(component) {
  const textValue = String((component.examples && component.examples[0] && component.examples[0].text) || componentDisplayName(component) || "").trim();
  if (!textValue) return false;
  if (textValue.length > 28) return false;
  if (/(打开|项目|聊天|对话|thread|conversation|project|prompt)/i.test(textValue)) return false;
  return true;
}

function isPatternOnlyComponent(component) {
  const category = component.category || "other";
  if (["menu-item", "navigation"].indexOf(category) >= 0) return true;
  if (category === "link" && !isGenericLinkCandidate(component)) return true;
  if (isPageSpecificComponent(component) && (component.confidence || 0) >= 0.65) return true;
  return false;
}

function isPageSpecificComponent(component) {
  const category = String(component.category || "").toLowerCase();
  if (["menu-item", "navigation"].indexOf(category) >= 0) return true;
  const name = String(componentDisplayName(component) || component.name || "").toLowerCase();
  const examples = component.examples || [];
  const first = examples[0] || {};
  const className = String(first.className || "").toLowerCase();
  const textValue = String(first.text || "").trim();
  const combined = `${name} ${className} ${textValue}`.toLowerCase();
  if (/^[a-f0-9]{6}\s/.test(name)) return true;
  if (componentNameLooksContentSpecific(component)) return true;
  if (combined.indexOf("__menu-item") >= 0) return true;
  if (/(sidebar|menu item|conversation|project|thread|composer link|project-unfurl|nav-item)/i.test(combined)) return true;
  if (/(聊天|对话|项目|置顶|已置顶|取消置顶|打开“|打开 |关闭边栏|个人资料|侧边栏)/.test(combined)) return true;
  for (const example of examples.slice(0, 4)) {
    const width = Number(example.width || 0);
    const height = Number(example.height || 0);
    if (width >= 160 && height <= 52 && String(example.className || "").toLowerCase().indexOf("menu") >= 0) return true;
  }
  return false;
}

function componentNameLooksContentSpecific(component) {
  const displayName = String(componentDisplayName(component) || component.name || "").trim();
  if (!displayName) return false;
  const withoutCategory = displayName.replace(/\b(Button|Link|Menu Item|Navigation|Text Input|Select|Tab|Checkbox|Radio|Switch|Tag|Badge|Card|Form Field|Breadcrumb)\b/gi, "").trim();
  if (withoutCategory.length > 18) return true;
  if (/[，。、“”—]/.test(withoutCategory)) return true;
  return false;
}

function hasRenderableComponentIcon(component) {
  return (component.assets || []).some((asset) => asset && asset.type === "svg" && canRenderSvgAsset(asset));
}

function isGenericActionLabel(value) {
  const label = String(value || "").trim().toLowerCase();
  if (!label) return false;
  const allowed = [
    "生成图片", "撰写或编辑", "查找资料", "编辑", "保存", "取消", "发送", "停止", "更多",
    "generate image", "write or edit", "search", "edit", "save", "cancel", "send", "stop", "more"
  ];
  return allowed.indexOf(label) >= 0;
}

function createPatternOnlyComponentSummarySection(parent, components) {
  const patterns = patternOnlyComponentModels(components);
  if (!patterns.length) return;

  const frame = sectionFrame(l("Page Patterns / Lists & Navigation", "页面模式 / 列表与导航", "页面模式 / 列表与导航 / Page Patterns"));
  parent.appendChild(frame);
  const intro = text(l(
    "Navigation links, sidebar items, conversation rows, and project rows are retained as page patterns instead of reusable components.",
    "导航链接、侧边栏项、会话行和项目行会作为页面模式保留，而不是作为可复用组件展示。",
    "导航与列表内容作为页面模式保留 / Navigation and list items are retained as page patterns."
  ), 12, "Regular", "#555555");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const grouped = groupBy(patterns, patternComponentKind);
  const list = figma.createFrame();
  list.name = "Page pattern summary";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 6;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const key of Object.keys(grouped).sort()) {
    const items = grouped[key] || [];
    list.appendChild(patternSummaryRow(key, items));
  }
}

function patternComponentKind(component) {
  const value = `${componentDisplayName(component)} ${(component.examples && component.examples[0] && component.examples[0].className) || ""}`.toLowerCase();
  if (value.indexOf("composer") >= 0) return l("Composer links/actions", "输入区链接 / 操作", "输入区链接 / Composer actions");
  if (value.indexOf("sidebar") >= 0 || value.indexOf("side") >= 0 || value.indexOf("侧边栏") >= 0) return l("Sidebar items", "侧边栏项", "侧边栏项 / Sidebar items");
  if (value.indexOf("project") >= 0 || value.indexOf("项目") >= 0) return l("Project rows", "项目行", "项目行 / Project rows");
  if (value.indexOf("conversation") >= 0 || value.indexOf("chat") >= 0 || value.indexOf("对话") >= 0 || value.indexOf("聊天") >= 0) return l("Conversation rows", "会话行", "会话行 / Conversation rows");
  if ((component.category || "") === "link") return l("Navigation links", "导航链接", "导航链接 / Navigation links");
  if ((component.category || "") === "menu-item") return l("Menu items", "菜单项", "菜单项 / Menu items");
  return l("Other page patterns", "其他页面模式", "其他页面模式 / Other page patterns");
}

function patternSummaryRow(kind, items) {
  const row = figma.createFrame();
  row.name = `${kind} pattern summary`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 8;
  row.paddingRight = 10;
  row.paddingBottom = 8;
  row.paddingLeft = 10;
  row.resize(1080, 42);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  const title = text(truncate(kind, 36), 11, "Semi Bold", "#111111");
  title.resize(260, 18);
  row.appendChild(title);
  const count = text(`${fieldLabel("instances")}: ${items.length}`, 11, "Regular", "#555555");
  count.resize(150, 18);
  row.appendChild(count);
  const sources = [];
  for (const item of items.slice(0, 8)) appendUniqueLimited(sources, item.sourceComponentIds || [], 12);
  const source = text(`${fieldLabel("source")}: ${sourceIdSummary(sources, 4)}`, 10, "Regular", "#666666");
  source.resize(570, 18);
  row.appendChild(source);
  return row;
}

function appendUniqueLimited(target, values, limit) {
  for (const value of values || []) {
    if (target.length >= limit) return;
    if (target.indexOf(value) < 0) target.push(value);
  }
}

function isPatternReusableComponent(component) {
  const category = component.category || "other";
  const supported = ["button", "text-input", "select", "tab"].indexOf(category) >= 0;
  if (!supported) return false;
  if ((component.confidence || 0) < 0.75) return false;
  if (hasHighRiskComponentWarning(component)) return false;
  const variants = component.variants || {};
  const variantCount = (variants.state || []).length + (variants.size || []).length + (variants.tone || []).length;
  const sourceCount = (component.sourceComponentIds || []).length;
  const hasStructure = (component.slots || []).length > 0 || (component.assets || []).length > 0;
  return sourceCount >= 2 || variantCount >= 4 || hasStructure;
}

function hasHighRiskComponentWarning(component) {
  const highRisk = { "low-contrast": true, "clipped-content": true, "zero-size-node": true };
  return (component.warnings || []).some((warning) => highRisk[warning]);
}

function createTraceOnlyComponentSummarySection(parent, components) {
  const traceOnly = traceOnlyComponentModels(components);
  if (!traceOnly.length) return;

  const frame = sectionFrame(l("Trace-only Component Candidates", "仅追踪组件候选", "仅追踪组件候选 / Trace-only Candidates"));
  parent.appendChild(frame);
  const intro = text(l(
    "These items remain in the file for auditability, but are not promoted into reusable component sheets because confidence, warnings, or page-specific evidence is weak.",
    "这些项目会保留用于审计追踪，但由于置信度、警告或页面特定证据不足，不再晋升到可复用组件样张中。",
    "这些项目仅用于审计追踪 / These items are retained for auditability, not promoted into component sheets."
  ), 12, "Regular", "#555555");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const grouped = groupBy(traceOnly, (component) => component.category || "other");
  const list = figma.createFrame();
  list.name = "Trace-only candidate summary";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 6;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const category of orderedComponentCategories(Object.keys(grouped))) {
    const items = grouped[category] || [];
    const warningCount = items.filter(hasHighRiskComponentWarning).length;
    list.appendChild(traceOnlySummaryRow(category, items.length, warningCount));
  }
}

function traceOnlySummaryRow(category, count, warningCount) {
  const row = figma.createFrame();
  row.name = `${category} trace summary`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 8;
  row.paddingRight = 10;
  row.paddingBottom = 8;
  row.paddingLeft = 10;
  row.resize(1080, 36);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  const label = text(categoryLabel(category), 11, "Semi Bold", "#111111");
  label.resize(220, 18);
  row.appendChild(label);
  const countNode = text(`${fieldLabel("instances")}: ${count}`, 11, "Regular", "#555555");
  countNode.resize(180, 18);
  row.appendChild(countNode);
  const warningNode = text(`${fieldLabel("warnings")}: ${warningCount}`, 11, "Regular", warningCount ? "#9a5b00" : "#555555");
  warningNode.resize(180, 18);
  row.appendChild(warningNode);
  const note = text(l("not promoted to sheets", "未晋升到样张", "未晋升到样张 / not promoted"), 10, "Regular", "#777777");
  note.resize(420, 18);
  row.appendChild(note);
  return row;
}

function summaryPill(label, value) {
  const pill = figma.createFrame();
  pill.name = label;
  pill.layoutMode = "VERTICAL";
  pill.primaryAxisAlignItems = "CENTER";
  pill.counterAxisAlignItems = "CENTER";
  pill.itemSpacing = 4;
  pill.paddingTop = 10;
  pill.paddingRight = 14;
  pill.paddingBottom = 10;
  pill.paddingLeft = 14;
  pill.resize(150, 58);
  pill.cornerRadius = 8;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  pill.appendChild(text(String(value), 14, "Semi Bold", "#111111"));
  pill.appendChild(text(label, 10, "Regular", "#666666"));
  return pill;
}

function createComponentInventorySection(parent, components, categoryFilter) {
  const filteredComponents = filterComponentsByCategories(components, categoryFilter);
  if (!filteredComponents.length) return;

  const frame = sectionFrame(copy("componentInventory"));
  parent.appendChild(frame);

  const intro = text(copy("componentInventoryIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "Component inventory table";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 6;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  const grouped = groupBy(filteredComponents, (component) => component.category || "other");
  const categoryNames = orderedComponentCategories(Object.keys(grouped));
  for (const category of categoryNames) {
    const items = sortComponentsForSheet(dedupeComponentsForSheet(grouped[category]));
    list.appendChild(inventoryRow(category, items));
  }
}

function createComponentSheetsSection(parent, components, isNormalized, categoryFilter) {
  const filteredComponents = filterComponentsByCategories(components, categoryFilter);
  if (!filteredComponents.length) return;

  const frame = sectionFrame(copy("componentSheets"));
  parent.appendChild(frame);

  const intro = text(copy("componentSheetsIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const grouped = groupBy(filteredComponents, (component) => component.category || "other");
  const categories = orderedComponentCategories(Object.keys(grouped));

  for (const category of categories) {
    frame.appendChild(componentSheet(category, grouped[category], isNormalized));
  }
}

function filterComponentsByCategories(components, categories) {
  if (!categories || !categories.length) return components || [];
  const allowed = {};
  for (const category of categories) allowed[category] = true;
  return (components || []).filter((component) => allowed[component.category || "other"]);
}

function createActionControlsSection(parent, components) {
  const groups = actionControlGroups(components || []);
  if (!groups.length) return;

  const frame = sectionFrame(l("Action Controls", "操作控件", "操作控件 / Action Controls"));
  parent.appendChild(frame);

  const intro = text(l("Icon-only and compact action controls, separated from the raw asset catalog for easier reuse.", "图标按钮和紧凑操作控件会从原始资源目录中分离出来，便于复用判断。", "图标按钮和紧凑操作控件 / Icon-only and compact action controls."), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const grid = figma.createFrame();
  grid.name = "Action control grid";
  grid.layoutMode = "HORIZONTAL";
  grid.layoutWrap = "WRAP";
  grid.itemSpacing = 12;
  grid.counterAxisSpacing = 12;
  grid.fills = [];
  grid.resize(1120, 1);
  setWrappedAutoHeight(grid);
  frame.appendChild(grid);

  for (const group of groups.slice(0, 16)) {
    grid.appendChild(actionControlCard(group));
  }
}

function actionControlGroups(components) {
  const used = {};
  const result = [];
  for (const component of components || []) {
    if (!isActionControlComponent(component)) continue;
    const examples = component.examples || [];
    const example = examples[0] || {};
    const key = componentStateStripKey(component, example);
    if (used[key]) continue;
    used[key] = true;
    result.push({
      name: componentStateStripName(component, example),
      model: component,
      variants: orderedComponentVariants(uniqueComponentVariants(componentVariants(component))).slice(0, 4),
      sourceIds: component.sourceComponentIds || [],
      score: componentStateStripScore(component, example)
    });
  }
  return result.sort((a, b) => a.score - b.score || String(a.name).localeCompare(String(b.name)));
}

function isActionControlComponent(component) {
  const examples = component.examples || [];
  const first = examples[0] || {};
  const width = Number(first.width || 0);
  const height = Number(first.height || 0);
  const className = String(first.className || "").toLowerCase();
  const hasIconSlot = (component.slots || []).indexOf("icon") >= 0 || (component.assets || []).length > 0;
  const compact = width > 0 && height > 0 && width <= 64 && height <= 64;
  return component.category === "button" && hasIconSlot && (compact || className.indexOf("icon") >= 0 || className.indexOf("action") >= 0 || className.indexOf("composer") >= 0);
}

function actionControlCard(group) {
  const card = figma.createFrame();
  card.name = `${group.name} Action Control`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 8;
  card.paddingTop = 10;
  card.paddingRight = 10;
  card.paddingBottom = 10;
  card.paddingLeft = 10;
  card.resize(252, 126);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  const stage = figma.createFrame();
  stage.name = "Action preview row";
  stage.layoutMode = "HORIZONTAL";
  stage.itemSpacing = 10;
  stage.counterAxisAlignItems = "CENTER";
  stage.primaryAxisAlignItems = "CENTER";
  stage.resize(232, 48);
  stage.cornerRadius = 6;
  stage.clipsContent = true;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  card.appendChild(stage);

  for (const variant of group.variants.slice(0, 4)) {
    stage.appendChild(actionControlPreviewVariant(group.model, variant));
  }

  const label = text(truncate(group.name, 30), 10, "Semi Bold", "#111111");
  label.resize(232, 14);
  card.appendChild(label);
  const meta = text(`${fieldLabel("source")}: ${sourceIdSummary(group.sourceIds, 2)}`, 9, "Regular", "#666666");
  meta.resize(232, 12);
  card.appendChild(meta);
  return card;
}

function actionControlPreviewVariant(model, variant) {
  const previewVariant = {
    state: variant.state,
    size: "icon",
    tone: variant.tone
  };
  return semanticComponentVariant(model, previewVariant);
}

function createComponentStateStripsSection(parent, components, categoryFilter) {
  const groups = componentStateStripGroups(filterComponentsByCategories(components, categoryFilter));
  if (!groups.length) return;

  const frame = sectionFrame(l("Component State Strips", "组件状态条", "组件状态条 / Component State Strips"));
  parent.appendChild(frame);

  const intro = text(l("Specific component drafts grouped by source shape, with representative states shown side by side.", "根据来源形态归组组件草稿，并并排展示代表性状态。", "根据来源形态归组组件草稿 / Representative states grouped by source shape."), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "State strip list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 14;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const group of groups.slice(0, 12)) {
    list.appendChild(componentStateStripCard(group));
  }
}

function componentStateStripGroups(components) {
  const map = {};
  for (const component of components || []) {
    const examples = component.examples || [];
    const baseExample = examples[0] || {};
    const key = componentStateStripKey(component, baseExample);
    if (!map[key]) {
      map[key] = {
        name: componentStateStripName(component, baseExample),
        category: component.category || "component",
        model: component,
        variants: [],
        sourceIds: {},
        score: componentStateStripScore(component, baseExample)
      };
    } else if (componentStateStripScore(component, baseExample) < map[key].score) {
      map[key].name = componentStateStripName(component, baseExample);
      map[key].model = component;
      map[key].score = componentStateStripScore(component, baseExample);
    }
    addKeys(map[key].sourceIds, component.sourceComponentIds || []);
    const variants = orderedComponentVariants(uniqueComponentVariants(componentVariants(component)));
    for (const variant of variants) {
      if (map[key].variants.length < 16) {
        map[key].variants.push({ model: component, variant });
      }
    }
  }

  const groups = Object.values(map);
  for (const group of groups) {
    group.variants = uniqueStateStripVariants(group.variants);
  }
  return groups.filter((group) => group.variants.length)
    .sort((a, b) => a.score - b.score || String(a.name).localeCompare(String(b.name)));
}

function componentStateStripKey(component, example) {
  const styles = example.styles || {};
  const label = normalizedComponentLabelText(example.text || "");
  const classKey = compactClassSignature(example.className || "");
  return [
    component.category || "component",
    label || classKey || component.name || "",
    Math.round((example.width || 0) / 8) * 8,
    Math.round((example.height || 0) / 4) * 4,
    normalizeHex(styles.backgroundColor || styles.effectiveBackgroundColor || ""),
    normalizeHex(styles.color || "")
  ].join("|");
}

function componentStateStripName(component, example) {
  const displayName = componentDisplayName(component);
  if (displayName) return displayName;
  const label = normalizedComponentLabelText(example.text || "");
  if (label) return titleCase(label);
  const className = String(example.className || "");
  if (className.indexOf("composer") >= 0) return "Composer Action Button";
  if (className.indexOf("sidebar") >= 0) return "Sidebar Item";
  if (className.indexOf("menu") >= 0) return component.category === "button" ? "Icon Action Button" : "Menu Item";
  if (component.category === "text-input") return "Text Input";
  if (component.category === "navigation") return "Navigation Region";
  return component.name || titleCase(component.category || "component");
}

function componentDisplayName(component) {
  if (!component) return "";
  return String(component.displayName || component.semanticName || component.name || "");
}

function normalizedComponentLabelText(value) {
  const textValue = String(value || "").trim();
  if (!textValue) return "";
  if (textValue.length > 40) return "";
  return textValue;
}

function compactClassSignature(value) {
  const parts = String(value || "").split(/\s+/).filter((part) => part && part.indexOf("[") !== 0);
  return parts.slice(0, 4).join(" ");
}

function componentStateStripScore(component, example) {
  let score = componentSortWeight(component);
  const textValue = normalizedComponentLabelText(example.text || "");
  if (textValue) score -= 8;
  if ((component.sourceComponentIds || []).length > 1) score -= 4;
  return score;
}

function uniqueStateStripVariants(items) {
  const used = {};
  const result = [];
  for (const item of items || []) {
    const key = `${item.variant.state}|${item.variant.size}|${item.variant.tone}`;
    if (!used[key]) {
      used[key] = true;
      result.push(item);
    }
  }
  return result.sort((a, b) => {
    const stateDelta = orderValue(a.variant.state, "state") - orderValue(b.variant.state, "state");
    if (stateDelta !== 0) return stateDelta;
    const sizeDelta = orderValue(a.variant.size, "size") - orderValue(b.variant.size, "size");
    if (sizeDelta !== 0) return sizeDelta;
    return orderValue(a.variant.tone, "tone") - orderValue(b.variant.tone, "tone");
  });
}

function componentStateStripCard(group) {
  const card = figma.createFrame();
  card.name = `${group.name} State Strip`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 10;
  card.paddingTop = 14;
  card.paddingRight = 14;
  card.paddingBottom = 14;
  card.paddingLeft = 14;
  card.resize(1080, 1);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(card);

  card.appendChild(text(`${group.name} / ${categoryLabel(group.category)}`, 14, "Semi Bold", "#111111"));
  const meta = text(`${statusLabel("needs-review")} | ${fieldLabel("source")}: ${sourceIdSummary(Object.keys(group.sourceIds).sort(), 3)}`, 10, "Regular", "#666666");
  meta.resize(1020, 16);
  card.appendChild(meta);

  const strip = figma.createFrame();
  strip.name = `${group.name} states`;
  strip.layoutMode = "HORIZONTAL";
  strip.layoutWrap = "WRAP";
  strip.itemSpacing = 12;
  strip.counterAxisSpacing = 12;
  strip.paddingTop = 10;
  strip.paddingRight = 10;
  strip.paddingBottom = 10;
  strip.paddingLeft = 10;
  strip.resize(1020, 1);
  strip.cornerRadius = 8;
  strip.clipsContent = false;
  strip.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  setWrappedAutoHeight(strip);
  card.appendChild(strip);

  const visible = group.variants.slice(0, 8);
  for (const item of visible) {
    strip.appendChild(componentStateStripCell(item.model, item.variant));
  }

  const hidden = Math.max(0, group.variants.length - visible.length);
  if (hidden > 0) {
    const more = text(l(`+${hidden} more variants`, `另有 ${hidden} 个变体`, `另有 ${hidden} 个变体 / +${hidden} more variants`), 10, "Regular", "#666666");
    more.resize(1020, 14);
    card.appendChild(more);
  }
  return card;
}

function componentStateStripCell(model, variant) {
  const cell = figma.createFrame();
  cell.name = `${variant.state} / ${variant.size} / ${variant.tone}`;
  cell.layoutMode = "VERTICAL";
  cell.itemSpacing = 8;
  cell.paddingTop = 10;
  cell.paddingRight = 10;
  cell.paddingBottom = 10;
  cell.paddingLeft = 10;
  cell.resize(236, 108);
  cell.cornerRadius = 8;
  cell.clipsContent = false;
  cell.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  cell.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  const stage = figma.createFrame();
  stage.name = "State preview";
  stage.layoutMode = "HORIZONTAL";
  stage.primaryAxisAlignItems = "CENTER";
  stage.counterAxisAlignItems = "CENTER";
  stage.resize(216, 54);
  stage.cornerRadius = 6;
  stage.clipsContent = true;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  stage.appendChild(semanticComponentVariant(model, variant));
  cell.appendChild(stage);

  const label = text(stateLabel(variant.state), 9, "Regular", "#555555");
  label.resize(216, 12);
  cell.appendChild(label);
  return cell;
}

function createContainerModelSection(parent, containers, components) {
  if (!containers || !containers.length) {
    createPagePatternsSection(parent, components);
    return;
  }

  const frame = sectionFrame(l("Containers / Layout Regions", "容器 / 布局区域", "容器 / 布局区域 / Containers"));
  parent.appendChild(frame);

  const intro = text(l(
    "Container drafts are separated into visual containers and structural layout traces. Large transparent wrappers remain audit evidence only.",
    "容器草稿会分为可视容器与结构布局追踪。大型透明包装层仅作为审计证据保留。",
    "容器分为可视容器与结构布局追踪 / Containers are separated into visual containers and structural traces."
  ), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const buckets = containerPresentationBuckets(containers);
  createContainerTriageSummary(frame, buckets);

  if (buckets.visual.length) {
    const visualList = containerListFrame(l("Visual Containers", "可视容器", "可视容器 / Visual Containers"));
    frame.appendChild(visualList);
    for (const container of buckets.visual.slice(0, 12)) {
      visualList.appendChild(containerModelBlock(container, "visual"));
    }
  }

  if (buckets.layout.length) {
    const layoutList = containerListFrame(l("Structural Layout Regions", "结构布局区域", "结构布局区域 / Structural Layout Regions"));
    frame.appendChild(layoutList);
    for (const container of buckets.layout.slice(0, 16)) {
      layoutList.appendChild(containerTraceRow(container));
    }
  }
}

function containerPresentationBuckets(containers) {
  const visual = [];
  const layout = [];
  for (const container of containers || []) {
    if (isVisualContainerCandidate(container)) visual.push(container);
    else layout.push(container);
  }
  visual.sort((a, b) => containerVisualScore(b) - containerVisualScore(a) || String(a.name || "").localeCompare(String(b.name || "")));
  layout.sort((a, b) => containerLayoutRiskScore(b) - containerLayoutRiskScore(a) || (b.count || 0) - (a.count || 0));
  return { visual, layout };
}

function createContainerTriageSummary(parent, buckets) {
  const row = figma.createFrame();
  row.name = "Container triage summary";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.resize(1120, 72);
  row.clipsContent = false;
  parent.appendChild(row);
  row.appendChild(summaryPill(l("visual containers", "可视容器", "可视容器 / visual"), buckets.visual.length));
  row.appendChild(summaryPill(l("layout traces", "布局追踪", "布局追踪 / layout traces"), buckets.layout.length));
  row.appendChild(summaryPill(l("large wrappers", "大型包装层", "大型包装层 / large wrappers"), buckets.layout.filter(isLargeStructuralContainer).length));
  row.appendChild(summaryPill(l("needs review", "待复核", "待复核 / needs review"), buckets.visual.length + buckets.layout.length));
}

function containerListFrame(name) {
  const list = figma.createFrame();
  list.name = name;
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 12;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  const title = text(name, 15, "Semi Bold", "#111111");
  title.resize(1120, 22);
  list.appendChild(title);
  return list;
}

function isVisualContainerCandidate(container) {
  if ((container.confidence || 0) < 0.65) return false;
  if (isLargeStructuralContainer(container)) return false;
  const example = firstContainerExample(container);
  const bounds = example.bounds || {};
  const width = Number(bounds.width || 0);
  const height = Number(bounds.height || 0);
  if (width < 80 || height < 28) return false;
  const type = container.type || "";
  if (["sidebar", "top-bar", "composer-form", "menu-list", "dialog-popover", "nav-group"].indexOf(type) < 0) return false;
  return true;
}

function isLargeStructuralContainer(container) {
  const example = firstContainerExample(container);
  const bounds = example.bounds || {};
  const height = Number(bounds.height || 0);
  const width = Number(bounds.width || 0);
  const y = Number(bounds.y || 0);
  return height > 2400 || width > 2400 || y < -2000;
}

function firstContainerExample(container) {
  return container && container.examples && container.examples[0] ? container.examples[0] : {};
}

function containerVisualScore(container) {
  const example = firstContainerExample(container);
  const bounds = example.bounds || {};
  const area = Math.min(1, (Number(bounds.width || 0) * Number(bounds.height || 0)) / 600000);
  return (container.confidence || 0) * 10 + area + Math.min(2, (container.count || 0) / 20);
}

function containerLayoutRiskScore(container) {
  return (isLargeStructuralContainer(container) ? 1000 : 0) + (container.count || 0);
}

function containerModelBlock(container, tier) {
  const block = figma.createFrame();
  block.name = `${container.name || compositeDraftTitle(container.type)} ${tier === "visual" ? "Visual Container" : "Container Draft"}`;
  block.layoutMode = "VERTICAL";
  block.itemSpacing = 12;
  block.paddingTop = 16;
  block.paddingRight = 16;
  block.paddingBottom = 16;
  block.paddingLeft = 16;
  block.resize(1120, 1);
  block.cornerRadius = 8;
  block.clipsContent = false;
  block.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  block.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  setVerticalAutoHeight(block);

  const title = text(`${container.name || compositeDraftTitle(container.type)} / ${compositeDraftTitle(container.type)}`, 15, "Semi Bold", "#111111");
  block.appendChild(title);
  const meta = text(`${l("draft, inferred", "草稿，推断", "草稿，推断 / draft, inferred")} | ${fieldLabel("confidence")}: ${Math.round((container.confidence || 0.45) * 100)}% | ${fieldLabel("source")}: ${sourceIdSummary(container.sourceContainerIds || [], 3)}`, 10, "Regular", "#666666");
  meta.resize(1040, 16);
  block.appendChild(meta);
  const summary = text(`${fieldLabel("children")}: ${containerChildSummary(container.childSummary || {})}`, 10, "Regular", "#666666");
  summary.resize(1040, 16);
  block.appendChild(summary);

  const stage = containerModelStage(container);
  block.appendChild(stage);
  return block;
}

function containerTraceRow(container) {
  const row = figma.createFrame();
  row.name = `${container.name || compositeDraftTitle(container.type)} layout trace`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 10;
  row.paddingRight = 12;
  row.paddingBottom = 10;
  row.paddingLeft = 12;
  row.resize(1080, 44);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];

  const name = text(truncate(container.name || compositeDraftTitle(container.type), 42), 11, "Semi Bold", "#111111");
  name.resize(300, 18);
  row.appendChild(name);
  const type = text(compositeDraftTitle(container.type), 10, "Regular", "#555555");
  type.resize(160, 18);
  row.appendChild(type);
  const bounds = firstContainerExample(container).bounds || {};
  const size = text(`${Math.round(bounds.width || 0)} x ${Math.round(bounds.height || 0)}px`, 10, "Regular", isLargeStructuralContainer(container) ? "#9a5b00" : "#555555");
  size.resize(150, 18);
  row.appendChild(size);
  const summary = text(truncate(containerChildSummary(container.childSummary || {}), 58), 10, "Regular", "#666666");
  summary.resize(420, 18);
  row.appendChild(summary);
  return row;
}

function containerModelStage(container) {
  const type = container.type || "container";
  const example = container.examples && container.examples[0] ? container.examples[0] : {};
  const childSummary = container.childSummary || example.childSummary || {};
  const stage = figma.createFrame();
  stage.name = `${container.name || type} composite canvas`;
  stage.layoutMode = type === "sidebar" || type === "composer-form" || type === "menu-list" || type === "nav-group" ? "VERTICAL" : "HORIZONTAL";
  stage.layoutWrap = stage.layoutMode === "HORIZONTAL" ? "WRAP" : "NO_WRAP";
  stage.itemSpacing = 10;
  stage.counterAxisSpacing = 10;
  stage.paddingTop = 14;
  stage.paddingRight = 14;
  stage.paddingBottom = 14;
  stage.paddingLeft = 14;
  stage.resize(containerStageWidth(type, example), 1);
  stage.cornerRadius = 8;
  stage.clipsContent = false;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  if (stage.layoutMode === "VERTICAL") {
    setVerticalAutoHeight(stage);
  } else {
    setWrappedAutoHeight(stage);
  }

  if (appendContainerStructurePreview(stage, container, example)) {
    return stage;
  }

  const children = containerEvidenceItems(childSummary);
  if (!children.length) {
    stage.appendChild(containerPlaceholder(type, example));
  } else {
    for (const item of children.slice(0, 8)) {
      stage.appendChild(containerEvidencePill(item, type));
    }
  }
  return stage;
}

function appendContainerStructurePreview(stage, container, example) {
  const type = container.type || "";
  if (type === "sidebar") {
    appendSidebarContainerPreview(stage, container, example);
    return true;
  }
  if (type === "composer-form") {
    appendComposerContainerPreview(stage, container, example);
    return true;
  }
  if (type === "menu-list") {
    appendMenuContainerPreview(stage, container, example);
    return true;
  }
  if (type === "top-bar") {
    appendHeaderContainerPreview(stage, container, example);
    return true;
  }
  if (type === "nav-group") {
    appendNavContainerPreview(stage, container, example);
    return true;
  }
  if (type === "dialog-popover") {
    appendOverlayContainerPreview(stage, container, example);
    return true;
  }
  return false;
}

function appendSidebarContainerPreview(stage, container, example) {
  stage.resize(360, 1);
  stage.layoutMode = "VERTICAL";
  setVerticalAutoHeight(stage);
  const rowWidth = 320;
  stage.appendChild(containerSectionLabel(l("Primary navigation", "主导航", "主导航 / Primary navigation")));
  stage.appendChild(containerRowShell(l("Navigation item", "导航项", "导航项 / Navigation item"), rowWidth, true, true));
  stage.appendChild(containerRowShell(l("Navigation item", "导航项", "导航项 / Navigation item"), rowWidth, true, false));
  stage.appendChild(containerSectionLabel(l("List region", "列表区域", "列表区域 / List region")));
  stage.appendChild(containerRowShell(l("List row", "列表行", "列表行 / List row"), rowWidth, true, false));
  stage.appendChild(containerRowShell(l("Selected row", "选中行", "选中行 / Selected row"), rowWidth, true, true));
  stage.appendChild(containerSectionLabel(l("Account footer", "账户底部", "账户底部 / Account footer")));
}

function appendComposerContainerPreview(stage, container, example) {
  stage.resize(760, 1);
  stage.layoutMode = "VERTICAL";
  stage.primaryAxisAlignItems = "CENTER";
  stage.counterAxisAlignItems = "CENTER";
  setVerticalAutoHeight(stage);

  const composer = figma.createFrame();
  composer.name = "Composer structure shell";
  composer.layoutMode = "HORIZONTAL";
  composer.counterAxisAlignItems = "CENTER";
  composer.itemSpacing = 10;
  composer.paddingLeft = 14;
  composer.paddingRight = 10;
  composer.resize(680, 52);
  applyObservedFrameStyle(composer, example, {
    fallbackFill: "#ffffff",
    fallbackStroke: "#dedede",
    fallbackRadius: 28,
    fallbackEffects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.10 }, offset: { x: 0, y: 10 }, radius: 28, spread: 0, visible: true, blendMode: "NORMAL" }]
  });
  composer.appendChild(patternIconSlot(18, "leading action slot"));
  const placeholder = text(l("Input placeholder", "输入占位文本", "输入占位文本 / Input placeholder"), 14, "Regular", "#8a8a8a");
  placeholder.resize(430, 18);
  composer.appendChild(placeholder);
  const mode = text(l("Mode", "模式", "模式 / Mode"), 12, "Regular", "#777777");
  mode.resize(44, 16);
  composer.appendChild(mode);
  composer.appendChild(patternIconSlot(18, "secondary action slot"));
  composer.appendChild(patternActionDot(l("Primary action slot", "主操作位", "主操作位 / Primary action slot")));
  stage.appendChild(composer);

  const quick = figma.createFrame();
  quick.name = "Quick actions slots";
  quick.layoutMode = "HORIZONTAL";
  quick.itemSpacing = 8;
  quick.primaryAxisAlignItems = "CENTER";
  quick.counterAxisAlignItems = "CENTER";
  quick.fills = [];
  quick.resize(520, 36);
  quick.appendChild(containerActionPill(l("Action", "操作", "操作 / Action")));
  quick.appendChild(containerActionPill(l("Action", "操作", "操作 / Action")));
  quick.appendChild(containerActionPill(l("Action", "操作", "操作 / Action")));
  stage.appendChild(quick);
}

function appendMenuContainerPreview(stage, container, example) {
  stage.resize(320, 1);
  stage.layoutMode = "VERTICAL";
  setVerticalAutoHeight(stage);
  stage.appendChild(containerRowShell(l("Menu item", "菜单项", "菜单项 / Menu item"), 280, true, false));
  stage.appendChild(containerRowShell(l("Menu item", "菜单项", "菜单项 / Menu item"), 280, true, true));
  stage.appendChild(containerRowShell(l("Additional action", "附加操作", "附加操作 / Additional action"), 280, true, false));
}

function appendHeaderContainerPreview(stage, container, example) {
  stage.resize(920, 1);
  stage.layoutMode = "HORIZONTAL";
  stage.layoutWrap = "NO_WRAP";
  const bar = figma.createFrame();
  bar.name = "Header structure shell";
  bar.layoutMode = "HORIZONTAL";
  bar.counterAxisAlignItems = "CENTER";
  bar.itemSpacing = 10;
  bar.paddingLeft = 14;
  bar.paddingRight = 14;
  bar.resize(860, 48);
  applyObservedFrameStyle(bar, example, { fallbackFill: "#ffffff", fallbackStroke: "#eeeeee", fallbackRadius: 8 });
  const title = text(l("Page / section title", "页面 / 区域标题", "页面 / 区域标题 / Page title"), 13, "Semi Bold", "#111111");
  title.resize(720, 18);
  bar.appendChild(title);
  bar.appendChild(patternIconSlot(16, "header action slot"));
  bar.appendChild(patternIconSlot(16, "header action slot"));
  stage.appendChild(bar);
}

function appendNavContainerPreview(stage, container, example) {
  stage.resize(420, 1);
  stage.layoutMode = "VERTICAL";
  setVerticalAutoHeight(stage);
  stage.appendChild(containerRowShell(l("Navigation link", "导航链接", "导航链接 / Navigation link"), 360, true, false));
  stage.appendChild(containerRowShell(l("Navigation link", "导航链接", "导航链接 / Navigation link"), 360, true, true));
  stage.appendChild(containerRowShell(l("Nested row", "层级行", "层级行 / Nested row"), 360, true, false));
}

function appendOverlayContainerPreview(stage, container, example) {
  stage.resize(420, 1);
  stage.layoutMode = "VERTICAL";
  stage.primaryAxisAlignItems = "CENTER";
  stage.counterAxisAlignItems = "CENTER";
  setVerticalAutoHeight(stage);
  const panel = figma.createFrame();
  panel.name = "Overlay structure shell";
  panel.layoutMode = "VERTICAL";
  panel.itemSpacing = 8;
  panel.paddingTop = 12;
  panel.paddingRight = 12;
  panel.paddingBottom = 12;
  panel.paddingLeft = 12;
  panel.resize(300, 128);
  applyObservedFrameStyle(panel, example, {
    fallbackFill: "#ffffff",
    fallbackStroke: "#dedede",
    fallbackRadius: 10,
    fallbackEffects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 12 }, radius: 28, spread: 0, visible: true, blendMode: "NORMAL" }]
  });
  panel.appendChild(containerRowShell(l("Action", "操作", "操作 / Action"), 260, false, false));
  panel.appendChild(containerRowShell(l("Action", "操作", "操作 / Action"), 260, false, true));
  stage.appendChild(panel);
}

function containerRowShell(label, width, iconSlot, selected) {
  const row = figma.createFrame();
  row.name = `${label} shell`;
  row.layoutMode = "HORIZONTAL";
  row.counterAxisAlignItems = "CENTER";
  row.itemSpacing = 8;
  row.paddingLeft = iconSlot ? 8 : 10;
  row.paddingRight = 10;
  row.resize(width, 34);
  row.cornerRadius = 8;
  row.fills = selected ? [{ type: "SOLID", color: hexToRgb("#0000000d") }] : [];
  if (iconSlot) row.appendChild(patternIconSlot(16, "icon slot"));
  const labelNode = text(label, 11, "Regular", "#333333");
  labelNode.resize(width - row.paddingLeft - row.paddingRight - (iconSlot ? 24 : 0), 15);
  row.appendChild(labelNode);
  return row;
}

function containerSectionLabel(label) {
  const node = text(label, 10, "Semi Bold", "#666666");
  node.resize(320, 14);
  return node;
}

function containerActionPill(label) {
  const pill = figma.createFrame();
  pill.name = `${label} action slot`;
  pill.layoutMode = "HORIZONTAL";
  pill.counterAxisAlignItems = "CENTER";
  pill.itemSpacing = 6;
  pill.paddingLeft = 10;
  pill.paddingRight = 10;
  pill.resize(132, 30);
  pill.cornerRadius = 999;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  pill.appendChild(patternIconSlot(14, "action icon slot"));
  const labelNode = text(label, 10, "Regular", "#555555");
  labelNode.resize(86, 14);
  pill.appendChild(labelNode);
  return pill;
}

function containerStageWidth(type, example) {
  if (type === "sidebar") return 420;
  if (type === "composer-form") return 820;
  if (type === "top-bar") return 1040;
  const width = example.bounds && example.bounds.width ? example.bounds.width : 1040;
  return Math.max(420, Math.min(1040, width));
}

function containerSummaryItems(summary) {
  return Object.keys(summary || {}).map((key) => ({ name: key, count: summary[key] || 0 }))
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
}

function containerEvidenceItems(summary) {
  return containerSummaryItems(summary)
    .filter((item) => !isTechnicalContainerChild(item.name))
    .slice(0, 8);
}

function isTechnicalContainerChild(name) {
  return /^(div|span|script|style|svg|path|h1|h2|h3|p|img)$/i.test(String(name || ""));
}

function containerEvidencePill(item, type) {
  const pill = figma.createFrame();
  pill.name = `${item.name} x${item.count}`;
  pill.layoutMode = "HORIZONTAL";
  pill.itemSpacing = 8;
  pill.counterAxisAlignItems = "CENTER";
  pill.paddingTop = 8;
  pill.paddingRight = 10;
  pill.paddingBottom = 8;
  pill.paddingLeft = 10;
  pill.resize(type === "sidebar" || type === "menu-list" ? 360 : 180, 36);
  pill.cornerRadius = 6;
  pill.clipsContent = false;
  pill.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  pill.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  const label = text(`${categoryLabel(item.name)} (${item.count})`, 10, "Medium", "#333333");
  label.resize((type === "sidebar" || type === "menu-list" ? 320 : 140), 14);
  pill.appendChild(label);
  return pill;
}

function containerPlaceholder(type, example) {
  const placeholder = figma.createFrame();
  placeholder.name = `${type} placeholder`;
  placeholder.layoutMode = "VERTICAL";
  placeholder.itemSpacing = 6;
  placeholder.paddingTop = 12;
  placeholder.paddingRight = 12;
  placeholder.paddingBottom = 12;
  placeholder.paddingLeft = 12;
  placeholder.resize(360, 80);
  placeholder.cornerRadius = 6;
  placeholder.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  placeholder.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  placeholder.appendChild(text(compositeDraftTitle(type), 11, "Semi Bold", "#333333"));
  const bounds = example.bounds || {};
  placeholder.appendChild(text(`${bounds.width || 0} x ${bounds.height || 0}px`, 9, "Regular", "#666666"));
  return placeholder;
}

function containerChildSummary(summary) {
  const semanticItems = containerEvidenceItems(summary).slice(0, 6);
  const items = semanticItems.length ? semanticItems : containerSummaryItems(summary).filter((item) => !/^script$/i.test(item.name)).slice(0, 4);
  if (!items.length) return l("no semantic child evidence", "无语义子节点证据", "无语义子节点证据 / no semantic child evidence");
  return items.map((item) => `${categoryLabel(item.name)}=${item.count}`).join(", ");
}

function createPagePatternsSection(parent, components) {
  const patterns = inferPagePatterns(components);
  if (!patterns.length) return;

  const frame = sectionFrame(l("Composite Drafts / Experimental", "组合草稿 / 实验", "组合草稿 / Experimental"));
  parent.appendChild(frame);

  const intro = text(l("Copy-ready composite drafts inferred from sampled components. These are not exact page reconstruction.", "根据采样组件推断的可复制组合草稿，不是精确页面还原。", "根据采样组件推断的组合草稿 / Copy-ready composite drafts."), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "Pattern blocks";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 16;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const pattern of patterns.slice(0, 10)) {
    list.appendChild(compositeDraftBlock(pattern));
  }
}

function createCoreComponentSetsSection(parent, models) {
  const coreModels = selectCoreComponentSetModels(models);
  if (!coreModels.length) return;

  const frame = sectionFrame(copy("coreComponentSets"));
  parent.appendChild(frame);

  const intro = text(copy("coreComponentSetsIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 34);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "Core component set list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 18;
  list.fills = [];
  list.resize(1120, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const model of coreModels) {
    const setBlock = coreComponentSetBlock(model);
    if (setBlock) list.appendChild(setBlock);
  }
}

function selectCoreComponentSetModels(models) {
  const coreCategories = ["button", "text-input", "select", "checkbox", "radio", "switch", "tab", "tag", "link", "card", "form-field", "breadcrumb"];
  const grouped = groupBy(models || [], (model) => model.category || "other");
  const result = [];
  for (const category of coreCategories) {
    const items = dedupeComponentsForSheet((grouped[category] || []).filter((model) => componentPresentationTier(model) === "designSystemComponent"));
    const model = coreComponentSetModelForCategory(category, sortComponentsForSheet(items));
    if (model) result.push(model);
  }
  return result;
}

function coreComponentSetBlock(model) {
  const block = figma.createFrame();
  const displayName = componentDisplayName(model);
  block.name = `${displayName} / Draft Component Set`;
  block.layoutMode = "VERTICAL";
  block.itemSpacing = 12;
  block.paddingTop = 14;
  block.paddingRight = 14;
  block.paddingBottom = 14;
  block.paddingLeft = 14;
  block.resize(1080, 1);
  block.cornerRadius = 8;
  block.clipsContent = false;
  block.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  block.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(block);

  const title = text(`${displayName} / ${categoryLabel(model.category || "component")} ${l("Set", "组件集", "组件集 / Set")}`, 14, "Semi Bold", "#111111");
  block.appendChild(title);
  const variants = orderedComponentVariants(uniqueComponentVariants(componentVariants(model)));
  const visibleVariants = variants.slice(0, 12);
  const hiddenVariantCount = Math.max(0, variants.length - visibleVariants.length);

  const meta = text(`${l("draft, inferred", "草稿，推断", "草稿，推断 / draft, inferred")} | ${fieldLabel("variants")}: ${truncate(componentSetVariantSummary(model), 120)}`, 10, "Regular", "#666666");
  meta.resize(1020, 16);
  block.appendChild(meta);

  const source = text(`${fieldLabel("source")}: ${sourceIdSummary(model.sourceComponentIds || [], 3)}`, 10, "Regular", "#666666");
  source.resize(1020, 16);
  block.appendChild(source);

  if (!visibleVariants.length) return null;

  const grid = figma.createFrame();
  grid.name = `${displayName} variant preview grid`;
  grid.layoutMode = "HORIZONTAL";
  grid.layoutWrap = "WRAP";
  grid.itemSpacing = 12;
  grid.counterAxisSpacing = 12;
  grid.paddingTop = 12;
  grid.paddingRight = 12;
  grid.paddingBottom = 12;
  grid.paddingLeft = 12;
  grid.resize(1020, 1);
  grid.cornerRadius = 8;
  grid.clipsContent = false;
  grid.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  setWrappedAutoHeight(grid);
  block.appendChild(grid);

  for (const variant of visibleVariants) {
    grid.appendChild(coreVariantSampleCell(model, variant));
  }

  if (hiddenVariantCount > 0) {
    const more = text(l(`+${hiddenVariantCount} more variants`, `另有 ${hiddenVariantCount} 个变体`, `另有 ${hiddenVariantCount} 个变体 / +${hiddenVariantCount} more variants`), 10, "Regular", "#666666");
    more.resize(1020, 14);
    block.appendChild(more);
  }

  const warning = text(l("inferred draft; needs designer review before promotion", "推断草稿；晋升前需要设计师复核", "推断草稿；晋升前需要设计师复核 / inferred draft; needs designer review before promotion"), 10, "Regular", "#9a5b00");
  warning.resize(1020, 14);
  block.appendChild(warning);
  return block;
}

function coreVariantSampleCell(model, variant) {
  const cell = figma.createFrame();
  const displayName = componentDisplayName(model);
  cell.name = `${displayName} / ${variant.state} / ${variant.size} / ${variant.tone}`;
  cell.layoutMode = "VERTICAL";
  cell.itemSpacing = 8;
  cell.paddingTop = 10;
  cell.paddingRight = 10;
  cell.paddingBottom = 10;
  cell.paddingLeft = 10;
  cell.resize(230, 112);
  cell.cornerRadius = 8;
  cell.clipsContent = false;
  cell.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  cell.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  const stage = figma.createFrame();
  stage.name = "Variant preview stage";
  stage.layoutMode = "HORIZONTAL";
  stage.primaryAxisAlignItems = "CENTER";
  stage.counterAxisAlignItems = "CENTER";
  stage.resize(210, 58);
  stage.cornerRadius = 6;
  stage.clipsContent = true;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  stage.appendChild(semanticComponentVariant(model, variant));
  cell.appendChild(stage);

  const label = text(`${variant.state} / ${variant.size} / ${variant.tone}`, 9, "Regular", "#555555");
  label.resize(210, 12);
  cell.appendChild(label);
  return cell;
}

function sourceIdSummary(sourceIds, visibleCount) {
  const ids = sourceIds || [];
  const visible = ids.slice(0, visibleCount);
  const rest = Math.max(0, ids.length - visible.length);
  if (!visible.length) return l("none", "无", "无 / none");
  return visible.join(", ") + (rest > 0 ? l(` +${rest} more`, ` 另有 ${rest} 个`, ` 另有 ${rest} 个 / +${rest} more`) : "");
}

function componentSetVariantSummary(model) {
  const variants = model.variants || {};
  return `${fieldLabel("states")}=${localizedStateList(orderedVariantValues(variants.state || [], "state")) || stateLabel("default")}, ${fieldLabel("size")}=${orderedVariantValues(variants.size || [], "size").join("/") || l("unknown", "未知", "未知 / unknown")}, ${fieldLabel("tone")}=${orderedVariantValues(variants.tone || [], "tone").join("/") || l("unknown", "未知", "未知 / unknown")}`;
}

function coreComponentSetModelForCategory(category, items) {
  if (!items.length) return null;
  const base = items[0];
  const states = {};
  const sizes = {};
  const tones = {};
  const sourceIds = {};
  const assets = [];
  const examples = [];
  let rationale = base.rationale || "";
  let confidence = base.confidence || 0;

  for (const item of items.slice(0, 5)) {
    const variants = item.variants || {};
    addKeys(states, variants.state || item.states || ["default"]);
    addKeys(sizes, variants.size || ["md"]);
    addKeys(tones, variants.tone || ["neutral"]);
    addKeys(sourceIds, item.sourceComponentIds || []);
    appendLimited(assets, item.assets || [], 4);
    appendLimited(examples, item.examples || [], 4);
    confidence = Math.max(confidence, item.confidence || 0);
    if (!rationale && item.rationale) rationale = item.rationale;
  }

  return {
    name: coreComponentSetName(category),
    category,
    variants: {
      state: orderedVariantValues(Object.keys(states), "state"),
      size: orderedVariantValues(Object.keys(sizes), "size"),
      tone: orderedVariantValues(Object.keys(tones), "tone")
    },
    sourceComponentIds: Object.keys(sourceIds).sort(),
    slots: mergedSlotsForCategory(category, items),
    assets,
    examples,
    confidence,
    rationale: rationale || "Generated as an inferred, draft component set from captured DOM/CSS samples."
  };
}

function coreComponentSetName(category) {
  if (category === "text-input") return "Input";
  if (category === "menu-item") return "Menu Item";
  return titleCase(category);
}

function mergedSlotsForCategory(category, items) {
  const slots = {};
  for (const item of items || []) addKeys(slots, item.slots || []);
  if (category === "button" || category === "menu-item" || category === "tab") slots.label = true;
  if (category === "text-input") slots.label = true;
  return Object.keys(slots).sort();
}

function addKeys(target, values) {
  for (const value of values || []) {
    if (value !== undefined && value !== null && String(value)) target[String(value)] = true;
  }
}

function appendLimited(target, values, limit) {
  for (const value of values || []) {
    if (target.length < limit) target.push(value);
  }
}

function inferPagePatterns(components) {
  const map = {};
  for (const component of components || []) {
    const examples = component.examples || [];
    for (const example of examples.slice(0, 4)) {
      const patternType = inferPatternType(component, example);
      if (!patternType) continue;
      const sourceKey = stablePatternSourceKey(example);
      const key = `${patternType}|${sourceKey}`;
      if (!map[key]) {
        map[key] = {
          type: patternType,
          sourceTitle: example.sourceTitle || "",
          sourcePageId: example.sourcePageId || "",
          sourceUrl: example.sourceUrl || "",
          components: [],
          sampleKeys: {}
        };
      }
      const sampleKey = patternSampleKey(component, example);
      if (!map[key].sampleKeys[sampleKey] && map[key].components.length < 10) {
        map[key].sampleKeys[sampleKey] = true;
        map[key].components.push({ component, example });
      }
    }
  }
  return Object.values(map).sort((a, b) => patternPriority(a.type) - patternPriority(b.type) || b.components.length - a.components.length);
}

function stablePatternSourceKey(example) {
  return example.sourceUrl || example.sourceTitle || example.sourcePageId || "current-page";
}

function patternSampleKey(component, example) {
  if (component.sourceComponentIds && component.sourceComponentIds.length) {
    return component.sourceComponentIds.slice().sort().join("|");
  }
  if (component.signature) return component.signature;
  return [
    component.category || "component",
    componentDisplayName(component) || "",
    example.tag || "",
    example.role || "",
    example.className || "",
    Math.round((example.width || 0) / 4) * 4,
    Math.round((example.height || 0) / 4) * 4
  ].join("|");
}

function inferPatternType(component, example) {
  const category = component.category || "";
  const role = String(example.role || "").toLowerCase();
  const tag = String(example.tag || "").toLowerCase();
  const className = String(example.className || "").toLowerCase();
  const textValue = String(example.text || "").toLowerCase();
  const sourceTitle = String(example.sourceTitle || "").toLowerCase();
  const haystack = `${category} ${role} ${tag} ${className} ${textValue} ${sourceTitle}`;

  if (haystack.indexOf("dialog") >= 0 || haystack.indexOf("modal") >= 0 || role === "dialog") return "dialog-popover";
  if (haystack.indexOf("settings") >= 0 || haystack.indexOf("preferences") >= 0) return "settings-panel";
  if (haystack.indexOf("sidebar") >= 0 || haystack.indexOf("side-bar") >= 0 || haystack.indexOf("sidenav") >= 0) return "sidebar";
  if (category === "navigation" || tag === "nav" || haystack.indexOf("nav") >= 0) return "navigation";
  if (category === "menu-item" || role === "menuitem" || haystack.indexOf("menu") >= 0 || haystack.indexOf("dropdown") >= 0) return "menu-list";
  if (category === "tab" || role === "tab") return "tabs";
  if (category === "card" || haystack.indexOf("panel") >= 0) return "card-panel";
  if (category === "text-input" || category === "select") return "form-controls";
  return "";
}

function patternPriority(type) {
  const order = {
    sidebar: 1,
    navigation: 2,
    "menu-list": 3,
    "settings-panel": 4,
    "dialog-popover": 5,
    tabs: 6,
    "form-controls": 7,
    "card-panel": 8
  };
  return order[type] || 99;
}

function patternBlock(pattern) {
  const block = figma.createFrame();
  block.name = `${titleCase(pattern.type)} Pattern`;
  block.layoutMode = "VERTICAL";
  block.itemSpacing = 12;
  block.paddingTop = 16;
  block.paddingRight = 16;
  block.paddingBottom = 16;
  block.paddingLeft = 16;
  block.resize(1120, 1);
  block.cornerRadius = 8;
  block.clipsContent = false;
  block.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  block.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  setVerticalAutoHeight(block);

  const confidence = pattern.components.length >= 3 ? "inferred pattern" : "low-confidence pattern";
  const title = text(`${titleCase(pattern.type)} / ${confidence} (${pattern.components.length})`, 15, "Semi Bold", "#111111");
  block.appendChild(title);
  const source = text(pattern.sourceTitle || pattern.sourcePageId || pattern.sourceUrl || "captured state", 10, "Regular", "#666666");
  source.resize(1040, 14);
  block.appendChild(source);
  const note = text("Experimental: grouped from sampled components, not exact page reconstruction.", 10, "Regular", "#9a5b00");
  note.resize(1040, 14);
  block.appendChild(note);

  const stage = patternStage(pattern.type);
  block.appendChild(stage);

  for (const item of pattern.components.slice(0, 8)) {
    stage.appendChild(patternSample(item.component, item.example, pattern.type));
  }

  return block;
}

function compositeDraftBlock(pattern) {
  const block = figma.createFrame();
  block.name = `${compositeDraftTitle(pattern.type)} Composite Draft`;
  block.layoutMode = "VERTICAL";
  block.itemSpacing = 12;
  block.paddingTop = 16;
  block.paddingRight = 16;
  block.paddingBottom = 16;
  block.paddingLeft = 16;
  block.resize(1120, 1);
  block.cornerRadius = 8;
  block.clipsContent = false;
  block.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  block.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  setVerticalAutoHeight(block);

  const title = text(`${compositeDraftTitle(pattern.type)} / inferred composite`, 15, "Semi Bold", "#111111");
  block.appendChild(title);
  const source = text(`${pattern.sourceTitle || pattern.sourcePageId || pattern.sourceUrl || "captured state"} | ${pattern.components.length} sampled parts`, 10, "Regular", "#666666");
  source.resize(1040, 14);
  block.appendChild(source);
  const note = text("Experimental: grouped from components and traces; review before reuse.", 10, "Regular", "#9a5b00");
  note.resize(1040, 14);
  block.appendChild(note);

  const stage = compositeDraftStage(pattern.type);
  block.appendChild(stage);

  const items = pattern.components.slice(0, compositeDraftSampleLimit(pattern.type));
  for (const item of items) {
    stage.appendChild(patternSample(item.component, item.example, pattern.type));
  }
  return block;
}

function compositeDraftTitle(type) {
  if (type === "sidebar") return l("Sidebar", "侧边栏", "侧边栏 / Sidebar");
  if (type === "navigation" || type === "top-bar") return l("Header / Top Bar", "顶部栏", "顶部栏 / Header");
  if (type === "form-controls" || type === "composer-form") return l("Composer / Form Container", "输入区 / 表单容器", "输入区 / 表单容器 / Composer");
  if (type === "menu-list") return l("Menu Group", "菜单组", "菜单组 / Menu Group");
  if (type === "tabs") return l("Tabs Group", "标签页组", "标签页组 / Tabs Group");
  if (type === "card-panel") return l("Card Panel", "卡片面板", "卡片面板 / Card Panel");
  if (type === "dialog-popover") return l("Dialog / Popover", "弹窗 / 浮层", "弹窗 / 浮层 / Dialog");
  if (type === "settings-panel") return l("Settings Panel", "设置面板", "设置面板 / Settings Panel");
  return titleCase(type);
}

function compositeDraftStage(type) {
  const stage = patternStage(type);
  stage.name = `${compositeDraftTitle(type)} composite canvas`;
  if (type === "form-controls") {
    stage.layoutMode = "VERTICAL";
    stage.layoutWrap = "NO_WRAP";
    setVerticalAutoHeight(stage);
  }
  return stage;
}

function compositeDraftSampleLimit(type) {
  if (type === "sidebar") return 8;
  if (type === "form-controls") return 6;
  if (type === "navigation") return 6;
  return 8;
}

function patternStage(type) {
  const stage = figma.createFrame();
  stage.name = `${type} grouped samples`;
  stage.layoutMode = type === "sidebar" || type === "menu-list" || type === "settings-panel" ? "VERTICAL" : "HORIZONTAL";
  stage.layoutWrap = stage.layoutMode === "HORIZONTAL" ? "WRAP" : "NO_WRAP";
  stage.itemSpacing = 10;
  stage.counterAxisSpacing = 10;
  stage.paddingTop = 14;
  stage.paddingRight = 14;
  stage.paddingBottom = 14;
  stage.paddingLeft = 14;
  stage.resize(1040, 1);
  stage.cornerRadius = 8;
  stage.clipsContent = false;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  if (stage.layoutMode === "VERTICAL") {
    setVerticalAutoHeight(stage);
  } else {
    setWrappedAutoHeight(stage);
  }
  return stage;
}

function patternSample(component, example, type) {
  const width = type === "sidebar" || type === "menu-list" || type === "settings-panel" ? 360 : 210;
  const height = type === "sidebar" || type === "menu-list" || type === "settings-panel" ? 54 : 84;
  const wrapper = figma.createFrame();
  wrapper.name = `${componentDisplayName(component) || component.category || "Pattern item"}`;
  wrapper.layoutMode = "VERTICAL";
  wrapper.itemSpacing = 6;
  wrapper.paddingTop = 8;
  wrapper.paddingRight = 8;
  wrapper.paddingBottom = 8;
  wrapper.paddingLeft = 8;
  wrapper.resize(width, height + 34);
  wrapper.cornerRadius = 6;
  wrapper.clipsContent = false;
  wrapper.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  wrapper.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  wrapper.appendChild(draftExamplePreview(component, example, width - 16, height));
  const label = text(`${component.category || "component"} | ${example.role || example.tag || "node"}`, 9, "Regular", "#666666");
  label.resize(width - 16, 12);
  wrapper.appendChild(label);
  return wrapper;
}

function componentSheet(category, items, isNormalized) {
  const sortedItems = sortComponentsForSheet(dedupeComponentsForSheet(items));
  const sheet = figma.createFrame();
  sheet.name = `${categoryLabel(category)} ${l("Sheet", "样张", "样张 / Sheet")}`;
  sheet.layoutMode = "VERTICAL";
  sheet.itemSpacing = 12;
  sheet.paddingTop = 16;
  sheet.paddingRight = 16;
  sheet.paddingBottom = 16;
  sheet.paddingLeft = 16;
  sheet.resize(1120, 1);
  sheet.cornerRadius = 8;
  sheet.clipsContent = false;
  sheet.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  sheet.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];
  setVerticalAutoHeight(sheet);

  const title = text(`${categoryLabel(category)} (${sortedItems.length})`, 15, "Semi Bold", "#111111");
  sheet.appendChild(title);

  const grid = figma.createFrame();
  grid.name = `${category} copy-ready samples`;
  grid.layoutMode = "HORIZONTAL";
  grid.layoutWrap = "WRAP";
  grid.itemSpacing = 12;
  grid.counterAxisSpacing = 12;
  grid.fills = [];
  grid.resize(1060, 1);
  setWrappedAutoHeight(grid);
  sheet.appendChild(grid);

  const used = {};
  for (const item of sortedItems.slice(0, 24)) {
    const samples = isNormalized ? componentSheetSamplesFromModel(item) : componentSheetSamplesFromDraft(item);
    for (const sample of samples.slice(0, 4)) {
      const key = componentSheetSampleKey(item, sample.name);
      if (!used[key]) {
        used[key] = true;
        grid.appendChild(sample);
      } else {
        sample.remove();
      }
    }
  }

  return sheet;
}

function sortComponentsForSheet(items) {
  return items.slice().sort((a, b) => {
    const categoryDelta = componentSortWeight(a) - componentSortWeight(b);
    if (categoryDelta !== 0) return categoryDelta;
    const confidenceDelta = (b.confidence || 0) - (a.confidence || 0);
    if (confidenceDelta !== 0) return confidenceDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function orderedComponentCategories(categories) {
  const preferredOrder = ["button", "text-input", "select", "checkbox", "radio", "switch", "tab", "tag", "link", "card", "form-field", "breadcrumb", "menu-item", "navigation", "other"];
  return preferredOrder.filter((category) => categories.indexOf(category) >= 0)
    .concat(categories.filter((category) => preferredOrder.indexOf(category) === -1).sort());
}

function orderedComponentVariants(variants) {
  return variants.slice().sort((a, b) => {
    const stateDelta = orderValue(a.state, "state") - orderValue(b.state, "state");
    if (stateDelta !== 0) return stateDelta;
    const sizeDelta = orderValue(a.size, "size") - orderValue(b.size, "size");
    if (sizeDelta !== 0) return sizeDelta;
    return orderValue(a.tone, "tone") - orderValue(b.tone, "tone");
  });
}

function orderedVariantValues(values, kind) {
  const used = {};
  const result = [];
  for (const value of values || []) {
    const key = String(value || "");
    if (key && !used[key]) {
      used[key] = true;
      result.push(key);
    }
  }
  return result.sort((a, b) => orderValue(a, kind) - orderValue(b, kind) || String(a).localeCompare(String(b)));
}

function firstOrderedValue(values, kind) {
  const ordered = orderedVariantValues(values || [], kind);
  return ordered[0] || "";
}

function orderValue(value, kind) {
  const orders = {
    state: ["default", "open", "hover", "active", "focus", "selected", "disabled"],
    size: ["icon", "sm", "md", "lg", "container"],
    tone: ["primary", "secondary", "neutral", "ghost", "inverse"]
  };
  const list = orders[kind] || [];
  const index = list.indexOf(String(value || ""));
  return index >= 0 ? index : 99;
}

function componentSortWeight(component) {
  const variants = component.variants || {};
  const tones = variants.tone || [];
  const sizes = variants.size || [];
  const states = variants.state || component.states || [];
  let score = 50;
  score += orderValue(firstOrderedValue(tones, "tone"), "tone") * 3;
  score += orderValue(firstOrderedValue(sizes, "size"), "size") * 2;
  score += orderValue(firstOrderedValue(states, "state"), "state");
  return score;
}

function componentSheetSamplesFromModel(model) {
  const result = [];
  const variants = orderedComponentVariants(uniqueComponentVariants(componentVariants(model))).slice(0, 4);
  const displayName = componentDisplayName(model);
  for (const variant of variants) {
    const card = sampleTile(`${displayName} / ${variant.state} / ${variant.size} / ${variant.tone}`, model.category || "component");
    const preview = figma.createFrame();
    preview.name = "Sample preview";
    preview.layoutMode = "HORIZONTAL";
    preview.primaryAxisAlignItems = "CENTER";
    preview.counterAxisAlignItems = "CENTER";
    preview.resize(190, 72);
    preview.cornerRadius = 6;
    preview.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
    preview.clipsContent = true;
    preview.appendChild(semanticComponentVariant(model, variant));
    card.appendChild(preview);
    result.push(card);
  }
  return result;
}

function componentSheetSamplesFromDraft(component) {
  const card = sampleTile(componentDisplayName(component) || "Component", component.category || "component");
  const example = component.examples && component.examples[0];
  if (example) {
    const preview = draftExamplePreview(component, example, 190, 72);
    card.appendChild(preview);
  }
  return [card];
}

function uniqueComponentVariants(variants) {
  const used = {};
  const result = [];
  for (const variant of variants) {
    const key = `${variant.state}|${variant.size}|${variant.tone}`;
    if (!used[key]) {
      used[key] = true;
      result.push(variant);
    }
  }
  return result;
}

function dedupeComponentsForSheet(items) {
  const used = {};
  const result = [];
  for (const item of items || []) {
    const keys = componentDedupeKeys(item);
    let duplicate = false;
    for (const key of keys) {
      if (used[key]) duplicate = true;
    }
    if (!duplicate) {
      for (const key of keys) used[key] = true;
      result.push(item);
    }
  }
  return result;
}

function componentDedupeKeys(component) {
  const keys = [];
  const sourceIds = component.sourceComponentIds || [];
  if (sourceIds.length) keys.push("source:" + sourceIds.slice().sort().join("|"));
  if (component.signature) keys.push("signature:" + component.signature);
  const examples = component.examples || [];
  if (examples.length) keys.push("example:" + componentExampleSignature(component, examples[0]));
  keys.push("variant:" + componentVariantSignature(component));
  return keys;
}

function componentExampleSignature(component, example) {
  const styles = example.styles || {};
  return [
    component.category || "component",
    example.tag || "",
    example.role || "",
    example.className || "",
    Math.round((example.width || 0) / 4) * 4,
    Math.round((example.height || 0) / 4) * 4,
    normalizeHex(styles.backgroundColor || styles.effectiveBackgroundColor || ""),
    normalizeHex(styles.color || "")
  ].join("|");
}

function componentVariantSignature(component) {
  const variants = component.variants || {};
  return [
    component.category || "component",
    orderedVariantValues(variants.state || component.states || ["default"], "state").join(","),
    orderedVariantValues(variants.size || ["md"], "size").join(","),
    orderedVariantValues(variants.tone || ["neutral"], "tone").join(",")
  ].join("|");
}

function componentSheetSampleKey(component, sampleName) {
  const variantKey = sampleVariantKey(sampleName);
  if (variantKey) return `${component.category || "component"}|${variantKey}`;
  const examples = component.examples || [];
  if (examples.length) return componentExampleSignature(component, examples[0]);
  return sampleName || componentDisplayName(component) || "component";
}

function sampleVariantKey(sampleName) {
  const parts = String(sampleName || "").split("/");
  if (parts.length < 4) return "";
  const tone = parts.pop().trim();
  const size = parts.pop().trim();
  const state = parts.pop().trim();
  return `${state}|${size}|${tone}`;
}

function sampleTile(title, meta) {
  const card = figma.createFrame();
  card.name = title;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 8;
  card.paddingTop = 10;
  card.paddingRight = 10;
  card.paddingBottom = 10;
  card.paddingLeft = 10;
  card.resize(214, 132);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];

  const titleNode = text(truncate(title, 28), 10, "Semi Bold", "#111111");
  titleNode.resize(190, 14);
  card.appendChild(titleNode);
  const metaNode = text(truncate(meta, 32), 9, "Regular", "#666666");
  metaNode.resize(190, 12);
  card.appendChild(metaNode);
  return card;
}

function draftExamplePreview(component, example, width, height) {
  const stage = figma.createFrame();
  stage.name = "Sample preview";
  stage.layoutMode = "HORIZONTAL";
  stage.primaryAxisAlignItems = "CENTER";
  stage.counterAxisAlignItems = "CENTER";
  stage.resize(width, height);
  stage.cornerRadius = 6;
  stage.clipsContent = true;
  stage.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];

  const styles = example.styles || {};
  const sample = figma.createFrame();
  sample.name = "Example shape";
  sample.layoutMode = "HORIZONTAL";
  sample.primaryAxisAlignItems = "CENTER";
  sample.counterAxisAlignItems = "CENTER";
  sample.paddingLeft = 12;
  sample.paddingRight = 12;
  sample.resize(Math.min(Math.max(example.width || 80, 48), width - 18), Math.min(Math.max(example.height || 36, 28), height - 18));
  sample.cornerRadius = parseFloat(styles.borderRadius) || 8;
  sample.clipsContent = true;
  sample.fills = [{ type: "SOLID", color: hexToRgb(styles.backgroundColor || styles.effectiveBackgroundColor || "#ffffff"), opacity: hexOpacity(styles.backgroundColor || styles.effectiveBackgroundColor || "#ffffff") }];
  sample.strokes = [{ type: "SOLID", color: hexToRgb("#d8d8d8") }];
  const labelText = truncate(example.text || component.category || "component", 22);
  const label = text(labelText, 12, "Regular", styles.color || "#111111");
  configureSingleLinePreviewLabel(label, labelText, 12);
  sample.appendChild(label);
  stage.appendChild(sample);
  return stage;
}

function inventoryRow(category, items) {
  const row = figma.createFrame();
  row.name = `${category} inventory`;
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 8;
  row.paddingRight = 10;
  row.paddingBottom = 8;
  row.paddingLeft = 10;
  row.resize(1080, 42);
  row.cornerRadius = 6;
  row.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  row.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];

  const variants = inventoryVariantSummary(items);
  const title = text(titleCase(category), 12, "Semi Bold", "#111111");
  title.resize(180, 18);
  row.appendChild(title);
  const count = text(l(`${items.length} candidates`, `${items.length} 个候选`, `${items.length} 个候选 / ${items.length} candidates`), 11, "Regular", "#555555");
  count.resize(130, 18);
  row.appendChild(count);
  const detail = text(truncate(variants, 120), 10, "Regular", "#666666");
  detail.resize(720, 18);
  row.appendChild(detail);
  return row;
}

function inventoryVariantSummary(items) {
  const states = {};
  const sizes = {};
  const tones = {};
  for (const item of items) {
    const variants = item.variants || {};
    for (const state of variants.state || item.states || []) states[state] = true;
    for (const size of variants.size || []) sizes[size] = true;
    for (const tone of variants.tone || []) tones[tone] = true;
  }
  return `states: ${Object.keys(states).join(", ") || "default"} | sizes: ${Object.keys(sizes).join(", ") || "unknown"} | tones: ${Object.keys(tones).join(", ") || "unknown"}`;
}

function createComponentSection(parent, components) {
  const byCategory = groupBy(components, (component) => component.category || "other");
  const frame = sectionFrame(copy("componentDrafts"));
  parent.appendChild(frame);

  const intro = text(copy("componentDraftsIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 36);
  frame.appendChild(intro);

  for (const [category, items] of Object.entries(byCategory)) {
    const label = text(`${titleCase(category)} (${items.length})`, 14, "Semi Bold", "#333333");
    frame.appendChild(label);

    const list = figma.createFrame();
    list.name = `${category} list`;
    list.layoutMode = "VERTICAL";
    list.itemSpacing = 10;
    list.fills = [];
    list.resize(1200, 1);
    setVerticalAutoHeight(list);
    frame.appendChild(list);

    for (const component of items.slice(0, 24)) {
      list.appendChild(componentCard(component));
    }
  }
}

function createSemanticComponentSetSection(parent, models) {
  const displayModels = reusableComponentModels(models || []);
  if (!displayModels.length) return;

  const frame = sectionFrame(copy("componentCandidates"));
  parent.appendChild(frame);

  const intro = text(copy("componentCandidatesIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 36);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "Component candidate list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 12;
  list.fills = [];
  list.resize(1200, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const model of displayModels.slice(0, 24)) {
    list.appendChild(candidateItem(model));
  }
}

function candidateItem(model) {
  const item = figma.createFrame();
  const displayName = componentDisplayName(model);
  item.name = `${displayName} candidate`;
  item.layoutMode = "VERTICAL";
  item.itemSpacing = 12;
  item.paddingTop = 12;
  item.paddingRight = 12;
  item.paddingBottom = 12;
  item.paddingLeft = 12;
  item.resize(1120, 1);
  item.cornerRadius = 10;
  item.clipsContent = false;
  item.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  item.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setVerticalAutoHeight(item);

  item.appendChild(candidateSummaryCard(model));

  const preview = figma.createFrame();
  preview.name = "Candidate preview thumbnails";
  preview.layoutMode = "HORIZONTAL";
  preview.itemSpacing = 8;
  preview.counterAxisAlignItems = "CENTER";
  preview.fills = [];
  preview.resize(1080, 48);
  preview.clipsContent = false;

  const variants = componentVariants(model).slice(0, 3);
  for (const variant of variants) {
    preview.appendChild(semanticComponentVariant(model, variant));
  }
  item.appendChild(preview);
  return item;
}

function candidateSummaryCard(model) {
  const card = figma.createFrame();
  const displayName = componentDisplayName(model);
  card.name = `${displayName} candidate summary`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 8;
  card.paddingTop = 12;
  card.paddingRight = 12;
  card.paddingBottom = 12;
  card.paddingLeft = 12;
  card.resize(1080, 1);
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.fills = [{ type: "SOLID", color: hexToRgb("#fffaf0") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#ead8aa") }];
  setVerticalAutoHeight(card);

  const variants = model.variants || {};
  const examples = model.examples || [];
  const first = examples[0] || {};
  card.appendChild(text(displayName || "Component", 13, "Semi Bold", "#111111"));
  card.appendChild(text(`${fieldLabel("category")}: ${categoryLabel(model.category || "unknown")}`, 10, "Regular", "#555555"));
  if (model.namingRationale) {
    card.appendChild(text(`${fieldLabel("name")}: ${truncate(model.namingRationale, 120)}`, 9, "Regular", "#555555"));
  }
  card.appendChild(text(`${fieldLabel("rawTag")}: ${first.tag || l("unknown", "未知", "未知 / unknown")} | ${fieldLabel("sourceType")}: ${first.role || l("none", "无", "无 / none")}`, 10, "Regular", "#555555"));
  card.appendChild(text(`${fieldLabel("instances")}: ${model.sourceComponentIds ? model.sourceComponentIds.length : 1}`, 10, "Regular", "#555555"));
  card.appendChild(text(`${fieldLabel("states")}: ${truncate(localizedStateList(variants.state || ["default"]), 48)}`, 10, "Regular", "#555555"));
  card.appendChild(text(`${fieldLabel("confidence")}: ${Math.round((model.confidence || 0.5) * 100)}% | ${fieldLabel("status")}: ${statusLabel(model.reviewStatus || "needs-review")}`, 10, "Medium", "#9a5b00"));
  card.appendChild(text(`${fieldLabel("sourceIds")}: ${truncate((model.sourceComponentIds || []).slice(0, 5).join(", "), 120)}`, 9, "Regular", "#777777"));
  if (model.componentTokens) {
    const tokenLine = componentTokenSummary(model.componentTokens);
    card.appendChild(text(`${fieldLabel("tokens")}: ${truncate(tokenLine, 130)}`, 9, "Regular", "#555555"));
  }
  if (model.reviewChecklist && model.reviewChecklist.length) {
    card.appendChild(text(`${fieldLabel("review")}: ${truncate(reviewChecklistSummary(model.reviewChecklist), 130)}`, 9, "Regular", "#7c2d12"));
  }
  if (model.warnings && model.warnings.length) {
    const warn = text(`${fieldLabel("warnings")}: ${truncate(model.warnings.slice(0, 3).map(warningTypeLabel).join(", "), 140)}`, 9, "Regular", "#9a3412");
    warn.resize(1020, 16);
    card.appendChild(warn);
  }
  return card;
}

function componentTokenSummary(tokens) {
  const items = [];
  if (tokens.background && tokens.background.token) items.push(`bg=${tokens.background.token}`);
  if (tokens.foreground && tokens.foreground.token) items.push(`fg=${tokens.foreground.token}`);
  if (tokens.radius && tokens.radius.token) items.push(`radius=${tokens.radius.token}`);
  if (tokens.shadow && tokens.shadow.token) items.push(`shadow=${tokens.shadow.token}`);
  return items.length ? items.join(", ") : l("raw values need token mapping review", "原始值仍需映射到 Token", "原始值仍需映射到 Token / raw values need token mapping review");
}

function reviewChecklistSummary(checklist) {
  const items = [];
  for (const item of checklist.slice(0, 4)) {
    items.push(`${item.status}: ${item.label}`);
  }
  return items.join(" | ");
}

function componentVariants(model) {
  const variants = model.variants || {};
  const states = orderedVariantValues(variants.state || ["default"], "state").slice(0, 4);
  let sizes = orderedVariantValues(variants.size || ["md"], "size").slice(0, 2);
  if (!shouldUseIconSize(model)) {
    sizes = sizes.filter((size) => size !== "icon");
  }
  if (!sizes.length) sizes = ["md"];
  const tones = orderedVariantValues(variants.tone || ["neutral"], "tone").slice(0, 2);
  const result = [];

  for (const state of states) {
    for (const size of sizes) {
      for (const tone of tones) {
        if (result.length < 12) result.push({ state, size, tone });
      }
    }
  }

  return result.length ? result : [{ state: "default", size: "md", tone: "neutral" }];
}

function shouldUseIconSize(model) {
  const examples = model.examples || [];
  if (!examples.length) return false;
  for (const example of examples.slice(0, 4)) {
    const width = Number(example.width || 0);
    const height = Number(example.height || 0);
    const textValue = String(example.text || "").trim();
    const hasMeaningfulText = textValue && textValue.toLowerCase() !== "icon" && textValue.length > 2;
    const squareish = width > 0 && height > 0 && Math.abs(width - height) <= Math.max(6, Math.min(width, height) * 0.25);
    if (squareish && !hasMeaningfulText) return true;
  }
  return false;
}

function semanticComponentVariant(model, variant) {
  const specialized = specializedSemanticComponentVariant(model, variant);
  if (specialized) return specialized;

  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "HORIZONTAL";
  component.counterAxisAlignItems = "CENTER";
  component.primaryAxisAlignItems = "CENTER";
  component.itemSpacing = 8;
  component.paddingTop = 8;
  component.paddingRight = 12;
  component.paddingBottom = 8;
  component.paddingLeft = 12;
  component.resize(variant.size === "icon" ? 40 : 150, variant.size === "sm" ? 32 : 40);
  component.clipsContent = true;
  component.cornerRadius = variant.size === "icon" ? 10 : 8;
  component.fills = [{ type: "SOLID", color: hexToRgb(toneBackground(variant.tone, variant.state)) }];
  const strokeColor = toneStroke(variant.tone, variant.state);
  component.strokes = [{ type: "SOLID", color: hexToRgb(strokeColor), opacity: hexOpacity(strokeColor) }];
  component.opacity = variant.state === "disabled" ? 0.48 : 1;
  component.description = model.rationale || "";

  try {
    component.variantProperties = {
      State: titleCase(variant.state),
      Size: titleCase(variant.size),
      Tone: titleCase(variant.tone)
    };
  } catch (error) {
    // Variant properties are best-effort for older runtimes.
  }

  const slots = model.slots || [];
  if (slots.indexOf("icon") >= 0) {
    const assets = model.assets || [];
    const icon = createComponentPreviewIcon(assets, 18, toneForeground(variant.tone, variant.state));
    if (icon) {
      icon.name = "Icon";
      component.appendChild(icon);
    } else {
      component.description = `${component.description || ""}\nicon unresolved; omitted from visual preview`.trim();
    }
  }

  if (variant.size !== "icon") {
    const labelWidth = slots.indexOf("icon") >= 0 ? 92 : 122;
    const label = text(truncateMiddle(componentLabel(model, variant), slots.indexOf("icon") >= 0 ? 12 : 17), 12, "Medium", toneForeground(variant.tone, variant.state));
    label.name = "Label";
    label.resize(labelWidth, 16);
    try {
      label.textAutoResize = "NONE";
      label.textTruncation = "ENDING";
    } catch (error) {
      // Older runtimes may not support text truncation controls.
    }
    component.appendChild(label);
  }
  return component;
}

function specializedSemanticComponentVariant(model, variant) {
  const category = model.category || "";
  if (category === "checkbox" || category === "radio") return indicatorComponentVariant(model, variant, category);
  if (category === "switch") return switchComponentVariant(model, variant);
  if (category === "tag") return tagComponentVariant(model, variant);
  if (category === "card") return cardComponentVariant(model, variant);
  if (category === "form-field") return formFieldComponentVariant(model, variant);
  if (category === "breadcrumb") return breadcrumbComponentVariant(model, variant);
  return null;
}

function configureComponentVariantNode(component, model, variant) {
  component.description = model.rationale || "";
  try {
    component.variantProperties = {
      State: titleCase(variant.state),
      Size: titleCase(variant.size),
      Tone: titleCase(variant.tone)
    };
  } catch (error) {
    // Variant properties are best-effort for older runtimes.
  }
}

function indicatorComponentVariant(model, variant, kind) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "HORIZONTAL";
  component.counterAxisAlignItems = "CENTER";
  component.itemSpacing = 8;
  component.paddingTop = 7;
  component.paddingRight = 10;
  component.paddingBottom = 7;
  component.paddingLeft = 10;
  component.resize(142, 34);
  component.cornerRadius = 6;
  component.clipsContent = false;
  component.fills = [];
  configureComponentVariantNode(component, model, variant);

  const mark = kind === "radio" ? figma.createEllipse() : figma.createFrame();
  mark.name = kind === "radio" ? "Radio indicator" : "Checkbox indicator";
  mark.resize(16, 16);
  if (kind !== "radio") mark.cornerRadius = 4;
  mark.fills = [{ type: "SOLID", color: hexToRgb(variant.state === "selected" ? "#111111" : "#ffffff") }];
  mark.strokes = [{ type: "SOLID", color: hexToRgb(variant.state === "selected" ? "#111111" : "#b8b8b8") }];
  component.appendChild(mark);

  const labelValue = truncate(componentLabel(model, variant) || categoryLabel(kind), 16);
  const label = text(labelValue, 12, "Regular", toneForeground(variant.tone, variant.state));
  label.resize(98, 16);
  component.appendChild(label);
  return component;
}

function switchComponentVariant(model, variant) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "HORIZONTAL";
  component.counterAxisAlignItems = "CENTER";
  component.itemSpacing = 8;
  component.paddingTop = 7;
  component.paddingRight = 10;
  component.paddingBottom = 7;
  component.paddingLeft = 10;
  component.resize(142, 34);
  component.fills = [];
  configureComponentVariantNode(component, model, variant);

  const selected = variant.state === "selected" || variant.state === "active" || variant.state === "open";
  const track = figma.createFrame();
  track.name = "Switch track";
  track.resize(32, 18);
  track.cornerRadius = 999;
  track.fills = [{ type: "SOLID", color: hexToRgb(selected ? "#111111" : "#d9d9d9") }];
  track.clipsContent = false;
  const knob = figma.createEllipse();
  knob.name = "Switch thumb";
  knob.resize(14, 14);
  knob.x = selected ? 16 : 2;
  knob.y = 2;
  knob.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  track.appendChild(knob);
  component.appendChild(track);

  const label = text(truncate(componentLabel(model, variant) || categoryLabel("switch"), 14), 12, "Regular", "#111111");
  label.resize(86, 16);
  component.appendChild(label);
  return component;
}

function tagComponentVariant(model, variant) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "HORIZONTAL";
  component.counterAxisAlignItems = "CENTER";
  component.primaryAxisAlignItems = "CENTER";
  component.paddingLeft = 10;
  component.paddingRight = 10;
  component.resize(104, 28);
  component.cornerRadius = 999;
  component.fills = [{ type: "SOLID", color: hexToRgb(toneBackground(variant.tone, variant.state)) }];
  component.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  configureComponentVariantNode(component, model, variant);
  const label = text(truncate(componentLabel(model, variant) || categoryLabel("tag"), 14), 11, "Medium", toneForeground(variant.tone, variant.state));
  label.resize(82, 14);
  component.appendChild(label);
  return component;
}

function cardComponentVariant(model, variant) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "VERTICAL";
  component.itemSpacing = 8;
  component.paddingTop = 14;
  component.paddingRight = 14;
  component.paddingBottom = 14;
  component.paddingLeft = 14;
  component.resize(184, 92);
  component.cornerRadius = 8;
  component.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  component.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  component.clipsContent = false;
  configureComponentVariantNode(component, model, variant);
  component.appendChild(text(truncate(componentLabel(model, variant) || categoryLabel("card"), 18), 12, "Semi Bold", "#111111"));
  component.appendChild(text(l("Reusable content surface", "可复用内容面板", "可复用内容面板 / Reusable surface"), 10, "Regular", "#666666"));
  return component;
}

function formFieldComponentVariant(model, variant) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "VERTICAL";
  component.itemSpacing = 6;
  component.resize(184, 64);
  component.fills = [];
  configureComponentVariantNode(component, model, variant);
  const label = text(truncate(componentLabel(model, variant) || l("Field label", "字段标签", "字段标签 / Field label"), 18), 10, "Medium", "#444444");
  label.resize(184, 14);
  component.appendChild(label);
  const input = figma.createFrame();
  input.name = "Field control";
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";
  input.paddingLeft = 10;
  input.paddingRight = 10;
  input.resize(184, 38);
  input.cornerRadius = 8;
  input.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  input.strokes = [{ type: "SOLID", color: hexToRgb(variant.state === "focus" ? "#1166cc" : "#dedede") }];
  const placeholder = text(l("Value", "内容", "内容 / Value"), 11, "Regular", "#777777");
  placeholder.resize(158, 14);
  input.appendChild(placeholder);
  component.appendChild(input);
  return component;
}

function breadcrumbComponentVariant(model, variant) {
  const component = figma.createComponent();
  const displayName = componentDisplayName(model);
  component.name = `${displayName}/${fieldLabel("state")}=${stateLabel(variant.state)}, ${fieldLabel("size")}=${titleCase(variant.size)}, ${fieldLabel("tone")}=${titleCase(variant.tone)}`;
  component.layoutMode = "HORIZONTAL";
  component.counterAxisAlignItems = "CENTER";
  component.itemSpacing = 6;
  component.paddingTop = 6;
  component.paddingRight = 8;
  component.paddingBottom = 6;
  component.paddingLeft = 8;
  component.resize(180, 30);
  component.fills = [];
  configureComponentVariantNode(component, model, variant);
  component.appendChild(text(l("Page", "页面", "页面 / Page"), 11, "Regular", "#555555"));
  component.appendChild(text("/", 11, "Regular", "#999999"));
  component.appendChild(text(truncate(componentLabel(model, variant) || l("Section", "层级", "层级 / Section"), 14), 11, "Medium", "#111111"));
  return component;
}

function createComponentPreviewIcon(assets, size, color) {
  for (const asset of assets || []) {
    if (asset && asset.type === "svg" && canRenderSvgAsset(asset)) {
      try {
        const node = figma.createNodeFromSvg(svgSourceForFigma(asset, color));
        node.resize(size, size);
        return node;
      } catch (error) {
        // Keep trying later assets; some SVGs are traceable but not accepted by Figma.
      }
    }
  }
  return null;
}

function createAssetIcon(asset, size, color) {
  if (asset && asset.type === "svg" && canRenderSvgAsset(asset)) {
    try {
      const node = figma.createNodeFromSvg(svgSourceForFigma(asset, color));
      node.resize(size, size);
      return node;
    } catch (error) {
      return svgRenderFallback(size, color);
    }
  }
  return iconPlaceholder(asset, size, color);
}

function canRenderSvgAsset(asset) {
  const src = String(asset && asset.src ? asset.src : "").trim();
  return src.indexOf("<svg") === 0 && src.indexOf("<use") === -1;
}

function svgSourceForFigma(asset, color) {
  let src = String(asset && asset.src ? asset.src : "").trim();
  if (!src) return src;
  const safeColor = normalizeSvgColor(color || "#111111");
  src = sanitizeSvgForFigma(src);
  if (src.indexOf(" color=") < 0) {
    src = src.replace("<svg", `<svg color="${safeColor}"`);
  }
  if (!/\bfill=/.test(src) && !/\bstroke=/.test(src)) {
    src = src.replace("<svg", `<svg fill="${safeColor}"`);
  }
  src = ensureVisibleSvgPaths(src, safeColor, asset);
  src = src.replace(/\b(currentColor|currentcolor)\b/g, safeColor);
  return src;
}

function sanitizeSvgForFigma(src) {
  let svg = String(src || "");
  svg = svg.replace(/<\?xml[^>]*>/gi, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/\s+xmlns:[a-zA-Z][\w.-]*="[^"]*"/g, "");
  svg = svg.replace(/\s+class="[^"]*"/g, "");
  svg = svg.replace(/\s+aria-hidden="[^"]*"/g, "");
  svg = svg.replace(/\s+role="[^"]*"/g, "");
  svg = svg.replace(/\s+style="([^"]*)"/g, (match, value) => {
    const cleaned = String(value || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^(content-visibility|width|height|transform)\s*:/i.test(part))
      .join("; ");
    return cleaned ? ` style="${cleaned}"` : "";
  });
  return svg.trim();
}

function ensureVisibleSvgPaths(src, color, asset) {
  const monochromeLike = !isMulticolorSvgAsset(asset) || isInlineSvgAsset(asset);
  if (!monochromeLike) return src;
  const safeColor = normalizeSvgColor(color || "#111111");
  let svg = src.replace(/\bstroke=["']rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)["']/gi, `stroke="${safeColor}"`);
  svg = svg.replace(/\bfill=["']rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)["']/gi, `fill="${safeColor}"`);
  svg = svg.replace(/<path\b([^>]*)>/gi, (match, attrs) => {
    if (/\b(?:fill|stroke)=/i.test(attrs)) return match;
    return `<path fill="${safeColor}"${attrs}>`;
  });
  return svg;
}

function normalizeSvgColor(value) {
  const raw = String(value || "").trim();
  if (raw.charAt(0) === "#") return `#${normalizeHex(raw).slice(0, 6)}`;
  if (/^rgba?\(/i.test(raw)) {
    const parsed = parseCssColor(raw);
    return parsed ? rgbToHex(parsed) : "#111111";
  }
  return "#111111";
}

function isMulticolorSvgAsset(asset) {
  const colors = new Set();
  String(asset && asset.src ? asset.src : "").replace(/\b(?:fill|stroke|stop-color|color)=["']([^"']+)["']/gi, (match, value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || /^(none|currentcolor|inherit|transparent)$/i.test(normalized)) return "";
    colors.add(normalized);
    return "";
  });
  return colors.size > 1;
}

function isInlineSvgAsset(asset) {
  const resolution = String(asset && asset.resolution ? asset.resolution : "").toLowerCase();
  const source = String(asset && asset.src ? asset.src : "");
  return resolution.indexOf("inline") >= 0 || resolution.indexOf("data-svg") >= 0 || /__lottie_element|lottie/i.test(source + " " + (asset && asset.name ? asset.name : ""));
}

function isUnresolvedIconAsset(asset) {
  if (!asset) return false;
  if (asset.assetKind === "unresolved-icon") return true;
  const type = String(asset.type || "");
  const resolution = String(asset.resolution || "").toLowerCase();
  return type === "mask-image" || resolution.indexOf("mask") >= 0 || resolution.indexOf("icon:") >= 0;
}

function isLegacyAssetCatalog(data, assetStats) {
  const trace = data && data.trace ? data.trace : {};
  if (trace.assetPipelineVersion || (trace.assetCatalogStats && trace.assetCatalogStats.pipelineVersion)) return false;
  return assetStats && assetStats.total > 0;
}

function svgFromDataUrl(value) {
  const input = String(value || "");
  if (!/^data:image\/svg\+xml/i.test(input)) return "";
  const comma = input.indexOf(",");
  if (comma < 0) return "";
  try {
    const meta = input.slice(0, comma);
    const body = input.slice(comma + 1);
    const decoded = /;base64/i.test(meta) ? decodeBase64Utf8(body) : decodeURIComponent(body);
    return decoded && decoded.indexOf("<svg") >= 0 ? decoded : "";
  } catch (error) {
    return "";
  }
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  let escaped = "";
  for (let index = 0; index < binary.length; index += 1) {
    escaped += "%" + binary.charCodeAt(index).toString(16).padStart(2, "0");
  }
  try {
    return decodeURIComponent(escaped);
  } catch (error) {
    return binary;
  }
}

function summarizeAssets(assets) {
  const stats = {
    total: (assets || []).length,
    resolvedSvg: 0,
    unresolvedSvg: 0,
    images: 0,
    multicolorSvg: 0,
    inlineSvg: 0,
    monochromeSvg: 0,
    imageIcons: 0,
    unresolvedIconClues: 0,
    componentLinked: 0
  };
  for (const asset of assets || []) {
    if ((asset.linkedComponentIds || []).length) stats.componentLinked += 1;
    if (asset.type === "image") {
      stats.images += 1;
      if (asset.assetKind === "image-icon") stats.imageIcons += 1;
    } else if (asset.type === "svg" && canRenderSvgAsset(asset)) {
      stats.resolvedSvg += 1;
      if (asset.assetKind === "multicolor-svg" || isMulticolorSvgAsset(asset)) stats.multicolorSvg += 1;
      if (asset.assetKind === "inline-svg" || isInlineSvgAsset(asset)) stats.inlineSvg += 1;
      if (!(asset.assetKind === "multicolor-svg" || isMulticolorSvgAsset(asset))) stats.monochromeSvg += 1;
    } else if (asset.type === "svg") {
      stats.unresolvedSvg += 1;
    } else if (isUnresolvedIconAsset(asset)) {
      stats.unresolvedIconClues += 1;
    }
  }
  return stats;
}

function assetResolutionColor(asset) {
  if (asset && asset.type === "svg" && canRenderSvgAsset(asset)) return "#166534";
  if (asset && asset.type === "svg") return "#9a3412";
  return "#777777";
}

function countWarnings(warnings, type) {
  let count = 0;
  for (const warning of warnings || []) {
    if (warning.type === type) count += 1;
  }
  return count;
}

function svgRenderFallback(size, color) {
  const label = text("svg", Math.max(7, Math.round(size * 0.28)), "Medium", color);
  label.name = "SVG render failed";
  label.resize(size, Math.max(10, Math.round(size * 0.4)));
  return label;
}

function iconPlaceholder(asset, size, color) {
  const frame = figma.createFrame();
  frame.name = asset && asset.name ? asset.name : "Icon placeholder";
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  frame.resize(size, size);
  frame.cornerRadius = Math.max(4, Math.round(size / 4));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [{ type: "SOLID", color: hexToRgb(color), opacity: 0.65 }];

  const label = text(iconLabel(asset), Math.max(7, Math.round(size * 0.34)), "Medium", color);
  label.name = "Icon ID";
  frame.appendChild(label);
  return frame;
}

function iconLabel(asset) {
  if (!asset) return "ic";
  if (asset.spriteId) return asset.spriteId.slice(0, 2);
  if (asset.name) return asset.name.slice(0, 2);
  return "ic";
}

function componentLabel(model, variant) {
  const displayName = componentDisplayName(model);
  if (variant.size === "icon") return "";
  const example = model.examples && model.examples[0];
  if (example && example.text) return example.text;
  return displayName;
}

function toneBackground(tone, state) {
  if (state === "open") return "#e8eef8";
  if (state === "hover") {
    if (tone === "primary") return "#0f5fcb";
    if (tone === "inverse") return "#2a2a2a";
    return "#f0f0f0";
  }
  if (state === "active") return "#e4e8f0";
  if (tone === "primary") return "#1166cc";
  if (tone === "inverse") return "#181818";
  if (tone === "ghost") return "#ffffff";
  if (tone === "secondary") return "#f7f7f8";
  return "#eeeeef";
}

function toneForeground(tone, state) {
  if (state === "disabled") return "#777777";
  if (tone === "primary" || tone === "inverse") return "#ffffff";
  return "#111111";
}

function toneStroke(tone, state) {
  if (state === "focus" || state === "open") return "#1166cc";
  if (tone === "ghost") return "#d8d8d8";
  return "#00000000";
}

function componentCard(component) {
  const card = figma.createFrame();
  const displayName = componentDisplayName(component);
  card.name = displayName;
  card.layoutMode = "HORIZONTAL";
  card.itemSpacing = 18;
  card.paddingTop = 16;
  card.paddingRight = 16;
  card.paddingBottom = 16;
  card.paddingLeft = 16;
  card.counterAxisAlignItems = "MIN";
  card.resize(1120, 1);
  card.clipsContent = false;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: hexToRgb("#f7f7f8") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#dedede") }];
  setHorizontalAutoHeight(card);

  const meta = figma.createFrame();
  meta.name = "Trace and review metadata";
  meta.layoutMode = "VERTICAL";
  meta.itemSpacing = 7;
  meta.fills = [];
  meta.resize(460, 1);
  setVerticalAutoHeight(meta);

  const states = component.states || ["default"];
  const example = component.examples && component.examples[0];
  meta.appendChild(text(truncate(displayName, 64), 13, "Semi Bold", "#111111"));
  meta.appendChild(text(`tag: ${example && example.tag ? example.tag : "unknown"} | ${component.category || "other"} | ${component.count || 0} instances`, 11, "Regular", "#555555"));
  meta.appendChild(text(`${fieldLabel("states")}: ${truncate(localizedStateList(states), 90)}`, 10, "Regular", "#555555"));

  if (example) {
    const styles = example.styles || {};
    const warnings = exampleWarningsForFigma(example);
    if (warnings.length) {
      const warning = text(`${fieldLabel("warnings")}: ${truncate(warnings.map(warningTypeLabel).join(", "), 52)}`, 9, "Regular", "#9a3412");
      warning.resize(420, 14);
      meta.appendChild(warning);
    }
    meta.appendChild(text(`trace: ${truncate(`${example.tag || "node"}${example.role ? ` role=${example.role}` : ""}${example.sourceTitle ? ` | ${example.sourceTitle}` : ""}`, 96)}`, 9, "Regular", "#777777"));
    card.appendChild(meta);

    const previewColumn = figma.createFrame();
    previewColumn.name = "Preview stage column";
    previewColumn.layoutMode = "VERTICAL";
    previewColumn.itemSpacing = 8;
    previewColumn.counterAxisAlignItems = "CENTER";
    previewColumn.fills = [];
    previewColumn.resize(300, 138);
    previewColumn.clipsContent = false;
    setVerticalAutoHeight(previewColumn);

    const stage = figma.createFrame();
    stage.name = "Fixed preview stage";
    stage.layoutMode = "HORIZONTAL";
    stage.primaryAxisAlignItems = "CENTER";
    stage.counterAxisAlignItems = "CENTER";
    stage.resize(280, 104);
    stage.cornerRadius = 8;
    stage.clipsContent = true;
    stage.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
    stage.strokes = [{ type: "SOLID", color: hexToRgb("#e5e5e5") }];

    const sample = figma.createFrame();
    sample.name = "Example shape";
    sample.layoutMode = "HORIZONTAL";
    sample.counterAxisAlignItems = "CENTER";
    sample.primaryAxisAlignItems = "CENTER";
    sample.paddingLeft = 12;
    sample.paddingRight = 12;
    sample.resize(Math.min(Math.max(example.width || 80, 48), 220), Math.min(Math.max(example.height || 36, 28), 72));
    sample.clipsContent = true;
    sample.cornerRadius = parseFloat(styles.borderRadius) || 8;
    sample.fills = [{ type: "SOLID", color: hexToRgb(styles.backgroundColor || styles.effectiveBackgroundColor || "#ffffff"), opacity: hexOpacity(styles.backgroundColor || styles.effectiveBackgroundColor || "#ffffff") }];
    sample.strokes = [{ type: "SOLID", color: hexToRgb("#d8d8d8") }];
    const labelText = truncate(example.text || component.category, 22);
    const sampleLabel = text(labelText, 12, "Regular", styles.color || "#111111");
    configureSingleLinePreviewLabel(sampleLabel, labelText, 12);
    sample.appendChild(sampleLabel);
    stage.appendChild(sample);
    previewColumn.appendChild(stage);
    previewColumn.appendChild(text(`${Math.round(example.width || 0)} 脳 ${Math.round(example.height || 0)} px`, 9, "Regular", "#777777"));
    if (labelMayBeClipped(example, labelText, 12)) {
      const clipWarning = text(copy("clipWarning"), 8, "Regular", "#9a3412");
      clipWarning.resize(260, 12);
      previewColumn.appendChild(clipWarning);
    }
    card.appendChild(previewColumn);
  } else {
    card.appendChild(meta);
  }

  return card;
}

function exampleWarningsForFigma(example) {
  const result = [];
  const visibility = example.visibility || {};
  const styles = example.styles || {};
  if (visibility.clipped) result.push("clipped");
  if (visibility.width === 0 || visibility.height === 0) result.push("zero size");
  if (styles.contrastRatio && styles.contrastRatio < 3) result.push("low contrast");
  if (example.stateSource && String(example.stateSource).indexOf("inferred:") === 0) result.push("inferred state");
  if (!styles.effectiveBackgroundColor && !styles.backgroundColor) result.push("source background may be missing");
  return result;
}

function configureSingleLinePreviewLabel(node, value, fontSize) {
  const labelWidth = Math.max(24, estimateTextWidth(value, fontSize));
  try {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  } catch (error) {
    // Older Figma runtimes may not expose text auto-resize.
  }
  node.textAlignHorizontal = "CENTER";
  node.textAlignVertical = "CENTER";
  node.resize(labelWidth, Math.max(18, Math.round(fontSize * 1.4)));
}

function labelMayBeClipped(example, value, fontSize) {
  const sourceWidth = Number(example.width || 0);
  if (!sourceWidth) return false;
  const availableWidth = Math.max(0, sourceWidth - 24);
  return estimateTextWidth(value, fontSize) > availableWidth;
}

function estimateTextWidth(value, fontSize) {
  return Math.ceil(String(value || "").length * fontSize * 0.58) + 2;
}

function collectWarnings(data, components) {
  const warnings = [];
  const dataWarnings = data.warnings || [];
  for (const warning of dataWarnings.slice(0, 80)) {
    warnings.push({
      type: warning.type || "warning",
      message: warning.message || "",
      componentName: warning.componentName || "",
      sourceComponentId: warning.sourceComponentId || ""
    });
  }

  for (const component of components || []) {
    const examples = component.examples || [];
    for (const example of examples.slice(0, 3)) {
      for (const warning of exampleWarningsForFigma(example)) {
        warnings.push({
          type: warning,
          message: warning,
          componentName: componentDisplayName(component) || "",
          sourceComponentId: component.id || ""
        });
      }
    }
  }

  return dedupeWarnings(warnings).slice(0, 120);
}

function dedupeWarnings(warnings) {
  const map = {};
  for (const warning of warnings) {
    const type = warning.type || "warning";
    const componentName = warning.componentName || "";
    const sourceComponentId = warning.sourceComponentId || "";
    const key = `${type}|${componentName}|${sourceComponentId}`;
    if (!map[key]) {
      map[key] = {
        type,
        componentName,
        sourceComponentId,
        message: warningSummary(type),
        count: 0
      };
    }
    map[key].count += 1;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function warningSummary(type) {
  const key = String(type || "");
  const map = {
    "inferred-state": ["State comes from class/ARIA/data attributes and was not actively captured through interaction.", "State comes from class/ARIA/data attributes and was not actively captured through interaction."],
    "inferred state": ["State comes from class/ARIA/data attributes and was not actively captured through interaction.", "State comes from class/ARIA/data attributes and was not actively captured through interaction."],
    "clipped-content": ["Node may be clipped by a parent container; preview could be incomplete.", "Node may be clipped by a parent container; preview could be incomplete."],
    clipped: ["Node may be clipped by a parent container; preview could be incomplete.", "Node may be clipped by a parent container; preview could be incomplete."],
    "low-contrast": ["Foreground/background contrast is low; generated preview may be hard to inspect.", "Foreground/background contrast is low; generated preview may be hard to inspect."],
    "low contrast": ["Foreground/background contrast is low; generated preview may be hard to inspect.", "Foreground/background contrast is low; generated preview may be hard to inspect."],
    "source-background-may-be-missing": ["The source parent background may be missing; preview context may not match the page.", "The source parent background may be missing; preview context may not match the page."],
    "source background may be missing": ["The source parent background may be missing; preview context may not match the page.", "The source parent background may be missing; preview context may not match the page."],
    "external-sprite-reference": ["SVG uses an external sprite reference; importer uses a traceable placeholder instead of real paths.", "SVG uses an external sprite reference; importer uses a traceable placeholder instead of real paths."],
    "zero-size-node": ["Node has zero or tiny dimensions and may not be visible.", "Node has zero or tiny dimensions and may not be visible."],
    "zero size": ["Node has zero or tiny dimensions and may not be visible.", "Node has zero or tiny dimensions and may not be visible."]
  };
  const pair = map[key] || ["Review guidance only; generation is not blocked.", "Review guidance only; generation is not blocked."];
  return l(pair[0], pair[1], pair[0]);
}
function createWarningsSection(parent, warnings) {
  const frame = sectionFrame(copy("warnings"));
  parent.appendChild(frame);

  if (!warnings.length) {
    frame.appendChild(text(copy("noWarnings"), 12, "Regular", "#666666"));
    return;
  }

  const intro = text(copy("warningsIntro"), 12, "Regular", "#666666");
  intro.resize(1120, 36);
  frame.appendChild(intro);

  const list = figma.createFrame();
  list.name = "Warning list";
  list.layoutMode = "VERTICAL";
  list.itemSpacing = 8;
  list.fills = [];
  list.resize(1200, 1);
  setVerticalAutoHeight(list);
  frame.appendChild(list);

  for (const warning of warnings.slice(0, 60)) {
    const row = figma.createFrame();
    row.name = warning.type || "warning";
    row.layoutMode = "VERTICAL";
    row.itemSpacing = 4;
    row.paddingTop = 10;
    row.paddingRight = 12;
    row.paddingBottom = 10;
    row.paddingLeft = 12;
    row.resize(1120, 64);
    row.cornerRadius = 8;
    row.clipsContent = false;
    row.fills = [{ type: "SOLID", color: hexToRgb("#fff7ed") }];
    row.strokes = [{ type: "SOLID", color: hexToRgb("#fed7aa") }];
    row.appendChild(text(`${warningTypeLabel(warning.type || "warning")} 脳 ${warning.count || 1}`, 12, "Semi Bold", "#9a3412"));
    const detail = text(`${warningSummary(warning.type)}${warning.componentName ? ` | ${fieldLabel("component")}: ${warning.componentName}` : ""}${warning.sourceComponentId ? ` | ${fieldLabel("source")}: ${warning.sourceComponentId}` : ""}`, 10, "Regular", "#7c2d12");
    detail.resize(1080, 28);
    row.appendChild(detail);
    list.appendChild(row);
  }
}

function sectionFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 16;
  frame.paddingTop = 24;
  frame.paddingRight = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.cornerRadius = 8;
  frame.fills = [{ type: "SOLID", color: hexToRgb("#ffffff") }];
  frame.strokes = [{ type: "SOLID", color: hexToRgb("#eeeeee") }];
  frame.resize(1304, 1);
  setVerticalAutoHeight(frame);

  const title = text(name, 20, "Semi Bold", "#111111");
  frame.appendChild(title);
  return frame;
}

function square(size, color) {
  const node = figma.createRectangle();
  node.resize(size, size);
  node.cornerRadius = 4;
  node.fills = [{ type: "SOLID", color: hexToRgb(color) }];
  return node;
}

function truncate(value, maxLength) {
  const textValue = String(value || "");
  if (textValue.length <= maxLength) return textValue;
  return textValue.slice(0, Math.max(0, maxLength - 3)) + "...";
}

function truncateMiddle(value, maxLength) {
  const textValue = String(value || "");
  if (textValue.length <= maxLength) return textValue;
  if (maxLength <= 3) return textValue.slice(0, maxLength);
  return textValue.slice(0, maxLength - 3) + "...";
}

function setVerticalAutoHeight(node) {
  node.clipsContent = false;
  try {
    node.primaryAxisSizingMode = "AUTO";
    node.counterAxisSizingMode = "FIXED";
  } catch (error) {
    // Older Figma runtimes may not expose auto-sizing setters.
  }
}

function setWrappedAutoHeight(node) {
  node.clipsContent = false;
  try {
    node.primaryAxisSizingMode = "FIXED";
    node.counterAxisSizingMode = "AUTO";
  } catch (error) {
    // Older Figma runtimes may not expose auto-sizing setters.
  }
}

function setHorizontalAutoHeight(node) {
  node.clipsContent = false;
  try {
    node.primaryAxisSizingMode = "FIXED";
    node.counterAxisSizingMode = "AUTO";
  } catch (error) {
    // Older Figma runtimes may not expose auto-sizing setters.
  }
}

function text(value, size, style, color) {
  const characters = String(value || "");
  const node = figma.createText();
  node.fontName = fontForText(characters, style);
  node.fontSize = size;
  node.opacity = 1;
  try {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  } catch (error) {
    // Older Figma runtimes may not expose text auto-resize.
  }
  node.characters = characters;
  node.fills = [{ type: "SOLID", color: hexToRgb(color || "#111111"), opacity: 1 }];
  return node;
}

function fontForText(value, style) {
  const wantsCjk = outputLanguage !== "en" || containsCjk(value);
  if (wantsCjk && cjkRegularFont) {
    if (style === "Semi Bold" || style === "Bold") return cjkSemiBoldFont || cjkMediumFont || cjkRegularFont;
    if (style === "Medium") return cjkMediumFont || cjkRegularFont;
    return cjkRegularFont;
  }
  if (style === "Bold") return boldFont;
  if (style === "Semi Bold") return semiBoldFont;
  if (style === "Medium") return mediumFont;
  return regularFont;
}

function containsCjk(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(value || ""));
}

function estimatedTextHeight(value, fontSize, width) {
  const safeFont = Number(fontSize) || 12;
  const textValue = String(value || "");
  const charsPerLine = Math.max(8, Math.floor((Number(width) || 120) / Math.max(5, safeFont * 0.55)));
  const lines = Math.max(1, Math.ceil(textValue.length / charsPerLine));
  return Math.ceil(lines * safeFont * 1.45) + 4;
}

function resizeTextBlock(node, width, minHeight) {
  const safeWidth = Math.max(12, Number(width) || estimateTextWidth(node.characters || "", node.fontSize || 12));
  const safeHeight = Math.max(Number(minHeight) || 24, estimatedTextHeight(node.characters || "", node.fontSize || 12, safeWidth));
  node.resize(safeWidth, safeHeight);
  try {
    node.textAutoResize = "HEIGHT";
  } catch (error) {
    // Older Figma runtimes may not expose height auto-resize.
  }
}

function hexToRgb(value) {
  const hex = normalizeHex(value).slice(0, 6);
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255
  };
}

function hexToRgba(value) {
  const rgb = hexToRgb(value);
  return {
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    a: hexOpacity(value)
  };
}

function hexOpacity(value) {
  const hex = normalizeHex(value);
  if (hex.length < 8) return 1;
  return parseInt(hex.slice(6, 8), 16) / 255;
}

function normalizeHex(value) {
  const fallback = "000000";
  if (!value || typeof value !== "string") return fallback;
  let hex = value.trim().replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((part) => part + part).join("");
  }
  if (!/^[0-9a-f]{6,8}$/i.test(hex)) return fallback;
  return hex.toLowerCase();
}

function safeVariableName(name) {
  return String(name || "color/unknown").replace(/^color\//, "color/").replace(/[^a-z0-9/_-]/gi, "-");
}

function shortName(name) {
  return String(name).split("/").slice(-1)[0];
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function titleCase(value) {
  return String(value).replace(/(^|-|\s)\S/g, (letter) => letter.toUpperCase()).replace(/-/g, " ");
}

function parseBoxShadow(value) {
  const layers = splitShadowLayers(value);
  const effects = [];
  for (const layer of layers) {
    const effect = parseShadowLayer(layer);
    if (effect) effects.push(effect);
  }
  return effects;
}

function splitShadowLayers(value) {
  const input = String(value || "");
  const result = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      result.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

function parseShadowLayer(layer) {
  const value = String(layer || "").trim();
  if (!value || value === "none") return null;

  const isInset = /\binset\b/i.test(value);
  const colorMatch = value.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i);
  const color = parseCssColor(colorMatch ? colorMatch[0] : "");
  const withoutColor = colorMatch ? value.replace(colorMatch[0], " ") : value;
  const numbers = withoutColor
    .replace(/\binset\b/ig, " ")
    .match(/-?\d+(?:\.\d+)?px/g);

  if (!numbers || numbers.length < 2) return null;

  return {
    type: isInset ? "INNER_SHADOW" : "DROP_SHADOW",
    visible: true,
    color,
    offset: { x: parseFloat(numbers[0]), y: parseFloat(numbers[1]) },
    radius: numbers[2] ? parseFloat(numbers[2]) : 0,
    spread: numbers[3] ? parseFloat(numbers[3]) : 0,
    blendMode: "NORMAL"
  };
}

function parseCssColor(value) {
  const input = String(value || "").trim();
  const rgbMatch = input.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const colorParts = cssColorParts(rgbMatch[1]);
    return {
      r: parseCssColorChannel(colorParts[0], false),
      g: parseCssColorChannel(colorParts[1], false),
      b: parseCssColorChannel(colorParts[2], false),
      a: colorParts[3] === undefined ? 1 : parseCssColorChannel(colorParts[3], true)
    };
  }

  if (input.charAt(0) === "#") {
    return hexToRgba(input);
  }

  return { r: 0, g: 0, b: 0, a: 0.18 };
}

function cssColorParts(value) {
  const input = String(value || "").trim();
  if (input.indexOf(",") >= 0) {
    return input.split(",").map((part) => part.trim());
  }
  const slashParts = input.split("/");
  const channels = slashParts[0].trim().split(/\s+/);
  if (slashParts[1] !== undefined) channels.push(slashParts[1].trim());
  return channels;
}

function parseCssColorChannel(value, isAlpha) {
  const input = String(value || "").trim();
  if (input.endsWith("%")) {
    return clampColorChannel(Number(input.slice(0, -1)) / 100);
  }
  return clampColorChannel(Number(input) / (isAlpha ? 1 : 255));
}

function clampColorChannel(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
