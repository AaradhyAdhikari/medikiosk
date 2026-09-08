# MediKiosk

AI clinical history intake for AYUSH OPDs.
**SIH26047 · Ministry of Ayush · All India Institute of Ayurveda**

A patient identifies themselves at a kiosk — by mobile, ABHA number or Aadhaar — answers a guided
history interview by speaking or tapping, and scans the paper they already carry. The system builds
a structured, physician-ready history and puts it on the doctor's screen before the patient sits
down. The doctor verifies it line by line, amends anything wrong, and prescribes — and that becomes
the baseline the next follow-up interview starts from.

**This install starts empty.** No sample patients, no pre-made accounts. You register the first
clinician, patients sign up, and the queue fills from real use.

---

# START HERE — five minutes

### Step 1 · Check Node

Open a terminal and run:

```
node -v
```

You need **v18 or higher**. If that errors or shows something older, install the LTS version from
[nodejs.org](https://nodejs.org), then close and reopen the terminal.

### Step 2 · Start the server

- **Windows:** double-click `START-WINDOWS.bat`
- **Mac:** double-click `START-MAC.command`
- **Any system:** open a terminal in this folder and run `node server.js`

You'll see a box printing `Open: http://localhost:3000`. Leave that window open — closing it stops
the app.

### Step 3 · Create the first clinician account

Open **http://localhost:3000/doctor** in Chrome.

Because this is a fresh install you land on a registration form. Fill it in — name, hospital email,
HPR ID if you have one, department, room, and a password of at least 8 characters.

**The first account is approved automatically.** Every account created after it waits for approval
from a clinician who is already registered. That is deliberate: it mirrors how a hospital actually
issues access, and it is worth saying out loud to judges.

### Step 4 · Run a patient through

Open a **second browser window** at **http://localhost:3000/kiosk**.

Choose a language → choose *With my mobile number* → type any 10-digit number → the code appears
on screen (no SMS gateway is configured yet, so it is shown rather than sent) → tap **Fill** →
enter a name, age and sex → give consent → choose *first visit* → answer the questions.

Speak them if you want. Scan a photo of any prescription or lab report. Submit.

### Step 5 · Watch it arrive

Switch to the doctor window. The patient appears in the queue within four seconds. Open them, read
the history, accept or amend individual lines, prescribe, mark assessed.

**That loop — submitted on one screen, appearing on another — is your demo.** Rehearse it.

---

# Turning on the AI

The app runs without it. Summaries fall back to a plain assembly of the patient's own answers, and
scanned documents are stored as images rather than read.

With a key, two things become real:

- the **clinical summary** — narrative, SOCRATES-structured HPI, assessment, differentials with
  supporting and opposing evidence, suggested investigations, Dashavidha interpretation, and
  ICD-10 / NAMASTE coding suggestions
- **reading scanned documents** — diagnoses, medicines with doses, lab values with reference ranges,
  and which values are out of range

### Steps

1. Go to **[console.anthropic.com](https://console.anthropic.com)** → sign in → **API keys** →
   **Create key**. Copy it.
2. Add a few dollars of credit under **Billing**. A whole hackathon costs very little.
3. In this folder, copy `.env.example` to `.env`
   (Windows: `copy .env.example .env` · Mac/Linux: `cp .env.example .env`)
4. Open `.env` in a text editor. Find this line:
   ```
   # ANTHROPIC_API_KEY=sk-ant-...
   ```
   Remove the `#` and paste your key after the `=`:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```
5. Save the file. **Stop the server** (Ctrl+C in the terminal) and **start it again.**
6. The startup box should now say `AI: on (claude-sonnet-4-5)`.

> Keep `.env` to yourself. Don't commit it, don't screenshot it, don't paste the key into a chat
> window — including to me. It belongs in that file and nowhere else.

---

# Turning on real SMS

Until you configure a gateway, OTP codes print in the terminal and appear on screen. That is fine
for development and fine for a demo. For real delivery, pick one provider.

**Do this at least a week before you need it.** Transactional SMS in India requires DLT
registration, and approval is not instant.

### Option A · Fast2SMS — easiest in India

1. Sign up at [fast2sms.com](https://www.fast2sms.com), verify your account, add a little balance.
2. Go to **Dev API** and copy your API key.
3. In `.env`:
   ```
   SMS_PROVIDER=fast2sms
   FAST2SMS_API_KEY=your-key-here
   ```
4. Restart the server. The startup box shows `SMS: fast2sms`.

### Option B · MSG91 — cheapest at volume

1. Sign up at [msg91.com](https://msg91.com).
2. Complete **DLT registration** and get an OTP template approved. You will receive a sender ID
   (six letters, e.g. `MEDKSK`) and a template ID.
3. Copy your Auth Key from the dashboard.
4. In `.env`:
   ```
   SMS_PROVIDER=msg91
   MSG91_AUTH_KEY=your-auth-key
   MSG91_SENDER_ID=MEDKSK
   MSG91_TEMPLATE_ID=your-template-id
   ```
5. Restart the server.

### Option C · Twilio — works in minutes, costs more

1. Sign up at [twilio.com](https://twilio.com), verify your own number, buy a number with SMS
   capability.
2. Copy the Account SID and Auth Token from the console.
3. In `.env`:
   ```
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=your-token
   TWILIO_FROM=+1XXXXXXXXXX
   ```
4. Restart the server.

Once a provider is live, the code stops appearing on screen — it goes to the phone and nowhere
else. Test with your own number first.

---

# Voice

Voice input, spoken prompts, and spoken navigation commands are built in and work with no
configuration.

**It needs a secure context.** That means `http://localhost` or any `https://` address. It will
**not** work if you open the app from another machine over `http://192.168.x.x`. If you need it on
a phone or a second laptop, deploy it (below) or use a tunnel.

**Chrome and Edge only.** Firefox has no Web Speech API. Every screen has a typed and tapped path,
so nothing is blocked — but demo in Chrome.

**Spoken commands** work on any question screen, in Hindi or English:

| Say | Does |
|---|---|
| दोहराएँ · repeat | reads the question again |
| आगे · next | moves on |
| पीछे · back | goes back one question |
| छोड़ें · skip | skips the question |
| मदद · help | calls staff |

A short utterance matching one of these is treated as a command; anything longer is treated as an
answer. That distinction matters — "मुझे आगे बहुत दर्द है" is an answer, not a navigation command.

---

# Putting it on the internet

Everything above runs on your laptop. To give judges a URL, or to demo from a phone:

**Easiest — a tunnel (nothing to configure):**

```
npx localtunnel --port 3000
```

That prints an `https://` address that works from any device. Voice works because it is HTTPS. The
tunnel dies when you close the terminal.

**More permanent — Render.com (free tier):**

1. Put this folder in a GitHub repository.
2. On [render.com](https://render.com), create a **New Web Service** and connect the repo.
3. Build command: leave blank. Start command: `node server.js`.
4. Under **Environment**, add each variable from your `.env` as a separate entry.
5. Deploy. You get a permanent `https://` URL.

> One caveat on free hosting: `data/db.json` lives on disk, and free tiers wipe the disk on
> redeploy. Fine for a demo, not for a pilot. For a pilot, move the store to Postgres — the store
> is deliberately isolated in `server.js` so that is a contained change.

---

# What is real, and what is not

**Real:** three identification routes including a genuine Aadhaar Verhoeff checksum · patient
accounts with a personal login ID and password, layered on top of OTP rather than replacing it ·
a read-only patient dashboard of past visits, documents and summaries · adaptive
interview with first-visit, follow-up, proxy and emergency branching · voice input, spoken prompts
and spoken commands · large-text and high-contrast modes · literacy-free body map · all ten
Dashavidha Pariksha parameters with Vikriti separated from Prakriti, plus Agni, Koshtha and
Ahara-Vihara · document capture with AI extraction · chronological document timeline ordered by the
date printed on each paper, with undated items flagged rather than guessed at ·
AI summary with assessment and differentials ·
ICD-10 and NAMASTE coding suggestions · rule-based red-flag triage that upgrades the token to
priority · clinician registration with HPR ID and approval gating · live queue · per-line accept and
amend · prescription write-back · granular DPDP consent · audit trail · real SMS when configured.

**Not real:**

- **ABHA enrolment.** Numbers are generated locally in the correct 14-digit format. Real enrolment
  needs ABDM sandbox credentials, which require an application and an approval period.
- **FHIR push.** The bundle is constructed; transmission is stubbed.
- **Bhashini ASR.** Languages beyond Hindi and English need a Bhashini key.

**Say this to judges, in these words:** *"ABHA enrolment and the FHIR push are mocked — the
integration points are written and the bundle is real, but ABDM sandbox access requires
registration. Everything else you're seeing is live, including SMS."* That answer earns respect.
Claiming otherwise and being caught does not.

---

# Firebase Realtime Database (Optional)

Your app is **already configured** to use Firebase Realtime Database for real-time data sync across multiple devices and doctors.

**Quick Setup:**

1. **Create Firebase Project:** [console.firebase.google.com](https://console.firebase.google.com)
2. **Enable Realtime Database:** Database → Create Database → Test mode
3. **Download Service Account:** Project Settings → Service Accounts → Generate new private key
4. **Rename & Move:** Rename downloaded JSON to `firebase-service-account.json` and place in project root
5. **Configure .env:**
   ```env
   FIREBASE_DB_URL=https://your-project-id.firebaseio.com
   FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   ```
6. **Test Connection:** Run `node check-firebase.js` or double-click `firebase-quickstart.bat`
7. **Start Server:** `node server.js`

📖 **Full Guide:** See [FIREBASE-SETUP.md](FIREBASE-SETUP.md) for detailed instructions.

**Benefits:**
- ✅ Real-time sync across multiple doctor terminals
- ✅ Live queue updates
- ✅ Cloud backup of all data
- ✅ Optional: Store uploaded images in Firebase Storage
- ✅ Falls back to local `db.json` if Firebase is unavailable

---

# Everyday things

**Reset completely.** Delete the `data` folder. Next start is a fresh install again — no accounts,
no patients.

**Change the interview.** Edit `public/questions.js` only. Questions are data; the kiosk renders
whatever is in that file. Adding a question means adding an object to an array.

**Load example patients.** The empty queue has a small button for it. Off by default, never
automatic, and the rows are labelled as examples.

**Approve a second clinician.** They register, then an approved clinician approves them.

**A patient who forgets their password.** Nothing is lost. They identify with their mobile number
and a code exactly as before, and they can set a new password from there. The account is an extra
door, never the only one — the same applies to the ten-minute lockout after five wrong passwords.

**A patient who shares a phone with their family.** Each family member is a separate patient with a
separate login ID, because one mobile number covers a household here. Signing in with the shared
number alone is refused as ambiguous; the personal ID or the ABHA number identifies one person.

**A document whose date cannot be read.** It is listed last, marked *undated*, and left there.
Guessing a position would put a report in the wrong place in someone's medical history, which is
worse than admitting the date was unreadable.

---

# How it is put together

```
server.js              one file: HTTP, API, JSON store, sessions, SMS, AI calls
public/
  index.html           role select
  kiosk.html/.js       the entire patient interview
  doctor.html/.js      registration, login, live queue, case view, prescription
  questions.js         the interview itself — edit this to change what is asked
  styles.css           the design system, including the accessibility modes
  about.html           what is real vs mocked, for judges
data/                  created on first run; delete to reset
```

No dependencies, no build step, no framework. That is deliberate: the fewer moving parts, the
fewer things that can break at nine in the evening before a demo.

---

# Decisions worth defending in Q&A

**Red flags are rules, not AI.** A word list runs on every answer, in the browser and again on the
server. A missed emergency must never depend on an API call succeeding. The model can *add* flags;
it can never remove one.

**All ten Dashavidha parameters, and honest about which were elicited.** The physician sees a table
of all ten with what the patient reported and what was not asked. A kiosk screening is not a
vaidya's examination and the interface says so.

**Vikriti is separated from Prakriti.** Constitution and current imbalance are different things.
Collapsing them is the mistake that would tell an AIIA examiner you had not read the syllabus.

**Every question accepts free text.** Presets speed up the common case; real complaints do not fit
boxes. What the patient typed or said reaches the doctor in their own phrasing, marked as theirs.

**Unreadable documents are a designed outcome.** Handwritten Hindi prescriptions will sometimes
defeat OCR. The patient still gets a receipt and the doctor still gets the original image.

**The AI never diagnoses.** The assessment panel is explicitly provisional, sits behind a
disclaimer, and is shown only to the clinician — never to the patient.

**Per-line accept and amend.** The physician verifies each line individually, and what they decide
is what enters the record. A history they cannot audit in one glance is a history they will ignore.

**Only the last four Aadhaar digits are ever stored.** The full number is used to verify the
checksum and then discarded.

**Hindi leads, English supports.** The whole argument is that this works for someone who cannot read
English. An English-first interface would quietly undercut the pitch.
