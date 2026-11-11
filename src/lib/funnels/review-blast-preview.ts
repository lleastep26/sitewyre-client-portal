import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizePhone } from "@/lib/utils";
import { findContactByPhone } from "@/lib/crm/contacts";
import { isOptedOut } from "./opt-out";
import { hasRecentReviewRequest } from "./recent-review-request";
import { parseReviewBlastCsv, type RawCsvRow } from "./csv-import";

export type PreviewRow = RawCsvRow & { phone: string };

export type SkipReason =
  | "missing_phone"
  | "bad_number"
  | "duplicate"
  | "opted_out"
  | "recent_review_request";

export type SkippedRow = PreviewRow & { reason: SkipReason };

export type ReviewBlastPreview = {
  valid: PreviewRow[];
  skipped: SkippedRow[];
  totalDataRows: number;
  truncated: boolean;
};

const E164_US = /^\+1\d{10}$/;

/**
 * Parses the CSV and classifies every row — valid, or skipped with a
 * reason — without writing anything. Re-run again at confirm time for
 * freshness (opt-out/recent-request status can change between preview and
 * confirm), not reused from this call.
 */
export async function buildReviewBlastPreview(
  supabase: SupabaseClient<Database>,
  clientId: string,
  csvText: string,
): Promise<ReviewBlastPreview> {
  const { rows, totalDataRows, truncated } = parseReviewBlastCsv(csvText);
  const valid: PreviewRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenPhones = new Set<string>();

  for (const row of rows) {
    if (!row.phone) {
      skipped.push({ ...row, reason: "missing_phone" });
      continue;
    }

    const normalized = normalizePhone(row.phone);
    if (!E164_US.test(normalized)) {
      skipped.push({ ...row, phone: normalized, reason: "bad_number" });
      continue;
    }

    if (seenPhones.has(normalized)) {
      skipped.push({ ...row, phone: normalized, reason: "duplicate" });
      continue;
    }
    seenPhones.add(normalized);

    if (await isOptedOut(supabase, clientId, normalized)) {
      skipped.push({ ...row, phone: normalized, reason: "opted_out" });
      continue;
    }

    const existingContact = await findContactByPhone(supabase, clientId, normalized);
    if (
      existingContact &&
      (await hasRecentReviewRequest(supabase, existingContact.id))
    ) {
      skipped.push({
        ...row,
        phone: normalized,
        reason: "recent_review_request",
      });
      continue;
    }

    valid.push({ ...row, phone: normalized });
  }

  return { valid, skipped, totalDataRows, truncated };
}
