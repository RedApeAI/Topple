export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parses a `.csv`, `.xlsx`, or `.xls` file into headers + row records, using
 * the first row as the header and the first sheet only. SheetJS handles the
 * CSV/binary distinction itself from the buffer contents.
 */
export async function parseLeadFile(file: File): Promise<ParsedSheet> {
  // Spreadsheet parsing is only needed after a user selects a file. Keeping
  // SheetJS out of the initial graph avoids shipping it with the inbox UI.
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // `raw: true` stops SheetJS from number-sniffing CSV cells — without it,
  // a leading-"+" phone number like "+971555111222" parses as the *number*
  // 971555111222, silently dropping the "+" every WhatsApp/phone id needs.
  const workbook = XLSX.read(buffer, { type: "array", raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0].map((cell) => String(cell).trim());
  const rows = table.slice(1).map((line) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      const cell = line[i];
      record[header] = cell == null ? "" : String(cell).trim();
    });
    return record;
  });

  return { headers, rows };
}
