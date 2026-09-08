#!/usr/bin/env node
/**
 * Firebase Connection Checker
 * Run this to verify your Firebase setup is correct
 */

const fs = require("fs");
const path = require("path");

console.log("\n🔥 Firebase Setup Checker\n");
console.log("─".repeat(60));

// Load .env
function loadEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) {
    console.log("⚠️  No .env file found");
    return;
  }
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
  console.log("✅ .env file loaded\n");
}

loadEnv();

// Check 1: Service Account File
console.log("1️⃣  Checking service account file...");
const serviceAccountPath = path.join(__dirname, "firebase-service-account.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.log("❌ firebase-service-account.json NOT FOUND");
  console.log("   → Download from Firebase Console → Project Settings → Service Accounts");
  console.log("   → Rename to 'firebase-service-account.json'");
  console.log("   → Place in project root\n");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  console.log("✅ firebase-service-account.json found and valid");
  console.log(`   Project ID: ${serviceAccount.project_id}`);
  console.log(`   Client Email: ${serviceAccount.client_email}\n`);
} catch (e) {
  console.log("❌ firebase-service-account.json is not valid JSON");
  console.log(`   Error: ${e.message}\n`);
  process.exit(1);
}

// Check 2: Environment Variables
console.log("2️⃣  Checking environment variables...");

const dbUrl = process.env.FIREBASE_DB_URL;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

if (!dbUrl || dbUrl.length === 0) {
  console.log("❌ FIREBASE_DB_URL not set in .env");
  console.log("   → Add: FIREBASE_DB_URL=https://your-project-id.firebaseio.com\n");
  process.exit(1);
}

console.log(`✅ FIREBASE_DB_URL: ${dbUrl}`);

if (!storageBucket || storageBucket.length === 0) {
  console.log("⚠️  FIREBASE_STORAGE_BUCKET not set (optional)");
  console.log("   → Add: FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com");
} else {
  console.log(`✅ FIREBASE_STORAGE_BUCKET: ${storageBucket}`);
}
console.log();

// Check 3: Firebase Connection
console.log("3️⃣  Testing Firebase connection...");

const admin = require("firebase-admin");

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: dbUrl,
    storageBucket: storageBucket
  });
  console.log("✅ Firebase Admin SDK initialized successfully\n");
} catch (e) {
  console.log("❌ Failed to initialize Firebase Admin SDK");
  console.log(`   Error: ${e.message}\n`);
  process.exit(1);
}

// Check 4: Database Read/Write Test
console.log("4️⃣  Testing database read/write...");

const db = admin.database();
const testRef = db.ref('_connection_test');

(async () => {
  try {
    // Write test
    const testData = {
      timestamp: Date.now(),
      message: "Connection test successful"
    };
    
    await testRef.set(testData);
    console.log("✅ Write test passed");

    // Read test
    const snapshot = await testRef.once('value');
    const data = snapshot.val();
    
    if (data && data.timestamp === testData.timestamp) {
      console.log("✅ Read test passed");
    } else {
      console.log("⚠️  Read test returned unexpected data");
    }

    // Cleanup
    await testRef.remove();
    console.log("✅ Cleanup successful\n");

    // Check if there's existing data
    console.log("5️⃣  Checking existing data...");
    const rootSnap = await db.ref('/').once('value');
    const rootData = rootSnap.val();

    if (!rootData || Object.keys(rootData).length === 0) {
      console.log("ℹ️  Database is empty (this is normal for a new setup)");
      console.log("   Data will be created when you start using the app\n");
    } else {
      const keys = Object.keys(rootData);
      console.log(`✅ Found existing data with ${keys.length} collections:`);
      keys.forEach(key => {
        const count = Array.isArray(rootData[key]) ? rootData[key].length : 
                      (typeof rootData[key] === 'object' ? Object.keys(rootData[key]).length : 1);
        console.log(`   • ${key}: ${count} items`);
      });
      console.log();
    }

    console.log("─".repeat(60));
    console.log("✅ ALL CHECKS PASSED!");
    console.log("─".repeat(60));
    console.log("\nYour Firebase setup is complete and working correctly.");
    console.log("You can now start your server with: node server.js\n");

    process.exit(0);

  } catch (e) {
    console.log("❌ Database test failed");
    console.log(`   Error: ${e.message}`);
    
    if (e.message.includes("Permission denied")) {
      console.log("\n💡 This usually means:");
      console.log("   1. Your database rules are too restrictive");
      console.log("   2. Go to Firebase Console → Database → Rules");
      console.log("   3. Set rules to test mode temporarily:\n");
      console.log('   {');
      console.log('     "rules": {');
      console.log('       ".read": true,');
      console.log('       ".write": true');
      console.log('     }');
      console.log('   }\n');
    }

    process.exit(1);
  }
})();
