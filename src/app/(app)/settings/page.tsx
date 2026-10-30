import { requireMembership } from "@/lib/auth/session";
import { updateSettings, reseedTradePreset } from "./actions";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ConnectStripeButton } from "./connect-stripe-button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const params = await searchParams;
  const { client } = await requireMembership();
  if (!client) return null;

  return (
    <div className="space-y-4 px-4">
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
