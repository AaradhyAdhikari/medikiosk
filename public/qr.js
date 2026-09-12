"use strict";
/* MediKiosk — QR codes, with no dependency and no build step.
 *
 * A kiosk in an OPD may be on a network that cannot reach a CDN, and the rest
 * of this app deliberately has no dependencies. So rather than pull in a
 * library, this encodes QR itself: byte mode, error-correction level M,
 * versions 1 to 10, every mask evaluated and the least-penalised one chosen.
 *
 * Level M (≈15% recovery) rather than L, because this code gets printed on a
 * thermal slip, folded into a pocket, and scanned in corridor light.
 *
 * Output is an SVG string. Not a canvas: a printer renders vector edges
 * exactly, and a canvas at the wrong pixel ratio produces the soft grey edges
 * that make a cheap scanner give up.
 *
 *   window.QR.svg("https://…", { size: 200, quiet: 4 })  → "<svg …>"
 *   window.QR.matrix("https://…")                        → [[0,1,…], …]
 */

/* ── error-correction parameters, level M, versions 1-10 ──────────────
   [ EC codewords per block, [ [blocks, data codewords per block], … ] ] */
var EC_M = {
  1:  [10, [[1, 16]]],
  2:  [16, [[1, 28]]],
  3:  [26, [[1, 44]]],
  4:  [18, [[2, 32]]],
  5:  [24, [[2, 43]]],
  6:  [16, [[4, 27]]],
  7:  [18, [[4, 31]]],
  8:  [22, [[2, 38], [2, 39]]],
  9:  [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
};
// Where the alignment patterns sit, per version.
var ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* ── GF(256) ──────────────────────────────────────────────────────────
   Reed-Solomon works in the field defined by x^8 + x^4 + x^3 + x^2 + 1. */
var EXP = new Array(512), LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
function gmul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }

// The generator polynomial for n error-correction codewords.
function rsGenerator(n) {
  var g = [1];
  for (var i = 0; i < n; i++) {
    var next = g.concat([0]);
    for (var j = 0; j < g.length; j++) next[j + 1] ^= gmul(g[j], EXP[i]);
    g = next;
  }
  return g;
}
function rsEncode(data, ecLen) {
  var gen = rsGenerator(ecLen);
  var rem = new Array(ecLen).fill(0);
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ rem[0];
    rem.shift(); rem.push(0);
    if (factor !== 0) for (var j = 0; j < gen.length - 1; j++) rem[j] ^= gmul(gen[j + 1], factor);
  }
  return rem;
}

/* ── bit stream ───────────────────────────────────────────────────── */
function Bits() { this.bits = []; }
Bits.prototype.put = function (value, length) {
  for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
};

/* ── build the codewords ──────────────────────────────────────────── */
function utf8(text) {
  var out = [], s = encodeURIComponent(text);
  for (var i = 0; i < s.length; i++) {
    if (s[i] === "%") { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push(s.charCodeAt(i));
  }
  return out;
}

function pickVersion(byteLen, minVersion) {
  for (var v = Math.max(1, minVersion || 1); v <= 10; v++) {
    var p = EC_M[v], dataCodewords = 0;
    for (var i = 0; i < p[1].length; i++) dataCodewords += p[1][i][0] * p[1][i][1];
    // 4 bits mode + 8 or 16 bits length + the data itself
    var need = 4 + (v < 10 ? 8 : 16) + byteLen * 8;
    if (need <= dataCodewords * 8) return v;
  }
  throw new Error("QR: " + byteLen + " bytes is more than this encoder handles (level M, version 10).");
}

function codewords(text, minVersion) {
  var bytes = utf8(text);
  var version = pickVersion(bytes.length, minVersion);
  var params = EC_M[version];
  var ecLen = params[0], groups = params[1];

  var total = 0;
  for (var i = 0; i < groups.length; i++) total += groups[i][0] * groups[i][1];

  var bs = new Bits();
  bs.put(4, 4);                                   // byte mode
  bs.put(bytes.length, version < 10 ? 8 : 16);    // character count
  for (var b = 0; b < bytes.length; b++) bs.put(bytes[b], 8);
  // terminator, then pad to a byte boundary, then the two alternating pad bytes
  var capacity = total * 8;
  for (var t = 0; t < 4 && bs.bits.length < capacity; t++) bs.bits.push(0);
  while (bs.bits.length % 8) bs.bits.push(0);

  var data = [];
  for (var k = 0; k < bs.bits.length; k += 8) {
    var byte = 0;
    for (var m = 0; m < 8; m++) byte = (byte << 1) | bs.bits[k + m];
    data.push(byte);
  }
  var pads = [0xec, 0x11], p = 0;
  while (data.length < total) data.push(pads[p++ % 2]);

  // split into blocks, error-correct each, then interleave
  var blocks = [], ecBlocks = [], at = 0;
  for (var g = 0; g < groups.length; g++) {
    for (var n = 0; n < groups[g][0]; n++) {
      var block = data.slice(at, at + groups[g][1]);
      at += groups[g][1];
      blocks.push(block);
      ecBlocks.push(rsEncode(block, ecLen));
    }
  }
  var out = [], maxData = 0;
  for (var x = 0; x < blocks.length; x++) maxData = Math.max(maxData, blocks[x].length);
  for (var c = 0; c < maxData; c++)
    for (var y = 0; y < blocks.length; y++) if (c < blocks[y].length) out.push(blocks[y][c]);
  for (var e = 0; e < ecLen; e++)
    for (var z = 0; z < ecBlocks.length; z++) out.push(ecBlocks[z][e]);

  return { version: version, bytes: out };
}

/* ── lay the modules out ──────────────────────────────────────────── */
function blank(n) {
  var m = new Array(n);
  for (var i = 0; i < n; i++) { m[i] = new Array(n); for (var j = 0; j < n; j++) m[i][j] = null; }
  return m;
}
function placeFinder(m, r, c) {
  for (var i = -1; i <= 7; i++) for (var j = -1; j <= 7; j++) {
    var rr = r + i, cc = c + j;
    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
    var on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
             (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
             (i >= 2 && i <= 4 && j >= 2 && j <= 4);
    m[rr][cc] = on ? 1 : 0;
  }
}
function skeleton(version) {
  var n = version * 4 + 17, m = blank(n);
  placeFinder(m, 0, 0); placeFinder(m, 0, n - 7); placeFinder(m, n - 7, 0);

  var a = ALIGN[version];
  for (var i = 0; i < a.length; i++) for (var j = 0; j < a.length; j++) {
    var r = a[i], c = a[j];
    if ((r <= 7 && c <= 7) || (r <= 7 && c >= n - 8) || (r >= n - 8 && c <= 7)) continue;
    for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++)
      m[r + dr][c + dc] = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
  }
  for (var k = 8; k < n - 8; k++) {          // timing patterns
    if (m[6][k] === null) m[6][k] = k % 2 === 0 ? 1 : 0;
    if (m[k][6] === null) m[k][6] = k % 2 === 0 ? 1 : 0;
  }
  m[n - 8][8] = 1;                            // the always-dark module
  return m;
}
// The 31 cells that carry format and (v7+) version information are reserved
// before data placement, then written afterwards.
function reserve(m, version) {
  var n = m.length;
  for (var i = 0; i <= 8; i++) {
    if (i !== 6) { if (m[8][i] === null) m[8][i] = 0; if (m[i][8] === null) m[i][8] = 0; }
  }
  for (var j = 0; j < 8; j++) {
    if (m[8][n - 1 - j] === null) m[8][n - 1 - j] = 0;
    if (m[n - 1 - j][8] === null) m[n - 1 - j][8] = 0;
  }
  if (version >= 7) {
    for (var r = 0; r < 6; r++) for (var c = 0; c < 3; c++) {
      m[r][n - 11 + c] = 0; m[n - 11 + c][r] = 0;
    }
  }
}
function placeData(m, bytes) {
  var n = m.length, bitIndex = 0, total = bytes.length * 8;
  var read = function () {
    if (bitIndex >= total) return 0;
    var bit = (bytes[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };
  var up = true;
  for (var col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;                     // the vertical timing column is skipped
    for (var step = 0; step < n; step++) {
      var row = up ? n - 1 - step : step;
      for (var k = 0; k < 2; k++) {
        var c = col - k;
        if (m[row][c] === null) m[row][c] = read();
      }
    }
    up = !up;
  }
}
var MASKS = [
  function (r, c) { return (r + c) % 2 === 0; },
  function (r) { return r % 2 === 0; },
  function (r, c) { return c % 3 === 0; },
  function (r, c) { return (r + c) % 3 === 0; },
  function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
  function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
  function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
  function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; },
];

// Format information: 5 data bits (EC level + mask) expanded by a BCH code.
function formatBits(mask) {
  var data = (0x00 << 3) | mask;              // 0b00 = level M
  var rem = data << 10;
  for (var i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(version) {
  var rem = version << 12;
  for (var i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  return (version << 12) | rem;
}
/* The fifteen format bits are written MSB first — bit 14 lands at (8,0) — and
   the whole string appears twice so that a torn or dirty corner still leaves a
   readable copy. Getting the bit ORDER wrong here is invisible to the eye and
   fatal to a scanner: a decoder reads format information before anything else,
   and if its BCH check fails it abandons the symbol without ever looking at
   the data. Worth stating because the failure mode is a QR that looks perfect
   and scans as nothing at all. */
function writeFormat(m, mask) {
  var n = m.length, bits = formatBits(mask);
  var bit = function (i) { return (bits >> i) & 1; };   // i = 14 is the MSB

  // copy one — around the top-left finder
  for (var i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
  m[8][7] = bit(8);
  m[8][8] = bit(7);
  m[7][8] = bit(6);
  for (var j = 0; j <= 5; j++) m[5 - j][8] = bit(5 - j);

  // copy two — split between below the top-left finder and left of the top-right
  for (var k = 0; k <= 6; k++) m[n - 1 - k][8] = bit(14 - k);
  for (var l = 0; l <= 7; l++) m[8][n - 8 + l] = bit(7 - l);

  m[n - 8][8] = 1;   // the module that is always dark
}
function writeVersion(m, version) {
  if (version < 7) return;
  var n = m.length, bits = versionBits(version);
  for (var i = 0; i < 18; i++) {
    var bit = (bits >> i) & 1, r = Math.floor(i / 3), c = i % 3;
    m[r][n - 11 + c] = bit;
    m[n - 11 + c][r] = bit;
  }
}

/* Penalty scoring, so the chosen mask is the one least likely to confuse a
   scanner — long runs, solid blocks, finder-like sequences and an unbalanced
   light/dark ratio all cost points. */
function penalty(m) {
  var n = m.length, score = 0, i, j, run, last;

  for (i = 0; i < n; i++) {
    run = 1; last = m[i][0];
    for (j = 1; j < n; j++) {
      if (m[i][j] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[i][j]; }
    }
    if (run >= 5) score += 3 + (run - 5);
    run = 1; last = m[0][i];
    for (j = 1; j < n; j++) {
      if (m[j][i] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[j][i]; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (i = 0; i < n - 1; i++) for (j = 0; j < n - 1; j++) {
    var v = m[i][j];
    if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
  }
  var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  var match = function (get, at) {
    var okA = true, okB = true;
    for (var k = 0; k < 11; k++) {
      if (get(at + k) !== pat1[k]) okA = false;
      if (get(at + k) !== pat2[k]) okB = false;
    }
    return okA || okB;
  };
  for (i = 0; i < n; i++) for (j = 0; j + 10 < n; j++) {
    if (match(function (x) { return m[i][x]; }, j)) score += 40;
    if (match(function (x) { return m[x][i]; }, j)) score += 40;
  }
  var dark = 0;
  for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (m[i][j]) dark++;
  var pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

window.QR = {
  // minVersion pins a floor on the version, so a run of slips can be printed
  // at one physical size even when the payloads differ in length.
  matrix: function (text, minVersion) {
    var cw = codewords(text, minVersion);
    var version = cw.version, n = version * 4 + 17;

    // function patterns, and a map of which cells they occupy
    var fixed = skeleton(version);
    var isFunction = blank(n);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) isFunction[r][c] = fixed[r][c] !== null;
    // format / version areas are not data either
    var marked = skeleton(version);
    reserve(marked, version);
    for (var r2 = 0; r2 < n; r2++) for (var c2 = 0; c2 < n; c2++)
      if (marked[r2][c2] !== null) isFunction[r2][c2] = true;

    var bestGrid = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var g = skeleton(version);
      reserve(g, version);
      placeData(g, cw.bytes);
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        if (!isFunction[i][j] && MASKS[mask](i, j)) g[i][j] ^= 1;
      }
      writeFormat(g, mask);
      writeVersion(g, version);
      var s = penalty(g);
      if (s < bestScore) { bestScore = s; bestGrid = g; }
    }
    return bestGrid;
  },

  svg: function (text, opts) {
    opts = opts || {};
    var m = window.QR.matrix(text, opts.minVersion);
    var n = m.length;
    var quiet = opts.quiet == null ? 4 : opts.quiet;      // the spec's minimum
    var span = n + quiet * 2;
    var size = opts.size || 220;
    var dark = opts.dark || "#0B1F1A";
    var light = opts.light || "#FFFFFF";

    // One path for every dark module: far fewer nodes than one rect each, and
    // it prints and scales without seams between neighbouring squares.
    var d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (m[r][c]) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 ' + span + " " + span + '" shape-rendering="crispEdges" role="img" ' +
      'aria-label="' + (opts.label || "QR code") + '">' +
      '<rect width="' + span + '" height="' + span + '" fill="' + light + '"/>' +
      '<path d="' + d + '" fill="' + dark + '"/></svg>';
  },
};
