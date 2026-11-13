import type { EmailProvider, SendEmailInput } from "@/lib/adapters/types";

/**
 * Sends the instant email reply to a new lead and reports what happened
 * instead of throwing. An address the mail provider rejects (a typo, a
 * made-up address) must not stop the rest of the lead's workflow: the
 * owner's new-lead alert and the timeline entry come after this.
 */
export async function sendLeadReplyEmail(
  mail: Pick<EmailProvider, "send">,
  input: SendEmailInput,
): Promise<{ sent: true } | { sent: false; error: string }> {
  try {
    await mail.send(input);
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}
