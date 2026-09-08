# Why Vercel Deployment is Failing

## The Problem

Your MediKiosk app is designed as a **traditional Node.js server** with:
- Persistent HTTP server (`http.createServer`)
- Local file storage (`data/db.json`)
- Synchronous startup sequence
- Background processes

Vercel is a **serverless platform** that expects:
- Stateless functions
- No local file writes
- Fast cold starts (<1 second)
- No persistent processes

---

## The 500 Error

**Error:** `FUNCTION_INVOCATION_FAILED`

**Root Cause:** Your server.js:
1. Creates an HTTP server inside an async IIFE
2. Doesn't export a handler function
3. Tries to start listening immediately
4. Firebase may not be initialized before first request

---

## Quick Fix: Use Firebase for Vercel

Since you already have Firebase configured, here's what to do:

### 1. Add Environment Variables in Vercel Dashboard

Go to: Project Settings → Environment Variables

Add these **exactly**:

```
FIREBASE_DB_URL
Value: https://medikiosk-25458-default-rtdb.asia-southeast1.firebasedatabase.app/

FIREBASE_STORAGE_BUCKET  
Value: medikiosk-25458.appspot.com

FIREBASE_SERVICE_ACCOUNT
Value: (paste your ENTIRE firebase-service-account.json content here - the whole JSON)
```

Example of FIREBASE_SERVICE_ACCOUNT value:
```json
{"type":"service_account","project_id":"medikiosk-25458","private_key_id":"cdda...","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-fbsvc@medikiosk-25458.iam.gserviceaccount.com","client_id":"105...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40medikiosk-25458.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

⚠️ **CRITICAL:** The JSON must be on ONE LINE with NO line breaks except `\\n` in the private_key field.

### 2. Redeploy

After adding the environment variables:
1. Go to Deployments tab
2. Click the "..." menu on latest deployment
3. Click "Redeploy"

---

## Better Alternative: Deploy to Render.com

Render supports traditional Node.js servers better:

### Steps:

1. **Go to:** https://render.com
2. **Click:** "New +" → "Web Service"
3. **Connect:** Your GitHub repo `AaradhyAdhikari/medikiosk`
4. **Settings:**
   - Name: `medikiosk`
   - Environment: `Node`
   - Build Command: (leave blank)
   - Start Command: `node server.js`
5. **Environment Variables:** Add the same ones as above
6. **Click:** "Create Web Service"

**Advantages:**
- ✅ Supports traditional servers
- ✅ Allows file system writes (though Firebase is still better)
- ✅ No serverless limitations
- ✅ Easier to debug
- ✅ Free tier available

---

## Or: Railway.app

Even simpler:

1. Go to https://railway.app
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose `AaradhyAdhikari/medikiosk`
5. Add environment variables
6. Deploy

---

## Summary

**Vercel Issue:** Your app isn't designed for serverless

**Solutions (in order of recommendation):**

1. **Render.com** - Works immediately, traditional server ✅ RECOMMENDED
2. **Railway.app** - Also works, very simple
3. **Heroku** - Classic choice, but requires payment now
4. **Digital Ocean App Platform** - Good for production
5. **Vercel** - Requires significant code refactoring ❌

---

## What I've Done

✅ Updated server.js to read Firebase credentials from environment variables
✅ Created vercel.json configuration
✅ Added documentation

**Status:** Code is ready for deployment on Render/Railway. Vercel needs more work.

---

## Recommendation

**Deploy to Render.com instead of Vercel**. It will work immediately with zero code changes.

If you must use Vercel, I can refactor the entire server.js to be serverless-compatible, but it will take significant changes and some features may not work the same way.
