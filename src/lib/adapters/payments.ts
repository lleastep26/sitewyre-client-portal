import Stripe from "stripe";
import type { PaymentsProvider } from "./types";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key);
}

export class StripePaymentsProvider implements PaymentsProvider {
  async createConnectAccount(email: string, businessName: string) {
    const stripe = getStripe();
    const account = await stripe.accounts.create({
      type: "express",
      email,
      business_profile: { name: businessName },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    return { accountId: account.id };
  }

  async createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const stripe = getStripe();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
  }

  async createPaymentIntent(opts: {
    amountCents: number;
    currency?: string;
    connectedAccountId: string;
    metadata?: Record<string, string>;
  }) {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount: opts.amountCents,
        currency: opts.currency ?? "usd",
        automatic_payment_methods: { enabled: true },
        metadata: opts.metadata,
        application_fee_amount: 0,
        transfer_data: { destination: opts.connectedAccountId },
      },
    );
    return { id: intent.id, clientSecret: intent.client_secret ?? "" };
  }
}

export class FakePaymentsProvider implements PaymentsProvider {
  async createConnectAccount() {
    return { accountId: "acct_fake" };
  }
  async createAccountLink() {
    return { url: "https://connect.stripe.com/fake" };
  }
  async createPaymentIntent() {
    return { id: "pi_fake", clientSecret: "pi_fake_secret" };
  }
}

export function getPaymentsProvider(): PaymentsProvider {
  if (process.env.STRIPE_SECRET_KEY) return new StripePaymentsProvider();
  return new FakePaymentsProvider();
}
