import { requireMembership } from "@/lib/auth/session";
import {
  updateSettings,
  reseedTradePreset,
  upsertAvailability,
  deleteAvailability,
  toggleServiceBookable,
} from "./actions";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ConnectStripeButton } from "./connect-stripe-button";
import {
  ensureDefaultAvailability,
  listAvailability,
  weekdayLabel,
} from "@/lib/scheduling/availability";

function timeInputValue(t: string) {
  return t.slice(0, 5);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client, user } = await requireMembership();
  if (!client) return null;

  const ownerId = client.user_id ?? user.id;
  await ensureDefaultAvailability(supabase, client.id, ownerId).catch(
    () => undefined,
  );
  const availability = await listAvailability(supabase, client.id).catch(
    () => [],
  );

  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, default_price, bookable_online")
    .eq("client_id", client.id)
    .order("name");

  return (
    <div className="space-y-4 px-4 pb-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Settings</p>
        <h1 className="mt-1 font-display text-3xl">Account</h1>
      </header>

      <Card>
        <CardTitle>Business</CardTitle>
        <CardDescription className="mt-1">
          Site key: <code className="text-xs">{client.site_key}</code>
        </CardDescription>
        <form action={async (fd) => { await updateSettings(fd); }} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="phone">Business phone</Label>
            <Input id="phone" name="phone" defaultValue={client.phone ?? ""} />
          </div>
          <div>
            <Label htmlFor="service_area">Service area</Label>
            <Input
              id="service_area"
              name="service_area"
              defaultValue={client.service_area ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              name="timezone"
              defaultValue={client.timezone ?? "America/Chicago"}
            />
          </div>
          <div>
            <Label htmlFor="google_review_url">Google review URL</Label>
            <Input
              id="google_review_url"
              name="google_review_url"
              defaultValue={client.google_review_url ?? ""}
              placeholder="https://g.page/r/..."
            />
          </div>
          <Button type="submit" className="w-full">
            Save
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Booking hours</CardTitle>
        <CardDescription className="mt-1">
          Weekly availability for online booking (defaults Mon–Fri 9–5).
        </CardDescription>
        <ul className="mt-3 space-y-3">
          {availability.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-charcoal/10 bg-white/60 p-3"
            >
              <form action={upsertAvailability} className="space-y-2">
                <input type="hidden" name="id" value={row.id} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Day</Label>
                    <select
                      name="weekday"
                      defaultValue={row.weekday}
                      className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={d}>
                          {weekdayLabel(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Start</Label>
                      <Input
                        name="start_time"
                        type="time"
                        defaultValue={timeInputValue(row.start_time)}
                        required
                      />
                    </div>
                    <div>
                      <Label>End</Label>
                      <Input
                        name="end_time"
                        type="time"
                        defaultValue={timeInputValue(row.end_time)}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Buffer (min)</Label>
                    <Input
                      name="buffer_minutes"
                      type="number"
                      min={0}
                      defaultValue={row.buffer_minutes}
                    />
                  </div>
                  <div>
                    <Label>Min notice (hrs)</Label>
                    <Input
                      name="min_notice_hours"
                      type="number"
                      min={0}
                      defaultValue={row.min_notice_hours}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="flex-1">
                    Save
                  </Button>
                </div>
              </form>
              <form action={deleteAvailability} className="mt-2">
                <input type="hidden" name="id" value={row.id} />
                <Button type="submit" size="sm" variant="outline" className="w-full">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={upsertAvailability} className="mt-4 space-y-2 border-t border-charcoal/10 pt-3">
          <p className="text-sm font-medium">Add hours</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              name="weekday"
              defaultValue={1}
              className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {weekdayLabel(d)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input name="start_time" type="time" defaultValue="09:00" required />
              <Input name="end_time" type="time" defaultValue="17:00" required />
            </div>
          </div>
          <input type="hidden" name="buffer_minutes" value="15" />
          <input type="hidden" name="min_notice_hours" value="2" />
          <Button type="submit" variant="secondary" className="w-full">
            Add day
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Bookable services</CardTitle>
        <CardDescription className="mt-1">
          Toggle which trade services appear on your public booking page.
        </CardDescription>
        <ul className="mt-3 space-y-2">
          {(services ?? []).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-charcoal/10 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-charcoal/55">
                  {s.duration_minutes} min
                  {s.default_price != null ? ` · $${s.default_price}` : ""}
                </p>
              </div>
              <form action={toggleServiceBookable}>
                <input type="hidden" name="id" value={s.id} />
                <input
                  type="hidden"
                  name="bookable_online"
                  value={s.bookable_online ? "false" : "true"}
                />
                <Button type="submit" size="sm" variant={s.bookable_online ? "default" : "outline"}>
                  {s.bookable_online ? "Online" : "Hidden"}
                </Button>
              </form>
            </li>
          ))}
          {!services?.length ? (
            <p className="text-sm text-charcoal/60">
              No services yet — reload the trade preset below.
            </p>
          ) : null}
        </ul>
      </Card>

      <Card>
        <CardTitle>Stripe payouts</CardTitle>
        <CardDescription className="mt-1">
          {client.stripe_connect_account_id
            ? `Connected (${client.stripe_connect_account_id})`
            : "Not connected"}
          {params.stripe ? ` · ${params.stripe}` : ""}
        </CardDescription>
        <div className="mt-3">
          <ConnectStripeButton
            connected={Boolean(client.stripe_connect_account_id)}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Trade preset</CardTitle>
        <CardDescription className="mt-1">
          Current trade: {client.trade ?? "other"}
        </CardDescription>
        <form action={async () => { await reseedTradePreset(); }} className="mt-3">
          <Button type="submit" variant="secondary" className="w-full">
            Reload pipeline & services
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Billing</CardTitle>
        <CardDescription className="mt-1">
          Plan: {client.plan ?? "contractor_299"} ($299/mo package). Usage
          overages will appear here once limits are finalized.
        </CardDescription>
      </Card>

      <Card>
        <CardTitle>Twilio</CardTitle>
        <CardDescription className="mt-1">
          Number: {client.twilio_phone_number ?? "Not provisioned"} · A2P:{" "}
          {client.a2p_status ?? "pending"}
        </CardDescription>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
