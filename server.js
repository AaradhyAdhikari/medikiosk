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
const os = require("os");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
/* Most serverless hosts mount the deployment read-only and give you only
   /tmp, which does not survive between invocations. Writing the store beside
   the code is right on a normal server and impossible there, so the path moves
   and Firebase becomes the source of truth rather than a mirror of it. */
const SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTIONS_WORKER_RUNTIME
);
const DATA = SERVERLESS ? path.join(os.tmpdir(), "medikiosk") : path.join(ROOT, "data");
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
/* Which model service writes the summary and reads the scanned documents.
   Same shape as SMS_PROVIDER below: one switch, several back ends, and the
   app degrades to its offline path rather than breaking if none is set.
   Provider is inferred from whichever key is present (see ai.js), so
   setting a single key in .env is enough; AI_PROVIDER only matters if you
   set several. Bound properly, with the timeout, further down. */
const { provider: AI_PROVIDER, model: AI_MODEL } = require("./ai").configure(process.env);
const HOSPITAL = process.env.HOSPITAL_NAME || "All India Institute of Ayurveda";
/* The address a phone at the check-in desk can actually reach. The token QR
   has to carry an absolute URL, and `localhost:3000` — which is what the
   kiosk's own browser sees — is useless to anyone else's device. Set this to
   the tunnel or deployment URL before a demo; left unset, the kiosk falls
   back to its own origin, which is right in production and wrong on a laptop. */
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");

// ─────────────────────────────────────────────────────────── store

const EMPTY = { patients: [], clinicians: [], visits: [], documents: [], events: [], otps: [], seeded: false };
let store = null;
const INSTANCE_ID = crypto.randomBytes(3).toString("hex");   // tells one serverless instance from another

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
  if (SERVERLESS) {
    /* Not required — the app runs without it. But on a serverless host the only
       durable store IS Firebase, so without it every cold start begins with an
       empty database and yesterday's visits are gone. Say that, rather than
       "REQUIRED", which sends people hunting for a failure that is not there. */
    console.warn("     Without it this deployment keeps nothing: each cold start begins empty.");
    console.warn("     Set FIREBASE_DB_URL and FIREBASE_SERVICE_ACCOUNT to fix that.");
  }
}

async function loadStore() {
  try {
    fs.mkdirSync(UPLOADS, { recursive: true });
  } catch (e) {
    // Read-only deployment. Firebase carries the data; local files are a cache.
    if (!SERVERLESS) throw e;
    console.warn("  local storage unavailable (read-only) — relying on Firebase");
  }

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

/* The local file is a convenience on a normal server and a doomed cache on a
   serverless one, so a failure to write it must not take the request down. */
function writeLocal() {
  try {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    if (!SERVERLESS) throw e;
  }
}

/* On a serverless host the response must not go out before the write has
   landed: the function may be frozen the moment it answers, and a write still
   in flight is a write that may never happen. send() waits on this. */
let pendingPersist = null;
function persist() {
  if (firebaseDb) {
    const p = firebaseDb.ref('/').set(store).catch(e => console.error("Firebase save error:", e.message));
    pendingPersist = p.finally(() => { if (pendingPersist === p) pendingPersist = null; });
  }
  writeLocal();
}

/* Several serverless instances serve the same kiosk and console. Each loaded
   the store once at cold start and saved the WHOLE of it back on every
   change, so an instance that had not seen the latest visit would overwrite
   it with its stale copy the next time anything was saved on it — and a
   doctor's request routed to that instance found no visit at all. Reading
   the store afresh at the start of every API request makes every instance
   act on the current state; the whole database is small enough that this is
   one round trip. */
async function refreshStore() {
  if (!SERVERLESS || !firebaseDb) return;
  try {
    const snap = await firebaseDb.ref('/').once('value');
    const fresh = { ...EMPTY, ...(snap.val() || {}) };
    for (const k in EMPTY) if (Array.isArray(EMPTY[k])) fresh[k] = fresh[k] || [];
    store = fresh;
  } catch (e) {
    console.warn("  store refresh failed, serving what this instance has:", e.message);
  }
}

function save() {
  /* A serverless function is frozen the moment it answers, so a write parked
     behind a 500ms timer is a write that silently never happens. Debouncing is
     only safe where the process outlives the response. */
  if (SERVERLESS) return persist();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

function saveNow() {
  clearTimeout(saveTimer);
  persist();
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
  /* On a normal install the secret lives in the data folder and survives
     restarts, so a clinician stays logged in. On a serverless host that folder
     is a fresh temp dir per cold start, so a generated secret would be a new
     secret every few minutes and every clinician would be logged out mid-shift.
     SESSION_SECRET is the way out; without it we still work, just badly, and
     say so rather than letting it look like a mystery. */
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (SERVERLESS) {
    console.warn("  ! SESSION_SECRET is not set. Logins will not survive a cold start.");
  }
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
// The SMS text promises "It expires in 10 minutes". This constant is what makes
// that true — /api/otp/verify enforces it rather than merely claiming it.
// The send-throttle counts requests over this same window on purpose, so the
// "five codes per phone" cap reads as "at most five codes live at once".
// The two were separate numbers that happened to agree; tying them together is
// a deliberate choice, and changing this value moves both.
const OTP_TTL_MS = 10 * 60 * 1000;

/* A short code for the token QR and for the desk to type when a slip is torn.
   Deliberately not the visit's UUID: a UUID is 36 characters, which pushes the
   QR two versions higher, and a denser symbol has smaller modules — on a
   thermal print scanned in corridor light, module size is the whole ball game.
   The alphabet drops O/0 and I/1/L, because someone is going to read this over
   a counter and someone else is going to type it. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function checkinCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(8);
    let out = "";
    for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!store.visits.some((v) => v.checkinCode === out)) return out;
  }
  return null;   // astronomically unlikely; the id still works as a fallback
}

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
  readStatus: d.readStatus || (d.readable ? "read" : "unreadable"),
  extracted: d.extracted, createdAt: d.createdAt,
  docDate: d.docDate || null, dateText: d.dateText || null,
});

/* ── rate limits ────────────────────────────────────────────────────
   A kiosk on the public internet is a script's target as much as a
   patient's. Every endpoint below either sends an SMS, calls a model, or
   fetches audio from a third party — each one somebody else's quota or
   the hospital's money. The limits are per client address and generous
   for a human at a screen: a patient cannot request twenty codes a
   minute, but a script can, and that is who this is for.

   The counters live in this process. On a serverless host that means per
   instance, which makes the ceiling looser than it looks, not tighter —
   the honest way to say it. A shared store would make it exact; for a
   prototype, best effort is the right cost. */
const rlBuckets = new Map();                        // key -> [timestamps]
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}
function rateLimited(req, name, max, windowMs) {
  const key = name + "|" + clientIp(req);
  const nowMs = Date.now();
  const hits = (rlBuckets.get(key) || []).filter((t) => nowMs - t < windowMs);
  if (hits.length >= max) { rlBuckets.set(key, hits); return true; }
  hits.push(nowMs);
  rlBuckets.set(key, hits);
  // Keep the map from growing without bound on a long-lived server.
  if (rlBuckets.size > 5000) for (const k of rlBuckets.keys()) { if (rlBuckets.size <= 4000) break; rlBuckets.delete(k); }
  return false;
}
const tooMany = (res, what) => bad(res, 429, "Too many " + what + " from this device. Please wait a minute and try again.");

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

/* Module A: a red flag "triggers immediate priority alert to triage staff
   rather than routine queueing". Top of the queue is not an alert — nobody
   is looking at the queue. This sends one, once per visit, to the phone in
   TRIAGE_PHONE through whichever SMS gateway is configured; in console mode
   it prints, like the OTPs. The doctor console also sounds on its own. */
const TRIAGE_PHONE = String(process.env.TRIAGE_PHONE || "").replace(/\D/g, "");
async function alertTriage(visit, reason) {
  if (visit.triageAlertedAt) return;               // one alert per visit, not one per screen
  visit.triageAlertedAt = now();
  const p = store.patients.find((x) => x.id === visit.patientId) || {};
  const who = [p.name, p.ageYears ? p.ageYears + "y" : null, p.sex].filter(Boolean).join(", ") || "patient";
  const msg = `EMERGENCY at kiosk — token ${visit.token} (${who}): ${reason}. Please attend. — ${HOSPITAL}`;
  logEvent("triage_alerted", { visitId: visit.id, reason, to: TRIAGE_PHONE ? "sms" : "console-only" });
  if (!TRIAGE_PHONE) { console.log("\n  🚨 " + msg + "\n     (set TRIAGE_PHONE in .env to send this by SMS)\n"); return; }
  try { await sendSms(TRIAGE_PHONE, msg, { VAR1: visit.token }); }
  catch (e) { console.error("  ! triage SMS failed:", e.message); }
}

// ─────────────────────────────────────────────────────────── spoken prompts

/* The kiosk speaks through the browser's own voices where it can. A Windows
   laptop, though, usually ships with English voices and nothing else, so a
   Hindi or Marathi patient got silence and a "text only" label. This is the
   fallback: the browser asks here, and the server fetches the audio from a
   free, keyless speech service and hands it back as MP3.

   What is spoken is the kiosk's own prompts — the questions, "please check
   this", the token — never the patient's answers, so nothing about them
   leaves the building through this path. TTS_PROVIDER=off disables it. */
const TTS_ON = String(process.env.TTS_PROVIDER || "google").toLowerCase() !== "off";
const TTS_LANGS = { hi: "hi", en: "en", mr: "mr", gu: "gu", pa: "pa", ta: "ta", te: "te" };
const TTS_DIR = path.join(DATA, "tts");
const ttsMem = new Map();                          // hash -> Buffer, bounded below
const TTS_MEM_MAX = 300;

async function ttsAudio(lang, text) {
  const key = crypto.createHash("sha1").update(lang + "\n" + text).digest("hex");
  if (ttsMem.has(key)) return ttsMem.get(key);
  const file = path.join(TTS_DIR, key + ".mp3");
  try { if (fs.existsSync(file)) return remember(key, fs.readFileSync(file)); } catch { }

  // The service takes ~200 characters a call. Split on sentence ends, then
  // on commas, so the pauses fall where a reader would pause anyway. MP3
  // frames concatenate cleanly, so the pieces play as one clip.
  const parts = [];
  for (const piece of splitForSpeech(text, 180)) {
    const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      TTS_LANGS[lang] + "&q=" + encodeURIComponent(piece);
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!r.ok) throw new Error("speech service " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100 || !/^audio/.test(r.headers.get("content-type") || "")) throw new Error("speech service returned no audio");
    parts.push(buf);
  }
  const audio = Buffer.concat(parts);
  try { fs.mkdirSync(TTS_DIR, { recursive: true }); fs.writeFileSync(file, audio); } catch { /* read-only host: memory only */ }
  return remember(key, audio);
}

function remember(key, buf) {
  if (ttsMem.size >= TTS_MEM_MAX) ttsMem.delete(ttsMem.keys().next().value);
  ttsMem.set(key, buf);
  return buf;
}

function splitForSpeech(text, max) {
  const out = [];
  // Devanagari danda (।) ends a sentence in Hindi and Marathi.
  for (const sentence of text.split(/(?<=[.!?।])\s+/)) {
    if (sentence.length <= max) { if (sentence.trim()) out.push(sentence.trim()); continue; }
    let cur = "";
    for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
      if ((cur + " " + clause).trim().length > max && cur) { out.push(cur.trim()); cur = clause; }
      else cur = (cur + " " + clause).trim();
    }
    // A clause still longer than the limit is cut at word boundaries.
    while (cur.length > max) {
      const cut = cur.lastIndexOf(" ", max);
      out.push(cur.slice(0, cut > 40 ? cut : max).trim());
      cur = cur.slice(cut > 40 ? cut : max).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── the interview

/* Every language the kiosk offers, not only Hindi and English. A patient who
   types "மார்பு வலி" must raise exactly the same flag as one who types "chest
   pain" — the safety net cannot be narrower than the interview. The identical
   list runs in the browser too (questions.js); both fire, because a missed
   emergency must not depend on either one alone. */
const RED_WORDS = [
  // English
  "chest pain", "chest tight", "breathless", "cannot breathe", "can't breathe", "shortness of breath",
  "bleeding", "unconscious", "fainted", "stroke", "paralysis", "seizure", "fits", "convulsion",
  // Hindi
  "सीने में दर्द", "छाती में दर्द", "साँस", "सांस", "खून", "बेहोश", "लकवा", "दौरा", "मिर्गी",
  // Marathi
  "छातीत दुखणे", "छातीत दुखत", "छातीत कळ", "श्वास", "दम लागतो", "रक्त", "बेशुद्ध", "पक्षाघात", "फेफरे", "झटका",
  // Gujarati
  "છાતીમાં દુખાવો", "છાતીમાં દુખ", "શ્વાસ", "દમ ચઢે", "લોહી", "બેભાન", "લકવો", "તાણ", "ખેંચ",
  // Punjabi
  "ਛਾਤੀ ਵਿੱਚ ਦਰਦ", "ਛਾਤੀ ਦਾ ਦਰਦ", "ਸਾਹ", "ਦਮ ਘੁਟ", "ਖ਼ੂਨ", "ਖੂਨ", "ਬੇਹੋਸ਼", "ਅਧਰੰਗ", "ਲਕਵਾ", "ਦੌਰਾ", "ਮਿਰਗੀ",
  // Tamil
  "மார்பு வலி", "மார்பில் வலி", "மூச்சு", "மூச்சுத் திணறல்", "இரத்தம்", "ரத்தம்", "மயக்கம்",
  "பக்கவாதம்", "வலிப்பு",
  // Telugu
  "ఛాతీ నొప్పి", "ఛాతీలో నొప్పి", "ఊపిరి", "ఊపిరాడటం లేదు", "రక్తం", "స్పృహ తప్ప", "పక్షవాతం",
  "మూర్ఛ", "ఫిట్స్",
];
function isRedFlag(text) {
  if (!text) return false;
  const t = String(Array.isArray(text) ? text.join(" ") : text).toLowerCase();
  return RED_WORDS.some((w) => t.includes(w.toLowerCase()));
}

/* ── departments ──────────────────────────────────────────────────────
   A hospital runs on departments, and a kiosk that cannot say which one a
   patient belongs to has only moved the queue, not shortened it. Every visit
   is routed to exactly one department. Two things decide it:

     1. a keyword router, below, which runs on EVERY intake and never fails
     2. the model, which may overrule the router when it has better reason

   The router runs first and always. If the model returns a department that
   is not in this registry, or returns nothing, the router's answer stands.
   Routing a toothache to the wrong clinic is an inconvenience; a queue that
   silently empties because a summary call timed out is an outage.

   `system` is the affinity: an allopathic intake should not be sent to
   Panchakarma, and an Ayurvedic one should land in an AYUSH OPD where an
   equivalent exists. `equivalent` pairs the two halves of the hospital, so a
   reassignment across systems is one click rather than a search. */

const DEPARTMENTS = [
  // ---- AYUSH departments
  { id: "KAYACHIKITSA", en: "Kayachikitsa", hi: "कायचिकित्सा", sub: "General medicine · Ayurveda",
    system: "ayush", equivalent: "GENERAL_MEDICINE", fallback: true,
    keywords: ["fever", "weakness", "fatigue", "tiredness", "diabetes", "sugar", "blood pressure", "hypertension",
      "thyroid", "anaemia", "anemia", "general", "body ache", "bodyache", "obesity", "weight",
      "बुखार", "कमज़ोरी", "कमजोरी", "थकान", "मधुमेह", "शुगर", "रक्तचाप", "मोटापा", "बदन दर्द"] },

  { id: "PANCHAKARMA", en: "Panchakarma", hi: "पंचकर्म", sub: "Shodhana therapies",
    system: "ayush", equivalent: null,
    keywords: ["panchakarma", "detox", "vamana", "virechana", "basti", "nasya", "raktamokshana",
      "shodhana", "abhyanga", "swedana", "पंचकर्म", "वमन", "विरेचन", "बस्ति", "नस्य", "अभ्यंग"] },

  { id: "SHALYA", en: "Shalya Tantra", hi: "शल्य तंत्र", sub: "Surgery · Ayurveda",
    system: "ayush", equivalent: "GENERAL_SURGERY",
    keywords: ["piles", "haemorrhoid", "hemorrhoid", "fistula", "fissure", "abscess", "boil", "lump",
      "swelling hard", "ulcer", "wound", "varicose", "hernia", "arsha", "bhagandara",
      "बवासीर", "अर्श", "भगंदर", "फिशर", "फोड़ा", "गांठ", "घाव", "हर्निया"] },

  { id: "SHALAKYA", en: "Shalakya Tantra", hi: "शालाक्य तंत्र", sub: "Eye, ENT and dental · Ayurveda",
    system: "ayush", equivalent: "ENT",
    keywords: ["eye", "vision", "blurred", "cataract", "ear", "hearing", "tinnitus", "nose", "sinus",
      "throat", "tonsil", "hoarse", "tooth", "teeth", "gum", "dental", "mouth ulcer", "netra", "karna",
      "आँख", "आंख", "दृष्टि", "मोतियाबिंद", "कान", "नाक", "गला", "दांत", "दाँत", "मसूड़", "मुँह"] },

  { id: "PRASUTI", en: "Prasuti Tantra & Stri Roga", hi: "प्रसूति तंत्र एवं स्त्री रोग", sub: "Obstetrics and gynaecology · Ayurveda",
    system: "ayush", equivalent: "GYNAECOLOGY",
    keywords: ["period", "menstrual", "menstruation", "menopause", "pregnan", "leucorrhoea", "white discharge",
      "pcod", "pcos", "infertility", "uterus", "vaginal", "postnatal", "lactation",
      "माहवारी", "मासिक", "गर्भ", "गर्भवती", "प्रदर", "श्वेत प्रदर", "बांझपन", "रजोनिवृत्ति"] },

  { id: "KAUMARBHRITYA", en: "Kaumarbhritya", hi: "कौमारभृत्य", sub: "Paediatrics · Ayurveda",
    system: "ayush", equivalent: "PAEDIATRICS",
    keywords: ["child", "infant", "baby", "newborn", "toddler", "teething", "vaccination", "growth delay",
      "बच्चा", "बच्चे", "शिशु", "नवजात", "बालक"] },

  { id: "SWASTHAVRITTA", en: "Swasthavritta & Yoga", hi: "स्वस्थवृत्त एवं योग", sub: "Preventive health, diet and yoga",
    system: "ayush", equivalent: null,
    keywords: ["lifestyle", "diet advice", "yoga", "prevention", "preventive", "wellness", "checkup",
      "check-up", "routine check", "rejuvenation", "rasayana", "immunity",
      "जीवनशैली", "योग", "आहार", "दिनचर्या", "रसायन", "रोग प्रतिरोधक"] },

  { id: "MANOVIGYAN", en: "Manovigyan Evam Manas Roga", hi: "मनोविज्ञान एवं मानस रोग", sub: "Mental health · Ayurveda",
    system: "ayush", equivalent: "PSYCHIATRY",
    keywords: ["anxiety", "depress", "stress", "panic", "insomnia", "sleepless", "mood", "memory loss",
      "addiction", "unmada", "apasmara",
      "चिंता", "अवसाद", "तनाव", "नींद नहीं", "अनिद्रा", "घबराहट", "मानसिक"] },

  // ---- biomedical departments
  { id: "GENERAL_MEDICINE", en: "General Medicine", hi: "सामान्य चिकित्सा", sub: "Internal medicine",
    system: "biomed", equivalent: "KAYACHIKITSA", fallback: true,
    keywords: ["fever", "weakness", "fatigue", "diabetes", "sugar", "blood pressure", "hypertension",
      "thyroid", "anaemia", "anemia", "infection", "general",
      "बुखार", "कमज़ोरी", "कमजोरी", "थकान", "मधुमेह", "शुगर", "रक्तचाप", "संक्रमण"] },

  { id: "DENTISTRY", en: "Dentistry", hi: "दंत चिकित्सा", sub: "Dental and oral health",
    system: "biomed", equivalent: "SHALAKYA",
    keywords: ["tooth", "teeth", "toothache", "dental", "gum", "cavity", "molar", "wisdom tooth",
      "denture", "jaw pain", "mouth ulcer", "bad breath", "bleeding gums",
      "दांत", "दाँत", "दंत", "मसूड़", "दाढ़", "मुँह में छाला", "जबड़"] },

  { id: "ORTHOPAEDICS", en: "Orthopaedics", hi: "अस्थि रोग", sub: "Bones, joints and spine",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["joint", "knee", "back pain", "backache", "spine", "shoulder", "fracture", "arthritis",
      "sprain", "bone", "neck pain", "sciatica", "slip disc", "hip pain",
      "जोड़", "घुटन", "कमर दर्द", "पीठ दर्द", "रीढ़", "कंधा", "हड्डी", "गठिया", "मोच"] },

  { id: "ENT", en: "ENT", hi: "नाक कान गला", sub: "Ear, nose and throat",
    system: "biomed", equivalent: "SHALAKYA",
    keywords: ["ear", "hearing", "tinnitus", "nose", "nasal", "sinus", "throat", "tonsil", "hoarse",
      "snoring", "vertigo", "ear discharge",
      "कान", "नाक", "गला", "साइनस", "टॉन्सिल", "चक्कर", "सुनाई"] },

  { id: "OPHTHALMOLOGY", en: "Ophthalmology", hi: "नेत्र रोग", sub: "Eye care",
    system: "biomed", equivalent: "SHALAKYA",
    keywords: ["eye", "vision", "blurred vision", "cataract", "glaucoma", "red eye", "watering eye",
      "spectacles", "glasses", "double vision", "eye pain",
      "आँख", "आंख", "दृष्टि", "मोतियाबिंद", "धुंधला", "चश्म"] },

  { id: "DERMATOLOGY", en: "Dermatology", hi: "त्वचा रोग", sub: "Skin, hair and nails",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["skin", "rash", "itch", "itching", "eczema", "psoriasis", "acne", "pimple", "hair fall",
      "hair loss", "dandruff", "fungal", "ringworm", "vitiligo", "white patch", "nail",
      "त्वचा", "खुजली", "दाने", "चकत्ते", "मुँहासे", "बाल झड़", "दाद", "सफेद दाग"] },

  { id: "CARDIOLOGY", en: "Cardiology", hi: "हृदय रोग", sub: "Heart and circulation",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["chest pain", "chest tight", "palpitation", "heart", "cardiac", "angina",
      "swelling feet", "high bp", "cholesterol",
      "सीने में दर्द", "छाती में दर्द", "धड़कन", "हृदय", "दिल"] },

  { id: "PULMONOLOGY", en: "Pulmonology", hi: "श्वास रोग", sub: "Lungs and breathing",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["cough", "breathless", "shortness of breath", "asthma", "wheez", "chest infection",
      "tuberculosis", "tb", "sputum", "copd", "smoking",
      "खांसी", "खाँसी", "साँस", "सांस", "दमा", "अस्थमा", "बलगम", "टीबी"] },

  { id: "GASTROENTEROLOGY", en: "Gastroenterology", hi: "उदर रोग", sub: "Stomach, liver and bowel",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["stomach", "abdomen", "abdominal", "acidity", "gas", "bloating", "indigestion",
      "constipation", "diarrhoea", "diarrhea", "loose motion", "vomit", "nausea", "jaundice",
      "liver", "ulcer stomach", "appetite",
      "पेट", "अम्ल", "गैस", "कब्ज", "दस्त", "उल्टी", "जी मिचला", "पीलिया", "यकृत", "भूख"] },

  { id: "NEUROLOGY", en: "Neurology", hi: "तंत्रिका रोग", sub: "Brain and nerves",
    system: "biomed", equivalent: "KAYACHIKITSA",
    keywords: ["headache", "migraine", "seizure", "fits", "convulsion", "numbness", "tingling",
      "paralysis", "stroke", "tremor", "giddiness", "weakness one side", "nerve",
      "सिरदर्द", "सिर दर्द", "माइग्रेन", "दौरा", "मिर्गी", "सुन्न", "झुनझुनी", "लकवा", "कंपन"] },

  { id: "PSYCHIATRY", en: "Psychiatry", hi: "मनोरोग", sub: "Mental health",
    system: "biomed", equivalent: "MANOVIGYAN",
    keywords: ["anxiety", "depress", "stress", "panic", "insomnia", "sleepless", "mood", "suicidal",
      "addiction", "alcohol", "hallucination",
      "चिंता", "अवसाद", "तनाव", "अनिद्रा", "घबराहट", "मानसिक", "नशा"] },

  { id: "GYNAECOLOGY", en: "Obstetrics & Gynaecology", hi: "स्त्री एवं प्रसूति रोग", sub: "Women's health",
    system: "biomed", equivalent: "PRASUTI",
    keywords: ["period", "menstrual", "menstruation", "menopause", "pregnan", "leucorrhoea",
      "white discharge", "pcod", "pcos", "infertility", "uterus", "vaginal", "contracept",
      "माहवारी", "मासिक", "गर्भ", "गर्भवती", "प्रदर", "बांझपन", "रजोनिवृत्ति"] },

  { id: "PAEDIATRICS", en: "Paediatrics", hi: "बाल रोग", sub: "Children's health",
    system: "biomed", equivalent: "KAUMARBHRITYA",
    keywords: ["child", "infant", "baby", "newborn", "toddler", "teething", "vaccination",
      "बच्चा", "बच्चे", "शिशु", "नवजात"] },

  { id: "GENERAL_SURGERY", en: "General Surgery", hi: "सामान्य शल्य", sub: "Surgical opinion",
    system: "biomed", equivalent: "SHALYA",
    keywords: ["piles", "haemorrhoid", "hemorrhoid", "fistula", "fissure", "hernia", "abscess",
      "lump", "gallstone", "appendix", "varicose", "swelling hard", "wound",
      "बवासीर", "भगंदर", "फिशर", "हर्निया", "गांठ", "पथरी", "फोड़ा"] },
];

/* ── routing in every language ────────────────────────────────────────
   The keyword lists above are English and Hindi. A Tamil patient who taps
   "மார்பு வலி" would match none of them, and would land in general OPD every
   time — which is safe but useless.

   Rather than hand-maintain twenty-two keyword lists in seven languages, the
   routing hints are DERIVED from the kiosk's own translation files. The
   phrases below are the ones a patient actually taps — the complaint chips,
   the body-map zones, the listed conditions — and every translation of them
   that exists in /public/lang becomes a keyword for the department named.

   The consequence worth having: adding a language adds its routing for free,
   and a translation corrected by a native speaker corrects the router too.
   They cannot drift apart, because there is only one copy. */
const COMPLAINT_ROUTING = {
  // what the patient taps on the first screen
  "Joint or knee pain":       { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  "Headache":                 { biomed: "NEUROLOGY",        ayush: "KAYACHIKITSA" },
  "Stomach problem":          { biomed: "GASTROENTEROLOGY", ayush: "KAYACHIKITSA" },
  "Breathing difficulty":     { biomed: "PULMONOLOGY",      ayush: "KAYACHIKITSA" },
  "Fever":                    { biomed: "GENERAL_MEDICINE", ayush: "KAYACHIKITSA" },
  "Skin problem":             { biomed: "DERMATOLOGY",      ayush: "KAYACHIKITSA" },
  "Sleep trouble or fatigue": { biomed: "GENERAL_MEDICINE", ayush: "KAYACHIKITSA" },
  // where they touched on the body map
  "Head":       { biomed: "NEUROLOGY",        ayush: "KAYACHIKITSA" },
  "Chest":      { biomed: "CARDIOLOGY",       ayush: "KAYACHIKITSA" },
  "Abdomen":    { biomed: "GASTROENTEROLOGY", ayush: "KAYACHIKITSA" },
  "Lower back": { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  "Shoulder":   { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  "Knee":       { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  "Foot":       { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  // conditions they tick
  "Asthma":            { biomed: "PULMONOLOGY",      ayush: "KAYACHIKITSA" },
  "Arthritis":         { biomed: "ORTHOPAEDICS",     ayush: "KAYACHIKITSA" },
  "Heart disease":     { biomed: "CARDIOLOGY",       ayush: "KAYACHIKITSA" },
  "Diabetes":          { biomed: "GENERAL_MEDICINE", ayush: "KAYACHIKITSA" },
  "High blood pressure": { biomed: "GENERAL_MEDICINE", ayush: "KAYACHIKITSA" },
  "Thyroid":           { biomed: "GENERAL_MEDICINE", ayush: "KAYACHIKITSA" },
};

/* Reads /public/lang/*.js the same way the browser does, and folds every
   translated complaint phrase into the department it routes to. Runs once at
   startup; a language with no file simply contributes nothing. */
function loadRoutingTranslations() {
  const dir = path.join(PUBLIC, "lang");
  let added = 0, langs = 0;
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")); } catch { return { added, langs }; }

  for (const file of files) {
    const code = file.replace(/\.js$/, "");
    let table = null;
    try {
      const win = { TR: {} };
      new Function("window", fs.readFileSync(path.join(dir, file), "utf8"))(win);
      table = win.TR[code];
    } catch (e) {
      console.warn("  ! could not read translations for routing:", file, e.message);
      continue;
    }
    if (!table || !Object.keys(table).length) continue;
    langs++;

    for (const [english, target] of Object.entries(COMPLAINT_ROUTING)) {
      const phrase = table[english];
      if (!phrase || typeof phrase !== "string") continue;
      for (const side of ["biomed", "ayush"]) {
        const dept = DEPARTMENTS.find((d) => d.id === target[side]);
        if (dept && !dept.keywords.includes(phrase)) { dept.keywords.push(phrase); added++; }
      }
    }
  }
  return { added, langs };
}

const DEPT_BY_ID = DEPARTMENTS.reduce((m, d) => (m[d.id] = d, m), {});
const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

// "GENERAL" is not a department a patient is routed to. It is what a clinician
// picks when they hold a general OPD and should see every case — the setting a
// small hospital, a registrar or a triage desk actually needs.
const GENERAL_SCOPE = "GENERAL";

const deptLabel = (deptId) =>
  deptId === GENERAL_SCOPE ? "All departments"
    : (DEPT_BY_ID[deptId] && DEPT_BY_ID[deptId].en) || deptId || "Unassigned";

const publicDepartments = () =>
  DEPARTMENTS.map((d) => ({ id: d.id, en: d.en, hi: d.hi, sub: d.sub, system: d.system, equivalent: d.equivalent }));

/* Accounts created before this feature existed carry no departmentId. They
   are treated as general clinicians — they keep seeing the whole queue,
   exactly as they did yesterday. An upgrade must never quietly hide a
   patient from a doctor who could see them this morning. */
const scopeOf = (clinician) => {
  const d = clinician && clinician.departmentId;
  return DEPT_BY_ID[d] ? d : GENERAL_SCOPE;
};
const isGeneralist = (clinician) => scopeOf(clinician) === GENERAL_SCOPE;

const publicClinician = (c) => c && ({
  id: c.id, name: c.name, hprId: c.hprId, room: c.room,
  departmentId: scopeOf(c),
  department: c.department || deptLabel(scopeOf(c)),
  isGeneralist: isGeneralist(c),
});

/* Which half of the hospital should this patient's department come from?
   BOTH is deliberately left open — an integrative consultation may sit in
   either, and the physician reassigns if the kiosk picked the wrong side. */
function deptPoolFor(system) {
  if (system === "ALLOPATHIC") return DEPARTMENTS.filter((d) => d.system === "biomed");
  if (system === "AYURVEDIC") return DEPARTMENTS.filter((d) => d.system === "ayush");
  return DEPARTMENTS;
}

const fallbackDept = (system) => (system === "ALLOPATHIC" ? "GENERAL_MEDICINE" : "KAYACHIKITSA");

/* The keyword router. Deliberately dumb, deliberately deterministic, and it
   runs whether or not there is an API key. The complaint carries more weight
   than the rest of the history, because the rest of the history is full of
   words about organs the patient is not here about. */
function routeDepartmentByRules({ answers, complaint, system }) {
  const pool = deptPoolFor(system);
  const complaintText = String(complaint || "").toLowerCase();
  const bodyText = (answers || [])
    .map((a) => [a.question, Array.isArray(a.answer) ? a.answer.join(" ") : a.answer, a.customAnswer]
      .filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

  let best = null, bestScore = 0;
  for (const d of pool) {
    let score = 0;
    for (const k of d.keywords) {
      const kw = k.toLowerCase();
      if (complaintText.includes(kw)) score += 3;
      else if (bodyText.includes(kw)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = d; }
  }

  if (!best || bestScore < 2) {
    return {
      id: fallbackDept(system),
      confidence: "low",
      reasoning: "No specialty-specific wording was found in the intake, so this is held in general OPD for triage.",
      source: "rules",
      score: bestScore,
    };
  }
  return {
    id: best.id,
    confidence: bestScore >= 6 ? "high" : "medium",
    reasoning: "Matched on wording in the patient's own complaint and history.",
    source: "rules",
    score: bestScore,
  };
}

/* Take whatever the model produced and make it safe to store. An id outside
   the registry, a wrong-system pick, or a missing object all fall back to the
   router rather than leaving the visit unrouted. */
function reconcileDepartment(modelDept, ruleDept, system) {
  const pool = deptPoolFor(system).map((d) => d.id);
  const raw = modelDept && typeof modelDept === "object" ? modelDept : {};
  const id = String(raw.id || "").toUpperCase().trim();

  if (DEPT_BY_ID[id] && pool.includes(id)) {
    return {
      id,
      label: deptLabel(id),
      confidence: ["low", "medium", "high"].includes(raw.confidence) ? raw.confidence : "medium",
      reasoning: String(raw.reasoning || "Suggested from the presenting complaint.").slice(0, 400),
      alternates: (Array.isArray(raw.alternates) ? raw.alternates : [])
        .map((x) => String(x || "").toUpperCase().trim())
        .filter((x) => DEPT_BY_ID[x] && x !== id && pool.includes(x))
        .slice(0, 2),
      source: "ai",
      ruleSuggestion: ruleDept.id,
      agreed: id === ruleDept.id,
    };
  }
  return {
    id: ruleDept.id,
    label: deptLabel(ruleDept.id),
    confidence: ruleDept.confidence,
    reasoning: ruleDept.reasoning,
    alternates: [],
    source: "rules",
    ruleSuggestion: ruleDept.id,
    agreed: true,
  };
}

// ─────────────────────────────────────────────────────────── AI (optional)

/* The provider code lives in ai.js so tools/ai-bench.js can drive the same
   reader without booting the kiosk. Everything below is a binding. */
const AI = require("./ai").configure(process.env, { serverless: SERVERLESS });
const { checkInteractions } = require("./interactions");

/* Module B: possible drug interactions, from every medicine this visit has
   seen — each scanned paper, what the patient said they take, the summary's
   medication line as the physician may have amended it, and what the
   physician is prescribing today. Run at submit and again whenever any of
   those change, so a clinician typing "diclofenac" for a patient on
   Ecosprin is told before they finish the line. Rule-based and narrow. */
function interactionsFor(visit) {
  const docs = chronological(store.documents.filter((d) => d.visitId === visit.id));
  const sm = visit.summary || {};
  const sources = docs.map((d) => ({
    label: d.label || "Document",
    text: [(d.extracted && d.extracted.summary) || ""].concat((d.extracted && d.extracted.findings) || []).join(" ; "),
  }));
  sources.push({
    label: "Reported at intake",
    text: [sm.medications || ""].concat(
      (visit.answers || []).map((a) => [a.answer, a.customAnswer].flat().filter(Boolean).join(" "))).join(" ; "),
  });
  if (visit.prescription) sources.push({ label: "Today's prescription", text: visit.prescription });
  return checkInteractions(sources);
}
const { buildBundle } = require("./fhir");
const aiOn = () => AI.on;
const askAI = AI.ask;
const readDocumentAI = AI.readDocument;
const parseJson = AI.parseJson;
let aiCheckCache = null;

/* ── system of medicine ───────────────────────────────────────────────
   The patient chooses Ayurvedic, allopathic or both at the kiosk. An
   allopathic intake never reaches the sixteen Ayurvedic questions, so the
   model must not be asked for Dashavidha findings it has no data for — an
   invented dosha reading in a physician's summary is worse than a blank. */
/* The languages a patient may have answered in. The summary the physician
   reads is always English — they have three minutes and a queue — but the
   patient's own words are quoted inside it, and a quotation in an unnamed
   script is not evidence of anything. Naming the language also tells the
   model not to "correct" a phrase it half-recognises. */
const LANG_NAMES = {
  hi: "Hindi", en: "English", mr: "Marathi", gu: "Gujarati",
  pa: "Punjabi", ta: "Tamil", te: "Telugu",
};

const SYSTEMS = ["AYURVEDIC", "ALLOPATHIC", "BOTH"];

const SYSTEM_BRIEF = {
  ALLOPATHIC:
    "SYSTEM OF MEDICINE: the patient asked for ALLOPATHIC treatment and was NOT asked the Ayurvedic " +
    "questions. There is no Dashavidha, dosha or Agni data in this history. Do not produce any. " +
    "Return null for the ayurveda key.\n\n",
  AYURVEDIC:
    "SYSTEM OF MEDICINE: the patient asked for AYURVEDIC treatment and answered the full Dashavidha " +
    "Pariksha. The physician will read this history in Ayurvedic terms.\n\n",
  BOTH:
    "SYSTEM OF MEDICINE: the patient asked for BOTH Ayurvedic and allopathic treatment and answered the " +
    "full Dashavidha Pariksha. Write for an integrative consultation — hold the biomedical and the " +
    "Ayurvedic reading side by side rather than choosing between them.\n\n",
};

const AYURVEDA_SPEC_FULL =
  ' "ayurveda": {\n' +
  '    "prakriti": {"vata": number, "pitta": number, "kapha": number} summing to 100,\n' +
  '    "dashavidha": array of {"parameter": one of "Prakriti","Vikriti","Sara","Samhanana","Pramana","Satmya","Sattva","Ahara Shakti","Vyayama Shakti","Vaya", "finding": what the patient reported in Ayurvedic terms, "elicited": true or false} — include ALL TEN, marking elicited false with finding "Not elicited" where the patient was not asked or skipped,\n' +
  '    "agni": string, "koshtha": string, "aharaVihara": one sentence on diet and daily routine as reported,\n' +
  '    "considerations": 1-2 sentences relating the Dashavidha findings to the presenting complaint in Ayurvedic terms, naming a Samprapti pattern if one is evident,\n' +
  '    "note": one sentence stating that this is a screening indication from a kiosk interview and is not a substitute for the physician' + "'" + 's own examination},\n';

const AYURVEDA_SPEC = {
  ALLOPATHIC: ' "ayurveda": null — the patient was not asked the Ayurvedic questions,\n',
  AYURVEDIC: AYURVEDA_SPEC_FULL,
  BOTH: AYURVEDA_SPEC_FULL,
};

const CODING_SPEC = {
  ALLOPATHIC:
    ' "coding": {"icd10": best-guess ICD-10 code and title for the working impression or null, "namaste": null, "confidence": "low"|"medium"|"high"} — a SUGGESTION for the physician to confirm, never final,\n',
  AYURVEDIC:
    ' "coding": {"icd10": best-guess ICD-10 code and title for the working impression or null, "namaste": best-guess NAMASTE (AYUSH) term and code if one plausibly applies or null, "confidence": "low"|"medium"|"high"} — these are SUGGESTIONS for the physician to confirm, never final,\n',
  BOTH:
    ' "coding": {"icd10": best-guess ICD-10 code and title for the working impression or null, "namaste": best-guess NAMASTE (AYUSH) term and code if one plausibly applies or null, "confidence": "low"|"medium"|"high"} — give both where both plausibly apply; these are SUGGESTIONS for the physician to confirm, never final,\n',
};

/* The department block of the summary. The model is given only the departments
   this hospital actually runs on the patient's side of the system choice, by
   id, so it cannot invent a clinic that does not exist. It is told to route on
   the presenting complaint rather than on everything the patient mentioned —
   a diabetic with a toothache is a dental case today. */
function DEPARTMENT_SPEC(system) {
  const pool = deptPoolFor(system)
    .map((d) => `${d.id} (${d.en} — ${d.sub})`)
    .join("; ");
  return (
    ' "department": {"id": EXACTLY one id from this list and nothing else — ' + pool + ', ' +
    '"confidence": "low"|"medium"|"high", ' +
    '"reasoning": one short sentence, in plain English, naming the finding in THIS history that sends the patient there, ' +
    '"alternates": array of up to 2 other ids from the same list that a triage clerk might reasonably choose instead} ' +
    "— route on the PRESENTING COMPLAINT, not on the patient's background conditions. A patient with long-standing " +
    "diabetes who has come about a toothache belongs to the dental clinic today. Where the complaint is vague, " +
    "multi-system, or you are not reasonably sure, choose the general medicine department and say low confidence — " +
    "sending an unclear case to general OPD is correct, guessing a specialty is not. This is a routing SUGGESTION " +
    "for the front desk and the physician, never a decision,\n"
  );
}

async function buildSummaryAI({ answers, documents, visitType, system, prior, language }) {
  system = SYSTEMS.includes(system) ? system : "AYURVEDIC";
  const langName = LANG_NAMES[language] || "Hindi";
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

  const text = await askAI([{
    type: "text",
    text:
      "You are a clinical documentation assistant preparing an OPD history for a physician at an Ayurveda " +
      "hospital in India. The patient answered a self-service kiosk interview before the consultation. The " +
      "physician has about three minutes.\n\n" +
      SYSTEM_BRIEF[system] +
      "Rules that matter more than completeness:\n" +
      "- Never invent a finding, value, drug or dose. If something was not asked, write 'Not recorded'.\n" +
      "- Preserve the patient's own phrasing in quotes where they went off-script.\n" +
      (language === "en" ? "" :
        `- The patient answered in ${langName}, and the answers below are in ${langName}. Write the ` +
        "summary itself in ENGLISH, because that is what the physician reads. Where you quote the " +
        `patient's own words, give the ${langName} exactly as they wrote or said it, followed by an ` +
        "English rendering in brackets — a quotation the physician cannot read is not evidence, and a " +
        "quotation you have silently translated is no longer theirs. Do not correct their spelling or " +
        "their grammar.\n") +
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
      ' "assessment": REQUIRED, never empty. 3-4 sentences on what this pattern suggests and what would\n' +
      '   change the picture, explicitly provisional. If the presentation is mild and unremarkable, say so\n' +
      '   plainly and say what would make you revisit it — do not pad it, and do not manufacture concern.\n' +
      '   The clinician reads this on every patient, so silence here would read as reassurance,\n' +
      ' "differentials": array of up to 4 {"condition": string, "why": one short line of evidence from THIS history}.\n' +
      '   Fit them to the actual complaint. An empty array is correct for a presentation that does not warrant\n' +
      '   a differential; inventing plausible-sounding conditions to fill space is worse than returning none,\n' +
      ' "investigations": array of up to 5 short strings — examinations or tests worth considering, chosen for\n' +
      '   THIS complaint rather than a generic panel. Return an empty array rather than routine screening that\n' +
      '   this history does not call for; over-investigation has its own cost to the patient,\n' +
      DEPARTMENT_SPEC(system) +
      AYURVEDA_SPEC[system] +
      CODING_SPEC[system] +
      ' "priorInvestigations": one paragraph summarising every investigation result found in the scanned documents, oldest first, with dates — or "None available" if no documents were read,\n' +
      ' "documents": array of {"label": string, "summary": string},\n' +
      ' "suggestedQuestions": array of up to 4 short follow-up questions,\n' +
      ' "changeSinceLastVisit": string if this is a follow-up, else null,\n' +
      /* The one part of the summary the PATIENT hears. Their language, their
         level, and none of the physician's provisional reasoning — a kiosk
         reading a differential aloud to someone in a queue does harm. */
      ` "forPatient": 4-6 short plain sentences IN ${langName}${language === "en" ? "" : " (in its own script, not transliterated)"}, addressed to the patient as "you",\n` +
      '   saying back what has been recorded: the main problem and how long, the key details they gave, medicines and\n' +
      '   allergies noted, and which papers were read. Simple words a person with no schooling follows when it is read\n' +
      '   aloud. NO diagnosis, NO assessment, NO differentials, NO department — those are for the physician. End with\n' +
      '   one sentence saying the doctor will now go through this with them}',
  }]);
  const out = parseJson(text);

  /* The console shows this block on every patient, so an empty assessment
     would present as "nothing to flag" when what actually happened is that
     the model returned nothing. Those two are not the same thing and a
     clinician must not have to tell them apart. Say which it was. */
  if (!String(out.assessment || "").trim()) {
    out.assessment =
      "The model returned no assessment for this intake. That is a gap in the tooling, " +
      "not a finding — read the history above on its own terms.";
  }
  if (!Array.isArray(out.differentials)) out.differentials = [];
  if (!Array.isArray(out.investigations)) out.investigations = [];

  return out;
}

function offlineSummary({ answers, documents, system }) {
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

  // Routing does not depend on the AI being on. Without a key the keyword
  // router is the whole of it, and the queue still sorts itself by clinic.
  const complaint = val("complaint") || val("progress") || "";
  const ruleDept = routeDepartmentByRules({ answers, complaint, system });

  return {
    chiefComplaint: val("complaint") || val("progress") || "Not recorded",
    department: {
      id: ruleDept.id,
      label: deptLabel(ruleDept.id),
      confidence: ruleDept.confidence,
      reasoning: ruleDept.reasoning,
      alternates: [],
      source: "rules",
      ruleSuggestion: ruleDept.id,
      agreed: true,
    },
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
    ayurveda: system === "ALLOPATHIC" ? null : {
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
    system: "AYURVEDIC",
    department: "KAYACHIKITSA", departmentLabel: "Kayachikitsa",
    departmentSource: "example", departmentConfidence: "high",
    consent: { record: true, docs: true, share: true, locker: true }, answers: [],
    summary: {
      chiefComplaint: "Pain and stiffness in both knees, worse on climbing stairs, for about 8 months.",
      department: {
        id: "KAYACHIKITSA", label: "Kayachikitsa", confidence: "high", source: "example",
        reasoning: "Chronic bilateral joint pain with a Vata-vitiation pattern — an Ayurvedic internal medicine case, not a surgical one.",
        alternates: ["PANCHAKARMA"], ruleSuggestion: "KAYACHIKITSA", agreed: true,
      },
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
    system: "BOTH",
    department: "CARDIOLOGY", departmentLabel: "Cardiology",
    departmentSource: "example", departmentConfidence: "high",
    consent: { record: true, docs: true, share: true, locker: false }, answers: [],
    summary: {
      chiefComplaint: "Tightness in the chest since this morning, with breathlessness on walking.",
      department: {
        id: "CARDIOLOGY", label: "Cardiology", confidence: "high", source: "example",
        reasoning: "Exertional chest tightness of same-day onset — routed to cardiology, and flagged so it stays visible on every clinician's queue.",
        alternates: ["GENERAL_MEDICINE"], ruleSuggestion: "CARDIOLOGY", agreed: true,
      },
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
  if (SERVERLESS && pendingPersist) {
    const finish = () => res.end(body);
    pendingPersist.then(finish, finish);
    return;
  }
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
    return ok(res, {
      hospital: HOSPITAL, aiEnabled: aiOn(), publicUrl: PUBLIC_URL || null,
      // Provider and model only — never the key. Enough to see, from the kiosk
      // or a browser tab, why a scan came back unread.
      aiProvider: aiOn() ? AI_PROVIDER : null, aiModel: aiOn() ? AI_MODEL : null,
      tts: TTS_ON,
      // Where the data lives. "memory" on a serverless host means nothing
      // survives a cold start and instances do not see each other.
      storage: firebaseDb ? "firebase" : (SERVERLESS ? "memory" : "file"),
      instance: INSTANCE_ID,
    });
  }

  // ---- which AI keys actually work. One tiny call per provider, answers
  // cached for a minute so a refresh-happy tab cannot burn a free quota.
  if (pathname === "/api/ai/check" && method === "GET") {
    if (!aiCheckCache || Date.now() - aiCheckCache.at > 60000) {
      aiCheckCache = { at: Date.now(), result: await AI.check() };
    }
    return ok(res, { chain: AI.chain, providers: aiCheckCache.result, checkedAt: new Date(aiCheckCache.at).toISOString() });
  }

  // ---- spoken prompts, for languages this machine has no voice for
  if (pathname === "/api/tts" && method === "GET") {
    if (!TTS_ON) return bad(res, 404, "Spoken prompts are switched off.");
    // Audio-guided mode reads every screen; a patient still makes well under
    // this many requests a minute. A script does not.
    if (rateLimited(req, "tts", 60, 60000)) return tooMany(res, "speech requests");
    const qs = new URL(req.url, "http://x").searchParams;
    const lang = String(qs.get("lang") || "").toLowerCase();
    // A whole screen — question, hint, eight options — is a few hundred
    // characters; this is a ceiling against abuse, not a working limit.
    const text = String(qs.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!TTS_LANGS[lang]) return bad(res, 400, "Unsupported language.");
    if (!text) return bad(res, 400, "q is required.");
    try {
      const audio = await ttsAudio(lang, text);
      // The same prompt is said to every patient; let the browser keep it.
      return send(res, 200, audio, { "content-type": "audio/mpeg", "cache-control": "public, max-age=604800" });
    } catch (e) {
      console.warn("  tts failed (" + lang + "):", String(e.message).slice(0, 120));
      return bad(res, 502, "Speech is not available right now.");
    }
  }

  // ---- the department registry
  // Public on purpose: the clinician registration form needs it before anyone
  // has an account, and it is a list of clinic names, not patient data.
  if (pathname === "/api/departments" && method === "GET") {
    return ok(res, { departments: publicDepartments(), generalScope: GENERAL_SCOPE });
  }

  // ---- patient: request a code
  if (pathname === "/api/otp/send" && method === "POST") {
    if (rateLimited(req, "otp", 10, 10 * 60000)) return tooMany(res, "code requests");
    const { phone } = await readBody(req);
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length !== 10) return bad(res, 400, "Enter a 10-digit mobile number.");

    const since = Date.now() - OTP_TTL_MS;
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
    const { phone, code, name, ageYears, sex, heightCm, weightKg, language } = await readBody(req);
    const digits = String(phone || "").replace(/\D/g, "");
    /* There are three separate ways to have no live code, and they used to all
       come back as "that code has expired". That was the wrong thing to tell a
       patient who had just typed a correct code seconds ago and had it accepted
       — the second request in a double submit read as a rejection of the code
       itself, on screen, in red, right after being let in. Say which it is. */
    const forPhone = [...store.otps].reverse().filter((o) => o.phone === digits);
    const challenge = forPhone.find((o) => !o.used);
    if (!challenge) {
      const last = forPhone[0];
      if (!last) return bad(res, 400, "No code has been sent to that number. Ask for a new one.");
      if (last.code === String(code || "")) {
        // The right code, already spent. Nothing is wrong with the patient's
        // typing, so do not tell them there is.
        return bad(res, 409, "That code has already been used. If you are not through yet, ask for a new one.");
      }
      return bad(res, 400, "That code has already been used. Ask for a new one.");
    }
    // The SMS told the patient this code is only good for 10 minutes. Before
    // this check existed, that was a promise the server never kept — a code
    // photographed off a slip hours earlier, or glanced at on a shared kiosk
    // screen, still verified. Expiry is enforced here, not just claimed in text.
    if (Date.now() - new Date(challenge.at).getTime() > OTP_TTL_MS) {
      challenge.used = true; save();
      return bad(res, 400, "That code has expired. Ask for a new one.");
    }
    if (challenge.attempts >= 5) return bad(res, 429, "Too many wrong attempts.");
    if (challenge.code !== String(code || "")) {
      challenge.attempts++; save();
      return bad(res, 400, "That code is not right.");
    }
    challenge.used = true;
    challenge.usedAt = now();

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
        language: LANG_NAMES[String(language || "")] ? String(language) : "hi",
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
        consentWithdrawnAt: v.consentWithdrawnAt || null,
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

  // ---- patient: raise (or withdraw) an emergency on a visit already underway
  //
  // The kiosk's emergency button used to pop a browser alert saying staff had
  // been called, while sending nothing anywhere at all. A patient in trouble
  // was told help was coming and no one was told. This is what makes that
  // sentence true: the visit is flagged, re-tokened to the P- series, and
  // surfaces on every clinician's queue behind the emergency banner.
  //
  // It can also be withdrawn, because a kiosk is a shared screen and a
  // mis-tap must be recoverable — a flag nobody can clear is a flag
  // clinicians quickly learn to ignore.
  /* Module D: consent is revocable, not just granular. A patient can pull a
     visit back from their dashboard; from then on no clinician can open it,
     it leaves the queue, and it is not read by the AI or shared onward. The
     record itself is kept — it is theirs, and they can grant it again — but
     it is theirs alone until they do. */
  if (/^\/api\/visits\/[^/]+\/consent$/.test(pathname) && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Sign in first.");
    const vid = pathname.split("/")[3];
    const visit = store.visits.find((v) => v.id === vid);
    if (!visit) return bad(res, 404, "That visit no longer exists.");
    if (visit.patientId !== s.pid) return bad(res, 403, "That is not your visit.");
    const { withdraw = true } = await readBody(req);
    if (withdraw) {
      if (!visit.consentWithdrawnAt) {
        visit.consentBefore = visit.consent || {};
        visit.consent = { record: false, docs: false, share: false, locker: false };
        visit.consentWithdrawnAt = now();
      }
    } else {
      visit.consent = visit.consentBefore || { record: true, docs: true, share: true, locker: false };
      visit.consentWithdrawnAt = null;
    }
    save();
    logEvent(withdraw ? "consent_withdrawn" : "consent_regranted", { visitId: visit.id });
    return ok(res, { visit: { id: visit.id, consent: visit.consent, consentWithdrawnAt: visit.consentWithdrawnAt || null } });
  }

  if (/^\/api\/visits\/[^/]+\/emergency$/.test(pathname) && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Verify your phone number first.");
    const vid = pathname.split("/")[3];
    const visit = store.visits.find((v) => v.id === vid);
    if (!visit) return bad(res, 404, "That visit no longer exists.");
    if (visit.patientId !== s.pid) return bad(res, 403, "That is not your visit.");

    const { on = true } = await readBody(req);
    const raise = on !== false;

    visit.redFlag = raise;
    visit.triage = raise ? "URGENT" : "ROUTINE";
    if (raise) alertTriage(visit, "patient pressed the emergency button");
    // Keep the number, switch the series, so the desk and the slip still agree.
    const tail = String(visit.token).split("-")[1] || String(10 + Math.floor(Math.random() * 89));
    visit.token = (raise ? "P-" : "A-") + tail;
    if (visit.summary) {
      visit.summary.triage = raise ? "URGENT" : (visit.summary.triage || "ROUTINE");
      if (raise) {
        const flags = Array.isArray(visit.summary.redFlags) ? visit.summary.redFlags : [];
        const line = "Patient pressed the emergency button at the kiosk.";
        if (!flags.includes(line)) visit.summary.redFlags = flags.concat([line]);
      }
    }
    save();
    logEvent(raise ? "emergency_raised" : "emergency_withdrawn", { visitId: visit.id });
    return ok(res, { ok: true, visit: { id: visit.id, token: visit.token, redFlag: visit.redFlag } });
  }

  // ---- patient: start a visit
  if (pathname === "/api/visits" && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Verify your phone number first.");
    const { visitType = "FIRST", system = "AYURVEDIC", consent = {}, language } = await readBody(req);
    const sys = SYSTEMS.includes(system) ? system : "AYURVEDIC";
    const patientRec = store.patients.find((p) => p.id === s.pid);
    const lang = LANG_NAMES[String(language || "")] ? String(language)
      : (patientRec && LANG_NAMES[patientRec.language] ? patientRec.language : "hi");
    const emergency = visitType === "EMERGENCY";
    const n = () => 10 + Math.floor(Math.random() * 89);
    const visit = {
      id: id(), token: emergency ? "P-" + n() : "A-" + n(), patientId: s.pid,
      checkinCode: checkinCode(),
      status: "IN_PROGRESS", visitType, system: sys, language: lang,
      triage: emergency ? "URGENT" : "ROUTINE",
      redFlag: emergency, consent, answers: [], summary: null, startedAt: now(),
    };
    store.visits.push(visit);
    save();
    if (patientRec && patientRec.language !== lang) { patientRec.language = lang; }
    logEvent("visit_started", { visitId: visit.id, visitType, system: sys, language: lang });
    if (emergency) alertTriage(visit, "chose 'This is an emergency' at check-in");
    return ok(res, { visit });
  }

  // ---- patient: add a scanned document
  let m = pathname.match(/^\/api\/visits\/([\w-]+)\/documents$/);
  if (m && method === "POST") {
    const s = patientOf(req);
    if (!s) return bad(res, 401, "Your session expired.");
    if (rateLimited(req, "documents", 30, 10 * 60000)) return tooMany(res, "scans");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Visit not found.");
    if (visit.patientId !== s.pid) return bad(res, 403, "Not yours.");

    const { dataUrl } = await readBody(req);
    if (!dataUrl) return bad(res, 400, "dataUrl is required.");

    const docId = id();
    const b64 = String(dataUrl).split(",")[1] || "";
    const buf = Buffer.from(b64, "base64");
    if (!buf.length) return bad(res, 400, "That image was empty. Please take the photo again.");
    /* The local copy is a cache; Firebase is the durable store where there is
       one. On a read-only host this write fails, and a failed cache write must
       not stop the paper being read — that was the whole point of the scan. */
    try {
      fs.writeFileSync(path.join(UPLOADS, docId + ".jpg"), buf);
    } catch (e) {
      if (!SERVERLESS) throw e;
      console.warn("  local upload cache unavailable:", e.message);
    }
    if (firebaseBucket) {
      await firebaseBucket.file(`uploads/${docId}.jpg`).save(buf, { contentType: "image/jpeg" })
        .catch(e => console.error("Firebase upload error:", e.message));
    }

    /* Every way a scan can end up as "just an image" used to collapse into the
       same label, so nobody — patient, clinician or the person deploying this —
       could tell "no key set" from "the model timed out" from "the photo was
       too blurry". `readStatus` names which it was; the kiosk shows it. */
    let extracted = { summary: "Saved as image — your doctor will read this.", findings: [], readable: false };
    let label = "Saved as image";
    let readStatus = "no_key";
    let readError = null;
    const mayRead = visit.consent && visit.consent.docs !== false;

    if (!mayRead) {
      readStatus = "no_consent";
      label = "Saved — automatic reading was not consented to";
      extracted.summary = label;
    } else if (aiOn()) {
      try {
        const r = await readDocumentAI(dataUrl);
        extracted = r;
        label = r.label || r.docType || "Document";
        readStatus = r.readable === false ? "unreadable" : "read";
      } catch (e) {
        readStatus = "failed";
        readError = String(e && e.message || e).slice(0, 400);
        label = "Saved as image — your doctor will read this";
        // The event log is for the audit trail; the console is what a
        // deployment's runtime logs actually show. Both, so it is findable.
        console.error("  ! document read failed (" + AI_PROVIDER + " · " + AI_MODEL + "):", readError);
        logEvent("ocr_failed", { visitId: visit.id, provider: AI_PROVIDER, model: AI_MODEL, message: readError });
      }
    } else {
      console.warn("  ! document saved unread: no AI key is configured (set GROQ_API_KEY, MISTRAL_API_KEY or ANTHROPIC_API_KEY).");
    }

    const doc = {
      id: docId, visitId: visit.id, label, extracted, readable: extracted.readable !== false,
      readStatus, createdAt: now(),
    };
    stampDocDate(doc); // works out where this sheet sits on the timeline, once
    store.documents.push(doc);
    save();
    logEvent("document_added", { visitId: visit.id, readable: doc.readable, readStatus, dated: !!doc.docDate });
    return ok(res, { document: publicDoc(doc), readStatus, readError });
  }

  // ---- what would the interactions be if this were prescribed? No save.
  m = pathname.match(/^\/api\/visits\/([\w-]+)\/interactions$/);
  if (m && method === "POST") {
    const doc = doctorOf(req);
    if (!doc) return bad(res, 401, "Sign in required.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Not found.");
    const { prescription } = await readBody(req);
    const trial = Object.assign({}, visit, { prescription: String(prescription || "") });
    return ok(res, { interactions: interactionsFor(trial) });
  }

  // ---- the visit as a FHIR R4 document bundle (what the ABDM push carries)
  m = pathname.match(/^\/api\/visits\/([\w-]+)\/fhir$/);
  if (m && method === "GET") {
    const doc = doctorOf(req), pat = patientOf(req);
    if (!doc && !pat) return bad(res, 401, "Sign in required.");
    const visit = store.visits.find((v) => v.id === m[1]);
    if (!visit) return bad(res, 404, "Not found.");
    if (!doc && visit.patientId !== pat.pid) return bad(res, 403, "Not yours.");
    if (doc && visit.consentWithdrawnAt) return bad(res, 403, "The patient has withdrawn consent for this visit.");
    const patient = store.patients.find((x) => x.id === visit.patientId) || {};
    const clinician = doc ? store.clinicians.find((x) => x.id === doc.cid) : null;
    const documents = chronological(store.documents.filter((d) => d.visitId === visit.id));
    const bundle = buildBundle({ visit, patient, clinician, documents, hospital: HOSPITAL });
    logEvent("fhir_bundle_exported", { visitId: visit.id, by: doc ? doc.cid : "patient", entries: bundle.entry.length });
    return send(res, 200, Buffer.from(JSON.stringify(bundle, null, 2)), {
      "content-type": "application/fhir+json; charset=utf-8",
      "content-disposition": 'attachment; filename="medikiosk-' + visit.token + '-fhir.json"',
    });
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
    if (rateLimited(req, "submit", 10, 10 * 60000)) return tooMany(res, "submissions");
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
        summary = await buildSummaryAI({
          answers, documents: docs, visitType: visit.visitType,
          system: visit.system, language: visit.language, prior,
        });
      } catch (e) {
        logEvent("summary_failed", { visitId: visit.id, message: String(e.message).slice(0, 300) });
        summary = offlineSummary({ answers, documents: docs, system: visit.system });
        generated = "offline_fallback";
      }
    } else {
      summary = offlineSummary({ answers, documents: docs, system: visit.system });
      generated = "offline";
    }
    summary.generated = generated;

    /* ── department routing ────────────────────────────────────────────
       The rule router runs on every intake regardless of what the model did
       or whether it ran at all, and it is what stands if the model returned
       a department this hospital does not have. A visit always leaves this
       endpoint with a department; there is no unrouted state for the queue
       to lose a patient in. */
    const ruleDept = routeDepartmentByRules({
      answers,
      complaint: summary.chiefComplaint,
      system: visit.system,
    });
    // Only a real model response counts as a model suggestion. Without a key
    // the summary already carries the router's own answer, and re-reading it
    // here would relabel rule output as AI output in the audit trail.
    const dept = reconcileDepartment(
      generated === "ai" ? summary.department : null, ruleDept, visit.system
    );
    summary.department = dept;
    visit.department = dept.id;
    visit.departmentLabel = dept.label;
    visit.departmentSource = dept.source;
    visit.departmentConfidence = dept.confidence;
    visit.departmentAssignedAt = now();

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
    summary.interactions = interactionsFor(visit);
    visit.redFlag = redFlag;
    visit.triage = redFlag ? (summary.triage === "URGENT" ? "URGENT" : "PRIORITY") : "ROUTINE";
    visit.status = "WAITING";
    visit.submittedAt = now();
    if (redFlag && !visit.token.startsWith("P-")) visit.token = "P-" + visit.token.split("-")[1];
    if (redFlag) alertTriage(visit, (summary.redFlags || []).slice(0, 2).join("; ") || "red-flag symptom reported at intake");
    save();

    logEvent(redFlag ? "red_flag" : "summary_generated", { visitId: visit.id, generated, documents: docs.length });
    logEvent("department_routed", {
      visitId: visit.id, department: dept.id, source: dept.source,
      confidence: dept.confidence, ruleSuggestion: ruleDept.id, agreed: dept.agreed,
    });
    return ok(res, { visit, redFlag, generated, department: dept });
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
    const { name, email, password, hprId, department, departmentId, room } = await readBody(req);
    const mail = String(email || "").toLowerCase().trim();
    if (!String(name || "").trim()) return bad(res, 400, "Enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad(res, 400, "Enter a valid email address.");
    if (String(password || "").length < 8) return bad(res, 400, "Use a password of at least 8 characters.");
    if (store.clinicians.some((c) => c.email === mail)) return bad(res, 409, "An account with that email already exists.");

    /* A clinician is one of three things, and the queue behaves differently
       for each: a specialist in a department this hospital runs (their queue
       is that department), a general clinician (their queue is everything),
       or a specialist in something not on our list, who types it (their
       queue is everything, because we cannot route to a clinic we do not
       know — and a queue silently filtered to nothing is the worst outcome). */
    const wanted = String(departmentId || "").toUpperCase().trim();
    const known = DEPT_BY_ID[wanted] ? wanted : wanted === GENERAL_SCOPE ? GENERAL_SCOPE : null;
    const customDept = String(department || "").trim();
    const deptId = known || GENERAL_SCOPE;

    const first = store.clinicians.length === 0;
    const clinician = {
      id: id(), email: mail, passwordHash: hashPassword(String(password)),
      name: String(name).trim(), hprId: String(hprId || "").trim() || null,
      departmentId: deptId,
      // What it says on their door. A known department uses the registry name
      // so two people in the same clinic never read as two clinics.
      department: DEPT_BY_ID[deptId] ? DEPT_BY_ID[deptId].en : (customDept || "General clinician"),
      customDepartment: known ? null : (customDept || null),
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
      clinician: publicClinician(clinician),
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
    if (rateLimited(req, "doctor-login", 10, 10 * 60000)) return tooMany(res, "sign-in attempts");
    const { email, password } = await readBody(req);
    const c = store.clinicians.find((x) => x.email === String(email || "").toLowerCase().trim());
    if (!c || !verifyPassword(String(password || ""), c.passwordHash)) return bad(res, 401, "Those details are not right.");
    if (c.approved === false) {
      return bad(res, 403, "This account is waiting for approval by a registered clinician.");
    }
    setCookie(res, "mk_doctor", sign({ cid: c.id, exp: Date.now() + 12 * 3600 * 1000 }));
    logEvent("clinician_login", { clinicianId: c.id });
    return ok(res, { clinician: publicClinician(c) });
  }

  if (pathname === "/api/doctor/session" && method === "GET") {
    const s = doctorOf(req);
    if (!s) return ok(res, { clinician: null });
    const c = store.clinicians.find((x) => x.id === s.cid);
    return ok(res, { clinician: c ? publicClinician(c) : null });
  }

  if (pathname === "/api/doctor/logout" && method === "POST") {
    res.setHeader("set-cookie", "mk_doctor=; Path=/; HttpOnly; Max-Age=0");
    return ok(res, { ok: true });
  }

  /* ---- doctor: the live queue
     A specialist's queue is their own department. That is the point of the
     feature: the dentist opens the console and sees dental cases, not the
     whole hospital, so the check-in is quicker and the record is cleaner.

     Three things are deliberately NOT filtered away, because a filter that
     can strand a patient is a clinical risk, not a privacy win:

       · red-flagged and urgent cases — visible to every clinician, always
       · visits with no department yet — they are unrouted, not someone
         else's; they show up badged for triage rather than vanishing
       · nothing at all, for a general clinician, who sees the whole queue

     And the filter is a default, not a wall: `?all=1` lifts it for that one
     request and writes who did it to the audit trail. A doctor who needs to
     see a colleague's patient can; they simply cannot do it unobserved. */
  if (pathname === "/api/queue" && method === "GET") {
    const sess = doctorOf(req);
    if (!sess) return bad(res, 401, "Sign in required.");
    const me = store.clinicians.find((x) => x.id === sess.cid) || {};
    const scope = scopeOf(me);
    const generalist = scope === GENERAL_SCOPE;
    const wantsAll = new URL(req.url, "http://x").searchParams.get("all") === "1";
    const unfiltered = generalist || wantsAll;

    const rows = store.visits
      /* An interview still in progress is not the clinician's business — except
         an emergency. A patient who pressed the red button at question four
         must be on the list NOW, not after they finish the other twelve. */
      .filter((v) => v.status !== "IN_PROGRESS" || v.redFlag)
      .filter((v) => !v.consentWithdrawnAt)          // pulled back by the patient: not on any list
      .map((v) => {
        const p = store.patients.find((x) => x.id === v.patientId) || {};
        const dept = v.department || (v.summary && v.summary.department && v.summary.department.id) || null;
        return {
          id: v.id, token: v.token, status: v.status, visitType: v.visitType, triage: v.triage,
          redFlag: v.redFlag, example: !!v.example, submittedAt: v.submittedAt,
          chiefComplaint: (v.summary && v.summary.chiefComplaint) || "History recorded",
          patient: { name: p.name || "Patient", ageYears: p.ageYears || null },
          vitals: { heightCm: (v.vitals && v.vitals.heightCm) || p.heightCm || null,
                    weightKg: (v.vitals && v.vitals.weightKg) || p.weightKg || null,
                    measured: !!(v.vitals && v.vitals.takenAt) },
          documentCount: store.documents.filter((d) => d.visitId === v.id).length,
          department: dept,
          departmentLabel: dept ? deptLabel(dept) : null,
          language: v.language || null,
          languageName: LANG_NAMES[v.language] || null,
          departmentSource: v.departmentSource || null,
          departmentConfidence: v.departmentConfidence || null,
          reassigned: !!v.departmentReassignedBy,
          // Why this row is on a specialist's screen when it is not their
          // department — the UI says so rather than leaving it unexplained.
          crossDepartment: !unfiltered && dept !== scope,
        };
      })
      .sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));

    const mine = (v) =>
      unfiltered ||
      v.department === scope ||
      !v.department ||                                   // unrouted: needs triage
      v.redFlag || v.triage === "URGENT";                // never hide an emergency

    const list = rows.filter(mine);
    const hidden = rows.length - list.length;

    if (wantsAll && !generalist) {
      logEvent("queue_scope_override", { clinicianId: sess.cid, department: scope, revealed: hidden });
    }

    const waiting = list.filter((v) => v.status !== "ASSESSED");
    return ok(res, {
      visits: list,
      scope: {
        departmentId: scope,
        label: deptLabel(scope),
        isGeneralist: generalist,
        showingAll: unfiltered,
        hidden,                     // in other departments, not shown
        overrideActive: wantsAll && !generalist,
      },
      stats: {
        waiting: waiting.length,
        redFlags: waiting.filter((v) => v.redFlag).length,
        assessed: list.filter((v) => v.status === "ASSESSED").length,
        total: list.length,
        minutesSaved: list.length * 4,
        otherDepartments: hidden,
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
    if (doc && visit.consentWithdrawnAt) {
      logEvent("record_refused_consent_withdrawn", { visitId: visit.id, clinicianId: doc.cid });
      return bad(res, 403, "The patient has withdrawn consent for this visit. It cannot be opened.");
    }
    if (doc) {
      logEvent("record_opened", { visitId: visit.id, clinicianId: doc.cid });
      // Opening a case outside your own department is allowed — a colleague
      // covering a clinic, a second opinion, an emergency — but it is never
      // silent. The name against the record is the whole safeguard.
      const me = store.clinicians.find((x) => x.id === doc.cid) || {};
      const scope = scopeOf(me);
      if (scope !== GENERAL_SCOPE && visit.department && visit.department !== scope) {
        logEvent("cross_department_access", {
          visitId: visit.id, clinicianId: doc.cid,
          clinicianDepartment: scope, visitDepartment: visit.department,
          redFlag: !!visit.redFlag,
        });
      }
    }
    const visitDocs = chronological(store.documents.filter((d) => d.visitId === visit.id));
    save(); // chronological() backfills dates onto older records; keep them
    return ok(res, {
      visit: Object.assign({}, visit, {
        patient: { name: p.name || "Patient", ageYears: p.ageYears, sex: p.sex, abhaNumber: p.abhaNumber,
                   heightCm: p.heightCm || null, weightKg: p.weightKg || null },
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
    let recheck = false;
    if (typeof body.prescription === "string" && body.prescription !== visit.prescription) { visit.prescription = body.prescription; recheck = true; }

    /* Height and weight, taken when the patient comes in. The kiosk may have
       them already (the patient estimates); a nurse's reading replaces it,
       on the visit and on the patient's record for next time. */
    if (body.vitals && typeof body.vitals === "object") {
      const v = body.vitals;
      const num = (x, lo, hi) => { const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
      visit.vitals = Object.assign({}, visit.vitals, {
        heightCm: num(v.heightCm, 30, 250), weightKg: num(v.weightKg, 1, 400),
        takenAt: now(), takenBy: s.cid,
      });
      const p = store.patients.find((x) => x.id === visit.patientId);
      if (p) { if (visit.vitals.heightCm) p.heightCm = visit.vitals.heightCm; if (visit.vitals.weightKg) p.weightKg = visit.vitals.weightKg; }
      logEvent("vitals_recorded", { visitId: visit.id, by: s.cid, heightCm: visit.vitals.heightCm, weightKg: visit.vitals.weightKg });
    }
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
      if ("medications" in edits) recheck = true;
      visit.historyVerified = "amended";
      visit.verifiedBy = s.cid;
      visit.verifiedAt = now();
      logEvent("history_amended", { visitId: visit.id, fields: Object.keys(edits), by: s.cid });
    }

    /* Reassignment. The AI suggests, a clinician decides — the same rule the
       rest of this history already runs on. The previous department, who
       changed it and why are all kept, so a routing mistake is visible
       afterwards instead of being overwritten. */
    if (typeof body.department === "string") {
      const to = body.department.toUpperCase().trim();
      if (!DEPT_BY_ID[to]) return bad(res, 400, "That is not a department this hospital runs.");
      if (to !== visit.department) {
        const from = visit.department || null;
        visit.departmentPrevious = from;
        visit.department = to;
        visit.departmentLabel = deptLabel(to);
        visit.departmentSource = "clinician";
        visit.departmentConfidence = "high";
        visit.departmentReassignedBy = s.cid;
        visit.departmentReassignedAt = now();
        visit.departmentReassignReason = String(body.departmentReason || "").trim().slice(0, 300) || null;
        if (visit.summary && visit.summary.department) {
          visit.summary.department = Object.assign({}, visit.summary.department, {
            id: to, label: deptLabel(to), source: "clinician", confidence: "high",
          });
        }
        logEvent("department_reassigned", {
          visitId: visit.id, from, to, by: s.cid, reason: visit.departmentReassignReason,
        });
      }
    }

    if (recheck && visit.summary) {
      visit.summary.interactions = interactionsFor(visit);
      logEvent("interactions_rechecked", { visitId: visit.id, count: visit.summary.interactions.length });
    }

    if (body.pushToEmr) {
      // The bundle is built for real; only the transport is mocked, because
      // the ABDM sandbox needs credentials the prototype does not hold.
      const patient = store.patients.find((x) => x.id === visit.patientId) || {};
      const documents = chronological(store.documents.filter((d) => d.visitId === visit.id));
      const bundle = buildBundle({ visit, patient, clinician: store.clinicians.find((x) => x.id === s.cid), documents, hospital: HOSPITAL });
      visit.pushedToEmr = true;
      visit.fhirBundleId = bundle.id;
      logEvent("fhir_push", { visitId: visit.id, mocked: true, bundleId: bundle.id, entries: bundle.entry.length });
    }
    save();
    logEvent("visit_updated", { visitId: visit.id, keys: Object.keys(body) });
    return ok(res, { visit });
  }

  return bad(res, 404, "No such endpoint.");
}

// ─────────────────────────────────────────────────────────── boot

(async function boot() {
  await loadStore();

  // Routing keywords for every language the kiosk is translated into, read
  // from the same files the browser reads. See COMPLAINT_ROUTING above.
  const routed = loadRoutingTranslations();

  // Open the browser for them. Nobody should have to remember a URL to use
  // their own app, and a terminal window they never type into is not a terminal
  // window they should have to think about. NO_OPEN=1 turns this off.
  function openBrowser(url) {
    // Nothing to open on a serverless host, and nothing to open it with.
    if (process.env.NO_OPEN || SERVERLESS) return;
    const { spawn } = require("child_process");
    try {
      let child;
      if (process.platform === "win32") child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
      else if (process.platform === "darwin") child = spawn("open", [url], { detached: true, stdio: "ignore" });
      else child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
      /* spawn reports a missing binary asynchronously, as an "error" event on
         the child. An "error" event with no listener is rethrown as an uncaught
         exception, so the catch below never sees it: on a box without xdg-open
         the server would die a tick after it started serving. Listen and
         swallow. */
      child.on("error", () => {});
      child.unref();
    } catch {
      // No browser to open is not a reason to stop the server.
    }
  }

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);

    /* The token QR points here. Deliberately short — every character is another
       module in the symbol, and a denser code is a slower scan on the cheap
       reader a registration desk actually has. It carries no patient data, just
       the visit id, so a slip dropped in a corridor discloses nothing to anyone
       without a clinician login. */
    const checkin = pathname.match(/^\/c\/([\w-]+)$/);
    if (checkin) {
      return refreshStore().then(() => {
      // Accept the short code or the raw visit id, so a slip printed before
      // this existed still scans.
      const key = checkin[1];
      const found = store.visits.find((v) => v.checkinCode === key.toUpperCase()) ||
                    store.visits.find((v) => v.id === key);
      res.writeHead(302, { location: "/doctor?visit=" + encodeURIComponent(found ? found.id : key) });
      res.end();
      });
    }

    if (pathname.startsWith("/api/")) {
      refreshStore().then(() => api(req, res, pathname)).catch((e) => {
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
    console.log(`\n   AI:        ${aiOn() ? "on · " + AI.chain.join("  →  ") : "off — set GROQ_API_KEY, MISTRAL_API_KEY or ANTHROPIC_API_KEY in .env"}`);
    console.log(`   SMS:       ${smsProvider() === "console" ? "console (codes print here)" : smsProvider()}`);
    console.log(`   Languages: ${routed.langs + 2} translated · ${routed.added} routing keywords derived`);
    console.log("   Data:      ./data/db.json   (delete the data folder to start over)");
    console.log(`\n  ${line}`);
    if (!SERVERLESS && !process.env.NO_OPEN) {
      console.log("\n   Opening your browser… (keep this window open — it IS the app)\n");
    }
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
