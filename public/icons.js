"use strict";
/* MediKiosk icon set.
 *
 * Stroke-based, drawn on a 24px grid, 1.75 stroke, round caps and joins,
 * inheriting currentColor. One consistent hand throughout.
 *
 * Emoji were used here originally and read as childish in a clinical setting.
 * They are also inconsistent between Windows, Android and iOS, which matters
 * when the same screen has to look the same on a hospital kiosk and a phone.
 *
 * The three dosha marks (wind, flame, droplet) are deliberately reused across
 * every Ayurvedic question, so a patient learns the visual language once.
 */

var ICONS = {
  /* ── body and symptom ── */
  joint:      '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v5.8M12 15.2V21M7.7 7.7 9.9 9.9M14.1 14.1l2.2 2.2"/>',
  head:       '<path d="M8 20v-2.2a6.5 6.5 0 1 1 8 0V20"/><path d="M9.4 9.6a2.6 2.6 0 0 1 5.2 0c0 1.7-2.6 2-2.6 3.6"/>',
  stomach:    '<path d="M9 4v5.5a5 5 0 0 0 5 5h1.5a3.5 3.5 0 0 1 0 7H12"/><path d="M6.5 4h5M12 21.5h-2.5"/>',
  lungs:      '<path d="M12 4v9"/><path d="M12 9c0-1.7-1.2-3-2.7-3S6.5 7.6 6 9.5C5.4 11.8 5 14.4 5 16.2c0 1.6 1.2 2.6 2.6 2.2l2.6-.8c1-.3 1.8-1.3 1.8-2.4V9Z"/><path d="M12 9c0-1.7 1.2-3 2.7-3s2.8 1.6 3.3 3.5c.6 2.3 1 4.9 1 6.7 0 1.6-1.2 2.6-2.6 2.2l-2.6-.8c-1-.3-1.8-1.3-1.8-2.4V9Z"/>',
  fever:      '<path d="M13.5 14.4V5a1.9 1.9 0 0 0-3.8 0v9.4a4 4 0 1 0 3.8 0Z"/><path d="M11.6 17.4v-2.6"/>',
  sleep:      '<path d="M20 14.5A8.4 8.4 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  skin:       '<path d="M4 8.5C4 6 6 4 8.5 4h7C18 4 20 6 20 8.5v7c0 2.5-2 4.5-4.5 4.5h-7C6 20 4 18 4 15.5Z"/><path d="M8.6 9.2h.01M12.4 12.1h.01M9.5 15h.01M15.2 8.9h.01M15 14.6h.01"/>',
  chest:      '<path d="M12 20.5S4.5 16 4.5 10.2A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.8-7.5 10.3-7.5 10.3Z"/>',

  /* ── time ── */
  sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
  calendar:   '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 2.5V6M15.5 2.5V6"/>',
  calendarWk: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 2.5V6M15.5 2.5V6M8 14h2M14 14h2M8 17.5h2M14 17.5h2"/>',
  hourglass:  '<path d="M7 3h10M7 21h10"/><path d="M17 3v3.5c0 2-3.2 3.6-3.2 5.5s3.2 3.5 3.2 5.5V21M7 3v3.5c0 2 3.2 3.6 3.2 5.5S7 15.5 7 17.5V21"/>',
  clock:      '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2.1"/>',

  /* ── pain quality ── */
  flame:      '<path d="M12 21.5c3.9 0 6.8-2.9 6.8-6.8 0-3.9-2.9-5.8-3.9-8.7-1.9 1.9-2.9 2.9-3.9 2.9-1-1.9 0-3.9 1-5.8-3.9 1.9-6.8 5.8-6.8 11.6 0 3.9 2.9 6.8 6.8 6.8Z"/>',
  blade:      '<path d="M3.5 20.5 20.5 3.5M14 3.5h6.5V10"/><path d="M8.6 15.4 3.5 20.5"/>',
  weight:     '<path d="M5.2 9.8h13.6l1.7 9.4a1.5 1.5 0 0 1-1.5 1.8H5a1.5 1.5 0 0 1-1.5-1.8Z"/><path d="M9 9.8V7.6a3 3 0 0 1 6 0v2.2"/>',
  spiral:     '<path d="M12 20.5a8.5 8.5 0 1 0-8.5-8.5c0 4.7 3.8 6.5 6.5 6.5s5-1.8 5-4.4-2-4-3.9-4-3.2 1.5-3.2 3.1 1.3 2.5 2.4 2.5"/>',
  pulse:      '<path d="M2.5 12h4l2-6 4 12 2.5-7 1.8 3h4.7"/>',

  /* ── conditions ── */
  blood:      '<path d="M12 3.2s6 6.4 6 10.4a6 6 0 0 1-12 0c0-4 6-10.4 6-10.4Z"/>',
  heart:      '<path d="M12 20.5S4.5 16 4.5 10.2A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.8-7.5 10.3-7.5 10.3Z"/><path d="M8 12h2l1-1.6L12.6 14l1-2h2.4"/>',
  bone:       '<path d="M7.5 16.5 16.5 7.5"/><path d="M6.6 13.4a2.6 2.6 0 1 0-3 3 2.6 2.6 0 1 0 3.6 3.6 2.6 2.6 0 1 0 3-3"/><path d="M17.4 10.6a2.6 2.6 0 1 0 3-3 2.6 2.6 0 1 0-3.6-3.6 2.6 2.6 0 1 0-3 3"/>',
  thyroid:    '<path d="M12 5.5c1.6-2 4.5-2.6 6-.6 1.6 2 .6 5.4-.9 7.6-1.2 1.8-3.3 3.3-5.1 3.3s-3.9-1.5-5.1-3.3C5.4 10.3 4.4 6.9 6 4.9c1.5-2 4.4-1.4 6 .6Z"/><path d="M12 5.5v14"/>',

  /* ── the three dosha marks ── */
  vata:       '<path d="M3 8.5h11a3 3 0 1 0-3-3"/><path d="M3 13h14.5a3.2 3.2 0 1 1-3.2 3.2"/><path d="M3 17.5h6"/>',
  pitta:      '<path d="M12 21c3.3 0 6-2.6 6-5.9 0-3.2-2.5-5-3.5-7.6-1.6 1.7-2.5 2.5-3.4 2.5-.8-1.6 0-3.4.9-5C8.6 6.7 6 10 6 15.1 6 18.4 8.7 21 12 21Z"/><path d="M12 21c1.5 0 2.7-1.2 2.7-2.7 0-1.6-1.4-2.4-2.7-4-1.3 1.6-2.7 2.4-2.7 4C9.3 19.8 10.5 21 12 21Z"/>',
  kapha:      '<path d="M12 3.5s5.8 6.2 5.8 10.1a5.8 5.8 0 0 1-11.6 0C6.2 9.7 12 3.5 12 3.5Z"/><path d="M9.2 14.2a2.8 2.8 0 0 0 2.8 2.8"/>',
  balance:    '<path d="M12 3.5v17M5 8h14"/><path d="M5 8 2.5 14a2.9 2.9 0 0 0 5 0Z"/><path d="M19 8l-2.5 6a2.9 2.9 0 0 0 5 0Z"/>',

  /* ── food and routine ── */
  plate:      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  leaf:       '<path d="M4 20c0-8 5-13.5 16-14C20 15 15 20 4 20Z"/><path d="M4 20c3.5-4.5 6.5-7 12-9.5"/>',
  meat:       '<path d="M6.5 17.5a5.5 5.5 0 0 1 0-7.8l3.2-3.2a5.5 5.5 0 0 1 7.8 7.8l-3.2 3.2a5.5 5.5 0 0 1-7.8 0Z"/><circle cx="9.8" cy="14.2" r="1.6"/>',
  egg:        '<path d="M12 3.5c3.3 0 6 5 6 9a6 6 0 0 1-12 0c0-4 2.7-9 6-9Z"/>',
  seated:     '<path d="M3.5 19.5h17"/><path d="M7 19.5v-4a2 2 0 0 1 2-2h6.5"/><path d="M15.5 13.5V8a2 2 0 0 1 2-2h1.5"/><circle cx="7" cy="9" r="2"/>',
  walk:       '<circle cx="13" cy="4.5" r="2"/><path d="M9 21l2.5-5.5L9.5 12l-.8-3.5 3.8-1 2.5 3 2.8 1.2"/><path d="M11.5 15.5 15 21"/>',
  exercise:   '<path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11M7 12h10"/>',

  /* ── interface ── */
  check:      '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  cross:      '<path d="M6 6l12 12M18 6 6 18"/>',
  ban:        '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
  mic:        '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0M12 17.5V21.5M8.5 21.5h7"/>',
  speaker:    '<path d="M11 4.5 6 8.5H3v7h3l5 4Z"/><path d="M15 9a4.5 4.5 0 0 1 0 6"/><path d="M18 5.8a9 9 0 0 1 0 12.4"/>',
  globe:      '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5Z"/>',
  hand:       '<path d="M8 12V5.5a1.6 1.6 0 0 1 3.2 0V11"/><path d="M11.2 10.6V4.6a1.6 1.6 0 0 1 3.2 0V11"/><path d="M14.4 11V6.8a1.6 1.6 0 0 1 3.2 0v7.4c0 3.7-2.4 6.3-5.8 6.3S6 18.4 6 15.2v-2.6a1.6 1.6 0 0 1 2.9-.9"/>',
  home:       '<path d="M3.5 10.5 12 3.5l8.5 7v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M9.5 21.5v-7h5v7"/>',
  zoom:       '<circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21M8.5 11h5M11 8.5v5"/>',
  contrast:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
  lock:       '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  document:   '<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><path d="M13.5 3v5.5H19M8.5 13h7M8.5 16.5h4.5"/>',
  camera:     '<path d="M4 8.5V7a2 2 0 0 1 2-2h1.6l1-2h6.8l1 2H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="13" r="3.6"/>',
  person:     '<circle cx="12" cy="7.5" r="3.8"/><path d="M4.5 21v-1.5A5.5 5.5 0 0 1 10 14h4a5.5 5.5 0 0 1 5.5 5.5V21"/>',
  people:     '<circle cx="9" cy="7.5" r="3.4"/><path d="M2.5 21v-1.4A5.1 5.1 0 0 1 7.6 14.5h2.8a5.1 5.1 0 0 1 5.1 5.1V21"/><path d="M16 4.4a3.4 3.4 0 0 1 0 6.5M17.5 14.7a5.1 5.1 0 0 1 4 5V21"/>',
  alert:      '<path d="M12 3.5 21.5 20H2.5Z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  restart:    '<path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1"/><path d="M3.5 19v-5h5"/>',
  arrow:      '<path d="M4 12h15M13 6l6 6-6 6"/>',
  spark:      '<path d="M12 3v3.5M12 17.5V21M4.5 12H8M16 12h3.5M6.7 6.7l2.5 2.5M14.8 14.8l2.5 2.5M17.3 6.7l-2.5 2.5M9.2 14.8l-2.5 2.5"/><circle cx="12" cy="12" r="2.6"/>',
  lotus:      '<path d="M12 20c-4.5 0-8-2.8-8-6 0-1 .4-1.9 1-2.6 1.6.4 3 1.3 4 2.4"/><path d="M12 20c4.5 0 8-2.8 8-6 0-1-.4-1.9-1-2.6-1.6.4-3 1.3-4 2.4"/><path d="M12 20c-2.4-1.8-4-4.4-4-7 0-2.4 1.5-4.8 4-6.8 2.5 2 4 4.4 4 6.8 0 2.6-1.6 5.2-4 7Z"/>',
  stairs:     '<path d="M3.5 20.5h4v-4h4v-4h4v-4h5"/>',
  snow:       '<path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9"/>',
  sunrise:    '<path d="M2.5 18.5h19M12 4v5M8.5 7.5 12 4l3.5 3.5"/><path d="M5.5 14.5a6.5 6.5 0 0 1 13 0"/>',
  faded:      '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 3"/>',
  pill:       '<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="3.6" transform="rotate(-45 12 12)"/><path d="M8.8 8.8 15.2 15.2"/>',
  dust:       '<circle cx="7" cy="8" r="1.4"/><circle cx="14.5" cy="6" r="1.1"/><circle cx="18" cy="11" r="1.5"/><circle cx="10" cy="13" r="1.2"/><circle cx="6" cy="17" r="1.3"/><circle cx="15" cy="17.5" r="1.1"/>',
  ribbon:     '<path d="M12 21.5 8.6 15.6M12 21.5l3.4-5.9"/><path d="M15.6 4.2c1.9 1.1 2.6 3.6 1.5 5.5l-4.3 7.4a1 1 0 0 1-1.7 0L6.8 9.7C5.7 7.8 6.4 5.3 8.3 4.2s4.4-.4 5.5 1.5"/>',
  nut:        '<path d="M9 4.5c3 0 5.5 2 5.5 5.5S12.6 20 9.6 20 4 16.5 4 12.5 6 4.5 9 4.5Z"/><path d="M14.5 8.5c2.6.4 5.5 2 5.5 5.5S17 20 14.5 19"/>',
};

/* Five drawn faces for the severity scale. Kept as faces because a face is the
   one pictogram a low-literacy reader never has to be taught — but drawn, not
   emoji, so they sit in the same visual world as everything else. */
var FACE_PATHS = [
  '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.8h.01M15.4 9.8h.01"/><path d="M8 14.2a5 5 0 0 0 8 0"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.8h.01M15.4 9.8h.01"/><path d="M8.4 14.6a4.6 4.6 0 0 0 7.2 0"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.8h.01M15.4 9.8h.01"/><path d="M8.4 15h7.2"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.8h.01M15.4 9.8h.01"/><path d="M8.4 16a4.6 4.6 0 0 1 7.2 0"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M7.6 8.8 10 10.4M16.4 8.8 14 10.4"/><path d="M8 16.6a5 5 0 0 1 8 0"/><path d="M9.5 14.4h5"/>',
];

function ICON(name, size) {
  var d = ICONS[name];
  if (!d) d = ICONS.faded;
  var s = size || 24;
  return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' + d + "</svg>";
}

function FACE(i, size) {
  var s = size || 30;
  return '<svg class="face-svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' + (FACE_PATHS[i] || FACE_PATHS[2]) + "</svg>";
}

window.ICON = ICON;
window.FACE = FACE;
