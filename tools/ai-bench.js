#!/usr/bin/env node
"use strict";
/* Runs the kiosk's real document reader (ai.js) against every provider that
   has a key in .env, on the two sample documents in tools/bench-samples, and
   scores each on what matters at the desk:

     - did it answer at all, and how fast
     - did it return the JSON the app needs
     - how many of the known facts on the paper did it actually pick up
     - did it invent anything (a drug or value not on the paper)

   Usage:  node tools/ai-bench.js            # every provider with a key
           node tools/ai-bench.js groq       # just one
           node tools/ai-bench.js groq mistral --runs 3
   Keys come from .env (never from the command line). */

const fs = require("fs");
const path = require("path");
const ai = require("../ai");

const ROOT = path.join(__dirname, "..");
(function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
})();

/* Ground truth: what a careful reader would take from each paper. Each
   "fact" is a set of alternative spellings; one hit counts. `bait` lists
   things NOT on the paper that a model might plausibly hallucinate. */
const SAMPLES = [
  {
    file: "lab-report-printed.jpg",
    docType: "lab_report",
    date: /14.*(mar|03).*2026/i,
    facts: [
      [/fasting glucose/i, /\b148\b/],
      [/hba1c/i, /7\.8/],
      [/total cholesterol/i, /\b236\b/],
      [/ldl/i, /\b162\b/],
      [/hdl/i, /\b41\b/],
      [/triglycerides?/i, /\b189\b/],
      [/creatinine/i, /0\.9/],
      [/tsh/i, /2\.4/],
    ],
    // These five are the out-of-range ones; the app shows them in red.
    abnormal: [/glucose|148/i, /hba1c|7\.8/i, /cholesterol|236/i, /ldl|162/i, /triglycerides?|189/i],
    bait: [/metformin/i, /insulin/i, /haemoglobin|hemoglobin/i, /\b(120|130|110)\b/],
  },
  {
    file: "prescription-handwritten.jpg",
    docType: "prescription",
    date: /0?2.*(sep|09).*2026/i,
    facts: [
      [/telmisartan/i, /40\s*mg/i],
      [/paracetamol/i, /650/],
      [/yograj/i, /guggul/i],
      [/dashmool/i, /20\s*ml/i],
      [/mahanarayan/i, /tail|oil/i],
      [/knee/i, /joint pain|stiffness/i],
      [/150\s*\/\s*92/, /\bbp\b|blood pressure/i],
      [/x-?ray/i, /review|15 days/i],
    ],
    abnormal: [],
    bait: [/amlodipine/i, /ibuprofen/i, /diclofenac/i, /ashwagandha/i, /500\s*mg/i],
  },
];

const args = process.argv.slice(2);
const runsIdx = args.indexOf("--runs");
const RUNS = runsIdx > -1 ? Number(args[runsIdx + 1]) || 1 : 1;
const wanted = args.filter((a, i) => !a.startsWith("--") && i !== runsIdx + 1);

const providers = Object.keys(ai.PROVIDERS)
  .filter((p) => process.env[ai.PROVIDERS[p].keyVar])
  .filter((p) => !wanted.length || wanted.includes(p));

if (!providers.length) {
  console.error("No provider has a key in .env. Set GROQ_API_KEY and/or MISTRAL_API_KEY and run again.");
  process.exit(1);
}

function textOf(r) { return JSON.stringify(r || {}); }
function score(sample, r) {
  const t = textOf(r);
  const facts = sample.facts.filter((alts) => alts.some((re) => re.test(t))).length;
  const abnormalText = JSON.stringify((r && r.abnormal) || []);
  const abnormal = sample.abnormal.filter((re) => re.test(abnormalText)).length;
  const invented = sample.bait.filter((re) => re.test(t)).length;
  const typeOk = r && r.docType === sample.docType;
  const dateOk = r && sample.date.test(String(r.date || r.label || ""));
  return { facts, of: sample.facts.length, abnormal, abnormalOf: sample.abnormal.length, invented, typeOk, dateOk, readable: r && r.readable !== false };
}

(async () => {
  const results = [];
  for (const p of providers) {
    const spec = ai.PROVIDERS[p];
    const model = process.env["AI_MODEL_" + p.toUpperCase()] || spec.model;
    const client = ai.makeClient({ provider: p, key: process.env[spec.keyVar], model, timeoutMs: 90000, log: () => {} });
    console.log("\n═══ " + spec.label + " · " + model + " ═══");
    for (const sample of SAMPLES) {
      const buf = fs.readFileSync(path.join(__dirname, "bench-samples", sample.file));
      const dataUrl = "data:image/jpeg;base64," + buf.toString("base64");
      for (let run = 1; run <= RUNS; run++) {
        const t0 = Date.now();
        let r, err;
        try { r = await client.readDocument(dataUrl); } catch (e) { err = e; }
        const ms = Date.now() - t0;
        const row = { provider: p, model, sample: sample.file, run, ms, ok: !err, error: err && String(err.message).slice(0, 160) };
        if (!err) Object.assign(row, score(sample, r));
        results.push(row);
        if (err) {
          console.log(`  ${sample.file}  run ${run}: FAILED in ${ms} ms — ${row.error}`);
        } else {
          console.log(`  ${sample.file}  run ${run}: ${ms} ms · facts ${row.facts}/${row.of}` +
            (row.abnormalOf ? ` · abnormal flagged ${row.abnormal}/${row.abnormalOf}` : "") +
            ` · invented ${row.invented} · type ${row.typeOk ? "✓" : "✗"} · date ${row.dateOk ? "✓" : "✗"} · readable ${row.readable ? "✓" : "✗"}`);
          console.log("     label: " + r.label + "\n     findings: " + JSON.stringify(r.findings || []).slice(0, 400));
        }
        // Free tiers are rate-limited; don't hammer them between runs.
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
  }

  console.log("\n═══ Summary ═══");
  for (const p of providers) {
    const rows = results.filter((r) => r.provider === p);
    const ok = rows.filter((r) => r.ok);
    const avg = (k) => ok.length ? (ok.reduce((s, r) => s + r[k], 0) / ok.length) : 0;
    const totalFacts = ok.reduce((s, r) => s + r.of, 0);
    console.log(
      `${ai.PROVIDERS[p].label.padEnd(8)} ok ${ok.length}/${rows.length}` +
      ` · median ${median(ok.map((r) => r.ms))} ms` +
      ` · facts ${ok.reduce((s, r) => s + r.facts, 0)}/${totalFacts}` +
      ` · abnormal ${ok.reduce((s, r) => s + r.abnormal, 0)}/${ok.reduce((s, r) => s + r.abnormalOf, 0)}` +
      ` · invented ${ok.reduce((s, r) => s + r.invented, 0)}` +
      ` · type ${ok.filter((r) => r.typeOk).length}/${ok.length} · date ${ok.filter((r) => r.dateOk).length}/${ok.length}`
    );
  }
  fs.writeFileSync(path.join(__dirname, "bench-samples", "last-run.json"), JSON.stringify(results, null, 2));
  console.log("\nRaw results: tools/bench-samples/last-run.json");
})();

function median(a) { if (!a.length) return "-"; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
