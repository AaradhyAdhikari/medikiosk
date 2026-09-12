/* Pulls every translatable English string out of the source.
 *
 * Two sources, because the kiosk carries its text in two shapes:
 *   · L("हिन्दी", "English") calls in kiosk.js and doctor.js
 *   · hi/en pairs on the question objects in questions.js
 * Plus a short list of strings that live inside inline tuple arrays (the body
 * map zones, the pain faces, the visit-type options), which have no other
 * machine-readable home.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("/opt/node-tools/node_modules/acorn");
const walk = require("/opt/node-tools/node_modules/acorn-walk");

function lit(n) {
  if (!n) return null;
  if (n.type === "Literal" && typeof n.value === "string") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0].value.cooked;
  if (n.type === "BinaryExpression" && n.operator === "+") {
    const a = lit(n.left), b = lit(n.right);
    return a === null || b === null ? null : a + b;
  }
  return null;
}

const INLINE = [
  ["Head", "सिर"], ["Chest", "छाती"], ["Abdomen", "पेट"], ["Lower back", "पीठ / कमर"],
  ["Shoulder", "कंधा"], ["Arm", "हाथ"], ["Knee", "घुटना"], ["Foot", "पैर"],
  ["None", "बिल्कुल नहीं"], ["Mild", "थोड़ी"], ["Moderate", "ठीक-ठाक"], ["Severe", "ज़्यादा"],
  ["Unbearable", "बर्दाश्त नहीं"],
  ["Yes, first visit", "हाँ, पहली बार"], ["Full history · about 4 minutes", "पूरी जानकारी · लगभग 4 मिनट"],
  ["No, this is a follow-up", "नहीं, दोबारा दिखाने आया हूँ"], ["Only what changed · about 1 minute", "सिर्फ़ बदलाव · लगभग 1 मिनट"],
  ["I am here for someone else", "मैं किसी और के लिए आया हूँ"], ["Answer as their family member", "परिजन के रूप में जवाब दें"],
  ["This is an emergency", "आपात स्थिति"], ["Alerts triage staff immediately", "सीधे स्टाफ़ को सूचना"],
];

exports.extract = function (root) {
  const pairs = new Map();

  for (const f of ["public/kiosk.js"]) {
    const ast = acorn.parse(fs.readFileSync(path.join(root, f), "utf8"), { ecmaVersion: 2020 });
    walk.simple(ast, {
      CallExpression(n) {
        const fn = n.callee.type === "Identifier" ? n.callee.name : "";
        if (fn !== "L" && fn !== "LX") return;
        if (n.arguments.length < 2) return;
        const hi = lit(n.arguments[0]), en = lit(n.arguments[1]);
        if (hi !== null && en !== null && !pairs.has(en)) pairs.set(en, hi);
      },
    });
  }

  const win = {};
  new Function("window", fs.readFileSync(path.join(root, "public/questions.js"), "utf8"))(win);
  const KEYS = [["hi", "en"], ["phHi", "phEn"], ["dHi", "dEn"]];
  const qp = new Map();
  (function visit(o) {
    if (Array.isArray(o)) return o.forEach(visit);
    if (!o || typeof o !== "object") return;
    for (const [h, e] of KEYS) if (typeof o[e] === "string" && typeof o[h] === "string" && !qp.has(o[e])) qp.set(o[e], o[h]);
    if (o.note && o.note.en && !qp.has(o.note.en)) qp.set(o.note.en, o.note.hi);
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object") visit(o[k]);
  })(Object.keys(win).filter((k) => typeof win[k] !== "function").map((k) => win[k]));

  const all = new Map([...qp, ...pairs, ...INLINE]);
  return [...all].map(([en, hi]) => ({ en, hi }));
};

if (require.main === module) {
  const out = exports.extract(path.join(__dirname, ".."));
  console.log(JSON.stringify(out, null, 1));
}
