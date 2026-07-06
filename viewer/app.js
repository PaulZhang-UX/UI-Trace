const samplePath = "../samples/sample-design-system.json";
const fileInput = document.getElementById("file");
const jsonInput = document.getElementById("json");
const renderButton = document.getElementById("render");
const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("source");
const metricsEl = document.getElementById("metrics");
const panels = {
  colors: document.getElementById("colors"),
  type: document.getElementById("type"),
  tokens: document.getElementById("tokens"),
  components: document.getElementById("components")
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    panels[button.dataset.tab].classList.add("active");
  });
});

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  if (!file) return;
  jsonInput.value = await file.text();
  renderFromInput();
});

renderButton.addEventListener("click", renderFromInput);

loadSample();

async function loadSample() {
  try {
    const response = await fetch(samplePath);
    if (!response.ok) return;
    jsonInput.value = await response.text();
    renderFromInput();
  } catch {
    statusEl.textContent = "Ready.";
  }
}

function renderFromInput() {
  try {
    const data = JSON.parse(jsonInput.value);
    render(data);
    statusEl.textContent = "Preview rendered.";
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  }
}

function render(data) {
  const tokens = getTokens(data);
  const components = getComponents(data);
  const stats = data.stats || data.trace?.rawStats || {};
  const assetCount = data.assetCatalog?.length || data.assets?.length || 0;
  sourceEl.textContent = data.source?.hostname || "Unknown source";
  metricsEl.textContent = `${stats.scannedElements || 0} elements | ${components.length || 0} components | ${assetCount} assets${data.normalizedVersion ? " | normalized" : ""}`;
  renderColors(tokens.colors || []);
  renderType(tokens.typography || []);
  renderTokens(tokens);
  renderComponents(components);
}

function getTokens(data) {
  if (data.semanticTokens) {
    return {
      colors: data.semanticTokens.colors || [],
      typography: data.semanticTokens.typography || [],
      spacing: data.semanticTokens.spacing || [],
      radii: data.semanticTokens.radii || [],
      shadows: data.semanticTokens.shadows || []
    };
  }
  return data.tokens || {};
}

function getComponents(data) {
  if (data.componentModel) {
    return data.componentModel.map((model, index) => {
      const variants = model.variants || {};
      return {
        id: `semantic-${index + 1}`,
        name: model.name,
        category: model.category,
        count: model.sourceComponentIds ? model.sourceComponentIds.length : 1,
        states: variants.state || ["default"],
        assets: model.assets || [],
        examples: model.examples || []
      };
    });
  }
  return data.components || [];
}

function renderColors(colors) {
  panels.colors.innerHTML = "";
  if (!colors.length) {
    panels.colors.appendChild(empty("No colors found."));
    return;
  }

  const grid = div("grid");
  for (const color of colors) {
    const item = div("swatch");
    const block = div("swatch-color");
    block.style.background = color.value;
    item.append(block, body(color.name, `${color.value} | ${color.count} uses`));
    grid.appendChild(item);
  }
  panels.colors.appendChild(grid);
}

function renderType(types) {
  panels.type.innerHTML = "";
  if (!types.length) {
    panels.type.appendChild(empty("No type styles found."));
    return;
  }

  const list = div("type-list");
  for (const type of types) {
    const row = div("type-row");
    const label = body(type.name, `${type.fontFamily} | ${type.fontSize}/${type.lineHeight} | ${type.fontWeight}`);
    const sample = div("sample");
    sample.textContent = "The quick brown fox 设计系统样例";
    sample.style.fontFamily = type.fontFamily;
    sample.style.fontSize = `${Math.min(Math.max(type.fontSize, 10), 40)}px`;
    sample.style.lineHeight = `${Math.max(type.lineHeight, type.fontSize)}px`;
    sample.style.fontWeight = type.fontWeight;
    row.append(label, sample);
    list.appendChild(row);
  }
  panels.type.appendChild(list);
}

function renderTokens(tokens) {
  panels.tokens.innerHTML = "";
  const all = [
    ...(tokens.spacing || []).map((token) => ({ group: "Spacing", suffix: "px", ...token })),
    ...(tokens.radii || []).map((token) => ({ group: "Radii", suffix: "px", ...token })),
    ...(tokens.shadows || []).map((token) => ({ group: "Shadows", suffix: "", ...token }))
  ];

  if (!all.length) {
    panels.tokens.appendChild(empty("No spacing, radius, or shadow tokens found."));
    return;
  }

  const max = Math.max(...all.map((token) => token.count || 1));
  const list = div("token-list");
  for (const token of all) {
    const row = div("token-row");
    const name = body(token.name, token.group);
    const bar = div("bar");
    bar.style.width = `${Math.max(6, ((token.count || 1) / max) * 100)}%`;
    const value = div("meta");
    value.textContent = `${token.value}${token.suffix}`;
    row.append(name, bar, value);
    list.appendChild(row);
  }
  panels.tokens.appendChild(list);
}

function renderComponents(components) {
  panels.components.innerHTML = "";
  if (!components.length) {
    panels.components.appendChild(empty("No component groups found."));
    return;
  }

  const list = div("component-list");
  for (const component of components) {
    const card = div("component");
    const example = component.examples?.[0] || {};
    const preview = div("component-preview");
    const icon = component.assets?.[0];
    preview.textContent = `${icon ? `[${icon.spriteId || icon.name || "icon"}] ` : ""}${example.text || component.name}`;
    preview.style.width = `${Math.min(Math.max(example.width || 96, 40), 220)}px`;
    preview.style.height = `${Math.min(Math.max(example.height || 36, 28), 64)}px`;
    preview.style.color = example.styles?.color || "#ffffff";
    preview.style.background = example.styles?.backgroundColor || "#222222";
    preview.style.borderRadius = example.styles?.borderRadius || "8px";
    preview.style.fontSize = `${example.styles?.fontSize || 13}px`;
    preview.style.fontWeight = example.styles?.fontWeight || "500";

    card.append(
      body(component.name, `${component.category} | ${component.count} instances | ${component.states.join(", ")}`),
      preview
    );
    list.appendChild(card);
  }
  panels.components.appendChild(list);
}

function body(name, meta) {
  const wrapper = div("swatch-body");
  const title = div("name");
  title.textContent = name;
  const subtitle = div("meta");
  subtitle.textContent = meta;
  wrapper.append(title, subtitle);
  return wrapper;
}

function empty(message) {
  const node = div("empty");
  node.textContent = message;
  return node;
}

function div(className) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}
