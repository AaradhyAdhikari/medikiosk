"use strict";
/* Possible drug interactions, for the physician's attention.

   SIH26047 Module B asks for "potential drug interactions" to be flagged
   alongside abnormal lab values. This is a small, curated, rule-based check —
   not a pharmacology database — over the medicines the kiosk actually sees:
   what the scanned prescriptions say and what the patient reported taking.

   It is deliberately conservative. Every pair here is a well-known,
   textbook-level caution that a clinician would want pointed out in a
   three-minute OPD slot: anticoagulant + NSAID, sulfonylurea + a
   sugar-lowering herb, levothyroxine + Ashwagandha. It says "worth a look",
   never "stop this". Anything it misses is the physician's call, as it
   always was; anything it flags is still the physician's call.

   Names are matched loosely (a stem, a common Indian brand) because the text
   comes from handwriting read by a model, not from a formulary. */

// ── agents ──────────────────────────────────────────────────────────
// id → { cls: pharmacological class, names: things that mean this drug }
const AGENTS = {
  // anticoagulants / antiplatelets
  warfarin:      { cls: "anticoagulant", names: ["warfarin", "warf", "acenocoumarol", "acitrom", "nicoumalone"] },
  doac:          { cls: "anticoagulant", names: ["apixaban", "rivaroxaban", "dabigatran", "edoxaban", "eliquis", "xarelto"] },
  heparin:       { cls: "anticoagulant", names: ["heparin", "enoxaparin", "clexane"] },
  clopidogrel:   { cls: "antiplatelet",  names: ["clopidogrel", "clopilet", "plavix", "clopitab", "prasugrel", "ticagrelor"] },
  aspirin:       { cls: "antiplatelet",  names: ["aspirin", "ecosprin", "asa ", "loprin", "disprin"] },
  // NSAIDs
  nsaid:         { cls: "nsaid", names: ["ibuprofen", "brufen", "diclofenac", "voveran", "voltaren", "aceclofenac", "zerodol",
                                         "naproxen", "naprosyn", "etoricoxib", "etoshine", "nucoxia", "ketorolac", "ketorol",
                                         "indomethacin", "piroxicam", "mefenamic", "meftal", "nimesulide", "nise", "celecoxib"] },
  // renin–angiotensin / diuretics / potassium
  arb_acei:      { cls: "raas", names: ["telmisartan", "telma", "losartan", "losar", "olmesartan", "olmy", "valsartan", "irbesartan",
                                        "candesartan", "enalapril", "ramipril", "lisinopril", "perindopril", "cardace", "envas"] },
  k_sparing:     { cls: "k_sparing", names: ["spironolactone", "aldactone", "eplerenone", "amiloride", "triamterene"] },
  potassium:     { cls: "potassium", names: ["potassium chloride", "kcl", "potklor", "k-bind"] },
  loop_thiazide: { cls: "diuretic", names: ["furosemide", "lasix", "frusemide", "torsemide", "dytor", "hydrochlorothiazide", "hctz",
                                            "chlorthalidone", "indapamide", "metolazone"] },
  // glucose
  sulfonylurea:  { cls: "hypoglycaemic", names: ["glimepiride", "amaryl", "gliclazide", "diamicron", "glibenclamide", "daonil",
                                                 "glipizide", "glynase"] },
  insulin:       { cls: "hypoglycaemic", names: ["insulin", "mixtard", "lantus", "glargine", "novomix", "huminsulin", "actrapid"] },
  metformin:     { cls: "metformin", names: ["metformin", "glycomet", "glucophage", "obimet"] },
  // thyroid
  levothyroxine: { cls: "thyroid", names: ["levothyroxine", "thyroxine", "thyronorm", "eltroxin", "thyrox"] },
  // cardiac
  digoxin:       { cls: "digoxin", names: ["digoxin", "lanoxin"] },
  beta_blocker:  { cls: "antihypertensive", names: ["atenolol", "metoprolol", "propranolol", "bisoprolol", "carvedilol", "nebivolol"] },
  ccb:           { cls: "antihypertensive", names: ["amlodipine", "amlo", "stamlo", "nifedipine", "cilnidipine"] },
  // CNS
  benzo_hypnotic:{ cls: "sedative", names: ["alprazolam", "alprax", "restyl", "clonazepam", "clonotril", "lonazep", "diazepam",
                                            "lorazepam", "ativan", "zolpidem", "zolfresh", "nitrazepam"] },
  ssri:          { cls: "ssri", names: ["sertraline", "zoloft", "escitalopram", "nexito", "fluoxetine", "prodep", "paroxetine",
                                        "citalopram", "fluvoxamine"] },
  tramadol:      { cls: "opioid_serotonergic", names: ["tramadol", "ultracet", "tramacet"] },
  // antimicrobials
  quinolone:     { cls: "chelated_abx", names: ["ciprofloxacin", "ciplox", "cifran", "levofloxacin", "levoflox", "ofloxacin",
                                                "oflox", "moxifloxacin", "norfloxacin"] },
  tetracycline:  { cls: "chelated_abx", names: ["doxycycline", "doxy", "minocycline", "tetracycline"] },
  macrolide:     { cls: "cyp3a4_inhibitor", names: ["clarithromycin", "claribid", "erythromycin"] },
  azole:         { cls: "cyp_inhibitor", names: ["fluconazole", "forcan", "ketoconazole", "itraconazole", "voriconazole"] },
  metronidazole: { cls: "metronidazole", names: ["metronidazole", "flagyl", "metrogyl", "tinidazole"] },
  // others
  statin:        { cls: "statin", names: ["atorvastatin", "atorva", "lipitor", "rosuvastatin", "rosuvas", "simvastatin", "simvotin"] },
  ppi:           { cls: "ppi", names: ["omeprazole", "omez", "esomeprazole", "nexpro", "pantoprazole", "pan 40", "pantop",
                                       "rabeprazole", "razo", "lansoprazole"] },
  methotrexate:  { cls: "methotrexate", names: ["methotrexate", "folitrax", "mtx"] },
  iron_calcium:  { cls: "mineral", names: ["ferrous", "iron", "calcium", "shelcal", "calcium carbonate", "ccm", "orofer",
                                           "livogen", "autrin"] },
  // antibiotics that matter for allergy, not (here) for interactions
  penicillin:    { cls: "penicillin", names: ["amoxicillin", "amoxycillin", "amoxyclav", "augmentin", "moxikind", "mox ",
                                              "ampicillin", "cloxacillin", "penicillin", "piperacillin", "clavam"] },
  cephalosporin: { cls: "cephalosporin", names: ["cefixime", "taxim", "ceftriaxone", "monocef", "cefuroxime", "ceftum",
                                                 "cephalexin", "cefalexin", "cefpodoxime", "cefadroxil", "cefoperazone"] },
  sulfonamide:   { cls: "sulfonamide", names: ["cotrimoxazole", "co-trimoxazole", "septran", "bactrim", "sulfamethoxazole"] },
  azithromycin:  { cls: "macrolide_azithro", names: ["azithromycin", "azithral", "azee", "azax"] },
  // common OPD medicines with no rule here — listed so they read as
  // "recognised, nothing flagged" rather than "not checked at all"
  antihistamine: { cls: "antihistamine", names: ["cetirizine", "levocetirizine", "levocet", "fexofenadine", "allegra",
                                                 "chlorpheniramine", "avil", "loratadine"] },
  montelukast:   { cls: "leukotriene", names: ["montelukast", "montair", "romilast"] },
  salbutamol:    { cls: "bronchodilator", names: ["salbutamol", "asthalin", "levosalbutamol", "budesonide", "formoterol", "foracort"] },
  antiemetic:    { cls: "antiemetic", names: ["ondansetron", "emeset", "vomikind", "domperidone", "domstal"] },
  vitamin:       { cls: "vitamin", names: ["vitamin d", "cholecalciferol", "uprise", "calcirol", "b12", "methylcobalamin",
                                           "mecobalamin", "folic acid", "multivitamin", "becosules"] },
  ors:           { cls: "ors", names: ["ors", "electral", "oral rehydration"] },
  antacid:       { cls: "antacid", names: ["antacid", "gelusil", "digene", "mucaine", "eno ", "magnesium hydroxide", "aluminium hydroxide"] },
  paracetamol:   { cls: "paracetamol", names: ["paracetamol", "acetaminophen", "dolo", "crocin", "calpol", "pcm"] },

  // ── Ayurvedic / herbal agents with documented pharmacological effects ──
  guggulu:       { cls: "ayur_antiplatelet", names: ["guggul", "guggulu", "yograj", "kaishore", "triphala guggul", "commiphora"] },
  garlic:        { cls: "ayur_antiplatelet", names: ["lashun", "lasun", "lahsun", "garlic", "allium sativum", "lashunadi"] },
  turmeric_hi:   { cls: "ayur_antiplatelet", names: ["haridra khand", "curcumin", "haridra"] },
  ashwagandha:   { cls: "ayur_thyroid_sedative", names: ["ashwagandha", "ashvagandha", "withania", "ashwagandharishta"] },
  brahmi:        { cls: "ayur_sedative", names: ["brahmi", "bacopa", "brahmi vati", "saraswatarishta", "jatamansi", "tagara", "sarpagandha"] },
  yashtimadhu:   { cls: "ayur_licorice", names: ["yashtimadhu", "yasthimadhu", "mulethi", "licorice", "liquorice", "glycyrrhiza"] },
  arjuna:        { cls: "ayur_cardiac", names: ["arjuna", "arjunarishta", "arjun"] },
  sarpagandha:   { cls: "ayur_reserpine", names: ["sarpagandha", "rauwolfia", "reserpine"] },
  hypoglycaemic_herb: { cls: "ayur_hypoglycaemic", names: ["gudmar", "gymnema", "madhunashini", "jamun", "jambu", "karela",
                                                           "bitter gourd", "methi", "fenugreek", "vijaysar", "pterocarpus",
                                                           "nisha amalaki", "chandraprabha", "diabecon", "bgr-34"] },
  bhasma:        { cls: "mineral", names: ["bhasma", "praval", "mukta", "shankha", "godanti", "kamdudha", "sutshekhar",
                                           "swarna", "loha", "mandur", "abhrak"] },
};

// ── rules ───────────────────────────────────────────────────────────
// Each rule names two sides, by agent id or by class ("cls:…"), a severity,
// and what a physician would want to hear in one line.
const RULES = [
  { a: "cls:anticoagulant", b: "cls:nsaid", sev: "high",
    note: "Anticoagulant with an NSAID — bleeding risk, especially GI. Consider paracetamol or a topical instead." },
  { a: "cls:anticoagulant", b: "cls:antiplatelet", sev: "high",
    note: "Anticoagulant with an antiplatelet — additive bleeding risk; check whether both are intended." },
  { a: "cls:antiplatelet", b: "cls:nsaid", sev: "moderate",
    note: "Antiplatelet with an NSAID — GI bleeding risk rises; ibuprofen can also blunt aspirin's effect." },
  { a: "cls:anticoagulant", b: "cls:ayur_antiplatelet", sev: "moderate",
    note: "Anticoagulant with Guggulu / garlic / high-dose Haridra — these have antiplatelet activity; bleeding risk and INR may shift." },
  { a: "cls:antiplatelet", b: "cls:ayur_antiplatelet", sev: "low",
    note: "Antiplatelet with Guggulu / garlic / Haridra preparations — additive antiplatelet effect; worth knowing before any procedure." },
  { a: "warfarin", b: "cls:cyp_inhibitor", sev: "high",
    note: "Warfarin with an azole antifungal — INR can rise sharply within days." },
  { a: "warfarin", b: "metronidazole", sev: "high",
    note: "Warfarin with metronidazole — potentiated anticoagulation; INR needs watching." },

  { a: "cls:raas", b: "cls:k_sparing", sev: "high",
    note: "ARB/ACE inhibitor with a potassium-sparing diuretic — hyperkalaemia risk; check potassium." },
  { a: "cls:raas", b: "potassium", sev: "high",
    note: "ARB/ACE inhibitor with potassium supplement — hyperkalaemia risk." },
  { a: "cls:raas", b: "cls:nsaid", sev: "moderate",
    note: "ARB/ACE inhibitor with an NSAID — reduced renal perfusion; with a diuretic as well this is the 'triple whammy'." },
  { a: "cls:diuretic", b: "cls:nsaid", sev: "moderate",
    note: "Diuretic with an NSAID — NSAID blunts the diuretic and strains the kidney." },
  { a: "cls:diuretic", b: "digoxin", sev: "moderate",
    note: "Loop/thiazide diuretic with digoxin — hypokalaemia raises digoxin toxicity risk." },
  { a: "cls:antihypertensive", b: "cls:ayur_cardiac", sev: "moderate",
    note: "Antihypertensive with Arjuna — additive blood-pressure lowering; watch for dizziness." },
  { a: "cls:raas", b: "cls:ayur_cardiac", sev: "moderate",
    note: "Antihypertensive with Arjuna — additive blood-pressure lowering; watch for dizziness." },
  { a: "cls:antihypertensive", b: "cls:ayur_reserpine", sev: "high",
    note: "Antihypertensive with Sarpagandha (reserpine) — marked additive hypotension and bradycardia." },
  { a: "cls:raas", b: "cls:ayur_reserpine", sev: "high",
    note: "Antihypertensive with Sarpagandha (reserpine) — marked additive hypotension." },
  { a: "cls:ayur_licorice", b: "cls:antihypertensive", sev: "moderate",
    note: "Yashtimadhu (licorice) raises blood pressure and lowers potassium — works against the antihypertensive." },
  { a: "cls:ayur_licorice", b: "cls:raas", sev: "moderate",
    note: "Yashtimadhu (licorice) raises blood pressure and lowers potassium — works against the antihypertensive." },
  { a: "cls:ayur_licorice", b: "cls:diuretic", sev: "high",
    note: "Yashtimadhu (licorice) with a diuretic — additive potassium loss." },
  { a: "cls:ayur_licorice", b: "digoxin", sev: "high",
    note: "Yashtimadhu (licorice) with digoxin — hypokalaemia increases digoxin toxicity." },

  { a: "cls:hypoglycaemic", b: "cls:ayur_hypoglycaemic", sev: "moderate",
    note: "Sulfonylurea/insulin with a sugar-lowering herb (Gudmar, Jamun, Karela, Methi…) — additive effect; hypoglycaemia possible. Monitor sugars." },
  { a: "metformin", b: "cls:ayur_hypoglycaemic", sev: "low",
    note: "Metformin with a sugar-lowering herb — additive effect is usually modest, but sugars should be checked if doses change." },

  { a: "levothyroxine", b: "cls:ayur_thyroid_sedative", sev: "moderate",
    note: "Levothyroxine with Ashwagandha — Ashwagandha can raise thyroid hormone levels; recheck TSH if symptoms change." },
  { a: "levothyroxine", b: "cls:mineral", sev: "low",
    note: "Levothyroxine with iron/calcium/bhasma — absorption falls; separate the doses by 4 hours." },

  { a: "cls:sedative", b: "cls:ayur_thyroid_sedative", sev: "moderate",
    note: "Benzodiazepine/hypnotic with Ashwagandha — additive sedation." },
  { a: "cls:sedative", b: "cls:ayur_sedative", sev: "moderate",
    note: "Benzodiazepine/hypnotic with Brahmi / Jatamansi / Tagara / Sarpagandha — additive sedation." },
  { a: "cls:ssri", b: "cls:opioid_serotonergic", sev: "high",
    note: "SSRI with tramadol — serotonin syndrome and lowered seizure threshold." },

  { a: "cls:chelated_abx", b: "cls:mineral", sev: "moderate",
    note: "Quinolone/tetracycline with iron, calcium or a bhasma — the mineral binds the antibiotic; separate by 2–4 hours." },
  { a: "cls:cyp3a4_inhibitor", b: "statin", sev: "moderate",
    note: "Clarithromycin/erythromycin with a statin — muscle toxicity risk; consider pausing the statin for the course." },
  { a: "clopidogrel", b: "ppi", sev: "low",
    note: "Clopidogrel with omeprazole/esomeprazole — reduced antiplatelet effect; pantoprazole is the usual alternative." },
  { a: "methotrexate", b: "cls:nsaid", sev: "high",
    note: "Methotrexate with an NSAID — reduced methotrexate clearance; toxicity risk." },
];

// ── matching ────────────────────────────────────────────────────────
function findAgents(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ") + " ";
  const found = [];
  for (const [id, a] of Object.entries(AGENTS)) {
    for (const n of a.names) {
      const needle = n.toLowerCase();
      const i = t.indexOf(needle);
      if (i < 0) continue;
      // Stems like "amlo" must start a word so "amlodipine" matches once and
      // "hamlo" does not. Brands with a trailing space ("asa ") are exact.
      const before = t[i - 1];
      if (before && /[\p{L}]/u.test(before)) continue;
      found.push({ id, cls: a.cls, matched: n.trim() });
      break;
    }
  }
  return found;
}

const sideMatches = (side, agent) =>
  side.startsWith("cls:") ? agent.cls === side.slice(4) : agent.id === side;

/* sources: [{ label, text }] — each a place medicines were seen: a scanned
   document ("Prescription · 02 Sep 2026") or the intake answers. Returns
   the interactions found, each naming what matched and where. */
function checkInteractions(sources) {
  const seen = new Map();   // agent id -> { agent, where: Set(label) }
  for (const src of sources || []) {
    for (const ag of findAgents(src.text)) {
      if (!seen.has(ag.id)) seen.set(ag.id, { agent: ag, names: new Set(), where: new Set() });
      seen.get(ag.id).names.add(ag.matched);
      seen.get(ag.id).where.add(src.label);
    }
  }
  const agents = [...seen.values()];
  const out = [];
  const dedupe = new Set();
  for (const r of RULES) {
    for (const x of agents) {
      if (!sideMatches(r.a, x.agent)) continue;
      for (const y of agents) {
        if (x === y || !sideMatches(r.b, y.agent)) continue;
        const key = [x.agent.id, y.agent.id].sort().join("|");
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        out.push({
          severity: r.sev,
          // Every spelling seen — "zerodol / diclofenac" when the paper says one
          // and today's prescription the other.
          a: { id: x.agent.id, matched: [...x.names].join(" / "), where: [...x.where] },
          b: { id: y.agent.id, matched: [...y.names].join(" / "), where: [...y.where] },
          note: r.note,
        });
      }
    }
  }
  const rank = { high: 0, moderate: 1, low: 2 };
  out.sort((p, q) => rank[p.severity] - rank[q.severity]);
  return out;
}

// ── prescription safety ─────────────────────────────────────────────
/* Beyond pairs of drugs: is the patient allergic to something on the
   prescription, is the same thing prescribed twice, and does anything sit
   badly with a condition on record. Same spirit as the pairs above: a short
   list of textbook cautions, worded as "check this", with the source of each
   fact shown so the physician can judge how far to trust it. It also says
   plainly which lines it could not recognise — silence about a drug the
   checker does not know must never read as "safe". */

const NONE_RE = /^\s*(no|nil|none|nkda|nkda\.?|not known|no known( drug)? allergies?|nothing)\b/i;

// Allergy words → what they rule out. Class-level, because a patient says
// "penicillin" and the prescription says "Augmentin".
const ALLERGY_TERMS = [
  { re: /penicillin|amoxi|augmentin|ampicillin|clavam/i, cls: "penicillin", label: "penicillin" },
  { re: /sul(f|ph)a|sulfonamide|septran|bactrim|cotrimoxazole/i, cls: "sulfonamide", label: "sulfa drugs" },
  { re: /cephalosporin|\bcef/i, cls: "cephalosporin", label: "cephalosporins" },
  { re: /nsaid|pain ?killer|ibuprofen|diclofenac|brufen|voveran/i, cls: "nsaid", label: "NSAIDs" },
  { re: /aspirin|ecosprin|disprin/i, id: "aspirin", label: "aspirin" },
  { re: /quinolone|ciprofloxacin|ofloxacin|levofloxacin/i, cls: "chelated_abx", label: "quinolones" },
];
// Cross-reactions worth a mention, weaker than a direct match.
const CROSS = [
  { allergy: "penicillin", cls: "cephalosporin", sev: "low",
    note: "Penicillin allergy with a cephalosporin — cross-reactivity is low (about 1–2%) but real for a history of anaphylaxis." },
  { allergy: "aspirin", cls: "nsaid", sev: "moderate",
    note: "Aspirin sensitivity with an NSAID — cross-sensitivity is common, especially with asthma or nasal polyps." },
  { allergy: "nsaid", id: "aspirin", sev: "moderate",
    note: "NSAID allergy with aspirin — cross-sensitivity is common." },
];

// Same thing twice. Same agent always counts; these classes count across agents.
const DUP_CLASSES = { anticoagulant: 1, nsaid: 1, raas: 1, ppi: 1, statin: 1, sedative: 1, ssri: 1, penicillin: 1, cephalosporin: 1 };

// Drug (or class) against a condition on record.
const CONTRA = [
  { drug: "cls:nsaid", cond: /\b(ckd|kidney|renal)\b/i, condLabel: "kidney disease", sev: "high",
    note: "NSAID with kidney disease — risk of further decline in kidney function." },
  { drug: "cls:nsaid", cond: /ulcer|gi bleed|gastro.?intestinal bleed|haematemesis|melena|malena/i, condLabel: "peptic ulcer / GI bleed", sev: "high",
    note: "NSAID with a history of ulcer or GI bleeding — high rebleed risk; cover with a PPI or avoid." },
  { drug: "cls:nsaid", cond: /heart failure|\bccf\b|\bhf\b/i, condLabel: "heart failure", sev: "moderate",
    note: "NSAID with heart failure — fluid retention and decompensation." },
  { drug: "metformin", cond: /\b(ckd|kidney failure|renal failure|dialysis)\b|egfr\s*<\s*30/i, condLabel: "advanced kidney disease", sev: "moderate",
    note: "Metformin with advanced kidney disease — check eGFR; contraindicated below 30." },
  { drug: "beta_blocker", cond: /asthma/i, condLabel: "asthma", sev: "high",
    note: "Beta-blocker with asthma — can trigger bronchospasm; non-selective ones especially." },
  { drug: "cls:raas", cond: /pregnan|garbh/i, condLabel: "pregnancy", sev: "high",
    note: "ACE inhibitor / ARB in pregnancy — fetotoxic; contraindicated." },
  { drug: "statin", cond: /pregnan|garbh/i, condLabel: "pregnancy", sev: "high",
    note: "Statin in pregnancy — contraindicated." },
  { drug: "warfarin", cond: /pregnan|garbh/i, condLabel: "pregnancy", sev: "high",
    note: "Warfarin in pregnancy — teratogenic in the first trimester." },
  { drug: "cls:chelated_abx", cond: /pregnan|garbh/i, condLabel: "pregnancy", sev: "high",
    note: "Quinolone / tetracycline in pregnancy — generally avoided." },
  { drug: "cls:sedative", cond: /copd|sleep apn/i, condLabel: "COPD / sleep apnoea", sev: "moderate",
    note: "Benzodiazepine with COPD or sleep apnoea — respiratory depression." },
  { drug: "tramadol", cond: /epilep|seizure|fits/i, condLabel: "epilepsy", sev: "moderate",
    note: "Tramadol with epilepsy — lowers the seizure threshold." },
  { drug: "cls:hypoglycaemic", cond: /\b(ckd|kidney failure|renal failure)\b/i, condLabel: "kidney disease", sev: "moderate",
    note: "Sulfonylurea / insulin with kidney disease — longer action, hypoglycaemia risk." },
];

const drugSide = (side, ag) => side.startsWith("cls:") ? ag.cls === side.slice(4) : ag.id === side;

/* items:       [{ drug, dose, freq, duration }] — the prescription being written
   allergies:   [{ value, source }]  — every allergy on record, with where it came from
   conditions:  [{ value, source }]  — diagnoses and past history, likewise
   current:     [{ value, source }]  — medicines the patient already takes (not today's)
   pairs:       the existing interaction check, run by the caller over its own sources */
function checkSafety({ items = [], allergies = [], conditions = [], current = [] } = {}) {
  const rx = items.filter((it) => it && String(it.drug || "").trim())
    .map((it, i) => ({ i, drug: String(it.drug).trim(), agents: findAgents(it.drug) }));
  const out = { allergies: [], duplicates: [], contraindications: [], unrecognised: [], coverage: { lines: rx.length, recognised: 0 } };

  for (const r of rx) { if (r.agents.length) out.coverage.recognised++; else out.unrecognised.push(r.drug); }

  // allergies
  const realAllergies = allergies.filter((a) => a && a.value && !NONE_RE.test(a.value));
  for (const al of realAllergies) {
    const terms = ALLERGY_TERMS.filter((t) => t.re.test(al.value));
    const named = findAgents(al.value);
    for (const r of rx) {
      for (const ag of r.agents) {
        const direct = named.some((n) => n.id === ag.id) ||
          terms.some((t) => (t.cls && t.cls === ag.cls) || (t.id && t.id === ag.id));
        if (direct) {
          out.allergies.push({ severity: "high", drug: r.drug, allergy: al.value, source: al.source || null,
            note: "Allergy on record to " + al.value + " — " + r.drug + " is in the same group." });
          continue;
        }
        for (const c of CROSS) {
          const hasAllergy = terms.some((t) => t.label === c.allergy || t.cls === c.allergy || t.id === c.allergy);
          if (hasAllergy && ((c.cls && c.cls === ag.cls) || (c.id && c.id === ag.id))) {
            out.allergies.push({ severity: c.sev, drug: r.drug, allergy: al.value, source: al.source || null, note: c.note });
          }
        }
      }
    }
  }

  // duplicates within today's prescription
  const seenDup = new Set();
  for (let a = 0; a < rx.length; a++) for (let b = a + 1; b < rx.length; b++) {
    for (const x of rx[a].agents) for (const y of rx[b].agents) {
      // One agent id can cover a whole group ("nsaid" is ibuprofen, diclofenac…),
      // so "the same medicine" means the same agent AND the same name matched.
      const same = x.id === y.id && x.matched === y.matched, cls = (x.id === y.id || x.cls === y.cls) && (x.id === y.id || DUP_CLASSES[x.cls]);
      if (!same && !cls) continue;
      const key = a + "|" + b;
      if (seenDup.has(key)) continue;
      seenDup.add(key);
      out.duplicates.push({ severity: "moderate", drugs: [rx[a].drug, rx[b].drug], where: "today",
        note: same ? "The same medicine appears twice on this prescription." : "Two medicines from the same group (" + x.cls + ") on one prescription — check both are intended." });
    }
  }
  // today's prescription against what the patient already takes
  for (const cur of current) {
    const curAg = findAgents(cur.value);
    for (const r of rx) for (const x of r.agents) {
      const y = curAg.find((c) => c.id === x.id || (c.cls === x.cls && DUP_CLASSES[x.cls]));
      if (!y) continue;
      out.duplicates.push({ severity: y.id === x.id ? "low" : "moderate", drugs: [r.drug, cur.value], where: "already taking", source: cur.source || null,
        note: y.id === x.id ? "Already taking this — is it a continuation, or a second supply?" : "Already taking another medicine from the same group (" + x.cls + ")." });
    }
  }

  // contraindications
  const seenC = new Set();
  for (const c of CONTRA) {
    const hit = conditions.find((k) => k && k.value && c.cond.test(k.value));
    if (!hit) continue;
    for (const r of rx) if (r.agents.some((ag) => drugSide(c.drug, ag))) {
      const key = c.condLabel + "|" + r.i;
      if (seenC.has(key)) continue;
      seenC.add(key);
      out.contraindications.push({ severity: c.sev, drug: r.drug, condition: c.condLabel, matched: hit.value, source: hit.source || null, note: c.note });
    }
  }

  const rank = { high: 0, moderate: 1, low: 2 };
  for (const k of ["allergies", "duplicates", "contraindications"]) out[k].sort((p, q) => rank[p.severity] - rank[q.severity]);
  return out;
}

module.exports = { checkInteractions, checkSafety, findAgents, AGENTS, RULES };
