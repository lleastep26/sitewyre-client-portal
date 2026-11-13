/**
 * Twilio campaign vetting commonly rejects campaigns whose sample
 * messages lack the business name or an opt-out line, so these are
 * generated server-side and always include both — not left to the
 * client to type freely and possibly drop the required line.
 */
export function buildSampleMessages(businessName: string): string[] {
  const name = businessName.trim() || "our business";
  return [
    `Hi, this is ${name}! Thanks for reaching out — we'll follow up shortly with next steps. Reply STOP to opt out.`,
    `${name}: Your appointment is confirmed. We'll text you a reminder beforehand. Reply STOP to opt out.`,
  ];
}

/**
 * What the campaign is for, in Twilio's "description" field. Kept to the
 * same three purposes the consent text under every form names (request,
 * appointments, service), so the registration matches what customers
 * actually agreed to.
 */
export function buildCampaignDescription(businessName: string): string {
  const name = businessName.trim() || "The business";
  return (
    `${name} texts customers who asked for service: replies about their request, ` +
    `appointment confirmations and reminders, and follow-ups about their service.`
  );
}

export function buildMessageFlow(websiteUrl: string | null): string {
  const site = websiteUrl?.trim() || "the business's website";
  return (
    `End users submit a request for service through a contact/quote form on ${site}, ` +
    `providing their phone number and agreeing to receive text messages about their ` +
    `request, appointments and service. The consent text is shown under the form with a ` +
    `link to the privacy policy. Reply STOP to opt out at any time.`
  );
}
