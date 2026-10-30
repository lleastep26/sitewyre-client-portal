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
  weekdayLabel,
} from "@/lib/scheduling/availability";
import {
  monthLabel,
  monthStartIso,
  type UsageCounts,
} from "@/lib/billing/usage";

function timeInputValue(t: unknown) {
  const raw = typeof t === "string" ? t : t == null ? "" : String(t);
  return raw.slice(0, 5) || "09:00";
}

function BillingFeatures({
  features,
  usage,
}: {
  features: { feature: string; enabled: boolean }[];
  usage: UsageCounts;
}) {
  return (
    <div className="mt-3 space-y-3">
      {features.length ? (
        <ul className="space-y-1 text-xs text-charcoal/70">
          {features.map((row) => (
            <li key={row.feature} className="flex justify-between gap-2">
              <span>{row.feature.replaceAll("_", " ")}</span>
              <span>{row.enabled ? "included" : "off"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-charcoal/50">
          Feature list unavailable — defaults allow core CRM tools.
        </p>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Usage · {usage.monthLabel}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-charcoal/70">
          <li className="flex justify-between gap-2">
            <span>Outbound SMS (inbox)</span>
            <span>{usage.smsOutbound}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Outbound email (inbox)</span>
            <span>{usage.emailOutbound}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Automation runs</span>
            <span>{usage.workflowRuns}</span>
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-charcoal/45">
          Overage billing not charged yet — counters are for visibility.
          Automation SMS outside the inbox may not appear in SMS/email rows.
        </p>
      </div>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client, user } = await requireMembership();
  if (!client) {
    return (
      <div className="px-4 py-8 text-sm text-charcoal/70">
        No business is linked to this account yet.
      </div>
    );
  }

  const ownerId = client.user_id ?? user.id;
  try {
    await ensureDefaultAvailability(supabase, client.id, ownerId);
  } catch {
    // Soft-fail: page should still render without seeded hours.
  }

  const usageMonthStart = monthStartIso();
  const [
    { data: planFeatureRows },
    { count: smsOutboundCount },
    { count: emailOutboundCount },
    { count: workflowRunsCount },
  ] = await Promise.all([
    supabase
      .from("plan_features")
      .select("feature, enabled")
      .eq("plan", client.plan ?? "contractor_299")
      .order("feature"),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .eq("channel", "sms")
      .eq("direction", "outbound")
      .gte("created_at", usageMonthStart),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .gte("created_at", usageMonthStart),
    supabase
      .from("workflow_runs")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .gte("created_at", usageMonthStart),
  ]);

  const usage: UsageCounts = {
    smsOutbound: smsOutboundCount ?? 0,
    emailOutbound: emailOutboundCount ?? 0,
    workflowRuns: workflowRunsCount ?? 0,
    monthLabel: monthLabel(),
  };

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("availability")
    .select(
      "id, weekday, start_time, end_time, buffer_minutes, min_notice_hours",
    )
    .eq("client_id", client.id)
    .order("weekday", { ascending: true });

  const availability = availabilityRows ?? [];

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

      {availabilityError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Couldn’t load booking hours: {availabilityError.message}
        </p>
      ) : null}

      <Card>
        <CardTitle>Business</CardTitle>
        <CardDescription className="mt-1">
          Site key: <code className="text-xs">{client.site_key}</code>
        </CardDescription>
        <form action={updateSettings} className="mt-3 space-y-3">
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
                    <span className="text-sm font-medium text-charcoal">Day</span>
                    <select
                      name="weekday"
                      defaultValue={String(row.weekday)}
                      className="mt-1 h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={String(d)}>
                          {weekdayLabel(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-sm font-medium text-charcoal">Start</span>
                      <Input
                        name="start_time"
                        type="time"
                        defaultValue={timeInputValue(row.start_time)}
                        required
                      />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-charcoal">End</span>
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
                    <span className="text-sm font-medium text-charcoal">Buffer (min)</span>
                    <Input
                      name="buffer_minutes"
                      type="number"
                      min={0}
                      defaultValue={String(row.buffer_minutes ?? 15)}
                    />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-charcoal">Min notice (hrs)</span>
                    <Input
                      name="min_notice_hours"
                      type="number"
                      min={0}
                      defaultValue={String(row.min_notice_hours ?? 2)}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Save
                </Button>
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
        <form
          action={upsertAvailability}
          className="mt-4 space-y-2 border-t border-charcoal/10 pt-3"
        >
          <p className="text-sm font-medium">Add hours</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              name="weekday"
              defaultValue="1"
              className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={String(d)}>
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
                <Button
                  type="submit"
                  size="sm"
                  variant={s.bookable_online ? "default" : "outline"}
                >
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
        <form action={reseedTradePreset} className="mt-3">
          <Button type="submit" variant="secondary" className="w-full">
            Reload pipeline & services
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Billing</CardTitle>
        <CardDescription className="mt-1">
          Plan: {client.plan ?? "contractor_299"} ($299/mo package). Monthly
          usage below; overage charges not enabled yet.
        </CardDescription>
        <BillingFeatures features={planFeatureRows ?? []} usage={usage} />
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
