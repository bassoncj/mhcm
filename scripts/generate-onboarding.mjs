#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const inputPath = join(ROOT, "packages/server/seed/onboarding.md");
const outputPath = join(
  ROOT,
  "packages/extension/src/panel/data/onboarding-data.ts"
);
const manifestPath = join(ROOT, "packages/server/seed/.onboarding-versions.json");

let manifest = {};
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
}

const md = readFileSync(inputPath, "utf-8");

// Split on HTML comment blocks to extract steps
// Pattern: <!-- metadata --> content
const commentRegex = /<!--\s*([\s\S]*?)-->/g;
const steps = [];

let match;
const commentPositions = [];
while ((match = commentRegex.exec(md)) !== null) {
  commentPositions.push({
    metaRaw: match[1],
    endIndex: match.index + match[0].length,
  });
}

for (let i = 0; i < commentPositions.length; i++) {
  const { metaRaw, endIndex } = commentPositions[i];

  // Extract content between this comment's end and the next comment's start (or EOF)
  const nextStart =
    i + 1 < commentPositions.length
      ? md.lastIndexOf("<!--", commentPositions[i + 1].endIndex)
      : md.length;
  let content = md.slice(endIndex, nextStart).trim();

  // Strip trailing --- separator
  content = content.replace(/\n---\s*$/, "").trim();

  // Parse YAML-like metadata from comment
  const meta = {};
  for (const line of metaRaw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) meta[key] = value;
  }

  if (!meta.id || !meta.type || !meta.title) {
    console.warn(`Skipping comment block with missing metadata:`, meta);
    continue;
  }

  if (meta.type !== "confirm" && meta.type !== "acknowledge") {
    console.warn(`Unknown step type "${meta.type}" for step "${meta.id}"`);
    continue;
  }

  steps.push({
    id: meta.id,
    type: meta.type,
    title: meta.title,
    icon: meta.icon || null,
    markdownContent: content,
  });
}

if (steps.length === 0) {
  console.error("No steps found in", inputPath);
  process.exit(1);
}

function mdToHtml(markdown) {
  const lines = markdown.split("\n");
  const result = [];
  let inList = null; // "ul" | "ol" | null
  let inParagraph = false;

  function closeParagraph() {
    if (inParagraph) {
      result.push("</p>");
      inParagraph = false;
    }
  }

  function closeList() {
    if (inList) {
      result.push(`</${inList}>`);
      inList = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line — close open blocks
    if (trimmed === "") {
      closeParagraph();
      closeList();
      continue;
    }

    // HTML pass-through (lines starting with <)
    if (/^<[a-zA-Z\/!]/.test(trimmed)) {
      closeParagraph();
      closeList();
      result.push(trimmed);
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      result.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      closeParagraph();
      if (inList !== "ul") {
        closeList();
        result.push("<ul>");
        inList = "ul";
      }
      const text = inlineFormat(trimmed.replace(/^[-*]\s+/, ""));
      result.push(`<li>${text}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      closeParagraph();
      if (inList !== "ol") {
        closeList();
        result.push("<ol>");
        inList = "ol";
      }
      const text = inlineFormat(trimmed.replace(/^\d+\.\s+/, ""));
      result.push(`<li>${text}</li>`);
      continue;
    }

    // Horizontal rule (standalone ---)
    if (/^---+$/.test(trimmed)) {
      closeParagraph();
      closeList();
      result.push("<hr>");
      continue;
    }

    // Regular text — paragraph
    closeList();
    if (!inParagraph) {
      result.push("<p>");
      inParagraph = true;
    } else {
      // Continuation of paragraph — add space
      result.push(" ");
    }
    result.push(inlineFormat(trimmed));
  }

  closeParagraph();
  closeList();

  return result.join("\n");
}

function inlineFormat(text) {
  // Images: ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // Links: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");
  // Inline code: `text`
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  return text;
}

const updatedManifest = {};
const outputSteps = [];

for (const step of steps) {
  const hash = createHash("sha256")
    .update(step.markdownContent)
    .digest("hex")
    .slice(0, 16);

  const prev = manifest[step.id];
  let version;
  if (prev && prev.hash === hash) {
    // Content unchanged — keep version
    version = prev.version;
  } else if (prev) {
    // Content changed — bump version
    version = prev.version + 1;
    console.log(
      `  ${step.id}: version ${prev.version} → ${version} (content changed)`
    );
  } else {
    // New step — start at version 1
    version = 1;
    console.log(`  ${step.id}: new step (version 1)`);
  }

  updatedManifest[step.id] = { version, hash };

  // Strip leading h1 from HTML — the component renders the title from metadata
  let html = mdToHtml(step.markdownContent);
  html = html.replace(/^\s*<h1>[^<]*<\/h1>\n?/, "").trim();

  outputSteps.push({
    id: step.id,
    version,
    type: step.type,
    title: step.title,
    icon: step.icon,
    htmlContent: html,
  });
}

writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2) + "\n");

const ts = `// Auto-generated from packages/server/seed/onboarding.md — do not edit directly
// Run: node scripts/generate-onboarding.mjs

export interface OnboardingStep {
  id: string;
  version: number;
  type: "confirm" | "acknowledge";
  title: string;
  icon: string | null;
  htmlContent: string;
}

export const onboardingSteps: OnboardingStep[] = ${JSON.stringify(outputSteps, null, 2)};
`;

writeFileSync(outputPath, ts, "utf-8");

const sharedPath = join(
  ROOT,
  "packages/shared/src/onboarding-steps.ts"
);

const metaSteps = outputSteps.map((s) => ({
  id: s.id,
  version: s.version,
  type: s.type,
  title: s.title,
  icon: s.icon,
}));

const sharedTs = `// Auto-generated from packages/server/seed/onboarding.md — do not edit directly
// Run: node scripts/generate-onboarding.mjs

export interface OnboardingStepMeta {
  id: string;
  version: number;
  type: "confirm" | "acknowledge";
  title: string;
  icon: string | null;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = ${JSON.stringify(metaSteps, null, 2)};
`;

writeFileSync(sharedPath, sharedTs, "utf-8");

console.log(
  `Generated ${outputPath} with ${outputSteps.length} steps, manifest at ${manifestPath}`
);
console.log(`Generated ${sharedPath} (server metadata)`);
