# SIH Idea Submission — MediKiosk
Copy each block into the matching field. Character counts are noted against the limits.

---

## 1. IDEA TITLE  *(max 100 characters)*

```
MediKiosk — patient-led clinical history intake for AYUSH OPDs in seven Indian languages
```
*(88 characters)*

---

## 2. IDEA DESCRIPTION  *(max 50,000 characters)*

```
THE PROBLEM AS IT IS ACTUALLY EXPERIENCED

A tertiary government OPD in India registers between 4,000 and 10,000 patients a
day. A study across 67 countries published in BMJ Open put the average Indian
primary-care consultation at just over two minutes. Inside that window a
physician has to elicit the history, examine the patient, read whatever papers
they brought, reason, counsel and prescribe. History taking is the single
activity that classical teaching credits with reaching the correct diagnosis in
70-80% of cases, and it is the first thing that gets cut.

An AYUSH OPD carries a second burden. Ayurvedic assessment expects Trividha,
Ashtavidha and Dashavidha Pariksha - constitution, current imbalance, digestive
capacity, bowel nature, diet and routine, causative factors. That is a longer
interview than allopathic intake, not a shorter one. Asked to do it in two
minutes, a practitioner abbreviates precisely the assessment that makes the care
Ayurvedic.

WHAT MEDIKIOSK DOES

MediKiosk moves history taking out of the consultation room and in front of it.
A patient waiting for their turn completes a structured clinical interview at a
touchscreen, by speaking or by tapping, in their own language. By the time they
sit down, the clinician is reading a physician-ready summary instead of starting
from nothing.

The patient identifies themselves by mobile number, ABHA number or Aadhaar, with
a one-time code to the phone. A first-time patient is issued an account so their
history is theirs across visits, not re-collected each time.

The interview then adapts to what they say. A patient whose complaint is a skin
problem is asked whether it itches, what the skin looks like, whether it is
spreading and what set it off. A patient with chest pain is asked what the pain
feels like, what makes it worse, whether it radiates to the arm or jaw, and what
came with it. The questions follow the complaint rather than marching through a
fixed list, which is what SIH26047 Module A means by questioning that "branches
based on chief complaint, mirroring a physician's clinical reasoning".

For an AYUSH consultation the interview extends into the full Dashavidha
Pariksha - Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya, Sattva, Ahara
Shakti, Vyayama Shakti and Vaya - plus Agni, Koshtha and Ahara-Vihara. Each
parameter is elicited through one plain-language question a patient can actually
answer about themselves. The clinical interpretation stays with the vaidya; the
kiosk collects observations, not opinions.

The patient can photograph prior prescriptions, lab reports and discharge
summaries. These are read, structured into diagnoses, drugs with doses and test
values with their reference ranges, out-of-range results are flagged, and the
papers are ordered by the date printed on them into a timeline the physician can
follow.

At the end the patient takes a printed slip carrying their token, their assigned
department and a QR code. The desk scans it and the patient's case opens on the
consultation screen. A short alphanumeric code is printed alongside, so a smudged
QR or a torn slip is still usable by typing.

WHAT THE CLINICIAN RECEIVES

A structured history in the standard order - chief complaint, HPI in SOCRATES
form, past medical and surgical, drugs and allergies, family, personal, review of
systems, and a summary of every investigation found in the scanned documents,
oldest first. For an AYUSH consultation the Dashavidha parameters and a dosha
indication sit alongside it.

The summary is a draft, never a record. The physician accepts, amends or rejects
it, and nothing enters the record until they do. Where the patient went
off-script, their own words are quoted verbatim in their own language with a
translation beside them - a quotation the reader cannot read is not evidence, and
one that has been silently translated is no longer theirs.

Patients are routed to a department by a keyword router that runs on every
intake and cannot fail. Where the AI is enabled it may overrule that routing, but
it must give a reason, and an unusable answer falls back to the router. There is
no unrouted state.

CODING AND INTEROPERABILITY

Where the AI summary is enabled, the draft carries coding suggestions in both
systems at once: an ICD-10 code and title for the working impression, and a
NAMASTE (AYUSH) standardised terminology code where one plausibly applies, with a
stated confidence. For a patient being seen under both systems, both are offered.
These are suggestions for the physician to confirm and are never treated as
final. Dual coding is what makes an Ayurvedic encounter legible to an ABDM
record and to a hospital system that speaks ICD, without flattening the AYUSH
diagnosis into an allopathic one.

LANGUAGE AND SPEECH

The interview is fully translated into Hindi, English, Marathi, Gujarati,
Punjabi, Tamil and Telugu - the whole interview, not only the buttons. Speech
input and text-to-speech prompts run per-language with the correct locale, and
the kiosk tells the patient when a machine has no voice available for spoken
prompts rather than falling silent. Bengali and Kannada are listed as scheduled
and are being added through Bhashini, which is also the intended production ASR
path for Indian-language speech recognition in place of the browser engine used
in the prototype. The kiosk says this on screen, because a half-translated
interview presented as a complete one is worse than an honest gap.

SAFETY, AND WHAT HAPPENS WHEN THINGS DO NOT WORK

Emergency detection does not depend on anything succeeding. A word list covering
every language the kiosk offers runs in the browser and again on the server, so a
missed emergency cannot be caused by a failed network call or by which screen the
words were typed into. A Tamil speaker typing the Tamil for chest pain raises the
same flag as an English speaker typing "chest pain".

A flagged case is re-tokened into a priority series, sorts above every other
patient on the clinicians' queue including the one currently in consultation, and
appears behind a full-width red banner that is itself a button into the case. An
EMERGENCY control sits in the kiosk bar on every screen, from the language
chooser onward. Pressing it raises the flag immediately - one press, because a
confirmation dialog in front of an emergency button is a delay that cannot be
defended. A mis-tap can be withdrawn, because a flag nobody can clear is a flag
clinicians learn to ignore, and that costs the next real emergency.

The same principle runs through the build. With no AI configured the interview,
the routing, the red flags, the tokens and the printed slip all still work, and
the summary says plainly that it was assembled without AI rather than presenting
a thinner output as though it were the same thing. With no SMS gateway the code
appears on screen and the kiosk says why. If the model returns nothing, the
console says the model returned nothing - because "the AI found nothing
concerning" and "the AI did not answer" are different facts and a clinician
should not have to guess which one happened. The QR encoder was written from the
specification with no dependency and no build step, because a kiosk in a district
hospital may not reach a CDN.

CONSENT AND DATA

Consent is granular and revocable, presented before the interview with an audio
explanation, following the Digital Personal Data Protection Act 2023 and the
ABDM consent framework. The consent choices are enforced in code, not just recorded: a
patient who declines automatic reading of their documents gets documents stored
as images and never sent for processing, and a patient who declines the record
consent gets the non-AI summary path. Temporary session data is cleared on
submission.

ACCESSIBILITY

Every question is answerable by speaking or by tapping, and every question also
accepts free text, because real complaints do not fit preset boxes. There is a
larger-text and high-contrast mode, audio prompts throughout, and spoken
navigation. Sanskrit terms are transliterated into the reader's own script rather
than left in Devanagari, so a Tamil or Telugu reader is not asked to decode a
script they do not read. A missing translation falls back to English rather than
Hindi, so a reader can tell a gap from a bug.

WHAT IS BUILT, AND WHAT IS NOT

This is a working application, not a mockup. The interview, the seven languages,
the Dashavidha module, complaint-adaptive questioning, department routing,
red-flag triage, the emergency path, the clinician console, the printed token
slip and its QR encoder are implemented and running.

Stated plainly, because a prototype that overstates itself is worse than one that
does not: the ABDM integration points are built but stubbed - ABHA numbers are
generated locally rather than issued by ABDM, and the FHIR push to the hospital
system is recorded as mocked in the event log. Connecting them needs ABDM sandbox
credentials, not new architecture. The translations into Marathi, Gujarati,
Punjabi, Tamil and Telugu are machine-assisted and not yet checked by native
speakers, and the application says so. The complaint-specific question sets follow
standard history-taking structure and need a vaidya's review before use on real
patients. Emergency cases surface prominently on the clinicians' queue, but there
is no pager or SMS to triage staff yet, so it is a prioritised queue entry rather
than an alert.

Every one of those is a known gap with a known next step, which is the difference
between an unfinished feature and an undiscovered one.

KEY TERMS

Problem statement SIH26047, Ministry of Ayush, All India Institute of Ayurveda.

Clinical: structured history taking, chief complaint, history of present illness,
SOCRATES framework, review of systems, drug and allergy history, family and
personal history, red-flag screening, triage prioritisation, differential
diagnosis, clinical decision support, physician-in-the-loop, never an autonomous
diagnosis.

AYUSH: Dashavidha Pariksha, Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya,
Sattva, Ahara Shakti, Vyayama Shakti, Vaya, Agni, Koshtha, Ahara-Vihara, dosha
assessment, NAMASTE standardised AYUSH terminology.

Digital health and interoperability: Ayushman Bharat Digital Mission, ABHA
health account, FHIR, Health Information Exchange, HIS and EMR integration,
ICD-10 coding, dual ICD-10 and NAMASTE coding.

Technology: multimodal intake, dual-mode voice and touch input, adaptive
questioning, complaint-driven dialogue branching, automatic speech recognition,
text-to-speech, optical character recognition, document intelligence,
chronological document timeline, abnormal-value flagging, dependency-free QR
encoding, offline-capable, graceful degradation.

Language and access: Bhashini, seven Indian languages, full-interview
translation, script transliteration, audio-guided mode, large-text and
high-contrast accessibility, low-literacy and elderly usability, rural and
first-visit patient populations, zero-training operation.

Policy and privacy: Digital Personal Data Protection Act 2023, ABDM consent
framework, granular revocable consent, consent enforced in code, data
minimisation, session data cleared on submission.

Throughput: OPD congestion, 4,000-10,000 patients per day, two-minute
consultation, first-mile digitisation, consultation time recovered.
```

---

## 3. ABSTRACT / SUMMARY  *(max 10,000 characters)*

```
Indian government OPDs see 4,000-10,000 patients a day, and the average
consultation is just over two minutes. History taking - the activity classical
teaching credits with reaching the right diagnosis in 70-80% of cases - is the
first thing squeezed out. AYUSH OPDs carry more of this burden, not less:
Dashavidha Pariksha is a longer assessment than allopathic intake, and in two
minutes it is abbreviated to nothing.

MediKiosk moves history taking in front of the consultation. While waiting, a
patient completes a structured clinical interview at a touchscreen - speaking or
tapping, in any of seven Indian languages - and the clinician starts the
consultation reading a physician-ready summary instead of a blank page.

The interview adapts to the complaint. Someone presenting with a skin problem is
asked about itching, appearance, spread and triggers; someone with chest pain is
asked about character, radiation and associated symptoms. For AYUSH
consultations it extends into the full ten-fold examination - Prakriti, Vikriti,
Sara, Samhanana, Pramana, Satmya, Sattva, Ahara Shakti, Vyayama Shakti, Vaya -
with Agni, Koshtha and Ahara-Vihara, each elicited through one question a patient
can answer about themselves. Interpretation stays with the vaidya.

Patients photograph prior prescriptions and reports, which are read into
diagnoses, drugs with doses and test values with reference ranges, with
out-of-range results flagged and papers ordered into a timeline. They leave with
a printed slip carrying a token, their department and a QR code that opens their
case at the desk, plus a short typed code for when the QR is smudged.

Safety is designed not to depend on anything working. Red-flag detection runs
from a word list in every supported language, in the browser and again on the
server, so a missed emergency cannot be caused by a failed API call. Flagged
cases are re-tokened to a priority series, sort above every other patient, and
appear behind a red banner that opens the case in one click. An EMERGENCY button
sits on every kiosk screen and raises the flag in a single press.

The same discipline runs throughout. Without AI configured, the interview,
routing, triage, tokens and slips all still work, and the summary says it was
assembled without AI rather than passing off a thinner output as the same thing.
Without an SMS gateway the code shows on screen and says why. If the model
returns nothing, the console says so - because "found nothing concerning" and
"did not answer" are different facts. The QR encoder was written from the
specification with no dependency, because a district hospital kiosk may not reach
a CDN.

Where the AI summary is enabled, the draft also carries dual coding - an ICD-10
code for the working impression and a NAMASTE standardised AYUSH terminology code
where one applies - as suggestions the physician confirms. That is what lets an
Ayurvedic encounter reach an ABDM record without being flattened into an
allopathic diagnosis.

Consent is granular, revocable, explained aloud, and enforced in code rather than
merely recorded, following the Digital Personal Data Protection Act 2023 and the
ABDM consent framework. The summary is always a draft: the physician accepts, amends or
rejects it, and nothing enters the record until they do. Where a patient went
off-script their own words are quoted in their own language with a translation
beside them.

This is a running application. Stated plainly: the ABDM integration points are
built but stubbed - ABHA numbers are generated locally rather than issued by
ABDM, and the FHIR push is recorded as mocked - and connecting them needs sandbox
credentials rather than new architecture. Regional-language translations are
machine-assisted and not yet native-speaker reviewed, and the app says so.
Complaint-specific question sets need a vaidya's review. Emergencies surface
prominently on the queue but nothing yet pages triage staff. Each is a known gap
with a known next step.
```

---

## 4. TECHNOLOGY BUCKET

Select **MedTech / BioTech / HealthTech** — it matches the problem statement's own
stated theme. If the dropdown words it differently, pick the closest health option.

---

## 5. YOUTUBE LINK *(optional)*

Leave blank unless you record a demo. If you do, show: the kiosk interview in a
regional language, the emergency button raising a flag, and that flag appearing
at the top of the doctor's queue. That sequence is the strongest ninety seconds
you have.

---

## 6. IDEA TEMPLATE (PDF)

Download their template and fill it with the same content. Tell me if you want
this converted to match their PDF layout.
