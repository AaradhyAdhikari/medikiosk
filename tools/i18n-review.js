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
  const rows = strings.filter((s) => s.en).map((s) => ({ ...s, t: table[s.en] || null, clinical: CLINICAL.has(s.en) }));
  const missing = rows.filter((r) => !r.t).length;
  const font = FONT[meta.script] || "system-ui";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>MediKiosk ${esc(meta.english)} Review</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari&family=Noto+Sans+Gujarati&family=Noto+Sans+Gurmukhi&family=Noto+Sans+Tamil&family=Noto+Sans+Telugu&display=swap">
<style>
  :root{--bg:#f7f9f6;--paper:#ffffff;--head:#f2f5f2;--ink:#0b1f1a;--line:#d9e0da;--muted:#5c6b60;--jade:#1f8a70;--jade-soft:#eef8f3;
        --flag:#b23a2b;--flag-soft:#fbe6e2;--code:#eef2ee;--btn-on:#0b1f1a;--btn-on-ink:#ffffff}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#101815;--paper:#18221e;--head:#1f2b26;--ink:#e8efe9;--line:#2c3a33;
        --muted:#9fb0a6;--jade:#4fc2a0;--jade-soft:#1b3129;--flag:#f08a78;--flag-soft:#3a1f1a;--code:#243029;--btn-on:#e8efe9;--btn-on-ink:#101815}}
  :root[data-theme="dark"]{--bg:#101815;--paper:#18221e;--head:#1f2b26;--ink:#e8efe9;--line:#2c3a33;
        --muted:#9fb0a6;--jade:#4fc2a0;--jade-soft:#1b3129;--flag:#f08a78;--flag-soft:#3a1f1a;--code:#243029;--btn-on:#e8efe9;--btn-on-ink:#101815}
  *{box-sizing:border-box}
  body{margin:0;padding-block:28px 60px;padding-inline:22px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg)}
  @media (max-width:600px){body{padding-inline:16px}}
  .wrap{max-width:1100px;margin:0 auto;overflow-x:auto}
  header{max-width:1100px;margin:0 auto 22px}
  h1{font-size:25px;margin:0 0 6px}
  .native{font-family:${font},system-ui;font-size:30px}
  p{margin:0 0 10px;color:var(--muted);max-width:75ch}
  .how{background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--jade);
       border-radius:10px;padding:14px 16px;margin:14px 0 0;color:var(--ink)}
  .how b{display:block;margin-bottom:4px}
  code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:13px}
  table{min-width:720px;width:100%;border-collapse:collapse;background:var(--paper);
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
     padding:9px 12px;border-bottom:2px solid var(--line);background:var(--head);position:sticky;top:env(safe-area-inset-top, 0px)}
  td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:0}
  tr.clinical td:first-child{border-left:3px solid var(--flag)}
  .tr{font-family:${font},system-ui;font-size:17px;line-height:1.55}
  .hi{font-family:'Noto Sans Devanagari',system-ui;color:var(--muted);font-size:14px}
  .en{font-size:14px}
  .miss{color:var(--flag);font-weight:700}
  .fix{width:30%}
  .corr{width:100%;font:inherit;font-family:${font},system-ui;font-size:16px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;resize:vertical;
        background:var(--paper);color:var(--ink)}
  .corr:focus-visible{outline:2px solid var(--jade);outline-offset:1px}
  .corr.has{border-color:var(--jade);background:var(--jade-soft)}
  .flaglbl{display:block;font-size:12px;color:var(--muted);margin-top:4px}
  .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}
  .btn{font:inherit;font-size:13px;padding:7px 12px;border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:999px;cursor:pointer}
  .btn:focus-visible{outline:2px solid var(--jade);outline-offset:2px}
  .btn.on{background:var(--btn-on);color:var(--btn-on-ink);border-color:var(--btn-on)}
  .sheet{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;place-items:center;padding:16px;z-index:9}
  .sheet.open{display:grid}
  .sheetcard{background:var(--paper);color:var(--ink);border-radius:14px;padding:18px;max-width:640px;width:100%}
  .sheetcard h2{margin:0 0 6px;font-size:18px}
  .sheetcard textarea{width:100%;height:220px;font:13px/1.4 ui-monospace,Consolas,monospace;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--code);color:var(--ink)}
  .sheetcard .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .btn.go{margin-left:auto;background:var(--jade);color:#fff;border-color:var(--jade);font-weight:700}
  .prog{font-size:13px;color:var(--muted)}
  tr.hidden{display:none}
  @media print{.fix,.bar{display:none}}
  .tag{display:inline-block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
       background:var(--flag-soft);color:var(--flag);padding:2px 6px;border-radius:99px;margin-top:5px}
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
    Type a better line in the <strong>Correction</strong> box next to anything that needs it (or tick <strong>flag</strong>
    if you are unsure what it should be). Your typing is saved in this browser as you go. When you are
    done, press <strong>Export corrections</strong> at the top and send us the file it downloads — nothing else
    is needed. Keep every <code>{}</code> — the app fills a value in there.<br><br>
    Sanskrit terms (Prakriti, Vikriti, Agni, Koshtha) are deliberately transliterated rather than
    translated, because a physician uses them by name. Say so if a transliteration reads wrongly.
  </div>
  <div class="bar">
    <button class="btn" data-f="all">All ${rows.length}</button>
    <button class="btn" data-f="clinical">Clinical only (${rows.filter((r) => r.clinical).length})</button>
    <button class="btn" data-f="done">With corrections</button>
    <span class="prog" id="prog"></span>
    <button class="btn go" id="export">Export corrections</button>
  </div>
</header>
<div class="wrap">
<table>
  <thead><tr><th>English</th><th>Hindi</th><th>${esc(meta.native)}</th><th class="fix">Correction · ${esc(meta.native)}</th></tr></thead>
  <tbody>
  ${rows.map((r) => `<tr${r.clinical ? ' class="clinical"' : ""}>
    <td class="en">${esc(r.en)}${r.clinical ? '<br><span class="tag">clinical</span>' : ""}</td>
    <td class="hi">${esc(r.hi)}</td>
    <td class="tr">${r.t ? esc(r.t) : '<span class="miss">— not translated —</span>'}</td>
    <td class="fix"><textarea class="corr" data-k="${esc(r.en)}" rows="2" placeholder="Leave empty if it is fine"></textarea>
      <label class="flaglbl"><input type="checkbox" class="flag" data-k="${esc(r.en)}"> flag — unsure</label></td></tr>`).join("\n  ")}
  </tbody>
</table>
</div>
<div class="sheet" id="sheet" role="dialog" aria-label="Export corrections">
  <div class="sheetcard">
    <h2>Your corrections</h2>
    <p>Copy this and send it to the team (WhatsApp, email — anything). It is only text.</p>
    <textarea id="out" readonly></textarea>
    <div class="row"><button class="btn go" id="copy">Copy</button><button class="btn" id="close">Close</button><span class="prog" id="copied"></span></div>
  </div>
</div>
<script>
(function () {
  var KEY = "mk_review_" + ${JSON.stringify(meta.code)};
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var boxes = document.querySelectorAll(".corr"), flags = document.querySelectorAll(".flag");
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} paint(); }
  function paint() {
    var n = 0, fl = 0;
    boxes.forEach(function (b) { var v = (state[b.dataset.k] || {}).fix || ""; b.classList.toggle("has", !!v.trim()); if (v.trim()) n++; });
    flags.forEach(function (c) { if ((state[c.dataset.k] || {}).flag) fl++; });
    document.getElementById("prog").textContent = n + " corrected · " + fl + " flagged";
  }
  boxes.forEach(function (b) {
    b.value = (state[b.dataset.k] || {}).fix || "";
    b.addEventListener("input", function () { state[b.dataset.k] = state[b.dataset.k] || {}; state[b.dataset.k].fix = b.value; save(); });
  });
  flags.forEach(function (c) {
    c.checked = !!(state[c.dataset.k] || {}).flag;
    c.addEventListener("change", function () { state[c.dataset.k] = state[c.dataset.k] || {}; state[c.dataset.k].flag = c.checked; save(); });
  });
  document.querySelectorAll("[data-f]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-f]").forEach(function (x) { x.classList.toggle("on", x === btn); });
      var f = btn.dataset.f;
      document.querySelectorAll("tbody tr").forEach(function (tr) {
        var k = tr.querySelector(".corr").dataset.k, st = state[k] || {};
        var show = f === "all" || (f === "clinical" && tr.classList.contains("clinical")) || (f === "done" && ((st.fix || "").trim() || st.flag));
        tr.classList.toggle("hidden", !show);
      });
    });
  });
  document.querySelector("[data-f=all]").classList.add("on");
  document.getElementById("export").addEventListener("click", function () {
    var out = { language: ${JSON.stringify(meta.code)}, exportedAt: new Date().toISOString(), corrections: {}, flagged: [] };
    Object.keys(state).forEach(function (k) {
      if ((state[k].fix || "").trim()) out.corrections[k] = state[k].fix.trim();
      if (state[k].flag) out.flagged.push(k);
    });
    document.getElementById("out").value = JSON.stringify(out, null, 2);
    document.getElementById("copied").textContent = Object.keys(out.corrections).length + " corrections · " + out.flagged.length + " flagged";
    document.getElementById("sheet").classList.add("open");
  });
  document.getElementById("close").addEventListener("click", function () { document.getElementById("sheet").classList.remove("open"); });
  document.getElementById("copy").addEventListener("click", function () {
    var ta = document.getElementById("out"); ta.select();
    var done = function () { document.getElementById("copied").textContent = "Copied — now paste it to the team."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { document.execCommand("copy"); done(); });
    else { document.execCommand("copy"); done(); }
  });
  paint();
})();
</script>
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
  const html = sheet(meta, w.TR[meta.code] || {});
  fs.writeFileSync(file, html);
  // The same page without the document wrapper, for hosts that add their own.
  fs.mkdirSync(path.join(OUT, "pages"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "pages", meta.code + ".html"),
    html.replace(/^<!doctype html><html lang="en"><head><meta charset="utf-8">\s*/, "").replace(/<\/head><body>/, "").replace(/<\/body><\/html>\s*$/, ""));
  console.log("  " + meta.english.padEnd(10) + " → review/" + meta.code + ".html");
  made++;
}
if (!made) console.log("  nothing to do" + (only ? " for " + only : ""));
