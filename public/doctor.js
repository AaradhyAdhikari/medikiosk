"use strict";
/* MediKiosk — the consultation console. */

var stage = document.getElementById("stage");
var D = {
  clinician: null, view: "queue", data: null, visit: null, scan: null, timer: null,
  departments: [],   // the hospital's clinics, from the server
  showAll: false,    // specialist has lifted their own department filter
};

/* ── departments ────────────────────────────────────────
   One source of truth, served by the server, so a clinic cannot exist on the
   registration form and not in the router. */
function deptById(id) {
  for (var i = 0; i < D.departments.length; i++) if (D.departments[i].id === id) return D.departments[i];
  return null;
}
function deptName(id) {
  if (!id) return "Unassigned";
  if (id === "GENERAL") return "All departments";
  var d = deptById(id);
  return d ? d.en : id;
}
function deptOptions(selected, includeGeneral) {
  var ayush = D.departments.filter(function (d) { return d.system === "ayush"; });
  var bio = D.departments.filter(function (d) { return d.system === "biomed"; });
  var opt = function (d) {
    return '<option value="' + esc(d.id) + '"' + (d.id === selected ? " selected" : "") + ">" +
      esc(d.en) + " · " + esc(d.hi) + "</option>";
  };
  var group = function (name, list) {
    return list.length ? '<optgroup label="' + name + '">' + list.map(opt).join("") + "</optgroup>" : "";
  };
  return (includeGeneral
      ? '<option value="GENERAL"' + (selected === "GENERAL" ? " selected" : "") +
        ">General clinician — every department</option>"
      : "") +
    group("AYUSH departments", ayush) +
    group("Biomedical departments", bio);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
async function api(url, bodyObj, method) {
  var r = await fetch(url, {
    method: method || "GET",
    headers: bodyObj ? { "Content-Type": "application/json" } : undefined,
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}
function shell(inner) { stage.innerHTML = '<div class="doc"><div class="dcard">' + inner + "</div></div>"; }

/* ── document timeline ──────────────────────────────
   Documents arrive from the server ordered by the date printed on them, so a
   prior investigation is read in the order it happened. The chip states which
   date that is, and says so plainly when none could be read — an unlabelled
   document at the end of a list would otherwise read as the most recent one. */
function docChip(d) {
  if (d && d.docDate) {
    var t = new Date(d.docDate);
    if (!isNaN(t)) {
      return '<span class="datechip">' + ICON("calendar", 12) + " " +
        esc(t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span>";
    }
  }
  return '<span class="datechip undated" title="No date could be read from this document">' +
    ICON("hourglass", 12) + " undated</span>";
}

/* ── login ──────────────────────────────────────────── */

function lbl(t) {
  return '<label style="display:block;font-size:13px;font-weight:700;color:var(--muted);margin:14px 0 5px">' + t + "</label>";
}

function renderLogin(err, opts) {
  opts = opts || {};
  var mode = opts.mode || (D.firstRun ? "register" : "login");
  var registering = mode === "register";

  stage.innerHTML =
    '<div class="doc"><form class="dcard" id="lf" style="max-width:560px;margin:0 auto">' +
    '<div class="dhead"><span class="hic">' + ICON("person", 22) + '</span><div><h2>Consultation Console</h2>' +
    '<div class="sub">' + (D.hospital || "OPD") + "</div></div></div>" +
    '<div class="dbody">' +

    (D.firstRun
      ? '<div class="notice jade" style="margin-bottom:16px"><b>First run.</b> No clinician accounts exist yet. ' +
        "The account you create now is approved automatically; every account after it waits for approval from a " +
        "registered clinician.</div>"
      : "") +

    (registering
      ? lbl("FULL NAME") + '<input class="field" id="nm" placeholder="Dr. R. Mehra" autocomplete="name">' +
        lbl("HOSPITAL EMAIL") + '<input class="field" id="em" type="email" placeholder="name@hospital.gov.in" autocomplete="username">' +
        lbl('HPR ID <span style="font-weight:500;text-transform:none">· Healthcare Professional Registry, optional</span>') +
        '<input class="field mono" id="hp" placeholder="71-4402-9318-5507">' +
        lbl("DEPARTMENT <span style=\"font-weight:500;text-transform:none\">· this is the queue you will be given</span>") +
        '<select class="field" id="dpid">' + deptOptions("", true) +
          '<option value="OTHER">Other — I\'ll type it</option></select>' +
        '<div id="dpother" style="display:none">' +
          lbl("YOUR SPECIALTY") +
          '<input class="field" id="dp" placeholder="e.g. Rheumatology">' +
          '<p style="font-size:12px;color:var(--muted);margin:6px 0 0;line-height:1.5">' +
          "A specialty that is not on the hospital's list cannot be routed to automatically, so you will be " +
          "given the full queue until it is added. Nothing is hidden from you.</p>" +
        "</div>" +
        '<p style="font-size:12.5px;color:var(--muted);margin:8px 0 0;line-height:1.5" id="dphint"></p>' +
        lbl("ROOM") + '<input class="field" id="rm" placeholder="Room 4">' +
        lbl("PASSWORD <span style=\"font-weight:500;text-transform:none\">· at least 8 characters</span>") +
        '<input class="field" id="pw" type="password" autocomplete="new-password">'
      : lbl("HOSPITAL EMAIL") + '<input class="field" id="em" type="email" placeholder="name@hospital.gov.in" autocomplete="username">' +
        lbl("PASSWORD") + '<input class="field" id="pw" type="password" autocomplete="current-password">') +

    (err ? '<div class="notice" style="margin-top:14px">' + esc(err) + "</div>" : "") +
    (opts.info ? '<div class="notice jade" style="margin-top:14px">' + esc(opts.info) + "</div>" : "") +

    '<button class="btn" style="margin-top:16px" id="go">' + (registering ? "Create account" : "Sign in") + "</button>" +
    (D.firstRun ? "" :
      '<button type="button" class="btn ghost" style="margin-top:9px" id="swap">' +
      (registering ? "I already have an account" : "Register a new clinician") + "</button>") +
    '<a class="btn ghost" href="/" style="margin-top:9px;text-decoration:none">← Back</a>' +
    '<p style="font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.5">' +
      "In deployment this authenticates against the hospital directory and verifies the HPR ID, so every amendment " +
      "in a patient record is attributable to a registered practitioner rather than to a room number.</p>" +
    "</div></form></div>";

  var swap = document.getElementById("swap");
  if (swap) swap.onclick = function () { renderLogin("", { mode: registering ? "login" : "register" }); };

  var dpid = document.getElementById("dpid");
  if (dpid) {
    var syncDept = function () {
      var v = dpid.value;
      document.getElementById("dpother").style.display = v === "OTHER" ? "block" : "none";
      var hint = document.getElementById("dphint");
      if (v === "GENERAL") {
        hint.textContent = "You will see every patient in the hospital, in every department.";
      } else if (v === "OTHER" || !v) {
        hint.textContent = "";
      } else {
        var d = deptById(v);
        hint.textContent = d
          ? "Your queue will show patients routed to " + d.en + " — plus anything flagged urgent, and anything not yet routed."
          : "";
      }
    };
    dpid.onchange = syncDept;
    syncDept();
  }

  document.getElementById("lf").onsubmit = async function (e) {
    e.preventDefault();
    var btn = document.getElementById("go");
    btn.disabled = true; btn.textContent = registering ? "Creating…" : "Signing in…";
    var val = function (id) { var n = document.getElementById(id); return n ? n.value : ""; };
    try {
      if (registering) {
        var chosen = val("dpid");
        var r = await api("/api/doctor/register", {
          name: val("nm"), email: val("em"), password: val("pw"), hprId: val("hp"),
          departmentId: chosen === "OTHER" ? "" : chosen,
          department: chosen === "OTHER" ? val("dp") : "",
          room: val("rm"),
        }, "POST");
        if (r.approved) { D.firstRun = false; D.clinician = r.clinician; return afterSignIn(); }
        D.firstRun = false;
        return renderLogin("", { mode: "login", info: r.message });
      }
      var l = await api("/api/doctor/login", { email: val("em"), password: val("pw") }, "POST");
      D.clinician = l.clinician;
      afterSignIn();
    } catch (err) { renderLogin(err.message, { mode: mode }); }
  };
}

/* ── queue ──────────────────────────────────────────── */

/* One entry point after a successful sign-in, so a scanned slip behaves the
   same whether the clinician was already signed in or had to log in first. */
function afterSignIn() {
  if (D.pendingVisit) {
    var id = D.pendingVisit;
    D.pendingVisit = null;
    clearInterval(D.timer);
    loadQueue();                      // keep the queue fresh behind the case
    D.timer = setInterval(function () { if (D.view === "queue") loadQueue(); }, 4000);
    return openVisit(id);
  }
  startQueue();
}

function startQueue() {
  D.view = "queue";
  clearInterval(D.timer);
  loadQueue();
  D.timer = setInterval(function () { if (D.view === "queue") loadQueue(); }, 4000);
}

async function loadQueue() {
  try {
    D.data = await api("/api/queue" + (D.showAll ? "?all=1" : ""));
    if (D.view === "queue") renderQueue();
  } catch (e) {
    if (String(e.message).indexOf("Sign in") > -1) { clearInterval(D.timer); D.clinician = null; renderLogin(); }
  }
}

function badgeFor(v) {
  if (v.status === "ASSESSED") return '<span class="badge jade">' + ICON("check",12) + ' Assessed</span>';
  if (v.status === "IN_CONSULT") return '<span class="badge haldi">In consultation</span>';
  if (v.redFlag) return '<span class="badge red">Red flag</span>';
  return '<span class="badge grey">Waiting</span>';
}

function rowHtml(v) {
  var age = v.patient.ageYears ? ", " + v.patient.ageYears : "";
  return '<button class="qrow' + (v.redFlag && v.status !== "ASSESSED" ? " flag" : "") +
    (v.status === "ASSESSED" ? " done" : "") + '" data-id="' + esc(v.id) + '">' +
    '<span class="tok">' + esc(v.token) + "</span>" +
    '<span><p class="nm">' + esc(v.patient.name + age) + "</p>" +
    '<p class="mt">' + esc(String(v.chiefComplaint).slice(0, 80)) + "</p></span>" +
    '<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + badgeFor(v) +
    (v.languageName && v.language !== "hi" && v.language !== "en"
      ? '<span class="badge lang" title="This patient answered the interview in ' +
        esc(v.languageName) + '">' + esc(v.languageName) + "</span>"
      : "") +
    (v.department
      ? '<span class="badge dept' + (v.crossDepartment ? " cross" : "") + '" title="' +
        esc(v.crossDepartment
          ? "Another department's patient — shown to you because it is flagged urgent"
          : "Routed to " + deptName(v.department)) + '">' +
        esc(deptName(v.department)) + (v.reassigned ? " ·\u00a0reassigned" : "") + "</span>"
      : '<span class="badge haldi" title="No department yet — needs triage">Unrouted</span>') +
    '<span class="badge ' + (v.visitType === "FOLLOW_UP" ? "haldi" : "jade") + '">' +
      (v.visitType === "FOLLOW_UP" ? "Follow-up" : v.visitType === "PROXY" ? "Proxy" : "First visit") + "</span>" +
    (v.documentCount ? '<span class="badge grey">' + v.documentCount + " doc</span>" : "") +
    (v.example ? '<span class="badge grey">example</span>' : "") +
    "</span></button>";
}

function emptyQueueHtml() {
  return '<div class="panel" style="text-align:center;padding:34px 20px">' +
    '<div class="bigmark">' + ICON("lotus", 40) + '</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:6px">Nobody waiting</div>' +
    '<p style="font-size:15px;color:var(--muted);line-height:1.55;margin:0 auto;max-width:48ch">' +
    'Open <b>/kiosk</b> in another tab, finish an interview, and the patient appears here within four seconds. ' +
    'This is a live queue — it fills from real use, not from sample data.</p>' +
    ((D.data && D.data.scope && !D.data.scope.isGeneralist && D.data.scope.hidden)
      ? '<p style="font-size:14px;color:var(--muted);margin:10px auto 0;max-width:48ch">' +
        "There " + (D.data.scope.hidden === 1 ? "is 1 patient" : "are " + D.data.scope.hidden + " patients") +
        " waiting in other departments. Use <b>Show all departments</b> above if you are covering for a colleague.</p>"
      : "") +
    '<button class="btn ghost" id="loadex" style="margin:18px auto 0;max-width:340px;font-size:14px;padding:11px 16px">' +
    'Load two example patients</button>' +
    '<p style="font-size:12px;color:var(--muted);margin:8px 0 0">For screenshots only — they are labelled as examples, ' +
    'and deleting the data folder clears them.</p></div>';
}

/* The scope strip. A filtered queue must say so on the screen — a doctor who
   does not know a filter is on will read an empty queue as an empty hospital.
   It names the department, counts what is not being shown, and offers the
   override in the same breath as the fact that using it is recorded. */
function scopeBar(scope) {
  if (!scope) return "";
  if (scope.isGeneralist) {
    return '<div class="scopebar gen">' + ICON("people", 15) +
      "<span><b>General clinician</b> — you see every department.</span></div>";
  }
  if (scope.showingAll) {
    return '<div class="scopebar all">' + ICON("zoom", 15) +
      "<span><b>Showing every department.</b> You are outside " + esc(scope.label) +
      ". This view is recorded in the audit trail.</span>" +
      '<button class="badge grey" id="scopeoff" style="padding:7px 12px">Back to ' + esc(scope.label) + "</button></div>";
  }
  return '<div class="scopebar">' + ICON("lotus", 15) +
    "<span><b>" + esc(scope.label) + "</b> queue" +
    (scope.hidden
      ? " · " + scope.hidden + " patient" + (scope.hidden === 1 ? "" : "s") + " in other departments " +
        "<span style=\"color:var(--muted)\">(not shown)</span>"
      : "") +
    " · urgent and unrouted cases always appear here</span>" +
    '<button class="badge grey" id="scopeon" style="padding:7px 12px">Show all departments</button></div>';
}

function renderQueue() {
  var d = D.data || { visits: [], stats: {} };
  var active = d.visits.filter(function (v) { return v.status !== "ASSESSED"; });
  var done = d.visits.filter(function (v) { return v.status === "ASSESSED"; });
  var rank = function (v) { return v.status === "IN_CONSULT" ? 2 : v.redFlag ? 1 : 0; };
  active.sort(function (a, b) { return rank(b) - rank(a); });

  shell(
    '<div class="dhead"><span class="hic">' + ICON("person", 22) + '</span><div><h2>OPD Queue · live</h2>' +
    '<div class="sub">' + esc(D.clinician.name) + (D.clinician.department ? " · " + esc(D.clinician.department) : "") +
      (D.clinician.room ? " · " + esc(D.clinician.room) : "") + "</div></div>" +
    '<span class="spacer"></span><button class="badge grey" id="out" style="padding:7px 13px">Sign out</button></div>' +
    '<div class="dbody">' +
      scopeBar(d.scope) +
      '<div class="stats">' +
        '<div class="stat"><b>' + (d.stats.waiting || 0) + "</b><span>WAITING NOW</span></div>" +
        '<div class="stat"><b style="color:var(--vermilion)">' + (d.stats.redFlags || 0) + "</b><span>RED FLAGS</span></div>" +
        '<div class="stat"><b style="color:var(--jade)">' + (d.stats.assessed || 0) + "</b><span>ASSESSED</span></div>" +
        '<div class="stat"><b>' + (d.stats.total || 0) + "</b><span>INTAKES TODAY</span></div>" +
        '<div class="stat"><b style="color:var(--jade)">' + (d.stats.minutesSaved || 0) +
          '<span style="font-size:15px"> min</span></b><span>CONSULT TIME SAVED</span></div>' +
      "</div>" +
      '<h3 style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px">Patients ready</h3>' +
      (active.length ? active.map(rowHtml).join("") : emptyQueueHtml()) +
      (done.length ? '<h3 style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:24px 0 10px">' +
        "Assessed today</h3>" + done.reverse().map(rowHtml).join("") : "") +
    "</div>"
  );

  document.getElementById("out").onclick = async function () {
    await api("/api/doctor/logout", {}, "POST");
    clearInterval(D.timer); D.clinician = null; renderLogin();
  };
  var on = document.getElementById("scopeon");
  if (on) on.onclick = function () { D.showAll = true; loadQueue(); };
  var off = document.getElementById("scopeoff");
  if (off) off.onclick = function () { D.showAll = false; loadQueue(); };

  var lx = document.getElementById("loadex");
  if (lx) lx.onclick = async function () {
    lx.disabled = true; lx.textContent = "Loading…";
    try { await api("/api/examples", {}, "POST"); await loadQueue(); }
    catch (e) { lx.textContent = e.message; }
  };
  stage.querySelectorAll("[data-id]").forEach(function (el) {
    el.onclick = function () { openVisit(el.dataset.id); };
  });
}

/* ── one case ───────────────────────────────────────── */

async function openVisit(id) {
  D.view = "case";
  D.amending = false;
  shell('<div class="dbody"><div class="thinking"><span class="spinner"></span>Loading the patient\'s history…</div></div>');
  try {
    var r = await api("/api/visits/" + id);
    D.visit = r.visit;
    renderCase();
  } catch (e) {
    shell('<div class="dbody"><div class="notice">' + esc(e.message) + "</div></div>");
  }
}

async function patchVisit(body) {
  try {
    var r = await api("/api/visits/" + D.visit.id, body, "PATCH");
    Object.assign(D.visit, r.visit);
    renderCase();
  } catch (e) { alert(e.message); }
}

function prov(kind) {
  return '<span class="prov ' + kind + '">' + (kind === "voice" ? ICON("mic",13) + " said" : kind === "doc" ? ICON("document",13) + " report" : ICON("hand",13) + " tapped") + "</span>";
}
// Provenance chip only. Verification happens once, for the whole history —
// ten decisions where one will do is a tax on a physician with three minutes.
function line(t, v, src) {
  if (!v) return "";
  return '<div class="hline"><dt>' + t + "</dt>" +
    '<dd><span class="lval">' + esc(v) + "</span>" + (src ? prov(src) : "") + "</dd></div>";
}

// Amend mode: the same fields, editable.
function editLine(t, v, field) {
  return '<div class="hline"><dt>' + t + "</dt>" +
    '<dd><textarea class="amend" data-f="' + field + '" rows="2">' + esc(v || "") + "</textarea></dd></div>";
}

/* Visits recorded before the kiosk asked this question carry no system, and
   those were all full Ayurvedic intakes — so that is what they read as. */
var SYSTEM_LABEL = { AYURVEDIC: "Ayurvedic", ALLOPATHIC: "Allopathic", BOTH: "Ayurvedic + allopathic" };

/* Which language the patient answered in. It belongs in the header next to
   the system of medicine, because it changes how the physician reads a quoted
   phrase — and because a summary that quotes Tamil without saying so looks
   like a bug rather than like the patient's own words. */
var LANG_NAMES_D = { hi: "Hindi", en: "English", mr: "Marathi", gu: "Gujarati",
  pa: "Punjabi", ta: "Tamil", te: "Telugu" };
function sysOf(v) { return SYSTEM_LABEL[v && v.system] ? v.system : "AYURVEDIC"; }

/* ── routing panel ──────────────────────────────────────
   Where this patient has been sent, why, and the control to send them
   somewhere else. It sits at the top of the right-hand column because the
   first question a doctor asks about a patient who is not theirs is "why am
   I looking at this?", and the second is "who should have them?". */
function routingPanel(v) {
  var s = v.summary || {};
  var dep = s.department || {};
  var id = v.department || dep.id || null;
  var src = v.departmentSource || dep.source || null;
  var conf = v.departmentConfidence || dep.confidence || "low";

  var origin =
    src === "clinician" ? "Set by a clinician" :
    src === "ai" ? "Suggested by AI from the intake" :
    src === "rules" ? "Matched by keyword from the intake" :
    src === "example" ? "Example patient" : "Not yet routed";

  var alts = (dep.alternates || []).filter(function (x) { return x !== id; });

  return '<div class="panel routing"><h3>Department routing</h3>' +
    '<div class="deptpick">' +
      '<div class="deptnow">' + ICON("person", 18) +
        "<div><b>" + esc(deptName(id)) + "</b>" +
        '<small>' + esc(origin) + " · confidence " + esc(conf) + "</small></div>" +
      "</div>" +
    "</div>" +

    (dep.reasoning ? '<p class="deptwhy">' + esc(dep.reasoning) + "</p>" : "") +

    (dep.source === "ai" && dep.ruleSuggestion && dep.agreed === false
      ? '<p class="deptwhy" style="color:var(--muted)">The keyword router would have sent this to ' +
        esc(deptName(dep.ruleSuggestion)) + ". The model\'s reading was used instead — worth a glance.</p>"
      : "") +

    (v.departmentReassignedBy
      ? '<p class="deptwhy" style="color:var(--muted)">Reassigned from ' + esc(deptName(v.departmentPrevious)) +
        (v.departmentReassignReason ? " — " + esc(v.departmentReassignReason) : "") + "</p>"
      : "") +

    (alts.length
      ? '<div class="deptalt"><span>Also considered:</span>' +
        alts.map(function (x) { return "<b>" + esc(deptName(x)) + "</b>"; }).join("") + "</div>"
      : "") +

    '<label class="deptlbl" for="deptsel">Send to a different department</label>' +
    '<select class="field" id="deptsel" style="margin-bottom:8px">' + deptOptions(id, false) + "</select>" +
    '<input class="field" id="deptwhy" placeholder="Why (optional — kept on the record)" style="margin-bottom:9px">' +
    '<button class="btn ghost" id="deptgo" style="font-size:15px;padding:11px">Reassign</button>' +
    '<p style="font-size:12.5px;color:var(--muted);margin:9px 0 0;line-height:1.5">' +
      "The kiosk suggests a department; you decide it. Reassigning moves this patient to that clinic\'s queue " +
      "and records who moved them. Urgent cases stay visible to every clinician regardless.</p>" +
    "</div>";
}

function renderCase() {
  var v = D.visit, s = v.summary || {}, a = s.ayurveda || {};
  var pk = a.prakriti || { vata: 33, pitta: 33, kapha: 34 };
  var docs = v.documents || [];

  shell(
    '<div class="dhead"><button class="badge grey" id="bk" style="padding:7px 13px">← Queue</button>' +
    "<div><h2>" + esc(v.patient.name) + (v.patient.ageYears ? ", " + v.patient.ageYears : "") +
      ' · <span class="mono">' + esc(v.token) + "</span></h2>" +
    '<div class="sub mono">ABHA ' + esc(v.patient.abhaNumber || "—") + " · " +
      (v.visitType === "FOLLOW_UP" ? "Follow-up" : "First visit") +
      " · " + SYSTEM_LABEL[sysOf(v)] +
      (v.language && v.language !== "en"
        ? " · answered in " + esc(LANG_NAMES_D[v.language] || v.language) : "") +
      "</div></div>" +
    '<span class="spacer"></span>' +
    (v.department ? '<span class="badge dept" style="padding:8px 13px">' + esc(deptName(v.department)) + "</span>" : "") +
    (v.redFlag ? '<span class="badge red">Red flag</span>' : "") + "</div>" +

    '<div class="dbody">' +
      '<div class="actionbar">' +
        (v.status === "ASSESSED"
          ? '<span class="badge jade" style="padding:10px 15px">✓ Assessed</span><button class="btn ghost" id="reopen">Reopen</button>'
          : v.status === "IN_CONSULT"
          ? '<span class="badge haldi" style="padding:10px 15px">In consultation now</span><button class="btn ghost" id="assessed">Mark as assessed</button>'
          : '<button class="btn" id="callin">Call patient in</button>') +
        '<span style="flex:1"></span><span style="font-size:13px;color:var(--muted)">' +
        docs.length + " document(s)" + (s.triage ? " · triage: " + esc(String(s.triage).toLowerCase()) : "") + "</span>" +
      "</div>" +

      (s.redFlags && s.redFlags.length
        ? '<div class="alert" style="margin-bottom:16px;padding:14px 16px"><b style="color:var(--vermilion);font-size:16px">' + ICON("alert",17) + ' Flagged at intake</b>' +
          '<ul style="margin:6px 0 0;padding-left:20px;font-size:15.5px">' +
          s.redFlags.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul></div>"
        : "") +

      '<div class="split"><div>' +
        '<div class="panel"><h3>Structured history · AI draft, you verify</h3>' +
          (s.narrative && !D.amending
            ? '<p style="font-size:16.5px;line-height:1.6;margin:0 0 14px;padding:13px 15px;background:var(--surface);' +
              'border-radius:12px;border-left:3px solid var(--jade)">' + esc(s.narrative) + "</p>"
            : "") +
          '<dl style="margin:0">' +
            (D.amending
              ? editLine("Chief complaint", s.chiefComplaint, "chiefComplaint") +
                editLine("History of present illness", s.hpi, "hpi") +
                (s.changeSinceLastVisit ? editLine("Change since last visit", s.changeSinceLastVisit, "changeSinceLastVisit") : "") +
                editLine("Past history", s.pastHistory, "pastHistory") +
                editLine("Medications", s.medications, "medications") +
                editLine("Allergies", s.allergies, "allergies") +
                editLine("Family history", s.familyHistory, "familyHistory") +
                editLine("Personal", s.personal, "personal") +
                editLine("Review of systems", s.ros, "ros") +
                editLine("Prior investigations", s.priorInvestigations, "priorInvestigations")
              : line("Chief complaint", s.chiefComplaint, "voice") +
                line("History of present illness", s.hpi, "voice") +
                line("Change since last visit", s.changeSinceLastVisit, "voice") +
                line("Past history", s.pastHistory, "touch") +
                line("Medications", s.medications, docs.length ? "doc" : "voice") +
                line("Allergies", s.allergies, "touch") +
                line("Family history", s.familyHistory, "touch") +
                line("Personal", s.personal, "touch") +
                line("Review of systems", s.ros, "touch") +
                line("Prior investigations", s.priorInvestigations, "doc")) +
          "</dl>" +

          (D.amending
            ? '<div class="row" style="margin-top:14px">' +
                '<button class="btn" id="saveamend" style="font-size:16px;padding:13px">Save changes</button>' +
                '<button class="btn ghost" id="cancelamend" style="font-size:16px;padding:13px">Cancel</button></div>'
            : v.historyVerified
              ? '<div class="verified ' + v.historyVerified + '">' +
                  ICON("check", 18) + "<span>History " + v.historyVerified + " by you" +
                  (v.historyVerified === "amended" ? " — your wording is what entered the record" : " as drafted") +
                  "</span></div>" +
                '<div class="row" style="margin-top:10px">' +
                  '<button class="btn ghost" id="amend" style="font-size:15px;padding:11px">Amend again</button></div>'
              : '<div class="row" style="margin-top:14px">' +
                  '<button class="btn" id="accept" style="font-size:16px;padding:13px">Accept history</button>' +
                  '<button class="btn ghost" id="amend" style="font-size:16px;padding:13px">Amend</button></div>') +

          '<div class="row" style="margin-top:10px"><button class="btn ghost" id="emr" style="font-size:15px;padding:11px"' +
            (v.pushedToEmr ? " disabled" : "") + ">" + (v.pushedToEmr ? "Pushed via FHIR \u00b7 done" : "Push to hospital EMR") + "</button></div>" +
          '<p style="font-size:12.5px;color:var(--muted);margin:10px 0 0">' +
            (s.generated === "ai" ? "Generated from the patient's kiosk interview." :
             s.generated === "example" ? "Example patient, loaded deliberately — not a real intake." :
             "Assembled from the kiosk answers without AI.") +
            " Never an autonomous diagnosis. Nothing here enters the record until you accept or amend it.</p>" +
        "</div>" +

        (s.assessment || (s.differentials && s.differentials.length) || (s.investigations && s.investigations.length)
          ? '<div class="assess"><h3>AI assessment · for your consideration</h3>' +
            '<p class="dis">Pattern-matching from the intake interview only. No examination has been performed and no diagnosis is asserted.</p>' +
            (s.assessment ? '<p style="font-size:16px;line-height:1.6;margin:0 0 13px">' + esc(s.assessment) + "</p>" : "") +
            (s.differentials && s.differentials.length
              ? '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#14604D;margin:0 0 6px">Worth ruling in or out</div>' +
                '<div style="margin-bottom:13px">' + s.differentials.map(function (x) {
                  return '<div class="dxrow"><b>' + esc(x.condition) + "</b><small>" + esc(x.why) + "</small></div>";
                }).join("") + "</div>" : "") +
            (s.investigations && s.investigations.length
              ? '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#14604D;margin:0 0 6px">Examinations or tests to consider</div>' +
                "<ul>" + s.investigations.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
            "</div>"
          : "") +

        (s.suggestedQuestions && s.suggestedQuestions.length
          ? '<div class="panel" style="margin-top:16px"><h3>Worth asking</h3><ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.7">' +
            s.suggestedQuestions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"
          : "") +

        '<div class="panel rx" style="margin-top:16px"><h3>Diagnosis &amp; prescription</h3>' +
          '<input class="field" id="dx" placeholder="Diagnosis" value="' + esc(v.diagnosis || "") + '" style="margin-bottom:9px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:9px">' +
            '<input class="field mono" id="icd" placeholder="ICD-10" value="' +
              esc(v.icd10 || (s.coding && s.coding.icd10) || "") + '" style="font-size:14px;padding:12px">' +
            '<input class="field mono" id="nam" placeholder="NAMASTE (AYUSH)" value="' +
              esc(v.namaste || (s.coding && s.coding.namaste) || "") + '" style="font-size:14px;padding:12px">' +
          "</div>" +
          (s.coding && (s.coding.icd10 || s.coding.namaste)
            ? '<p style="font-size:12.5px;color:var(--muted);margin:-2px 0 9px">Codes above are AI suggestions ' +
              "(confidence: " + esc(s.coding.confidence || "low") + "). Confirm or replace them.</p>"
            : "") +
          '<textarea id="rx" placeholder="Medicines, dose, duration, advice">' + esc(v.prescription || "") + "</textarea>" +
          '<button class="btn" id="save" style="margin-top:11px">Save &amp; mark assessed</button>' +
          '<p style="font-size:12.5px;color:var(--muted);margin:9px 0 0">Writes back to the patient\'s record, so their next ' +
          "follow-up interview starts from this.</p></div>" +
      "</div><div>" +

        routingPanel(v) +

        '<div style="height:16px"></div>' +

        (sysOf(v) === "ALLOPATHIC"
          ? '<div class="panel"><h3>Ayurvedic examination</h3>' +
            '<p style="font-size:13px;color:var(--muted);margin:0;line-height:1.5">This patient chose ' +
            'allopathic treatment, so the Dashavidha Pariksha was not asked at the kiosk. Nothing was ' +
            'skipped by mistake, and nothing here has been inferred.</p></div>'
          :
          '<div class="panel"><h3 class="dev" style="font-size:15px;letter-spacing:0;text-transform:none;color:var(--jade)">प्रकृति · Prakriti indicators</h3>' +
            '<div class="dosha">' +
              '<div style="width:' + pk.vata + '%;background:#5B8FB9">V ' + pk.vata + "%</div>" +
              '<div style="width:' + pk.pitta + '%;background:#C8891F">P ' + pk.pitta + "%</div>" +
              '<div style="width:' + pk.kapha + '%;background:#1F8A70">K ' + pk.kapha + "%</div>" +
            "</div>" +
            (a.dashavidha && a.dashavidha.length
              ? '<table class="dvtable"><thead><tr><th>परीक्षा</th><th>Reported</th></tr></thead><tbody>' +
                a.dashavidha.map(function (d) {
                  return "<tr" + (d.elicited === false ? ' class="miss"' : "") + "><td>" + esc(d.parameter) + "</td><td>" +
                    esc(d.finding || "Not elicited") + "</td></tr>";
                }).join("") + "</tbody></table>" +
                '<p style="font-size:12px;color:var(--muted);margin:6px 0 0">' +
                a.dashavidha.filter(function (d) { return d.elicited !== false; }).length +
                " of 10 elicited at the kiosk.</p>"
              : "") +
            '<div class="hline" style="margin-top:12px"><dt>Agni</dt><dd>' + esc(a.agni || "Not assessed") + "</dd></div>" +
            (a.koshtha ? '<div class="hline"><dt>Koshtha</dt><dd>' + esc(a.koshtha) + "</dd></div>" : "") +
            (a.aharaVihara ? '<div class="hline"><dt>Ahara-Vihara</dt><dd>' + esc(a.aharaVihara) + "</dd></div>" : "") +
            (a.considerations ? '<div class="hline"><dt>Considerations</dt><dd>' + esc(a.considerations) + "</dd></div>" : "") +
            '<p style="font-size:13px;color:var(--muted);margin:8px 0 0;line-height:1.5">' +
              esc(a.note || "Screening indication from a kiosk interview. Not a substitute for your own examination.") + "</p></div>") +

        '<div class="panel" style="margin-top:16px"><h3>Patient\'s documents · oldest first</h3><div class="doclist">' +
          (docs.length ? docs.map(function (d) {
            return '<button class="docitem' + (d.docDate ? "" : " nodate") + '" data-doc="' + esc(d.id) + '">' +
              '<img src="/api/documents/' + esc(d.id) + '/image" alt="">' +
              "<span>" + docChip(d) + "<b>" + esc(d.label || "Document") + "</b><small>" +
              esc((d.extracted && d.extracted.summary) || "") + "</small></span></button>";
          }).join("") : '<p style="font-size:15px;color:var(--muted);margin:0">No documents were scanned at intake.</p>') +
        "</div>" +
        (docs.some(function (d) { return !d.docDate; })
          ? '<p style="font-size:12.5px;color:var(--muted);margin:9px 0 0;line-height:1.5">Documents are ordered by the date ' +
            "printed on them. Any whose date could not be read are listed last and marked undated, rather than being placed " +
            "in the timeline at a guess.</p>"
          : "") +
        "</div>" +
      "</div></div></div>"
  );

  document.getElementById("bk").onclick = function () { D.view = "queue"; renderQueue(); loadQueue(); };
  var callin = document.getElementById("callin");
  if (callin) callin.onclick = function () { patchVisit({ status: "IN_CONSULT" }); };
  var assessed = document.getElementById("assessed");
  if (assessed) assessed.onclick = function () { patchVisit({ status: "ASSESSED" }); };
  var reopen = document.getElementById("reopen");
  if (reopen) reopen.onclick = function () { patchVisit({ status: "IN_CONSULT" }); };
  document.getElementById("emr").onclick = function () { patchVisit({ pushToEmr: true }); };
  document.getElementById("save").onclick = async function () {
    await patchVisit({
      diagnosis: document.getElementById("dx").value,
      prescription: document.getElementById("rx").value,
      icd10: document.getElementById("icd").value,
      namaste: document.getElementById("nam").value,
      status: "ASSESSED",
    });
    D.view = "queue"; renderQueue(); loadQueue();
  };

  var deptgo = document.getElementById("deptgo");
  if (deptgo) deptgo.onclick = function () {
    var to = document.getElementById("deptsel").value;
    if (!to || to === v.department) return;
    deptgo.disabled = true; deptgo.textContent = "Reassigning…";
    patchVisit({ department: to, departmentReason: document.getElementById("deptwhy").value });
  };

  var acc = document.getElementById("accept");
  if (acc) acc.onclick = function () { patchVisit({ acceptHistory: true }); };

  var amd = document.getElementById("amend");
  if (amd) amd.onclick = function () { D.amending = true; renderCase(); };

  var cancel = document.getElementById("cancelamend");
  if (cancel) cancel.onclick = function () { D.amending = false; renderCase(); };

  var saveAmend = document.getElementById("saveamend");
  if (saveAmend) saveAmend.onclick = function () {
    var edits = {};
    stage.querySelectorAll("textarea.amend").forEach(function (t) { edits[t.dataset.f] = t.value; });
    D.amending = false;
    patchVisit({ amendHistory: edits });
  };

  stage.querySelectorAll("[data-doc]").forEach(function (el) {
    el.onclick = function () {
      var doc = docs.filter(function (d) { return d.id === el.dataset.doc; })[0];
      if (doc) openScan(doc);
    };
  });
}

function openScan(doc) {
  var e = doc.extracted || {};
  var m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = '<div class="inner">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
      '<h2 style="margin:0;font-size:20px">' + esc(doc.label || "Document") + "</h2>" + docChip(doc) +
      "<span style=\"flex:1\"></span>" +
      '<button class="badge grey" id="x" style="padding:8px 14px">Close</button></div>' +
    '<div class="split"><div class="panel" style="padding:10px">' +
      '<img src="/api/documents/' + esc(doc.id) + '/image" alt="Scanned document" style="width:100%;border-radius:10px;display:block"></div>' +
    '<div class="panel"><h3>Extracted</h3><p style="font-size:16px;line-height:1.55;margin:0 0 12px">' + esc(e.summary || "") + "</p>" +
    (e.findings && e.findings.length
      ? '<ul style="margin:0;padding-left:20px;font-size:15.5px;line-height:1.75">' +
        e.findings.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
      : '<p style="font-size:14px;color:var(--muted);margin:0">Nothing machine-readable was extracted. The original image is on the left.</p>') +
    (e.abnormal && e.abnormal.length
      ? '<div style="margin-top:14px"><div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--vermilion);margin-bottom:5px">Outside reference range</div>' +
        '<ul style="margin:0;padding-left:20px;font-size:15.5px;line-height:1.7;color:var(--vermilion)">' +
        e.abnormal.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"
      : "") +
    "</div></div></div>";
  m.onclick = function (ev) { if (ev.target === m || ev.target.id === "x") m.remove(); };
  document.body.appendChild(m);
}

/* ── boot ───────────────────────────────────────────── */

Promise.all([
  api("/api/doctor/session").catch(function () { return { clinician: null }; }),
  api("/api/doctor/first-run").catch(function () { return { firstRun: false }; }),
  api("/api/config").catch(function () { return {}; }),
  api("/api/departments").catch(function () { return { departments: [] }; }),
]).then(function (r) {
  D.firstRun = !!r[1].firstRun;
  D.hospital = r[2].hospital || "OPD";
  D.departments = r[3].departments || [];

  /* Arriving from a scanned token slip: /c/<visit> redirects here with the
     visit in the query string. Open that patient directly rather than making
     the clerk find them in the queue — that search is the thing the QR exists
     to remove. If nobody is signed in yet, the id is held until they are. */
  var wanted = new URLSearchParams(location.search).get("visit");
  if (wanted) {
    D.pendingVisit = wanted;
    history.replaceState(null, "", location.pathname);   // don't leave it in the URL
  }

  if (r[0].clinician) { D.clinician = r[0].clinician; afterSignIn(); }
  else renderLogin();
});
