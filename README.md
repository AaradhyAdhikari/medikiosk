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

# Languages

Seven: **Hindi, English, Marathi, Gujarati, Punjabi, Tamil and Telugu.** Not the buttons — the whole
interview. Every question, every option, every consent line, every error message.

### How it is built

The kiosk was written bilingual: every string is `L("हिन्दी", "English")` and every question object
carries `hi` and `en`. Rather than rewrite two hundred call sites, `public/i18n.js` turns that pair
into a lookup — Hindi and English come from the arguments, every other language from a table keyed
by the **English** string.

```
public/i18n.js        the language registry, Sanskrit transliterations, spoken commands
public/lang/mr.js     one flat file per language, keyed by English
public/lang/gu.js     nothing in these files is code — a native speaker can edit them directly
public/lang/pa.js
public/lang/ta.js
public/lang/te.js
```

**To add a language:** add a row to `LANGS` in `i18n.js`, drop a file in `public/lang/`, add its
`<script>` to `kiosk.html`. No other code changes. A language whose file is missing or empty is not
offered at all — a button that silently serves Hindi is worse than no button.

**A missing string shows English, never Hindi,** and logs `[i18n]` to the console. A Tamil reader
cannot tell Hindi from a bug; they can tell English is English.

```
node tools/i18n-check.js          # coverage per language — exits non-zero if any are short
node tools/i18n-check.js ta       # list exactly which strings Tamil is missing
node tools/i18n-review.js ta      # review/ta.html — a side-by-side sheet for a native speaker
```

### These translations have not been checked by native speakers

They were produced with machine assistance. For a kiosk that asks clinical questions that is a
starting point, not a finished job — a question that reads oddly in Tamil is a question a patient
answers wrongly, and the wrong answer reaches a physician looking like fact.

`node tools/i18n-review.js` writes one HTML sheet per language: English, Hindi and the translation
side by side, in the order a patient meets them, with the **clinical** questions marked so someone
with only ten minutes knows which lines matter. Corrections go in one file, matched by the English
line. **Do this before any pilot.** It is also the honest answer if a judge who speaks the language
finds a clumsy phrase: yes, and here is the review process and the sheet.

### Sanskrit terms are transliterated, not translated

Prakriti, Vikriti, Sara, Samhanana, Agni, Koshtha and the rest are the terms an Ayurvedic physician
uses by name. Rendering Prakriti as "constitution" in Tamil would lose the term an AIIA examiner is
listening for. They are written in the reader's own script — प्रकृति, પ્રકૃતિ, ਪ੍ਰਕ੍ਰਿਤੀ, பிரகிருதி,
ప్రకృతి — from `window.SANSKRIT` in `i18n.js`.

### Safety keywords follow the languages

Two things would have quietly stayed Hindi-only and both are safety-critical:

- **Red flags.** The word list now carries chest pain, breathlessness, bleeding, unconsciousness,
  paralysis and seizure in all seven languages, in the browser and again on the server. A patient who
  types `மார்பு வலி` raises the same flag as one who types `chest pain`.
- **Department routing.** The routing keywords are **derived from the translation files themselves**
  at server start — `COMPLAINT_ROUTING` in `server.js` maps the phrases a patient actually taps to
  departments, and every translation of those phrases becomes a keyword. Adding a language adds its
  routing for free, and a phrase corrected by a native speaker corrects the router too. They cannot
  drift apart, because there is only one copy. The startup box prints how many were derived.

### What the doctor sees

The summary is always **English** — the physician has three minutes and a queue. But the model is
told which language the patient answered in, and quotes their own words in their own script with an
English rendering in brackets. The queue row and the case header both name the language, so a quoted
Tamil phrase reads as the patient's words rather than as a rendering bug.

---

# Voice

Voice input, spoken prompts, and spoken navigation commands are built in and work with no
configuration, in every language the kiosk offers.

**It needs a secure context.** That means `http://localhost` or any `https://` address. It will
**not** work if you open the app from another machine over `http://192.168.x.x`. If you need it on
a phone or a second laptop, deploy it (below) or use a tunnel.

**Chrome and Edge only.** Firefox has no Web Speech API. Every screen has a typed and tapped path,
so nothing is blocked — but demo in Chrome.

**Spoken prompts depend on the machine.** Recognition works in all seven languages, but *reading the
question aloud* needs a voice installed on that computer, and a laptop may have Hindi and nothing
else. The kiosk checks at runtime: a language with no voice available is marked `text only` on the
language screen, and the question screen says so plainly instead of falling silent and looking
frozen. Typing and tapping are never affected.

**Spoken commands** work on any question screen, in Hindi or English:

| Does | Hindi | Marathi | Gujarati | Punjabi | Tamil | Telugu |
|---|---|---|---|---|---|---|
| reads the question again | दोहराएँ | पुन्हा | ફરીથી | ਦੁਬਾਰਾ | மீண்டும் | మళ్ళీ |
| moves on | आगे | पुढे | આગળ | ਅੱਗੇ | அடுத்து | తరువాత |
| goes back one question | पीछे | मागे | પાછળ | ਪਿੱਛੇ | பின் | వెనుకకు |
| skips the question | छोड़ें | वगळा | છોડો | ਛੱਡੋ | தவிர் | వదిలేయి |
| calls staff | मदद | मदत | મદદ | ਮਦਦ | உதவி | సహాయం |

English (`repeat`, `next`, `back`, `skip`, `help`) always works too, whatever the screen language is.
Beyond English, only the **current** language's words are matched, so a syllable that is a command in
one language cannot hijack an answer in another.

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

**Real:** a scannable token slip that prints · seven languages with the whole interview translated, not just the buttons · automatic department routing — every completed intake is sent to one clinic, specialists get their own
queue, and the assignment can be overruled by any clinician · three identification routes including a genuine Aadhaar Verhoeff checksum · patient
accounts with a personal login ID and password, layered on top of OTP rather than replacing it ·
a read-only patient dashboard of past visits, documents and summaries · adaptive
interview with first-visit, follow-up, proxy and emergency branching · voice input, spoken prompts
and spoken commands · large-text and high-contrast modes · literacy-free body map · all ten
Dashavidha Pariksha parameters with Vikriti separated from Prakriti, plus Agni, Koshtha and
Ahara-Vihara · document capture with AI extraction · chronological document timeline ordered by the
date printed on each paper, with undated items flagged rather than guessed at ·
AI summary with assessment and differentials ·
ICD-10 and NAMASTE coding suggestions · rule-based red-flag triage that upgrades the token to
priority · clinician registration with HPR ID, department and approval gating · live queue scoped to the clinician's
department · per-line accept and
amend · prescription write-back · granular DPDP consent · audit trail · real SMS when configured.

**Not real:**

- **ABHA enrolment.** Numbers are generated locally in the correct 14-digit format. Real enrolment
  needs ABDM sandbox credentials, which require an application and an approval period.
- **FHIR push.** The bundle is constructed; transmission is stubbed.
- **Bhashini ASR.** Speech recognition in all seven languages runs on the browser's own Web Speech
  API today, which is Chrome-only and needs a network connection. Bhashini is what a deployment would
  use, and that needs a key.

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

# The token slip

When the interview finishes the patient gets a token, a department and a QR code, and can print it.

**Scanning it opens that patient's case.** The QR carries `<base>/c/<code>`, which redirects to the
consultation console with the visit already open — so the desk scans instead of typing a token into a
search box. If nobody is signed in, the code is held until they are and the case opens straight after
login.

**The code is eight characters, not the visit's UUID.** A UUID pushes the symbol two versions higher,
and a denser symbol has smaller modules; on a thermal print under corridor light, module size is the
whole ball game. The alphabet leaves out `O/0` and `I/1/L` because someone reads it over a counter and
someone else types it. It is printed under the QR as text too — a QR smudged by a thermal head is a
dead QR, eight characters are not.

**Set `PUBLIC_URL` before a demo.** The QR has to carry an address the *desk's* device can reach.
Unset, it falls back to the kiosk's own origin, which is right in production and useless on a laptop —
a QR that says `localhost` scans perfectly and goes nowhere.

```env
PUBLIC_URL=https://your-tunnel-or-deployment-url
```

**The QR is generated in-process.** `public/qr.js` is a byte-mode QR encoder — Reed-Solomon over
GF(256), all eight masks scored, error-correction level M — in about 300 lines with no dependency and
no build step, because an OPD kiosk may be on a network that cannot reach a CDN. Output is SVG, not
canvas: a printer renders vector edges exactly, and a canvas at the wrong pixel ratio gives the soft
grey edges that make a cheap reader give up.

It was verified against a reference encoder rather than by eye: on 129 payloads, 61 are byte-identical,
58 differ only in remainder bits (which the spec says shall be zero — this one follows the spec), and
10 pick a different mask and all decode correctly. The printed slip was then rasterised and decoded
back at 150 dpi, skewed, blurred and dimmed.

**Printing** clones the slip into a print root and hides everything else, so one sheet comes out with
the slip and nothing around it. On paper the layout goes vertical — receipt-shaped — which gives the
QR the full width of an 80mm roll: a 36mm symbol at about 1.2mm per module. Beside the token it was
26mm, and that is where scans start failing.

---

# Departments — who sees which patient

A hospital runs on departments, and an intake that cannot say which one a patient belongs to has only moved the
queue, not shortened it. Every completed interview is routed to exactly one clinic before it reaches the queue.

### How the department is decided

Two things decide it, in this order:

1. **A keyword router**, in `server.js`, which runs on **every** intake, in Hindi and English, and never fails. It
   scores the patient's own complaint more heavily than the rest of the history — a diabetic with a toothache is a
   dental case today.
2. **The AI summary**, which may overrule the router when it has better reason, and must give a one-line reason
   naming the finding that sent the patient there.

If the model returns a department this hospital does not run, returns one from the wrong half of the hospital, or
the summary call fails entirely, the router's answer stands. **There is no unrouted state** for a queue to lose a
patient in. Routing works with no API key at all — the router is the whole of it, and the queue still sorts itself
by clinic.

The department list is in `server.js` as `DEPARTMENTS`, and it covers both halves of an AYUSH institute:

| AYUSH | Biomedical |
|---|---|
| Kayachikitsa · Panchakarma · Shalya Tantra · Shalakya Tantra · Prasuti Tantra & Stri Roga · Kaumarbhritya · Swasthavritta & Yoga · Manas Roga | General Medicine · Dentistry · Orthopaedics · ENT · Ophthalmology · Dermatology · Cardiology · Pulmonology · Gastroenterology · Neurology · Psychiatry · Obstetrics & Gynaecology · Paediatrics · General Surgery |

The patient's own choice of Ayurvedic, allopathic or both decides which column is used. Each department names its
equivalent in the other column, so a cross-system referral is one selection rather than a search.

**To add a department:** add an object to `DEPARTMENTS` with an `id`, labels, a `system`, and its keywords. Nothing
else needs to change — the registration form, the AI prompt and the reassignment menu are all generated from that
array.

### What a clinician sees

At registration a clinician picks one of three things:

- **a department** — their queue is that department
- **general clinician** — their queue is the whole hospital
- **something not on the list**, typed in — their queue is the whole hospital, because a clinic we cannot route to
  would otherwise mean a queue silently filtered to nothing

Three things are never filtered away from a specialist, and this is the part worth defending in Q&A:

- **anything flagged urgent or red-flagged** — visible to every clinician, always
- **anything not yet routed** — badged for triage rather than vanishing
- **nothing at all, for a general clinician**

The filter is a default, not a wall. **Show all departments** lifts it, and using it writes a
`queue_scope_override` entry to the audit trail naming the clinician. Opening a case outside your own department
writes `cross_department_access`. A doctor covering a colleague's clinic can always do so; they simply cannot do it
unobserved.

### Reassignment

The kiosk suggests a department; a clinician decides it. The case view shows the assignment, its confidence, the
one-line reason, and what the keyword router would have chosen if the model disagreed with it. Any clinician can
send the patient to another clinic with an optional reason, and the previous department, who changed it and when
are all kept — a routing mistake stays visible instead of being overwritten.

### Accounts created before this existed

They have no department, so they are treated as general clinicians and keep seeing the whole queue, exactly as they
did before. An upgrade must never quietly hide a patient from a doctor who could see them this morning.

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
  i18n.js              the language registry, Sanskrit terms, spoken commands
  lang/*.js            one translation file per language, keyed by the English string
  styles.css           the design system, including the accessibility modes
  about.html           what is real vs mocked, for judges
data/                  created on first run; delete to reset
tools/
  i18n-check.js        which strings each language is missing
  i18n-review.js       builds the native-speaker review sheets into review/
```

No dependencies, no build step, no framework. That is deliberate: the fewer moving parts, the
fewer things that can break at nine in the evening before a demo.

---

# Decisions worth defending in Q&A

**Department routing is rules first, AI second.** The keyword router runs on every intake whether or not there is an
API key, and it is what stands if the model returns a clinic this hospital does not have. The model can produce a
better answer; it can never produce an unrouted patient.

**A filtered queue says on screen that it is filtered.** A doctor who does not know a filter is on will read an
empty queue as an empty hospital. The strip at the top names the department, counts what is not being shown, and
offers the override in the same breath as the fact that using it is recorded.

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

**A missing translation shows English, not Hindi.** A Tamil or Gujarati reader has no way to tell a
Hindi sentence from a bug, and would sit there assuming they had done something wrong. English at
least reads as a different language. `tools/i18n-check.js` is there so this never reaches a patient.

**Sanskrit terms are transliterated, not translated.** Prakriti in Tamil script is still Prakriti.
"Constitution" is not — and an AIIA examiner is listening for the term.

**Routing keywords are derived from the translations.** Twenty-two departments across seven languages
is a hand-maintained table that would be wrong within a month. Deriving it means a correction by a
native speaker fixes the routing at the same time.

**Hindi leads, English supports.** The whole argument is that this works for someone who cannot read
English. An English-first interface would quietly undercut the pitch.
