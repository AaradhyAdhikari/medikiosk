"use strict";
/* MediKiosk — the interview.
 *
 * Edit this file to change what the kiosk asks; the UI renders whatever is here.
 * Every question is answerable by SPEAKING or by TAPPING, and every question
 * also accepts free text, because real complaints do not fit preset boxes.
 *
 * Sections:
 *   CLINICAL     the standard allopathic history (SOCRATES-shaped)
 *   DASHAVIDHA   the ten-fold Ayurvedic examination named in SIH26047
 *   AHARA_VIHARA diet and daily routine
 *   FOLLOW_UP    the short interval history for a repeat visit
 */

/* ─────────────────────────── clinical ─────────────────────────── */

window.CLINICAL = [
  { id: "complaint", kind: "open", section: "complaint",
    hi: "आज आप किस तकलीफ़ के लिए आए हैं?", en: "What brings you in today?",
    phHi: "बोलिए, या नीचे से चुनिए", phEn: "Speak, or choose below",
    chips: [
      { ic: "joint", hi: "जोड़ों / घुटने का दर्द", en: "Joint or knee pain" },
      { ic: "head", hi: "सिर दर्द", en: "Headache" },
      { ic: "stomach", hi: "पेट की समस्या", en: "Stomach problem" },
      { ic: "lungs", hi: "साँस लेने में तकलीफ़", en: "Breathing difficulty" },
      { ic: "fever", hi: "बुख़ार", en: "Fever" },
      { ic: "sleep", hi: "नींद न आना / थकान", en: "Sleep trouble or fatigue" },
      { ic: "skin", hi: "त्वचा की समस्या", en: "Skin problem" },
    ] },

  /* Asked of every complaint, so the wording cannot assume the complaint is
     pain — "where does it hurt" is the wrong question for a rash. */
  { id: "site", kind: "bodymap", section: "complaint",
    hi: "तकलीफ़ कहाँ है? छूकर दिखाइए", en: "Where is the problem? Touch to show us" },

  { id: "severity", kind: "faces", section: "complaint",
    hi: "कितनी तकलीफ़ हो रही है?", en: "How much is it troubling you?" },

  { id: "duration", kind: "chips", section: "complaint",
    hi: "कब से है?", en: "How long has this been going on?",
    chips: [
      { ic: "sun", hi: "आज से", en: "Since today" },
      { ic: "calendar", hi: "कुछ दिनों से", en: "A few days" },
      { ic: "calendarWk", hi: "कुछ हफ़्तों से", en: "A few weeks" },
      { ic: "clock", hi: "कुछ महीनों से", en: "A few months" },
      { ic: "hourglass", hi: "एक साल से ज़्यादा", en: "More than a year" },
    ] },

  { id: "character", kind: "chips", section: "complaint",
    hi: "दर्द कैसा लगता है?", en: "What does it feel like?",
    chips: [
      { ic: "flame", hi: "जलन जैसा", en: "Burning" },
      { ic: "blade", hi: "चुभने जैसा", en: "Stabbing" },
      { ic: "weight", hi: "भारी / सुस्त दर्द", en: "Dull, heavy ache" },
      { ic: "spiral", hi: "मरोड़ जैसा", en: "Cramping" },
      { ic: "pulse", hi: "धड़कने जैसा", en: "Throbbing" },
    ] },

  { id: "aggravating", kind: "multi", section: "complaint",
    hi: "किस से बढ़ता है?", en: "What makes it worse?",
    chips: [
      { ic: "stairs", hi: "सीढ़ी चढ़ने पर", en: "Climbing stairs" },
      { ic: "walk", hi: "चलने पर", en: "Walking" },
      { ic: "sunrise", hi: "सुबह उठते समय", en: "On waking" },
      { ic: "snow", hi: "ठंड में", en: "In cold weather" },
      { ic: "plate", hi: "खाने के बाद", en: "After eating" },
      { ic: "faded", hi: "कुछ ख़ास नहीं", en: "Nothing in particular", solo: true },
    ] },

  { id: "conditions", kind: "multi", section: "history",
    hi: "क्या आपको इनमें से कुछ है?", en: "Do you have any of these?",
    chips: [
      { ic: "blood", hi: "मधुमेह (शुगर)", en: "Diabetes" },
      { ic: "heart", hi: "उच्च रक्तचाप (BP)", en: "High blood pressure" },
      { ic: "lungs", hi: "दमा / अस्थमा", en: "Asthma" },
      { ic: "bone", hi: "गठिया", en: "Arthritis" },
      { ic: "thyroid", hi: "थायरॉइड", en: "Thyroid" },
      { ic: "heart", hi: "दिल की बीमारी", en: "Heart disease" },
      { ic: "ban", hi: "इनमें से कुछ नहीं", en: "None of these", solo: true },
    ] },

  { id: "surgical", kind: "open", section: "history",
    hi: "कभी कोई ऑपरेशन हुआ है?", en: "Have you ever had an operation?",
    phHi: "बोलिए या लिखिए", phEn: "Speak or type",
    chips: [{ ic: "ban", hi: "कभी नहीं", en: "Never" }] },

  { id: "meds", kind: "open", section: "history",
    hi: "आप अभी कौन-सी दवाइयाँ लेते हैं?", en: "What medicines are you taking now?",
    phHi: "बोलिए, या आगे दवा का पत्ता स्कैन कीजिए", phEn: "Speak, or scan the strip in the next step",
    chips: [{ ic: "ban", hi: "कोई दवा नहीं लेता", en: "I take no medicines" }] },

  { id: "allergy", kind: "multi", section: "history",
    hi: "किसी चीज़ से एलर्जी है?", en: "Any allergies?",
    chips: [
      { ic: "pill", hi: "किसी दवा से", en: "A medicine" },
      { ic: "nut", hi: "किसी खाने से", en: "A food" },
      { ic: "dust", hi: "धूल / परागकण", en: "Dust or pollen" },
      { ic: "check", hi: "कोई एलर्जी नहीं", en: "No allergies", solo: true },
    ] },

  { id: "family", kind: "multi", section: "history",
    hi: "घर में किसी को यह बीमारी रही है?", en: "Has anyone in your family had these?",
    chips: [
      { ic: "blood", hi: "शुगर", en: "Diabetes" },
      { ic: "heart", hi: "बी.पी. या दिल की बीमारी", en: "BP or heart disease" },
      { ic: "bone", hi: "जोड़ों की बीमारी", en: "Joint disease" },
      { ic: "ribbon", hi: "कैंसर", en: "Cancer" },
      { ic: "faded", hi: "पता नहीं / किसी को नहीं", en: "Don't know, or nobody", solo: true },
    ] },
];

/* ──────────────────── दशविध परीक्षा · Dashavidha Pariksha ────────────────────
 * The ten-fold examination named in SIH26047. Each parameter is elicited with
 * one plain-language question a patient can actually answer — the clinical
 * interpretation belongs to the vaidya, not to the kiosk.
 * Vaya (age) and Pramana (measurement) are captured as data rather than opinion.
 */

window.DASHAVIDHA = [
  { id: "dv_prakriti", kind: "chips", ayur: true, param: "Prakriti", paramHi: "प्रकृति", section: "ayush",
    hi: "आपका शरीर आमतौर पर कैसा है?", en: "How would you describe your build?",
    note: { hi: "यह आपकी प्रकृति जानने के लिए है", en: "This helps establish your Prakriti — constitution" },
    chips: [
      { ic: "vata", hi: "दुबला-पतला, वज़न नहीं बढ़ता", en: "Thin, hard to gain weight", dosha: "vata" },
      { ic: "flame", hi: "मध्यम, अच्छी मांसपेशियाँ", en: "Medium, good muscle", dosha: "pitta" },
      { ic: "kapha", hi: "भारी, वज़न जल्दी बढ़ता है", en: "Heavy, gains weight easily", dosha: "kapha" },
    ] },

  { id: "dv_vikriti", kind: "chips", ayur: true, param: "Vikriti", paramHi: "विकृति", section: "ayush",
    hi: "अभी आपको सबसे ज़्यादा क्या परेशान करता है?", en: "What troubles you most right now?",
    note: { hi: "यह आपकी अभी की स्थिति — विकृति — के लिए है, प्रकृति से अलग",
            en: "This is your current imbalance (Vikriti), which is different from your constitution" },
    chips: [
      { ic: "vata", hi: "सूखापन, दर्द, अकड़न", en: "Dryness, pain, stiffness", dosha: "vata" },
      { ic: "flame", hi: "जलन, खट्टी डकार, गर्मी", en: "Burning, acidity, heat", dosha: "pitta" },
      { ic: "kapha", hi: "भारीपन, कफ़, सूजन", en: "Heaviness, congestion, swelling", dosha: "kapha" },
    ] },

  { id: "dv_sara", kind: "chips", ayur: true, param: "Sara", paramHi: "सार", section: "ayush",
    hi: "आपकी त्वचा और बाल कैसे हैं?", en: "How are your skin and hair?",
    note: { hi: "यह शरीर के धातु-सार का अंदाज़ा देता है", en: "This indicates Sara — tissue quality" },
    chips: [
      { ic: "vata", hi: "रूखी त्वचा, पतले बाल", en: "Dry skin, thin hair", dosha: "vata" },
      { ic: "sun", hi: "मुलायम त्वचा, बाल जल्दी सफ़ेद", en: "Soft skin, early greying", dosha: "pitta" },
      { ic: "kapha", hi: "चिकनी त्वचा, घने मज़बूत बाल", en: "Smooth skin, thick strong hair", dosha: "kapha" },
    ] },

  { id: "dv_samhanana", kind: "chips", ayur: true, param: "Samhanana", paramHi: "संहनन", section: "ayush",
    hi: "आपका शरीर कितना मज़बूत लगता है?", en: "How solid does your body feel?",
    note: { hi: "यह संहनन — शरीर की बनावट और जुड़ाव — के लिए है", en: "This is Samhanana — compactness of build" },
    chips: [
      { ic: "vata", hi: "जोड़ ढीले, जल्दी थक जाती हूँ", en: "Loose joints, tire easily", dosha: "vata" },
      { ic: "balance", hi: "ठीक-ठाक, न ज़्यादा न कम", en: "Reasonably firm", dosha: "pitta" },
      { ic: "weight", hi: "गठा हुआ, मज़बूत", en: "Well-knit and strong", dosha: "kapha" },
    ] },

  { id: "dv_pramana", kind: "measure", ayur: true, param: "Pramana", paramHi: "प्रमाण", section: "ayush",
    hi: "आपकी लंबाई और वज़न", en: "Your height and weight",
    note: { hi: "प्रमाण — शरीर का माप। अंदाज़ा भी चलेगा।", en: "Pramana — body measurement. An estimate is fine." } },

  { id: "dv_satmya", kind: "chips", ayur: true, param: "Satmya", paramHi: "सात्म्य", section: "ayush",
    hi: "किस तरह का खाना आपको हमेशा से ठीक बैठता है?", en: "What kind of food has always agreed with you?",
    note: { hi: "सात्म्य — जो आपके शरीर को रास आता है", en: "Satmya — what habitually suits you" },
    chips: [
      { ic: "plate", hi: "गरम, चिकना, हल्का खाना", en: "Warm, unctuous, light food", dosha: "vata" },
      { ic: "leaf", hi: "ठंडा, कम मिर्च वाला खाना", en: "Cooling, mildly spiced food", dosha: "pitta" },
      { ic: "pitta", hi: "गरम, तीखा, सूखा खाना", en: "Warm, pungent, dry food", dosha: "kapha" },
      { ic: "plate", hi: "सब कुछ रास आता है", en: "Everything suits me" },
    ] },

  { id: "dv_sattva", kind: "chips", ayur: true, param: "Sattva", paramHi: "सत्त्व", section: "ayush",
    hi: "मुश्किल समय में आपका मन कैसा रहता है?", en: "How do you cope when things get hard?",
    note: { hi: "सत्त्व — मन का बल", en: "Sattva — mental resilience" },
    chips: [
      { ic: "kapha", hi: "जल्दी घबरा जाती हूँ", en: "I worry quickly", dosha: "vata" },
      { ic: "pitta", hi: "चिढ़ जाती हूँ, पर सँभाल लेती हूँ", en: "I get irritable but manage", dosha: "pitta" },
      { ic: "lotus", hi: "शांत रहती हूँ", en: "I stay calm", dosha: "kapha" },
    ] },

  { id: "dv_ahara_shakti", kind: "chips", ayur: true, param: "Ahara Shakti", paramHi: "आहार शक्ति", section: "ayush",
    hi: "भूख कैसी लगती है?", en: "How is your appetite?",
    note: { hi: "आहार शक्ति — कितना खा और पचा पाती हैं", en: "Ahara Shakti — capacity to take and digest food" },
    chips: [
      { ic: "spiral", hi: "कभी तेज़, कभी बिल्कुल नहीं", en: "Irregular — varies a lot", dosha: "vata" },
      { ic: "flame", hi: "बहुत तेज़, देर तक भूखी नहीं रह सकती", en: "Strong — cannot skip meals", dosha: "pitta" },
      { ic: "kapha", hi: "कम भूख, खाना देर से पचता है", en: "Low — digestion is slow", dosha: "kapha" },
    ] },

  { id: "dv_vyayama_shakti", kind: "chips", ayur: true, param: "Vyayama Shakti", paramHi: "व्यायाम शक्ति", section: "ayush",
    hi: "बिना थके कितनी देर चल या काम कर लेती हैं?", en: "How long can you walk or work without tiring?",
    note: { hi: "व्यायाम शक्ति — शारीरिक क्षमता", en: "Vyayama Shakti — capacity for exertion" },
    chips: [
      { ic: "vata", hi: "थोड़ी देर में ही थक जाती हूँ", en: "I tire within a few minutes", dosha: "vata" },
      { ic: "walk", hi: "आधा घंटा आराम से", en: "Half an hour comfortably", dosha: "pitta" },
      { ic: "exercise", hi: "घंटों काम कर लेती हूँ", en: "Hours of work without trouble", dosha: "kapha" },
    ] },

  { id: "dv_vaya", kind: "chips", ayur: true, param: "Vaya", paramHi: "वय", section: "ayush",
    hi: "आपकी उम्र किस पड़ाव में है?", en: "Which stage of life are you in?",
    note: { hi: "वय — आयु का पड़ाव", en: "Vaya — life stage, which changes what is normal" },
    chips: [
      { ic: "leaf", hi: "बचपन / जवानी से पहले (16 तक)", en: "Childhood — up to 16 (Balya)" },
      { ic: "leaf", hi: "जवानी (16 – 60)", en: "Adulthood — 16 to 60 (Madhya)" },
      { ic: "vata", hi: "बुज़ुर्ग (60 से ऊपर)", en: "Older age — over 60 (Vriddha)" },
    ] },
];

/* Agni and Koshtha sit alongside the ten — they are elicited in most
 * Ayurvedic intakes and the physician expects them. */
window.AGNI_KOSHTHA = [
  { id: "agni", kind: "chips", ayur: true, param: "Agni", paramHi: "अग्नि", section: "ayush",
    hi: "खाना पचने में कितना समय लगता है?", en: "How long does your food take to digest?",
    chips: [
      { ic: "spiral", hi: "कभी जल्दी, कभी बहुत देर", en: "Irregular — Vishama Agni", dosha: "vata" },
      { ic: "flame", hi: "जल्दी पच जाता है, फिर भूख", en: "Fast — Tikshna Agni", dosha: "pitta" },
      { ic: "kapha", hi: "देर लगती है, भारी लगता है", en: "Slow, feels heavy — Manda Agni", dosha: "kapha" },
      { ic: "balance", hi: "ठीक समय पर पच जाता है", en: "Regular — Sama Agni" },
    ] },
  { id: "koshtha", kind: "chips", ayur: true, param: "Koshtha", paramHi: "कोष्ठ", section: "ayush",
    hi: "पेट साफ़ होने में कैसा रहता है?", en: "How are your bowels, usually?",
    chips: [
      { ic: "weight", hi: "कब्ज़ रहती है", en: "Tends to constipation — Krura", dosha: "vata" },
      { ic: "kapha", hi: "ढीला रहता है", en: "Tends to be loose — Mridu", dosha: "pitta" },
      { ic: "balance", hi: "ठीक रहता है", en: "Regular — Madhya", dosha: "kapha" },
    ] },
];

/* ─────────────────── आहार-विहार · diet and daily routine ─────────────────── */

window.AHARA_VIHARA = [
  { id: "av_diet", kind: "chips", ayur: true, param: "Ahara", paramHi: "आहार", section: "ayush",
    hi: "आप कैसा खाना खाती हैं?", en: "What kind of food do you eat?",
    chips: [
      { ic: "leaf", hi: "शाकाहारी", en: "Vegetarian" },
      { ic: "meat", hi: "मांसाहारी", en: "Non-vegetarian" },
      { ic: "egg", hi: "अंडा खाती हूँ, मांस नहीं", en: "Eggs but not meat" },
    ] },
  { id: "av_meals", kind: "chips", ayur: true, param: "Ahara", paramHi: "आहार", section: "ayush",
    hi: "खाने का समय तय रहता है?", en: "Are your meal times regular?",
    chips: [
      { ic: "clock", hi: "हाँ, रोज़ एक ही समय", en: "Yes, same time daily" },
      { ic: "spiral", hi: "कभी-कभी बदल जाता है", en: "Sometimes it shifts" },
      { ic: "cross", hi: "कोई तय समय नहीं", en: "No fixed time" },
    ] },
  { id: "av_sleep", kind: "chips", ayur: true, param: "Vihara", paramHi: "विहार", section: "ayush",
    hi: "आपकी नींद कैसी है?", en: "How do you sleep?",
    chips: [
      { ic: "vata", hi: "हल्की नींद, बार-बार खुल जाती है", en: "Light, easily disturbed", dosha: "vata" },
      { ic: "clock", hi: "ठीक-ठाक, रात में गर्मी लगती है", en: "Moderate, feel hot at night", dosha: "pitta" },
      { ic: "kapha", hi: "गहरी और लंबी नींद", en: "Deep and long", dosha: "kapha" },
    ] },
  { id: "av_activity", kind: "chips", ayur: true, param: "Vihara", paramHi: "विहार", section: "ayush",
    hi: "दिन भर में कितना चलना-फिरना होता है?", en: "How much do you move about in a day?",
    chips: [
      { ic: "seated", hi: "ज़्यादातर बैठे-बैठे", en: "Mostly seated" },
      { ic: "walk", hi: "घर का काम, थोड़ा चलना", en: "Housework and some walking" },
      { ic: "exercise", hi: "मेहनत का काम या रोज़ व्यायाम", en: "Physical work or daily exercise" },
    ] },
];

/* ─────────────────────────── follow-up ─────────────────────────── */

window.FOLLOW_UP = [
  { id: "progress", kind: "chips", section: "complaint",
    hi: "पिछली बार की तकलीफ़ अब कैसी है?", en: "How is the problem you came with last time?",
    chips: [
      { ic: "face0", hi: "पहले से बेहतर", en: "Better than before" },
      { ic: "face2", hi: "वैसा ही है", en: "About the same" },
      { ic: "face4", hi: "पहले से ज़्यादा", en: "Worse than before" },
    ] },
  { id: "adherence", kind: "chips", section: "history",
    hi: "क्या आपने दवाइयाँ नियमित लीं?", en: "Did you take the medicines regularly?",
    chips: [
      { ic: "check", hi: "हाँ, रोज़", en: "Yes, every day" },
      { ic: "faded", hi: "कभी-कभी छूट गईं", en: "Missed some days" },
      { ic: "cross", hi: "नहीं ले पाई", en: "No, I could not" },
    ] },
  { id: "sideeffects", kind: "multi", section: "history",
    hi: "दवा से कोई तकलीफ़ हुई?", en: "Any trouble from the medicines?",
    chips: [
      { ic: "stomach", hi: "पेट ख़राब / उल्टी जैसा", en: "Stomach upset or nausea" },
      { ic: "spiral", hi: "चक्कर", en: "Dizziness" },
      { ic: "skin", hi: "खुजली या दाने", en: "Itching or rash" },
      { ic: "check", hi: "कोई तकलीफ़ नहीं", en: "No trouble at all", solo: true },
    ] },
  { id: "newsym", kind: "open", section: "complaint",
    hi: "कोई नई तकलीफ़?", en: "Anything new since then?",
    phHi: "बोलिए या लिखिए", phEn: "Speak or type",
    chips: [{ ic: "check", hi: "कुछ नया नहीं", en: "Nothing new" }] },
];

/* ─────────────────────────── helpers ─────────────────────────── */

/* ── system of medicine ─────────────────────────────
   Asked once, before the interview starts. An AYUSH OPD sees patients who
   want Ayurvedic treatment, patients who want allopathic treatment, and
   patients who want both — and the physician needs to know which before
   reading the history.

   The CLINICAL block is asked in every case. The presenting complaint,
   current medicines and allergies are safety information, not a feature of
   one system: an Ayurvedic physician still needs to know what allopathic
   drugs the patient is on. Only the sixteen Ayurvedic questions vary. */
window.SYSTEMS = [
  { id: "AYURVEDIC", ic: "lotus",
    hi: "आयुर्वेदिक", en: "Ayurvedic",
    dHi: "दशविध परीक्षा सहित · लगभग 4 मिनट", dEn: "Includes Dashavidha Pariksha · about 4 minutes" },
  { id: "ALLOPATHIC", ic: "pill",
    hi: "एलोपैथिक", en: "Allopathic",
    dHi: "सिर्फ़ सामान्य जाँच · लगभग 2 मिनट", dEn: "Standard history only · about 2 minutes" },
  { id: "BOTH", ic: "balance",
    hi: "दोनों", en: "Both",
    dHi: "दोनों पद्धतियाँ · लगभग 4 मिनट", dEn: "Integrative · about 4 minutes" },
];

window.systemMeta = function (id) {
  return window.SYSTEMS.filter(function (s) { return s.id === id; })[0] || window.SYSTEMS[0];
};

// Does this system of medicine want the Ayurvedic examination?
window.wantsAyurveda = function (system) { return system !== "ALLOPATHIC"; };

// The full first-visit interview, in order, for the chosen system of medicine.
/* ──────────────────── complaint-driven branching ────────────────────
 * The bank above was written around a PAIN complaint and used to be served
 * whole to every patient. Someone coming in with acne was asked what the pain
 * felt like ("burning / stabbing / throbbing") and whether it got worse
 * climbing stairs. That is not a cosmetic problem: irrelevant questions cost
 * an OPD patient their patience and teach them the machine is not listening,
 * and the answers they give to get past it are noise in the doctor's summary.
 *
 * SIH26047 Module A asks for questioning that "dynamically branches based on
 * chief complaint and prior answers, mirroring a physician's clinical
 * reasoning". This is the first cut of that: classify the complaint, then ask
 * what a clinician would actually ask about it.
 *
 * Keywords are matched on the complaint text the patient typed or spoke. They
 * are deliberately generous — a false match into the wrong category costs a
 * few odd questions, while a miss drops the patient back to the generic set,
 * which is safe but shallow. When the AI summary is on it can still overrule
 * the categorisation downstream; this decides only what gets ASKED.
 *
 * NOT CLINICALLY REVIEWED. These sets are drafted from standard history-taking
 * structure, not validated by a physician. They need a vaidya's eye before
 * this is used on real patients — same standing caveat as the translations.
 */

window.COMPLAINT_CATEGORIES = [
  { id: "skin", keywords: [
      "acne", "pimple", "rash", "itch", "itching", "skin", "eczema", "boil", "hives",
      "psoriasis", "fungal", "ringworm", "hair fall", "hairfall", "dandruff", "patch",
      "मुँहासे", "मुहासे", "दाने", "खुजली", "त्वचा", "चर्म", "फुंसी", "चकत्ते", "बाल झड़",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "त्वचा", "खाज", "पुरळ", "ચામડી", "ખંજવાળ", "ફોલ્લી", "ਚਮੜੀ", "ਖੁਜਲੀ", "ਧੱਫੜ", "தோல்", "அரிப்பு", "தடிப்பு", "చర్మం", "దురద", "దద్దుర్లు",
    ] },
  { id: "resp", keywords: [
      "cough", "cold", "breath", "breathless", "breathing", "wheez", "asthma", "chest congestion",
      "sputum", "phlegm", "sneez", "throat",
      "खांसी", "खाँसी", "सर्दी", "जुकाम", "ज़ुकाम", "साँस", "सांस", "दमा", "बलगम", "छींक",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "खोकला", "श्वास", "दम", "ઉધરસ", "શ્વાસ", "ਖੰਘ", "ਸਾਹ", "இருமல்", "மூச்சு", "దగ్గు", "ఆయాసం", "శ్వాస",
    ] },
  { id: "gi", keywords: [
      "stomach", "abdomen", "belly", "acidity", "gas", "vomit", "nausea", "loose motion",
      "diarrh", "constipat", "indigestion", "appetite", "ulcer", "piles", "bloat",
      "पेट", "गैस", "अम्ल", "उल्टी", "जी मिचला", "दस्त", "कब्ज", "बदहजमी", "भूख", "बवासीर",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "पोट", "उलटी", "जुलाब", "बद्धकोष्ठता", "પેટ", "ઊલટી", "ઝાડા", "કબજિયાત", "ਪੇਟ", "ਉਲਟੀ", "ਦਸਤ", "ਕਬਜ਼", "வயிறு", "வாந்தி", "வயிற்றுப்போக்கு", "మలబద్ధకం", "కడుపు", "వాంతి", "విరేచనాలు",
    ] },
  { id: "fever", keywords: [
      "fever", "temperature", "chills", "shivering", "malaria", "typhoid", "viral",
      "बुख़ार", "बुखार", "ज्वर", "ठंड लग", "कंपकंपी",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "ताप", "તાવ", "ਬੁਖ਼ਾਰ", "காய்ச்சல்", "జ్వరం",
    ] },
  { id: "cardiac", keywords: [
      "chest pain", "chest tight", "heart", "palpitation", "heart beat", "heartbeat",
      "सीने में दर्द", "छाती में दर्द", "दिल", "धड़कन", "जकड़न",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "छातीत", "धडधड", "છાતી", "ધબકારા", "ਛਾਤੀ", "ਧੜਕਣ", "நெஞ்சு", "இதயம்", "ఛాతీ", "గుండె",
    ] },
  { id: "neuro", keywords: [
      "headache", "head ache", "migraine", "dizzy", "giddy", "vertigo", "faint", "numb",
      "tingling", "weakness one side", "fits", "seizure", "memory",
      "सिर दर्द", "सिरदर्द", "माइग्रेन", "चक्कर", "बेहोश", "सुन्न", "झुनझुनी", "दौरा", "मिर्गी",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "डोकेदुखी", "चक्कर", "માથાનો દુખાવો", "ચક્કર", "ਸਿਰ ਦਰਦ", "ਚੱਕਰ", "தலைவலி", "தலைச்சுற்றல்", "తలనొప్పి", "తల తిరగడం",
    ] },
  { id: "pain", keywords: [
      "pain", "ache", "joint", "knee", "back", "shoulder", "neck", "swelling", "stiff",
      "arthritis", "sprain", "muscle", "cramp", "हड्डी",
      "दर्द", "जोड़", "घुटन", "घुटने", "कमर", "पीठ", "कंधा", "गर्दन", "सूजन", "अकड़", "गठिया", "मांसपेशी",
      // Marathi · Gujarati · Punjabi · Tamil · Telugu — for a complaint typed rather than tapped
      "दुख", "सांधे", "गुडघे", "कंबर", "દુખ", "સાંધા", "ઘૂંટણ", "કમર", "ਦਰਦ", "ਜੋੜ", "ਗੋਡੇ", "ਕਮਰ", "வலி", "மூட்டு", "முழங்கால்", "நொப்பி", "నొప్పి", "కీళ్ళ", "మోకాలు", "నడుము",
    ] },
];

/* Longest keyword wins, so "chest pain" beats a bare "pain" and lands in
   cardiac rather than musculoskeletal. Ties go to whichever scores more hits. */
window.classifyComplaint = function (text) {
  var t = String(text || "").toLowerCase();
  if (!t.trim()) return null;
  var best = null, bestScore = 0;
  for (var i = 0; i < window.COMPLAINT_CATEGORIES.length; i++) {
    var c = window.COMPLAINT_CATEGORIES[i], score = 0;
    for (var k = 0; k < c.keywords.length; k++) {
      var kw = c.keywords[k].toLowerCase();
      if (t.indexOf(kw) > -1) score += kw.length;   // specificity, not count
    }
    if (score > bestScore) { bestScore = score; best = c.id; }
  }
  return best;
};

/* Asked only of complaints where pain is the thing being described. */
window.PAIN_QUESTIONS = ["character", "aggravating"];

window.CATEGORY_QUESTIONS = {
  skin: [
    { id: "sk_itch", kind: "chips", section: "complaint",
      hi: "क्या उसमें खुजली होती है?", en: "Does it itch?",
      chips: [
        { ic: "cross", hi: "नहीं", en: "No" },
        { ic: "faded", hi: "थोड़ी-बहुत", en: "A little" },
        { ic: "flame", hi: "बहुत ज़्यादा", en: "A lot" },
        { ic: "sun", hi: "जलन होती है", en: "It burns rather than itches" },
      ] },
    { id: "sk_look", kind: "multi", section: "complaint",
      hi: "त्वचा कैसी दिख रही है?", en: "What does the skin look like?",
      chips: [
        { ic: "skin", hi: "लाल चकत्ते", en: "Red patches" },
        { ic: "dust", hi: "उभरे हुए दाने", en: "Raised bumps" },
        { ic: "egg", hi: "पस या पानी भरा", en: "Pus or fluid filled" },
        { ic: "snow", hi: "सूखी, पपड़ीदार", en: "Dry and flaking" },
        { ic: "spiral", hi: "गोल चकत्ता", en: "Ring-shaped patch" },
        { ic: "faded", hi: "रंग गहरा/हल्का पड़ा", en: "Skin colour changed" },
      ] },
    { id: "sk_spread", kind: "chips", section: "complaint",
      hi: "क्या यह फैल रहा है?", en: "Is it spreading?",
      chips: [
        { ic: "ban", hi: "एक ही जगह है", en: "Staying in one place" },
        { ic: "arrow", hi: "फैल रहा है", en: "Spreading" },
        { ic: "restart", hi: "आता-जाता रहता है", en: "Comes and goes" },
      ] },
    { id: "sk_trigger", kind: "multi", section: "complaint",
      hi: "इससे पहले कुछ नया किया या लगाया?", en: "Did anything set it off?",
      chips: [
        { ic: "dust", hi: "नया साबुन या क्रीम", en: "New soap or cosmetic" },
        { ic: "plate", hi: "कोई खाना", en: "A particular food" },
        { ic: "pill", hi: "कोई दवा", en: "A medicine" },
        { ic: "sun", hi: "धूप", en: "Sun exposure" },
        { ic: "exercise", hi: "पसीना", en: "Sweating" },
        { ic: "faded", hi: "कुछ ख़ास नहीं", en: "Nothing that I noticed", solo: true },
      ] },
  ],

  resp: [
    { id: "rs_cough", kind: "chips", section: "complaint",
      hi: "खांसी कैसी है?", en: "What is the cough like?",
      chips: [
        { ic: "cross", hi: "खांसी नहीं है", en: "No cough" },
        { ic: "dust", hi: "सूखी खांसी", en: "Dry cough" },
        { ic: "lungs", hi: "बलगम के साथ", en: "With phlegm" },
        { ic: "blood", hi: "खांसी में खून", en: "Blood in the cough" },
      ] },
    { id: "rs_breath", kind: "chips", section: "complaint",
      hi: "साँस फूलती है?", en: "Do you get short of breath?",
      chips: [
        { ic: "cross", hi: "नहीं", en: "No" },
        { ic: "walk", hi: "चलने या काम करने पर", en: "On walking or exertion" },
        { ic: "seated", hi: "आराम करते हुए भी", en: "Even at rest" },
        { ic: "sleep", hi: "रात में लेटने पर", en: "At night when lying down" },
      ] },
    { id: "rs_assoc", kind: "multi", section: "complaint",
      hi: "साथ में और क्या है?", en: "What else is there along with it?",
      chips: [
        { ic: "lungs", hi: "सीने में घरघराहट", en: "Wheezing" },
        { ic: "chest", hi: "सीने में जकड़न", en: "Chest tightness" },
        { ic: "fever", hi: "बुख़ार", en: "Fever" },
        { ic: "head", hi: "गला ख़राब", en: "Sore throat" },
        { ic: "faded", hi: "और कुछ नहीं", en: "Nothing else", solo: true },
      ] },
  ],

  gi: [
    { id: "gi_food", kind: "chips", section: "complaint",
      hi: "खाने से कोई संबंध है?", en: "Is it related to food?",
      chips: [
        { ic: "hourglass", hi: "खाली पेट बढ़ता है", en: "Worse on an empty stomach" },
        { ic: "plate", hi: "खाने के बाद बढ़ता है", en: "Worse after eating" },
        { ic: "faded", hi: "कोई संबंध नहीं", en: "No relation to food" },
      ] },
    { id: "gi_bowel", kind: "multi", section: "complaint",
      hi: "शौच में कोई बदलाव?", en: "Any change in your bowels?",
      chips: [
        { ic: "spiral", hi: "दस्त / पतला", en: "Loose motions" },
        { ic: "ban", hi: "कब्ज़", en: "Constipation" },
        { ic: "blood", hi: "खून आना", en: "Blood" },
        { ic: "check", hi: "सब सामान्य है", en: "Normal", solo: true },
      ] },
    { id: "gi_assoc", kind: "multi", section: "complaint",
      hi: "साथ में और क्या है?", en: "What else is there along with it?",
      chips: [
        { ic: "spiral", hi: "जी मिचलाना", en: "Nausea" },
        { ic: "restart", hi: "उल्टी", en: "Vomiting" },
        { ic: "flame", hi: "सीने में जलन", en: "Burning in the chest" },
        { ic: "weight", hi: "पेट फूलना", en: "Bloating" },
        { ic: "faded", hi: "और कुछ नहीं", en: "Nothing else", solo: true },
      ] },
  ],

  fever: [
    { id: "fv_pattern", kind: "chips", section: "complaint",
      hi: "बुख़ार कैसा रहता है?", en: "What is the fever like?",
      chips: [
        { ic: "clock", hi: "लगातार रहता है", en: "There all the time" },
        { ic: "restart", hi: "आता-जाता है", en: "Comes and goes" },
        { ic: "snow", hi: "ठंड लगकर आता है", en: "Comes with chills" },
        { ic: "sleep", hi: "सिर्फ़ रात में", en: "Mostly at night" },
      ] },
    { id: "fv_assoc", kind: "multi", section: "complaint",
      hi: "बुख़ार के साथ और क्या है?", en: "What else is there with the fever?",
      chips: [
        { ic: "bone", hi: "बदन दर्द", en: "Body ache" },
        { ic: "head", hi: "सिर दर्द", en: "Headache" },
        { ic: "lungs", hi: "खांसी", en: "Cough" },
        { ic: "restart", hi: "उल्टी / दस्त", en: "Vomiting or loose motions" },
        { ic: "skin", hi: "शरीर पर दाने", en: "Rash" },
        { ic: "faded", hi: "और कुछ नहीं", en: "Nothing else", solo: true },
      ] },
  ],

  cardiac: [
    { id: "cd_radiate", kind: "multi", section: "complaint",
      hi: "दर्द कहीं और फैलता है?", en: "Does it spread anywhere?",
      chips: [
        { ic: "arrow", hi: "बाएँ हाथ में", en: "Into the left arm" },
        { ic: "head", hi: "जबड़े या गर्दन में", en: "Into the jaw or neck" },
        { ic: "bone", hi: "पीठ में", en: "Into the back" },
        { ic: "faded", hi: "कहीं नहीं", en: "It stays in one place", solo: true },
      ] },
    { id: "cd_assoc", kind: "multi", section: "complaint",
      hi: "साथ में और क्या हुआ?", en: "What else happened with it?",
      chips: [
        { ic: "sun", hi: "पसीना छूटा", en: "Sweating" },
        { ic: "lungs", hi: "साँस फूली", en: "Breathlessness" },
        { ic: "pulse", hi: "धड़कन तेज़ हुई", en: "Racing heartbeat" },
        { ic: "spiral", hi: "जी मिचलाया", en: "Nausea" },
        { ic: "faded", hi: "और कुछ नहीं", en: "Nothing else", solo: true },
      ] },
  ],

  neuro: [
    { id: "nr_char", kind: "chips", section: "complaint",
      hi: "सिर दर्द कैसा है?", en: "What is the headache like?",
      chips: [
        { ic: "pulse", hi: "धड़कने जैसा", en: "Throbbing" },
        { ic: "weight", hi: "कसा हुआ, पट्टी जैसा", en: "Tight band around the head" },
        { ic: "blade", hi: "एक तरफ़", en: "One side only" },
        { ic: "zoom", hi: "आँखों के पीछे", en: "Behind the eyes" },
      ] },
    { id: "nr_assoc", kind: "multi", section: "complaint",
      hi: "साथ में और क्या है?", en: "What else is there along with it?",
      chips: [
        { ic: "restart", hi: "उल्टी", en: "Vomiting" },
        { ic: "sun", hi: "रोशनी चुभती है", en: "Light hurts the eyes" },
        { ic: "zoom", hi: "धुंधला दिखना", en: "Blurred vision" },
        { ic: "hand", hi: "हाथ-पैर में कमज़ोरी", en: "Weakness in an arm or leg" },
        { ic: "faded", hi: "और कुछ नहीं", en: "Nothing else", solo: true },
      ] },
  ],
};

/* Nothing matched. Ask the two questions that are useful for any complaint
   rather than guessing at a body system. */
window.GENERIC_QUESTIONS = [
  { id: "gn_worse", kind: "open", section: "complaint",
    hi: "किस से बढ़ती है?", en: "What makes it worse?",
    phHi: "बोलिए या लिखिए", phEn: "Speak or type" },
  { id: "gn_better", kind: "open", section: "complaint",
    hi: "किस से आराम मिलता है?", en: "What makes it better?",
    phHi: "बोलिए या लिखिए", phEn: "Speak or type" },
];

window.firstVisitQuestions = function (system, complaintText) {
  var cat = window.classifyComplaint(complaintText);

  /* Pain and chest pain ARE pain, so they keep "what does it feel like" and
     "what makes it worse". Everything else does not, which is where this
     started: an acne patient being asked about climbing stairs. */
  var painish = (cat === "pain" || cat === "cardiac");

  /* A matched category brings its own block. An unmatched complaint gets two
     neutral questions rather than a guess at a body system. "pain" has no
     block of its own because character + aggravating already cover it. */
  var extra = (cat && window.CATEGORY_QUESTIONS[cat]) || (cat ? [] : window.GENERIC_QUESTIONS);

  /* Characterise the complaint before asking where it spreads — the category
     block therefore lands after the pain questions when those are asked. */
  var insertAfter = painish ? "aggravating" : "duration";

  var qs = [];
  for (var i = 0; i < window.CLINICAL.length; i++) {
    var q = window.CLINICAL[i];
    if (window.PAIN_QUESTIONS.indexOf(q.id) > -1 && !painish) continue;
    qs.push(q);
    if (q.id === insertAfter) qs = qs.concat(extra);
  }

  if (window.wantsAyurveda(system)) {
    qs = qs.concat(window.DASHAVIDHA).concat(window.AGNI_KOSHTHA).concat(window.AHARA_VIHARA);
  }
  return qs;
};

// Journey rail sections, in order.
window.SECTIONS = [
  { id: "complaint", hi: "तकलीफ़", en: "Your problem" },
  { id: "history",   hi: "पुरानी बीमारी", en: "Past history" },
  { id: "ayush",     hi: "दशविध परीक्षा", en: "Dashavidha Pariksha", dev: true },
  { id: "documents", hi: "काग़ज़ात", en: "Documents" },
  { id: "review",    hi: "जाँच लें", en: "Check it" },
];

// Words that mean "stop the interview and get a human now". Checked here for
// immediate feedback and again on the server, which is what actually counts.
/* Red flags are decided by a word list, in every language the kiosk offers —
   never by the model, and never only in Hindi. A Tamil-speaking patient who
   types "மார்பு வலி" must raise the same flag as one who types "chest pain".
   The same list exists on the server, and both run: a missed emergency must
   not depend on an API call succeeding, or on which screen it was typed into. */
window.RED_WORDS = [
  // English
  "chest pain", "chest tight", "breathless", "cannot breathe", "can't breathe", "shortness of breath",
  "bleeding", "unconscious", "fainted", "stroke", "paralysis", "seizure", "fits", "convulsion",
  // Hindi
  "सीने में दर्द", "छाती में दर्द", "जकड़न", "साँस", "सांस", "खून", "बेहोश", "लकवा", "दौरा", "मिर्गी",
  // Marathi
  "छातीत दुखणे", "छातीत दुखत", "छातीत कळ", "श्वास", "दम लागतो", "रक्त", "बेशुद्ध", "पक्षाघात", "फेफरे", "झटका",
  // Gujarati
  "છાતીમાં દુખાવો", "છાતીમાં દુખ", "શ્વાસ", "દમ ચઢે", "લોહી", "બેભાન", "લકવો", "તાણ", "ખેંચ",
  // Punjabi
  "ਛਾਤੀ ਵਿੱਚ ਦਰਦ", "ਛਾਤੀ ਦਾ ਦਰਦ", "ਸਾਹ", "ਦਮ ਘੁਟ", "ਖ਼ੂਨ", "ਖੂਨ", "ਬੇਹੋਸ਼", "ਅਧਰੰਗ", "ਲਕਵਾ", "ਦੌਰਾ", "ਮਿਰਗੀ",
  // Tamil
  "மார்பு வலி", "மார்பில் வலி", "மூச்சு", "மூச்சுத் திணறல்", "இரத்தம்", "ரத்தம்", "மயக்கம்",
  "பக்கவாதம்", "வலிப்பு", "சுயநினைவு இல்லை",
  // Telugu
  "ఛాతీ నొప్పి", "ఛాతీలో నొప్పి", "ఊపిరి", "ఊపిరాడటం లేదు", "రక్తం", "స్పృహ తప్ప", "పక్షవాతం",
  "మూర్ఛ", "ఫిట్స్",
];
window.isRedFlag = function (t) {
  if (!t) return false;
  var s = String(Array.isArray(t) ? t.join(" ") : t).toLowerCase();
  return window.RED_WORDS.some(function (w) { return s.indexOf(w.toLowerCase()) > -1; });
};

window.CONSENTS = [
  { key: "record", ic: "mic", hi: "मेरे जवाब रिकॉर्ड करें", en: "Record my answers",
    dHi: "आपकी बात लिखित रूप में डॉक्टर तक पहुँचेगी। आवाज़ सेव नहीं होती।",
    dEn: "Your words become text for the doctor. The audio itself is never stored." },
  { key: "docs", ic: "document", hi: "मेरी पुरानी रिपोर्ट पढ़ें", en: "Read my old reports",
    dHi: "स्कैन की गई रिपोर्ट से दवा और जाँच की जानकारी निकाली जाएगी।",
    dEn: "We read your scanned reports to pull out diagnoses, medicines and test values." },
  { key: "share", ic: "person", hi: "आज के डॉक्टर को दिखाएँ", en: "Share with my doctor today",
    dHi: "सिर्फ़ आज आपको देखने वाले डॉक्टर को दिखेगा।",
    dEn: "Only the doctor seeing you today can open this." },
  { key: "locker", ic: "lock", hi: "मेरे ABHA लॉकर में रखें", en: "Keep in my ABHA health locker",
    dHi: "वैकल्पिक। बाद में किसी भी अस्पताल में काम आएगा।",
    dEn: "Optional. Makes this history available at any future hospital visit." },
];
