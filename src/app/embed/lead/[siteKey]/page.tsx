import { createAdminClient } from "@/lib/supabase/admin";
import { smsConsentText } from "@/lib/a2p/consent-text";
import { portalTurnstileSiteKey } from "@/lib/security/turnstile";
import { EmbedAutoHeight } from "../../auto-height";
import { EmbedLeadForm } from "./lead-form";

/** The lead form, for a frame on the business's own website. */
export default async function EmbeddedLeadFormPage({
  params,
}: {
  params: Promise<{ siteKey: string }>;
}) {
  const { siteKey } = await params;
  const { data: client } = await createAdminClient()
    .from("clients")
    .select("business_name")
    .eq("site_key", siteKey)
    .maybeSingle();

  if (!client) return <main className="bg-white p-4 text-sm">This form isn&apos;t available.</main>;

  return (
    <main className="bg-white p-4">
      <EmbedAutoHeight />
      <EmbedLeadForm
        siteKey={siteKey}
        businessName={client.business_name ?? "We"}
        consentText={smsConsentText(client.business_name)}
        turnstileSiteKey={portalTurnstileSiteKey()}
      />
    </main>
  );
}
