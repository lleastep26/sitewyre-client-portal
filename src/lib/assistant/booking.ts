import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { isSlotAvailable } from "@/lib/scheduling/slots";
import { findOpenSlots } from "@/lib/scheduling/service-slots";
import { getExternalBusyTimes, pushAppointmentCreated } from "@/lib/scheduling/calendar-sync";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { handleLeadBookedForContact } from "@/lib/leads/lifecycle";
import { getSmsProvider } from "@/lib/adapters";
import { inngest } from "@/lib/inngest/client";

type Admin = SupabaseClient<Database>;

const DEFAULT_TIME_ZONE = "America/Chicago";

export type AvailabilityResult =
  | {
      service: string;
      timezone: string;
      available_times: { start_at: string; local: string }[];
    }
  | { error: string };

export type BookingResult =
  | { ok: true; appointment_id: string; start_at: string; local: string; service: string }
  | { error: string };

function ymdInTimeZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock label in the business's timezone — what the AI should say
 * to the customer, so it never has to convert from UTC itself. */
export function localTimeLabel(d: Date, timeZone: string): string {
  return d.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function findBookableService(supabase: Admin, clientId: string, serviceName: string) {
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("client_id", clientId)
    .eq("bookable_online", true)
    .ilike("name", `%${serviceName}%`)
    .maybeSingle();
  return data;
}

/** Open times for a bookable service over the next 7 days — shared by the
 * AI receptionist's check_availability function and the text assistant. */
export async function checkAvailabilityForService(
  supabase: Admin,
  opts: { clientId: string; serviceName: string; earliest?: string | null; timeZone?: string | null },
): Promise<AvailabilityResult> {
  const serviceName = opts.serviceName.trim();
  if (!serviceName) return { error: "Which service is this for?" };

  const service = await findBookableService(supabase, opts.clientId, serviceName);
  if (!service) return { error: `No bookable service matching "${serviceName}".` };

  const timeZone = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const earliest = opts.earliest ? new Date(opts.earliest) : new Date();
  const from = Number.isNaN(earliest.getTime()) || earliest.getTime() < Date.now() ? new Date() : earliest;

  const slots = await findOpenSlots(supabase, {
    clientId: opts.clientId,
    serviceId: service.id,
    fromYmd: ymdInTimeZone(from, timeZone),
    toYmd: ymdInTimeZone(new Date(from.getTime() + 7 * 86_400_000), timeZone),
    timeZone,
  });

  return {
    service: service.name,
    timezone: timeZone,
    available_times: slots
      .filter((s) => s.getTime() >= from.getTime())
      .slice(0, 6)
      .map((s) => ({ start_at: s.toISOString(), local: localTimeLabel(s, timeZone) })),
  };
}

/**
 * Books a service for a customer after re-checking the slot is still free,
 * then does everything a booking triggers: marks the open lead booked
 * (cancelling its follow-ups), pushes to the connected calendar, queues
 * the customer's confirmation and reminders, and alerts the owner.
 */
export async function bookAppointmentForCustomer(
  supabase: Admin,
  client: Pick<
    ClientRow,
    | "id"
    | "phone"
    | "business_name"
    | "timezone"
    | "user_id"
    | "twilio_phone_number"
    | "a2p_status"
    | "a2p_pipeline"
  >,
  opts: {
    serviceName: string;
    startAt: Date;
    customerName: string;
    customerPhone: string | null;
    source: "ai_receptionist" | "ai_text_assistant";
  },
): Promise<BookingResult> {
  const serviceName = opts.serviceName.trim();
  const customerName = opts.customerName.trim();
  if (!serviceName || !customerName || Number.isNaN(opts.startAt.getTime())) {
    return { error: "Need the service, customer name, and a valid start time." };
  }

  const service = await findBookableService(supabase, client.id, serviceName);
  if (!service) return { error: `No bookable service matching "${serviceName}".` };

  const startAt = opts.startAt;
  const endAt = new Date(startAt.getTime() + service.duration_minutes * 60_000);
  const timeZone = client.timezone ?? DEFAULT_TIME_ZONE;

  const { data: availability } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
    .eq("client_id", client.id);
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", client.id)
    .neq("status", "cancelled")
    .lt("start_at", endAt.toISOString())
    .gt("end_at", startAt.toISOString());
  const externalBusy = await getExternalBusyTimes(supabase, client.id, startAt, endAt);

  const stillFree = isSlotAvailable({
    start: startAt,
    durationMinutes: service.duration_minutes,
    availability: availability ?? [],
    busy: [...(existingAppointments ?? []), ...externalBusy],
    timeZone,
  });
  if (!stillFree) {
    return { error: "That time just filled up — call check_availability again for other open times." };
  }

  const customerPhone = opts.customerPhone ? normalizePhone(opts.customerPhone) : "";
  let contactId: string | null = null;
  if (customerPhone) {
    const contact = await findOrCreateContact(supabase, {
      clientId: client.id,
      name: customerName,
      phone: customerPhone,
      source: opts.source,
    });
    contactId = contact.id;
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      client_id: client.id,
      contact_id: contactId,
      title: service.name,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      assignee_ids: client.user_id ? [client.user_id] : [],
      status: "scheduled",
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  await handleLeadBookedForContact(
    supabase,
    { clientId: client.id, contactId, appointmentId: appt.id },
    (event) => inngest.send(event),
  );
  await pushAppointmentCreated(supabase, client.id, {
    id: appt.id,
    title: service.name,
    startAt,
    endAt,
  });

  const from = resolveSmsFrom(client);
  const local = localTimeLabel(startAt, timeZone);

  // Confirmation and reminders go to the customer, like the public
  // booking page.
  if (customerPhone) {
    await enqueueAppointmentSms({
      to: customerPhone,
      from,
      businessName: client.business_name ?? "us",
      title: service.name,
      startAt,
      clientId: client.id,
      timeZone,
    }).catch(() => undefined);
  }

  // A phone booking is reported in the single after-call text instead
  // (src/lib/retell/call-summary.ts), so the owner gets one text per call.
  if (client.phone && opts.source === "ai_text_assistant") {
    await getSmsProvider()
      .send({
        to: normalizePhone(client.phone),
        from: from ?? undefined,
        body: `AI text assistant booked ${customerName}${customerPhone ? ` (${customerPhone})` : ""}: ${service.name}, ${local}.`,
      })
      .catch(() => undefined);
  }

  return {
    ok: true,
    appointment_id: appt.id,
    start_at: startAt.toISOString(),
    local,
    service: service.name,
  };
}
