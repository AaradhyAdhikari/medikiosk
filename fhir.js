"use strict";
/* A FHIR R4 Bundle for one visit — what the ABDM push would carry.

   SIH26047 Module D: "the structured history is pushed to the hospital
   HIS/EMR and linked to the ABHA Personal Health Record via FHIR APIs". The
   push itself needs ABDM sandbox credentials the prototype does not have,
   so it is recorded as mocked. The bundle, though, is real: a document
   Bundle following the NRCES (ABDM) OPConsultRecord shape — Composition,
   Patient, Practitioner, Encounter, Condition, Observation,
   DocumentReference, Consent — that a HIS can validate today, downloadable
   from the console. When credentials arrive it is this that gets sent. */

const HOSPITAL_OID = "urn:oid:2.16.840.1.113883.3.7911";   // placeholder namespace for local ids

function ref(type, id) { return { reference: type + "/" + id }; }
function narrative(text) {
  return { status: "generated", div: '<div xmlns="http://www.w3.org/1999/xhtml">' + escapeXml(text) + "</div>" };
}
function escapeXml(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function sec(title, text, loincCode, loincDisplay) {
  if (!text) return null;
  return {
    title,
    code: loincCode ? { coding: [{ system: "http://loinc.org", code: loincCode, display: loincDisplay }] } : undefined,
    text: narrative(text),
  };
}

function buildBundle({ visit, patient, clinician, documents, hospital }) {
  const s = visit.summary || {};
  const pid = "patient-" + visit.patientId;
  const eid = "encounter-" + visit.id;
  const cid = "composition-" + visit.id;
  const prid = clinician ? "practitioner-" + clinician.id : null;
  const now = new Date().toISOString();

  const patientRes = {
    resourceType: "Patient", id: pid,
    identifier: [
      patient.abhaNumber ? { system: "https://healthid.ndhm.gov.in", value: patient.abhaNumber } : null,
      patient.loginId ? { system: HOSPITAL_OID + ".1", value: patient.loginId } : null,
    ].filter(Boolean),
    name: [{ text: patient.name || "Patient" }],
    gender: patient.sex === "M" ? "male" : patient.sex === "F" ? "female" : patient.sex ? "other" : undefined,
    birthDate: patient.ageYears ? String(new Date().getFullYear() - Number(patient.ageYears)) : undefined,
    telecom: patient.phone ? [{ system: "phone", value: patient.phone, use: "mobile" }] : undefined,
    communication: visit.language ? [{ language: { coding: [{ system: "urn:ietf:bcp:47", code: visit.language }] }, preferred: true }] : undefined,
  };

  const practitionerRes = clinician ? {
    resourceType: "Practitioner", id: prid,
    identifier: clinician.hprId ? [{ system: "https://hpr.abdm.gov.in", value: clinician.hprId }] : undefined,
    name: [{ text: clinician.name || "Clinician" }],
  } : null;

  const encounterRes = {
    resourceType: "Encounter", id: eid,
    status: visit.status === "ASSESSED" ? "finished" : "in-progress",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    subject: ref("Patient", pid),
    period: { start: visit.startedAt, end: visit.assessedAt || undefined },
    priority: visit.redFlag
      ? { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActPriority", code: "EM", display: "emergency" }] }
      : undefined,
    serviceType: visit.departmentLabel ? { text: visit.departmentLabel } : undefined,
    participant: prid ? [{ individual: ref("Practitioner", prid) }] : undefined,
    identifier: [{ system: HOSPITAL_OID + ".2", value: visit.token }],
  };

  // Chief complaint, and the physician's diagnosis where one was recorded.
  const conditions = [];
  if (s.chiefComplaint) {
    conditions.push({
      resourceType: "Condition", id: "cc-" + visit.id,
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item" }] }],
      code: { text: s.chiefComplaint },
      subject: ref("Patient", pid), encounter: ref("Encounter", eid),
      recordedDate: visit.submittedAt,
      note: s.hpi ? [{ text: s.hpi }] : undefined,
    });
  }
  const icd = visit.icd10 || (s.coding && s.coding.icd10) || null;
  const namaste = visit.namaste || (s.coding && s.coding.namaste) || null;
  if (visit.diagnosis || icd || namaste) {
    conditions.push({
      resourceType: "Condition", id: "dx-" + visit.id,
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "encounter-diagnosis" }] }],
      verificationStatus: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                   code: visit.diagnosis ? "confirmed" : "provisional" }],
      },
      code: {
        coding: [
          icd ? { system: "http://hl7.org/fhir/sid/icd-10", code: String(icd).split(/\s/)[0], display: String(icd) } : null,
          namaste ? { system: "https://namaste.ayush.gov.in", code: String(namaste).split(/\s/)[0], display: String(namaste) } : null,
        ].filter(Boolean),
        text: visit.diagnosis || String(icd || namaste),
      },
      subject: ref("Patient", pid), encounter: ref("Encounter", eid),
      asserter: prid ? ref("Practitioner", prid) : undefined,
      recordedDate: visit.assessedAt || undefined,
    });
  }

  // Every scanned paper is a DocumentReference; each abnormal value read
  // from it is an Observation that points back at it.
  const docRefs = [], observations = [];
  for (const d of documents || []) {
    const drid = "doc-" + d.id;
    const e = d.extracted || {};
    docRefs.push({
      resourceType: "DocumentReference", id: drid,
      status: "current",
      type: { text: e.docType || "medical document" },
      subject: ref("Patient", pid), context: { encounter: [ref("Encounter", eid)] },
      date: d.createdAt,
      description: [d.label, e.summary].filter(Boolean).join(" — "),
      content: [{ attachment: { contentType: "image/jpeg", url: "/api/documents/" + d.id + "/image", title: d.label,
                               creation: d.docDate || undefined } }],
    });
    (e.abnormal || []).forEach((line, i) => {
      observations.push({
        resourceType: "Observation", id: "obs-" + d.id + "-" + i,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
        code: { text: String(line).split(":")[0].trim() || "Result" },
        subject: ref("Patient", pid), encounter: ref("Encounter", eid),
        effectiveDateTime: d.docDate || undefined,
        valueString: String(line),
        interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "A", display: "Abnormal" }] }],
        derivedFrom: [ref("DocumentReference", drid)],
      });
    });
  }

  // What the patient allowed, as a Consent resource — the ABDM consent
  // framework wants the grant to travel with the data.
  const c = visit.consent || {};
  const consentRes = {
    resourceType: "Consent", id: "consent-" + visit.id,
    status: visit.consentWithdrawnAt ? "inactive" : "active",
    scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
    category: [{ coding: [{ system: "http://loinc.org", code: "59284-0", display: "Patient Consent" }] }],
    patient: ref("Patient", pid),
    dateTime: visit.startedAt,
    provision: {
      type: "permit",
      purpose: [
        c.record !== false ? { system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "TREAT", display: "treatment" } : null,
        c.locker ? { system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "PATRQT", display: "patient requested (health locker)" } : null,
      ].filter(Boolean),
    },
  };

  const compositionRes = {
    resourceType: "Composition", id: cid,
    status: visit.status === "ASSESSED" ? "final" : "preliminary",
    type: { coding: [{ system: "http://snomed.info/sct", code: "371530004", display: "Clinical consultation report" }], text: "OP Consultation Record" },
    subject: ref("Patient", pid), encounter: ref("Encounter", eid),
    date: visit.submittedAt || visit.startedAt,
    author: prid ? [ref("Practitioner", prid)] : [{ display: "MediKiosk intake" }],
    title: "OPD clinical history — " + (hospital || "OPD"),
    section: [
      sec("Chief complaint", s.chiefComplaint, "10154-3", "Chief complaint Narrative"),
      sec("History of present illness", s.hpi, "10164-2", "History of present illness Narrative"),
      sec("Past medical history", s.pastHistory, "11348-0", "History of past illness Narrative"),
      sec("Medications", s.medications, "10160-0", "History of medication use Narrative"),
      sec("Allergies", s.allergies, "48765-2", "Allergies and adverse reactions Document"),
      sec("Family history", s.familyHistory, "10157-6", "History of family member diseases Narrative"),
      sec("Social / personal history", s.personal, "29762-2", "Social history Narrative"),
      sec("Review of systems", s.ros, "10187-3", "Review of systems Narrative"),
      sec("Prior investigations", s.priorInvestigations, "30954-2", "Relevant diagnostic tests/laboratory data Narrative"),
      s.ayurveda ? sec("Dashavidha Pariksha (AYUSH)", JSON.stringify(s.ayurveda)) : null,
      visit.diagnosis ? sec("Physician's diagnosis", visit.diagnosis, "29548-5", "Diagnosis Narrative") : null,
      visit.prescription ? sec("Plan / prescription", visit.prescription, "18776-5", "Plan of care note") : null,
    ].filter(Boolean),
  };

  const resources = [compositionRes, patientRes, practitionerRes, encounterRes, ...conditions, ...observations, ...docRefs, consentRes].filter(Boolean);
  return {
    resourceType: "Bundle",
    id: "bundle-" + visit.id,
    meta: { lastUpdated: now, profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"] },
    identifier: { system: HOSPITAL_OID + ".3", value: visit.id },
    type: "document",
    timestamp: now,
    entry: resources.map((r) => ({ fullUrl: "urn:uuid:" + r.id, resource: r })),
  };
}

module.exports = { buildBundle };
