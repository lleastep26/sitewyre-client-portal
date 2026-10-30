import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";
import { BookingWizard } from "./booking-wizard";

export default async function BookingPage({
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

  if (!client) return <main className="p-6">Booking page not found.</main>;

  if (client.user_id) {
    await ensureDefaultAvailability(supabase, client.id, client.user_id).catch(
      () => undefined,
    );
  }

  if (booked === "1") {
    return (
      <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
        <p className="text-xs uppercase tracking-[0.22em] text-copper">Booked</p>
        <h1 className="mt-2 font-display text-4xl text-charcoal">
          You&apos;re on the calendar
        </h1>
        <p className="mt-3 text-sm text-charcoal/70">
          {client.business_name} will confirm by text if SMS is set up. Thanks
          for booking.
        </p>
        <a
          href={`/book/${siteKey}`}
          className="mt-8 inline-block text-sm text-copper"
        >
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
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
      <p className="text-xs uppercase tracking-[0.22em] text-copper">Book online</p>
      <h1 className="mt-2 font-display text-4xl text-charcoal">
        {client.business_name}
      </h1>
      <p className="mt-2 text-sm text-charcoal/70">
        Pick a service, day, and open time. Confirmation texts arrive when SMS
        is connected.
      </p>

      <BookingWizard
        siteKey={siteKey}
        businessName={client.business_name ?? "us"}
        services={services ?? []}
      />
    </main>
  );
}
