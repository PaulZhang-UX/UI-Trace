import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node tools/audit.mjs <normalized-design-system.json> [report.json]");
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
const data = JSON.parse(fs.readFileSync(absoluteInput, "utf8"));
const report = audit(data);
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : "";

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
}

printReport(report);
if (report.status === "fail") process.exit(2);

function audit(data) {
  const assets = data.assetCatalog || data.assets || [];
  const warnings = data.warnings || [];
  const components = data.componentModel || data.components || [];
  const tokens = data.semanticTokens || data.tokens || {};
  const iconStats = assetStats(assets);
  const warningStats = warningCounts(warnings);
  const tokenTrace = tokenTraceStats(tokens);
  const reviewStats = reviewStatusCounts(components);
  const issues = [];

  if (!components.length) issues.push(issue("fail", "No component candidates were generated."));
  if (!data.designSystemSpec) issues.push(issue("warn", "Missing designSystemSpec summary."));
  if (reviewStats.missing > 0) issues.push(issue("warn", `${reviewStats.missing} component candidates are missing reviewStatus.`));
  if (reviewStats.needsReview > 0) issues.push(issue("warn", `${reviewStats.needsReview} component candidates still need review.`));
  if (iconStats.unresolvedSvg > 0) issues.push(issue("warn", `${iconStats.unresolvedSvg} SVG assets still render as placeholders.`));
  if (warningStats["inferred-state"] > 0) issues.push(issue("warn", `${warningStats["inferred-state"]} states are inferred, not actively captured.`));
  if (warningStats["low-contrast"] > 0) issues.push(issue("warn", `${warningStats["low-contrast"]} low contrast examples need review.`));
  if (warningStats["source-background-may-be-missing"] > 0) issues.push(issue("warn", `${warningStats["source-background-may-be-missing"]} examples may be missing source backgrounds.`));
  if (tokenTrace.missingSourceValue > 0) issues.push(issue("warn", `${tokenTrace.missingSourceValue} tokens are missing sourceValue trace.`));
  if (tokenTrace.missingRationale > 0) issues.push(issue("warn", `${tokenTrace.missingRationale} tokens are missing rationale.`));

  const status = issues.some((item) => item.level === "fail") ? "fail" : issues.length ? "warn" : "pass";
  return {
    status,
    summary: {
      sourcePages: (data.sources || (data.trace && data.trace.sourcePages) || []).length || 1,
      componentCandidates: components.length,
      warnings: warnings.length,
      resolvedSvgIcons: iconStats.resolvedSvg,
      unresolvedSvgIcons: iconStats.unresolvedSvg,
      images: iconStats.images,
      tokensMissingSourceValue: tokenTrace.missingSourceValue,
      tokensMissingRationale: tokenTrace.missingRationale,
      reviewStatus: reviewStats
    },
    warningCounts: warningStats,
    issues
  };
}

function assetStats(assets) {
  const stats = { resolvedSvg: 0, unresolvedSvg: 0, images: 0 };
  for (const asset of assets) {
    if (asset.type === "image") {
      stats.images += 1;
    } else if (asset.type === "svg" && canRenderSvg(asset)) {
      stats.resolvedSvg += 1;
    } else if (asset.type === "svg") {
      stats.unresolvedSvg += 1;
    }
  }
  return stats;
}

function canRenderSvg(asset) {
  return asset.src && String(asset.src).indexOf("<svg") === 0 && String(asset.src).indexOf("<use") === -1;
}

function warningCounts(warnings) {
  const counts = {};
  for (const warning of warnings) {
    const type = warning.type || "warning";
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function tokenTraceStats(tokens) {
  let missingSourceValue = 0;
  let missingRationale = 0;
  for (const groupName of Object.keys(tokens)) {
    const group = Array.isArray(tokens[groupName]) ? tokens[groupName] : [];
    for (const token of group) {
      if (!token.sourceValue && groupName !== "colors") missingSourceValue += 1;
      if (!token.rationale && groupName !== "typography") missingRationale += 1;
    }
  }
  return { missingSourceValue, missingRationale };
}

function reviewStatusCounts(components) {
  const counts = {
    candidate: 0,
    needsReview: 0,
    accepted: 0,
    rejected: 0,
    deprecated: 0,
    missing: 0
  };
  for (const component of components) {
    const status = component.reviewStatus || "";
    if (status === "candidate") counts.candidate += 1;
    else if (status === "needs-review") counts.needsReview += 1;
    else if (status === "accepted") counts.accepted += 1;
    else if (status === "rejected") counts.rejected += 1;
    else if (status === "deprecated") counts.deprecated += 1;
    else counts.missing += 1;
  }
  return counts;
}

function issue(level, message) {
  return { level, message };
}

function printReport(report) {
  console.log(`Audit status: ${report.status}`);
  console.log(`Pages: ${report.summary.sourcePages}`);
  console.log(`Component candidates: ${report.summary.componentCandidates}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log(`Resolved SVG icons: ${report.summary.resolvedSvgIcons}`);
  console.log(`Unresolved SVG placeholders: ${report.summary.unresolvedSvgIcons}`);
  console.log(`Component review: ${report.summary.reviewStatus.candidate} candidate, ${report.summary.reviewStatus.needsReview} needs review`);
  for (const item of report.issues) {
    console.log(`${item.level.toUpperCase()}: ${item.message}`);
  }
}
