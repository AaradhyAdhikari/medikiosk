"use strict";
/* The body figure — an illustrated person, front and back,
   left/right aware. Friendly rather than anatomical: hair, a face, ears,
   hands with fingers, feet with toes, knee and collarbone hints — the kind
   of figure a patient points at without being told how.

   Named regions lie over it as soft shapes. The patient taps where it
   hurts; the region lights, a pill beside it names the part in their
   language; more taps add more parts, the first being the main one. The
   same drawing, read-only with the touched regions lit, goes wherever the
   history is read.

   Sides are the PATIENT's. Front view: the patient's right is on the
   viewer's left, as when facing someone. Back view: on the viewer's right.
   Small R / L marks on the figure say so. Canvas 220×460, symmetric about
   x=110; the left half is drawn and the right half mirrored. */
(function () {
  // key, Hindi, English, view, cx, cy, rx, ry
  var ZM = [
    // ── front: coordinates on the 257×527 illustration (viewer-left = patient's RIGHT) ──
    ["head",        "सिर",                    "Head",                 "front", 130,  40, 26, 34],
    ["brain",       "दिमाग़",                  "Brain",                "front", 130,  22, 22, 14],
    ["r_eye",       "दाहिनी आँख",             "Right eye",            "front", 121,  44,  6,  4],
    ["l_eye",       "बायीं आँख",              "Left eye",             "front", 139,  44,  6,  4],
    ["nose",        "नाक",                    "Nose",                 "front", 130,  54,  4,  6],
    ["mouth",       "मुँह / दाँत",             "Mouth / teeth",        "front", 130,  65,  7,  4],
    ["r_ear",       "दाहिना कान",             "Right ear",            "front", 104,  47,  4,  7],
    ["l_ear",       "बायाँ कान",              "Left ear",             "front", 156,  47,  4,  7],
    ["neck",        "गला / गर्दन",            "Throat / neck",        "front", 130,  84, 14, 10],
    ["r_shoulder",  "दाहिना कंधा",            "Right shoulder",       "front",  68, 105, 17, 13],
    ["l_shoulder",  "बायाँ कंधा",             "Left shoulder",        "front", 192, 105, 17, 13],
    ["chest",       "छाती",                   "Chest",                "front", 130, 150, 46, 36],
    ["r_lung",      "दाहिना फेफड़ा",           "Right lung",           "front", 110, 150, 19, 40],
    ["l_lung",      "बायाँ फेफड़ा",            "Left lung",            "front", 151, 148, 17, 38],
    ["heart",       "दिल",                    "Heart",                "front", 138, 140, 16, 16],
    ["upper_abd",   "पेट (ऊपरी)",             "Upper abdomen",        "front", 130, 192, 44, 22],
    ["liver",       "जिगर (लिवर)",             "Liver",                "front", 114, 188, 24, 17],
    ["stomach",     "आमाशय (पेट का थैला)",      "Stomach",              "front", 154, 184, 16, 15],
    ["lower_abd",   "पेट (निचला)",            "Lower abdomen",        "front", 130, 242, 42, 36],
    ["intestines",  "आँतें",                   "Intestines",           "front", 137, 236, 30, 32],
    ["bladder",     "मूत्राशय",                "Bladder",              "front", 129, 279,  9,  8],
    ["groin",       "जाँघों के बीच",           "Groin",                "front", 130, 302, 12,  8],
    ["r_hip",       "दाहिना कूल्हा",          "Right hip",            "front",  92, 266, 16, 16],
    ["l_hip",       "बायाँ कूल्हा",           "Left hip",             "front", 168, 266, 16, 16],
    ["r_upperarm",  "दाहिनी बाँह (ऊपरी)",     "Right upper arm",      "front",  56, 162, 14, 32],
    ["l_upperarm",  "बायीं बाँह (ऊपरी)",      "Left upper arm",       "front", 204, 162, 14, 32],
    ["r_elbow",     "दाहिनी कोहनी",           "Right elbow",          "front",  44, 230, 14, 12],
    ["l_elbow",     "बायीं कोहनी",            "Left elbow",           "front", 214, 230, 14, 12],
    ["r_forearm",   "दाहिनी बाँह (निचली)",    "Right forearm",        "front",  37, 256, 12, 22],
    ["l_forearm",   "बायीं बाँह (निचली)",     "Left forearm",         "front", 221, 256, 12, 22],
    ["r_hand",      "दाहिना हाथ",             "Right hand",           "front",  28, 282, 18, 16],
    ["l_hand",      "बायाँ हाथ",              "Left hand",            "front", 230, 282, 18, 16],
    ["r_fingers",   "दाहिने हाथ की उँगलियाँ / नाख़ून", "Right fingers / nails", "front",  24, 304, 14, 10],
    ["l_fingers",   "बायें हाथ की उँगलियाँ / नाख़ून",  "Left fingers / nails",  "front", 234, 304, 14, 10],
    ["r_thigh",     "दाहिनी जाँघ",            "Right thigh",          "front", 100, 362, 22, 40],
    ["l_thigh",     "बायीं जाँघ",             "Left thigh",           "front", 156, 362, 22, 40],
    ["r_knee",      "दाहिना घुटना",           "Right knee",           "front",  97, 426, 17, 17],
    ["l_knee",      "बायाँ घुटना",            "Left knee",            "front", 158, 426, 17, 17],
    ["r_shin",      "दाहिनी पिंडली (आगे)",     "Right shin",           "front",  99, 476, 13, 30],
    ["l_shin",      "बायीं पिंडली (आगे)",      "Left shin",            "front", 156, 476, 13, 30],
    ["r_ankle",     "दाहिना टखना",            "Right ankle",          "front", 100, 502, 11,  9],
    ["l_ankle",     "बायाँ टखना",             "Left ankle",           "front", 155, 502, 11,  9],
    ["r_foot",      "दाहिना पैर (पंजा)",       "Right foot",           "front",  90, 513, 18, 10],
    ["l_foot",      "बायाँ पैर (पंजा)",        "Left foot",            "front", 164, 513, 18, 10],
    ["r_toes",      "दाहिने पैर की उँगलियाँ",  "Right toes",           "front",  86, 519, 13,  5],
    ["l_toes",      "बायें पैर की उँगलियाँ",   "Left toes",            "front", 168, 519, 13,  5],
    // ── back: coordinates on the 263×525 illustration (viewer-left = patient's LEFT) ──
    ["head_b",      "सिर का पिछला हिस्सा",     "Back of head",         "back",  131,  40, 26, 34],
    ["nape",        "गर्दन (पीछे)",           "Nape of neck",         "back",  131,  84, 13, 10],
    ["l_shoulder_b","बायाँ कंधा (पीछे)",      "Left shoulder (back)", "back",   68, 105, 17, 13],
    ["r_shoulder_b","दाहिना कंधा (पीछे)",     "Right shoulder (back)","back",  194, 105, 17, 13],
    ["l_scapula",   "बायीं कंधे की हड्डी",     "Left shoulder blade",  "back",  100, 136, 20, 18],
    ["r_scapula",   "दाहिनी कंधे की हड्डी",    "Right shoulder blade", "back",  162, 136, 20, 18],
    ["upper_back",  "ऊपरी पीठ",              "Upper back",           "back",  131, 136, 24, 28],
    ["mid_back",    "बीच की पीठ",            "Mid back",             "back",  131, 186, 38, 22],
    ["l_kidney",    "बायीं किडनी (गुर्दा)",     "Left kidney",          "back",  114, 212, 11, 16],
    ["r_kidney",    "दाहिनी किडनी (गुर्दा)",    "Right kidney",         "back",  148, 212, 11, 16],
    ["lower_back",  "कमर / निचली पीठ",        "Lower back",           "back",  131, 234, 36, 24],
    ["l_buttock",   "बायाँ नितंब",            "Left buttock",         "back",  106, 282, 24, 22],
    ["r_buttock",   "दाहिना नितंब",           "Right buttock",        "back",  156, 282, 24, 22],
    ["l_upperarm_b","बायीं बाँह (पीछे, ऊपरी)", "Back of left upper arm","back",  56, 162, 14, 32],
    ["r_upperarm_b","दाहिनी बाँह (पीछे, ऊपरी)","Back of right upper arm","back",206, 162, 14, 32],
    ["l_elbow_b",   "बायीं कोहनी (पीछे)",     "Left elbow (back)",    "back",   44, 230, 14, 12],
    ["r_elbow_b",   "दाहिनी कोहनी (पीछे)",    "Right elbow (back)",   "back",  217, 230, 14, 12],
    ["l_forearm_b", "बायीं बाँह (पीछे, निचली)","Back of left forearm", "back",   37, 256, 12, 22],
    ["r_forearm_b", "दाहिनी बाँह (पीछे, निचली)","Back of right forearm","back", 224, 256, 12, 22],
    ["l_hand_b",    "बायें हाथ का पिछला हिस्सा", "Back of left hand",   "back",   28, 290, 18, 22],
    ["r_hand_b",    "दाहिने हाथ का पिछला हिस्सा","Back of right hand",  "back",  234, 290, 18, 22],
    ["l_hamstring", "बायीं जाँघ (पीछे)",      "Back of left thigh",   "back",  101, 362, 22, 40],
    ["r_hamstring", "दाहिनी जाँघ (पीछे)",     "Back of right thigh",  "back",  158, 362, 22, 40],
    ["l_kneeback",  "बायें घुटने के पीछे",     "Back of left knee",    "back",   98, 426, 17, 15],
    ["r_kneeback",  "दाहिने घुटने के पीछे",    "Back of right knee",   "back",  160, 426, 17, 15],
    ["l_calf",      "बायीं पिंडली",           "Left calf",            "back",  100, 476, 13, 30],
    ["r_calf",      "दाहिनी पिंडली",          "Right calf",           "back",  157, 476, 13, 30],
    ["l_heel",      "बायीं एड़ी",             "Left heel",            "back",   95, 513, 16, 10],
    ["r_heel",      "दाहिनी एड़ी",            "Right heel",           "back",  163, 513, 16, 10],
  ]; 
  // the female figure: same parts, same names, its own coordinates
  var ZF_XY = {"head":[128,40,26,34],"brain":[128,22,22,14],"r_eye":[119,46,6,4],"l_eye":[137,46,6,4],"nose":[128,56,4,6],"mouth":[128,66,7,4],"r_ear":[102,48,4,7],"l_ear":[154,48,4,7],"neck":[128,84,13,10],"r_shoulder":[70,108,16,12],"l_shoulder":[186,108,16,12],"chest":[128,150,42,36],"r_lung":[110,150,17,38],"l_lung":[148,148,16,36],"heart":[146,138,15,15],"upper_abd":[128,192,42,22],"liver":[114,188,22,16],"stomach":[154,181,15,14],"lower_abd":[128,242,44,36],"intestines":[137,233,28,32],"bladder":[128,280,8,8],"groin":[128,300,12,8],"r_hip":[88,262,17,16],"l_hip":[168,262,17,16],"r_upperarm":[60,165,14,32],"l_upperarm":[196,165,14,32],"r_elbow":[46,232,13,12],"l_elbow":[208,232,13,12],"r_forearm":[38,255,11,22],"l_forearm":[216,255,11,22],"r_hand":[25,285,16,16],"l_hand":[230,285,16,16],"r_fingers":[21,306,12,9],"l_fingers":[234,306,12,9],"r_thigh":[101,362,21,40],"l_thigh":[154,362,21,40],"r_knee":[97,425,17,16],"l_knee":[157,425,17,16],"r_shin":[99,475,12,30],"l_shin":[155,475,12,30],"r_ankle":[100,500,10,9],"l_ankle":[154,500,10,9],"r_foot":[97,515,16,10],"l_foot":[157,515,16,10],"r_toes":[100,528,12,5],"l_toes":[153,528,12,5],"head_b":[130,40,26,34],"nape":[130,84,13,10],"l_shoulder_b":[70,108,16,12],"r_shoulder_b":[190,108,16,12],"l_scapula":[102,138,19,18],"r_scapula":[160,138,19,18],"upper_back":[130,138,22,28],"mid_back":[130,186,36,22],"l_kidney":[114,212,10,15],"r_kidney":[148,212,10,15],"lower_back":[130,236,34,24],"l_buttock":[98,284,26,24],"r_buttock":[161,284,26,24],"l_upperarm_b":[60,165,14,32],"r_upperarm_b":[200,165,14,32],"l_elbow_b":[46,232,13,12],"r_elbow_b":[212,232,13,12],"l_forearm_b":[38,255,11,22],"r_forearm_b":[221,255,11,22],"l_hand_b":[25,290,16,20],"r_hand_b":[234,290,16,20],"l_hamstring":[102,362,21,40],"r_hamstring":[157,362,21,40],"l_kneeback":[100,425,17,14],"r_kneeback":[159,425,17,14],"l_calf":[102,475,12,30],"r_calf":[157,475,12,30],"l_heel":[95,515,17,10],"r_heel":[162,515,17,10]};
  var ZF = ZM.map(function (z) { var c = ZF_XY[z[0]]; return c ? [z[0], z[1], z[2], z[3], c[0], c[1], c[2], c[3]] : z; });
  var Z = ZM;
 // the right half is the left half mirrored about x=110
  function R(d) {
    return d.replace(/([MLCQSTA])\s*([^MLCQSTAZ]+)/gi, function (_, cmd, nums) {
      var a = nums.trim().split(/[\s,]+/).map(Number), out = [];
      for (var i = 0; i < a.length; i += 2) out.push((220 - a[i]) + " " + a[i + 1]);
      return cmd + " " + out.join(" ");
    });
  }
  function both(cls, d) { return '<path class="' + cls + '" d="' + d + '"/><path class="' + cls + '" d="' + R(d) + '"/>'; }

  /* the drawing: left half, mirrored. Soft shapes, no hard outline — the
     depth comes from a gradient and one shadow, like a flat illustration. */
  var ARM   = "M60 96 C48 100 42 110 40 124 L34 182 L30 236 C29 246 34 252 42 252 C50 252 54 246 54 238 L56 186 L62 140 L64 118 Z";
  var HAND  = "M31 254 C24 256 20 266 21 278 C22 290 30 298 40 297 C49 296 53 288 52 278 L51 256 Z";
  var THUMB = "M51 258 C56 254 61 260 60 268 C59 275 54 278 51 276 Z";
  var FING  = "M29 282 L28 295 M35 284 L35 297 M41 283 L41 296";
  var LEG   = "M64 236 L109 236 L108 250 L104 316 C102 346 101 376 100 406 L77 406 C73 376 71 346 69 316 L63 256 Z";
  var FOOT  = "M75 406 L101 406 L106 422 C108 432 102 438 92 438 L72 438 C61 438 57 432 60 422 Z";
  var TOES  = "M66 435 L66 441 M74 436 L74 442 M82 436 L82 442 M90 436 L90 442 M98 435 L98 441";
  var KNEE  = "M78 322 C82 329 92 329 96 322";

  var HEAD_SHAPE = "M110 12 C127 12 136 26 136 44 C136 61 125 72 110 72 C95 72 84 61 84 44 C84 26 93 12 110 12 Z";
  var HEAD_FRONT =
    "<path class=\"skin\" d=\"" + HEAD_SHAPE + "\"/>" +
    "<path class=\"hair\" d=\"M84 46 C83 20 96 10 110 10 C124 10 137 20 136 46 C134 36 128 30 120 31 C114 32 110 35 105 34 C98 33 91 37 88 44 C87 46 85 47 84 46 Z\"/>" +
    "<ellipse class=\"skin\" cx=\"85\" cy=\"46\" rx=\"4.5\" ry=\"7\"/><ellipse class=\"skin\" cx=\"135\" cy=\"46\" rx=\"4.5\" ry=\"7\"/>" +
    "<path class=\"feat\" d=\"M97 41 C100 39 104 39 106 41 M114 41 C116 39 120 39 123 41\"/>" +
    "<circle class=\"eye\" cx=\"101\" cy=\"46\" r=\"2.3\"/><circle class=\"eye\" cx=\"119\" cy=\"46\" r=\"2.3\"/>" +
    "<path class=\"feat\" d=\"M110 49 L108 57 L112 57\"/>" +
    "<path class=\"feat\" d=\"M104 64 C107 67 113 67 116 64\"/>";
  var HEAD_BACK =
    "<path class=\"skin\" d=\"" + HEAD_SHAPE + "\"/>" +
    "<path class=\"hair\" d=\"M84 46 C83 14 137 14 136 46 C136 60 128 68 110 68 C92 68 84 60 84 46 Z\"/>" +
    "<ellipse class=\"skin\" cx=\"85\" cy=\"46\" rx=\"4.5\" ry=\"7\"/><ellipse class=\"skin\" cx=\"135\" cy=\"46\" rx=\"4.5\" ry=\"7\"/>";
  var NECK  = "<path class=\"skin\" d=\"M101 68 L119 68 L121 88 L99 88 Z\"/>";
  var TORSO = "<path class=\"skin\" d=\"M98 84 C78 84 64 90 58 100 C54 108 54 118 56 128 L64 166 C66 182 66 196 64 210 L62 238 L158 238 L156 210 C154 196 154 182 156 166 L164 128 C166 118 166 108 162 100 C156 90 142 84 122 84 Z\"/>";
  var FRONT_MARKS = "<path class=\"feat\" d=\"M94 100 C102 106 118 106 126 100\"/>";
  var BACK_MARKS  = "<path class=\"feat\" d=\"M80 108 C88 122 100 124 104 110 M140 108 C132 122 120 124 116 110\"/>" +
                    "<path class=\"spine\" d=\"M110 92 L110 230\"/>" +
                    "<path class=\"feat\" d=\"M64 236 C82 224 100 226 110 238 C120 226 138 224 156 236\"/>";
  var LIMBS = both("skin", ARM) + both("skin", HAND) + both("skin", THUMB) + both("feat", FING) +
              both("skin", LEG) + both("feat", KNEE) + both("skin", FOOT) + both("feat", TOES);

  var IMG = {
    m: { front: { href: "/img/body-front.png",   w: 257, h: 527 }, back: { href: "/img/body-back.png",   w: 263, h: 525 } },
    f: { front: { href: "/img/body-front-f.png", w: 255, h: 534 }, back: { href: "/img/body-back-f.png", w: 259, h: 531 } },
  };
  function sexOf(v) { return String(v || "").toLowerCase().charAt(0) === "f" ? "f" : "m"; }
  var SIDES = {
    front: function (w) { return '<text class="side" x="8" y="18">R</text><text class="side" x="' + (w - 18) + '" y="18">L</text>'; },
    back:  function (w) { return '<text class="side" x="8" y="18">L</text><text class="side" x="' + (w - 18) + '" y="18">R</text>'; },
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function zoneByKey(key) { for (var i = 0; i < Z.length; i++) if (Z[i][0] === key) return Z[i]; return null; }
  function viewOf(key) { var z = zoneByKey(key); return z ? z[3] : "front"; }

  /* opts.view        — "front" | "back"
     opts.selected    — zone key(s) to light; the first is the main one
     opts.interactive — regions become tap targets with data-zone / data-key
     opts.label(z)    — how to name a zone (the kiosk translates)
     opts.pins        — draw a name pill beside each selected region
     opts.ariaLabel */
  function svg(opts) {
    opts = opts || {};
    var view = opts.view || "front";
    var sel = [].concat(opts.selected || []).filter(Boolean);
    var name = opts.label || function (z) { return z[2]; };
    var sx = sexOf(opts.sex), T = sx === "f" ? ZF : ZM;
    var zones = T.filter(function (z) { return z[3] === view; })
      // big regions first so the small ones (eyes, nose) sit on top and win the tap
      .sort(function (a, b) { return (b[6] * b[7]) - (a[6] * a[7]); });
    var pins = "";
    var body = zones.map(function (z) {
      var i = sel.indexOf(z[0]), on = i > -1, main = i === 0;
      var label = name(z);
      if (on && opts.pins) {
        var W = IMG[sx][view] ? IMG[sx][view].w : 220;
        var px = Math.max(58, Math.min(W - 58, z[4])), py = z[5] - z[7] - 8;
        if (py < 22) py = z[5] + z[7] + 30;
        pins += '<foreignObject class="pinbox" x="' + (px - 70) + '" y="' + (py - 24) + '" width="140" height="28">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" class="pin' + (main ? " main" : "") + '">' + esc(label) + "</div></foreignObject>";
      }
      return '<ellipse class="zone' + (on ? (main ? " sel main" : " sel") : "") + (opts.interactive ? "" : " static") + '"' +
        (opts.interactive ? ' data-zone="' + esc(label) + '" data-key="' + z[0] + '" tabindex="0" role="button" aria-pressed="' + on + '"' : "") +
        ' cx="' + z[4] + '" cy="' + z[5] + '" rx="' + z[6] + '" ry="' + z[7] + '"><title>' + esc(label) + "</title></ellipse>";
    }).join("");
    var im = IMG[sx][view];
    var figure = im
      ? '<image href="' + im.href + '" x="0" y="0" width="' + im.w + '" height="' + im.h + '" preserveAspectRatio="xMidYMid meet"/>'
      : (view === "back" ? HEAD_BACK : HEAD_FRONT) + NECK + TORSO + (view === "back" ? BACK_MARKS : FRONT_MARKS) + LIMBS;
    var vb = im ? "0 0 " + im.w + " " + im.h : "0 0 220 460";
    return '<svg class="bodyfig2 v-' + view + (im ? " has-img" : "") + '" viewBox="' + vb + '" role="' + (opts.interactive ? "group" : "img") + '" aria-label="' +
      esc(opts.ariaLabel || "Body map") + '">' +
      '<defs><linearGradient id="bmskin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6E6D6"/><stop offset="1" stop-color="#E9CBB2"/></linearGradient><filter id="bmshadow" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#6B4A2E" flood-opacity=".18"/></filter></defs><g filter="url(#bmshadow)">' +
      figure + "</g>" + SIDES[view](im ? im.w : 220) + body + pins + "</svg>";
  }

  window.BODYMAP = { ZONES: Z, ZONES_F: ZF, VIEWS: ["front", "back"], svg: svg, zoneByKey: zoneByKey, viewOf: viewOf, sexOf: sexOf };
})();
