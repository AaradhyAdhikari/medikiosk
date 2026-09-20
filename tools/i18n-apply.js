#!/usr/bin/env node
/* Merge a reviewer's corrections into a language pack.
 *
 *   node tools/i18n-apply.js corrections-mr.json
 *   node tools/i18n-apply.js corrections-mr.json --dry     # show, change nothing
 *
 * The file is what the review sheet's "Export corrections" button downloads:
 *   { "language": "mr", "corrections": { "<English line>": "<better Marathi>" }, "flagged": [...] }
 *
 * Each correction replaces the value for that English key in
 * public/lang/<code>.js, in place, leaving the rest of the file — comments,
 * order, the lines nobody touched — exactly as it was, so the diff a
 * maintainer reads is the reviewer's changes and nothing else. Flagged lines
 * are listed at the end for someone to look at; they are not changed.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const file = process.argv[2];
const dry = process.argv.includes("--dry");
if (!file) { console.error("usage: node tools/i18n-apply.js corrections-<lang>.json [--dry]"); process.exit(1); }

const input = JSON.parse(fs.readFileSync(file, "utf8"));
const code = String(input.language || "").toLowerCase();
const pack = path.join(ROOT, "public/lang", code + ".js");
if (!code || !fs.existsSync(pack)) { console.error("no language pack for " + JSON.stringify(input.language)); process.exit(1); }

let src = fs.readFileSync(pack, "utf8");
const nl = src.includes("\r\n") ? "\r\n" : "\n";
const corrections = input.corrections || {};
const keys = Object.keys(corrections);
let changed = 0, added = 0, same = 0;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const en of keys) {
  const fix = String(corrections[en]).trim();
  if (!fix) continue;
  // {} placeholders must survive: the app fills a value in there.
  const want = (en.match(/\{\}/g) || []).length, got = (fix.match(/\{\}/g) || []).length;
  if (want !== got) { console.warn("  ! skipped (placeholder count differs): " + JSON.stringify(en)); continue; }
  const keyLit = JSON.stringify(en);
  const re = new RegExp("^([ \\t]*)" + escRe(keyLit) + ":[ \\t]*\"(?:[^\"\\\\]|\\\\.)*\"", "m");
  const m = src.match(re);
  if (m) {
    const line = m[1] + keyLit + ": " + JSON.stringify(fix);
    if (m[0] === line) { same++; continue; }
    src = src.replace(re, line.replace(/\$/g, "$$$$"));
    changed++;
    console.log("  ~ " + en.slice(0, 60) + (en.length > 60 ? "…" : "") + "  →  " + fix);
  } else {
    // A line the sheet showed as "not translated": add it at the end.
    const end = src.lastIndexOf("};");
    src = src.slice(0, end).replace(/[ \t\r\n]+$/, "") + "," + nl + "  " + keyLit + ": " + JSON.stringify(fix) + nl + "};" + nl;
    added++;
    console.log("  + " + en.slice(0, 60) + "  →  " + fix);
  }
}

if (!dry && (changed || added)) fs.writeFileSync(pack, src);
console.log(`\n  ${code}: ${changed} changed · ${added} added · ${same} already identical` + (dry ? "  (dry run — nothing written)" : ""));
if (Array.isArray(input.flagged) && input.flagged.length) {
  console.log(`\n  Flagged by the reviewer as unsure (not changed):`);
  for (const k of input.flagged) console.log("    ? " + k);
}
// Prove the pack still loads.
if (!dry) { const w = { TR: {} }; new Function("window", fs.readFileSync(pack, "utf8"))(w); console.log(`  pack loads: ${Object.keys(w.TR[code] || {}).length} keys`); }
