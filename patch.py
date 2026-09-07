import os

with open("server.js", "r", encoding="utf-8") as f:
    code = f.read()

s_store = """const EMPTY = { patients: [], clinicians: [], visits: [], documents: [], events: [], otps: [], seeded: false };
let store = null;

function loadStore() {
  fs.mkdirSync(UPLOADS, { recursive: true });
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
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 40);
}
function saveNow() {
  clearTimeout(saveTimer);
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DB_FILE);
}"""

r_store = """const EMPTY = { patients: [], clinicians: [], visits: [], documents: [], events: [], otps: [], seeded: false };
let store = null;

const admin = require("firebase-admin");
let firebaseDb = null;
let firebaseBucket = null;

try {
  const serviceAccountPath = path.join(ROOT, "firebase-service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DB_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    firebaseDb = admin.database();
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      firebaseBucket = admin.storage().bucket();
    }
    console.log("  Firebase Admin initialized.");
  }
} catch (e) {
  console.warn("  ✗ Firebase init failed:", e.message);
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
}"""

# Upload change
s_upload = """    const docId = id();
    const b64 = String(dataUrl).split(",")[1] || "";
    fs.writeFileSync(path.join(UPLOADS, docId + ".jpg"), Buffer.from(b64, "base64"));"""

r_upload = """    const docId = id();
    const b64 = String(dataUrl).split(",")[1] || "";
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(UPLOADS, docId + ".jpg"), buf);
    if (firebaseBucket) {
      await firebaseBucket.file(`uploads/${docId}.jpg`).save(buf, { contentType: "image/jpeg" })
        .catch(e => console.error("Firebase upload error:", e.message));
    }"""

# Download change
s_down = """    if (!patientOf(req) && !doctorOf(req)) return bad(res, 401, "Sign in required.");
    const file = path.join(UPLOADS, m[1] + ".jpg");
    if (!fs.existsSync(file)) return bad(res, 404, "Not found.");
    return send(res, 200, fs.readFileSync(file), { "content-type": "image/jpeg" });"""

r_down = """    if (!patientOf(req) && !doctorOf(req)) return bad(res, 401, "Sign in required.");
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
    return send(res, 200, fs.readFileSync(file), { "content-type": "image/jpeg" });"""

# boot change
s_boot = """loadStore();

// Open the browser for them."""
r_boot = """(async function boot() {
  await loadStore();

// Open the browser for them."""

code = code.replace(s_store, r_store)
code = code.replace(s_upload, r_upload)
code = code.replace(s_down, r_down)
code = code.replace(s_boot, r_boot)

if "(async function boot()" in code and not code.strip().endswith("})();"):
    code += "\\n})();\\n"

with open("server.js", "w", encoding="utf-8") as f:
    f.write(code)

print("Patch applied.")
