#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const inputPath = join(ROOT, "packages/server/seed/faq.md");
const outputPath = join(ROOT, "packages/extension/src/panel/data/faq.ts");

const md = readFileSync(inputPath, "utf-8");

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const categories = [];
let curCat = null;
let curH3 = null; // { title, descLines, h4s: [{ question, answerLines }] }
let curH4 = null; // { question, answerLines }
let catDescLines = []; // lines between H2 and first H3

function flushH4() {
  if (curH4 && curH4.answerLines.length > 0) {
    curH3.h4s.push({
      question: curH4.question,
      answer: curH4.answerLines.join("\n\n").trim(),
    });
  }
  curH4 = null;
}

function flushH3() {
  flushH4();
  if (curH3) {
    curCat.h3s.push(curH3);
  }
  curH3 = null;
}

function flushCat() {
  flushH3();
  if (curCat) {
    curCat.description = catDescLines.join("\n\n").trim() || undefined;
    categories.push(curCat);
  }
  curCat = null;
  catDescLines = [];
}

for (const line of md.split("\n")) {
  const trimmed = line.trim();

  // Skip the main title (# ...)
  if (/^# [^#]/.test(trimmed)) continue;

  // H2 — new category
  if (trimmed.startsWith("## ")) {
    flushCat();
    const title = trimmed.slice(3).trim();
    curCat = { title, slug: toSlug(title), h3s: [] };
    continue;
  }

  // H3 — new group or flat question
  if (trimmed.startsWith("### ")) {
    flushH3();
    const title = trimmed.slice(4).trim();
    curH3 = { title, descLines: [], h4s: [] };
    continue;
  }

  // H4 — question inside a group
  if (trimmed.startsWith("#### ")) {
    flushH4();
    const question = trimmed.slice(5).trim();
    curH4 = { question, answerLines: [] };
    continue;
  }

  // Non-heading content
  if (trimmed.length === 0) continue;

  if (curH4) {
    // Inside an H4 question → answer text
    curH4.answerLines.push(trimmed);
  } else if (curH3) {
    // Inside an H3 but before any H4 → group description
    curH3.descLines.push(trimmed);
  } else if (curCat) {
    // Inside an H2 but before any H3 → category description
    catDescLines.push(trimmed);
  }
}

// Flush remaining
flushCat();

const output = categories.map((cat) => {
  // Check if H3s contain H4 children → grouped category
  const hasGroups = cat.h3s.some((h3) => h3.h4s.length > 0);

  if (hasGroups) {
    // Grouped category: H3s become groups, H4s become items
    const groups = cat.h3s
      .filter((h3) => h3.h4s.length > 0)
      .map((h3) => ({
        title: h3.title,
        slug: toSlug(h3.title),
        ...(h3.descLines.length > 0 && {
          description: h3.descLines.join("\n\n").trim(),
        }),
        items: h3.h4s,
      }));

    return {
      title: cat.title,
      slug: cat.slug,
      ...(cat.description && { description: cat.description }),
      groups,
    };
  } else {
    // Flat category: H3s are questions, descLines are answers
    const items = cat.h3s
      .filter((h3) => h3.descLines.length > 0)
      .map((h3) => ({
        question: h3.title,
        answer: h3.descLines.join("\n\n").trim(),
      }));

    return {
      title: cat.title,
      slug: cat.slug,
      ...(cat.description && { description: cat.description }),
      items,
    };
  }
});

const ts = `// Auto-generated from packages/server/seed/faq.md - do not edit directly
// Run: node scripts/generate-faq.mjs

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQGroup {
  title: string;
  slug: string;
  description?: string;
  items: FAQItem[];
}

export interface FAQCategory {
  title: string;
  slug: string;
  description?: string;
  items?: FAQItem[];
  groups?: FAQGroup[];
}

export const faqData: FAQCategory[] = ${JSON.stringify(output, null, 2)};
`;

writeFileSync(outputPath, ts, "utf-8");

const totalItems = output.reduce((sum, cat) => {
  if (cat.items) return sum + cat.items.length;
  if (cat.groups) return sum + cat.groups.reduce((s, g) => s + g.items.length, 0);
  return sum;
}, 0);

console.log(
  `Generated ${outputPath} with ${output.length} categories, ${totalItems} questions`
);
