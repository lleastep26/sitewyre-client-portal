import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizePhone } from "@/lib/utils";

/**
 * Form capture: the Sitewyre script on a client's own website sends a copy
 * of each form submission here, so the lead reaches the portal without
 * the site's form having to change. See public/widget.js.
 */

type Admin = SupabaseClient<Database>;

/** Captures one visitor (IP address) may send per hour. */
export const CAPTURE_MAX_PER_IP_PER_HOUR = 10;
/** Captures one client's website may send in 24 hours. */
export const CAPTURE_MAX_PER_CLIENT_PER_DAY = 300;
/** How far back to look for the same person's earlier lead. */
export const CAPTURE_DUPLICATE_WINDOW_MS = 10 * 60_000;
/** Two leads from the same person this close together are one submission
 * arriving by two routes, whatever the message says. */
export const CAPTURE_SAME_SUBMISSION_MS = 90_000;

/**
 * A site may also send its form straight to the portal. Both copies leave
 * the browser at the same moment, so the capture waits this long before
 * looking for a duplicate, which lets the direct copy land first. The
 * visitor never waits on this: the script doesn't read the response.
 */
export const captureTiming = { settleMs: 3_000 };

export const captureSchema = z.object({
  site_key: z.string().min(1).max(100),
  name: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  message: z.string().max(4000).optional(),
  page_url: z.string().max(1000).optional(),
  form_label: z.string().max(200).optional(),
  /** SMS consent wording the script found in or around the form. */
  consent_text: z.string().max(1000).optional(),
});

export type CaptureInput = z.infer<typeof captureSchema>;

export type CapturedLead = {
  name: string;
  /** Normalised, or "" for an email-only enquiry. */
  phone: string;
  email: string | null;
  message: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pagePath(pageUrl: string | undefined): string {
  try {
    return pageUrl ? new URL(pageUrl).pathname : "";
  } catch {
    return "";
  }
}

/**
 * Turns a raw capture into a lead, or null when it isn't one. A lead needs
 * a phone number with an area code, or an email address together with a
 * message (an email on its own is a newsletter sign-up, not an enquiry).
 */
export function toCapturedLead(input: CaptureInput): CapturedLead | null {
  const digits = (input.phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const phone = digits.length === 10 ? normalizePhone(digits) : "";
  const rawEmail = (input.email ?? "").trim().toLowerCase();
  const email = EMAIL.test(rawEmail) ? rawEmail : null;
  const typedMessage = (input.message ?? "").trim();

  if (!phone && !(email && typedMessage)) return null;

  const path = pagePath(input.page_url);
  const message =
    typedMessage ||
    `Sent from the form on your website${path && path !== "/" ? ` (${path})` : ""}.`;
  const name = (input.name ?? "").trim() || (email ? email.split("@")[0] : "") || "Website visitor";

  return { name: name.slice(0, 100), phone, email, message: message.slice(0, 2000) };
}

function squash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The same message, allowing for one copy carrying extra lines (a site's
 * own form often adds "Service: …" around what the visitor typed). */
export function sameMessage(a: string, b: string): boolean {
  const x = squash(a);
  const y = squash(b);
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.length >= 8 && longer.includes(shorter);
}

/** The lead this capture duplicates, if the same person's submission has
 * already arrived (from the site's own form, or an earlier capture). */
export async function findDuplicateLead(
  supabase: Admin,
  clientId: string,
  lead: CapturedLead,
  now: Date,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, phone, email, message, created_at")
    .eq("client_id", clientId)
    .gte("created_at", new Date(now.getTime() - CAPTURE_DUPLICATE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const match = (data ?? []).find((row) => {
    const samePerson =
      (!!lead.phone && normalizePhone(row.phone ?? "") === lead.phone) ||
      (!!lead.email && (row.email ?? "").trim().toLowerCase() === lead.email);
    if (!samePerson) return false;
    const age = now.getTime() - Date.parse(row.created_at);
    return age <= CAPTURE_SAME_SUBMISSION_MS || sameMessage(row.message ?? "", lead.message);
  });
  return match ? { id: match.id } : null;
}
