import { createAdminClient } from "@/lib/supabase/admin";
import { bookAppointment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ siteKey: string }>;
}) {
  const { siteKey } = await params;
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", siteKey)
    .maybeSingle();

  if (!client) return <main className="p-6">Booking page not found.</main>;

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("client_id", client.id)
    .eq("bookable_online", true);

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
      <p className="text-xs uppercase tracking-[0.22em] text-copper">Book online</p>
      <h1 className="mt-2 font-display text-4xl text-charcoal">
        {client.business_name}
      </h1>
      <p className="mt-2 text-sm text-charcoal/70">
        Pick a service and time. Confirmation texts arrive automatically.
      </p>

      <form action={bookAppointment.bind(null, siteKey)} className="mt-8 space-y-3">
        <Input name="name" placeholder="Your name" required />
        <Input name="phone" placeholder="Phone" required />
        <Input name="email" type="email" placeholder="Email" />
        <select
          name="service_id"
          className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3"
          required
        >
          <option value="">Select a service</option>
          {(services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.default_price != null ? ` · $${s.default_price}` : ""}
            </option>
          ))}
        </select>
        <Input name="start_at" type="datetime-local" required />
        <Button type="submit" className="w-full">
          Book
        </Button>
      </form>
    </main>
  );
}
