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

export interface PaymentsProvider {
  createConnectAccount(email: string, businessName: string): Promise<{ accountId: string }>;
  createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>;
  createPaymentIntent(opts: {
    amountCents: number;
    currency?: string;
    connectedAccountId: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; clientSecret: string }>;
}

export interface AiProvider {
  suggestReply(context: string): Promise<string>;
  summarize(text: string): Promise<string>;
}
