import type { ApiLeadImportRow } from "@/lib/mock/orchestrator.types";

/**
 * Maps the columns of an uploaded spreadsheet onto lead import fields.
 *
 * People name these columns whatever they like ("Mobile", "WA Number",
 * "E-mail Address"), so the import guesses a mapping and then lets the user
 * correct it — the guess is a starting point, never the final word.
 */

export type LeadField = keyof ApiLeadImportRow | "ignore";

export const LEAD_FIELD_LABELS: Record<keyof ApiLeadImportRow, string> = {
  name: "Name",
  whatsapp: "WhatsApp",
  email: "Email",
  phone: "Phone",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

/** Select options, in the order the fields appear in the dialog. */
export const LEAD_FIELD_OPTIONS: readonly LeadField[] = [
  "ignore",
  "name",
  "whatsapp",
  "email",
  "phone",
  "instagram",
  "linkedin",
];

/**
 * Header substrings that identify a field, most specific first. Order matters
 * within each list and across the fields: "whatsapp number" must not be read
 * as a plain phone, so `whatsapp` is tested before `phone`.
 */
const FIELD_HINTS: [keyof ApiLeadImportRow, string[]][] = [
  ["whatsapp", ["whatsapp", "whats app", "wa number", "wanumber", "wa"]],
  ["email", ["email", "e-mail", "mail", "email address"]],
  ["instagram", ["instagram", "insta", "ig handle", "ig"]],
  ["linkedin", ["linkedin", "linked in", "li profile"]],
  [
    "phone",
    ["phone", "mobile", "contact number", "telephone", "tel", "number"],
  ],
  ["name", ["full name", "name", "contact", "customer", "lead"]],
];

function normalize(header: string): string {
  return header.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function guessField(header: string): LeadField {
  const normalized = normalize(header);
  if (!normalized) return "ignore";

  // An exact match beats any substring hint — a column literally called
  // "Phone" is a phone even though "name" hints would also match "phone name".
  for (const field of Object.keys(
    LEAD_FIELD_LABELS,
  ) as (keyof ApiLeadImportRow)[]) {
    if (normalized === field) return field;
  }
  for (const [field, hints] of FIELD_HINTS) {
    if (hints.some((hint) => normalized.includes(hint))) return field;
  }
  return "ignore";
}

/**
 * Best-effort mapping for a sheet's headers. A field is claimed by at most one
 * column — a second match falls through to "ignore" rather than silently
 * overwriting the first when the row is built.
 */
export function guessColumnMapping(
  headers: string[],
): Record<string, LeadField> {
  const mapping: Record<string, LeadField> = {};
  const claimed = new Set<LeadField>();

  for (const header of headers) {
    const field = guessField(header);
    if (field === "ignore" || claimed.has(field)) {
      mapping[header] = "ignore";
      continue;
    }
    claimed.add(field);
    mapping[header] = field;
  }
  return mapping;
}

/**
 * Turn parsed sheet rows into import rows. Blank cells are dropped rather than
 * sent as empty strings, so a half-filled column doesn't create identities
 * with an empty `external_id`; rows left with no fields at all are skipped
 * outright — the orchestrator would only reject them as "no channel
 * identities provided".
 */
export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, LeadField>,
): ApiLeadImportRow[] {
  const out: ApiLeadImportRow[] = [];

  for (const row of rows) {
    const mapped: ApiLeadImportRow = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field === "ignore") continue;
      const value = (row[header] ?? "").trim();
      if (value) mapped[field] = value;
    }
    if (Object.keys(mapped).length > 0) out.push(mapped);
  }
  return out;
}
