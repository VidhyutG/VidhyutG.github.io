import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Validate the actual static files served by GitHub Pages as well as Vite.
const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
assert.equal(
  (html.match(/<h1\b/g) || []).length,
  1,
  "Expected one main heading",
);
for (const [, attribute, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
  if (/^(https?:|mailto:|data:)/.test(value)) continue;
  if (value.startsWith("#")) {
    assert(ids.includes(value.slice(1)), `Broken anchor: ${value}`);
    continue;
  }
  const path = resolve(root, value.replace(/^\//, ""));
  assert(existsSync(path), `Missing ${attribute} asset: ${value}`);
}
for (const [tag] of html.matchAll(/<img\b[^>]*>/gs))
  assert(/\balt="[^"]+"/.test(tag), "Image missing descriptive alt text");
for (const [tag] of html.matchAll(/<button\b[^>]*>/gs))
  assert(/\btype="button"/.test(tag), "Button missing explicit type");
assert(!html.includes("ShohinResume"), "Unrelated legacy resume is linked");
assert(!html.includes("Online 24/7"), "Stale template content remains");
assert(!html.includes("docs.google.com/document"), "Old resume link remains");
// Preserve meaningful word boundaries when headline spans and breaks reflow.
for (const heading of html.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/g)) {
  assert(
    !/[a-z]<span[^>]*>[a-z]/.test(heading[1]),
    "Missing word boundary at heading span",
  );
}
assert(html.includes("NOV 2026 — PRESENT"), "Current role date missing");
assert(
  !html.includes("promotion effective"),
  "Future promotion wording remains",
);
const resume = readFileSync(
  resolve(root, "resume/Vidhyut_Gopinath_Resume_2026.pdf"),
);
assert.equal(resume.subarray(0, 5).toString(), "%PDF-", "Resume is not a PDF");
assert(
  resume.equals(
    readFileSync(
      resolve(root, "public/resume/Vidhyut_Gopinath_Resume_2026.pdf"),
    ),
  ),
  "Development and production resumes differ",
);
console.log(
  `Static integrity passed: ${ids.length} unique IDs, local links, image descriptions, controls, and matching resume PDFs.`,
);
