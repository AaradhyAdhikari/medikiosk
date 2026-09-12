#!/usr/bin/env node
/* Which strings is each language missing?
 *
 * The kiosk shows English when a translation is absent, which is honest but
 * still a gap. Run this before a demo: a language with missing keys will show
 * English sentences inside an otherwise Tamil or Marathi interview, and the
 * first person to notice should be you, not a patient.
 *
 *   node tools/i18n-check.js            → a count per language
 *   node tools/i18n-check.js mr         → the actual missing strings
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// the English keys the app actually asks for, taken from the source itself
const expected = require("./i18n-extract.js").extract(ROOT);
const want = new Set(expected.map((x) => x.en));

const win = { TR: {} };
const src = fs.readFileSync(path.join(ROOT, "public/i18n.js"), "utf8");
new Function("window", src)(win);

const only = process.argv[2];
const codes = win.LANGS.map((l) => l.code).filter((c) => c !== "hi" && c !== "en");
let bad = 0;

for (const code of codes) {
  const f = path.join(ROOT, "public/lang", code + ".js");
  if (!fs.existsSync(f)) { console.log(`  ${code}: no file — language will not be offered`); continue; }
  const w = { TR: {} };
  new Function("window", fs.readFileSync(f, "utf8"))(w);
  const have = w.TR[code] || {};
  const missing = [...want].filter((k) => !have[k]);
  const extra = Object.keys(have).filter((k) => !want.has(k));
  const state = missing.length ? "INCOMPLETE" : "complete";
  console.log(`  ${code}: ${Object.keys(have).length}/${want.size} — ${state}` +
    (extra.length ? ` · ${extra.length} unused key(s)` : ""));
  if (missing.length) bad++;
  if (only === code) {
    missing.forEach((m) => console.log("      MISSING: " + m));
    extra.forEach((m) => console.log("      UNUSED : " + m));
  }
}
process.exit(bad ? 1 : 0);
