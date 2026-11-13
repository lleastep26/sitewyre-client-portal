import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";
import { smsConsentText } from "@/lib/a2p/consent-text";
import { BookingWizard } from "@/app/book/[siteKey]/booking-wizard";
import { EmbedAutoHeight } from "../../auto-height";

/**
 * The booking calendar, for a frame on the business's own website. Same
 * wizard and booking rules as /book/[siteKey], without the full-page look.
 */
export default async function EmbeddedBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteKey: string }>;
  searchParams: Promise<{ booked?: string }>;
}) {
  const { siteKey } = await params;
  const { booked } = await searchParams;
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", siteKey)
    .maybeSingle();

  if (!client) return <main className="bg-white p-4 text-sm">Booking isn&apos;t available.</main>;

  if (client.user_id) {
    await ensureDefaultAvailability(supabase, client.id, client.user_id).catch(() => undefined);
  }

  if (booked === "1") {
    return (
      <main className="bg-white p-4">
        <EmbedAutoHeight />
        <h1 className="font-display text-2xl text-charcoal">You&apos;re on the calendar</h1>
        <p className="mt-2 text-sm text-charcoal/70">
          Thanks for booking with {client.business_name}.
        </p>
        <a href={`/embed/book/${siteKey}`} className="mt-4 inline-block text-sm text-copper">
          Book another →
        </a>
      </main>
    );
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, default_price")
    .eq("client_id", client.id)
    .eq("bookable_online", true)
    .order("name");

  return (
    <main className="bg-white p-4">
      <EmbedAutoHeight />
      <h1 className="font-display text-2xl text-charcoal">Book online</h1>
      <p className="mt-1 text-sm text-charcoal/70">Pick a service, a day and an open time.</p>
      <BookingWizard
        siteKey={siteKey}
        businessName={client.business_name ?? "us"}
        services={services ?? []}
        consentText={smsConsentText(client.business_name)}
        embed
      />
    </main>
  );
}
