import { requireMembership } from "@/lib/auth/session";
import { resolveGoogleReviewUrl } from "@/lib/funnels/review-link";
import { getTradePreset } from "@/lib/trade-presets";
import { ReviewBlastWizard } from "./review-blast-wizard";

export default async function ReviewBlastPage() {
  const { client } = await requireMembership();
  if (!client) return null;
  const customerNoun = getTradePreset(client.trade ?? "other").labels.customerNoun;

  const blockers: string[] = [];
  if (!client.twilio_phone_number) {
    blockers.push("No Twilio number is assigned to this account yet.");
  }
  if (!resolveGoogleReviewUrl(client)) {
    blockers.push(
      "No Google review URL or Place ID is set — add one in Settings.",
    );
  }
  if (client.a2p_status !== "approved") {
    blockers.push(
      `A2P registration isn't approved yet (status: ${client.a2p_status ?? "pending"}).`,
    );
  }

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Review blast
        </p>
        <h1 className="mt-1 font-display text-2xl">
          Past-{customerNoun} review request
        </h1>
      </header>

      {blockers.length ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Can&apos;t send a review blast yet:</p>
          <ul className="mt-1 list-disc pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <ReviewBlastWizard customerNoun={customerNoun} />
      )}
    </div>
  );
}
