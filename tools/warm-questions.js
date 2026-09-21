#!/usr/bin/env node
/* Pre-generate the follow-up question sets before a demo.
 *
 *   node tools/warm-questions.js https://medikiosk-aaradhyadhikari.vercel.app
 *   node tools/warm-questions.js http://localhost:3000 mr hi
 *
 * The kiosk asks the model for a complaint's follow-up block the moment the
 * complaint is known, and keeps every answer in the shared store. So the
 * first patient per complaint and language waits three seconds; everyone
 * after gets it instantly. This script is that first patient, for every
 * chief-complaint chip in every language, spaced out so a free tier's
 * per-minute limit is never hit. Run it once before the demo, from anywhere.
 *
 * It signs in as a throwaway patient (console SMS mode shows the code) —
 * on a deployment with a real SMS gateway it cannot, and says so. */
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const LANGS = process.argv.slice(3).length ? process.argv.slice(3) : ["hi", "en", "mr", "gu", "pa", "ta", "te"];
const COMPLAINTS = ["Joint or knee pain", "Headache", "Stomach problem", "Breathing difficulty", "Fever",
                    "Sleep trouble or fatigue", "Skin problem"];
const GAP_MS = 25000;   // between calls — comfortably inside a free tier's per-minute token budget

let cookie = "";
async function api(p, body) {
  const r = await fetch(BASE + p, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(p + " -> " + r.status + " " + (j.error || ""));
  return j;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cfg = await api("/api/config");
  if (!cfg.aiQuestions) { console.error("AI questions are off on " + BASE + " (no key, or AI_QUESTIONS=off). Nothing to warm."); process.exit(1); }
  console.log("Warming " + COMPLAINTS.length + " complaints × " + LANGS.length + " languages on " + BASE + " — about " +
    Math.round(COMPLAINTS.length * LANGS.length * GAP_MS / 60000) + " minutes if nothing is cached yet.\n");
  let made = 0, cached = 0, failed = 0;
  for (const lang of LANGS) {
    const phone = "9" + String(Date.now() + Math.floor(Math.random() * 100000)).slice(-9);
    const s = await api("/api/otp/send", { phone });
    if (!s.code) { console.error("This deployment sends real SMS; this script cannot sign in on its own. Warm from a signed-in kiosk instead."); process.exit(1); }
    await api("/api/otp/verify", { phone, code: s.code, name: "Warm-up", ageYears: 40, sex: "M", language: lang });
    const v = (await api("/api/visits", { visitType: "FIRST", system: "ALLOPATHIC", consent: {}, language: lang })).visit;
    for (const c of COMPLAINTS) {
      const t0 = Date.now();
      let q;
      try { q = await api("/api/visits/" + v.id + "/questions", { complaintEn: c, complaintText: "" }); }
      catch (e) { q = { source: "static", detail: e.message }; }
      const ms = Date.now() - t0;
      if (q.source === "ai" && q.cached) { cached++; console.log("  " + lang + " · " + c.padEnd(26) + " already cached"); continue; }
      if (q.source === "ai") { made++; console.log("  " + lang + " · " + c.padEnd(26) + " " + q.questions.length + " questions in " + ms + " ms"); }
      else { failed++; console.log("  " + lang + " · " + c.padEnd(26) + " FAILED — " + (q.detail || q.reason)); }
      await sleep(GAP_MS);
    }
  }
  console.log("\nDone: " + made + " generated, " + cached + " already there, " + failed + " failed" + (failed ? " (run again later for those)" : "") + ".");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
