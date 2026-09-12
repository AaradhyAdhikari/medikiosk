"use strict";
/* MediKiosk — languages.
 *
 * The kiosk was built bilingual: every visible string is written as
 * L("हिन्दी", "English") and every question object carries `hi` and `en`.
 * Rather than rewrite 200-odd call sites, this file turns that pair into a
 * lookup: Hindi and English are answered from the arguments themselves, and
 * every other language is answered from a table keyed by the ENGLISH string.
 *
 * That means:
 *   · adding a language is adding one file under /lang — no code changes
 *   · a string nobody has translated yet is visible as a gap, not as silent
 *     Hindi. Showing a Tamil speaker a Hindi sentence they cannot read, with
 *     no indication anything is wrong, is the failure mode this avoids.
 *
 * Each language's file is flat, keyed by English, and safe for a native
 * speaker to correct without touching anything else. `node tools/i18n-check.js`
 * lists every key a language is missing.
 */

/* ── the registry ─────────────────────────────────────────────────────
   `asr`  — the BCP-47 tag handed to the browser's speech recogniser
   `tts`  — the tag for spoken prompts; a machine may have no voice for it,
            which is checked at runtime rather than assumed
   `font` — the family that must be loaded for the script to render at all
   `sans` — script tag, used to pick a Devanagari-aware serif for Sanskrit terms */
window.LANGS = [
  { code: "hi", native: "हिन्दी",   english: "Hindi",    glyph: "अ", asr: "hi-IN",      tts: "hi-IN", date: "hi-IN", script: "deva" },
  { code: "en", native: "English",  english: "English",  glyph: "A", asr: "en-IN",      tts: "en-IN", date: "en-IN", script: "latn" },
  { code: "mr", native: "मराठी",    english: "Marathi",  glyph: "म", asr: "mr-IN",      tts: "mr-IN", date: "mr-IN", script: "deva" },
  { code: "gu", native: "ગુજરાતી",  english: "Gujarati", glyph: "અ", asr: "gu-IN",      tts: "gu-IN", date: "gu-IN", script: "gujr" },
  { code: "pa", native: "ਪੰਜਾਬੀ",   english: "Punjabi",  glyph: "ਪ", asr: "pa-Guru-IN", tts: "pa-IN", date: "pa-IN", script: "guru" },
  { code: "ta", native: "தமிழ்",    english: "Tamil",    glyph: "ம", asr: "ta-IN",      tts: "ta-IN", date: "ta-IN", script: "taml" },
  { code: "te", native: "తెలుగు",   english: "Telugu",   glyph: "మ", asr: "te-IN",      tts: "te-IN", date: "te-IN", script: "telu" },
];

// Still honest about what is not done. These have no translation file, so
// they are shown as scheduled rather than offered and quietly broken.
window.LANGS_SOON = [
  { glyph: "ম", native: "বাংলা",  english: "Bengali" },
  { glyph: "ಕ", native: "ಕನ್ನಡ",  english: "Kannada" },
];

window.TR = {};   // filled by /lang/<code>.js, keyed by the English string

window.langMeta = function (code) {
  for (var i = 0; i < window.LANGS.length; i++) if (window.LANGS[i].code === code) return window.LANGS[i];
  return window.LANGS[0];
};

// A language is offerable only if its table actually arrived and has content.
// A missing or empty file removes the button rather than producing a screen
// of English inside a Tamil interview.
window.liveLangs = function () {
  return window.LANGS.filter(function (l) {
    if (l.code === "hi" || l.code === "en") return true;
    var t = window.TR[l.code];
    return t && Object.keys(t).length > 0;
  });
};

/* ── Sanskrit terms ───────────────────────────────────────────────────
   Dashavidha parameter names are Sanskrit, not Hindi. They are transliterated
   into the reader's own script rather than translated, because "Prakriti" is
   a technical term an Ayurvedic physician uses by name — rendering it as
   "nature" or "constitution" would lose the term the examiner is looking for.
   Devanagari languages keep the original spelling. */
window.SANSKRIT = {
  "प्रकृति": { gu: "પ્રકૃતિ", pa: "ਪ੍ਰਕ੍ਰਿਤੀ", ta: "பிரகிருதி", te: "ప్రకృతి" },
  "विकृति": { gu: "વિકૃતિ", pa: "ਵਿਕ੍ਰਿਤੀ", ta: "விகிருதி", te: "వికృతి" },
  "सार": { gu: "સાર", pa: "ਸਾਰ", ta: "சாரம்", te: "సారం" },
  "संहनन": { gu: "સંહનન", pa: "ਸੰਹਨਨ", ta: "சம்ஹனனம்", te: "సంహననం" },
  "प्रमाण": { gu: "પ્રમાણ", pa: "ਪ੍ਰਮਾਣ", ta: "பிரமாணம்", te: "ప్రమాణం" },
  "सात्म्य": { gu: "સાત્મ્ય", pa: "ਸਾਤਮਯ", ta: "சாத்மியம்", te: "సాత్మ్యం" },
  "सत्त्व": { gu: "સત્ત્વ", pa: "ਸੱਤਵ", ta: "சத்துவம்", te: "సత్వం" },
  "आहार शक्ति": { gu: "આહાર શક્તિ", pa: "ਆਹਾਰ ਸ਼ਕਤੀ", ta: "ஆகார சக்தி", te: "ఆహార శక్తి" },
  "व्यायाम शक्ति": { gu: "વ્યાયામ શક્તિ", pa: "ਵਿਆਯਾਮ ਸ਼ਕਤੀ", ta: "வ்யாயாம சக்தி", te: "వ్యాయామ శక్తి" },
  "वय": { gu: "વય", pa: "ਵਯ", ta: "வயம்", te: "వయం" },
  "अग्नि": { gu: "અગ્નિ", pa: "ਅਗਨੀ", ta: "அக்னி", te: "అగ్ని" },
  "कोष्ठ": { gu: "કોષ્ઠ", pa: "ਕੋਸ਼ਠ", ta: "கோஷ்டம்", te: "కోష్ఠం" },
  "दशविध परीक्षा": { gu: "દશવિધ પરીક્ષા", pa: "ਦਸ਼ਵਿਧ ਪਰੀਕਸ਼ਾ", ta: "தசவித பரீட்சை", te: "దశవిధ పరీక్ష" },
  "आहार विहार": { gu: "આહાર વિહાર", pa: "ਆਹਾਰ ਵਿਹਾਰ", ta: "ஆகார விகாரம்", te: "ఆహార విహారం" },
};
window.sanskrit = function (deva, code) {
  if (!deva) return "";
  var m = window.SANSKRIT[deva];
  return (m && m[code]) || deva;   // Devanagari languages keep the original
};

/* ── spoken commands ──────────────────────────────────────────────────
   English words are always matched, because a patient may well say "next"
   whatever language the screen is in. Everything else is matched only in the
   language currently selected, so a word that means one thing in Tamil and
   another in Gujarati cannot cross over. */
window.COMMAND_WORDS = {
  repeat: {
    en: ["repeat", "again"],
    hi: ["दोहराओ", "दोहराएँ", "फिर से", "दुबारा", "दोबारा"],
    mr: ["पुन्हा", "परत", "पुन्हा सांगा", "पुन्हा म्हणा"],
    gu: ["ફરી", "ફરીથી", "પાછું કહો"],
    pa: ["ਦੁਬਾਰਾ", "ਫਿਰ", "ਫੇਰ ਕਹੋ"],
    ta: ["மீண்டும்", "திரும்ப", "மறுபடியும்"],
    te: ["మళ్ళీ", "మరలా", "తిరిగి"],
  },
  back: {
    en: ["back", "previous"],
    hi: ["पीछे", "वापस", "पिछला"],
    mr: ["मागे", "मागील", "परत जा"],
    gu: ["પાછળ", "પાછલું", "પાછા"],
    pa: ["ਪਿੱਛੇ", "ਪਿਛਲਾ", "ਵਾਪਸ"],
    ta: ["பின்", "பின்னால்", "முந்தைய"],
    te: ["వెనుకకు", "వెనక", "మునుపటి"],
  },
  next: {
    en: ["next", "continue"],
    hi: ["आगे", "अगला", "आगे बढ़ो"],
    mr: ["पुढे", "पुढील", "पुढे चला"],
    gu: ["આગળ", "આગલું", "આગળ વધો"],
    pa: ["ਅੱਗੇ", "ਅਗਲਾ", "ਅੱਗੇ ਵਧੋ"],
    ta: ["அடுத்து", "அடுத்தது", "தொடர்"],
    te: ["తరువాత", "ముందుకు", "కొనసాగించు"],
  },
  skip: {
    en: ["skip"],
    hi: ["छोड़", "छोड़ो", "छोड़ें"],
    mr: ["वगळा", "सोडा", "सोडून द्या"],
    gu: ["છોડો", "અવગણો"],
    pa: ["ਛੱਡੋ", "ਛੱਡ ਦਿਓ"],
    ta: ["தவிர்", "விடு", "தவிர்க்க"],
    te: ["వదిలేయి", "దాటవేయి", "వదులు"],
  },
  help: {
    en: ["help"],
    hi: ["मदद", "सहायता", "बुलाओ"],
    mr: ["मदत", "साहाय्य", "बोलवा"],
    gu: ["મદદ", "સહાય", "બોલાવો"],
    pa: ["ਮਦਦ", "ਸਹਾਇਤਾ", "ਬੁਲਾਓ"],
    ta: ["உதவி", "கூப்பிடு"],
    te: ["సహాయం", "పిలువు"],
  },
};

// The hint strip under a question, in the patient's own language.
window.COMMAND_HINT = {
  hi: "बोलिए: दोहराएँ · पीछे · आगे · मदद",
  en: "Say: repeat · back · next · help",
  mr: "बोला: पुन्हा · मागे · पुढे · मदत",
  gu: "બોલો: ફરીથી · પાછળ · આગળ · મદદ",
  pa: "ਬੋਲੋ: ਦੁਬਾਰਾ · ਪਿੱਛੇ · ਅੱਗੇ · ਮਦਦ",
  ta: "சொல்லுங்கள்: மீண்டும் · பின் · அடுத்து · உதவி",
  te: "చెప్పండి: మళ్ళీ · వెనుకకు · తరువాత · సహాయం",
};
