export type EmailSenderClient = {
  email_domain: string | null;
  email_domain_status: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  business_name: string | null;
};

/**
 * Only overrides the sender once the domain is actually verified — until
 * then every email keeps going out from the current Sitewyre sender, same
 * as before this feature existed.
 */
export function resolveEmailFromAddress(
  client: EmailSenderClient,
): { from?: string; replyTo?: string } {
  if (client.email_domain_status !== "verified" || !client.email_domain) {
    return {};
  }
  const name = client.email_from_name || client.business_name || "Notifications";
  return {
    from: `${name} <notifications@${client.email_domain}>`,
    replyTo: client.email_reply_to || undefined,
  };
}
