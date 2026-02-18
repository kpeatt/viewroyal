/**
 * Canonical document type normalization and display utilities.
 * Maps ~53 raw Gemini-extracted document_type values to 10 canonical types.
 */

export type CanonicalDocumentType =
  | "agenda"
  | "minutes"
  | "staff_report"
  | "delegation"
  | "correspondence"
  | "appendix"
  | "bylaw"
  | "presentation"
  | "form"
  | "plan"
  | "other";

const TYPE_MAP: Record<string, CanonicalDocumentType> = {
  // agenda
  agenda: "agenda",

  // minutes
  minutes: "minutes",

  // staff_report
  staff_report: "staff_report",
  report: "staff_report",
  mayor_report: "staff_report",
  expert_report: "staff_report",
  survey_report: "staff_report",
  audit_report: "staff_report",
  financial_report: "staff_report",
  government_report: "staff_report",
  study_report: "staff_report",
  annual_report: "staff_report",
  financial_statement: "staff_report",

  // delegation
  delegation: "delegation",
  submission: "delegation",
  petition: "delegation",

  // correspondence
  correspondence: "correspondence",
  memo: "correspondence",
  newsletter: "correspondence",
  article: "correspondence",
  notice: "correspondence",
  public_notice: "correspondence",

  // appendix
  appendix: "appendix",
  attachment: "appendix",
  staff_report_appendix: "appendix",
  other_supporting_document: "appendix",
  appendix_map: "appendix",
  data_table: "appendix",

  // bylaw
  bylaw: "bylaw",
  bylaw_excerpt: "bylaw",
  policy: "bylaw",
  policy_document: "bylaw",
  legal_document: "bylaw",
  contract: "bylaw",

  // presentation
  presentation: "presentation",
  concept_paper: "presentation",

  // form
  form: "form",
  rfp: "form",
  RFP: "form",
  motion: "form",
  motions_and_notices: "form",
  new_business: "form",
  budget: "form",
  certificate: "form",

  // plan
  plan: "plan",
  plans: "plan",
  architectural_plan: "plan",
  drawing: "plan",
  map: "plan",
  landscape_plan: "plan",
  strategic_plan: "plan",

  // other
  other: "other",
  proposal: "other",
};

export function normalizeDocumentType(raw: string): CanonicalDocumentType {
  return TYPE_MAP[raw] ?? "other";
}

const LABELS: Record<CanonicalDocumentType, string> = {
  agenda: "Agenda",
  minutes: "Minutes",
  staff_report: "Staff Report",
  delegation: "Delegation",
  correspondence: "Correspondence",
  appendix: "Appendix",
  bylaw: "Bylaw",
  presentation: "Presentation",
  form: "Form",
  plan: "Plan",
  other: "Other",
};

export function getDocumentTypeLabel(raw: string): string {
  return LABELS[normalizeDocumentType(raw)];
}

const COLORS: Record<CanonicalDocumentType, string> = {
  agenda: "bg-sky-100 text-sky-700 border-sky-200",
  minutes: "bg-slate-100 text-slate-700 border-slate-200",
  staff_report: "bg-indigo-100 text-indigo-700 border-indigo-200",
  delegation: "bg-amber-100 text-amber-700 border-amber-200",
  correspondence: "bg-teal-100 text-teal-700 border-teal-200",
  appendix: "bg-zinc-100 text-zinc-600 border-zinc-200",
  bylaw: "bg-purple-100 text-purple-700 border-purple-200",
  presentation: "bg-orange-100 text-orange-700 border-orange-200",
  form: "bg-rose-100 text-rose-700 border-rose-200",
  plan: "bg-emerald-100 text-emerald-700 border-emerald-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

export function getDocumentTypeColor(raw: string): string {
  return COLORS[normalizeDocumentType(raw)];
}
