#!/usr/bin/env node
/* A sheet a native speaker can actually sit down with.
 *
 *   node tools/i18n-review.js ta          → review/ta.html, open it in a browser
 *   node tools/i18n-review.js             → one sheet per language
 *
 * The translations in /public/lang were produced with machine assistance. For
 * a kiosk that asks clinical questions that is a starting point, not a
 * finished job: a question that reads oddly in Tamil is a question a patient
 * answers wrongly, and the answer reaches a physician looking like fact.
 *
 * The sheet puts English, Hindi and the translation side by side, groups the
 * lines the way the patient meets them, and marks the clinical ones — those
 * are the lines worth a careful reading if someone only has ten minutes. Each
 * row carries the exact key to correct in /public/lang/<code>.js.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "review");

const win = { TR: {} };
new Function("window", fs.readFileSync(path.join(ROOT, "public/i18n.js"), "utf8"))(win);
const strings = require("./i18n-extract.js").extract(ROOT);

// The questions a patient answers about their own body, and the consent they
// give. A mistranslation here changes what is recorded about them.
const CLINICAL = new Set(
  (function () {
    const w = {};
    new Function("window", fs.readFileSync(path.join(ROOT, "public/questions.js"), "utf8"))(w);
    const out = [];
    (function visit(o) {
      if (Array.isArray(o)) return o.forEach(visit);
      if (!o || typeof o !== "object") return;
      if (typeof o.en === "string") out.push(o.en);
      if (o.note && o.note.en) out.push(o.note.en);
      for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object") visit(o[k]);
    })(Object.keys(w).filter((k) => typeof w[k] !== "function").map((k) => w[k]));
    return out;
  })()
);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const FONT = {
  gujr: "'Noto Sans Gujarati'", guru: "'Noto Sans Gurmukhi'",
  taml: "'Noto Sans Tamil'", telu: "'Noto Sans Telugu'", deva: "'Noto Sans Devanagari'",
};

function sheet(meta, table) {
  const rows = strings.map((s) => ({ ...s, t: table[s.en] || null, clinical: CLINICAL.has(s.en) }));
  const missing = rows.filter((r) => !r.t).length;
  const font = FONT[meta.script] || "system-ui";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>MediKiosk — ${esc(meta.english)} review sheet</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari&family=Noto+Sans+Gujarati&family=Noto+Sans+Gurmukhi&family=Noto+Sans+Tamil&family=Noto+Sans+Telugu&display=swap">
<style>
  :root{--line:#d9e0da;--muted:#5c6b60;--jade:#1f8a70;--flag:#b23a2b}
  *{box-sizing:border-box}
  body{margin:0;padding:28px 22px 60px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#0b1f1a;background:#f7f9f6}
  header{max-width:1100px;margin:0 auto 22px}
  h1{font-size:25px;margin:0 0 6px}
  .native{font-family:${font},system-ui;font-size:30px}
  p{margin:0 0 10px;color:var(--muted);max-width:75ch}
  .how{background:#fff;border:1px solid var(--line);border-left:3px solid var(--jade);
       border-radius:10px;padding:14px 16px;margin:14px 0 0;color:#0b1f1a}
  .how b{display:block;margin-bottom:4px}
  code{background:#eef2ee;padding:1px 5px;border-radius:4px;font-size:13px}
  table{max-width:1100px;margin:0 auto;width:100%;border-collapse:collapse;background:#fff;
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
     padding:9px 12px;border-bottom:2px solid var(--line);background:#f2f5f2;position:sticky;top:0}
  td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:0}
  tr.clinical td:first-child{border-left:3px solid var(--flag)}
  .tr{font-family:${font},system-ui;font-size:17px;line-height:1.55}
  .hi{font-family:'Noto Sans Devanagari',system-ui;color:var(--muted);font-size:14px}
  .en{font-size:14px}
  .miss{color:var(--flag);font-weight:700}
  .ok{width:52px;text-align:center;color:#c3ccc5;font-size:19px}
  .tag{display:inline-block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
       background:#fbe6e2;color:var(--flag);padding:2px 6px;border-radius:99px;margin-top:5px}
  @media print{body{background:#fff;padding:0}.how{break-inside:avoid}tr{break-inside:avoid}th{position:static}}
</style></head><body>
<header>
  <h1>${esc(meta.english)} · <span class="native">${esc(meta.native)}</span></h1>
  <p>Every line the MediKiosk interview can show a patient, in the order they meet it.
     ${rows.length} lines${missing ? ` · <b class="miss">${missing} not yet translated</b>` : ""}.</p>
  <div class="how">
    <b>What we need from you</b>
    These were translated with machine assistance and have not been checked by a ${esc(meta.english)}
    speaker. Read the ${esc(meta.native)} column and mark anything that is wrong, stiff, or that a
    patient with little schooling would not use. The lines with a red edge are the clinical questions
    — a patient answers those about their own body, and the answer reaches a doctor as fact, so they
    matter most. <br><br>
    Corrections go in one file: <code>public/lang/${esc(meta.code)}.js</code>, matched by the English
    line. Keep every <code>{}</code> — the app fills a value in there.<br><br>
    Sanskrit terms (Prakriti, Vikriti, Agni, Koshtha) are deliberately transliterated rather than
    translated, because a physician uses them by name. Say so if a transliteration reads wrongly.
  </div>
</header>
<table>
  <thead><tr><th>English</th><th>Hindi</th><th>${esc(meta.native)}</th><th class="ok">ok?</th></tr></thead>
  <tbody>
  ${rows.map((r) => `<tr${r.clinical ? ' class="clinical"' : ""}>
    <td class="en">${esc(r.en)}${r.clinical ? '<br><span class="tag">clinical</span>' : ""}</td>
    <td class="hi">${esc(r.hi)}</td>
    <td class="tr">${r.t ? esc(r.t) : '<span class="miss">— not translated —</span>'}</td>
    <td class="ok">☐</td></tr>`).join("\n  ")}
  </tbody>
</table>
</body></html>`;
}

const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const meta of win.LANGS) {
  if (meta.code === "hi" || meta.code === "en") continue;
  if (only && meta.code !== only) continue;
  const f = path.join(ROOT, "public/lang", meta.code + ".js");
  if (!fs.existsSync(f)) continue;
  const w = { TR: {} };
  new Function("window", fs.readFileSync(f, "utf8"))(w);
  const file = path.join(OUT, meta.code + ".html");
  fs.writeFileSync(file, sheet(meta, w.TR[meta.code] || {}));
  console.log("  " + meta.english.padEnd(10) + " → review/" + meta.code + ".html");
  made++;
}
if (!made) console.log("  nothing to do" + (only ? " for " + only : ""));
