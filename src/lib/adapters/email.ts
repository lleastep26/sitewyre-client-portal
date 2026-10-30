import { Resend } from "resend";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "./types";

export class ResendEmailProvider implements EmailProvider {
  private client: Resend;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY missing");
    this.client = new Resend(key);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const from =
      input.from ??
      process.env.RESEND_FROM_EMAIL ??
      process.env.CONTACT_FROM_EMAIL ??
      "Sitewyre <alerts@sitewyre.systems>";

    const { data, error } = await this.client.emails.send({
      to: input.to,
      from,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { id: data?.id ?? "resend" };
  }
}

export class FakeEmailProvider implements EmailProvider {
  public sent: SendEmailInput[] = [];

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    return { id: `fake_email_${this.sent.length}` };
  }
}

export function getEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) {
    return new ResendEmailProvider();
  }
  return new FakeEmailProvider();
}
