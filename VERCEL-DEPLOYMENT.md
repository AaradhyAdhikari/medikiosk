# 🚀 Deploying MediKiosk to Vercel

## ⚠️ IMPORTANT: Firebase is REQUIRED for Vercel

Vercel is a **serverless platform** - it cannot store files locally. Your Firebase Realtime Database must be configured before deploying.

---

## Prerequisites

✅ **Firebase must be set up** (you already have this done!)
- Database URL configured
- Service account key ready
- Firebase working locally

---

## Step 1: Configure Environment Variables in Vercel

Go to your Vercel project settings → Environment Variables

Add these variables:

```
FIREBASE_DB_URL=https://medikiosk-25458-default-rtdb.asia-southeast1.firebasedatabase.app/
FIREBASE_STORAGE_BUCKET=medikiosk-25458.appspot.com
```

### Firebase Service Account

You need to add your service account credentials. You have two options:

**Option A: Upload as JSON (Recommended)**

1. In Vercel, add environment variable: `FIREBASE_SERVICE_ACCOUNT`
2. Paste the **entire contents** of your `firebase-service-account.json` file
3. Make sure it's valid JSON (the whole thing)

**Option B: Individual fields**

Add each field separately:
```
FIREBASE_PROJECT_ID=medikiosk-25458
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...YOUR KEY HERE...\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@medikiosk-25458.iam.gserviceaccount.com
```

⚠️ **IMPORTANT:** For the private key, you must include the `\n` characters exactly as shown.

### Optional Variables

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5
SMS_PROVIDER=console
HOSPITAL_NAME=All India Institute of Ayurveda
```

---

## Step 2: Update server.js for Vercel

The current `server.js` needs modification to handle the service account from environment variables in Vercel.

I'll create this fix for you.

---

## Step 3: Deploy

### From GitHub (Recommended):

1. Push your code to GitHub (already done ✅)
2. Go to [vercel.com](https://vercel.com)
3. Click **"Add New Project"**
4. Import your GitHub repository: `AaradhyAdhikari/medikiosk`
5. Vercel will auto-detect the settings
6. Add environment variables (see Step 1)
7. Click **Deploy**

### From CLI:

```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts and it will deploy.

---

## Step 4: Verify Deployment

Once deployed, test these URLs:

- **Homepage:** `https://your-project.vercel.app/`
- **Doctor portal:** `https://your-project.vercel.app/doctor`
- **Kiosk:** `https://your-project.vercel.app/kiosk`

---

## ⚠️ Known Limitations on Vercel

### What WILL Work:
✅ All patient registration flows
✅ Doctor accounts and authentication
✅ Real-time data sync via Firebase
✅ Document uploads to Firebase Storage
✅ AI summaries (if ANTHROPIC_API_KEY is set)
✅ SMS (if provider is configured)

### What WON'T Work:
❌ Local file storage (that's why Firebase is required)
❌ Long-running processes (serverless has 30s timeout)
❌ Opening browser automatically
❌ Development console messages

---

## Troubleshooting

### Error: "FUNCTION_INVOCATION_FAILED"

**Cause:** Firebase credentials not configured or invalid.

**Fix:**
1. Check environment variables in Vercel dashboard
2. Verify FIREBASE_DB_URL is correct
3. Verify service account JSON is valid
4. Check Vercel function logs for specific error

### Error: "Cannot read properties of undefined"

**Cause:** Firebase Admin SDK not initialized

**Fix:**
- Make sure `FIREBASE_SERVICE_ACCOUNT` environment variable exists
- OR make sure individual Firebase env vars are set
- Redeploy after adding variables

### Error: "Permission denied"

**Cause:** Firebase database rules are too restrictive

**Fix:**
Go to Firebase Console → Database → Rules and set to test mode:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

---

## Alternative: Deploy to Render.com

If you prefer traditional server hosting (not serverless):

1. Go to [render.com](https://render.com)
2. Create **New Web Service**
3. Connect GitHub repository
4. Build command: ` ` (leave blank)
5. Start command: `node server.js`
6. Add same environment variables
7. Deploy

Render.com supports file storage better than Vercel, but Firebase is still recommended.

---

## Production Checklist

Before going live:

- [ ] Firebase database rules secured (not test mode)
- [ ] ANTHROPIC_API_KEY added (for AI features)
- [ ] SMS provider configured (MSG91/Fast2SMS/Twilio)
- [ ] HOSPITAL_NAME set in environment
- [ ] Test all flows: registration, consultation, documents
- [ ] Check Firebase Console for data persistence
- [ ] Test from mobile device
- [ ] Verify HTTPS voice input works

---

## Need Help?

Check Vercel function logs:
1. Go to Vercel dashboard
2. Select your project
3. Go to "Deployments"
4. Click on latest deployment
5. Click "Functions" tab
6. View logs for errors

---

**Next:** I'll update the server.js code to properly handle Vercel deployment with Firebase.
