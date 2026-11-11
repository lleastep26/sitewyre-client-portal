export const REVIEW_BLAST_MAX_ROWS = 2000;

export type RawCsvRow = {
  lineNumber: number;
  firstName: string;
  phone: string;
  jobType: string;
  jobDate: string;
};

export type ParsedReviewBlastCsv = {
  rows: RawCsvRow[];
  totalDataRows: number;
  truncated: boolean;
};

type ColumnKey = "firstName" | "phone" | "jobType" | "jobDate";

// Case/spacing/punctuation-insensitive — "First Name", "first-name" and
// "FIRST_NAME" all normalize to the same key. This does not attempt to
// guess synonyms (e.g. "Phone Number"); only case/spacing variants of the
// spec's own column names.
const HEADER_MAP: Record<string, ColumnKey> = {
  firstname: "firstName",
  phone: "phone",
  jobtype: "jobType",
  jobdate: "jobDate",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Minimal RFC4180-ish line parser: quoted fields, embedded commas, "" escapes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * Parses an Excel-exported (or any) CSV for the review blast: strips a
 * UTF-8 BOM, handles CRLF/CR/LF line endings, ignores extra columns,
 * matches the 4 expected columns case/spacing-insensitively, and caps
 * processing at REVIEW_BLAST_MAX_ROWS data rows (truncated: true if the
 * file had more — the caller surfaces that rather than silently losing
 * rows or rejecting the whole file).
 */
export function parseReviewBlastCsv(raw: string): ParsedReviewBlastCsv {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], totalDataRows: 0, truncated: false };
  }

  const headerFields = parseCsvLine(lines[0]).map(normalizeHeader);
  const colIndex: Partial<Record<ColumnKey, number>> = {};
  headerFields.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped && colIndex[mapped] === undefined) colIndex[mapped] = i;
  });

  const dataLines = lines.slice(1);
  const totalDataRows = dataLines.length;
  const truncated = totalDataRows > REVIEW_BLAST_MAX_ROWS;
  const limited = dataLines.slice(0, REVIEW_BLAST_MAX_ROWS);

  const get = (fields: string[], key: ColumnKey) => {
    const i = colIndex[key];
    return i === undefined ? "" : (fields[i] ?? "").trim();
  };

  const rows = limited.map((line, idx) => {
    const fields = parseCsvLine(line);
    return {
      lineNumber: idx + 2, // +1 for the header row, +1 for 1-indexing
      firstName: get(fields, "firstName"),
      phone: get(fields, "phone"),
      jobType: get(fields, "jobType"),
      jobDate: get(fields, "jobDate"),
    };
  });

  return { rows, totalDataRows, truncated };
}
