import twilio from "twilio";
import type { VoiceProvider } from "./types";

export class TwilioVoiceProvider implements VoiceProvider {
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

  async createOutboundCall(opts: { to: string; from: string; twiml: string; statusCallback?: string }) {
    const client = this.getClient();
    const call = await client.calls.create({
      to: opts.to,
      from: opts.from,
      twiml: opts.twiml,
      ...(opts.statusCallback
        ? { statusCallback: opts.statusCallback, statusCallbackEvent: ["in-progress", "completed"] }
        : {}),
    });
    return { sid: call.sid };
  }

  async redirectCall(callSid: string, twiml: string) {
    const client = this.getClient();
    await client.calls(callSid).update({ twiml });
  }

  async hasOtherLiveCall(opts: { from: string; to: string; excludeCallSid: string }) {
    const client = this.getClient();
    // An inbound call shows as "ringing" until it's bridged and
    // "in-progress" after, so both count as live.
    const [ringing, inProgress] = await Promise.all([
      client.calls.list({ from: opts.from, to: opts.to, status: "ringing", limit: 5 }),
      client.calls.list({ from: opts.from, to: opts.to, status: "in-progress", limit: 5 }),
    ]);
    return [...ringing, ...inProgress].some((call) => call.sid !== opts.excludeCallSid);
  }
}

export class FakeVoiceProvider implements VoiceProvider {
  public outboundCalls: { to: string; from: string; twiml: string; statusCallback?: string }[] = [];
  public redirects: { callSid: string; twiml: string }[] = [];

  async createOutboundCall(opts: { to: string; from: string; twiml: string; statusCallback?: string }) {
    this.outboundCalls.push(opts);
    return { sid: `fake_call_${this.outboundCalls.length}` };
  }

  async redirectCall(callSid: string, twiml: string) {
    this.redirects.push({ callSid, twiml });
  }

  public otherLiveCall = false;
  async hasOtherLiveCall() {
    return this.otherLiveCall;
  }
}

export function getVoiceProvider(): VoiceProvider {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return new TwilioVoiceProvider();
  }
  return new FakeVoiceProvider();
}
