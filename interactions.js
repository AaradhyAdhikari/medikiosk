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
      if (!seen.has(ag.id)) seen.set(ag.id, { agent: ag, where: new Set() });
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
          a: { id: x.agent.id, matched: x.agent.matched, where: [...x.where] },
          b: { id: y.agent.id, matched: y.agent.matched, where: [...y.where] },
          note: r.note,
        });
      }
    }
  }
  const rank = { high: 0, moderate: 1, low: 2 };
  out.sort((p, q) => rank[p.severity] - rank[q.severity]);
  return out;
}

module.exports = { checkInteractions, findAgents, AGENTS, RULES };
