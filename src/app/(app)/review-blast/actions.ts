"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";
import { getAppUrl } from "@/lib/supabase/env";
import { getAutomationState } from "@/lib/automations";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { resolveGoogleReviewUrl } from "@/lib/funnels/review-link";
import { buildReviewBlastPreview } from "@/lib/funnels/review-blast-preview";
import { buildReviewBlastMessage } from "@/lib/funnels/review-blast-message";
import {
  planBlastSchedule,
  startOfTodayInTimeZone,
} from "@/lib/funnels/blast-schedule";
import type { ClientRow } from "@/lib/supabase/types";

/** Shared across preview and confirm — both must refuse to run under the
 * same conditions, with a message the page can show directly. */
function blastBlockerMessage(client: ClientRow): string | null {
  if (!client.twilio_phone_number) {
    return "No Twilio number is assigned to this account yet.";
  }
  if (!resolveGoogleReviewUrl(client)) {
    return "No Google review URL or Place ID is set — add one in Settings.";
  }
  if (client.a2p_status !== "approved") {
    return `A2P registration isn't approved yet (status: ${client.a2p_status ?? "pending"}).`;
  }
  return null;
}

export async function previewReviewBlastCsv(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const blocker = blastBlockerMessage(client);
  if (blocker) return { error: blocker };

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file" };
  }

  const text = await file.text();
  const preview = await buildReviewBlastPreview(supabase, client.id, text);
  return { preview: { ...preview, fileName: file.name } };
}

export async function confirmReviewBlast(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };
  const blocker = blastBlockerMessage(client);
  if (blocker) return { error: blocker };
  if (!client.twilio_phone_number) return { error: "No Twilio number" };

  const rows = JSON.parse(String(formData.get("rows") ?? "[]")) as Array<{
    lineNumber: number;
    firstName: string;
    phone: string;
    jobType: string;
    jobDate: string;
  }>;
  if (!rows.length) return { error: "No valid rows to send" };

  const fileName = String(formData.get("fileName") ?? "import.csv");
  const totalDataRows = Number(formData.get("totalDataRows") ?? rows.length);
  const skippedCount = Number(formData.get("skippedCount") ?? 0);

  const auto = await getAutomationState(supabase, client.id, "review_blast");
  if (!auto.enabled) {
    return { error: "The review-blast automation is turned off for this account." };
  }

  const timeZone = client.timezone ?? "America/Chicago";
  const since = new Date().toISOString();
  const todayStart = startOfTodayInTimeZone(new Date(), timeZone);

  const { count: alreadySentToday } = await supabase
    .from("workflow_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id)
    .eq("trigger", "review_blast")
    .eq("status", "sent")
    .gte("created_at", todayStart.toISOString());

  await supabase.from("imports").insert({
    client_id: client.id,
    file_name: fileName,
    total_rows: totalDataRows,
    valid_rows: rows.length,
    skipped_rows: skippedCount,
    consent_confirmed_by: user.id,
    consent_confirmed_at: since,
  });

  const scheduled = planBlastSchedule(rows, {
    timeZone,
    alreadySentToday: alreadySentToday ?? 0,
  });

  let queued = 0;
  for (const row of scheduled) {
    const contact = await findOrCreateContact(supabase, {
      clientId: client.id,
      name: row.firstName || row.phone,
      phone: row.phone,
      source: "import",
    });

    const { data: reviewLink } = await supabase
      .from("review_links")
      .insert({
        client_id: client.id,
        contact_id: contact.id,
        source: "review_blast",
      })
      .select("token")
      .single();
    if (!reviewLink) continue;

    const reviewUrl = `${getAppUrl()}/r/${reviewLink.token}`;
    const firstName = row.firstName || "there";
    const firstMessageBody = buildReviewBlastMessage({
      firstName,
      businessName: client.business_name ?? "us",
      ownerName: client.owner_name,
      jobType: row.jobType || null,
      reviewLink: reviewUrl,
      customTemplate: auto.templateBody,
    });

    await inngest
      .send({
        name: "portal/review_blast.contact_started",
        data: {
          clientId: client.id,
          contactId: contact.id,
          phone: row.phone,
          from: client.twilio_phone_number,
          reviewToken: reviewLink.token,
          firstName,
          firstMessageBody,
          firstSendAt: row.firstSendAt.toISOString(),
          reminderSendAt: row.reminderSendAt.toISOString(),
          since,
        },
      })
      .catch(() => undefined);
    queued++;
  }

  revalidatePath("/review-blast");
  return { queued };
}
