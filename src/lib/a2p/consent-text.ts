/**
 * The SMS consent wording shown under every form that collects a phone
 * number, and the matching privacy-policy section. One source, so the
 * chat widget, the embeddable forms, the generated sites' wording and what
 * clients are told to add to their own website all say the same thing,
 * and match the A2P campaign (request, appointments and service).
 */
export function smsConsentText(businessName: string | null | undefined): string {
  const business = businessName?.trim() || "us";
  return `By submitting, you agree to receive text messages from ${business} about your request, appointments and service. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.`;
}

/** The section a client adds to their own privacy policy. */
export function smsPrivacySection(businessName: string | null | undefined): string {
  const business = businessName?.trim() || "we";
  const us = businessName?.trim() || "us";
  return [
    "Text messaging (SMS)",
    "",
    `If you give ${us} your mobile number through a form on this website, ${business === "we" ? "we" : business} may send you text messages about your request, appointments and service. Message frequency varies. Message and data rates may apply. Reply STOP at any time to stop receiving texts, or HELP for help.`,
    "",
    "We do not sell, rent or share your mobile number, or your consent to receive text messages, with third parties or affiliates for their marketing or promotional purposes. Information may be shared only with service providers that help us send these messages, such as our messaging platform and phone carriers.",
  ].join("\n");
}
