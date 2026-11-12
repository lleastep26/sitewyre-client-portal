import { getSmsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";

/**
 * Shared by the admin "buy a number for any client" flow and the client's
 * own self-serve flow — same guards, same Twilio sequence, two different
 * entry points with two different permission checks around them.
 */
export type ProvisionableClient = {
  twilio_phone_number: string | null;
  forward_to_phone: string | null;
};

export function numberPurchaseBlockReason(client: ProvisionableClient): string | null {
  if (client.twilio_phone_number) {
    return "This client already has a Twilio number assigned.";
  }
  if (!client.forward_to_phone) {
    return "Set a forward-to phone number before buying a number.";
  }
  return null;
}

export async function previewLocalNumber(
  areaCode: string,
): Promise<{ phoneNumber: string; monthlyPrice: string } | { error: string }> {
  if (!/^\d{3}$/.test(areaCode)) return { error: "Enter a 3-digit area code" };
  const provider = getSmsProvider();
  const [phoneNumber, monthlyPrice] = await Promise.all([
    provider.searchLocalNumber(areaCode),
    provider.getLocalNumberMonthlyPrice(),
  ]);
  if (!phoneNumber) {
    return { error: `No numbers available for area code ${areaCode}` };
  }
  return { phoneNumber, monthlyPrice };
}

/**
 * Buys the specific number already shown to the user, then configures only
 * that new number's webhooks — never touches an existing number. Does NOT
 * create or attach a Messaging Service; every send still goes out "from"
 * the raw number, same as before (that's Pass 2, alongside A2P).
 */
export async function buyLocalNumberWithWebhooks(
  phoneNumber: string,
): Promise<{ phoneNumber: string; sid: string }> {
  const provider = getSmsProvider();
  const purchased = await provider.buyNumber(phoneNumber);
  await provider.assignNumberWebhooks(purchased.sid, {
    smsUrl: `${getAppUrl()}/api/twilio/webhook`,
    voiceUrl: `${getAppUrl()}/api/twilio/voice`,
  });
  return purchased;
}
