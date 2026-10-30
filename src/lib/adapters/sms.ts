import twilio from "twilio";
import type { SmsProvider, SendSmsInput, SendSmsResult } from "./types";

export class TwilioSmsProvider implements SmsProvider {
  private client: ReturnType<typeof twilio> | null = null;

  private getClient() {
    if (this.client) return this.client;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("Twilio credentials missing");
    }
    this.client = twilio(sid, token);
    return this.client;
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const client = this.getClient();
    const from =
      input.from ??
      process.env.TWILIO_MESSAGING_SERVICE_SID ??
      undefined;
    const msg = await client.messages.create({
      to: input.to,
      body: input.body,
      ...(from?.startsWith("MG")
        ? { messagingServiceSid: from }
        : { from }),
      mediaUrl: input.mediaUrls,
    });
    return { id: msg.sid, status: msg.status };
  }

  async buyLocalNumber(areaCode: string) {
    const client = this.getClient();
    const numbers = await client.availablePhoneNumbers("US").local.list({
      areaCode: Number(areaCode),
      smsEnabled: true,
      voiceEnabled: true,
      limit: 1,
    });
    if (!numbers[0]) {
      throw new Error(`No Twilio numbers available for area code ${areaCode}`);
    }
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: numbers[0].phoneNumber,
    });
    return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
  }
}

export class FakeSmsProvider implements SmsProvider {
  public sent: SendSmsInput[] = [];

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    this.sent.push(input);
    return { id: `fake_sms_${this.sent.length}`, status: "sent" };
  }

  async buyLocalNumber(areaCode: string) {
    return { phoneNumber: `+1${areaCode}5550100`, sid: "PNfake" };
  }
}

export function getSmsProvider(): SmsProvider {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return new TwilioSmsProvider();
  }
  return new FakeSmsProvider();
}
