export type SendSmsInput = {
  to: string;
  from?: string;
  body: string;
  mediaUrls?: string[];
};

export type SendSmsResult = { id: string; status: string };

export interface SmsProvider {
  send(input: SendSmsInput): Promise<SendSmsResult>;
  buyLocalNumber(areaCode: string): Promise<{ phoneNumber: string; sid: string }>;
  assignNumberWebhooks(
    sid: string,
    urls: { smsUrl: string; voiceUrl: string },
  ): Promise<void>;
  searchLocalNumber(areaCode: string): Promise<string | null>;
  getLocalNumberMonthlyPrice(): Promise<string>;
  buyNumber(phoneNumber: string): Promise<{ phoneNumber: string; sid: string }>;
}

export type SendEmailInput = {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult = { id: string };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export type PaymentIntentSnapshot = {
  id: string;
  clientSecret: string;
  status: string;
  amountCents: number;
};

export interface PaymentsProvider {
  createConnectAccount(email: string, businessName: string): Promise<{ accountId: string }>;
  createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>;
  createPaymentIntent(opts: {
    amountCents: number;
    currency?: string;
    connectedAccountId: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; clientSecret: string }>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentSnapshot | null>;
}

export interface AiProvider {
  suggestReply(context: string): Promise<string>;
  summarize(text: string): Promise<string>;
}

export interface VoiceProvider {
  /** Places a new outbound call that runs the given TwiML. `statusCallback`
   * (if given) is posted call-status events, notably "in-progress" once
   * answered — used to detect a warm-transfer pickup without guessing. */
  createOutboundCall(opts: {
    to: string;
    from: string;
    twiml: string;
    statusCallback?: string;
  }): Promise<{ sid: string }>;
  /** Redirects an in-progress call to new TwiML — the standard Twilio
   * mechanism for a warm transfer (move a live call into a conference). */
  redirectCall(callSid: string, twiml: string): Promise<void>;
  /** Whether this caller already has another call ringing or in progress
   * on the same number. Used to spot our own ring to the owner coming back
   * through the owner's call forwarding, before it can loop. */
  hasOtherLiveCall(opts: { from: string; to: string; excludeCallSid: string }): Promise<boolean>;
}
