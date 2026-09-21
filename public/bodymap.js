"use strict";
/* The body figure, shared by every screen that shows it.

   The kiosk asks "where is the problem — touch to show us" on a figure the
   patient taps. The same figure, with the touched zone lit, then belongs
   wherever the history is read: the patient's "is this right?" screen, their
   own record, and the physician's console — a picture is the one part of
   the history that needs no translation. One drawing here, so the three
   never drift apart. */
(function () {
  // key, Hindi, English, cx, cy, rx, ry  — on a 190×300 canvas
  var ZONES = [
    ["head", "सिर", "Head", 95, 26, 20, 20],
    ["chest", "छाती", "Chest", 95, 72, 22, 18],
    ["abdomen", "पेट", "Abdomen", 95, 110, 22, 20],
    ["lowback", "पीठ / कमर", "Lower back", 95, 142, 20, 14],
    ["lsh", "कंधा", "Shoulder", 60, 66, 15, 14],
    ["rsh", "कंधा", "Shoulder", 130, 66, 15, 14],
    ["larm", "हाथ", "Arm", 48, 112, 13, 22],
    ["rarm", "हाथ", "Arm", 142, 112, 13, 22],
    ["lknee", "घुटना", "Knee", 80, 214, 15, 15],
    ["rknee", "घुटना", "Knee", 110, 214, 15, 15],
    ["lfoot", "पैर", "Foot", 79, 270, 13, 14],
    ["rfoot", "पैर", "Foot", 111, 270, 13, 14],
  ];

  var FIGURE =
    '<ellipse class="figure" cx="95" cy="28" rx="21" ry="24"/>' +
    '<rect class="figure" x="88" y="50" width="14" height="12" rx="5"/>' +
    '<path class="figure" d="M67 64 h56 q10 0 11 10 l4 52 q1 8 -7 8 h-6 l-3 40 h-58 l-3 -40 h-6 q-8 0 -7 -8 l4 -52 q1 -10 11 -10 z"/>' +
    '<path class="figure" d="M64 70 l-14 6 -8 60 q-1 8 7 9 q8 1 10 -7 l12 -48 z"/>' +
    '<path class="figure" d="M126 70 l14 6 8 60 q1 8 -7 9 q-8 1 -10 -7 l-12 -48 z"/>' +
    '<path class="figure" d="M76 176 l-3 62 -3 46 q-1 8 8 8 q8 0 9 -8 l8 -66 l8 66 q1 8 9 8 q9 0 8 -8 l-3 -46 l-3 -62 z"/>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* opts.selected  — zone key(s) to light up
     opts.interactive — zones become tap targets carrying data-zone (label) and data-key
     opts.label(z)    — how to name a zone (the kiosk translates; the console uses English)
     opts.ariaLabel   — for the group */
  function svg(opts) {
    opts = opts || {};
    var sel = [].concat(opts.selected || []).filter(Boolean);
    var name = opts.label || function (z) { return z[2]; };
    return '<svg class="bodyfig" viewBox="0 0 190 300" role="' + (opts.interactive ? "group" : "img") + '" aria-label="' +
      esc(opts.ariaLabel || "Body map") + '">' + FIGURE +
      ZONES.map(function (z) {
        var on = sel.indexOf(z[0]) > -1;
        var label = name(z);
        return '<ellipse class="zone' + (on ? " sel" : "") + (opts.interactive ? "" : " static") + '"' +
          (opts.interactive ? ' data-zone="' + esc(label) + '" data-key="' + z[0] + '" tabindex="0" role="button"' : "") +
          ' cx="' + z[3] + '" cy="' + z[4] + '" rx="' + z[5] + '" ry="' + z[6] + '"><title>' + esc(label) + "</title></ellipse>";
      }).join("") + "</svg>";
  }

  function zoneByKey(key) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0] === key) return ZONES[i];
    return null;
  }

  window.BODYMAP = { ZONES: ZONES, svg: svg, zoneByKey: zoneByKey };
})();
