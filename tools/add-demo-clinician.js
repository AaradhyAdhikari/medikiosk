/* Adds (or resets) a general clinician who sees every department's queue,
   in BOTH places the app may load accounts from: Firebase (when .env and
   firebase-service-account.json are present and the machine is online) and
   data/db.json. Idempotent: running it twice resets the same account.

   node tools/add-demo-clinician.js <email> <password> [name]
   Result is also written to add-demo-clinician.log next to server.js. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const LOG = path.join(ROOT, "add-demo-clinician.log");
const out = [];
const log = (s) => { console.log(s); out.push(s); };

const [email, password, name = "Demo Clinician"] = process.argv.slice(2);
const mail = String(email || "").toLowerCase().trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || String(password || "").length < 8) {
  log("usage: node tools/add-demo-clinician.js <email> <password of 8+ chars> [name]");
  fs.writeFileSync(LOG, out.join("\n") + "\nRESULT=FAILED\n"); process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
const passwordHash = salt + ":" + crypto.scryptSync(String(password), salt, 64).toString("hex");

function upsert(list) {
  list = Array.isArray(list) ? list.filter(Boolean) : list ? Object.values(list).filter(Boolean) : [];
  const c = list.find((x) => x.email === mail);
  if (c) { Object.assign(c, { passwordHash, departmentId: "GENERAL", department: "General clinician", customDepartment: null, approved: true }); log("  updated existing " + mail); }
  else {
    list.push({ id: crypto.randomUUID(), email: mail, passwordHash, name, hprId: null, departmentId: "GENERAL",
      department: "General clinician", customDepartment: null, room: null, approved: true, createdAt: new Date().toISOString() });
    log("  added " + mail);
  }
  return list;
}

// .env, read the same way server.js reads it
try {
  for (const raw of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i < 0) continue;
    const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
} catch { }

(async () => {
  let ok = true;
  // 1. local file
  const DB = path.join(ROOT, "data", "db.json");
  try {
    const s = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, "utf8")) : {};
    log("data/db.json:"); s.clinicians = upsert(s.clinicians);
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB + ".tmp", JSON.stringify(s, null, 2)); fs.renameSync(DB + ".tmp", DB);
  } catch (e) { ok = false; log("  db.json FAILED: " + e.message); }

  // 2. Firebase — only the clinicians list, in a transaction, so nothing else is touched
  const sa = path.join(ROOT, "firebase-service-account.json");
  if (process.env.FIREBASE_DB_URL && fs.existsSync(sa)) {
    log("Firebase (" + process.env.FIREBASE_DB_URL + "):");
    try {
      const admin = require("firebase-admin/app");
      const { getDatabase } = require("firebase-admin/database");
      admin.initializeApp({ credential: admin.cert(JSON.parse(fs.readFileSync(sa, "utf8"))), databaseURL: process.env.FIREBASE_DB_URL });
      const ref = getDatabase().ref("clinicians");
      const r = await Promise.race([
        ref.transaction((cur) => upsert(cur)),
        new Promise((_, no) => setTimeout(() => no(new Error("timed out after 30s — offline?")), 30000)),
      ]);
      if (!r.committed) throw new Error("transaction not committed");
      const back = (await ref.once("value")).val();
      const found = (Array.isArray(back) ? back : Object.values(back || {})).find((c) => c && c.email === mail);
      log("  verified in Firebase: " + (found && found.approved && found.departmentId === "GENERAL"));
    } catch (e) { ok = false; log("  Firebase FAILED: " + e.message); }
  } else log("Firebase: not configured here, skipped");

  fs.writeFileSync(LOG, out.join("\n") + "\nRESULT=" + (ok ? "OK" : "FAILED") + "\n");
  process.exit(ok ? 0 : 1);
})();
