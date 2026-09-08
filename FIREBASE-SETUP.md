# 🔥 Firebase Realtime Database Setup Guide

Your MediKiosk app is **already configured** to use Firebase Realtime Database. Follow these steps to connect it.

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select an existing one
3. Enter project name (e.g., "medikiosk" or "medikiosk-sih")
4. Disable Google Analytics (optional for this project)
5. Click **"Create project"**

---

## Step 2: Enable Realtime Database

1. In your Firebase project, click **"Realtime Database"** in the left sidebar
2. Click **"Create Database"**
3. Select your location (choose closest to India, e.g., `asia-south1`)
4. Start in **"Test mode"** for now (we'll secure it later)
5. Click **"Enable"**

You'll see your database URL like: `https://medikiosk-xxxxx.firebaseio.com`

---

## Step 3: Get Service Account Key

1. Click the **gear icon** ⚙️ next to "Project Overview" → **"Project settings"**
2. Go to the **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** in the confirmation dialog
5. A JSON file will download (e.g., `medikiosk-xxxxx-firebase-adminsdk-xxxxx.json`)

⚠️ **IMPORTANT:** This file contains sensitive credentials. Never commit it to Git!

---

## Step 4: Configure Your App

1. **Rename the downloaded JSON file** to `firebase-service-account.json`
2. **Move it** to your project root folder (same folder as `server.js`)
3. Open your `.env` file and add:

```env
# ── 4. Firebase (optional backend storage & files) ───────────────────
FIREBASE_DB_URL=https://YOUR-PROJECT-ID.firebaseio.com
FIREBASE_STORAGE_BUCKET=YOUR-PROJECT-ID.appspot.com
```

Replace `YOUR-PROJECT-ID` with your actual Firebase project ID.

**Example:**
```env
FIREBASE_DB_URL=https://medikiosk-12abc.firebaseio.com
FIREBASE_STORAGE_BUCKET=medikiosk-12abc.appspot.com
```

---

## Step 5: Secure Your Credentials

Make sure `.gitignore` includes these files (already configured):

```
firebase-service-account.json
.env
```

---

## Step 6: Start Your Server

```bash
node server.js
```

You should see:
```
  Firebase Admin initialized.
  Fetching from Firebase Realtime Database...
  ✓ Server ready
  Open: http://localhost:3000
```

---

## 🎯 What Happens Now?

✅ **All data is stored in Firebase Realtime Database**
- Patient records
- Doctor accounts
- Visits and consultations
- Document metadata
- Event logs

✅ **Local backup still works**
- Data is also saved to `data/db.json` as a backup
- If Firebase fails, the app falls back to local storage

✅ **Real-time sync**
- Multiple doctors can see updates instantly
- Queue updates in real-time
- No need to refresh

---

## 🔒 Security Rules (Production)

Once you're ready for production, update your Firebase Realtime Database rules:

1. Go to Firebase Console → Realtime Database → **Rules** tab
2. Replace with:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

For now, test mode is fine for development.

---

## 📊 View Your Data

Go to Firebase Console → Realtime Database to see your data in real-time:

```
/ (root)
├── patients: [...]
├── clinicians: [...]
├── visits: [...]
├── documents: [...]
├── events: [...]
└── otps: [...]
```

---

## 🐛 Troubleshooting

**Error: "Firebase init failed"**
- Check that `firebase-service-account.json` is in the project root
- Verify the file is valid JSON
- Check that `FIREBASE_DB_URL` is correct in `.env`

**Error: "Permission denied"**
- Your database rules are too restrictive
- Set rules to test mode (see Security Rules section)

**Data not syncing**
- Check your internet connection
- Verify the database URL is correct
- Check Firebase Console for any errors

---

## 🚀 Optional: Enable Storage (for document images)

If you want to store uploaded documents in Firebase Storage instead of local disk:

1. Go to Firebase Console → **Storage**
2. Click **"Get started"**
3. Start in test mode
4. The `FIREBASE_STORAGE_BUCKET` is already configured in your `.env`

The app will automatically upload images to Firebase Storage when available.

---

## 📝 Migration from Local to Firebase

If you already have data in `data/db.json`:

1. Set up Firebase as described above
2. Start the server - it will load from `db.json` first
3. Make any change (create a patient, etc.)
4. Data will automatically sync to Firebase
5. Next restart will load from Firebase

Your local `db.json` will still be maintained as a backup.

---

## ✅ Verification

Run this command to test your Firebase connection:

```bash
node check-firebase.js
```

It will verify:
- ✅ Service account file exists
- ✅ Can connect to Firebase
- ✅ Can read/write data
- ✅ Database URL is correct

---

**Need help?** Check the Firebase Console for error messages or review the setup steps above.
