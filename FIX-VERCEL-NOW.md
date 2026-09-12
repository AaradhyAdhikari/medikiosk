# 🔧 Fix Vercel Error - Quick Steps

> ⚠️ **The key that used to be printed in this file was committed to a public repository.**
> It has been removed here, but removing it from the working tree does not remove it from git
> history — anyone can still read it in an earlier commit. The only real fix is to **delete that
> service-account key in the Firebase console and generate a new one**, which invalidates the
> leaked one. Do that first; treat everything below as instructions for the *new* key.
>
> Never paste a private key, a token or a password into a file you commit. Keys belong in `.env`
> (which is gitignored) or in the deployment platform's environment-variable settings.


## Your Error:
```
500: INTERNAL_SERVER_ERROR
Code: FUNCTION_INVOCATION_FAILED
```

## Root Cause:
Firebase credentials not configured in Vercel environment variables.

---

## ⚡ Quick Fix (5 minutes)

### Step 1: Go to Vercel Dashboard

Open your project: https://vercel.com/dashboard

Click on your **medikiosk** project → **Settings** → **Environment Variables**

### Step 2: Add These 3 Variables

**Variable 1:**
```
Name: FIREBASE_DB_URL
Value: https://medikiosk-25458-default-rtdb.asia-southeast1.firebasedatabase.app/
```

**Variable 2:**
```
Name: FIREBASE_STORAGE_BUCKET
Value: medikiosk-25458.appspot.com
```

**Variable 3:** (This is the tricky one)
```
Name: FIREBASE_SERVICE_ACCOUNT
Value: {"type":"service_account","project_id":"YOUR-PROJECT-ID", ... paste the ENTIRE contents of your firebase-service-account.json here, on ONE line ... }
```

⚠️ **CRITICAL:** Copy the ENTIRE value above (it's ONE LINE of JSON). Make sure there are NO line breaks.

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Find your latest deployment
3. Click **"..."** (three dots menu)
4. Click **"Redeploy"**
5. Wait 1-2 minutes

### Step 4: Test

Visit: `https://your-project-name.vercel.app`

Should work now! ✅

---

## 🚨 If Still Not Working

### Alternative: Use Render.com Instead

Vercel has limitations for apps like yours. **Render.com works better**:

1. Go to https://render.com/
2. Sign up / Sign in
3. Click **"New +"** → **"Web Service"**
4. Connect GitHub: `AaradhyAdhikari/medikiosk`
5. Settings:
   - **Build Command:** (leave blank)
   - **Start Command:** `node server.js`
6. Add the same 3 environment variables above
7. Click **"Create Web Service"**
8. Wait 3-5 minutes for deployment

**Result:** Your app will work perfectly on Render with no issues.

---

## Why Render > Vercel for Your App

| Feature | Vercel | Render |
|---------|--------|--------|
| Traditional Node servers | ❌ Hard | ✅ Easy |
| File uploads | ❌ Complex | ✅ Simple |
| Long requests | ❌ 30s limit | ✅ No limit |
| Debugging | ❌ Complex | ✅ Easy logs |
| Setup | ⚠️ Requires config | ✅ Just works |

**My Recommendation:** Use Render.com for this project.

---

## Current Status

✅ Code is updated and pushed to GitHub
✅ Firebase environment variable support added  
✅ Vercel.json configured
✅ Ready to deploy on either platform

**Choose:**
- Vercel: Add 3 env vars above, redeploy
- Render: Follow alternative steps above (easier!)

---

Let me know which platform you choose and I'll help with any issues!
