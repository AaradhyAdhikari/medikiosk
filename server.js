#!/usr/bin/env node
/**
 * MediKiosk — SIH26047, Ministry of Ayush
 * AI clinical history intake for AYUSH OPDs.
 *
 *   node server.js      →  http://localhost:3000
 *
 * Zero npm dependencies. Node 18 or newer. Data lives in ./data as plain JSON,
 * created on first run. Nothing to install, nothing to configure.
 *
 * Optional: put ANTHROPIC_API_KEY in a .env file next to this one and the
 * clinical summaries and document reading become real AI instead of a plain
 * assembly of the patient's answers. Everything else works either way.
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
const DB_FILE = path.join(DATA, "db.json");

// ─────────────────────────────────────────────────────────── env

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const AI_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const HOSPITAL = process.env.HOSPITAL_NAME || "All India Institute of Ayurveda";

// ─────────────────────────────────────────────────────────── store

const EMPTY = { patients: [], clinicians: [], visits: [], documents: [], events: [], otps: [], seeded: false };
let store = null;

let admin = null;
let firebaseDb = null;
let firebaseBucket = null;

try {
  admin = require("firebase-admin");
  const { getDatabase } = require("firebase-admin/database");
  const { getStorage } = require("firebase-admin/storage");
  
  let serviceAccount;
  
  // Try loading from file first (local development)
  const serviceAccountPath = path.join(ROOT, "firebase-service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  } 
  // Otherwise try environment variable (Vercel deployment)
  else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.warn("  ✗ FIREBASE_SERVICE_ACCOUNT env var is not valid JSON");
    }
  }
  // Or try individual environment variables
  else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL
    };
  }
  
  if (serviceAccount && process.env.FIREBASE_DB_URL) {
    admin.initializeApp({
      credential: admin.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DB_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    firebaseDb = getDatabase();
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      firebaseBucket = getStorage().bucket();
    }
    console.log("  Firebase Admin initialized.");
  } else if (process.env.VERCEL) {
    console.warn("  ✗ Firebase not configured - REQUIRED for Vercel deployment!");
    console.warn("     Add FIREBASE_DB_URL and FIREBASE_SERVICE_ACCOUNT to Vercel environment variables");
  }
} catch (e) {
  console.warn("  ✗ Firebase init failed:", e.message);
  if (process.env.VERCEL) {
    console.warn("     Firebase is REQUIRED for Vercel - check your environment variables");
  }
}

async function loadStore() {
  fs.mkdirSync(UPLOADS, { recursive: true });

  if (firebaseDb) {
    try {
      console.log("Fetching from Firebase Realtime Database...");
      const snap = await firebaseDb.ref('/').once('value');
      store = { ...EMPTY, ...(snap.val() || {}) };
      // RTDB omits empty arrays, restore them
      for (const k in EMPTY) {
        if (Array.isArray(EMPTY[k])) store[k] = store[k] || [];
      }
      return;
    } catch (e) {
      console.warn("  ✗ Firebase load failed, falling back to db.json:", e.message);
    }
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      store = { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
      return;
    } catch {
      const backup = DB_FILE + ".broken-" + Date.now();
      fs.renameSync(DB_FILE, backup);
      console.warn("  data/db.json was unreadable; moved to " + path.basename(backup) + " and started fresh.");
    }
  }
  store = JSON.parse(JSON.stringify(EMPTY));
  save();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (firebaseDb) firebaseDb.ref('/').set(store).catch(e => console.error("Firebase save error:", e.message));
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 500);
}
function saveNow() {
  clearTimeout(saveTimer);
  if (firebaseDb) firebaseDb.ref('/').set(store).catch(e => console.error("Firebase saveNow error:", e.message));
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function logEvent(kind, meta) {
  store.events.push({ id: id(), kind, meta: meta || {}, at: now() });
  if (store.events.length > 4000) store.events.splice(0, 1000);
  save();
}

// ─────────────────────────────────────────────────────────── auth

const SECRET = (() => {
  const f = path.join(DATA, "secret");
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const s = crypto.randomBytes(48).toString("base64");
  fs.writeFileSync(f, s);
  return s;
})();

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + mac;
}
function unsign(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== good.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function verifyPassword(pw, stored) {
  try {
    const [salt, key] = String(stored).split(":");
    const a = Buffer.from(key, "hex");
    const b = crypto.scryptSync(pw, salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
const sixDigits = () => String(100000 + (crypto.randomBytes(4).readUInt32BE(0) % 900000));

// ── patient login IDs
//
// The architecture table asks for "personal login ID and password for patients
// to enter data and store medical records". A phone number cannot be the ID:
// one number covers a whole family here, and family members are separate
// patients. So each patient gets a short ID of their own, printed on screen and
// sent with their ABHA number.

function makeLoginId() {
  for (let i = 0; i < 40; i++) {
    const candidate = "MK" + sixDigits();
    if (!store.patients.some((p) => p.loginId === candidate)) return candidate;
  }
  return "MK" + Date.now().toString().slice(-8);
}

// Patients forget which of their several numbers is "the" ID, so the login
// accepts any of the three things they have been given: the MediKiosk ID, the
// ABHA number, or their mobile — the last only when it identifies exactly one
// account, since a shared family number identifies nothing.
function resolveLogin(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");

  const byId = store.patients.find((p) => p.loginId && p.loginId.toUpperCase() === upper);
  if (byId) return byId;

  if (digits.length === 14) {
    const byAbha = store.patients.find((p) => String(p.abhaNumber || "").replace(/\D/g, "") === digits);
    if (byAbha && byAbha.passwordHash) return byAbha;
  }
  if (digits.length === 10) {
    const byPhone = store.patients.filter((p) => p.primaryPhone === digits && p.passwordHash);
    if (byPhone.length === 1) return byPhone[0];
  }
  return null;
}

const hasAccount = (p) => Boolean(p && p.passwordHash);

// Aadhaar's real checksum (Verhoeff). Catches a mistyped digit or a transposed
// pair before we ever ask the patient to wait for a code that will not come.
const VH_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VH_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeffValid(num) {
  let c = 0;
  const digits = String(num).replace(/\D/g, "").split("").reverse().map(Number);
  if (digits.length !== 12) return false;
  for (let i = 0; i < digits.length; i++) c = VH_D[c][VH_P[i % 8][digits[i]]];
  return c === 0;
}

// ─────────────────────────────────────────────────────────── chronology
//
// Module B of the problem statement asks for "chronological organization —
// automatically dates and orders documents into a coherent medical timeline".
// The date that matters is the one printed on the paper, not the order in
// which the patient happened to hold each sheet up to the camera. Extraction
// already returns that date as free text; this turns it into something
// sortable, and is deliberately conservative — a date it is not sure about is
// no date at all.

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

function makeDate(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  if (y < 100) y += y > 50 ? 1900 : 2000;
  if (y < 1900) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February and friends, which Date would silently roll forward.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  // A report dated in the future is a misread, not a document. Leaving it
  // undated is honest; putting it at the end of the timeline is a lie.
  if (dt.getTime() > Date.now() + 36 * 3600 * 1000) return null;
  return dt;
}

// Indian medical paperwork is day-first, so 03/04/2026 is the third of April
// and never the fourth of March. Getting this backwards would reorder a
// timeline while looking entirely plausible, so the order of these patterns
// matters: ISO first, then day-first numeric, then the written-month forms.
function parseDocDate(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return makeDate(+m[1], +m[2], +m[3]);
  if ((m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) return makeDate(+m[3], +m[2], +m[1]);
  if ((m = t.match(/(\d{1,2})\s*(?:st|nd|rd|th)?[-\s.]*([A-Za-z]{3,9})[-\s.,]*(\d{2,4})/))) {
    return makeDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  }
  if ((m = t.match(/([A-Za-z]{3,9})[-\s.]*(\d{1,2})(?:st|nd|rd|th)?[-\s.,]*(\d{2,4})/))) {
    return makeDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  }
  return null;
}

// The printed date, if the extraction found one; otherwise the date inside the
// label it wrote ("Lab report · 12 Jan 2026"). The summary text is never
// mined for dates — a date of birth or a next-review date sitting in that
// sentence would place the document years away from where it belongs.
function documentDate(doc) {
  const e = (doc && doc.extracted) || {};
  return parseDocDate(e.date) || parseDocDate(doc && doc.label);
}

// Worked out once, at scan time, and backfilled for anything stored before
// this existed. An answer already on the record is never recomputed.
function stampDocDate(doc) {
  if (doc && doc.docDate === undefined) {
    const d = documentDate(doc);
    doc.docDate = d ? d.toISOString() : null;
    doc.dateText = ((doc.extracted || {}).date) || null;
  }
  return doc;
}

// Oldest first, the way a clinician reads a file. A document whose date could
// not be read keeps its upload position relative to the others and goes to the
// end, flagged — guessing a slot for it would corrupt the timeline it was
// meant to join.
function chronological(docs) {
  const list = (docs || []).map(stampDocDate);
  const byUpload = (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  const dated = list.filter((d) => d.docDate)
    .sort((a, b) => a.docDate.localeCompare(b.docDate) || byUpload(a, b));
  const undated = list.filter((d) => !d.docDate).sort(byUpload);
  return dated.concat(undated);
}

// What the patient's own record shows for one visit's documents.
const publicDoc = (d) => ({
  id: d.id, visitId: d.visitId, label: d.label, readable: d.readable,
  extracted: d.extracted, createdAt: d.createdAt,
  docDate: d.docDate || null, dateText: d.dateText || null,
});

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const patientOf = (req) => unsign(cookies(req).mk_patient);
const doctorOf = (req) => unsign(cookies(req).mk_doctor);

// ─────────────────────────────────────────────────────────── SMS
//
// SMS_PROVIDER=console  → codes print to this terminal and appear on screen.
//                         Build and demo on this; it costs nothing.
// SMS_PROVIDER=msg91    → real delivery in India. Needs a DLT-approved template.
// SMS_PROVIDER=fast2sms → real delivery in India, simpler signup, DLT still applies.
// SMS_PROVIDER=twilio   → real delivery, easiest signup, worst Indian rates.

const smsProvider = () => (process.env.SMS_PROVIDER || "console").toLowerCase();
const smsLive = () => smsProvider() !== "console";

function normalisePhone(phone) {
  const d = String(phone).replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d;
}

async function sendSms(phone, message, vars) {
  const to = normalisePhone(phone);
  const p = smsProvider();

  if (p === "msg91") {
    const r = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: process.env.MSG91_AUTH_KEY || "" },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        sender: process.env.MSG91_SENDER_ID || "MEDKSK",
        short_url: "0",
        recipients: [Object.assign({ mobiles: to }, vars || { VAR1: message })],
      }),
    });
    const body = await r.text();
    if (!r.ok || /error/i.test(body)) throw new Error("MSG91: " + body.slice(0, 200));
    return { ok: true, provider: p };
  }

  if (p === "fast2sms") {
    const url = new URL("https://www.fast2sms.com/dev/bulkV2");
    url.searchParams.set("route", "otp");
    url.searchParams.set("variables_values", String(vars && vars.VAR1 ? vars.VAR1 : message));
    url.searchParams.set("numbers", to.replace(/^91/, ""));
    const r = await fetch(url, { headers: { authorization: process.env.FAST2SMS_API_KEY || "" } });
    const body = await r.text();
    if (!r.ok || /"return":false/.test(body)) throw new Error("Fast2SMS: " + body.slice(0, 200));
    return { ok: true, provider: p };
  }

  if (p === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(sid + ":" + tok).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: "+" + to, From: process.env.TWILIO_FROM || "", Body: message }),
    });
    if (!r.ok) throw new Error("Twilio: " + (await r.text()).slice(0, 200));
    return { ok: true, provider: p };
  }

  console.log(`\n  📩 SMS to +${to}\n     ${message}\n`);
  return { ok: true, provider: "console" };
}

const sendOtpSms = (phone, code) =>
  sendSms(phone, `${code} is your MediKiosk verification code. It expires in 10 minutes. Do not share it.`, { VAR1: code });

const sendAbhaSms = (phone, abha, name) =>
  sendSms(phone, `Namaste${name ? " " + name : ""}. Your ABHA number is ${abha}. Show this at any hospital to access your health records. — ${HOSPITAL}`, { VAR1: abha });

// A login ID that only ever appeared on a kiosk screen is a login ID nobody
// still has by the time they come back. It goes to the phone, like the ABHA.
const sendLoginIdSms = (phone, loginId, name) =>
  sendSms(phone, `Namaste${name ? " " + name : ""}. Your MediKiosk patient login ID is ${loginId}. Use it with your password to see your records. Never share your password. — ${HOSPITAL}`, { VAR1: loginId });

// ─────────────────────────────────────────────────────────── the interview

const RED_WORDS = [
  "chest pain", "chest tight", "breathless", "cannot breathe", "can't breathe", "shortness of breath",
  "bleeding", "unconscious", "fainted", "stroke", "paralysis", "seizure", "fits", "convulsion",
  "सीने में दर्द", "छाती में दर्द", "साँस", "सांस", "खून", "बेहोश", "लकवा", "दौरा", "मिर्गी",
];
function isRedFlag(text) {
  if (!text) return false;
  const t = String(Array.isArray(text) ? text.join(" ") : text).toLowerCase();
  return RED_WORDS.some((w) => t.includes(w.toLowerCase()));
}

// ─────────────────────────────────────────────────────────── AI (optional)

const aiOn = () => Boolean(AI_KEY);

async function askClaude(content, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": AI_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens || 3000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error("Claude API " + res.status + " " + (await res.text()).slice(0, 200));
  const j = await res.json();
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const c = fence ? fence[1] : text;
  try { return JSON.parse(c); } catch { }
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  if (a > -1 && b > a) { try { return JSON.parse(c.slice(a, b + 1)); } catch { } }
  throw new Error("Model did not return parseable JSON");
}

async function readDocumentAI(dataUrl) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw new Error("Expected a base64 image data URL");
  const text = await askClaude([
    { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
    {
      type: "text",
      text:
        "This is a photograph of an Indian medical document — a prescription, lab report, discharge summary " +
        "or a medicine strip. It may be handwritten, in Hindi or English, and poorly lit.\n\n" +
        "Extract only what you can actually read. Never guess a drug name, a dose or a value you cannot see " +
        "clearly — an omission is safe, an invention is dangerous.\n\n" +
        'Reply with ONLY a JSON object: {"docType": "prescription"|"lab_report"|"discharge"|"medicine_strip"|"other", ' +
        '"date": the printed date as a plain string or null, "label": a short human label like "Lab report · 12 Jan 2026", ' +
        '"summary": one sentence on what this document is, ' +
        '"findings": array of up to 8 short strings — diagnoses, medicines with dose, or test values with units and ranges, ' +
        '"abnormal": array of values outside their stated reference range, ' +
        '"readable": true if you could read the clinical content, false if the image is too unclear}',
    },
  ], 1500);
  return parseJson(text);
}

async function buildSummaryAI({ answers, documents, visitType, prior }) {
  const lines = [];
  for (const a of answers || []) {
    if (a.answer) lines.push(`- ${a.question} => ${Array.isArray(a.answer) ? a.answer.join(", ") : a.answer}  [source: ${a.source || "touch"}]`);
    if (a.customAnswer) lines.push(`- ${a.question} (patient's OWN WORDS, not a preset option) => ${a.customAnswer}  [source: ${a.customSource || "typed"}]`);
  }
  for (const d of documents || []) {
    const e = d.extracted || {};
    lines.push(`- Document "${d.label || "untitled"}": ${e.summary || "image only, not machine-readable"}` +
      (e.findings && e.findings.length ? ` | findings: ${e.findings.join("; ")}` : "") +
      (e.abnormal && e.abnormal.length ? ` | ABNORMAL: ${e.abnormal.join("; ")}` : ""));
  }
  const priorTxt = prior
    ? `\n\nPREVIOUS VISIT (${new Date(prior.assessedAt || prior.startedAt).toDateString()}):\nDiagnosis: ${prior.diagnosis || "not recorded"}\nPrescription: ${prior.prescription || "not recorded"}\n`
    : "";

  const text = await askClaude([{
    type: "text",
    text:
      "You are a clinical documentation assistant preparing an OPD history for a physician at an Ayurveda " +
      "hospital in India. The patient answered a self-service kiosk interview before the consultation. The " +
      "physician has about three minutes.\n\n" +
      "Rules that matter more than completeness:\n" +
      "- Never invent a finding, value, drug or dose. If something was not asked, write 'Not recorded'.\n" +
      "- Preserve the patient's own phrasing in quotes where they went off-script.\n" +
      "- You may offer an assessment, but frame it strictly as considerations for the physician to confirm or " +
      "reject. No examination has been performed. You are never making a diagnosis.\n" +
      `- This is a ${visitType || "FIRST"} visit.` + priorTxt +
      "\n\nPATIENT INPUT:\n" + (lines.join("\n") || "(no answers recorded)") +
      "\n\nReply with ONLY a JSON object with these keys:\n" +
      '{"chiefComplaint": string,\n' +
      ' "narrative": one flowing paragraph of 4-6 sentences, the story as a clinician would summarise it aloud,\n' +
      ' "hpi": 3-4 sentences in SOCRATES structure,\n' +
      ' "pastHistory": string, "medications": string, "allergies": string, "familyHistory": string,\n' +
      ' "personal": string covering diet, sleep, activity and habits as far as stated, "ros": string,\n' +
      ' "redFlags": array of short strings, empty if none,\n' +
      ' "triage": one of "ROUTINE", "PRIORITY", "URGENT",\n' +
      ' "assessment": 3-4 sentences on what this pattern suggests and what would change the picture, explicitly provisional,\n' +
      ' "differentials": array of up to 4 {"condition": string, "why": one short line of evidence from THIS history},\n' +
      ' "investigations": array of up to 5 short strings — examinations or tests worth considering,\n' +
      ' "ayurveda": {\n' +
      '    "prakriti": {"vata": number, "pitta": number, "kapha": number} summing to 100,\n' +
      '    "dashavidha": array of {"parameter": one of "Prakriti","Vikriti","Sara","Samhanana","Pramana","Satmya","Sattva","Ahara Shakti","Vyayama Shakti","Vaya", "finding": what the patient reported in Ayurvedic terms, "elicited": true or false} — include ALL TEN, marking elicited false with finding "Not elicited" where the patient was not asked or skipped,\n' +
      '    "agni": string, "koshtha": string, "aharaVihara": one sentence on diet and daily routine as reported,\n' +
      '    "considerations": 1-2 sentences relating the Dashavidha findings to the presenting complaint in Ayurvedic terms, naming a Samprapti pattern if one is evident,\n' +
      '    "note": one sentence stating that this is a screening indication from a kiosk interview and is not a substitute for the physician\'s own examination},\n' +
      ' "coding": {"icd10": best-guess ICD-10 code and title for the working impression or null, "namaste": best-guess NAMASTE (AYUSH) term and code if one plausibly applies or null, "confidence": "low"|"medium"|"high"} — these are SUGGESTIONS for the physician to confirm, never final,\n' +
      ' "priorInvestigations": one paragraph summarising every investigation result found in the scanned documents, oldest first, with dates — or "None available" if no documents were read,\n' +
      ' "documents": array of {"label": string, "summary": string},\n' +
      ' "suggestedQuestions": array of up to 4 short follow-up questions,\n' +
      ' "changeSinceLastVisit": string if this is a follow-up, else null}',
  }]);
  return parseJson(text);
}

function offlineSummary({ answers, documents }) {
  const find = (qid) => (answers || []).find((a) => a.questionId === qid);
  const val = (qid) => {
    const a = find(qid);
    if (!a) return null;
    const v = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
    return [v, a.customAnswer].filter(Boolean).join(" — ") || null;
  };
  const d = { vata: 0, pitta: 0, kapha: 0 };
  for (const a of answers || []) if (a.dosha) d[a.dosha] = (d[a.dosha] || 0) + 1;
  const tot = Math.max(1, d.vata + d.pitta + d.kapha);
  const pct = (n) => Math.round((n / tot) * 100);

  return {
    chiefComplaint: val("complaint") || val("progress") || "Not recorded",
    narrative:
      "Assembled directly from the patient's kiosk answers without AI interpretation. " +
      "Add ANTHROPIC_API_KEY to .env to enable the full clinical summary.",
    hpi: [val("site"), val("severity"), val("duration"), val("character")].filter(Boolean).join(", ") || "Not recorded",
    pastHistory: val("conditions") || "Nil stated",
    medications: val("meds") || "Nil stated",
    allergies: val("allergy") || "Nil stated",
    familyHistory: "Not recorded",
    personal: val("prakriti_sleep") || "Not recorded",
    ros: "Not recorded",
    redFlags: [],
    triage: "ROUTINE",
    assessment: "No AI assessment generated. The structured history above is the patient's own account, unprocessed.",
    differentials: [],
    investigations: [],
    ayurveda: {
      prakriti: { vata: pct(d.vata), pitta: pct(d.pitta), kapha: pct(d.kapha) },
      dashavidha: [
        ["Prakriti", "dv_prakriti"], ["Vikriti", "dv_vikriti"], ["Sara", "dv_sara"],
        ["Samhanana", "dv_samhanana"], ["Pramana", "dv_pramana"], ["Satmya", "dv_satmya"],
        ["Sattva", "dv_sattva"], ["Ahara Shakti", "dv_ahara_shakti"],
        ["Vyayama Shakti", "dv_vyayama_shakti"], ["Vaya", "dv_vaya"],
      ].map(([parameter, qid]) => ({
        parameter, finding: val(qid) || "Not elicited", elicited: Boolean(val(qid)),
      })),
      agni: val("agni") || "Not assessed",
      koshtha: val("koshtha") || "Not assessed",
      aharaVihara: [val("av_diet"), val("av_meals"), val("av_sleep"), val("av_activity")].filter(Boolean).join("; ") || "Not recorded",
      considerations: "Not generated — no AI key configured.",
      note: "Screening indication from a kiosk interview. Not a substitute for your own examination.",
    },
    coding: { icd10: null, namaste: null, confidence: "low" },
    priorInvestigations: (documents || []).length
      ? (documents || []).map((x) => (x.extracted && x.extracted.summary) || x.label).join(" · ")
      : "None available",
    documents: (documents || []).map((x) => ({ label: x.label || "Document", summary: (x.extracted && x.extracted.summary) || "Image only" })),
    suggestedQuestions: [],
    changeSinceLastVisit: null,
  };
}

// ─────────────────────────────────────────────────────────── seed

// Example patients are NEVER created automatically. A fresh install is empty:
// the first clinician registers, patients sign up, and the queue fills from
// real use. This is only called by an explicit request from a signed-in
// clinician, from the "load examples" control on the empty queue.
function loadExamples() {
  if (store.seeded) return false;

  const kamla = { id: id(), phone: "9812340017", primaryPhone: "9812340017", name: "Kamla Devi", ageYears: 62, sex: "F", language: "hi", abhaNumber: "91-4471-9930-2218", createdAt: now() };
  const ramesh = { id: id(), phone: "9812340023", primaryPhone: "9812340023", name: "Ramesh Yadav", ageYears: 54, sex: "M", language: "hi", abhaNumber: "91-2093-7741-6650", createdAt: now() };
  store.patients.push(kamla, ramesh);

  store.visits.push({
    id: id(), token: "A-17", patientId: kamla.id, status: "WAITING", visitType: "FIRST", triage: "ROUTINE",
    redFlag: false, example: true, startedAt: now(), submittedAt: now(),
    consent: { record: true, docs: true, share: true, locker: true }, answers: [],
    summary: {
      chiefComplaint: "Pain and stiffness in both knees, worse on climbing stairs, for about 8 months.",
      narrative:
        "A 62-year-old woman with type 2 diabetes and hypertension presents with an eight-month history of bilateral knee pain. " +
        "The pain is dull and aching, worse in the mornings and on stairs, and eases with rest and local heat. There is no history " +
        "of trauma. She reports increasing difficulty squatting and sitting cross-legged over the last two months, which is limiting " +
        "her daily activity. She has brought a recent lab report showing poor glycaemic control and a knee radiograph reported as " +
        "grade 2 osteoarthritic change.",
      hpi: "Gradual-onset bilateral knee pain, dull and aching, 4 of 5 in severity. Worse in the mornings and on stair climbing; eases with rest and local heat. No trauma, no swelling reported, no locking or giving way.",
      pastHistory: "Type 2 diabetes, high blood pressure",
      medications: "Metformin 500 mg twice daily; Amlodipine 5 mg once daily; intermittent over-the-counter analgesics",
      allergies: "No known allergies",
      familyHistory: "Not recorded",
      personal: "Sleeps deeply, 7-8 hours. Vegetarian diet, irregular meal timing. Minimal physical activity.",
      ros: "No fever, no weight loss, no urinary symptoms reported.",
      redFlags: [], triage: "ROUTINE",
      assessment:
        "The pattern is most consistent with bilateral knee osteoarthritis, supported by the radiograph she has brought and by the " +
        "mechanical character of the pain. Poor glycaemic control is relevant both as a contributor and as a constraint on management. " +
        "Examination of range of movement, crepitus and effusion would confirm or revise this.",
      differentials: [
        { condition: "Bilateral knee osteoarthritis", why: "Age, gradual onset, mechanical pain, grade 2 changes on her own radiograph" },
        { condition: "Inflammatory arthropathy", why: "Morning stiffness reported — duration not established, worth asking" },
        { condition: "Vitamin D deficiency related myalgia", why: "Common in this demographic, not yet investigated" },
      ],
      investigations: ["Knee examination: range, crepitus, effusion", "Establish duration of morning stiffness", "Serum vitamin D and calcium", "Repeat HbA1c", "Assess analgesic use and gastric symptoms"],
      ayurveda: {
        prakriti: { vata: 45, pitta: 20, kapha: 35 },
        dashavidha: [
          { parameter: "Prakriti", finding: "Thin build, gains weight with difficulty", elicited: true },
          { parameter: "Vikriti", finding: "Dryness, pain and stiffness", elicited: true },
          { parameter: "Sara", finding: "Dry skin, thin hair", elicited: true },
          { parameter: "Samhanana", finding: "Loose joints, tires easily", elicited: true },
          { parameter: "Pramana", finding: "152 cm, 68 kg", elicited: true },
          { parameter: "Satmya", finding: "Warm, lightly spiced food suits her", elicited: true },
          { parameter: "Sattva", finding: "Stays calm under difficulty", elicited: true },
          { parameter: "Ahara Shakti", finding: "Low appetite, digestion slow", elicited: true },
          { parameter: "Vyayama Shakti", finding: "Tires within a few minutes of walking", elicited: true },
          { parameter: "Vaya", finding: "Vriddha — over 60", elicited: true },
        ],
        agni: "Manda — low appetite, slow digestion",
        koshtha: "Krura — tends to constipation",
        aharaVihara: "Vegetarian; meal times irregular; deep long sleep; mostly seated through the day",
        considerations: "Vata-predominant constitution with Manda Agni and Krura Koshtha, consistent with a Vata-vitiation pattern (Sandhigata Vata) presenting as joint pain aggravated in the cold hours of the morning.",
        note: "Elicited at kiosk; requires physician confirmation before it informs management.",
      },
      documents: [
        { label: "Lab report · 12 Jan 2026", summary: "Fasting glucose 148 mg/dL, HbA1c 7.8% — both above reference range." },
        { label: "X-ray report · 03 Mar 2026", summary: "Bilateral knee radiograph, grade 2 osteoarthritic changes with medial joint space narrowing." },
      ],
      suggestedQuestions: ["Does the morning stiffness last more than 30 minutes?", "Is she taking the analgesics daily, and on an empty stomach?", "Any prior physiotherapy or intra-articular injection?"],
      changeSinceLastVisit: null,
      generated: "example",
    },
  });

  store.visits.push({
    id: id(), token: "P-23", patientId: ramesh.id, status: "WAITING", visitType: "FIRST", triage: "URGENT",
    redFlag: true, example: true, startedAt: now(), submittedAt: now(),
    consent: { record: true, docs: true, share: true, locker: false }, answers: [],
    summary: {
      chiefComplaint: "Tightness in the chest since this morning, with breathlessness on walking.",
      narrative:
        "A 54-year-old man with hypertension describes central chest tightness beginning roughly four hours ago, heavy and pressing " +
        "in character, associated with breathlessness on exertion and sweating. He reports no previous episode of this kind. His " +
        "father had a myocardial infarction at 60. The interview was interrupted by the priority triage alert.",
      hpi: "Central chest tightness of about four hours' duration, heavy and pressing, 4 of 5 in severity. Associated with exertional breathlessness and sweating. No prior similar episode.",
      pastHistory: "High blood pressure",
      medications: "Telmisartan 40 mg once daily",
      allergies: "No known allergies",
      familyHistory: "Father had a heart attack at 60 (patient stated)",
      personal: "Smokes occasionally. Irregular meals, works night shifts.",
      ros: "No fever, no cough. Reports sweating with the episode.",
      redFlags: [
        "Central chest tightness with exertional breathlessness and sweating — flagged for immediate triage",
        "Family history of early cardiac event",
      ],
      triage: "URGENT",
      assessment:
        "This presentation must be treated as possible acute coronary syndrome until excluded. The combination of central pressing " +
        "chest discomfort, exertional breathlessness, diaphoresis, hypertension and a first-degree family history of early infarction " +
        "is sufficient to warrant immediate assessment rather than routine queueing. Nothing here is reassuring enough to wait on.",
      differentials: [
        { condition: "Acute coronary syndrome", why: "Character, diaphoresis, risk factors and family history all support it" },
        { condition: "Gastro-oesophageal reflux", why: "Possible given irregular meals and night shifts, but does not explain the sweating" },
        { condition: "Musculoskeletal chest wall pain", why: "No trauma and the pain is not positional — less likely" },
      ],
      investigations: ["ECG immediately", "Troponin", "Blood pressure in both arms", "Cardiac examination", "Chest radiograph"],
      ayurveda: {
        prakriti: { vata: 40, pitta: 45, kapha: 15 },
        dashavidha: [
          { parameter: "Prakriti", finding: "Medium build, good muscle", elicited: true },
          { parameter: "Vikriti", finding: "Burning, acidity, heat", elicited: true },
          { parameter: "Sara", finding: "Not elicited", elicited: false },
          { parameter: "Samhanana", finding: "Not elicited", elicited: false },
          { parameter: "Pramana", finding: "Not elicited", elicited: false },
          { parameter: "Satmya", finding: "Not elicited", elicited: false },
          { parameter: "Sattva", finding: "Not elicited", elicited: false },
          { parameter: "Ahara Shakti", finding: "Strong appetite, cannot skip meals", elicited: true },
          { parameter: "Vyayama Shakti", finding: "Not elicited", elicited: false },
          { parameter: "Vaya", finding: "Madhya — 16 to 60", elicited: true },
        ],
        agni: "Tikshna — strong appetite, cannot skip meals",
        koshtha: "Mridu",
        aharaVihara: "Irregular meals, night shifts, occasional smoking",
        considerations: "Prakriti elicitation was incomplete — the interview was interrupted by the priority alert, which was the correct behaviour.",
        note: "Incomplete. Do not rely on this for management.",
      },
      documents: [],
      suggestedQuestions: ["Does the tightness radiate to the left arm or jaw?", "Has an ECG been done since arrival?", "Exact time of symptom onset?"],
      changeSinceLastVisit: null,
      generated: "example",
    },
  });

  store.seeded = true;
  saveNow();
  return true;
}

// ─────────────────────────────────────────────────────────── http helpers

function send(res, code, body, headers) {
  const h = Object.assign({ "cache-control": "no-store" }, headers || {});
  if (typeof body === "object" && !Buffer.isBuffer(body)) {
    h["content-type"] = "application/json; charset=utf-8";
    body = JSON.stringify(body);
  }
  res.writeHead(code, h);
  res.end(body);
}
const ok = (res, obj) => send(res, 200, obj);
const bad = (res, code, msg) => send(res, code, { error: msg });

function setCookie(res, name, value) {
  const prev = res.getHeader("set-cookie") || [];
  const list = Array.isArray(prev) ? prev : [prev];
  list.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
  res.setHeader("set-cookie", list);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > (limit || 8 * 1024 * 1024)) { reject(new Error("Body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (!path.extname(rel)) rel += ".html";
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, "Not found", { "content-type": "text/plain" });
  }
  send(res, 200, fs.readFileSync(file), { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
}

// ─────────────────────────────────────────────────────────── api

async function api(req, res, pathname) {
  const method = req.method;

  // ---- config for the client
  if (pathname === "/api/config" && method === "GET") {
    return ok(res, { hospital: HOSPITAL, aiEnabled: aiOn() });
  }

  // ---- patient: request a code
  if (pathname === "/api/otp/send" && method === "POST") {
    const { phone } = await readBody(req);
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length !== 10) return bad(res, 400, "Enter a 10-digit mobile number.");

    const since = Date.now() - 10 * 60 * 1000;
    const recent = store.otps.filter((o) => o.phone === digits && new Date(o.at).getTime() > since);
    if (recent.length >= 5) return bad(res, 429, "Too many codes requested. Wait ten minutes.");

    const code = sixDigits();
    store.otps.push({ id: id(), phone: digits, code, at: now(), used: false, attempts: 0 });
    if (store.otps.length > 500) store.otps.splice(0, 200);
    save();

    try {
      await sendOtpSms(digits, code);
    } catch (e) {
      console.error("  ✗ SMS failed:", e.message);
      return bad(res, 502, "We could not send the code. Please ask staff for help.");
    }
    logEvent("otp_sent", { phone: digits, provider: smsProvider() });

    // The code is only ever returned to the browser in console mode, where no
    // gateway exists and it has to be readable somewhere. With a real provider
    // configured it goes to the phone and nowhere else.
    return ok(res, { ok: true, code: smsLive() ? undefined : code, live: smsLive() });
  }

  // ---- patient: verify
  if (pathname === "/api/otp/verify" && method === "POST") {
    const { phone, code, name, ageYears, sex, heightCm, weightKg } = await readBody(req);
    const digits = String(phone || "").replace(/\D/g, "");
    const challenge = [...store.otps].reverse().find((o) => o.phone === digits && !o.used);
    if (!challenge) return bad(res, 400, "That code has expired. Ask for a new one.");
    if (challenge.attempts >= 5) return bad(res, 429, "Too many wrong attempts.");
    if (challenge.code !== String(code || "")) {
      challenge.attempts++; save();
      return bad(res, 400, "That code is not right.");
    }
    challenge.used = true;

    const clean = (name || "").trim();
    let patient = store.patients.find((p) => p.primaryPhone === digits && (!clean || p.name === clean));
    let abhaJustCreated = null;

    if (!patient) {
      const q = () => String(1000 + Math.floor(Math.random() * 8999));
      patient = {
        id: id(), phone: digits, primaryPhone: digits, name: clean || null,
        ageYears: ageYears ? Number(ageYears) : null,
        sex: sex || null,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        language: "hi",
        abhaNumber: `91-${q()}-${q()}-${q()}`,
        // Only the last four Aadhaar digits are ever stored, and only when the
        // patient came in through the Aadhaar door.
        aadhaarLast4: challenge.pendingAadhaarLast4 || null,
        createdAt: now(),
      };
      store.patients.push(patient);
      abhaJustCreated = patient.abhaNumber;
      sendAbhaSms(digits, patient.abhaNumber, clean).catch(function (e) {
        console.error("  ✗ ABHA SMS failed:", e.message);
      });
      logEvent("abha_created", { patientId: patient.id });
    } else {
      // A returning patient may fill in details they skipped last time.
      if (ageYears && !patient.ageYears) patient.ageYears = Number(ageYears);
      if (sex && !patient.sex) patient.sex = sex;
      if (heightCm) patient.heightCm = Number(heightCm);
      if (weightKg) patient.weightKg = Number(weightKg);
      if (challenge.pendingAadhaarLast4 && !patient.aadhaarLast4) patient.aadhaarLast4 = challenge.pendingAadhaarLast4;
    }
    save();

    setCookie(res, "mk_patient", sign({ pid: patient.id, phone: digits, auth: "otp", exp: Date.now() + 12 * 3600 * 1000 }));
    return ok(res, {
      ok: true,
      patient: { id: patient.id, name: patient.name, abhaNumber: patient.abhaNumber, loginId: patient.loginId || null },
      family: store.patients.filter((p) => p.primaryPhone === digits).map((p) => ({ id: p.id, name: p.name, ageYears: p.ageYears })),
      abhaJustCreated,
      // Whether the kiosk should offer to set up an account after this. OTP is
      // still what got them in; the account is layered on top of it.
      hasAccount: hasAccount(patient),
    });
  }

  // ---- patient: save profile details (new patients, after verification)
  if (pathname === "/api/patient/profile" && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Your session expired.");
    const patient = store.patients.find((p) => p.id === s.pid);
    if (!patient) return bad(res, 404, "Not found.");
    const { name, ageYears, sex, heightCm, weightKg, language } = await readBody(req);
    if (name != null && String(name).trim()) patient.name = String(name).trim();
    if (ageYears) patient.ageYears = Number(ageYears);
    if (sex) patient.sex = String(sex);
    if (heightCm) patient.heightCm = Number(heightCm);
    if (weightKg) patient.weightKg = Number(weightKg);
    if (language) patient.language = String(language);
    save();
    return ok(res, { ok: true, patient: { id: patient.id, name: patient.name, abhaNumber: patient.abhaNumber } });
  }

  // ---- patient: create the account — login ID and password
  //
  // Reached from the OTP-verified session, so the person setting the password
  // has already proved they hold the phone. OTP is not replaced by this; it
  // stays as the per-visit check and as the way back in if the password is
  // forgotten. This only means the patient now has a door of their own.
  if (pathname === "/api/patient/account" && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Verify your phone number first.");
    const patient = store.patients.find((p) => p.id === s.pid);
    if (!patient) return bad(res, 404, "Not found.");

    const { password } = await readBody(req);
    const pw = String(password || "");
    if (pw.length < 6) return bad(res, 400, "Use a password of at least 6 characters.");

    patient.loginId = patient.loginId || makeLoginId();
    patient.passwordHash = hashPassword(pw);
    patient.passwordSetAt = now();
    patient.loginFails = 0;
    patient.lockedUntil = null;
    save();
    logEvent("patient_account_created", { patientId: patient.id });

    sendLoginIdSms(patient.primaryPhone, patient.loginId, patient.name)
      .catch((e) => console.error("  ✗ Login ID SMS failed:", e.message));

    return ok(res, { ok: true, loginId: patient.loginId, abhaNumber: patient.abhaNumber });
  }

  // ---- patient: sign in with ID and password
  if (pathname === "/api/patient/login" && method === "POST") {
    const { loginId, password } = await readBody(req);
    const patient = resolveLogin(loginId);

    // Same message whichever half is wrong, so this cannot be used to find out
    // which IDs exist.
    const wrong = "That ID or password is not right.";
    if (!patient || !patient.passwordHash) return bad(res, 401, wrong);
    if (patient.lockedUntil && Date.now() < new Date(patient.lockedUntil).getTime()) {
      return bad(res, 429, "Too many attempts. Try again in a few minutes, or use your mobile number and a code instead.");
    }
    if (!verifyPassword(String(password || ""), patient.passwordHash)) {
      patient.loginFails = (patient.loginFails || 0) + 1;
      if (patient.loginFails >= 5) {
        patient.lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        patient.loginFails = 0;
      }
      save();
      return bad(res, 401, wrong);
    }

    patient.loginFails = 0;
    patient.lockedUntil = null;
    patient.lastLoginAt = now();
    save();
    setCookie(res, "mk_patient", sign({
      pid: patient.id, phone: patient.primaryPhone, auth: "password", exp: Date.now() + 12 * 3600 * 1000,
    }));
    logEvent("patient_login", { patientId: patient.id });
    return ok(res, {
      ok: true,
      patient: {
        id: patient.id, name: patient.name, ageYears: patient.ageYears, sex: patient.sex,
        abhaNumber: patient.abhaNumber, loginId: patient.loginId,
      },
    });
  }

  if (pathname === "/api/patient/session" && method === "GET") {
    const s = patientOf(req);
    if (!s) return ok(res, { patient: null });
    const p = store.patients.find((x) => x.id === s.pid);
    if (!p) return ok(res, { patient: null });
    return ok(res, {
      patient: { id: p.id, name: p.name, ageYears: p.ageYears, sex: p.sex, abhaNumber: p.abhaNumber, loginId: p.loginId || null },
      hasAccount: hasAccount(p),
      auth: s.auth || "otp",
    });
  }

  if (pathname === "/api/patient/logout" && method === "POST") {
    res.setHeader("set-cookie", "mk_patient=; Path=/; HttpOnly; Max-Age=0");
    return ok(res, { ok: true });
  }

  // ---- patient: their own record, read-only
  //
  // Everything the patient is entitled to see about themselves: past visits,
  // the documents they brought, and the summaries generated from them. The
  // provisional differentials and the AI assessment are deliberately not in
  // here — those are written for a physician to argue with, and a list of
  // conditions a patient was never diagnosed with does harm on a kiosk screen
  // with nobody standing next to it.
  if (pathname === "/api/patient/records" && method === "GET") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Sign in to see your records.");
    const p = store.patients.find((x) => x.id === s.pid);
    if (!p) return bad(res, 404, "Not found.");

    const mine = store.visits
      .filter((v) => v.patientId === p.id && v.status !== "IN_PROGRESS")
      .sort((a, b) => String(b.submittedAt || b.startedAt || "").localeCompare(String(a.submittedAt || a.startedAt || "")));

    const visits = mine.map((v) => {
      const sm = v.summary || {};
      return {
        id: v.id, token: v.token, visitType: v.visitType, status: v.status,
        triage: v.triage, redFlag: !!v.redFlag,
        startedAt: v.startedAt, submittedAt: v.submittedAt, assessedAt: v.assessedAt || null,
        diagnosis: v.diagnosis || null, prescription: v.prescription || null,
        icd10: v.icd10 || (sm.coding && sm.coding.icd10) || null,
        namaste: v.namaste || (sm.coding && sm.coding.namaste) || null,
        historyVerified: v.historyVerified || null,
        summary: {
          chiefComplaint: sm.chiefComplaint || null, narrative: sm.narrative || null, hpi: sm.hpi || null,
          pastHistory: sm.pastHistory || null, medications: sm.medications || null,
          allergies: sm.allergies || null, familyHistory: sm.familyHistory || null,
          personal: sm.personal || null, ros: sm.ros || null,
          priorInvestigations: sm.priorInvestigations || null,
          changeSinceLastVisit: sm.changeSinceLastVisit || null,
        },
        documents: chronological(store.documents.filter((d) => d.visitId === v.id)).map(publicDoc),
      };
    });

    // One timeline across every visit, so a patient sees their own history the
    // way the doctor does rather than one visit at a time.
    const ids = new Set(mine.map((v) => v.id));
    const documents = chronological(store.documents.filter((d) => ids.has(d.visitId))).map(publicDoc);
    save();

    return ok(res, {
      patient: {
        id: p.id, name: p.name, ageYears: p.ageYears, sex: p.sex,
        heightCm: p.heightCm || null, weightKg: p.weightKg || null,
        abhaNumber: p.abhaNumber, loginId: p.loginId || null,
        maskedPhone: p.primaryPhone ? "•••••• " + p.primaryPhone.slice(-4) : null,
        createdAt: p.createdAt,
      },
      hasAccount: hasAccount(p),
      visits,
      documents,
    });
  }

  // ---- patient: start a visit
  if (pathname === "/api/visits" && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Verify your phone number first.");
    const { visitType = "FIRST", consent = {} } = await readBody(req);
    const emergency = visitType === "EMERGENCY";
    const n = () => 10 + Math.floor(Math.random() * 89);
    const visit = {
      id: id(), token: emergency ? "P-" + n() : "A-" + n(), patientId: s.pid,
      status: "IN_PROGRESS", visitType, triage: emergency ? "URGENT" : "ROUTINE",
      redFlag: emergency, consent, answers: [], summary: null, startedAt: now(),
    };
    store.visits.push(visit);
    save();
    logEvent("visit_started", { visitId: visit.id, visitType });
    return ok(res, { visit });
  }

  // ---- patient: add a scanned document
  let m = pathname.match(/^\/api\/visits\/([\w-]+)\/documents$/);
  if (m && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Your session expired.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Visit not found.");
    if (visit.patientId !== s.pid) return bad(res, 403, "Not yours.");

    const { dataUrl } = await readBody(req);
    if (!dataUrl) return bad(res, 400, "dataUrl is required.");

    const docId = id();
    const b64 = String(dataUrl).split(",")[1] || "";
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(UPLOADS, docId + ".jpg"), buf);
    if (firebaseBucket) {
      await firebaseBucket.file(`uploads/${docId}.jpg`).save(buf, { contentType: "image/jpeg" })
        .catch(e => console.error("Firebase upload error:", e.message));
    }

    let extracted = { summary: "Saved as image — your doctor will read this.", findings: [], readable: false };
    let label = "Saved as image";
    const mayRead = visit.consent && visit.consent.docs !== false;

    if (aiOn() && mayRead) {
      try {
        const r = await readDocumentAI(dataUrl);
        extracted = r;
        label = r.label || r.docType || "Document";
      } catch (e) {
        label = "Saved as image — your doctor will read this";
        logEvent("ocr_failed", { visitId: visit.id, message: String(e.message).slice(0, 200) });
      }
    } else if (!mayRead) {
      label = "Saved — automatic reading was not consented to";
      extracted.summary = label;
    }

    const doc = { id: docId, visitId: visit.id, label, extracted, readable: extracted.readable !== false, createdAt: now() };
    stampDocDate(doc); // works out where this sheet sits on the timeline, once
    store.documents.push(doc);
    save();
    logEvent("document_added", { visitId: visit.id, readable: doc.readable, dated: !!doc.docDate });
    return ok(res, { document: publicDoc(doc) });
  }

  // ---- document image
  m = pathname.match(/^\/api\/documents\/([\w-]+)\/image$/);
  if (m && method === "GET") {
    if (!patientOf(req) && !doctorOf(req)) return bad(res, 401, "Sign in required.");
    const docId = m[1];
    if (firebaseBucket) {
      try {
        const fileRef = firebaseBucket.file(`uploads/${docId}.jpg`);
        const [exists] = await fileRef.exists();
        if (exists) {
          res.writeHead(200, { "content-type": "image/jpeg" });
          fileRef.createReadStream().pipe(res);
          return;
        }
      } catch (e) {
        console.warn("Firebase image fetch error:", e.message);
      }
    }
    const file = path.join(UPLOADS, docId + ".jpg");
    if (!fs.existsSync(file)) return bad(res, 404, "Not found.");
    return send(res, 200, fs.readFileSync(file), { "content-type": "image/jpeg" });
  }

  // ---- patient: submit the interview
  m = pathname.match(/^\/api\/visits\/([\w-]+)\/submit$/);
  if (m && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Your session expired.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Visit not found.");
    if (visit.patientId !== s.pid) return bad(res, 403, "Not yours.");

    const { answers = [] } = await readBody(req);
    // Oldest first, so the summary — and the prior-investigations paragraph in
    // particular — is written from a timeline rather than from scan order.
    const docs = chronological(store.documents.filter((d) => d.visitId === visit.id));

    // Red flags are decided by rule, never by the model. A missed emergency
    // must not depend on an API call succeeding.
    const flagged = visit.redFlag || answers.some((a) => isRedFlag(a.answer) || isRedFlag(a.customAnswer));

    const prior = [...store.visits].reverse().find((v) => v.patientId === visit.patientId && v.status === "ASSESSED" && v.id !== visit.id);

    let summary, generated = "ai";
    if (aiOn() && visit.consent && visit.consent.record !== false) {
      try {
        summary = await buildSummaryAI({ answers, documents: docs, visitType: visit.visitType, prior });
      } catch (e) {
        logEvent("summary_failed", { visitId: visit.id, message: String(e.message).slice(0, 300) });
        summary = offlineSummary({ answers, documents: docs });
        generated = "offline_fallback";
      }
    } else {
      summary = offlineSummary({ answers, documents: docs });
      generated = "offline";
    }
    summary.generated = generated;

    // The document list shown back to the patient is taken from the stored
    // records, not from whatever order the model echoed them in. Same labels
    // and same extracted sentences — but the timeline is not left to chance.
    summary.documents = docs.map((d) => ({
      label: d.label || "Document",
      summary: (d.extracted && d.extracted.summary) || "Image only",
      docDate: d.docDate || null,
      dateText: d.dateText || null,
    }));

    const modelFlags = Array.isArray(summary.redFlags) ? summary.redFlags : [];
    const redFlag = flagged || modelFlags.length > 0;
    if (redFlag && modelFlags.length === 0) summary.redFlags = ["Patient reported a potentially urgent symptom at intake."];

    visit.answers = answers;
    visit.summary = summary;
    visit.redFlag = redFlag;
    visit.triage = redFlag ? (summary.triage === "URGENT" ? "URGENT" : "PRIORITY") : "ROUTINE";
    visit.status = "WAITING";
    visit.submittedAt = now();
    if (redFlag && !visit.token.startsWith("P-")) visit.token = "P-" + visit.token.split("-")[1];
    save();

    logEvent(redFlag ? "red_flag" : "summary_generated", { visitId: visit.id, generated, documents: docs.length });
    return ok(res, { visit, redFlag, generated });
  }

  // ---- patient: identify by ABHA number
  // ABDM's own flow sends a one-time code to the mobile linked to the ABHA, so
  // this resolves the number to a patient and then falls through to OTP.
  if (pathname === "/api/identify/abha" && method === "POST") {
    const { abha } = await readBody(req);
    const digits = String(abha || "").replace(/\D/g, "");
    if (digits.length !== 14) return bad(res, 400, "An ABHA number has 14 digits.");

    const formatted = digits.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3-$4");
    const patient = store.patients.find((p) => String(p.abhaNumber || "").replace(/\D/g, "") === digits);
    if (!patient) {
      return bad(res, 404, "We could not find that ABHA number. Use your mobile number instead, or ask staff for help.");
    }

    const code = sixDigits();
    store.otps.push({ id: id(), phone: patient.primaryPhone, code, at: now(), used: false, attempts: 0 });
    save();
    try {
      await sendOtpSms(patient.primaryPhone, code);
    } catch (e) {
      return bad(res, 502, "We could not send the code to the linked mobile.");
    }
    logEvent("identify_abha", { patientId: patient.id });

    return ok(res, {
      ok: true,
      abha: formatted,
      phone: patient.primaryPhone,
      maskedPhone: "•••••• " + patient.primaryPhone.slice(-4),
      name: patient.name,
      code: smsLive() ? undefined : code,
      live: smsLive(),
    });
  }

  // ---- patient: identify by Aadhaar (creates or links an ABHA)
  if (pathname === "/api/identify/aadhaar" && method === "POST") {
    const { aadhaar, phone } = await readBody(req);
    const a = String(aadhaar || "").replace(/\D/g, "");
    const digits = String(phone || "").replace(/\D/g, "");
    if (a.length !== 12) return bad(res, 400, "An Aadhaar number has 12 digits.");
    if (!verhoeffValid(a)) return bad(res, 400, "That Aadhaar number does not look right. Please check it.");
    if (digits.length !== 10) return bad(res, 400, "Enter the 10-digit mobile linked to your Aadhaar.");

    const code = sixDigits();
    // Only the last four digits are ever retained. The full number is used to
    // verify the format and is then discarded — it is never written to disk.
    store.otps.push({
      id: id(), phone: digits, code, at: now(), used: false, attempts: 0,
      pendingAadhaarLast4: a.slice(-4),
    });
    save();
    try {
      await sendOtpSms(digits, code);
    } catch (e) {
      return bad(res, 502, "We could not send the code to that mobile.");
    }
    logEvent("identify_aadhaar", { last4: a.slice(-4) });

    return ok(res, {
      ok: true, phone: digits,
      maskedPhone: "•••••• " + digits.slice(-4),
      code: smsLive() ? undefined : code,
      live: smsLive(),
    });
  }

  // ---- doctor: register. The first account on a fresh install is approved
  // automatically, because someone has to be able to get in; every later
  // account waits for an existing clinician to approve it.
  if (pathname === "/api/doctor/register" && method === "POST") {
    const { name, email, password, hprId, department, room } = await readBody(req);
    const mail = String(email || "").toLowerCase().trim();
    if (!String(name || "").trim()) return bad(res, 400, "Enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad(res, 400, "Enter a valid email address.");
    if (String(password || "").length < 8) return bad(res, 400, "Use a password of at least 8 characters.");
    if (store.clinicians.some((c) => c.email === mail)) return bad(res, 409, "An account with that email already exists.");

    const first = store.clinicians.length === 0;
    const clinician = {
      id: id(), email: mail, passwordHash: hashPassword(String(password)),
      name: String(name).trim(), hprId: String(hprId || "").trim() || null,
      department: String(department || "").trim() || null,
      room: String(room || "").trim() || null,
      approved: first, createdAt: now(),
    };
    store.clinicians.push(clinician);
    save();
    logEvent("clinician_registered", { clinicianId: clinician.id, autoApproved: first });

    if (!first) {
      return ok(res, {
        ok: true, approved: false,
        message: "Your account has been created and is waiting for approval by a registered clinician."
      });
    }
    setCookie(res, "mk_doctor", sign({ cid: clinician.id, exp: Date.now() + 12 * 3600 * 1000 }));
    return ok(res, {
      ok: true, approved: true,
      clinician: { id: clinician.id, name: clinician.name, department: clinician.department, room: clinician.room, hprId: clinician.hprId },
    });
  }

  // ---- doctor: is this a fresh install?
  if (pathname === "/api/doctor/first-run" && method === "GET") {
    return ok(res, { firstRun: store.clinicians.length === 0, pending: store.clinicians.filter((c) => !c.approved).length });
  }

  // ---- doctor: approve a pending colleague
  if (pathname === "/api/doctor/approve" && method === "POST") {
    const s = doctorOf(req);
    if (!s) return bad(res, 401, "Sign in required.");
    const { clinicianId } = await readBody(req);
    const c = store.clinicians.find((x) => x.id === clinicianId);
    if (!c) return bad(res, 404, "No such account.");
    c.approved = true;
    save();
    logEvent("clinician_approved", { clinicianId: c.id, by: s.cid });
    return ok(res, { ok: true });
  }

  // ---- explicitly load two example patients (never automatic)
  if (pathname === "/api/examples" && method === "POST") {
    const s = doctorOf(req);
    if (!s) return bad(res, 401, "Sign in required.");
    const added = loadExamples();
    logEvent("examples_loaded", { by: s.cid, added });
    return ok(res, { ok: true, added });
  }

  // ---- doctor: login
  if (pathname === "/api/doctor/login" && method === "POST") {
    const { email, password } = await readBody(req);
    const c = store.clinicians.find((x) => x.email === String(email || "").toLowerCase().trim());
    if (!c || !verifyPassword(String(password || ""), c.passwordHash)) return bad(res, 401, "Those details are not right.");
    if (c.approved === false) {
      return bad(res, 403, "This account is waiting for approval by a registered clinician.");
    }
    setCookie(res, "mk_doctor", sign({ cid: c.id, exp: Date.now() + 12 * 3600 * 1000 }));
    logEvent("clinician_login", { clinicianId: c.id });
    return ok(res, { clinician: { id: c.id, name: c.name, department: c.department, room: c.room, hprId: c.hprId } });
  }

  if (pathname === "/api/doctor/session" && method === "GET") {
    const s = doctorOf(req);
    if (!s) return ok(res, { clinician: null });
    const c = store.clinicians.find((x) => x.id === s.cid);
    return ok(res, { clinician: c ? { id: c.id, name: c.name, department: c.department, room: c.room, hprId: c.hprId } : null });
  }

  if (pathname === "/api/doctor/logout" && method === "POST") {
    res.setHeader("set-cookie", "mk_doctor=; Path=/; HttpOnly; Max-Age=0");
    return ok(res, { ok: true });
  }

  // ---- doctor: the live queue
  if (pathname === "/api/queue" && method === "GET") {
    if (!doctorOf(req)) return bad(res, 401, "Sign in required.");
    const list = store.visits
      .filter((v) => v.status !== "IN_PROGRESS")
      .map((v) => {
        const p = store.patients.find((x) => x.id === v.patientId) || {};
        return {
          id: v.id, token: v.token, status: v.status, visitType: v.visitType, triage: v.triage,
          redFlag: v.redFlag, example: !!v.example, submittedAt: v.submittedAt,
          chiefComplaint: (v.summary && v.summary.chiefComplaint) || "History recorded",
          patient: { name: p.name || "Patient", ageYears: p.ageYears || null },
          documentCount: store.documents.filter((d) => d.visitId === v.id).length,
        };
      })
      .sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));

    const waiting = list.filter((v) => v.status !== "ASSESSED");
    return ok(res, {
      visits: list,
      stats: {
        waiting: waiting.length,
        redFlags: waiting.filter((v) => v.redFlag).length,
        assessed: list.filter((v) => v.status === "ASSESSED").length,
        total: list.length,
        minutesSaved: list.length * 4,
      },
    });
  }

  // ---- one visit
  m = pathname.match(/^\/api\/visits\/([\w-]+)$/);
  if (m && method === "GET") {
    const doc = doctorOf(req), pat = patientOf(req);
    if (!doc && !pat) return bad(res, 401, "Sign in required.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Not found.");
    if (!doc && visit.patientId !== pat.pid) return bad(res, 403, "Not yours.");
    const p = store.patients.find((x) => x.id === visit.patientId) || {};
    if (doc) logEvent("record_opened", { visitId: visit.id, clinicianId: doc.cid });
    const visitDocs = chronological(store.documents.filter((d) => d.visitId === visit.id));
    save(); // chronological() backfills dates onto older records; keep them
    return ok(res, {
      visit: Object.assign({}, visit, {
        patient: { name: p.name || "Patient", ageYears: p.ageYears, sex: p.sex, abhaNumber: p.abhaNumber },
        documents: visitDocs.map(publicDoc),
      }),
    });
  }

  if (m && method === "PATCH") {
    const s = doctorOf(req);
    if (!s) return bad(res, 401, "Sign in required.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Not found.");
    const body = await readBody(req);

    if (body.status === "IN_CONSULT") { visit.status = "IN_CONSULT"; visit.calledInAt = now(); visit.clinicianId = s.cid; }
    if (body.status === "ASSESSED") { visit.status = "ASSESSED"; visit.assessedAt = now(); visit.clinicianId = s.cid; }
    if (body.status === "WAITING") { visit.status = "WAITING"; visit.assessedAt = null; }
    if (typeof body.diagnosis === "string") visit.diagnosis = body.diagnosis;
    if (typeof body.prescription === "string") visit.prescription = body.prescription;
    if (typeof body.icd10 === "string") visit.icd10 = body.icd10;
    if (typeof body.namaste === "string") visit.namaste = body.namaste;
    if (typeof body.advice === "string") visit.advice = body.advice;

    // The physician verifies the AI draft once, as a whole: accept it as
    // written, or amend it and accept what they wrote. Whichever they choose is
    // what enters the record, and it is attributed to them.
    if (body.acceptHistory) {
      visit.historyVerified = "accepted";
      visit.verifiedBy = s.cid;
      visit.verifiedAt = now();
      logEvent("history_accepted", { visitId: visit.id, by: s.cid });
    }
    if (body.amendHistory && typeof body.amendHistory === "object") {
      const edits = {};
      const allowed = ["chiefComplaint", "hpi", "changeSinceLastVisit", "pastHistory", "medications",
        "allergies", "familyHistory", "personal", "ros", "priorInvestigations"];
      for (const k of allowed) {
        if (typeof body.amendHistory[k] === "string") edits[k] = body.amendHistory[k];
      }
      visit.summary = Object.assign({}, visit.summary, edits);
      visit.historyVerified = "amended";
      visit.verifiedBy = s.cid;
      visit.verifiedAt = now();
      logEvent("history_amended", { visitId: visit.id, fields: Object.keys(edits), by: s.cid });
    }

    if (body.pushToEmr) { visit.pushedToEmr = true; logEvent("fhir_push", { visitId: visit.id, mocked: true }); }
    save();
    logEvent("visit_updated", { visitId: visit.id, keys: Object.keys(body) });
    return ok(res, { visit });
  }

  return bad(res, 404, "No such endpoint.");
}

// ─────────────────────────────────────────────────────────── boot

(async function boot() {
  await loadStore();

  // Open the browser for them. Nobody should have to remember a URL to use
  // their own app, and a terminal window they never type into is not a terminal
  // window they should have to think about. NO_OPEN=1 turns this off.
  function openBrowser(url) {
    if (process.env.NO_OPEN) return;
    const { spawn } = require("child_process");
    try {
      if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    } catch {
      // No browser to open is not a reason to stop the server.
    }
  }

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pathname.startsWith("/api/")) {
      api(req, res, pathname).catch((e) => {
        console.error("  ✗", e.message);
        if (!res.headersSent) bad(res, 500, e.message || "Server error");
      });
      return;
    }
    serveStatic(req, res, pathname);
  });

  server.listen(PORT, () => {
    const line = "─".repeat(58);
    console.log(`\n  ${line}`);
    console.log("   MediKiosk  ·  SIH26047  ·  Ministry of Ayush");
    console.log(`  ${line}`);
    console.log(`\n   Open:      http://localhost:${PORT}`);
    if (store.clinicians.length === 0) {
      console.log("\n   FIRST RUN — no accounts yet.");
      console.log("   Go to /doctor and register. The first account is approved automatically.");
    } else {
      console.log(`\n   Clinicians registered: ${store.clinicians.length}`);
    }
    console.log(`\n   AI:        ${aiOn() ? "on (" + AI_MODEL + ")" : "off — add ANTHROPIC_API_KEY to .env"}`);
    console.log(`   SMS:       ${smsProvider() === "console" ? "console (codes print here)" : smsProvider()}`);
    console.log("   Data:      ./data/db.json   (delete the data folder to start over)");
    console.log(`\n  ${line}`);
    console.log("\n   Opening your browser… (keep this window open — it IS the app)\n");
    openBrowser(`http://localhost:${PORT}`);
  });

  // Starting it twice is a normal mistake, not a crash. If the port is already
  // taken, assume the app is already running and just open the browser again.
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`\n  MediKiosk is already running on port ${PORT}. Opening your browser…\n`);
      openBrowser(`http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 1500);
      return;
    }
    console.error("\n  ✗ Could not start:", e.message, "\n");
    process.exit(1);
  });

})();
