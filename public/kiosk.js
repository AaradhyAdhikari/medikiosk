"use strict";
/* MediKiosk — the patient kiosk. Vanilla JS, no build step. */

var S = {
  lang: "hi", screen: "lang", phone: "", otp: "", devCode: "", live: false,
  method: null,           // "phone" | "abha" | "aadhaar"
  abhaInput: "", aadhaarInput: "",
  name: "", ageYears: "", sex: "", heightCm: "", weightKg: "",
  maskedPhone: "", knownName: "",
  consent: { record: true, docs: true, share: true, locker: false },
  visit: null, visitType: null, system: null,
  step: 0, answers: {}, docs: [], summary: null, abha: null,
  busy: false, error: "", notice: "",
  startedAt: Date.now(),

  /* ── patient account · SIH26047 architecture table ──
     "Personal login ID and password for patients to enter data and store
     medical records." The account sits alongside OTP, never in place of it:
     the code is still what proves the phone at the start of a visit, and it
     is still the way back in when a password has been forgotten. */
  loginId: "", loginPw: "", newPw: "", newPw2: "",
  account: null,          // { loginId } once created or signed in
  hasAccount: false,      // does this patient already have one?
  records: null,          // the dashboard payload
  openVisit: null,        // which past visit is expanded on the dashboard
  consentBack: "profile", // where "back" goes from the consent screen
};

/* ── accessibility mode ─────────────────────────────
   Named in the SIH26047 architecture table. Persisted per kiosk so a large
   patient population does not have to rediscover it every visit. */
var A11Y = { large: false, contrast: false };
try {
  A11Y = JSON.parse(localStorage.getItem("mk_a11y") || "null") || A11Y;
} catch (e) {}
function applyA11y() {
  document.documentElement.classList.toggle("a11y-large", !!A11Y.large);
  document.documentElement.classList.toggle("a11y-contrast", !!A11Y.contrast);
  try { localStorage.setItem("mk_a11y", JSON.stringify(A11Y)); } catch (e) {}
}
applyA11y();

var body = document.getElementById("kbody");
var foot = document.getElementById("kfoot");

/* Hindi and English are answered from the arguments. Every other language is
   answered from its table in /lang, keyed by the English string. A key that
   has not been translated falls through to English and is reported in the
   console — never to Hindi, which a Tamil or Gujarati reader cannot read and
   would have no way of knowing was a bug. `tools/i18n-check.js` catches these
   before a patient does. */
var MISSING = {};
function L(hi, en) {
  if (S.lang === "hi") return hi;
  if (S.lang === "en") return en;
  var t = window.TR[S.lang];
  var v = t && t[en];
  if (v) return v;
  if (!MISSING[S.lang + "|" + en]) {
    MISSING[S.lang + "|" + en] = 1;
    console.warn("[i18n] no " + S.lang + " for: " + en);
  }
  return en;
}
/* Sentences with a value in the middle — a token, a phone number, a name.
   Written as templates with {} placeholders so the whole sentence stays one
   translatable key: a language that puts the number first, or adds a
   postposition after it, can do so. Concatenating fragments would make that
   impossible. */
function LX(hi, en) {
  var args = Array.prototype.slice.call(arguments, 2);
  var i = 0;
  return String(L(hi, en)).replace(/\{\}/g, function () { return args[i++]; });
}

// The Sanskrit technical terms, in the reader's script.
function SK(deva) { return window.sanskrit(deva, S.lang); }

function setLangPill() {
  var el = document.getElementById("langpill");
  if (el) el.textContent = window.langMeta(S.lang).native;
}
// Each script needs its own font loaded or it renders as boxes. The class on
// <html> is what styles.css hangs the family off.
function applyLangFont() {
  var r = document.documentElement;
  r.className = r.className.replace(/\bscript-\w+\b/g, "").trim();
  r.classList.add("script-" + window.langMeta(S.lang).script);
  r.setAttribute("lang", S.lang);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function questions() {
  if (S.visit && S.visit.visitType === "FOLLOW_UP") return window.FOLLOW_UP;
  return window.firstVisitQuestions((S.visit && S.visit.system) || S.system);
}

/* ── document timeline ──────────────────────────────
   Documents are ordered by the date printed on the paper, worked out on the
   server at scan time. Anything whose date could not be read is shown last and
   said to be undated, rather than being quietly slotted in at the wrong point
   in someone's medical history. */

function docDay(d) {
  if (!d || !d.docDate) return null;
  var t = new Date(d.docDate);
  if (isNaN(t)) return null;
  return t.toLocaleDateString(window.langMeta(S.lang).date,
    { day: "numeric", month: "short", year: "numeric" });
}

/* The small date chip that appears next to every document, everywhere. */
function dateChip(d) {
  var day = docDay(d);
  if (day) return '<span class="datechip">' + ICON("calendar", 13) + " " + esc(day) + "</span>";
  return '<span class="datechip undated" title="' +
    esc(L("इस काग़ज़ पर तारीख़ नहीं पढ़ी जा सकी", "No date could be read from this document")) + '">' +
    ICON("hourglass", 13) + " " + L("तारीख़ नहीं", "undated") + "</span>";
}

/* Sorts a list the client holds itself. The server sends records already in
   order; this keeps the live scanning grid honest as each read comes back. */
function chronological(list) {
  var dated = list.filter(function (d) { return d.docDate; })
    .sort(function (a, b) { return String(a.docDate).localeCompare(String(b.docDate)); });
  var undated = list.filter(function (d) { return !d.docDate; });
  return dated.concat(undated);
}
function minutesLeft() {
  var qs = questions(), done = S.step, left = Math.max(0, qs.length - done);
  return Math.max(1, Math.round((left * 18) / 60)); // ~18 seconds per question
}

async function api(url, bodyObj, method) {
  var r = await fetch(url, {
    method: method || "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(j.error || "Something went wrong. Please ask staff for help.");
  return j;
}

/* ── speech ─────────────────────────────────────────── */

var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var VOICE_IN = !!SR;
var VOICE_OUT = "speechSynthesis" in window;
var rec = null, recOn = false;

/* Spoken prompts depend on a voice being installed on the machine, and for
   Indian languages that is far from guaranteed — a laptop may have Hindi and
   nothing else. Rather than call speak() into silence and let the patient
   think the kiosk has frozen, we check what the browser actually has and say
   plainly on screen when prompts are unavailable in their language. Typing
   and tapping are never affected; nothing is blocked either way. */
function ttsVoiceFor(code) {
  if (!VOICE_OUT) return null;
  var want = window.langMeta(code).tts;
  var base = want.split("-")[0];
  var voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
  if (!voices.length) return undefined;            // list not ready yet — unknown, not absent
  for (var i = 0; i < voices.length; i++) if (voices[i].lang && voices[i].lang.replace("_", "-") === want) return voices[i];
  for (var j = 0; j < voices.length; j++) if (voices[j].lang && voices[j].lang.split(/[-_]/)[0] === base) return voices[j];
  return null;
}
function canSpeak(code) { return ttsVoiceFor(code || S.lang) !== null; }

function speak(text) {
  if (!VOICE_OUT || !text) return;
  var voice = ttsVoiceFor(S.lang);
  if (voice === null) return;                      // no voice for this language on this machine
  try {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = window.langMeta(S.lang).tts;
    if (voice) u.voice = voice;
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
// Chrome populates the voice list asynchronously; without this the first
// question can be judged voiceless purely because the list had not arrived.
if (VOICE_OUT && typeof window.speechSynthesis.addEventListener === "function") {
  window.speechSynthesis.addEventListener("voiceschanged", function () {});
}
function listen(onPartial, onFinal) {
  if (!SR) { onFinal && onFinal(""); return; }
  
  // Clean up any existing recognition instance first
  if (rec) {
    try { rec.abort(); } catch (e) {}
    rec = null;
  }
  
  try {
    rec = new SR();
    rec.lang = window.langMeta(S.lang).asr;
    rec.interimResults = true;
    rec.continuous = false;
    var best = "";
    rec.onresult = function (ev) {
      var t = "";
      for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      best = t; onPartial && onPartial(t);
    };
    rec.onerror = function (err) { 
      // Log error for debugging
      console.warn("Speech recognition error:", err.error);
      recOn = false; 
      onFinal && onFinal(best); 
    };
    rec.onend = function () { recOn = false; onFinal && onFinal(best); };
    rec.start(); recOn = true;
  } catch (e) { 
    console.error("Failed to start speech recognition:", e);
    recOn = false; 
    onFinal && onFinal(""); 
  }
}
function stopListen() { 
  try { 
    if (rec) {
      rec.abort(); // Use abort() instead of stop() for immediate cleanup
      rec = null;
    }
  } catch (e) {} 
  recOn = false; 
}

/* ── image downscale ────────────────────────────────── */

function shrink(file, cb) {
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    var c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    try { cb(c.toDataURL("image/jpeg", 0.72)); } catch (e) { cb(null); }
  };
  img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
}

/* ── chrome ─────────────────────────────────────────── */

document.getElementById("btn-speak").onclick = function () {
  var h = document.querySelector("h1.q");
  speak(h ? h.textContent : "");
};
document.getElementById("btn-lang").onclick = function () {
  // The pill toggles between the language chosen at the start and English —
  // the two a patient is most likely to want to flip between mid-interview.
  S.lang = S.lang === "en" ? (S.langChosen || "hi") : "en";
  setLangPill();
  render();
};
document.getElementById("btn-help").onclick = function () {
  alert(L("सहायता के लिए कर्मचारी को बुलाया गया है।", "A staff member has been called to help you."));
};
document.getElementById("btn-home").onclick = function () { location.href = "/"; };
document.getElementById("btn-a11y").onclick = function () { S.beforeA11y = S.screen; go("a11y"); };

/* Their own record, one tap from anywhere, once they are signed in. */
document.getElementById("btn-records").onclick = function () { openDashboard(); };

function go(s) { S.screen = s; stopListen(); render(); }

/* ── spoken navigation commands ──────────────────────
   The PS asks for voice throughout, not only for answers. These work on every
   question screen; the hint strip tells the patient what is available. */
/* English words always match, because a patient may say "next" whatever the
   screen language is. Beyond that only the CURRENT language's words are
   matched, so a syllable that is a command in one language cannot hijack an
   answer in another. */
function commandWords(act) {
  var g = window.COMMAND_WORDS[act] || {};
  return (g.en || []).concat(S.lang === "en" ? [] : (g[S.lang] || []));
}
function matchCommand(text) {
  if (!text) return null;
  var t = String(text).toLowerCase().trim();
  if (t.split(/\s+/).length > 4) return null; // a sentence is an answer, not a command
  var acts = ["repeat", "back", "next", "skip", "help"];
  for (var i = 0; i < acts.length; i++) {
    var w = commandWords(acts[i]);
    for (var j = 0; j < w.length; j++) if (t.indexOf(w[j].toLowerCase()) > -1) return acts[i];
  }
  return null;
}
function steps(i, n) {
  var h = '<div class="steps">';
  for (var k = 0; k < n; k++) h += '<i class="' + (k === i ? "on" : k < i ? "done" : "") + '"></i>';
  return h + "</div>";
}

function sectionLabel(id) {
  var m = (window.SECTIONS || []).filter(function (x) { return x.id === id; })[0];
  return m ? esc(L(m.hi, m.en)) : "";
}

/* The journey rail: where she is, what is left, and how long. Shown on every
   question screen so a fourteen-question interview never feels endless. */
function journeyRail() {
  var qs = questions(), q = qs[S.step];
  var current = q ? q.section : "complaint";
  var seen = {}, order = [];
  qs.forEach(function (x) { if (!seen[x.section]) { seen[x.section] = true; order.push(x.section); } });
  order.push("documents", "review");
  var currentIx = order.indexOf(current);

  return '<div class="rail">' +
    order.map(function (sid, i) {
      var meta = (window.SECTIONS || []).filter(function (s) { return s.id === sid; })[0] || { hi: sid, en: sid };
      var cls = i < currentIx ? "done" : i === currentIx ? "on" : "";
      return '<span class="railitem ' + cls + '"><i></i>' +
        '<b' + (meta.dev ? ' class="dev"' : "") + ">" + esc(L(meta.hi, meta.en)) + "</b></span>";
    }).join("") +
    '<span class="railtime">' + LX("बाक़ी ≈ {} मिनट", "≈ {} min left", minutesLeft()) + "</span>" +
    "</div>";
}

/* ── render ─────────────────────────────────────────── */

function render() {
  body.innerHTML = ""; foot.innerHTML = "";

  /* The records button appears once there is an identified patient behind it,
     and stays out of the way during the interview itself, where leaving the
     screen would lose the answers so far. */
  var midInterview = ["q", "red", "docs", "think", "review"].indexOf(S.screen) > -1;
  var identified = !!(S.knownName || S.account || S.records);
  document.getElementById("btn-records").hidden = !identified || midInterview || S.screen === "dash";

  ({
    lang: scLang, identify: scIdentify, phone: scPhone, abha: scAbha, aadhaar: scAadhaar,
    otp: scOtp, profile: scProfile, consent: scConsent, visit: scVisit, system: scSystem,
    q: scQuestion, red: scRed, docs: scDocs, think: scThink, review: scReview, done: scDone,
    a11y: scA11y,
    signin: scSignin, account: scAccount, accountdone: scAccountDone, dash: scDash,
  })[S.screen]();
}

function scLang() {
  // Only languages the interview is genuinely translated into are selectable.
  // Showing a Tamil button that silently serves Hindi is worse than showing
  // none — and a judge who speaks Tamil will find it in ten seconds. A
  // language appears here only when its translation file has actually loaded.
  var live = window.liveLangs();
  var soon = window.LANGS_SOON;

  body.innerHTML = '<span class="eyebrow">Ministry of Ayush · OPD Intake</span>' +
    '<h1 class="q">अपनी भाषा चुनिए</h1><p class="q-en">Choose your language</p>' +
    '<div class="chips two">' + live.map(function (o, i) {
      // Each button is rendered in its own script, and marked if this machine
      // has no voice for it — the patient finds out here, not three screens in.
      return '<button class="chip script-' + o.script + '" lang="' + o.code + '" data-i="' + i + '">' +
        '<span class="glyph">' + o.glyph + "</span><span>" + o.native +
        "<small>" + o.english + (VOICE_OUT && !canSpeak(o.code) ? " · text only" : "") +
        "</small></span></button>";
    }).join("") + "</div>" +

    '<p style="font-size:13.5px;font-weight:700;color:var(--muted);margin:20px 0 9px;' +
      'letter-spacing:.06em;text-transform:uppercase">' +
      L("जल्द आ रही हैं", "Coming soon") + "</p>" +
    '<div class="chips two">' + soon.map(function (o) {
      return '<span class="chip soon" aria-disabled="true"><span class="glyph">' + o.glyph + "</span><span>" +
        o.native + "<small>" + o.english + "</small></span></span>";
    }).join("") + "</div>" +

    '<p class="lede" style="margin-top:16px">' +
      L("ऊपर दी गई हर भाषा में पूरा इंटरव्यू अनुवादित है। बाक़ी भाषाएँ भाषिणी ASR से जोड़ी जा रही हैं — " +
        "आधी-अधूरी भाषा देने से बेहतर है कि साफ़ बता दिया जाए।",
        "Every language above has the full interview translated, not just the buttons. The remaining " +
        "scheduled languages are being added through Bhashini — we would rather say so than serve a " +
        "half-translated interview.") + "</p>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-i]"); if (!b) return;
    S.lang = live[+b.dataset.i].code;
    S.langChosen = S.lang;
    applyLangFont();
    setLangPill();
    go("identify");
  };
}

/* ── accessibility panel ──────────────────────────── */
function scA11y() {
  body.innerHTML = '<span class="eyebrow">' + L("सुविधा", "Accessibility") + "</span>" +
    '<h1 class="q">' + L("पढ़ने में आसानी", "Make this easier to read") + "</h1>" +
    '<p class="q-en">' + L("कभी भी बदल सकते हैं", "You can change this at any time") + "</p>" +
    '<button class="consent-card' + (A11Y.large ? " on" : "") + '" data-t="large">' +
      '<span class="cic">' + ICON("zoom", 26) + '</span><span style="flex:1">' +
      '<b style="font-size:17px;display:block">' + L("बड़े अक्षर", "Larger text") + "</b>" +
      '<small style="font-size:13.5px;color:var(--muted);display:block;margin-top:2px">' +
      L("सब कुछ लगभग डेढ़ गुना बड़ा हो जाएगा", "Everything becomes about half again as large") +
      "</small></span><span class=\"toggle\"></span></button>" +
    '<button class="consent-card' + (A11Y.contrast ? " on" : "") + '" data-t="contrast">' +
      '<span class="cic">' + ICON("contrast", 26) + '</span><span style="flex:1">' +
      '<b style="font-size:17px;display:block">' + L("गहरा रंग-भेद", "High contrast") + "</b>" +
      '<small style="font-size:13.5px;color:var(--muted);display:block;margin-top:2px">' +
      L("काले-सफ़ेद में, मोटी लकीरों के साथ", "Black and white, with heavier outlines") +
      "</small></span><span class=\"toggle\"></span></button>" +
    '<div class="notice jade" style="margin-top:14px">' + ICON("speaker",18) + " " +
      L("हर स्क्रीन पर ऊपर वाला बटन दबाकर सुन सकती हैं।", "The speaker button at the top reads any screen aloud.") + "</div>";

  foot.innerHTML = '<button class="btn" id="bk">' + L("वापस जाएँ", "Go back") + "</button>";
  body.onclick = function (e) {
    var b = e.target.closest("[data-t]"); if (!b) return;
    var k = b.dataset.t;
    A11Y[k] = !A11Y[k];
    applyA11y();
    b.classList.toggle("on", A11Y[k]);
  };
  document.getElementById("bk").onclick = function () {
    go(S.beforeA11y || (S.visit ? "q" : "identify"));
  };
}

/* ── identify: three doors ────────────────────────── */
function scIdentify() {
  body.innerHTML = steps(0, 8) +
    '<span class="eyebrow">' + L("पहचान", "Identify") + "</span>" +
    '<h1 class="q">' + L("आप अपनी पहचान कैसे बताएँगी?", "How would you like to identify yourself?") + "</h1>" +
    '<p class="q-en">' + L("तीनों में से कोई भी तरीक़ा चलेगा", "Any one of these three works") + "</p>" +
    '<div class="chips">' +
      '<button class="chip" data-m="phone">' + ICON("person",26) + '<span>' +
        L("मोबाइल नंबर से", "With my mobile number") +
        '<small>' + L("सबसे आसान · नया ABHA बन जाएगा", "Simplest — an ABHA is created for you") + "</small></span></button>" +
      '<button class="chip" data-m="abha">' + ICON("document",26) + '<span>' +
        L("मेरे पास ABHA नंबर है", "I already have an ABHA number") +
        '<small>' + L("14 अंकों का नंबर · पुराना रिकॉर्ड जुड़ जाएगा", "14 digits — links your existing records") + "</small></span></button>" +
      '<button class="chip" data-m="aadhaar">' + ICON("lock",26) + '<span>' +
        L("आधार से", "With Aadhaar") +
        '<small>' + L("12 अंक · आधार से जुड़े मोबाइल पर कोड आएगा", "12 digits — code goes to your Aadhaar-linked mobile") + "</small></span></button>" +
    "</div>" +

    /* The account is a fourth way in, not a replacement for the three above.
       It is set apart deliberately: a first-time patient should read three
       options, not four, and the returning patient who has an ID is looking
       for exactly this line. */
    '<div class="signinrow">' +
      "<span>" + L("पहले से MediKiosk आईडी है?", "Already have a MediKiosk ID?") + "</span>" +
      '<button class="linkbtn" id="signin">' + ICON("lock", 15) + " " +
        L("आईडी और पासवर्ड से आएँ", "Sign in with ID and password") + "</button>" +
    "</div>" +

    '<div class="notice jade" style="margin-top:16px">' + ICON("lock",17) + " " +
      L("आपका नंबर सिर्फ़ पहचान के लिए है। किसी को नहीं दिया जाता।",
        "Your number is used only to identify you. It is never shared or used for marketing.") + "</div>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-m]"); if (!b) return;
    S.method = b.dataset.m; S.error = "";
    go(S.method === "phone" ? "phone" : S.method);
  };
  document.getElementById("signin").onclick = function () {
    S.error = ""; S.loginPw = ""; go("signin");
  };
}

/* ── sign in with the account ─────────────────────── */
function scSignin() {
  body.innerHTML =
    '<span class="eyebrow">' + L("अपना खाता", "Your account") + "</span>" +
    '<h1 class="q">' + L("आईडी और पासवर्ड डालिए", "Sign in to your records") + "</h1>" +
    '<p class="q-en">' + L("आपकी MediKiosk आईडी, ABHA नंबर या मोबाइल नंबर — तीनों चलेंगे",
      "Your MediKiosk ID, your ABHA number or your mobile — any of them works") + "</p>" +
    '<label class="flabel">' + L("आईडी", "ID") + "</label>" +
    '<input class="field mono" id="lid" autocomplete="username" placeholder="MK123456" value="' + esc(S.loginId) + '">' +
    '<label class="flabel" style="margin-top:12px">' + L("पासवर्ड", "Password") + "</label>" +
    '<input class="field" id="lpw" type="password" autocomplete="current-password" value="' + esc(S.loginPw) + '">' +
    (S.error ? '<div class="notice" style="margin-top:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="notice jade" style="margin-top:14px">' + ICON("speaker", 17) + " " +
      L("पासवर्ड भूल गए? कोई बात नहीं — मोबाइल नंबर और कोड से भी आ सकते हैं, आपका रिकॉर्ड वही रहेगा।",
        "Forgotten your password? It does not matter — you can still come in with your mobile number and a code, and your records will be the same.") +
    "</div>";

  foot.innerHTML = '<button class="btn" id="nx">' + L("अंदर आएँ", "Sign in") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("दूसरा तरीक़ा", "Another way") + "</button>";

  var lid = document.getElementById("lid"), lpw = document.getElementById("lpw"), nx = document.getElementById("nx");
  function upd() {
    S.loginId = lid.value; S.loginPw = lpw.value;
    nx.disabled = !S.loginId.trim() || !S.loginPw || S.busy;
  }
  lid.oninput = upd; lpw.oninput = upd; upd();
  lpw.onkeydown = function (e) { if (e.key === "Enter" && !nx.disabled) submit(); };

  async function submit() {
    if (nx.disabled) return;
    S.busy = true; S.error = ""; nx.disabled = true; nx.textContent = L("जाँचा जा रहा है…", "Checking…");
    try {
      var r = await api("/api/patient/login", { loginId: S.loginId, password: S.loginPw });
      S.account = r.patient; S.knownName = r.patient.name || "";
      S.abha = r.patient.abhaNumber || null;
      S.hasAccount = true; S.loginPw = ""; S.busy = false;
      await openDashboard();
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  }
  nx.onclick = submit;
  document.getElementById("bk").onclick = function () { S.error = ""; S.loginPw = ""; go("identify"); };
}

/* ── ABHA number entry ────────────────────────────── */
function scAbha() {
  var v = S.abhaInput;
  var shown = v.replace(/(\d{2})(\d{0,4})(\d{0,4})(\d{0,4})/, function (m, a, b2, c, d) {
    return [a, b2, c, d].filter(Boolean).join("-");
  }) || "—";
  body.innerHTML = steps(1, 8) +
    '<span class="eyebrow">' + L("पहचान", "Identify") + " · ABHA</span>" +
    '<h1 class="q">' + L("अपना ABHA नंबर डालिए", "Enter your ABHA number") + "</h1>" +
    '<p class="q-en">' + L("आयुष्मान भारत हेल्थ अकाउंट · 14 अंक", "Ayushman Bharat Health Account · 14 digits") + "</p>" +
    '<div class="field mono" style="text-align:center;font-size:26px;letter-spacing:.1em">' + shown + "</div>" +
    (S.error ? '<div class="notice" style="margin:12px 0">' + esc(S.error) + "</div>" : "") +
    '<p class="lede" style="margin:12px 0 14px">' +
      L("कोड आपके ABHA से जुड़े मोबाइल पर जाएगा।", "The code goes to the mobile linked to your ABHA.") + "</p>" +
    '<div class="keypad">' + [1,2,3,4,5,6,7,8,9].map(function (d) { return '<button data-k="' + d + '">' + d + "</button>"; }).join("") +
    '<button data-k="del">⌫</button><button data-k="0">0</button><button data-k="ok">✓</button></div>';

  foot.innerHTML = '<button class="btn" id="nx">' + L("आगे बढ़ें", "Continue") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("दूसरा तरीक़ा", "Another way") + "</button>";
  var nx = document.getElementById("nx");
  nx.disabled = v.length !== 14 || S.busy;

  async function submit() {
    if (S.abhaInput.length !== 14 || S.busy) return;
    S.busy = true; S.error = ""; nx.disabled = true; nx.textContent = L("खोजा जा रहा है…", "Looking you up…");
    try {
      var r = await api("/api/identify/abha", { abha: S.abhaInput });
      S.phone = r.phone; S.devCode = r.code || ""; S.live = !!r.live;
      S.maskedPhone = r.maskedPhone; S.knownName = r.name || ""; S.abha = r.abha;
      S.otp = ""; S.busy = false; go("otp");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  }
  body.onclick = function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return;
    var k = b.dataset.k;
    if (k === "del") S.abhaInput = S.abhaInput.slice(0, -1);
    else if (k === "ok") return submit();
    else if (S.abhaInput.length < 14) S.abhaInput += k;
    render();
  };
  nx.onclick = submit;
  document.getElementById("bk").onclick = function () { S.error = ""; go("identify"); };
}

/* ── Aadhaar entry ────────────────────────────────── */
function scAadhaar() {
  body.innerHTML = steps(1, 8) +
    '<span class="eyebrow">' + L("पहचान", "Identify") + " · " + L("आधार", "Aadhaar") + "</span>" +
    '<h1 class="q">' + L("आधार और मोबाइल नंबर", "Aadhaar and mobile number") + "</h1>" +
    '<p class="q-en">' + L("आधार से जुड़ा मोबाइल नंबर डालिए", "Enter the mobile linked to your Aadhaar") + "</p>" +
    '<label class="flabel">' + L("आधार नंबर · 12 अंक", "Aadhaar number · 12 digits") + "</label>" +
    '<input class="field mono" id="aad" inputmode="numeric" maxlength="12" placeholder="············" value="' + esc(S.aadhaarInput) + '">' +
    '<label class="flabel" style="margin-top:12px">' + L("मोबाइल नंबर · 10 अंक", "Mobile number · 10 digits") + "</label>" +
    '<input class="field mono" id="ph" inputmode="numeric" maxlength="10" placeholder="··········" value="' + esc(S.phone) + '">' +
    (S.error ? '<div class="notice" style="margin-top:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="notice jade" style="margin-top:14px">' + ICON("lock",17) + " " +
      L("आपका पूरा आधार नंबर कहीं सेव नहीं होता — सिर्फ़ आख़िरी चार अंक रखे जाते हैं।",
        "Your full Aadhaar number is never stored — only the last four digits are kept.") + "</div>";

  foot.innerHTML = '<button class="btn" id="nx">' + L("कोड भेजें", "Send code") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("दूसरा तरीक़ा", "Another way") + "</button>";

  var aad = document.getElementById("aad"), ph = document.getElementById("ph"), nx = document.getElementById("nx");
  function upd() {
    S.aadhaarInput = aad.value.replace(/\D/g, "");
    S.phone = ph.value.replace(/\D/g, "");
    aad.value = S.aadhaarInput; ph.value = S.phone;
    nx.disabled = S.aadhaarInput.length !== 12 || S.phone.length !== 10 || S.busy;
  }
  aad.oninput = upd; ph.oninput = upd; upd();

  nx.onclick = async function () {
    if (nx.disabled) return;
    S.busy = true; S.error = ""; nx.disabled = true; nx.textContent = L("भेजा जा रहा है…", "Sending…");
    try {
      var r = await api("/api/identify/aadhaar", { aadhaar: S.aadhaarInput, phone: S.phone });
      S.devCode = r.code || ""; S.live = !!r.live; S.maskedPhone = r.maskedPhone;
      S.otp = ""; S.busy = false; go("otp");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  };
  document.getElementById("bk").onclick = function () { S.error = ""; go("identify"); };
}

/* ── new-patient profile ──────────────────────────── */
function scProfile() {
  body.innerHTML = steps(3, 8) +
    '<span class="eyebrow">' + L("आपका परिचय", "About you") + "</span>" +
    '<h1 class="q">' + L("थोड़ा अपने बारे में बताइए", "Tell us a little about you") + "</h1>" +
    '<p class="q-en">' + L("यह डॉक्टर को आपकी जाँच में मदद करता है", "This helps the doctor read your results correctly") + "</p>" +
    '<label class="flabel">' + L("आपका नाम", "Your name") + "</label>" +
    '<input class="field" id="nm" value="' + esc(S.name) + '" placeholder="' + esc(L("जैसे — कमला देवी", "e.g. Kamla Devi")) + '">' +
    '<label class="flabel" style="margin-top:12px">' + L("उम्र", "Age") + "</label>" +
    '<input class="field mono" id="ag" inputmode="numeric" maxlength="3" value="' + esc(S.ageYears) + '" placeholder="62">' +
    '<label class="flabel" style="margin-top:12px">' + L("लिंग", "Sex") + "</label>" +
    '<div class="chips" style="grid-template-columns:1fr 1fr 1fr">' +
      ["F", "M", "O"].map(function (x, i) {
        var lbl = [L("महिला", "Female"), L("पुरुष", "Male"), L("अन्य", "Other")][i];
        return '<button class="chip' + (S.sex === x ? " sel" : "") + '" data-s="' + x + '" style="justify-content:center">' + lbl + "</button>";
      }).join("") + "</div>" +
    (S.error ? '<div class="notice" style="margin-top:12px">' + esc(S.error) + "</div>" : "");

  foot.innerHTML = '<button class="btn" id="nx">' + L("आगे बढ़ें", "Continue") + "</button>";
  var nm = document.getElementById("nm"), ag = document.getElementById("ag"), nx = document.getElementById("nx");
  function upd() {
    S.name = nm.value; S.ageYears = ag.value.replace(/\D/g, ""); ag.value = S.ageYears;
    nx.disabled = !S.name.trim() || !S.ageYears || !S.sex;
  }
  nm.oninput = upd; ag.oninput = upd; upd();
  body.onclick = function (e) {
    var b = e.target.closest("[data-s]"); if (!b) return;
    S.sex = b.dataset.s;
    body.querySelectorAll("[data-s]").forEach(function (n) { n.classList.remove("sel"); });
    b.classList.add("sel"); upd();
  };
  nx.onclick = async function () {
    if (nx.disabled) return;
    S.busy = true; nx.disabled = true; nx.textContent = L("सेव हो रहा है…", "Saving…");
    try {
      await api("/api/patient/profile", {
        name: S.name, ageYears: S.ageYears, sex: S.sex, language: S.lang,
      });
      S.knownName = S.name; S.busy = false; S.consentBack = "account"; go("account");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  };
}

/* ── create the account ───────────────────────────
   Offered at first identification, once the code has already proved the
   phone. It is skippable on purpose: a patient who is unwell, or who simply
   does not want an account, is never held at this screen on the way to a
   doctor. Skipping costs them the dashboard, not the consultation. */
function scAccount() {
  var weak = S.newPw && S.newPw.length < 6;
  var mismatch = S.newPw2 && S.newPw !== S.newPw2;

  body.innerHTML = steps(3, 8) +
    '<span class="eyebrow">' + L("आपका खाता", "Your account") + "</span>" +
    '<h1 class="q">' + (S.hasAccount
      ? L("पासवर्ड बदलिए", "Change your password")
      : L("अपना पासवर्ड बनाइए", "Create a password")) + "</h1>" +
    '<p class="q-en">' + L("ताकि अगली बार आप अपना पूरा रिकॉर्ड ख़ुद देख सकें",
      "So that next time you can open your own records yourself") + "</p>" +

    '<label class="flabel">' + L("पासवर्ड · कम से कम 6 अक्षर", "Password · at least 6 characters") + "</label>" +
    '<input class="field" id="p1" type="password" autocomplete="new-password" value="' + esc(S.newPw) + '">' +
    '<label class="flabel" style="margin-top:12px">' + L("दोबारा डालिए", "Type it again") + "</label>" +
    '<input class="field" id="p2" type="password" autocomplete="new-password" value="' + esc(S.newPw2) + '">' +
    (weak ? '<div class="notice" style="margin-top:10px">' + L("कम से कम 6 अक्षर चाहिए।", "That needs to be at least 6 characters.") + "</div>" : "") +
    (mismatch ? '<div class="notice" style="margin-top:10px">' + L("दोनों पासवर्ड एक जैसे नहीं हैं।", "The two passwords do not match.") + "</div>" : "") +
    (S.error ? '<div class="notice" style="margin-top:10px">' + esc(S.error) + "</div>" : "") +

    '<div class="notice jade" style="margin-top:14px">' + ICON("lock", 17) + " " +
      L("आपकी आईडी SMS से आपके नंबर पर भी भेज दी जाएगी। पासवर्ड किसी को न बताएँ — डॉक्टर या कर्मचारी कभी नहीं पूछेंगे।",
        "Your ID will also be sent to your phone by SMS. Never tell anyone your password — no doctor or staff member will ever ask you for it.") +
    "</div>";

  foot.innerHTML = '<button class="btn" id="nx">' + L("खाता बनाएँ", "Create my account") + "</button>" +
    '<button class="btn ghost" id="sk">' + L("अभी नहीं, आगे बढ़ें", "Not now — continue") + "</button>";

  var p1 = document.getElementById("p1"), p2 = document.getElementById("p2"), nx = document.getElementById("nx");
  function upd() {
    S.newPw = p1.value; S.newPw2 = p2.value;
    nx.disabled = S.newPw.length < 6 || S.newPw !== S.newPw2 || S.busy;
  }
  p1.oninput = function () { S.newPw = p1.value; nx.disabled = S.newPw.length < 6 || S.newPw !== p2.value; };
  p2.oninput = function () { S.newPw2 = p2.value; nx.disabled = S.newPw.length < 6 || S.newPw !== S.newPw2; };
  upd();
  p2.onkeydown = function (e) { if (e.key === "Enter" && !nx.disabled) nx.onclick(); };

  nx.onclick = async function () {
    if (nx.disabled) return;
    S.busy = true; S.error = ""; nx.disabled = true; nx.textContent = L("बनाया जा रहा है…", "Creating…");
    try {
      var r = await api("/api/patient/account", { password: S.newPw });
      S.account = { loginId: r.loginId, name: S.knownName, abhaNumber: r.abhaNumber };
      S.hasAccount = true;
      S.newPw = ""; S.newPw2 = ""; S.busy = false;
      go("accountdone");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  };
  document.getElementById("sk").onclick = function () {
    S.newPw = ""; S.newPw2 = ""; S.error = ""; go("consent");
  };
}

/* The ID has to be seen once, on its own, or it is not really theirs. */
function scAccountDone() {
  var lid = (S.account && S.account.loginId) || "";
  body.innerHTML = '<div style="margin:auto;text-align:center">' +
    '<div class="bigmark ok">' + ICON("check", 46) + "</div>" +
    '<h1 class="q" style="font-size:27px">' + L("खाता बन गया", "Your account is ready") + "</h1>" +
    '<p class="q-en">' + L("यह आपकी आईडी है — इसे लिख लीजिए", "This is your ID — write it down") + "</p>" +
    '<div class="idcard">' +
      '<div class="idlabel">' + L("आपकी आईडी", "YOUR LOGIN ID") + "</div>" +
      '<div class="idval mono">' + esc(lid) + "</div>" +
      (S.abha ? '<div class="idsub mono">ABHA ' + esc(S.abha) + "</div>" : "") +
    "</div>" +
    '<div class="notice jade" style="text-align:left;margin-top:14px">' + ICON("speaker", 17) + " " +
      L("यह आईडी आपके फ़ोन पर SMS से भी भेज दी गई है। अगली बार इसी आईडी और पासवर्ड से अपना पूरा रिकॉर्ड देख सकेंगी।",
        "This ID has also been sent to your phone by SMS. Next time, this ID and your password will open your full record.") +
    "</div></div>";

  foot.innerHTML = '<button class="btn" id="nx">' + L("आगे बढ़ें", "Continue") + "</button>" +
    '<button class="btn ghost" id="dash">' + L("मेरा रिकॉर्ड देखें", "See my records") + "</button>";
  document.getElementById("nx").onclick = function () { S.consentBack = "account"; go("consent"); };
  document.getElementById("dash").onclick = function () { openDashboard(); };
  speak(L("आपका खाता बन गया है।", "Your account is ready."));
}

/* ── the patient's own dashboard ──────────────────
   Named in the architecture table: the place a patient signs in to and finds
   their own visits, their own documents and the summaries written from them.
   Read-only by design — nothing here can be edited after the fact, because a
   record a patient can rewrite is not a record a clinician can trust. */

async function openDashboard() {
  S.busy = true; S.error = "";
  S.screen = "think"; render();
  try {
    S.records = await api("/api/patient/records", null, "GET");
    S.hasAccount = !!S.records.hasAccount;
    S.knownName = (S.records.patient && S.records.patient.name) || S.knownName;
    S.busy = false; go("dash");
  } catch (e) {
    S.error = e.message; S.busy = false; go("identify");
  }
}

function scDash() {
  var r = S.records || { patient: {}, visits: [], documents: [] };
  var p = r.patient || {};
  var visits = r.visits || [];
  var docs = r.documents || [];

  function fmt(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleDateString(window.langMeta(S.lang).date,
      { day: "numeric", month: "short", year: "numeric" });
  }
  function statusBadge(v) {
    if (v.status === "ASSESSED") return '<span class="dbadge jade">' + L("डॉक्टर ने देखा", "Seen by doctor") + "</span>";
    if (v.status === "IN_CONSULT") return '<span class="dbadge haldi">' + L("अभी चल रहा है", "In consultation") + "</span>";
    return '<span class="dbadge grey">' + L("इंतज़ार में", "Waiting") + "</span>";
  }
  function sec(t, v) { return v ? '<div class="dsec"><h5>' + t + "</h5><p>" + esc(v) + "</p></div>" : ""; }

  var head =
    '<div class="dashhead">' +
      '<div class="dashwho"><b>' + esc(p.name || L("आप", "You")) + "</b>" +
        "<span>" + [p.ageYears ? p.ageYears + L(" वर्ष", " yrs") : "", p.sex || ""].filter(Boolean).join(" · ") + "</span></div>" +
      '<div class="dashids mono">' +
        (p.loginId ? "<span>ID " + esc(p.loginId) + "</span>" : "") +
        (p.abhaNumber ? "<span>ABHA " + esc(p.abhaNumber) + "</span>" : "") +
      "</div>" +
    "</div>";

  var stats =
    '<div class="dashstats">' +
      '<div class="dstat"><b>' + visits.length + "</b><span>" + L("विज़िट", "Visits") + "</span></div>" +
      '<div class="dstat"><b>' + docs.length + "</b><span>" + L("काग़ज़ात", "Documents") + "</span></div>" +
      '<div class="dstat"><b>' + visits.filter(function (v) { return v.status === "ASSESSED"; }).length + "</b><span>" +
        L("पूरी हुईं", "Completed") + "</span></div>" +
    "</div>";

  var visitList = visits.length
    ? visits.map(function (v) {
        var open = S.openVisit === v.id;
        var s = v.summary || {};
        return '<div class="visitcard' + (v.redFlag ? " flag" : "") + '">' +
          '<button class="visithead" data-v="' + esc(v.id) + '">' +
            '<span class="vtok mono">' + esc(v.token || "—") + "</span>" +
            '<span class="vmain"><b>' + esc(s.chiefComplaint || L("जानकारी दर्ज की गई", "History recorded")) + "</b>" +
              "<small>" + fmt(v.submittedAt || v.startedAt) + " · " +
              (v.visitType === "FOLLOW_UP" ? L("दोबारा दिखाना", "Follow-up") : L("पहली बार", "First visit")) +
              (v.documents && v.documents.length ? " · " + v.documents.length + L(" काग़ज़", " docs") : "") +
              "</small></span>" +
            statusBadge(v) +
            '<span class="vchev">' + (open ? "▴" : "▾") + "</span>" +
          "</button>" +
          (open
            ? '<div class="visitbody">' +
                (v.diagnosis
                  ? '<div class="dsec dx"><h5>' + L("डॉक्टर का निदान", "Doctor's diagnosis") + "</h5><p>" + esc(v.diagnosis) +
                    (v.icd10 ? ' <span class="code mono">ICD-10 ' + esc(v.icd10) + "</span>" : "") +
                    (v.namaste ? ' <span class="code mono">NAMASTE ' + esc(v.namaste) + "</span>" : "") + "</p></div>"
                  : "") +
                (v.prescription ? sec(L("दवाइयाँ जो लिखी गईं", "What was prescribed"), v.prescription) : "") +
                sec(L("मुख्य तकलीफ़", "Main problem"), s.chiefComplaint) +
                sec(L("विवरण", "The story"), s.narrative) +
                sec(L("पुरानी बीमारियाँ", "Existing conditions"), s.pastHistory) +
                sec(L("दवाइयाँ", "Medicines"), s.medications) +
                sec(L("एलर्जी", "Allergies"), s.allergies) +
                sec(L("पिछली जाँचें", "Prior investigations"), s.priorInvestigations) +
                (v.documents && v.documents.length
                  ? '<div class="dsec"><h5>' + L("इस विज़िट के काग़ज़ात", "Documents from this visit") + "</h5>" +
                    v.documents.map(function (d) {
                      return '<div class="dline">' + dateChip(d) + " <b>" + esc(d.label || "Document") + "</b>" +
                        ((d.extracted && d.extracted.summary) ? " — " + esc(d.extracted.summary) : "") + "</div>";
                    }).join("") + "</div>"
                  : "") +
                '<p class="dnote">' + L("यह रिकॉर्ड सिर्फ़ पढ़ने के लिए है। कुछ ग़लत लगे तो डॉक्टर या कर्मचारी को बताइए।",
                  "This record is read-only. If something looks wrong, tell your doctor or the staff.") + "</p>" +
              "</div>"
            : "") +
        "</div>";
      }).join("")
    : '<p class="dempty">' + L("अभी कोई पुरानी विज़िट नहीं है। आपकी पहली विज़िट यहीं दिखेगी।",
        "No past visits yet. Your first one will appear here.") + "</p>";

  /* One timeline across every visit, oldest first — the same order the doctor
     reads them in. */
  var timeline = docs.length
    ? '<div class="timeline">' + docs.map(function (d) {
        var e = d.extracted || {};
        return '<div class="tlrow' + (d.docDate ? "" : " nodate") + '">' +
          '<div class="tldate">' + dateChip(d) + "</div>" +
          '<div class="tlbody"><b>' + esc(d.label || "Document") + "</b>" +
            (e.summary ? "<p>" + esc(e.summary) + "</p>" : "") +
            (e.abnormal && e.abnormal.length
              ? '<p class="tlabn">' + L("जाँच की सीमा से बाहर: ", "Outside reference range: ") + esc(e.abnormal.join("; ")) + "</p>"
              : "") +
          "</div></div>";
      }).join("") + "</div>"
    : '<p class="dempty">' + L("अभी कोई काग़ज़ स्कैन नहीं हुआ है।", "No documents have been scanned yet.") + "</p>";

  body.innerHTML =
    '<span class="eyebrow">' + L("आपका रिकॉर्ड", "Your records") + "</span>" +
    head + stats +
    (S.error ? '<div class="notice" style="margin-bottom:12px">' + esc(S.error) + "</div>" : "") +
    '<h4 class="dashsec">' + L("पुरानी विज़िट", "Past visits") + "</h4>" + visitList +
    '<h4 class="dashsec">' + L("आपके काग़ज़ात · तारीख़ के क्रम में", "Your documents · in date order") + "</h4>" + timeline +
    (docs.some(function (d) { return !d.docDate; })
      ? '<div class="notice" style="margin-top:10px">' +
        L("जिन काग़ज़ों पर तारीख़ नहीं पढ़ी जा सकी, वे सबसे नीचे हैं और उन पर निशान लगा है।",
          "Documents whose date could not be read are listed last and marked, rather than being placed in the timeline at a guess.") + "</div>"
      : "");

  foot.innerHTML = '<button class="btn" id="new">' + L("नई विज़िट शुरू करें", "Start a new visit") + "</button>" +
    '<button class="btn ghost" id="out">' + L("बाहर निकलें", "Sign out") + "</button>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-v]"); if (!b) return;
    S.openVisit = S.openVisit === b.dataset.v ? null : b.dataset.v;
    render();
  };
  document.getElementById("new").onclick = function () { S.consentBack = "dash"; go("consent"); };
  document.getElementById("out").onclick = async function () {
    try { await api("/api/patient/logout"); } catch (e) {}
    S.records = null; S.account = null; S.knownName = ""; S.abha = null;
    S.loginId = ""; S.openVisit = null;
    go("identify");
  };
}

function scPhone() {
  body.innerHTML = steps(1, 8) +
    '<span class="eyebrow">' + L("पहचान", "Identify") + "</span>" +
    '<h1 class="q">' + L("अपना मोबाइल नंबर डालिए", "Enter your mobile number") + "</h1>" +
    '<div class="field mono" id="ph" style="text-align:center;font-size:30px;letter-spacing:.14em">' + (S.phone || "—") + "</div>" +
    '<p class="lede" style="margin:12px 0 14px">' +
      L("हम इसी नंबर पर आपकी ABHA आईडी भेजेंगे, ताकि आपको याद रखने की ज़रूरत न पड़े।",
        "We send your ABHA ID to this number, so you never have to remember it.") + "</p>" +
    (S.error ? '<div class="notice" style="margin-bottom:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="keypad">' + [1,2,3,4,5,6,7,8,9].map(function (d) { return '<button data-k="' + d + '">' + d + "</button>"; }).join("") +
    '<button data-k="del">⌫</button><button data-k="0">0</button><button data-k="ok">✓</button></div>';

  foot.innerHTML = '<button class="btn" id="nx">' + L("आगे बढ़ें", "Continue") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("दूसरा तरीक़ा", "Another way") + "</button>";
  document.getElementById("bk").onclick = function () { S.error = ""; go("identify"); };
  var nx = document.getElementById("nx");
  var out = document.getElementById("ph");
  function upd() { out.textContent = S.phone || "—"; nx.disabled = S.phone.length !== 10 || S.busy; }
  upd();

  async function submit() {
    if (S.phone.length !== 10 || S.busy) return;
    S.busy = true; S.error = ""; nx.textContent = L("भेजा जा रहा है…", "Sending…"); nx.disabled = true;
    try {
      var r = await api("/api/otp/send", { phone: S.phone });
      S.devCode = r.code || ""; S.live = !!r.live;
      S.maskedPhone = "•••••• " + S.phone.slice(-4);
      S.otp = ""; S.busy = false; go("otp");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  }
  body.onclick = function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return;
    var k = b.dataset.k;
    if (k === "del") S.phone = S.phone.slice(0, -1);
    else if (k === "ok") return submit();
    else if (S.phone.length < 10) S.phone += k;
    upd();
  };
  nx.onclick = submit;
}

function scOtp() {
  body.innerHTML = steps(2, 8) +
    '<span class="eyebrow">' + L("पहचान", "Identify") + "</span>" +
    '<h1 class="q">' + (S.knownName
      ? LX("नमस्ते {}", "Welcome back, {}", S.knownName)
      : L("नंबर की पुष्टि कीजिए", "Confirm your number")) + "</h1>" +
    '<p class="q-en">' + LX("कोड {} पर भेजा गया",
      "Code sent to {}", S.maskedPhone || S.phone) + "</p>" +
    '<div class="otp" id="ot"></div>' +
    (S.devCode ? '<div class="notice" style="margin-top:12px">' +
      L("कोई SMS गेटवे नहीं जुड़ा है, इसलिए कोड यहीं दिख रहा है: ", "No SMS gateway is configured, so your code is shown here: ") +
      '<b class="mono">' + esc(S.devCode) + "</b></div>"
      : '<div class="notice jade" style="margin-top:12px">' + ICON("speaker",17) + " " +
        L("कोड आपके फ़ोन पर SMS से भेजा गया है।", "The code has been sent to your phone by SMS.") + "</div>") +
    (S.error ? '<div class="notice" style="margin-top:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="keypad" style="margin-top:14px">' + [1,2,3,4,5,6,7,8,9].map(function (d) { return '<button data-k="' + d + '">' + d + "</button>"; }).join("") +
    '<button data-k="del">⌫</button><button data-k="0">0</button><button data-k="fill">' + L("भरें", "Fill") + "</button></div>";

  foot.innerHTML = '<button class="btn" id="nx">' + L("पुष्टि करें", "Verify") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("पीछे", "Back") + "</button>";

  var nx = document.getElementById("nx");
  function draw() {
    var h = "";
    for (var i = 0; i < 6; i++) h += '<span class="' + (i === S.otp.length ? "f" : "") + '">' + (S.otp[i] || "") + "</span>";
    document.getElementById("ot").innerHTML = h;
    nx.disabled = S.otp.length !== 6 || S.busy;
  }
  draw();

  async function submit() {
    if (S.otp.length !== 6 || S.busy) return;
    S.busy = true; S.error = ""; nx.textContent = L("जाँचा जा रहा है…", "Checking…"); nx.disabled = true;
    try {
      var r = await api("/api/otp/verify", { phone: S.phone, code: S.otp });
      S.abha = r.abhaJustCreated || (r.patient && r.patient.abhaNumber) || null;
      S.knownName = (r.patient && r.patient.name) || "";
      S.isNew = !!r.abhaJustCreated;
      S.hasAccount = !!r.hasAccount;
      S.account = r.patient && r.patient.loginId ? r.patient : null;
      S.busy = false;
      // A returning patient already has a profile; only a new one is asked.
      // Either way, a patient without an account is offered one here — the
      // code has just proved the phone, which is the right moment to ask.
      if (!S.knownName) { S.consentBack = "account"; return go("profile"); }
      if (!S.hasAccount) { S.consentBack = "account"; return go("account"); }
      S.consentBack = "otp";
      go("consent");
    } catch (e) { S.error = e.message; S.busy = false; render(); }
  }
  body.onclick = function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return;
    var k = b.dataset.k;
    if (k === "del") S.otp = S.otp.slice(0, -1);
    else if (k === "fill") S.otp = S.devCode || "";
    else if (S.otp.length < 6) S.otp += k;
    draw();
  };
  nx.onclick = submit;
  document.getElementById("bk").onclick = function () {
    S.otp = ""; S.error = "";
    go(S.method === "abha" ? "abha" : S.method === "aadhaar" ? "aadhaar" : "phone");
  };
}

function scConsent() {
  body.innerHTML = steps(4, 8) +
    '<span class="eyebrow">' + L("सहमति", "Consent") + " · DPDP Act 2023</span>" +
    '<h1 class="q">' + L("आपकी अनुमति ज़रूरी है", "Your permission, your choice") + "</h1>" +
    '<p class="q-en">' + L("आप कोई भी अनुमति बंद कर सकते हैं, फिर भी डॉक्टर आपको देखेंगे।",
      "You can turn any of these off and still be seen by the doctor.") + "</p>" +
    window.CONSENTS.map(function (c) {
      return '<button class="consent-card' + (S.consent[c.key] ? " on" : "") + '" data-c="' + c.key + '">' +
        '<span class="cic">' + ICON(c.ic, 26) + "</span>" +
        '<span style="flex:1"><b style="font-size:17px;display:block">' + esc(L(c.hi, c.en)) + "</b>" +
        '<small style="font-size:13.5px;color:var(--muted);line-height:1.4;display:block;margin-top:2px">' +
        esc(L(c.dHi, c.dEn)) + "</small></span><span class=\"toggle\"></span></button>";
    }).join("");

  foot.innerHTML = '<button class="btn" id="nx">' + L("मैं सहमत हूँ", "I agree") + "</button>" +
    '<button class="btn ghost" id="bk">← ' + L("पीछे", "Back") + "</button>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-c]"); if (!b) return;
    var k = b.dataset.c;
    S.consent[k] = !S.consent[k];
    b.classList.toggle("on", S.consent[k]);
  };
  document.getElementById("nx").onclick = function () { go("visit"); };
  document.getElementById("bk").onclick = function () {
    // Consent is now reachable from the dashboard and from account setup as
    // well as straight off the code screen, so "back" has to mean the screen
    // they were actually on.
    go(S.consentBack || (S.knownName ? "otp" : "profile"));
  };
}

function scVisit() {
  var opts = [
    ["FIRST", "spark", "हाँ, पहली बार", "Yes, first visit", "पूरी जानकारी · लगभग 4 मिनट", "Full history · about 4 minutes"],
    ["FOLLOW_UP", "restart", "नहीं, दोबारा दिखाने आया हूँ", "No, this is a follow-up", "सिर्फ़ बदलाव · लगभग 1 मिनट", "Only what changed · about 1 minute"],
    ["PROXY", "people", "मैं किसी और के लिए आया हूँ", "I am here for someone else", "परिजन के रूप में जवाब दें", "Answer as their family member"],
    ["EMERGENCY", "alert", "आपात स्थिति", "This is an emergency", "सीधे स्टाफ़ को सूचना", "Alerts triage staff immediately"],
  ];
  body.innerHTML = steps(5, 8) +
    '<span class="eyebrow">' + L("आपकी विज़िट", "Your visit") + "</span>" +
    '<h1 class="q">' + L("आप पहली बार आए हैं?", "Is this your first visit?") + "</h1>" +
    (S.error ? '<div class="notice" style="margin-bottom:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="chips">' + opts.map(function (o, i) {
      return '<button class="chip" data-i="' + i + '">' + ICON(o[1], 26) + '<span>' +
        esc(L(o[2], o[3])) + '<small>' + esc(L(o[4], o[5])) + "</small></span></button>";
    }).join("") + "</div>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-i]"); if (!b || S.busy) return;
    S.visitType = opts[+b.dataset.i][0];
    S.error = "";
    // An emergency is not made to sit through a choice of system first.
    if (S.visitType === "EMERGENCY") return startVisit("AYURVEDIC");
    go("system");
  };
}

/* Creating the visit is deferred until the system of medicine is known, so the
   record carries both from the moment it exists and there is no second write. */
async function startVisit(system) {
  S.busy = true; S.error = ""; S.system = system;
  try {
    var r = await api("/api/visits", {
      visitType: S.visitType, system: system, consent: S.consent,
      // The doctor's summary is written in English, but it has to say which
      // language the patient answered in — a quoted phrase is only the
      // patient's own words if the reader knows what language it is.
      language: S.lang,
    });
    S.visit = r.visit; S.step = 0; S.busy = false;
    go(S.visitType === "EMERGENCY" ? "red" : "q");
  } catch (err) { S.error = err.message; S.busy = false; render(); }
}

/* ── which system of medicine ───────────────────────
   SIH26047 is an AYUSH problem statement, so Ayurvedic is offered first and is
   what a patient who simply taps on gets. Choosing allopathic drops the
   sixteen Ayurvedic questions; it never drops the complaint, the current
   medicines or the allergies. */
function scSystem() {
  body.innerHTML = steps(6, 8) +
    '<span class="eyebrow">' + L("इलाज की पद्धति", "System of medicine") + "</span>" +
    '<h1 class="q">' + L("आप किस पद्धति से इलाज चाहते हैं?", "Which kind of treatment would you like?") + "</h1>" +
    '<p class="q-en">' + L("डॉक्टर इसी के अनुसार आपकी जानकारी देखेंगे।",
      "This decides what we ask you, and how your history reaches the doctor.") + "</p>" +
    (S.error ? '<div class="notice" style="margin-bottom:12px">' + esc(S.error) + "</div>" : "") +
    '<div class="chips">' + window.SYSTEMS.map(function (o, i) {
      return '<button class="chip" data-i="' + i + '">' + ICON(o.ic, 26) + "<span>" +
        esc(L(o.hi, o.en)) + "<small>" + esc(L(o.dHi, o.dEn)) + "</small></span></button>";
    }).join("") + "</div>";

  foot.innerHTML = '<button class="btn ghost" id="bk">← ' + L("पीछे", "Back") + "</button>";

  body.onclick = function (e) {
    var b = e.target.closest("[data-i]"); if (!b || S.busy) return;
    startVisit(window.SYSTEMS[+b.dataset.i].id);
  };
  document.getElementById("bk").onclick = function () { S.error = ""; go("visit"); };
}

var FACES = [["बिल्कुल नहीं","None"],["थोड़ी","Mild"],["ठीक-ठाक","Moderate"],["ज़्यादा","Severe"],["बर्दाश्त नहीं","Unbearable"]];

var ZONES = [
  ["head","सिर","Head",95,26,20,20],["chest","छाती","Chest",95,72,22,18],["abdomen","पेट","Abdomen",95,110,22,20],
  ["lowback","पीठ / कमर","Lower back",95,142,20,14],["lsh","कंधा","Shoulder",60,66,15,14],["rsh","कंधा","Shoulder",130,66,15,14],
  ["larm","हाथ","Arm",48,112,13,22],["rarm","हाथ","Arm",142,112,13,22],["lknee","घुटना","Knee",80,214,15,15],
  ["rknee","घुटना","Knee",110,214,15,15],["lfoot","पैर","Foot",79,270,13,14],["rfoot","पैर","Foot",111,270,13,14],
];

function hasAns(q) {
  if (q.kind === "measure") return !!(S.heightCm && S.weightKg);
  var v = S.answers[q.id];
  var main = q.kind === "multi" ? (v || []).length > 0 : !!v;
  return main || String(S.answers["_other_" + q.id] || "").trim().length > 0;
}

function scQuestion() {
  var qs = questions(), q = qs[S.step];
  if (!q) return go("docs");
  var v = S.answers[q.id];
  var html = journeyRail() +
    '<span class="eyebrow">' +
      // The section name is Sanskrit, so it is transliterated into the reader's
      // script rather than left in Devanagari for a Tamil or Telugu patient.
      (q.ayur ? '<span class="dev">' + esc(SK("दशविध परीक्षा")) + "</span>" + (q.param ? " · " + esc(q.param) : "")
              : sectionLabel(q.section)) +
      " · " + (S.step + 1) + "/" + qs.length + "</span>" +
    '<h1 class="q">' + esc(L(q.hi, q.en)) + "</h1>" +
    (S.lang === "en" ? "" : '<p class="q-en">' + esc(q.en) + "</p>") +
    (q.note ? '<p class="lede" style="font-size:15px;color:var(--jade);margin-top:-6px">' +
      (q.paramHi ? '<b class="dev">' + esc(SK(q.paramHi)) + "</b> · " : "") + esc(L(q.note.hi, q.note.en)) + "</p>" : "");

  if (q.kind === "measure") {
    html += '<div class="measure">' +
      '<div><label class="flabel">' + L("लंबाई (सेंटीमीटर)", "Height (cm)") + "</label>" +
      '<input class="field mono" id="mh" inputmode="numeric" maxlength="3" placeholder="155" value="' + esc(S.heightCm) + '"></div>' +
      '<div><label class="flabel">' + L("वज़न (किलो)", "Weight (kg)") + "</label>" +
      '<input class="field mono" id="mw" inputmode="numeric" maxlength="3" placeholder="62" value="' + esc(S.weightKg) + '"></div>' +
      "</div>" +
      '<p class="lede" style="margin-top:12px">' +
      L("ठीक-ठीक न पता हो तो अंदाज़ा भी चलेगा। बग़ल में मशीन रखी है।",
        "An estimate is fine if you are not sure. There is a scale beside the kiosk.") + "</p>";
  }

  if (q.kind === "bodymap") {
    html += '<div class="bodymap"><svg viewBox="0 0 190 300" role="group" aria-label="' + esc(L("शरीर का नक़्शा","Body map")) + '">' +
      '<ellipse class="figure" cx="95" cy="28" rx="21" ry="24"/>' +
      '<rect class="figure" x="88" y="50" width="14" height="12" rx="5"/>' +
      '<path class="figure" d="M67 64 h56 q10 0 11 10 l4 52 q1 8 -7 8 h-6 l-3 40 h-58 l-3 -40 h-6 q-8 0 -7 -8 l4 -52 q1 -10 11 -10 z"/>' +
      '<path class="figure" d="M64 70 l-14 6 -8 60 q-1 8 7 9 q8 1 10 -7 l12 -48 z"/>' +
      '<path class="figure" d="M126 70 l14 6 8 60 q1 8 -7 9 q-8 1 -10 -7 l-12 -48 z"/>' +
      '<path class="figure" d="M76 176 l-3 62 -3 46 q-1 8 8 8 q8 0 9 -8 l8 -66 l8 66 q1 8 9 8 q9 0 8 -8 l-3 -46 l-3 -62 z"/>' +
      ZONES.map(function (z) {
        var label = L(z[1], z[2]);
        return '<ellipse class="zone' + (v === label ? " sel" : "") + '" data-zone="' + esc(label) + '" cx="' + z[3] +
          '" cy="' + z[4] + '" rx="' + z[5] + '" ry="' + z[6] + '" tabindex="0" role="button"><title>' + esc(label) + "</title></ellipse>";
      }).join("") + "</svg></div>" +
      '<p class="lede" style="text-align:center;margin-top:12px">' +
      (v ? '<b style="color:var(--haldi);font-size:19px">' + esc(v) + "</b>"
         : L("शरीर पर जहाँ तकलीफ़ है, वहाँ छूइए", "Touch the part of the body that troubles you")) + "</p>";
  }

  if (q.kind === "faces") {
    html += '<div class="faces">' + FACES.map(function (f, i) {
      var label = (i + 1) + "/5 " + L(f[0], f[1]);
      return '<button data-face="' + esc(label) + '" class="' + (v === label ? "sel" : "") + '">' + FACE(i, 34) +
        "<small>" + esc(L(f[0], f[1])) + "</small></button>";
    }).join("") + "</div>" +
    '<p class="lede" style="margin-top:14px">' + L("चेहरा छूकर बताइए — गिनती की ज़रूरत नहीं।",
      "Tap the face that matches. No numbers to work out.") + "</p>";
  }

  if (q.kind === "open") {
    html += '<div class="transcript" id="tr">' + (v ? esc(v) : '<span class="ph">' + esc(L(q.phHi, q.phEn)) + "</span>") + "</div>";
    html += VOICE_IN
      ? '<div style="margin:16px 0 6px"><button class="mic" id="mic" aria-label="' + esc(L("बोलिए","Speak your answer")) + '">' + ICON("mic", 34) + '</button>' +
        '<p id="mst" style="text-align:center;font-size:14px;color:var(--muted);margin:8px 0 0">' + L("बोलने के लिए दबाइए","Tap to speak") + "</p></div>"
      : '<div class="notice" style="margin:14px 0">' + L("इस ब्राउज़र में माइक उपलब्ध नहीं — नीचे लिखिए या चुनिए।",
          "Microphone is not available in this browser — type below or choose an option.") + "</div>";
    html += '<input class="field" id="typed" placeholder="' + esc(L("या यहाँ लिखिए","Or type here")) + '" value="' + esc(v || "") + '">';
  }

  if (q.chips && q.chips.length) {
    html += '<p style="font-size:14px;font-weight:700;color:var(--muted);margin:16px 0 8px">' +
      (q.kind === "multi" ? L("जितने चाहें चुनिए", "Choose as many as apply") : L("या नीचे से चुनिए", "Or choose below")) + "</p>";
    html += '<div class="chips">' + q.chips.map(function (c, i) {
      var label = L(c.hi, c.en);
      var sel = q.kind === "multi" ? (v || []).indexOf(label) > -1 : v === label;
      return '<button class="chip' + (sel ? " sel" : "") + '" data-i="' + i + '">' + ICON(c.ic, 26) + esc(label) + "</button>";
    }).join("") + "</div>";
  }

  if (q.kind !== "open") {
    html += '<div class="othbox"><p>' + L("इनमें से कुछ नहीं? अपनी बात अपने शब्दों में कहिए।",
      "None of these? Say it in your own words.") + "</p><div class=\"rowin\">" +
      '<input class="field" id="othtxt" placeholder="' + esc(L("यहाँ लिखिए…","Type here…")) + '" value="' +
      esc(S.answers["_other_" + q.id] || "") + '">' +
      (VOICE_IN ? '<button class="minimic" id="othmic" aria-label="' + esc(L("बोलिए","Speak")) + '">' + ICON("mic", 34) + '</button>' : "") +
      "</div></div>";
  }

  body.innerHTML = html;
  foot.innerHTML = '<button class="btn" id="nx">' + L("आगे", "Next") + " →</button>" +
    '<div class="row"><button class="btn ghost" id="bk">← ' + L("पीछे","Back") + "</button>" +
    '<button class="btn ghost" id="sk">' + L("छोड़ें","Skip") + "</button></div>" +
    (VOICE_IN ? '<p style="text-align:center;font-size:12px;color:var(--muted);margin:0">' +
      esc(window.COMMAND_HINT[S.lang] || window.COMMAND_HINT.en) +
      (canSpeak() ? "" : " · " + L("इस भाषा में बोलकर सुनाना उपलब्ध नहीं है",
        "Spoken prompts are not available in this language on this machine")) + "</p>" : "");

  var nx = document.getElementById("nx");
  function refresh() { nx.disabled = !hasAns(q); }
  refresh();

  body.onclick = function (e) {
    var z = e.target.closest("[data-zone]");
    if (z) {
      S.answers[q.id] = z.dataset.zone; S.answers["_src_" + q.id] = "touch";
      body.querySelectorAll("[data-zone]").forEach(function (n) { n.classList.remove("sel"); });
      z.classList.add("sel");
      var p = body.querySelector(".bodymap + p");
      if (p) p.innerHTML = '<b style="color:var(--haldi);font-size:19px">' + esc(z.dataset.zone) + "</b>";
      return refresh();
    }
    var fbtn = e.target.closest("[data-face]");
    if (fbtn) {
      S.answers[q.id] = fbtn.dataset.face; S.answers["_src_" + q.id] = "touch";
      body.querySelectorAll("[data-face]").forEach(function (n) { n.classList.remove("sel"); });
      fbtn.classList.add("sel");
      return refresh();
    }
    var cb = e.target.closest("[data-i]");
    if (!cb) return;
    var chip = q.chips[+cb.dataset.i], label = L(chip.hi, chip.en);
    if (q.kind === "multi") {
      var arr = Array.isArray(S.answers[q.id]) ? S.answers[q.id].slice() : [];
      var solo = q.chips.filter(function (c) { return c.solo; }).map(function (c) { return L(c.hi, c.en); });
      if (chip.solo) arr = [label];
      else {
        arr = arr.filter(function (x) { return solo.indexOf(x) === -1; });
        var ix = arr.indexOf(label);
        ix > -1 ? arr.splice(ix, 1) : arr.push(label);
      }
      S.answers[q.id] = arr;
      body.querySelectorAll("[data-i]").forEach(function (n, i2) {
        n.classList.toggle("sel", arr.indexOf(L(q.chips[i2].hi, q.chips[i2].en)) > -1);
      });
    } else {
      S.answers[q.id] = label;
      if (chip.dosha) S.answers["_dosha_" + q.id] = chip.dosha;
      body.querySelectorAll("[data-i]").forEach(function (n) { n.classList.remove("sel"); });
      cb.classList.add("sel");
      var t = document.getElementById("typed"); if (t) t.value = label;
      var tr = document.getElementById("tr"); if (tr) tr.textContent = label;
    }
    S.answers["_src_" + q.id] = "touch";
    refresh();
  };

  var mh = document.getElementById("mh"), mw = document.getElementById("mw");
  if (mh && mw) {
    var updM = function () {
      S.heightCm = mh.value.replace(/\D/g, ""); mh.value = S.heightCm;
      S.weightKg = mw.value.replace(/\D/g, ""); mw.value = S.weightKg;
      if (S.heightCm && S.weightKg) {
        S.answers[q.id] = S.heightCm + " cm, " + S.weightKg + " kg";
        S.answers["_src_" + q.id] = "typed";
      }
      refresh();
    };
    mh.oninput = updM; mw.oninput = updM;
  }

  var typed = document.getElementById("typed");
  if (typed) typed.oninput = function () { S.answers[q.id] = typed.value; S.answers["_src_" + q.id] = "typed"; refresh(); };

  var oth = document.getElementById("othtxt");
  if (oth) oth.oninput = function () { S.answers["_other_" + q.id] = oth.value; S.answers["_othersrc_" + q.id] = "typed"; refresh(); };

  var mic = document.getElementById("mic");
  if (mic) mic.onclick = function () {
    var tr = document.getElementById("tr"), st = document.getElementById("mst");
    if (recOn) { stopListen(); mic.classList.remove("live"); st.textContent = L("बोलने के लिए दबाइए","Tap to speak"); return; }
    mic.classList.add("live"); st.textContent = L("सुन रहे हैं…", "Listening…");
    listen(function (t) { tr.textContent = t; }, function (fin) {
      mic.classList.remove("live"); st.textContent = L("बोलने के लिए दबाइए","Tap to speak");
      if (!fin) return;
      // A short utterance that matches a navigation word is treated as a
      // command, not as an answer.
      var cmd = matchCommand(fin);
      if (cmd) { tr.textContent = ""; return runCommand(cmd); }
      S.answers[q.id] = fin; S.answers["_src_" + q.id] = "voice";
      if (typed) typed.value = fin;
      refresh();
    });
  };
  var omic = document.getElementById("othmic");
  if (omic) omic.onclick = function () {
    if (recOn) { stopListen(); omic.classList.remove("live"); return; }
    omic.classList.add("live");
    listen(function (t) { oth.value = t; }, function (fin) {
      omic.classList.remove("live");
      if (!fin) return;
      var cmd = matchCommand(fin);
      if (cmd) { oth.value = ""; return runCommand(cmd); }
      oth.value = fin; S.answers["_other_" + q.id] = fin; S.answers["_othersrc_" + q.id] = "voice"; refresh();
    });
  };

  function runCommand(cmd) {
    if (cmd === "repeat") return speak(L(q.hi, q.en));
    if (cmd === "help") return document.getElementById("btn-help").click();
    if (cmd === "back") return S.step === 0 ? go("system") : (S.step--, go("q"));
    if (cmd === "skip") return S.step + 1 >= qs.length ? go("docs") : (S.step++, go("q"));
    if (cmd === "next") {
      if (!hasAns(q)) return speak(L("पहले जवाब दीजिए।", "Please answer first."));
      return nx.click();
    }
  }

  nx.onclick = function () {
    if (window.isRedFlag(S.answers[q.id]) || window.isRedFlag(S.answers["_other_" + q.id])) { S.visit.redFlag = true; return go("red"); }
    S.step + 1 >= qs.length ? go("docs") : (S.step++, go("q"));
  };
  document.getElementById("bk").onclick = function () { S.step === 0 ? go("system") : (S.step--, go("q")); };
  document.getElementById("sk").onclick = function () { S.step + 1 >= qs.length ? go("docs") : (S.step++, go("q")); };

  if (VOICE_OUT) setTimeout(function () { speak(L(q.hi, q.en)); }, 280);
}

function scRed() {
  body.innerHTML = '<div class="alert">' +
    '<span class="eyebrow" style="color:var(--vermilion)">' + L("तुरंत ध्यान दें","Priority") + "</span>" +
    "<h2>" + L("कृपया अभी स्टाफ़ को बताइए", "Please tell the staff now") + "</h2>" +
    '<p style="font-size:17px;line-height:1.5;margin:0 0 12px">' +
      L("आपने जो बताया है वह तुरंत देखा जाना चाहिए। कर्मचारी को सूचना भेज दी गई है — कृपया यहीं रुकिए।",
        "What you described needs to be seen right away. Triage staff have been alerted — please stay here, someone is coming to you.") + "</p>" +
    '<div style="background:#fff;border-radius:12px;padding:12px 14px">' +
      '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;color:var(--muted)">' + L("प्राथमिकता टोकन","PRIORITY TOKEN") + "</div>" +
      '<div class="mono" style="font-size:42px;font-weight:600;color:var(--vermilion)">' + esc((S.visit && S.visit.token) || "P-01") + "</div></div></div>" +
    '<p class="lede" style="margin-top:18px">' + L("आप बाक़ी जानकारी बाद में भी भर सकते हैं।",
      "You can finish the rest of your history later. The doctor already has this alert.") + "</p>";
  foot.innerHTML = '<button class="btn haldi" id="cont">' + L("बाक़ी जानकारी भरें","Continue with my history") + "</button>" +
    '<button class="btn ghost" id="fin">' + L("अभी रुकें","Wait for staff") + "</button>";
  document.getElementById("cont").onclick = function () {
    var qs = questions(); S.step = Math.min(S.step + 1, qs.length - 1); go("q");
  };
  document.getElementById("fin").onclick = submitInterview;
  speak(L("कृपया अभी स्टाफ़ को बताइए।", "Please tell the staff now."));
}

function scDocs() {
  body.innerHTML = steps(7, 8) +
    '<span class="eyebrow">' + L("पुराने काग़ज़ात","Your documents") + "</span>" +
    '<h1 class="q">' + L("पुरानी रिपोर्ट या पर्ची स्कैन कीजिए", "Scan your old reports and prescriptions") + "</h1>" +
    '<p class="q-en">' + L("एक-एक करके काग़ज़ सीधा रखिए", "Place each paper flat, one at a time") + "</p>" +
    '<div class="docgrid" id="dg"></div>' +
    '<input type="file" id="fi" accept="image/*" capture="environment" multiple hidden>' +
    '<div class="notice" style="margin-top:14px">' +
      L("जो काग़ज़ मशीन नहीं पढ़ पाती, उसकी तस्वीर डॉक्टर को दिखाई जाती है — कुछ भी छूटता नहीं।",
        "Anything the system cannot read is still passed to your doctor as an image — nothing is lost.") + "</div>";
  foot.innerHTML = '<button class="btn" id="nx"></button><button class="btn ghost" id="bk">← ' + L("पीछे","Back") + "</button>";

  var nx = document.getElementById("nx");
  function paint() {
    // Ordered by the date on the paper as each read comes back, not by the
    // order they happened to be held up to the camera.
    document.getElementById("dg").innerHTML = chronological(S.docs).map(function (d) {
      return '<div class="docthumb' + (d.pending || d.docDate ? "" : " nodate") + '">' +
        '<img src="' + d.thumb + '" alt="">' +
        (d.pending ? "" : '<span class="thumbdate">' + (docDay(d) || L("तारीख़ नहीं", "undated")) + "</span>") +
        "<b>" + esc(d.label) + "</b></div>";
    }).join("") + '<button class="adddoc" id="add">' + ICON("camera",24) + L("काग़ज़ जोड़ें","Add paper") + "</button>";
    document.getElementById("add").onclick = function () { document.getElementById("fi").click(); };
    nx.textContent = S.busy ? L("पढ़ा जा रहा है…","Reading…")
      : S.docs.length ? L("आगे बढ़ें","Continue") + " (" + S.docs.length + ")"
      : L("मेरे पास कोई काग़ज़ नहीं","I have no documents");
    nx.disabled = S.busy;
  }
  paint();

  document.getElementById("fi").onchange = function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    files.forEach(function (file) {
      shrink(file, async function (dataUrl) {
        if (!dataUrl) return;
        var entry = { thumb: dataUrl, label: L("पढ़ा जा रहा है…", "Reading…"), pending: true, docDate: null };
        S.docs.push(entry); S.busy = true; paint();
        try {
          var r = await api("/api/visits/" + S.visit.id + "/documents", { dataUrl: dataUrl });
          entry.label = r.document.label;
          entry.id = r.document.id;
          entry.docDate = r.document.docDate || null;   // the date printed on the paper
          entry.dateText = r.document.dateText || null;
        } catch (err) {
          entry.label = L("तस्वीर सेव हुई", "Saved as image");
        }
        entry.pending = false;
        S.busy = false; paint();
      });
    });
  };
  nx.onclick = submitInterview;
  document.getElementById("bk").onclick = function () { S.step = questions().length - 1; go("q"); };
}

async function submitInterview() {
  S.screen = "think"; render();
  var qs = questions();
  var payload = qs.map(function (q) {
    return {
      questionId: q.id, question: q.en,
      answer: S.answers[q.id] || null,
      customAnswer: S.answers["_other_" + q.id] || null,
      source: S.answers["_src_" + q.id] || "touch",
      customSource: S.answers["_othersrc_" + q.id] || "typed",
      dosha: S.answers["_dosha_" + q.id] || null,
    };
  }).filter(function (a) { return a.answer || a.customAnswer; });

  try {
    var r = await api("/api/visits/" + S.visit.id + "/submit", { answers: payload });
    S.summary = r.visit.summary;
    S.visit = r.visit;
    S.notice = r.generated === "offline"
      ? L("AI कुंजी नहीं मिली — बिना AI का सारांश बनाया गया।", "No AI key configured, so a basic summary was assembled.")
      : r.generated === "offline_fallback"
      ? L("AI सारांश नहीं बन पाया — बिना AI का सारांश बनाया गया।", "The AI summary could not be generated, so a basic one was assembled.")
      : "";
    go("review");
  } catch (e) {
    S.error = e.message;
    S.summary = null;
    go("review");
  }
}

function scThink() {
  body.innerHTML = '<div style="margin:auto;text-align:center;padding:30px 0">' +
    '<div class="bigmark">' + ICON("lotus", 54) + '</div>' +
    '<h1 class="q" style="font-size:28px">' + L("आपकी जानकारी तैयार की जा रही है", "Preparing your history for the doctor") + "</h1>" +
    '<div class="thinking" style="justify-content:center;margin-top:18px"><span class="spinner"></span><span>' +
      L("जवाब और रिपोर्ट जोड़ी जा रही हैं…", "Combining your answers and your reports…") + "</span></div></div>";
}

function scReview() {
  var s = S.summary || {};
  function sec(t, v) { return v ? '<div class="summary-sec"><h4>' + t + "</h4><p>" + esc(v) + "</p></div>" : ""; }
  body.innerHTML = '<span class="eyebrow">' + L("जाँच लीजिए","Check this") + "</span>" +
    '<h1 class="q">' + L("क्या यह सही है?", "Is this right?") + "</h1>" +
    '<p class="q-en">' + L("यही जानकारी डॉक्टर पढ़ेंगे। कुछ ग़लत हो तो बदल सकते हैं।",
      "This is what your doctor will read. Change anything that is wrong.") + "</p>" +
    (S.error ? '<div class="notice" style="margin-bottom:12px">' + esc(S.error) + "</div>" : "") +
    (S.notice ? '<div class="notice" style="margin-bottom:12px">' + esc(S.notice) + "</div>" : "") +
    sec(L("मुख्य तकलीफ़","Main problem"), s.chiefComplaint) +
    sec(L("विवरण","Details"), s.hpi) +
    sec(L("पुरानी बीमारियाँ","Existing conditions"), s.pastHistory) +
    sec(L("दवाइयाँ","Medicines"), s.medications) +
    sec(L("एलर्जी","Allergies"), s.allergies) +
    (s.documents && s.documents.length
      ? '<div class="summary-sec"><h4>' + L("काग़ज़ात · तारीख़ के क्रम में","Documents · in date order") + "</h4>" +
        s.documents.map(function (d) {
          return '<p class="docline">' + ICON("document",17) + " " + dateChip(d) +
            " <b>" + esc(d.label) + "</b> — " + esc(d.summary) + "</p>";
        }).join("") +
        (s.documents.some(function (d) { return !d.docDate; })
          ? '<p class="dnote" style="margin-top:8px">' +
            L("जिन काग़ज़ों की तारीख़ नहीं पढ़ी जा सकी वे सबसे नीचे रखे गए हैं।",
              "Papers whose date could not be read are kept at the end.") + "</p>"
          : "") +
        "</div>"
      : "");
  foot.innerHTML = '<button class="btn" id="ok">' + L("हाँ, सही है","Yes, this is right") + "</button>" +
    '<button class="btn ghost" id="ed">' + L("कुछ बदलना है","I need to change something") + "</button>";
  document.getElementById("ok").onclick = function () { go("done"); };
  document.getElementById("ed").onclick = function () { S.step = 0; go("q"); };
  speak(L("कृपया जाँच लीजिए कि यह सही है।", "Please check that this is correct."));
}

/* The token slip.
 *
 * The QR carries an absolute URL to this visit, so the registration desk
 * scans instead of typing a token into a search box — which is the whole
 * point: check-in is where the queue actually stalls.
 *
 * The URL must be reachable from the DESK's device, not from the kiosk's own
 * browser, so it is built from PUBLIC_URL when the deployment sets one and
 * only falls back to this page's origin. A QR that says `localhost` scans
 * perfectly and goes nowhere, which is the worst kind of broken.
 */
function checkinUrl() {
  var base = (S.publicUrl || location.origin).replace(/\/+$/, "");
  var key = (S.visit && (S.visit.checkinCode || S.visit.id)) || "";
  return base + "/c/" + key;
}

function slipHtml(token) {
  var dept = (S.visit && S.visit.departmentLabel) || "";
  var code = (S.visit && S.visit.checkinCode) || "";
  var priority = !!(S.visit && S.visit.redFlag);
  var qr = "";
  try {
    qr = window.QR.svg(checkinUrl(), { size: 150, label: "Check-in code for token " + token });
  } catch (e) {
    qr = "";   // a slip without a QR is still a usable slip
  }
  return '<div class="slip" id="slip">' +
      '<div class="sliphead">' +
        '<span>' + esc(S.hospital || "OPD") + "</span>" +
        '<span class="slipdate">' + esc(new Date().toLocaleDateString(window.langMeta(S.lang).date,
          { day: "numeric", month: "short", year: "numeric" })) + "</span>" +
      "</div>" +
      '<div class="slipbody">' +
        "<div>" +
          '<div class="sliplabel">' + L("आपका टोकन","YOUR TOKEN") + "</div>" +
          '<div class="token' + (priority ? " pri" : "") + '">' + esc(token) + "</div>" +
          (dept ? '<div class="sliplabel" style="margin-top:10px">' + L("विभाग","Department") + "</div>" +
                  '<div class="slipdept">' + esc(dept) + "</div>" : "") +
          (priority ? '<div class="slippri">' + L("प्राथमिकता","Priority") + "</div>" : "") +
        "</div>" +
        (qr ? '<div class="slipqr">' + qr +
          // The same code in characters. A QR smudged by a thermal head is a
          // dead QR; eight characters someone can read out are not.
          (code ? '<div class="slipcode mono">' + esc(code) + "</div>" : "") +
          '<div class="slipscan">' + L("काउंटर पर यह दिखाइए","Show this at the desk") + "</div></div>" : "") +
      "</div>" +
    "</div>";
}

/* Printing puts a copy of the slip at the top of <body> and hides everything
   else, so what comes out of the printer is the slip and nothing around it.
   The clone is removed again afterwards — including when the dialog is
   cancelled, which `afterprint` reports on every browser that matters. */
function printSlip() {
  var slip = document.getElementById("slip");
  if (!slip) return;
  var root = document.createElement("div");
  root.className = "printroot";
  root.appendChild(slip.cloneNode(true));
  document.body.appendChild(root);

  var cleanup = function () {
    if (root.parentNode) root.parentNode.removeChild(root);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  try { window.print(); } catch (e) { /* nothing to do — the slip is on screen */ }
  setTimeout(cleanup, 6000);   // a browser that never fires afterprint
}

function scDone() {
  var token = (S.visit && S.visit.token) || "A-00";
  body.innerHTML = '<div style="margin:auto;text-align:center">' +
    '<div class="bigmark ok">' + ICON("check", 50) + '</div>' +
    '<h1 class="q" style="font-size:30px">' + L("हो गया","All done") + "</h1>" +
    '<p class="q-en">' + L("डॉक्टर के पास आपकी जानकारी पहुँच गई है", "Your history is already on the doctor's screen") + "</p>" +
    slipHtml(token) +
    (S.abha ? '<div class="notice" style="text-align:left">' + ICON("speaker",17) + " " +
      LX("आपकी ABHA आईडी {} — {} पर भेज दी गई है।",
        "Your ABHA ID {} has been sent to {}.", S.abha, S.phone) + "</div>" : "") +
    (S.account && S.account.loginId
      ? '<div class="notice jade" style="text-align:left;margin-top:8px">' + ICON("document",17) + " " +
        LX("आपकी आईडी {} — इससे और अपने पासवर्ड से आप कभी भी अपना पूरा रिकॉर्ड देख सकती हैं।",
          "Your ID is {}. With your password it opens your full record at any time.", S.account.loginId) + "</div>"
      : "") +
    '<div class="notice jade" style="text-align:left;margin-top:8px">' + ICON("lock",17) + " " +
      L("इस स्क्रीन का आपका डेटा मिटा दिया गया है।", "Your session data has been erased from this screen.") + "</div></div>";
  foot.innerHTML = '<button class="btn" id="fin">' + L("समाप्त","Finish") + "</button>" +
    '<button class="btn ghost" id="prn">' + ICON("document", 18) + " " + L("पर्ची छापें","Print slip") + "</button>" +
    (S.hasAccount ? '<button class="btn ghost" id="rec">' + L("मेरा रिकॉर्ड देखें", "See my records") + "</button>" : "");
  document.getElementById("fin").onclick = function () { location.href = "/"; };
  document.getElementById("prn").onclick = printSlip;
  var rec = document.getElementById("rec");
  if (rec) rec.onclick = function () { openDashboard(); };
  speak(LX("हो गया। आपका टोकन {}", "All done. Your token is {}", token));
}

applyLangFont();
setLangPill();
render();

/* The hospital name and the externally reachable base URL, for the token slip.
   Fetched without blocking the first screen — a patient should never wait on a
   config call to choose their language — and the slip is many screens away. */
api("/api/config").then(function (c) {
  S.hospital = c.hospital || "";
  S.publicUrl = c.publicUrl || "";
}).catch(function () { /* the slip falls back to this page's origin */ });
