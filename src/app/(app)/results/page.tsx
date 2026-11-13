import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { getFunnelResults } from "@/lib/funnels/results";
import { getTradePreset } from "@/lib/trade-presets";
import { Card, CardTitle } from "@/components/ui/card";

export default async function ResultsPage() {
  const { supabase, client } = await requireMembership();
  if (!client) return null;
  const customerNoun = getTradePreset(client.trade ?? "other").labels.customerNoun;

  const results = await getFunnelResults(supabase, client.id, 30);

  return (
    <div className="space-y-4 px-4 pb-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Results
        </p>
        <h1 className="mt-1 font-display text-3xl">Last 30 days</h1>
        <Link href="/more" className="mt-1 inline-block text-sm text-copper">
          ← More
        </Link>
      </header>

      <Card>
        <CardTitle>Missed-call text-back</CardTitle>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xl font-display">
              {results.missedCallTextBack.textedBack}
            </p>
            <p className="text-xs text-charcoal/60">Texted back</p>
          </div>
          <div>
            <p className="text-2xl font-display">
              {results.missedCallTextBack.recovered}
            </p>
            <p className="text-xs text-charcoal/60">Recovered (replied)</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Post-job review request</CardTitle>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xl font-display">
              {results.reviewRequest.sent}
            </p>
            <p className="text-xs text-charcoal/60">Texts sent</p>
          </div>
          <div>
            <p className="text-2xl font-display">
              {results.reviewRequest.linksClicked}
            </p>
            <p className="text-xs text-charcoal/60">Review links clicked</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Past-{customerNoun} review blast</CardTitle>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xl font-display">
              {results.reviewBlast.sent}
            </p>
            <p className="text-xs text-charcoal/60">Texts sent</p>
          </div>
          <div>
            <p className="text-2xl font-display">
              {results.reviewBlast.linksClicked}
            </p>
            <p className="text-xs text-charcoal/60">Review links clicked</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
